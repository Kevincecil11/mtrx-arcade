// MTRX™ Arcade · Go thinking happens here, off the main thread. Designed by MTRX™
import { decide, engineFor, GO_LEVELS } from './go-ai.js?v=6';
const toPos = (p) => ({ ...p, b: Uint8Array.from(p.b) });
onmessage = ({ data }) => {
  const { id, type, N } = data;
  try {
    const go = engineFor(N), pos = toPos(data.pos);
    if (type === 'move') { const d = decide(N, pos, data.level, data.opts || {}); postMessage({ id, move: d.move, winrate: d.winrate }); }
    else if (type === 'hint') { const r = go.search(pos, { sims: GO_LEVELS.hint.sims * (N >= 13 ? 0.6 : 1), timeMs: GO_LEVELS.hint.time }); postMessage({ id, move: r.move, winrate: r.winrate }); }
    else if (type === 'own') { postMessage({ id, owner: Array.from(go.ownership(pos, data.n || 300)) }); }
  } catch (e) { postMessage({ id, error: String(e?.message || e) }); }
};
