// fetchPdp.ts — the one active request the extension makes. GETs a listing's
// detail page with Accept:text/html (which makes Facebook embed the full vehicle
// record in the page's RelayPrefetchedStreamCache blocks) and extracts it. A
// plain page fetch — no doc_id, no session token, no forged API call.

import { extractVehicleDetailFromHtml } from '../pdpAdapter';
import type { PdpResult } from '../pdpAdapter';

const ITEM_URL = (id: string): string => `https://www.facebook.com/marketplace/item/${encodeURIComponent(id)}/`;

/** Facebook refused or deflected the request (rate limit, login wall, checkpoint). */
export class FetchRefusedError extends Error {
  constructor(readonly status: number, readonly url: string) {
    super(`detail page refused (HTTP ${status}${url ? `, ${url}` : ''})`);
    this.name = 'FetchRefusedError';
  }
}

const BOUNCED = /\/(login|checkpoint|recover)\b/;

export async function fetchVehicleDetail(id: string, timeoutMs = 12000): Promise<PdpResult> {
  // Timeout so a single hung request can't stall the whole (sequential) queue —
  // on abort this throws, the queue catches it, marks this one failed, and moves on.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(ITEM_URL(id), {
      credentials: 'include',
      headers: { Accept: 'text/html,application/xhtml+xml' },
      signal: ctrl.signal,
    });
    // A 429/5xx or a bounce to the login/checkpoint page isn't "this listing has no
    // details" — surface it so the queue can stop instead of hammering on.
    if (!res.ok || (res.redirected && BOUNCED.test(new URL(res.url).pathname))) {
      throw new FetchRefusedError(res.status, res.redirected ? res.url : '');
    }
    const html = await res.text();
    return extractVehicleDetailFromHtml(html, id);
  } finally {
    clearTimeout(timer);
  }
}
