// MTRX™ Arcade · Chess v1. Rules: chess.js 1.4.0 (BSD-2, Jeff Hlywa). AI: Stockfish 19 via stockfish.js (GPL-3).
// Pieces: Chessnut by Alexis Luengas (Apache-2.0). Shell, levels, animation and lessons: Designed by MTRX™
import { WORDMARK } from './wordmark.js?v=5';
import { mountLearn, rand } from './learn.js?v=5';
import { applyTheme } from './theme.js?v=5';
import { Engine, pickMove, bestFor, miniPick } from './chess-ai.js?v=6';

const LIBS = ['https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm', 'https://esm.sh/chess.js@1.4.0'];
const PIECES = 'https://cdn.jsdelivr.net/gh/LexLuengas/chessnut-pieces@2b8eaf14a31edad7e9deb53b1473e1d4857868a9/';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const $ = (s) => document.querySelector(s);
$('#home').innerHTML = WORDMARK;

const LEVELS = [
  { id: 'easy', name: 'Easy', note: 'Stockfish at its weakest, plus a random move about a third of the time. Roughly 600.' },
  { id: 'medium', name: 'Medium', note: 'Weak Stockfish that looks 3 moves ahead and still slips about 1 move in 8. Roughly 900.' },
  { id: 'intermediate', name: 'Intermediate', note: 'Stockfish capped at 1350 Elo. Punishes pieces left hanging.' },
  { id: 'hard', name: 'Hard', note: 'Stockfish capped at 1850 Elo, a strong club player. Varies its openings.' },
  { id: 'expert', name: 'Expert', note: 'Full Stockfish 19 (lite), up to 1.5 seconds a move. Random opening choice, then no mercy.' },
];
const STYLES = [
  { id: 'tournament', name: 'Tournament', l: '#EEEED2', d: '#769656', f: '#2E3B22' },
  { id: 'walnut', name: 'Walnut', l: '#E9CF9F', d: '#A97A4E', f: '#3A2416' },
  { id: 'marble', name: 'Marble', l: '#ECEAE4', d: '#8D94A4', f: '#40424D' },
  { id: 'sand', name: 'Sand', l: '#F4E8CB', d: '#C49A63', f: '#5B4128' },
  { id: 'mtrx', name: 'MTRX', l: '#ECEAE4', d: '#E9895A', f: '#0E0E0C' },
];
const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const src = (c, t) => `${PIECES}${c}${t.toUpperCase()}.svg`;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
// slow, soft motion: pieces glide, knights hop, captured pieces melt away and leave a fading ring
const SPEEDS = { relaxed: 1, normal: .72, quick: .48 };
const T = { slide: 760, drop: 200, fade: 640, prelift: 420, promo: 760, settle: 220, ai: 900, replay: 1500 };
const ms = (k) => (REDUCED ? 0 : Math.round(T[k] * (SPEEDS[P.speed] || 1)));
const EASE_MOVE = 'cubic-bezier(.45,.05,.3,1)', EASE_ARC = 'cubic-bezier(.4,0,.5,1)';
const LIFTED = 'translateY(-5%) scale(1.08)', REST = 'translateY(0) scale(1)';
const wait = (t) => new Promise((r) => setTimeout(r, t));
const fmt = (t) => { const s = Math.floor(t / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const FILES = 'abcdefgh';
const fr = (sq) => [FILES.indexOf(sq[0]), +sq[1] - 1];
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const sideName = (c) => (c === 'w' ? 'White' : 'Black');
for (const c of 'wb') for (const t of 'kqrbnp') { const im = new Image(); im.src = src(c, t); } // warm the cache

// ---------- preferences ----------
const P = Object.assign({ level: 1, side: 'w', style: 'tournament', showMoves: true, opp: 'ai', play: 'practice', speed: 'relaxed' }, JSON.parse(localStorage.getItem('mtrx-cs-prefs') || 'null') || {});
if (!STYLES.some((s) => s.id === P.style)) P.style = 'tournament';
P.level = Math.min(4, Math.max(0, +P.level || 0)); if (!['w', 'b', 'r'].includes(P.side)) P.side = 'w';
if (P.opp !== '2p') P.opp = 'ai'; if (P.play !== 'challenge') P.play = 'practice'; if (!SPEEDS[P.speed]) P.speed = 'relaxed';
const savePrefs = () => localStorage.setItem('mtrx-cs-prefs', JSON.stringify(P));
document.body.dataset.board = P.style;

// ---------- state ----------
let Chess = null, C = null; // chess.js class + the live game
let G = null; // { start, moves: [rec], human: 'w'|'b', level, mode, play, undos, aiCount, over, result, drill, clock: {ms, since, pen} }
let selected = null, hint = null, thinking = false, animating = false, reqId = 0, drag = null;
let paused = false, autoPaused = false, resumeWaiters = [];
let review = null, reviewTok = 0, autoplay = null, engineNoted = false;
const engine = new Engine();
const busy = () => thinking || animating || paused;
const twoP = () => G?.mode === '2p';
const challenge = () => G?.play === 'challenge' && !twoP() && !G?.drill;
const humanTurn = () => twoP() || C.turn() === G.human;
const flip = () => G && G.human === 'b';
const drillDef = () => (G?.drill ? DRILLS[G.drill.i] : null);
const aiName = () => (G?.drill ? 'The drill AI' : LEVELS[G.level].name);

// ---------- clock ----------
const elapsed = () => (G ? G.clock.ms + (G.clock.pen || 0) + (G.clock.since ? Date.now() - G.clock.since : 0) : 0);
const startClock = () => { if (G && !G.clock.since && !G.over && !paused) G.clock.since = Date.now(); };
const stopClock = () => { if (G?.clock.since) { G.clock.ms += Date.now() - G.clock.since; G.clock.since = null; } };
const bestKey = () => (twoP() ? null : G.drill ? `mtrx-cs-best:drill${G.drill.i}` : `mtrx-cs-best:${LEVELS[G.level].id}${challenge() ? ':c' : ''}`);
const bestFor_ = (k) => (k ? +(localStorage.getItem(k) || 0) : 0);
let clockShown = '';
function tickClock() { if (!G) return; const t = fmt(elapsed()); if (t !== clockShown) { $('#clock').textContent = t; clockShown = t; } }
function penaltyFlash(text) {
  const pen = $('#pen'), btn = $('#clockBtn');
  tickClock(); pen.textContent = text; pen.classList.remove('go'); btn.classList.remove('hit'); void pen.offsetWidth; pen.classList.add('go'); btn.classList.add('hit');
}
setInterval(tickClock, 250);
document.addEventListener('visibilitychange', () => { if (document.hidden && running()) { autoPaused = false; pause('away'); } });
addEventListener('pagehide', () => save());

// ---------- pause ----------
const running = () => G && C && !G.over && !paused && review == null && overlay.hidden;
const untilRunning = () => (paused ? new Promise((r) => resumeWaiters.push(r)) : Promise.resolve());
function pause(why = 'button') {
  if (!G || G.over || paused) return;
  paused = true; stopClock(); save(); selected = null; cancelDrag();
  if (why !== 'menu' && why !== 'setup') showPause(why);
  draw();
}
function resume() {
  if (!paused) return;
  paused = false; autoPaused = false;
  if (overlay.classList.contains('pause')) hideOverlay(true);
  if (G && (G.moves.length || G.clock.ms)) startClock();
  const w = resumeWaiters; resumeWaiters = []; w.forEach((f) => f());
  draw();
  if (G && !G.over && !busy()) afterMove();
}
function togglePause() { if (paused) resume(); else if (running()) pause('button'); }
function showPause(why) {
  const title = why === 'back' ? 'Welcome back' : 'Paused';
  showOverlay(`<div class="ov-card" role="dialog" aria-label="${title}"><div class="mtrx-label" style="margin:0">${modeLabel()}</div><h2>${title}</h2>
    <div class="big">${fmt(elapsed())}</div><p class="note">The clock is stopped and the board is hidden.</p>
    <button class="mtrx-btn mtrx-btn--primary go" id="resumeBtn">Resume</button><p class="hint-line">Tip: tap the clock or press P to pause any time</p></div>`, 'pause');
  overlay.querySelector('#resumeBtn').onclick = resume;
}
const modeLabel = () => `${twoP() ? 'Two players' : G.drill ? drillDef().name : LEVELS[G.level].name}${challenge() ? ' · Challenge' : ''}`;

// ---------- board DOM ----------
const boardEl = $('#board'), sqWrap = $('#squares'), pcLayer = $('#pieces'), arrowSvg = $('#arrows'), overlay = $('#overlay');
const sqEls = [];
for (let i = 0; i < 64; i++) {
  const el = document.createElement('div');
  el.className = 'sq ' + (((i >> 3) + (i & 7)) % 2 ? 'dark' : 'light');
  sqWrap.append(el); sqEls.push(el);
}
// screen position <-> square name, honouring which side is at the bottom
const scr = (sq) => { const [f, r] = fr(sq); return flip() ? [r, 7 - f] : [7 - r, f]; };
const sqAt = (row, col) => (flip() ? FILES[7 - col] + (row + 1) : FILES[col] + (8 - row));
const sqEl = (sq) => { const [row, col] = scr(sq); return sqEls[row * 8 + col]; };
const tr = (sq) => { const [row, col] = scr(sq); return `translate(${col * 100}%, ${row * 100}%)`; };
let coordsFlip = null;
function drawCoords() {
  if (coordsFlip === flip()) return; coordsFlip = flip();
  sqEls.forEach((el, i) => {
    const row = i >> 3, col = i & 7, sq = sqAt(row, col);
    el.innerHTML = (col === 0 ? `<span class="co r">${sq[1]}</span>` : '') + (row === 7 ? `<span class="co f">${sq[0]}</span>` : '');
  });
}
const pieces = new Map(); // square -> element
function makePiece(c, t) {
  const el = document.createElement('div');
  el.className = `pc ${c}`; el.dataset.p = c + t;
  el.innerHTML = `<div class="lift"><img alt="" draggable="false" src="${src(c, t)}"></div>`;
  el.querySelector('img').onerror = function () { this.replaceWith(Object.assign(document.createElement('span'), { className: 'gl', textContent: GLYPH[t] + '\uFE0E' })); };
  pcLayer.append(el); return el;
}
const boardMap = (c) => { const m = new Map(); c.board().forEach((row) => row.forEach((p) => { if (p) m.set(p.square, p); })); return m; };
function syncPieces(map) { // reconcile the piece layer with a position, keeping elements that are already right
  for (const [sq, el] of pieces) { const p = map.get(sq); if (!p || el.dataset.p !== p.color + p.type) { el.remove(); pieces.delete(sq); } }
  for (const [sq, p] of map) { let el = pieces.get(sq); if (!el) { el = makePiece(p.color, p.type); pieces.set(sq, el); } el.style.transform = tr(sq); el.style.opacity = ''; }
}
function ghostAt(sq) {
  if (REDUCED) return;
  const g = document.createElement('div'); g.className = 'ghost'; g.style.transform = tr(sq); g.innerHTML = '<i></i>';
  pcLayer.prepend(g); setTimeout(() => g.remove(), 2400);
}
// Glide (or hop, for knights) from one square to another. Takes fade as the mover arrives.
async function animateMove(rec, { lifted = false, dragged = false } = {}) {
  const el = pieces.get(rec.from); if (!el) return;
  const lift = el.querySelector('.lift');
  const [f0, r0] = fr(rec.from), [f1, r1] = fr(rec.to), dist = Math.max(Math.abs(f1 - f0), Math.abs(r1 - r0));
  const ep = rec.flags.includes('e'), capSq = ep ? rec.to[0] + rec.from[1] : rec.to;
  const capEl = rec.captured ? pieces.get(capSq) : null;
  const castle = rec.flags.includes('k') ? ['h', 'f'] : rec.flags.includes('q') ? ['a', 'd'] : null;
  const dur = dragged ? ms('drop') : Math.round(ms('slide') * (0.72 + 0.07 * Math.min(dist, 7)));
  arrowSvg.innerHTML = ''; clearMarks();
  el.classList.remove('picked', 'dragging'); el.classList.add('moving');
  const fromT = dragged ? el.style.transform : tr(rec.from);
  let rookDone = Promise.resolve();
  if (dur) {
    const a = el.animate([{ transform: fromT }, { transform: tr(rec.to) }], { duration: dur, easing: EASE_MOVE, fill: 'forwards' });
    if (!dragged) {
      const hop = rec.piece === 'n';
      lift.animate(hop ? [{ transform: lifted ? LIFTED : REST }, { transform: 'translateY(-22%) scale(1.14)', offset: .5 }, { transform: REST }]
        : [{ transform: lifted ? LIFTED : REST }, { transform: 'translateY(-6%) scale(1.06)', offset: .45 }, { transform: REST }], { duration: dur, easing: EASE_ARC });
    }
    if (castle) { // the rook steps over a beat after the king sets off
      const rf = castle[0] + rec.from[1], rt = castle[1] + rec.from[1], rEl = pieces.get(rf);
      if (rEl) {
        rEl.classList.add('moving');
        rookDone = wait(dur * .25).then(() => rEl.animate([{ transform: tr(rf) }, { transform: tr(rt) }], { duration: dur * .85, easing: EASE_MOVE, fill: 'forwards' }).finished.catch(() => {}))
          .then(() => { rEl.getAnimations().forEach((x) => x.cancel()); rEl.style.transform = tr(rt); rEl.classList.remove('moving'); pieces.delete(rf); pieces.set(rt, rEl); });
      }
    }
    if (capEl) setTimeout(() => {
      ghostAt(capSq);
      capEl.animate([{ opacity: 1, transform: tr(capSq) }, { opacity: .5, transform: `${tr(capSq)} scale(.92)`, offset: .4 }, { opacity: 0, transform: `${tr(capSq)} scale(.78)` }], { duration: ms('fade'), easing: 'ease-out', fill: 'forwards' });
    }, dur * .55);
    try { await a.finished; } catch { /* interrupted */ }
    el.style.transform = tr(rec.to); a.cancel();
  } else {
    el.style.transform = tr(rec.to);
    if (castle) { const rf = castle[0] + rec.from[1], rt = castle[1] + rec.from[1], rEl = pieces.get(rf); if (rEl) { rEl.style.transform = tr(rt); pieces.delete(rf); pieces.set(rt, rEl); } }
  }
  pieces.delete(rec.from);
  if (capEl) { pieces.delete(capSq); setTimeout(() => capEl.remove(), REDUCED ? 0 : ms('fade') + 50); if (!dur) capEl.remove(); }
  pieces.set(rec.to, el);
  await rookDone;
  if (ms('settle')) lift.animate([{ transform: REST }, { transform: 'translateY(1.5%) scale(.97)' }, { transform: REST }], { duration: ms('settle'), easing: 'ease-out' });
  el.classList.remove('moving');
  if (rec.promotion) { // the pawn turns into its new piece with a little pop
    el.dataset.p = rec.color + rec.promotion;
    const im = el.querySelector('img'); if (im) im.src = src(rec.color, rec.promotion); else el.querySelector('.gl').textContent = GLYPH[rec.promotion] + '\uFE0E';
    el.classList.add('promo'); await wait(ms('promo')); el.classList.remove('promo');
  } else await wait(ms('settle') * .6);
}

// ---------- words for moves (no notation needed) ----------
function describe(rec) {
  let s;
  if (rec.flags.includes('k')) s = 'Castled kingside';
  else if (rec.flags.includes('q')) s = 'Castled queenside';
  else {
    s = `${cap1(NAME[rec.piece])} ${rec.captured ? `takes ${NAME[rec.captured]} on ${rec.to}` : `to ${rec.to}`}`;
    if (rec.flags.includes('e')) s += ' (en passant)';
    if (rec.promotion) s += `, becomes a ${NAME[rec.promotion]}`;
  }
  return s + (rec.mate ? ', checkmate' : rec.check ? ', check' : '');
}
const lower1 = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const who = (by) => (by === 'you' ? 'You' : by === 'w' ? 'White' : by === 'b' ? 'Black' : G?.drill ? 'Drill AI' : 'AI');
const akind = (by) => (by === 'ai' || by === 'b' ? 'w' : 'm');

// ---------- drawing ----------
let statusShown = '', statusCls = '';
function setStatus(t, cls = '') { const el = $('#status'); if (t === statusShown && cls === statusCls) return; statusShown = t; statusCls = cls; el.textContent = t; el.className = 'status-line ' + cls; if (t) { void el.offsetWidth; el.classList.add('fade'); } }
const clearMarks = () => sqEls.forEach((el) => el.classList.remove('dest', 'destcap', 'sel', 'last', 'hintsq', 'check', 'hover'));
const kingSq = (c, color) => { for (const row of c.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square; return null; };
function draw() {
  if (!G || !C) return;
  drawCoords();
  if (review == null) {
    if (!animating) syncPieces(boardMap(C));
    clearMarks();
    const myTurn = !busy() && !G.over && humanTurn();
    if (selected) {
      sqEl(selected).classList.add('sel');
      if (myTurn && (P.showMoves || hint)) for (const m of C.moves({ square: selected, verbose: true })) sqEl(m.to).classList.add(m.captured ? 'destcap' : 'dest');
    }
    const last = G.moves[G.moves.length - 1];
    if (last && !animating) { sqEl(last.from).classList.add('last'); sqEl(last.to).classList.add('last'); }
    if (hint) { sqEl(hint.from).classList.add('hintsq'); sqEl(hint.to).classList.add('hintsq'); }
    if (C.inCheck() && !animating) sqEl(kingSq(C, C.turn())).classList.add('check');
    for (const [sq, el] of pieces) el.classList.toggle('picked', sq === selected && !drag?.moved);
    arrowSvg.innerHTML = '';
  }
  drawHud();
  $('#undoBtn').disabled = animating || paused || !G.moves.some((m) => m.by !== 'ai') || review != null || !!(G.drill && DRILLS[G.drill.i].kind === 'puzzle' && G.over);
  $('#hintBtn').disabled = busy() || G.over || !humanTurn() || review != null;
  const ch = challenge();
  $('#hintBtn').hidden = ch; $('.actions').classList.toggle('one', ch);
  $('#undoBtn').innerHTML = ch ? 'Undo<small>+1:00</small>' : 'Undo';
  const cb = $('#clockBtn'); cb.disabled = G.over || review != null || (!overlay.hidden && !paused);
  cb.classList.toggle('paused', paused); cb.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
  $('#pz').innerHTML = paused ? '<path d="M7 4.5v15l12-7.5z"/>' : '<path d="M6.5 4.5h3.6v15H6.5zM13.9 4.5h3.6v15h-3.6z"/>';
}
function tray(color) { // pieces this side has taken, biggest first, plus the material lead
  const took = G.moves.filter((m) => m.captured && m.color === color).map((m) => m.captured).sort((a, b) => VALUE[b] - VALUE[a]);
  const mine = G.moves.filter((m) => m.captured && m.color === color).reduce((s, m) => s + VALUE[m.captured], 0);
  const theirs = G.moves.filter((m) => m.captured && m.color !== color).reduce((s, m) => s + VALUE[m.captured], 0);
  const opp = color === 'w' ? 'b' : 'w';
  if (!took.length) return '<span class="none">Nothing taken</span>';
  return took.map((t) => `<img alt="${NAME[t]}" src="${src(opp, t)}">`).join('') + (mine > theirs ? `<em>+${mine - theirs}</em>` : '');
}
let hudKey = '';
function drawHud() {
  const h = G.human, o = h === 'w' ? 'b' : 'w';
  const key = `${G.moves.length}|${h}|${G.mode}|${G.level}|${!!G.drill}`;
  if (key !== hudKey) {
    hudKey = key;
    $('#youChip').innerHTML = `<img alt="" src="${src(h, 'k')}">`; $('#aiChip').innerHTML = `<img alt="" src="${src(o, 'k')}">`;
    $('#trayYou').innerHTML = tray(h); $('#trayAi').innerHTML = tray(o);
    $('#youName').textContent = twoP() ? sideName(h) : 'You';
    $('#aiName').textContent = twoP() ? sideName(o) : G.drill ? 'Drill AI' : LEVELS[G.level].name;
  }
  const turnYou = !G.over && C.turn() === h;
  $('#hudYou').classList.toggle('turn', turnYou); $('#hudAi').classList.toggle('turn', !G.over && !turnYou);
  const best = bestFor_(bestKey());
  $('#clockSub').textContent = paused ? 'Paused' : twoP() ? 'Two players' : `${challenge() ? 'Challenge · ' : ''}${best ? `Best ${fmt(best)}` : 'No best yet'}`;
}

// ---------- input: tap a piece then a square, or drag it ----------
const canInput = () => G && C && !busy() && !G.over && review == null && overlay.hidden && humanTurn();
function sqFromPoint(e) {
  const r = sqWrap.getBoundingClientRect();
  const col = Math.floor(((e.clientX - r.left) / r.width) * 8), row = Math.floor(((e.clientY - r.top) / r.height) * 8);
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  return sqAt(row, col);
}
const legalTo = (from, to) => C.moves({ square: from, verbose: true }).filter((m) => m.to === to);
boardEl.addEventListener('pointerdown', (e) => {
  if (!canInput()) return;
  const sq = sqFromPoint(e); if (!sq) return;
  if (selected && selected !== sq && legalTo(selected, sq).length) { tryMove(selected, sq); return; }
  const p = C.get(sq);
  if (p && p.color === C.turn()) {
    drag = { sq, x: e.clientX, y: e.clientY, moved: false, wasSel: selected === sq, id: e.pointerId };
    selected = sq; hint = null; draw();
    try { boardEl.setPointerCapture(e.pointerId); } catch { /* fine */ }
  } else if (p) { const el = pieces.get(sq); shakeEl(el); setStatus(twoP() ? `It's ${sideName(C.turn())}'s turn` : 'That piece belongs to the other side'); }
  else if (selected) { const el = pieces.get(selected); selected = null; shakeEl(el, true); draw(); }
});
boardEl.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const el = pieces.get(drag.sq); if (!el) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 7) return;
  if (!drag.moved) { drag.moved = true; el.classList.remove('picked'); el.classList.add('dragging'); }
  const r = sqWrap.getBoundingClientRect(), cell = r.width / 8;
  el.style.transform = `translate(${e.clientX - r.left - cell / 2}px, ${e.clientY - r.top - cell / 2}px)`;
  const over = sqFromPoint(e);
  sqEls.forEach((s) => s.classList.remove('hover'));
  if (over && legalTo(drag.sq, over).length) sqEl(over).classList.add('hover');
});
function endDrag(e, cancel) {
  if (!drag) return;
  const d = drag; drag = null;
  sqEls.forEach((s) => s.classList.remove('hover'));
  const el = pieces.get(d.sq);
  if (d.moved) {
    const to = cancel ? null : sqFromPoint(e);
    if (to && to !== d.sq && legalTo(d.sq, to).length) { tryMove(d.sq, to, { dragged: true }); return; }
    if (el) { // glide back home
      el.classList.remove('dragging');
      const from = el.style.transform; el.style.transform = tr(d.sq);
      if (!REDUCED) el.animate([{ transform: from }, { transform: tr(d.sq) }], { duration: 260, easing: EASE_MOVE });
    }
    draw(); return;
  }
  if (d.wasSel) { selected = null; draw(); }
}
boardEl.addEventListener('pointerup', (e) => endDrag(e));
boardEl.addEventListener('pointercancel', (e) => endDrag(e, true));
function cancelDrag() { if (drag) endDrag(null, true); }
function shakeEl(el, soft) { if (!el || soft) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
const byNow = () => (twoP() ? C.turn() : 'you');
function tryMove(from, to, opts = {}) {
  const cands = legalTo(from, to); if (!cands.length) return false;
  if (cands.some((m) => m.promotion)) { showPromo(from, to, opts); return true; }
  return humanMove({ from, to }, opts);
}
function humanMove(mv, opts) {
  const d = drillDef();
  if (d?.kind === 'puzzle') { // a puzzle only accepts a move that really is checkmate
    const t = new Chess(C.fen()); t.move(mv);
    if (!t.isCheckmate()) {
      const el = pieces.get(mv.from);
      if (opts.dragged && el) { el.classList.remove('dragging'); el.style.transform = tr(mv.from); }
      selected = null; shakeEl(el); draw(); setStatus(`Not mate. ${d.clue}`, 'lose'); return false;
    }
  }
  doMove(mv, byNow(), opts); return true;
}
function showPromo(from, to, opts) {
  const c = C.turn();
  showOverlay(`<div class="ov-card promo-card" role="dialog" aria-label="Promote"><div class="mtrx-label" style="margin:0">Promotion</div><h2 style="margin:0">Your pawn becomes a…</h2>
    <div class="promo-row">${['q', 'r', 'b', 'n'].map((t) => `<button data-t="${t}" aria-label="${NAME[t]}"><img alt="" src="${src(c, t)}"></button>`).join('')}</div>
    <div class="sub" style="justify-content:center"><button id="promoNo">Cancel</button></div></div>`);
  overlay.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { hideOverlay(); humanMove({ from, to, promotion: b.dataset.t }, opts); }));
  overlay.querySelector('#promoNo').onclick = () => { hideOverlay(); const el = pieces.get(from); if (el) { el.classList.remove('dragging'); el.style.transform = tr(from); } selected = null; draw(); };
}

