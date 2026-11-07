/* =====================================================================
   Blocks: ready-made pieces for project pages, used by the editor's
   "+ blocks" library and by the starter template.

   Every block is laid out on the page's own grid and starts at y = 0;
   the editor drops it where you are and pushes everything below down.

   The house layout (borrowed from good case studies):
     · labels sit in the left 3 columns, in grey
     · reading text sits in columns 4–10
     · pictures use the full 12 columns, or go edge to edge
   ===================================================================== */
window.Blocks = (() => {
  const U = 1000;
  let n = 0;
  const id = () => 'i' + (++n).toString(36) + Math.random().toString(36).slice(2, 7);

  function kit(g) {
    const c = g.cols;
    const C = k => Math.max(1, Math.min(c, Math.round(k * c / 12)));   // "k of 12 columns", on any grid
    const x = k => g.colX(Math.min(c - 1, Math.round(k * c / 12)));
    const w = k => g.span(C(k));
    const full = g.span(c);
    const read = { x: x(3), w: g.span(Math.max(1, C(10) - C(3))) };   // the reading column
    const T = o => ({ type: 'text', h: 14, ...o });
    const I = o => ({ type: 'image', src: '', fit: 'cover', ...o });
    const rise = (delay = 0) => ({ enter: { on: true, from: { opacity: 0, y: 40 }, dur: .9, delay, ease: 'out' } });
    // n equal columns across the page: left edge and width of column i
    const per = n => Math.max(1, Math.floor(c / n));
    const cx = (i, n) => g.colX(Math.min(c - 1, i * per(n)));
    const cw = n => g.span(per(n));
    const G = (x, y, w, children) => ({ type: 'group', x, y, w, h: Math.max(...children.map(ch => ch.y + 14)), children });
    return { c, C, x, w, full, read, T, I, rise, g, cx, cw, G };
  }

  const LIB = [
    /* ---------------- start ---------------- */
    { cat: 'Start', name: 'Project header', make: k => [
      k.T({ x: k.x(0), y: 0, w: k.w(8), weight: 700, text: 'Project title' }),
      k.T({ x: k.x(0), y: 18, w: k.w(8), color: 'mute', text: 'Client or course · What kind of thing · 2026' }),
      k.T({ x: k.x(0), y: 56, w: k.w(7), text: 'One or two lines on what this is, and why it matters.' }),
      k.I({ x: k.x(0), y: 130, w: k.full, h: Math.round(k.full * .5625), anim: k.rise() }),
    ] },
    { cat: 'Start', name: 'Header on a picture', make: k => [
      k.I({ x: 0, y: 0, w: U, h: 620, anim: { scroll: { on: true, keys: [{ at: 50, s: {}, ease: 'linear' }, { at: -10, s: { y: 80, scale: 1.04 } }] } } }),
      k.T({ x: k.x(0), y: 540, w: k.w(8), weight: 700, color: '#ffffff', text: 'Project title' }),
      k.T({ x: k.x(0), y: 558, w: k.w(8), color: '#ffffff', text: 'Client · What kind of thing · 2026' }),
    ] },
    { cat: 'Start', name: 'Facts', make: k => {
      const cols = [['role', 'What you did'], ['when', '8 weeks, 2026'], ['with', 'Who you worked with'], ['tools', 'Figma, p5.js, a lot of paper']];
      return [{ type: 'box', fill: 'faint', x: k.x(0), y: 0, w: k.full, h: 1 },
        ...cols.map(([a, b], i) => k.G(k.cx(i, 4), 16, k.cw(4), [
          k.T({ x: 0, y: 0, w: k.cw(4), color: 'mute', text: a }),
          k.T({ x: 0, y: 16, w: k.cw(4), text: b }),
        ]))];
    } },

    /* ---------------- story ---------------- */
    { cat: 'Story', name: 'Section', note: 'shows in the side nav', make: k => [
      k.T({ x: k.x(0), y: 0, w: k.w(3), color: 'mute', text: 'intro', nav: 'intro' }),
      k.T({ x: k.read.x, y: 0, w: k.read.w, weight: 700, text: 'The one sentence someone should remember from this part.' }),
      k.T({ x: k.read.x, y: 36, w: k.read.w, text: 'A few lines of story. What was going on, what you noticed, what you decided to do about it. Keep it short: the pictures do the rest.' }),
    ] },
    { cat: 'Story', name: 'Text', make: k => [
      k.T({ x: k.read.x, y: 0, w: k.read.w, text: 'A paragraph of text. Say what happened, why it mattered, and what you did about it.' }),
    ] },
    { cat: 'Story', name: 'Two columns', make: k => [
      k.T({ x: k.x(0), y: 0, w: k.w(6) - 0, text: 'Left column. Good for before and after, or the problem next to the answer.' }),
      k.T({ x: k.x(6), y: 0, w: k.w(6), text: 'Right column. Same length as the left, roughly, so they end together.' }),
    ] },
    { cat: 'Story', name: 'Big line', make: k => [
      k.T({ x: k.x(0), y: 0, w: k.w(10), weight: 700, text: 'One bold sentence that sums the whole thing up.' }),
    ] },
    { cat: 'Story', name: 'Callout', note: 'a coloured box with words in it', make: k => [{
      type: 'box', fill: 'blue', round: 8, x: k.read.x, y: 0, w: k.read.w, h: 104, weight: 700, color: 'bg',
      text: 'The result, in numbers if you can. 33% → 60%, three cities, one very happy client.' }] },
    { cat: 'Story', name: 'Quote', make: k => [
      k.T({ x: k.read.x, y: 0, w: k.read.w, weight: 700, text: '“Something someone said that made it all click.”' }),
      k.T({ x: k.read.x, y: 36, w: k.read.w, color: 'mute', text: '— who said it, and who they are' }),
    ] },
    { cat: 'Story', name: 'Numbers', make: k => [0, 1, 2].map(i => k.G(k.cx(i, 3), 0, k.cw(3), [
      k.T({ x: 0, y: 0, w: k.cw(3), weight: 700, text: ['3', '40+', '12'][i] }),
      k.T({ x: 0, y: 16, w: k.cw(3), color: 'mute', text: ['weeks', 'interviews', 'prototypes'][i] }),
    ])) },
    { cat: 'Story', name: 'Steps', make: k => [0, 1, 2].map(i => k.G(k.cx(i, 3), 0, k.cw(3), [
      k.T({ x: 0, y: 0, w: k.cw(3), color: 'mute', text: `0${i + 1}` }),
      k.T({ x: 0, y: 18, w: k.cw(3), weight: 700, text: ['Look', 'Make', 'Test'][i] }),
      k.T({ x: 0, y: 34, w: k.cw(3), text: ['What you found out first.', 'What you built from it.', 'What changed once people used it.'][i] }),
    ])) },

    /* ---------------- pictures ---------------- */
    { cat: 'Pictures', name: 'Picture', make: k => [k.I({ x: k.x(0), y: 0, w: k.full, h: Math.round(k.full * .5625), anim: k.rise() })] },
    { cat: 'Pictures', name: 'Picture + caption', make: k => {
      const h = Math.round(k.full * .5625);
      return [k.I({ x: k.x(0), y: 0, w: k.full, h, anim: k.rise() }),
        k.T({ x: k.x(0), y: h + 12, w: k.w(5), color: 'mute', text: 'Caption: what you are looking at, and why.' })];
    } },
    { cat: 'Pictures', name: 'Picture + side note', make: k => {
      const w = k.w(8), h = Math.round(w * .66);
      return [k.I({ x: k.x(0), y: 0, w, h, anim: k.rise() }),
        k.T({ x: k.x(9), y: h - 42, w: k.w(3), color: 'mute', text: 'A note that sits beside the picture, along its bottom edge.' })];
    } },
    { cat: 'Pictures', name: 'Text + picture', make: k => {
      const w = k.w(6);
      return [k.T({ x: k.x(0), y: 0, w: k.w(5), text: 'Text on one side, the picture on the other. Good for a step in the process.' }),
        k.I({ x: k.x(6), y: 0, w, h: Math.round(w * .75), anim: k.rise() })];
    } },
    { cat: 'Pictures', name: 'Two up', make: k => {
      const w = k.w(6), h = Math.round(w * 1.25);
      return [k.I({ x: k.x(0), y: 0, w, h, anim: k.rise() }), k.I({ x: k.x(6), y: 0, w, h, anim: k.rise(.12) })];
    } },
    { cat: 'Pictures', name: 'Three up', make: k => {
      const w = k.w(4);
      return [0, 1, 2].map(i => k.I({ x: k.x(i * 4), y: 0, w, h: w, anim: k.rise(i * .1) }));
    } },
    { cat: 'Pictures', name: 'One big, two small', make: k => {
      const bw = k.w(8), sw = k.w(4), h = Math.round(bw * .75), sh = (h - k.g.gap) / 2;
      return [k.I({ x: k.x(0), y: 0, w: bw, h, anim: k.rise() }),
        k.I({ x: k.x(8), y: 0, w: sw, h: sh, anim: k.rise(.1) }),
        k.I({ x: k.x(8), y: sh + k.g.gap, w: sw, h: sh, anim: k.rise(.2) })];
    } },
    { cat: 'Pictures', name: 'Two, then one wide', make: k => {
      const w = k.w(6), h = Math.round(w * .75);
      return [k.I({ x: k.x(0), y: 0, w, h, anim: k.rise() }), k.I({ x: k.x(6), y: 0, w, h, anim: k.rise(.1) }),
        k.I({ x: k.x(0), y: h + k.g.gap, w: k.full, h: Math.round(k.full * .45), anim: k.rise() })];
    } },
    { cat: 'Pictures', name: 'Grid of four', make: k => {
      const w = k.w(6), h = Math.round(w * .66);
      return [0, 1, 2, 3].map(i => k.I({ x: k.x((i % 2) * 6), y: Math.floor(i / 2) * (h + k.g.gap), w, h, anim: k.rise((i % 2) * .1) }));
    } },
    { cat: 'Pictures', name: 'Phone screens', note: 'three screens on a tint', make: k => {
      const sw = Math.max(80, k.w(2)), sh = Math.round(sw * 2.05), gap = k.g.gap * 2, total = sw * 3 + gap * 2;
      const bh = sh + 120, x0 = k.x(0) + (k.full - total) / 2;
      return [{ type: 'box', fill: 'ghost', x: k.x(0), y: 0, w: k.full, h: bh },
        ...[0, 1, 2].map(i => k.I({ x: Math.round(x0 + i * (sw + gap)), y: 60, w: sw, h: sh, round: 10, anim: k.rise(i * .1) }))];
    } },
    { cat: 'Pictures', name: 'Full bleed', note: 'edge to edge, over the side nav', make: k => [k.I({ x: 0, y: 0, w: U, h: 560, bleed: true, anim: { scroll: { on: true, keys: [{ at: 100, s: { scale: 1.12 }, ease: 'linear' }, { at: 30, s: {} }] } } })] },
    { cat: 'Pictures', name: 'Slideshow', make: k => [{ type: 'slides', slides: [], mode: 'click', every: 3, trans: 'fade', counter: true, fit: 'cover', x: k.x(0), y: 0, w: k.full, h: Math.round(k.full * .5625) }] },

    /* ---------------- media ---------------- */
    { cat: 'Media', name: 'Video file', make: k => [{ type: 'video', src: '', fit: 'cover', x: k.x(0), y: 0, w: k.full, h: Math.round(k.full * .5625) }] },
    { cat: 'Media', name: 'YouTube / Vimeo', make: k => [{ type: 'embed', src: '', x: k.x(0), y: 0, w: k.full, h: Math.round(k.full * .5625) }] },
    { cat: 'Media', name: 'Prototype embed', note: 'Figma, ProtoPie, a p5 sketch', make: k => [{ type: 'embed', src: '', x: k.read.x, y: 0, w: k.read.w, h: Math.round(k.read.w * .75) }] },

    /* ---------------- bits ---------------- */
    { cat: 'Bits', name: 'Button', make: k => [{ type: 'button', look: 'line', text: 'See it live', x: k.read.x, y: 0, w: k.w(2), h: 42, link: { href: '', newTab: true }, anim: { hover: { on: true, to: { scale: 1.03 }, dur: .4, ease: 'pop' } } }] },
    { cat: 'Bits', name: 'Divider', make: k => [{ type: 'box', fill: 'faint', x: k.x(0), y: 0, w: k.full, h: 1 }] },
    { cat: 'Bits', name: 'Box', make: k => [{ type: 'box', fill: 'line', x: k.x(0), y: 0, w: k.w(3), h: k.w(3) }] },
  ];

  function withIds(list) {
    const fix = it => { it.id = id(); if (it.children) it.children.forEach(fix); return it; };
    return list.map(fix);
  }
  function make(block, g) { return withIds(block.make(kit(g))); }
  function height(items) { return Math.max(0, ...items.map(i => i.y + (i.h || 14))); }

  // the starter page: a stack of blocks
  function template(g) {
    const pick = name => LIB.find(b => b.name === name);
    const order = [
      ['Project header'], ['Facts'],
      ['Section', 'intro', 'What is this, in one sentence?'],
      ['Section', 'problem', 'What was wrong, or what was missing?'],
      ['Two up'],
      ['Callout'],
      ['Section', 'process', 'How did you go about it?'],
      ['One big, two small'],
      ['Full bleed'],
      ['Section', 'outcome', 'What happened in the end?'],
      ['Picture + caption'],
      ['Section', 'reflection', 'What did you learn, and what would you do next?'],
    ];
    const items = []; let y = 200;
    for (const [name, label, line] of order) {
      const part = make(pick(name), g);
      if (label) { part[0].text = label; part[0].nav = label; part[1].text = line; }
      for (const it of part) it.y += y;
      items.push(...part);
      y += height(part.map(i => ({ ...i, y: i.y - y }))) + (name === 'Facts' ? 112 : 140);
    }
    return { v: 2, side: 'sections', items };
  }

  return { LIB, make, height, template, kit };
})();
