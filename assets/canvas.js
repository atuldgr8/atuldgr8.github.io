/* =====================================================================
   Canvas: draws a project page from its JSON, and makes it move.

   A page is 1000 "units" wide and scales with the window (like Readymag).
   Grid: 12 columns, 32-unit margins, 16-unit gaps, 14-unit rows.

   Every element ("item") looks like:
   { id, type: text|image|video|embed|box|group,
     x, y, w, h,                       // units, relative to its group
     text, weight, color, align, size, // text (size: 's' small, 'l' large; medium if missing)
     src, alt, fit,                    // image / video / embed
     fill,                             // box: line|fill|ghost|faint
     link: { href, newTab },
     children: [...],                  // group
     anim: {
       enter:  { on, from:{...}, dur, delay, ease },   // plays once when it scrolls into view
       scroll: { on, keys:[{ at, s:{...}, ease }] },   // scroll is the playhead:
                                        //   at = where the element's middle is on screen,
                                        //   100 = bottom edge, 0 = top edge
                                        //   (older pages: from/to/start/end, still read)
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
  // palette colours (light/dark versions live in shared.css), plus "bg" = the page background
  const PAL = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'teal', 'bg'];
  const palCss = v => v && v[0] === '#' ? v : v === 'accent' ? 'var(--accent, var(--fg))' : PAL.includes(v) ? `var(--${v})` : null;
  // a page can set its own grid; anything it leaves out falls back to these
  const GRID = { cols: COLS, margin: M, gap: GAP, row: ROW };
  function grid(doc) {
    const g = { ...GRID, ...((doc && doc.grid) || {}) };
    g.colW = (U - 2 * g.margin - (g.cols - 1) * g.gap) / g.cols;
    g.colX = i => g.margin + i * (g.colW + g.gap);
    g.span = n => n * g.colW + (n - 1) * g.gap;
    return g;
  }

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

  const h = (tag, cls, parent, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    if (text != null) e.textContent = text;
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
    m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/);
    if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
    return u;
  }

  function item(it, o, depth = 0) {
    const pos = h('div', 'it t-' + it.type);
    pos.dataset.id = it.id;
    pos._item = it;
    if (it.nav) pos.id = 'sec-' + it.id;
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
      if (tag === 'img') { m.alt = it.alt || it.caption || ''; m.decoding = 'async'; m.draggable = false; if (!o.edit) m.loading = 'lazy'; }
      else { m.muted = true; m.loop = true; m.autoplay = true; m.playsInline = true; m.setAttribute('muted', ''); m.setAttribute('playsinline', ''); }
      if (o.onMediaError) m.addEventListener('error', () => o.onMediaError(m, it.src), { once: true });
      m.src = o.src(it.src);
      if (tag === 'img' && it.zoom && !o.edit) { pos.classList.add('zoomable'); m.addEventListener('click', () => enlarge(m)); }
      if (it.round) m.style.borderRadius = `calc(var(--u) * ${it.round})`;
    };

    // a caption under pictures, videos and embeds: always there, or only when you point at it
    if (it.caption && /^(image|video|embed|slides)$/.test(it.type)) {
      const c = h('div', 'cap' + (it.capShow ? ' always' : ''), pos);
      c.textContent = it.caption;
    }

    switch (it.type) {
      case 'text': {
        const t = h('div', 'txt', inner);
        if (it.weight == 700) t.classList.add('w-700');
        if (it.size === 's' || it.size === 'l') t.classList.add('sz-' + it.size);
        if (it.bg) { t.classList.add('has-bg'); t.style.background = it.bg === 'faint' ? 'var(--ghost)' : 'var(--accent, var(--fg))'; if (it.bg === 'accent' && !it.color) t.style.color = 'var(--bg)'; }
        if (palCss(it.color)) t.style.color = palCss(it.color);
        else if (it.color && it.color !== 'fg') t.classList.add('c-' + it.color);
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
      case 'marker': h('div', 'marker', inner).dataset.label = it.nav || 'section'; break;   // an invisible place to jump to
      case 'box': {
        const b = h('div', 'box', inner);
        if (palCss(it.fill)) b.style.background = palCss(it.fill);
        else b.classList.add('b-' + (it.fill || 'line'));
        if (it.round) b.style.borderRadius = `calc(var(--u) * ${it.round})`;
        if (it.text != null) {                // a box with words in it (a callout): it grows to fit them
          b.classList.add('has-text');
          const t = h('div', 'txt', b);
          if (palCss(it.color)) t.style.color = palCss(it.color);
          if (it.weight == 700) t.classList.add('w-700');
          t.innerHTML = it.text;
        }
        break;
      }
      case 'group': {
        if ((it.children || []).length && it.children.every(c => c.type === 'text')) pos.classList.add('textonly');
        const g = h('div', 'grp', inner);
        for (const c of it.children || []) g.appendChild(item(c, o, depth));
        break;
      }
      case 'button': {
        const b = h('div', 'btn b-' + (it.look || 'line') + (it.size === 's' || it.size === 'l' ? ' sz-' + it.size : '') + (it.weight == 700 ? ' w-700' : ''), inner);
        if (palCss(it.color)) b.style.color = palCss(it.color);
        h('span', '', b).innerHTML = it.text || 'Button';
        break;
      }
      case 'slides': {
        const list = it.slides || [];
        if (!list.length) { const p = h('div', 'ph', inner); if (o.edit) p.dataset.label = it.mode === 'row' ? 'carousel' : 'slideshow'; break; }
        if (it.mode === 'row') {             // carousel: several pictures in a row, slide along with arrows or a swipe
          const car = h('div', 'car', inner), track = h('div', 'car-track', car);
          car.style.setProperty('--show', Math.max(1, it.show || 3));
          car.style.setProperty('--cgap', `calc(var(--u) * ${it.gap ?? 16})`);
          list.forEach(sl => {
            const cell = h('div', 'car-cell', track), m = h('img', 'media', cell);
            m.alt = sl.alt || ''; m.draggable = false; m.decoding = 'async'; m.loading = 'lazy';
            m.style.objectFit = it.fit || 'cover';
            if (o.onMediaError) m.addEventListener('error', () => o.onMediaError(m, sl.src), { once: true });
            m.src = o.src(sl.src);
            if (!o.edit && it.zoom !== false) { cell.classList.add('zoomable'); m.addEventListener('click', () => enlarge(m)); }
          });
          if (!o.edit && list.length > (it.show || 3)) {
            const step = d => track.scrollBy({ left: d * (track.querySelector('.car-cell').offsetWidth + parseFloat(getComputedStyle(track).columnGap || 0)), behavior: 'smooth' });
            const prev = h('button', 'car-arrow car-prev', car, '←'), next = h('button', 'car-arrow car-next', car, '→');
            prev.type = next.type = 'button'; prev.setAttribute('aria-label', 'Previous pictures'); next.setAttribute('aria-label', 'Next pictures');
            prev.onclick = () => step(-1); next.onclick = () => step(1);
            const ends = () => { prev.disabled = track.scrollLeft < 4; next.disabled = track.scrollLeft > track.scrollWidth - track.clientWidth - 4; };
            track.addEventListener('scroll', ends, { passive: true }); requestAnimationFrame(ends);
          }
          break;
        }
        const box = h('div', 'sl sl-' + (it.trans || 'fade'), inner);
        const at = Math.min(list.length - 1, (o.slideAt && o.slideAt[it.id]) || 0);
        list.forEach((sl, i) => {
          const m = h('img', 'media', box);
          m.alt = sl.alt || ''; m.draggable = false; m.decoding = 'async';
          m.style.objectFit = it.fit || 'cover';
          if (o.onMediaError) m.addEventListener('error', () => o.onMediaError(m, sl.src), { once: true });
          m.src = o.src(sl.src);
          m.classList.add(i === at ? 'on' : i < at ? 'before' : 'after');
        });
        if (it.counter !== false && list.length > 1) h('span', 'sl-n', box, `${at + 1} / ${list.length}`);
        break;
      }
      case 'instance': {
        // a linked copy of a saved component, scaled to fit its box
        const c = o.lib && o.lib[it.ref];
        if (!c || depth > 6) { const p = h('div', 'ph', inner); if (o.edit) p.dataset.label = 'missing component'; break; }
        pos.style.setProperty('--pu', 'var(--u)');
        pos.style.setProperty('--k', it.w / c.w);
        const g = h('div', 'grp inst', inner);
        for (const ch of c.children || []) g.appendChild(item(ch, o, depth + 1));
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
    const grows = it.type === 'box' && it.text != null;
    s.height = it.type === 'text' || grows ? '' : `calc(var(--u) * ${it.h})`;
    s.minHeight = grows ? `calc(var(--u) * ${it.h})` : '';
    if (it.type !== 'text' && it.w && it.h) s.setProperty('--ar', `${it.w} / ${it.h}`);
    s.rotate = it.tilt ? it.tilt + 'deg' : '';           // a little tilt, to break the grid now and then
    el.classList.toggle('shadow', !!it.shadow);          // a soft shadow that follows the picture's own shape (cut-outs too)
  }

  const narrow = matchMedia('(max-width: 700px)');

  // "click to enlarge": the picture opens over the page, fitted inside the window with a margin.
  // Scroll / pinch / + − to zoom, drag to look around, double-click to zoom in or back.
  // Close with ×, Esc, or a click on the empty space around it. The page behind doesn't scroll meanwhile.
  function enlarge(img) {
    const src = typeof img === 'string' ? img : (img.currentSrc || img.src), alt = typeof img === 'string' ? '' : img.alt;
    const root = document.documentElement, was = root.style.overflow;
    root.style.overflow = 'hidden';
    const ov = document.createElement('div'); ov.className = 'zoom-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', alt || 'Picture');
    const stageEl = document.createElement('div'); stageEl.className = 'zoom-stage'; ov.appendChild(stageEl);
    const big = document.createElement('img'); big.src = src; big.alt = alt; big.draggable = false; stageEl.appendChild(big);
    const bar = document.createElement('div'); bar.className = 'zoom-bar'; ov.appendChild(bar);
    const mk = (label, title, fn, cls) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.title = title; b.setAttribute('aria-label', title); if (cls) b.className = cls; b.addEventListener('click', e => { e.stopPropagation(); fn(); }); return b; };
    const x = mk('×', 'Close (Esc)', () => close(), 'zoom-x'); ov.appendChild(x);
    bar.append(mk('−', 'Zoom out', () => zoomBy(1 / 1.5)), mk('fit', 'Back to fit', () => set(1, 0, 0)), mk('+', 'Zoom in', () => zoomBy(1.5)));
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('on'));
    x.focus({ preventScroll: true });

    let s = 1, tx = 0, ty = 0;
    const MAX = 8;
    const centre = () => { const r = stageEl.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    function clampT() {               // don't let the picture be dragged away entirely
      const r = stageEl.getBoundingClientRect(), w = big.offsetWidth * s, hh = big.offsetHeight * s;
      const mx = Math.max(0, (w - r.width) / 2 + 40), my = Math.max(0, (hh - r.height) / 2 + 40);
      tx = Math.max(-mx, Math.min(mx, tx)); ty = Math.max(-my, Math.min(my, ty));
    }
    function set(ns, ntx, nty) {
      s = Math.max(1, Math.min(MAX, ns)); tx = s === 1 ? 0 : ntx; ty = s === 1 ? 0 : nty; clampT();
      big.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      ov.classList.toggle('zoomed', s > 1);
    }
    function zoomAt(ns, qx, qy) {     // zoom keeping the point under the cursor in place
      ns = Math.max(1, Math.min(MAX, ns));
      const c = centre(), k = ns / s;
      set(ns, (qx - c.x) - k * (qx - c.x - tx), (qy - c.y) - k * (qy - c.y - ty));
    }
    const zoomBy = k => { const c = centre(); zoomAt(s * k, c.x, c.y); };

    ov.addEventListener('wheel', e => {
      e.preventDefault();
      const k = Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0025));   // trackpad pinch arrives as ctrl+wheel
      zoomAt(s * k, e.clientX, e.clientY);
    }, { passive: false });

    // drag to pan, two fingers to pinch
    const pts = new Map(); let pan = null, pinch = null, movedPx = 0, downOn = null;
    ov.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      downOn = e.target;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); ov.setPointerCapture(e.pointerId); movedPx = 0;
      if (pts.size === 1) pan = { x: e.clientX, y: e.clientY, tx, ty };
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s }; pan = null; }
    });
    ov.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      const p0 = pts.get(e.pointerId); movedPx += Math.hypot(e.clientX - p0.x, e.clientY - p0.y);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        zoomAt(pinch.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
      } else if (pan && s > 1) { set(s, pan.tx + e.clientX - pan.x, pan.ty + e.clientY - pan.y); ov.classList.add('panning'); }
    });
    const lift = e => {
      pts.delete(e.pointerId); ov.classList.remove('panning');
      if (pts.size < 2) pinch = null;
      if (pts.size === 1) { const [p] = [...pts.values()]; pan = { x: p.x, y: p.y, tx, ty }; }
      if (!pts.size) pan = null;
    };
    ov.addEventListener('pointerup', e => {
      const wasTap = movedPx < 6 && pts.size === 1;
      lift(e);
      if (wasTap && downOn !== big) close();   // a click on the empty space closes
    });
    ov.addEventListener('pointercancel', lift);
    big.addEventListener('dblclick', e => { s > 1 ? set(1, 0, 0) : zoomAt(2.5, e.clientX, e.clientY); });

    const key = e => {
      if (e.key === 'Escape') close();
      else if (e.key === '+' || e.key === '=') zoomBy(1.5);
      else if (e.key === '-') zoomBy(1 / 1.5);
      else if (e.key === '0') set(1, 0, 0);
    };
    addEventListener('keydown', key);
    let closed = false;
    function close() {
      if (closed) return; closed = true;
      ov.classList.remove('on'); removeEventListener('keydown', key);
      root.style.overflow = was;
      setTimeout(() => ov.remove(), 280);
    }
  }
  function render(cv, doc, o = {}) {
    o = { edit: false, src: s => s, ...o };
    cv._opts = o;
    cv.textContent = '';
    cv.classList.toggle('editing', !!o.edit);
    cv.dataset.intro = doc.intro || 'intro';     // the name of the first section (everything above the first named one)
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
      for (const c of kids) {
        if (c._item.type === 'group') c.style.setProperty('--u', inner / c._item.w + 'px');
        if (c._item.type === 'instance') c.style.setProperty('--pu', inner / c._item.w + 'px');
      }
      // a caption hangs under its picture: make room for it so it never runs into the next thing
      for (const c of kids) { const cap = c.querySelector(':scope > .cap'); c.style.marginBottom = cap ? cap.offsetHeight + 'px' : ''; }
      return;
    }
    // edge to edge: wider than the page, over the side nav, all the way across the window
    const off = cv.getBoundingClientRect().left, vw = document.documentElement.clientWidth;
    for (const c of cv.children) if (c._item) {
      c.style.order = ''; c.style.marginBottom = '';
      c.classList.toggle('bleed', !!c._item.bleed);
      if (c._item.bleed) { c.style.left = -off + 'px'; c.style.width = vw + 'px'; }
      if (c._item.type === 'group') c.style.removeProperty('--u');
      if (c._item.type === 'instance') c.style.setProperty('--pu', 'var(--u)');
    }
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

    // slideshows: click the right side for next, left side for previous; or they run on their own
    const timers = [];
    for (const p of all) {
      if (p._item.type !== 'slides') continue;
      const it = p._item, imgs = [...p.querySelectorAll('.sl > img')], n = p.querySelector('.sl-n');
      if (imgs.length < 2) continue;
      let at = 0;
      const go = i => {
        at = (i + imgs.length) % imgs.length;
        imgs.forEach((m, j) => { m.classList.toggle('on', j === at); m.classList.toggle('before', j < at); m.classList.toggle('after', j > at); });
        if (n) n.textContent = `${at + 1} / ${imgs.length}`;
      };
      const side = e => { const r = p.getBoundingClientRect(); return e.clientX - r.left < r.width / 3 ? -1 : 1; };
      if (it.mode !== 'auto' || it.clickable !== false) {
        p.addEventListener('click', e => { if (!e.target.closest('a')) go(at + side(e)); });
        p.addEventListener('pointermove', e => { p.style.cursor = side(e) < 0 ? 'w-resize' : 'e-resize'; });
      }
      if (it.mode === 'auto') {
        let paused = false;
        p.addEventListener('pointerenter', () => paused = true);
        p.addEventListener('pointerleave', () => paused = false);
        timers.push(setInterval(() => { if (!paused && !document.hidden) go(at + 1); }, Math.max(1, it.every || 3) * 1000));
      }
    }

    // scroll: progress runs 0 -> 1 as the element's middle travels from
    // `start`% to `end`% of the screen height (100 = bottom edge, 0 = top)
    let raf = 0;
    const tick = () => {
      raf = 0;
      const vh = innerHeight;
      for (const p of scrollers) {
        const r = p.getBoundingClientRect();
        const at = (r.top + r.height / 2) / vh * 100;
        setState(p._ly.scroll, scrollState(p._item.anim.scroll, at));
      }
    };
    const req = () => { if (!raf) raf = requestAnimationFrame(tick); };
    if (scrollers.length) { addEventListener('scroll', req, { passive: true }); addEventListener('resize', req); tick(); }

    return () => {
      io.disconnect(); cancelAnimationFrame(raf); timers.forEach(clearInterval);
      removeEventListener('scroll', req); removeEventListener('resize', req);
    };
  }

  // keyframes for a scroll animation, oldest format included, sorted bottom -> top of screen
  function keysOf(s) {
    if (s.keys && s.keys.length) return [...s.keys].sort((a, b) => b.at - a.at);
    return [{ at: s.start ?? 100, s: s.from || {}, ease: s.ease || 'linear' }, { at: s.end ?? 0, s: s.to || {} }];
  }
  // the state at a screen position (100 = element's middle at the bottom edge, 0 = top edge)
  function scrollState(s, at) {
    const k = keysOf(s);
    if (at >= k[0].at) return full(k[0].s);
    if (at <= k[k.length - 1].at) return full(k[k.length - 1].s);
    for (let i = 0; i < k.length - 1; i++) {
      const a = k[i], b = k[i + 1];
      if (at <= a.at && at >= b.at) {
        const t = a.at === b.at ? 1 : (a.at - at) / (a.at - b.at);
        return mix(a.s, b.s, (EASE[a.ease] || EASE.linear)(t));
      }
    }
    return full(null);
  }

  /* ---------- a fresh project page ---------- */
  function template() {
    if (window.Blocks) return window.Blocks.template(grid(null));
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

  return { U, M, GAP, COLS, ROW, COLW, colX, span, grid, NEUTRAL, EASE, EASE_CSS, render, layout, animate, setState, mix, timing, template, place, keysOf, scrollState, full, enlarge };
})();
