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
const sd = read('mtrx-sudoku2');
if (sd && !sd.done && sd.values) {
  const filled = sd.values.filter((v) => v != null).length;
  cards.push(`<a class="cc" href="sudoku.html"><svg class="ico" viewBox="0 0 44 44"><rect width="44" height="44" fill="#F4E3B2"/><path d="M14.7 0v44M29.3 0v44M0 14.7h44M0 29.3h44" stroke="#0E0E0C" stroke-width="1.5"/><text x="22" y="27" font-size="12" font-weight="700" text-anchor="middle" font-family="Nunito Sans,sans-serif">7</text></svg><span><b>Sudoku</b><small>${LV[sd.idx] || 'Sudoku'}${sd.play === 'challenge' ? ' · Challenge' : ''} · ${filled}/81 · ${fmt((sd.clock?.ms || 0) + (sd.clock?.pen || 0))}</small></span><span class="go">→</span></a>`);
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
$('#sdBest').textContent = bestLine((i, ch) => [`mtrx-sudoku-best-${CORE[i]}${ch ? '-c' : ''}`], 'Your best:');

// ---------- soft reveal on scroll ----------
const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 }) : null;
document.querySelectorAll('.reveal').forEach((el) => (io ? io.observe(el) : el.classList.add('in')));
