// Checkers AI worker. Engine and level policy: Designed by MTRX™
import { search, genMoves } from './checkers-engine.js?v=5';
const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
// blunder: chance of a random legal move · depth: plies searched · noise: picks randomly among moves this close to the best
const LEVELS = {
  easy: { blunder: 0.5, depth: 2, noise: 40, time: 800 },
  medium: { blunder: 0.18, depth: 3, noise: 20, time: 800 },
  intermediate: { blunder: 0.05, depth: 5, noise: 8, time: 1200 },
  hard: { blunder: 0, depth: 7, noise: 3, time: 1500, opening: 15 },
  expert: { blunder: 0, depth: 14, noise: 0, time: 1500, opening: 8 },
  hint: { blunder: 0, depth: 9, noise: 0, time: 1200 },
};
self.onmessage = ({ data }) => {
  try {
    const cfg = LEVELS[data.level] || LEVELS.medium;
    const moves = genMoves(data.state, data.forced);
    let move;
    if (moves.length && rnd() < cfg.blunder) move = moves[Math.floor(rnd() * moves.length)];
    else {
      const noise = cfg.opening && data.aiCount < 2 ? cfg.opening : cfg.noise;
      move = search(data.state, { depth: cfg.depth, forced: data.forced, timeMs: cfg.time, noise, rand: rnd }).move;
    }
    self.postMessage({ ok: true, move, id: data.id });
  } catch (e) {
    self.postMessage({ ok: false, error: String(e), id: data.id });
  }
};
