# Marketplace Sift — Build Handoff

A browser extension that fixes Facebook Marketplace's broken search. Hand this document to Claude Code and work the phases in order.

---

## 1. What this is

Facebook Marketplace search is loose (a search for "silverado 2500" returns Colorado Z71s, F-250s, an Impala, a Tundra) and its sort is useless (sorting by price within a price band returns a wall of identically-priced listings with no secondary tiebreak). This extension fixes both — **client-side, on the data the user's own browser already fetches.**

The extension intercepts the GraphQL responses Facebook sends to the user's own logged-in browser as they browse Marketplace, maps them into a clean internal shape, and renders them in an injected sidebar with real filters, a real multi-key sort, and saved searches. It does **not** fetch anything from Facebook itself — it only re-processes what the user's own scrolling loads.

**Scope:** personal use + sharing with friends via an *unlisted* Chrome Web Store listing. This is a small, sharp tool, not a product. Do not add product-scale features (accounts, telemetry, backends, monetization).

**Target browser:** Chrome (primary). Keep the code cross-browser-portable via WXT so a Firefox build is a config flag away, but do not spend build/test time on Firefox in v1.

---

## 2. Hard constraints (non-negotiable)

These override any default an implementer would otherwise reach for. If a step seems to require violating one of these, stop and flag it rather than working around it.

1. **PASSIVE ONLY — this is the most important rule.** The extension must NEVER originate automated requests to Facebook. No query fan-out / parallel searches, no auto-scroll, no programmatic triggering of searches, no replaying or forging GraphQL requests. It reads only the responses that the user's own manual actions cause Facebook to send. This is a permanent safety/legal boundary, not a v1-scope shortcut. Originating automated traffic is what flags users' Facebook accounts and creates real exposure; passive re-processing generates zero network signal and is the entire basis for this tool being safe to distribute.

2. **No backend.** Everything runs client-side inside the extension. No server, no proxy, no hosted component (except a static privacy-policy page).

3. **No LLM / no API keys in the shipped extension.** Title parsing is pure regex + a make/model dictionary. Never embed an Anthropic (or any) API key — it would be extracted and abused. Vehicle titles are regular enough that this is unnecessary.

4. **Single adapter boundary.** ALL knowledge of Facebook's GraphQL response shape lives in exactly one module (`adapter`). It maps Facebook's raw response → the internal `Listing` type. No other module ever touches Facebook's raw field names. When Facebook changes its schema, only this one module changes. Everything downstream depends on the internal `Listing` type, never on raw Facebook JSON.

5. **No DOM surgery on Facebook's own elements.** Facebook's class names are obfuscated and reshuffle constantly. Do not find/reorder/rewrite Facebook's own listing cards. Render an independent sidebar. Read the network response; leave Facebook's DOM alone.

6. **Capture responses via a MAIN-world fetch hook, NOT `webRequest`/`declarativeNetRequest`.** MV3 cannot read response *bodies* through the webRequest APIs. The only viable capture path is monkey-patching `fetch` (and `XMLHttpRequest` if needed) in the MAIN world and reading the response there. (See §4.)

7. **Handle chunked / deferred GraphQL responses.** Facebook's GraphQL responses are frequently NOT a single clean JSON object — they arrive as multiple newline-delimited chunks (`@defer`-style incremental delivery). `res.clone().json()` will fail or return partial data. Read via `.text()` and parse the chunks (split on newlines, `JSON.parse` each non-empty line, merge). Assume multi-chunk is the normal case, not the exception.

8. **Fail loud, and distinguish failure from emptiness.** When the adapter captures a response but extracts zero listings (i.e., Facebook changed its schema and our field paths broke), the sidebar must show a distinct state — e.g. "No listings captured — Facebook's format may have changed." This must be visually and logically different from a genuine "0 results match your filters." The first means the tool is broken; the second means it's working and the pool is empty/filtered.

9. **Never hide unparsed listings.** If the parser can't extract make/model/year from a title, the listing is still shown (flagged as unparsed), never silently dropped. All filters are additive/opt-in: an active filter narrows; it never removes items the parser simply couldn't classify.

10. **Pool scoping.** Accumulate listings as the user scrolls, deduplicated by listing id. When the user's Facebook search query changes, clear the accumulated pool so results from different searches don't mix. (See §6 for how to detect a search change.)

---

## 3. Architecture / data flow

```
User scrolls Marketplace (their own logged-in session)
        │
        ▼
[intercept]  MAIN-world content script
        │    monkey-patches window.fetch; detects the GraphQL POST;
        │    reads response via .text(); postMessage(raw text + searchKey)
        ▼
[relay]      isolated-world content script
        │    receives the message; hands raw text to the pipeline
        ▼
[adapter]    raw GraphQL text  ──►  Listing[]      ◄── the ONLY FB-schema-aware module
        │    (parses chunked responses; extracts listing nodes)
        ▼
[parser]     enrich each Listing.vehicle from its rawTitle (regex + dictionary)
        ▼
[store]      accumulate + dedup by id; clear on new searchKey; persist to chrome.storage
        ▼
[filters]    apply active filter predicates + multi-key sort
        ▼
[panel]      React sidebar renders the filtered/sorted list
```

