// MTRX™ Arcade · Go v1. Engine: JavaScript port of Michi by Petr Baudiš (MIT) in js/go-engine.js.
// Chinese (area) rules, positional superko in real games, komi 7.5. Shell, levels and lessons: Designed by MTRX™
import { WORDMARK } from './wordmark.js?v=5';
import { mountLearn, rand } from './learn.js?v=5';
import { applyTheme } from './theme.js?v=5';
import { createGo } from './go-engine.js?v=6';

const $ = (s) => document.querySelector(s);
$('#home').innerHTML = WORDMARK;
const LEVELS = [
  { id: 'easy', name: 'Easy', note: 'Searches 25 playouts a move and plays a random move 4 times in 10. For your very first games.' },
  { id: 'medium', name: 'Medium', note: '200 playouts a move, with a random slip 1 time in 10. Punishes stones left in atari.' },
  { id: 'intermediate', name: 'Intermediate', note: '800 playouts a move and no slips. Reads short ladders and fights back.' },
  { id: 'hard', name: 'Hard', note: '3,000 playouts a move (up to about 6 seconds). Varies its first moves, then plays its best.' },
  { id: 'expert', name: 'Expert', note: '9,000 playouts a move (up to about 10 seconds). The full engine. Resigns when it is clearly lost.' },
];
const STYLES = [
  { id: 'kaya', name: 'Kaya', b: '#DDB56A', l: '#3B2A12', f: '#6B4A22' },
  { id: 'bamboo', name: 'Bamboo', b: '#E8D3A2', l: '#4A3A1C', f: '#8A6A33' },
  { id: 'slate', name: 'Slate', b: '#55606B', l: '#C9D1D9', f: '#2B3138' },
  { id: 'mtrx', name: 'MTRX', b: '#ECEAE4', l: '#0E0E0C', f: '#0E0E0C' },
];
const COLS = 'ABCDEFGHJKLMNOPQRST';
const KOMI = 7.5;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SPEEDS = { relaxed: 1, normal: .72, quick: .48 };
const T = { place: 520, fade: 640, pre: 420, ai: 800, replay: 1300 };
const ms = (k) => (REDUCED ? 0 : Math.round(T[k] * (SPEEDS[P.speed] || 1)));
const wait = (t) => new Promise((r) => setTimeout(r, t));
const fmt = (t) => { const s = Math.floor(t / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const other = (c) => (c === 'B' ? 'W' : 'B');
const cname = (c) => (c === 'B' ? 'Black' : 'White');

// ---------- preferences ----------
const P = Object.assign({ level: 0, size: 9, opp: 'ai', play: 'practice', side: 'B', style: 'kaya', speed: 'relaxed', coords: true, confirm: false }, JSON.parse(localStorage.getItem('mtrx-go-prefs') || 'null') || {});
P.level = Math.min(4, Math.max(0, +P.level || 0)); if (![9, 13, 19].includes(+P.size)) P.size = 9; P.size = +P.size;
if (P.opp !== '2p') P.opp = 'ai'; if (P.play !== 'challenge') P.play = 'practice'; if (!['B', 'W', 'r'].includes(P.side)) P.side = 'B';
if (!STYLES.some((s) => s.id === P.style)) P.style = 'kaya'; if (!SPEEDS[P.speed]) P.speed = 'relaxed';
const savePrefs = () => localStorage.setItem('mtrx-go-prefs', JSON.stringify(P));
document.body.dataset.board = P.style;

// ---------- state ----------
let G = null; // { N, mode, level, play, human, moves:[{c,color,caps,by}], start, over, result, undos, aiMoves, drill, phase, dead, clock }
let go = null, pos = null, history = [], hashes = new Set();
let thinking = false, animating = false, paused = false, autoPaused = false, reqId = 0, hint = null, ghostAt = -1, armed = -1;
let review = null, reviewTok = 0, autoplay = null;
const busy = () => thinking || animating || paused;
const twoP = () => G?.mode === '2p';
const challenge = () => G?.play === 'challenge' && !twoP() && !G?.drill;
const toPlay = () => (pos.n % 2 === 0 ? 'B' : 'W');
const humanTurn = () => twoP() || toPlay() === G.human;
const drillDef = () => (G?.drill ? DRILLS[G.drill.i] : null);
const aiName = () => (G?.drill ? 'Drill' : LEVELS[G.level].name);

// ---------- clock ----------
const elapsed = () => (G ? G.clock.ms + (G.clock.pen || 0) + (G.clock.since ? Date.now() - G.clock.since : 0) : 0);
const startClock = () => { if (G && !G.clock.since && !G.over && !paused) G.clock.since = Date.now(); };
const stopClock = () => { if (G?.clock.since) { G.clock.ms += Date.now() - G.clock.since; G.clock.since = null; } };
const bestKey = () => (twoP() ? null : G.drill ? `mtrx-go-best:drill${G.drill.i}` : `mtrx-go-best:${G.N}:${LEVELS[G.level].id}${challenge() ? ':c' : ''}`);
const bestOf = (k) => (k ? +(localStorage.getItem(k) || 0) : 0);
let clockShown = '';
function tickClock() { if (!G) return; const t = fmt(elapsed()); if (t !== clockShown) { $('#clock').textContent = t; clockShown = t; } }
function penaltyFlash(text) { const pen = $('#pen'), btn = $('#clockBtn'); tickClock(); pen.textContent = text; pen.classList.remove('go'); btn.classList.remove('hit'); void pen.offsetWidth; pen.classList.add('go'); btn.classList.add('hit'); }
setInterval(tickClock, 250);
document.addEventListener('visibilitychange', () => { if (document.hidden && running()) { autoPaused = false; pause('away'); } });
addEventListener('pagehide', () => save());

// ---------- pause ----------
const overlay = $('#overlay');
const running = () => G && pos && !G.over && !paused && review == null && overlay.hidden;
const resumeWaiters = [];
const untilRunning = () => (paused ? new Promise((r) => resumeWaiters.push(r)) : Promise.resolve());
function pause(why = 'button') {
  if (!G || G.over || paused) return;
  paused = true; stopClock(); save();
  if (why !== 'menu' && why !== 'setup') showPause(why);
  draw();
}
function resume() {
  if (!paused) return;
  paused = false; autoPaused = false;
  if (overlay.classList.contains('pause')) hideOverlay(true);
  if (G && G.moves.length) startClock();
  resumeWaiters.splice(0).forEach((f) => f());
  draw();
  if (G && !G.over && !busy() && G.phase === 'play') afterMove();
}
function togglePause() { if (paused) resume(); else if (running()) pause('button'); }
const modeLabel = () => `${twoP() ? 'Two players' : G.drill ? drillDef().name : LEVELS[G.level].name} · ${G.N}×${G.N}${challenge() ? ' · Challenge' : ''}`;
function showPause(why) {
  const title = why === 'back' ? 'Welcome back' : 'Paused';
  showOverlay(`<div class="ov-card" role="dialog" aria-label="${title}"><div class="mtrx-label" style="margin:0">${modeLabel()}</div><h2>${title}</h2>
    <div class="big">${fmt(elapsed())}</div><p class="note">The clock is stopped and the board is hidden.</p>
    <button class="mtrx-btn mtrx-btn--primary go" id="resumeBtn">Resume</button><p class="hint-line">Tip: tap the clock or press P to pause any time</p></div>`, 'pause');
  overlay.querySelector('#resumeBtn').onclick = resume;
}

// ---------- positions ----------
const rc = (c) => [Math.floor(c / go.W) - 1, (c % go.W) - 1];
const pt = (row, col) => (row + 1) * go.W + col + 1;
const label = (c) => { if (c < 0) return 'pass'; const [r, k] = rc(c); return COLS[k] + (G.N - r); };
const absAt = (p, c) => { const v = p.b[c]; if (v !== 1 && v !== 2) return ''; const tp = p.n % 2 === 0 ? 'B' : 'W'; return v === 1 ? tp : other(tp); };
const hashOf = (p) => { let s = ''; for (const c of go.POINTS) { const a = absAt(p, c); s += a === 'B' ? '1' : a === 'W' ? '2' : '0'; } return s; };
const serial = (p) => ({ ...p, b: Array.from(p.b) });
function startPos() {
  const p = go.emptyPosition(KOMI);
  if (G.start) { for (const s of G.start.B) p.b[pt(...s)] = 1; for (const s of G.start.W) p.b[pt(...s)] = 2; }
  return p;
}
function rebuild() {
  go = createGo(G.N); pos = startPos(); history = [pos]; hashes = new Set([hashOf(pos)]);
  for (const m of G.moves) { pos = m.c < 0 ? go.passMove(pos) : go.move(pos, m.c) || go.passMove(pos); history.push(pos); hashes.add(hashOf(pos)); }
}
// try a move for the player to move; returns { next, caps } or { err }
function tryPlay(c) {
  if (c < 0) return { next: go.passMove(pos), caps: [] };
  if (pos.b[c] !== 0) return { err: 'That point is taken' };
  const next = go.move(pos, c);
  if (!next) return { err: c === pos.ko ? 'Ko: you can\'t retake straight away. Play somewhere else first' : 'No liberties there: that would be suicide' };
  if (hashes.has(hashOf(next))) return { err: 'That would repeat an earlier position (ko rule)' };
  const caps = go.POINTS.filter((p) => pos.b[p] === 2 && next.b[p] === 0);
  return { next, caps };
}

// ---------- board drawing (one SVG: grid, territory, stones, marks) ----------
const boardEl = $('#board'), svg = $('#gsvg');
const SVGNS = 'http://www.w3.org/2000/svg';
const HOSHI = { 9: [2, 4, 6], 13: [3, 6, 9], 19: [3, 9, 15] };
let geo = { key: '', m: 1, size: 10 };
const xy = (c) => { const [r, k] = rc(c); return [geo.m + k, geo.m + r]; };
const el = (tag, attrs = {}, cls = '') => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (cls) e.setAttribute('class', cls); return e; };
let gridG, terrG, stoneG, markG;
function buildGrid() {
  const N = G.N, key = `${N}|${P.coords}`;
  if (geo.key === key) return;
  const m = P.coords ? 1.15 : 0.75, size = 2 * m + N - 1; geo = { key, m, size };
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.innerHTML = `<defs><radialGradient id="gB" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#6a6a6a"/><stop offset=".45" stop-color="#1c1c1c"/><stop offset="1" stop-color="#050505"/></radialGradient>
    <radialGradient id="gW" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#F1EDE4"/><stop offset="1" stop-color="#C9C2B4"/></radialGradient></defs>`;
  gridG = el('g'); terrG = el('g'); stoneG = el('g'); markG = el('g');
  const lo = m, hi = m + N - 1;
  for (let i = 0; i < N; i++) {
    const edge = i === 0 || i === N - 1 ? 'gl edge' : 'gl';
    gridG.append(el('line', { x1: lo, y1: m + i, x2: hi, y2: m + i }, edge), el('line', { x1: m + i, y1: lo, x2: m + i, y2: hi }, edge));
  }
  for (const r of HOSHI[N] || []) for (const k of HOSHI[N]) { if (N === 9 && (r === 4) !== (k === 4)) continue; gridG.append(el('circle', { cx: m + k, cy: m + r, r: N === 19 ? 0.12 : 0.1 }, 'hoshi')); }
  if (P.coords) for (let i = 0; i < N; i++) {
    const a = el('text', { x: m + i, y: size - m / 2.2 }, 'coord'); a.textContent = COLS[i];
    const n = el('text', { x: m / 2.2, y: m + i }, 'coord'); n.textContent = String(N - i);
    gridG.append(a, n);
  }
  svg.append(gridG, terrG, stoneG, markG);
  stones.clear();
}
const stones = new Map(); // point -> { g, color }
function stoneEl(c, color, fresh) {
  const [x, y] = xy(c), g = el('g', {}, 'st' + (fresh && !REDUCED ? ' in' : ''));
  g.style.setProperty('--place', ms('place') + 'ms'); g.style.setProperty('--fade', ms('fade') + 'ms');
  g.append(el('circle', { cx: x, cy: y, r: 0.47, fill: color === 'B' ? 'url(#gB)' : 'url(#gW)', stroke: color === 'B' ? '#000' : '#9b9384', 'stroke-width': 0.02 }, 'body'));
  return g;
}
function syncStones(p, { animate = true } = {}) { // reconcile the stone layer with a position
  const want = new Map(); for (const c of go.POINTS) { const a = absAt(p, c); if (a) want.set(c, a); }
  for (const [c, s] of stones) if (want.get(c) !== s.color) {
    stones.delete(c);
    if (animate && !REDUCED) { s.g.classList.remove('in'); s.g.classList.add('out'); const [x, y] = xy(c); const ring = el('circle', { cx: x, cy: y, r: 0.42 }, 'ring'); markG.append(ring); setTimeout(() => ring.remove(), 2300); setTimeout(() => s.g.remove(), ms('fade') + 60); }
    else s.g.remove();
  }
  for (const [c, color] of want) if (!stones.has(c)) { const g = stoneEl(c, color, animate); stoneG.append(g); stones.set(c, { g, color }); }
}
const shownPos = () => (review != null ? history[review + 1] : pos);
function draw() {
  if (!G || !pos) return;
  buildGrid();
  const p = shownPos();
  syncStones(p, { animate: !drawQuiet });
  // marks: dead stones, territory, last move, hint, ghost
  for (const ch of [...markG.children]) if (!ch.classList.contains('ring')) ch.remove();
  terrG.innerHTML = '';
  const deadSet = new Set(G.phase === 'score' && review == null ? G.dead || [] : []);
  for (const [c, s] of stones) s.g.classList.toggle('dead', deadSet.has(c));
  if (G.phase === 'score' && review == null && G.count) {
    for (const [c, who] of G.count.terr) { const [x, y] = xy(c); terrG.append(el('rect', { x: x - 0.17, y: y - 0.17, width: 0.34, height: 0.34, rx: 0.04 }, 'terr ' + who.toLowerCase())); }
  }
  const mi = review != null ? review : G.moves.length - 1, lm = G.moves[mi];
  if (lm && lm.c >= 0 && stones.has(lm.c) && !(G.phase === 'score' && review == null)) { const [x, y] = xy(lm.c); markG.append(el('circle', { cx: x, cy: y, r: 0.2, stroke: lm.color === 'B' ? '#F4E3B2' : '#ED691D' }, 'last')); }
  if (review == null && hint != null && hint >= 0) { const [x, y] = xy(hint); markG.append(el('circle', { cx: x, cy: y, r: 0.36 }, 'hintpt')); }
  const myTurn = canInput() && G.phase === 'play';
  const gp = armed >= 0 ? armed : ghostAt;
  if (myTurn && gp >= 0 && pos.b[gp] === 0) { const [x, y] = xy(gp); markG.append(el('circle', { cx: x, cy: y, r: 0.45, fill: toPlay() === 'B' ? '#111' : '#F7F4ED', stroke: '#777', 'stroke-width': 0.02 }, 'ghost')); }
  if (aiGhost >= 0 && review == null) { const [x, y] = xy(aiGhost); const g = el('circle', { cx: x, cy: y, r: 0.45, fill: toPlay() === 'B' ? '#111' : '#F7F4ED' }, 'ghost ai'); g.style.setProperty('--pre', ms('pre') + 'ms'); markG.append(g); }
  drawHud();
  const scoring = G.phase === 'score';
  $('#undoBtn').disabled = animating || paused || review != null || !G.moves.some((m) => m.by !== 'ai') || !!(G.drill && G.over);
  $('#passBtn').disabled = busy() || G.over || review != null || !humanTurn() || scoring || !!G.drill;
  $('#hintBtn').disabled = busy() || G.over || review != null || !humanTurn() || scoring;
  const ch = challenge();
  $('#hintBtn').hidden = ch; $('.actions').classList.toggle('three', !ch);
  $('#undoBtn').innerHTML = ch ? 'Undo<small>+1:00</small>' : 'Undo';
  const cb = $('#clockBtn'); cb.disabled = G.over || review != null || (!overlay.hidden && !paused);
  cb.classList.toggle('paused', paused); cb.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
  $('#pz').innerHTML = paused ? '<path d="M7 4.5v15l12-7.5z"/>' : '<path d="M6.5 4.5h3.6v15H6.5zM13.9 4.5h3.6v15h-3.6z"/>';
  $('#scoreBar').hidden = !(scoring && review == null && !G.over && G.count);
}
let drawQuiet = false;
const quietDraw = () => { drawQuiet = true; draw(); drawQuiet = false; };
const capsBy = (color) => G.moves.reduce((s, m) => s + (m.color === color ? m.caps : 0), 0);
let hudKey = '';
function drawHud() {
  const h = twoP() ? 'B' : G.human, o = other(h);
  const key = `${G.moves.length}|${h}|${G.mode}|${G.level}|${!!G.drill}|${G.N}`;
  if (key !== hudKey) {
    hudKey = key;
    $('#youChip').className = 'gchip ' + h.toLowerCase(); $('#aiChip').className = 'gchip ' + o.toLowerCase();
    const tr = (c) => { const n = capsBy(c); return `${n ? `${n} captured` : 'No captures'}${c === 'W' ? ` · +${KOMI} komi` : ''}`; };
    $('#trayYou').textContent = tr(h); $('#trayAi').textContent = tr(o);
    $('#youName').textContent = twoP() ? cname(h) : `You · ${cname(h)}`;
    $('#aiName').textContent = twoP() ? cname(o) : G.drill ? 'Drill' : `${LEVELS[G.level].name} · ${cname(o)}`;
  }
  const t = toPlay(), turnYou = !G.over && G.phase === 'play' && t === h;
  $('#hudYou').classList.toggle('turn', turnYou); $('#hudAi').classList.toggle('turn', !G.over && G.phase === 'play' && !turnYou);
  const best = bestOf(bestKey());
  $('#clockSub').textContent = paused ? 'Paused' : twoP() ? 'Two players' : `${challenge() ? 'Challenge · ' : ''}${best ? `Best ${fmt(best)}` : 'No best yet'}`;
}
let statusShown = '', statusCls = '';
function setStatus(t, cls = '') { const s = $('#status'); if (t === statusShown && cls === statusCls) return; statusShown = t; statusCls = cls; s.textContent = t; s.className = 'status-line ' + cls; if (t) { void s.offsetWidth; s.classList.add('fade'); } }
function shake() { boardEl.classList.remove('shake'); void boardEl.offsetWidth; boardEl.classList.add('shake'); }

// ---------- input: tap a point (optionally tap again to confirm) ----------
let aiGhost = -1;
const canInput = () => G && pos && !busy() && !G.over && review == null && overlay.hidden && (humanTurn() || G.phase === 'score');
const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
function pointFrom(e) {
  const r = svg.getBoundingClientRect(); if (!r.width) return -1;
  const x = ((e.clientX - r.left) / r.width) * geo.size - geo.m, y = ((e.clientY - r.top) / r.height) * geo.size - geo.m;
  const k = Math.round(x), row = Math.round(y);
  if (k < 0 || row < 0 || k >= G.N || row >= G.N || Math.abs(x - k) > 0.48 || Math.abs(y - row) > 0.48) return -1;
  return pt(row, k);
}
boardEl.addEventListener('pointermove', (e) => { if (!FINE || !G || !pos) return; const c = canInput() && G.phase === 'play' ? pointFrom(e) : -1; if (c !== ghostAt) { ghostAt = c; quietDraw(); } });
boardEl.addEventListener('pointerleave', () => { if (ghostAt >= 0) { ghostAt = -1; quietDraw(); } });
boardEl.addEventListener('pointerup', (e) => { if (e.button > 0) return; const c = pointFrom(e); if (c >= 0) onTap(c); });
function onTap(c) {
  if (!canInput()) return;
  if (G.phase === 'score') return toggleDead(c);
  const r = tryPlay(c);
  if (r.err) { armed = -1; setStatus(r.err, 'lose'); shake(); quietDraw(); return; }
  const d = drillDef();
  if (d) {
    if (!d.ans.includes(label(c))) { G.drill.tries = (G.drill.tries || 0) + 1; setStatus(`Not that one. ${d.clue}`, 'lose'); shake(); return; }
  }
  if (P.confirm && !FINE && armed !== c) { armed = c; setStatus(`Tap ${label(c)} again to place your stone`); quietDraw(); return; }
  armed = -1; ghostAt = -1;
  doMove(c, twoP() ? toPlay() : 'you', r);
}
async function doMove(c, by, r = tryPlay(c)) {
  if (r.err) return false;
  const color = toPlay();
  G.moves.push({ c, color, caps: r.caps.length, by }); if (by === 'ai') G.aiMoves++;
  pos = r.next; history.push(pos); if (c >= 0) hashes.add(hashOf(pos));
  hint = null; aiGhost = -1; animating = true; startClock();
  draw();
  await wait(c < 0 ? 200 : ms('place') + (r.caps.length ? ms('fade') * 0.6 : 0));
  animating = false; save(); quietDraw();
  if (G.drill) { finish({ st: 'solved', winner: G.human }); return true; }
  afterMove();
  return true;
}
const said = (m) => (m.c < 0 ? 'passed' : `played ${label(m.c)}${m.caps ? `, capturing ${m.caps} stone${m.caps > 1 ? 's' : ''}` : ''}`);
const whoSaid = (m) => (m.by === 'ai' ? aiName() : m.by === 'you' ? 'You' : cname(m.color));
function afterMove() {
  if (!G || G.over) return;
  const n = G.moves.length;
  if (G.phase === 'score') return beginScoring();
  if (n >= 2 && G.moves[n - 1].c < 0 && G.moves[n - 2].c < 0) return beginScoring();
  if (paused) return quietDraw();
  if (!twoP() && toPlay() !== G.human) { if (!thinking) aiTurn(); return; }
  const last = G.moves[n - 1], d = drillDef();
  let msg;
  if (d) msg = d.goal;
  else if (!last) msg = twoP() ? 'Black to play. Tap any point' : G.human === 'B' ? 'You are Black and move first. Tap any point' : 'Your move';
  else {
    const you = twoP() ? `${cname(toPlay())} to play` : 'your move';
    msg = `${whoSaid(last)} ${said(last)} · ${you}`;
    if (last.c < 0) msg = `${whoSaid(last)} passed. Pass too and the game ends and gets counted, or keep playing`;
  }
  setStatus(msg.charAt(0).toUpperCase() + msg.slice(1)); quietDraw();
}
function humanPass() {
  if (!G || busy() || G.over || review != null || !humanTurn() || G.phase !== 'play' || G.drill) return;
  armed = -1; doMove(-1, twoP() ? toPlay() : 'you');
}

// ---------- AI (in a worker; falls back to this thread) ----------
let worker = null, workerDead = false, wid = 0; const pending = new Map();
function ask(msg) {
  if (!worker && !workerDead && typeof Worker !== 'undefined') {
    try {
      worker = new Worker(new URL('./go-worker.js?v=6', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => { const f = pending.get(data.id); if (f) { pending.delete(data.id); f(data); } };
      worker.onerror = () => { workerDead = true; worker = null; for (const [, f] of pending) f({ error: 'worker' }); pending.clear(); };
    } catch { workerDead = true; worker = null; }
  }
  if (worker) return new Promise((res) => { const id = ++wid; pending.set(id, (d) => (d.error ? res(local(msg)) : res(d))); worker.postMessage({ ...msg, id }); });
  return local(msg);
}
async function local(msg) { // same work on the main thread (slower, but always works)
  const ai = await import('./go-ai.js?v=6'); await wait(30);
  const g = ai.engineFor(msg.N), p = { ...msg.pos, b: Uint8Array.from(msg.pos.b) };
  if (msg.type === 'move') { const d = ai.decide(msg.N, p, msg.level, msg.opts); return { move: d.move, winrate: d.winrate }; }
  if (msg.type === 'hint') { const r = g.search(p, { sims: Math.round(ai.GO_LEVELS.hint.sims * (msg.N >= 13 ? 0.6 : 1)), timeMs: ai.GO_LEVELS.hint.time }); return { move: r.move, winrate: r.winrate }; }
  return { owner: Array.from(g.ownership(p, msg.n || 300)) };
}
async function aiTurn() {
  thinking = true; setStatus(`${aiName()} is thinking`, 'think'); quietDraw();
  const id = ++reqId, t0 = Date.now(), last = G.moves[G.moves.length - 1];
  const r = await ask({ type: 'move', N: G.N, pos: serial(pos), level: LEVELS[G.level].id, opts: { aiMoves: G.aiMoves, opponentPassed: !!last && last.c < 0 } });
  const took = Date.now() - t0; if (took < ms('ai')) await wait(ms('ai') - took);
  await untilRunning();
  if (id !== reqId || !G || G.over) return;
  thinking = false;
  if (r.move === -2) return finish({ st: 'resign', winner: G.human });
  let c = r.move ?? -1;
  if (c >= 0 && tryPlay(c).err) c = -1; // the engine can't see superko history; pass instead of repeating
  if (review != null) exitReview(true);
  if (c >= 0 && !REDUCED) { aiGhost = c; quietDraw(); await wait(ms('pre')); await untilRunning(); if (id !== reqId || G.over) { aiGhost = -1; return; } }
  doMove(c, 'ai');
}
const wrWords = (w) => (w > 0.8 ? 'you look well ahead' : w > 0.6 ? 'you look a little ahead' : w >= 0.4 ? 'it looks close' : w >= 0.2 ? 'you look a little behind' : 'you look well behind');
async function askHint() {
  if (!G || busy() || G.over || review != null || !humanTurn() || G.phase !== 'play' || challenge()) return;
  const d = drillDef();
  if (d) { hint = pt(...parseLabel(d.ans[0])); setStatus(`Try the pulsing point. ${d.clue}`); quietDraw(); return; }
  thinking = true; setStatus('Reading the board for you', 'think'); quietDraw();
  const id = ++reqId;
  const r = await ask({ type: 'hint', N: G.N, pos: serial(pos) });
  if (id !== reqId || !G) return;
  thinking = false;
  if (r.move == null || r.move < 0) { hint = null; setStatus(`Passing is fine here · ${wrWords(r.winrate ?? 0.5)}`); quietDraw(); return; }
  hint = tryPlay(r.move).err ? null : r.move;
  setStatus(hint == null ? 'No suggestion here' : `Try ${label(hint)} (the pulsing point) · ${wrWords(r.winrate)}`); quietDraw();
}

// ---------- counting: guess dead stones, let players fix them, then area score ----------
function areaCount(p, dead) {
  const b = new Map(); for (const c of go.POINTS) b.set(c, dead.has(c) ? '' : absAt(p, c));
  const terr = new Map(), seen = new Set(); let B = 0, W = 0;
  for (const c of go.POINTS) { const a = b.get(c); if (a === 'B') B++; else if (a === 'W') W++; }
  for (const c of go.POINTS) {
    if (b.get(c) || seen.has(c)) continue;
    const region = [], st = [c]; seen.add(c); let tb = false, tw = false;
    while (st.length) { const q = st.pop(); region.push(q); for (const d of [q - 1, q + 1, q - go.W, q + go.W]) { if (!b.has(d)) continue; const v = b.get(d); if (!v) { if (!seen.has(d)) { seen.add(d); st.push(d); } } else if (v === 'B') tb = true; else tw = true; } }
    if (tb !== tw) { const who = tb ? 'B' : 'W'; for (const q of region) terr.set(q, who); if (tb) B += region.length; else W += region.length; }
  }
  return { B, W: W + KOMI, terr };
}
function recount() { G.count = areaCount(pos, new Set(G.dead)); const { B, W } = G.count; $('#scoreTxt').textContent = `Black ${B} · White ${W} (incl. ${KOMI} komi) · ${B > W ? 'Black' : 'White'} leads by ${Math.abs(B - W)}`; }
async function beginScoring() {
  G.phase = 'score'; hint = null; armed = -1; ghostAt = -1;
  if (!G.dead) {
    thinking = true; setStatus('Both passed. Counting, and working out which stones are dead…', 'think'); quietDraw();
    const id = ++reqId;
    const r = await ask({ type: 'own', N: G.N, pos: serial(pos), n: G.N >= 13 ? 260 : 400 });
    if (id !== reqId || !G) return;
    thinking = false;
    const dead = [], done = new Set();
    for (const c of go.POINTS) {
      const a = absAt(pos, c); if (!a || done.has(c)) continue;
      const grp = go.group(pos.b, c).stones; grp.forEach((s) => done.add(s));
      const sgn = a === 'B' ? 1 : -1, avg = grp.reduce((s, q) => s + r.owner[q], 0) / grp.length * sgn; // ownership is +Black / -White
      if (avg < -0.4) dead.push(...grp);
    }
    G.dead = dead;
  }
  recount(); save();
  setStatus(twoP() ? 'Tap any group the two of you agree is dead, then Accept' : 'Faded stones are counted as dead. Tap a group to change it, then Accept');
  draw();
}
function toggleDead(c) {
  if (!absAt(pos, c)) return;
  const grp = go.group(pos.b, c).stones, set = new Set(G.dead), isDead = set.has(c);
  for (const s of grp) isDead ? set.delete(s) : set.add(s);
  G.dead = [...set]; recount(); save(); quietDraw();
}
function keepPlaying() { // back out of counting: the last pass is withdrawn
  if (!G || G.phase !== 'score' || G.over) return;
  reqId++; thinking = false;
  G.phase = 'play'; G.dead = null; G.count = null; G.moves.pop(); rebuild(); hudKey = '';
  save(); draw(); afterMove();
}
function acceptScore() {
  if (!G || G.phase !== 'score' || G.over || !G.count) return;
  const { B, W } = G.count;
  finish({ st: 'count', winner: B > W ? 'B' : 'W', margin: Math.abs(B - W), B, W });
}
function finish(res) {
  G.over = true; thinking = false; stopClock(); reqId++;
  const won = !twoP() && res.winner === G.human, time = elapsed();
  let newBest = false;
  if (won) { const k = bestKey(), b = bestOf(k); if (k && (!b || time < b)) { localStorage.setItem(k, time); newBest = true; } }
  G.result = { ...res, won, time, newBest };
  setStatus(resultTitle(), won || twoP() ? 'win' : 'lose');
  save(); draw(); setTimeout(() => { if (G?.over && G.result && review == null) showResult(); }, REDUCED ? 0 : 700);
}
function resultTitle() {
  const r = G.result;
  if (r.st === 'solved') return 'Solved';
  const by = r.margin != null ? ` by ${r.margin}` : '';
  if (twoP()) return `${cname(r.winner)} wins${by}`;
  if (r.st === 'resign') return r.won ? `${aiName()} resigned. You win` : 'You resigned';
  return r.won ? `You win${by}` : `${aiName()} wins${by}`;
}

// ---------- undo, games, save ----------
function undo() {
  if (!G || G.preview || animating || paused || review != null || (G.drill && G.over)) return;
  let i = G.moves.length - 1;
  if (!twoP()) while (i >= 0 && G.moves[i].by === 'ai') i--; // vs the computer: back to before your last move
  if (i < 0) return;
  reqId++; thinking = false; aiGhost = -1; hideOverlay();
  if (challenge()) { G.undos = (G.undos || 0) + 1; G.clock.pen = (G.clock.pen || 0) + 60000; penaltyFlash('+1:00'); }
  if (G.over) { G.over = false; G.result = null; startClock(); }
  G.moves = G.moves.slice(0, i); G.aiMoves = G.moves.filter((m) => m.by === 'ai').length;
  G.phase = 'play'; G.dead = null; G.count = null;
  hint = null; armed = -1; rebuild(); hudKey = '';
  save(); draw(); afterMove();
}
function parseLabel(s, N = G?.N || 9) { return [N - +s.slice(1), COLS.indexOf(s[0].toUpperCase())]; }
function startGame({ N = P.size, level = P.level, human = P.side === 'r' ? (rand() < 0.5 ? 'B' : 'W') : P.side, mode = P.opp, play = P.play, drill = null, start = null } = {}) {
  reqId++; thinking = false; animating = false; stopAuto();
  paused = false; autoPaused = false; resumeWaiters.splice(0).forEach((f) => f());
  if (review != null) exitReview(true);
  if (mode === '2p') human = 'B';
  if (mode === 'ai' && N === 19) N = 13;
  G = { N, mode, level, play: drill ? 'practice' : play, human, moves: [], start, over: false, preview: false, result: null, undos: 0, aiMoves: 0, drill, phase: 'play', dead: null, count: null, clock: { ms: 0, since: null, pen: 0 } };
  hint = null; armed = -1; ghostAt = -1; aiGhost = -1; clockShown = ''; statusShown = ''; hudKey = '';
  rebuild(); hideOverlay(); drillBar(); save(); quietDraw(); tickClock(); afterMove();
}
function save() { if (G && !G.preview) localStorage.setItem('mtrx-go1', JSON.stringify({ ...G, count: null, clock: { ms: elapsed() - (G.clock.pen || 0), since: null, pen: G.clock.pen || 0 } })); }
function drillBar() { const d = drillDef(); $('#drillBar').hidden = !d; if (d) $('#drillTxt').textContent = `${d.name} · ${d.goal}`; }
$('#drillExit').onclick = () => { reqId++; thinking = false; G = null; paused = false; autoPaused = false; localStorage.removeItem('mtrx-go1'); $('#drillBar').hidden = true; showSetup(); };
function resign() { if (!G || G.preview || G.over || twoP() || G.drill) return; menu.close(); finish({ st: 'resign', winner: other(G.human) }); }

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
function seg(name, opts, cur) { return `<div class="mtrx-segmented" data-seg="${name}">${opts.map(([v, lbl]) => `<button data-v="${v}" aria-pressed="${String(v) === String(cur)}">${lbl}</button>`).join('')}</div>`; }
function bindSegs(root, onPick) {
  root.querySelectorAll('[data-seg]').forEach((g) => g.querySelectorAll('button').forEach((b) => (b.onclick = () => {
    g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    onPick(g.dataset.seg, b.dataset.v);
  })));
}
const PLAY_NOTE = { practice: 'Best move suggests a point and says who is ahead. Undo is free. For learning.', challenge: 'No Best move. Every undo adds 1:00 to your time. Best times count separately.' };
function showSetup() {
  stopAuto();
  const live = G && !G.over && !G.preview;
  if (live) pause('setup');
  if (!G) { // an empty board behind the card
    G = { N: P.opp === 'ai' && P.size === 19 ? 13 : P.size, mode: P.opp, level: P.level, play: P.play, human: P.side === 'W' ? 'W' : 'B', moves: [], start: null, over: true, preview: true, result: null, undos: 0, aiMoves: 0, drill: null, phase: 'play', dead: null, count: null, clock: { ms: 0, since: null, pen: 0 } };
    rebuild(); hudKey = ''; drillBar(); quietDraw(); tickClock(); setStatus('');
  }
  const sizes = (opp) => seg(`size-${opp}`, (opp === 'ai' ? [9, 13] : [9, 13, 19]).map((n) => [n, `${n}×${n}`]), P.size);
  showOverlay(`<div class="ov-card" role="dialog" aria-label="New game"><div class="mtrx-label" style="margin:0">MTRX™ Go</div><h2>New game</h2>
    <div class="row"><div class="mtrx-label">Opponent</div>${seg('opp', [['ai', 'Computer'], ['2p', 'Two players']], P.opp)}<p class="opt-note" data-only="2p">Pass and play on one screen. Black moves first. 19×19 is for two players.</p></div>
    <div class="row"><div class="mtrx-label">Board</div><div data-only="ai">${sizes('ai')}<p class="opt-note">Start on 9×9: a game takes 10 to 20 minutes. 13×13 is the next step up.</p></div><div data-only="2p">${sizes('2p')}</div></div>
    <div class="row" data-only="ai"><div class="mtrx-label">Difficulty</div>${seg('level', LEVELS.map((l, i) => [i, l.name]), P.level)}<p class="opt-note" id="lvNote">${LEVELS[P.level].note}</p></div>
    <div class="row" data-only="ai"><div class="mtrx-label">Mode</div>${seg('play', [['practice', 'Practice'], ['challenge', 'Challenge']], P.play)}<p class="opt-note" id="plNote">${PLAY_NOTE[P.play]}</p></div>
    <div class="row" data-only="ai"><div class="mtrx-label">You play</div>${seg('side', [['B', 'Black · moves first'], ['W', 'White'], ['r', 'Random']], P.side)}</div>
    <button class="mtrx-btn mtrx-btn--primary go" id="goBtn">Start game</button>
    <div class="sub">${live ? '<button id="ovBack">Back to my game</button>' : '<button id="ovDrills">Try a drill</button>'}<button id="ovLearn">How to play</button></div></div>`);
  const only = () => overlay.querySelectorAll('[data-only]').forEach((e) => (e.hidden = e.dataset.only !== P.opp));
  const pressSize = () => overlay.querySelectorAll('[data-seg^="size"] button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.v === P.size)));
  only();
  bindSegs(overlay, (k, v) => {
    if (k === 'opp') { P.opp = v; if (v === 'ai' && P.size === 19) { P.size = 13; pressSize(); } only(); }
    if (k.startsWith('size')) { P.size = +v; pressSize(); }
    if (k === 'level') { P.level = +v; overlay.querySelector('#lvNote').textContent = LEVELS[P.level].note; }
    if (k === 'play') { P.play = v; overlay.querySelector('#plNote').textContent = PLAY_NOTE[P.play]; }
    if (k === 'side') P.side = v;
    savePrefs();
  });
  overlay.querySelector('#goBtn').onclick = () => startGame();
  overlay.querySelector('#ovBack')?.addEventListener('click', () => { hideOverlay(true); resume(); });
  overlay.querySelector('#ovDrills')?.addEventListener('click', () => menu.open(TAB.drills));
  overlay.querySelector('#ovLearn').onclick = () => menu.open(TAB.how);
}
function showResult() {
  const r = G.result; if (!r) return;
  const best = bestOf(bestKey()), title = resultTitle();
  const pen = challenge() && G.undos ? `<br>Includes ${G.undos} undo penalt${G.undos === 1 ? 'y' : 'ies'} (+${fmt(G.undos * 60000)})` : '';
  const detail = r.st === 'count' ? `<br>Black ${r.B} · White ${r.W} (stones plus territory; White's includes ${KOMI} komi)` : '';
  const again = G.drill ? 'Next drill' : 'Play again';
  showOverlay(`<div class="ov-card" role="dialog" aria-label="${title}"><div class="mtrx-label" style="margin:0">${modeLabel()}</div><h2>${title}</h2>
    <div class="big">${fmt(r.time)}</div>
    <p class="note">${G.moves.length} move${G.moves.length === 1 ? '' : 's'}${r.newBest ? ' · <span class="badge">New best time</span>' : best ? ` · best ${fmt(best)}` : ''}${detail}${pen}</p>
    <button class="mtrx-btn mtrx-btn--primary go" id="againBtn">${again}</button>
    <div class="sub">${G.drill ? '<button id="retryBtn">Try it again</button>' : G.moves.length > 1 ? '<button id="watchBtn">Watch the replay</button>' : '<span></span>'}<button id="changeBtn">New game</button></div></div>`);
  overlay.querySelector('#againBtn').onclick = () => (G.drill ? startDrill((G.drill.i + 1) % DRILLS.length) : startGame({ N: G.N, level: G.level, human: G.human, mode: G.mode, play: G.play }));
  overlay.querySelector('#retryBtn')?.addEventListener('click', () => startDrill(G.drill.i));
  overlay.querySelector('#watchBtn')?.addEventListener('click', () => { hideOverlay(); autoplay = 0; $('#revPlay').textContent = 'Pause'; startReview(0, true); });
  overlay.querySelector('#changeBtn').onclick = () => { if (G.drill) { G = null; $('#drillBar').hidden = true; } showSetup(); };
}

// ---------- replay ----------
function startReview(i, auto) {
  if (!G || animating || i < 0 || i >= G.moves.length) return;
  const step = review != null && Math.abs(i - review) === 1;
  review = i; const tok = ++reviewTok, m = G.moves[i];
  $('#reviewBar').hidden = false;
  $('#revTxt').textContent = `Move ${i + 1} of ${G.moves.length} · ${cname(m.color)} ${said(m)}`;
  $('#revPrev').disabled = i === 0; $('#revNext').disabled = i === G.moves.length - 1;
  hint = null; step ? draw() : quietDraw();
  if (auto && autoplay !== null) {
    if (i < G.moves.length - 1) autoplay = setTimeout(() => { if (tok === reviewTok) startReview(i + 1, true); }, ms('replay') || 900);
    else stopAuto();
  }
}
function stopAuto() { if (autoplay) clearTimeout(autoplay); autoplay = null; $('#revPlay').textContent = 'Play'; }
function exitReview(silent) {
  stopAuto(); review = null; reviewTok++;
  $('#reviewBar').hidden = true;
  if (G && pos) { quietDraw(); if (!silent && G.over) showResult(); }
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
$('#passBtn').onclick = humanPass;
$('#undoBtn').onclick = undo;
$('#hintBtn').onclick = askHint;
$('#clockBtn').onclick = togglePause;
$('#scoreOk').onclick = acceptScore;
$('#scoreBack').onclick = keepPlaying;
addEventListener('keydown', (e) => {
  if (e.target?.closest?.('.drawer') || menu.isOpen()) return;
  if (e.key === 'p' || e.key === 'P') { togglePause(); return; }
  if (review != null && e.key === 'ArrowLeft') { stopAuto(); startReview(review - 1); }
  else if (review != null && e.key === 'ArrowRight') { stopAuto(); startReview(review + 1); }
  else if (e.key === 'Escape' && review != null) exitReview();
  else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
});

// ---------- pictures for lessons and drills ('.' empty, B/W stones; marks: * ring, x cross, b/w territory, digits) ----------
function dg(rows, mk = []) {
  const N = rows.length, m = 0.75, size = 2 * m + N - 1;
  let s = `<svg class="mini" viewBox="0 0 ${size} ${size}" aria-hidden="true">`;
  for (let i = 0; i < N; i++) s += `<line class="gl" x1="${m}" y1="${m + i}" x2="${m + N - 1}" y2="${m + i}"/><line class="gl" x1="${m + i}" y1="${m}" x2="${m + i}" y2="${m + N - 1}"/>`;
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    const x = m + c, y = m + r, k = (mk[r] || '')[c];
    if (ch === 'B' || ch === 'W') s += `<circle cx="${x}" cy="${y}" r=".47" fill="url(#g${ch})" stroke="${ch === 'B' ? '#000' : '#9b9384'}" stroke-width=".02"/>`;
    if (k === '*') s += `<circle cx="${x}" cy="${y}" r=".22" class="dg-mark"/>`;
    else if (k === 'x') s += `<path d="M${x - 0.2} ${y - 0.2}L${x + 0.2} ${y + 0.2}M${x + 0.2} ${y - 0.2}L${x - 0.2} ${y + 0.2}" class="dg-x"/>`;
    else if (k === 'b' || k === 'w') s += `<rect x="${x - 0.17}" y="${y - 0.17}" width=".34" height=".34" rx=".04" class="terr ${k}"/>`;
    else if (k && /\d/.test(k)) s += `<text x="${x}" y="${y}" class="dg-num" fill="${ch === 'B' ? '#fff' : '#111'}">${k}</text>`;
  }));
  return s + '</svg>';
}
const lesson = (n, pic, title, text) => `<div class="lesson vis"><div>${pic}</div><div>${n ? `<span class="mtrx-numeral">${n}</span>` : ''}<h3>${title}</h3><p>${text}</p></div></div>`;
const plain = (n, title, text) => `<div class="lesson">${n ? `<span class="mtrx-numeral">${n}</span>` : ''}<h3>${title}</h3><p>${text}</p></div>`;

// ---------- drills (each answer checked against the engine) ----------
const DRILLS = [
  { name: 'Capture one', goal: 'Black to play. Capture the white stone.', clue: 'White has one liberty left. Take it.', B: ['D5', 'F5', 'E6'], W: ['E5'], ans: ['E4'] },
  { name: 'Capture two on the edge', goal: 'Black to play. Capture both white stones.', clue: 'The pair shares one last liberty, just above them.', B: ['C1', 'F1', 'D2'], W: ['D1', 'E1'], ans: ['E2'] },
  { name: 'Run away', goal: 'Your stone is in atari. Save it.', clue: 'Extend from your stone onto its last liberty to gain three new ones.', B: ['E5'], W: ['D5', 'F5', 'E6'], ans: ['E4'] },
  { name: 'The ladder', goal: 'Black to play. Catch the white stone in a ladder.', clue: 'Atari from below. White can only run one way, and you chase it in a zigzag to the edge.', B: ['D5', 'C4', 'E5'], W: ['D4'], ans: ['D3'] },
  { name: 'Make two eyes', goal: 'Black to play. Make your corner group live.', clue: 'Split your three-point space into two separate eyes.', B: ['A2', 'B2', 'C2', 'D2', 'D1'], W: ['A3', 'B3', 'C3', 'D3', 'E3', 'E2', 'E1'], ans: ['B1'] },
  { name: 'Kill the group', goal: 'Black to play. Stop White from making two eyes.', clue: 'Take the vital point in the middle of White\'s space.', B: ['A3', 'B3', 'C3', 'D3', 'E3', 'E2', 'E1'], W: ['A2', 'B2', 'C2', 'D2', 'D1'], ans: ['B1'] },
].map((d, i) => ({ ...d, i }));
function startDrill(i) {
  menu.close(); const d = DRILLS[i];
  startGame({ N: 9, level: 0, human: 'B', mode: 'ai', play: 'practice', drill: { i, tries: 0 }, start: { B: d.B.map((l) => parseLabel(l, 9)), W: d.W.map((l) => parseLabel(l, 9)) } });
}
function drillPic(d) {
  const rows = Array.from({ length: 9 }, () => Array(9).fill('.'));
  for (const l of d.B) { const [r, k] = parseLabel(l, 9); rows[r][k] = 'B'; }
  for (const l of d.W) { const [r, k] = parseLabel(l, 9); rows[r][k] = 'W'; }
  return dg(rows.map((r) => r.join('')));
}

// ---------- menu drawer ----------
const TAB = { game: 0, moves: 1, how: 2, drills: 5 };
function bestTable(N) {
  const rows = LEVELS.map((l) => { const p = bestOf(`mtrx-go-best:${N}:${l.id}`), c = bestOf(`mtrx-go-best:${N}:${l.id}:c`); return `<tr><td>${l.name}</td><td>${p ? fmt(p) : '–'}</td><td>${c ? fmt(c) : '–'}</td></tr>`; }).join('');
  return `<table class="bests"><caption>${N}×${N}</caption><tr><td></td><td class="mtrx-label">Practice</td><td class="mtrx-label">Challenge</td></tr>${rows}</table>`;
}
function gameTabHTML() {
  const theme = document.documentElement.dataset.theme || '';
  const live = G && !G.over && !G.preview && !twoP() && !G.drill;
  return `<div class="set"><button class="mtrx-btn mtrx-btn--primary" style="width:100%" data-act="new">New game</button>${live ? '<button class="mtrx-btn mtrx-btn--ghost" style="width:100%;margin-top:8px" data-act="resign">Resign this game</button>' : ''}</div>
    <div class="set"><label class="switch"><span><b>Coordinates</b><small>Letters and numbers around the board</small></span><input type="checkbox" data-act="coords" ${P.coords ? 'checked' : ''}></label>
    <label class="switch"><span><b>Tap twice to place</b><small>On touch screens, the first tap shows where your stone will go</small></span><input type="checkbox" data-act="confirm" ${P.confirm ? 'checked' : ''}></label></div>
    <div class="set"><div class="mtrx-label">Board</div><div class="styles">${STYLES.map((s) => `<button data-st="${s.id}" aria-pressed="${s.id === P.style}"><i class="sw" style="--b:${s.b};--l:${s.l};--f:${s.f}"></i>${s.name}</button>`).join('')}</div></div>
    <div class="set"><div class="mtrx-label">Animation speed</div>${seg('speed', [['relaxed', 'Relaxed'], ['normal', 'Normal'], ['quick', 'Quick']], P.speed)}</div>
    <div class="set"><div class="mtrx-label">Theme</div>${seg('theme', [['', 'Light'], ['dark', 'Dark']], theme)}</div>
    <div class="set"><div class="mtrx-label">Best times (wins against the computer)</div>${bestTable(9)}${bestTable(13)}</div>
    <p class="credits">Engine: a JavaScript port of Michi by Petr Baudiš (MIT licence). Rules: Chinese area scoring, positional superko, komi 7.5. Shell, levels and lessons: Designed by MTRX™.</p>`;
}
function mountGameTab(body) {
  body.querySelector('[data-act="new"]').onclick = () => { menu.close(); showSetup(); };
  body.querySelector('[data-act="resign"]')?.addEventListener('click', resign);
  body.querySelector('[data-act="coords"]').onchange = (e) => { P.coords = e.target.checked; savePrefs(); geo.key = ''; quietDraw(); };
  body.querySelector('[data-act="confirm"]').onchange = (e) => { P.confirm = e.target.checked; armed = -1; savePrefs(); };
  body.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => {
    P.style = b.dataset.st; savePrefs(); document.body.dataset.board = P.style;
    body.querySelectorAll('[data-st]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  bindSegs(body, (k, v) => { if (k === 'theme') { applyTheme(v); localStorage.setItem('mtrx-theme', v); } if (k === 'speed') { P.speed = v; savePrefs(); } });
}
function movesTabHTML() {
  if (!G || G.preview || !G.moves.length) return '<p class="empty">Every move shows up here. Tap one to see the board at that moment.</p>';
  return `<p class="empty" style="margin-top:0">Newest first. Tap a move to see the board then.</p><div class="mlist">${G.moves.map((m, i) => ({ m, i })).reverse().map(({ m, i }) =>
    `<button data-i="${i}"><i class="${m.color.toLowerCase()}"></i>${i + 1}. ${cname(m.color)} ${m.c < 0 ? 'passed' : label(m.c)}<small>${m.caps ? `took ${m.caps}` : ''}</small></button>`).join('')}</div>`;
}
const HOW = `
  ${lesson('01', dg(['.......', '.......', '..B....', '...W...', '....B..', '.......', '.......']), 'Placing stones', 'Black and White take turns putting one stone on an empty point, where two lines cross. Black goes first. Stones never move once placed, but they can be captured.')}
  ${lesson('02', dg(['.....', '.....', '..B..', '.....', '.....'], ['.....', '..*..', '.*.*.', '..*..', '.....']), 'Liberties', 'The empty points right next to a stone (up, down, left, right, never diagonal) are its liberties. This stone has four.')}
  ${lesson('03', dg(['.....', '..W..', '.WBW.', '.....', '.....'], ['.....', '.....', '.....', '..*..', '.....']), 'Capture', 'Black has one liberty left, so it is in atari. If White plays on the marked point, the black stone is captured and taken off the board.')}
  ${lesson('04', dg(['.....', '.....', '.BB..', '.....', '.....'], ['.....', '.**..', '*..*.', '.**..', '.....']), 'Groups', 'Stones that touch along the lines form one group and share liberties. This pair has six. To capture a group you must fill every one.')}
  ${lesson('05', dg(['.....', '..W..', '.W.W.', '..W..', '.....'], ['.....', '.....', '..x..', '.....', '.....']), 'No suicide', 'You can\'t play where your stone would have no liberties, unless the move captures something. Black can\'t play on the cross.')}
  ${lesson('06', dg(['.....', '..BW.', '.BW.W', '..BW.', '.....'], ['.....', '.....', '...*.', '.....', '.....']), 'Ko', 'Black captures by playing the marked point. White may not take straight back, because that would repeat the board. White has to play somewhere else first.')}
  ${lesson('07', dg(['BBBBB', 'B.B.B', 'BBBBB', 'WWWWW', '.....'], ['.....', '.*.*.', '.....', '.....', '.....']), 'Two eyes means alive', 'A group with two separate holes (eyes) can never be captured: playing in either hole is suicide for White. One eye is not enough.')}
  ${lesson('08', dg(['.B.W.', '.B.W.', '.B.W.', '.B.W.', '.B.W.'], ['b...w', 'b...w', 'b...w', 'b...w', 'b...w']), 'Counting', 'Chinese counting: your stones plus the empty points only you surround. Here Black has 10 and White 10. White adds 7.5 komi for moving second, so there are no ties.')}
  ${plain('09', 'Ending the game', 'When neither side can gain anything, pass. Two passes in a row end the game. The board then shows which stones look dead (faded) and whose territory is whose. Tap any group to change it, then Accept.')}
  <h3>Ways to play</h3>
  <div class="lesson"><b>Practice</b><p style="margin:6px 0 0">Best move pulses a suggested point and says who looks ahead. Undo is free.</p></div>
  <div class="lesson"><b>Challenge</b><p style="margin:6px 0 0">No Best move. Each undo adds 1:00 to your clock. Wins go on a separate best-times board.</p></div>
  <div class="lesson"><b>Two players</b><p style="margin:6px 0 0">Pass and play on one screen, on 9×9, 13×13 or 19×19. Undo takes back one move.</p></div>
  <div class="lesson"><b>Pause</b><p style="margin:6px 0 0">Tap the clock (or press <kbd>P</kbd>). Opening the menu or leaving the tab pauses on its own.</p></div>
  <h3>The five levels</h3>${LEVELS.map((l) => `<div class="lesson"><b>${l.name}</b><p style="margin:6px 0 0">${l.note}</p></div>`).join('')}
  <p class="credits">Every random choice the computer makes (slips, varied openings) comes from your device's secure random generator. Each level was tested by playing it against the level below.</p>`;
const STRAT = `
  ${lesson('01', dg(['.........', '.........', '..B...W..', '.........', '.........', '.........', '..W...B..', '.........', '.........']), 'Corners, then sides, then centre', 'Two edges help you wall off a corner, so it costs the fewest stones. Open in the corners, on the third or fourth line, then extend along the sides.')}
  ${plain('02', 'Third line or fourth line', 'Stones on the third line take solid territory. Stones on the fourth line build influence toward the centre. The first and second lines are too low early on.')}
  ${lesson('03', dg(['.....', '.BW..', '.WB..', '.....', '.....']), 'Connect and cut', 'Keep your stones connected and look for points that split your opponent in two. A crosscut like this starts a fight: make sure you are the stronger side.')}
  ${plain('04', 'Live first, then attack', 'A group that can\'t make two eyes becomes a target. Settle your weak groups before you go after your opponent\'s.')}
  ${plain('05', 'Don\'t crawl on the second line', 'Each second-line move gains one point while your opponent builds a wall above you. Jump out or play elsewhere instead.')}
  ${plain('06', 'Big points first', 'When a local fight is settled, leave it (tenuki) and play the biggest empty area. Ending the game with sente (the move) is worth a lot.')}`;
const TACT = `
  ${lesson('01', dg(['.....', '..W..', '.WB..', '..W..', '.....'], ['.....', '.....', '...*.', '.....', '.....']), 'Atari: run or give up', 'Black is in atari. Extending on the marked point gains liberties. If running only leads into more atari, let the stone go.')}
  ${lesson('02', dg(['.......', '..BB...', '.BW....', '.......', '.......', '.......', '.......'], ['.......', '.......', '.......', '..*....', '.......', '.......', '.......']), 'The ladder', 'Atari from the marked side. Every time White runs it gets only two liberties, you atari again, and the chase zigzags into the edge. Check for friendly stones on the path before you start one.')}
  ${plain('03', 'The net', 'Instead of chasing, surround loosely from a distance. The stone isn\'t in atari yet, but every way out is blocked.')}
  ${plain('04', 'Double atari', 'One stone that puts two groups in atari at once. Your opponent can save only one.')}
  ${plain('05', 'Snapback', 'Throw a stone in where it can be captured. Taking it leaves the capturing group in atari, and you take back more than you gave.')}`;
const menu = mountLearn({
  title: 'Go', label: 'Menu',
  onOpen: () => { if (running()) { pause('menu'); autoPaused = true; } },
  onClose: () => { if (autoPaused) resume(); },
  tabs: [
    { name: 'Game', get html() { return gameTabHTML(); }, mount: mountGameTab },
    { name: 'Moves', get html() { return movesTabHTML(); }, mount: (body) => body.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => { menu.close(); hideOverlay(); startReview(+b.dataset.i); })) },
    { name: 'How to play', html: HOW },
    { name: 'Strategy', html: STRAT },
    { name: 'Tactics', html: TACT },
    { name: 'Drills', html: `<p>Six one-move problems on a 9×9 board. You play Black. Each answer was checked with the engine.</p>${DRILLS.map((d) => lesson(String(d.i + 1).padStart(2, '0'), drillPic(d), d.name, `${d.goal}<br><button class="mtrx-btn mtrx-btn--primary sm" style="margin-top:10px" data-drill="${d.i}">Solve it</button>`)).join('')}`,
      mount: (body) => body.querySelectorAll('[data-drill]').forEach((b) => (b.onclick = () => startDrill(+b.dataset.drill))) },
  ],
});
$('#learnBtn').onclick = () => menu.open(TAB.how);
$('#menuBtn').onclick = () => menu.open(TAB.game);

// ---------- boot: resume your game (paused) or show the setup card ----------
(() => {
  try {
    const g = JSON.parse(localStorage.getItem('mtrx-go1') || 'null');
    if (g && Array.isArray(g.moves) && [9, 13, 19].includes(g.N) && !g.over) {
      G = { mode: 'ai', play: 'practice', undos: 0, aiMoves: 0, phase: 'play', dead: null, ...g, preview: false, count: null, clock: { ms: g.clock?.ms || 0, since: null, pen: g.clock?.pen || 0 } };
      G.level = Math.min(4, Math.max(0, +G.level || 0));
      if (G.drill && !DRILLS[G.drill.i]) G.drill = null;
      rebuild(); drillBar(); quietDraw(); tickClock();
      if (G.moves.length) { afterMove(); pause('back'); return; }
      afterMove(); return;
    }
  } catch { /* corrupted save: start fresh */ }
  G = null; showSetup();
})();
