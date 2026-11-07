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
  const ready = site => { apply(site); swellUp(site); };
  if (window.SITE) ready(window.SITE);
  else fetch('projects/index.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(ready).catch(() => ready(null));

  /* ---------- swell ----------
     Words grow a little as the mouse comes near; the ones around them lean
     away to make room. Same feel as the side nav, for the top bar and the
     intro paragraph. Switch either off in the work-list editor → Motion
     (on your laptop there's also a quick on/off button in the corner). */
  function Swell(els, { max = .1, reach = 70, push = 0 } = {}) {
    if (!els.length) return;
    const st = els.map(() => ({ s: 1, x: 0, y: 0, ts: 1, tx: 0, ty: 0 }));
    let px = null, py = null, raf = 0;
    const frame = () => {
      let moving = false;
      els.forEach((el, i) => {
        const o = st[i];
        if (px == null) { o.ts = 1; o.tx = 0; o.ty = 0; }
        else {
          const r = el.getBoundingClientRect();
          const cx = r.left + r.width / 2 - o.x, cy = r.top + r.height / 2 - o.y;   // where it sits at rest
          const dx = cx - px, dy = (cy - py) * 1.6, d = Math.hypot(dx, dy) || 1;
          const k = Math.max(0, 1 - d / reach), e = (1 - Math.cos(k * Math.PI)) / 2;
          o.ts = 1 + max * e;
          const p = push * e * Math.min(1, d / (reach * .35));
          o.tx = dx / d * p; o.ty = (cy - py) / d * p;
        }
        o.s += (o.ts - o.s) * .16; o.x += (o.tx - o.x) * .16; o.y += (o.ty - o.y) * .16;
        if (Math.abs(o.ts - o.s) + Math.abs(o.tx - o.x) + Math.abs(o.ty - o.y) > .003) moving = true;
        el.style.transform = (o.s === 1 && !o.x && !o.y) ? '' : `translate(${o.x.toFixed(2)}px, ${o.y.toFixed(2)}px) scale(${o.s.toFixed(4)})`;
      });
      raf = moving ? requestAnimationFrame(frame) : 0;
    };
    addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      px = e.clientX; py = e.clientY;
      if (!raf) raf = requestAnimationFrame(frame);
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { px = py = null; if (!raf) raf = requestAnimationFrame(frame); });
  }
  function swellUp(site) {
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const m = { bar: true, intro: true, ...((site && site.motion) || {}) };
    try { const o = localStorage.getItem('swell-override'); if (o) m.bar = m.intro = o === 'on'; } catch (e) {}
    if (m.bar) {
      const bar = [...document.querySelectorAll('#name, .bar .work, .bar .resume, .top .me, .top .nav-work, .top .nav-resume')];
      bar.forEach(el => { el.style.display = 'inline-block'; el.style.transformOrigin = '50% 60%'; });
      Swell(bar, { max: .16, reach: 90 });
    }
    const intro = document.querySelector('.intro');
    if (m.intro && intro) {
      // wrap every word, links included, so each can move on its own
      const words = [];
      const walk = n => {
        for (const c of [...n.childNodes]) {
          if (c.nodeType === 1) { walk(c); continue; }
          if (c.nodeType !== 3 || !c.textContent.trim()) continue;
          const frag = document.createDocumentFragment();
          for (const part of c.textContent.split(/(\s+)/)) {
            if (!part) continue;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); continue; }
            const w = document.createElement('span'); w.className = 'sw'; w.textContent = part;
            w.style.display = 'inline-block'; w.style.transformOrigin = '50% 60%';
            frag.appendChild(w); words.push(w);
          }
          c.replaceWith(frag);
        }
      };
      walk(intro);
      Swell(words, { max: .22, reach: 80, push: 7 });
    }
  }

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