async function doMove(input, by, opts = {}) {
  let mv;
  try { mv = C.move(input); } catch { return; }
  const rec = { from: mv.from, to: mv.to, promotion: mv.promotion || null, san: mv.san, piece: mv.piece, color: mv.color, captured: mv.captured || null, flags: mv.flags, before: mv.before, by, check: C.inCheck(), mate: C.isCheckmate() };
  const lifted = selected === mv.from && !opts.dragged;
  G.moves.push(rec); if (by === 'ai') G.aiCount++;
  animating = true; selected = null; hint = null; startClock();
  draw();
  if (by === 'ai' && !REDUCED) { // the AI's piece rises first, so your eye finds it before it moves
    const el = pieces.get(rec.from); el?.classList.add('picked'); sqEl(rec.from).classList.add('sel');
    await wait(ms('prelift')); sqEl(rec.from).classList.remove('sel');
  }
  await animateMove(rec, { lifted: lifted || by === 'ai', dragged: opts.dragged });
  animating = false; save(); draw(); afterMove();
}
function afterMove() {
  if (C.isGameOver()) return finish();
  if (paused) return draw();
  if (!twoP() && C.turn() !== G.human) { if (!thinking) aiTurn(); return; }
  const d = drillDef(), last = G.moves[G.moves.length - 1];
  const said = last ? (last.by === 'ai' ? `${aiName()} played ${lower1(describe(last))}. ` : twoP() ? `${who(last.by)}: ${lower1(describe(last))}. ` : '') : '';
  const you = twoP() ? `${sideName(C.turn())} to move` : 'Your move';
  setStatus(d && !G.moves.length ? d.goal : `${said}${you}${C.inCheck() ? ' · you are in check' : ''}`, C.inCheck() ? 'lose' : '');
  draw();
}
function finish(resigned) {
  G.over = true; thinking = false; stopClock(); engine.stop();
  let st, winner = null;
  if (resigned) { st = 'resign'; winner = resigned === 'w' ? 'b' : 'w'; }
  else if (C.isCheckmate()) { st = 'mate'; winner = C.turn() === 'w' ? 'b' : 'w'; }
  else st = C.isStalemate() ? 'stalemate' : C.isInsufficientMaterial() ? 'material' : C.isThreefoldRepetition() ? 'repetition' : C.isDrawByFiftyMoves() ? 'fifty' : 'draw';
  const won = !twoP() && winner === G.human, time = elapsed();
  let newBest = false;
  if (won) { const k = bestKey(), b = bestFor_(k); if (k && (!b || time < b)) { localStorage.setItem(k, time); newBest = true; } }
  G.result = { st, winner, won, time, newBest };
  setStatus(resultTitle(), winner ? (won || twoP() ? 'win' : 'lose') : '');
  save(); draw(); setTimeout(() => { if (G?.over && G.result && review == null) showResult(); }, REDUCED ? 0 : 700);
}
const DRAW_WHY = { stalemate: 'Stalemate: no legal move, but not in check.', material: 'Neither side has enough pieces left to checkmate.', repetition: 'The same position came up three times.', fifty: '50 moves each without a capture or a pawn move.', draw: 'Drawn position.' };
function resultTitle() {
  const r = G.result; if (!r.winner) return r.st === 'stalemate' ? 'Stalemate' : 'Draw';
  if (G.drill && drillDef().kind === 'puzzle' && r.won) return 'Solved';
  if (twoP()) return `${sideName(r.winner)} wins`;
  return r.won ? (r.st === 'resign' ? 'You win' : 'Checkmate. You win') : r.st === 'resign' ? 'You resigned' : `${aiName()} wins`;
}

