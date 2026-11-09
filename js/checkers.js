// MTRX™ Arcade · Checkers v3. Rules + AI: MTRX checkers engine. UI, levels and lessons: Designed by MTRX™
import { WORDMARK } from './wordmark.js?v=4';
import { mountLearn } from './learn.js?v=4';
import { applyTheme } from './theme.js?v=4';
import { BLACK, WHITE, initialBoard, newState, genMoves, applyMove, sameMove, status } from './checkers-engine.js?v=4';

const $ = (s) => document.querySelector(s);
$('#home').innerHTML = WORDMARK;

const LEVELS = [
  { id: 'easy', name: 'Easy', note: 'Plays a random move half the time and looks only 2 moves ahead. Good for learning.' },
  { id: 'medium', name: 'Medium', note: 'Looks 3 moves ahead and still slips about 1 move in 5.' },
  { id: 'intermediate', name: 'Intermediate', note: 'Looks 5 moves ahead with rare slips. Punishes loose pieces.' },
  { id: 'hard', name: 'Hard', note: 'Looks 7 moves ahead and never slips. Picks randomly between equally good moves, so no two games match.' },
  { id: 'expert', name: 'Expert', note: 'Thinks 10+ moves ahead with full jump search. Random opening, then no mercy.' },
];
const STYLES = [
  { id: 'walnut', name: 'Walnut', l: '#E9CF9F', d: '#7B4F2E', f: '#3A2416' },
  { id: 'tournament', name: 'Tournament', l: '#EFE7D0', d: '#3E7B50', f: '#1E3A27' },
  { id: 'marble', name: 'Marble', l: '#ECEAE4', d: '#8D94A4', f: '#40424D' },
  { id: 'sand', name: 'Sand', l: '#F4E8CB', d: '#B88A52', f: '#5B4128' },
  { id: 'mtrx', name: 'MTRX', l: '#ECEAE4', d: '#ED691D', f: '#0E0E0C' },
];
const CROWN_D = 'M2.5 8.2l4.8 3.9L12 4.2l4.7 7.9 4.8-3.9-1.9 9.3H4.4z M4.6 18.9h14.8v2.4H4.6z';
const CROWN = `<svg class="crown" viewBox="0 0 24 24" aria-hidden="true"><path d="${CROWN_D}"/></svg>`;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
// motion timings, tuned to feel unhurried: a step glides, a jump arcs over the piece it takes
const SLIDE = REDUCED ? 0 : 460, HOP = REDUCED ? 0 : 580, BEAT = REDUCED ? 0 : 90, AI_MIN = 750;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rc = (sq) => [sq >> 3, sq & 7];
const to = (m) => m.path[m.path.length - 1];
const fmt = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ---------- preferences (apply to the next game; board style and theme apply at once) ----------
const P = Object.assign({ level: 1, side: BLACK, forced: false, style: 'walnut', showMoves: true },
  JSON.parse(localStorage.getItem('mtrx-ck-prefs') || 'null') || {
    level: +(localStorage.getItem('mtrx-ck-level') ?? 1), side: +(localStorage.getItem('mtrx-ck-side') || BLACK), forced: localStorage.getItem('mtrx-ck-forced') === '1',
    style: localStorage.getItem('mtrx-ck-style') || 'walnut' });
if (!STYLES.some((s) => s.id === P.style)) P.style = 'walnut';
P.level = Math.min(4, Math.max(0, +P.level || 0)); P.side = P.side === WHITE ? WHITE : BLACK;
const savePrefs = () => localStorage.setItem('mtrx-ck-prefs', JSON.stringify(P));
document.body.dataset.board = P.style;

// ---------- game state ----------
let G = null; // { S, human, level, forced, hist, aiCount, over, result, start, drill: {i, solved} | null, clock: {ms, since} }
let ids = [], nextId = 1, selected = null, hint = null, thinking = false, animating = false, reqId = 0;
let review = null, reviewTok = 0, autoplay = null;
const busy = () => thinking || animating;
const S = () => G.S;
const legal = () => genMoves(G.S, G.forced);
const flip = () => G && G.human === WHITE;
const disp = (sq) => (flip() ? 63 - sq : sq);
const drillDef = () => (G?.drill ? DRILLS[G.drill.i] : null);
const worker = new Worker(new URL('./checkers-worker.js?v=4', import.meta.url), { type: 'module' });

// ---------- clock ----------
const elapsed = () => (G ? G.clock.ms + (G.clock.since ? Date.now() - G.clock.since : 0) : 0);
const startClock = () => { if (G && !G.clock.since && !G.over) G.clock.since = Date.now(); };
const stopClock = () => { if (G?.clock.since) { G.clock.ms += Date.now() - G.clock.since; G.clock.since = null; } };
const bestKey = () => (G.drill ? `mtrx-ck-best:drill${G.drill.i}` : `mtrx-ck-best:${LEVELS[G.level].id}:${G.forced ? 'f' : 'o'}`);
const bestFor = (k) => +(localStorage.getItem(k) || 0);
let clockShown = '';
function tickClock() {
  if (!G) return;
  const t = fmt(elapsed()); if (t !== clockShown) { $('#clock').textContent = t; clockShown = t; }
}
setInterval(tickClock, 250);
document.addEventListener('visibilitychange', () => {
  if (!G) return;
  if (document.hidden) { if (G.clock.since) { stopClock(); G.clock.paused = true; save(); } }
  else if (G.clock.paused) { G.clock.paused = false; startClock(); }
});

