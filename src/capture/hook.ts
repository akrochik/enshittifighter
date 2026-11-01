// hook.ts — runs in the MAIN world at document_start (before Facebook's bundle),
// so FB ends up calling our wrapped fetch/XHR. PASSIVE: only observes responses
// the user's own browsing causes; never originates a request. Must never throw
// into Facebook's code path — every branch is guarded and returns the original.

import { MS_SOURCE, MS_CAPTURE } from './types';
import type { Captured } from './types';
import { classify } from './classify';

export function installCaptureHook(): void {
  const w = window as unknown as { __MS_HOOK__?: boolean };
  if (w.__MS_HOOK__) return;
  w.__MS_HOOK__ = true;

  const isGql = (u: string): boolean => typeof u === 'string' && u.indexOf('/api/graphql') !== -1;

  const friendlyNameOf = (body: unknown): string => {
    try {
      const params =
        typeof body === 'string'
          ? new URLSearchParams(body)
          : body instanceof URLSearchParams || body instanceof FormData
            ? body
            : null;
      const v = params?.get('fb_api_req_friendly_name');
      return typeof v === 'string' ? v : '';
    } catch {
      return '';
    }
  };
  // Only queries the relay will use cross the postMessage boundary — not the dozens
  // of Messenger/presence/typeahead responses on every page.
  const wanted = (friendlyName: string): boolean => classify(friendlyName) !== 'ignore';

  const post = (payload: Captured): void => {
    try {
      window.postMessage({ source: MS_SOURCE, type: MS_CAPTURE, payload }, window.location.origin);
    } catch {
      /* never disturb the page */
    }
  };

  // --- fetch ---
  const origFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url = '';
    try {
      url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    } catch {
      /* ignore */
    }
    const gql = isGql(url);
    const friendlyName = gql ? friendlyNameOf(init?.body) : '';
    const ret = origFetch(input, init);
    if (!gql || !wanted(friendlyName)) return ret;
    return ret.then((res) => {
      try {
        res
          .clone()
          .text()
          .then((body) => post({ transport: 'fetch', url, friendlyName, status: res.status, body }))
          .catch(() => {});
      } catch {
        /* ignore */
      }
      return res;
    });
  };

  // --- XMLHttpRequest (FB uses this for some GraphQL too) ---
  const XP = XMLHttpRequest.prototype as unknown as {
    open: (...a: unknown[]) => unknown;
    send: (...a: unknown[]) => unknown;
    __msUrl?: string;
  };
  const origOpen = XP.open;
  const origSend = XP.send;
  XP.open = function (this: { __msUrl?: string }, ...args: unknown[]) {
    try {
      const u = args[1];
      this.__msUrl = typeof u === 'string' ? u : u instanceof URL ? u.href : '';
    } catch {
      /* ignore */
    }
    return origOpen.apply(this, args);
  };
  XP.send = function (this: XMLHttpRequest & { __msUrl?: string }, ...args: unknown[]) {
    try {
      const url = this.__msUrl ?? '';
      if (isGql(url)) {
        const body = args[0];
        const friendlyName = friendlyNameOf(body);
        if (wanted(friendlyName)) {
          this.addEventListener('load', function (this: XMLHttpRequest) {
            try {
              post({ transport: 'xhr', url, friendlyName, status: this.status, body: this.responseText ?? '' });
            } catch {
              /* ignore */
            }
          });
        }
      }
    } catch {
      /* ignore */
    }
    return origSend.apply(this, args);
  };
}
