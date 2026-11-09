// MTRX™ Checkers engine: English draughts rules with optional or forced jumps, plus alpha-beta search.
// Own code (rapid-draughts can't switch compulsory capture off). Designed by MTRX™ · Property of MTRX Digital
// Board: 64 squares, index = row * 8 + col, row 0 at the top. Dark squares: (row + col) odd.
// Values: 1 black man, 2 black king, -1 white man, -2 white king. Black starts at the bottom and moves up.
export const BLACK = 1, WHITE = -1;
export const MATE = 100000;
const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const UP = DIRS.slice(0, 2), DOWN = DIRS.slice(2);
const dirsFor = (p) => (p === 2 || p === -2 ? DIRS : p > 0 ? UP : DOWN);
const onBoard = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

export function initialBoard() {
  const b = new Array(64).fill(0);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) {
    if (r < 3) b[r * 8 + c] = -1; else if (r > 4) b[r * 8 + c] = 1;
  }
  return b;
}
export const newState = (board = initialBoard(), player = BLACK) => ({ board, player, quiet: 0 });

function mk(from, path, caps, p, crown) {
  const tr = path[path.length - 1] >> 3;
  if (crown === undefined) crown = (p === 1 && tr === 0) || (p === -1 && tr === 7);
  return { from, path, caps, crown: !!crown };
}
// A move: { from, path: [landing squares...], caps: [captured squares, same order], crown }
function jumps(b, origin, p, r, c, path, caps, out) {
  let more = false;
  for (const [dr, dc] of dirsFor(p)) {
    const mr = r + dr, mc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
    if (!onBoard(lr, lc)) continue;
    const m = mr * 8 + mc, l = lr * 8 + lc;
    if (!b[m] || Math.sign(b[m]) === Math.sign(p) || caps.includes(m)) continue;
    if (b[l] && l !== origin) continue;
    more = true;
    const np = path.concat(l), nc = caps.concat(m);
    // a man that reaches the far row is crowned and the move ends (English rules)
    if ((p === 1 && lr === 0) || (p === -1 && lr === 7)) out.push(mk(origin, np, nc, p, true));
    else jumps(b, origin, p, lr, lc, np, nc, out);
  }
  if (!more && path.length) out.push(mk(origin, path, caps, p));
}
export function genMoves(s, forced = false) {
  const b = s.board, me = s.player, J = [], St = [];
  for (let sq = 0; sq < 64; sq++) {
    const p = b[sq];
    if (!p || Math.sign(p) !== me) continue;
    const r = sq >> 3, c = sq & 7;
    jumps(b, sq, p, r, c, [], [], J);
    for (const [dr, dc] of dirsFor(p)) {
      const nr = r + dr, nc = c + dc;
      if (onBoard(nr, nc) && !b[nr * 8 + nc]) St.push(mk(sq, [nr * 8 + nc], [], p));
    }
  }
  if (forced && J.length) return J;
  return J.concat(St);
}
export function applyMove(s, m) {
  const b = s.board.slice();
  let p = b[m.from];
  const man = p === 1 || p === -1;
  b[m.from] = 0;
  for (const c of m.caps) b[c] = 0;
  if (m.crown) p *= 2;
  b[m.path[m.path.length - 1]] = p;
  return { board: b, player: -s.player, quiet: m.caps.length || man ? 0 : s.quiet + 1 };
}
export const sameMove = (a, b) => a && b && a.from === b.from && a.path.join() === b.path.join();
// 'playing' | 'draw' | 'black' | 'white' (the winner)
export function status(s, forced = false) {
  if (s.quiet >= 80) return 'draw';
  if (!genMoves(s, forced).length) return s.player === BLACK ? 'white' : 'black';
  return 'playing';
}