// ---------- board DOM ----------
const pcLayer = $('#pieces'), arrowSvg = $('#arrows'), overlay = $('#overlay');
const sqEls = [];
for (let d = 0; d < 64; d++) {
  const el = document.createElement('div');
  el.className = 'sq ' + (((d >> 3) + (d & 7)) % 2 ? 'dark' : 'light');
  el.onclick = () => clickSq(disp(d)); // disp is its own inverse
  $('#squares').append(el); sqEls.push(el);
}
const pieceEls = new Map();
const tr = (sq) => { const d = disp(sq); return `translate(${(d & 7) * 100}%, ${(d >> 3) * 100}%)`; };
function syncPieces(board, idArr) {
  const seen = new Set();
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq]; if (!p) continue;
    const id = idArr[sq]; seen.add(id);
    let el = pieceEls.get(id);
    if (!el) { el = document.createElement('div'); el.innerHTML = `<div class="lift"><i class="under"></i><div class="disc">${CROWN}</div></div>`; pcLayer.append(el); pieceEls.set(id, el); }
    el.className = 'pc ' + (p > 0 ? 'b' : 'w') + (Math.abs(p) === 2 ? ' king' : '');
    el.style.transform = tr(sq); el.style.opacity = '';
  }
  for (const [id, el] of pieceEls) if (!seen.has(id)) { el.remove(); pieceEls.delete(id); }
}
const freshIds = (board) => board.map((p) => (p ? nextId++ : 0));

// ---------- arrows (shared by board, move cards and lessons) ----------
let svgId = 0;
function arrowMarkup(arrows, xs, pt, uid) {
  let s = `<defs>${['m', 'w', 'hint', 'bad'].map((k) => `<marker id="ah${uid}${k}" viewBox="0 0 4 4" refX="2.2" refY="2" markerWidth="2.4" markerHeight="2.4" orient="auto"><path class="ah ${k}" d="M0,0L4,2L0,4z"/></marker>`).join('')}</defs>`;
  for (const a of arrows) {
    const pts = a.pts.map((p) => pt(p).join(',')).join(' ');
    s += `<polyline class="arw-ol" points="${pts}"/><polyline class="arw ${a.kind}" points="${pts}" marker-end="url(#ah${uid}${a.kind})"/>`;
    if (a.n) { const [x, y] = pt(a.pts[0]); s += `<circle class="nb" cx="${x - .3}" cy="${y - .3}" r=".2"/><text class="nt" x="${x - .3}" y="${y - .3}">${a.n}</text>`; }
  }
  for (const p of xs) {
    const [x, y] = pt(p), k = .17, dd = `M${x - k},${y - k}L${x + k},${y + k}M${x + k},${y - k}L${x - k},${y + k}`;
    s += `<path class="xm-ol" d="${dd}"/><path class="xm" d="${dd}"/>`;
  }
  return s;
}
const moveArrow = (m, kind) => ({ pts: [m.from, ...m.path].map(rc), kind });
function drawBoardArrows(list) {
  const uid = ++svgId, fl = flip();
  const pt = ([r, c]) => (fl ? [7 - c + .5, 7 - r + .5] : [c + .5, r + .5]);
  arrowSvg.innerHTML = arrowMarkup(list.map((x) => x.a), list.flatMap((x) => x.xs || []), pt, uid);
}
// Static board picture. pieces: [[r, c, 'b'|'w'|'B'|'W']]
function diagram({ board, pieces = [], arrows = [], x = [], hl = [], ring = [], fl = false } = {}) {
  const uid = ++svgId;
  const P = ([r, c]) => (fl ? [7 - r, 7 - c] : [r, c]);
  const pt = (p) => { const [r, c] = P(p); return [c + .5, r + .5]; };
  let s = `<svg class="dg" viewBox="0 0 8 8" aria-hidden="true">`;
  s += `<defs><pattern id="pt${uid}" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="2" height="2" class="l"/><rect x="1" width="1" height="1" class="d"/><rect y="1" width="1" height="1" class="d"/></pattern></defs><rect width="8" height="8" fill="url(#pt${uid})"/>`;
  for (const h of hl) { const [r, c] = P(h); s += `<rect x="${c}" y="${r}" width="1" height="1" class="hl"/>`; }
  const list = board ? board.flatMap((p, sq) => (p ? [[sq >> 3, sq & 7, p === 1 ? 'b' : p === 2 ? 'B' : p === -1 ? 'w' : 'W']] : [])) : pieces;
  for (const [r, c, t] of list) {
    const [cx, cy] = pt([r, c]), k = t.toLowerCase();
    if (t !== k) s += `<circle cx="${cx}" cy="${cy + .07}" r=".36" class="pb ${k}"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r=".36" class="pb ${k}"/><circle cx="${cx}" cy="${cy}" r=".22" class="pr ${k}"/>`;
    if (t !== k) s += `<path class="cr" d="${CROWN_D}" transform="translate(${cx - .23},${cy - .24}) scale(.019)"/>`;
  }
  for (const g of ring) { const [cx, cy] = pt(g); s += `<circle class="ring" cx="${cx}" cy="${cy}" r=".44"/>`; }
  return s + arrowMarkup(arrows, x, pt, uid) + '</svg>';
}

