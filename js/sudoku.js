// MTRX™ Arcade · Sudoku v4.1. Engine: sudoku-core (MIT). UI, levels, coaching, hint ladder and shell: Designed by MTRX™
import { WORDMARK } from './wordmark.js?v=5';
import { mountLearn, rand } from './learn.js?v=5';
import { createHintSession } from './sudoku-hints.js?v=6';
import { applyTheme } from './theme.js?v=5';

const ENGINE = ['https://cdn.jsdelivr.net/npm/sudoku-core@4/+esm', 'https://esm.sh/sudoku-core@4'];
// Five levels, mapped to sudoku-core's technique-rated scale (L1 to L10)
const LEVELS = [
  { id: 'easy', name: 'Easy', core: 'L2', needs: 'Hidden singles. Scan and fill.' },
  { id: 'medium', name: 'Medium', core: 'L4', needs: 'Naked singles and pointing pairs.' },
  { id: 'intermediate', name: 'Intermediate', core: 'L5', needs: 'Naked pairs. Notes start to matter.' },
  { id: 'hard', name: 'Hard', core: 'L7', needs: 'X-Wing, Skyscraper, Two-String Kite.' },
  { id: 'expert', name: 'Expert', core: 'L8', needs: 'Y-Wing, W-Wing, colouring, unique rectangles.' },
];
const PLAY_NOTE = { practice: 'Teach me a move any time. Mistakes can show in red.', challenge: 'No coaching. Every wrong digit adds 0:30 to your time. Best times count separately.' };
const PENALTY = 30000;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s) => document.querySelector(s);
const fmt = (t) => { const s = Math.floor(t / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
$('#home').innerHTML = WORDMARK;

// ---------- preferences ----------
const P = Object.assign({ level: +(localStorage.getItem('mtrx-sudoku-level') ?? 0) || 0, play: 'practice', showMist: true }, JSON.parse(localStorage.getItem('mtrx-sd-prefs') || 'null') || {});
P.level = Math.min(4, Math.max(0, +P.level || 0)); if (P.play !== 'challenge') P.play = 'practice';
const savePrefs = () => localStorage.setItem('mtrx-sd-prefs', JSON.stringify(P));

// ---------- state ----------
let lib = null, worker = null;
let S = null; // { idx, level, seed, givens, values, notes, solution, mistakes, hints, play, clock: {ms, since, pen}, done, result, analysis }
let history = [], sel = -1, notesMode = false, hintMarks = null, paused = false, autoPaused = false;
let hs = null; // the hint ladder for the board as it stands: { sig, s }
const fx = new Map(); // cell → { cls, until, d }: short-lived effects that survive re-renders
const row = (i) => Math.floor(i / 9), col = (i) => i % 9, box = (i) => Math.floor(row(i) / 3) * 3 + Math.floor(col(i) / 3);
const peers = (i) => { const p = []; for (let j = 0; j < 81; j++) if (j !== i && (row(j) === row(i) || col(j) === col(i) || box(j) === box(i))) p.push(j); return p; };
const challenge = () => S?.play === 'challenge';
async function loadLib() { for (const u of ENGINE) { try { return await import(u); } catch { /* try next */ } } throw new Error('engine'); }

// ---------- clock ----------
const elapsed = () => (S ? S.clock.ms + (S.clock.pen || 0) + (S.clock.since ? Date.now() - S.clock.since : 0) : 0);
const startClock = () => { if (S && !S.done && !paused && !S.clock.since && overlayFree()) S.clock.since = Date.now(); };
const stopClock = () => { if (S?.clock.since) { S.clock.ms += Date.now() - S.clock.since; S.clock.since = null; } };
const bestKey = (core = S.level, play = S.play) => `mtrx-sudoku-best-${core}${play === 'challenge' ? '-c' : ''}`;
const bestFor = (k) => +(localStorage.getItem(k) || 0);
let clockShown = '';
function tick() { const t = fmt(elapsed()); if (t !== clockShown) { $('#clock').textContent = t; clockShown = t; } }
setInterval(tick, 250);
function penaltyFlash(text) {
  tick(); const pen = $('#pen'), btn = $('#clockBtn');
  pen.textContent = text; pen.classList.remove('go'); btn.classList.remove('hit'); void pen.offsetWidth; pen.classList.add('go'); btn.classList.add('hit');
}

// ---------- grid + pad ----------
const grid = $('#gridHost'), overlay = $('#overlay');
const overlayFree = () => overlay.hidden || overlay.classList.contains('leaving');
for (let i = 0; i < 81; i++) {
  const c = document.createElement('button');
  c.className = `cell r${row(i)} c${col(i)}`; c.dataset.i = i; c.setAttribute('role', 'gridcell');
  c.onclick = () => { if (!S || paused || S.done) return; sel = i; render(); };
  grid.append(c);
}
const cells = [...grid.children];
$('#pad').innerHTML = Array.from({ length: 9 }, (_, k) => `<button data-d="${k + 1}" aria-label="${k + 1}">${k + 1}<small></small></button>`).join('');
$('#pad').querySelectorAll('button').forEach((b) => (b.onclick = () => input(+b.dataset.d)));
$('#notesBtn').onclick = () => { if (!S || paused) return; notesMode = !notesMode; render(); };
$('#eraseBtn').onclick = () => input(0);
$('#undoBtn').onclick = undo;
$('#hintBtn').onclick = teach;
$('#clockBtn').onclick = togglePause;

function setStatus(t, cls = '') { const el = $('#status'); if (el.textContent === t && el.dataset.cls === cls) return; el.textContent = t; el.dataset.cls = cls; el.className = 'status-line ' + cls; if (t) { void el.offsetWidth; el.classList.add('fade'); } }
function effect(i, cls, d = 0, dur = 700) { if (REDUCED) return; fx.set(i, { cls, d, until: Date.now() + d + dur }); }
function wave(list, from) {
  const [r0, c0] = [row(from), col(from)];
  list.forEach((j) => effect(j, 'wave', (Math.abs(row(j) - r0) + Math.abs(col(j) - c0)) * 45, 1200));
}

// ---------- pause ----------
const running = () => S && !S.done && !paused && overlay.hidden;
function pause(why = 'button') {
  if (!S || S.done || paused) return;
  paused = true; stopClock(); save(); grid.classList.add('veil');
  if (why !== 'menu' && why !== 'setup') showPause(why);
  render();
}
function resume() {
  if (!paused) return;
  paused = false; autoPaused = false; grid.classList.remove('veil');
  if (overlay.classList.contains('pause')) hideOverlay(true);
  startClock(); render();
}
function togglePause() { if (paused) resume(); else if (running()) pause('button'); }
document.addEventListener('visibilitychange', () => { if (document.hidden && running()) { autoPaused = false; pause('away'); } });
addEventListener('pagehide', () => save());

// ---------- overlay cards on the grid ----------
function hideOverlay(soft) {
  if (overlay.hidden) return;
  if (soft && !REDUCED) {
    overlay.classList.add('leaving');
    setTimeout(() => { if (overlay.classList.contains('leaving')) { overlay.hidden = true; overlay.innerHTML = ''; overlay.className = 'overlay'; render(); } }, 360);
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
const modeLabel = () => `${LEVELS[S.idx].name}${challenge() ? ' · Challenge' : ''}`;
function showPause(why) {
  const title = why === 'back' ? 'Welcome back' : 'Paused';
  showOverlay(`<div class="ov-card" role="dialog" aria-label="${title}"><div class="mtrx-label" style="margin:0">${modeLabel()}</div><h2>${title}</h2>
    <div class="big">${fmt(elapsed())}</div><p class="note">The clock is stopped and the grid is hidden.</p>
    <button class="mtrx-btn mtrx-btn--primary go" id="resumeBtn">Resume</button><p class="hint-line">Tip: tap the clock or press P to pause any time</p></div>`, 'pause');
  overlay.querySelector('#resumeBtn').onclick = resume;
}
function showSetup() {
  const live = S && !S.done;
  if (live) pause('setup');
  showOverlay(`<div class="ov-card" role="dialog" aria-label="New puzzle"><div class="mtrx-label" style="margin:0">MTRX™ Sudoku</div><h2>New puzzle</h2>
    <div class="row"><div class="mtrx-label">Difficulty</div>${seg('level', LEVELS.map((l, i) => [i, l.name]), P.level)}<p class="opt-note" id="lvNote">${LEVELS[P.level].needs}</p></div>
    <div class="row"><div class="mtrx-label">Mode</div>${seg('play', [['practice', 'Practice'], ['challenge', 'Challenge']], P.play)}<p class="opt-note" id="plNote">${PLAY_NOTE[P.play]}</p></div>
    <button class="mtrx-btn mtrx-btn--primary go" id="goBtn">Start puzzle</button>
    <div class="sub">${live ? '<button id="ovBack">Back to my puzzle</button>' : '<button id="ovNum">Play a puzzle number</button>'}<button id="ovLearn">How to play</button></div></div>`);
  bindSegs(overlay, (k, v) => {
    if (k === 'level') { P.level = +v; overlay.querySelector('#lvNote').textContent = LEVELS[P.level].needs; }
    if (k === 'play') { P.play = v; overlay.querySelector('#plNote').textContent = PLAY_NOTE[P.play]; }
    savePrefs();
  });
  overlay.querySelector('#goBtn').onclick = () => newPuzzle();
  overlay.querySelector('#ovBack')?.addEventListener('click', () => { hideOverlay(true); resume(); });
  overlay.querySelector('#ovNum')?.addEventListener('click', () => menu.open(TAB.game));
  overlay.querySelector('#ovLearn').onclick = () => menu.open(TAB.how);
  if (!S) setStatus('Pick a level and a mode to start');
}
function showResult() {
  const r = S.result; if (!r) return;
  const best = bestFor(bestKey());
  const pen = challenge() && S.mistakes ? ` (+${fmt(S.mistakes * PENALTY)})` : '';
  showOverlay(`<div class="ov-card" role="dialog" aria-label="Solved"><div class="mtrx-label" style="margin:0">${modeLabel()}</div><h2>Solved</h2>
    <div class="big">${fmt(r.time)}</div>
    <p class="note">${S.mistakes} mistake${S.mistakes === 1 ? '' : 's'}${pen}${challenge() ? '' : ` · ${S.hints} hint${S.hints === 1 ? '' : 's'}`}${r.newBest ? ' · <span class="badge">New best time</span>' : best ? ` · best ${fmt(best)}` : ''}<br>Puzzle <b class="pnum">${S.level}-${S.seed}</b></p>
    <button class="mtrx-btn mtrx-btn--primary go" id="againBtn">Next ${LEVELS[S.idx].name.toLowerCase()} puzzle</button>
    <div class="sub"><button id="viewBtn">Look at the grid</button><button id="changeBtn">New game</button></div></div>`);
  overlay.querySelector('#againBtn').onclick = () => newPuzzle(undefined, S.idx, undefined, S.play);
  overlay.querySelector('#viewBtn').onclick = () => { hideOverlay(true); setStatus('Solved. Open the menu for a new puzzle.', 'win'); };
  overlay.querySelector('#changeBtn').onclick = showSetup;
}
function showBuilding(L) {
  showOverlay(`<div class="ov-card" role="dialog" aria-label="Building"><div class="mtrx-label" style="margin:0">${L.name}</div><h2>Building your puzzle</h2>
    <p class="note">${L.needs} Every puzzle has exactly one solution. Harder levels can take a few seconds.</p><div class="building"><span class="spin"></span>Checking it is unique</div></div>`);
}

// ---------- play ----------
function snapshot() { return { values: S.values.slice(), notes: S.notes.map((n) => new Set(n)) }; }
function input(d) {
  if (!S || S.done || paused || sel < 0 || S.givens[sel] != null) return;
  history.push(snapshot());
  const before = S.values[sel];
  if (d === 0) { S.values[sel] = null; S.notes[sel].clear(); }
  else if (notesMode) { if (S.values[sel] == null) S.notes[sel].has(d) ? S.notes[sel].delete(d) : S.notes[sel].add(d); }
  else {
    S.values[sel] = S.values[sel] === d ? null : d;
    if (S.values[sel] != null) {
      S.notes[sel].clear();
      if (S.values[sel] !== S.solution[sel]) {
        S.mistakes++; effect(sel, 'shake', 0, 450);
        if (challenge()) { S.clock.pen = (S.clock.pen || 0) + PENALTY; penaltyFlash('+0:30'); }
      } else {
        peers(sel).forEach((p) => S.notes[p].delete(d)); // tidy notes on a correct placement
        effect(sel, 'pop', 0, 560);
        const ok = (j) => S.values[j] === S.solution[j];
        const units = [[...Array(9)].map((_, k) => row(sel) * 9 + k), [...Array(9)].map((_, k) => k * 9 + col(sel)),
          [...Array(9)].map((_, k) => (Math.floor(box(sel) / 3) * 3 + Math.floor(k / 3)) * 9 + (box(sel) % 3) * 3 + (k % 3))];
        const done = units.filter((u) => u.every(ok)).flat();
        if (done.length) wave([...new Set(done)], sel); // a soft wave runs across any row, column or box you just finished
      }
    }
  }
  if (S.values[sel] !== before) clearHint(); // the board moved on, so the next Teach me starts a fresh ladder
  startClock(); checkWin(); render(); save();
}
function undo() { if (!S || !history.length || S.done || paused) return; const h = history.pop(); S.values = h.values; S.notes = h.notes; clearHint(); render(); save(); }

addEventListener('keydown', (e) => {
  if (!S || e.target.closest('.drawer') || e.target.closest('input') || menu.isOpen()) return;
  if (e.key === 'p' || e.key === 'P') return togglePause();
  if (paused) return;
  if (/^[1-9]$/.test(e.key)) input(+e.key);
  else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') input(0);
  else if (e.key.toLowerCase() === 'n') { notesMode = !notesMode; render(); }
  else if (e.key.toLowerCase() === 'z' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); undo(); }
  else if (e.key.startsWith('Arrow')) {
    if (sel < 0) sel = 40;
    const r = row(sel), c = col(sel);
    const [dr, dc] = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    sel = ((r + dr + 9) % 9) * 9 + ((c + dc + 9) % 9); e.preventDefault(); render();
  }
});

function render() {
  const now = Date.now();
  if (!S) {
    cells.forEach((c, i) => { c.className = `cell r${row(i)} c${col(i)}`; if (c._k !== '') { c.textContent = ''; c._k = ''; } });
  } else {
    const showMist = challenge() || P.showMist;
    const selVal = sel >= 0 ? S.values[sel] : null;
    const pset = sel >= 0 ? new Set(peers(sel)) : new Set();
    cells.forEach((c, i) => {
      const v = S.values[i], g = S.givens[i] != null;
      let cls = `cell r${row(i)} c${col(i)}` + (g ? ' given' : v != null ? ' entry' : '');
      if (!paused) {
        if (pset.has(i)) cls += ' peer';
        if (selVal != null && v === selVal) cls += ' same';
        if (i === sel) cls += ' sel';
        if (hintMarks) {
          if (hintMarks.region.has(i)) cls += ' hint-region';
          if (hintMarks.related.has(i)) cls += ' hint-rel';
          if (hintMarks.focus === i) cls += ' hint-focus';
        }
      }
      if (!g && v != null && showMist && v !== S.solution[i]) cls += ' wrong';
      const f = fx.get(i);
      if (f && f.until > now) { cls += ' ' + f.cls; c.style.setProperty('--d', `${f.d}ms`); } else if (f) fx.delete(i);
      c.className = cls;
      // only touch the DOM when the content changes, so the pop animation is never restarted
      const mk = v == null && !paused ? hintMarks?.cand?.get(i) : null; // hint marks: x = crossed out (red), g = pattern (green)
      const k = v != null ? `v${v}` : S.notes[i].size || mk ? `n${[...S.notes[i]].sort().join('')}${mk ? `|${[...mk].map(([d, t]) => t + d).sort().join('')}` : ''}` : '';
      if (k !== c._k) {
        c._k = k;
        if (v != null) c.innerHTML = `<span class="v">${v}</span>`;
        else if (k) c.innerHTML = `<span class="notes">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => { const t = mk?.get(d); return t ? `<span class="hm ${t}">${d}</span>` : `<span>${S.notes[i].has(d) ? d : ''}</span>`; }).join('')}</span>`;
        else c.textContent = '';
      }
      c.setAttribute('aria-label', `Row ${row(i) + 1}, column ${col(i) + 1}, ${v ?? 'empty'}`);
    });
  }
  grid.classList.toggle('empty', !S);
  const counts = Array(10).fill(0); S?.values.forEach((v, i) => { if (v != null && v === S.solution[i]) counts[v]++; });
  $('#pad').querySelectorAll('button').forEach((b) => { const d = +b.dataset.d; b.classList.toggle('done', !!S && counts[d] >= 9); b.querySelector('small').textContent = S ? 9 - counts[d] || '' : ''; b.disabled = !S || paused || S.done; });
  const off = !S || paused || S.done;
  $('#notesBtn').classList.toggle('on', notesMode); $('#notesBtn').setAttribute('aria-pressed', String(notesMode)); $('#notesLbl').textContent = notesMode ? 'Notes on' : 'Notes off';
  ['#notesBtn', '#eraseBtn'].forEach((s) => ($(s).disabled = off));
  $('#undoBtn').disabled = off || !history.length;
  const ch = challenge();
  $('#hintBtn').hidden = ch; $('#tools').classList.toggle('three', ch); $('#hintBtn').disabled = off || !lib;
  const live = liveHints(), hl = live?.s.cur?.nextLabel ? `Hint ${live.s.cur.n + 1}` : 'Teach me', hb = $('#hintBtn').lastChild; // Teach me becomes Hint 2, Hint 3…
  if (hb?.nodeType === 3 && hb.textContent !== hl) hb.textContent = hl;
  // HUD
  $('#mist').textContent = S ? S.mistakes : 0; $('#hudMist').classList.toggle('bad', !!S && S.mistakes > 0);
  $('#rightLbl').textContent = ch ? 'Penalty' : 'Hints';
  $('#hints').textContent = !S ? 0 : ch ? `+${fmt(S.clock.pen || 0)}` : S.hints;
  const best = S ? bestFor(bestKey()) : 0;
  $('#clockSub').textContent = !S ? 'Sudoku' : paused ? 'Paused' : `${ch ? 'Challenge · ' : ''}${best ? `Best ${fmt(best)}` : LEVELS[S.idx].name}`;
  const cb = $('#clockBtn'); cb.disabled = !S || S.done || (!overlayFree() && !paused);
  cb.classList.toggle('paused', paused); cb.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
  $('#pz').innerHTML = paused ? '<path d="M7 4.5v15l12-7.5z"/>' : '<path d="M6.5 4.5h3.6v15H6.5zM13.9 4.5h3.6v15h-3.6z"/>';
}
// effects expire on their own; one quiet re-render picks that up
setInterval(() => { if (fx.size) render(); }, 700);

// ---------- coaching: a ladder of hints on YOUR board ----------
// Hint 1 is the easiest logical step. Not useful to you? Hint 2 builds on it, and so on, until a digit you can
// place. From a digit, the next hint finds a different cell. Tapping Teach me again climbs the same ladder.
const boardSig = () => S.values.map((v) => v || 0).join('');
const liveHints = () => (hs && S && hs.sig === boardSig() ? hs : null);
function clearHint() { hs = null; hintMarks = null; $('#hintHost').innerHTML = ''; }
function teach() {
  if (!S || S.done || !lib || paused || challenge()) return;
  const live = liveHints();
  if (live) {
    const cur = live.s.cur, h = cur?.kind === 'fix' ? null : live.s.next();
    if (h) showHint(h, true); else if (cur) showHint(cur, false); // nothing new: show the last hint again, free
    return;
  }
  hs = { sig: boardSig(), s: createHintSession({ lib, values: S.values, solution: S.solution, rand }) };
  const h = hs.s.first();
  if (h) showHint(h, true); else clearHint();
}
function showHint(h, isNew) {
  if (isNew) S.hints++;
  const cand = new Map(), mark = ([i, d], t) => { if (S.values[i] != null) return; if (!cand.has(i)) cand.set(i, new Map()); cand.get(i).set(d, t); };
  h.g.forEach((m) => mark(m, 'g')); h.x.forEach((m) => mark(m, 'x'));
  hintMarks = { region: new Set(h.region), related: new Set(h.related), focus: h.focus ?? -1, cand };
  sel = h.kind === 'elim' ? -1 : h.focus; // an elimination has no cell to fill, so clear the selection and let the marks show
  const place = (h.kind === 'place' || h.kind === 'reveal') && h.focus >= 0 && S.solution[h.focus] === h.digit;
  $('#hintHost').innerHTML = `<div class="hintcard"><div class="mtrx-label" style="margin:0">${h.tag}</div><b style="font-size:var(--text-lg)">${h.label}</b><p>${h.text}</p>
  <div class="btn-row">${place ? `<button class="mtrx-btn mtrx-btn--primary sm" id="placeIt">Place the ${h.digit}</button>` : ''}${h.nextLabel ? `<button class="mtrx-btn ${place ? 'mtrx-btn--secondary' : 'mtrx-btn--primary'} sm" id="nextHint">${h.nextLabel}</button>` : ''}<button class="mtrx-btn mtrx-btn--ghost sm" id="hideHint">Got it</button></div>${h.canSkip ? '<button class="skip-link" id="skipHint">Skip to the digit</button>' : ''}</div>`;
  $('#hideHint').onclick = () => { $('#hintHost').innerHTML = ''; hintMarks = null; render(); }; // the ladder stays: Teach me gives the next hint
  const nx = $('#nextHint'); if (nx) nx.onclick = teach;
  const sk = $('#skipHint'); if (sk) sk.onclick = () => { const live = liveHints(), h2 = live?.s.skip(); if (h2) showHint(h2, true); };
  if (place) $('#placeIt').onclick = () => { sel = h.focus; const nm = notesMode; notesMode = false; input(h.digit); notesMode = nm; };
  render(); save();
}

// ---------- lifecycle ----------
function checkWin() {
  if (S.done || !S.values.every((v, i) => v === S.solution[i])) return;
  stopClock(); S.done = true;
  const time = elapsed(), k = bestKey(), best = bestFor(k), newBest = !best || time < best;
  if (newBest) localStorage.setItem(k, time);
  S.result = { time, newBest }; sel = -1; clearHint();
  wave([...Array(81).keys()], 40);
  setStatus(`Solved in ${fmt(time)}`, 'win');
  setTimeout(() => { if (S?.done) showResult(); }, REDUCED ? 0 : 1300);
}
function save() {
  if (!S) return;
  localStorage.setItem('mtrx-sudoku2', JSON.stringify({ ...S, notes: S.notes.map((n) => [...n]), clock: { ms: elapsed() - (S.clock.pen || 0), since: null, pen: S.clock.pen || 0 } }));
}
function newPuzzle(seed, idx = P.level, coreOverride, play = P.play) {
  const L = LEVELS[idx]; const core = coreOverride || L.core;
  seed = seed ?? crypto.getRandomValues(new Uint32Array(1))[0] % 1e9;
  S = null; history = []; hs = null; hintMarks = null; sel = -1; paused = false; autoPaused = false; fx.clear();
  grid.classList.remove('veil'); $('#hintHost').innerHTML = ''; clockShown = '';
  showBuilding(L); setStatus(''); render(); tick();
  worker?.terminate();
  worker = new Worker(new URL('./sudoku-worker.js?v=5', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (!data.ok) {
      showOverlay(`<div class="ov-card"><h2>That didn't work</h2><p class="note">${data.error}</p><button class="mtrx-btn mtrx-btn--primary go" id="retry">Try again</button></div>`);
      overlay.querySelector('#retry').onclick = () => newPuzzle(undefined, idx, coreOverride, play); return;
    }
    S = { idx, level: core, seed: data.seed, givens: data.puzzle.slice(), values: data.puzzle.slice(), notes: Array.from({ length: 81 }, () => new Set()),
      solution: data.solution, mistakes: 0, hints: 0, play, clock: { ms: 0, since: null, pen: 0 }, done: false, result: null, analysis: data.analysis };
    S.givens.forEach((g, i) => { if (g != null) effect(i, 'wave', (row(i) + col(i)) * 30, 1100); }); // the grid fades in from the corner
    hideOverlay(true);
    setTimeout(() => { startClock(); render(); }, REDUCED ? 0 : 380);
    setStatus(`${L.name}${play === 'challenge' ? ' · Challenge' : ''}. Tap a cell, then a number.`); render(); save();
  };
  worker.onerror = () => showOverlay('<div class="ov-card"><h2>Blocked</h2><p class="note">Your browser blocked the puzzle builder. Refresh the page.</p></div>');
  worker.postMessage({ level: core, seed });
}
function playNumber(v) {
  const m = v && v.trim().toUpperCase().match(/^(L\d{1,2})-(\d+)$/);
  if (!m) return false;
  const i = LEVELS.findIndex((l) => l.core === m[1]);
  menu.close(); newPuzzle(+m[2], i >= 0 ? i : P.level, m[1], P.play); return true;
}

// ---------- menu: game settings + lessons ----------
function mini(spec) { // spec: {g:{idx:digit}, f:[idx], r:[idx], x:{idx:'×'}}
  let h = '<div class="mini">';
  for (let i = 0; i < 81; i++) {
    const cls = [(col(i) === 3 || col(i) === 6) ? 'b' : '', spec.f?.includes(i) ? 'f' : '', spec.r?.includes(i) ? 'r' : '', spec.x?.[i] ? 'x' : ''].join(' ');
    h += `<i class="${cls}">${spec.g?.[i] ?? spec.x?.[i] ?? ''}</i>`;
  }
  return h + '</div>';
}
const idx = (r, c) => r * 9 + c;
const TAB = { game: 0, how: 1 };
function gameTabHTML() {
  const theme = document.documentElement.dataset.theme || '';
  const a = S?.analysis || {};
  const info = S ? `<div class="lesson"><div class="mtrx-label" style="margin:0">This puzzle</div><b class="pnum" style="font-size:var(--text-lg)">${S.level}-${S.seed}</b>
    <p style="margin:6px 0 0;font-size:var(--text-sm)">${S.givens.filter((v) => v != null).length} clues · hardest technique: ${(a.hardestTechnique || '').replace(' Strategy', '') || 'singles'} · rated ${a.difficulty || S.level} by the engine. Share the number and a friend gets the same grid.</p></div>` : '';
  const rows = LEVELS.map((l) => { const p = bestFor(bestKey(l.core, 'practice')), c = bestFor(bestKey(l.core, 'challenge')); return `<tr><td>${l.name}</td><td>${p ? fmt(p) : '–'}</td><td>${c ? fmt(c) : '–'}</td></tr>`; }).join('');
  return `<div class="set"><button class="mtrx-btn mtrx-btn--primary" style="width:100%" data-act="new">New puzzle</button></div>${info}
    <div class="set"><div class="mtrx-label">Play a puzzle number</div><form class="numform" data-act="num"><input class="mtrx-input" placeholder="e.g. L4-1234567" aria-label="Puzzle number" autocapitalize="characters"><button class="mtrx-btn mtrx-btn--secondary sm" type="submit">Play</button></form><p class="opt-note" data-act="numerr" hidden>That doesn't look like a puzzle number. Try something like L4-1234567.</p></div>
    <div class="set"><label class="switch"><span><b>Show mistakes as I play</b><small>Practice only. Challenge always shows them, and each one costs 0:30.</small></span><input type="checkbox" data-act="mist" ${P.showMist ? 'checked' : ''}></label></div>
    <div class="set"><div class="mtrx-label">Theme</div>${seg('theme', [['', 'Light'], ['dark', 'Dark']], theme)}</div>
    <div class="set"><div class="mtrx-label">Best times</div><table class="bests"><tr><td></td><td class="mtrx-label">Practice</td><td class="mtrx-label">Challenge</td></tr>${rows}</table></div>`;
}
function mountGameTab(body) {
  body.querySelector('[data-act="new"]').onclick = () => { menu.close(); showSetup(); };
  body.querySelector('[data-act="mist"]').onchange = (e) => { P.showMist = e.target.checked; savePrefs(); render(); };
  body.querySelector('[data-act="num"]').onsubmit = (e) => { e.preventDefault(); if (!playNumber(e.target.querySelector('input').value)) body.querySelector('[data-act="numerr"]').hidden = false; };
  bindSegs(body, (k, v) => { if (k === 'theme') { applyTheme(v); localStorage.setItem('mtrx-theme', v); } });
}
const MODES_HTML = `<h3>Ways to play</h3>
  <div class="lesson"><b>Practice</b><p style="margin:6px 0 0"><b>Teach me</b> finds the next logical step on your board, highlights the cells it uses and explains the technique. Not useful to you? <b>Hint 2</b> builds on it, step by step, until you reach a digit you can place. Mistakes show in red if you want them to.</p></div>
  <div class="lesson"><b>Challenge</b><p style="margin:6px 0 0">No coaching. Every wrong digit adds <b>0:30</b> to your clock. Your times go on a separate best-times board.</p></div>
  <div class="lesson"><b>Pause</b><p style="margin:6px 0 0">Tap the clock or press <kbd>P</kbd>. Opening the menu or leaving the tab pauses on its own, and the grid hides until you resume.</p></div>
  <h3>The five levels</h3>`;

const menu = mountLearn({
  title: 'Sudoku', label: 'Menu',
  onOpen: () => { if (running()) { pause('menu'); autoPaused = true; } },
  onClose: () => { if (autoPaused) resume(); },
  tabs: [
    { name: 'Game', get html() { return gameTabHTML(); }, mount: mountGameTab },
    { name: 'How to play', html: `<h3>The rule</h3><p>Fill the grid so every <b>row</b>, every <b>column</b> and every <b>3×3 box</b> contains the digits 1 to 9 exactly once. Every puzzle here has <b>one solution</b>, reachable by logic alone. You never need to guess.</p>
      <h3>Controls</h3><ul><li>Tap a cell, then a number. Or type <kbd>1</kbd>–<kbd>9</kbd>.</li><li><kbd>N</kbd> toggles notes (pencil marks). <kbd>Backspace</kbd> erases. Arrow keys move.</li><li><b>Teach me</b> (Practice mode) finds the next logical step on your board, highlights the cells it uses and explains the technique. Red digits are crossed out, green ones are the pattern that proves it.</li><li>Don't want that hint? Tap <b>Hint 2</b> (or Teach me again). Each hint builds on the last until you reach a digit you can place, and <b>Skip to the digit</b> jumps straight there. From a digit, the next hint finds a different cell.</li><li>Every puzzle has a number like <b>L4-1234567</b>. Share it and a friend gets the same puzzle.</li></ul>
      ${MODES_HTML}${LEVELS.map((l) => `<div class="lesson"><b>${l.name}</b><span class="mtrx-tag lvl">${l.core}</span><p style="margin:6px 0 0">${l.needs}</p></div>`).join('')}
      <p>Levels are rated by the <b>hardest technique a puzzle actually needs</b>, not by how many clues it shows. That's why Easy is genuinely easy and Expert is genuinely hard.</p>` },
    { name: 'Core techniques', html: `
      <div class="lesson"><span class="mtrx-numeral">01</span><h3>Hidden single</h3><p>A digit that has only one possible home in a row, column or box. Here, the 5s in rows 1 and 2 block the top two rows of box 3, and the 5 in column 7 blocks one more cell, leaving one spot.</p>${mini({ g: { [idx(0, 1)]: 5, [idx(1, 4)]: 5, [idx(5, 6)]: 5, [idx(2, 8)]: 3 }, f: [idx(2, 7)], r: [idx(0, 6), idx(0, 7), idx(0, 8), idx(1, 6), idx(1, 7), idx(1, 8), idx(2, 6), idx(2, 8)] })}<p><b>Habit:</b> scan digit by digit, 1 to 9, box by box. It finds most Easy moves.</p></div>
      <div class="lesson"><span class="mtrx-numeral">02</span><h3>Naked single</h3><p>A cell where eight digits are already used by its row, column and box. Only one candidate is left, so that's the answer.</p><p><b>Habit:</b> look at cells in crowded rows and boxes first.</p></div>
      <div class="lesson"><span class="mtrx-numeral">03</span><h3>Pointing pair</h3><p>If every candidate for a digit inside a box sits in one row (or column), that digit must be in that row inside this box, so you can erase it from the rest of that row.</p></div>
      <div class="lesson"><span class="mtrx-numeral">04</span><h3>Naked pair</h3><p>Two cells in a unit that both have only the same two candidates, say {2,7}. Those two digits are locked in those two cells, so erase 2 and 7 from every other cell in that unit.</p>${mini({ g: { [idx(4, 0)]: '27', [idx(4, 5)]: '27' }, f: [idx(4, 0), idx(4, 5)], x: { [idx(4, 2)]: '×', [idx(4, 7)]: '×' } })}</div>` },
    { name: 'Advanced', html: `
      <div class="lesson"><span class="mtrx-numeral">05</span><h3>X-Wing <span class="mtrx-tag lvl">Hard</span></h3><p>A digit appears as a candidate in exactly two cells of two different rows, and those cells share the same two columns. The digit must sit on one diagonal of that rectangle, so erase it from the rest of both columns.</p>${mini({ f: [idx(1, 2), idx(1, 6), idx(6, 2), idx(6, 6)], x: { [idx(3, 2)]: '×', [idx(4, 6)]: '×', [idx(8, 2)]: '×' } })}</div>
      <div class="lesson"><span class="mtrx-numeral">06</span><h3>Skyscraper and Two-String Kite <span class="mtrx-tag lvl">Hard</span></h3><p>Two "strong links" (a digit with only two spots in a unit) that share one end. One of the two far ends must be true, so any cell that sees both far ends can't hold the digit.</p></div>
      <div class="lesson"><span class="mtrx-numeral">07</span><h3>Y-Wing <span class="mtrx-tag lvl">Expert</span></h3><p>A pivot cell {A,B} sees two wings {A,C} and {B,C}. Whatever the pivot is, one wing becomes C. So any cell that sees both wings can't be C.</p></div>
      <div class="lesson"><span class="mtrx-numeral">08</span><h3>Simple colouring <span class="mtrx-tag lvl">Expert</span></h3><p>Follow a chain of strong links for one digit and colour the cells in two alternating colours. If two cells of the same colour see each other, that whole colour is false.</p></div>
      <div class="lesson"><span class="mtrx-numeral">09</span><h3>Unique rectangle <span class="mtrx-tag lvl">Expert</span></h3><p>Four cells across two rows, two columns and two boxes can't all be the same pair, because then the puzzle would have two solutions. Use that to remove the pair from the odd corner.</p></div>` },
    { name: 'Strategy', html: `<h3>A pro's order of attack</h3><ul>
      <li><b>1. Sweep singles first.</b> Run 1 to 9 across all boxes before writing a single note. It's fast and clears the board.</li>
      <li><b>2. Notes only when stuck.</b> On Intermediate and up, fill full candidates once, then keep them honest: erase as you place.</li>
      <li><b>3. Hunt pairs in crowded units.</b> Rows or boxes with three or four empty cells give up naked and hidden pairs.</li>
      <li><b>4. One digit at a time for fish.</b> For X-Wing and Skyscraper, look at a single digit across the whole grid and ignore everything else.</li>
      <li><b>5. Never guess.</b> If you're stuck, use <b>Teach me</b>. It explains the exact technique the position needs.</li></ul>
      <h3>Speed habits</h3><ul><li>Work the digit that's already placed most often: it has the fewest homes left.</li><li>After each placement, check its row, column and box for new singles.</li><li>Use the counter under each number button: when it shows 1, find that last home.</li></ul>` },
  ],
});
$('#learnBtn').onclick = () => menu.open(TAB.how);
$('#menuBtn').onclick = () => menu.open(TAB.game);

// ---------- boot: resume a puzzle in progress (paused), or show the setup card ----------
(() => {
  loadLib().then((l) => { lib = l; render(); }).catch(() => { if (!challenge()) setStatus('Teach me needs the engine, which did not load. Check your connection.', 'lose'); });
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem('mtrx-sudoku2') || 'null');
    if (!saved) { // carry over a puzzle from the previous version
      const old = JSON.parse(localStorage.getItem('mtrx-sudoku-save') || 'null');
      if (old && !old.done && old.solution) saved = { ...old, idx: Math.max(0, LEVELS.findIndex((l) => l.core === old.level)), play: 'practice', clock: { ms: old.elapsed || 0, since: null, pen: 0 } };
      localStorage.removeItem('mtrx-sudoku-save');
    }
  } catch { saved = null; }
  if (saved && !saved.done && saved.solution?.length === 81) {
    S = { ...saved, idx: saved.idx ?? 0, play: saved.play === 'challenge' ? 'challenge' : 'practice', notes: saved.notes.map((n) => new Set(n)), clock: { ms: saved.clock?.ms || 0, since: null, pen: saved.clock?.pen || 0 }, result: null };
    setStatus(`${modeLabel()}. Your puzzle is where you left it.`); render(); tick();
    pause('back');
  } else { render(); showSetup(); }
})();
