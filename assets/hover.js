/* =====================================================================
   Colour on interaction. The site is black and white; things you can
   click take a colour while the mouse is on them.

   Which colour each thing gets is yours to assign (work-list editor →
   Site colours). Colours are names from the palette (red, blue…), and each
   name has a light-mode and a dark-mode version, so contrast holds in both.
   ===================================================================== */
(() => {
  const TOKENS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'teal'];
  // what gets which colour, unless you've changed it
  const DEFAULT = { name: 'red', work: 'blue', resume: 'green', intro: 'purple', doors: 'orange',
                    notes: 'teal', tldr: 'pink', sections: 'blue', next: 'red', other: 'purple' };
  const ROLES = [
    ['name', '#name, .top .me'],
    ['work', '.bar .work, .top .nav-work'],
    ['resume', '.bar .resume, .top .nav-resume'],
    ['doors', '.door'],
    ['intro', '.intro a'],
    ['notes', '.note a, #egg a'],
    ['tldr', '.tldr-open'],
    ['sections', 'nav.side a'],
    ['next', '.next a'],
  ];
  const SKIP = '.wk, .ed-panel *, .ed-bar *, .ed-lib *, .wk-row *, .wk-pop *, .wk-extra *, #theme, .tl-stage';
  const SEL = 'a, button, [data-hover]';

  let assign = { ...DEFAULT };
  function apply(site) {
    if (!site) return;
    assign = { ...DEFAULT, ...(site.hover || {}) };
    // your own versions of the palette colours, light and dark
    const pal = site.palette || {};
    const light = [], dark = [];
    for (const t of TOKENS) {
      if (pal[t] && pal[t].light) light.push(`--${t}: ${pal[t].light};`);
      if (pal[t] && pal[t].dark) dark.push(`--${t}: ${pal[t].dark};`);
    }
    let st = document.getElementById('palette-css');
    if (!st) { st = document.createElement('style'); st.id = 'palette-css'; document.head.appendChild(st); }
    st.textContent = `:root{${light.join('')}}
      @media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${dark.join('')}}}
      :root[data-theme="dark"]{${dark.join('')}}`;
  }
  window.SiteColours = { apply, TOKENS, DEFAULT, ROLES };
  if (window.SITE) apply(window.SITE);
  else fetch('projects/index.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(apply).catch(() => {});

  if (!matchMedia('(hover: hover)').matches) return;
  const css = v => !v ? 'var(--fg)' : v[0] === '#' ? v : `var(--${v})`;
  let lastRandom = -1;
  const probe = document.createElement('i'); probe.hidden = true; document.documentElement.appendChild(probe);
  document.addEventListener('pointerover', e => {
    const el = e.target.closest && e.target.closest(SEL);
    if (!el || el.matches(SKIP) || el.classList.contains('hc')) return;
    if (!el.dataset.ownHc) {
      const role = (ROLES.find(([, s]) => el.matches(s)) || ['other'])[0];
      let v = assign[role] || assign.other;
      if (!v || v === 'none') return;
      if (v === 'random') { let i; do { i = Math.floor(Math.random() * TOKENS.length); } while (i === lastRandom); lastRandom = i; v = TOKENS[i]; }
      el.style.setProperty('--hc', css(v));
    }
    // the top bar inverts what's under it once you've scrolled: give it the opposite colour
    probe.style.color = el.style.getPropertyValue('--hc');
    const m = getComputedStyle(probe).color.match(/\d+/g);
    if (m) el.style.setProperty('--hci', `rgb(${255 - m[0]}, ${255 - m[1]}, ${255 - m[2]})`);
    el.classList.add('hc');
    el.addEventListener('pointerleave', () => el.classList.remove('hc'), { once: true });
  });
})();
