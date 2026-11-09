// MTRX™ Arcade · Chess AI adapter. Engine: Stockfish 19 (lite, single-threaded WASM) via stockfish.js by Nathan Rugg,
// GPL-3.0, loaded at runtime from npm (https://github.com/nmrugg/stockfish.js). Level policy: Designed by MTRX™.
import { rand, randInt } from './learn.js?v=5';

const BASES = ['https://cdn.jsdelivr.net/npm/stockfish@19.0.1/bin/', 'https://unpkg.com/stockfish@19.0.1/bin/'];
// Five levels. Stockfish weakens itself (Skill Level / UCI_Elo); on top of that every coin flip below
// (random blunders, which of several near-equal opening moves to play) comes from crypto.getRandomValues.
export const POLICY = {
  easy: { skill: 0, depth: 1, movetime: 150, blunder: 0.35 },
  medium: { skill: 3, depth: 3, movetime: 300, blunder: 0.12 },
  intermediate: { elo: 1350, movetime: 500, blunder: 0.03 },
  hard: { elo: 1850, movetime: 800, openingPV: 2, openingPlies: 6, openingNoise: 30 },
  expert: { skill: 20, depth: 18, movetime: 1500, openingPV: 3, openingPlies: 8, openingNoise: 25 },
  hint: { skill: 20, depth: 15, movetime: 1200 },
};

