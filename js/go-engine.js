// MTRX™ Arcade · Go engine: a JavaScript port of Michi ("Minimalistic Pachi") by Petr Baudiš,
// https://github.com/pasky/michi · MIT licence · (c) Petr Baudis <pasky@ucw.cz> 2015.
// Port notes: same algorithm (Chinese rules, MCTS with RAVE, capture/atari + 3x3 pattern playouts,
// priors), with typed-array boards instead of strings, no large-pattern files, single-threaded.
// Board cells: 0 empty, 1 player to move ("X"), 2 opponent ("x"), 3 off-board. Port: Designed by MTRX™

const RAVE_EQUIV = 3500, PRIOR_EVEN = 10, PRIOR_SELFATARI = 10, PRIOR_CAPTURE_ONE = 15, PRIOR_CAPTURE_MANY = 30,
  PRIOR_PAT3 = 10, PRIOR_CFG = [24, 22, 8], PRIOR_EMPTYAREA = 10;
const PROB_HEURISTIC = { capture: 0.9, pat3: 0.95 }, PROB_SSAREJECT = 0.9, PROB_RSAREJECT = 0.5;
const FASTPLAY20_THRES = 0.8, FASTPLAY5_THRES = 0.95;
// Speed: playouts need millions of coin flips, so they use sfc32 (a small, well-tested public-domain generator)
// re-seeded from crypto.getRandomValues at the start of every search.
let ra = 1, rb = 2, rc0 = 3, rd = 4;
function frand() {
  ra >>>= 0; rb >>>= 0; rc0 >>>= 0; rd >>>= 0;
  let t = (ra + rb) | 0; ra = rb ^ (rb >>> 9); rb = (rc0 + (rc0 << 3)) | 0; rc0 = (rc0 << 21) | (rc0 >>> 11); rd = (rd + 1) | 0; t = (t + rd) | 0; rc0 = (rc0 + t) | 0;
  return (t >>> 0) / 4294967296;
}
function reseed() { const a = crypto.getRandomValues(new Uint32Array(4)); ra = a[0]; rb = a[1]; rc0 = a[2]; rd = a[3]; for (let i = 0; i < 12; i++) frand(); }
reseed();
const rint = (n) => Math.floor(frand() * n);
const shuffle = (a, r = frand) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };

// ---------- 3x3 patterns (Michi's pat3src), expanded into a lookup table ----------
const PAT3SRC = [
  ['XOX', '...', '???'], ['XO.', '...', '?.?'], ['XO?', 'X..', 'x.?'], ['.O.', 'X..', '...'],
  ['XO?', 'O.o', '?o?'], ['XO?', 'O.X', '???'], ['?X?', 'O.O', 'ooo'], ['OX?', 'o.O', '???'],
  ['X.?', 'O.?', '   '], ['OX?', 'X.O', '   '], ['?X?', 'x.O', '   '], ['?XO', 'x.x', '   '], ['?OX', 'X.O', '   '],
];
const CODE = { '.': 0, X: 1, x: 2, ' ': 3 };
const PAT3 = (() => {
  const rot90 = (p) => [p[2][0] + p[1][0] + p[0][0], p[2][1] + p[1][1] + p[0][1], p[2][2] + p[1][2] + p[0][2]];
  const vflip = (p) => [p[2], p[1], p[0]];
  const hflip = (p) => p.map((l) => [...l].reverse().join(''));
  const swap = (p) => p.map((l) => l.replace(/X/g, 'Z').replace(/x/g, 'z').replace(/O/g, 'X').replace(/o/g, 'x').replace(/Z/g, 'O').replace(/z/g, 'o'));
  const wild = (p, c, to) => { const i = p.indexOf(c); if (i < 0) return [p]; return to.flatMap((t) => wild(p.slice(0, i) + t + p.slice(i + 1), c, to)); };
  const wilds = (p) => wild(p, '?', [...'.XO ']).flatMap((q) => wild(q, 'x', [...'.O '])).flatMap((q) => wild(q, 'o', [...'.X ']));
  const table = new Uint8Array(1 << 18);
  for (const src of PAT3SRC) for (const a of [src, rot90(src)]) for (const b of [a, vflip(a)]) for (const c of [b, hflip(b)]) for (const d of [c, swap(c)])
    for (const s of wilds(d.join(''))) { const t = s.replace(/O/g, 'x'); let k = 0; for (const ch of t) k = k * 4 + CODE[ch]; table[k] = 1; }
  return table;
})();

