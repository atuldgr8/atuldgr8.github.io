/* =====================================================================
   Canvas: draws a project page from its JSON, and makes it move.

   A page is 1000 "units" wide and scales with the window (like Readymag).
   Grid: 12 columns, 32-unit margins, 16-unit gaps, 14-unit rows.

   Every element ("item") looks like:
   { id, type: text|image|video|embed|box|group,
     x, y, w, h,                       // units, relative to its group
     text, weight, color, align,       // text
     src, alt, fit,                    // image / video / embed
     fill,                             // box: line|fill|ghost|faint
     link: { href, newTab },
     children: [...],                  // group
     anim: {
       enter:  { on, from:{...}, dur, delay, ease },   // plays once when it scrolls into view
       scroll: { on, from:{...}, to:{...}, start, end, ease },  // scroll is the playhead
       hover:  { on, to:{...}, dur, ease },
       click:  { on, to:{...}, dur, ease }             // toggles
     } }
   A "state" is any of { x, y, scale, rotate, opacity, blur }.
   ===================================================================== */
window.Canvas = (() => {
  const U = 1000, M = 32, GAP = 16, COLS = 12, ROW = 14;
  const COLW = (U - 2 * M - (COLS - 1) * GAP) / COLS;
  const colX = i => M + i * (COLW + GAP);              // left edge of column i (0-11)
  const span = n => n * COLW + (n - 1) * GAP;          // width of n columns
  const NEUTRAL = { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, blur: 0 };

  const EASE = {
    linear: t => t,
    out: t => 1 - (1 - t) ** 3,
    in: t => t ** 3,
    inOut: t => t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2,
    pop: t => { const c = 1.70158; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },
  };
  const EASE_CSS = {
    linear: 'linear', out: 'cubic-bezier(.2,.7,.2,1)', in: 'cubic-bezier(.6,0,.8,.3)',
    inOut: 'cubic-bezier(.65,0,.35,1)', pop: 'cubic-bezier(.2,1.35,.4,1)',
  };

  const h = (tag, cls, parent) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  };
  const full = s => ({ ...NEUTRAL, ...(s || {}) });
  const transform = s => `translate(calc(var(--u) * ${s.x}), calc(var(--u) * ${s.y})) scale(${s.scale}) rotate(${s.rotate}deg)`;
  function setState(el, s, transition) {
    s = full(s);
    el.style.transition = transition || 'none';
    el.style.transform = transform(s);
    el.style.opacity = s.opacity;
    el.style.filter = s.blur ? `blur(${s.blur}px)` : '';
  }
  function mix(a, b, t) {
    a = full(a); b = full(b);
    const o = {};
    for (const k in NEUTRAL) o[k] = a[k] + (b[k] - a[k]) * t;
    return o;
  }
  function timing(dur = .6, ease = 'out', delay = 0) {
    const d = `${dur}s ${EASE_CSS[ease] || EASE_CSS.out} ${delay}s`;
    return `transform ${d}, opacity ${d}, filter ${d}`;
  }

  function embedURL(u = '') {
    let m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
    if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
    m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (m) return `https://player.vimeo.com/video/${m[1]}`;
    return u;
  }

  function item(it, o) {
    const pos = h('div', 'it t-' + it.type);
    pos.dataset.id = it.id;
    pos._item = it;
    place(pos, it);
    pos._ly = {};
    let inner = pos;
    for (const n of ['scroll', 'enter', 'hover', 'click']) inner = pos._ly[n] = h('div', 'ly ly-' + n, inner);

    if (it.link && it.link.href && !o.edit) {
      const a = h('a', 'lnk', inner);
      a.href = it.link.href;
      if (it.link.newTab) { a.target = '_blank'; a.rel = 'noopener'; }
      inner = a;
    }

    const media = (tag, label) => {
      if (!it.src) { const p = h('div', 'ph', inner); if (o.edit) p.dataset.label = label; return; }
      const m = h(tag, 'media', inner);
      m.style.objectFit = it.fit || 'cover';
      if (tag === 'img') { m.alt = it.alt || ''; m.decoding = 'async'; m.draggable = false; if (!o.edit) m.loading = 'lazy'; }
      else { m.muted = true; m.loop = true; m.autoplay = true; m.playsInline = true; m.setAttribute('muted', ''); m.setAttribute('playsinline', ''); }
      if (o.onMediaError) m.addEventListener('error', () => o.onMediaError(m, it.src), { once: true });
      m.src = o.src(it.src);
    };

    switch (it.type) {
      case 'text': {
        const t = h('div', 'txt', inner);
        if (it.weight == 700) t.classList.add('w-700');
        if (it.color && it.color !== 'fg') t.classList.add('c-' + it.color);
        if (it.align && it.align !== 'left') t.classList.add('a-' + it.align);
        t.innerHTML = it.text || '';
        break;
      }
      case 'image': media('img', 'image'); break;
      case 'video': media('video', 'video'); break;
      case 'embed': {
        if (!it.src) { const p = h('div', 'ph', inner); if (o.edit) p.dataset.label = 'embed'; break; }
        const f = h('iframe', 'embed', inner);
        f.src = embedURL(it.src);
        f.allow = 'autoplay; fullscreen; picture-in-picture';
        f.allowFullscreen = true;
        if (!o.edit) f.loading = 'lazy';
        break;
      }
      case 'box': h('div', 'box b-' + (it.fill || 'line'), inner); break;
      case 'group': {
        const g = h('div', 'grp', inner);
        for (const c of it.children || []) g.appendChild(item(c, o));
        break;
      }
    }
    return pos;
  }

  function place(el, it) {
    const s = el.style;
    s.left = `calc(var(--u) * ${it.x})`;
    s.top = `calc(var(--u) * ${it.y})`;
    s.width = `calc(var(--u) * ${it.w})`;
    s.height = it.type === 'text' ? '' : `calc(var(--u) * ${it.h})`;
    if (it.type !== 'text' && it.w && it.h) s.setProperty('--ar', `${it.w} / ${it.h}`);
  }

  const narrow = matchMedia('(max-width: 700px)');

  function render(cv, doc, o = {}) {
    o = { edit: false, src: s => s, ...o };
    cv._opts = o;
    cv.textContent = '';
    cv.classList.toggle('editing', !!o.edit);
    for (const it of doc.items) cv.appendChild(item(it, o));
    layout(cv);
    return cv;
  }

  function layout(cv) {
    const o = cv._opts || {};
    const flow = !o.edit && narrow.matches;
    cv.classList.toggle('flow', flow);
    if (flow) {
      cv.style.height = '';
      const kids = [...cv.children].filter(c => c._item);
      // reading order: things that sit side by side form a band; inside a band, left column first
      kids.sort((a, b) => (a._item.y - b._item.y) || (a._item.x - b._item.x));
      const bands = [];
      for (const c of kids) {
        const it = c._item, last = bands[bands.length - 1];
        if (last && it.y < last.bottom - 4) { last.items.push(c); last.bottom = Math.max(last.bottom, it.y + (it.h || 0)); }
        else bands.push({ items: [c], bottom: it.y + (it.h || 0) });
      }
      let n = 0;
      for (const band of bands) band.items.sort((a, b) => (a._item.x - b._item.x) || (a._item.y - b._item.y)).forEach(c => c.style.order = n++);
      const inner = cv.clientWidth - parseFloat(getComputedStyle(cv).paddingLeft) * 2;
      cv.style.setProperty('--u', inner / U + 'px');
      // a group keeps its composition: give it its own unit size so it fills the width
      for (const c of kids) if (c._item.type === 'group') c.style.setProperty('--u', inner / c._item.w + 'px');
      return;
    }
    for (const c of cv.children) if (c._item) c.style.order = '';
    const u = cv.clientWidth / U;
    cv.style.setProperty('--u', u + 'px');
    let bottom = 0;
    for (const c of cv.children) if (c._item) bottom = Math.max(bottom, c.offsetTop + c.offsetHeight);
    cv.style.height = Math.max(bottom + 140 * u, o.edit ? innerHeight : 0) + 'px';
  }

  /* ---------- motion ---------- */
  function animate(cv) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const all = [...cv.querySelectorAll('.it')];
    const scrollers = [], offs = [];
    const io = new IntersectionObserver(es => {
      for (const e of es) {
        if (!e.isIntersecting) continue;
        const p = e.target, a = p._item.anim.enter;
        setState(p._ly.enter, null, timing(a.dur, a.ease, a.delay));
        io.unobserve(p);
      }
    }, { rootMargin: '0px 0px -8% 0px' });

    for (const p of all) {
      const a = p._item.anim || {};
      if (a.enter && a.enter.on && !reduce) { setState(p._ly.enter, a.enter.from); io.observe(p); }
      if (a.scroll && a.scroll.on && !reduce) scrollers.push(p);
      if (a.hover && a.hover.on) {
        const on = e => { if (e.pointerType === 'mouse') setState(p._ly.hover, a.hover.to, timing(a.hover.dur, a.hover.ease)); };
        const off = e => { if (e.pointerType === 'mouse') setState(p._ly.hover, null, timing(a.hover.dur, a.hover.ease)); };
        p.addEventListener('pointerenter', on); p.addEventListener('pointerleave', off);
      }
      if (a.click && a.click.on) {
        let open = false;
        p.style.cursor = 'pointer';
        p.addEventListener('click', e => {
          if (e.target.closest('a')) return;
          open = !open;
          setState(p._ly.click, open ? a.click.to : null, timing(a.click.dur, a.click.ease));
        });
      }
    }

    // scroll: progress runs 0 -> 1 as the element's middle travels from
    // `start`% to `end`% of the screen height (100 = bottom edge, 0 = top)
    let raf = 0;
    const tick = () => {
      raf = 0;
      const vh = innerHeight;
      for (const p of scrollers) {
        const s = p._item.anim.scroll;
        const r = p.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        const a = vh * (s.start ?? 100) / 100, b = vh * (s.end ?? 0) / 100;
        let t = a === b ? (mid <= a ? 1 : 0) : (a - mid) / (a - b);
        t = Math.max(0, Math.min(1, t));
        setState(p._ly.scroll, mix(s.from, s.to, (EASE[s.ease] || EASE.linear)(t)));
      }
    };
    const req = () => { if (!raf) raf = requestAnimationFrame(tick); };
    if (scrollers.length) { addEventListener('scroll', req, { passive: true }); addEventListener('resize', req); tick(); }

    return () => {
      io.disconnect(); cancelAnimationFrame(raf);
      removeEventListener('scroll', req); removeEventListener('resize', req);
    };
  }

  /* ---------- a fresh project page ---------- */
  function template() {
    let n = 0;
    const id = () => 'i' + (++n).toString(36) + Math.random().toString(36).slice(2, 6);
    const rise = { on: true, from: { opacity: 0, y: 40 }, dur: .9, delay: 0, ease: 'out' };
    return { v: 1, items: [
      { id: id(), type: 'text', x: colX(0), y: 210, w: span(6), h: 14, text: 'Project title', weight: 700 },
      { id: id(), type: 'text', x: colX(0), y: 224, w: span(6), h: 28, text: 'One line on what this is, and why it matters.', color: 'mute' },
      { id: id(), type: 'text', x: colX(9), y: 210, w: span(3), h: 42, text: '2026<br>Your role<br>With whom', color: 'mute' },
      { id: id(), type: 'image', x: colX(0), y: 330, w: span(12), h: 527, src: '', anim: { enter: rise } },
      { id: id(), type: 'text', x: colX(0), y: 930, w: span(5), h: 70, text: 'The problem. A few sentences about what you set out to do and what made it hard.' },
      { id: id(), type: 'image', x: colX(6), y: 930, w: span(6), h: 345, src: '', anim: { enter: rise } },
      { id: id(), type: 'image', x: 0, y: 1380, w: U, h: 560, src: '', anim: { scroll: { on: true, from: { scale: 1.12 }, to: { scale: 1 }, start: 100, end: 30, ease: 'linear' } } },
      { id: id(), type: 'image', x: colX(0), y: 2040, w: span(6), h: 575, src: '', anim: { enter: rise } },
      { id: id(), type: 'image', x: colX(6), y: 2040, w: span(6), h: 575, src: '', anim: { enter: { ...rise, delay: .12 } } },
      { id: id(), type: 'text', x: colX(3), y: 2720, w: span(6), h: 42, text: 'What happened in the end. What you learned, what you would do next.' },
    ] };
  }

  return { U, M, GAP, COLS, ROW, COLW, colX, span, NEUTRAL, EASE, render, layout, animate, setState, mix, timing, template, place };
})();
