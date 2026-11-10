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
  const topChanged = new Set();            // site-wide settings changed here: hover colours, palette, TL;DR pictures
  const setTop = k => { topChanged.add(k); touch(); };
  const TOKENS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'teal'];
  const cssCol = c => !c ? 'var(--fg)' : c[0] === '#' ? c : `var(--${c})`;
  const mark = (p, k) => { (changed[p.slug] = changed[p.slug] || new Set()).add(k); };


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
      const r = h('div', 'wk-row' + (p.hidden ? ' hidden' : '') + (p.fun ? ' is-fun' : '') + (p.soon ? ' is-soon' : ''), list);
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
      if (p.color) r.style.setProperty('--c', cssCol(p.color));
      field('k', 'tags', 'tags');
      field('y', 'year', 'year');
      const tools = h('span', 'wk-tools', r);
      // colour: a chip that opens a little palette
      const chip = h('button', 'wk-chip', tools); chip.type = 'button'; chip.title = 'Colour of this name';
      h('i', '', chip).style.background = cssCol(p.color); h('span', '', chip, p.color && p.color[0] !== '#' ? p.color : 'colour');
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
      const sn = h('button', p.soon ? 'on' : '', tools, p.soon ? 'soon ✓' : 'soon'); sn.type = 'button';
      sn.title = p.soon ? 'Shows as “(coming soon)” and doesn’t open. Press to make it a normal link.' : 'Show the name with “(coming soon)”, not clickable yet';
      sn.onclick = () => { if (p.soon) delete p.soon; else p.soon = true; mark(p, 'soon'); touch(); draw(); };
      const fn = h('button', p.fun ? 'on' : '', tools, p.fun ? 'fun ✓' : 'fun'); fn.type = 'button';
      fn.title = p.fun ? 'In the fun list (behind the asterisk)' : 'Move it to the fun list, behind “work*”';
      fn.onclick = () => { if (p.fun) delete p.fun; else p.fun = true; mark(p, 'fun'); touch(); draw(); };
      const del = h('button', '', tools, '×'); del.type = 'button'; del.title = 'Remove from the list (the page file stays in your folder)';
      del.onclick = () => { if (confirm(`Take “${p.title}” off the list? Its page file stays in projects/.`)) { index.projects.splice(i, 1); removed.add(p.slug); touch(); draw(); } };
    });
  }

  let pop = null;
  function closePop() { if (pop) { pop.remove(); pop = null; } }
  // pick a colour from the palette (they adapt to dark mode), or any colour at all
  function picker(anchor, current, set, { allowNone = true, note = 'Press save when you’re done.' } = {}) {
    closePop();
    pop = h('div', 'wk-pop', document.body);
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.min(innerWidth - 250, r.left) + 'px'; pop.style.top = Math.min(innerHeight - 200, r.bottom + 6) + 'px';
    if (allowNone) {
      const b = h('button', 'wk-none' + (!current ? ' on' : ''), pop); b.type = 'button'; b.title = 'none: stays black / white';
      b.onclick = () => { set(null); closePop(); };
    }
    for (const t of TOKENS) {
      const b = h('button', current === t ? 'on' : '', pop); b.type = 'button'; b.title = t; b.style.background = `var(--${t})`;
      b.onclick = () => { set(t); closePop(); };
    }
    const any = h('label', 'wk-any', pop); h('span', '', any, 'any colour:');
    const inp = h('input', '', any); inp.type = 'color'; inp.value = current && current[0] === '#' ? current : '#d40000';
    inp.oninput = () => set(inp.value);
    h('p', '', pop, 'Palette colours switch to a brighter version in dark mode. “Any colour” stays the same in both. ' + note);
    setTimeout(() => addEventListener('click', function off(e) { if (pop && !pop.contains(e.target)) { closePop(); removeEventListener('click', off); } }), 0);
  }
  function palette(anchor, p, row) {
    picker(anchor, p.color, c => {
      if (c) p.color = c; else delete p.color;
      mark(p, 'color'); touch();
      c ? row.style.setProperty('--c', cssCol(c)) : row.style.removeProperty('--c');
      anchor.querySelector('i').style.background = cssCol(c);
      anchor.querySelector('span').textContent = c && c[0] !== '#' ? c : 'colour';
    });
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
      try {
        do { path = `projects/media/${p.slug}/${base}${n ? '-' + n : ''}${ext}`; n++; } while (await FS.exists(path));
        await FS.write(path, f);
      } catch (err) { console.error(err); return toast(`Couldn't copy into your site folder (${err && (err.name || err.message)}). Click the folder name at the bottom to reconnect, then try again.`, 9000); }
      p.thumb = path; mark(p, 'thumb'); touch(); draw();
      toast('Picture set. Press save.');
    };
    i.click();
  }

  /* ---------- below the list: TL;DR and site colours ---------- */
  function extras() {
    const box = h('div', 'wk-extra', list);

    // the asterisk
    const F = h('section', 'wk-box', box);
    h('h3', '', F, 'Fun (behind the asterisk)');
    const fl = h('p', 'wk-line', F); h('span', '', fl, 'the footnote reads: *');
    const ft = h('span', 'wk-edit', fl, index.funLabel || 'and some not-work');
    ft.contentEditable = 'plaintext-only'; ft.spellcheck = false;
    ft.oninput = () => { index.funLabel = ft.textContent.trim() || 'and some not-work'; setTop('funLabel'); };
    h('p', 'wk-hint', F, 'Press “fun” on a project to move it here. Once there’s at least one, “work” in the top bar becomes “work*”, and the footnote under the list opens them.');

    // TL;DR
    const T = h('section', 'wk-box', box);
    h('h3', '', T, 'TL;DR');
    const lr = h('p', 'wk-line', T); h('span', '', lr, 'the link reads:');
    const t = h('span', 'wk-edit', lr, index.tldr || 'TL;DR');
    t.contentEditable = 'plaintext-only'; t.spellcheck = false;
    t.oninput = () => { index.tldr = t.textContent.trim() || 'TL;DR'; tldrChanged = true; touch(); };
    const slides = index.tldrSlides = index.tldrSlides || [];
    h('p', 'wk-hint', T, slides.length
      ? 'These pictures play in the TL;DR, in this order. Tie one to a project and its name links there.'
      : 'No pictures of its own yet, so the TL;DR shows each project’s hover picture. Add pictures to make it your own set.');
    const grid = h('div', 'wk-slides', T);
    slides.forEach((sl, i) => {
      const c = h('div', 'wk-slide', grid);
      const im = h('img', '', c); im.src = sl.src; im.alt = ''; im.onerror = () => showLocal(im, sl.src);
      const tools = h('div', 'wk-slide-tools', c);
      const mk = (l, title, fn) => { const b = h('button', '', tools, l); b.type = 'button'; b.title = title; b.onclick = fn; };
      if (i > 0) mk('←', 'earlier', () => { slides.splice(i - 1, 0, slides.splice(i, 1)[0]); setTop('tldrSlides'); draw(); });
      if (i < slides.length - 1) mk('→', 'later', () => { slides.splice(i + 1, 0, slides.splice(i, 1)[0]); setTop('tldrSlides'); draw(); });
      mk('×', 'remove', () => { slides.splice(i, 1); setTop('tldrSlides'); draw(); });
      const sel = h('select', '', c);
      h('option', '', sel, 'no project').value = '';
      for (const p of index.projects) { const o = h('option', '', sel, p.title); o.value = p.slug; }
      sel.value = sl.slug || '';
      sel.onchange = () => { if (sel.value) sl.slug = sel.value; else delete sl.slug; setTop('tldrSlides'); };
      const cap = h('input', '', c); cap.type = 'text'; cap.placeholder = 'caption (optional)'; cap.value = sl.caption || '';
      cap.oninput = () => { if (cap.value.trim()) sl.caption = cap.value.trim(); else delete sl.caption; setTop('tldrSlides'); };
    });
    const add = h('button', 'wk-add', T, '+ add pictures (pick one or many)'); add.type = 'button';
    add.onclick = () => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = true;
      i.onchange = async () => {
        const files = [...i.files]; if (!files.length) return;
        if (!FS.root && FS.supported) { await FS.connect(); paint(); }
        if (!FS.root) return toast('Connect your site folder first, so the pictures can be copied into it', 4000);
        try { for (const f of files) slides.push({ src: await copyIn(f, 'tldr') }); }
        catch (err) { console.error(err); return toast(`Couldn't copy into your site folder (${err && (err.name || err.message)}). Click the folder name at the bottom to reconnect, then try again.`, 9000); }
        setTop('tldrSlides'); draw();
        toast(`${files.length} picture${files.length > 1 ? 's' : ''} added. Press save.`);
      };
      i.click();
    };

    // site colours
    const S = h('section', 'wk-box', box);
    h('h3', '', S, 'Site colours');
    h('p', 'wk-hint', S, 'Everything is black and white until someone points at it. Pick what each thing turns. (Project names use the colour on their row above.)');
    const hov = index.hover = index.hover || {};
    const D = (window.SiteColours && SiteColours.DEFAULT) || {};
    const NAMES = { name: 'your name', work: 'work', resume: 'resume', intro: 'links in the intro', doors: 'hidden doors (landing)',
                    notes: 'email + small print', tldr: 'TL;DR link', sections: 'side nav (project pages)', next: '“next” project link', other: 'anything else' };
    const rows = h('div', 'wk-roles', S);
    for (const [k, label] of Object.entries(NAMES)) {
      const r = h('div', 'wk-role', rows);
      const v = hov[k] || D[k];
      const chip = h('button', 'wk-chip', r); chip.type = 'button';
      h('i', '', chip).style.background = v === 'random' ? 'conic-gradient(var(--red),var(--yellow),var(--green),var(--blue),var(--purple),var(--red))' : cssCol(v);
      h('span', '', r, label);
      h('small', '', r, v || '');
      chip.onclick = ev => {
        ev.stopPropagation();
        picker(chip, v, c => { if (c) hov[k] = c; else hov[k] = 'none'; setTop('hover'); draw(); });
        const rnd = h('button', 'wk-random', pop, 'surprise me (a different one each time)'); rnd.type = 'button';
        rnd.onclick = () => { hov[k] = 'random'; setTop('hover'); closePop(); draw(); };
      };
    }
    // the palette itself: light and dark version of each colour
    h('p', 'wk-hint', S, 'The palette: the left swatch is for light mode, the right one for dark mode. Keep dark-mode ones brighter so they read on black.');
    const pal = index.palette = index.palette || {};
    const pg = h('div', 'wk-palette', S);
    const probe = document.createElement('i'); document.body.appendChild(probe);
    const now = (t, mode) => {
      if (pal[t] && pal[t][mode]) return pal[t][mode];
      const root = document.documentElement, prev = root.dataset.theme;
      root.dataset.theme = mode; probe.style.color = `var(--${t})`;
      const m = getComputedStyle(probe).color.match(/\d+/g);
      if (prev) root.dataset.theme = prev; else delete root.dataset.theme;
      return m ? '#' + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('') : '#000000';
    };
    for (const tk of TOKENS) {
      const c = h('label', 'wk-tok', pg);
      for (const mode of ['light', 'dark']) {
        const inp = h('input', mode, c); inp.type = 'color'; inp.value = now(tk, mode); inp.title = `${tk} in ${mode} mode`;
        inp.oninput = () => {
          pal[tk] = { ...(pal[tk] || {}), [mode]: inp.value }; setTop('palette');
          window.SiteColours && SiteColours.apply(index);
        };
      }
      h('span', '', c, tk);
    }
    // motion
    const M = h('section', 'wk-box', box);
    h('h3', '', M, 'Motion');
    h('p', 'wk-hint', M, 'The swell: words grow a little as the mouse comes near and the ones around lean away. On your laptop, the “swell” button in the corner flips it on/off just for you, to compare.');
    const mo = index.motion = index.motion || {};
    for (const [k, label] of [['bar', 'swell on your name, work and resume']]) {
      const l = h('label', 'wk-line', M); const c = h('input', '', l); c.type = 'checkbox';
      c.checked = mo[k] !== false; h('span', '', l, label);
      c.onchange = () => { mo[k] = c.checked; setTop('motion'); };
    }
    const rs = h('button', 'wk-add', S, 'reset palette'); rs.type = 'button';
    rs.onclick = () => { index.palette = {}; setTop('palette'); window.SiteColours && SiteColours.apply(index); draw(); };
    probe.remove();
  }

  async function copyIn(f, folder) {        // copy a picture into projects/media/<folder>/, return its path
    f = await FS.shrink(f);                  // big pictures get shrunk to under ~500 KB first
    const ext = (f.name.match(/\.[^.]+$/) || ['.jpg'])[0].toLowerCase();
    const base = f.name.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'picture';
    let path, n = 0;
    do { path = `projects/media/${folder}/${base}${n ? '-' + n : ''}${ext}`; n++; } while (await FS.exists(path));
    await FS.write(path, f);
    return path;
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
      for (const k of topChanged) out[k] = index[k];
      await FS.write('projects/index.json', JSON.stringify(out, null, 2));
      index = out; for (const k in changed) delete changed[k]; removed.clear(); topChanged.clear(); reordered = tldrChanged = false;
      dirty = false; paint(); draw(); toast(`Saved into ${FS.root.name}. Commit and push to publish.`);
    } catch (e) { toast('Could not save: ' + e.message, 5000); }
  }

  const draw0 = draw;
  draw = () => { draw0(); extras(); };
  if (window.SiteColours) SiteColours.apply(index);
  paint(); draw();
})();