export function createGo(N) {
  const W = N + 2, SZ = W * W, MAX_GAME_LEN = N * N * 3;
  const empty = new Uint8Array(SZ).fill(3);
  for (let r = 1; r <= N; r++) for (let c = 1; c <= N; c++) empty[r * W + c] = 0;
  const POINTS = []; for (let r = 1; r <= N; r++) for (let c = 1; c <= N; c++) POINTS.push(r * W + c);
  const NB = [-1, 1, -W, W], DG = [-W - 1, -W + 1, W - 1, W + 1];
  // scratch space for group walks
  const mark = new Int32Array(SZ), lmark = new Int32Array(SZ); let gen = 1;
  const stack = new Int32Array(SZ);
  // group at c: returns { stones: [], libs: [] } (libs unique)
  function group(b, c) {
    gen++; const color = b[c], stones = [], libs = [];
    let sp = 0; stack[sp++] = c; mark[c] = gen;
    while (sp) {
      const p = stack[--sp]; stones.push(p);
      for (let k = 0; k < 4; k++) {
        const d = p + NB[k], v = b[d];
        if (v === color) { if (mark[d] !== gen) { mark[d] = gen; stack[sp++] = d; } }
        else if (v === 0 && lmark[d] !== gen) { lmark[d] = gen; libs.push(d); }
      }
    }
    return { stones, libs };
  }
  // cheap "has at least one liberty" test
  function hasLib(b, c) {
    gen++; const color = b[c]; let sp = 0; stack[sp++] = c; mark[c] = gen;
    while (sp) { const p = stack[--sp]; for (let k = 0; k < 4; k++) { const d = p + NB[k], v = b[d]; if (v === 0) return true; if (v === color && mark[d] !== gen) { mark[d] = gen; stack[sp++] = d; } } }
    return false;
  }
  function isEyeish(b, c) {
    let eye = -1;
    for (let k = 0; k < 4; k++) { const v = b[c + NB[k]]; if (v === 3) continue; if (v === 0) return -1; if (eye === -1) eye = v; else if (v !== eye) return -1; }
    return eye;
  }
  function isEye(b, c) {
    const eye = isEyeish(b, c); if (eye === -1) return -1;
    const falsec = eye === 1 ? 2 : 1; let fc = 0, edge = false;
    for (let k = 0; k < 4; k++) { const v = b[c + DG[k]]; if (v === 3) edge = true; else if (v === falsec) fc++; }
    if (edge) fc++;
    return fc >= 2 ? -1 : eye;
  }
  const swapped = (b) => { const o = new Uint8Array(SZ); for (let i = 0; i < SZ; i++) { const v = b[i]; o[i] = v === 1 ? 2 : v === 2 ? 1 : v; } return o; };
  const emptyPosition = (komi = 7.5) => ({ b: empty.slice(), cap: [0, 0], n: 0, ko: -1, last: -1, last2: -1, komi });
  // play as the player to move at c; returns the new position or null (ko or suicide)
  function move(pos, c) {
    if (c === pos.ko) return null;
    const inEnemyEye = isEyeish(pos.b, c) === 2;
    const b = pos.b.slice(); b[c] = 1;
    let capX = pos.cap[0]; const single = [];
    for (let k = 0; k < 4; k++) {
      const d = c + NB[k]; if (b[d] !== 2) continue;
      if (hasLib(b, d)) continue;
      const g = group(b, d);
      if (g.stones.length === 1) single.push(d);
      capX += g.stones.length; for (const s of g.stones) b[s] = 0;
    }
    const ko = inEnemyEye && single.length === 1 ? single[0] : -1;
    if (!hasLib(b, c)) return null;
    for (let i = 0; i < SZ; i++) { const v = b[i]; if (v === 1) b[i] = 2; else if (v === 2) b[i] = 1; } // flip to the next player's view
    return { b, cap: [pos.cap[1], capX], n: pos.n + 1, ko, last: c, last2: pos.last, komi: pos.komi };
  }
  const passMove = (pos) => ({ b: swapped(pos.b), cap: [pos.cap[1], pos.cap[0]], n: pos.n + 1, ko: -1, last: -1, last2: pos.last, komi: pos.komi });
  const lineHeight = (c) => { const row = Math.floor(c / W) - 1, col = (c % W) - 1; return Math.min(row, col, N - 1 - row, N - 1 - col); };
  function emptyArea(b, c, dist = 3) {
    for (let k = 0; k < 4; k++) { const d = c + NB[k], v = b[d]; if (v === 1 || v === 2) return false; if (v === 0 && dist > 1 && !emptyArea(b, d, dist - 1)) return false; }
    return true;
  }
  const pat3at = (b, c) => { let k = 0; for (const o of [-W - 1, -W, -W + 1, -1, 0, 1, W - 1, W, W + 1]) k = k * 4 + b[c + o]; return PAT3[k] === 1; };
  // Michi's fix_atari: is the group at c in atari, and how can it escape / be captured?
  function fixAtari(pos, c, singleptOk = false, twolibTest = true, twolibEdgeonly = false) {
    const g = group(pos.b, c), size = g.stones.length;
    if (singleptOk && size === 1) return [false, []];
    const libs = g.libs;
    if (libs.length >= 2) {
      if (twolibTest && size > 1 && libs.length === 2 && (!twolibEdgeonly || (lineHeight(libs[0]) === 0 && lineHeight(libs[1]) === 0))) {
        const la = readLadderAttack(pos, c, libs[0], libs[1]);
        if (la >= 0) return [false, [la]];
      }
      return [false, []];
    }
    const l = libs[0];
    if (pos.b[c] === 2) return [true, [l]];
    const sols = [];
    // counter-capture a neighbouring group in atari?
    const seen = new Set();
    for (const s of g.stones) for (let k = 0; k < 4; k++) {
      const d = s + NB[k]; if (pos.b[d] !== 2 || seen.has(d)) continue; seen.add(d);
      const [a, ccls] = fixAtari(pos, d, false, false); if (a && ccls.length) sols.push(...ccls);
    }
    const esc = move(pos, l);
    if (!esc) return [true, sols];
    const g2 = group(esc.b, l);
    if (g2.libs.length >= 2) {
      if (sols.length || !(g2.libs.length === 2 && readLadderAttack(esc, l, g2.libs[0], g2.libs[1]) >= 0)) sols.push(l);
    }
    return [true, sols];
  }
  function readLadderAttack(pos, c, l1, l2) {
    for (const l of [l1, l2]) {
      const p = move(pos, l); if (!p) continue;
      const [a, esc] = fixAtari(p, c, false, false);
      if (a && !esc.length) return l;
    }
    return -1;
  }
  function cfgDistances(b, c) {
    const m = new Int32Array(SZ).fill(-1); m[c] = 0; const fr = [c];
    while (fr.length) {
      const p = fr.pop();
      for (let k = 0; k < 4; k++) {
        const d = p + NB[k]; if (b[d] === 3 || (m[d] >= 0 && m[d] <= m[p])) continue;
        const before = m[d];
        m[d] = b[d] !== 0 && b[d] === b[p] ? m[p] : m[p] + 1;
        if (before < 0 || before > m[d]) fr.push(d);
      }
    }
    return m;
  }
  function lastMovesNeighbors(pos) {
    const out = [];
    for (const c of [pos.last, pos.last2]) {
      if (c < 0) continue;
      const dl = shuffle([c, c - 1, c + 1, c - W, c + W, c - W - 1, c - W + 1, c + W - 1, c + W + 1]);
      for (const d of dl) if (!out.includes(d)) out.push(d);
    }
    return out;
  }
  // candidate moves in order of preference; calls tryMove(c, kind, info) until it returns true
  function genMoves(pos, set, probs, expensive, tryMove) {
    if (frand() <= probs.capture) {
      const done = new Set();
      for (const c of set) {
        const v = pos.b[c]; if (v !== 1 && v !== 2) continue;
        const [, ds] = fixAtari(pos, c, false, true, !expensive); shuffle(ds);
        for (const d of ds) if (!done.has(d)) { done.add(d); if (tryMove(d, 'capture', c)) return true; }
      }
    }
    if (frand() <= probs.pat3) {
      const done = new Set();
      for (const c of set) if (pos.b[c] === 0 && !done.has(c) && pat3at(pos.b, c)) { done.add(c); if (tryMove(c, 'pat3', 0)) return true; }
    }
    const start = rint(POINTS.length);
    for (let i = 0; i < POINTS.length; i++) {
      const c = POINTS[(start + i) % POINTS.length];
      if (pos.b[c] !== 0 || isEye(pos.b, c) === 1) continue;
      if (tryMove(c, 'random', 0)) return true;
    }
    return false;
  }
  function score(pos, owner) { // area score for the player to move (dead stones must already be removed)
    const b = pos.b.slice(); gen++;
    for (const c of POINTS) {
      if (b[c] !== 0 || mark[c] === gen) continue;
      const region = [], fr = [c]; mark[c] = gen; let tX = false, tx = false;
      while (fr.length) { const p = fr.pop(); region.push(p); for (let k = 0; k < 4; k++) { const d = p + NB[k], v = b[d]; if (v === 0 && mark[d] !== gen) { mark[d] = gen; fr.push(d); } else if (v === 1) tX = true; else if (v === 2) tx = true; } }
      const fill = tX && !tx ? 1 : tx && !tX ? 2 : 4;
      for (const p of region) b[p] = fill;
    }
    let s = 0; for (const c of POINTS) { if (b[c] === 1) s++; else if (b[c] === 2) s--; }
    if (owner) { const sgn = pos.n % 2 === 0 ? 1 : -1; for (const c of POINTS) owner[c] += (b[c] === 1 ? 1 : b[c] === 2 ? -1 : 0) * sgn; }
    return s + (pos.n % 2 === 1 ? pos.komi : -pos.komi);
  }
  function playout(pos, amaf) {
    const startN = pos.n; let passes = 0;
    while (passes < 2 && pos.n < MAX_GAME_LEN) {
      let pos2 = null;
      const cur = pos;
      genMoves(cur, lastMovesNeighbors(cur), PROB_HEURISTIC, false, (c, kind) => {
        const p = move(cur, c); if (!p) return false;
        if (frand() <= (kind === 'random' ? PROB_RSAREJECT : PROB_SSAREJECT)) { const [, ds] = fixAtari(p, c, true, true, true); if (ds.length) return false; }
        if (amaf[c] === 0) amaf[c] = cur.n % 2 === 0 ? 1 : -1;
        pos2 = p; return true;
      });
      if (!pos2) { pos = passMove(pos); passes++; continue; }
      passes = 0; pos = pos2;
    }
    const owner = new Float32Array(SZ);
    let s = score(pos, owner);
    if (startN % 2 !== pos.n % 2) s = -s;
    return { s, owner };
  }
  // ---------- tree ----------
  function node(pos) { return { pos, v: 0, w: 0, pv: PRIOR_EVEN, pw: PRIOR_EVEN / 2, av: 0, aw: 0, children: null }; }
  function expand(nd) {
    const pos = nd.pos, cfg = pos.last >= 0 ? cfgDistances(pos.b, pos.last) : null;
    nd.children = []; const by = new Map();
    genMoves(pos, POINTS, { capture: 1, pat3: 1 }, true, (c, kind, from) => {
      const p = move(pos, c); if (!p) return false;
      let ch = by.get(c); if (!ch) { ch = node(p); nd.children.push(ch); by.set(c, ch); }
      if (kind === 'capture') { const big = group(pos.b, from).stones.length > 1; const pr = big ? PRIOR_CAPTURE_MANY : PRIOR_CAPTURE_ONE; ch.pv += pr; ch.pw += pr; }
      else if (kind === 'pat3') { ch.pv += PRIOR_PAT3; ch.pw += PRIOR_PAT3; }
      return false; // keep generating: we want every move
    });
    for (const ch of nd.children) {
      const c = ch.pos.last;
      if (cfg && cfg[c] - 1 < PRIOR_CFG.length && cfg[c] >= 1) { ch.pv += PRIOR_CFG[cfg[c] - 1]; ch.pw += PRIOR_CFG[cfg[c] - 1]; }
      const h = lineHeight(c);
      if (h <= 2 && emptyArea(pos.b, c)) { if (h <= 1) ch.pv += PRIOR_EMPTYAREA; if (h === 2) { ch.pv += PRIOR_EMPTYAREA; ch.pw += PRIOR_EMPTYAREA; } }
      const [, ds] = fixAtari(ch.pos, c, true); if (ds.length) ch.pv += PRIOR_SELFATARI;
    }
    if (!nd.children.length) nd.children.push(node(passMove(pos)));
  }
  function urgency(nd) {
    const v = nd.v + nd.pv, exp = (nd.w + nd.pw) / v;
    if (nd.av === 0) return exp;
    const beta = nd.av / (nd.av + v + (v * nd.av) / RAVE_EQUIV);
    return beta * (nd.aw / nd.av) + (1 - beta) * exp;
  }
  function descend(tree, amaf, expandVisits) {
    tree.v++; const nodes = [tree]; let passes = 0;
    while (nodes[nodes.length - 1].children && passes < 2) {
      const kids = nodes[nodes.length - 1].children;
      let best = null, bu = -Infinity; const off = Math.floor(frand() * kids.length);
      for (let i = 0; i < kids.length; i++) { const k = kids[(i + off) % kids.length], u = urgency(k); if (u > bu) { bu = u; best = k; } }
      nodes.push(best);
      if (best.pos.last < 0) passes++; else { passes = 0; if (amaf[best.pos.last] === 0) amaf[best.pos.last] = nodes[nodes.length - 2].pos.n % 2 === 0 ? 1 : -1; }
      best.v++;
      if (!best.children && best.v >= expandVisits) expand(best);
    }
    return nodes;
  }
  function update(nodes, amaf, s) {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const nd = nodes[i];
      if (s < 0) nd.w++;
      const val = nd.pos.n % 2 === 0 ? 1 : -1;
      if (nd.children) for (const ch of nd.children) { const c = ch.pos.last; if (c < 0) continue; if (amaf[c] === val) { if (s > 0) ch.aw++; ch.av++; } }
      s = -s;
    }
  }
  // search from pos; returns { move (-1 = pass), winrate, children: [{c, v, wr}], owner, sims }
  function search(pos, { sims = 1000, timeMs = 0, expandVisits = 4 } = {}) {
    reseed();
    const tree = node(pos); expand(tree);
    const owner = new Float32Array(SZ); const t0 = Date.now(); let i = 0;
    while (i < sims) {
      const amaf = new Int8Array(SZ);
      const nodes = descend(tree, amaf, expandVisits);
      const r = playout(nodes[nodes.length - 1].pos, amaf);
      update(nodes, amaf, r.s);
      for (const c of POINTS) owner[c] += r.owner[c];
      i++;
      if ((i & 63) === 0) {
        const best = tree.children.reduce((a, b) => (b.v > a.v ? b : a));
        const wr = best.v ? best.w / best.v : 0;
        if ((i > sims * 0.05 && wr > FASTPLAY5_THRES) || (i > sims * 0.2 && wr > FASTPLAY20_THRES)) break;
        if (timeMs && Date.now() - t0 > timeMs) break;
      }
    }
    for (const c of POINTS) owner[c] /= i;
    const kids = [...tree.children].sort((a, b) => b.v - a.v);
    const best = kids[0];
    return { move: best.pos.last, winrate: best.v ? best.w / best.v : 0.5, children: kids.map((k) => ({ c: k.pos.last, v: k.v, wr: k.v ? k.w / k.v : 0 })), owner, sims: i };
  }
  // ownership from many playouts of the final position (to suggest dead stones at the end)
  function ownership(pos, n = 300) {
    reseed(); const o = new Float32Array(SZ);
    for (let i = 0; i < n; i++) { const r = playout(pos, new Int8Array(SZ)); for (const c of POINTS) o[c] += r.owner[c]; }
    for (const c of POINTS) o[c] /= n;
    return o; // absolute: +1 means Black owns the point at the end, -1 White
  }
  // legal, non-own-eye moves (used for the Easy level's random slips)
  function sensibleMoves(pos) { const out = []; for (const c of POINTS) { if (pos.b[c] !== 0 || isEye(pos.b, c) === 1) continue; if (move(pos, c)) out.push(c); } return out; }
  return { N, W, POINTS, emptyPosition, move, passMove, search, ownership, score, group, isEye, sensibleMoves, fixAtari, lineHeight };
}
