// MTRX™ Arcade · Crossword v1. Layout: Crossword Layout Generator by Michael Wehar (MIT, vendored in js/vendor).
// Clues: original MTRX clue bank. Shell, levels, input and lessons: Designed by MTRX™
import { WORDMARK } from './wordmark.js?v=5';
import { mountLearn, rand } from './learn.js?v=5';
import { applyTheme } from './theme.js?v=5';

const $ = (s) => document.querySelector(s);
$('#home').innerHTML = WORDMARK;
const LEVELS = [
  { id: 'easy', name: 'Easy', n: 8, max: 12, gift: 0.3, note: 'Everyday words, plain clues. About a third of the letters are filled in for you.' },
  { id: 'medium', name: 'Medium', n: 10, max: 13, gift: 0.15, note: 'Wider vocabulary, still direct clues. A few letters given.' },
  { id: 'intermediate', name: 'Intermediate', n: 10, max: 14, gift: 0.06, note: 'Words like "hiatus" and "catalyst". Hardly any free letters.' },
  { id: 'hard', name: 'Hard', n: 10, max: 15, gift: 0, note: 'Advanced vocabulary ("laconic", "zeitgeist"). No free letters.' },
  { id: 'expert', name: 'Expert', n: 11, max: 15, gift: 0, note: 'Riddles and misdirection: most clues mean something other than they seem. No free letters.' },
];
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (t) => new Promise((r) => setTimeout(r, t));
const fmt = (t) => { const s = Math.floor(t / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const K = (r, c) => `${r},${c}`;
const PEN = 30000;

// ---------- preferences ----------
const P = Object.assign({ level: 0, play: 'practice', autoCheck: false, skipFilled: true }, JSON.parse(localStorage.getItem('mtrx-cw-prefs') || 'null') || {});
P.level = Math.min(4, Math.max(0, +P.level || 0)); if (P.play !== 'challenge') P.play = 'practice';
const savePrefs = () => localStorage.setItem('mtrx-cw-prefs', JSON.stringify(P));

// ---------- state ----------
let G = null; // { level, play, rows, cols, words, fill, gifts, shown, wrong, reveals, over, result, cur:{r,c,dir}, wasFull, clock }
let cells = new Map(); // "r,c" -> { r, c, sol, a: word index or null, d: word index or null, num }
let paused = false, autoPaused = false, building = false;
const challenge = () => G?.play === 'challenge';
const locked = (k) => G.gifts.includes(k) || G.shown.includes(k);

// ---------- clock ----------
const elapsed = () => (G ? G.clock.ms + (G.clock.pen || 0) + (G.clock.since ? Date.now() - G.clock.since : 0) : 0);
const startClock = () => { if (G && !G.clock.since && !G.over && !paused) G.clock.since = Date.now(); };
const stopClock = () => { if (G?.clock.since) { G.clock.ms += Date.now() - G.clock.since; G.clock.since = null; } };
const bestKey = () => `mtrx-cw-best:${LEVELS[G.level].id}${challenge() ? ':c' : ''}`;
const bestOf = (k) => +(localStorage.getItem(k) || 0);
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
const overlay = $('#overlay');
const running = () => G && !G.over && !paused && overlay.hidden && !building;
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
  if (G && Object.keys(G.fill).length) startClock();
  draw();
}
function togglePause() { if (paused) resume(); else if (running()) pause('button'); }
const modeLabel = () => `${LEVELS[G.level].name}${challenge() ? ' · Challenge' : ''}`;
function showPause(why) {
  const title = why === 'back' ? 'Welcome back' : 'Paused';
  showOverlay(`<div class="ov-card" role="dialog" aria-label="${title}"><div class="mtrx-label" style="margin:0">${modeLabel()}</div><h2>${title}</h2>
    <div class="big">${fmt(elapsed())}</div><p class="note">The clock is stopped and the letters are hidden.</p>
    <button class="mtrx-btn mtrx-btn--primary go" id="resumeBtn">Resume</button><p class="hint-line">Tip: tap the clock to pause any time</p></div>`, 'pause');
  overlay.querySelector('#resumeBtn').onclick = resume;
}

// ---------- grid ----------
const gridEl = $('#grid'), boardEl = $('#board');
const cellEls = new Map();
function index() {
  cells = new Map();
  G.words.forEach((w, wi) => [...w.answer].forEach((ch, k) => {
    const r = w.row + (w.dir === 'down' ? k : 0), c = w.col + (w.dir === 'across' ? k : 0), key = K(r, c);
    const cell = cells.get(key) || { r, c, sol: ch, a: null, d: null, num: null };
    cell[w.dir === 'across' ? 'a' : 'd'] = wi; if (k === 0) cell.num = w.num;
    cells.set(key, cell);
  }));
}
const wordKeys = (wi) => { const w = G.words[wi]; return [...w.answer].map((_, k) => K(w.row + (w.dir === 'down' ? k : 0), w.col + (w.dir === 'across' ? k : 0))); };
const curKey = () => K(G.cur.r, G.cur.c);
const wordAt = (key, dir) => { const c = cells.get(key); if (!c) return null; const own = dir === 'across' ? c.a : c.d; return own ?? (dir === 'across' ? c.d : c.a); };
const curWord = () => wordAt(curKey(), G.cur.dir);
const filled = (wi) => wordKeys(wi).every((k) => G.fill[k]);
const solved = (wi) => wordKeys(wi).every((k) => G.fill[k] === cells.get(k).sol);
function buildGrid() {
  gridEl.innerHTML = ''; cellEls.clear();
  gridEl.style.setProperty('--cols', G.cols); gridEl.style.setProperty('--rows', G.rows);
  boardEl.style.setProperty('--ar', (G.cols / G.rows).toFixed(4));
  for (const [key, c] of cells) {
    const el = document.createElement('div');
    el.className = 'cwc'; el.style.gridRow = c.r + 1; el.style.gridColumn = c.c + 1; el.dataset.k = key;
    el.innerHTML = `${c.num ? `<span class="n">${c.num}</span>` : ''}<span class="v"></span>`;
    el.setAttribute('role', 'gridcell');
    gridEl.append(el); cellEls.set(key, el);
  }
  sizeCells(); renderClueLists();
}
function sizeCells() { if (!G) return; const w = boardEl.getBoundingClientRect().width || 300; gridEl.style.setProperty('--cell', `${(w / G.cols).toFixed(1)}px`); }
if ('ResizeObserver' in window) new ResizeObserver(sizeCells).observe(boardEl); else addEventListener('resize', sizeCells);

let statusShown = '', statusCls = '';
function setStatus(t, cls = '') { const el = $('#status'); if (t === statusShown && cls === statusCls) return; statusShown = t; statusCls = cls; el.textContent = t; el.className = 'status-line ' + cls; if (t) { void el.offsetWidth; el.classList.add('fade'); } }
let clueShown = '';
function draw() {
  if (!G) return;
  const wi = curWord(), inWord = new Set(wi == null ? [] : wordKeys(wi)), ck = curKey();
  for (const [key, el] of cellEls) {
    const v = G.fill[key] || '';
    const ve = el.querySelector('.v'); if (ve.textContent !== v) ve.textContent = v;
    el.classList.toggle('word', inWord.has(key)); el.classList.toggle('cur', key === ck && !G.over);
    el.classList.toggle('gift', G.gifts.includes(key)); el.classList.toggle('shown', G.shown.includes(key));
    el.classList.toggle('wrong', G.wrong.includes(key));
  }
  gridEl.classList.toggle('veil', paused);
  if (wi != null) {
    const w = G.words[wi], t = `${w.num} ${w.dir === 'across' ? 'Across' : 'Down'}|${w.clue} (${w.answer.length})`;
    if (t !== clueShown) {
      clueShown = t; const [h, c] = t.split('|');
      $('#clueTxt').innerHTML = `<small>${h}</small><span>${c}</span>`;
      const bar = $('#clueBar'); bar.classList.remove('fade'); void bar.offsetWidth; bar.classList.add('fade');
    }
  }
  const total = G.words.length, done = G.words.filter((_, i) => (challenge() ? filled(i) : solved(i))).length;
  $('#leftLbl').textContent = challenge() ? 'Filled' : 'Solved'; $('#solvedN').textContent = `${done}/${total}`;
  $('#revealsN').textContent = G.reveals;
  const best = bestOf(bestKey());
  $('#clockSub').textContent = paused ? 'Paused' : `${challenge() ? 'Challenge · ' : ''}${best ? `Best ${fmt(best)}` : 'No best yet'}`;
  const ch = challenge();
  $('#checkBtn').hidden = ch; $('#tools').classList.toggle('two', ch);
  $('#revealBtn').innerHTML = `${ICON.reveal}Reveal letter${ch ? '<small>+0:30</small>' : ''}`;
  const dis = !G || G.over || paused;
  ['#checkBtn', '#revealBtn', '#clearBtn'].forEach((s) => ($(s).disabled = dis));
  const cb = $('#clockBtn'); cb.disabled = G.over || (!overlay.hidden && !paused);
  cb.classList.toggle('paused', paused); cb.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
  $('#pz').innerHTML = paused ? '<path d="M7 4.5v15l12-7.5z"/>' : '<path d="M6.5 4.5h3.6v15H6.5zM13.9 4.5h3.6v15h-3.6z"/>';
  updateClueLists(wi);
}
function flash(keys, cls, stagger = 0) {
  if (REDUCED) return;
  keys.forEach((k, i) => { const el = cellEls.get(k); if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.style.setProperty('--d', `${i * stagger}ms`); el.classList.add(cls); setTimeout(() => el.classList.remove(cls), 1200 + i * stagger); });
}

// ---------- moving around ----------
const canInput = () => G && !G.over && !paused && overlay.hidden && !building;
function select(key, dir) {
  const c = cells.get(key); if (!c) return;
  if (dir === 'across' && c.a == null) dir = 'down';
  if (dir === 'down' && c.d == null) dir = 'across';
  G.cur = { r: c.r, c: c.c, dir }; save(); draw();
}
gridEl.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.cwc'); if (!el || !canInput()) return;
  const key = el.dataset.k, c = cells.get(key);
  if (key === curKey() && c.a != null && c.d != null) select(key, G.cur.dir === 'across' ? 'down' : 'across');
  else select(key, G.cur.dir);
});
function toggleDir() { const c = cells.get(curKey()); if (c && c.a != null && c.d != null) select(curKey(), G.cur.dir === 'across' ? 'down' : 'across'); }
function gotoWord(wi, preferEmpty = true) {
  const keys = wordKeys(wi), k = (preferEmpty && keys.find((x) => !G.fill[x])) || keys[0];
  const c = cells.get(k); G.cur = { r: c.r, c: c.c, dir: G.words[wi].dir }; save(); draw();
}
function stepWord(delta, needEmpty = false) {
  const n = G.words.length; let wi = curWord() ?? 0;
  for (let i = 1; i <= n; i++) { const j = (wi + delta * i + n * 2) % n; if (!needEmpty || !filled(j)) return gotoWord(j); }
}
function moveArrow(dr, dc) {
  const dir = dc ? 'across' : 'down';
  const c = cells.get(curKey());
  if (G.cur.dir !== dir && (dir === 'across' ? c.a : c.d) != null) return select(curKey(), dir);
  const k = K(G.cur.r + dr, G.cur.c + dc); if (cells.has(k)) select(k, dir);
}