// ---------- evaluation (positive = good for Black) ----------
export function evaluate(b) {
  let s = 0, bm = 0, bk = 0, wm = 0, wk = 0;
  const bK = [], wK = [], bAll = [], wAll = [];
  for (let sq = 0; sq < 64; sq++) {
    const p = b[sq]; if (!p) continue;
    const r = sq >> 3, c = sq & 7;
    const cen = c >= 2 && c <= 5 && r >= 2 && r <= 5 ? 5 : 0;
    if (p === 1) { bm++; s += 100 + (7 - r) * 3 + cen + (r === 7 ? 7 : 0); bAll.push(sq); }
    else if (p === 2) { bk++; s += 165 + cen * 2; bK.push(sq); bAll.push(sq); }
    else if (p === -1) { wm++; s -= 100 + r * 3 + cen + (r === 0 ? 7 : 0); wAll.push(sq); }
    else { wk++; s -= 165 + cen * 2; wK.push(sq); wAll.push(sq); }
  }
  const total = bm + bk + wm + wk;
  const diff = (bm * 100 + bk * 165) - (wm * 100 + wk * 165);
  if (diff !== 0) {
    const lead = diff > 0 ? 1 : -1;
    s += lead * (24 - total) * 5; // when ahead, trading down is good
    const hunters = lead > 0 ? bK : wK, prey = lead > 0 ? wAll : bAll;
    if (hunters.length && prey.length && total <= 10) {
      let d = 0;
      for (const h of hunters) for (const q of prey) d += Math.max(Math.abs((h >> 3) - (q >> 3)), Math.abs((h & 7) - (q & 7)));
      s -= lead * (d * 3) / prey.length;
    }
  }
  return s;
}

