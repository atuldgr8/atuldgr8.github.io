/* =====================================================================
   FS: lets the editor save straight into your site folder on your laptop
   (Chrome / Edge / Arc). You pick the folder once; the browser remembers it.
   Without it, saving falls back to downloading the JSON files.
   ===================================================================== */
window.FS = (() => {
  const supported = 'showDirectoryPicker' in window;
  let root = null, pending = null;

  const db = () => new Promise((res, rej) => {
    const r = indexedDB.open('atul-editor', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('h');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const idbGet = async k => { const d = await db(); return new Promise(res => { const q = d.transaction('h').objectStore('h').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); };
  const idbSet = async (k, v) => { const d = await db(); return new Promise(res => { const t = d.transaction('h', 'readwrite'); t.objectStore('h').put(v, k); t.oncomplete = res; t.onerror = res; }); };

  // on load: reconnect silently if the browser still allows it
  async function restore() {
    if (!supported) return null;
    try {
      const hnd = await idbGet('root');
      if (!hnd) return null;
      if (await hnd.queryPermission({ mode: 'readwrite' }) === 'granted') root = hnd;
      else pending = hnd;
    } catch (e) {}
    return root;
  }

  // needs a click
  async function connect() {
    if (!supported) return null;
    try {
      if (pending && await pending.requestPermission({ mode: 'readwrite' }) === 'granted') {
        root = pending; pending = null; return root;
      }
      const hnd = await showDirectoryPicker({ id: 'atul-site', mode: 'readwrite' });
      try { await hnd.getFileHandle('index.html'); }
      catch (e) { if (!confirm(`"${hnd.name}" has no index.html in it. Is this really your site folder?`)) return null; }
      root = hnd; pending = null;
      await idbSet('root', hnd);
      return root;
    } catch (e) { return null; }       // picker cancelled
  }

  async function dir(parts, create) {
    let d = root;
    for (const p of parts) if (p) d = await d.getDirectoryHandle(p, { create });
    return d;
  }
  async function write(path, data) {
    const parts = path.split('/'), name = parts.pop();
    const d = await dir(parts, true);
    const fh = await d.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(data); await w.close();
  }
  async function read(path) {
    const parts = path.split('/'), name = parts.pop();
    const d = await dir(parts, false);
    return (await d.getFileHandle(name)).getFile();
  }
  async function exists(path) { try { await read(path); return true; } catch (e) { return false; } }

  // read JSON from the folder when connected (always fresh), else from the server
  async function json(path) {
    if (root) { try { return JSON.parse(await (await read(path)).text()); } catch (e) {} }
    try {
      const r = await fetch(path, { cache: 'no-store' });
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }

  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  return {
    supported, restore, connect, write, read, exists, json, download,
    get root() { return root; },
    get name() { return (root || pending) ? (root || pending).name : null; },
    get needsClick() { return !root && !!pending; },
  };
})();
