/* =====================================================================
   The editor. Opens on project.html?p=<slug>&edit
   Same canvas as the live page, plus: select, drag, resize, snapping
   (columns, rows, other things, your own guides; hold Alt to break it),
   groups, linked components, a block library, text editing, pictures,
   slideshows, buttons, animation, undo, preview, and saving into your folder.
   ===================================================================== */
(async () => {
  const C = Canvas, U = C.U;
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
  let doc, index, meta, lib;              // lib: saved components, shared by every page
  let sel = new Set();
  let scope = [];                         // ids of the groups / components we've stepped into
  let undo = [], redo = [], last = null;
  let dirty = false, previewing = false, stopAnim = null;
  let editing = null;                     // { el, it } while typing in a text box
  let snapLines = [];                     // guide lines to draw while something snaps
  const slideAt = {};                     // which slide each slideshow shows while editing
  const gone = new Set();                 // components deleted here (so saving doesn't bring them back)
  const blobs = new Map();                // blob url -> File not yet saved to the folder
  const cache = new Map();                // folder path -> blob url (for showing files from the folder)

  // editor-only settings, remembered in this browser
  const PREF_DEFAULT = { grid: true, rows: false, guides: true, snap: true, sCols: true, sRows: true, sEls: true, sGuides: true };
  let pref = { ...PREF_DEFAULT };
  try { Object.assign(pref, JSON.parse(localStorage.getItem('editor-prefs') || '{}')); } catch (e) {}
  const savePref = () => { try { localStorage.setItem('editor-prefs', JSON.stringify(pref)); } catch (e) {} };

  /* ---------------- load ---------------- */
  index = (await FS.json('projects/index.json')) || { projects: [] };
  meta = index.projects.find(p => p.slug === slug) || { slug, title: slug.replace(/-/g, ' '), year: String(new Date().getFullYear()), tags: '', summary: '', thumb: '', hidden: true };
  doc = (await FS.json(`projects/${slug}.json`)) || C.template();
  lib = (await FS.json('projects/components.json')) || { components: [] };
  const fresh = !index.projects.some(p => p.slug === slug);

  try {
    const d = JSON.parse(localStorage.getItem('draft:' + slug) || 'null');
    if (d && (JSON.stringify(d.doc) !== JSON.stringify(doc) || (d.lib && JSON.stringify(d.lib) !== JSON.stringify(lib))) &&
        confirm(`There are unsaved changes to this page from ${new Date(d.t).toLocaleString()}. Bring them back?`)) {
      doc = d.doc; meta = d.meta || meta; if (d.lib) lib = d.lib; dirty = true;
    }
  } catch (e) {}
  doc.guides = doc.guides || { x: [], y: [] };
  last = snapshot();
  if (fresh) dirty = true;

  const G = () => C.grid(doc);
  const libMap = () => Object.fromEntries(lib.components.map(c => [c.id, c]));
  const comp = id => lib.components.find(c => c.id === id);

  /* ---------------- tree helpers ---------------- */
  function walk(items, fn, parent = null) {
    for (const it of items) { fn(it, items, parent); if (it.children) walk(it.children, fn, it); }
  }
  function find(id) {
    let r = null;
    walk(doc.items, (it, arr, parent) => { if (!r && it.id === id) r = { it, arr, parent }; });
    if (!r) for (const c of lib.components) walk(c.children, (it, arr, parent) => { if (!r && it.id === id) r = { it, arr, parent, comp: c }; });
    return r;
  }
  function kids(it) { return it.type === 'instance' ? (comp(it.ref) || { children: [] }).children : it.children; }
  const scopeItem = () => scope.length ? find(scope[scope.length - 1]).it : null;
  const scopeItems = () => scope.length ? kids(scopeItem()) : doc.items;
  // where the current group/component sits on the page, and how much it's scaled
  function origin() {
    let x = 0, y = 0, k = 1;
    for (const id of scope) {
      const it = find(id).it;
      x += it.x * k; y += it.y * k;
      if (it.type === 'instance') { const c = comp(it.ref); if (c) k *= it.w / c.w; }
    }
    return { x, y, k };
  }
  const selected = () => [...sel].map(id => find(id)).filter(Boolean).map(f => f.it);
  function scopeEl() {
    let el = cv;
    for (const id of scope) el = el.querySelector(`.it[data-id="${id}"]`) || el;
    return el;
  }
  const elOf = id => scopeEl().querySelector(`.it[data-id="${id}"]`) || cv.querySelector(`.it[data-id="${id}"]`);
  const uPx = () => cv.getBoundingClientRect().width / U;
  function toUnits(e) {
    const r = cv.getBoundingClientRect(), u = r.width / U, o = origin();
    return { x: ((e.clientX - r.left) / u - o.x) / o.k, y: ((e.clientY - r.top) / u - o.y) / o.k };
  }
  function bbox(items) {
    const x = Math.min(...items.map(i => i.x)), y = Math.min(...items.map(i => i.y));
    const r = Math.max(...items.map(i => i.x + i.w)), b = Math.max(...items.map(i => i.y + (i.h || 0)));
    return { x, y, w: r - x, h: b - y };
  }
  function freshIds(it) { it.id = uid(); (it.children || []).forEach(freshIds); return it; }
  function uses(compId, items = doc.items) {
    let n = 0;
    walk(items, it => { if (it.type === 'instance' && it.ref === compId) n++; });
    for (const c of lib.components) if (c.id !== compId) walk(c.children, it => { if (it.type === 'instance' && it.ref === compId) n++; });
    return n;
  }

  /* ---------------- snapping ----------------
     Everything here works in the current scope's own units. Things to snap
     to: column edges, the page centre, rows, your guides, and the edges and
     middles of everything else nearby. The closest one wins. */
  function targets(skip) {
    const o = origin(), g = G(), xs = [], ys = [];
    const toX = v => (v - o.x) / o.k, toY = v => (v - o.y) / o.k;
    if (pref.sCols) {
      xs.push({ v: toX(0) }, { v: toX(U) }, { v: toX(U / 2), mid: 1 });
      for (let i = 0; i < g.cols; i++) xs.push({ v: toX(g.colX(i)) }, { v: toX(g.colX(i) + g.colW) });
    }
    if (pref.sGuides && pref.guides) {
      for (const v of doc.guides.x) xs.push({ v: toX(v), guide: 1 });
      for (const v of doc.guides.y) ys.push({ v: toY(v), guide: 1 });
    }
    if (pref.sEls) for (const it of scopeItems()) {
      if (skip.has(it.id)) continue;
      xs.push({ v: it.x, el: 1 }, { v: it.x + it.w, el: 1 }, { v: it.x + it.w / 2, el: 1 });
      ys.push({ v: it.y, el: 1 }, { v: it.y + it.h, el: 1 }, { v: it.y + it.h / 2, el: 1 });
    }
    return { xs, ys };
  }
  function nearest(edges, cands) {
    const thr = 7 / uPx() / origin().k;
    let best = null;
    for (const e of edges) for (const c of cands) {
      const d = c.v - e;
      if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d) - .01)) best = { d, v: c.v, c };
    }
    return best;
  }
  function rowSnap(v) {
    const o = origin(), g = G();
    if (!pref.sRows || !g.row) return null;
    const page = v * o.k + o.y, s = Math.round(page / g.row) * g.row;
    return (s - o.y) / o.k;
  }
  function addLine(axis, v) {           // remember a line to draw (scope units -> page units)
    const o = origin();
    snapLines.push({ axis, v: axis === 'x' ? v * o.k + o.x : v * o.k + o.y });
  }
  // snap a moving box; returns the corrected top-left
  function snapMove(x, y, w, hh, skip) {
    snapLines = [];
    const T = targets(skip);
    const bx = nearest([x, x + w, x + w / 2], T.xs);
    if (bx) { x += bx.d; addLine('x', bx.v); }
    const by = nearest([y, y + hh, y + hh / 2], T.ys);
    if (by) { y += by.d; addLine('y', by.v); }
    else { const r = rowSnap(y); if (r != null) y = r; }
    return { x, y };
  }
  function snapOne(axis, v, skip) {     // one edge, for resizing
    const T = targets(skip);
    const b = nearest([v], axis === 'x' ? T.xs : T.ys);
    if (b) { addLine(axis, b.v); return b.v; }
    if (axis === 'y') { const r = rowSnap(v); if (r != null) return r; }
    return v;
  }

  /* ---------------- history ---------------- */
  function snapshot() { return JSON.stringify({ doc, meta, lib }); }
  function commit(keepPanel) {
    snapLines = [];
    const now = snapshot();
    if (now === last) { render(keepPanel); return; }
    undo.push(last); if (undo.length > 200) undo.shift();
    redo = []; last = now;
    touch(); render(keepPanel);
  }
  function restore(s) {
    const o = JSON.parse(s); doc = o.doc; meta = o.meta; lib = o.lib || lib;
    sel = new Set([...sel].filter(id => find(id)));
    scope = scope.filter(id => find(id));
    touch(); render();
  }
  function doUndo() { if (!undo.length) return toast('nothing to undo'); redo.push(last); last = undo.pop(); restore(last); }
  function doRedo() { if (!redo.length) return; undo.push(last); last = redo.pop(); restore(last); }
  function touch() {
    dirty = true; paintSave();
    try { localStorage.setItem('draft:' + slug, JSON.stringify({ t: Date.now(), doc, meta, lib })); } catch (e) {}
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
    const done = new Map();
    const keep = async key => {
      if (!done.has(key)) { const p = await keepFile(blobs.get(key)); cache.set(p, key); done.set(key, p); }
      return done.get(key);
    };
    const all = [];
    walk(doc.items, it => all.push(it));
    for (const c of lib.components) walk(c.children, it => all.push(it));
    for (const it of all) {
      if (it.src && blobs.has(it.src)) it.src = await keep(it.src);
      for (const s of it.slides || []) if (blobs.has(s.src)) s.src = await keep(s.src);
    }
    if (meta.thumb && blobs.has(meta.thumb)) meta.thumb = await keep(meta.thumb);
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
  let warned = false;
  async function stash(file) {            // returns a src for this file
    if (!FS.root && FS.supported && !warned) await FS.connect().then(paintFolder);
    const url = URL.createObjectURL(file);
    if (FS.root) { const p = await keepFile(file); cache.set(p, url); return { src: p, url }; }
    blobs.set(url, file);
    if (!warned) toast('Connect your site folder or new pictures are lost on reload', 4000);
    warned = true;
    return { src: url, url };
  }
  async function addFiles(files, at, target) {
    files = [...files].filter(f => /^(image|video)\//.test(f.type));
    if (!files.length) return;
    // onto a slideshow: they become more slides
    if (target && target.type === 'slides') {
      target.slides = target.slides || [];
      for (const f of files.filter(f => f.type.startsWith('image'))) target.slides.push({ src: (await stash(f)).src, alt: '' });
      slideAt[target.id] = target.slides.length - 1;
      setSel([target.id]); commit(); return;
    }
    // onto a picture or a placeholder: swap what's inside, keep the box
    if (target && /image|video/.test(target.type) && files.length === 1) {
      const kind = files[0].type.startsWith('video') ? 'video' : 'image';
      const { src } = await stash(files[0]);
      target.type = kind; target.src = src;
      setSel([target.id]); commit(); return;
    }
    const added = [], g = G();
    let y = at ? at.y : viewY();
    for (const f of files) {
      const kind = f.type.startsWith('video') ? 'video' : 'image';
      const { src, url } = await stash(f);
      const w = g.span(Math.ceil(g.cols / 2)), hgt = w / await ratio(url, kind);
      let x = at ? at.x - w / 2 : col0();
      const p = pref.snap ? snapMove(x, y, w, hgt, new Set()) : { x, y };
      const it = { id: uid(), type: kind, x: r1(p.x), y: r1(p.y), w: r1(w), h: r1(hgt), src, fit: 'cover', alt: '' };
      scopeItems().push(it); added.push(it.id);
      y = p.y + hgt + g.row * 2;
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
    const r = cv.getBoundingClientRect(), o = origin();
    const y = ((innerHeight * .3 - r.top) / uPx() - o.y) / o.k;
    return rowSnap(y) ?? y;
  }
  const col0 = () => { const o = origin(); return (G().colX(0) - o.x) / o.k; };

  /* ---------------- chrome: panel, toolbar, rulers, overlay ---------------- */
  const gridEl = h('div', 'ed-grid', stage);
  const guidesEl = h('div', 'ed-guides', stage);
  const ov = h('div', 'ed-ov', stage);
  const rulerX = h('div', 'ed-ruler ed-ruler-x', document.body);
  const rulerY = h('div', 'ed-ruler ed-ruler-y', document.body);
  rulerX.title = 'drag down for a horizontal guide'; rulerY.title = 'drag right for a vertical guide';
  const panel = h('aside', 'ed-panel', document.body);
  const bar = h('div', 'ed-bar', document.body);
  const libEl = h('div', 'ed-lib', document.body);
  const toastEl = h('div', 'ed-toast', document.body);
  let toastT;
  function toast(msg, ms = 2600) { toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), ms); }

  const B = (label, title, fn, cls = '') => { const b = h('button', 'ed-b ' + cls, bar, label); b.title = title; b.type = 'button'; b.onclick = fn; return b; };
  const sep = () => h('span', 'ed-sep', bar);
  h('a', 'ed-b', bar, '← work').href = 'work.html?edit';
  sep();
  B('+ text', 'Add text (T)', () => addText());
  B('+ image', 'Add pictures (or drop / paste them anywhere)', async () => addFiles(await pickFiles('image/*')));
  const libB = B('+ blocks', 'Ready-made blocks, buttons, slideshows and your own components (B)', () => toggleLib());
  sep();
  const gridB = B('grid', 'Show the grid (G)', () => { pref.grid = !pref.grid; paintToggles(); });
  const snapB = B('snap', 'Snapping on/off (S). Hold Alt while dragging to break it once. Details in the page panel.', () => { pref.snap = !pref.snap; paintToggles(); });
  const guidesB = B('guides', 'Show your guides (;). Drag from the rulers to make one.', () => { pref.guides = !pref.guides; paintToggles(); drawGuides(); });
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
    gridB.classList.toggle('on', pref.grid); snapB.classList.toggle('on', pref.snap); guidesB.classList.toggle('on', pref.guides);
    stage.classList.toggle('show-grid', pref.grid);
    stage.classList.toggle('show-rows', pref.grid && pref.rows);
    savePref();
  }
  function paintFolder() {
    folderB.textContent = FS.root ? '▣ ' + FS.root.name : FS.needsClick ? '▢ reconnect ' + FS.name : '▢ connect folder';
    folderB.title = FS.root ? 'Saving into this folder' : FS.supported ? 'Pick your site folder (the one with index.html) so saving writes straight into it' : 'This browser can\'t write to folders, saving will download files instead (use Chrome/Edge/Arc)';
    folderB.classList.toggle('on', !!FS.root);
  }
  function paintSave() { saveB.classList.toggle('dirty', dirty); saveB.textContent = dirty ? 'save •' : 'saved'; }

  const help = h('div', 'ed-help', document.body);
  help.innerHTML = `<b>Shortcuts</b>
  <p>drag · move &nbsp; <kbd>Alt</kbd> drag · no snapping &nbsp; <kbd>Shift</kbd> click · add to selection</p>
  <p>double-click text · type &nbsp; double-click group or component · step inside &nbsp; <kbd>Esc</kbd> · step out</p>
  <p><kbd>⌘G</kbd> group &nbsp; <kbd>⇧⌘G</kbd> ungroup &nbsp; <kbd>⌥⌘K</kbd> make component &nbsp; <kbd>⌘D</kbd> duplicate &nbsp; <kbd>⌫</kbd> delete</p>
  <p><kbd>⌘C</kbd>/<kbd>⌘V</kbd> copy, paste (pictures too) &nbsp; <kbd>]</kbd>/<kbd>[</kbd> front, back</p>
  <p>arrows · nudge &nbsp; <kbd>Shift</kbd>+arrows · one row / one column</p>
  <p><kbd>T</kbd> text &nbsp; <kbd>B</kbd> blocks &nbsp; <kbd>G</kbd> grid &nbsp; <kbd>R</kbd> rows &nbsp; <kbd>;</kbd> guides &nbsp; <kbd>S</kbd> snap &nbsp; <kbd>P</kbd> preview &nbsp; <kbd>⌘S</kbd> save</p>
  <p>Guides: drag from the ruler at the top or left edge. Drag one back onto the ruler to remove it.</p>
  <p>while typing: <kbd>⌘B</kbd> bold, <kbd>⌘K</kbd> link</p>
  <p>Drop pictures on a grey placeholder to fill it, or on a slideshow to add slides.</p>`;
  help.onclick = () => help.classList.remove('on');

  /* ---------------- render ---------------- */
  function render(keepPanel) {
    if (previewing) return;
    document.body.classList.toggle('has-side', (doc.side || 'sections') !== 'off');
    C.render(cv, doc, { edit: true, src: resolve, onMediaError, lib: libMap(), slideAt });
    mountSide(true);
    lay();
    // remember how tall text boxes turned out, so groups and selections fit them
    for (const el of cv.querySelectorAll('.it.t-text')) { const it = el._item, w = el.offsetWidth; if (w && it.w) it.h = r1(el.offsetHeight / (w / it.w)); }
    // a component's box follows its own proportions
    walk(doc.items, it => { if (it.type === 'instance') { const c = comp(it.ref); if (c) it.h = r1(c.h * it.w / c.w); } });
    if (editing) {                        // re-rendering mid-typing: pick the text box back up
      const e = elOf(editing.it.id);
      if (e) startText(e, editing.it, true);
    }
    drawGrid(); drawGuides(); drawOverlay();
    if (!keepPanel) inspector();
    if (libEl.classList.contains('on')) drawLib();
  }
  function mountSide(edit) {
    const list = index.projects.map(p => p.slug === slug ? meta : p);
    if (!list.some(p => p.slug === slug)) list.push(meta);
    SideNav.mount({ mode: doc.side || 'sections', projects: list, current: slug, cv, edit });
  }
  function syncU() {
    stage.style.setProperty('--u', cv.style.getPropertyValue('--u'));
    // the editor's page is narrower than the real one (the panel takes room), so its text is
    // drawn a bit smaller. Shrink the top bar and side nav by the same amount, so everything
    // keeps the one-size look while editing too.
    const u = parseFloat(cv.style.getPropertyValue('--u')) || 0;
    const tk = document.body.classList.contains('has-side') ? 1 / (1 - .22) : 1;
    if (u && !previewing) document.documentElement.style.setProperty('--size', Math.max(14, u * 13.67 * tk) + 'px');
  }
  function lay() { C.layout(cv); syncU(); }
  function relayout() { lay(); drawOverlay(); }
  let rz; addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(relayout); });
  cv.addEventListener('load', () => lay(), true);

  function drawGrid() {
    const g = G();
    gridEl.textContent = '';
    for (let i = 0; i < g.cols; i++) {
      const c = h('i', '', gridEl);
      c.style.left = `calc(var(--u) * ${g.colX(i)})`; c.style.width = `calc(var(--u) * ${g.colW})`;
    }
    gridEl.style.setProperty('--row', g.row || 14);
  }
  function drawGuides() {
    guidesEl.textContent = '';
    if (!pref.guides || previewing) return;
    for (const axis of ['x', 'y']) doc.guides[axis].forEach((v, i) => {
      const g = h('div', 'ed-guide ed-guide-' + axis, guidesEl);
      g.dataset.axis = axis; g.dataset.i = i;
      if (axis === 'x') g.style.left = `calc(var(--u) * ${v})`; else g.style.top = `calc(var(--u) * ${v})`;
    });
  }

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
    preview();
    const u = uPx();
    for (const l of snapLines) {
      const d = h('div', 'ed-snap ed-snap-' + l.axis, ov);
      if (l.axis === 'x') d.style.left = l.v * u + 'px'; else d.style.top = l.v * u + 'px';
    }
    if (scope.length) {
      const it = scopeItem(), g = scopeEl();
      if (g !== cv) {
        const f = frame(rectOf(g), 'ed-scope' + (it.type === 'instance' ? ' is-comp' : ''));
        h('span', '', f, it.type === 'instance'
          ? `component “${(comp(it.ref) || {}).name}” · changes every copy · Esc to step out`
          : 'inside group · Esc to step out');
      }
    }
    const its = selected();
    for (const it of its) { const e = elOf(it.id); if (e) frame(rectOf(e), 'ed-sel' + (it.type === 'instance' ? ' is-comp' : '')); }
    if (its.length === 1 && !editing) {
      const it = its[0], e = elOf(it.id);
      if (!e) return;
      const r = rectOf(e), f = frame(r, 'ed-handles');
      const dirs = it.type === 'marker' ? [] : it.type === 'text' ? ['e', 'w'] : it.type === 'instance' ? ['e', 'w', 'se', 'sw', 'ne', 'nw'] : ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
      for (const d of dirs) { const k = h('i', 'hd hd-' + d, f); k.dataset.h = d; }
      h('span', 'ed-size', f, cols(it)).title = 'where it sits on the grid';
      if (poseKey()) { const pf = frame(rectOf(e._ly.scroll), 'ed-pose'); h('span', '', pf, 'posing keyframe · drag to move it'); }
    }
  }
  function cols(it) {                     // "cols 3–8" when it sits on the grid, else units
    const o = origin(), g = G();
    if (o.k !== 1) return `${Math.round(it.w)} × ${Math.round(it.h)}`;
    const L = it.x + o.x, R = it.x + it.w + o.x;
    let li = -1, ri = -1;
    for (let i = 0; i < g.cols; i++) { if (Math.abs(g.colX(i) - L) < .6) li = i; if (Math.abs(g.colX(i) + g.colW - R) < .6) ri = i; }
    return li > -1 && ri >= li ? (li === ri ? `col ${li + 1}` : `cols ${li + 1}–${ri + 1}`) : `${Math.round(it.w)} × ${Math.round(it.h)}`;
  }

  function setSel(ids) { sel = new Set(ids); drawOverlay(); inspector(); }

  /* ---------------- guides ---------------- */
  function guideDrag(e, axis, i) {
    e.preventDefault(); e.stopPropagation();
    if (!pref.guides) { pref.guides = true; paintToggles(); }
    const list = doc.guides[axis];
    if (i == null) { list.push(0); i = list.length - 1; }
    const s = () => cv.getBoundingClientRect();
    const mv = ev => {
      const r = s(), u = r.width / U;
      let v = axis === 'x' ? (ev.clientX - r.left) / u : (ev.clientY - r.top) / u;
      if (!ev.altKey && pref.snap) {     // guides like to sit on column edges and rows
        const g = G();
        if (axis === 'x') { for (let c = 0; c < g.cols; c++) for (const E of [g.colX(c), g.colX(c) + g.colW]) if (Math.abs(E - v) * u < 6) v = E; }
        else if (g.row) { const R = Math.round(v / g.row) * g.row; if (Math.abs(R - v) * u < 6) v = R; }
      }
      list[i] = r1(v); drawGuides();
      const tip = guidesEl.children[[...guidesEl.children].findIndex(c => c.dataset.axis === axis && +c.dataset.i === i)];
      if (tip) tip.dataset.v = Math.round(v);
    };
    const up = ev => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      const onRuler = axis === 'x' ? ev.clientX < 16 : ev.clientY < 16;
      if (onRuler) list.splice(i, 1);
      commit(true);
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
    mv(e);
  }
  rulerX.addEventListener('pointerdown', e => guideDrag(e, 'y'));
  rulerY.addEventListener('pointerdown', e => guideDrag(e, 'x'));
  guidesEl.addEventListener('pointerdown', e => {
    const g = e.target.closest('.ed-guide'); if (!g) return;
    guideDrag(e, g.dataset.axis, +g.dataset.i);
  });
  guidesEl.addEventListener('dblclick', e => {
    const g = e.target.closest('.ed-guide'); if (!g) return;
    doc.guides[g.dataset.axis].splice(+g.dataset.i, 1); commit(true);
  });

  /* ---------------- pointer: select, move, resize, marquee ---------------- */
  function pick(target) {
    const ids = new Set(scopeItems().map(i => i.id));
    const root = scopeEl();
    let el = target.closest && target.closest('.it');
    while (el && !(ids.has(el.dataset.id) && root.contains(el) && el !== root)) el = el.parentElement && el.parentElement.closest('.it');
    return el;
  }

  stage.addEventListener('pointerdown', e => {
    if (previewing || e.button !== 0) return;
    if (e.target.closest('.ed-guide')) return;
    if (editing && editing.el.contains(e.target)) return;
    if (panel.contains(document.activeElement)) document.activeElement.blur();   // lets a half-typed number commit
    closeLib();
    finishText();
    const hd = e.target.closest('.hd');
    if (hd) return startResize(e, hd.dataset.h);
    let el = pick(e.target);
    if (!el && scope.length && !scopeEl().contains(e.target)) {   // clicked outside the group we're in
      scope = []; render(); el = pick(e.target);
    }
    if (!el) { if (!e.shiftKey) setSel([]); return startMarquee(e); }
    const id = el.dataset.id;
    if (e.shiftKey) {
      e.preventDefault(); getSelection().removeAllRanges();     // shift-click picks things, never text
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
    const pk = poseKey();
    if (pk) {                             // a keyframe is selected: dragging poses it, the element itself stays put
      const s0 = { x: pk.s.x || 0, y: pk.s.y || 0 }, q0 = toUnits(e);
      drag(e, ev => {
        const q = toUnits(ev);
        pk.s.x = r1(s0.x + q.x - q0.x); pk.s.y = r1(s0.y + q.y - q0.y);
        if (!pk.s.x) delete pk.s.x; if (!pk.s.y) delete pk.s.y;
        drawOverlay();
      }, () => { commit(true); inspector(); });
      return;
    }
    const start = its.map(i => ({ i, x: i.x, y: i.y }));
    const bb = bbox(its), p0 = toUnits(e), skip = new Set(its.map(i => i.id));
    let moved = false;
    drag(e, ev => {
      const p = toUnits(ev);
      let dx = p.x - p0.x, dy = p.y - p0.y;
      if (!moved && Math.hypot(dx, dy) * uPx() < 3) return;
      if (!moved) { moved = true; stage.classList.add('dragging'); }
      snapLines = [];
      if (pref.snap && !ev.altKey) { const s = snapMove(bb.x + dx, bb.y + dy, bb.w, bb.h, skip); dx = s.x - bb.x; dy = s.y - bb.y; }
      for (const s of start) { s.i.x = r1(s.x + dx); s.i.y = r1(s.y + dy); const el = elOf(s.i.id); if (el) C.place(el, s.i); }
      lay(); drawOverlay();
    }, () => { snapLines = []; if (moved) { commit(true); inspector(); } else drawOverlay(); });
  }

  function startResize(e, dir) {
    e.stopPropagation();
    const it = selected()[0]; if (!it) return;
    const s0 = { x: it.x, y: it.y, w: it.w, h: it.h }, ar = s0.w / (s0.h || 1), p0 = toUnits(e);
    const kidsSnap = it.children ? clone(it.children) : null, skip = new Set([it.id]);
    drag(e, ev => {
      const p = toUnits(ev), dx = p.x - p0.x, dy = p.y - p0.y, free = !pref.snap || ev.altKey;
      snapLines = [];
      let { x, y, w, h: hh } = s0;
      if (dir.includes('e')) { w = s0.w + dx; if (!free) w = snapOne('x', x + w, skip) - x; }
      if (dir.includes('w')) { x = s0.x + dx; if (!free) x = snapOne('x', x, skip); w = s0.w + (s0.x - x); }
      if (dir.includes('s')) { hh = s0.h + dy; if (!free) hh = snapOne('y', y + hh, skip) - y; }
      if (dir.includes('n')) { y = s0.y + dy; if (!free) y = snapOne('y', y, skip); hh = s0.h + (s0.y - y); }
      const keep = ev.shiftKey || it.type === 'instance' || (it.type === 'group' && dir.length === 2);
      if (keep) { const nh = w / ar; if (dir.includes('n')) y += hh - nh; hh = nh; }
      if (w < 8) { if (dir.includes('w')) x -= 8 - w; w = 8; }
      if (hh < 1) { if (dir.includes('n')) y -= 1 - hh; hh = 1; }
      Object.assign(it, { x: r1(x), y: r1(y), w: r1(w), h: r1(hh) });
      if (kidsSnap) {                     // a group scales everything inside it
        const sx = w / s0.w, sy = hh / s0.h;
        const scale = (src, dst) => src.forEach((c, i) => {
          Object.assign(dst[i], { x: r1(c.x * sx), y: r1(c.y * sy), w: r1(c.w * sx), h: r1(c.h * sy) });
          if (c.children) scale(c.children, dst[i].children);
        });
        scale(kidsSnap, it.children);
        render(true); return;
      }
      const el = elOf(it.id); if (el) { C.place(el, it); if (it.type === 'instance') el.style.setProperty('--k', it.w / comp(it.ref).w); }
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
    }, () => { drawOverlay(); inspector(); });      // the marquee box always goes away
  }

  /* ---------------- double-click: type, step inside, swap pictures ---------------- */
  function enter(it) {
    scope.push(it.id); setSel([]); render();
    toast(it.type === 'instance' ? 'Editing the component: every copy changes with it. Esc to step out.' : 'Inside the group. Esc to step out.', 3500);
  }
  stage.addEventListener('dblclick', async e => {
    if (previewing || e.target.closest('.ed-guide')) return;
    const el = pick(e.target); if (!el) return;
    const it = find(el.dataset.id).it;
    if (it.type === 'text' || it.type === 'button' || (it.type === 'box' && it.text != null)) startText(el, it);
    else if (it.type === 'group' || it.type === 'instance') enter(it);
    else if (it.type === 'image' || it.type === 'video') {
      const f = await pickFiles(it.type === 'video' ? 'video/*' : 'image/*,video/*', false);
      if (f.length) addFiles(f, null, it);
    } else if (it.type === 'slides') {
      const f = await pickFiles('image/*'); if (f.length) addFiles(f, null, it);
    } else if (it.type === 'embed') {
      const u = prompt('Link to embed (YouTube, Vimeo, or any page)', it.src || '');
      if (u != null) { it.src = u.trim(); commit(); }
    }
  });

  function startText(el, it, resume) {
    const t = el && el.querySelector(it.type === 'button' ? '.btn > span' : it.type === 'box' ? '.box > .txt' : '.txt'); if (!t) return;
    editing = { el: t, it };
    t.contentEditable = 'true';
    t.spellcheck = true;
    if (!resume) {
      t.focus();
      const r = document.createRange(); r.selectNodeContents(t);
      if (!/^(New text|Project title|Button|Say something.*)$/.test(t.textContent)) r.collapse(false);
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
    if (it.type === 'text' && !el.textContent.trim() && !html.includes('<br>')) { removeItems([it.id]); return; }
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
    add({ id: uid(), type: 'text', x: r1(col0()), y: r1(viewY()), w: r1(G().span(Math.max(1, Math.round(G().cols / 3)))), h: 14, text: 'New text' }, true);
  }

  /* ---------------- the block library ----------------
     Ready-made blocks (assets/blocks.js) drop in as plain things you can
     change freely. They go below whatever is selected (or where you are),
     and everything underneath moves down to make room.
     "Yours" are components: every copy stays linked to the original. */
  const GAP_Y = 112;                      // breathing room between blocks, in units
  function placeY(h) {
    const top = !scope.length;
    const its = selected().filter(i => scopeItems().includes(i));
    let y = its.length ? Math.max(...its.map(i => i.y + (i.h || 14))) + GAP_Y : viewY();
    if (top) for (let n = 0; n < 12; n++) {          // don't land in the middle of something
      const hit = doc.items.find(i => i.y < y - 1 && i.y + (i.h || 14) > y + 1);
      if (!hit) break;
      y = hit.y + (hit.h || 14) + GAP_Y;
    }
    y = rowSnap(y) ?? y;
    if (top) for (const i of doc.items) if (i.y >= y - 1) i.y = r1(i.y + h + GAP_Y);   // make room
    return y;
  }
  function insert(list) {
    const o = origin(), bb = bbox(list), hgt = Blocks.height(list.map(i => ({ ...i, y: i.y - bb.y })));
    const y0 = placeY(hgt);
    const items = list.map(i => ({ ...i, id: i.id || uid(), x: r1((i.x - o.x) / o.k), y: r1(i.y - bb.y + y0) }));
    scopeItems().push(...items);
    closeLib(); setSel(items.map(i => i.id)); commit();
    toast(scope.length ? 'Added' : 'Added. Everything below moved down to make room.');
  }
  function insertComp(c) {
    if (scope.some(id => { const s = find(id).it; return s.type === 'instance' && s.ref === c.id; })) return toast('A component can\'t go inside itself');
    const o = origin();
    let w = Math.min(c.w, U);
    const it = { id: uid(), type: 'instance', ref: c.id, x: r1((G().colX(0) - o.x) / o.k), y: 0, w: r1(w), h: r1(c.h * w / c.w) };
    if (it.x + it.w > U) it.x = 0;
    it.y = r1(placeY(it.h));
    scopeItems().push(it); closeLib(); setSel([it.id]); commit();
  }
  function moveBelow(it, dy) {            // more or less space under something
    const b = it.y + (it.h || 14);
    for (const i of scopeItems()) if (i !== it && i.y >= b - 1) i.y = r1(Math.max(b, i.y + dy));
    commit(true);
  }
  function toggleLib() { libEl.classList.contains('on') ? closeLib() : (drawLib(), libEl.classList.add('on'), libB.classList.add('on')); }
  function closeLib() { libEl.classList.remove('on'); libB.classList.remove('on'); }
  function drawLib() {
    libEl.textContent = '';
    const g0 = G(), cats = {};
    for (const b of Blocks.LIB) (cats[b.cat] = cats[b.cat] || []).push(b);
    for (const [title, set] of Object.entries(cats)) {
      h('p', 'ed-lib-h', libEl, title);
      const g = h('div', 'ed-lib-g', libEl);
      for (const blk of set) {
        const b = h('button', 'ed-tile', g); b.type = 'button';
        drawThumb(h('span', 'ed-mini', b), Blocks.make(blk, g0));
        h('span', '', b, blk.name);
        if (blk.note) h('small', '', b, blk.note);
        b.onclick = () => insert(Blocks.make(blk, G()));
      }
    }
    h('p', 'ed-lib-h', libEl, 'Yours · linked: edit one, they all change');
    if (!lib.components.length) h('p', 'ed-note', libEl, 'Nothing yet. Select some things and press “make component” (⌥⌘K).');
    const g = h('div', 'ed-lib-g', libEl);
    for (const c of lib.components) {
      const b = h('div', 'ed-tile ed-own', g);
      drawThumb(h('span', 'ed-mini', b), c.children, c);
      const n = h('span', '', b, c.name);
      n.title = `used ${uses(c.id)}× on this page`;
      b.onclick = () => insertComp(c);
      const tools = h('span', 'ed-own-tools', b);
      const rn = h('button', '', tools, 'rename'); rn.type = 'button';
      rn.onclick = ev => { ev.stopPropagation(); const v = prompt('Name', c.name); if (v) { c.name = v; commit(true); drawLib(); } };
      const del = h('button', '', tools, '×'); del.type = 'button';
      del.onclick = ev => {
        ev.stopPropagation();
        const n = uses(c.id);
        if (!confirm(`Delete “${c.name}” from your library?${n ? ` It's used ${n}× on this page; those copies become ordinary groups.` : ''} Other pages using it will show an empty box.`)) return;
        walk(doc.items, it => { if (it.type === 'instance' && it.ref === c.id) detachInto(it); });
        lib.components.splice(lib.components.indexOf(c), 1); gone.add(c.id); commit(); drawLib();
      };
    }
  }
  function drawThumb(box, items, c) {     // a tiny schematic of a block
    const b = c ? { x: 0, y: 0, w: c.w, h: c.h } : bbox(items);
    const W = Math.max(b.w, 1), H = Math.max(b.h, 1), k = Math.min(1, 1.6 * W / H);
    const one = (it, ox, oy) => {
      if (it.type === 'group') { for (const ch of it.children || []) one(ch, ox + it.x, oy + it.y); return; }
      const d = h('i', 'm-' + it.type, box);
      Object.assign(d.style, {
        left: (ox + it.x - b.x) / W * 100 + '%', top: (oy + it.y - b.y) / H * 100 * k + '%',
        width: Math.max(2, it.w / W * 100) + '%', height: it.type === 'text' ? '3px' : Math.max(1, (it.h || 0) / H * 100 * k) + '%',
      });
      const col = it.type === 'box' ? it.fill : it.color;
      if (col && col[0] === '#') d.style.background = col;
    };
    for (const it of items) one(it, 0, 0);
  }

  /* ---------------- arranging ---------------- */
  function removeItems(ids) {
    for (const id of ids) { const f = find(id); if (f) f.arr.splice(f.arr.indexOf(f.it), 1); }
    sel = new Set([...sel].filter(id => find(id)));
    commit();
  }
  function duplicate() {
    const its = selected(); if (!its.length) return;
    const g = G(), arr = scopeItems(), copies = its.map(i => { const c = freshIds(clone(i)); c.x += g.row; c.y += g.row; return c; });
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
  function makeComponent() {
    const its = selected(); if (!its.length) return toast('Select what should become a component');
    if (its.length === 1 && its[0].type === 'instance') return toast('That is already a component');
    const name = prompt('Name this component', its.length === 1 ? (its[0].type === 'button' ? 'Button' : 'Component') : 'Component');
    if (!name) return;
    const arr = scopeItems(), bb = bbox(its);
    const at = Math.min(...its.map(i => arr.indexOf(i)));
    const c = { id: 'c' + uid(), name, w: r1(bb.w), h: r1(Math.max(bb.h, 1)), children: [] };
    for (const i of arr.filter(i => sel.has(i.id))) { arr.splice(arr.indexOf(i), 1); i.x = r1(i.x - bb.x); i.y = r1(i.y - bb.y); c.children.push(i); }
    lib.components.push(c);
    const inst = { id: uid(), type: 'instance', ref: c.id, x: r1(bb.x), y: r1(bb.y), w: c.w, h: c.h };
    arr.splice(at, 0, inst);
    setSel([inst.id]); commit();
    toast(`“${name}” is in your blocks now. Copies stay linked.`, 3500);
  }
  function detachInto(it) {               // turn a linked copy into an ordinary group
    const c = comp(it.ref); if (!c) return;
    const k = it.w / c.w;
    const scale = list => list.map(ch => {
      const n = { ...clone(ch), x: r1(ch.x * k), y: r1(ch.y * k), w: r1(ch.w * k), h: r1((ch.h || 0) * k) };
      if (n.children) n.children = scale(ch.children);
      return n;
    });
    const kids = scale(c.children).map(freshIds);
    Object.assign(it, { type: 'group', children: kids }); delete it.ref;
  }
  function detach() {
    for (const it of selected().filter(i => i.type === 'instance')) detachInto(it);
    commit(); toast('Detached: it is a plain group now');
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
  function distribute(axis) {
    const its = selected(); if (its.length < 3) return toast('Pick three or more');
    const k = axis === 'x' ? 'x' : 'y', s = axis === 'x' ? 'w' : 'h';
    its.sort((a, b) => a[k] - b[k]);
    const first = its[0], lastI = its[its.length - 1];
    const total = its.reduce((n, i) => n + i[s], 0), gap = (lastI[k] + lastI[s] - first[k] - total) / (its.length - 1);
    let p = first[k];
    for (const i of its) { i[k] = r1(p); p += i[s] + gap; }
    commit();
  }
  function fitGrid(it) {                  // pull a box onto the nearest columns and rows
    const o = origin(), g = G();
    if (o.k !== 1) return;
    const Ls = [...Array(g.cols)].map((_, i) => g.colX(i)), Rs = Ls.map(v => v + g.colW);
    const L = Ls.reduce((a, v) => Math.abs(v - (it.x + o.x)) < Math.abs(a - (it.x + o.x)) ? v : a);
    const R = Rs.filter(v => v > L).reduce((a, v) => Math.abs(v - (it.x + it.w + o.x)) < Math.abs(a - (it.x + it.w + o.x)) ? v : a, Rs[Rs.length - 1]);
    const nw = R - L;
    if (/image|video|embed|slides|instance/.test(it.type)) it.h = r1(it.h * nw / it.w);
    it.x = r1(L - o.x); it.w = r1(nw);
    if (g.row) { it.y = r1(Math.round((it.y + o.y) / g.row) * g.row - o.y); if (!/text|instance/.test(it.type)) it.h = r1(Math.max(g.row, Math.round(it.h / g.row) * g.row)); }
  }

  /* ---------------- clipboard and drops ---------------- */
  const typingNow = () => editing || /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '');
  const copyOut = e => e.clipboardData.setData('text/plain', JSON.stringify({ atulEditor: 1, items: clone(selected()) }));
  addEventListener('copy', e => { if (typingNow() || !sel.size) return; copyOut(e); e.preventDefault(); });
  addEventListener('cut', e => { if (typingNow() || !sel.size) return; copyOut(e); e.preventDefault(); removeItems([...sel]); });
  addEventListener('paste', e => {
    if (typingNow() || previewing) return;
    const files = [...e.clipboardData.files];
    if (files.length) { e.preventDefault(); return addFiles(files, null, selected().length === 1 ? selected()[0] : null); }
    const text = e.clipboardData.getData('text/plain');
    let items = null;
    try { const o = JSON.parse(text); if (o && o.atulEditor) items = o.items; } catch (err) {}
    e.preventDefault();
    if (items) {
      const g = G(), copies = items.map(i => { const c = freshIds(clone(i)); c.x += g.row; c.y += g.row; return c; });
      scopeItems().push(...copies); setSel(copies.map(c => c.id)); commit();
    } else if (text.trim()) {
      const esc = text.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
      add({ id: uid(), type: 'text', x: r1(col0()), y: r1(viewY()), w: r1(G().span(Math.ceil(G().cols / 2))), h: 14, text: esc });
    }
  });
  stage.addEventListener('dragover', e => { if (!previewing) { e.preventDefault(); stage.classList.add('drop'); } });
  stage.addEventListener('dragleave', e => { if (!stage.contains(e.relatedTarget)) stage.classList.remove('drop'); });
  stage.addEventListener('drop', e => {
    e.preventDefault(); stage.classList.remove('drop');
    if (previewing) return;
    const el = pick(e.target), target = el && find(el.dataset.id).it;
    addFiles(e.dataTransfer.files, toUnits(e), target);
  });

  /* ---------------- keys ---------------- */
  let nudgeT;
  addEventListener('keydown', e => {
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && k === 's') { e.preventDefault(); save(); return; }
    if (editing) {
      if (e.key === 'Escape') { e.preventDefault(); finishText(); }
      if (mod && k === 'k') { e.preventDefault(); const u = prompt('Link to'); if (u) document.execCommand('createLink', false, u); }
      if (editing && editing.it.type === 'button' && e.key === 'Enter') { e.preventDefault(); finishText(); }
      return;
    }
    if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) {
      if (e.key === 'Escape') document.activeElement.blur();
      return;
    }
    if (previewing) { if (e.key === 'Escape' || k === 'p') togglePreview(); return; }
    if (mod && e.altKey && (k === 'k' || e.code === 'KeyK')) { e.preventDefault(); makeComponent(); return; }
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
    if (mod && k === 'y') { e.preventDefault(); doRedo(); return; }
    if (mod && k === 'd') { e.preventDefault(); duplicate(); return; }
    if (mod && k === 'g') { e.preventDefault(); e.shiftKey ? ungroup() : group(); return; }
    if (mod && k === 'a') { e.preventDefault(); setSel(scopeItems().map(i => i.id)); return; }
    if (mod) return;
    if (e.key === 'Backspace' || e.key === 'Delete') { if (sel.size) { e.preventDefault(); removeItems([...sel]); } return; }
    if (e.key === 'Escape') {
      help.classList.remove('on');
      if (libEl.classList.contains('on')) return closeLib();
      if (sel.size) setSel([]); else if (scope.length) { const g = scope.pop(); render(); setSel([g]); }
      return;
    }
    if (e.key === 'Enter') {
      const it = selected()[0]; if (!it) return;
      e.preventDefault();
      if (it.type === 'text' || it.type === 'button' || (it.type === 'box' && it.text != null)) startText(elOf(it.id), it);
      else if (it.type === 'group' || it.type === 'instance') enter(it);
      return;
    }
    if (e.key.startsWith('Arrow') && sel.size) {
      e.preventDefault();
      const g = G(), big = e.shiftKey, dx = { ArrowLeft: -1, ArrowRight: 1 }[e.key] || 0, dy = { ArrowUp: -1, ArrowDown: 1 }[e.key] || 0;
      for (const it of selected()) {
        it.x = r1(it.x + dx * (big ? g.colW + g.gap : 1));
        it.y = r1(it.y + dy * (big ? (g.row || 14) : 1));
        const el = elOf(it.id); if (el) C.place(el, it);
      }
      clearTimeout(nudgeT); nudgeT = setTimeout(() => commit(), 400);
      lay(); drawOverlay(); return;
    }
    if (k === ']') return order(true);
    if (k === '[') return order(false);
    if (k === 't') { e.preventDefault(); return addText(); }
    if (k === 'b') { e.preventDefault(); return toggleLib(); }
    if (k === 'g') { pref.grid = !pref.grid; return paintToggles(); }
    if (k === 'r') { pref.rows = !pref.rows; if (pref.rows) pref.grid = true; paintToggles(); return inspector(); }
    if (k === ';') { pref.guides = !pref.guides; paintToggles(); return drawGuides(); }
    if (k === 's') { pref.snap = !pref.snap; paintToggles(); return toast(pref.snap ? 'snapping on' : 'free placement'); }
    if (k === 'p') return togglePreview();
    if (k === '?') return help.classList.toggle('on');
  });

  /* ---------------- preview ---------------- */
  function togglePreview() {
    finishText(); closeLib();
    previewing = !previewing;
    document.body.classList.toggle('previewing', previewing);
    if (previewing) {
      ov.textContent = ''; guidesEl.textContent = '';
      document.documentElement.style.removeProperty('--size');   // preview: real sizes
      C.render(cv, doc, { edit: false, src: resolve, onMediaError, lib: libMap() });
      mountSide(false); lay();
      cv.querySelectorAll('a').forEach(a => a.addEventListener('click', e => e.preventDefault()));
      document.querySelectorAll('nav.side a[href*="project.html"]').forEach(a => a.addEventListener('click', e => e.preventDefault()));
      stopAnim = C.animate(cv);
      toast('Preview. Scroll, hover, click. P or Esc to go back.');
    } else {
      stopAnim && stopAnim(); stopAnim = null;
      render();
    }
  }

  /* ---------------- scroll keyframes ----------------
     The timeline for "while scrolling" is the element's trip up the screen:
     left end = its middle at the bottom edge (just arriving),
     right end = its middle at the top edge (about to leave).
     The playhead follows the page as you scroll, so you can scroll to a
     spot, pose the element (fields, or just drag it), and add a keyframe. */
  let kf = { id: null, sel: -1, play: 50, follow: true, pose: true };
  let trackRefs = null;
  const scrollAnim = it => it && it.anim && it.anim.scroll && it.anim.scroll.on ? it.anim.scroll : null;
  function toKeys(a) {
    if (!a.keys || !a.keys.length) {
      a.keys = C.keysOf(a).map(k => ({ at: k.at, s: { ...k.s }, ease: k.ease || a.ease || 'linear' }));
      delete a.from; delete a.to; delete a.start; delete a.end; delete a.ease;
    }
    return a.keys;
  }
  const screenAt = el => { const r = el.getBoundingClientRect(); return (r.top + r.height / 2) / innerHeight * 100; };
  const clampAt = v => Math.max(-20, Math.min(120, v));
  function poseKey() {
    if (!kf.pose || kf.sel < 0 || sel.size !== 1 || !sel.has(kf.id) || !trackRefs) return null;
    const f = find(kf.id), a = f && scrollAnim(f.it);
    return a && a.keys && a.keys[kf.sel] ? a.keys[kf.sel] : null;
  }
  function preview() {                    // show the selected element as it looks at the playhead
    for (const l of cv.querySelectorAll('.ly-scroll')) if (l.style.transform || l.style.opacity) C.setState(l, null);
    if (sel.size !== 1 || !sel.has(kf.id) || !trackRefs) return;
    const f = find(kf.id), a = f && scrollAnim(f.it), el = elOf(kf.id);
    if (!a || !el) return;
    C.setState(el._ly.scroll, C.scrollState(a, kf.play));
    paintTrack();
  }
  const pct = at => Math.max(0, Math.min(100, 100 - at));
  function paintTrack() {
    if (!trackRefs || !document.contains(trackRefs.rail)) return;
    const f = find(kf.id), a = f && scrollAnim(f.it); if (!a) return;
    trackRefs.ph.style.left = pct(kf.play) + '%';
    trackRefs.read.textContent = kf.follow ? `playhead ${Math.round(kf.play)}% · following the page` : `playhead ${Math.round(kf.play)}%`;
    trackRefs.rail.querySelectorAll('.ed-key').forEach(k => k.remove());
    (a.keys || []).forEach((k, i) => {
      const d = h('b', 'ed-key' + (i === kf.sel ? ' on' : ''), trackRefs.rail);
      d.style.left = pct(k.at) + '%'; d.dataset.i = i; d.title = `keyframe at ${Math.round(k.at)}%`;
    });
  }
  addEventListener('scroll', () => {
    if (previewing || !kf.follow || !trackRefs || sel.size !== 1 || !sel.has(kf.id)) return;
    const el = elOf(kf.id); if (!el) return;
    kf.play = clampAt(screenAt(el)); preview();
  }, { passive: true });

  function scrollPanel(it, d, a) {
    const keys = toKeys(a);
    const el = elOf(it.id);
    if (kf.id !== it.id) kf = { id: it.id, sel: -1, play: el ? clampAt(screenAt(el)) : 50, follow: true, pose: true };
    if (kf.sel >= keys.length) kf.sel = -1;

    const tr = h('div', 'ed-track', d);
    const lab = h('div', 'ed-track-lab', tr); h('span', '', lab, 'arrives (bottom)'); h('span', '', lab, 'leaves (top)');
    const rail = h('div', 'ed-rail', tr);
    const ph = h('i', 'ed-ph', rail);
    const read = h('p', 'ed-note', d);
    trackRefs = { rail, ph, read };
    const atFromX = x => { const r = rail.getBoundingClientRect(); return Math.round(100 - Math.max(0, Math.min(1, (x - r.left) / r.width)) * 100); };
    rail.addEventListener('pointerdown', e => {
      e.preventDefault();
      const key = e.target.closest('.ed-key');
      kf.follow = false;
      if (key) {                            // grab a keyframe: select it, drag to move it in time
        const i = +key.dataset.i; kf.sel = i; kf.play = keys[i].at;
        let moved = false;
        const mv = ev => { moved = true; keys[i].at = atFromX(ev.clientX); kf.play = keys[i].at; preview(); };
        const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (moved) commit(true); inspector(); drawOverlay(); };
        addEventListener('pointermove', mv); addEventListener('pointerup', up);
        preview(); return;
      }
      kf.sel = -1;                          // anywhere else: scrub the playhead
      const mv = ev => { kf.play = atFromX(ev.clientX); preview(); };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); inspector(); drawOverlay(); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up); mv(e);
    });
    rail.addEventListener('dblclick', e => { if (!e.target.closest('.ed-key')) addKey(atFromX(e.clientX)); });

    function addKey(at) {
      const now = C.scrollState(a, at), st = {};
      for (const k in C.NEUTRAL) { const v = Math.round(now[k] * 100) / 100; if (v !== C.NEUTRAL[k]) st[k] = v; }
      keys.push({ at: Math.round(at), s: st, ease: 'linear' });
      kf.sel = keys.length - 1; kf.play = Math.round(at); kf.follow = false;
      commit(true); inspector(); drawOverlay();
      toast('Keyframe added. Drag the element on the page to pose it, or type values below.', 3500);
    }
    actions(d, [
      ['◆ add keyframe here', () => addKey(kf.play), 'Adds a keyframe where the playhead is, double-click the timeline works too'],
      ['▶ play', () => play(it, 'scroll')],
    ]);
    check(d, 'playhead follows the page as I scroll', () => kf.follow, v => { kf.follow = v; if (v && el) kf.play = clampAt(screenAt(elOf(it.id))); }, true);

    const k = keys[kf.sel];
    if (k) {
      const box = h('div', 'ed-keybox', d);
      h('p', 'ed-sub', box, `Keyframe ${kf.sel + 1} of ${keys.length}`);
      const g = h('div', 'ed-4', box);
      num(g, 'at % of screen', () => k.at, v => { k.at = v; kf.play = v; preview(); }, 1, false).title = '100 = its middle at the bottom edge, 0 = at the top edge';
      stateFields(box, 'how it looks here', k, 's', () => preview());
      choose(box, 'easing to next', EASES, () => k.ease || 'linear', v => k.ease = v);
      check(box, 'dragging on the page poses this keyframe', () => kf.pose, v => { kf.pose = v; drawOverlay(); }, true);
      actions(box, [
        ['delete keyframe', () => { if (keys.length <= 1) return toast('Keep at least one, or switch scrolling off'); keys.splice(kf.sel, 1); kf.sel = -1; commit(); }],
        ['done', () => { kf.sel = -1; kf.follow = true; inspector(); drawOverlay(); }],
      ]);
    } else {
      h('p', 'ed-note', d, `${keys.length} keyframe${keys.length === 1 ? '' : 's'}. Click a ◆ to edit or pose it, drag it to change when it happens. Scroll the page or drag on the timeline to move the playhead.`);
    }
    preview();
  }

  // play one animation on one element, right here in the editor
  function play(it, kind) {
    const el = elOf(it.id); if (!el) return;
    const a = it.anim[kind], ly = el._ly[kind];
    if (kind === 'enter') {
      C.setState(ly, a.from);
      requestAnimationFrame(() => requestAnimationFrame(() => C.setState(ly, null, C.timing(a.dur, a.ease, a.delay))));
    } else if (kind === 'scroll') {
      // sweep the playhead from the bottom of the screen to the top
      const t0 = performance.now(), D = 2200, keep = { ...kf };
      kf.follow = false; kf.sel = -1;
      const step = now => {
        const t = Math.min(1, (now - t0) / D);
        kf.play = 110 - 120 * t; preview();
        if (t < 1) requestAnimationFrame(step); else setTimeout(() => { Object.assign(kf, keep); preview(); }, 400);
      };
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
    scroll: () => ({ on: true, keys: [{ at: 100, s: { y: -80 }, ease: 'linear' }, { at: 0, s: { y: 80 } }] }),
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
  function num(parent, label, get, set, step = 1, live = true) {
    const r = row(parent, label), i = h('input', '', r);
    i.type = 'number'; i.step = step; i.value = fmt(get());
    i.oninput = () => { const v = parseFloat(i.value); if (!isNaN(v)) { set(v); if (live) render(true); } };
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
  function check(parent, label, get, set, onlyPref) {
    const r = h('label', 'ed-row ed-check', parent), i = h('input', '', r);
    i.type = 'checkbox'; i.checked = !!get(); h('span', '', r, label);
    i.onchange = () => { set(i.checked); onlyPref ? (paintToggles(), render()) : commit(); };
  }
  function actions(parent, list) {
    const r = h('div', 'ed-acts', parent);
    for (const [l, fn, title] of list) { const b = h('button', '', r, l); b.type = 'button'; if (title) b.title = title; b.onclick = fn; }
  }
  // palette names: each has a light- and a dark-mode version (shared.css); "bg" is the page background
  const SWATCHES = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'teal', 'bg'];
  // named colours (ink, grey…) plus any colour at all
  function colourField(parent, label, tokens, get, set) {
    const r = row(parent, label), g = h('span', 'ed-seg ed-col', r);
    const cur = get();
    for (const [v, l] of Object.entries(tokens)) {
      const b = h('button', cur == v ? 'on' : '', g, l); b.type = 'button';
      b.onclick = e => { e.preventDefault(); set(v); commit(); };
    }
    const pick = h('input', cur && cur[0] === '#' ? 'on' : '', g);
    pick.type = 'color'; pick.title = 'any colour';
    pick.value = cur && cur[0] === '#' ? cur : '#db0007';
    pick.oninput = () => { set(pick.value); render(true); };
    pick.onchange = () => commit();
    const sw = h('div', 'ed-sw', parent);
    for (const c of SWATCHES) {
      const b = h('button', cur === c ? 'on' : '', sw); b.type = 'button'; b.title = c === 'bg' ? 'page background (white / black)' : c; b.style.background = `var(--${c})`;
      b.onclick = e => { e.preventDefault(); set(c); commit(); };
    }
  }
  const plainText = html => { const d = document.createElement('div'); d.innerHTML = html || ''; return d.textContent.trim(); };

  function stateFields(parent, label, obj, key, onEdit) {
    const box = h('div', 'ed-state', parent);
    h('span', 'ed-lab', box, label);
    const st = () => (obj[key] = obj[key] || {});
    const F = [['x', 'move x', 1], ['y', 'move y', 1], ['scale', 'scale', .05], ['rotate', 'rotate °', 1], ['opacity', 'opacity', .05], ['blur', 'blur', 1]];
    for (const [k, l, step] of F) {
      const c = h('label', '', box); h('span', '', c, l);
      const i = h('input', '', c); i.type = 'number'; i.step = step;
      i.placeholder = fmt(C.NEUTRAL[k]); i.value = fmt(st()[k]);
      i.oninput = () => { const v = parseFloat(i.value); if (isNaN(v) || v === C.NEUTRAL[k]) delete st()[k]; else st()[k] = v; touch(); onEdit && onEdit(); };
      i.onchange = () => commit(true);
    }
  }

  function inspector() {
    if (previewing) return;
    const keepScroll = panel.scrollTop;
    const open = {}; panel.querySelectorAll('details').forEach(d => open[d.dataset.k] = d.open);
    panel.textContent = '';
    trackRefs = null;
    const its = selected();
    if (!its.length) pagePanel();
    else if (its.length > 1) multiPanel(its);
    else itemPanel(its[0]);
    panel.querySelectorAll('details').forEach(d => { if (d.dataset.k in open) d.open = open[d.dataset.k]; });
    panel.scrollTop = keepScroll;
  }
  const keyed = (d, k) => (d.dataset.k = k, d);

  function pagePanel() {
    if (scope.length) {
      const it = scopeItem();
      h('p', 'ed-head', panel, it.type === 'instance' ? `Inside component “${(comp(it.ref) || {}).name}”` : 'Inside a group');
      if (it.type === 'instance') h('p', 'ed-note', panel, 'Whatever you change here changes in every copy, on every page.');
      actions(panel, [['step out  Esc', () => { const g = scope.pop(); render(); setSel([g]); }]]);
      return;
    }
    h('p', 'ed-head', panel, 'Page');
    const s = keyed(sec('This project, on the work list'), 'page');
    text(s, 'title', () => meta.title, v => meta.title = v);
    text(s, 'year', () => meta.year, v => meta.year = v, '2026');
    text(s, 'tags', () => meta.tags, v => meta.tags = v, 'interaction, research');
    text(s, 'one-liner', () => meta.summary, v => meta.summary = v, 'optional');
    check(s, 'hidden from the work list', () => meta.hidden, v => meta.hidden = v);

    const sd = keyed(sec('Side nav'), 'side');
    seg(sd, 'lists', { sections: 'sections', projects: 'projects', off: 'off' }, () => doc.side || 'sections', v => doc.side = v);
    if ((doc.side || 'sections') === 'sections') {
      h('p', 'ed-note', sd, 'Each section is a name in the side nav, tied to something on the page: click it there and the page goes to that thing. Everything below it, up to the next one, belongs to it.');
      const anchors = [];
      walk(doc.items, (it, arr, parent) => { if (it.nav) anchors.push(it); });
      const absY = it => { let y = it.y, f = find(it.id); while (f && f.parent) { y += f.parent.y; f = find(f.parent.id); } return y; };
      anchors.sort((a, b) => absY(a) - absY(b));
      const list = h('div', 'ed-secs', sd);
      for (const it of anchors) {
        const r = h('div', 'ed-sec-row', list);
        const inp = h('input', '', r); inp.value = it.nav === true ? plainText(it.text) : it.nav;
        inp.oninput = () => { it.nav = inp.value || 'section'; touch(); mountSide(true); };
        inp.onchange = () => commit(true);
        h('small', '', r, (NAMES[it.type] || 'marker').toLowerCase());
        const go = h('button', '', r, '→'); go.type = 'button'; go.title = 'go to it';
        go.onclick = () => { const el = cv.querySelector(`.it[data-id="${it.id}"]`); if (el) el.scrollIntoView({ block: 'center' }); setSel([it.id]); };
        const x = h('button', '', r, '×'); x.type = 'button'; x.title = 'take it out of the side nav';
        x.onclick = () => { if (it.type === 'marker') removeItems([it.id]); else { delete it.nav; commit(); } };
      }
      if (!anchors.length) h('p', 'ed-note', sd, 'No sections yet.');
      actions(sd, [['+ new section here', () => {
        const label = prompt('Section name', 'section'); if (!label) return;
        add({ id: uid(), type: 'marker', x: 0, y: r1(viewY()), w: U, h: 1, nav: label });
        toast('Section added where you are. Drag its pink line up or down to move it. Or select anything on the page and tick “in the side nav”.', 5000);
      }, 'An invisible marker at this spot on the page, with a name in the side nav']]);
    } else h('p', 'ed-note', sd, doc.side === 'off' ? 'No side nav: the page uses the full width.' : 'Lists all your projects, this one highlighted.');

    const gr = keyed(sec('Grid'), 'grid');
    const g = G(), setG = (k, v) => { doc.grid = { ...(doc.grid || {}), [k]: v }; drawGrid(); };
    const presets = { '': 'presets…', '12': '12 columns', '6': '6 columns', '24': '24 columns, fine', '4': '4 columns, editorial', '8': '8 columns', '1': 'no columns' };
    const pre = choose(gr, 'quick', presets, () => '', v => { if (v) doc.grid = { ...(doc.grid || {}), cols: +v }; });
    pre.value = '';
    const g4 = h('div', 'ed-4', gr);
    num(g4, 'columns', () => g.cols, v => setG('cols', Math.max(1, Math.min(48, Math.round(v)))), 1, false);
    num(g4, 'gutter', () => g.gap, v => setG('gap', Math.max(0, v)), 1, false);
    num(g4, 'margins', () => g.margin, v => setG('margin', Math.max(0, v)), 1, false);
    num(g4, 'row height', () => g.row, v => setG('row', Math.max(0, v)), 1, false).title = 'Spacing of the horizontal rows things snap to. 0 = no rows. 14 ≈ one line of text.';
    h('p', 'ed-note', gr, `one column = ${fmt(g.colW)} units · the page is 1000 units wide`);
    check(gr, 'show rows (R)', () => pref.rows, v => pref.rows = v, true);
    actions(gr, [['reset to default', () => { delete doc.grid; commit(); }], ['clear guides', () => { doc.guides = { x: [], y: [] }; commit(); }]]);
    const sn = keyed(sec('Snap to'), 'snapto');
    check(sn, 'columns and page centre', () => pref.sCols, v => pref.sCols = v, true);
    check(sn, 'rows', () => pref.sRows, v => pref.sRows = v, true);
    check(sn, 'edges and middles of other things', () => pref.sEls, v => pref.sEls = v, true);
    check(sn, 'your guides', () => pref.sGuides, v => pref.sGuides = v, true);
    h('p', 'ed-note', sn, 'Hold Alt while dragging to ignore all of it. Drag from the top or left edge of the page to make a guide.');

    const t = keyed(sec('Hover picture (work page + TL;DR)'), 'thumb');
    const pics = []; walk(doc.items, it => { if (it.type === 'image' && it.src) pics.push(it.src); if (it.type === 'slides') (it.slides || []).forEach(s => pics.push(s.src)); });
    const opts = { '': 'none' }; pics.forEach((p, i) => opts[p] = `picture ${i + 1} · ${p.split('/').pop().slice(0, 24)}`);
    if (meta.thumb && !(meta.thumb in opts)) opts[meta.thumb] = meta.thumb.split('/').pop().slice(0, 30);
    choose(t, 'use', opts, () => meta.thumb || '', v => meta.thumb = v);
    if (meta.thumb) { const im = h('img', 'ed-thumb', t); im.src = resolve(meta.thumb); im.onerror = () => onMediaError(im, meta.thumb); }
    actions(t, [['upload a different one', async () => { const [f] = await pickFiles('image/*', false); if (f) { const { src } = await stash(f); meta.thumb = src; commit(); } }]]);
    const how = keyed(sec('How this works', panel, false), 'how');
    h('p', 'ed-note', how).innerHTML = `Click to select. Drag to move: it snaps to columns, rows, guides and other things. Hold <kbd>Alt</kbd> to break the grid.<br><br>
      <b>+ blocks</b> (B) has ready-made layouts, buttons and slideshows, and the components you make yourself.<br><br>
      Everything you do is kept as a draft in this browser. <b>Save</b> writes <code>projects/${slug}.json</code> (and your components) into your site folder; then commit and push to publish.`;
  }

  function multiPanel(its) {
    h('p', 'ed-head', panel, `${its.length} things`);
    const s = keyed(sec('Line them up'), 'align');
    actions(s, [['left', () => align('left')], ['centre', () => align('center')], ['right', () => align('right')]]);
    actions(s, [['top', () => align('top')], ['middle', () => align('middle')], ['bottom', () => align('bottom')]]);
    actions(s, [['space evenly ↔', () => distribute('x')], ['space evenly ↕', () => distribute('y')]]);
    actions(sec('Together'), [['group  ⌘G', group], ['make component  ⌥⌘K', makeComponent], ['snap all to grid', () => { its.forEach(fitGrid); commit(); }], ['duplicate', duplicate], ['delete', () => removeItems([...sel])]]);
  }

  const NAMES = { text: 'Text', image: 'Picture', video: 'Video', embed: 'Embed', box: 'Box', group: 'Group', button: 'Button', slides: 'Slideshow', instance: 'Component', marker: 'Section marker' };
  function itemPanel(it) {
    const c = it.type === 'instance' && comp(it.ref);
    h('p', 'ed-head', panel, (c ? `Component · ${c.name}` : NAMES[it.type]) + (scope.length ? ' · inside' : ''));

    const L = keyed(sec('Position'), 'pos');
    const grid4 = h('div', 'ed-4', L);
    num(grid4, 'x', () => it.x, v => it.x = v);
    num(grid4, 'y', () => it.y, v => it.y = v);
    num(grid4, 'w', () => it.w, v => it.w = v);
    if (it.type !== 'text' && it.type !== 'instance') num(grid4, 'h', () => it.h, v => it.h = v);
    actions(L, [['snap to grid', () => { fitGrid(it); commit(); }, 'Pull onto the nearest columns and rows'], ['front', () => order(true), ']'], ['back', () => order(false), '[']]);
    actions(L, [['more space below', () => moveBelow(it, 56), 'Push everything underneath down'], ['less space below', () => moveBelow(it, -56), 'Pull everything underneath up']]);

    const S = keyed(sec(c ? 'Component' : NAMES[it.type]), 'kind');
    if (it.type === 'text') {
      seg(S, 'weight', { 400: 'regular', 700: 'bold' }, () => it.weight || 400, v => it.weight = +v);
      colourField(S, 'colour', { fg: 'ink', mute: 'grey', faint: 'faint' }, () => it.color || 'fg', v => it.color = v);
      seg(S, 'align', { left: 'left', center: 'centre', right: 'right' }, () => it.align || 'left', v => it.align = v);
      actions(S, [['edit text  ↵', () => startText(elOf(it.id), it)]]);
    }
    if (it.type === 'button') {
      seg(S, 'look', { line: 'outline', fill: 'filled', text: 'just text' }, () => it.look || 'line', v => it.look = v);
      colourField(S, 'colour', { fg: 'ink' }, () => it.color || 'fg', v => { if (v === 'fg') delete it.color; else it.color = v; });
      actions(S, [['edit label  ↵', () => startText(elOf(it.id), it)]]);
    }
    if (it.type === 'image' || it.type === 'video') {
      seg(S, 'fit', { cover: 'fill box', contain: 'whole picture' }, () => it.fit || 'cover', v => it.fit = v);
      if (it.type === 'image') text(S, 'alt text', () => it.alt, v => it.alt = v, 'what is in the picture');
      num(S, 'round corners', () => it.round || 0, v => { if (v > 0) it.round = v; else delete it.round; }, 1);
      actions(S, [
        [it.src ? 'replace' : 'choose file', async () => { const f = await pickFiles('image/*,video/*', false); if (f.length) addFiles(f, null, it); }],
        ['use as hover picture', () => { meta.thumb = it.src; commit(true); toast('This is now the hover picture on the work page'); }],
        ['true proportions', async () => { if (!it.src) return; it.h = r1(it.w / await ratio(resolve(it.src), it.type)); commit(); }],
      ]);
      if (it.src) h('p', 'ed-note', S, it.src.startsWith('blob:') ? 'not saved into the folder yet' : it.src);
    }
    if (it.type === 'slides') slidesPanel(it, S);
    if (it.type === 'embed') {
      text(S, 'link', () => it.src, v => it.src = v, 'youtube / vimeo / any url');
      actions(S, [['16 : 9', () => { it.h = r1(it.w * 9 / 16); commit(); }], ['4 : 3', () => { it.h = r1(it.w * 3 / 4); commit(); }], ['square', () => { it.h = it.w; commit(); }]]);
    }
    if (it.type === 'box') {
      colourField(S, 'look', { line: 'line', fill: 'ink', ghost: 'tint', faint: 'grey' }, () => it.fill || 'line', v => it.fill = v);
      num(S, 'round corners', () => it.round || 0, v => { if (v > 0) it.round = v; else delete it.round; }, 1);
      if (it.text != null) {
        colourField(S, 'text colour', { fg: 'ink', bg: 'page bg' }, () => it.color || 'fg', v => { if (v === 'fg') delete it.color; else it.color = v; });
        seg(S, 'weight', { 400: 'regular', 700: 'bold' }, () => it.weight || 400, v => it.weight = +v);
        actions(S, [['edit text  ↵', () => startText(elOf(it.id), it)], ['remove text', () => { delete it.text; commit(); }]]);
      } else actions(S, [['put text inside', () => { it.text = 'Words inside the box'; commit(); startText(elOf(it.id), it); }]]);
    }
    if (/image|video|slides|box|embed/.test(it.type) && !scope.length) {
      check(S, 'edge to edge (across the whole window, over the side nav)', () => !!it.bleed, v => { if (v) it.bleed = true; else delete it.bleed; });
    }
    if (it.type === 'marker') h('p', 'ed-note', S, 'An invisible spot on the page that the side nav jumps to. Drag its pink line to move it.');
    if (it.type === 'group') actions(S, [['step inside  ↵', () => enter(it)], ['ungroup  ⇧⌘G', ungroup], ['make component', makeComponent]]);
    if (it.type === 'instance') {
      if (c) h('p', 'ed-note', S, `Linked: used ${uses(c.id)}× on this page. Step inside to change every copy at once, or detach this one to change it alone.`);
      actions(S, [['edit component  ↵', () => enter(it)], ['detach', detach], ['natural size', () => { if (c) { it.w = c.w; commit(); } }]]);
      if (c) text(S, 'name', () => c.name, v => c.name = v);
    }
    if (it.type !== 'text' && it.type !== 'group') {
      const K = keyed(sec('Link', panel, !!(it.link && it.link.href) || it.type === 'button'), 'link');
      text(K, 'goes to', () => it.link && it.link.href, v => { it.link = it.link || {}; it.link.href = v.trim(); if (!v.trim() && !it.link.newTab) delete it.link; }, 'https://… or project.html?p=…');
      check(K, 'open in a new tab', () => it.link && it.link.newTab, v => { it.link = it.link || { href: '' }; it.link.newTab = v; });
    }

    // side nav: any object can start a section
    const N = keyed(sec('Side nav', panel, !!it.nav || it.type === 'marker'), 'nav');
    const guess = () => it.type === 'text' ? plainText(it.text).slice(0, 40) : (it.alt || NAMES[it.type] || 'section').toLowerCase();
    check(N, 'in the side nav, as a section', () => !!it.nav, v => { if (v) it.nav = guess() || 'section'; else delete it.nav; });
    if (it.nav) {
      text(N, 'called', () => it.nav === true ? '' : it.nav, v => it.nav = v.trim() || guess());
      if ((doc.side || 'sections') !== 'sections') actions(N, [['make the side nav list sections', () => { doc.side = 'sections'; commit(); }]]);
    }

    if (it.type !== 'marker') animPanel(it);
    actions(panel, [['duplicate  ⌘D', duplicate], ['delete  ⌫', () => removeItems([it.id])]]);
  }

  function slidesPanel(it, S) {
    const list = it.slides = it.slides || [];
    seg(S, 'changes', { click: 'on click', auto: 'by itself' }, () => it.mode || 'click', v => it.mode = v);
    if (it.mode === 'auto') num(S, 'every (s)', () => it.every || 3, v => it.every = v, .5, false);
    seg(S, 'transition', { fade: 'fade', slide: 'slide', cut: 'cut' }, () => it.trans || 'fade', v => it.trans = v);
    seg(S, 'fit', { cover: 'fill box', contain: 'whole picture' }, () => it.fit || 'cover', v => it.fit = v);
    check(S, 'show 1 / 5 counter', () => it.counter !== false, v => it.counter = v);
    const strip = h('div', 'ed-slides', S);
    list.forEach((sl, i) => {
      const t = h('div', 'ed-slide' + (i === (slideAt[it.id] || 0) ? ' on' : ''), strip);
      const im = h('img', '', t); im.src = resolve(sl.src); im.onerror = () => onMediaError(im, sl.src);
      t.title = 'click to show this one while editing';
      t.onclick = () => { slideAt[it.id] = i; render(); };
      const tools = h('span', '', t);
      const mk = (l, fn, title) => { const b = h('button', '', tools, l); b.type = 'button'; b.title = title; b.onclick = ev => { ev.stopPropagation(); fn(); }; };
      if (i > 0) mk('←', () => { list.splice(i - 1, 0, list.splice(i, 1)[0]); slideAt[it.id] = i - 1; commit(); }, 'earlier');
      if (i < list.length - 1) mk('→', () => { list.splice(i + 1, 0, list.splice(i, 1)[0]); slideAt[it.id] = i + 1; commit(); }, 'later');
      mk('×', () => { list.splice(i, 1); slideAt[it.id] = Math.max(0, i - 1); commit(); }, 'remove');
    });
    actions(S, [['+ add pictures', async () => { const f = await pickFiles('image/*'); if (f.length) addFiles(f, null, it); }]]);
    h('p', 'ed-note', S, 'Or drop pictures onto the slideshow. Visitors click the right side for next, left for previous.');
  }

  function animPanel(it) {
    it.anim = it.anim || {};
    const A = it.anim;
    const blocksA = [
      ['enter', 'When it scrolls into view', 'Plays once, the first time it appears.'],
      ['scroll', 'While scrolling', 'Keyframes along the trip up the screen: scroll to a spot, pose it, add a keyframe.'],
      ['hover', 'On hover', 'Changes while the mouse is over it.'],
      ['click', 'On click', 'Each click switches it to the new state and back.'],
    ];
    for (const [k, title, note] of blocksA) {
      const on = !!(A[k] && A[k].on);
      const d = keyed(sec((on ? '● ' : '○ ') + title, panel, on), 'a-' + k + (on ? 1 : 0));
      d.classList.add('ed-anim');
      check(d, 'on', () => on, v => { if (v) A[k] = A[k] && Object.keys(A[k]).length > 1 ? { ...A[k], on: true } : DEFAULTS[k](); else if (A[k]) A[k].on = false; });
      if (!on) { h('p', 'ed-note', d, note); continue; }
      const a = A[k], P = PRESETS[k];
      const opts = { '': 'pick a preset…' }; for (const n in P) opts[n] = n;
      const s = choose(d, 'preset', opts, () => '', v => {
        if (!v) return;
        if (k === 'enter') a.from = { ...P[v] };
        else if (k === 'scroll') { const p = P[v]; a.keys = [{ at: p.start, s: { ...p.from }, ease: 'linear' }, { at: p.end, s: { ...p.to } }]; kf.sel = -1; }
        else a.to = { ...P[v] };
      });
      s.value = '';
      if (k === 'scroll') { scrollPanel(it, d, a); continue; }
      if (k === 'enter') stateFields(d, 'starts as', a, 'from');
      if (k === 'hover' || k === 'click') stateFields(d, 'becomes', a, 'to');
      const g = h('div', 'ed-4', d);
      num(g, 'seconds', () => a.dur ?? .6, v => a.dur = v, .1, false);
      if (k === 'enter') num(g, 'delay', () => a.delay ?? 0, v => a.delay = v, .05, false);
      choose(d, 'easing', EASES, () => a.ease || 'out', v => a.ease = v);
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
      setTimeout(() => FS.download('components.json', JSON.stringify(lib, null, 2)), 800);
      toast(blobs.size ? 'Downloaded. Pictures added in this browser are NOT in those files. Use Chrome to save them.' : 'Downloaded three files: put them in projects/', 6000);
      return;
    }
    try {
      saveB.textContent = 'saving…';
      await persistMedia();
      const latest = (await FS.json('projects/index.json')) || { projects: [] };   // the list may have changed meanwhile
      const i = latest.projects.findIndex(p => p.slug === slug);
      // only the things this page's panel edits; colour and order belong to the work list
      const own = { slug, title: meta.title, year: meta.year, tags: meta.tags, summary: meta.summary, thumb: meta.thumb, hidden: meta.hidden };
      i > -1 ? latest.projects[i] = { ...latest.projects[i], ...own } : latest.projects.push({ ...meta, ...own });
      await FS.write(`projects/${slug}.json`, JSON.stringify(doc, null, 2));
      await FS.write('projects/index.json', JSON.stringify(latest, null, 2));
      // other pages may have added components meanwhile: keep theirs, ours win on conflicts
      const theirs = (await FS.json('projects/components.json')) || { components: [] };
      const mine = new Set(lib.components.map(c => c.id));
      for (const c of theirs.components) if (!mine.has(c.id) && !gone.has(c.id)) lib.components.push(c);
      await FS.write('projects/components.json', JSON.stringify(lib, null, 2));
      index = latest;
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
