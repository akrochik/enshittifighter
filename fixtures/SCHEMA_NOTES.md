# SCHEMA_NOTES — Facebook Marketplace GraphQL (Phase 0)

Captured 2026-07-03 from a real logged-in session via the `recon-capture` extension
(document_start MAIN-world fetch+XHR hook). Search: `silverado 2500` / `ford f150`,
location Raleigh NC. These notes drive the `adapter`; treat the `/fixtures/*.json`
files as the regression baseline. **When FB's schema changes, re-capture and diff.**

> Privacy: the fixtures are real response bodies from the user's session (listing
> data, approximate location, possibly a viewer id). Keep them in a **private** repo.

---

## 0. Transport & endpoint (recon findings)

- All GraphQL is `POST https://www.facebook.com/api/graphql/`.
- In this capture **every** marketplace query — including the results — arrived via
  **`XMLHttpRequest`**, not `fetch`. The hook must patch **both** (a post-load hook
  saw only fetch decoys and missed the results, because FB captures its transport
  references at init — which is exactly why the real hook must run at
  `document_start`, before FB's bundle). Confirmed: at `document_start` the XHR
  patch catches everything.
- The specific query is identified by `fb_api_req_friendly_name` in the (form-encoded)
  request body. There are dozens of decoy GraphQL calls per page (Messenger, presence,
  typeahead…). **Filter to the marketplace ones.**

### Queries that carry search listings
| friendly_name | role | listings? |
|---|---|---|
| `CometMarketplaceSearchContentContainerQuery` | initial search page | ✅ `feed_units.edges` |
| `CometMarketplaceSearchContentPaginationQuery` | scroll "load more" pages | ✅ `feed_units.edges` |
| `CometMarketplaceSearchRootQuery` | search page shell/SEO | ❌ (no feed_units) |
| `MarketplaceSuggestionDataSourceQuery` | typeahead suggestions | ❌ |
| `MarketplaceCometBrowseFeedLightPaginationQuery` | home "Today's picks" feed (no query) | ✅ but different root (`marketplace_home_feed`) — out of scope for v1 search |

**Recommended intercept filter:** friendly_name starts with `CometMarketplaceSearchContent`
(Container|Pagination). Equivalently: keep any response whose parsed data has
`data.marketplace_search.feed_units`. The adapter keys off the data path, so it does
not need the friendly name.

---

## 1. Where the listing array lives

```
data.marketplace_search.feed_units.edges[]        // the array of result units
  edge.node.__typename        // "MarketplaceFeedListingStoryObject" | "MarketplaceFeedAdStory"
  edge.node.listing           // the GroupCommerceProductItem  (organic listings)
  edge.cursor                 // opaque pagination cursor (unused — we're passive)
data.marketplace_search.feed_units.page_info.{end_cursor,has_next_page}   // unused
```

Each **organic** result is `edge.node.listing`, a `GroupCommerceProductItem`. All
field paths below are relative to that object.

---

## 2. Field paths  (GroupCommerceProductItem → internal `Listing`)

| `Listing` field | FB path (relative to `edge.node.listing`) | notes |
|---|---|---|
| `id` | `.id` | string, e.g. `"1346563490742167"`. Dedup key. |
| `rawTitle` (primary) | `.marketplace_listing_title` | **always present** in sample (15/15). FB-normalized, e.g. `"2015 Chevrolet Silverado 2500 HD Crew Cab · LTZ Pickup 4D 6 1/2 ft"`. **Parse this.** |
| rawTitle (fallback) | `.custom_title` | seller's original; **null on some listings** (2/15). Use only if MLT missing. |
| `price` | `.listing_price.amount` | string decimal `"10400.00"` → `Number()`. |
| price (display) | `.listing_price.formatted_amount` | `"$10,400"` — **currency symbol source**. |
| price (minor units) | `.listing_price.amount_with_offset_in_currency` | `"1040000"` (cents). |
| previous price | `.strikethrough_price.amount` / `.formatted_amount` | nullable; present on price-drops. Nice-to-have. |
| `currency` | — (derive) | **No ISO code field exists.** Infer from `formatted_amount` symbol (`$`→`USD`); default `USD`. |
| `photoUrl` | `.primary_listing_photo.image.uri` | `fbcdn.net` URL. **Signed/expiring — do not persist long-term** (store `id`, treat photo as ephemeral). |
| `locationText` | `.location.reverse_geocode.city` + `", "` + `.state` | e.g. `"Belmont, NC"`. |
| `listingUrl` | — (construct) | `https://www.facebook.com/marketplace/item/{id}` (confirmed live). |
| `capturedAt` | — | `Date.now()` at capture (not from FB). |

### Vehicle attributes: structured vs title-only (spec §10 answer)
- **year / make / model / trim → title-only.** No structured fields. Parse from
  `marketplace_listing_title`. It's more regular than `custom_title` but still needs
  real parsing — samples include `"2006 Silverado 2500hd"` (no make word),
  `"2007 Chevrolet 2500 HD Extended Cab"` (no "Silverado"), `"…LTZ 4X4 2500HD Diesel Crew"`.
- **mileage → semi-structured.** `.custom_sub_titles_with_rendering_flags[0].subtitle`,
  e.g. `"385K miles"`. Present ~13/15. Can carry extra tags: `"177K miles · Dealership"`
  (split on `·`, take the `…miles` token). **Parser: prefer subtitle, fall back to
  title regex, else none.**

### Other useful fields (available, optional)
`.if_gk_just_listed_tag_on_search_feed.creation_time` (unix s, "just listed"),
`.is_live/.is_sold/.is_pending/.is_hidden/.is_viewer_seller` (status),
`.marketplace_listing_category_id`, `.marketplace_listing_seller.{name,id}`,
`.listing_video.id` (nullable).

---

## 3. Sponsored / boosted cards (spec §10 answer)

Ads are injected into the same `feed_units.edges` array (see the `ads` block inside
`page_info.end_cursor`). They nest **differently**:

- `edge.node.__typename === "MarketplaceFeedAdStory"` (vs `MarketplaceFeedListingStoryObject`).
- **No `.listing`.** Instead: `.story` (the creative, incl. video attachments),
  `.ad_id_string`, `.is_demo`, `.transparency_ad_info`, and `.product_item`.
- In our sample `.product_item` was **null** → this was a pure video ad, not a
  mappable listing.

**Adapter rule:** for each edge —
1. `node.listing` present → organic listing (map it).
2. else `node.product_item` present & non-null → sponsored *listing* → map it, set a
   `sponsored: true` flag (recommended small addition to `Listing`).
3. else (`MarketplaceFeedAdStory` with null product_item) → **skip, but tally** as a
   non-listing ad. Do **not** count it as a parse failure (keeps "fail-loud" honest).

In fixtures: `search-content-pagination-chunked.json` has ad edges at indices **1** and **8**.

---

## 4. Chunked / deferred responses (spec §7 answer)

Responses are **newline-delimited JSON**. First line = base `{data, extensions}`.
Later lines = `@defer`/`$stream` increments: `{label, path, data, extensions}` where
`path` is an array locating where to merge into the base.

- **Search results:** the **first chunk already contains every listing** in
  `feed_units.edges`. Deferred chunks only add secondary media (e.g. a video
  ad-break player for one ad edge — see the chunked fixture, chunk 1 path
  `["marketplace_search","feed_units","edges",8,"node","story","attachments",0,"media"]`).
  → For extracting listings, **parsing chunk 0 is sufficient.**
- **Not universal:** many search responses are a single line (the container query and
  most pagination pages). The `browse-feed` fixture, by contrast, is 22 chunks that
  `$stream`-append whole edges (`path: ["marketplace_home_feed","edges",N]`).
- **Adapter approach:** `split('\n')` → `JSON.parse` each non-empty line. Take listings
  from the chunk(s) exposing `marketplace_search.feed_units.edges`. Single-line responses
  fall out as the trivial one-chunk case. (A full generic `path`-merge is only needed
  for the streamed browse feed, which is out of v1 scope.)

---

## 5. Search query location → `searchKey` (spec §6 answer)

- **URL (authoritative, primary):** `https://www.facebook.com/marketplace/{location}/search/?query={query}`
  e.g. `/marketplace/raleigh/search/?query=silverado%202500`. `query` param = the search
  string; `{location}` path segment = the geo. Derive `searchKey` from `query` (+ location).
- Search navigation is **client-side (SPA)** — the URL/query changes without a full reload,
  so a persistent hook survives across searches (good for clear-pool-on-new-search).
- Request variables: the query string is also in the GraphQL request body's `variables`
  JSON, but the recon hook captured only `friendly_name`, not full request bodies. The URL
  is sufficient and is the source of truth per spec §6.

---

## 6. Fixtures index

| file | query | notes |
|---|---|---|
| `search-content-container.json` | `CometMarketplaceSearchContentContainerQuery` | initial page, 15 organic edges, single chunk. **Primary adapter fixture.** |
| `search-content-pagination.json` | `CometMarketplaceSearchContentPaginationQuery` | typical scroll page, single chunk. |
| `search-content-pagination-chunked.json` | `CometMarketplaceSearchContentPaginationQuery` | 26 edges, **2 chunks**, **2 ad edges (idx 1, 8)**. Sponsored + chunk-merge test. |
| `search-root.json` | `CometMarketplaceSearchRootQuery` | page shell, **no listings** (negative test). |
| `browse-feed.json` | `MarketplaceCometBrowseFeedLightPaginationQuery` | home feed, **22 streamed chunks**, `marketplace_home_feed` root. Chunk-stress / out-of-scope reference. |

---

## 7. Deviations from HANDOFF spec (worth noting)

1. **Currency isn't in the response** as an ISO code — infer from the `$` in
   `formatted_amount`; default `USD`. (`Listing.currency` contract unaffected, but the
   adapter derives rather than reads it.)
2. **Two titles.** `marketplace_listing_title` (normalized, always present) is the parse
   target; `custom_title` (seller original) is a sometimes-null fallback — the reverse of
   assuming one messy title.
3. **Mileage is semi-structured** (subtitle), not title-only — the parser gets it cheaply
   for most listings.
4. **Sponsored units carry no listing** here (`product_item: null`) — skip-and-tally.
5. Consider adding `sponsored: boolean` and optionally `previousPrice`/`mileageFromSubtitle`
   to `Listing` — small, justified by real data.