Two content-script worlds are required because in MV3 a normal (isolated-world) content script's `window.fetch` is NOT the page's `fetch`. The hook must run in the MAIN world (`world: "MAIN"`, Chrome 111+) to see Facebook's real requests, then relay the captured data to an isolated-world script that owns the UI and `chrome.storage`.

### Internal `Listing` type (the contract everything downstream depends on)

```typescript
type ParseConfidence = 'full' | 'partial' | 'none';

interface ParsedVehicle {
  year?: number;
  make?: string;      // normalized lowercase, e.g. "chevrolet" (aliases folded: chevy→chevrolet)
  model?: string;     // normalized, e.g. "silverado 2500hd"
  trim?: string;
  mileage?: number;   // miles, integer
  confidence: ParseConfidence;
}

interface Listing {
  id: string;               // FB listing id — dedup key
  rawTitle: string;         // original marketplace listing title
  price: number | null;     // numeric amount; null if unparseable
  currency: string;         // e.g. "USD"
  locationText: string;     // e.g. "Winston-Salem, NC"
  photoUrl: string | null;
  listingUrl: string;       // https://www.facebook.com/marketplace/item/{id}
  vehicle: ParsedVehicle;   // filled by [parser]
  capturedAt: number;       // Date.now() at capture
  searchKey: string;        // the FB search query this listing belonged to (pool scoping)
}
```

### Key module contracts

```typescript
// [adapter] — the single FB-schema-aware boundary.
// Handles chunked responses internally. Returns [] if no listings found (caller decides fail-loud).
function extractListings(rawResponseText: string, searchKey: string): Listing[];

// [parser] — pure function, no FB knowledge, unit-testable in isolation.
function parseVehicleTitle(rawTitle: string): ParsedVehicle;
```

---

## 4. Modules (map these onto WXT's entrypoint conventions)

- **`intercept`** — MAIN-world content script, injected on `*/marketplace/*`, `run_at: document_start`. Monkey-patches `window.fetch`; on a Marketplace GraphQL POST, clones and reads the response as text, and `window.postMessage`s `{ type: 'MS_CAPTURE', raw, searchKey }`. Must not throw into Facebook's own code path — wrap everything, swallow errors, always return the original response untouched.
- **`relay`** — isolated-world content script. Listens for `MS_CAPTURE` messages, passes `raw` + `searchKey` into the pipeline. Owns access to `chrome.storage` and the panel.
- **`adapter`** — `extractListings()`. Parses chunked GraphQL text, walks to the listing array, maps each node to a `Listing`. The only module that references Facebook field paths. Keep those paths in named constants at the top of the file so a schema change is a one-place edit.
- **`parser`** — `parseVehicleTitle()`. Regex for year (`\b(19|20)\d{2}\b`), mileage (`\b\d{1,3}[,.]?\d{3}\s?(mi|miles|k)\b` and bare `\b\d{2,3}k\b`), and a make/model dictionary (aliases folded). Sets `confidence`. Pure, deterministic, heavily unit-tested.
- **`store`** — in-memory pool + `chrome.storage` persistence. Accumulate, dedup by `id`, clear when `searchKey` changes. Persists saved searches and last-used filters.
- **`filters`** — filter predicates (make/model multi-select, year range, mileage max, price min/max, keyword) + multi-key comparator.
- **`panel`** — React sidebar. Toggle button; filter controls; saved-searches UI; results list; fail-loud banner; unparsed-listing flag.
- **`savedSearches`** — define/name/save a filter set; mark one as auto-apply-on-load; persist via `store`.

---

## 5. Feature spec (the sidebar)

- **Sidebar overlay**, toggled by a button injected on Marketplace. It overlays Facebook's feed; it does not replace Facebook's layout. Collapsible.
- **Filter controls:**
  - Make / model — multi-select, sourced from the make/model dictionary.
  - Year — min/max range.
  - Mileage — max.
  - Price — min/max.
  - Keyword — free-text match against `rawTitle`.
- **Sort** — multi-key, in this default order: price → year (desc) → mileage (asc) → `capturedAt` (recency). This is the fix for the "wall of identical prices" problem. Let the user flip price asc/desc.
- **Saved searches** — save the current filter set under a name (e.g. "Chevy/GMC 2500HD, <100k mi, 2011–2016"). One saved search can be marked auto-apply, and applies on load. Persisted across sessions via `chrome.storage`.
- **Results list** — each card shows photo, `rawTitle`, price, parsed year/make/model/mileage, `locationText`, and links out to `listingUrl` (the real Facebook listing). Cards for unparsed listings are shown and visibly flagged, never hidden.
- **Fail-loud banner** — the distinct "format may have changed" state per constraint #8.
- **Result count** — show how many are in the pool vs. how many pass the active filters.

---

## 6. Detecting a "new search" (pool scoping)

Primary signal: the Marketplace search query in the page URL (`.../marketplace/category|search?query=...` — confirm the exact param in Phase 0). Derive a `searchKey` from it. When `searchKey` changes, clear the pool before accumulating new captures. Fallback/confirmation: the search string also appears in the GraphQL request variables — Phase 0 identifies where. Use the URL as the primary source of truth since it doesn't require parsing request internals.

