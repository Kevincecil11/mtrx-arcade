// MTRX™ Arcade · builds crossword grids off the main thread so the page never freezes. Designed by MTRX™
import { buildPuzzle } from './crossword-gen.js?v=6';
import { BANK } from './crossword-clues.js?v=6';
onmessage = ({ data }) => {
  const { id, level, n, max, seen } = data;
  let p = null;
  try { p = buildPuzzle(BANK[level], { n, max, seen }); } catch (e) { postMessage({ id, error: String(e?.message || e) }); return; }
  postMessage({ id, puzzle: p });
};
