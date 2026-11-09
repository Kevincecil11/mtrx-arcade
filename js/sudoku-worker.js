// Sudoku generator worker. Logic: sudoku-core (MIT, Komeil Mehranfar). Designed by MTRX™
const SOURCES = ['https://cdn.jsdelivr.net/npm/sudoku-core@4/+esm', 'https://esm.sh/sudoku-core@4'];
let lib;
async function load() {
  if (lib) return lib;
  let last;
  for (const url of SOURCES) { try { lib = await import(url); return lib; } catch (e) { last = e; } }
  throw last;
}
self.onmessage = async ({ data }) => {
  const { level, seed } = data;
  try {
    const L = await load();
    let s = seed >>> 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const puzzle = L.generate(level, { seed: s, timeoutMs: 25000 });
        const solution = L.getUniqueSolution(puzzle) || L.solve(puzzle).board;
        const analysis = L.analyze(puzzle);
        self.postMessage({ ok: true, puzzle, solution, seed: s, level, analysis });
        return;
      } catch (e) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; }
    }
    self.postMessage({ ok: false, error: 'Could not build a puzzle at this level. Try again.' });
  } catch (e) {
    self.postMessage({ ok: false, error: 'Could not load the Sudoku engine. Check your connection and refresh.' });
  }
};
