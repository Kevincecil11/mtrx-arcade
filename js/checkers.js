// MTRX™ Arcade · Checkers. Rules + AI search: rapid-draughts (MIT). UI and level design: Designed by MTRX™
import { WORDMARK } from './wordmark.js';
import { mountLearn } from './learn.js';

const ENGINE = ['https://cdn.jsdelivr.net/npm/rapid-draughts@1.0.6/dist/english.js', 'https://esm.sh/rapid-draughts@1.0.6/english', 'https://cdn.jsdelivr.net/npm/rapid-draughts@1.0.6/dist/english.js/+esm'];
const LEVELS = [
  { id: 'easy', name: 'Easy', note: 'Plays a random legal move about 6 times in 10. Great for learning the rules.' },
  { id: 'medium', name: 'Medium', note: 'Looks 3 moves ahead, still slips about 1 move in 5.' },
  { id: 'intermediate', name: 'Intermediate', note: 'Looks 5 moves ahead, rare slips. Punishes loose pieces.' },
  { id: 'hard', name: 'Hard', note: 'Looks 7 moves ahead, no slips. Random opening, so every game differs.' },
  { id: 'expert', name: 'Expert', note: 'Looks 9 moves ahead with full capture search. Random opening ballot, like tournament play.' },
];
const $ = (s) => document.querySelector(s);
$('#home').innerHTML = WORDMARK;
const setTheme = (t) => { document.body.dataset.theme = t; localStorage.setItem('mtrx-theme', t);
  document.querySelectorAll('#themeSeg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.t === t)); };
document.querySelectorAll('#themeSeg button').forEach((b) => (b.onclick = () => setTheme(b.dataset.t)));
setTheme(localStorage.getItem('mtrx-theme') || '');

let lib, game, human = localStorage.getItem('mtrx-checkers-side') || 'dark';
let levelIdx = +(localStorage.getItem('mtrx-checkers-level') ?? 1);
let selected = null, lastMove = null, hintMove = null, thinking = false, reqId = 0, aiMoveCount = 0, flip = false;
let undoStack = [], log = [], drill = null;
const worker = new Worker(new URL('./checkers-worker.js', import.meta.url), { type: 'module' });
const ai = () => (human === 'dark' ? 'light' : 'dark');
const sameMove = (a, b) => a.origin === b.origin && a.destination === b.destination && a.captures.length === b.captures.length && a.captures.every((c) => b.captures.includes(c));
const clone = (o) => JSON.parse(JSON.stringify(o));

$('#diffSeg').innerHTML = LEVELS.map((l, i) => `<button aria-pressed="${i === levelIdx}" data-i="${i}">${l.name}</button>`).join('');
$('#diffSeg').querySelectorAll('button').forEach((b) => (b.onclick = () => {
  levelIdx = +b.dataset.i; localStorage.setItem('mtrx-checkers-level', levelIdx);
  $('#diffSeg').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
  newGame();
}));
document.querySelectorAll('#sideSeg button').forEach((b) => {
  b.setAttribute('aria-pressed', b.dataset.s === human);
  b.onclick = () => { human = b.dataset.s; localStorage.setItem('mtrx-checkers-side', human);
    document.querySelectorAll('#sideSeg button').forEach((x) => x.setAttribute('aria-pressed', x === b)); newGame(); };
});
$('#newBtn').onclick = () => newGame();
$('#undoBtn').onclick = undo;
$('#hintBtn').onclick = askHint;

const boardEl = $('#board');
function setStatus(t, cls = '') { const el = $('#status'); el.textContent = t; el.className = 'status ' + cls; }

function orient() { // put the human's men at the bottom
  const b = game.board; let top = 0, count = 0;
  b.forEach((sq, i) => { if (sq.piece && sq.piece.player === human) { top += Math.floor(i / 8); count++; } });
  flip = count ? top / count < 3.5 : false;
}

function render() {
  const b = game.board; const moves = game.player === human && !thinking ? game.moves : [];
  const movers = new Set(moves.map((m) => m.origin));
  const dests = selected != null ? moves.filter((m) => m.origin === selected) : [];
  boardEl.innerHTML = '';
  const order = [...b.keys()]; if (flip) order.reverse();
  for (const i of order) {
    const sq = b[i]; const el = document.createElement('div');
    el.className = 'sq ' + (sq.dark ? 'dark' : 'light');
    if (sq.dark) {
      const p = sq.position;
      if (lastMove && (lastMove.origin === p || lastMove.destination === p)) el.classList.add('last');
      if (lastMove && lastMove.captures.includes(p)) el.classList.add('cap');
      if (dests.some((m) => m.destination === p)) el.classList.add('dest');
      if (hintMove && (hintMove.origin === p || hintMove.destination === p)) el.classList.add('hintsq');
      if (sq.piece) {
        const pc = document.createElement('div');
        pc.className = 'pc ' + (sq.piece.player === 'dark' ? 'dk' : 'lt');
        if (sq.piece.king) pc.textContent = 'K';
        if (movers.has(p)) pc.classList.add('mov');
        if (selected === p) pc.classList.add('selp');
        el.append(pc);
      }
      el.onclick = () => click(p);
      el.setAttribute('aria-label', `square ${p + 1}${sq.piece ? ', ' + (sq.piece.player === 'dark' ? 'Mars' : 'Canvas') + (sq.piece.king ? ' king' : '') : ''}`);
    }
    boardEl.append(el);
  }
  let d = 0, l = 0; b.forEach((sq) => { if (sq.piece) sq.piece.player === 'dark' ? d++ : l++; });
  $('#capD').textContent = d; $('#capL').textContent = l;
  $('#moves').innerHTML = log.map((m) => `<li>${m}</li>`).join('');
  $('#moves').scrollTop = 1e6;
  $('#youLabel').textContent = `You: ${human === 'dark' ? 'Mars' : 'Canvas'}, moving up`;
}

function click(p) {
  if (thinking || game.status !== 'playing' || game.player !== human) return;
  const moves = game.moves;
  if (selected != null) {
    const m = moves.find((x) => x.origin === selected && x.destination === p);
    if (m) return play(m, true);
  }
  if (moves.some((m) => m.origin === p)) { selected = p; hintMove = null; render(); }
  else if (moves.length && moves[0].captures.length && game.board.find((s) => s.position === p)?.piece?.player === human) {
    setStatus('A capture is available. In checkers, taking is compulsory.');
  }
}

function notation(m) { return `${m.origin + 1}${m.captures.length ? '×' : '–'}${m.destination + 1}`; }
function play(m, byHuman) {
  if (byHuman) undoStack.push({ data: clone(game.engine.data), log: log.slice(), aiMoveCount, lastMove });
  game.move(m); lastMove = m; selected = null; hintMove = null;
  log.push(`${byHuman ? 'You' : 'AI'} ${notation(m)}`);
  if (!byHuman) aiMoveCount++;
  render(); afterMove();
}

function afterMove() {
  const st = game.status;
  if (st !== 'playing') {
    const won = (st === 'dark_won' && human === 'dark') || (st === 'light_won' && human === 'light');
    const lvl = LEVELS[levelIdx].name;
    if (st === 'draw') setStatus('Draw: 40 moves each without a capture or advance.');
    else setStatus(won ? `You win against ${drill ? 'the drill' : lvl}. ${game.history.moves.length} moves.` : `${drill ? 'Drill' : lvl} wins this one. Undo and try a different line.`, won ? 'win' : 'lose');
    if (!drill && won) { const k = `mtrx-checkers-wins-${LEVELS[levelIdx].id}`; localStorage.setItem(k, +(localStorage.getItem(k) || 0) + 1); }
    return;
  }
  if (game.player === ai()) aiTurn();
  else {
    const forced = game.moves[0]?.captures.length;
    setStatus(forced ? 'Your move. You must capture.' : `Your move. ${drill ? drill.goal : LEVELS[levelIdx].note}`);
  }
}

function aiTurn() {
  thinking = true; render(); setStatus('Thinking…');
  const id = ++reqId;
  worker.onmessage = ({ data }) => {
    if (data.id !== id) return;
    thinking = false;
    if (!data.ok) { setStatus('The AI hit a problem. Start a new game.', 'lose'); return; }
    const m = game.moves.find((x) => sameMove(x, data.move)) || game.moves[0];
    setTimeout(() => play(m, false), 250);
  };
  worker.postMessage({ engine: clone(game.engine.data), level: drill ? 'expert' : LEVELS[levelIdx].id, aiMoveCount: drill ? 99 : aiMoveCount, id });
}

function askHint() {
  if (thinking || game.status !== 'playing' || game.player !== human) return;
  thinking = true; setStatus('Looking 7 moves ahead for you…');
  const id = ++reqId;
  worker.onmessage = ({ data }) => {
    if (data.id !== id) return;
    thinking = false;
    if (data.ok) { hintMove = game.moves.find((x) => sameMove(x, data.move)) || null; selected = hintMove?.origin ?? null; }
    setStatus(hintMove ? `Suggested: ${notation(hintMove)}. Tap the glowing square to play it.` : 'No suggestion.'); render();
  };
  worker.postMessage({ engine: clone(game.engine.data), level: 'hint', aiMoveCount: 99, id });
}

function undo() {
  if (!undoStack.length) return;
  reqId++; thinking = false;
  const s = undoStack.pop();
  game = lib.EnglishDraughts.setup(s.data); log = s.log; aiMoveCount = s.aiMoveCount; lastMove = s.lastMove; selected = null; hintMove = null;
  render(); afterMove();
}

function newGame(setupData, drillInfo) {
  reqId++; thinking = false; drill = drillInfo || null;
  game = lib.EnglishDraughts.setup(setupData); undoStack = []; log = []; aiMoveCount = 0; lastMove = null; selected = null; hintMove = null;
  if (drill) human = 'dark';
  orient(); render(); afterMove();
}

// ---------- drills: endgames every player must know ----------
const LAYOUT = [11, 5, 31, 25, 10, 4, 30, 24, 3, 29, 23, 17, 2, 28, 22, 16, 27, 21, 15, 9, 26, 20, 14, 8, 19, 13, 7, 1, 18, 12, 6, 0];
const pos = (r, c) => r * 4 + (r % 2 === 0 ? (c - 1) / 2 : c / 2);
const bits = (list) => list.reduce((acc, [r, c]) => acc | lib.EnglishDraughtsBitSquare[LAYOUT[pos(r, c)]], 0);
const DRILLS = [
  { name: 'Two kings vs one', goal: 'Drive the lone king out of the double corner and trap it.', dark: [[4, 3], [5, 6]], light: [[0, 7]] },
  { name: 'Three kings vs two', goal: 'Trade one king off, then win two against one.', dark: [[5, 0], [6, 3], [7, 6]], light: [[0, 1], [1, 4]] },
  { name: 'Two kings vs one, open board', goal: 'Cut the board in half and push the king to an edge.', dark: [[7, 0], [6, 1]], light: [[2, 5]] },
];
function startDrill(i) {
  const d = DRILLS[i]; const dk = bits(d.dark), lt = bits(d.light);
  newGame({ player: 'dark', board: { dark: dk, light: lt, king: dk | lt }, stats: { sinceCapture: 0, sinceNonKingAdvance: 0 } }, d);
  learn.close();
}

const learn = mountLearn({
  title: 'Checkers', tabs: [
    { name: 'How to play', html: `<h3>The board</h3><p>Two players, 12 pieces each, on the dark squares of an 8×8 board. <b>Mars moves first.</b> Pieces move one square diagonally <b>forward</b>.</p>
      <h3>Capturing</h3><ul><li>Jump diagonally over an enemy piece onto the empty square behind it. The jumped piece is removed.</li><li><b>Capturing is compulsory.</b> If any capture is available, you must take one.</li><li>If, after a jump, another jump is available, you must <b>keep jumping</b> in the same turn. The board does this in one tap.</li></ul>
      <h3>Kings</h3><p>Reach the far row and your piece is crowned (<b>K</b>). Kings move and capture <b>forwards and backwards</b>, one square at a time.</p>
      <h3>Winning</h3><p>You win when your opponent has no legal move: every piece captured or blocked. If 40 moves pass for each side with no capture, the game is a draw.</p>
      <h3>The five levels</h3>${LEVELS.map((l) => `<div class="lesson"><b>${l.name}</b><p style="margin:6px 0 0">${l.note}</p></div>`).join('')}` },
    { name: 'Strategy', html: `
      <div class="lesson"><span class="mtrx-numeral">01</span><h3>Own the centre</h3><p>The four middle squares give your pieces two forward options instead of one. Pieces on the edge can only move one way and are easy to trap.</p></div>
      <div class="lesson"><span class="mtrx-numeral">02</span><h3>Guard your back row</h3><p>Keep two back-row pieces home for as long as you can (the "bridge"). While they stay, your opponent can't crown. Release them late, one at a time.</p></div>
      <div class="lesson"><span class="mtrx-numeral">03</span><h3>Move in pairs</h3><p>A piece backed up diagonally can't be jumped from the front. Advance as a wedge, not a line of singles.</p></div>
      <div class="lesson"><span class="mtrx-numeral">04</span><h3>Trade when you're ahead</h3><p>Every even trade makes your extra piece worth more. Up one piece with 4 against 3 is far easier to win than 12 against 11.</p></div>
      <div class="lesson"><span class="mtrx-numeral">05</span><h3>Count before you push</h3><p>Before any move, ask: what can my opponent jump next turn, and what does compulsory capture force me to take? Most games are lost to a forced capture that walks into a double jump.</p></div>` },
    { name: 'Tactics', html: `
      <div class="lesson"><span class="mtrx-numeral">06</span><h3>The shot (2 for 1)</h3><p>Offer one piece on purpose. Your opponent must capture, and the capture lands their piece where you jump two. Compulsory capture is your weapon.</p></div>
      <div class="lesson"><span class="mtrx-numeral">07</span><h3>The breeches</h3><p>A king that sits between two enemy men so that it threatens both. Only one can be saved.</p></div>
      <div class="lesson"><span class="mtrx-numeral">08</span><h3>Tempo and "the move"</h3><p>In endgames, whoever has to move into the gap loses. Count the free moves each side has. If you're short, waste a move with a king to hand the problem back.</p></div>
      <div class="lesson"><span class="mtrx-numeral">09</span><h3>The double corner</h3><p>The two corners with two dark squares side by side are a lone king's safe house. To win, you must use two kings to force it out. Practise it in Drills.</p></div>` },
    { name: 'Drills', html: `<p>Real endgame positions against the Expert engine. You play Mars. Finish before the 40-move draw rule.</p>${DRILLS.map((d, i) => `<div class="lesson"><span class="mtrx-numeral">${String(i + 1).padStart(2, '0')}</span><h3>${d.name}</h3><p>${d.goal}</p><button class="mtrx-btn mtrx-btn--primary sm" data-drill="${i}">Start drill</button></div>`).join('')}`,
      mount: (body) => body.querySelectorAll('[data-drill]').forEach((b) => (b.onclick = () => startDrill(+b.dataset.drill))) },
  ],
});
$('#learnBtn').onclick = () => learn.open(0);

(async () => {
  for (const u of ENGINE) { try { lib = await import(u); break; } catch { /* next */ } }
  if (!lib) { setStatus('Could not load the checkers engine. Check your connection and refresh.', 'lose'); return; }
  newGame();
})();