// ---------- search ----------
const INF = 1e9;
// Zobrist keys: two 32-bit halves per (square, piece), from crypto so every page load differs
const Z = (() => {
  const n = 64 * 5 * 2 + 2, a = new Uint32Array(n);
  (globalThis.crypto?.getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => (a[i] = (Math.random() * 2 ** 32) >>> 0)));
  return a;
})();
const zi = (sq, p) => (sq * 5 + (p + 2)) * 2;
function hashOf(b, player) {
  let h1 = 0, h2 = 0;
  for (let sq = 0; sq < 64; sq++) if (b[sq]) { const k = zi(sq, b[sq]); h1 ^= Z[k]; h2 ^= Z[k + 1]; }
  if (player === WHITE) { h1 ^= Z[Z.length - 2]; h2 ^= Z[Z.length - 1]; }
  return (h1 >>> 0) * 2097152 + ((h2 >>> 0) & 2097151);
}
function anyCapture(b, player) { // does `player` have a capture available? (cheap, no allocation)
  for (let sq = 0; sq < 64; sq++) {
    const p = b[sq]; if (!p || Math.sign(p) !== player) continue;
    const r = sq >> 3, c = sq & 7;
    for (const [dr, dc] of dirsFor(p)) {
      const lr = r + 2 * dr, lc = c + 2 * dc;
      if (!onBoard(lr, lc)) continue;
      const m = b[(r + dr) * 8 + c + dc];
      if (m && Math.sign(m) !== player && !b[lr * 8 + lc]) return true;
    }
  }
  return false;
}
export function search(s, { depth = 6, forced = false, timeMs = 4000, noise = 0, rand = Math.random } = {}) {
  const t0 = Date.now();
  let nodes = 0, stop = false;
  const TT = new Map(), hist = new Int32Array(64 * 64);
  const key = (m) => m.from * 64 + m.path[m.path.length - 1];
  const order = (ms, ttKey = -1) => ms.sort((a, b) => (key(b) === ttKey) - (key(a) === ttKey) || b.caps.length - a.caps.length || b.crown - a.crown || hist[key(b)] - hist[key(a)]);
  const stand = (st) => {
    let v = st.player * evaluate(st.board);
    if (!forced && anyCapture(st.board, -st.player)) v -= 30; // something of ours is hanging
    return v;
  };
  function quiesce(st, moves, alpha, beta, ply, qd) {
    const caps = moves.filter((m) => m.caps.length);
    if (forced && caps.length) {
      if (qd >= 12) return stand(st);
      let best = -INF;
      for (const m of order(caps)) { const v = -qnode(applyMove(st, m), -beta, -alpha, ply + 1, qd + 1); if (v > best) best = v; if (v > alpha) alpha = v; if (alpha >= beta) break; }
      return best;
    }
    const sp = stand(st);
    if (sp >= beta || !caps.length || qd >= 12) return sp;
    if (sp > alpha) alpha = sp;
    for (const m of order(caps)) { const v = -qnode(applyMove(st, m), -beta, -alpha, ply + 1, qd + 1); if (v >= beta) return v; if (v > alpha) alpha = v; }
    return alpha;
  }
  function qnode(st, alpha, beta, ply, qd) {
    if (stop) return 0;
    if (st.quiet >= 80) return 0;
    const moves = genMoves(st, forced);
    if (!moves.length) return -MATE + ply;
    return quiesce(st, moves, alpha, beta, ply, qd);
  }
  function negamax(st, d, alpha, beta, ply) {
    if ((++nodes & 1023) === 0 && Date.now() - t0 > timeMs) stop = true;
    if (stop) return 0;
    if (st.quiet >= 80) return 0;
    const moves = genMoves(st, forced);
    if (!moves.length) return -MATE + ply;
    if (d <= 0) return quiesce(st, moves, alpha, beta, ply, 0);
    const h = hashOf(st.board, st.player); // quiet count is left out of the key
    const e = TT.get(h);
    const a0 = alpha;
    if (e && e.d >= d) {
      if (e.f === 0) return e.v;
      if (e.f === 1 && e.v >= beta) return e.v;
      if (e.f === -1 && e.v <= alpha) return e.v;
    }
    let best = -INF, bestKey = -1, first = true;
    for (const m of order(moves, e ? e.k : -1)) {
      const child = applyMove(st, m);
      let v;
      if (first) v = -negamax(child, d - 1, -beta, -alpha, ply + 1);
      else {
        v = -negamax(child, d - 1, -alpha - 1, -alpha, ply + 1); // null window probe
        if (v > alpha && v < beta) v = -negamax(child, d - 1, -beta, -alpha, ply + 1);
      }
      first = false;
      if (v > best) { best = v; bestKey = key(m); }
      if (v > alpha) alpha = v;
      if (alpha >= beta) { if (!m.caps.length) hist[key(m)] += d * d; break; }
    }
    if (!stop) TT.set(h, { d, v: best, f: best <= a0 ? -1 : best >= beta ? 1 : 0, k: bestKey });
    return best;
  }
  const root = order(genMoves(s, forced));
  if (root.length <= 1) return { move: root[0] || null, score: 0, depth: 0, nodes };
  let scored = root.map((m) => ({ m, v: 0 })), done = 0;
  for (let d = 1; d <= depth; d++) {
    const res = []; let best = -INF;
    for (const it of scored) {
      const child = applyMove(s, it.m);
      let v;
      if (best === -INF) v = -negamax(child, d - 1, -INF, INF, 1);
      else {
        const lo = best - noise - 1;
        v = -negamax(child, d - 1, -lo - 1, -lo, 1);       // is it within `noise` of the best?
        if (v > lo) v = -negamax(child, d - 1, -INF, -lo, 1); // yes: get its real score
      }
      if (stop) break;
      res.push({ m: it.m, v }); if (v > best) best = v;
    }
    if (stop) break;
    res.sort((a, b) => b.v - a.v); scored = res; done = d;
    if (Math.abs(best) > MATE / 2) break;
    if (Date.now() - t0 > timeMs * 0.4) break;
  }
  const top = scored[0].v;
  const pool = scored.filter((x) => x.v >= top - noise);
  const pick = pool[Math.floor(rand() * pool.length)] || scored[0];
  return { move: pick.m, score: pick.v, depth: done, nodes };
}
