// The pool-scoping key. Per the agreed design it's the TEXT QUERY only — so
// tightening Facebook's own price/condition/sort filters keeps feeding one pool,
// and only a new search term resets it.

export function deriveSearchKey(href: string): string {
  try {
    const u = new URL(href);
    const q = u.searchParams.get('query');
    return (q ?? '').trim().toLowerCase();
  } catch {
    return '';
  }
}
