/* =====================================================================
   The editor. Opens on project.html?p=<slug>&edit
   Same canvas as the live page, plus: select, drag, resize, snap to the
   grid (hold Alt to break it), groups, text editing, drop in images,
   animation settings, undo, preview, and saving into your site folder.
   ===================================================================== */
(async () => {
  const C = Canvas, U = C.U, ROW = C.ROW;
  const q = new URLSearchParams(location.search);
  const slug = (q.get('p') || '').replace(/[^\w-]/g, '');
  const stage = document.querySelector('.stage');
  const cv = stage.querySelector('.cv');
  document.body.classList.add('is-editing');
  document.querySelector('.next').hidden = true;

  const h = (tag, cls, parent, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  };
  const uid = () => 'i' + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6);
  const clone = o => JSON.parse(JSON.stringify(o));
  const r1 = v => Math.round(v * 10) / 10;

  if (!slug) { document.body.innerHTML = '<p class="missing">Which project? Open this from <a href="work.html?edit">work.html?edit</a></p>'; return; }

  /* ---------------- state ---------------- */
  let doc, index, meta;
  let sel = new Set();
  let scope = [];                         // ids of the groups we've stepped into
  let undo = [], redo = [], last = null;
  let dirty = false, snap = true, grid = true, previewing = false, stopAnim = null;
  let editing = null;                     // { el, it } while typing in a text box
  const blobs = new Map();                // blob url -> File not yet saved to the folder
  const cache = new Map();                // folder path -> blob url (for showing files from the folder)

  /* ---------------- load ---------------- */
  index = (await FS.json('projects/index.json')) || { projects: [] };
  meta = index.projects.find(p => p.slug === slug) || { slug, title: slug.replace(/-/g, ' '), year: String(new Date().getFullYear()), tags: '', summary: '', thumb: '', hidden: true };
  doc = (await FS.json(`projects/${slug}.json`)) || C.template();
  const fresh = !index.projects.some(p => p.slug === slug);

  try {
    const d = JSON.parse(localStorage.getItem('draft:' + slug) || 'null');
    if (d && JSON.stringify(d.doc) !== JSON.stringify(doc) &&
        confirm(`There are unsaved changes to this page from ${new Date(d.t).toLocaleString()}. Bring them back?`)) {
      doc = d.doc; meta = d.meta || meta; dirty = true;
    }
  } catch (e) {}
  last = snapshot();
  if (fresh) dirty = true;

  /* ---------------- tree helpers ---------------- */
  function walk(items, fn, parent = null) {
    for (const it of items) { fn(it, items, parent); if (it.children) walk(it.children, fn, it); }
  }
  function find(id) {
    let r = null;
    walk(doc.items, (it, arr, parent) => { if (it.id === id) r = { it, arr, parent }; });
    return r;
  }
  const scopeItems = () => scope.length ? find(scope[scope.length - 1]).it.children : doc.items;
  function origin() {                     // where the current group sits on the page
    let x = 0, y = 0;
    for (const id of scope) { const g = find(id).it; x += g.x; y += g.y; }
    return { x, y };
  }
  const selected = () => [...sel].map(id => find(id)).filter(Boolean).map(f => f.it);
  const elOf = id => cv.querySelector(`.it[data-id="${id}"]`);
  const uPx = () => cv.getBoundingClientRect().width / U;
  function toUnits(e) {
    const r = cv.getBoundingClientRect(), u = r.width / U, o = origin();
    return { x: (e.clientX - r.left) / u - o.x, y: (e.clientY - r.top) / u - o.y };
  }
  function bbox(items) {
    const x = Math.min(...items.map(i => i.x)), y = Math.min(...items.map(i => i.y));
    const r = Math.max(...items.map(i => i.x + i.w)), b = Math.max(...items.map(i => i.y + (i.h || 0)));
    return { x, y, w: r - x, h: b - y };
  }
  function freshIds(it) { it.id = uid(); (it.children || []).forEach(freshIds); return it; }

  /* ---------------- snapping ---------------- */
  const EDGES = [0, U, U / 2];
  for (let i = 0; i < C.COLS; i++) EDGES.push(C.colX(i), C.colX(i) + C.COLW);
  const near = 9;
  function snapEdge(v) {                  // one edge to the nearest column line
    const o = origin().x;
    let best = null;
    for (const E of EDGES) { const d = (E - o) - v; if (Math.abs(d) < near && (best === null || Math.abs(d) < Math.abs(best))) best = d; }
    return best === null ? v : v + best;
  }
  function snapBox(x, w) {                // left or right edge, whichever is closer
    const o = origin().x;
    let best = null;
    for (const E of EDGES) for (const edge of [x, x + w, x + w / 2]) {
      const d = (E - o) - edge;
      if (Math.abs(d) < near && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
    return best === null ? x : x + best;
  }
  const snapY = y => { const o = origin().y; return Math.round((y + o) / ROW) * ROW - o; };

  /* ---------------- history ---------------- */
  function snapshot() { return JSON.stringify({ doc, meta }); }
  function commit(keepPanel) {
    const now = snapshot();
    if (now === last) { render(keepPanel); return; }
    undo.push(last); if (undo.length > 200) undo.shift();
    redo = []; last = now;
    touch(); render(keepPanel);
  }
  function restore(s) {
    const o = JSON.parse(s); doc = o.doc; meta = o.meta;
    sel = new Set([...sel].filter(id => find(id)));
    scope = scope.filter(id => find(id));
    touch(); render();
  }
  function doUndo() { if (!undo.length) return toast('nothing to undo'); redo.push(last); last = undo.pop(); restore(last); }
  function doRedo() { if (!redo.length) return; undo.push(last); last = redo.pop(); restore(last); }
  function touch() {
    dirty = true; paintSave();
    try { localStorage.setItem('draft:' + slug, JSON.stringify({ t: Date.now(), doc, meta })); } catch (e) {}
  }
  addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------------- media ---------------- */
  const resolve = src => (src && cache.get(src)) || src;
  async function onMediaError(el, src) {
    if (!FS.root || !src || src.startsWith('blob:') || /^https?:/.test(src)) return;
    try { const url = URL.createObjectURL(await FS.read(src)); cache.set(src, url); el.src = url; } catch (e) {}
  }
  const safeName = n => n.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'file';
  async function keepFile(file) {         // copy a dropped file into projects/media/<slug>/
    const ext = (file.name.match(/\.[^.]+$/) || [''])[0].toLowerCase() || ('.' + (file.type.split('/')[1] || 'bin'));
    let path, n = 0;
    do { path = `projects/media/${slug}/${safeName(file.name)}${n ? '-' + n : ''}${ext}`; n++; } while (await FS.exists(path));
    await FS.write(path, file);
    return path;
  }
  async function persistMedia() {         // anything still only in memory goes into the folder
    if (!FS.root) return;
    const todo = [];
    walk(doc.items, it => { if (it.src && blobs.has(it.src)) todo.push(it); });
    if (meta.thumb && blobs.has(meta.thumb)) todo.push(meta);
    const done = new Map();
    for (const it of todo) {
      const key = it.type ? it.src : it.thumb;
      if (!done.has(key)) { const p = await keepFile(blobs.get(key)); cache.set(p, key); done.set(key, p); }
      if (it.type) it.src = done.get(key); else it.thumb = done.get(key);
    }
    for (const k of done.keys()) blobs.delete(k);
  }
  function ratio(url, kind) {
    return new Promise(res => {
      if (kind === 'video') {
        const v = document.createElement('video'); v.preload = 'metadata';
        v.onloadedmetadata = () => res(v.videoWidth / v.videoHeight || 16 / 9); v.onerror = () => res(16 / 9); v.src = url;
      } else {
        const i = new Image(); i.onload = () => res(i.naturalWidth / i.naturalHeight || 1); i.onerror = () => res(4 / 3); i.src = url;
      }
    });
  }
  async function stash(file) {            // returns a src for this file
    if (!FS.root && FS.supported) await FS.connect().then(paintFolder);
    const url = URL.createObjectURL(file);
    if (FS.root) { const p = await keepFile(file); cache.set(p, url); return { src: p, url }; }
    blobs.set(url, file);
    toast('Connect your site folder or this picture will be lost on reload');
    return { src: url, url };
  }
  async function addFiles(files, at, target) {
    files = [...files].filter(f => /^(image|video)\//.test(f.type));
    if (!files.length) return;
    // dropped onto a picture or a placeholder: swap what's inside, keep the box
    if (target && /image|video/.test(target.type) && files.length === 1) {
      const kind = files[0].type.startsWith('video') ? 'video' : 'image';
      const { src } = await stash(files[0]);
      target.type = kind; target.src = src;
      setSel([target.id]); commit(); return;
    }
    const added = [];
    let y = at ? at.y : viewY();
    for (const f of files) {
      const kind = f.type.startsWith('video') ? 'video' : 'image';
      const { src, url } = await stash(f);
      const w = C.span(6), hgt = w / await ratio(url, kind);
      const x = at ? snapBox(at.x - w / 2, w) : C.colX(0) - origin().x;
      const it = { id: uid(), type: kind, x: r1(x), y: r1(snap ? snapY(y) : y), w: r1(w), h: r1(hgt), src, fit: 'cover', alt: '' };
      scopeItems().push(it); added.push(it.id);
      y += hgt + ROW * 2;
    }
    setSel(added); commit();
  }
  function pickFiles(accept, multiple = true) {
    return new Promise(res => {
      const i = document.createElement('input');
      i.type = 'file'; i.accept = accept; i.multiple = multiple;
      i.onchange = () => res([...i.files]);
      i.click();
    });
  }
  function viewY() {                      // a spot near the top of what's on screen
    const r = cv.getBoundingClientRect();
    return (innerHeight * .3 - r.top) / uPx() - origin().y;
  }

  /* ---------------- chrome: panel, toolbar, overlay ---------------- */
  const ov = h('div', 'ed-ov', stage);
  const gridEl = h('div', 'ed-grid', stage);
  for (let i = 0; i < C.COLS; i++) {
    const c = h('i', '', gridEl);
    c.style.left = `calc(var(--u) * ${C.colX(i)})`; c.style.width = `calc(var(--u) * ${C.COLW})`;
  }
  const panel = h('aside', 'ed-panel', document.body);
  const bar = h('div', 'ed-bar', document.body);
  const toastEl = h('div', 'ed-toast', document.body);
  let toastT;
  function toast(msg, ms = 2600) { toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), ms); }

  const B = (label, title, fn, cls = '') => { const b = h('button', 'ed-b ' + cls, bar, label); b.title = title; b.type = 'button'; b.onclick = fn; return b; };
  const sep = () => h('span', 'ed-sep', bar);
  h('a', 'ed-b', bar, '← work').href = 'work.html?edit';
  sep();
  B('+ text', 'Add text (T)', () => addText());
  B('+ image', 'Add pictures (or drop / paste them anywhere)', async () => addFiles(await pickFiles('image/*')));
  B('+ video', 'Add a video file', async () => addFiles(await pickFiles('video/*')));
  B('+ embed', 'YouTube / Vimeo / any link', () => addEmbed());
  B('+ box', 'A plain box: line or fill', () => addBox());
  sep();
  const gridB = B('grid', 'Show the grid (G)', () => { grid = !grid; paintToggles(); });
  const snapB = B('snap', 'Snap to the grid (S). Hold Alt while dragging to break it once.', () => { snap = !snap; paintToggles(); });
  sep();
  B('undo', 'Undo (⌘Z)', doUndo);
  B('redo', 'Redo (⇧⌘Z)', doRedo);
  sep();
  B('preview', 'See it the way visitors will (P)', () => togglePreview());
  B('?', 'Shortcuts', () => help.classList.toggle('on'));
  sep();
  const folderB = B('', '', async () => { if (await FS.connect()) { paintFolder(); render(); toast('Connected. Saving goes straight into ' + FS.root.name); } });
  const saveB = B('save', 'Save into your site folder (⌘S)', () => save(), 'ed-save');
  function paintToggles() {
    gridB.classList.toggle('on', grid); snapB.classList.toggle('on', snap);
    stage.classList.toggle('show-grid', grid);
  }
  function paintFolder() {
    folderB.textContent = FS.root ? '▣ ' + FS.root.name : FS.needsClick ? '▢ reconnect ' + FS.name : '▢ connect folder';
    folderB.title = FS.root ? 'Saving into this folder' : FS.supported ? 'Pick your site folder (the one with index.html) so saving writes straight into it' : 'This browser can\'t write to folders, saving will download files instead (use Chrome/Edge/Arc)';
    folderB.classList.toggle('on', !!FS.root);
  }
  function paintSave() { saveB.classList.toggle('dirty', dirty); saveB.textContent = dirty ? 'save •' : 'saved'; }

  const help = h('div', 'ed-help', document.body);
  help.innerHTML = `<b>Shortcuts</b>
  <p>drag · move &nbsp; <kbd>Alt</kbd> drag · break the grid &nbsp; <kbd>Shift</kbd> click · add to selection</p>
  <p>double-click text · type &nbsp; double-click group · step inside &nbsp; <kbd>Esc</kbd> · step out</p>
  <p><kbd>⌘G</kbd> group &nbsp; <kbd>⇧⌘G</kbd> ungroup &nbsp; <kbd>⌘D</kbd> duplicate &nbsp; <kbd>⌫</kbd> delete</p>
  <p><kbd>⌘C</kbd>/<kbd>⌘V</kbd> copy, paste (pictures too) &nbsp; <kbd>]</kbd>/<kbd>[</kbd> front, back</p>
  <p>arrows · nudge &nbsp; <kbd>Shift</kbd>+arrows · one row / one column</p>
  <p><kbd>T</kbd> text &nbsp; <kbd>G</kbd> grid &nbsp; <kbd>S</kbd> snap &nbsp; <kbd>P</kbd> preview &nbsp; <kbd>⌘S</kbd> save</p>
  <p>while typing: <kbd>⌘B</kbd> bold, <kbd>⌘K</kbd> link</p>
  <p>Drop a picture on a grey placeholder to fill it.</p>`;
  help.onclick = () => help.classList.remove('on');

  /* ---------------- render ---------------- */
  function render(keepPanel) {
    if (previewing) return;
    C.render(cv, doc, { edit: true, src: resolve, onMediaError });
    stage.style.setProperty('--u', cv.style.getPropertyValue('--u'));
    // remember how tall text boxes turned out, so groups and selections fit them
    const u = uPx();
    walk(doc.items, it => { if (it.type === 'text') { const e = elOf(it.id); if (e) it.h = r1(e.offsetHeight / u); } });
    if (editing) {                        // re-rendering mid-typing: pick the text box back up
      const e = elOf(editing.it.id);
      if (e) startText(e, editing.it, true);
    }
    stage.classList.toggle('in-group', scope.length > 0);
    drawOverlay();
    if (!keepPanel) inspector();
  }
  function lay() { C.layout(cv); stage.style.setProperty('--u', cv.style.getPropertyValue('--u')); }
  function relayout() { lay(); drawOverlay(); }
  let rz; addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(relayout); });
  cv.addEventListener('load', () => lay(), true);

  function rectOf(el) {
    const s = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
  }
  function frame(r, cls) {
    const d = h('div', cls, ov);
    Object.assign(d.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    return d;
  }
  function drawOverlay() {
    ov.textContent = '';
    if (previewing) return;
    if (scope.length) { const g = elOf(scope[scope.length - 1]); if (g) { const f = frame(rectOf(g), 'ed-scope'); h('span', '', f, 'inside group · Esc to step out'); } }
    const its = selected();
    for (const it of its) { const e = elOf(it.id); if (e) frame(rectOf(e), 'ed-sel'); }
    if (its.length === 1 && !editing) {
      const it = its[0], e = elOf(it.id);
      if (!e) return;
      const r = rectOf(e), f = frame(r, 'ed-handles');
      const dirs = it.type === 'text' ? ['e', 'w'] : ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
      for (const d of dirs) { const k = h('i', 'hd hd-' + d, f); k.dataset.h = d; }
      const tag = h('span', 'ed-size', f, cols(it));
      tag.title = 'size in grid columns';
    }
  }
  function cols(it) {                     // "cols 3–8" when it sits on the grid, else units
    const o = origin().x, L = it.x + o, R = it.x + it.w + o;
    const li = EDGES_L.findIndex(v => Math.abs(v - L) < .6), ri = EDGES_R.findIndex(v => Math.abs(v - R) < .6);
    return li > -1 && ri > -1 && ri >= li ? (li === ri ? `col ${li + 1}` : `cols ${li + 1}–${ri + 1}`) : `${Math.round(it.w)} × ${Math.round(it.h)}`;
  }
  const EDGES_L = [...Array(C.COLS)].map((_, i) => C.colX(i));
  const EDGES_R = EDGES_L.map(v => v + C.COLW);

  function setSel(ids) { sel = new Set(ids); drawOverlay(); inspector(); }

  /* ---------------- pointer: select, move, resize, marquee ---------------- */
  function pick(target) {
    const ids = new Set(scopeItems().map(i => i.id));
    let el = target.closest && target.closest('.it');
    while (el && !ids.has(el.dataset.id)) el = el.parentElement && el.parentElement.closest('.it');
    return el;
  }

  stage.addEventListener('pointerdown', e => {
    if (previewing || e.button !== 0) return;
    if (editing && editing.el.contains(e.target)) return;
    if (panel.contains(document.activeElement)) document.activeElement.blur();   // lets a half-typed number commit
    finishText();
    const hd = e.target.closest('.hd');
    if (hd) return startResize(e, hd.dataset.h);
    let el = pick(e.target);
    if (!el && scope.length && e.target.closest('.it')) {   // clicked outside the group we're in
      scope = []; render(); el = pick(e.target);
    }
    if (!el) { if (!e.shiftKey) setSel([]); return startMarquee(e); }
    const id = el.dataset.id;
    if (e.shiftKey) {
      const s = new Set(sel); s.has(id) ? s.delete(id) : s.add(id);
      setSel([...s]); return;
    }
    if (!sel.has(id)) setSel([id]);
    startMove(e);
  });

  function drag(e, onMove, onUp) {
    e.preventDefault();
    const mv = ev => onMove(ev);
    const up = ev => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); stage.classList.remove('dragging'); onUp(ev); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }

  function startMove(e) {
    const its = selected(); if (!its.length) return;
    const start = its.map(i => ({ i, x: i.x, y: i.y }));
    const bb = bbox(its), p0 = toUnits(e);
    let moved = false;
    drag(e, ev => {
      const p = toUnits(ev);
      let dx = p.x - p0.x, dy = p.y - p0.y;
      if (!moved && Math.hypot(dx, dy) * uPx() < 3) return;
      if (!moved) { moved = true; stage.classList.add('dragging'); }
      if (snap && !ev.altKey) { dx = snapBox(bb.x + dx, bb.w) - bb.x; dy = snapY(bb.y + dy) - bb.y; }
      for (const s of start) { s.i.x = r1(s.x + dx); s.i.y = r1(s.y + dy); const el = elOf(s.i.id); if (el) C.place(el, s.i); }
      lay(); drawOverlay();
    }, () => { if (moved) commit(true), inspector(); });
  }

  function startResize(e, dir) {
    e.stopPropagation();
    const it = selected()[0]; if (!it) return;
    const s0 = { x: it.x, y: it.y, w: it.w, h: it.h }, ar = s0.w / (s0.h || 1), p0 = toUnits(e);
    const kids = it.children ? clone(it.children) : null;
    drag(e, ev => {
      const p = toUnits(ev), dx = p.x - p0.x, dy = p.y - p0.y, free = !snap || ev.altKey;
      let { x, y, w, h: hh } = s0;
      if (dir.includes('e')) { w = s0.w + dx; if (!free) w = snapEdge(x + w) - x; }
      if (dir.includes('w')) { x = s0.x + dx; if (!free) x = snapEdge(x); w = s0.w + (s0.x - x); }
      if (dir.includes('s')) { hh = s0.h + dy; if (!free) hh = snapY(y + hh) - y; }
      if (dir.includes('n')) { y = s0.y + dy; if (!free) y = snapY(y); hh = s0.h + (s0.y - y); }
      const keep = ev.shiftKey || (it.type === 'group' && dir.length === 2);
      if (keep && dir.length === 2) { const nh = w / ar; if (dir.includes('n')) y += hh - nh; hh = nh; }
      if (w < 8) { if (dir.includes('w')) x -= 8 - w; w = 8; }
      if (hh < 8) { if (dir.includes('n')) y -= 8 - hh; hh = 8; }
      Object.assign(it, { x: r1(x), y: r1(y), w: r1(w), h: r1(hh) });
      if (kids) {                         // a group scales everything inside it
        const sx = w / s0.w, sy = hh / s0.h;
        const scale = (src, dst) => src.forEach((c, i) => {
          Object.assign(dst[i], { x: r1(c.x * sx), y: r1(c.y * sy), w: r1(c.w * sx), h: r1(c.h * sy) });
          if (c.children) scale(c.children, dst[i].children);
        });
        scale(kids, it.children);
        render(true); return;
      }
      const el = elOf(it.id); if (el) C.place(el, it);
      lay(); drawOverlay();
    }, () => commit());
  }

  function startMarquee(e) {
    const s = stage.getBoundingClientRect(), x0 = e.clientX - s.left, y0 = e.clientY - s.top;
    const base = e.shiftKey ? new Set(sel) : new Set();
    let box = null;
    drag(e, ev => {
      const x1 = ev.clientX - s.left, y1 = ev.clientY - s.top;
      const r = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
      if (!box && r.w + r.h < 4) return;
      const hit = new Set(base);
      for (const it of scopeItems()) {
        const el = elOf(it.id); if (!el) continue;
        const b = rectOf(el);
        if (b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y) hit.add(it.id);
      }
      sel = hit; drawOverlay();
      box = frame(r, 'ed-marquee');
    }, () => inspector());
  }

  /* ---------------- double-click: type, step into groups, swap pictures ---------------- */
  stage.addEventListener('dblclick', async e => {
    if (previewing) return;
    const el = pick(e.target); if (!el) return;
    const it = find(el.dataset.id).it;
    if (it.type === 'text') startText(el, it);
    else if (it.type === 'group') { scope.push(it.id); setSel([]); render(); toast('Inside the group. Esc to step out.'); }
    else if (it.type === 'image' || it.type === 'video') {
      const f = await pickFiles(it.type === 'video' ? 'video/*' : 'image/*,video/*', false);
      if (f.length) addFiles(f, null, it);
    } else if (it.type === 'embed') {
      const u = prompt('Link to embed (YouTube, Vimeo, or any page)', it.src || '');
      if (u != null) { it.src = u.trim(); commit(); }
    }
  });

  function startText(el, it, resume) {
    const t = el.querySelector('.txt'); if (!t) return;
    editing = { el: t, it };
    t.contentEditable = 'true';
    t.spellcheck = true;
    if (!resume) {
      t.focus();
      const r = document.createRange(); r.selectNodeContents(t);
      if (!/^(New text|Project title)$/.test(t.textContent)) r.collapse(false);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    }
    el.classList.add('typing');
    drawOverlay();
  }
  function finishText() {
    if (!editing) return;
    const { el, it } = editing;
    editing = null;
    el.contentEditable = 'false';
    const html = clean(el.innerHTML);
    if (!el.textContent.trim() && !html.includes('<br>')) { removeItems([it.id]); return; }
    if (html !== it.text) { it.text = html; commit(); } else render();
  }
  stage.addEventListener('paste', e => {
    if (!editing) return;
    e.preventDefault(); e.stopPropagation();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  }, true);

  function clean(html) {                  // keep bold, italic, links, line breaks. Nothing else.
    const t = document.createElement('template'); t.innerHTML = html;
    const out = [];
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const go = n => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) { out.push(esc(c.textContent)); continue; }
        if (c.nodeType !== 1) continue;
        const tag = c.tagName.toLowerCase();
        if (tag === 'br') { out.push('<br>'); continue; }
        const block = tag === 'div' || tag === 'p';
        if (block && out.length && out[out.length - 1] !== '<br>') out.push('<br>');
        const keep = { b: 'b', strong: 'b', i: 'i', em: 'i', a: 'a' }[tag]
          || (tag === 'span' && /bold|[6-9]00/.test(c.style.fontWeight) ? 'b' : null);
        if (keep === 'a') {
          const href = (c.getAttribute('href') || '').replace(/"/g, '%22');
          out.push(`<a href="${href}"${/^https?:/.test(href) ? ' target="_blank" rel="noopener"' : ''}>`);
        } else if (keep) out.push(`<${keep}>`);
        go(c);
        if (keep) out.push(`</${keep}>`);
      }
    };
    go(t.content);
    return out.join('').replace(/(<br>)+$/, '');
  }

  /* ---------------- adding things ---------------- */
  function add(it, text) {
    scopeItems().push(it); setSel([it.id]); commit();
    if (text) { const el = elOf(it.id); if (el) startText(el, it); }
  }
  function addText() {
    add({ id: uid(), type: 'text', x: C.colX(0) - origin().x, y: r1(snapY(viewY())), w: r1(C.span(4)), h: 14, text: 'New text' }, true);
  }
  function addEmbed() {
    const u = prompt('Link to embed (YouTube, Vimeo, Figma, any page)'); if (!u) return;
    const w = C.span(8);
    add({ id: uid(), type: 'embed', x: C.colX(0) - origin().x, y: r1(snapY(viewY())), w: r1(w), h: r1(w * 9 / 16), src: u.trim() });
  }
  function addBox() {
    add({ id: uid(), type: 'box', x: C.colX(0) - origin().x, y: r1(snapY(viewY())), w: r1(C.span(3)), h: r1(C.span(3)), fill: 'line' });
  }

  /* ---------------- arranging ---------------- */
  function removeItems(ids) {
    for (const id of ids) { const f = find(id); if (f) f.arr.splice(f.arr.indexOf(f.it), 1); }
    sel = new Set([...sel].filter(id => find(id)));
    commit();
  }
  function duplicate() {
    const its = selected(); if (!its.length) return;
    const arr = scopeItems(), copies = its.map(i => { const c = freshIds(clone(i)); c.x += ROW; c.y += ROW; return c; });
    arr.push(...copies); setSel(copies.map(c => c.id)); commit();
  }
  function group() {
    const its = selected(); if (its.length < 2) return toast('Pick two or more things to group (Shift-click)');
    const arr = scopeItems(), bb = bbox(its);
    const at = Math.min(...its.map(i => arr.indexOf(i)));
    const g = { id: uid(), type: 'group', x: r1(bb.x), y: r1(bb.y), w: r1(bb.w), h: r1(bb.h), children: [] };
    for (const i of arr.filter(i => sel.has(i.id))) { arr.splice(arr.indexOf(i), 1); i.x = r1(i.x - bb.x); i.y = r1(i.y - bb.y); g.children.push(i); }
    arr.splice(at, 0, g);
    setSel([g.id]); commit();
  }
  function ungroup() {
    const out = [];
    for (const g of selected().filter(i => i.type === 'group')) {
      const arr = scopeItems(), at = arr.indexOf(g);
      for (const c of g.children) { c.x = r1(c.x + g.x); c.y = r1(c.y + g.y); out.push(c.id); }
      arr.splice(at, 1, ...g.children);
    }
    if (out.length) { setSel(out); commit(); }
  }
  function order(front) {
    const arr = scopeItems();
    for (const it of selected()) { arr.splice(arr.indexOf(it), 1); front ? arr.push(it) : arr.unshift(it); }
    commit(true);
  }
  function align(how) {
    const its = selected(); if (its.length < 2) return;
    const bb = bbox(its);
    for (const i of its) {
      if (how === 'left') i.x = bb.x;
      if (how === 'center') i.x = r1(bb.x + bb.w / 2 - i.w / 2);
      if (how === 'right') i.x = r1(bb.x + bb.w - i.w);
      if (how === 'top') i.y = bb.y;
      if (how === 'middle') i.y = r1(bb.y + bb.h / 2 - i.h / 2);
      if (how === 'bottom') i.y = r1(bb.y + bb.h - i.h);
    }
    commit();
  }
  function fitGrid(it) {                  // pull a box onto the nearest columns and rows
    const o = origin().x;
    const L = EDGES_L.reduce((a, v) => Math.abs(v - (it.x + o)) < Math.abs(a - (it.x + o)) ? v : a);
    const R = EDGES_R.filter(v => v > L).reduce((a, v) => Math.abs(v - (it.x + it.w + o)) < Math.abs(a - (it.x + it.w + o)) ? v : a, EDGES_R[EDGES_R.length - 1]);
    const nw = R - L;
    if (it.type === 'image' || it.type === 'video' || it.type === 'embed') it.h = r1(it.h * nw / it.w);
    it.x = r1(L - o); it.w = r1(nw); it.y = r1(snapY(it.y));
    if (it.type !== 'text') it.h = r1(Math.max(ROW, Math.round(it.h / ROW) * ROW));
  }

  /* ---------------- clipboard and drops ---------------- */
  let clip = null;
  const typingNow = () => editing || /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '');
  addEventListener('copy', e => {
    if (typingNow() || !sel.size) return;
    clip = clone(selected());
    e.clipboardData.setData('text/plain', JSON.stringify({ atulEditor: 1, items: clip }));
    e.preventDefault();
  });
  addEventListener('cut', e => {
    if (typingNow() || !sel.size) return;
    clip = clone(selected());
    e.clipboardData.setData('text/plain', JSON.stringify({ atulEditor: 1, items: clip }));
    e.preventDefault(); removeItems([...sel]);
  });
  addEventListener('paste', e => {
    if (typingNow() || previewing) return;
    const files = [...e.clipboardData.files];
    if (files.length) { e.preventDefault(); return addFiles(files); }
    const text = e.clipboardData.getData('text/plain');
    let items = null;
    try { const o = JSON.parse(text); if (o && o.atulEditor) items = o.items; } catch (err) {}
    e.preventDefault();
    if (items) {
      const copies = items.map(i => { const c = freshIds(clone(i)); c.x += ROW; c.y += ROW; return c; });
      scopeItems().push(...copies); setSel(copies.map(c => c.id)); commit();
    } else if (text.trim()) {
      const esc = text.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
      add({ id: uid(), type: 'text', x: C.colX(0) - origin().x, y: r1(snapY(viewY())), w: r1(C.span(5)), h: 14, text: esc });
    }
  });
  stage.addEventListener('dragover', e => { if (!previewing) { e.preventDefault(); stage.classList.add('drop'); } });
  stage.addEventListener('dragleave', e => { if (e.target === stage || !stage.contains(e.relatedTarget)) stage.classList.remove('drop'); });
  stage.addEventListener('drop', e => {
    e.preventDefault(); stage.classList.remove('drop');
    if (previewing) return;
    const el = pick(e.target), target = el && find(el.dataset.id).it;
    addFiles(e.dataTransfer.files, toUnits(e), target);
  });

  /* ---------------- keys ---------------- */
  addEventListener('keydown', e => {
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && k === 's') { e.preventDefault(); save(); return; }
    if (editing) {
      if (e.key === 'Escape') { e.preventDefault(); finishText(); }
      if (mod && k === 'k') { e.preventDefault(); const u = prompt('Link to'); if (u) document.execCommand('createLink', false, u); }
      return;
    }
    if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) {
      if (e.key === 'Escape') document.activeElement.blur();
      return;
    }
    if (previewing) { if (e.key === 'Escape' || k === 'p') togglePreview(); return; }
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
    if (mod && k === 'y') { e.preventDefault(); doRedo(); return; }
    if (mod && k === 'd') { e.preventDefault(); duplicate(); return; }
    if (mod && k === 'g') { e.preventDefault(); e.shiftKey ? ungroup() : group(); return; }
    if (mod && k === 'a') { e.preventDefault(); setSel(scopeItems().map(i => i.id)); return; }
    if (mod) return;
    if (e.key === 'Backspace' || e.key === 'Delete') { if (sel.size) { e.preventDefault(); removeItems([...sel]); } return; }
    if (e.key === 'Escape') { help.classList.remove('on'); if (sel.size) setSel([]); else if (scope.length) { const g = scope.pop(); setSel([g]); render(); } return; }
    if (e.key === 'Enter') { const it = selected()[0]; if (it && it.type === 'text') { e.preventDefault(); startText(elOf(it.id), it); } else if (it && it.type === 'group') { scope.push(it.id); setSel([]); render(); } return; }
    if (e.key.startsWith('Arrow') && sel.size) {
      e.preventDefault();
      const big = e.shiftKey, dx = { ArrowLeft: -1, ArrowRight: 1 }[e.key] || 0, dy = { ArrowUp: -1, ArrowDown: 1 }[e.key] || 0;
      for (const it of selected()) {
        it.x = r1(it.x + dx * (big ? C.COLW + C.GAP : 1));
        it.y = r1(it.y + dy * (big ? ROW : 1));
      }
      clearTimeout(nudgeT); nudgeT = setTimeout(() => commit(), 400);
      for (const it of selected()) { const el = elOf(it.id); if (el) C.place(el, it); }
      lay(); drawOverlay(); return;
    }
    if (k === ']') return order(true);
    if (k === '[') return order(false);
    if (k === 't') { e.preventDefault(); return addText(); }
    if (k === 'g') { grid = !grid; return paintToggles(); }
    if (k === 's') { snap = !snap; paintToggles(); return toast(snap ? 'snapping to the grid' : 'free placement'); }
    if (k === 'p') return togglePreview();
    if (k === '?') return help.classList.toggle('on');
  });
  let nudgeT;

  /* ---------------- preview ---------------- */
  function togglePreview() {
    finishText();
    previewing = !previewing;
    document.body.classList.toggle('previewing', previewing);
    if (previewing) {
      ov.textContent = '';
      C.render(cv, doc, { edit: false, src: resolve, onMediaError });
      cv.querySelectorAll('a').forEach(a => a.addEventListener('click', e => e.preventDefault()));
      stopAnim = C.animate(cv);
      toast('Preview. Scroll, hover, click. P or Esc to go back.');
    } else {
      stopAnim && stopAnim(); stopAnim = null;
      render();
    }
  }

  // play one animation on one element, right here in the editor
  function play(it, kind) {
    const el = elOf(it.id); if (!el) return;
    const a = it.anim[kind], ly = el._ly[kind === 'scroll' ? 'scroll' : kind];
    if (kind === 'enter') {
      C.setState(ly, a.from);
      requestAnimationFrame(() => requestAnimationFrame(() => C.setState(ly, null, C.timing(a.dur, a.ease, a.delay))));
    } else if (kind === 'scroll') {
      const t0 = performance.now(), D = 1600;
      const step = now => { const t = Math.min(1, (now - t0) / D); C.setState(ly, C.mix(a.from, a.to, (C.EASE[a.ease] || C.EASE.linear)(t))); if (t < 1) requestAnimationFrame(step); else setTimeout(() => C.setState(ly, null, 'all .4s'), 500); };
      requestAnimationFrame(step);
    } else {
      C.setState(ly, a.to, C.timing(a.dur, a.ease));
      setTimeout(() => C.setState(ly, null, C.timing(a.dur, a.ease)), (a.dur || .4) * 1000 + 500);
    }
  }

  /* ---------------- the panel ---------------- */
  const PRESETS = {
    enter: {
      'fade': { opacity: 0 }, 'rise': { opacity: 0, y: 40 }, 'drop': { opacity: 0, y: -40 },
      'from left': { opacity: 0, x: -60 }, 'from right': { opacity: 0, x: 60 },
      'grow': { opacity: 0, scale: .85 }, 'shrink': { opacity: 0, scale: 1.15 }, 'blur': { opacity: 0, blur: 14 },
      'tilt': { opacity: 0, y: 30, rotate: -4 },
    },
    scroll: {
      'drift (slower)': { from: { y: -80 }, to: { y: 80 }, start: 100, end: 0 },
      'rush (faster)': { from: { y: 120 }, to: { y: -120 }, start: 100, end: 0 },
      'fade in': { from: { opacity: 0 }, to: {}, start: 100, end: 55 },
      'fade out': { from: {}, to: { opacity: 0 }, start: 45, end: 0 },
      'grow in': { from: { scale: .8 }, to: {}, start: 100, end: 45 },
      'zoom out': { from: { scale: 1.15 }, to: {}, start: 100, end: 30 },
      'turn': { from: { rotate: -12 }, to: { rotate: 12 }, start: 100, end: 0 },
      'slide across': { from: { x: -120 }, to: { x: 120 }, start: 100, end: 0 },
    },
    hover: { 'lift': { y: -10 }, 'grow': { scale: 1.04 }, 'shrink': { scale: .97 }, 'dim': { opacity: .5 }, 'tilt': { rotate: -3 }, 'blur': { blur: 6 } },
    click: { 'zoom': { scale: 1.6 }, 'spin': { rotate: 180 }, 'hide': { opacity: 0 }, 'nudge': { x: 40 } },
  };
  const DEFAULTS = {
    enter: () => ({ on: true, from: { ...PRESETS.enter.rise }, dur: .9, delay: 0, ease: 'out' }),
    scroll: () => ({ on: true, ...clone(PRESETS.scroll['drift (slower)']), ease: 'linear' }),
    hover: () => ({ on: true, to: { ...PRESETS.hover.grow }, dur: .4, ease: 'pop' }),
    click: () => ({ on: true, to: { ...PRESETS.click.zoom }, dur: .6, ease: 'pop' }),
  };
  const EASES = { out: 'ease out', inOut: 'ease in-out', in: 'ease in', linear: 'linear', pop: 'springy' };

  const fmt = v => v == null || v === '' ? '' : String(Math.round(v * 100) / 100);
  function sec(title, parent = panel, open = true) {
    const d = h('details', 'ed-sec', parent); d.open = open;
    h('summary', '', d, title);
    return d;
  }
  function row(parent, label) { const r = h('label', 'ed-row', parent); h('span', 'ed-lab', r, label); return r; }
  function num(parent, label, get, set, step = 1) {
    const r = row(parent, label), i = h('input', '', r);
    i.type = 'number'; i.step = step; i.value = fmt(get());
    i.oninput = () => { const v = parseFloat(i.value); if (!isNaN(v)) { set(v); render(true); } };
    i.onchange = () => commit(true);
    return i;
  }
  function text(parent, label, get, set, ph = '') {
    const r = row(parent, label), i = h('input', '', r);
    i.type = 'text'; i.value = get() || ''; i.placeholder = ph;
    i.oninput = () => { set(i.value); render(true); };
    i.onchange = () => commit(true);
    return i;
  }
  function choose(parent, label, opts, get, set) {
    const r = row(parent, label), s = h('select', '', r);
    for (const [v, l] of Object.entries(opts)) { const o = h('option', '', s, l); o.value = v; }
    s.value = get() ?? Object.keys(opts)[0];
    s.onchange = () => { set(s.value); commit(); };
    return s;
  }
  function seg(parent, label, opts, get, set) {   // a row of small toggle buttons
    const r = row(parent, label), g = h('span', 'ed-seg', r);
    for (const [v, l] of Object.entries(opts)) {
      const b = h('button', get() == v ? 'on' : '', g, l); b.type = 'button';
      b.onclick = e => { e.preventDefault(); set(v); commit(); };
    }
  }
  function check(parent, label, get, set) {
    const r = h('label', 'ed-row ed-check', parent), i = h('input', '', r);
    i.type = 'checkbox'; i.checked = !!get(); h('span', '', r, label);
    i.onchange = () => { set(i.checked); commit(); };
  }
  function actions(parent, list) {
    const r = h('div', 'ed-acts', parent);
    for (const [l, fn, title] of list) { const b = h('button', '', r, l); b.type = 'button'; if (title) b.title = title; b.onclick = fn; }
  }
  function stateFields(parent, label, obj, key) {
    // the six things any animation can change
    const box = h('div', 'ed-state', parent);
    h('span', 'ed-lab', box, label);
    const st = () => (obj[key] = obj[key] || {});
    const F = [['x', 'move x', 1], ['y', 'move y', 1], ['scale', 'scale', .05], ['rotate', 'rotate °', 1], ['opacity', 'opacity', .05], ['blur', 'blur', 1]];
    for (const [k, l, step] of F) {
      const c = h('label', '', box); h('span', '', c, l);
      const i = h('input', '', c); i.type = 'number'; i.step = step;
      i.placeholder = fmt(C.NEUTRAL[k]); i.value = fmt(st()[k]);
      i.oninput = () => { const v = parseFloat(i.value); if (isNaN(v) || v === C.NEUTRAL[k]) delete st()[k]; else st()[k] = v; touch(); };
      i.onchange = () => commit(true);
    }
  }

  function inspector() {
    if (previewing) return;
    const keepScroll = panel.scrollTop;
    const open = {}; panel.querySelectorAll('details').forEach(d => open[d.dataset.k] = d.open);
    panel.textContent = '';
    const its = selected();
    if (!its.length) pagePanel();
    else if (its.length > 1) multiPanel(its);
    else itemPanel(its[0]);
    panel.querySelectorAll('details').forEach(d => { if (d.dataset.k in open) d.open = open[d.dataset.k]; });
    panel.scrollTop = keepScroll;
  }
  const keyed = (d, k) => (d.dataset.k = k, d);

  function pagePanel() {
    h('p', 'ed-head', panel, 'Page');
    const s = keyed(sec('This project, on the work list'), 'page');
    text(s, 'title', () => meta.title, v => meta.title = v);
    text(s, 'year', () => meta.year, v => meta.year = v, '2026');
    text(s, 'tags', () => meta.tags, v => meta.tags = v, 'interaction, research');
    text(s, 'one-liner', () => meta.summary, v => meta.summary = v, 'optional');
    check(s, 'hidden from the work list', () => meta.hidden, v => meta.hidden = v);
    const t = keyed(sec('Thumbnail (shows on hover)'), 'thumb');
    const pics = []; walk(doc.items, it => { if (it.type === 'image' && it.src) pics.push(it.src); });
    const opts = { '': 'none' }; pics.forEach((p, i) => opts[p] = `picture ${i + 1} · ${p.split('/').pop().slice(0, 24)}`);
    if (meta.thumb && !(meta.thumb in opts)) opts[meta.thumb] = meta.thumb.split('/').pop().slice(0, 30);
    choose(t, 'use', opts, () => meta.thumb || '', v => meta.thumb = v);
    if (meta.thumb) { const im = h('img', 'ed-thumb', t); im.src = resolve(meta.thumb); im.onerror = () => onMediaError(im, meta.thumb); }
    actions(t, [['upload a different one', async () => { const [f] = await pickFiles('image/*', false); if (f) { const { src } = await stash(f); meta.thumb = src; commit(); } }]]);
    const g = keyed(sec('How this works', panel, false), 'how');
    h('p', 'ed-note', g).innerHTML = `Click to select. Drag to move: it snaps to the 12 columns. Hold <kbd>Alt</kbd> to break the grid.<br><br>
      Drop pictures anywhere, or onto a grey placeholder to fill it.<br><br>
      Everything you do is kept as a draft in this browser. <b>Save</b> writes <code>projects/${slug}.json</code> into your site folder; then commit and push to publish.`;
  }

  function multiPanel(its) {
    h('p', 'ed-head', panel, `${its.length} things`);
    const s = keyed(sec('Line them up'), 'align');
    actions(s, [['left', () => align('left')], ['centre', () => align('center')], ['right', () => align('right')]]);
    actions(s, [['top', () => align('top')], ['middle', () => align('middle')], ['bottom', () => align('bottom')]]);
    actions(sec('Together'), [['group  ⌘G', group], ['snap all to grid', () => { its.forEach(fitGrid); commit(); }], ['duplicate', duplicate], ['delete', () => removeItems([...sel])]]);
  }

  const NAMES = { text: 'Text', image: 'Picture', video: 'Video', embed: 'Embed', box: 'Box', group: 'Group' };
  function itemPanel(it) {
    h('p', 'ed-head', panel, NAMES[it.type] + (scope.length ? ' · in group' : ''));

    const L = keyed(sec('Position'), 'pos');
    const grid4 = h('div', 'ed-4', L);
    num(grid4, 'x', () => it.x, v => it.x = v);
    num(grid4, 'y', () => it.y, v => it.y = v);
    num(grid4, 'w', () => it.w, v => it.w = v);
    if (it.type !== 'text') num(grid4, 'h', () => it.h, v => it.h = v);
    actions(L, [['snap to grid', () => { fitGrid(it); commit(); }, 'Pull onto the nearest columns'], ['front', () => order(true), ']'], ['back', () => order(false), '[']]);

    const S = keyed(sec(NAMES[it.type]), 'kind');
    if (it.type === 'text') {
      seg(S, 'weight', { 400: 'regular', 700: 'bold' }, () => it.weight || 400, v => it.weight = +v);
      seg(S, 'colour', { fg: 'ink', mute: 'grey', faint: 'faint' }, () => it.color || 'fg', v => it.color = v);
      seg(S, 'align', { left: 'left', center: 'centre', right: 'right' }, () => it.align || 'left', v => it.align = v);
      actions(S, [['edit text  ↵', () => startText(elOf(it.id), it)]]);
    }
    if (it.type === 'image' || it.type === 'video') {
      seg(S, 'fit', { cover: 'fill box', contain: 'whole picture' }, () => it.fit || 'cover', v => it.fit = v);
      if (it.type === 'image') text(S, 'alt text', () => it.alt, v => it.alt = v, 'what is in the picture');
      actions(S, [
        [it.src ? 'replace' : 'choose file', async () => { const f = await pickFiles('image/*,video/*', false); if (f.length) addFiles(f, null, it); }],
        ['use as thumbnail', () => { meta.thumb = it.src; commit(true); toast('Thumbnail set'); }],
        ['true proportions', async () => { if (!it.src) return; it.h = r1(it.w / await ratio(resolve(it.src), it.type)); commit(); }],
      ]);
      if (it.src) h('p', 'ed-note', S, it.src.startsWith('blob:') ? 'not saved into the folder yet' : it.src);
    }
    if (it.type === 'embed') {
      text(S, 'link', () => it.src, v => it.src = v, 'youtube / vimeo / any url');
      actions(S, [['16 : 9', () => { it.h = r1(it.w * 9 / 16); commit(); }], ['4 : 3', () => { it.h = r1(it.w * 3 / 4); commit(); }], ['square', () => { it.h = it.w; commit(); }]]);
    }
    if (it.type === 'box') seg(S, 'look', { line: 'line', fill: 'ink', ghost: 'ghost', faint: 'grey' }, () => it.fill || 'line', v => it.fill = v);
    if (it.type === 'group') actions(S, [['step inside  ↵', () => { scope.push(it.id); setSel([]); render(); }], ['ungroup  ⇧⌘G', ungroup]]);

    if (it.type !== 'text') {
      const K = keyed(sec('Link', panel, !!(it.link && it.link.href)), 'link');
      text(K, 'goes to', () => it.link && it.link.href, v => { it.link = it.link || {}; it.link.href = v.trim(); if (!v.trim()) delete it.link; }, 'https://… or another page');
      check(K, 'open in a new tab', () => it.link && it.link.newTab, v => { it.link = it.link || { href: '' }; it.link.newTab = v; });
    }

    animPanel(it);
    actions(panel, [['duplicate  ⌘D', duplicate], ['delete  ⌫', () => removeItems([it.id])]]);
  }

  function animPanel(it) {
    it.anim = it.anim || {};
    const A = it.anim;
    const blocks = [
      ['enter', 'When it scrolls into view', 'Plays once, the first time it appears.'],
      ['scroll', 'While scrolling', 'Scroll is the playhead: it moves from "from" to "to" as it travels up the screen.'],
      ['hover', 'On hover', 'Changes while the mouse is over it.'],
      ['click', 'On click', 'Each click switches it to the new state and back.'],
    ];
    for (const [k, title, note] of blocks) {
      const on = !!(A[k] && A[k].on);
      const d = keyed(sec((on ? '● ' : '○ ') + title, panel, on), 'a-' + k + (on ? 1 : 0));
      d.classList.add('ed-anim');
      check(d, 'on', () => on, v => { if (v) A[k] = A[k] && Object.keys(A[k]).length > 1 ? { ...A[k], on: true } : DEFAULTS[k](); else if (A[k]) A[k].on = false; });
      if (!on) { h('p', 'ed-note', d, note); continue; }
      const a = A[k];
      const P = PRESETS[k];
      const opts = { '': 'pick a preset…' }; for (const n in P) opts[n] = n;
      const s = choose(d, 'preset', opts, () => '', v => {
        if (!v) return;
        if (k === 'enter') a.from = { ...P[v] };
        else if (k === 'scroll') Object.assign(a, clone(P[v]));
        else a.to = { ...P[v] };
      });
      s.value = '';
      if (k === 'enter') stateFields(d, 'starts as', a, 'from');
      if (k === 'scroll') { stateFields(d, 'from', a, 'from'); stateFields(d, 'to', a, 'to'); }
      if (k === 'hover' || k === 'click') stateFields(d, 'becomes', a, 'to');
      if (k === 'scroll') {
        const g = h('div', 'ed-4', d);
        num(g, 'starts at', () => a.start ?? 100, v => a.start = v, 5).title = '% of screen height where it begins (100 = bottom edge)';
        num(g, 'ends at', () => a.end ?? 0, v => a.end = v, 5).title = '% of screen height where it finishes (0 = top edge)';
        h('p', 'ed-note', d, 'measured from the middle of the element: 100 = bottom of the screen, 0 = top');
      } else {
        const g = h('div', 'ed-4', d);
        num(g, 'seconds', () => a.dur ?? .6, v => a.dur = v, .1);
        if (k === 'enter') num(g, 'delay', () => a.delay ?? 0, v => a.delay = v, .05);
      }
      choose(d, 'easing', EASES, () => a.ease || (k === 'scroll' ? 'linear' : 'out'), v => a.ease = v);
      actions(d, [['▶ play', () => play(it, k)]]);
    }
  }

  /* ---------------- save ---------------- */
  async function save() {
    finishText();
    if (!FS.root && FS.supported) { await FS.connect(); paintFolder(); }
    meta.slug = slug;
    if (!FS.root) {
      // no folder access (Safari/Firefox): download the files instead
      const idx = clone(index);
      const i = idx.projects.findIndex(p => p.slug === slug);
      i > -1 ? idx.projects[i] = meta : idx.projects.push(meta);
      FS.download(`${slug}.json`, JSON.stringify(doc, null, 2));
      setTimeout(() => FS.download('index.json', JSON.stringify(idx, null, 2)), 400);
      if (blobs.size) toast('Downloaded. Pictures added in this browser are NOT in those files. Use Chrome to save them.', 6000);
      else toast('Downloaded both files: put them in projects/', 4000);
      return;
    }
    try {
      saveB.textContent = 'saving…';
      await persistMedia();
      const fresh = (await FS.json('projects/index.json')) || { projects: [] };   // someone may have edited the list meanwhile
      const i = fresh.projects.findIndex(p => p.slug === slug);
      i > -1 ? fresh.projects[i] = meta : fresh.projects.push(meta);
      await FS.write(`projects/${slug}.json`, JSON.stringify(doc, null, 2));
      await FS.write('projects/index.json', JSON.stringify(fresh, null, 2));
      index = fresh;
      dirty = false; paintSave(); last = snapshot();
      try { localStorage.removeItem('draft:' + slug); } catch (e) {}
      render();
      toast(`Saved into ${FS.root.name}. Commit and push to publish.`);
    } catch (err) {
      console.error(err); paintSave();
      toast('Could not save: ' + err.message, 6000);
    }
  }

  /* ---------------- go ---------------- */
  document.title = `editing · ${meta.title}`;
  paintToggles(); paintFolder(); paintSave();
  render();
  document.fonts && document.fonts.ready.then(() => render(true));
  if (fresh) toast('New page, started from the template. Save to create it.', 4000);
})();
