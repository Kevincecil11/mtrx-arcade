// MTRX™ Arcade · Checkers v2. Rules + AI: MTRX checkers engine. UI, levels and lessons: Designed by MTRX™
import { WORDMARK } from './wordmark.js';
import { mountLearn } from './learn.js';
import { BLACK, WHITE, initialBoard, newState, genMoves, applyMove, sameMove, status } from './checkers-engine.js';

const $ = (s) => document.querySelector(s);
$('#home').innerHTML = WORDMARK;
const setTheme = (t) => { document.body.dataset.theme = t; localStorage.setItem('mtrx-theme', t);
  document.querySelectorAll('#themeSeg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.t === t)); };
document.querySelectorAll('#themeSeg button').forEach((b) => (b.onclick = () => setTheme(b.dataset.t)));
setTheme(localStorage.getItem('mtrx-theme') || '');

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
const HOP = REDUCED ? 0 : 340;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rc = (sq) => [sq >> 3, sq & 7];
const to = (m) => m.path[m.path.length - 1];

// ---------- preferences ----------
let level = Math.min(4, Math.max(0, +(localStorage.getItem('mtrx-ck-level') ?? 1)));
let sidePref = +(localStorage.getItem('mtrx-ck-side') || BLACK) === WHITE ? WHITE : BLACK;
let forced = localStorage.getItem('mtrx-ck-forced') === '1';
let style = localStorage.getItem('mtrx-ck-style') || 'walnut';
if (!STYLES.some((s) => s.id === style)) style = 'walnut';
document.body.dataset.board = style;

// ---------- game state ----------
let S, human = sidePref, ids = [], nextId = 1, hist = [], start = { b: 12, w: 12 };
let selected = null, hint = null, thinking = false, animating = false, reqId = 0, aiCount = 0, over = false;
let drill = null, review = null, reviewTok = 0;
const busy = () => thinking || animating;
const legal = () => genMoves(S, forced);
const flip = () => human === WHITE;
const disp = (sq) => (flip() ? 63 - sq : sq);
const worker = new Worker(new URL('./checkers-worker.js', import.meta.url), { type: 'module' });

// ---------- board DOM ----------
const boardEl = $('#board'), pcLayer = $('#pieces'), arrowSvg = $('#arrows');
boardEl.style.setProperty('--hop', HOP + 'ms');
const sqEls = [];
for (let d = 0; d < 64; d++) {
  const el = document.createElement('div');
  el.className = 'sq ' + (((d >> 3) + (d & 7)) % 2 ? 'dark' : 'light');
  el.onclick = () => clickSq(disp(d)); // disp is its own inverse
  $('#squares').append(el); sqEls.push(el);
}
const pieceEls = new Map();
function place(el, sq) { const d = disp(sq); el.style.transform = `translate(${(d & 7) * 100}%, ${(d >> 3) * 100}%)`; }
function syncPieces(board, idArr, instant) {
  if (instant) pcLayer.classList.add('instant');
  const seen = new Set();
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq]; if (!p) continue;
    const id = idArr[sq]; seen.add(id);
    let el = pieceEls.get(id);
    if (!el) { el = document.createElement('div'); el.innerHTML = `<i class="under"></i><div class="disc">${CROWN}</div>`; pcLayer.append(el); pieceEls.set(id, el); }
    el.className = 'pc ' + (p > 0 ? 'b' : 'w') + (Math.abs(p) === 2 ? ' king' : '');
    place(el, sq);
  }
  for (const [id, el] of pieceEls) if (!seen.has(id)) { el.remove(); pieceEls.delete(id); }
  if (instant) { void pcLayer.offsetWidth; pcLayer.classList.remove('instant'); }
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
const who = (by) => (by === 'you' ? 'You' : drill ? 'Drill AI' : 'AI');
const sideName = (pl) => (pl === BLACK ? 'Black' : 'White');

// ---------- drawing ----------
function setStatus(t, cls = '') { const el = $('#status'); el.textContent = t; el.className = 'status ' + cls; }
function draw(instant = false) {
  if (review == null) {
    syncPieces(S.board, ids, instant);
    const myTurn = !busy() && !over && S.player === human;
    const moves = myTurn ? legal() : [];
    const movers = new Set(moves.map((m) => m.from));
    const dests = selected != null ? moves.filter((m) => m.from === selected) : [];
    sqEls.forEach((el) => el.classList.remove('dest', 'destcap', 'sel', 'last'));
    for (const m of dests) sqEls[disp(to(m))].classList.add(m.caps.length ? 'destcap' : 'dest');
    if (selected != null) sqEls[disp(selected)].classList.add('sel');
    const lastH = hist[hist.length - 1];
    if (lastH && !animating) { sqEls[disp(lastH.move.from)].classList.add('last'); sqEls[disp(to(lastH.move))].classList.add('last'); }
    for (let sq = 0; sq < 64; sq++) if (ids[sq]) {
      const el = pieceEls.get(ids[sq]);
      el?.classList.toggle('can', movers.has(sq) && selected == null);
      el?.classList.toggle('picked', sq === selected);
    }
    const arrows = [];
    if (lastH && !animating) arrows.push({ a: moveArrow(lastH.move, lastH.by === 'you' ? 'm' : 'w') });
    if (hint) arrows.push({ a: moveArrow(hint, 'hint') });
    if (!animating) drawBoardArrows(arrows);
  }
  drawTally(); drawCards();
  $('#undoBtn').disabled = animating || !hist.some((h) => h.by === 'you');
  $('#hintBtn').disabled = busy() || over || S.player !== human || review != null;
}
function drawTally() {
  const count = (side) => { let n = 0, k = 0; S.board.forEach((p) => { if (Math.sign(p) === side) { n++; if (Math.abs(p) === 2) k++; } }); return { n, k }; };
  const row = (side, name, total) => {
    const { n, k } = count(side), cls = side === BLACK ? 'b' : 'w';
    let dots = ''; for (let i = 0; i < Math.max(total, n); i++) dots += `<i class="dot ${cls}${i < k ? ' k' : ''}${i >= n ? ' lost' : ''}"></i>`;
    return `<div class="row"><span>${name}</span>${dots}</div>`;
  };
  $('#tally').innerHTML = row(BLACK, 'Black', start.b) + row(WHITE, 'White', start.w);
}
let cardsKey = '';
function drawCards() {
  const host = $('#moves');
  const k = `${hist.length}|${review}|${flip()}|${hist.length ? hist[hist.length - 1].move.from : ''}`;
  if (k === cardsKey) return; cardsKey = k;
  if (!hist.length) { host.innerHTML = '<p class="empty">Every move shows up here as a picture. Tap one to watch it again on the big board.</p>'; return; }
  host.innerHTML = hist.map((h, i) => ({ h, i })).reverse().map(({ h, i }) => {
    const mover = Math.sign(h.state.board[h.move.from]);
    return `<button class="mcard${review === i ? ' on' : ''}" data-i="${i}" aria-label="Replay move ${i + 1}">${diagram({ board: h.state.board, arrows: [moveArrow(h.move, h.by === 'you' ? 'm' : 'w')], x: h.move.caps.map(rc), fl: flip() })}
      <span><b><i class="who" style="background:${mover > 0 ? '#161616' : '#F5F2EB'};box-shadow:inset 0 0 0 1px #9a9385"></i>${i + 1}. ${who(h.by)}</b><small>${describe(h.move, h.state.board)}</small></span></button>`;
  }).join('');
  host.querySelectorAll('.mcard').forEach((b) => (b.onclick = () => startReview(+b.dataset.i)));
}

// ---------- input ----------
function clickSq(sq) {
  if (busy() || over || review != null || S.player !== human) return;
  const moves = legal();
  if (selected != null) {
    const cands = moves.filter((m) => m.from === selected && to(m) === sq).sort((a, b) => b.caps.length - a.caps.length);
    if (cands.length) return humanMove(cands[0]);
  }
  if (moves.some((m) => m.from === sq)) { selected = sq === selected ? null : sq; hint = null; draw(); return; }
  if (S.board[sq] && Math.sign(S.board[sq]) === human) {
    shake(sq);
    setStatus(forced && moves[0]?.caps.length ? 'Forced jumps are on: you must take a piece. Glowing pieces can.' : 'That piece is stuck right now. Pick one with a glow.');
  } else if (selected != null) { selected = null; draw(); }
}
function shake(sq) { const el = pieceEls.get(ids[sq]); if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }

function humanMove(m) {
  if (drill?.kind === 'puzzle' && !drill.solved) {
    const [fr, fc] = drill.sol[0], [tr, tc] = drill.sol[1];
    if (m.from !== fr * 8 + fc || to(m) !== tr * 8 + tc) {
      shake(m.from); selected = null; draw();
      coach('Not that one', drill.clue); setStatus('Try again. Nothing has moved, take your time.'); return;
    }
    drill.solved = true; coach('Solved', drill.explain, true);
  }
  doMove(m, 'you');
}

async function doMove(m, by) {
  animating = true; selected = null; hint = null;
  draw();
  await animateMove(m, ids);
  const before = S;
  S = applyMove(S, m);
  const id = ids[m.from]; ids = ids.slice(); ids[m.from] = 0; for (const c of m.caps) ids[c] = 0; ids[to(m)] = id;
  hist.push({ state: before, move: m, by });
  if (by === 'ai') aiCount++;
  animating = false; save(); draw(); afterMove();
}
async function animateMove(m, idArr) {
  const el = pieceEls.get(idArr[m.from]); if (!el) return;
  arrowSvg.innerHTML = ''; sqEls.forEach((e) => e.classList.remove('dest', 'destcap', 'sel', 'last'));
  el.classList.remove('can', 'picked'); el.classList.add('moving');
  await wait(REDUCED ? 0 : 90);
  for (let i = 0; i < m.path.length; i++) {
    place(el, m.path[i]);
    await wait(HOP * .55);
    if (m.caps[i] != null) pieceEls.get(idArr[m.caps[i]])?.classList.add('gone');
    await wait(HOP * .45 + (m.caps.length ? 60 : 0));
  }
  el.classList.remove('moving');
  if (m.crown) { el.classList.add('king', 'crowning'); await wait(REDUCED ? 0 : 480); el.classList.remove('crowning'); }
  else await wait(REDUCED ? 0 : 120);
}

function afterMove() {
  const st = status(S, forced);
  if (st !== 'playing') return finish(st);
  if (S.player !== human) return aiTurn();
  const caps = legal().some((m) => m.caps.length);
  const base = drill ? drill.goal : LEVELS[level].name + '.';
  setStatus(caps ? (forced ? 'Your move. You must jump: glowing pieces can.' : 'Your move. A jump is available, but it\'s optional.') : `Your move. ${base}`);
  draw();
}
function finish(st) {
  over = true; thinking = false;
  const lvl = drill ? 'The drill AI' : LEVELS[level].name;
  if (st === 'draw') setStatus('Draw. 40 moves each with only kings moving and nothing captured.');
  else {
    const won = (st === 'black') === (human === BLACK);
    setStatus(won ? `You win${drill ? ' the drill' : ` against ${lvl}`} in ${Math.ceil(hist.length / 2)} moves.` : `${lvl} wins this one. Tap Undo to try another line.`, won ? 'win' : 'lose');
    if (won && !drill) { const k = `mtrx-ck-wins-${LEVELS[level].id}`; localStorage.setItem(k, +(localStorage.getItem(k) || 0) + 1); }
  }
  save(); draw();
}

// ---------- AI ----------
function aiTurn() {
  thinking = true; setStatus(`${drill ? 'Drill AI' : LEVELS[level].name} is thinking…`, 'think'); draw();
  const id = ++reqId, t0 = performance.now();
  worker.onmessage = async ({ data }) => {
    if (data.id !== id) return;
    const ms = performance.now() - t0; if (ms < 600) await wait(600 - ms); // never move instantly
    if (id !== reqId) return;
    thinking = false;
    if (!data.ok || !data.move) { setStatus('The AI hit a problem. Start a new game.', 'lose'); draw(); return; }
    if (review != null) exitReview();
    const m = legal().find((x) => sameMove(x, data.move)) || legal()[0];
    doMove(m, 'ai');
  };
  worker.postMessage({ state: S, level: drill ? 'expert' : LEVELS[level].id, forced, aiCount: drill ? 99 : aiCount, id });
}
function askHint() {
  if (busy() || over || review != null || S.player !== human) return;
  thinking = true; setStatus('Looking 9 moves ahead for you…', 'think'); draw();
  const id = ++reqId;
  worker.onmessage = ({ data }) => {
    if (data.id !== id) return;
    thinking = false;
    hint = data.ok && data.move ? legal().find((x) => sameMove(x, data.move)) || null : null;
    selected = hint ? hint.from : null;
    setStatus(hint ? `Try this: ${describe(hint, S.board).toLowerCase()}. Follow the yellow arrow.` : 'No suggestion here.');
    draw();
  };
  worker.postMessage({ state: S, level: 'hint', forced, aiCount: 99, id });
}

// ---------- undo, new game, save ----------
function undo() {
  if (animating) return;
  let i = hist.length - 1; while (i >= 0 && hist[i].by !== 'you') i--;
  if (i < 0) return;
  if (review != null) exitReview(true);
  reqId++; thinking = false; over = false;
  S = hist[i].state; hist = hist.slice(0, i); aiCount = hist.filter((h) => h.by === 'ai').length;
  selected = null; hint = null; ids = freshIds(S.board);
  if (drill?.kind === 'puzzle' && i === 0) { drill.solved = false; coach(drill.name, drill.goal); }
  save(); draw(true); afterMove();
}
function startGame(state, d = null) {
  reqId++; thinking = false; animating = false; over = false;
  if (review != null) exitReview(true);
  drill = d; human = d ? BLACK : sidePref;
  S = state; ids = freshIds(S.board); hist = []; aiCount = 0; selected = null; hint = null;
  start = { b: S.board.filter((p) => p > 0).length, w: S.board.filter((p) => p < 0).length };
  $('#coach').innerHTML = '';
  if (d) coach(d.name, d.goal);
  save(); draw(true); afterMove();
}
const newGame = () => startGame(newState());
function save() {
  localStorage.setItem('mtrx-ck2', JSON.stringify({ S, hist, human, aiCount, over, start, drill: drill ? { i: drill.i, solved: drill.solved } : null }));
}
function coach(title, text, good) {
  $('#coach').innerHTML = `<div class="coach"${good ? ' style="border-color:var(--mtrx-moss)"' : ''}><div class="mtrx-label" style="margin:0">${drill ? 'Drill' : 'Coach'}</div><b>${title}</b><p>${text}</p></div>`;
}

// ---------- replay ----------
async function startReview(i) {
  if (animating || i < 0 || i >= hist.length) return;
  review = i; const tok = ++reviewTok; const h = hist[i];
  $('#reviewBar').hidden = false;
  $('#revTxt').textContent = `Move ${i + 1} of ${hist.length} · ${who(h.by)}: ${describe(h.move, h.state.board)}`;
  $('#revPrev').disabled = i === 0; $('#revNext').disabled = i === hist.length - 1;
  sqEls.forEach((e) => e.classList.remove('dest', 'destcap', 'sel', 'last'));
  arrowSvg.innerHTML = '';
  const tmp = h.state.board.map((p, sq) => (p ? `r${tok}-${sq}` : 0));
  syncPieces(h.state.board, tmp, true);
  drawCards(); draw();
  await wait(REDUCED ? 0 : 380); if (tok !== reviewTok) return;
  await animateMove(h.move, tmp); if (tok !== reviewTok) return;
  drawBoardArrows([{ a: moveArrow(h.move, h.by === 'you' ? 'm' : 'w'), xs: h.move.caps.map(rc) }]);
}
function exitReview(silent) {
  review = null; reviewTok++;
  $('#reviewBar').hidden = true;
  if (!silent) draw(true);
}
$('#revPrev').onclick = () => startReview(review - 1);
$('#revNext').onclick = () => startReview(review + 1);
$('#revLive').onclick = () => exitReview();

// ---------- controls ----------
function segment(sel, attr, current, onPick) {
  const btns = document.querySelectorAll(`${sel} button`);
  const mark = (v) => btns.forEach((b) => b.setAttribute('aria-pressed', b.dataset[attr] === String(v)));
  mark(current);
  btns.forEach((b) => (b.onclick = () => { mark(b.dataset[attr]); onPick(b.dataset[attr]); }));
}
$('#diffSeg').innerHTML = LEVELS.map((l, i) => `<button data-i="${i}">${l.name}</button>`).join('');
$('#lvlNote').textContent = LEVELS[level].note;
segment('#diffSeg', 'i', level, (v) => { level = +v; localStorage.setItem('mtrx-ck-level', level); $('#lvlNote').textContent = LEVELS[level].note; newGame(); });
segment('#sideSeg', 's', sidePref, (v) => { sidePref = +v; localStorage.setItem('mtrx-ck-side', sidePref); newGame(); });
segment('#ruleSeg', 'f', forced ? 1 : 0, (v) => {
  forced = v === '1'; localStorage.setItem('mtrx-ck-forced', v);
  hint = null; selected = null;
  if (!busy() && !over) afterMove(); else draw();
});
$('#styleMenu').innerHTML = STYLES.map((s) => `<button data-st="${s.id}"><i class="sw" style="--l:${s.l};--d:${s.d};--f:${s.f}"></i>${s.name}</button>`).join('');
segment('#styleMenu', 'st', style, (v) => { style = v; document.body.dataset.board = v; localStorage.setItem('mtrx-ck-style', v); });
$('#newBtn').onclick = () => (drill ? startDrill(drill.i) : newGame());
$('#undoBtn').onclick = undo;
$('#hintBtn').onclick = askHint;
addEventListener('keydown', (e) => {
  if (e.target.closest('.drawer')) return;
  if (review != null && e.key === 'ArrowLeft') startReview(review - 1);
  else if (review != null && e.key === 'ArrowRight') startReview(review + 1);
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
function startDrill(i) { startGame(newState(drillBoard(DRILLS[i]), BLACK), { ...DRILLS[i], solved: false }); learn.close(); }

// ---------- Learn drawer (illustrated) ----------
const lesson = (n, dg, title, text) => `<div class="lesson vis"><div>${dg}</div><div>${n ? `<span class="mtrx-numeral">${n}</span>` : ''}<h3>${title}</h3><p>${text}</p></div></div>`;
const A = (pts, kind = 'm', n) => ({ pts, kind, n });
const dots = (b, w) => `<span class="t">${'<i class="dot b"></i>'.repeat(b)}<em style="width:auto;margin:0 6px">vs</em>${'<i class="dot w"></i>'.repeat(w)}</span>`;
const learn = mountLearn({
  title: 'Checkers', tabs: [
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
$('#learnBtn').onclick = () => learn.open(0);

// ---------- boot: resume or start ----------
(() => {
  try {
    const g = JSON.parse(localStorage.getItem('mtrx-ck2') || 'null');
    if (g && g.S && !g.over && g.S.board?.length === 64) {
      S = g.S; hist = g.hist || []; human = g.human === WHITE ? WHITE : BLACK; aiCount = g.aiCount || 0; start = g.start || start;
      drill = g.drill && DRILLS[g.drill.i] ? { ...DRILLS[g.drill.i], solved: g.drill.solved } : null;
      ids = freshIds(S.board);
      if (drill) coach(drill.name, drill.goal);
      draw(true); afterMove(); return;
    }
  } catch { /* corrupted save: start fresh */ }
  newGame();
})();