// ---------- typing ----------
function afterChange(key) {
  G.wrong = G.wrong.filter((k) => k !== key);
  if (!challenge() && P.autoCheck && G.fill[key] && G.fill[key] !== cells.get(key).sol) G.wrong.push(key);
}
function advance(from) {
  const wi = curWord(), keys = wordKeys(wi), i = keys.indexOf(from);
  const order = [...keys.slice(i + 1), ...keys.slice(0, i)];
  const nextEmpty = order.find((k) => !G.fill[k] && !locked(k));
  if (nextEmpty && (P.skipFilled || keys.indexOf(nextEmpty) > i)) { const c = cells.get(nextEmpty); G.cur = { ...G.cur, r: c.r, c: c.c }; return; }
  if (!P.skipFilled && i < keys.length - 1) { const c = cells.get(keys[i + 1]); G.cur = { ...G.cur, r: c.r, c: c.c }; return; }
  if (!filled(wi)) return;
  stepWord(1, true);
}
function type(ch) {
  if (!canInput()) return;
  const wi = curWord(), keys = wordKeys(wi);
  let key = curKey();
  if (locked(key)) { key = [...keys.slice(keys.indexOf(key)), ...keys].find((k) => !locked(k)); if (!key) return; }
  G.fill[key] = ch; afterChange(key); startClock();
  const el = cellEls.get(key); if (el && !REDUCED) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  const c = cells.get(key); G.cur = { ...G.cur, r: c.r, c: c.c };
  const crossing = [c.a, c.d].filter((x) => x != null);
  advance(key);
  for (const w of crossing) if (!challenge() && solved(w)) flash(wordKeys(w), 'wave', 45);
  save(); draw(); checkFull();
}
function backspace() {
  if (!canInput()) return;
  const key = curKey();
  if (G.fill[key] && !locked(key)) { delete G.fill[key]; afterChange(key); save(); draw(); return; }
  const keys = wordKeys(curWord()), i = keys.indexOf(key);
  for (let j = i - 1; j >= 0; j--) {
    const k = keys[j], c = cells.get(k); G.cur = { ...G.cur, r: c.r, c: c.c };
    if (!locked(k)) { delete G.fill[k]; afterChange(k); break; }
  }
  save(); draw();
}
addEventListener('keydown', (e) => {
  if (menu.isOpen() || e.metaKey || e.ctrlKey || e.altKey || !G) return;
  if (!overlay.hidden) return;
  const k = e.key;
  if (/^[a-z]$/i.test(k)) { e.preventDefault(); type(k.toUpperCase()); }
  else if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); backspace(); }
  else if (k === ' ') { e.preventDefault(); toggleDir(); }
  else if (k === 'Tab' || k === 'Enter') { e.preventDefault(); if (canInput()) stepWord(e.shiftKey ? -1 : 1); }
  else if (k.startsWith('Arrow') && canInput()) { e.preventDefault(); moveArrow(k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0, k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0); }
});
// on-screen keyboard
$('#kbd').innerHTML = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].map((row, i) => `<div>${[...row].map((ch) => `<button data-k="${ch}">${ch}</button>`).join('')}${i === 2 ? '<button class="wide" data-k="del" aria-label="Delete">⌫</button>' : ''}</div>`).join('');
$('#kbd').addEventListener('pointerdown', (e) => { const b = e.target.closest('button'); if (!b) return; e.preventDefault(); b.dataset.k === 'del' ? backspace() : type(b.dataset.k); });
$('#clueTxt').onclick = () => { if (canInput()) toggleDir(); };
$('#cluePrev').onclick = () => { if (canInput()) stepWord(-1); };
$('#clueNext').onclick = () => { if (canInput()) stepWord(1); };

