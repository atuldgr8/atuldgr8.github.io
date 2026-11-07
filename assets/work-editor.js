/* =====================================================================
   The work list, editable. Opens on work.html?edit
   Type straight into titles, tags and years; drag rows to reorder;
   hide, open in the editor, or start a new project.
   Saves projects/index.json into your site folder.
   ===================================================================== */
(async () => {
  document.body.classList.add('is-editing');
  const list = document.querySelector('.list');
  const h = (tag, cls, parent, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  };
  let index = (await FS.json('projects/index.json')) || { projects: [] };
  let dirty = false;
  // remember exactly what changed here, so saving never undoes what the page editor saved meanwhile
  const changed = {}, removed = new Set();
  let reordered = false, tldrChanged = false;
  const mark = (p, k) => { (changed[p.slug] = changed[p.slug] || new Set()).add(k); };
  const SWATCHES = ['#000000', '#db0007', '#1f3a93', '#0a7d4f', '#e8a400', '#7b2ff7', '#ff5a1f', '#909090'];

  const bar = h('div', 'ed-bar', document.body);
  const toastEl = h('div', 'ed-toast', document.body);
  let tt;
  const toast = (m, ms = 2800) => { toastEl.textContent = m; toastEl.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => toastEl.classList.remove('on'), ms); };
  const B = (label, title, fn, cls = '') => { const b = h('button', 'ed-b ' + cls, bar, label); b.type = 'button'; b.title = title; b.onclick = fn; return b; };
  B('+ new project', 'Start a new project page from the template', add);
  h('span', 'ed-sep', bar);
  const viewB = h('a', 'ed-b', bar, 'view as visitor'); viewB.href = 'work.html';
  h('span', 'ed-sep', bar);
  const folderB = B('', '', async () => { if (await FS.connect()) { paint(); index = (await FS.json('projects/index.json')) || index; draw(); } });
  const saveB = B('saved', 'Save projects/index.json (⌘S)', save, 'ed-save');
  function paint() {
    folderB.textContent = FS.root ? '▣ ' + FS.root.name : FS.needsClick ? '▢ reconnect ' + FS.name : '▢ connect folder';
    folderB.classList.toggle('on', !!FS.root);
    saveB.classList.toggle('dirty', dirty); saveB.textContent = dirty ? 'save •' : 'saved';
  }
  const touch = () => { dirty = true; paint(); };
  addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } });

  let dragFrom = null;
  function draw() {
    list.textContent = '';
    if (!index.projects.length) h('p', 'empty', list, 'No projects yet. Start one with “+ new project”.');
    index.projects.forEach((p, i) => {
      const r = h('div', 'wk-row' + (p.hidden ? ' hidden' : ''), list);
      const grab = h('span', 'grab', r, '⠿'); grab.title = 'drag to reorder';
      r.draggable = false;
      grab.onpointerdown = () => { r.draggable = true; };
      r.ondragstart = e => { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; };
      r.ondragend = () => { r.draggable = false; list.querySelectorAll('.over').forEach(x => x.classList.remove('over')); };
      r.ondragover = e => { if (dragFrom == null) return; e.preventDefault(); list.querySelectorAll('.over').forEach(x => x.classList.remove('over')); r.classList.add('over'); };
      r.ondrop = e => {
        e.preventDefault();
        if (dragFrom == null || dragFrom === i) return;
        const [m] = index.projects.splice(dragFrom, 1);
        index.projects.splice(i, 0, m); dragFrom = null; reordered = true; touch(); draw();
      };
      const field = (cls, key, ph) => {
        const s = h('span', cls, r, p[key] || '');
        s.contentEditable = 'plaintext-only'; s.dataset.ph = ph; s.spellcheck = false;
        s.oninput = () => { p[key] = s.textContent.trim(); mark(p, key); touch(); };
        s.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); s.blur(); } };
      };
      field('t', 'title', 'title');
      if (p.color) r.style.setProperty('--c', p.color);
      field('k', 'tags', 'tags');
      field('y', 'year', 'year');
      const tools = h('span', 'wk-tools', r);
      // colour: a chip that opens a little palette
      const chip = h('button', 'wk-chip', tools); chip.type = 'button'; chip.title = 'Colour of this name';
      h('i', '', chip).style.background = p.color || 'var(--fg)'; h('span', '', chip, 'colour');
      chip.onclick = ev => { ev.stopPropagation(); palette(chip, p, r); };
      // picture shown when someone hovers the name (and in the TL;DR)
      const pic = h('button', 'wk-picb', tools); pic.type = 'button';
      pic.title = p.thumb ? 'Change the hover picture' : 'Choose the picture that shows when someone hovers this name';
      if (p.thumb) { const im = h('img', '', pic); im.src = p.thumb; im.alt = ''; im.onerror = () => showLocal(im, p.thumb); }
      else h('span', '', pic, '+ picture');
      pic.onclick = () => choosePic(p);
      const ed = h('a', '', tools, 'edit page'); ed.href = `project.html?p=${encodeURIComponent(p.slug)}&edit`;
      const vw = h('button', '', tools, p.hidden ? 'show' : 'hide'); vw.type = 'button';
      vw.title = p.hidden ? 'Hidden from visitors' : 'Visible to visitors';
      vw.onclick = () => { p.hidden = !p.hidden; mark(p, 'hidden'); touch(); draw(); };
      const del = h('button', '', tools, '×'); del.type = 'button'; del.title = 'Remove from the list (the page file stays in your folder)';
      del.onclick = () => { if (confirm(`Take “${p.title}” off the list? Its page file stays in projects/.`)) { index.projects.splice(i, 1); removed.add(p.slug); touch(); draw(); } };
    });
  }

  let pop = null;
  function palette(anchor, p, row) {
    if (pop) pop.remove();
    pop = h('div', 'wk-pop', document.body);
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.min(innerWidth - 230, r.left) + 'px'; pop.style.top = (r.bottom + 6) + 'px';
    const set = c => {
      if (c) p.color = c; else delete p.color;
      mark(p, 'color'); touch();
      c ? row.style.setProperty('--c', c) : row.style.removeProperty('--c');
      anchor.querySelector('i').style.background = c || 'var(--fg)';
    };
    for (const c of SWATCHES) {
      const b = h('button', p.color === c ? 'on' : '', pop); b.type = 'button'; b.style.background = c; b.title = c;
      b.onclick = () => { set(c === '#000000' ? null : c); pop.remove(); pop = null; };
    }
    const any = h('label', 'wk-any', pop); h('span', '', any, 'any:');
    const inp = h('input', '', any); inp.type = 'color'; inp.value = p.color || '#db0007';
    inp.oninput = () => set(inp.value);
    h('p', '', pop, 'Press save when you’re done.');
    setTimeout(() => addEventListener('click', function off(e) { if (pop && !pop.contains(e.target)) { pop.remove(); pop = null; removeEventListener('click', off); } }), 0);
  }

  async function showLocal(img, path) {
    if (!FS.root || /^(https?:|blob:)/.test(path)) return;
    try { img.src = URL.createObjectURL(await FS.read(path)); } catch (e) {}
  }
  function choosePic(p) {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
    i.onchange = async () => {
      const f = i.files[0]; if (!f) return;
      if (!FS.root && FS.supported) { await FS.connect(); paint(); }
      if (!FS.root) return toast('Connect your site folder first, so the picture can be copied into it', 4000);
      const ext = (f.name.match(/\.[^.]+$/) || ['.jpg'])[0].toLowerCase();
      const base = f.name.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'cover';
      let path, n = 0;
      do { path = `projects/media/${p.slug}/${base}${n ? '-' + n : ''}${ext}`; n++; } while (await FS.exists(path));
      await FS.write(path, f);
      p.thumb = path; mark(p, 'thumb'); touch(); draw();
      toast('Picture set. Press save.');
    };
    i.click();
  }

  function tldr() {
    const w = h('div', 'wk-tldr', list);
    h('span', '', w, 'link at the bottom of the work page:');
    const t = h('span', '', w, index.tldr || 'TL;DR');
    t.contentEditable = 'plaintext-only'; t.spellcheck = false;
    t.oninput = () => { index.tldr = t.textContent.trim() || 'TL;DR'; tldrChanged = true; touch(); };
    h('span', '', w, '· opens a slideshow: one picture per project (the hover picture)');
  }

  async function add() {
    const title = prompt('Project name'); if (!title) return;
    let base = title.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 40) || 'project';
    let slug = base, n = 2;
    while (index.projects.some(p => p.slug === slug)) slug = `${base}-${n++}`;
    index.projects.unshift({ slug, title, year: String(new Date().getFullYear()), tags: '', summary: '', thumb: '', hidden: true });
    changed[slug] = new Set(['*']); reordered = true;
    touch(); draw();
    if (!FS.root && FS.supported) { await FS.connect(); paint(); }
    if (FS.root) {
      if (!(await FS.exists(`projects/${slug}.json`))) await FS.write(`projects/${slug}.json`, JSON.stringify(Canvas.template(), null, 2));
      await save();
      toast(`Created projects/${slug}.json (hidden until you press show)`);
    } else toast('Added. Open “edit page” to build it, then save from there.');
  }

  async function save() {
    document.activeElement && document.activeElement.blur();
    if (!FS.root && FS.supported) { await FS.connect(); paint(); }
    if (!FS.root) { FS.download('index.json', JSON.stringify(index, null, 2)); dirty = false; paint(); return toast('Downloaded index.json: put it in projects/'); }
    try {
      // start from what's on disk now, and lay only this page's changes on top
      const disk = (await FS.json('projects/index.json')) || { projects: [] };
      const bySlug = Object.fromEntries(disk.projects.map(p => [p.slug, p]));
      const merged = index.projects.map(p => {
        const d = bySlug[p.slug], ch = changed[p.slug];
        if (!d || (ch && ch.has('*'))) return p;
        const out = { ...d };
        if (ch) for (const k of ch) { if (p[k] === undefined) delete out[k]; else out[k] = p[k]; }
        return out;
      });
      // projects the page editor added meanwhile (and that weren't removed here) go at the end
      for (const d of disk.projects) if (!merged.some(p => p.slug === d.slug) && !removed.has(d.slug)) merged.push(d);
      const out = { ...disk, projects: merged };
      if (tldrChanged || index.tldr) out.tldr = index.tldr || out.tldr;
      await FS.write('projects/index.json', JSON.stringify(out, null, 2));
      index = out; for (const k in changed) delete changed[k]; removed.clear(); reordered = tldrChanged = false;
      dirty = false; paint(); draw(); toast(`Saved into ${FS.root.name}. Commit and push to publish.`);
    } catch (e) { toast('Could not save: ' + e.message, 5000); }
  }

  const draw0 = draw;
  draw = () => { draw0(); tldr(); };
  paint(); draw();
})();
