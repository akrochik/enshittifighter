// adapter.ts — the ONE module that knows Facebook's search-feed response shape.
// Raw GraphQL text -> Listing[]. Everything downstream depends on Listing, never
// on the field names below. When FB changes its schema, this file changes and
// nothing else. Field paths live in named spots so a break is a one-place edit.

import { parseVehicleTitle } from './parser';
import type { Listing, ExtractResult } from './types';

// --- Facebook field paths (the only place these strings live) ---
const FB = {
  searchContainer: (doc: any) => doc?.data?.marketplace_search?.feed_units,
  edges: (feedUnits: any) => feedUnits?.edges as any[] | undefined,
  node: (edge: any) => edge?.node,
  organicListing: (node: any) => node?.listing, // MarketplaceFeedListingStoryObject
  sponsoredProduct: (node: any) => node?.product_item, // MarketplaceFeedAdStory (may be null)
  id: (l: any) => l?.id,
  title: (l: any) => l?.marketplace_listing_title,
  sellerTitle: (l: any) => l?.custom_title,
  priceAmount: (l: any) => l?.listing_price?.amount,
  priceFormatted: (l: any) => l?.listing_price?.formatted_amount,
  strikeAmount: (l: any) => l?.strikethrough_price?.amount,
  city: (l: any) => l?.location?.reverse_geocode?.city,
  state: (l: any) => l?.location?.reverse_geocode?.state,
  photo: (l: any) => l?.primary_listing_photo?.image?.uri,
  createdSeconds: (l: any) => l?.if_gk_just_listed_tag_on_search_feed?.creation_time ?? l?.creation_time,
  subtitle: (l: any) => l?.custom_sub_titles_with_rendering_flags?.[0]?.subtitle,
  isSold: (l: any) => l?.is_sold,
  isPending: (l: any) => l?.is_pending,
} as const;

const ITEM_URL = (id: string) => `https://www.facebook.com/marketplace/item/${id}`;

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function inferCurrency(formatted: unknown): string {
  const f = typeof formatted === 'string' ? formatted : '';
  if (f.includes('C$') || f.includes('CA$')) return 'CAD';
  if (f.includes('A$')) return 'AUD';
  if (f.includes('MX$')) return 'MXN';
  if (f.includes('£')) return 'GBP';
  if (f.includes('€')) return 'EUR';
  return 'USD'; // "$" and anything unrecognized default to USD (US Marketplace)
}

/** Parse the mileage subtitle ("385K miles", "177K miles · Dealership"). */
export function parseMilesText(s: unknown): number | undefined {
  if (typeof s !== 'string') return undefined;
  const t = s.toLowerCase();
  let m = t.match(/(\d{1,3})\s?k\s*miles?/);
  if (m?.[1]) return Number(m[1]) * 1000;
  m = t.match(/(\d{1,3},\d{3})\s*miles?/);
  if (m?.[1]) return Number(m[1].replace(/,/g, ''));
  m = t.match(/(\d{4,6})\s*miles?/);
  if (m?.[1]) return Number(m[1]);
  return undefined;
}

/** Split a (possibly chunked @defer) response into parsed JSON objects. */
function parseChunks(raw: string): any[] {
  const out: any[] = [];
  for (const line of raw.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      out.push(JSON.parse(s));
    } catch {
      /* ignore non-JSON lines */
    }
  }
  return out;
}

function mapListing(node: any, sponsored: boolean, searchKey: string): Listing | null {
  const rawId = FB.id(node);
  if (rawId === null || rawId === undefined) return null;
  const id = String(rawId);

  const title = FB.title(node);
  const sellerTitle = FB.sellerTitle(node);
  const rawTitle = (typeof title === 'string' && title) || (typeof sellerTitle === 'string' && sellerTitle) || '';

  const city = FB.city(node);
  const state = FB.state(node);
  const locationText = [city, state].filter((x) => typeof x === 'string' && x).join(', ');

  const createdSec = FB.createdSeconds(node);
  const createdAt = typeof createdSec === 'number' ? createdSec * 1000 : null;

  const vehicle = parseVehicleTitle(rawTitle);
  const subMiles = parseMilesText(FB.subtitle(node)); // subtitle mileage beats title-parsed
  if (subMiles !== undefined) vehicle.mileage = subMiles;

  const photo = FB.photo(node);

  return {
    id,
    rawTitle,
    sellerTitle: typeof sellerTitle === 'string' ? sellerTitle : null,
    price: toNumber(FB.priceAmount(node)),
    previousPrice: toNumber(FB.strikeAmount(node)),
    currency: inferCurrency(FB.priceFormatted(node)),
    locationText,
    photoUrl: typeof photo === 'string' ? photo : null,
    listingUrl: ITEM_URL(id),
    sponsored,
    sold: FB.isSold(node) === true,
    pending: FB.isPending(node) === true,
    createdAt,
    vehicle,
    detail: null,
    enrichment: 'unfetched',
    deal: null,
    capturedAt: Date.now(),
    searchKey,
  };
}

/**
 * Map a raw Marketplace search response to Listings.
 * - `schemaMiss: true` means we parsed a response but the listing container was
 *   missing (shape changed) — a DIFFERENT state from "found the container, 0 edges".
 */
export function extractListings(rawResponseText: string, searchKey: string): ExtractResult {
  const chunks = parseChunks(rawResponseText);

  let feedUnits: any;
  for (const doc of chunks) {
    const fu = FB.searchContainer(doc);
    if (fu && FB.edges(fu)) {
      feedUnits = fu;
      break;
    }
  }
  if (!feedUnits) return { listings: [], adUnitsSkipped: 0, schemaMiss: true };

  const edges = FB.edges(feedUnits) ?? [];
  const listings: Listing[] = [];
  let adUnitsSkipped = 0;

  for (const edge of edges) {
    const node = FB.node(edge);
    if (!node) continue;
    const organic = FB.organicListing(node);
    if (organic) {
      const l = mapListing(organic, false, searchKey);
      if (l) listings.push(l);
      continue;
    }
    const product = FB.sponsoredProduct(node);
    if (product) {
      const l = mapListing(product, true, searchKey);
      if (l) listings.push(l);
      continue;
    }
    adUnitsSkipped++; // ad unit with no underlying listing (e.g. a pure video ad)
  }

  return { listings, adUnitsSkipped, schemaMiss: false };
}