// ---------- tools ----------
const ICON = {
  check: '<svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5"/></svg>',
  reveal: '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  clear: '<svg viewBox="0 0 24 24"><path d="M20 20H9L4.5 15.5a2 2 0 0 1 0-2.8L13 4.2a2 2 0 0 1 2.8 0l4 4a2 2 0 0 1 0 2.8L11 20"/></svg>',
};
$('#checkBtn').innerHTML = `${ICON.check}Check word`; $('#clearBtn').innerHTML = `${ICON.clear}Clear word`;
$('#checkBtn').onclick = () => {
  if (!canInput() || challenge()) return;
  const keys = wordKeys(curWord()), bad = keys.filter((k) => G.fill[k] && G.fill[k] !== cells.get(k).sol);
  G.wrong = [...new Set([...G.wrong, ...bad])];
  if (bad.length) { flash(bad, 'shake'); setStatus(`${bad.length} wrong letter${bad.length > 1 ? 's' : ''} marked in this word`, 'lose'); }
  else if (keys.every((k) => G.fill[k])) { flash(keys, 'wave', 45); setStatus('That word is right', 'win'); }
  else setStatus('Everything you have typed in this word is right so far');
  save(); draw();
};
$('#revealBtn').onclick = () => {
  if (!canInput()) return;
  const keys = wordKeys(curWord()); let key = curKey();
  if (G.fill[key] === cells.get(key).sol || locked(key)) key = keys.find((k) => G.fill[k] !== cells.get(k).sol && !locked(k)) || key;
  if (locked(key) || G.fill[key] === cells.get(key).sol) { setStatus('This word is already right. Pick another one'); return; }
  G.fill[key] = cells.get(key).sol; G.shown.push(key); G.reveals++; afterChange(key); startClock();
  if (challenge()) { G.clock.pen = (G.clock.pen || 0) + PEN; penaltyFlash('+0:30'); }
  flash([key], 'pop'); const c = cells.get(key); G.cur = { ...G.cur, r: c.r, c: c.c };
  setStatus(challenge() ? 'Letter revealed · +0:30' : 'Letter revealed');
  save(); draw(); checkFull();
};
$('#clearBtn').onclick = () => {
  if (!canInput()) return;
  for (const k of wordKeys(curWord())) if (!locked(k)) { delete G.fill[k]; afterChange(k); }
  gotoWord(curWord()); save(); draw();
};
$('#clockBtn').onclick = togglePause;