// ---------- words for moves ----------
function describe(m, board) {
  const p = board[m.from], king = Math.abs(p) === 2, n = m.caps.length;
  const [fr, fc] = rc(m.from), [tr, tc] = rc(to(m));
  const fwd = p > 0 ? tr < fr : tr > fr;
  const left = p > 0 ? tc < fc : tc > fc;
  let s = n === 0 ? `${king ? 'King moved' : 'Moved'} ${fwd ? 'forward' : 'back'} ${left ? 'left' : 'right'}`
    : n === 1 ? 'Jumped 1 piece' : n === 2 ? 'Double jump: 2 pieces' : `${n === 3 ? 'Triple' : 'Multi'} jump: ${n} pieces`;
  if (m.crown) s += ', crowned';
  return s;
}
const who = (by) => (by === 'you' ? 'You' : G?.drill ? 'Drill AI' : 'AI');
const aiName = () => (G?.drill ? 'The drill AI' : LEVELS[G.level].name);

// ---------- drawing ----------
function setStatus(t, cls = '') { const el = $('#status'); el.textContent = t; el.className = 'status-line ' + cls; }
const clearMarks = () => sqEls.forEach((el) => el.classList.remove('dest', 'destcap', 'sel', 'last', 'hintsq'));
function draw() {
  if (!G) return;
  if (review == null) {
    syncPieces(G.S.board, ids);
    const myTurn = !busy() && !G.over && G.S.player === G.human;
    const moves = myTurn ? legal() : [];
    const dests = selected != null ? moves.filter((m) => m.from === selected) : [];
    clearMarks();
    if (P.showMoves || hint) for (const m of dests) sqEls[disp(to(m))].classList.add(m.caps.length ? 'destcap' : 'dest');
    if (selected != null) sqEls[disp(selected)].classList.add('sel');
    const lastH = G.hist[G.hist.length - 1];
    if (lastH && !animating) { sqEls[disp(lastH.move.from)].classList.add('last'); sqEls[disp(to(lastH.move))].classList.add('last'); }
    if (hint) { sqEls[disp(hint.from)].classList.add('hintsq'); sqEls[disp(to(hint))].classList.add('hintsq'); }
    // glow only the pieces that can move when it matters: forced jumps, or Show moves on and nothing picked yet
    const mustJump = G.forced && moves.some((m) => m.caps.length);
    const movers = new Set(moves.map((m) => m.from));
    for (let sq = 0; sq < 64; sq++) if (ids[sq]) {
      const el = pieceEls.get(ids[sq]);
      el?.classList.toggle('can', movers.has(sq) && selected == null && (mustJump || P.showMoves));
      el?.classList.toggle('picked', sq === selected);
    }
    arrowSvg.innerHTML = '';
  }
  drawHud();
  $('#undoBtn').disabled = animating || !G.hist.some((h) => h.by === 'you') || review != null;
  $('#hintBtn').disabled = busy() || G.over || G.S.player !== G.human || review != null;
}
function drawHud() {
  const b = G.S.board, humanSide = G.human, start = G.start;
  let mine = 0, theirs = 0; b.forEach((p) => { if (Math.sign(p) === humanSide) mine++; else if (p) theirs++; });
  const youStart = humanSide === BLACK ? start.b : start.w, aiStart = humanSide === BLACK ? start.w : start.b;
  $('#tookYou').textContent = aiStart - theirs; $('#tookAi').textContent = youStart - mine;
  $('#youChip').className = 'chip ' + (humanSide === BLACK ? 'b' : 'w');
  $('#aiChip').className = 'chip ' + (humanSide === BLACK ? 'w' : 'b');
  $('#aiName').textContent = G.drill ? 'Drill AI' : LEVELS[G.level].name;
  const turnYou = !G.over && G.S.player === humanSide;
  $('#hudYou').classList.toggle('turn', turnYou); $('#hudAi').classList.toggle('turn', !G.over && !turnYou);
  const best = bestFor(bestKey());
  $('#clockSub').textContent = best ? `Best ${fmt(best)}` : 'No best yet';
}

// ---------- input ----------
function clickSq(sq) {
  if (!G || busy() || G.over || review != null || G.S.player !== G.human) return;
  const moves = legal();
  if (selected != null) {
    const mine = moves.filter((m) => m.from === selected);
    // tap the final square, or just the first landing square of a jump chain
    const exact = mine.filter((m) => to(m) === sq).sort((a, b) => b.caps.length - a.caps.length);
    const viaFirst = mine.filter((m) => m.caps.length && m.path[0] === sq).sort((a, b) => b.caps.length - a.caps.length);
    const m = exact[0] || viaFirst[0];
    if (m) return humanMove(m);
  }
  if (moves.some((m) => m.from === sq)) { selected = sq === selected ? null : sq; draw(); return; }
  if (G.S.board[sq] && Math.sign(G.S.board[sq]) === G.human) {
    shake(sq);
    setStatus(G.forced && moves[0]?.caps.length ? 'Forced jumps are on: take a piece with a glowing checker' : 'That checker is blocked right now');
  } else if (selected != null) { selected = null; draw(); }
}
function shake(sq) { const el = pieceEls.get(ids[sq]); if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }

function humanMove(m) {
  const d = drillDef();
  if (d?.kind === 'puzzle' && !G.drill.solved) {
    const [fr, fc] = d.sol[0], [tr2, tc] = d.sol[1];
    if (m.from !== fr * 8 + fc || to(m) !== tr2 * 8 + tc) { shake(m.from); selected = null; draw(); setStatus(`Not that one. ${d.clue}`, 'lose'); return; }
    G.drill.solved = true; $('#drillTxt').textContent = `Solved · ${d.explain}`;
  }
  doMove(m, 'you');
}