// ---------- AI ----------
async function aiTurn() {
  thinking = true;
  const first = !engine.kind;
  setStatus(first ? 'Waking up the engine (first move only)' : `${G.drill ? 'Drill AI' : LEVELS[G.level].name} is thinking`, 'think'); draw();
  const id = ++reqId, t0 = performance.now(), level = G.drill ? 'expert' : LEVELS[G.level].id;
  let mv = null;
  try { mv = await pickMove({ engine, Chess, fen: C.fen(), level, aiPly: G.aiCount }); } catch { mv = miniPick(Chess, C.fen(), level); }
  const took = performance.now() - t0; if (took < ms('ai')) await wait(ms('ai') - took);
  await untilRunning();
  if (id !== reqId || !G || G.over) return;
  thinking = false;
  if (engine.kind === 'mini' && !engineNoted) { engineNoted = true; setStatus('Stockfish could not load, so a simpler built-in engine is playing.', 'lose'); }
  if (!mv) { setStatus('The AI hit a problem. Start a new game from the menu.', 'lose'); draw(); return; }
  if (review != null) exitReview(true);
  doMove({ from: mv.slice(0, 2), to: mv.slice(2, 4), promotion: mv[4] }, 'ai');
}
function evalWords(line) {
  if (!line) return '';
  if (line.mate != null) return line.mate > 0 ? ` · there's a forced mate in ${line.mate}` : ` · you're getting mated in ${-line.mate}`;
  const p = line.cp / 100;
  if (Math.abs(p) < 0.5) return ' · the position is about level';
  return p > 0 ? ` · you're ahead by about ${p.toFixed(1)} pawns` : ` · you're behind by about ${(-p).toFixed(1)} pawns`;
}
async function askHint() {
  if (!G || busy() || G.over || review != null || !humanTurn() || challenge()) return;
  thinking = true; setStatus(engine.kind ? 'Looking ahead for you' : 'Waking up the engine', 'think'); draw();
  const id = ++reqId;
  let r = null; try { r = await bestFor({ engine, Chess, fen: C.fen() }); } catch { r = null; }
  if (id !== reqId || !G) return;
  thinking = false;
  const mv = r?.move && legalTo(r.move.slice(0, 2), r.move.slice(2, 4))[0];
  if (!mv) { setStatus('No suggestion here'); draw(); return; }
  hint = { from: mv.from, to: mv.to }; selected = mv.from;
  const t = new Chess(C.fen()); const x = t.move({ from: mv.from, to: mv.to, promotion: r.move[4] || mv.promotion });
  const rec = { ...x, promotion: x.promotion || null, captured: x.captured || null, check: t.inCheck(), mate: t.isCheckmate() };
  setStatus(`Try: ${lower1(describe(rec))} (the pulsing squares)${evalWords(r.line)}`);
  draw();
}