---

## 7. Phase plan

Work these in order. Commit at the end of each phase. **Do not skip Phase 0** — the field paths cannot be guessed and must not be invented.

### Phase 0 — Recon (needs the user's logged-in browser)
Capture real data. Either drive it with a browser tool (Claude in Chrome / a browser MCP running in the user's own session) or have the user paste responses from DevTools → Network → filter `graphql`.
- Capture **2–3 real Marketplace search GraphQL responses**, including: (a) a vehicle search that returns cars/trucks, and (b) at least one response that contains a *sponsored/boosted* card alongside organic listings (they often nest differently).
- Save each raw response verbatim as a JSON/text fixture in `/fixtures`.
- Produce `/fixtures/SCHEMA_NOTES.md` documenting: where the listing array lives, the field paths for id / title / price / currency / photo / listingUrl, where the search-query string lives in both the URL and the request variables, whether responses are chunked (and the chunk format), how sponsored/variant cards differ from organic ones, and whether any vehicle attributes (year/make/model/mileage) ever appear as *structured* fields vs. only inside the free-text title.

**Output of Phase 0:** fixtures + `SCHEMA_NOTES.md`. Nothing else in this project can be finished until these exist.

### Phase 1 — Core logic (no browser needed — fully offline)
Implement against the fixtures, with unit tests:
- The `Listing` / `ParsedVehicle` types.
- `adapter.extractListings()` — fixture text → `Listing[]`, including chunked-response parsing and sponsored-card handling.
- `parser.parseVehicleTitle()` — with a test table of real titles (e.g. "2015 Chevrolet Silverado 2500HD 4x4", "2018 Ford f-250 2500", messy/ambiguous ones) asserting correct extraction and `confidence`.
- `store` (pool accumulate/dedup/clear) and `filters` (predicates + comparator).

This is the entire brain of the tool and it is 100% verifiable against fixtures with zero Facebook access. Get it green before touching the browser.

### Phase 2 — Extension plumbing
- Scaffold the WXT project (React + TypeScript).
- `intercept` (MAIN-world fetch hook) + `relay`, wired to `adapter`.
- **Checkpoint (user):** load unpacked, browse Marketplace, confirm live captures parse to the same `Listing[]` shape the fixtures produced. If the live response differs from the fixtures, update fixtures and Phase-1 tests, don't patch around it.

### Phase 3 — Sidebar UI
- React sidebar: toggle, filter controls, results list, sort. Driven by the Phase-1 filter engine.

### Phase 4 — Persistence & polish
- `chrome.storage` persistence, saved searches (incl. auto-apply), fail-loud banner, dedup + clear-on-new-search wired end to end.

### Phase 5 — Package for distribution
- Production build. Narrow `host_permissions` to `https://www.facebook.com/marketplace/*` (not all of Facebook). Single-purpose, no-data-collection posture. Zip for upload. Stub a static privacy policy (reads Marketplace data in-browser, stores nothing off-device).

---

## 8. Testing strategy

The fixture-based core is the unlock: because Claude Code cannot log into Facebook, everything downstream of the `adapter` (adapter, parser, store, filters) is unit-tested against the saved JSON fixtures from Phase 0. That covers the entire logic layer offline. Only two things need the user's actual browser: the Phase 2 live-capture confirmation, and manual UI verification from Phase 3 onward. Keep the fixtures in the repo as regression tests — when Facebook's schema changes later, capturing a fresh fixture and re-running the adapter tests is how you localize the break.

---

## 9. Distribution (reference — already decided)

- **Unlisted Chrome Web Store listing.** Not in store search; installs via a shared link with normal one-click install + auto-updates. Share the link in the Discord.
- **Dedicated Google developer account**, kept separate from the user's personal identity and any Facebook accounts. One-time $5 registration.
- **Narrow permissions**, no-data privacy posture, static privacy-policy page.
- Develop via load-unpacked locally (instant iteration); publish to the unlisted store only when there's something worth shipping. Not gated on Google review to test changes.

---

## 10. Open items Phase 0 must resolve (discover — do not invent)

- Exact GraphQL field paths for: listing id, title, price amount, currency, photo URL, and how to build the listing URL from the id.
- Where the listing array sits in the response (and whether search vs. category endpoints differ).
- The chunked/deferred response format (chunk delimiter, how many chunks, where listings land across them).
- How sponsored/boosted cards nest differently from organic listings, so the adapter includes/handles both correctly.
- Where the search-query string lives in the URL and in the request variables (for `searchKey` / pool scoping).
- Whether any vehicle attributes are ever structured vs. title-only (affects how much the parser must carry).

## 11. Tech stack

- **WXT** (actively maintained; Vite under the hood; native cross-browser so a Firefox build is a flag, satisfying the "keep the door open" goal; ships storage/messaging helpers).
- **React + TypeScript** (strict mode).
- **`chrome.storage`** for persistence.
- Keep runtime dependencies minimal. A lightweight UI library is optional; do not pull in heavy frameworks.
