// Learn drawer: open any time, game state is untouched. Designed by MTRX™
export function mountLearn({ title, tabs, onOpen }) {
  const scrim = document.createElement('div'); scrim.className = 'scrim';
  const d = document.createElement('aside'); d.className = 'drawer'; d.setAttribute('aria-label', title);
  d.innerHTML = `<header><div><div class="mtrx-label" style="margin:0">Learn</div><h2 style="margin:0;font-size:var(--text-2xl)">${title}</h2></div>
    <button class="mtrx-btn mtrx-btn--ghost sm" data-close aria-label="Close">Close</button></header>
    <div class="tabs" role="tablist">${tabs.map((t, i) => `<button role="tab" aria-selected="${i === 0}" data-i="${i}">${t.name}</button>`).join('')}</div>
    <div class="body"></div>`;
  document.body.append(scrim, d);
  const body = d.querySelector('.body');
  const show = (i) => {
    d.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.i == i));
    body.innerHTML = tabs[i].html; body.scrollTop = 0; tabs[i].mount?.(body);
  };
  d.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => show(+b.dataset.i)));
  const close = () => { d.classList.remove('on'); scrim.classList.remove('on'); };
  const open = (i = 0) => { show(i); d.classList.add('on'); scrim.classList.add('on'); onOpen?.(); };
  d.querySelector('[data-close]').onclick = close; scrim.onclick = close;
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  return { open, close };
}
// Secure randomness: every puzzle seed and every AI coin flip comes from here
export const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
export const randInt = (n) => Math.floor(rand() * n);
export const pick = (a) => a[randInt(a.length)];
