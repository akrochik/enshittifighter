// hook.js — runs in the MAIN world at document_start, BEFORE Facebook's own
// bundle executes. That ordering is the whole point: FB captures its own
// references to fetch/XHR when it loads, so a hook installed after load is
// bypassed. By patching first, FB ends up calling our wrapped versions.
//
// This is PASSIVE: it only observes responses that the user's own browsing
// causes. It never originates a request. It must never throw into Facebook's
// code path, so every branch is wrapped and the original value is always
// returned untouched.
(() => {
  if (window.__MS_HOOK_INSTALLED__) return;
  window.__MS_HOOK_INSTALLED__ = true;

  const GQL = '/api/graphql';
  const isGql = (u) => typeof u === 'string' && u.indexOf(GQL) !== -1;

  // The specific query is identified by fb_api_req_friendly_name in the
  // form-encoded request body (there are many decoy GraphQL calls).
  const friendlyNameOf = (body) => {
    try {
      const s = typeof body === 'string' ? body : '';
      return new URLSearchParams(s).get('fb_api_req_friendly_name') || '';
    } catch (e) { return ''; }
  };

  const relay = (payload) => {
    try { window.postMessage({ __msCapture: true, ...payload }, window.location.origin); }
    catch (e) { /* swallow — never disturb the page */ }
  };

  // --- fetch ---
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    let url = '';
    try { url = typeof input === 'string' ? input : (input && input.url) || ''; } catch (e) {}
    const gql = isGql(url);
    const friendlyName = gql ? friendlyNameOf(init && init.body) : '';
    const ret = origFetch.apply(this, arguments);
    if (!gql) return ret;
    return ret.then((res) => {
      // Clone BEFORE FB reads the body; read the clone to completion. For a
      // chunked/@defer response, .text() resolves with the full concatenated
      // body (all newline-delimited chunks) — exactly what we want to save.
      try {
        res.clone().text()
          .then((body) => relay({ transport: 'fetch', url, friendlyName, status: res.status, body }))
          .catch(() => {});
      } catch (e) {}
      return res; // FB gets the original, untouched
    });
  };

  // --- XMLHttpRequest (FB uses this for some GraphQL too) ---
  const XP = XMLHttpRequest.prototype;
  const origOpen = XP.open;
  const origSend = XP.send;
  XP.open = function (method, url) {
    try { this.__msUrl = url; } catch (e) {}
    return origOpen.apply(this, arguments);
  };
  XP.send = function (body) {
    try {
      if (isGql(this.__msUrl)) {
        const friendlyName = friendlyNameOf(typeof body === 'string' ? body : '');
        const url = this.__msUrl;
        this.addEventListener('load', function () {
          try { relay({ transport: 'xhr', url, friendlyName, status: this.status, body: this.responseText || '' }); }
          catch (e) {}
        });
      }
    } catch (e) {}
    return origSend.apply(this, arguments);
  };

  // eslint-disable-next-line no-console
  try { console.log('[Marketplace Sift] capture hook installed (fetch + XHR, MAIN world)'); } catch (e) {}
})();
