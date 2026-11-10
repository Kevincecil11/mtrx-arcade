// MTRX™ Arcade · Crossword puzzle builder: picks words, lays them out with Michael Wehar's MIT generator,
// then checks and tidies the grid. Designed by MTRX™
import { generateLayout } from './vendor/crossword-layout.js';
import { rand } from './learn.js?v=5';

const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const cellsOf = (w) => [...w.answer].map((ch, k) => [w.row + (w.dir === 'down' ? k : 0), w.col + (w.dir === 'across' ? k : 0), ch]);

// Every run of 2+ letters must be a real entry, letters must agree, and the grid must be one connected piece.
export function check(words) {
  const g = new Map();
  for (const w of words) for (const [r, c, ch] of cellsOf(w)) { const k = `${r},${c}`; if (g.has(k) && g.get(k) !== ch) return null; g.set(k, ch); }
  const starts = new Set(words.map((w) => `${w.dir}:${w.row},${w.col},${w.answer.length}`));
  let R = 0, C = 0, r0 = Infinity, c0 = Infinity;
  for (const k of g.keys()) { const [r, c] = k.split(',').map(Number); R = Math.max(R, r + 1); C = Math.max(C, c + 1); r0 = Math.min(r0, r); c0 = Math.min(c0, c); }
  for (let r = r0; r < R; r++) for (let c = c0; c < C;) { if (!g.has(`${r},${c}`)) { c++; continue; } const s = c; while (g.has(`${r},${c}`)) c++; if (c - s > 1 && !starts.has(`across:${r},${s},${c - s}`)) return null; }
  for (let c = c0; c < C; c++) for (let r = r0; r < R;) { if (!g.has(`${r},${c}`)) { r++; continue; } const s = r; while (g.has(`${r},${c}`)) r++; if (r - s > 1 && !starts.has(`down:${s},${c},${r - s}`)) return null; }
  const keys = [...g.keys()], seen = new Set([keys[0]]), q = [keys[0]];
  while (q.length) { const [r, c] = q.pop().split(',').map(Number); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = `${r + a},${c + b}`; if (g.has(k) && !seen.has(k)) { seen.add(k); q.push(k); } } }
  if (seen.size !== g.size) return null;
  return { rows: R - r0, cols: C - c0, r0, c0, cells: g.size };
}
const crossings = (w, words) => { const mine = new Set(cellsOf(w).map(([r, c]) => `${r},${c}`)); let n = 0; for (const o of words) if (o !== w) for (const [r, c] of cellsOf(o)) if (mine.has(`${r},${c}`)) n++; return n; };
// Drop outlying words until the grid fits, never breaking it apart.
function shrink(words, max, min) {
  let cur = words, info = check(cur);
  while (info && (info.rows > max || info.cols > max) && cur.length > min) {
    const edge = (w) => cellsOf(w).some(([r, c]) => (info.rows > max && (r === info.r0 || r === info.r0 + info.rows - 1)) || (info.cols > max && (c === info.c0 || c === info.c0 + info.cols - 1)));
    const opts = shuffle(cur.filter(edge)).sort((a, b) => crossings(a, cur) - crossings(b, cur));
    let next = null;
    for (const w of opts) { const t = cur.filter((x) => x !== w), ti = check(t); if (ti) { next = t; info = ti; break; } }
    if (!next) return null;
    cur = next;
  }
  return info && info.rows <= max && info.cols <= max ? { words: cur, info } : null;
}
// Build a puzzle from a bank. Unseen words go first so you don't meet the same answers every game.
export function buildPuzzle(bank, { n, max, seen = [] }) {
  const seenSet = new Set(seen);
  for (let t = 0; t < 60; t++) {
    const fresh = shuffle(bank.filter((e) => !seenSet.has(e.a))), old = shuffle(bank.filter((e) => seenSet.has(e.a)));
    const cand = [...fresh, ...old].slice(0, n + 3);
    const L = generateLayout(cand.map((e) => ({ answer: e.a.toLowerCase(), clue: e.c })));
    let placed = L.result.filter((w) => w.orientation !== 'none').map((w) => ({ answer: w.answer.toUpperCase(), clue: w.clue, row: w.starty - 1, col: w.startx - 1, dir: w.orientation }));
    if (placed.length < n - 1) continue;
    const s = shrink(placed, max, n - 1); if (!s) continue;
    placed = s.words.map((w) => ({ ...w, row: w.row - s.info.r0, col: w.col - s.info.c0 }));
    // standard numbering: left to right, top to bottom, one number per starting square
    const startKeys = [...new Set(placed.map((w) => `${w.row},${w.col}`))].sort((a, b) => { const [ar, ac] = a.split(',').map(Number), [br, bc] = b.split(',').map(Number); return ar - br || ac - bc; });
    const num = new Map(startKeys.map((k, i) => [k, i + 1]));
    placed.forEach((w) => (w.num = num.get(`${w.row},${w.col}`)));
    placed.sort((a, b) => (a.dir === b.dir ? a.num - b.num : a.dir === 'across' ? -1 : 1));
    return { rows: s.info.rows, cols: s.info.cols, words: placed };
  }
  return null;
}
