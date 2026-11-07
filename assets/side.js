/* =====================================================================
   Side nav + dock.

   Dock: a list whose words swell as the mouse gets near them, the
   nearest one most, its neighbours a little (like the macOS dock).
   Used by the side nav on project pages and the list on the work page.

   Side nav: fixed in the bottom-left corner of project pages.
   It lists the sections of the page you're on (or, if you choose, all projects).
   ===================================================================== */
window.Dock = function Dock(box, { max = .6, reach = 2.6 } = {}) {
  // Words scale where they stand (layout never moves, so the maths stays steady),
  // and the ones above and below slide apart to make room, evenly around the cursor.
  const items = () => [...box.querySelectorAll('[data-dock]')];
  let now = [], target = [], near = -1, raf = 0, py = null;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mid = el => el.offsetTop + el.offsetHeight / 2;      // ignores transforms: where it sits at rest

  function aim(els) {
    if (py == null) { target = els.map(() => 1); return; }
    const lineH = els[0] ? els[0].offsetHeight : 20, R = lineH * reach;
    let best = Infinity; near = -1;
    target = els.map((el, i) => {
      const d = Math.abs(py - mid(el));
      if (d < best) { best = d; near = i; }
      const k = Math.max(0, 1 - d / R);
      return 1 + max * (1 - Math.cos(k * Math.PI)) / 2;
    });
  }
  function frame() {
    const els = items();
    aim(els);
    let moving = false;
    els.forEach((el, i) => {
      now[i] = now[i] || 1;
      const d = target[i] - now[i];
      now[i] += d * .14;
      if (Math.abs(d) > .002) moving = true; else now[i] = target[i];
    });
    // spread: everything below the nearest word moves down by the growth in between, everything above moves up
    const grow = els.map((el, i) => (now[i] - 1) * el.offsetHeight);
    const k = near < 0 ? 0 : near;
    els.forEach((el, i) => {
      let dy = 0;
      if (i > k) { dy = grow[k] / 2 + grow[i] / 2; for (let j = k + 1; j < i; j++) dy += grow[j]; }
      if (i < k) { dy = -(grow[k] / 2 + grow[i] / 2); for (let j = i + 1; j < k; j++) dy -= grow[j]; }
      el.style.setProperty('--s', now[i].toFixed(4));
      el.style.setProperty('--dy', dy.toFixed(2) + 'px');
      el.classList.toggle('near', py != null && i === near);
    });
    box.classList.toggle('has-near', py != null && near >= 0);
    raf = moving ? requestAnimationFrame(frame) : 0;
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  box.addEventListener('pointermove', e => {
    if (!fine || reduce) return;
    const els = items(); if (!els.length) return;
    // pointer in the same coordinates as offsetTop (relative to the items' offset parent)
    const parent = els[0].offsetParent || document.body;
    py = e.clientY - parent.getBoundingClientRect().top - (parent.clientTop || 0);
    kick();
  });
  box.addEventListener('pointerleave', () => { py = null; kick(); });
  return {};
};

window.SideNav = (() => {
  const h = (tag, cls, parent, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  };
  const plain = html => { const d = document.createElement('div'); d.innerHTML = html || ''; return d.textContent.trim(); };

  // The side nav lists the sections of the page. A section starts at anything marked
  // "starts a section" (or an invisible section marker) and runs until the next one.
  // Everything above the first one is the first section, "intro" unless renamed.
  // It only shows once a page has two or more sections.
  let unspy = null;
  function mount({ cv, edit = false, mode } = {}) {
    document.querySelectorAll('nav.side').forEach(n => n.remove());
    if (unspy) { unspy(); unspy = null; }
    const secs = cv ? list(cv) : [];
    const show = mode !== 'off' && (edit || secs.length > 1);
    document.body.classList.toggle('has-side', show);
    if (!show) return null;
    const nav = h('nav', 'side', document.body);
    nav.setAttribute('aria-label', 'Sections of this page');
    const ul = h('ul', '', nav);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const s of secs) {
      const li = h('li', '', ul), a = h('a', '', li, s.label);
      a.href = s.el ? '#' + s.el.id : '#'; a.dataset.dock = '';
      a.addEventListener('click', e => {
        e.preventDefault();
        if (edit) return;
        const y = s.el ? s.el.getBoundingClientRect().top + scrollY - innerHeight * .2 : 0;
        scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' });
      });
      s.a = a;
    }
    // which section are we in: the last one whose top has passed 40% of the screen
    const spy = () => {
      let at = 0;
      secs.forEach((s, i) => { if (s.el && s.el.getBoundingClientRect().top < innerHeight * .4) at = i; });
      secs.forEach((s, i) => s.a.classList.toggle('on', i === at));
    };
    if (secs.length) { addEventListener('scroll', spy, { passive: true }); spy(); unspy = () => removeEventListener('scroll', spy); }
    Dock(nav, { max: .14, reach: 2 });
    return nav;
  }
  // the sections, in page order: [{ el, label }] (el is null for the unnamed first one)
  function list(cv) {
    const top = el => el.getBoundingClientRect().top;
    const secs = [...cv.querySelectorAll('.it[id^="sec-"]')]
      .map(el => ({ el, label: el._item.nav === true ? plain(el._item.text) : el._item.nav }))
      .filter(s => s.label)
      .sort((a, b) => top(a.el) - top(b.el));
    const first = secs.length ? top(secs[0].el) : Infinity;
    const above = [...cv.children].some(el => el.classList.contains('it') && !el.id.startsWith('sec-') && top(el) < first - 2);
    const intro = cv.dataset.intro || 'intro';
    // stuff above the first named section is the first section, unless that one already has the same name
    if (above && !(secs[0] && secs[0].label.trim().toLowerCase() === intro.toLowerCase())) secs.unshift({ el: null, label: intro });
    return secs;
  }
  return { mount, list };
})();
