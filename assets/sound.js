/* The site's sounds. Everything is made in the browser (no files to load).
   Atul's picks: tick = wood tick, tap = pop, go = chime, light = bulb hum, talk = murmur, kick = boing.
   Usage from other scripts:  Sound.play('talk')   Sound.play('light', true)  (true = lights on)   Sound.play('kick', touchCount)
   Browsers keep a page silent until the visitor first taps something, so the very first tap is quiet. */
(() => {
  if (/[?&](edit|review)\b/.test(location.search)) { window.Sound = { play() {}, muted: true }; return; }
  const VOL = .5;
  let ac = null, out = null, noise = null, muted = false;
  try { muted = localStorage.getItem('sound') === 'off'; } catch (e) {}

  function ctx() {
    if (!ac) {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
      ac = new C(); out = ac.createGain(); out.gain.value = VOL;
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 3;
      out.connect(comp); comp.connect(ac.destination);
      noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  const env = (g, t, peak, a, d) => { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); };
  function tone({ type = 'sine', f = 440, to = null, peak = .3, attack = .003, decay = .1, at = 0, glide = null }) {
    const c = ctx(); if (!c) return; const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + (glide || attack + decay));
    env(g, t, peak, attack, decay); o.connect(g); g.connect(out); o.start(t); o.stop(t + attack + decay + .05);
  }
  function hiss({ kind = 'bandpass', f = 2000, q = 1, peak = .3, attack = .001, decay = .01, at = 0 }) {
    const c = ctx(); if (!c) return; const t = c.currentTime + at, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noise; fl.type = kind; fl.Q.value = q; fl.frequency.value = f;
    env(g, t, peak, attack, decay); s.connect(fl); fl.connect(g); g.connect(out); s.start(t, Math.random() * .5); s.stop(t + attack + decay + .05);
  }
  const semis = (f, n) => f * Math.pow(2, n / 12);

  const SOUNDS = {
    tick: () => { tone({ f: 1250, to: 950, peak: .22, decay: .018 }); hiss({ kind: 'highpass', f: 5000, peak: .12, decay: .002 }); },   // wood tick
    tap: () => { tone({ f: 640, to: 330, peak: .42, decay: .055 }); },                                                                  // pop
    go: () => { tone({ f: 1319, peak: .14, decay: .5 }); tone({ f: 2637, peak: .03, decay: .3 }); },                                    // chime
    light: on => { hiss({ f: 2600, q: 2, peak: .5, decay: .004 });                                                                      // bulb hum
      if (on) tone({ type: 'sawtooth', f: 120, peak: .035, attack: .02, decay: .45 });
      else tone({ type: 'sawtooth', f: 120, to: 60, peak: .03, attack: .005, decay: .18 }); },
    talk: () => { for (let i = 0; i < 4; i++) tone({ type: 'square', f: 600 + Math.random() * 500, peak: .045, decay: .035, at: i * .055 }); },   // murmur
    kick: n => { const f = semis(260, Math.min(n || 0, 24)); tone({ f, to: f * 1.7, peak: .32, decay: .12, glide: .09 }); },            // boing, climbs as you go
  };

  let lastTick = 0;
  function play(key, arg) {
    if (muted) return;
    if (key === 'tick') { const t = performance.now(); if (t - lastTick < 45) return; lastTick = t; }
    try { SOUNDS[key] && SOUNDS[key](arg); } catch (e) {}
  }
  window.Sound = { play, get muted() { return muted; } };

  // ---- hover and press, for anything you can click ----
  const LIVE = 'a[href], button, [role="button"], .wk';
  const isGo = a => { const h = a && a.getAttribute && a.getAttribute('href'); return !!h && /(^|\/)(project|work|index)\.html|^\/$|^\.?\/?$/.test(h.split('#')[0].split('?')[0]) && !/^#/.test(h); };
  let over = null;
  document.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    const el = e.target.closest && e.target.closest(LIVE);
    if (el && el !== over && !el.closest('.sound-btn, #theme, .rv-ui')) play('tick');
    over = el;
  }, true);
  document.addEventListener('pointerdown', () => ctx(), true);   // wake the sound up on the first touch
  document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest(LIVE); if (!el || el.closest('#theme, .rv-ui')) return;
    if (el.classList.contains('sound-btn')) return;
    const a = el.closest('a[href]') || el.querySelector && el.querySelector('a[href]');
    if (isGo(a) && !(e.metaKey || e.ctrlKey || a.target === '_blank')) { play('tap'); try { sessionStorage.setItem('arrive', String(Date.now())); } catch (x) {} }
    else play('tap');
  }, true);
  // the chime plays when the next page has arrived (a page that's leaving would cut it off)
  try {
    const t = +sessionStorage.getItem('arrive'); sessionStorage.removeItem('arrive');
    if (t && Date.now() - t < 4000) addEventListener('load', () => { if (muted) return; ctx(); setTimeout(() => { if (ac && ac.state === 'running') play('go'); }, 80); });
  } catch (e) {}

  // ---- a quiet on/off at the bottom right ----
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'sound-btn'; b.setAttribute('aria-label', 'Sound on or off');
  const label = () => { b.textContent = muted ? 'sound off' : 'sound on'; };
  label();
  b.addEventListener('click', () => {
    muted = !muted; try { localStorage.setItem('sound', muted ? 'off' : 'on'); } catch (e) {}
    label(); if (!muted) { ctx(); SOUNDS.tap(); }
  });
  const css = document.createElement('style');
  css.textContent = `.sound-btn { position: fixed; right: var(--gutter, 24px); bottom: 24px; z-index: 13; font: inherit; font-size: var(--size, 14px); letter-spacing: inherit;
    color: var(--mute, #8c8c8c); background: var(--bg, #fff); border: 0; padding: .35em .5em; border-radius: 4px; cursor: pointer; }
    .sound-btn::before { content: ''; position: absolute; inset: -.5em -.4em; }   /* a bigger place to put a thumb */
    .sound-btn:hover { color: var(--fg, #111); }
    body.past .sound-btn { opacity: 0; pointer-events: none; } @media print { .sound-btn { display: none; } }`;
  // on Atul's laptop the blue "edit" buttons sit in this corner; stay clear of them
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) css.textContent += ' .sound-btn { bottom: 60px; }';
  document.head.appendChild(css);
  const add = () => document.body.appendChild(b);
  document.body ? add() : addEventListener('DOMContentLoaded', add);
})();