async function doMove(m, by) {
  animating = true; selected = null; hint = null; startClock();
  draw();
  await animateMove(m, ids);
  const before = G.S;
  G.S = applyMove(G.S, m);
  const id = ids[m.from]; ids = ids.slice(); ids[m.from] = 0; for (const c of m.caps) ids[c] = 0; ids[to(m)] = id;
  G.hist.push({ state: before, move: m, by });
  if (by === 'ai') G.aiCount++;
  animating = false; save(); draw(); afterMove();
}
// A step glides one square. A jump arcs up and over, and the taken piece fades as the jumper passes it.
async function animateMove(m, idArr) {
  const el = pieceEls.get(idArr[m.from]); if (!el) return;
  const lift = el.querySelector('.lift');
  arrowSvg.innerHTML = ''; clearMarks();
  el.classList.remove('can', 'picked'); el.classList.add('moving');
  let prev = m.from;
  for (let i = 0; i < m.path.length; i++) {
    const next = m.path[i], jump = m.caps[i] != null, dur = jump ? HOP : SLIDE;
    if (dur) {
      const a = el.animate([{ transform: tr(prev) }, { transform: tr(next) }], { duration: dur, easing: 'cubic-bezier(.42,0,.32,1)', fill: 'forwards' });
      lift.animate(jump
        ? [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-20%) scale(1.18)', offset: .5 }, { transform: 'translateY(0) scale(1)' }]
        : [{ transform: 'scale(1)' }, { transform: 'translateY(-4%) scale(1.05)', offset: .5 }, { transform: 'scale(1)' }],
      { duration: dur, easing: 'ease-in-out' });
      if (jump) {
        const cap = pieceEls.get(idArr[m.caps[i]]), base = tr(m.caps[i]);
        setTimeout(() => cap?.animate([{ opacity: 1, transform: base }, { opacity: 0, transform: `${base} scale(.82)` }], { duration: 340, easing: 'ease-out', fill: 'forwards' }), dur * .38);
      }
      try { await a.finished; } catch { /* interrupted */ }
      el.style.transform = tr(next); a.cancel();
    } else el.style.transform = tr(next);
    if (jump) pieceEls.get(idArr[m.caps[i]])?.style.setProperty('opacity', '0');
    prev = next;
    if (i < m.path.length - 1) await wait(BEAT);
  }
  el.classList.remove('moving');
  if (m.crown) { el.classList.add('king', 'crowning'); await wait(REDUCED ? 0 : 520); el.classList.remove('crowning'); }
}

function afterMove() {
  const st = status(G.S, G.forced);
  if (st !== 'playing') return finish(st);
  if (G.S.player !== G.human) return aiTurn();
  const caps = legal().some((m) => m.caps.length);
  const d = drillDef();
  setStatus(caps ? (G.forced ? 'Your move · you must jump' : 'Your move · a jump is available') : d && !G.hist.length ? d.goal : 'Your move');
  draw();
}
function finish(st) {
  G.over = true; thinking = false; stopClock();
  const won = st !== 'draw' && (st === 'black') === (G.human === BLACK);
  const time = elapsed();
  let newBest = false;
  if (won) { const k = bestKey(), b = bestFor(k); if (!b || time < b) { localStorage.setItem(k, time); newBest = true; } }
  G.result = { st, won, time, newBest };
  setStatus(st === 'draw' ? 'Draw' : won ? 'You win' : `${aiName()} wins`, st === 'draw' ? '' : won ? 'win' : 'lose');
  save(); draw(); showResult();
}

// ---------- AI ----------
function aiTurn() {
  thinking = true; setStatus(`${G.drill ? 'Drill AI' : LEVELS[G.level].name} is thinking`, 'think'); draw();
  const id = ++reqId, t0 = performance.now();
  worker.onmessage = async ({ data }) => {
    if (data.id !== id) return;
    const ms = performance.now() - t0; if (ms < AI_MIN) await wait(AI_MIN - ms);
    if (id !== reqId || !G) return;
    thinking = false;
    if (!data.ok || !data.move) { setStatus('The AI hit a problem. Start a new game from the menu.', 'lose'); draw(); return; }
    if (review != null) exitReview();
    const m = legal().find((x) => sameMove(x, data.move)) || legal()[0];
    doMove(m, 'ai');
  };
  worker.postMessage({ state: G.S, level: G.drill ? 'expert' : LEVELS[G.level].id, forced: G.forced, aiCount: G.drill ? 99 : G.aiCount, id });
}
function askHint() {
  if (!G || busy() || G.over || review != null || G.S.player !== G.human) return;
  thinking = true; setStatus('Looking ahead for you', 'think'); draw();
  const id = ++reqId;
  worker.onmessage = ({ data }) => {
    if (data.id !== id) return;
    thinking = false;
    hint = data.ok && data.move ? legal().find((x) => sameMove(x, data.move)) || null : null;
    selected = hint ? hint.from : null;
    setStatus(hint ? `Try: ${describe(hint, G.S.board).toLowerCase()} (the pulsing squares)` : 'No suggestion here');
    draw();
  };
  worker.postMessage({ state: G.S, level: 'hint', forced: G.forced, aiCount: 99, id });
}

