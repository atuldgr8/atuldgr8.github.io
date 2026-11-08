/* =====================================================================
   Home: the landing, the work list and the TL;DR are one long page.
   "work" and "TL;DR" glide the page down to them; the name glides back up.
   The project list is read right away (it's a tiny file), so the page
   never draws without it.
   ===================================================================== */
window.Home = (() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = s => document.querySelector(s);
  const bar = $('.bar'), list = $('.list'), pic = $('.wk-pic');

  /* ---------- gliding ---------- */
  let raf = 0;
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  function glide(y, ms = 950) {
    stop();
    y = Math.max(0, Math.min(y, document.documentElement.scrollHeight - innerHeight));
    if (reduce) return scrollTo(0, y);
    const y0 = scrollY, d = y - y0, t0 = performance.now();
    const ease = t => t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
    const step = now => {
      const t = Math.min(1, (now - t0) / ms);
      scrollTo(0, y0 + d * ease(t));
      raf = t < 1 ? requestAnimationFrame(step) : 0;
    };
    raf = requestAnimationFrame(step);
  }
  addEventListener('wheel', stop, { passive: true });          // the visitor takes over: let them
  addEventListener('touchstart', stop, { passive: true });
  const topOf = el => el.getBoundingClientRect().top + scrollY;
  document.addEventListener('click', e => {
    if (e.target.closest('.star')) { e.preventDefault(); return openFun(true); }
    const a = e.target.closest('a[href="#work"], a[href="#tldr"]');
    if (!a) return;
    e.preventDefault();
    const id = a.getAttribute('href').slice(1);
    glide(topOf(document.getElementById(id)));
    history.replaceState(null, '', '#' + id);
  });

  /* ---------- the bar pins at the top; the light switch bows out ---------- */
  const onScroll = () => {
    const pinned = scrollY > 0 && bar.getBoundingClientRect().top <= parseFloat(getComputedStyle(bar).top) + .5;
    bar.classList.toggle('stuck', pinned);
    document.body.classList.toggle('past', scrollY > innerHeight * .45);
  };
  addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll);

  /* ---------- the list ---------- */
  let index = null;
  try {
    const x = new XMLHttpRequest();
    x.open('GET', 'projects/index.json?' + Date.now(), false);
    x.send();
    if (x.status === 200) index = JSON.parse(x.responseText);
  } catch (e) {}
  window.SITE = index || {};
  const all = (index && index.projects) || [];
  const projects = all.filter(p => !p.hidden && !p.fun);
  const funs = all.filter(p => !p.hidden && p.fun);           // the not-work: behind the asterisk
  const colour = c => !c ? '' : c[0] === '#' ? c : `var(--${c})`;

  function fill(box, arr) {
    for (const p of arr) {
      // not ready yet: the name shows, quietly, with "(coming soon)", and doesn't open
      const a = document.createElement(p.soon ? 'span' : 'a');
      a.className = 'wk' + (p.soon ? ' soon' : '');
      if (!p.soon) a.href = `project.html?p=${encodeURIComponent(p.slug)}`;
      a.dataset.dock = '';
      a.textContent = p.title;
      if (p.soon) { const s = document.createElement('small'); s.textContent = (index && index.soonLabel) || '(coming soon)'; a.appendChild(s); }
      if (p.color) a.style.setProperty('--c', colour(p.color));
      if (p.thumb) {
        const i = document.createElement('img');
        i.src = p.thumb; i.alt = ''; i.decoding = 'async'; i.loading = 'lazy';
        pic.appendChild(i); a._pic = i;
      }
      box.appendChild(a);
    }
    if (window.Dock) Dock(box, { max: .12, reach: 2.2 });
    // the hovered project's picture, beside the list
    const place = () => {
      const r = box.getBoundingClientRect();
      const left = r.right + innerWidth * .06, room = innerWidth - left - innerWidth * .04;
      pic.style.left = left + 'px';
      pic.style.width = Math.min(room, innerWidth * .34) + 'px';
      pic.classList.toggle('none', room < 160);
    };
    box.addEventListener('pointerover', e => {
      const a = e.target.closest('.wk');
      if (a) place();
      for (const i of pic.children) i.classList.toggle('on', !!a && i === a._pic);
    });
    box.addEventListener('pointerleave', () => { for (const i of pic.children) i.classList.remove('on'); });
  }
  if (!projects.length) list.innerHTML = '<p class="empty">Nothing up yet. Soon.</p>';
  fill(list, projects);

  /* ---------- the asterisk ----------
     "work*" in the bar, and a footnote under the list that opens the fun stuff */
  const funBtn = $('.fun-open'), funList = $('.list.fun');
  function openFun(go) {
    if (!funs.length) return;
    funList.hidden = false; funBtn.classList.add('open');
    if (go) glide(topOf(funBtn) - innerHeight * .3);
  }
  if (funs.length) {
    const star = document.createElement('span'); star.className = 'star'; star.textContent = '*';
    star.title = (index && index.funLabel) || 'and some not-work';
    const w = bar.querySelector('.work'); if (w) w.appendChild(star);
    funBtn.textContent = '*' + ((index && index.funLabel) || 'and some not-work');
    funBtn.hidden = false;
    fill(funList, funs);
    funBtn.addEventListener('click', () => { if (funList.hidden) openFun(false); else { funList.hidden = true; funBtn.classList.remove('open'); } });
    if (location.hash === '#fun') addEventListener('load', () => openFun(true));
  }

  /* ---------- TL;DR ----------
     Your own TL;DR pictures if you've added some (work-list editor), otherwise
     each project's hover picture. Click right for the next, left for the last. */
  const sec = $('#tldr'), stage = sec.querySelector('.tl-stage'), cap = sec.querySelector('.tl-cap');
  const open = $('.tldr-open');
  const bySlug = Object.fromEntries(all.map(p => [p.slug, p]));
  let slides = ((index && index.tldrSlides) || []).filter(s => s && s.src);
  if (!slides.length) slides = projects.filter(p => !p.soon).map(p => ({ src: p.thumb, slug: p.slug }));
  if (!slides.length) { sec.hidden = true; }
  else {
    open.textContent = (index && index.tldr) || 'TL;DR';
    open.hidden = false;
    const els = slides.map(s => {
      const d = document.createElement('div'); d.className = 'tl-slide';
      if (s.src) { const i = document.createElement('img'); i.src = s.src; i.alt = s.caption || (bySlug[s.slug] || {}).title || ''; i.loading = 'lazy'; d.appendChild(i); }
      else { const n = document.createElement('div'); n.className = 'noimg'; d.appendChild(n); }
      stage.appendChild(d); return d;
    });
    let at = 0;
    const show = i => {
      at = (i + slides.length) % slides.length;
      els.forEach((e, j) => e.classList.toggle('on', j === at));
      const s = slides[at], p = bySlug[s.slug], t = cap.querySelector('.t');
      t.textContent = p ? p.title : (s.caption || '');
      if (p) { t.href = `project.html?p=${encodeURIComponent(p.slug)}`; t.style.setProperty('--hc', colour(p.color) || 'var(--fg)'); t.dataset.ownHc = '1'; }
      else { t.removeAttribute('href'); }
      cap.querySelector('.sum').textContent = p ? (s.caption || [p.summary, p.year].filter(Boolean).join(' · ')) : '';
      cap.querySelector('.n').textContent = `${at + 1} / ${slides.length}`;
    };
    show(0);
    const side = e => { const r = stage.getBoundingClientRect(); return e.clientX - r.left < r.width / 3 ? -1 : 1; };
    stage.addEventListener('click', e => show(at + side(e)));
    stage.addEventListener('pointermove', e => { stage.style.cursor = side(e) < 0 ? 'w-resize' : 'e-resize'; });
    let inView = false;
    new IntersectionObserver(([en]) => { inView = en.intersectionRatio > .6; }, { threshold: [0, .6, 1] }).observe(sec);
    addEventListener('keydown', e => {
      if (!inView) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); show(at + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(at - 1); }
    });
  }

  onScroll();
  // the name, once you've scrolled: back to the top (and the address loses its #work)
  const home = () => { glide(0); history.replaceState(null, '', location.pathname + location.search); };
  return { glide, home };
})();