export class Engine {
  constructor() { this.w = null; this.ready = null; this.kind = null; this.pending = null; this.queue = Promise.resolve(); }
  init() { if (!this.ready) this.ready = this.boot(); return this.ready; }
  async boot() {
    const tries = [
      ...BASES.map((b) => ({ js: `${b}stockfish-19-lite-single.js`, wasm: `${b}stockfish-19-lite-single.wasm`, kind: 'stockfish' })),
      ...BASES.map((b) => ({ js: `${b}stockfish-19-asm.js`, kind: 'stockfish-asm' })),
    ];
    for (const t of tries) {
      try { await this.spawn(t); this.kind = t.kind; return true; } catch { this.kill(); }
    }
    this.kind = 'mini'; return false; // every CDN failed: the small built-in engine keeps the game playable
  }
  // A cross-origin script can't be a Worker directly, so a tiny same-origin blob worker imports it.
  // The engine fetches its .wasm by a path derived from its own URL; we hand it the CDN copy instead.
  spawn({ js, wasm }) {
    return new Promise((resolve, reject) => {
      const code = (wasm ? `var __w=${JSON.stringify(wasm)},__f=self.fetch.bind(self);self.fetch=function(u,o){return __f(__w,o)};` : '') + `importScripts(${JSON.stringify(js)});`;
      const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      let w;
      try { w = new Worker(wasm ? `${url}#${encodeURIComponent(wasm)}` : url); } catch { w = new Worker(url); }
      this.w = w;
      const timer = setTimeout(() => reject(new Error('engine timeout')), 20000);
      w.onerror = (e) => { clearTimeout(timer); e.preventDefault?.(); reject(new Error('engine failed')); };
      w.onmessage = ({ data }) => {
        const line = String(data);
        if (line === 'uciok') w.postMessage('isready');
        else if (line === 'readyok') {
          clearTimeout(timer);
          w.onerror = null; w.onmessage = (ev) => this.line(String(ev.data));
          resolve();
        }
      };
      w.postMessage('uci');
    });
  }
  kill() { try { this.w?.terminate(); } catch { /* gone */ } this.w = null; }
  line(l) {
    const P = this.pending; if (!P) return;
    if (l.startsWith('info') && l.includes(' pv ')) {
      const k = +(l.match(/ multipv (\d+)/)?.[1] || 1), sc = l.match(/ score (cp|mate) (-?\d+)/), pv = l.match(/ pv (\S+)/);
      if (sc && pv) P.lines[k - 1] = { move: pv[1], cp: sc[1] === 'cp' ? +sc[2] : null, mate: sc[1] === 'mate' ? +sc[2] : null };
    } else if (l.startsWith('bestmove')) {
      this.pending = null; P.resolve({ best: l.split(' ')[1], lines: P.lines.filter(Boolean) });
    }
  }
  // One search at a time. Resolves with null when only the built-in engine is available.
  search(fen, o) {
    const run = async () => {
      await this.init();
      if (this.kind === 'mini' || !this.w) return null;
      return new Promise((resolve) => {
        this.pending = { resolve, lines: [] };
        const post = (s) => this.w.postMessage(s);
        post(`setoption name UCI_LimitStrength value ${o.elo ? 'true' : 'false'}`);
        if (o.elo) post(`setoption name UCI_Elo value ${o.elo}`);
        post(`setoption name Skill Level value ${o.skill ?? 20}`);
        post(`setoption name MultiPV value ${o.multipv || 1}`);
        post(`position fen ${fen}`);
        post(`go${o.depth ? ` depth ${o.depth}` : ''}${o.movetime ? ` movetime ${o.movetime}` : ''}`);
      });
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }
  stop() { if (this.pending && this.w) this.w.postMessage('stop'); }
  newGame() { if (this.w) this.w.postMessage('ucinewgame'); }
}

const uci = (m) => m.from + m.to + (m.promotion || '');
const score = (l) => (l.mate != null ? (l.mate > 0 ? 100000 - l.mate : -100000 - l.mate) : l.cp);

// Pick the AI's move for a level. Returns a UCI string like "e2e4" or "e7e8q".
export async function pickMove({ engine, Chess, fen, level, aiPly }) {
  const P = POLICY[level] || POLICY.medium;
  const c = new Chess(fen), legal = c.moves({ verbose: true });
  if (!legal.length) return null;
  if (P.blunder && rand() < P.blunder) return uci(legal[randInt(legal.length)]);
  const opening = P.openingPV && aiPly < P.openingPlies;
  const r = await engine.search(fen, { ...P, multipv: opening ? P.openingPV : 1 });
  if (!r) return miniPick(Chess, fen, level);
  let mv = r.best;
  if (opening && r.lines.length > 1) {
    const top = score(r.lines[0]);
    const ok = r.lines.filter((l) => top - score(l) <= P.openingNoise);
    mv = ok[randInt(ok.length)].move;
  }
  return legal.some((m) => uci(m) === mv) ? mv : uci(legal[0]);
}
// Best move + a plain-English evaluation for the player to move.
export async function bestFor({ engine, Chess, fen }) {
  const r = await engine.search(fen, POLICY.hint);
  if (!r) return { move: miniPick(Chess, fen, 'expert'), line: null };
  return { move: r.best, line: r.lines[0] || null };
}

// ---------- fallback: a small material search, only used if Stockfish can't load ----------
const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
function evalSide(c) {
  let s = 0;
  for (const row of c.board()) for (const p of row) if (p) s += (p.color === 'w' ? 1 : -1) * VAL[p.type];
  return c.turn() === 'w' ? s : -s;
}
function negamax(c, d, a, b) {
  if (c.isCheckmate()) return -100000 - d;
  if (c.isDraw()) return 0;
  if (!d) return evalSide(c);
  const ms = c.moves({ verbose: true }).sort((x, y) => (y.captured ? VAL[y.captured] : 0) - (x.captured ? VAL[x.captured] : 0));
  for (const m of ms) {
    c.move(m); const v = -negamax(c, d - 1, -b, -a); c.undo();
    if (v >= b) return v; if (v > a) a = v;
  }
  return a;
}
export function miniPick(Chess, fen, level) {
  const c = new Chess(fen), ms = c.moves({ verbose: true });
  if (!ms.length) return null;
  if ((level === 'easy' && rand() < 0.4) || (level === 'medium' && rand() < 0.15)) return uci(ms[randInt(ms.length)]);
  const depth = level === 'easy' || level === 'medium' ? 1 : 2;
  let best = -Infinity, pool = [];
  for (const m of ms) {
    c.move(m); const v = -negamax(c, depth, -Infinity, Infinity); c.undo();
    if (v > best + 5) { best = v; pool = [m]; } else if (Math.abs(v - best) <= 5) pool.push(m);
  }
  return uci(pool[randInt(pool.length)]);
}