// ---------- undo, games, save ----------
function undo() {
  if (!G || animating) return;
  let i = G.hist.length - 1; while (i >= 0 && G.hist[i].by !== 'you') i--;
  if (i < 0) return;
  reqId++; thinking = false; hideOverlay();
  if (G.over) { G.over = false; G.result = null; startClock(); }
  G.S = G.hist[i].state; G.hist = G.hist.slice(0, i); G.aiCount = G.hist.filter((h) => h.by === 'ai').length;
  selected = null; hint = null; ids = freshIds(G.S.board);
  if (G.drill && i === 0) { G.drill.solved = false; drillBar(); }
  save(); draw(); afterMove();
}
function startGame({ state = newState(), level = P.level, forced = P.forced, human = P.side, drill = null } = {}) {
  reqId++; thinking = false; animating = false; stopAuto();
  if (review != null) exitReview(true);
  G = { S: state, human, level, forced, hist: [], aiCount: 0, over: false, result: null, drill,
    start: { b: state.board.filter((p) => p > 0).length, w: state.board.filter((p) => p < 0).length }, clock: { ms: 0, since: null } };
  ids = freshIds(G.S.board); selected = null; hint = null; clockShown = '';
  hideOverlay(); drillBar(); save(); draw(); tickClock(); afterMove();
}
function save() { if (G) localStorage.setItem('mtrx-ck3', JSON.stringify({ ...G, clock: { ms: elapsed(), since: null } })); }
function drillBar() {
  const d = drillDef();
  $('#drillBar').hidden = !d;
  if (d) $('#drillTxt').textContent = `${d.name} · ${d.goal}`;
}
$('#drillExit').onclick = () => { G = null; localStorage.removeItem('mtrx-ck3'); $('#drillBar').hidden = true; showSetup(); };

// ---------- overlay: setup before a game, result after ----------
function hideOverlay() { overlay.hidden = true; overlay.innerHTML = ''; }
function seg(name, opts, cur) { return `<div class="mtrx-segmented" data-seg="${name}">${opts.map(([v, label]) => `<button data-v="${v}" aria-pressed="${String(v) === String(cur)}">${label}</button>`).join('')}</div>`; }
function bindSegs(root, onPick) {
  root.querySelectorAll('[data-seg]').forEach((g) => g.querySelectorAll('button').forEach((b) => (b.onclick = () => {
    g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    onPick(g.dataset.seg, b.dataset.v);
  })));
}
function showSetup() {
  stopAuto();
  if (!G) { // a fresh board behind the card
    G = { S: newState(), human: P.side, level: P.level, forced: P.forced, hist: [], aiCount: 0, over: true, result: null, drill: null, start: { b: 12, w: 12 }, clock: { ms: 0, since: null } };
    ids = freshIds(G.S.board); drillBar(); draw(); tickClock(); setStatus('');
  }
  overlay.hidden = false;
  overlay.innerHTML = `<div class="ov-card" role="dialog" aria-label="New game"><div class="mtrx-label" style="margin:0">MTRX™ Checkers</div><h2>New game</h2>
    <div class="row"><div class="mtrx-label">Difficulty</div>${seg('level', LEVELS.map((l, i) => [i, l.name]), P.level)}<p class="note" id="lvNote" style="margin:8px 0 0">${LEVELS[P.level].note}</p></div>
    <div class="row"><div class="mtrx-label">You play</div>${seg('side', [[BLACK, 'Black · moves first'], [WHITE, 'White']], P.side)}</div>
    <div class="row"><div class="mtrx-label">Forced jumps</div>${seg('forced', [[0, 'Off'], [1, 'On']], P.forced ? 1 : 0)}</div>
    <button class="mtrx-btn mtrx-btn--primary go" id="goBtn">Start game</button>
    <div class="sub"><button id="ovDrills">Try a drill</button><button id="ovLearn">How to play</button></div></div>`;
  bindSegs(overlay, (k, v) => {
    if (k === 'level') { P.level = +v; overlay.querySelector('#lvNote').textContent = LEVELS[P.level].note; }
    if (k === 'side') P.side = +v;
    if (k === 'forced') P.forced = v === '1';
    savePrefs();
  });
  overlay.querySelector('#goBtn').onclick = () => startGame();
  overlay.querySelector('#ovDrills').onclick = () => menu.open(TAB.drills);
  overlay.querySelector('#ovLearn').onclick = () => menu.open(TAB.how);
}
function showResult() {
  const r = G.result; if (!r) return;
  const best = bestFor(bestKey());
  const title = r.st === 'draw' ? 'Draw' : r.won ? 'You win' : `${aiName()} wins`;
  overlay.hidden = false;
  overlay.innerHTML = `<div class="ov-card" role="dialog" aria-label="${title}"><div class="mtrx-label" style="margin:0">${G.drill ? drillDef().name : LEVELS[G.level].name}${G.forced ? ' · forced jumps' : ''}</div><h2>${title}</h2>
    <div class="big">${fmt(r.time)}</div>
    <p class="note">${Math.ceil(G.hist.length / 2)} moves${r.newBest ? ' · <span class="badge">New best time</span>' : best ? ` · best ${fmt(best)}` : ''}${r.st === 'draw' ? '<br>40 moves each with only kings moving and nothing taken.' : ''}</p>
    <button class="mtrx-btn mtrx-btn--primary go" id="againBtn">${G.drill ? 'Try the drill again' : 'Play again'}</button>
    <div class="sub"><button id="watchBtn">Watch the replay</button>${r.won ? '' : '<button id="takeBack">Take back a move</button>'}<button id="changeBtn">New game</button></div></div>`;
  overlay.querySelector('#againBtn').onclick = () => (G.drill ? startDrill(G.drill.i) : startGame({ level: G.level, forced: G.forced, human: G.human }));
  overlay.querySelector('#watchBtn').onclick = () => { hideOverlay(); autoplay = 0; $('#revPlay').textContent = 'Pause'; startReview(0, true); };
  overlay.querySelector('#takeBack')?.addEventListener('click', undo);
  overlay.querySelector('#changeBtn').onclick = showSetup;
}