// ---------- finishing ----------
function checkFull() {
  const full = [...cells.keys()].every((k) => G.fill[k]);
  if (!full) { G.wasFull = false; return; }
  const bad = [...cells.keys()].filter((k) => G.fill[k] !== cells.get(k).sol);
  if (!bad.length) return finish();
  if (G.wasFull) return; G.wasFull = true;
  if (challenge()) { G.clock.pen = (G.clock.pen || 0) + PEN; penaltyFlash('+0:30'); setStatus(`The grid is full, but ${bad.length} letter${bad.length > 1 ? 's are' : ' is'} wrong · +0:30`, 'lose'); }
  else { G.wrong = [...new Set([...G.wrong, ...bad])]; flash(bad, 'shake'); setStatus(`Nearly: ${bad.length} letter${bad.length > 1 ? 's are' : ' is'} wrong, marked in red`, 'lose'); }
  save(); draw();
}
function finish() {
  G.over = true; stopClock();
  const time = elapsed(), k = bestKey(), b = bestOf(k);
  const newBest = !b || time < b; if (newBest) localStorage.setItem(k, time);
  G.result = { time, newBest };
  setStatus('Solved', 'win'); save(); draw();
  const order = [...cells.keys()].sort((a, b2) => { const [ar, ac] = a.split(',').map(Number), [br, bc] = b2.split(',').map(Number); return ar + ac - (br + bc); });
  flash(order, 'wave', 22);
  setTimeout(() => { if (G?.over) showResult(); }, REDUCED ? 0 : 1300);
}