// ---------- undo, games, save ----------
function rebuild() { C = new Chess(G.start); for (const m of G.moves) C.move({ from: m.from, to: m.to, promotion: m.promotion || undefined }); }
function undo() {
  if (!G || animating || paused) return;
  let i = G.moves.length - 1; while (i >= 0 && G.moves[i].by === 'ai') i--; // two players: one move back; vs AI: back to your last move
  if (i < 0) return;
  reqId++; thinking = false; engine.stop(); hideOverlay();
  if (challenge()) { G.undos = (G.undos || 0) + 1; G.clock.pen = (G.clock.pen || 0) + 60000; penaltyFlash('+1:00'); }
  if (G.over) { G.over = false; G.result = null; startClock(); }
  G.moves = G.moves.slice(0, i); G.aiCount = G.moves.filter((m) => m.by === 'ai').length;
  selected = null; hint = null; rebuild(); hudKey = '';
  save(); draw(); afterMove();
}
function startGame({ start = START_FEN, level = P.level, human = P.side === 'r' ? (rand() < 0.5 ? 'w' : 'b') : P.side, drill = null, mode = drill ? 'ai' : P.opp, play = drill ? 'practice' : P.play } = {}) {
  reqId++; thinking = false; animating = false; stopAuto(); engine.stop(); engine.newGame();
  paused = false; autoPaused = false; resumeWaiters.forEach((f) => f()); resumeWaiters = [];
  if (review != null) exitReview(true);
  if (mode === '2p') human = 'w';
  G = { start, moves: [], human, level, mode, play, undos: 0, aiCount: 0, over: false, result: null, drill, clock: { ms: 0, since: null, pen: 0 } };
  C = new Chess(start); selected = null; hint = null; clockShown = ''; statusShown = ''; hudKey = '';
  hideOverlay(); drillBar(); save(); draw(); tickClock(); afterMove();
  if (mode === 'ai') engine.init(); // start downloading Stockfish while you think about move one
}
function save() { if (G) localStorage.setItem('mtrx-cs1', JSON.stringify({ ...G, clock: { ms: elapsed() - (G.clock.pen || 0), since: null, pen: G.clock.pen || 0 } })); }
function drillBar() { const d = drillDef(); $('#drillBar').hidden = !d; if (d) $('#drillTxt').textContent = `${d.name} · ${d.goal}`; }
$('#drillExit').onclick = () => { G = null; paused = false; autoPaused = false; localStorage.removeItem('mtrx-cs1'); $('#drillBar').hidden = true; showSetup(); };
function resign() { if (!G || G.over || twoP()) return; menu.close(); reqId++; thinking = false; finish(G.human); }

