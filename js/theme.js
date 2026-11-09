// Light / dark toggle shared by every MTRX Arcade page. Designed by MTRX™
// The <head> of each page sets the theme before first paint, so there is no flash.
const root = document.documentElement;
export function applyTheme(t) {
  root.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0E0E0C' : '#ECEAE4');
}
export function mountThemeToggle(sel = '#themeSeg') {
  const btns = document.querySelectorAll(`${sel} button`);
  const mark = () => btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === (root.dataset.theme || ''))));
  btns.forEach((b) => (b.onclick = () => { applyTheme(b.dataset.t); localStorage.setItem('mtrx-theme', b.dataset.t); mark(); }));
  applyTheme(root.dataset.theme || '');
  mark();
  // follow the device setting until the player picks a theme
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener?.('change', (e) => { if (localStorage.getItem('mtrx-theme') === null) { applyTheme(e.matches ? 'dark' : ''); mark(); } });
}