// ---------- replay (arrows live here, not in play) ----------
async function startReview(i, auto) {
  if (!G || animating || i < 0 || i >= G.hist.length) return;
  review = i; const tok = ++reviewTok; const h = G.hist[i];
  $('#reviewBar').hidden = false;
  $('#revTxt').textContent = `Move ${i + 1} of ${G.hist.length} · ${who(h.by)}: ${describe(h.move, h.state.board)}`;
  $('#revPrev').disabled = i === 0; $('#revNext').disabled = i === G.hist.length - 1;
  clearMarks(); arrowSvg.innerHTML = '';
  const tmp = h.state.board.map((p, sq) => (p ? `r${tok}-${sq}` : 0));
  syncPieces(h.state.board, tmp);
  draw();
  await wait(REDUCED ? 0 : 300); if (tok !== reviewTok) return;
  await animateMove(h.move, tmp); if (tok !== reviewTok) return;
  drawBoardArrows([{ a: moveArrow(h.move, h.by === 'you' ? 'm' : 'w'), xs: h.move.caps.map(rc) }]);
  if (auto && autoplay !== null) {
    if (i < G.hist.length - 1) autoplay = setTimeout(() => startReview(i + 1, true), 900);
    else stopAuto();
  }
}
function stopAuto() { if (autoplay) clearTimeout(autoplay); autoplay = null; $('#revPlay').textContent = 'Play'; }
function exitReview(silent) {
  stopAuto(); review = null; reviewTok++;
  $('#reviewBar').hidden = true;
  if (!silent && G) { draw(); if (G.over) showResult(); }
}
$('#revPrev').onclick = () => { stopAuto(); startReview(review - 1); };
$('#revNext').onclick = () => { stopAuto(); startReview(review + 1); };
$('#revPlay').onclick = () => {
  if (autoplay !== null) return stopAuto();
  autoplay = 0; $('#revPlay').textContent = 'Pause';
  startReview(review >= G.hist.length - 1 ? 0 : review + 1, true);
};
$('#revLive').onclick = () => exitReview();

// ---------- controls ----------
$('#undoBtn').onclick = undo;
$('#hintBtn').onclick = askHint;
addEventListener('keydown', (e) => {
  if (e.target.closest('.drawer')) return;
  if (review != null && e.key === 'ArrowLeft') { stopAuto(); startReview(review - 1); }
  else if (review != null && e.key === 'ArrowRight') { stopAuto(); startReview(review + 1); }
  else if (e.key === 'Escape' && review != null) exitReview();
  else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
});

// ---------- drills ----------
const DRILLS = [
  { kind: 'puzzle', name: 'Find the double jump', goal: 'One of your pieces can take two in a single turn. Find it.',
    clue: 'Look for a piece that lands next to a second enemy piece after its first jump.',
    explain: 'After the first hop you landed beside another piece with an empty square behind it, so the jump continued. Now finish the game.',
    black: [[6, 1], [6, 5], [7, 2], [7, 4]], white: [[5, 2], [3, 4], [5, 6], [0, 1], [1, 2]], sol: [[6, 1], [2, 5]] },
  { kind: 'puzzle', name: 'Pick the longest route', goal: 'Your corner piece has two jump routes. Take the one that captures the most.',
    clue: 'Count the pieces on each path. One route stops after 2, the other keeps going.',
    explain: 'Three pieces in one turn. When a jump can branch, always count each path to the end before you commit.',
    black: [[7, 0], [7, 4], [6, 7]], white: [[6, 1], [4, 1], [4, 3], [2, 5], [0, 3]], sol: [[7, 0], [1, 6]] },
  { kind: 'endgame', name: 'Stop the runners', goal: 'Two white men are racing to be crowned. Use your kings to catch both.',
    black: [[5, 2, 1], [6, 5, 1]], white: [[1, 2], [2, 7]] },
  { kind: 'endgame', name: 'Two kings vs one, open board', goal: 'Push the lone king to an edge, then trap it between your two kings.',
    black: [[7, 0, 1], [6, 1, 1]], white: [[2, 5, 1]] },
  { kind: 'endgame', name: 'Two kings vs one, double corner', goal: 'The lone king hides in its double corner. Force it out and trap it.',
    black: [[5, 2, 1], [6, 5, 1]], white: [[1, 0, 1]] },
  { kind: 'endgame', name: 'Three kings vs two', goal: 'Offer a trade to get to two against one, then finish the hunt.',
    black: [[5, 0, 1], [6, 3, 1], [7, 6, 1]], white: [[0, 1, 1], [1, 4, 1]] },
].map((d, i) => ({ ...d, i }));
const drillBoard = (d) => { const b = new Array(64).fill(0); d.black.forEach(([r, c, k]) => (b[r * 8 + c] = k ? 2 : 1)); d.white.forEach(([r, c, k]) => (b[r * 8 + c] = k ? -2 : -1)); return b; };
function startDrill(i) { menu.close(); startGame({ state: newState(drillBoard(DRILLS[i]), BLACK), level: 4, forced: P.forced, human: BLACK, drill: { i, solved: false } }); }