// ---------- building puzzles (in a worker, so the page stays smooth) ----------
let worker = null, jobId = 0;
const seenAll = () => JSON.parse(localStorage.getItem('mtrx-cw-seen') || '{}');
async function buildPuzzle(level) {
  const L = LEVELS[level], seen = seenAll()[L.id] || [];
  const msg = { id: ++jobId, level: L.id, n: L.n, max: L.max, seen };
  try {
    if (!worker) worker = new Worker('js/crossword-worker.js?v=6', { type: 'module' });
    const p = await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('timeout')), 12000);
      worker.onmessage = ({ data }) => { if (data.id !== msg.id) return; clearTimeout(t); data.puzzle ? res(data.puzzle) : rej(new Error(data.error || 'no grid')); };
      worker.onerror = (e) => { clearTimeout(t); e.preventDefault?.(); rej(new Error('worker')); };
      worker.postMessage(msg);
    });
    return p;
  } catch {
    worker = null; // older browsers without module workers: build here instead
    const [{ buildPuzzle: bp }, { BANK }] = await Promise.all([import('./crossword-gen.js?v=6'), import('./crossword-clues.js?v=6')]);
    return bp(BANK[L.id], { n: L.n, max: L.max, seen });
  }
}
function remember(level, words, bankSize) {
  const all = seenAll(), id = LEVELS[level].id;
  let s = [...(all[id] || []), ...words.map((w) => w.answer)];
  if (s.length > bankSize * 0.7) s = words.map((w) => w.answer); // most of the bank used: start a fresh cycle
  all[id] = [...new Set(s)]; localStorage.setItem('mtrx-cw-seen', JSON.stringify(all));
}
const BANK_SIZE = { easy: 66, medium: 60, intermediate: 58, hard: 52, expert: 49 };
async function startGame(level = P.level, play = P.play) {
  if (building) return;
  building = true; paused = false; autoPaused = false;
  showOverlay(`<div class="ov-card" style="text-align:center"><div class="mtrx-label" style="margin:0">${LEVELS[level].name}${play === 'challenge' ? ' · Challenge' : ''}</div><h2>Building your grid</h2><p class="note">Picking fresh words and fitting them together…</p></div>`);
  let p = null; try { p = await buildPuzzle(level); } catch { p = null; }
  building = false;
  if (!p) { showOverlay(`<div class="ov-card"><h2>That didn't work</h2><p class="note">The grid builder hit a problem. Try again.</p><button class="mtrx-btn mtrx-btn--primary go" id="retry">Try again</button></div>`); overlay.querySelector('#retry').onclick = () => startGame(level, play); return; }
  remember(level, p.words, BANK_SIZE[LEVELS[level].id]);
  G = { level, play, rows: p.rows, cols: p.cols, words: p.words, fill: {}, gifts: [], shown: [], wrong: [], reveals: 0, over: false, result: null, wasFull: false, cur: null, clock: { ms: 0, since: null, pen: 0 } };
  index();
  const keys = [...cells.keys()], nGift = Math.round(keys.length * LEVELS[level].gift);
  G.gifts = shuffle(keys).slice(0, nGift); for (const k of G.gifts) G.fill[k] = cells.get(k).sol;
  const w0 = G.words[0], first = wordKeys(0).find((k) => !G.fill[k]) || wordKeys(0)[0], c0 = cells.get(first);
  G.cur = { r: c0.r, c: c0.c, dir: w0.dir };
  clockShown = ''; statusShown = ''; clueShown = '';
  hideOverlay(); buildGrid(); save(); draw(); tickClock();
  setStatus(`${G.words.length} words. The clock starts with your first letter`);
}
function save() { if (G) localStorage.setItem('mtrx-cw1', JSON.stringify({ ...G, clock: { ms: elapsed() - (G.clock.pen || 0), since: null, pen: G.clock.pen || 0 } })); }

