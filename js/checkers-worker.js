// Checkers AI worker. Engine: rapid-draughts (MIT, loks0n). Level policy: Designed by MTRX™
const SOURCES = ['https://cdn.jsdelivr.net/npm/rapid-draughts@1.0.6/dist/english.js', 'https://esm.sh/rapid-draughts@1.0.6/english', 'https://cdn.jsdelivr.net/npm/rapid-draughts@1.0.6/dist/english.js/+esm'];
let L;
async function load() {
  if (L) return L;
  let last;
  for (const u of SOURCES) { try { L = await import(u); return L; } catch (e) { last = e; } }
  throw last;
}
const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
// Each level: chance of a random legal move, search depth, opening ballot
const LEVELS = {
  easy: { blunder: 0.6, depth: 2 },
  medium: { blunder: 0.2, depth: 3 },
  intermediate: { blunder: 0.06, depth: 5 },
  hard: { blunder: 0, depth: 7, ballot: 1 },
  expert: { blunder: 0, depth: 9, ballot: 1 },
  hint: { blunder: 0, depth: 7 },
};
self.onmessage = async ({ data }) => {
  try {
    const { EnglishDraughts, EnglishDraughtsComputerFactory } = await load();
    const game = EnglishDraughts.setup(data.engine);
    const cfg = LEVELS[data.level] || LEVELS.medium;
    const moves = game.moves;
    let move, how;
    if (moves.length === 1) { move = moves[0]; how = 'forced'; }
    else if ((cfg.ballot && data.aiMoveCount < cfg.ballot) || rnd() < cfg.blunder) {
      move = moves[Math.floor(rnd() * moves.length)]; how = cfg.ballot ? 'ballot' : 'random';
    } else {
      const ai = EnglishDraughtsComputerFactory.alphaBeta({ maxDepth: cfg.depth, quiescence: true });
      move = await ai(game); how = 'search';
    }
    self.postMessage({ ok: true, move, how, id: data.id });
  } catch (e) {
    self.postMessage({ ok: false, error: String(e), id: data.id });
  }
};