// ---------- overlay cards on the board ----------
function hideOverlay(soft) {
  if (overlay.hidden) return;
  if (soft && !REDUCED) {
    const o = overlay; o.classList.add('leaving');
    setTimeout(() => { if (o.classList.contains('leaving')) { o.hidden = true; o.innerHTML = ''; o.className = 'overlay'; draw(); } }, 360);
    return;
  }
  overlay.hidden = true; overlay.innerHTML = ''; overlay.className = 'overlay';
}
function showOverlay(html, cls = '') { overlay.className = 'overlay' + (cls ? ' ' + cls : ''); overlay.hidden = false; overlay.innerHTML = html; }
function seg(name, opts, cur) { return `<div class="mtrx-segmented" data-seg="${name}">${opts.map(([v, label]) => `<button data-v="${v}" aria-pressed="${String(v) === String(cur)}">${label}</button>`).join('')}</div>`; }
function bindSegs(root, onPick) {
  root.querySelectorAll('[data-seg]').forEach((g) => g.querySelectorAll('button').forEach((b) => (b.onclick = () => {
    g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    onPick(g.dataset.seg, b.dataset.v);
  })));
}
const PLAY_NOTE = { practice: 'Best move (with a plain-English evaluation) and free undos. For learning.', challenge: 'No Best move. Every undo adds 1:00 to your time. Best times count separately.' };
function showSetup() {
  stopAuto();
  const live = G && !G.over;
  if (live) pause('setup');
  if (!G) { // a fresh board behind the card
    G = { start: START_FEN, moves: [], human: P.side === 'b' ? 'b' : 'w', level: P.level, mode: P.opp, play: P.play, undos: 0, aiCount: 0, over: true, result: null, drill: null, clock: { ms: 0, since: null, pen: 0 } };
    C = new Chess(START_FEN); hudKey = ''; drillBar(); draw(); tickClock(); setStatus('');
  }
  showOverlay(`<div class="ov-card" role="dialog" aria-label="New game"><div class="mtrx-label" style="margin:0">MTRX™ Chess</div><h2>New game</h2>
    <div class="row"><div class="mtrx-label">Opponent</div>${seg('opp', [['ai', 'Computer'], ['2p', 'Two players']], P.opp)}<p class="opt-note" data-only="2p">Pass and play on one screen. White moves first.</p></div>
    <div class="row" data-only="ai"><div class="mtrx-label">Difficulty</div>${seg('level', LEVELS.map((l, i) => [i, l.name]), P.level)}<p class="opt-note" id="lvNote">${LEVELS[P.level].note}</p></div>
    <div class="row" data-only="ai"><div class="mtrx-label">Mode</div>${seg('play', [['practice', 'Practice'], ['challenge', 'Challenge']], P.play)}<p class="opt-note" id="plNote">${PLAY_NOTE[P.play]}</p></div>
    <div class="row" data-only="ai"><div class="mtrx-label">You play</div>${seg('side', [['w', 'White · moves first'], ['b', 'Black'], ['r', 'Random']], P.side)}</div>
    <button class="mtrx-btn mtrx-btn--primary go" id="goBtn">Start game</button>
    <div class="sub">${live ? '<button id="ovBack">Back to my game</button>' : '<button id="ovDrills">Try a drill</button>'}<button id="ovLearn">How to play</button></div></div>`);
  const only = () => overlay.querySelectorAll('[data-only]').forEach((el) => (el.hidden = el.dataset.only !== P.opp));
  only();
  bindSegs(overlay, (k, v) => {
    if (k === 'opp') { P.opp = v; only(); }
    if (k === 'level') { P.level = +v; overlay.querySelector('#lvNote').textContent = LEVELS[P.level].note; }
    if (k === 'play') { P.play = v; overlay.querySelector('#plNote').textContent = PLAY_NOTE[P.play]; }
    if (k === 'side') P.side = v;
    savePrefs();
  });
  overlay.querySelector('#goBtn').onclick = () => startGame();
  overlay.querySelector('#ovBack')?.addEventListener('click', () => { hideOverlay(true); resume(); });
  overlay.querySelector('#ovDrills')?.addEventListener('click', () => menu.open(TAB.drills));
  overlay.querySelector('#ovLearn').onclick = () => menu.open(TAB.how);
  if (P.opp === 'ai') engine.init();
}
function showResult() {
  const r = G.result; if (!r) return;
  const best = bestFor_(bestKey());
  const title = resultTitle();
  const pen = challenge() && G.undos ? `<br>Includes ${G.undos} undo penalt${G.undos === 1 ? 'y' : 'ies'} (+${fmt(G.undos * 60000)})` : '';
  const why = r.winner ? (r.st === 'resign' ? '' : '') : `<br>${DRAW_WHY[r.st]}`;
  showOverlay(`<div class="ov-card" role="dialog" aria-label="${title}"><div class="mtrx-label" style="margin:0">${modeLabel()}</div><h2>${title}</h2>
    <div class="big">${fmt(r.time)}</div>
    <p class="note">${Math.ceil(G.moves.length / 2)} moves${r.newBest ? ' · <span class="badge">New best time</span>' : best ? ` · best ${fmt(best)}` : ''}${pen}${why}</p>
    <button class="mtrx-btn mtrx-btn--primary go" id="againBtn">${G.drill ? 'Try the drill again' : 'Play again'}</button>
    <div class="sub"><button id="watchBtn">Watch the replay</button>${r.won || twoP() || r.st === 'resign' || G.drill?.i < 4 ? '' : `<button id="takeBack">Take back a move${challenge() ? ' (+1:00)' : ''}</button>`}<button id="changeBtn">New game</button></div></div>`);
  overlay.querySelector('#againBtn').onclick = () => (G.drill ? startDrill(G.drill.i) : startGame({ level: G.level, human: G.human, mode: G.mode, play: G.play }));
  overlay.querySelector('#watchBtn').onclick = () => { hideOverlay(); autoplay = 0; $('#revPlay').textContent = 'Pause'; startReview(0, true); };
  overlay.querySelector('#takeBack')?.addEventListener('click', undo);
  overlay.querySelector('#changeBtn').onclick = showSetup;
}