// ---------- menu drawer: game settings, moves, lessons ----------
const lesson = (n, dg, title, text) => `<div class="lesson vis"><div>${dg}</div><div>${n ? `<span class="mtrx-numeral">${n}</span>` : ''}<h3>${title}</h3><p>${text}</p></div></div>`;
const A = (pts, kind = 'm', n) => ({ pts, kind, n });
const dots = (b, w) => `<span class="t">${'<i class="dot b"></i>'.repeat(b)}<em style="width:auto;margin:0 6px">vs</em>${'<i class="dot w"></i>'.repeat(w)}</span>`;
const TAB = { game: 0, moves: 1, how: 2, drills: 5 };
function gameTabHTML() {
  const rows = LEVELS.map((l) => { const o = bestFor(`mtrx-ck-best:${l.id}:o`), f = bestFor(`mtrx-ck-best:${l.id}:f`); return `<tr><td>${l.name}</td><td>${o ? fmt(o) : '–'}</td><td>${f ? fmt(f) : '–'}</td></tr>`; }).join('');
  const theme = document.documentElement.dataset.theme || '';
  return `<div class="set"><button class="mtrx-btn mtrx-btn--primary" style="width:100%" data-act="new">New game</button></div>
    <div class="set"><label class="switch"><span><b>Show moves</b><small>Glow on movable checkers and dots on legal squares</small></span><input type="checkbox" data-act="show" ${P.showMoves ? 'checked' : ''}></label></div>
    <div class="set"><div class="mtrx-label">Board</div><div class="styles">${STYLES.map((s) => `<button data-st="${s.id}" aria-pressed="${s.id === P.style}"><i class="sw" style="--l:${s.l};--d:${s.d};--f:${s.f}"></i>${s.name}</button>`).join('')}</div></div>
    <div class="set"><div class="mtrx-label">Theme</div>${seg('theme', [['', 'Light'], ['dark', 'Dark']], theme)}</div>
    <div class="set"><div class="mtrx-label">Best times (wins)</div><table class="bests"><tr><td></td><td class="mtrx-label">Jumps optional</td><td class="mtrx-label">Forced</td></tr>${rows}</table></div>`;
}
function mountGameTab(body) {
  body.querySelector('[data-act="new"]').onclick = () => { menu.close(); showSetup(); };
  body.querySelector('[data-act="show"]').onchange = (e) => { P.showMoves = e.target.checked; savePrefs(); draw(); };
  body.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => {
    P.style = b.dataset.st; savePrefs(); document.body.dataset.board = P.style;
    body.querySelectorAll('[data-st]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  bindSegs(body, (k, v) => { if (k === 'theme') { applyTheme(v); localStorage.setItem('mtrx-theme', v); } });
}
function movesTabHTML() {
  if (!G || !G.hist.length) return '<p class="empty">Every move shows up here as a picture. Tap one to watch it again on the big board.</p>';
  return `<p class="empty" style="margin-top:0">Newest first. Tap a move to replay it with arrows.</p><div class="moves">${G.hist.map((h, i) => ({ h, i })).reverse().map(({ h, i }) => {
    const mover = Math.sign(h.state.board[h.move.from]);
    return `<button class="mcard" data-i="${i}" aria-label="Replay move ${i + 1}">${diagram({ board: h.state.board, arrows: [moveArrow(h.move, h.by === 'you' ? 'm' : 'w')], x: h.move.caps.map(rc), fl: flip() })}
      <span><b><i class="who" style="background:${mover > 0 ? '#161616' : '#F5F2EB'}"></i>${i + 1}. ${who(h.by)}</b><small>${describe(h.move, h.state.board)}</small></span></button>`;
  }).join('')}</div>`;
}
const menu = mountLearn({
  title: 'Checkers', label: 'Menu', tabs: [
    { name: 'Game', get html() { return gameTabHTML(); }, mount: mountGameTab },
    { name: 'Moves', get html() { return movesTabHTML(); }, mount: (body) => body.querySelectorAll('.mcard').forEach((b) => (b.onclick = () => { menu.close(); hideOverlay(); startReview(+b.dataset.i); })) },
    { name: 'How to play', html: `
      ${lesson('01', diagram({ board: initialBoard() }), 'Set up', '12 pieces each on the dark squares. Black moves first.')}
      ${lesson('02', diagram({ pieces: [[5, 2, 'b']], arrows: [A([[5, 2], [4, 1]]), A([[5, 2], [4, 3]])] }), 'Move', 'One square diagonally forward, onto an empty dark square.')}
      ${lesson('03', diagram({ pieces: [[5, 2, 'b'], [4, 3, 'w']], arrows: [A([[5, 2], [3, 4]])], x: [[4, 3]] }), 'Jump', 'Hop over an enemy piece to the empty square behind it. That piece is gone.')}
      ${lesson('04', diagram({ pieces: [[6, 1, 'b'], [5, 2, 'w'], [3, 4, 'w']], arrows: [A([[6, 1], [4, 3], [2, 5]])], x: [[5, 2], [3, 4]] }), 'Keep jumping', 'Land next to another piece with space behind it? Keep going. One tap plays the whole chain.')}
      ${lesson('05', diagram({ pieces: [[1, 2, 'b'], [5, 4, 'B']], arrows: [A([[1, 2], [0, 1]]), A([[5, 4], [4, 3]]), A([[5, 4], [4, 5]]), A([[5, 4], [6, 3]]), A([[5, 4], [6, 5]])], hl: [[0, 1], [0, 3], [0, 5], [0, 7]] }), 'Crown a king', 'Reach the far row (yellow) to be crowned. Kings move forward and back.')}
      ${lesson('06', diagram({ pieces: [[0, 1, 'w'], [1, 0, 'b'], [1, 2, 'b'], [2, 3, 'b']], arrows: [A([[0, 1], [1, 0]], 'bad'), A([[0, 1], [2, 3]], 'bad')] }), 'Win', 'Take every piece, or leave your opponent with no legal move.')}
      <div class="rule-card"><b>House rule: jumps are optional</b><p>Switch <b>Jumps → Forced</b> for tournament rules, where you must take whenever you can.</p></div>
      <h3>The five levels</h3>${LEVELS.map((l) => `<div class="lesson"><b>${l.name}</b><p style="margin:6px 0 0">${l.note}</p></div>`).join('')}` },
    { name: 'Strategy', html: `
      ${lesson('01', diagram({ pieces: [[4, 3, 'b'], [4, 7, 'b']], arrows: [A([[4, 3], [3, 2]]), A([[4, 3], [3, 4]]), A([[4, 7], [3, 6]])], hl: [[3, 2], [3, 4], [4, 3], [4, 5]] }), 'Own the centre', 'Centre pieces have two ways forward. Edge pieces have one.')}
      ${lesson('02', diagram({ pieces: [[7, 2, 'b'], [7, 4, 'b'], [6, 3, 'w']], arrows: [A([[6, 3], [7, 2]], 'bad'), A([[6, 3], [7, 4]], 'bad')], ring: [[7, 2], [7, 4]] }), 'Guard the back row', 'Pieces at home block enemy kings. Move them last.')}
      ${lesson('03', diagram({ pieces: [[4, 3, 'b'], [5, 2, 'b'], [3, 4, 'w']], arrows: [A([[3, 4], [5, 2]], 'bad')], x: [[5, 2]], ring: [[5, 2]] }), 'Move in pairs', 'A piece with a friend behind it can\'t be jumped.')}
      <div class="lesson vis"><div class="trade">${dots(4, 3)}${dots(3, 2)}${dots(2, 1)}</div><div><span class="mtrx-numeral">04</span><h3>Trade when ahead</h3><p>Same lead, fewer pieces: it gets easier to win with every swap.</p></div></div>
      ${lesson('05', diagram({ pieces: [[5, 2, 'b'], [6, 1, 'b'], [3, 4, 'w']], arrows: [A([[5, 2], [4, 3]], 'bad', 1), A([[3, 4], [5, 2], [7, 0]], 'w', 2)], x: [[4, 3], [6, 1]] }), 'Look before you move', 'Moving here (1) lets White double jump (2). Check every reply first.')}` },
    { name: 'Tactics', html: `
      ${lesson('06', diagram({ pieces: [[4, 3, 'B'], [3, 2, 'w'], [3, 4, 'w']], arrows: [A([[4, 3], [2, 1]]), A([[4, 3], [2, 5]])] }), 'The fork', 'Threaten two pieces at once. They can only save one.')}
      ${lesson('07', diagram({ pieces: [[5, 4, 'b'], [6, 3, 'b'], [3, 6, 'w'], [3, 4, 'w']], arrows: [A([[5, 4], [4, 5]], 'm', 1), A([[3, 6], [5, 4]], 'w', 2), A([[6, 3], [4, 5], [2, 3]], 'm', 3)], x: [] }), 'The shot (forced jumps)', 'Give one (1). They must take (2). You take two (3). Only works with Forced jumps on.')}
      ${lesson('08', diagram({ pieces: [[1, 0, 'W']], hl: [[0, 1], [1, 0], [7, 6], [6, 7]], ring: [[0, 7], [7, 0]] }), 'Corners', 'Yellow double corners are a lone king\'s hideout. Ringed single corners are traps.')}
      ${lesson('09', diagram({ pieces: [[2, 3, 'B'], [4, 3, 'W']], hl: [[3, 2], [3, 4]] }), 'Tempo', 'In tight endgames, whoever has to step into the gap loses. Spare king moves win.')}` },
    { name: 'Drills', html: `<p>Real positions against the Expert engine. You play Black, moving up.</p>${DRILLS.map((d) => lesson(String(d.i + 1).padStart(2, '0'), diagram({ board: drillBoard(d) }), d.name, `${d.goal}<br><button class="mtrx-btn mtrx-btn--primary sm" style="margin-top:10px" data-drill="${d.i}">${d.kind === 'puzzle' ? 'Solve it' : 'Start drill'}</button>`)).join('')}`,
      mount: (body) => body.querySelectorAll('[data-drill]').forEach((b) => (b.onclick = () => startDrill(+b.dataset.drill))) },
  ],
});
$('#learnBtn').onclick = () => menu.open(TAB.how);
$('#menuBtn').onclick = () => menu.open(TAB.game);

// ---------- boot: resume a game in progress, or show the setup card ----------
(() => {
  try {
    const g = JSON.parse(localStorage.getItem('mtrx-ck3') || 'null');
    if (g && g.S && g.S.board?.length === 64 && !g.over) {
      G = { ...g, clock: { ms: g.clock?.ms || 0, since: null } };
      if (G.drill && !DRILLS[G.drill.i]) G.drill = null;
      ids = freshIds(G.S.board); drillBar(); draw(); tickClock();
      if (G.hist.length) startClock();
      afterMove(); return;
    }
  } catch { /* corrupted save: start fresh */ }
  G = null; showSetup();
})();
