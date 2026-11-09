// MTRX™ Arcade · Sudoku. Engine: sudoku-core (MIT). UI: Designed by MTRX™
import { WORDMARK } from './wordmark.js?v=3';
import { mountLearn, randInt } from './learn.js?v=3';
import { mountThemeToggle } from './theme.js?v=3';

const ENGINE = ['https://cdn.jsdelivr.net/npm/sudoku-core@4/+esm', 'https://esm.sh/sudoku-core@4'];
// Five levels, mapped to sudoku-core's technique-rated scale (L1 to L10)
const LEVELS = [
  { id: 'easy', name: 'Easy', core: 'L2', needs: 'Hidden singles. Scan and fill.' },
  { id: 'medium', name: 'Medium', core: 'L4', needs: 'Naked singles and pointing pairs.' },
  { id: 'intermediate', name: 'Intermediate', core: 'L5', needs: 'Naked pairs. Notes start to matter.' },
  { id: 'hard', name: 'Hard', core: 'L7', needs: 'X-Wing, Skyscraper, Two-String Kite.' },
  { id: 'expert', name: 'Expert', core: 'L8', needs: 'Y-Wing, W-Wing, colouring, unique rectangles.' },
];
const $ = (s) => document.querySelector(s);
$('#home').innerHTML = WORDMARK;

// ---------- theme ----------
mountThemeToggle();

// ---------- state ----------
let lib = null, worker = null;
let S = null; // { level, seed, givens, values, notes, solution, history, mistakes, hints, start, elapsed, done }
let sel = -1, notesMode = false, hintMarks = null;
const row = (i) => Math.floor(i / 9), col = (i) => i % 9, box = (i) => Math.floor(row(i) / 3) * 3 + Math.floor(col(i) / 3);
const peers = (i) => { const p = []; for (let j = 0; j < 81; j++) if (j !== i && (row(j) === row(i) || col(j) === col(i) || box(j) === box(i))) p.push(j); return p; };

async function loadLib() {
  for (const u of ENGINE) { try { return await import(u); } catch (e) { /* try next */ } }
  throw new Error('engine');
}

// ---------- difficulty picker ----------
let levelIdx = +(localStorage.getItem('mtrx-sudoku-level') ?? 0);
$('#diffSeg').innerHTML = LEVELS.map((l, i) => `<button aria-pressed="${i === levelIdx}" data-i="${i}">${l.name}</button>`).join('');
$('#diffSeg').querySelectorAll('button').forEach((b) => (b.onclick = () => {
  levelIdx = +b.dataset.i; localStorage.setItem('mtrx-sudoku-level', levelIdx);
  $('#diffSeg').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
  newPuzzle();
}));

// ---------- grid ----------
const grid = $('#gridHost');
for (let i = 0; i < 81; i++) {
  const c = document.createElement('button');
  c.className = `cell r${row(i)} c${col(i)}`; c.dataset.i = i; c.setAttribute('role', 'gridcell');
  c.onclick = () => { sel = i; render(); };
  grid.append(c);
}
const cells = [...grid.children];
$('#pad').innerHTML = Array.from({ length: 9 }, (_, k) => `<button data-d="${k + 1}">${k + 1}<small></small></button>`).join('');
$('#pad').querySelectorAll('button').forEach((b) => (b.onclick = () => input(+b.dataset.d)));
$('#notesBtn').onclick = () => { notesMode = !notesMode; render(); };
$('#eraseBtn').onclick = () => input(0);
$('#undoBtn').onclick = undo;
$('#hintBtn').onclick = teach;
$('#newBtn').onclick = () => newPuzzle();
$('#replayBtn').onclick = () => {
  const v = prompt('Enter a puzzle number, e.g. L4-1234567');
  const m = v && v.trim().toUpperCase().match(/^(L\d{1,2})-(\d+)$/);
  if (!m) return;
  const idx = LEVELS.findIndex((l) => l.core === m[1]);
  newPuzzle(+m[2], idx >= 0 ? idx : levelIdx, m[1]);
};
$('#showMist').onchange = render;