// ---------- replay (arrows live here, not in play) ----------
let svgId = 0;
function arrowMarkup(arrows, xs, pt, uid) {
  let s = `<defs>${['m', 'w', 'g', 'bad'].map((k) => `<marker id="ah${uid}${k}" viewBox="0 0 4 4" refX="2.2" refY="2" markerWidth="2.4" markerHeight="2.4" orient="auto"><path class="ah ${k}" d="M0,0L4,2L0,4z"/></marker>`).join('')}</defs>`;
  for (const a of arrows) {
    const pts = a.pts.map((p) => pt(p).join(',')).join(' ');
    s += `<polyline class="arw-ol" points="${pts}"/><polyline class="arw ${a.kind}" points="${pts}" marker-end="url(#ah${uid}${a.kind})"/>`;
  }
  for (const p of xs) {
    const [x, y] = pt(p), k = .17, dd = `M${x - k},${y - k}L${x + k},${y + k}M${x + k},${y - k}L${x - k},${y + k}`;
    s += `<path class="xm-ol" d="${dd}"/><path class="xm" d="${dd}"/>`;
  }
  return s;
}
// a knight's arrow bends like the L it travels; everything else goes straight
function pathOf(from, to) {
  const [f0, r0] = fr(from), [f1, r1] = fr(to), df = Math.abs(f1 - f0), dr = Math.abs(r1 - r0);
  if ((df === 1 && dr === 2) || (df === 2 && dr === 1)) return [from, df > dr ? FILES[f1] + (r0 + 1) : FILES[f0] + (r1 + 1), to];
  return [from, to];
}
const A = (sqs, kind = 'm') => ({ pts: sqs.length === 2 ? pathOf(sqs[0], sqs[1]) : sqs, kind });
const capSqOf = (rec) => (rec.flags.includes('e') ? rec.to[0] + rec.from[1] : rec.to);
function drawBoardArrows(rec) {
  const uid = ++svgId;
  const pt = (sq) => { const [row, col] = scr(sq); return [col + .5, row + .5]; };
  arrowSvg.innerHTML = arrowMarkup([A([rec.from, rec.to], akind(rec.by))], rec.captured ? [capSqOf(rec)] : [], pt, uid);
}
async function startReview(i, auto) {
  if (!G || animating || i < 0 || i >= G.moves.length) return;
  review = i; const tok = ++reviewTok; const rec = G.moves[i];
  $('#reviewBar').hidden = false;
  $('#revTxt').textContent = `Move ${i + 1} of ${G.moves.length} · ${who(rec.by)}: ${describe(rec)}`;
  $('#revPrev').disabled = i === 0; $('#revNext').disabled = i === G.moves.length - 1;
  clearMarks(); arrowSvg.innerHTML = '';
  syncPieces(boardMap(new Chess(rec.before)));
  draw();
  await wait(REDUCED ? 0 : 420); if (tok !== reviewTok) return;
  await animateMove(rec); if (tok !== reviewTok) return;
  sqEl(rec.from).classList.add('last'); sqEl(rec.to).classList.add('last');
  drawBoardArrows(rec);
  if (auto && autoplay !== null) {
    if (i < G.moves.length - 1) autoplay = setTimeout(() => startReview(i + 1, true), ms('replay') || 900);
    else stopAuto();
  }
}
function stopAuto() { if (autoplay) clearTimeout(autoplay); autoplay = null; $('#revPlay').textContent = 'Play'; }
function exitReview(silent) {
  stopAuto(); review = null; reviewTok++;
  $('#reviewBar').hidden = true;
  if (G && C) { syncPieces(boardMap(C)); if (!silent) { draw(); if (G.over) showResult(); } }
}
$('#revPrev').onclick = () => { stopAuto(); startReview(review - 1); };
$('#revNext').onclick = () => { stopAuto(); startReview(review + 1); };
$('#revPlay').onclick = () => {
  if (autoplay !== null) return stopAuto();
  autoplay = 0; $('#revPlay').textContent = 'Pause';
  startReview(review >= G.moves.length - 1 ? 0 : review + 1, true);
};
$('#revLive').onclick = () => exitReview();

// ---------- controls ----------
$('#undoBtn').onclick = undo;
$('#hintBtn').onclick = askHint;
$('#clockBtn').onclick = togglePause;
addEventListener('keydown', (e) => {
  if (e.target.closest('.drawer') || menu.isOpen()) return;
  if (e.key === 'p' || e.key === 'P') { togglePause(); return; }
  if (review != null && e.key === 'ArrowLeft') { stopAuto(); startReview(review - 1); }
  else if (review != null && e.key === 'ArrowRight') { stopAuto(); startReview(review + 1); }
  else if (e.key === 'Escape' && review != null) exitReview();
  else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
});

