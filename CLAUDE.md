# CLAUDE.md — Marketplace Sift

Project rules for this repo. Read `HANDOFF.md` for the full spec. These are the guardrails; follow them over any default.

## The rule that matters most
**PASSIVE DISCOVERY, BOUNDED ENRICHMENT.**
- **Discovery is passive.** NEVER auto-search, auto-scroll, fan out queries, or replay/forge search requests. The listing pool is built ONLY from responses the user's own manual browsing causes.
- **Enrichment is active but bounded.** The extension MAY fetch a listing's detail page (`MarketplacePDPContainerQuery`) to read structured vehicle fields — but ONLY for listings already in the user-surfaced pool, at most once each, throttled/rate-limited. It never crawls beyond what the user surfaced, and never fabricates searches.
- **No anti-detection.** Throttling is for politeness and rate-limit safety only — never to disguise automated traffic. No fingerprint spoofing, no human-timing mimicry.

This is a deliberate, eyes-open relaxation of the original passive-only rule, chosen because pool-wide filtering on fuel / transmission / mileage / title / seller is the tool's core value and those fields live only on the detail page. Trade-off accepted: enrichment breaks Meta ToS §3.2 (automated collection even while logged-in), so **distribution defaults to personal-use** (load-unpacked) until the sharing question is settled. Account-action risk for this low-volume, own-session pattern: **low but unquantified** (research 2026-07-03). If a task needs anything beyond this bounded enrichment — automated *discovery*, crawling past the surfaced pool, or evasion — STOP and flag it.

## Architecture rules
- **Single adapter boundary.** All knowledge of Facebook's GraphQL response shape lives in ONE module (`adapter`), mapping raw response → the internal `Listing` type. No other module references Facebook's raw field names. Keep field paths in named constants so a schema change is a one-place edit.
- **Depend on `Listing`, never on raw FB JSON.** Everything downstream of the adapter consumes the internal type only.
- **Capture via a MAIN-world `fetch` hook**, never `webRequest`/`declarativeNetRequest` — MV3 can't read response bodies through those. The hook runs `world: "MAIN"`, relays captured text to an isolated-world script via `postMessage`.
- **Assume chunked responses.** Facebook's GraphQL responses arrive as multiple newline-delimited chunks (`@defer`-style). Never rely on `res.clone().json()`; read `.text()`, split, `JSON.parse` each line, merge. Multi-chunk is the normal case.
- **No DOM surgery on Facebook's elements.** Render an independent sidebar. Read the network response; never reorder or rewrite Facebook's own cards.
- **Enrichment is a second single-boundary adapter.** Detail-page (`MarketplacePDPContainerQuery`) field paths live in ONE `pdpAdapter` module mapping the raw PDP response → structured `ParsedVehicle` fields. Enrichment fetches are queued, throttled (one at a time, capped rate), dedup'd (never re-fetch an enriched listing), and issued only for listings already in the pool.

## Product rules
- **No backend.** Client-side only (a static privacy-policy page is the sole exception).
- **No LLM, no API keys** anywhere in the shipped extension. Title parsing is regex + a make/model dictionary. Never embed an API key.
- **Fail loud.** "Adapter captured a response but extracted 0 listings" (schema broke) must be a visually distinct state from "0 results match filters" (working, empty).
- **Never hide unparsed listings.** If the parser can't classify a title, show the listing flagged — never drop it. Filters are additive/opt-in.
- **Chrome is the build target.** Keep code cross-browser-portable via WXT; don't spend time building/testing Firefox in v1.
- **Narrow permissions.** `host_permissions` scoped to `https://www.facebook.com/marketplace/*` only. Single-purpose, collects no data.

## Workflow rules
- **Do not skip Phase 0.** Facebook's field paths cannot be guessed and must not be invented. The adapter and all downstream logic are built and tested against the Phase-0 fixtures in `/fixtures`.
- **Commit at the end of each phase.**
- **Keep fixtures as regression tests.** When Facebook's schema changes later, capture a fresh fixture and re-run adapter tests to localize the break.
- **TypeScript strict.** Prefer pure, unit-testable functions — especially the parser and adapter, which must be verifiable offline against fixtures with zero Facebook access.

## Stack
WXT + React + TypeScript (strict). `chrome.storage` for persistence. Minimal runtime deps.