// ---------- overlay cards ----------
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
const PLAY_NOTE = { practice: 'Check any word, reveal letters for free, and optionally see mistakes as you type.', challenge: 'No checking. Each reveal adds 0:30, and filling the grid with wrong letters adds 0:30.' };
function showSetup() {
  const live = G && !G.over;
  if (live) pause('setup');
  showOverlay(`<div class="ov-card" role="dialog" aria-label="New puzzle"><div class="mtrx-label" style="margin:0">MTRX™ Crossword</div><h2>New puzzle</h2>
    <div class="row"><div class="mtrx-label">Difficulty</div>${seg('level', LEVELS.map((l, i) => [i, l.name]), P.level)}<p class="opt-note" id="lvNote">${LEVELS[P.level].note}</p></div>
    <div class="row"><div class="mtrx-label">Mode</div>${seg('play', [['practice', 'Practice'], ['challenge', 'Challenge']], P.play)}<p class="opt-note" id="plNote">${PLAY_NOTE[P.play]}</p></div>
    <button class="mtrx-btn mtrx-btn--primary go" id="goBtn">Build my grid</button>
    <div class="sub">${live ? '<button id="ovBack">Back to my puzzle</button>' : '<span></span>'}<button id="ovLearn">How to play</button></div></div>`);
  bindSegs(overlay, (k, v) => {
    if (k === 'level') { P.level = +v; overlay.querySelector('#lvNote').textContent = LEVELS[P.level].note; }
    if (k === 'play') { P.play = v; overlay.querySelector('#plNote').textContent = PLAY_NOTE[P.play]; }
    savePrefs();
  });
  overlay.querySelector('#goBtn').onclick = () => startGame();
  overlay.querySelector('#ovBack')?.addEventListener('click', () => { hideOverlay(true); resume(); });
  overlay.querySelector('#ovLearn').onclick = () => menu.open(TAB.how);
}
function showResult() {
  const r = G.result; if (!r) return;
  const best = bestOf(bestKey());
  showOverlay(`<div class="ov-card" role="dialog" aria-label="Solved"><div class="mtrx-label" style="margin:0">${modeLabel()}</div><h2>Solved</h2>
    <div class="big">${fmt(r.time)}</div>
    <p class="note">${G.words.length} words · ${G.reveals ? `${G.reveals} letter${G.reveals > 1 ? 's' : ''} revealed` : 'no reveals'}${r.newBest ? ' · <span class="badge">New best time</span>' : best ? ` · best ${fmt(best)}` : ''}</p>
    <button class="mtrx-btn mtrx-btn--primary go" id="againBtn">Next puzzle</button>
    <div class="sub"><button id="lookBtn">Look at the grid</button><button id="changeBtn">Change level</button></div></div>`);
  overlay.querySelector('#againBtn').onclick = () => startGame(G.level, G.play);
  overlay.querySelector('#lookBtn').onclick = () => hideOverlay(true);
  overlay.querySelector('#changeBtn').onclick = showSetup;
}

