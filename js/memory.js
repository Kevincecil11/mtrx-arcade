// MTRX™ Arcade · Memory Palace trainer v1. The training loop follows the method-of-loci protocol in
// Dresler et al. (2017), Neuron 93(5):1227–1235: memorise a word list on a familiar route, recall it, recall it again a day later.
// Original word bank, code and lessons: Designed by MTRX™ · Property of MTRX Digital
import { WORDMARK } from './wordmark.js?v=5';
import { mountLearn, rand } from './learn.js?v=5';
import { applyTheme } from './theme.js?v=5';
import { WORDS } from './memory-words.js?v=6';

const $ = (s) => document.querySelector(s);
$('#home').innerHTML = WORDMARK;
const LEVELS = [
  { id: 'easy', name: 'Easy', n: 5, sec: 15, cues: true, note: '5 words, 15 seconds each. Your stop names are shown while you recall.' },
  { id: 'medium', name: 'Medium', n: 10, sec: 10, cues: true, note: '10 words, 10 seconds each. Stop names shown while you recall.' },
  { id: 'intermediate', name: 'Intermediate', n: 15, sec: 8, cues: false, note: '15 words, 8 seconds each. No stop names at recall: walk the route in your head.' },
  { id: 'hard', name: 'Hard', n: 20, sec: 6, cues: false, note: '20 words, 6 seconds each. No stop names at recall.' },
  { id: 'expert', name: 'Expert', n: 30, sec: 4, cues: false, note: '30 words, 4 seconds each: memory-athlete pace. No stop names.' },
];
const PLAY_NOTE = { practice: 'Take as long as you like on each word and step back if you need to. Peek shows a first letter.', challenge: 'Words move on by themselves at the level\'s pace. No going back, no peeking. Best scores count separately.' };
const TIPS = ['Make it huge', 'Make it move', 'Give it a sound', 'Give it a smell', 'Make it absurd', 'Let it smash something', 'Put yourself in the scene', 'Make it funny or a bit gross', 'Make it glow or catch fire', 'Make it touch the stop'];
const STARTER = { id: 'home', name: 'My home', loci: ['Front gate', 'Doorbell', 'Doormat', 'Front door', 'Shoe rack', 'Coat hooks', 'Hallway mirror', 'Light switch', 'Sofa', 'Coffee table', 'TV', 'Bookshelf', 'Curtains', 'Ceiling fan', 'Dining table', 'Kitchen door', 'Fridge', 'Stove', 'Sink', 'Microwave', 'Bathroom door', 'Bathroom mirror', 'Washbasin', 'Shower', 'Bedroom door', 'Bed', 'Pillow', 'Wardrobe', 'Desk', 'Balcony'] };
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (t) => { const s = Math.floor(t / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const HOUR = 3600000, DAY = 24 * HOUR;

// ---------- saved data ----------
const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch { return d; } };
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const P = Object.assign({ level: 0, play: 'practice', palace: 'home' }, read('mtrx-mp-prefs', {}));
P.level = Math.min(4, Math.max(0, +P.level || 0)); if (P.play !== 'challenge') P.play = 'practice';
const savePrefs = () => write('mtrx-mp-prefs', P);
let palaces = read('mtrx-mp-palaces', null);
if (!Array.isArray(palaces) || !palaces.length) { palaces = [STARTER]; write('mtrx-mp-palaces', palaces); }
const palace = () => palaces.find((p) => p.id === P.palace) || palaces[0];
const getLog = () => read('mtrx-mp-log', []);
const saveLog = (l) => write('mtrx-mp-log', l.slice(-300));
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function streak() {
  const days = new Set(getLog().flatMap((e) => [e.t, e.late?.t]).filter(Boolean).map(dayKey)); let n = 0, t = Date.now(); // long-term checks count as training days too
  if (!days.has(dayKey(t))) t -= DAY; // a streak survives until the end of today
  while (days.has(dayKey(t))) { n++; t -= DAY; }
  return n;
}
// the newest list that is at least 12 hours old, under a week old and not yet re-tested
function lateCandidate() {
  const L = getLog(), now = Date.now();
  for (let i = L.length - 1; i >= 0; i--) { const e = L[i]; if (e.late || !e.words) continue; const age = now - e.t; if (age >= 12 * HOUR && age < 7 * DAY) return i; }
  return null;
}

// ---------- session state ----------
let S = null; // { level, play, palaceName, loci, words, i, phase: 'study'|'recall'|'done', answers, peeks, clock, word, studyMs, late, t, tips }
let paused = false, autoPaused = false;
const stage = $('#stage'), wrap = $('#wrap'), overlay = $('#overlay');
const elapsed = () => (S ? S.clock.ms + (S.clock.since ? Date.now() - S.clock.since : 0) : 0);
const wordElapsed = () => (S ? S.word.ms + (S.word.since ? Date.now() - S.word.since : 0) : 0);
function runClocks() { if (!S || paused || S.phase === 'done') return; const now = Date.now(); if (!S.clock.since) S.clock.since = now; if (S.phase === 'study' && !S.word.since) S.word.since = now; }
function stopClocks() { const now = Date.now(); if (S?.clock.since) { S.clock.ms += now - S.clock.since; S.clock.since = null; } if (S?.word.since) { S.word.ms += now - S.word.since; S.word.since = null; } }
function saveCur() { if (S && S.phase !== 'done') write('mtrx-mp-cur', { ...S, clock: { ms: elapsed(), since: null }, word: { ms: wordElapsed(), since: null } }); }
let saveT = 0; const saveSoon = () => { clearTimeout(saveT); saveT = setTimeout(saveCur, 400); };
let statusShown = '';
function setStatus(t, cls = '') { const s = $('#status'); if (t === statusShown) return; statusShown = t; s.textContent = t; s.className = 'status-line ' + cls; if (t) { void s.offsetWidth; s.classList.add('fade'); } }

// ---------- clock, pause ----------
let clockShown = '';
function tick() {
  const t = fmt(elapsed()); if (t !== clockShown) { $('#clock').textContent = t; clockShown = t; }
  if (!S || S.phase !== 'study' || paused) return;
  const lv = LEVELS[S.level], f = Math.min(1, wordElapsed() / (lv.sec * 1000)), bar = stage.querySelector('#tbar');
  if (bar) bar.style.width = `${(f * 100).toFixed(1)}%`;
  if (S.play === 'challenge' && f >= 1 && overlay.hidden) nextWord(1);
}
setInterval(tick, 100);
document.addEventListener('visibilitychange', () => { if (document.hidden && S && !paused && S.phase !== 'done') { autoPaused = false; pause('away'); } });
addEventListener('pagehide', () => saveCur());
function pause(why = 'button') {
  if (!S || paused || S.phase === 'done') return;
  paused = true; stopClocks(); saveCur(); wrap.classList.add('veil');
  if (why !== 'menu') {
    const title = why === 'back' ? 'Welcome back' : 'Paused';
    overlay.className = 'overlay pause'; overlay.hidden = false;
    overlay.innerHTML = `<div class="ov-card" role="dialog" aria-label="${title}"><div class="mtrx-label" style="margin:0">${LEVELS[S.level].name}${S.play === 'challenge' ? ' · Challenge' : ''}</div><h2>${title}</h2>
      <div class="big">${fmt(elapsed())}</div><p class="note">The clock is stopped and the words are hidden.</p>
      <button class="mtrx-btn mtrx-btn--primary go" id="resumeBtn">Resume</button><button class="mtrx-btn mtrx-btn--ghost go" id="quitBtn">End this session</button></div>`;
    overlay.querySelector('#resumeBtn').onclick = resume;
    overlay.querySelector('#quitBtn').onclick = () => { closeOverlay(); paused = false; S = null; localStorage.removeItem('mtrx-mp-cur'); renderHome(); };
  }
  hud();
}
function closeOverlay() { overlay.hidden = true; overlay.innerHTML = ''; overlay.className = 'overlay'; }
function resume() { if (!paused) return; paused = false; autoPaused = false; closeOverlay(); wrap.classList.remove('veil'); runClocks(); hud(); }
$('#clockBtn').onclick = () => { if (paused) resume(); else pause('button'); };

// ---------- HUD ----------
function hud() {
  $('#palName').textContent = S ? S.palaceName : palace().name;
  const n = streak(); $('#streak').textContent = `${n} day${n === 1 ? '' : 's'}`;
  const cb = $('#clockBtn'); cb.disabled = !S || S.phase === 'done';
  cb.classList.toggle('paused', paused); cb.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
  $('#pz').innerHTML = paused ? '<path d="M7 4.5v15l12-7.5z"/>' : '<path d="M6.5 4.5h3.6v15H6.5zM13.9 4.5h3.6v15h-3.6z"/>';
  $('#clockSub').textContent = paused ? 'Paused' : !S ? 'Memory' : S.phase === 'study' ? 'Memorising' : S.phase === 'recall' ? 'Recalling' : 'Done';
  if (!S || S.phase === 'done') { clockShown = ''; $('#clock').textContent = S ? fmt(elapsed()) : '0:00'; }
}

// ---------- screens ----------
function seg(name, opts, cur) { return `<div class="mtrx-segmented" data-seg="${name}">${opts.map(([v, lbl]) => `<button data-v="${v}" aria-pressed="${String(v) === String(cur)}">${lbl}</button>`).join('')}</div>`; }
function bindSegs(root, onPick) {
  root.querySelectorAll('[data-seg]').forEach((g) => g.querySelectorAll('button').forEach((b) => (b.onclick = () => {
    g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    onPick(g.dataset.seg, b.dataset.v);
  })));
}
function render() { if (!S) return renderHome(); if (S.phase === 'study') return renderStudy(); if (S.phase === 'recall') return renderRecall(); return renderResult(); }
function renderHome() {
  S = null; paused = false; wrap.classList.remove('veil'); closeOverlay(); localStorage.removeItem('mtrx-mp-cur');
  const pal = palace(), L = getLog(), lv = LEVELS[P.level], li = lateCandidate();
  const late = li != null ? L[li] : null;
  const last = L.length ? L[L.length - 1] : null;
  stage.innerHTML = `${late ? `<div class="mp-card mp-late"><div class="mtrx-label" style="margin:0">Long-term check</div><h3>${late.n} words from ${new Date(late.t).toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' })}</h3>
      <p class="note">You recalled ${late.correct} of ${late.n} straight after studying. Walk ${esc(late.palaceName)} again: how many are still there?</p><button class="mtrx-btn mtrx-btn--primary" id="lateBtn">Recall them now</button></div>` : ''}
    <div class="mp-card"><div class="mtrx-label" style="margin:0">MTRX™ Memory Palace</div><h2>Today's training</h2>
      <div class="row"><div class="mtrx-label">Palace</div>${seg('palace', palaces.map((p) => [p.id, `${esc(p.name)} · ${p.loci.length} stops`]), pal.id)}<p class="opt-note"><button class="linkish" id="editPal">Edit your palaces</button></p></div>
      <div class="row"><div class="mtrx-label">Difficulty</div>${seg('level', LEVELS.map((l, i) => [i, l.name]), P.level)}<p class="opt-note" id="lvNote">${lv.note}</p></div>
      <div class="row"><div class="mtrx-label">Mode</div>${seg('play', [['practice', 'Practice'], ['challenge', 'Challenge']], P.play)}<p class="opt-note" id="plNote">${PLAY_NOTE[P.play]}</p></div>
      <p class="opt-note warn" id="needNote"></p>
      <button class="mtrx-btn mtrx-btn--primary go" id="startBtn">Start training</button></div>
    <div class="mp-stats"><div><small>Sessions</small><b>${L.length}</b></div><div><small>Last score</small><b>${last ? `${last.correct}/${last.n}` : '–'}</b></div><div><small>Best (${lv.name})</small><b id="bestLv">${bestFor(P.level)}</b></div></div>`;
  const need = () => { const p = palace(), n = LEVELS[P.level].n, short = p.loci.length < n; stage.querySelector('#needNote').textContent = short ? `${p.name} has ${p.loci.length} stops and ${LEVELS[P.level].name} needs ${n}. Add stops in Edit your palaces, or pick an easier level.` : ''; stage.querySelector('#startBtn').disabled = short; };
  bindSegs(stage, (k, v) => {
    if (k === 'palace') P.palace = v;
    if (k === 'level') { P.level = +v; stage.querySelector('#lvNote').textContent = LEVELS[P.level].note; stage.querySelector('#bestLv').textContent = bestFor(P.level); }
    if (k === 'play') { P.play = v; stage.querySelector('#plNote').textContent = PLAY_NOTE[P.play]; }
    savePrefs(); need(); hud();
  });
  need();
  stage.querySelector('#startBtn').onclick = () => startSession();
  stage.querySelector('#editPal').onclick = () => menu.open(TAB.palaces);
  stage.querySelector('#lateBtn')?.addEventListener('click', () => startSession(li));
  setStatus(late ? 'A list from earlier is waiting for its long-term check' : L.length ? 'Pick a level and walk your palace' : 'New here? Open Learn for a two-minute guide, or just start on Easy');
  hud();
}
function bestFor(level) { const b = getLog().filter((e) => e.level === level).reduce((m, e) => Math.max(m, e.correct), -1); return b < 0 ? '–' : `${b}/${LEVELS[level].n}`; }
function startSession(late = null) {
  const L = getLog();
  if (late != null) {
    const e = L[late];
    S = { level: e.level, play: 'practice', palaceName: e.palaceName, loci: e.loci, words: e.words, i: 0, phase: 'recall', answers: Array(e.words.length).fill(''), peeks: [], clock: { ms: 0, since: null }, word: { ms: 0, since: null }, studyMs: 0, late, t: Date.now(), tips: TIPS };
  } else {
    const lv = LEVELS[P.level], pal = palace();
    if (pal.loci.length < lv.n) return;
    const recent = new Set(L.slice(-3).flatMap((e) => e.words || [])); // keep the last few lists out of this one
    const fresh = shuffle(WORDS.filter((w) => !recent.has(w)));
    const words = (fresh.length >= lv.n ? fresh : shuffle(WORDS)).slice(0, lv.n);
    S = { level: P.level, play: P.play, palaceName: pal.name, loci: pal.loci.slice(0, lv.n), words, i: 0, phase: 'study', answers: Array(lv.n).fill(''), peeks: [], clock: { ms: 0, since: null }, word: { ms: 0, since: null }, studyMs: 0, late: null, t: Date.now(), tips: shuffle(TIPS) };
  }
  paused = false; runClocks(); saveCur(); render(); hud();
}
function renderStudy() {
  const lv = LEVELS[S.level], n = S.words.length, i = S.i, stop = S.loci[i];
  stage.innerHTML = `<div class="mp-card mp-study">
    <div class="mp-top"><span class="mtrx-label" style="margin:0">Word ${i + 1} of ${n}</span><span class="mtrx-label" style="margin:0">${S.play === 'challenge' ? `${lv.sec} s each` : 'Your pace'}</span></div>
    <div class="mp-prog"><i style="width:${((i + 1) / n) * 100}%"></i></div>
    <div class="mp-stop"><small>Stop ${i + 1}</small><b>${esc(stop)}</b></div>
    <div class="mp-word" id="word">${S.words[i].toUpperCase()}</div>
    <p class="mp-tip">${S.tips[i % S.tips.length]}, then leave it at the ${esc(stop.toLowerCase())}.</p>
    <div class="mp-timer" aria-hidden="true"><i id="tbar"></i></div>
    <div class="actions${S.play === 'practice' ? '' : ' one'}">${S.play === 'practice' ? `<button class="mtrx-btn mtrx-btn--secondary" id="backBtn" ${i === 0 ? 'disabled' : ''}>Back</button>` : ''}<button class="mtrx-btn mtrx-btn--primary" id="nextBtn">${i === n - 1 ? 'Start recall' : 'Next word'}</button></div></div>`;
  stage.querySelector('#nextBtn').onclick = () => nextWord(1);
  stage.querySelector('#backBtn')?.addEventListener('click', () => nextWord(-1));
  setStatus(S.play === 'challenge' ? `Each word stays for ${lv.sec} seconds` : 'Picture it vividly, then tap Next word (or press the right arrow)');
  tick();
}
function nextWord(d) {
  if (!S || S.phase !== 'study' || paused) return;
  const j = S.i + d; if (j < 0 || (d < 0 && S.play === 'challenge')) return;
  stopClocks(); S.word = { ms: 0, since: null };
  if (j >= S.words.length) { S.studyMs = elapsed(); S.phase = 'recall'; }
  else S.i = j;
  runClocks(); saveCur(); render(); hud();
}
function renderRecall() {
  const lv = LEVELS[S.level], cues = lv.cues, peekOk = S.play === 'practice' && S.late == null;
  stage.innerHTML = `<div class="mp-card mp-recall"><div class="mtrx-label" style="margin:0">${S.late != null ? 'Long-term check' : 'Recall'}</div><h2>Walk your palace</h2>
    <p class="note">${cues ? 'Go stop by stop and type the word you left there.' : 'Start at the first stop and walk the route in your head. Type each word in order.'} Leave a blank if a stop is empty.</p>
    <ol class="mp-list">${S.words.map((w, i) => `<li><span class="n">${i + 1}</span><span class="cue">${cues ? esc(S.loci[i]) : `Stop ${i + 1}`}</span><input data-i="${i}" value="${esc(S.answers[i])}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="next" aria-label="Word at stop ${i + 1}"${S.peeks.includes(i) ? ` placeholder="${w[0].toUpperCase()}…"` : ''}>${peekOk ? `<button class="peek" data-p="${i}" ${S.peeks.includes(i) ? 'disabled' : ''} aria-label="Peek at the first letter">Peek</button>` : ''}</li>`).join('')}</ol>
    <div class="actions one"><button class="mtrx-btn mtrx-btn--primary" id="doneBtn">Check my answers</button></div></div>`;
  const inputs = [];
  stage.querySelectorAll('input').forEach((inp) => { if (inp.dataset.i == null) return; inputs.push(inp);
    inp.oninput = () => { S.answers[+inp.dataset.i] = inp.value; saveSoon(); };
    inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); const nx = inputs[+inp.dataset.i + 1]; nx ? nx.focus() : finishRecall(); } };
  });
  stage.querySelectorAll('button').forEach((b) => { if (b.dataset.p == null) return; b.onclick = () => {
    const i = +b.dataset.p; if (S.peeks.includes(i)) return; S.peeks.push(i); b.disabled = true;
    const inp = inputs[i]; if (inp) { inp.placeholder = `${S.words[i][0].toUpperCase()}…`; inp.focus?.(); } saveCur();
  }; });
  stage.querySelector('#doneBtn').onclick = finishRecall;
  setStatus(S.late != null ? 'No peeking on a long-term check' : 'Take your time. The clock keeps running, but there is no limit');
  if (!('ontouchstart' in window)) inputs[0]?.focus?.();
}
// ---------- scoring ----------
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
function lev(a, b) { const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
function judge(ans, word) {
  const a = norm(ans), w = norm(word);
  if (!a) return 'blank';
  if (a === w || a + 's' === w || a === w + 's' || a + 'es' === w || a === w + 'es') return 'ok';
  if (w.length >= 5 && lev(a, w) <= 1) return 'typo'; // one slip of the finger on a longer word still counts
  return 'wrong';
}
function finishRecall() {
  if (!S || S.phase !== 'recall' || paused) return;
  stopClocks();
  const res = S.words.map((w, i) => {
    const j = judge(S.answers[i], w);
    if (j === 'ok' || j === 'typo') return S.peeks.includes(i) ? 'peek' : j;
    if (j === 'wrong' && S.words.some((x, k) => k !== i && ['ok', 'typo'].includes(judge(S.answers[i], x)))) return 'moved';
    return j;
  });
  const correct = res.filter((r) => r === 'ok' || r === 'typo').length, total = elapsed();
  const L = getLog(); let newBest = false;
  if (S.late != null) { const e = L[S.late]; if (e) e.late = { t: Date.now(), correct }; }
  else {
    const prev = L.filter((e) => e.level === S.level && e.play === S.play).reduce((m, e) => Math.max(m, e.correct), -1);
    newBest = prev >= 0 && correct > prev;
    L.push({ t: S.t, level: S.level, play: S.play, n: S.words.length, correct, moved: res.filter((r) => r === 'moved').length, peeks: S.peeks.length, studyMs: S.studyMs, recallMs: total - S.studyMs, palaceName: S.palaceName, loci: S.loci, words: S.words });
  }
  saveLog(L);
  S.phase = 'done'; S.res = res; S.correct = correct; S.total = total; S.newBest = newBest;
  localStorage.removeItem('mtrx-mp-cur'); render(); hud();
}
function renderResult() {
  const n = S.words.length, pct = S.correct / n, lv = LEVELS[S.level], L = getLog();
  const head = S.late != null ? (pct >= 0.8 ? 'Still there' : pct >= 0.5 ? 'Mostly still there' : 'Faded, and that\'s normal') : pct === 1 ? 'Perfect walk' : pct >= 0.8 ? 'Strong palace' : pct >= 0.5 ? 'Getting there' : 'Keep building images';
  const sym = { ok: '✓', typo: '✓', peek: '✓', moved: '↔', wrong: '✗', blank: '–' };
  const why = { typo: ' (typo)', peek: ' (peeked)', moved: ' (wrong stop)' };
  const extra = [];
  const moved = S.res.filter((r) => r === 'moved').length, peeks = S.res.filter((r) => r === 'peek').length;
  if (moved) extra.push(`${moved} right word${moved > 1 ? 's' : ''} at the wrong stop`);
  if (peeks) extra.push(`${peeks} more with a peek`);
  if (S.late != null) { const e = L[S.late]; if (e) extra.push(`straight after studying you had ${e.correct}`); }
  else if (S.newBest) extra.push('<span class="badge">New best</span>');
  stage.innerHTML = `<div class="mp-card mp-result"><div class="mtrx-label" style="margin:0">${lv.name}${S.play === 'challenge' ? ' · Challenge' : ''}${S.late != null ? ' · Long-term check' : ''}</div><h2>${head}</h2>
    <div class="big">${S.correct}<small>/${n}</small></div>
    <p class="note">in the right place${S.late == null ? ` · studied in ${fmt(S.studyMs)}, recalled in ${fmt(S.total - S.studyMs)}` : ''}${extra.length ? ` · ${extra.join(' · ')}` : ''}</p>
    <ol class="mp-review">${S.words.map((w, i) => `<li class="${S.res[i]}"><span class="n">${i + 1}</span><span class="cue">${esc(S.loci[i])}</span><b>${w.toUpperCase()}</b><em>${S.answers[i] ? esc(S.answers[i]) : '—'}${why[S.res[i]] || ''}</em><i>${sym[S.res[i]]}</i></li>`).join('')}</ol>
    <div class="actions"><button class="mtrx-btn mtrx-btn--secondary" id="homeBtn">Change level</button><button class="mtrx-btn mtrx-btn--primary" id="againBtn">Train again</button></div>
    <p class="hint-line">${S.late == null ? 'Come back in 12 hours or more and this screen will ask for the same list again. That second recall is the one that counts.' : 'Lists you re-test after a day are the real measure of your palace.'}</p></div>`;
  stage.querySelector('#homeBtn').onclick = renderHome;
  stage.querySelector('#againBtn').onclick = () => { if (S.late != null) renderHome(); else startSession(); };
  setStatus(`${S.correct} of ${n}${S.late != null ? ' on the long-term check' : ''}`, pct >= 0.5 ? 'win' : '');
}
// keys: right arrow / Enter / Space for next word, left arrow back, P pause (never while typing)
addEventListener('keydown', (e) => {
  if (menu.isOpen() || e.target?.closest?.('input,textarea,.drawer')) return;
  if (e.key === 'p' || e.key === 'P') { if (paused) resume(); else pause('button'); return; }
  if (!S || S.phase !== 'study' || paused) return;
  const onButton = e.target?.closest?.('button,a'); // a focused button already handles its own Enter/Space
  if (e.key === 'ArrowRight' || ((e.key === 'Enter' || e.key === ' ') && !onButton)) { e.preventDefault(); nextWord(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); nextWord(-1); }
});

// ---------- menu: palaces, progress, lessons ----------
const TAB = { train: 0, palaces: 1, progress: 2, how: 3 };
function palacesHTML() {
  return `<p>Pick a place you know so well you could walk it with your eyes shut. List the stops in the order you pass them, one per line. Use distinct things: a sofa and a TV, not two identical chairs.</p>
    ${palaces.map((p, i) => `<div class="set"><div class="mtrx-label">Palace ${i + 1}</div><input class="mtrx-input mp-name" data-name="${i}" value="${esc(p.name)}" aria-label="Palace name">
      <textarea class="mtrx-input mp-ta" data-loci="${i}" rows="8" aria-label="Stops, one per line">${esc(p.loci.join('\n'))}</textarea>
      <div class="btn-row" style="margin-top:8px"><button class="mtrx-btn mtrx-btn--primary sm" data-save="${i}">Save palace</button>${palaces.length > 1 ? `<button class="mtrx-btn mtrx-btn--ghost sm" data-del="${i}">Delete</button>` : ''}</div></div>`).join('')}
    <button class="mtrx-btn mtrx-btn--secondary" data-add="1" style="width:100%">Add another palace</button>`;
}
function mountPalaces(body) {
  const field = (attr, i) => [...body.querySelectorAll(attr === 'name' ? 'input' : 'textarea')].find((x) => x.dataset[attr] === String(i));
  body.querySelectorAll('button').forEach((b) => {
    if (b.dataset.save != null) b.onclick = () => {
      const i = +b.dataset.save, nm = field('name', i)?.value?.trim() || palaces[i].name;
      const loci = (field('loci', i)?.value || '').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 60);
      if (loci.length < 5) { b.textContent = 'Add at least 5 stops'; return; }
      palaces[i] = { ...palaces[i], name: nm.slice(0, 40), loci }; write('mtrx-mp-palaces', palaces);
      b.textContent = `Saved · ${loci.length} stops`; if (!S) renderHome(); else hud();
    };
    if (b.dataset.del != null) b.onclick = () => {
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again to delete'; return; }
      const i = +b.dataset.del; palaces.splice(i, 1); write('mtrx-mp-palaces', palaces);
      if (!palaces.some((p) => p.id === P.palace)) { P.palace = palaces[0].id; savePrefs(); }
      menu.refresh(); if (!S) renderHome();
    };
    if (b.dataset.add != null) b.onclick = () => { palaces.push({ id: `p${Date.now().toString(36)}`, name: `Palace ${palaces.length + 1}`, loci: [] }); write('mtrx-mp-palaces', palaces); menu.refresh(); };
  });
}
function chartSVG(L) {
  const pts = L.slice(-30), W = 320, H = 120, pad = 18;
  if (pts.length < 2) return '';
  const x = (i) => pad + (i * (W - pad * 2)) / (pts.length - 1), y = (v) => H - pad - v * (H - pad * 2);
  const line = pts.map((e, i) => `${x(i).toFixed(1)},${y(e.correct / e.n).toFixed(1)}`).join(' ');
  return `<svg class="mp-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Score per session"><line class="ax" x1="${pad}" y1="${y(0)}" x2="${W - pad}" y2="${y(0)}"/><line class="ax" x1="${pad}" y1="${y(1)}" x2="${W - pad}" y2="${y(1)}"/><text x="2" y="${y(1) + 3}">100%</text><text x="8" y="${y(0) + 3}">0</text><polyline class="ln" points="${line}"/>${pts.map((e, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(e.correct / e.n).toFixed(1)}" r="3"/>`).join('')}</svg>`;
}
function progressHTML() {
  const L = getLog();
  if (!L.length) return '<p class="empty">Finish a session and your scores show up here, with a chart once you have two.</p>';
  const rows = LEVELS.map((l, i) => { const es = L.filter((e) => e.level === i); if (!es.length) return ''; const best = (pl) => { const b = es.filter((e) => e.play === pl).reduce((m, e) => Math.max(m, e.correct), -1); return b < 0 ? '–' : `${b}/${l.n}`; }; return `<tr><td>${l.name}</td><td>${es.length}</td><td>${best('practice')}</td><td>${best('challenge')}</td></tr>`; }).join('');
  const lates = L.filter((e) => e.late);
  const keep = lates.length ? Math.round((lates.reduce((s, e) => s + Math.min(1, e.late.correct / Math.max(1, e.correct)), 0) / lates.length) * 100) : null;
  return `<div class="set"><div class="mtrx-label">Score per session (share of the list, last 30)</div>${chartSVG(L)}</div>
    <div class="set"><table class="bests"><tr><td></td><td class="mtrx-label">Sessions</td><td class="mtrx-label">Best</td><td class="mtrx-label">Challenge</td></tr>${rows}</table></div>
    <div class="set"><div class="mtrx-label">Long-term checks</div><p style="margin:0">${lates.length ? `${lates.length} done. On average you kept ${keep}% of what you recalled straight after studying.` : 'None yet. Lists come back for a re-test after 12 hours.'}</p></div>
    <div class="set"><div class="mtrx-label">Streak</div><p style="margin:0">${streak()} day${streak() === 1 ? '' : 's'} in a row. The study that changed people's memory used one 30-minute session a day for six weeks.</p></div>`;
}
const lesson = (n, title, text) => `<div class="lesson">${n ? `<span class="mtrx-numeral">${n}</span>` : ''}<h3>${title}</h3><p>${text}</p></div>`;
const menu = mountLearn({
  title: 'Memory Palace', label: 'Menu',
  onOpen: () => { if (S && !paused && S.phase !== 'done') { pause('menu'); autoPaused = true; } },
  onClose: () => { if (autoPaused) resume(); },
  tabs: [
    { name: 'Train', get html() { const theme = document.documentElement.dataset.theme || ''; return `<div class="set"><button class="mtrx-btn mtrx-btn--primary" style="width:100%" data-act="home">${S && S.phase !== 'done' ? 'End this session' : 'Back to training'}</button></div>
      <div class="set"><div class="mtrx-label">Theme</div>${seg('theme', [['', 'Light'], ['dark', 'Dark']], theme)}</div>
      <div class="set"><div class="mtrx-label">Your data</div><p style="margin:0 0 8px">Palaces and scores stay on this device only.</p><button class="mtrx-btn mtrx-btn--ghost sm" data-act="wipe">Delete all my scores</button></div>
      <p class="credits">Training design based on Dresler et al. (2017), Neuron. Word bank, code and lessons: Designed by MTRX™.</p>`; },
      mount: (body) => {
        body.querySelectorAll('button').forEach((b) => {
          if (b.dataset.act === 'home') b.onclick = () => { autoPaused = false; menu.close(); paused = false; renderHome(); };
          if (b.dataset.act === 'wipe') b.onclick = () => { if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again: this cannot be undone'; return; } localStorage.removeItem('mtrx-mp-log'); b.textContent = 'Scores deleted'; if (!S) renderHome(); hud(); };
        });
        bindSegs(body, (k, v) => { if (k === 'theme') { applyTheme(v); localStorage.setItem('mtrx-theme', v); } });
      } },
    { name: 'Palaces', get html() { return palacesHTML(); }, mount: mountPalaces },
    { name: 'Progress', get html() { return progressHTML(); } },
    { name: 'How it works', html: `
      ${lesson('01', 'Pick a place you know cold', 'Your home, your route to work, your school. You should be able to walk it in your head without effort. That route is your memory palace.')}
      ${lesson('02', 'Choose stops in a fixed order', 'Walk the route the same way every time and pick distinct things along it: the gate, the doormat, the front door, the shoe rack. The stops are the hooks; the order comes free.')}
      ${lesson('03', 'Turn each word into a scene', 'Don\'t repeat the word. See it, at the stop, doing something strange. <span class="ex">Front door + PIANO:</span> a piano jammed in your doorway, playing itself while you squeeze past.')}
      ${lesson('04', 'Walk back to recall', 'Start at the first stop and look around in your mind. The scene is usually still there. If a stop is empty, move on: the rest of the route still works.')}
      ${lesson('05', 'Reuse your palace', 'Old images fade within a day or two, so the same palace can carry a new list tomorrow. Many memory athletes use a handful of well-worn routes for years.')}
      ${lesson('06', 'Check yourself a day later', 'After 12 hours or more, the home screen brings back your last list for a long-term check, with no peeking. That second number is the honest one.')}
      <h3>The five levels</h3>${LEVELS.map((l) => `<div class="lesson"><b>${l.name}</b><p style="margin:6px 0 0">${l.note}</p></div>`).join('')}
      <div class="lesson"><b>Practice and Challenge</b><p style="margin:6px 0 0">${PLAY_NOTE.practice} ${PLAY_NOTE.challenge}</p></div>
      <p class="credits">Every list is drawn with your device's secure random generator from ${WORDS.length} words, and words from your last three lists are held back.</p>` },
    { name: 'Image tips', html: `
      ${lesson('', 'Exaggerate', 'Make it enormous or tiny. A lemon the size of a car rolling down your hallway beats a lemon on a shelf.')}
      ${lesson('', 'Add motion and sound', 'Things that move, crash, squeal or explode stick. A still picture slides off.')}
      ${lesson('', 'Use every sense', 'Smell the burnt toast, feel the cold of the iceberg in the shower, hear the trumpet blasting from the fridge.')}
      ${lesson('', 'Make it interact with the stop', 'The word should do something to the place: the kangaroo kicks the bookshelf over, the honey drips off the ceiling fan.')}
      ${lesson('', 'Be absurd, funny or a little gross', 'Your brain flags the unusual. The weirder the scene, the less work it takes to keep it.')}
      ${lesson('', 'Put yourself in it', 'You slip on the banana, you get soaked by the whale. Emotion and a point of view make memories sharper.')}` },
    { name: 'The science', html: `
      ${lesson('', 'What the study found', 'In Dresler and colleagues\' 2017 study in <i>Neuron</i>, 51 people with ordinary memories trained the method of loci for 40 daily sessions of 30 minutes. Their recall of a 72-word list rose from about 26 words to about 62. Four months later, with no more training, they still recalled far more than before.')}
      ${lesson('', 'Compared with brain training', 'A group that trained n-back (a popular working-memory game) for the same time gained about 11 words. The method-of-loci group gained about 35, and their brain networks at rest shifted toward those of memory champions.')}
      ${lesson('', 'What it will and won\'t do', 'It reliably makes you better at remembering lists, sequences, speeches and names, and it keeps working long after you stop practising. It is not proof that you get smarter in general. Train it for what it is good at.')}
      <p class="credits">Dresler M. et al. (2017). Mnemonic training reshapes brain networks to support superior memory. Neuron 93(5), 1227–1235.</p>` },
  ],
});
$('#learnBtn').onclick = () => menu.open(TAB.how);
$('#menuBtn').onclick = () => menu.open(TAB.train);

// ---------- boot: continue an unfinished session (paused) or show training ----------
(() => {
  const cur = read('mtrx-mp-cur', null);
  if (cur && Array.isArray(cur.words) && cur.words.length && (cur.phase === 'study' || cur.phase === 'recall')) {
    S = { ...cur, clock: { ms: cur.clock?.ms || 0, since: null }, word: { ms: 0, since: null }, peeks: cur.peeks || [], tips: cur.tips || TIPS };
    render(); pause('back'); return;
  }
  renderHome();
})();