function snapshot() { return { values: S.values.slice(), notes: S.notes.map((n) => new Set(n)) }; }
function input(d) {
  if (!S || S.done || sel < 0 || S.givens[sel] != null) return;
  hintMarks = null;
  S.history.push(snapshot());
  if (d === 0) { S.values[sel] = null; S.notes[sel].clear(); }
  else if (notesMode) { if (S.values[sel] == null) S.notes[sel].has(d) ? S.notes[sel].delete(d) : S.notes[sel].add(d); }
  else {
    S.values[sel] = S.values[sel] === d ? null : d;
    if (S.values[sel] != null) {
      S.notes[sel].clear();
      if (S.values[sel] !== S.solution[sel]) S.mistakes++;
      else peers(sel).forEach((p) => S.notes[p].delete(d)); // tidy notes on a correct placement
    }
  }
  checkWin(); render(); save();
}
function undo() { if (!S || !S.history.length || S.done) return; const h = S.history.pop(); S.values = h.values; S.notes = h.notes; hintMarks = null; render(); save(); }

addEventListener('keydown', (e) => {
  if (!S || e.target.closest('.drawer')) return;
  if (/^[1-9]$/.test(e.key)) input(+e.key);
  else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') input(0);
  else if (e.key.toLowerCase() === 'n') { notesMode = !notesMode; render(); }
  else if (e.key.toLowerCase() === 'z' && (e.metaKey || e.ctrlKey)) undo();
  else if (e.key.startsWith('Arrow')) {
    if (sel < 0) sel = 40;
    const r = row(sel), c = col(sel);
    const [dr, dc] = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    sel = ((r + dr + 9) % 9) * 9 + ((c + dc + 9) % 9); e.preventDefault(); render();
  }
});

function render() {
  if (!S) return;
  const showMist = $('#showMist').checked;
  const selVal = sel >= 0 ? S.values[sel] : null;
  const pset = sel >= 0 ? new Set(peers(sel)) : new Set();
  cells.forEach((c, i) => {
    const v = S.values[i], g = S.givens[i] != null;
    c.className = `cell r${row(i)} c${col(i)}` + (g ? ' given' : v != null ? ' entry' : '');
    if (pset.has(i)) c.classList.add('peer');
    if (selVal != null && v === selVal) c.classList.add('same');
    if (i === sel) c.classList.add('sel');
    if (!g && v != null && showMist && v !== S.solution[i]) c.classList.add('wrong');
    if (hintMarks) {
      if (hintMarks.region.has(i)) c.classList.add('hint-region');
      if (hintMarks.related.has(i)) c.classList.add('hint-rel');
      if (hintMarks.focus === i) c.classList.add('hint-focus');
    }
    if (v != null) c.textContent = v;
    else if (S.notes[i].size) c.innerHTML = `<span class="notes">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<span>${S.notes[i].has(d) ? d : ''}</span>`).join('')}</span>`;
    else c.textContent = '';
    c.setAttribute('aria-label', `Row ${row(i) + 1}, column ${col(i) + 1}, ${v ?? 'empty'}`);
  });
  const counts = Array(10).fill(0); S.values.forEach((v, i) => { if (v != null && v === S.solution[i]) counts[v]++; });
  $('#pad').querySelectorAll('button').forEach((b) => { const d = +b.dataset.d; b.classList.toggle('done', counts[d] >= 9); b.querySelector('small').textContent = 9 - counts[d] || ''; });
  $('#notesBtn').classList.toggle('on', notesMode);
  $('#notesBtn').firstChild.textContent = notesMode ? 'Notes on ' : 'Notes ';
  $('#mist').textContent = S.mistakes; $('#hints').textContent = S.hints;
}

// ---------- coaching: real technique explanations on YOUR board ----------
function teach() {
  if (!S || S.done || !lib) return;
  const wrong = S.values.findIndex((v, i) => v != null && S.givens[i] == null && v !== S.solution[i]);
  if (wrong >= 0) {
    sel = wrong; hintMarks = { region: new Set(), related: new Set(), focus: wrong };
    showHint('Fix this cell first', `The ${S.values[wrong]} in row ${row(wrong) + 1}, column ${col(wrong) + 1} is not part of the solution. Logic can't continue from a wrong digit.`, null);
    S.hints++; render(); return;
  }
  let tip = null;
  try { tip = lib.teachHint(S.values.slice()); } catch (e) { tip = null; }
  if (!tip) {
    // fallback: reveal one cell from the unique solution
    const empty = S.values.map((v, i) => (v == null ? i : -1)).filter((i) => i >= 0);
    const i = empty[randInt(empty.length)];
    hintMarks = { region: new Set(), related: new Set(), focus: i }; sel = i;
    showHint('Reveal', `No named technique applies cleanly here, so this is the answer for row ${row(i) + 1}, column ${col(i) + 1}.`, { cell: i, digit: S.solution[i] });
  } else {
    hintMarks = { region: new Set(tip.regionCells || []), related: new Set(tip.relatedCells || []), focus: tip.focusCell ?? -1 };
    if (tip.focusCell != null) sel = tip.focusCell;
    const place = tip.digit != null && tip.focusCell != null && S.solution[tip.focusCell] === tip.digit ? { cell: tip.focusCell, digit: tip.digit } : null;
    showHint(tip.label || 'Next step', tip.explanation || 'Look at the highlighted cells.', place);
  }
  S.hints++; render(); save();
}
function showHint(title, text, place) {
  $('#hintHost').innerHTML = `<div class="hintcard"><div class="mtrx-label" style="margin:0">Technique</div><b style="font-size:var(--text-lg)">${title}</b><p>${text}</p>
  <div class="btn-row">${place ? `<button class="mtrx-btn mtrx-btn--primary sm" id="placeIt">Place the ${place.digit}</button>` : ''}<button class="mtrx-btn mtrx-btn--ghost sm" id="hideHint">Got it</button></div></div>`;
  $('#hideHint').onclick = () => { $('#hintHost').innerHTML = ''; hintMarks = null; render(); };
  if (place) $('#placeIt').onclick = () => { sel = place.cell; const nm = notesMode; notesMode = false; input(place.digit); notesMode = nm; $('#hintHost').innerHTML = ''; };
}

