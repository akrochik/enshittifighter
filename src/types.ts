// The internal contract. Everything downstream of the adapters depends on THESE
// types, never on Facebook's raw JSON. When FB changes its schema, only the
// adapters change; this file and everything above it stays put.

export type ParseConfidence = 'full' | 'partial' | 'none';
export type FuelType = 'gas' | 'diesel' | 'hybrid' | 'electric' | 'other';
export type Transmission = 'automatic' | 'manual';
export type SellerKind = 'private' | 'dealer';
export type TitleStatus = 'clean' | 'salvage' | 'rebuilt' | 'other';
export type Drivetrain = '4wd' | 'awd' | '2wd' | 'rwd' | 'fwd';

/** Extracted from the free-text title (best-effort, regex + dictionary). */
export interface ParsedVehicle {
  year?: number;
  make?: string; // normalized lowercase; aliases folded (chevy -> chevrolet)
  model?: string; // normalized lowercase, e.g. "silverado 2500hd"
  trim?: string; // e.g. "ltz"
  bodyStyle?: string; // cab style, e.g. "crew cab"
  mileage?: number; // miles, from title text
  drivetrain?: Drivetrain; // best-effort (FB has no structured drivetrain field)
  makeInferred?: boolean; // make derived from model (silverado -> chevrolet)
  modelInferred?: boolean; // model derived from a bare number ("2500 hd" + chevy)
  confidence: ParseConfidence;
}

/**
 * Structured vehicle fields from the detail page (enrichment). Every field is
 * optional: the seller may have left it blank, so absent = "unknown", never a
 * filter-exclude.
 */
export interface VehicleDetail {
  make?: string;
  model?: string;
  trim?: string;
  fuel?: FuelType;
  transmission?: Transmission;
  mileage?: number; // exact odometer value
  exteriorColor?: string;
  interiorColor?: string;
  titleStatus?: TitleStatus;
  seller?: SellerKind;
  numberOfOwners?: number;
  vin?: string;
}

export type EnrichmentStatus = 'unfetched' | 'pending' | 'enriched' | 'failed';

export type DealBucket = 'great' | 'good' | 'fair' | 'high';
export interface DealRating {
  bucket: DealBucket;
  /** $ vs. similar peers in the pool; negative = cheaper than peers. null if too few peers. */
  delta: number | null;
}

/** The listing type the whole app consumes. */
export interface Listing {
  id: string; // FB listing id — dedup key
  rawTitle: string; // marketplace_listing_title (normalized; always present)
  sellerTitle: string | null; // custom_title (seller's original; may be null)
  price: number | null; // numeric amount; null if unparseable
  previousPrice: number | null; // strikethrough / prior price on a drop; null if none
  currency: string; // inferred from the price symbol; default "USD"
  locationText: string; // e.g. "Belmont, NC"
  photoUrl: string | null; // fbcdn URL — treat as ephemeral (signed/expiring)
  listingUrl: string; // https://www.facebook.com/marketplace/item/{id}
  sponsored: boolean; // boosted/ad listing
  sold: boolean; // FB is_sold
  pending: boolean; // FB is_pending
  createdAt: number | null; // ms epoch (from creation_time seconds); null if absent
  vehicle: ParsedVehicle; // from the title parser
  detail: VehicleDetail | null; // from enrichment; null until the detail page is fetched
  enrichment: EnrichmentStatus;
  deal: DealRating | null; // pool-relative; filled after the pool is assembled
  capturedAt: number; // ms epoch at capture
  searchKey: string; // pool-scoping key (the FB search query)
}

/**
 * Result of a feed extraction. Lets the caller tell "the tool broke" (schemaMiss)
 * apart from "this response genuinely had no listings" — the fail-loud requirement.
 */
export interface ExtractResult {
  listings: Listing[];
  /** Non-listing ad units skipped (e.g. MarketplaceFeedAdStory with no product). Transparency, not failure. */
  adUnitsSkipped: number;
  /** True if the response parsed but the expected listing container was missing (shape changed). */
  schemaMiss: boolean;
}
