// Test-only helper: build a Listing with sensible defaults, overriding just the
// fields a given test cares about. Not imported by any runtime module.
import type { Listing } from './types';

let counter = 0;

export function mkListing(p: Partial<Listing> = {}): Listing {
  const id = p.id ?? `id${++counter}`;
  const base: Listing = {
    id,
    rawTitle: 'Test Truck',
    sellerTitle: null,
    price: 10000,
    previousPrice: null,
    currency: 'USD',
    locationText: '',
    photoUrl: null,
    listingUrl: `https://www.facebook.com/marketplace/item/${id}`,
    sponsored: false,
    sold: false,
    pending: false,
    createdAt: null,
    vehicle: { confidence: 'full' },
    detail: null,
    enrichment: 'unfetched',
    deal: null,
    capturedAt: 0,
    searchKey: 's',
  };
  return { ...base, ...p };
}
