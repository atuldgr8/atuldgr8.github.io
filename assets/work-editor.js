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
        index.projects.splice(i, 0, m); dragFrom = null; touch(); draw();
      };
      const field = (cls, key, ph) => {
        const s = h('span', cls, r, p[key] || '');
        s.contentEditable = 'plaintext-only'; s.dataset.ph = ph; s.spellcheck = false;
        s.oninput = () => { p[key] = s.textContent.trim(); touch(); };
        s.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); s.blur(); } };
      };
      field('t', 'title', 'title');
      field('k', 'tags', 'tags');
      field('y', 'year', 'year');
      const tools = h('span', 'wk-tools', r);
      const ed = h('a', '', tools, 'edit page'); ed.href = `project.html?p=${encodeURIComponent(p.slug)}&edit`;
      const vw = h('button', '', tools, p.hidden ? 'show' : 'hide'); vw.type = 'button';
      vw.title = p.hidden ? 'Hidden from visitors' : 'Visible to visitors';
      vw.onclick = () => { p.hidden = !p.hidden; touch(); draw(); };
      const del = h('button', '', tools, '×'); del.type = 'button'; del.title = 'Remove from the list (the page file stays in your folder)';
      del.onclick = () => { if (confirm(`Take “${p.title}” off the list? Its page file stays in projects/.`)) { index.projects.splice(i, 1); touch(); draw(); } };
    });
  }

  async function add() {
    const title = prompt('Project name'); if (!title) return;
    let base = title.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 40) || 'project';
    let slug = base, n = 2;
    while (index.projects.some(p => p.slug === slug)) slug = `${base}-${n++}`;
    index.projects.unshift({ slug, title, year: String(new Date().getFullYear()), tags: '', summary: '', thumb: '', hidden: true });
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
      await FS.write('projects/index.json', JSON.stringify(index, null, 2));
      dirty = false; paint(); toast(`Saved into ${FS.root.name}. Commit and push to publish.`);
    } catch (e) { toast('Could not save: ' + e.message, 5000); }
  }

  paint(); draw();
})();
