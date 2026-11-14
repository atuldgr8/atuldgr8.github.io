/* Kick-ups with the figure in the dark.
   Started from the landing: stare at the figure with the bulb's light for a few seconds.
   The #OPENTOWORK ring around its head turns into the ball. It's a two-player game of keepy-uppy:
   the figure kicks it to you, you click (or tap) the ball to send it back, and so on.
   Each of your touches flips the room's colour. Let it drop and, well, you'll have to hire me.
   Loaded only when the game starts. */
window.Kickups = (() => {
  let on = false;

  function start(o = {}) {
    if (on) return; on = true;
    const root = document.documentElement, wasOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    const css = getComputedStyle(root);
    const PAL = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'teal']
      .map(k => css.getPropertyValue('--' + k).trim()).filter(Boolean);
    const BEST = 'kickups-best';
    let best = 0; try { best = +localStorage.getItem(BEST) || 0; } catch (e) {}

    // ---------- the room ----------
    const h = (tag, cls, parent, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; };
    const ov = h('div', 'ku', document.body);
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Kick-ups');
    const fig = h('div', 'ku-fig', ov);
    fig.innerHTML = o.svg || '';
    const ring = fig.querySelector('.ring'), tag = fig.querySelector('.tag');
    const ball = h('div', 'ku-ball', ov); ball.hidden = true;
    const score = h('p', 'ku-score', ov, '');
    const tip = h('p', 'ku-tip', ov, '');
    const x = h('button', 'ku-x', ov, '×'); x.type = 'button'; x.title = 'Stop playing (Esc)'; x.setAttribute('aria-label', 'Stop playing');
    const card = h('div', 'ku-card', ov); card.hidden = true;
    requestAnimationFrame(() => ov.classList.add('in'));

    // a friendly size for the figure: big enough to play with, never towering
    const W = () => innerWidth, H = () => innerHeight;
    const figH = () => Math.max(240, Math.min(H() * .46, 520));
    const floor = () => H() - 10;
    const figBox = () => { const fh = figH(), fw = fh / 3; return { left: W() * .66 - fw / 2, top: floor() - fh, w: fw, h: fh }; };
    const from = o.from;
    if (from) Object.assign(fig.style, { left: from.left + 'px', top: from.top + 'px', height: from.height + 'px' });
    else { const b = figBox(); Object.assign(fig.style, { left: b.left + 'px', top: b.top + 'px', height: b.h + 'px' }); }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const b = figBox();
      fig.classList.add('settle');
      Object.assign(fig.style, { left: b.left + 'px', top: b.top + 'px', height: b.h + 'px' });
    }));

    // ---------- ball physics (pixels and seconds) ----------
    const R = () => Math.max(16, figH() * .058);           // ball radius
    const b = { x: 0, y: 0, vx: 0, vy: 0, spin: 0 };
    let state = 'intro', touches = 0, g = 0, raf = 0, last = 0, colour = -1, slips = false;
    const gravity = () => H() * (2.1 + Math.min(touches, 25) * .045);   // a little faster as it goes

    // send the ball from where it is to land at x = tx, peaking at y = apexY
    function launch(tx, apexY) {
      g = gravity();
      const up = Math.max(40, b.y - apexY);
      b.vy = -Math.sqrt(2 * g * up);
      const fall = floor() - R() - apexY;
      const t = (-b.vy) / g + Math.sqrt(2 * Math.max(fall, 1) / g);
      b.vx = (tx - b.x) / t;
    }
    const rnd = (a, z) => a + Math.random() * (z - a);
    const figCx = () => { const r = fig.getBoundingClientRect(); return r.left + r.width / 2; };
    const kickY = () => floor() - figH() * .2;

    function draw() {
      const r = R();
      ball.style.width = ball.style.height = r * 2 + 'px';
      ball.style.transform = `translate(${b.x - r}px, ${b.y - r}px) rotate(${b.spin}deg)`;
    }
    function figureKick() {
      fig.classList.remove('kick'); void fig.offsetWidth; fig.classList.add('kick');
      if (slips && Math.random() < .07) {         // even I miss sometimes
        state = 'slip'; b.vx = rnd(-60, 60); b.vy = 120; return;
      }
      state = 'you';
      launch(rnd(W() * .1, W() * .46), rnd(H() * .16, H() * .38));
      if (touches === 0) tip.textContent = 'your turn: click the ball before it lands';
    }
    function youKick(px, py) {
      touches++; score.textContent = touches;
      if (touches === 1) tip.textContent = '';
      if (touches >= 8) slips = true;
      // the room changes colour with every touch
      colour = (colour + 1 + Math.floor(Math.random() * (PAL.length - 1))) % PAL.length;
      ov.style.setProperty('--ku-bg', PAL[colour] || '#222'); ov.classList.add('lit');
      state = 'figure';
      launch(figCx() + rnd(-figH() * .05, figH() * .05), rnd(H() * .12, H() * .32));
      b.spin += (px < b.x ? 1 : -1) * 40;
    }
    function step(now) {
      const dt = Math.min(.033, (now - (last || now)) / 1000); last = now;
      if (state === 'figure' || state === 'you' || state === 'slip' || state === 'drop') {
        b.vy += g * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.spin += b.vx * dt * .8;
        if (state === 'figure' && b.vy > 0 && b.y >= kickY()) figureKick();
        else if (b.y >= floor() - R()) {
          b.y = floor() - R();
          if (state === 'you') return end(false);
          if (state === 'slip') return end(true);
          if (state === 'drop') { b.vy = 0; }
        }
        draw();
      }
      raf = requestAnimationFrame(step);
    }

    // ---------- your touches ----------
    function hit(e) {
      if (state !== 'you') return;
      const d = Math.hypot(e.clientX - b.x, e.clientY - b.y);
      if (d < Math.max(R() * 2.4, 44)) youKick(e.clientX, e.clientY);
    }
    ov.addEventListener('pointerdown', e => { if (!e.target.closest('button, a, .ku-card')) hit(e); });

    // ---------- the ring turns into the ball ----------
    setTimeout(() => {
      if (!on) return;
      const fr = fig.getBoundingClientRect(), s = fr.height / 300;
      b.x = fr.left + 50 * s; b.y = fr.top + 40 * s;
      const r0 = 38 * s;
      ball.hidden = false; ball.classList.add('grow');
      ball.style.width = ball.style.height = r0 * 2 + 'px';
      ball.style.transform = `translate(${b.x - r0}px, ${b.y - r0}px)`;
      if (ring) ring.style.opacity = 0; if (tag) tag.style.opacity = 0;
      requestAnimationFrame(() => { draw(); });
      setTimeout(() => {                         // drop it to the foot, then the first kick
        if (!on) return;
        ball.classList.remove('grow');
        state = 'figure'; g = gravity(); b.vx = 0; b.vy = 0;
        last = 0; raf = requestAnimationFrame(step);
      }, 700);
    }, 950);

    // ---------- the end ----------
    function end(won) {
      state = 'over'; cancelAnimationFrame(raf); draw();
      if (touches > best) { best = touches; try { localStorage.setItem(BEST, best); } catch (e) {} }
      card.innerHTML = '';
      h('p', 'ku-big', card, won ? 'i dropped it. you win.' : 'dropped it.');
      h('p', '', card, won ? 'still, you could hire me' : 'guess you’ll have to hire me');
      h('p', 'ku-mute', card, `${touches} touch${touches === 1 ? '' : 'es'} · best ${best}`);
      const row = h('p', 'ku-row', card);
      const again = h('button', '', row, 'again'); again.type = 'button';
      again.onclick = () => { close(); setTimeout(() => start(Object.assign({}, o, { from: null })), 320); };
      const mail = h('a', '', row, 'say hi'); mail.href = o.mail || 'mailto:atul_s@nid.edu';
      const cv = h('a', '', row, 'resume'); cv.href = o.resume || 'resume/Atul-Suresh-Resume.pdf'; cv.target = '_blank'; cv.rel = 'noopener';
      card.hidden = false;
      again.focus({ preventScroll: true });
    }
    function close() {
      if (!on) return; on = false;
      cancelAnimationFrame(raf); removeEventListener('keydown', key); removeEventListener('resize', place);
      ov.classList.remove('in');
      root.style.overflow = wasOverflow;
      setTimeout(() => ov.remove(), 300);
      o.onClose && o.onClose();
    }
    const key = e => { if (e.key === 'Escape') close(); };
    const place = () => { const fb = figBox(); Object.assign(fig.style, { left: fb.left + 'px', top: fb.top + 'px', height: fb.h + 'px' }); };
    addEventListener('keydown', key); addEventListener('resize', place);
    x.onclick = close;
  }

  // styles live here, so nothing loads for visitors who never play
  const st = document.createElement('style');
  st.textContent = `
  .ku { position: fixed; inset: 0; z-index: 400; --ku-bg: #0e0e0e; background: var(--ku-bg); color: #e8e8e8;
        opacity: 0; transition: opacity .3s, background-color .25s steps(2); cursor: crosshair; touch-action: none; user-select: none; }
  .ku.in { opacity: 1; }
  .ku.lit { color: #111; }
  .ku-fig { position: absolute; color: inherit; }
  .ku-fig.settle { transition: left .9s cubic-bezier(.2,.8,.3,1), top .9s cubic-bezier(.2,.8,.3,1), height .9s cubic-bezier(.2,.8,.3,1); }
  .ku-fig svg { height: 100%; width: auto; display: block; overflow: visible; }
  .ku-fig .ring { fill: none; stroke: #4c9a3f; stroke-width: 11; transition: opacity .3s; }
  .ku-fig .tag { font: 700 7.6px Inter, system-ui, sans-serif; letter-spacing: .1em; fill: #fff; transition: opacity .3s; }
  .ku-fig.kick { animation: kuKick .32s cubic-bezier(.2,.8,.3,1); transform-origin: 50% 100%; }
  @keyframes kuKick { 30% { transform: rotate(-5deg) translateY(-2%); } }
  .ku-ball { position: absolute; left: 0; top: 0; border-radius: 50%; box-sizing: border-box; pointer-events: none;
             border: max(3px, .28em) solid #4c9a3f; background: #fff;
             background-image: radial-gradient(circle at 50% 50%, #4c9a3f 0 18%, transparent 19%); }
  .ku-ball.grow { transition: width .6s cubic-bezier(.2,.8,.3,1), height .6s cubic-bezier(.2,.8,.3,1), transform .6s cubic-bezier(.2,.8,.3,1); }
  .ku-score, .ku-tip { position: absolute; left: 50%; transform: translateX(-50%); margin: 0; pointer-events: none;
                       font: 400 max(10px, calc(var(--size, 16px) * .55))/1.6 'Press Start 2P', ui-monospace, monospace; }
  .ku-score { top: 28px; font-size: max(14px, calc(var(--size, 16px) * .9)); }
  .ku-tip { bottom: 28px; opacity: .7; text-align: center; }
  .ku-x { position: absolute; top: 16px; right: 16px; width: 40px; height: 40px; font: 400 26px/1 Inter, system-ui, sans-serif;
          color: inherit; background: none; border: 1px solid currentColor; cursor: pointer; opacity: .7; }
  .ku-x:hover { opacity: 1; }
  .ku-card { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%); text-align: center; padding: 1.4em 1.8em;
             background: #0e0e0e; color: #e8e8e8; font: 400 var(--size, 16px)/1.4 Inter, system-ui, sans-serif; cursor: auto; }
  .ku-card p { margin: .2em 0; }
  .ku-card .ku-big { font-size: 1.4em; }
  .ku-card .ku-mute { color: #8a8a8a; }
  .ku-row { display: flex; gap: 1.2em; justify-content: center; margin-top: .8em !important; }
  .ku-row button, .ku-row a { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline; text-underline-offset: .2em; }
  @media (prefers-reduced-motion: reduce) { .ku, .ku-fig.settle, .ku-ball.grow { transition: none; } .ku-fig.kick { animation: none; } }
  `;
  document.head.appendChild(st);
  return { start, get on() { return on; } };
})();
