# Recon Capture (Phase 0 tool)

A throwaway-but-reusable MV3 extension whose only job is to **passively capture**
the GraphQL responses your own browsing loads on Facebook Marketplace, so we can
save them as fixtures. It originates **no** requests to Facebook — it only reads
responses your manual searching/scrolling already caused.

The capture hook here (`hook.js`) is the prototype of the real extension's
`intercept` module. Keep this tool around: when Facebook changes its schema and
the adapter breaks, load it, capture a fresh fixture, and re-run the adapter
tests to localize the break.

## Load it (Chrome, Windows)

1. Go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this `recon-capture` folder.
4. **Open a fresh** `https://www.facebook.com/marketplace` tab (desktop `www`, not
   `m.` mobile). If Marketplace was already open, **reload it** — the hook must be
   present from `document_start`, before Facebook's code runs.

## Capture

- A dark **"Marketplace Sift · Recon"** panel appears bottom-left.
- Do a vehicle search (e.g. `silverado 2500`), scroll once or twice to load more,
  and try a second search too. Watch the count climb; **★** marks the capture
  that looks like the search-results payload.
- Click **Download fixtures** → saves `marketplace-fixtures.json` to your Downloads.

## Safety notes

- Passive only: no automated requests, no auto-scroll, no request replay.
- The panel is an independent element; it never modifies Facebook's own DOM.
- `host_permissions` is scoped to `https://www.facebook.com/marketplace/*` only.
