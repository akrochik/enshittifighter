// relay.js — runs in the ISOLATED world. Receives captured responses from the
// MAIN-world hook via postMessage, dedupes/accumulates them, and renders an
// independent floating panel (our own element — it never touches Facebook's
// DOM) with a Download button that writes a fixtures bundle to disk.
(() => {
  const captures = [];
  const seen = new Set();

  // ---- receive captures from the MAIN-world hook ----
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;                 // only our own page
    if (e.origin !== window.location.origin) return; // ignore cross-origin
    const d = e.data;
    if (!d || d.__msCapture !== true) return;

    const len = d.body ? d.body.length : 0;
    const head = d.body ? d.body.slice(0, 80) : '';
    const key = (d.friendlyName || '') + '|' + len + '|' + head;
    if (seen.has(key)) return; // FB refires identical queries; keep one
    seen.add(key);

    captures.push({
      transport: d.transport,
      url: d.url,
      friendlyName: d.friendlyName || '(unnamed)',
      status: d.status,
      len,
      body: d.body,
      at: Date.now(),
    });
    render();
  });

  // A capture is "interesting" (likely the search-results payload) if its
  // friendly name mentions search, or it's simply large. Used only to
  // highlight rows so the user can confirm they grabbed the right one.
  const looksLikeResults = (c) =>
    /search|serp|marketplacesearch/i.test(c.friendlyName) || c.len > 15000;

  const kb = (n) => (n / 1024).toFixed(n > 1024 ? 0 : 1) + ' KB';

  // ---- download a single JSON bundle of everything captured ----
  const download = () => {
    if (!captures.length) return;
    const bundle = {
      tool: 'marketplace-sift-recon-capture',
      capturedAtISO: new Date().toISOString(),
      page: window.location.href,
      count: captures.length,
      captures,
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'marketplace-fixtures.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };

  const clearAll = () => { captures.length = 0; seen.clear(); render(); };

  // ---- panel (independent element; bottom-left, clear of FB's chat) ----
  let root;
  const ensurePanel = () => {
    if (root) return;
    root = document.createElement('div');
    root.id = 'ms-recon-panel';
    Object.assign(root.style, {
      position: 'fixed', left: '12px', bottom: '12px', zIndex: '2147483647',
      width: '320px', maxHeight: '50vh', display: 'flex', flexDirection: 'column',
      background: '#0b1728', color: '#e7eef7', font: '12px/1.4 system-ui, sans-serif',
      border: '1px solid #2a3f5f', borderRadius: '10px', boxShadow: '0 6px 24px rgba(0,0,0,.4)',
      overflow: 'hidden',
    });
    document.documentElement.appendChild(root);
  };

  const render = () => {
    ensurePanel();
    const rows = captures.map((c, i) => {
      const hit = looksLikeResults(c);
      return `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 6px;border-radius:6px;${hit ? 'background:#12325a;' : ''}">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${hit ? 'font-weight:600;' : ''}" title="${c.friendlyName}">${hit ? '★ ' : ''}${c.friendlyName}</span>
        <span style="opacity:.7;white-space:nowrap;">${c.transport} · ${kb(c.len)}</span>
      </div>`;
    }).join('');

    root.innerHTML = `
      <div style="padding:8px 10px;background:#12233d;font-weight:600;display:flex;justify-content:space-between;align-items:center;">
        <span>Marketplace Sift · Recon</span>
        <span style="opacity:.7;font-weight:400;">${captures.length} captured</span>
      </div>
      <div style="padding:6px 8px;overflow:auto;flex:1;">
        ${captures.length ? rows : '<div style="opacity:.6;padding:8px;">Do a vehicle search and scroll once. ★ = likely the results payload.</div>'}
      </div>
      <div style="display:flex;gap:6px;padding:8px;border-top:1px solid #2a3f5f;">
        <button id="ms-dl" style="flex:1;padding:6px;border:0;border-radius:6px;background:#2d7ef7;color:#fff;cursor:pointer;font-weight:600;">Download fixtures</button>
        <button id="ms-clr" style="padding:6px 10px;border:1px solid #2a3f5f;border-radius:6px;background:transparent;color:#e7eef7;cursor:pointer;">Clear</button>
      </div>`;

    root.querySelector('#ms-dl').onclick = download;
    root.querySelector('#ms-clr').onclick = clearAll;
  };

  // Panel appears once the DOM is ready.
  if (document.documentElement) render();
  else document.addEventListener('DOMContentLoaded', render);
})();
