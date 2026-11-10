// MTRX™ Arcade home: a board that plays itself, your saved games, your best times. Designed by MTRX™
import { WORDMARK } from './wordmark.js?v=5';
import { applyTheme } from './theme.js?v=5';

const $ = (s) => document.querySelector(s);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (t) => { const s = Math.floor(t / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
$('#home').innerHTML = WORDMARK;

// ---------- theme ----------
$('#themeBtn').onclick = () => { const t = document.documentElement.dataset.theme === 'dark' ? '' : 'dark'; applyTheme(t); localStorage.setItem('mtrx-theme', t); };

// ---------- marquee ----------
const words = ['Easy', 'Medium', 'Intermediate', 'Hard', 'Expert', 'Practice', 'Challenge', 'Two players'];
const run = words.map((w) => `<span>${w}<i>✦</i></span>`).join('');
$('#rail').innerHTML = run + run;

// ---------- hero: an axonometric board quietly playing a few moves on loop ----------
const bd = $('#hbd'), layer = $('#hpcs');
for (let i = 0; i < 64; i++) { const sq = document.createElement('i'); if (((i >> 3) + (i & 7)) % 2) sq.className = 'd'; bd.append(sq); }
const pos = (r, c) => `translate(${c * 100}%, ${r * 100}%)`;
const START = { b: [[5, 2], [5, 4], [6, 1], [6, 5], [7, 0], [7, 6]], w: [[2, 1], [2, 5], [4, 3], [1, 2], [0, 5], [0, 7]] };
const SCRIPT = [ // [from, to, captured?]
  [[5, 2], [3, 4], [4, 3]], [[2, 5], [4, 3], [3, 4]], [[5, 4], [3, 2], [4, 3]], [[2, 1], [4, 3], [3, 2]], [[6, 5], [5, 4]], [[0, 7], [1, 6]],
];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let board = new Map();
function setup() {
  layer.innerHTML = ''; board = new Map();
  for (const side of ['b', 'w']) for (const [r, c] of START[side]) {
    const el = document.createElement('div'); el.className = `hp ${side}`; el.innerHTML = '<div class="lf"><div class="dk"></div></div>';
    el.style.transform = pos(r, c); layer.append(el); board.set(`${r},${c}`, el);
  }
}
async function step([[fr, fc], [tr, tc], cap]) {
  const el = board.get(`${fr},${fc}`); if (!el) return;
  const jump = !!cap, dur = jump ? 1100 : 820;
  const a = el.animate([{ transform: pos(fr, fc) }, { transform: pos(tr, tc) }], { duration: dur, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'forwards' });
  el.querySelector('.lf').animate(jump ? [{ transform: 'translateZ(0)' }, { transform: 'translateZ(54px)', offset: .5 }, { transform: 'translateZ(0)' }] : [{ transform: 'translateZ(0)' }, { transform: 'translateZ(14px)', offset: .45 }, { transform: 'translateZ(0)' }], { duration: dur, easing: 'cubic-bezier(.4,0,.5,1)' });
  if (jump) {
    const victim = board.get(`${cap[0]},${cap[1]}`);
    setTimeout(() => {
      const g = document.createElement('div'); g.className = 'hgh'; g.style.transform = pos(cap[0], cap[1]); g.innerHTML = '<i></i>'; layer.prepend(g); setTimeout(() => g.remove(), 2400);
      victim?.animate([{ opacity: 1, transform: pos(cap[0], cap[1]) }, { opacity: 0, transform: `${pos(cap[0], cap[1])} scale(.8)` }], { duration: 700, easing: 'ease-out', fill: 'forwards' });
    }, dur * .42);
    board.delete(`${cap[0]},${cap[1]}`);
    setTimeout(() => victim?.remove(), dur + 800);
  }
  await a.finished.catch(() => {});
  el.style.transform = pos(tr, tc); a.cancel();
  board.delete(`${fr},${fc}`); board.set(`${tr},${tc}`, el);
}
async function loop() {
  for (;;) {
    setup(); layer.style.opacity = '';
    layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900, easing: 'ease' });
    await wait(1400);
    for (const s of SCRIPT) { await step(s); await wait(1000); }
    await wait(1600);
    await layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 900, easing: 'ease' }).finished.catch(() => {});
    layer.style.opacity = '0';
  }
}
setup();
if (!REDUCED) loop();
// the floating chip's clock ticks like a real game
let t0 = Date.now(); setInterval(() => { $('#hclock').textContent = fmt((Date.now() - t0) % 600000 + 42000); }, 1000);