// ---------- clue lists (side panel on wide screens, and the Clues tab) ----------
function clueListHTML() {
  if (!G) return '<p class="empty">Start a puzzle to see its clues.</p>';
  const part = (dir, title) => `<h4>${title}</h4><ol>${G.words.map((w, i) => ({ w, i })).filter(({ w }) => w.dir === dir).map(({ w, i }) => `<li data-w="${i}"><b>${w.num}</b><span>${w.clue} (${w.answer.length})</span></li>`).join('')}</ol>`;
  return `<div class="clist">${part('across', 'Across')}${part('down', 'Down')}</div>`;
}
function bindClueList(root) { root.querySelectorAll('[data-w]').forEach((li) => (li.onclick = () => { if (menu.isOpen()) menu.close(); if (canInput() || (G && !G.over)) gotoWord(+li.dataset.w); })); }
function renderClueLists() { const s = $('#clues'); s.innerHTML = clueListHTML(); bindClueList(s); }
function updateClueLists(wi) {
  for (const root of [$('#clues'), menu?.isOpen() ? document.querySelector('.drawer .body') : null]) {
    if (!root) continue;
    root.querySelectorAll('[data-w]').forEach((li) => { const i = +li.dataset.w; if (!G.words[i]) return; li.classList.toggle('on', i === wi); li.classList.toggle('done', challenge() ? filled(i) : solved(i)); });
  }
  const on = $('#clues').querySelector('li.on'); if (on && on.scrollIntoView && !REDUCED) { const r = on.getBoundingClientRect(), p = $('#clues').getBoundingClientRect(); if (r.top < p.top || r.bottom > p.bottom) on.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}

// ---------- lessons ----------
function mg(rows, { cls = {}, nums = {} } = {}) { // tiny grid picture: '.' is empty space, '_' a blank square
  const C = rows[0].length;
  return `<span class="mgrid" style="grid-template-columns:repeat(${C},24px)" aria-hidden="true">${rows.map((row, r) => [...row].map((ch, c) => {
    const k = `${r},${c}`; if (ch === '.') return '<i></i>';
    return `<i class="l ${cls[k] || ''}">${nums[k] ? `<sup>${nums[k]}</sup>` : ''}${ch === '_' ? '' : ch}</i>`;
  }).join('')).join('')}</span>`;
}
const lesson = (n, title, body, pic = '') => `<div class="lesson">${n ? `<span class="mtrx-numeral">${n}</span>` : ''}<h3>${title}</h3><p>${body}</p>${pic}</div>`;
const TAB = { game: 0, clues: 1, how: 2 };
function gameTabHTML() {
  const rows = LEVELS.map((l) => { const p = bestOf(`mtrx-cw-best:${l.id}`), c = bestOf(`mtrx-cw-best:${l.id}:c`); return `<tr><td>${l.name}</td><td>${p ? fmt(p) : '–'}</td><td>${c ? fmt(c) : '–'}</td></tr>`; }).join('');
  const theme = document.documentElement.dataset.theme || '';
  return `<div class="set"><button class="mtrx-btn mtrx-btn--primary" style="width:100%" data-act="new">New puzzle</button></div>
    <div class="set"><label class="switch"><span><b>Show mistakes as I type</b><small>Practice only. Wrong letters turn red straight away</small></span><input type="checkbox" data-act="auto" ${P.autoCheck ? 'checked' : ''}></label>
    <label class="switch"><span><b>Skip filled squares</b><small>After each letter, jump to the next empty square</small></span><input type="checkbox" data-act="skip" ${P.skipFilled ? 'checked' : ''}></label></div>
    <div class="set"><div class="mtrx-label">Theme</div>${seg('theme', [['', 'Light'], ['dark', 'Dark']], theme)}</div>
    <div class="set"><div class="mtrx-label">Best times</div><table class="bests"><tr><td></td><td class="mtrx-label">Practice</td><td class="mtrx-label">Challenge</td></tr>${rows}</table></div>
    <p class="credits">Grid layout: Crossword Layout Generator by Michael Wehar (MIT). Clues: written for MTRX™. Shell and lessons: Designed by MTRX™.</p>`;
}
function mountGameTab(body) {
  body.querySelector('[data-act="new"]').onclick = () => { menu.close(); showSetup(); };
  body.querySelector('[data-act="auto"]').onchange = (e) => { P.autoCheck = e.target.checked; savePrefs(); if (G && !challenge()) { for (const k of Object.keys(G.fill)) afterChange(k); save(); draw(); } };
  body.querySelector('[data-act="skip"]').onchange = (e) => { P.skipFilled = e.target.checked; savePrefs(); };
  bindSegs(body, (k, v) => { if (k === 'theme') { applyTheme(v); localStorage.setItem('mtrx-theme', v); } });
}
const SAMPLE = ['CAT..', '..O..', '.BOOK', '..L..'];
const menu = mountLearn({
  title: 'Crossword', label: 'Menu',
  onOpen: () => { if (running()) { pause('menu'); autoPaused = true; } },
  onClose: () => { if (autoPaused) resume(); },
  tabs: [
    { name: 'Game', get html() { return gameTabHTML(); }, mount: mountGameTab },
    { name: 'Clues', get html() { return clueListHTML(); }, mount: (body) => { bindClueList(body); updateClueLists(G ? curWord() : null); } },
    { name: 'How to play', html: `
      ${lesson('01', 'The grid', 'Every white square holds one letter. Words run across (left to right) or down (top to bottom), and where they cross they share a letter. Here CAT crosses TOOL, and TOOL crosses BOOK.', mg(SAMPLE, { nums: { '0,0': 1, '0,2': 2, '2,1': 3 } }))}
      ${lesson('02', 'Pick a square', 'Tap any square. Its word lights up and the current square glows orange. Tap the same square again to switch between the across and the down word.', mg(SAMPLE, { cls: { '0,2': 'c', '1,2': 'w', '2,2': 'w', '3,2': 'w' }, nums: { '0,0': 1, '0,2': 2, '2,1': 3 } }))}
      ${lesson('03', 'Type', 'Use the keyboard under the grid (or your own). After each letter you jump to the next empty square, and when a word is full you move to the next unfinished clue. ⌫ deletes. The dark bar shows the clue you are on: ‹ and › step through clues, and tapping the clue flips direction.')}
      ${lesson('04', 'Numbers and lengths', 'The small number in a square matches the clue list. The number in brackets is the answer length: "Striped big cat (5)" is TIGER.')}
      ${lesson('05', 'Check and reveal', 'Practice: Check word underlines wrong letters in red, Reveal letter fills one square in blue, and you can switch on "Show mistakes as I type". Clear word wipes the word you are on.', mg(['TIGRE'], { cls: { '0,3': 'x', '0,4': 'x' } }) + ' ' + mg(['TIGER'], { cls: { '0,3': 's' } }))}
      ${lesson('06', 'Challenge', 'No checking at all. Each revealed letter adds 0:30 to your time, and filling the whole grid with wrong letters adds another 0:30. Best times are kept separately.')}
      ${lesson('07', 'Pause', 'Tap the clock. Opening the menu or leaving the tab pauses on its own and hides your letters until you come back.')}
      <h3>The five levels</h3>${LEVELS.map((l) => `<div class="lesson"><b>${l.name}</b><p style="margin:6px 0 0">${l.note}</p></div>`).join('')}
      <p class="credits">Every grid is new: words are drawn with your device's secure random generator, answers you have just seen are held back, and the layout is rebuilt each time.</p>` },
    { name: 'Strategy', html: `
      ${lesson('01', 'Take the gimmes first', 'Run through every clue once and fill only the ones you are sure of. Fill-in-the-blank clues ("take ___") are usually the easiest way in.')}
      ${lesson('02', 'Short words open long ones', 'Three- and four-letter answers are cheap to get and each one hands you letters in the long words that cross them.')}
      ${lesson('03', 'Let the crossings talk', 'A single letter can unlock a word. With _ _ _ _ G E (6) for "Desert illusion of water", the G and E point straight at MIRAGE.', mg(['____GE']))}
      ${lesson('04', 'Match the clue\'s grammar', 'A plural clue wants a plural answer, a past-tense clue wants a past-tense answer, and an "-ly" clue wants an adverb. The answer can always replace the clue in a sentence.')}
      ${lesson('05', '"For one", "say", "e.g."', 'These mean the clue is an example and the answer is the category. "Merlin, for one" is WIZARD. "The Nile or the Ganges" is RIVER.')}
      ${lesson('06', 'A question mark means a pun', '"Pit crew?" isn\'t about racing: it\'s ORCHESTRA, the players in an orchestra pit. When you see "?", read the clue sideways.')}
      ${lesson('07', 'Endings come for free', 'Many answers end in -ING, -ED, -ER, -EST, -LY, -TION or -NESS. Pencil those in early and the stems often follow.')}
      ${lesson('08', 'Walk away and come back', 'Stuck? Move to another corner. Your brain keeps working on the clue in the background, which is why answers often pop up a minute later.')}` },
    { name: 'Clue types', html: `
      ${lesson('', 'Straight definition', '<span class="ex">Striped big cat (5)</span> → TIGER. Most clues on Easy and Medium work like this.')}
      ${lesson('', 'Example of a category', '<span class="ex">The Sahara, for example (6)</span> → DESERT. The clue names one member; you name the group.')}
      ${lesson('', 'Fill in the blank', '<span class="ex">Offence, as in "take ___" (7)</span> → UMBRAGE. Say the phrase out loud.')}
      ${lesson('', 'Synonym in disguise', '<span class="ex">Frank and honest (6)</span> → CANDID. On Intermediate and Hard the definition is short and the vocabulary does the work.')}
      ${lesson('', 'Riddle', '<span class="ex">It has branches but no leaves (4)</span> → BANK. Expert loves these: think of every other meaning of each word.')}
      ${lesson('', 'Question-mark pun', '<span class="ex">One taking up space? (9)</span> → ASTRONAUT. The "?" warns you the words are being bent.')}
      ${lesson('', 'Letter play', '<span class="ex">One letter followed by four silent ones (5)</span> → QUEUE. Sometimes the clue is about the spelling itself.')}` },
  ],
});
$('#learnBtn').onclick = () => menu.open(TAB.how);
$('#menuBtn').onclick = () => menu.open(TAB.game);

// ---------- boot: resume your puzzle (paused) or show the setup card ----------
(() => {
  try {
    const g = JSON.parse(localStorage.getItem('mtrx-cw1') || 'null');
    if (g && Array.isArray(g.words) && g.words.length && !g.over) {
      G = { gifts: [], shown: [], wrong: [], reveals: 0, wasFull: false, ...g, clock: { ms: g.clock?.ms || 0, since: null, pen: g.clock?.pen || 0 } };
      G.level = Math.min(4, Math.max(0, +G.level || 0));
      index(); if (!G.cur || !cells.has(K(G.cur.r, G.cur.c))) { const c = cells.get(wordKeys(0)[0]); G.cur = { r: c.r, c: c.c, dir: G.words[0].dir }; }
      buildGrid(); draw(); tickClock();
      if (Object.keys(G.fill).length > G.gifts.length) { pause('back'); return; }
      setStatus(`${G.words.length} words. The clock starts with your first letter`); return;
    }
  } catch { /* corrupted save: start fresh */ }
  G = null; showSetup();
})();
