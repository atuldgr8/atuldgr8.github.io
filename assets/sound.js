/* The site's sounds. Everything is made in the browser (no files to load).
   Atul's picks: tick = wood tick, tap = pop, (project open/close = silent), light = bulb hum, talk = murmur, kick = boing.
   Usage from other scripts:  Sound.play('talk')   Sound.play('light', true)  (true = lights on)   Sound.play('kick', touchCount)
   Always on (no mute button, on purpose). Browsers keep a page silent until the visitor first taps something, so the very first tap is quiet. */
(() => {
  if (/[?&](edit|review)\b/.test(location.search)) { window.Sound = { play() {}, muted: true }; return; }
  const VOL = .5;
  let ac = null, out = null, noise = null, muted = false;

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
    if (el && el !== over && !el.closest('#theme, .rv-ui')) play('tick');
    over = el;
  }, true);
  document.addEventListener('pointerdown', () => ctx(), true);   // wake the sound up on the first touch
  document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest(LIVE); if (!el || el.closest('#theme, .rv-ui')) return;
    const a = el.closest('a[href]') || (el.querySelector && el.querySelector('a[href]'));
    if (isGo(a)) return;      // opening or leaving a project is silent
    play('tap');
  }, true);
})();