// ---------- your games: resume cards + best times ----------
const LV = ['Easy', 'Medium', 'Intermediate', 'Hard', 'Expert'], LID = ['easy', 'medium', 'intermediate', 'hard', 'expert'], CORE = ['L2', 'L4', 'L5', 'L7', 'L8'];
const cards = [];
const ck = read('mtrx-ck3');
if (ck && !ck.over && ck.hist?.length) {
  const who = ck.mode === '2p' ? 'Two players' : `${LV[ck.level] || 'Checkers'}${ck.play === 'challenge' ? ' · Challenge' : ''}`;
  cards.push(`<a class="cc" href="checkers.html"><svg class="ico" viewBox="0 0 44 44"><rect width="44" height="44" fill="#E9CF9F"/><rect width="22" height="22" x="22" fill="#7B4F2E"/><rect width="22" height="22" y="22" fill="#7B4F2E"/><circle cx="11" cy="33" r="7" fill="#151515"/><circle cx="33" cy="11" r="7" fill="#F5F2EB"/></svg><span><b>Checkers</b><small>${who} · ${Math.ceil(ck.hist.length / 2)} moves · ${fmt((ck.clock?.ms || 0) + (ck.clock?.pen || 0))}</small></span><span class="go">→</span></a>`);
}
const cs = read('mtrx-cs1');
if (cs && !cs.over && cs.moves?.length) {
  const who = cs.mode === '2p' ? 'Two players' : `${cs.drill ? 'Drill' : LV[cs.level] || 'Chess'}${cs.play === 'challenge' ? ' · Challenge' : ''}`;
  cards.push(`<a class="cc" href="chess.html"><svg class="ico" viewBox="0 0 44 44"><rect width="44" height="44" fill="#EEEED2"/><rect width="22" height="22" x="22" fill="#769656"/><rect width="22" height="22" y="22" fill="#769656"/><text x="22" y="31" font-size="26" text-anchor="middle" font-family="Georgia,serif" fill="#0E0E0C">\u265e\ufe0e</text></svg><span><b>Chess</b><small>${who} · ${Math.ceil(cs.moves.length / 2)} moves · ${fmt((cs.clock?.ms || 0) + (cs.clock?.pen || 0))}</small></span><span class="go">→</span></a>`);
}
const cw = read('mtrx-cw1');
if (cw && !cw.over && cw.words?.length && Object.keys(cw.fill || {}).length > (cw.gifts?.length || 0)) {
  const n = cw.words.length;
  cards.push(`<a class="cc" href="crossword.html"><svg class="ico" viewBox="0 0 44 44"><rect width="44" height="44" fill="#A44A3F"/><g fill="#F6F5F1"><rect x="4" y="4" width="11" height="11" rx="2"/><rect x="16.5" y="4" width="11" height="11" rx="2"/><rect x="29" y="4" width="11" height="11" rx="2"/><rect x="16.5" y="16.5" width="11" height="11" rx="2"/><rect x="16.5" y="29" width="11" height="11" rx="2"/></g></svg><span><b>Crossword</b><small>${LV[cw.level] || 'Crossword'}${cw.play === 'challenge' ? ' · Challenge' : ''} · ${n} words · ${fmt((cw.clock?.ms || 0) + (cw.clock?.pen || 0))}</small></span><span class="go">→</span></a>`);
}
const sd = read('mtrx-sudoku2');
if (sd && !sd.done && sd.values) {
  const filled = sd.values.filter((v) => v != null).length;
  cards.push(`<a class="cc" href="sudoku.html"><svg class="ico" viewBox="0 0 44 44"><rect width="44" height="44" fill="#F4E3B2"/><path d="M14.7 0v44M29.3 0v44M0 14.7h44M0 29.3h44" stroke="#0E0E0C" stroke-width="1.5"/><text x="22" y="27" font-size="12" font-weight="700" text-anchor="middle" font-family="Nunito Sans,sans-serif">7</text></svg><span><b>Sudoku</b><small>${LV[sd.idx] || 'Sudoku'}${sd.play === 'challenge' ? ' · Challenge' : ''} · ${filled}/81 · ${fmt((sd.clock?.ms || 0) + (sd.clock?.pen || 0))}</small></span><span class="go">→</span></a>`);
}
const gs = read('mtrx-go1');
if (gs && !gs.over && Array.isArray(gs.moves) && gs.moves.length && [9, 13, 19].includes(gs.N)) {
  const who = gs.drill ? 'Drill' : gs.mode === '2p' ? 'Two players' : `${LV[gs.level] || 'Go'}${gs.play === 'challenge' ? ' · Challenge' : ''}`;
  cards.push(`<a class="cc" href="go.html"><svg class="ico" viewBox="0 0 44 44"><rect width="44" height="44" fill="#D9B46E"/><path d="M11 0v44M22 0v44M33 0v44M0 11h44M0 22h44M0 33h44" stroke="#3A2416" stroke-width="1.2"/><circle cx="22" cy="22" r="7.5" fill="#151515"/><circle cx="33" cy="11" r="7.5" fill="#F5F2EB"/></svg><span><b>Go</b><small>${who} · ${gs.N}×${gs.N} · ${gs.moves.length} moves · ${fmt((gs.clock?.ms || 0) + (gs.clock?.pen || 0))}</small></span><span class="go">→</span></a>`);
}
const MP_ICO = '<svg class="ico" viewBox="0 0 44 44"><rect width="44" height="44" fill="#1E1E24"/><path d="M10 34C10 22 16 14 22 18S30 30 34 10" fill="none" stroke="#ED691D" stroke-width="2.4" stroke-dasharray="1.5 4.5" stroke-linecap="round"/><circle cx="10" cy="34" r="4.5" fill="#ED691D"/><circle cx="22" cy="18" r="4.5" fill="#ED691D"/><circle cx="34" cy="10" r="4.5" fill="none" stroke="#F4E3B2" stroke-width="2"/></svg>';
const mpLog = (() => { const l = read('mtrx-mp-log'); return Array.isArray(l) ? l : []; })(), mp = read('mtrx-mp-cur');
const MP_N = [5, 10, 15, 20, 30];
if (mp && Array.isArray(mp.words) && mp.words.length && (mp.phase === 'study' || mp.phase === 'recall')) {
  const where = mp.phase === 'study' ? `word ${(mp.i || 0) + 1} of ${mp.words.length}` : mp.late != null ? 'long-term check' : 'recalling';
  cards.push(`<a class="cc" href="memory.html">${MP_ICO}<span><b>Memory Palace</b><small>${LV[mp.level] || 'Training'}${mp.play === 'challenge' ? ' · Challenge' : ''} · ${where} · ${fmt(mp.clock?.ms || 0)}</small></span><span class="go">→</span></a>`);
} else {
  const now = Date.now(), H = 3600000;
  const due = [...mpLog].reverse().find((e) => e && !e.late && e.words && now - e.t >= 12 * H && now - e.t < 168 * H);
  if (due) cards.push(`<a class="cc" href="memory.html">${MP_ICO}<span><b>Memory Palace</b><small>Long-term check ready · ${due.n} words from ${new Date(due.t).toLocaleDateString([], { weekday: 'long' })}</small></span><span class="go">→</span></a>`);
}
if (cards.length) { $('#contRow').innerHTML = cards.join(''); $('#cont').hidden = false; }
// best: the hardest level you've beaten, Challenge first
function bestLine(keyFor, label) {
  for (let i = 4; i >= 0; i--) for (const ch of [true, false]) {
    const t = keyFor(i, ch).map((k) => +(localStorage.getItem(k) || 0)).filter(Boolean);
    if (t.length) return `${label} ${fmt(Math.min(...t))} on ${LV[i]}${ch ? ' · Challenge' : ''}`;
  }
  return '';
}
$('#ckBest').textContent = bestLine((i, ch) => ['o', 'f'].map((j) => `mtrx-ck-best:${LID[i]}:${j}${ch ? ':c' : ''}`), 'Your best:');
$('#csBest').textContent = bestLine((i, ch) => [`mtrx-cs-best:${LID[i]}${ch ? ':c' : ''}`], 'Your best:');
$('#cwBest').textContent = bestLine((i, ch) => [`mtrx-cw-best:${LID[i]}${ch ? ':c' : ''}`], 'Your best:');
$('#sdBest').textContent = bestLine((i, ch) => [`mtrx-sudoku-best-${CORE[i]}${ch ? '-c' : ''}`], 'Your best:');
// go: fastest win on the hardest level you've beaten, bigger board first
$('#goBest').textContent = (() => {
  for (let i = 4; i >= 0; i--) for (const ch of [true, false]) for (const N of [13, 9]) {
    const t = +(localStorage.getItem(`mtrx-go-best:${N}:${LID[i]}${ch ? ':c' : ''}`) || 0);
    if (t) return `Your best: a win on ${LV[i]} · ${N}×${N}${ch ? ' · Challenge' : ''} in ${fmt(t)}`;
  }
  return '';
})();
// memory palace: daily streak and best score on the hardest level you've trained
$('#mpBest').textContent = (() => {
  if (!mpLog.length) return '';
  const key = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
  const days = new Set(mpLog.flatMap((e) => [e?.t, e?.late?.t]).filter(Boolean).map(key));
  let n = 0, t = Date.now(); if (!days.has(key(t))) t -= 864e5; while (days.has(key(t))) { n++; t -= 864e5; }
  const top = Math.max(...mpLog.map((e) => +e?.level || 0)), best = Math.max(...mpLog.filter((e) => (+e?.level || 0) === top).map((e) => +e?.correct || 0));
  return `${n ? `Streak ${n} day${n === 1 ? '' : 's'} · ` : ''}Best ${best}/${MP_N[top] || '?'} on ${LV[top]}`;
})();

// ---------- soft reveal on scroll ----------
const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 }) : null;
document.querySelectorAll('.reveal').forEach((el) => (io ? io.observe(el) : el.classList.add('in')));
