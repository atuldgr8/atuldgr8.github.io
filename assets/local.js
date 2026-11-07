/* Only on your laptop (localhost): a small "edit" link in the corner.
   Visitors on the real site never see it. */
(() => {
  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
  const q = new URLSearchParams(location.search);
  if (q.has('edit')) return;
  const page = location.pathname.split('/').pop() || 'index.html';
  let href = 'work.html?edit';
  if (page === 'project.html' && q.get('p')) href = `project.html?p=${encodeURIComponent(q.get('p'))}&edit`;
  const a = document.createElement('a');
  a.href = href;
  a.textContent = 'edit';
  a.title = 'Only you see this, because the site is running on your laptop';
  a.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:999;padding:5px 9px;' +
    'font:400 12px/1.2 Inter,system-ui,sans-serif;letter-spacing:0;text-decoration:none;' +
    'background:#0a66ff;color:#fff;border-radius:0';
  document.body.appendChild(a);
})();
