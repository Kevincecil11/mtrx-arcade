// MTRX™ Arcade · Go AI policy on top of the Michi port. Every choice the AI makes uses crypto randomness.
// Levels differ by search size (playouts per move) and, on the two lowest, by random slips.
import { createGo } from './go-engine.js?v=6';
import { rand, randInt } from './learn.js?v=5';

export const GO_LEVELS = {
  easy: { sims: 25, slip: 0.4, time: 1200 },
  medium: { sims: 200, slip: 0.1, time: 2500 },
  intermediate: { sims: 800, time: 4000 },
  hard: { sims: 3000, time: 6500, open: 2 },
  expert: { sims: 9000, time: 10000, open: 2 },
  hint: { sims: 2500, time: 4000 },
};
const engines = {};
export const engineFor = (N) => (engines[N] ||= createGo(N));

// Estimated area result for the player to move, treating stones the playouts think are dead as captured.
// Ownership is absolute (+1 Black, -1 White), so flip it to the mover's point of view before adding komi.
export function estimate(go, pos, owner) {
  let s = 0;
  for (const c of go.POINTS) { const o = owner[c]; if (o > 0.3) s++; else if (o < -0.3) s--; }
  const black = pos.n % 2 === 0;
  return (black ? s : -s) + (black ? -pos.komi : pos.komi);
}
// Decide a move for the player to move. Returns { move: point | -1 (pass) | -2 (resign), winrate, owner }.
export function decide(N, pos, level, { aiMoves = 0, opponentPassed = false, noTime = false } = {}) {
  const go = engineFor(N), L = GO_LEVELS[level] || GO_LEVELS.medium;
  const scale = N >= 13 ? 0.6 : 1;
  const r = go.search(pos, { sims: Math.round(L.sims * scale), timeMs: noTime ? 0 : L.time });
  if (opponentPassed && estimate(go, pos, r.owner) > 0) return { move: -1, winrate: r.winrate, owner: r.owner };
  if ((level === 'hard' || level === 'expert' || level === 'intermediate') && r.winrate < 0.06 && pos.n > (N * N) / 3) return { move: -2, winrate: r.winrate, owner: r.owner };
  let mv = r.move;
  if (L.slip && mv >= 0 && rand() < L.slip) { const ms = go.sensibleMoves(pos); if (ms.length) mv = ms[randInt(ms.length)]; }
  else if (L.open && aiMoves < L.open && r.children.length > 1) { // vary the opening among near-equal choices
    const top = r.children[0].v, ok = r.children.filter((k) => k.c >= 0 && k.v >= top * 0.7);
    mv = ok[randInt(ok.length)].c;
  }
  return { move: mv, winrate: r.winrate, owner: r.owner };
}
