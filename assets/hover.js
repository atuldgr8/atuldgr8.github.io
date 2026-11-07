/* =====================================================================
   Hover colours: anything you can click turns a colour when the mouse
   is on it, picked from a small palette (never the same one twice in a
   row). No movement, just colour: a quiet "yes, this does something".
   ===================================================================== */
(() => {
  if (!matchMedia('(hover: hover)').matches) return;
  const PALETTE = ['#db0007', '#1f3a93', '#0a7d4f', '#e8a400', '#7b2ff7', '#ff5a1f'];
  const SEL = 'a, button, [data-hover]';
  const SKIP = '.wk, nav.side a, .ed-panel *, .ed-bar *, .ed-lib *, .wk-row *, .tldr-stage, #theme';
  let last = -1;
  const inv = c => '#' + (0xffffff ^ parseInt(c.slice(1), 16)).toString(16).padStart(6, '0');
  document.addEventListener('pointerover', e => {
    const el = e.target.closest && e.target.closest(SEL);
    if (!el || el.matches(SKIP) || el.classList.contains('hc')) return;
    let i; do { i = Math.floor(Math.random() * PALETTE.length); } while (i === last && PALETTE.length > 1);
    last = i;
    el.style.setProperty('--hc', PALETTE[i]);
    el.style.setProperty('--hci', inv(PALETTE[i]));
    el.classList.add('hc');
    el.addEventListener('pointerleave', () => el.classList.remove('hc'), { once: true });
  });
  // side nav names without their own colour borrow one from the palette too
  document.addEventListener('pointerover', e => {
    const a = e.target.closest && e.target.closest('nav.side a');
    if (a && !a.style.getPropertyValue('--hc')) a.style.setProperty('--hc', PALETTE[Math.floor(Math.random() * PALETTE.length)]);
  });
})();
