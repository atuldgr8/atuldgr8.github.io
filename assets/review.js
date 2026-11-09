/* Review mode for project pages: project.html?p=<slug>&review
   Only loads with "&review" in the address, so visitors never see it.
   Click anything to comment on it, Shift-click to comment on several things at once,
   click empty space for "something's missing here". Comments stay in this browser (localStorage),
   show as numbered pins, and "Download" saves them as a Markdown file. */
(function () {
  'use strict';

  function start({ cv, doc, slug }) {
    const KEY = 'review:' + slug;
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(notes)); } catch (e) {} };
    let notes = load();
    document.documentElement.classList.add('reviewing');

    // ---------- what's what on the page ----------
    const u = () => cv.getBoundingClientRect().width / 1000;
    const topItems = doc.items;
    const starts = topItems.filter(i => i.nav).map(i => ({ y: i.y, name: i.nav })).sort((a, b) => a.y - b.y);
    const sectionAt = y => { let n = doc.intro || 'intro'; for (const s of starts) if (s.y <= y + .5) n = s.name; return n; };
    const findItem = (id, list = topItems, top = null) => {
      for (const it of list) {
        if (it.id === id) return { it, top: top || it };
        if (it.children) { const f = findItem(id, it.children, top || it); if (f) return f; }
      }
      return null;
    };
    const plain = html => { const d = document.createElement('div'); d.innerHTML = html || ''; return d.textContent.replace(/\s+/g, ' ').trim(); };
    const file = s => (s || '').split('/').pop();
    function snippet(it) {
      if (!it) return '';
      if (it.type === 'text' || it.type === 'button' || (it.type === 'box' && it.text)) {
        const t = plain(it.text); return '"' + (t.length > 44 ? t.slice(0, 42).trimEnd() + '…' : t) + '"';
      }
      if (it.type === 'image' || it.type === 'video') return file(it.src) || it.type;
      if (it.type === 'slides') return (it.mode === 'row' ? 'carousel' : 'slideshow') + ' (' + (it.slides || []).length + ': ' + file((it.slides || [])[0] && it.slides[0].src) + '…)';
      if (it.type === 'embed') return 'embed ' + (it.src || '').replace(/^https?:\/\//, '').slice(0, 40);
      if (it.type === 'group') { const t = (it.children || []).find(c => c.type === 'text'); return 'group ' + (t ? snippet(t) : ''); }
      if (it.type === 'box') return 'box';
      return it.type;
    }
    const elOf = id => cv.querySelector(`.it[data-id="${CSS.escape(id)}"]`);

    // ---------- UI ----------
    const h = (tag, cls, parent, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; };
    const ui = h('div', 'rv-ui', document.body);
    const pins = h('div', 'rv-pins', document.body);
    const bar = h('div', 'rv-bar', ui);
    const title = h('span', 'rv-title', bar);
    const listBtn = h('button', '', bar, 'list'); listBtn.type = 'button';
    const dlBtn = h('button', '', bar, 'download'); dlBtn.type = 'button';
    const helpBtn = h('button', '', bar, '?'); helpBtn.type = 'button'; helpBtn.title = 'How this works';
    const list = h('div', 'rv-list', ui); list.hidden = true;
    const help = h('div', 'rv-help', ui);
    help.innerHTML = '<b>Review mode</b><br>Click anything to comment on it.<br><kbd>Shift</kbd>-click to comment on several things together.<br>Click empty space for "something\'s missing here".<br>Click a numbered pin to edit or delete.<br><kbd>Enter</kbd> saves, <kbd>Shift</kbd>+<kbd>Enter</kbd> new line, <kbd>Esc</kbd> cancels.<br>Comments stay in this browser until you delete them.';
    let helpSeen = false; try { helpSeen = !!localStorage.getItem('review:help-seen'); } catch (e) {}
    help.hidden = helpSeen;
    helpBtn.onclick = () => { help.hidden = !help.hidden; try { localStorage.setItem('review:help-seen', '1'); } catch (e) {} };
    help.onclick = () => helpBtn.onclick();

    const hoverBox = h('div', 'rv-hover', document.body); hoverBox.hidden = true;
    const pop = h('div', 'rv-pop', ui); pop.hidden = true;
    const popHead = h('div', 'rv-pop-head', pop);
    const ta = h('textarea', '', pop); ta.rows = 3; ta.placeholder = 'What should change?';
    const popRow = h('div', 'rv-pop-row', pop);
    const del = h('button', 'rv-del', popRow, 'delete'); del.type = 'button';
    h('span', 'rv-grow', popRow);
    const cancel = h('button', '', popRow, 'cancel'); cancel.type = 'button';
    const ok = h('button', 'rv-ok', popRow, 'save'); ok.type = 'button';

    // ---------- selecting ----------
    let picked = [];          // ids being commented on together
    let spot = null;          // {x, y} in page units, for empty space
    let editing = null;       // the note being edited
    const marks = new Map();  // id -> outline element

    function drawMarks() {
      for (const [, m] of marks) m.remove(); marks.clear();
      const ids = editing ? (editing.ids || []) : picked;
      for (const id of ids) {
        const el = elOf(id); if (!el) continue;
        const r = el.getBoundingClientRect(), m = h('div', 'rv-mark', document.body);
        Object.assign(m.style, { left: r.left + scrollX + 'px', top: r.top + scrollY + 'px', width: r.width + 'px', height: r.height + 'px' });
        marks.set(id, m);
      }
    }
    function describe(ids, sp) {
      if (sp) return 'Empty space · ' + sectionAt(sp.y);
      if (ids.length === 1) { const f = findItem(ids[0]); return (f ? snippet(f.it) : ids[0]) + ' · ' + (f ? sectionAt(f.top.y) : ''); }
      return ids.length + ' things selected · Shift-click to add or remove';
    }
    function openPop(x, y) {
      pop.hidden = false;
      popHead.textContent = describe(editing ? editing.ids || [] : picked, editing ? editing.spot : spot);
      del.hidden = !editing;
      ok.textContent = editing ? 'save' : 'add comment';
      const w = Math.min(320, innerWidth - 24);
      pop.style.width = w + 'px';
      pop.style.left = Math.max(12, Math.min(innerWidth - w - 12, x + 12)) + 'px';
      pop.style.top = Math.max(12, Math.min(innerHeight - pop.offsetHeight - 12, y + 12)) + 'px';
      ta.focus();
      drawMarks();
    }
    function closePop() { pop.hidden = true; picked = []; spot = null; editing = null; ta.value = ''; drawMarks(); }

    function commit() {
      const text = ta.value.trim();
      if (!text) { if (editing) return remove(editing); return closePop(); }
      if (editing) editing.note = text;
      else notes.push({ ids: picked.slice(), spot, note: text, at: Date.now() });
      save(); closePop(); redraw();
    }
    function remove(n) { notes = notes.filter(x => x !== n); save(); closePop(); redraw(); }
    ok.onclick = commit; cancel.onclick = closePop; del.onclick = () => editing && remove(editing);
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); closePop(); }
    });

    const ours = t => t.closest('.rv-ui, .rv-pin, .rv-pins');
    const passThrough = t => t.closest('nav.side, .top, .next');   // the page's own navigation still works
    // stop links, slideshows and click-to-enlarge while reviewing; pick things instead
    document.addEventListener('click', e => {
      if (ours(e.target) || passThrough(e.target)) return;
      e.preventDefault(); e.stopPropagation();
      const el = e.target.closest('.cv .it[data-id]');
      if (editing) closePop();
      if (el) {
        const id = el.dataset.id;
        spot = null;
        if (e.shiftKey) picked = picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id];
        else picked = [id];
        if (!picked.length) return closePop();
      } else {
        const r = cv.getBoundingClientRect();
        if (e.clientY < r.top || e.clientY > r.bottom) return closePop();
        picked = [];
        spot = { x: Math.round((e.clientX - r.left) / u()), y: Math.round((e.clientY - r.top) / u()) };
      }
      openPop(e.clientX, e.clientY);
    }, true);
    for (const ev of ['pointerdown', 'mousedown']) document.addEventListener(ev, e => { if (!ours(e.target) && !passThrough(e.target) && e.target.closest('.cv')) e.stopPropagation(); }, true);
    addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) closePop(); });

    // hover outline, so it's clear what a click will pick
    document.addEventListener('pointermove', e => {
      const el = !ours(e.target) && e.target.closest('.cv .it[data-id]');
      if (!el) { hoverBox.hidden = true; return; }
      const r = el.getBoundingClientRect();
      Object.assign(hoverBox.style, { left: r.left + scrollX + 'px', top: r.top + scrollY + 'px', width: r.width + 'px', height: r.height + 'px' });
      hoverBox.hidden = false;
    }, { passive: true });

    // ---------- pins + list ----------
    function ordered() {
      const where = n => {
        if (n.spot) return { sec: sectionAt(n.spot.y), y: n.spot.y, x: n.spot.x };
        const f = findItem(n.ids[0]); const t = f ? f.top : { y: 1e9, x: 0 };
        return { sec: f ? sectionAt(t.y) : '(removed from page)', y: t.y, x: t.x };
      };
      return notes.map(n => ({ n, w: where(n) })).sort((a, b) => a.w.y - b.w.y || a.w.x - b.w.x);
    }
    function redraw() {
      pins.innerHTML = '';
      const o = ordered();
      title.textContent = `Review · ${notes.length} comment${notes.length === 1 ? '' : 's'}`;
      dlBtn.disabled = !notes.length;
      const cr = cv.getBoundingClientRect(), k = u();
      o.forEach(({ n }, i) => {
        const at = n.spot ? [{ x: cr.left + scrollX + n.spot.x * k, y: cr.top + scrollY + n.spot.y * k }]
          : n.ids.map(elOf).filter(Boolean).map(el => { const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY }; });
        for (const { x, y } of at) {          // a comment on several things gets the same number on each
          const p = h('button', 'rv-pin' + (n.spot ? ' rv-spot' : ''), pins, String(i + 1));
          p.type = 'button'; p.title = n.note;
          p.style.left = x + 'px'; p.style.top = y + 'px';
          p.onclick = e => { e.stopPropagation(); picked = []; spot = null; editing = n; ta.value = n.note; openPop(e.clientX, e.clientY); };
        }
      });
      list.innerHTML = '';
      if (!o.length) h('p', 'rv-empty', list, 'No comments yet.');
      let sec = null;
      o.forEach(({ n, w }, i) => {
        if (w.sec !== sec) { sec = w.sec; h('p', 'rv-sec', list, sec); }
        const row = h('button', 'rv-row', list); row.type = 'button';
        h('span', 'rv-n', row, String(i + 1));
        h('span', 'rv-t', row, n.note);
        row.onclick = () => {
          const target = n.spot ? cv.getBoundingClientRect().top + scrollY + n.spot.y * u() : (elOf(n.ids[0]) ? elOf(n.ids[0]).getBoundingClientRect().top + scrollY : null);
          if (target != null) scrollTo({ top: target - innerHeight * .3, behavior: 'smooth' });
        };
      });
    }
    listBtn.onclick = () => { list.hidden = !list.hidden; listBtn.classList.toggle('on', !list.hidden); };

    // ---------- download ----------
    dlBtn.onclick = () => {
      const d = new Date(), date = d.getDate() + ' ' + d.toLocaleString('en-GB', { month: 'short' });
      const out = [`# Comments: ${slug} (${date})`];
      let sec = null;
      ordered().forEach(({ n, w }, i) => {
        if (w.sec !== sec) { sec = w.sec; out.push('', `## ${sec}`); }
        const what = n.spot ? `[empty space @ ${n.spot.x}, ${n.spot.y}]`
          : `[${n.ids.join(', ')}] ` + n.ids.map(id => { const f = findItem(id); return f ? snippet(f.it) : '(gone)'; }).join(' + ');
        out.push(`${i + 1}. ${what} — ${n.note.replace(/\n+/g, ' / ')}`);
      });
      const blob = new Blob([out.join('\n') + '\n'], { type: 'text/markdown' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      const ymd = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
      a.download = `comments-${slug}-${ymd}.md`;
      ui.appendChild(a); a.click(); a.remove();   // inside our own UI, so review mode doesn't swallow the click
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };

    // keep pins where their things are (pictures load, the window resizes, fonts arrive)
    let raf;
    const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { redraw(); drawMarks(); }); };
    addEventListener('resize', later);
    cv.addEventListener('load', later, true);
    document.fonts && document.fonts.ready.then(later);
    setTimeout(later, 1200);
    redraw();
  }

  // the review styles live here so nothing is added to the site for normal visitors
  const css = `
  .reviewing .cv .it, .reviewing .cv .it * { cursor: crosshair !important; }
  .reviewing .cv { cursor: cell; }
  .rv-ui, .rv-pin, .rv-hover, .rv-mark { font: 400 13px/1.35 Inter, system-ui, sans-serif; letter-spacing: -0.01em; }
  .rv-bar { position: fixed; left: 50%; transform: translateX(-50%); bottom: 16px; z-index: 300; display: flex; align-items: center; gap: 2px; padding: 4px;
            background: #111; color: #fff; }
  .rv-bar .rv-title { padding: 0 8px 0 6px; }
  .rv-bar button { font: inherit; color: inherit; background: none; border: 0; padding: 6px 9px; cursor: pointer; }
  .rv-bar button:hover, .rv-bar button.on { background: #333; }
  .rv-bar button:disabled { opacity: .4; cursor: default; }
  .rv-help { position: fixed; left: 50%; transform: translateX(-50%); bottom: 60px; z-index: 300; width: 260px; padding: 12px 14px; background: #111; color: #fff; cursor: pointer; }
  .rv-help kbd { font: inherit; border: 1px solid #555; padding: 0 4px; }
  .rv-list { position: fixed; left: 50%; transform: translateX(-50%); bottom: 60px; z-index: 300; width: 300px; max-height: 60vh; overflow: auto;
             background: #fff; color: #111; border: 1px solid #111; padding: 6px 0; }
  .rv-sec { margin: 8px 12px 2px; color: #888; }
  .rv-row { display: flex; gap: 8px; width: 100%; text-align: left; font: inherit; color: inherit; background: none; border: 0; padding: 5px 12px; cursor: pointer; }
  .rv-row:hover { background: #f2f2f2; }
  .rv-empty { margin: 6px 12px; color: #888; }
  .rv-n { flex: 0 0 auto; min-width: 18px; color: #e5331a; }
  .rv-t { white-space: pre-wrap; }
  .rv-pins { position: absolute; left: 0; top: 0; width: 0; height: 0; z-index: 250; }
  .rv-pin { position: absolute; z-index: 250; transform: translate(-40%, -40%); min-width: 22px; height: 22px; padding: 0 6px; border-radius: 11px;
            border: 0; background: #e5331a; color: #fff; font: 600 12px/22px Inter, system-ui, sans-serif; cursor: pointer;
            box-shadow: 0 1px 3px rgba(0,0,0,.25); }
  .rv-pin.rv-spot { border-radius: 11px 11px 11px 2px; }
  .rv-pin:hover { transform: translate(-40%, -40%) scale(1.12); }
  .rv-hover { position: absolute; z-index: 240; pointer-events: none; outline: 1px dashed #e5331a; outline-offset: 2px; }
  .rv-mark { position: absolute; z-index: 241; pointer-events: none; outline: 2px solid #e5331a; outline-offset: 2px; background: rgba(229,51,26,.06); }
  .rv-pop { position: fixed; z-index: 310; background: #fff; color: #111; border: 1px solid #111; padding: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.15); }
  .rv-pop-head { color: #888; margin-bottom: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rv-pop textarea { display: block; width: 100%; box-sizing: border-box; font: inherit; color: inherit; border: 1px solid #ccc; padding: 6px; resize: vertical; }
  .rv-pop textarea:focus { outline: none; border-color: #111; }
  .rv-pop-row { display: flex; gap: 4px; margin-top: 6px; }
  .rv-grow { flex: 1; }
  .rv-pop button { font: inherit; color: #111; background: none; border: 1px solid #ccc; padding: 5px 10px; cursor: pointer; }
  .rv-pop button:hover { border-color: #111; }
  .rv-pop .rv-ok { background: #111; color: #fff; border-color: #111; }
  .rv-pop .rv-del { color: #e5331a; border-color: transparent; padding-left: 0; }
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  window.Review = { start };
})();