// ---------- lifecycle ----------
let timerId = null;
function tick() { if (!S || S.done) return; const t = S.elapsed + (Date.now() - S.start); const s = Math.floor(t / 1000); $('#time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function checkWin() {
  if (S.values.every((v, i) => v === S.solution[i])) {
    S.done = true; S.elapsed += Date.now() - S.start; tick();
    const lv = LEVELS[levelIdx].name; const key = `mtrx-sudoku-best-${S.level}`;
    const best = +(localStorage.getItem(key) || 0); const now = S.elapsed;
    if (!best || now < best) localStorage.setItem(key, now);
    setStatus(`Solved. ${lv} in ${$('#time').textContent} with ${S.mistakes} mistake${S.mistakes === 1 ? '' : 's'}${!best || now < best ? '. New best time.' : '.'}`, 'win');
  }
}
function setStatus(t, cls = '') { const el = $('#status'); el.textContent = t; el.className = 'status ' + cls; }
function save() { if (S) localStorage.setItem('mtrx-sudoku-save', JSON.stringify({ ...S, notes: S.notes.map((n) => [...n]), history: [], elapsed: S.done ? S.elapsed : S.elapsed + (Date.now() - S.start) })); }

function newPuzzle(seed, idx = levelIdx, coreOverride) {
  levelIdx = idx;
  $('#diffSeg').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', +x.dataset.i === idx));
  const L = LEVELS[idx]; const core = coreOverride || L.core;
  seed = seed ?? crypto.getRandomValues(new Uint32Array(1))[0] % 1e9;
  S = null; hintMarks = null; sel = -1; $('#hintHost').innerHTML = '';
  cells.forEach((c) => { c.textContent = ''; c.className = 'cell'; });
  setStatus(`Building a ${L.name.toLowerCase()} puzzle… harder levels can take a few seconds.`);
  worker?.terminate();
  worker = new Worker(new URL('./sudoku-worker.js?v=3', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (!data.ok) { setStatus(data.error, 'lose'); return; }
    S = { level: core, seed: data.seed, givens: data.puzzle.slice(), values: data.puzzle.slice(), notes: Array.from({ length: 81 }, () => new Set()),
      solution: data.solution, history: [], mistakes: 0, hints: 0, start: Date.now(), elapsed: 0, done: false, analysis: data.analysis };
    showMeta(); setStatus(`${L.name}. Tap a cell, then a number. ${L.needs}`); render(); save();
  };
  worker.onerror = () => setStatus('Your browser blocked the puzzle builder. Open this page from a web server, not a file.', 'lose');
  worker.postMessage({ level: core, seed });
}
function showMeta() {
  $('#pnum').textContent = `${S.level}-${S.seed}`;
  const a = S.analysis || {}; const givens = S.givens.filter((v) => v != null).length;
  $('#pinfo').textContent = `${givens} clues · hardest technique: ${(a.hardestTechnique || '').replace(' Strategy', '') || 'singles'} · rated ${a.difficulty || S.level} by the engine`;
}

// restore or start
(async () => {
  try { lib = await loadLib(); } catch { setStatus('Could not load the Sudoku engine. Check your connection and refresh.', 'lose'); }
  const saved = JSON.parse(localStorage.getItem('mtrx-sudoku-save') || 'null');
  if (saved && !saved.done) {
    S = { ...saved, notes: saved.notes.map((n) => new Set(n)), history: [], start: Date.now() };
    const idx = LEVELS.findIndex((l) => l.core === S.level); if (idx >= 0) levelIdx = idx;
    $('#diffSeg').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', +x.dataset.i === levelIdx));
    showMeta(); setStatus('Welcome back. Your puzzle is where you left it.'); render();
  } else newPuzzle();
  timerId = setInterval(tick, 500);
  addEventListener('beforeunload', save);
})();

// ---------- Learn drawer ----------
function mini(spec) { // spec: {g:{idx:digit}, f:[idx], r:[idx], x:{idx:'×'}}
  let h = '<div class="mini">';
  for (let i = 0; i < 81; i++) {
    const cls = [(col(i) === 3 || col(i) === 6) ? 'b' : '', spec.f?.includes(i) ? 'f' : '', spec.r?.includes(i) ? 'r' : '', spec.x?.[i] ? 'x' : ''].join(' ');
    h += `<i class="${cls}">${spec.g?.[i] ?? spec.x?.[i] ?? ''}</i>`;
  }
  return h + '</div>';
}
const idx = (r, c) => r * 9 + c;
const learn = mountLearn({
  title: 'Sudoku', tabs: [
    { name: 'How to play', html: `<h3>The rule</h3><p>Fill the grid so every <b>row</b>, every <b>column</b> and every <b>3×3 box</b> contains the digits 1 to 9 exactly once. Every puzzle here has <b>one solution</b>, reachable by logic alone. You never need to guess.</p>
      <h3>Controls</h3><ul><li>Tap a cell, then a number. Or type <kbd>1</kbd>–<kbd>9</kbd>.</li><li><kbd>N</kbd> toggles notes (pencil marks). <kbd>Backspace</kbd> erases. Arrow keys move.</li><li><b>Teach me a move</b> finds the next logical step on your board, highlights the cells it uses and explains the technique.</li><li>Every puzzle has a number like <b>L4-1234567</b>. Share it and a friend gets the same puzzle.</li></ul>
      <h3>The five levels</h3>${LEVELS.map((l) => `<div class="lesson"><b>${l.name}</b><span class="mtrx-tag lvl">${l.core}</span><p style="margin:6px 0 0">${l.needs}</p></div>`).join('')}
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
      <li><b>5. Never guess.</b> If you're stuck, use <b>Teach me a move</b>. It explains the exact technique the position needs.</li></ul>
      <h3>Speed habits</h3><ul><li>Work the digit that's already placed most often: it has the fewest homes left.</li><li>After each placement, check its row, column and box for new singles.</li><li>Use the counter under each number button: when it shows 1, find that last home.</li></ul>` },
  ],
});
$('#learnBtn').onclick = () => learn.open(0);
