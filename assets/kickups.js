/* Kick-ups with the figure in the dark.
   Started from the landing: stare at the figure with the bulb's light for a few seconds.
   The #OPENTOWORK ring around its head turns into the ball. Two players take turns keeping it up:
   the figure (it has two legs that swing at the hip) and you (click or tap the ball).
   The page stays where it is; every touch of yours repaints the room's background.
   What it says sits on the right, set like the rest of the landing text. Lines are DRAFT.
   Loaded only when someone starts a game. */
window.Kickups = (() => {
  let on = false;

  // the figure, cut into parts so its legs can kick (same shape as the silhouette in the dark)
  const FIGURE = `<svg viewBox="0 0 100 300" aria-hidden="true">
    <defs><path id="ku-arc" d="M12 40 A38 38 0 0 0 88 40"/></defs>
    <g fill="currentColor">
      <path class="leg l" d="M23 150 L50 158 L48 192 L42 300 L25 300 Z"/>
      <path class="leg r" d="M77 150 L50 158 L52 192 L58 300 L75 300 Z"/>
      <ellipse cx="50" cy="32" rx="16" ry="21"/>
      <path d="M36 58 Q50 50 64 58 L79 70 Q86 78 87 100 L91 196 Q91 203 86 202 L81 122 L77 152 L77 172 L23 172 L23 152 L19 122 L14 202 Q9 203 9 196 L13 100 Q14 78 21 70 Z"/>
    </g>
    <circle class="ring" cx="50" cy="40" r="38"/>
    <text class="tag" dominant-baseline="middle"><textPath href="#ku-arc" startOffset="50%" text-anchor="middle">#OPENTOWORK</textPath></text>
  </svg>`;

  // what it says (DRAFT: change freely)
  const SAY = {
    start: `your turn next. ${matchMedia('(pointer: coarse)').matches ? 'tap' : 'click'} the ball before it lands`,
    count: (n, best) => `${n} touch${n === 1 ? '' : 'es'}${best ? ' · best ' + best : ''}`,
    lost: n => n === 0 ? ['not even one?', 'that’s a hire-me in any league.']
                       : [`dropped it after ${n}.`, 'house rules say whoever drops it hires the other one.'],
    won: n => [`ok, i dropped it. ${n} touches, you win.`, 'house rules say i hire you, but i’m a student. so, hire me?'],
  };

  function start(o = {}) {
    if (on) return; on = true;
    const root = document.documentElement, body = document.body;
    const wasOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    root.classList.add('ku-playing');
    const css = getComputedStyle(root);
    const PAL = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'teal']
      .map(k => css.getPropertyValue('--' + k).trim()).filter(Boolean);
    const VARS = ['--bg', '--fg', '--mute', '--faint', '--line'];
    const before = Object.fromEntries(VARS.map(v => [v, root.style.getPropertyValue(v)]));
    const BEST = 'kickups-best';
    let best = 0; try { best = +localStorage.getItem(BEST) || 0; } catch (e) {}

    const h = (tag, cls, parent, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; };
    const ov = h('div', 'ku', body);
    const fig = h('div', 'ku-fig', ov); fig.innerHTML = FIGURE;
    const svg = fig.querySelector('svg'), ring = fig.querySelector('.ring'), tag = fig.querySelector('.tag');
    const ball = h('div', 'ku-ball', ov); ball.hidden = true;
    ball.innerHTML = `<svg viewBox="-50 -50 100 100"><defs><path id="ku-barc" d="M-38 0 A38 38 0 0 0 38 0"/></defs>
      <circle r="38" fill="none" stroke="#4c9a3f" stroke-width="11"/>
      <text dominant-baseline="middle"><textPath href="#ku-barc" startOffset="50%" text-anchor="middle">#OPENTOWORK</textPath></text></svg>`;
    // the words, on the right: right edge on the grid's edge, top level with the intro
    const say = h('div', 'ku-say', body);
    function placeSay() {
      const main = document.querySelector('main'), intro = document.querySelector('.intro');
      const mr = main.getBoundingClientRect(), pr = parseFloat(getComputedStyle(main).paddingRight) || 0;
      const ir = intro && intro.getBoundingClientRect();
      // phones: no room beside the intro, so the words go under it
      const top = !ir ? innerHeight * .4 : innerWidth <= 700 ? ir.bottom + parseFloat(getComputedStyle(root).fontSize) * 1.2 : ir.top;
      say.style.right = Math.max(8, innerWidth - (mr.right - pr)) + 'px';
      say.style.top = Math.max(8, top) + 'px';
    }
    function words(lines, links) {
      say.innerHTML = '';
      lines.forEach((l, i) => h('p', i ? 'ku-quiet' : '', say, l));
      if (links) {
        const p = h('p', 'ku-links', say);
        links.forEach(([label, fn, href], i) => {
          if (i) p.append(' · ');
          const a = h(href ? 'a' : 'button', '', p, label);
          if (href) { a.href = href; if (!href.startsWith('mailto')) { a.target = '_blank'; a.rel = 'noopener'; } }
          else { a.type = 'button'; a.onclick = fn; }
        });
      }
      placeSay();
    }
    // no Esc key on a phone: there, "stop" is something to tap
    const touchy = matchMedia('(pointer: coarse)').matches;
    const playing = n => touchy ? words([SAY.count(n, best)], [['stop', () => close()]]) : words([SAY.count(n, best), 'esc to stop']);
    playing(0);

    // a friendly size for the figure, standing on the floor to the right of the middle
    const W = () => innerWidth, H = () => innerHeight;
    const figH = () => W() <= 700 ? Math.max(180, Math.min(H() * .3, W() * .75)) : Math.max(240, Math.min(H() * .46, 520));
    const floor = () => H() - 10;
    const figBox = () => { const fh = figH(), fw = fh / 3; return { left: W() * .6 - fw / 2, top: floor() - fh, h: fh }; };
    const set = (el, r) => Object.assign(el.style, { left: r.left + 'px', top: r.top + 'px', height: r.h + 'px' });
    set(fig, o.from ? { left: o.from.left, top: o.from.top, h: o.from.height } : figBox());
    requestAnimationFrame(() => requestAnimationFrame(() => { fig.classList.add('settle'); set(fig, figBox()); }));
    requestAnimationFrame(() => ov.classList.add('in'));

    // ---------- ball ----------
    const R = () => Math.max(22, figH() * .085);
    const b = { x: 0, y: 0, vx: 0, vy: 0, spin: 0 };
    let state = 'intro', touches = 0, g = 0, raf = 0, last = 0, colour = -1, slips = false, foot = 'r', bounces = 0, rollFrom = 0;
    const gravity = () => H() * (2.1 + Math.min(touches, 25) * .045);
    function launch(tx, apexY) {
      g = gravity();
      const up = Math.max(40, b.y - apexY);
      b.vy = -Math.sqrt(2 * g * up);
      const fall = floor() - R() - apexY;
      const t = (-b.vy) / g + Math.sqrt(2 * Math.max(fall, 1) / g);
      b.vx = (tx - b.x) / t;
    }
    const rnd = (a, z) => a + Math.random() * (z - a);
    const figR = () => fig.getBoundingClientRect();
    const kickY = () => floor() - figH() * .26;      // about knee height: where a foot meets the ball
    // a squashy, wobbly ball: it stretches along its flight, squashes and jiggles when kicked or when it lands
    let sqT = -1, sqDir = 0;
    const SIZE = r => r * 2 * 50 / 43.5;                 // the frame's ring + stroke fills the box
    function squash(dir) { sqT = performance.now(); sqDir = dir; }
    function draw() {
      const r = R(), S = SIZE(r);
      ball.style.width = ball.style.height = S + 'px';
      const speed = Math.hypot(b.vx, b.vy), a = Math.atan2(b.vy, b.vx) * 180 / Math.PI;
      const k = Math.min(.28, speed / (H() * 9));        // stretch with speed
      let q = 0;
      if (sqT >= 0) { const t = (performance.now() - sqT) / 1000; q = Math.exp(-t * 7) * Math.cos(t * 34) * .38; if (t > .9) sqT = -1; }
      ball.style.transform = `translate(${b.x - S / 2}px, ${b.y - S / 2}px) rotate(${sqDir}deg) scale(${1 + q}, ${1 - q}) rotate(${-sqDir}deg)`
        + ` rotate(${a}deg) scale(${1 + k}, ${1 - k * .8}) rotate(${-a}deg) rotate(${b.spin}deg)`;
    }
    function figureKick() {
      // the foot nearer the ball swings up; alternate when it's straight down the middle
      const fr = figR(), mid = fr.left + fr.width / 2;
      foot = Math.abs(b.x - mid) < fr.width * .08 ? (foot === 'r' ? 'l' : 'r') : (b.x < mid ? 'l' : 'r');
      svg.classList.remove('kick-l', 'kick-r'); void svg.offsetWidth; svg.classList.add('kick-' + foot);
      squash(0); b.spin += (foot === 'l' ? -1 : 1) * 25;
      if (slips && Math.random() < .07) { state = 'slip'; b.vx = rnd(-80, 80); b.vy = 160; return; }
      state = 'you';
      launch(rnd(W() * .1, W() * .44), rnd(H() * .16, H() * .38));
      if (touches === 0) words([SAY.count(0, best), SAY.start], touchy ? [['stop', () => close()]] : undefined);
    }
    function youKick() {
      touches++;
      playing(touches);
      if (touches >= 8) slips = true;
      // the room changes colour with every touch; the words go dark so they stay readable
      colour = (colour + 1 + Math.floor(Math.random() * (PAL.length - 1))) % PAL.length;
      const c = PAL[colour] || '#ddd';
      root.style.setProperty('--bg', c);
      // text takes a deep shade of the same colour (not plain black), the quiet bits a lighter one
      root.style.setProperty('--fg', `color-mix(in oklch, ${c} 28%, black)`);
      root.style.setProperty('--line', `color-mix(in oklch, ${c} 28%, black)`);
      root.style.setProperty('--mute', `color-mix(in oklch, ${c} 55%, black)`);
      root.style.setProperty('--faint', `color-mix(in oklch, ${c} 78%, black)`);
      squash(90);
      state = 'figure';
      const fr = figR();
      launch(fr.left + fr.width / 2 + rnd(-fr.width * .25, fr.width * .25), rnd(H() * .12, H() * .32));
      b.spin += 40;
    }
    function step(now) {
      const dt = Math.min(.033, (now - (last || now)) / 1000); last = now;
      b.vy += g * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.spin += b.vx * dt * .8;
      // the sides of the screen are walls: on a narrow phone the ball would otherwise fly out of reach
      const r = R();
      if ((b.x < r && b.vx < 0) || (b.x > W() - r && b.vx > 0)) { b.vx = -b.vx * .7; b.x = Math.min(W() - r, Math.max(r, b.x)); squash(90); }
      if (state === 'figure' && b.vy > 0 && b.y >= kickY()) figureKick();
      else if (b.y >= floor() - R()) {
        b.y = floor() - R(); draw();
        if (state === 'you' || state === 'slip') { state = state === 'you' ? 'drop' : 'slipdrop'; bounces = 0; }
        if (state === 'drop' || state === 'slipdrop') {
          squash(0);
          if (bounces++ < 3 && Math.abs(b.vy) > 120) { b.vy = -Math.abs(b.vy) * .45; b.vx *= .8; }
          else { const won = state === 'slipdrop'; b.vy = 0; state = 'rolling'; rollFrom = now; return end(won); }
        }
      }
      draw();
      raf = requestAnimationFrame(step);
    }

    // your touches: anywhere near the ball counts; everything else on the page still works
    function hit(e) {
      if (state !== 'you') return;
      if (Math.hypot(e.clientX - b.x, e.clientY - b.y) < Math.max(R() * 2.4, 44)) {
        e.preventDefault(); e.stopPropagation(); youKick(); swallow = performance.now();
      }
    }
    // the click that follows a kick belongs to the ball, not to whatever word happens to be under it
    let swallow = -1;
    function eat(e) { if (performance.now() - swallow < 600) { e.preventDefault(); e.stopPropagation(); swallow = -1; } }
    addEventListener('pointerdown', hit, true);
    addEventListener('click', eat, true);

    // the ring turns into the ball and drops to the feet
    setTimeout(() => {
      if (!on) return;
      const fr = figR(), s = fr.height / 300, r0 = 38 * s;
      b.x = fr.left + 50 * s; b.y = fr.top + 40 * s;
      ball.hidden = false; ball.classList.add('grow');
      ball.style.width = ball.style.height = SIZE(r0) + 'px';
      ball.style.transform = `translate(${b.x - SIZE(r0) / 2}px, ${b.y - SIZE(r0) / 2}px)`;
      ring.style.opacity = 0; tag.style.opacity = 0;
      requestAnimationFrame(draw);
      setTimeout(() => {
        if (!on) return;
        ball.classList.remove('grow');
        state = 'figure'; g = gravity(); b.vx = 0; b.vy = 0;
        last = 0; raf = requestAnimationFrame(step);
      }, 700);
    }, 950);

    function roll(now) {
      const dt = Math.min(.033, (now - (last || now)) / 1000); last = now;
      b.vx *= Math.pow(.35, dt); b.x += b.vx * dt; b.spin += b.vx * dt * 2.2;
      draw();
      if (Math.abs(b.vx) > 4 && state === 'over') raf = requestAnimationFrame(roll);
    }
    function end(won) {
      state = 'over'; cancelAnimationFrame(raf);
      if (Math.abs(b.vx) < 60) b.vx = (b.x < innerWidth / 2 ? -1 : 1) * 160;
      raf = requestAnimationFrame(roll);
      if (touches > best) { best = touches; try { localStorage.setItem(BEST, best); } catch (e) {} }
      const lines = won ? SAY.won(touches) : SAY.lost(touches);
      words([...lines, SAY.count(touches, best)], [
        ['again', () => { close(); setTimeout(() => start(Object.assign({}, o, { from: null })), 320); }],
        ['say hi', null, o.mail || 'mailto:atul_s@nid.edu'],
        ['resume', null, o.resume || 'resume/Atul-Suresh-Resume.pdf'],
        ['done', () => close()],
      ]);
    }
    function close() {
      if (!on) return; on = false;
      cancelAnimationFrame(raf);
      removeEventListener('keydown', key); removeEventListener('resize', place); removeEventListener('pointerdown', hit, true); removeEventListener('click', eat, true);
      ov.classList.remove('in'); say.remove();
      VARS.forEach(v => before[v] ? root.style.setProperty(v, before[v]) : root.style.removeProperty(v));
      root.style.overflow = wasOverflow;
      root.classList.remove('ku-playing');
      setTimeout(() => ov.remove(), 300);
      o.onClose && o.onClose();
    }
    const key = e => { if (e.key === 'Escape') close(); };
    const place = () => { set(fig, figBox()); placeSay(); };
    addEventListener('keydown', key); addEventListener('resize', place);
  }

  // styles live here, so nothing loads for visitors who never play
  const st = document.createElement('style');
  st.textContent = `
  .ku-playing #thing, .ku-playing #glow, .ku-playing .psst { visibility: hidden; }
  .ku { position: fixed; inset: 0; z-index: 30; pointer-events: none; opacity: 0; transition: opacity .3s; }
  .ku.in { opacity: 1; }
  .ku-fig { position: absolute; color: var(--fg); }
  .ku-fig.settle { transition: left .9s cubic-bezier(.2,.8,.3,1), top .9s cubic-bezier(.2,.8,.3,1), height .9s cubic-bezier(.2,.8,.3,1); }
  .ku-fig svg { height: 100%; width: auto; display: block; overflow: visible; }
  .ku-fig .ring { fill: none; stroke: #4c9a3f; stroke-width: 11; transition: opacity .3s; }
  .ku-fig .tag { font: 700 7.6px Inter, system-ui, sans-serif; letter-spacing: .1em; fill: #fff; transition: opacity .3s; }
  /* legs swing from the hip; the body dips a little with each kick */
  .ku-fig .leg { transform-box: view-box; }
  .ku-fig .leg.l { transform-origin: 36px 160px; }
  .ku-fig .leg.r { transform-origin: 64px 160px; }
  .ku-fig svg.kick-l .leg.l { animation: kuL .34s cubic-bezier(.2,.8,.3,1); }
  .ku-fig svg.kick-r .leg.r { animation: kuR .34s cubic-bezier(.2,.8,.3,1); }
  @keyframes kuL { 35% { transform: rotate(-34deg) scaleY(.84); } }
  @keyframes kuR { 35% { transform: rotate(34deg) scaleY(.84); } }
  .ku-fig svg.kick-l, .ku-fig svg.kick-r { animation: kuDip .34s ease-out; }
  @keyframes kuDip { 35% { transform: translateY(1.5%); } }
  .ku-ball { position: absolute; left: 0; top: 0; will-change: transform; }
  .ku-ball svg { width: 100%; height: 100%; display: block; overflow: visible; }
  .ku-ball text { font: 700 7.6px Inter, system-ui, sans-serif; letter-spacing: .1em; fill: #fff; }
  .ku-ball.grow { transition: width .6s cubic-bezier(.2,.8,.3,1), height .6s cubic-bezier(.2,.8,.3,1), transform .6s cubic-bezier(.2,.8,.3,1); }
  /* the words: the landing's own type, right-aligned on the right */
  .ku-say { position: fixed; z-index: 31; text-align: right; max-width: 34ch; color: var(--fg);
            font-size: var(--size); line-height: var(--lh-land, 1.32); letter-spacing: var(--ls-read, -.025em); }
  .ku-say p { margin: 0; }
  .ku-say .ku-quiet { color: var(--mute); }
  .ku-say .ku-links { margin-top: calc(var(--step, 1em) / 2); }
  .ku-say button, .ku-say a { font: inherit; letter-spacing: inherit; color: var(--fg); background: none; border: 0; padding: 0;
                              cursor: pointer; text-decoration: none; }
  .ku-say button:hover, .ku-say a:hover { text-decoration: underline; text-underline-offset: .2em; }
  @media (prefers-reduced-motion: reduce) { .ku, .ku-fig.settle, .ku-ball.grow { transition: none; } .ku-fig svg, .ku-fig .leg { animation: none !important; } }
  `;
  document.head.appendChild(st);
  return { start, get on() { return on; } };
})();