// ---------- static board pictures for lessons, drills and the move list ----------
function parseFen(fen) { // placement only: [[square, 'wK'], ...]
  const out = []; fen.split(' ')[0].split('/').forEach((row, ri) => {
    let f = 0; for (const ch of row) { if (/\d/.test(ch)) f += +ch; else { out.push([FILES[f] + (8 - ri), (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase()]); f++; } }
  });
  return out;
}
function diagram({ fen, pieces: list = [], arrows = [], x = [], hl = [], ring = [], dots = [], fl = false } = {}) {
  const uid = ++svgId;
  const pos = (sq) => { const [f, r] = fr(sq); return fl ? [r, 7 - f] : [7 - r, f]; }; // [row, col]
  const pt = (sq) => { const [row, col] = pos(sq); return [col + .5, row + .5]; };
  let s = `<svg class="dg" viewBox="0 0 8 8" aria-hidden="true"><defs><pattern id="pt${uid}" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="2" height="2" class="l"/><rect x="1" width="1" height="1" class="d"/><rect y="1" width="1" height="1" class="d"/></pattern></defs><rect width="8" height="8" fill="url(#pt${uid})"/>`;
  for (const h of hl) { const [row, col] = pos(h); s += `<rect x="${col}" y="${row}" width="1" height="1" class="hl"/>`; }
  for (const [sq, code] of fen ? parseFen(fen) : list) { const [row, col] = pos(sq); s += `<image href="${src(code[0], code[1].toLowerCase())}" x="${col + .06}" y="${row + .06}" width=".88" height=".88"/>`; }
  for (const d of dots) { const [cx, cy] = pt(d); s += `<circle class="dot" cx="${cx}" cy="${cy}" r=".15"/>`; }
  for (const g of ring) { const [cx, cy] = pt(g); s += `<circle class="ring" cx="${cx}" cy="${cy}" r=".46"/>`; }
  return s + arrowMarkup(arrows, x, pt, uid) + '</svg>';
}

// ---------- drills ----------
const DRILLS = [
  { kind: 'puzzle', name: 'Back-rank mate', goal: 'White to move. Checkmate in one.', clue: 'The black king is boxed in by its own pawns. Which open line reaches it?', fen: '6k1/5ppp/1n6/8/8/8/5PPP/4R1K1 w - - 0 1' },
  { kind: 'puzzle', name: 'The four-move trap', goal: 'White to move. Checkmate in one.', clue: 'f7 is guarded only by the king, and your bishop is already aiming at it.', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4' },
  { kind: 'puzzle', name: 'Smothered in the corner', goal: 'White to move. Checkmate in one with the knight.', clue: 'The king is walled in by its own rook and pawns. Knights jump walls.', fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1' },
  { kind: 'puzzle', name: 'Queen and king together', goal: 'White to move. Checkmate in one.', clue: 'Your king already covers a7 and b7. Close the back rank.', fen: 'k7/8/1K6/2Q5/8/8/8/8 w - - 0 1' },
  { kind: 'endgame', name: 'King and queen vs king', goal: 'Checkmate the lone king. Box it towards an edge with your queen, then bring your king.', fen: '8/8/8/4k3/8/8/8/4K2Q w - - 0 1' },
  { kind: 'endgame', name: 'King and rook vs king', goal: 'Checkmate with just a rook. Use it as a wall, walk your king up, then mate on the edge.', fen: '8/8/8/3k4/8/8/8/R3K3 w - - 0 1' },
].map((d, i) => ({ ...d, i }));
function startDrill(i) { menu.close(); startGame({ start: DRILLS[i].fen, level: 4, human: 'w', drill: { i } }); }

// ---------- menu drawer: game settings, moves, lessons ----------
const lesson = (n, dg, title, text) => `<div class="lesson vis"><div>${dg}</div><div>${n ? `<span class="mtrx-numeral">${n}</span>` : ''}<h3>${title}</h3><p>${text}</p></div></div>`;
const TAB = { game: 0, moves: 1, how: 2, drills: 5 };
const ring8 = (sq) => { const [f, r] = fr(sq), out = []; for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) { if (!df && !dr) continue; const a = f + df, b = r + dr; if (a >= 0 && a < 8 && b >= 0 && b < 8) out.push(FILES[a] + (b + 1)); } return out; };
const knightSq = (sq) => { const [f, r] = fr(sq); return [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]].map(([a, b]) => [f + a, r + b]).filter(([a, b]) => a >= 0 && a < 8 && b >= 0 && b < 8).map(([a, b]) => FILES[a] + (b + 1)); };
function gameTabHTML() {
  const rows = LEVELS.map((l) => { const p = bestFor_(`mtrx-cs-best:${l.id}`), c = bestFor_(`mtrx-cs-best:${l.id}:c`); return `<tr><td>${l.name}</td><td>${p ? fmt(p) : '–'}</td><td>${c ? fmt(c) : '–'}</td></tr>`; }).join('');
  const theme = document.documentElement.dataset.theme || '';
  const eng = engine.kind === 'stockfish' ? 'Stockfish 19 lite is loaded' : engine.kind === 'stockfish-asm' ? 'Stockfish 19 (compatibility build) is loaded' : engine.kind === 'mini' ? 'Stockfish could not load, so a small built-in engine is playing' : 'Stockfish loads when the computer first needs it';
  return `<div class="set"><button class="mtrx-btn mtrx-btn--primary" style="width:100%" data-act="new">New game</button>${G && !G.over && !twoP() ? '<button class="mtrx-btn mtrx-btn--ghost" style="width:100%;margin-top:8px" data-act="resign">Resign this game</button>' : ''}</div>
    <div class="set"><label class="switch"><span><b>Show legal moves</b><small>Dots on the squares a picked-up piece can go to</small></span><input type="checkbox" data-act="show" ${P.showMoves ? 'checked' : ''}></label></div>
    <div class="set"><div class="mtrx-label">Board</div><div class="styles">${STYLES.map((s) => `<button data-st="${s.id}" aria-pressed="${s.id === P.style}"><i class="sw" style="--l:${s.l};--d:${s.d};--f:${s.f}"></i>${s.name}</button>`).join('')}</div></div>
    <div class="set"><div class="mtrx-label">Animation speed</div>${seg('speed', [['relaxed', 'Relaxed'], ['normal', 'Normal'], ['quick', 'Quick']], P.speed)}</div>
    <div class="set"><div class="mtrx-label">Theme</div>${seg('theme', [['', 'Light'], ['dark', 'Dark']], theme)}</div>
    <div class="set"><div class="mtrx-label">Best times (wins against the computer)</div><table class="bests"><tr><td></td><td class="mtrx-label">Practice</td><td class="mtrx-label">Challenge</td></tr>${rows}</table></div>
    <p class="credits">${eng}. Engine: Stockfish 19 via stockfish.js (GPL-3.0). Rules: chess.js (BSD-2-Clause). Pieces: Chessnut by Alexis Luengas (Apache-2.0). Shell and lessons: Designed by MTRX™.</p>`;
}
function mountGameTab(body) {
  body.querySelector('[data-act="new"]').onclick = () => { menu.close(); showSetup(); };
  body.querySelector('[data-act="resign"]')?.addEventListener('click', resign);
  body.querySelector('[data-act="show"]').onchange = (e) => { P.showMoves = e.target.checked; savePrefs(); draw(); };
  body.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => {
    P.style = b.dataset.st; savePrefs(); document.body.dataset.board = P.style;
    body.querySelectorAll('[data-st]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  bindSegs(body, (k, v) => { if (k === 'theme') { applyTheme(v); localStorage.setItem('mtrx-theme', v); } if (k === 'speed') { P.speed = v; savePrefs(); } });
}
function movesTabHTML() {
  if (!G || !G.moves.length) return '<p class="empty">Every move shows up here as a picture with a plain-English description. Tap one to watch it again on the big board.</p>';
  return `<p class="empty" style="margin-top:0">Newest first. Tap a move to replay it with arrows.</p><div class="moves">${G.moves.map((m, i) => ({ m, i })).reverse().map(({ m, i }) =>
    `<button class="mcard" data-i="${i}" aria-label="Replay move ${i + 1}">${diagram({ fen: m.before, arrows: [A([m.from, m.to], akind(m.by))], x: m.captured ? [capSqOf(m)] : [], fl: flip() })}
      <span><b>${Math.floor(i / 2) + 1}${m.color === 'w' ? '.' : '…'} ${who(m.by)}<span class="san">${m.san}</span></b><small>${describe(m)}</small></span></button>`).join('')}</div>`;
}
const VALUES_HTML = `<div class="values">${['p', 'n', 'b', 'r', 'q'].map((t) => `<div><img alt="" src="${src('w', t)}"><b>${VALUE[t]}</b><small>${NAME[t]}</small></div>`).join('')}</div>`;
const menu = mountLearn({
  title: 'Chess', label: 'Menu',
  onOpen: () => { if (running()) { pause('menu'); autoPaused = true; } },
  onClose: () => { if (autoPaused) resume(); },
  tabs: [
    { name: 'Game', get html() { return gameTabHTML(); }, mount: mountGameTab },
    { name: 'Moves', get html() { return movesTabHTML(); }, mount: (body) => body.querySelectorAll('.mcard').forEach((b) => (b.onclick = () => { menu.close(); hideOverlay(); startReview(+b.dataset.i); })) },
    { name: 'How to play', html: `
      ${lesson('01', diagram({ fen: START_FEN }), 'Set up', 'White moves first. The board always has a light square in the bottom-right corner, and each queen starts on her own colour.')}
      ${lesson('02', diagram({ pieces: [['e4', 'wK']], dots: ring8('e4') }), 'King', 'One square in any direction. It can never move into check. Protect it above everything.')}
      ${lesson('03', diagram({ pieces: [['d4', 'wQ']], arrows: [A(['d4', 'd8']), A(['d4', 'h8']), A(['d4', 'h4']), A(['d4', 'g1']), A(['d4', 'd1']), A(['d4', 'a1']), A(['d4', 'a4']), A(['d4', 'a7'])] }), 'Queen', 'Any distance in a straight line or a diagonal. The strongest piece on the board.')}
      ${lesson('04', diagram({ pieces: [['d4', 'wR']], arrows: [A(['d4', 'd8']), A(['d4', 'h4']), A(['d4', 'd1']), A(['d4', 'a4'])] }), 'Rook', 'Any distance up, down or sideways. Rooks love open files with no pawns in the way.')}
      ${lesson('05', diagram({ pieces: [['d4', 'wB']], arrows: [A(['d4', 'h8']), A(['d4', 'g1']), A(['d4', 'a1']), A(['d4', 'a7'])] }), 'Bishop', 'Any distance diagonally. It stays on its starting colour for the whole game.')}
      ${lesson('06', diagram({ pieces: [['d4', 'wN'], ['d5', 'bP'], ['e4', 'bP']], dots: knightSq('d4'), arrows: [A(['d4', 'e6'], 'g')] }), 'Knight', 'An L: two squares one way, then one to the side. The only piece that jumps over others.')}
      ${lesson('07', diagram({ pieces: [['e2', 'wP'], ['c4', 'wP'], ['d5', 'bP']], arrows: [A(['e2', 'e4']), A(['c4', 'd5'], 'g')], x: ['d5'] }), 'Pawn', 'Forward one square, or two on its very first move. It captures one square diagonally forward.')}
      ${lesson('08', diagram({ pieces: [['e1', 'wK'], ['h1', 'wR'], ['a1', 'wR'], ['f2', 'wP'], ['g2', 'wP'], ['h2', 'wP']], arrows: [A(['e1', 'g1']), A(['h1', 'f1'], 'g')] }), 'Castling', 'Once a game: the king slides two squares towards a rook and the rook hops over. Only if neither has moved, nothing is between them, and the king is not in, through or into check. Drag or tap the king two squares.')}
      ${lesson('09', diagram({ pieces: [['e5', 'wP'], ['d5', 'bP']], arrows: [A(['d7', 'd5'], 'w'), A(['e5', 'd6'])], x: ['d5'] }), 'En passant', 'When an enemy pawn rushes two squares and lands right beside yours, you may take it as if it had moved one. Only on the very next move.')}
      ${lesson('10', diagram({ pieces: [['e7', 'wP']], arrows: [A(['e7', 'e8'])], ring: ['e8'] }), 'Promotion', 'A pawn that reaches the far side becomes a queen, rook, bishop or knight. You choose.')}
      ${lesson('11', diagram({ pieces: [['g8', 'bK'], ['f7', 'bP'], ['g7', 'bP'], ['h7', 'bP'], ['e8', 'wR'], ['g1', 'wK']], ring: ['g8'], hl: ['f8', 'h8'] }), 'Check and checkmate', 'Check: the king is attacked and you must deal with it. Checkmate: there is no way out, and the game is over.')}
      ${lesson('12', diagram({ pieces: [['a8', 'bK'], ['b6', 'wQ'], ['d5', 'wK']], ring: ['a8'], hl: ['a7', 'b7', 'b8'] }), 'Stalemate and draws', 'No legal move but not in check is stalemate, a draw. Also drawn: the same position three times, 50 moves each with no capture or pawn move, or too little material to mate.')}
      <h3>Ways to play</h3>
      <div class="lesson"><b>Practice</b><p style="margin:6px 0 0">Best move shows Stockfish's pick with pulsing squares, and tells you in plain words who is better. Undo is free.</p></div>
      <div class="lesson"><b>Challenge</b><p style="margin:6px 0 0">No Best move. Each undo adds 1:00 to your clock. Wins go on a separate best-times board.</p></div>
      <div class="lesson"><b>Two players</b><p style="margin:6px 0 0">Pass and play on one screen. Undo takes back one move. Best move helps whoever is to move.</p></div>
      <div class="lesson"><b>Pause</b><p style="margin:6px 0 0">Tap the clock (or press <kbd>P</kbd>). Opening the menu or leaving the tab pauses on its own, and the board hides until you resume.</p></div>
      <h3>The five levels</h3>${LEVELS.map((l) => `<div class="lesson"><b>${l.name}</b><p style="margin:6px 0 0">${l.note}</p></div>`).join('')}
      <p class="credits">Ratings are rough guides. Stockfish weakens itself on the lower levels; the random blunders and opening choices on top come from your device's secure random generator.</p>` },
    { name: 'Strategy', html: `
      ${lesson('01', diagram({ fen: START_FEN, arrows: [A(['e2', 'e4']), A(['d2', 'd4'])], hl: ['d4', 'e4', 'd5', 'e5'] }), 'Fight for the centre', 'Pawns on e4 and d4 give your pieces room and take squares away from your opponent.')}
      ${lesson('02', diagram({ fen: START_FEN, arrows: [A(['g1', 'f3']), A(['b1', 'c3']), A(['f1', 'c4'], 'g'), A(['c1', 'f4'], 'g')] }), 'Develop, then attack', 'Bring knights and bishops out in the first few moves. Don\'t move the same piece twice without a reason.')}
      ${lesson('03', diagram({ pieces: [['g1', 'wK'], ['f1', 'wR'], ['f2', 'wP'], ['g2', 'wP'], ['h2', 'wP']], ring: ['g1'] }), 'Castle early', 'A castled king hides behind pawns and connects your rooks. Most strong players castle in the first ten moves.')}
      ${lesson('04', diagram({ pieces: [['h5', 'wQ'], ['f6', 'bN'], ['g6', 'bP'], ['e8', 'bK']], arrows: [A(['f6', 'h5'], 'bad'), A(['g6', 'h5'], 'bad')] }), 'Don\'t rush the queen out', 'An early queen gets chased around by minor pieces and pawns, and you lose time while they develop.')}
      <div class="lesson"><span class="mtrx-numeral">05</span><h3>What the pieces are worth</h3><p>Count before you trade. A knight for a rook is a good deal; your queen for a bishop is not.</p>${VALUES_HTML}</div>
      ${lesson('06', diagram({ pieces: [['d1', 'wR'], ['g1', 'wK'], ['a2', 'wP'], ['f2', 'wP'], ['g2', 'wP'], ['a7', 'bP'], ['f7', 'bP'], ['g8', 'bK']], arrows: [A(['d1', 'd8'])] }), 'Rooks on open files', 'A rook on a file with no pawns reaches all the way into enemy territory. Doubled rooks are even stronger.')}
      ${lesson('07', diagram({ pieces: [['e4', 'wK'], ['d4', 'wP'], ['e6', 'bK']], dots: ring8('e4') }), 'Endgame: the king fights', 'Once queens are off, the king is a strong piece. March it to the centre and use it to push passed pawns.')}` },
    { name: 'Tactics', html: `
      ${lesson('08', diagram({ pieces: [['c7', 'wN'], ['e8', 'bK'], ['a8', 'bR']], arrows: [A(['c7', 'e8']), A(['c7', 'a8'])] }), 'The fork', 'One piece attacks two at once. Knights are the best forkers because nothing can block them.')}
      ${lesson('09', diagram({ pieces: [['b5', 'wB'], ['c6', 'bN'], ['e8', 'bK']], arrows: [A(['b5', 'e8'])], ring: ['c6'] }), 'The pin', 'The knight can\'t move, because the king behind it would be in check. Pile up on pinned pieces.')}
      ${lesson('10', diagram({ pieces: [['a5', 'wR'], ['e5', 'bK'], ['h5', 'bQ']], arrows: [A(['a5', 'h5'])], ring: ['h5'] }), 'The skewer', 'Check the king. When it steps out of the way, take the piece standing behind it.')}
      ${lesson('11', diagram({ pieces: [['b2', 'wB'], ['d4', 'wN'], ['h8', 'bR'], ['d6', 'bQ']], arrows: [A(['d4', 'f5']), A(['b2', 'h8'], 'g')], ring: ['h8'] }), 'Discovered attack', 'Move one piece out of the way and the piece behind it attacks. The moving piece can make a threat of its own.')}
      ${lesson('12', diagram({ pieces: [['g8', 'bK'], ['f7', 'bP'], ['g7', 'bP'], ['h7', 'bP'], ['e1', 'wR'], ['g1', 'wK']], arrows: [A(['e1', 'e8'])] }), 'Back-rank mate', 'A king boxed in by its own pawns. Give yours an escape square early with a pawn move like h3.')}
      ${lesson('13', diagram({ pieces: [['h5', 'wQ'], ['c4', 'wB'], ['f7', 'bP'], ['e8', 'bK']], arrows: [A(['h5', 'f7']), A(['c4', 'f7'], 'g')], ring: ['f7'] }), 'Watch f7 and f2', 'Early on, f7 is guarded only by the king. Two pieces aiming there can mean mate. Guard it with a knight on f6.')}` },
    { name: 'Drills', html: `<p>Real positions. Puzzles take only the mating move; endgames are against full Stockfish. You play White, moving up.</p>${DRILLS.map((d) => lesson(String(d.i + 1).padStart(2, '0'), diagram({ fen: d.fen }), d.name, `${d.goal}<br><button class="mtrx-btn mtrx-btn--primary sm" style="margin-top:10px" data-drill="${d.i}">${d.kind === 'puzzle' ? 'Solve it' : 'Start drill'}</button>`)).join('')}`,
      mount: (body) => body.querySelectorAll('[data-drill]').forEach((b) => (b.onclick = () => startDrill(+b.dataset.drill))) },
  ],
});
$('#learnBtn').onclick = () => menu.open(TAB.how);
$('#menuBtn').onclick = () => menu.open(TAB.game);

// ---------- boot: load the rules library, then resume a game or show the setup card ----------
(async () => {
  let lib = null;
  for (const u of LIBS) { try { lib = await import(u); break; } catch { /* next */ } }
  if (!lib?.Chess) { setStatus('Could not load the chess rules library. Check your connection and refresh.', 'lose'); return; }
  Chess = lib.Chess;
  try {
    const g = JSON.parse(localStorage.getItem('mtrx-cs1') || 'null');
    if (g && g.start && Array.isArray(g.moves) && !g.over) {
      G = { mode: 'ai', play: 'practice', undos: 0, aiCount: 0, ...g, clock: { ms: g.clock?.ms || 0, since: null, pen: g.clock?.pen || 0 } };
      if (G.drill && !DRILLS[G.drill.i]) G.drill = null;
      rebuild(); drillBar(); draw(); tickClock();
      if (G.mode === 'ai') engine.init();
      if (G.moves.length) { afterMove(); pause('back'); return; } // come back to a paused card, clock stopped
      afterMove(); return;
    }
  } catch { /* corrupted save: start fresh */ }
  G = null; showSetup();
})();
