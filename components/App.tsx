import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode, MouseEvent as RMouseEvent } from 'react';
import { storage } from 'wxt/utils/storage';
import type { UiStore, SiftActions } from '../src/ui/uiStore';
import type { Listing, FuelType, Transmission, DealBucket } from '../src/types';
import { withDeals } from '../src/deal';
import { viewOf } from '../src/view';
import type { FilterState, SortPreset } from '../src/filters';
import { SORT_PRESETS } from '../src/filters';
import {
  effMake, effModel, effTrim, effBodyStyle, effFuel, effTransmission, effDrivetrain, effMileage, effTitleStatus, effSeller,
} from '../src/effective';
import { titleCase, fmtMiles, fmtPrice, fmtDelta, FUEL_LABEL, TRANS_LABEL, DRIVE_LABEL, DEAL_LABEL } from '../src/ui/format';
import {
  DEFAULT_FILTERS, SORT_LABEL, LISTED_OPTIONS, parseAmount, isBadAmount, activeChips, forNewSearch, sanitizeFilters, sanitizeSort,
} from '../src/ui/filterUi';
import { PANEL_CSS } from './styles';

// ---- persisted across sessions (needs the "storage" permission) ----
interface Prefs {
  width: number;
  tile: number;
  open?: boolean; // absent in prefs saved by older versions -> open
  showFilters?: boolean;
}
interface StoredView {
  filters: unknown; // validated on load (sanitizeFilters)
  sort: unknown;
  scope: string; // the search the make/model picks belong to (see forNewSearch)
}
const seenItem = storage.defineItem<string[]>('local:sift:seen', { fallback: [] });
const hiddenItem = storage.defineItem<string[]>('local:sift:hidden', { fallback: [] });
const prefsItem = storage.defineItem<Prefs>('local:sift:prefs', { fallback: { width: 660, tile: 380 } });
const viewItem = storage.defineItem<StoredView | null>('local:sift:view', { fallback: null });

const SEEN_MAX = 5000; // oldest "seen" marks are forgotten past this
const MIN_WIDTH = 380;
const WIDE = 600; // at or above this panel width, filters get their own column

// ---- ids kept in chrome.storage and shared by every Marketplace tab ----
interface IdsItem {
  getValue(): Promise<string[]>;
  setValue(v: string[]): Promise<void>;
  watch(cb: (v: string[] | null) => void): () => void;
}
// Each tab holds its own copy; writing that copy back would drop what another tab
// added in the meantime. So: follow storage changes, and apply each edit to a
// fresh read rather than to this tab's snapshot.
function useStoredIds(item: IdsItem, max?: number): [Set<string>, (edit: (s: Set<string>) => void) => void] {
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let alive = true;
    void item.getValue().then((v) => alive && setIds(new Set(v)));
    const unwatch = item.watch((v) => setIds(new Set(v ?? [])));
    return () => {
      alive = false;
      unwatch();
    };
  }, [item]);
  const update = useCallback(
    (edit: (s: Set<string>) => void) => {
      setIds((prev) => {
        const next = new Set(prev);
        edit(next);
        return next;
      });
      void item.getValue().then((v) => {
        const next = new Set(v);
        edit(next);
        const arr = [...next];
        return item.setValue(max && arr.length > max ? arr.slice(-max) : arr);
      });
    },
    [item, max],
  );
  return [ids, update];
}

function toggleIn<T>(arr: T[] | undefined, v: T): T[] {
  const s = new Set(arr ?? []);
  if (s.has(v)) s.delete(v);
  else s.add(v);
  return [...s];
}

/** Count of each value in the pool, plus any selected value (even if it's no longer there). */
function facetCounts(listings: Listing[], valueOf: (l: Listing) => string | undefined, selected: string[] | undefined): [string, number][] {
  const counts = new Map<string, number>();
  for (const v of selected ?? []) counts.set(v, 0);
  for (const l of listings) {
    const v = valueOf(l);
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => a[0].localeCompare(b[0]));
}

function facetsOf(l: Listing, f: FilterState): { text: string; unknown?: boolean }[] {
  const mm = [effMake(l), effModel(l)].filter(Boolean).map(titleCase).join(' ');
  const fuel = effFuel(l);
  const trans = effTransmission(l);
  const drive = effDrivetrain(l);
  const out: { text: string; unknown?: boolean }[] = [];
  const add = (text: string): void => {
    if (text) out.push({ text });
  };
  add(l.vehicle.year ? String(l.vehicle.year) : '');
  add(mm);
  add(titleCase(effTrim(l)));
  add(titleCase(effBodyStyle(l)));
  add(fuel ? FUEL_LABEL[fuel] : '');
  add(trans ? TRANS_LABEL[trans] : '');
  add(drive ? DRIVE_LABEL[drive] ?? '' : '');
  // An active filter keeps listings whose value isn't known yet (never-hide). Say
  // so on the card, or a "Manual" filter looks like it let automatics through.
  if (f.fuels?.length && !fuel) out.push({ text: 'Fuel ?', unknown: true });
  if (f.transmissions?.length && !trans) out.push({ text: 'Transmission ?', unknown: true });
  if (f.titleCleanOnly && !effTitleStatus(l)) out.push({ text: 'Title ?', unknown: true });
  if (f.privateOnly && !effSeller(l)) out.push({ text: 'Seller ?', unknown: true });
  return out;
}
const isJustListed = (l: Listing): boolean => l.createdAt !== null && Date.now() - l.createdAt < 24 * 3600 * 1000;

function Chip({ on, onClick, children, title }: { on?: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button className={`chip${on ? ' on' : ''}`} aria-pressed={!!on} onClick={onClick} title={title}>
      {children}
    </button>
  );
}
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="frow">
      <div className="flabel">{label}</div>
      {children}
    </div>
  );
}
function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className={`toggle${on ? '' : ' off'}`} role="switch" aria-checked={on} onClick={onClick}>
      <span className="sw" />
      {children}
    </button>
  );
}

// A filter box that applies as you type (after a short pause), on Enter, and on
// blur. Controlled, so Reset / a removed chip / restored state show up in it.
function useDraft<T>(value: T, toText: (v: T) => string, parse: (s: string) => T, valid: (s: string) => boolean, onCommit: (v: T) => void, delay: number) {
  const [draft, setDraft] = useState(() => toText(value));
  const committed = useRef(value);
  useEffect(() => {
    committed.current = value;
    setDraft((d) => (valid(d) && parse(d) === value ? d : toText(value))); // keep "15k" when it means 15000
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const commit = (s: string): void => {
    if (!valid(s)) return; // invalid text: keep the last good value, box shows the problem
    const v = parse(s);
    if (v !== committed.current) {
      committed.current = v;
      onCommit(v);
    }
  };
  useEffect(() => {
    const t = setTimeout(() => commit(draft), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  return { draft, setDraft, commit };
}

function NumBox({ value, onCommit, placeholder, label }: { value: number | undefined; onCommit: (v: number | undefined) => void; placeholder: string; label: string }) {
  const { draft, setDraft, commit } = useDraft(value, (v) => (v === undefined ? '' : String(v)), parseAmount, (s) => !isBadAmount(s), onCommit, 500);
  const bad = isBadAmount(draft);
  return (
    <input
      className={`inp${bad ? ' bad' : ''}`}
      inputMode="decimal"
      aria-label={label}
      aria-invalid={bad}
      title={bad ? 'Enter a number, like 15000 or 15k' : undefined}
      placeholder={placeholder}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commit(draft)}
      onKeyDown={(e) => e.key === 'Enter' && commit(draft)}
    />
  );
}
function Range({ label, lo, hi, onLo, onHi, ph }: { label: string; lo: number | undefined; hi: number | undefined; onLo: (v: number | undefined) => void; onHi: (v: number | undefined) => void; ph: [string, string] }) {
  return (
    <Section label={label}>
      <div className="range">
        <NumBox label={`${label} from`} placeholder={ph[0]} value={lo} onCommit={onLo} />
        <span>–</span>
        <NumBox label={`${label} to`} placeholder={ph[1]} value={hi} onCommit={onHi} />
      </div>
    </Section>
  );
}
function KeywordBox({ value, onCommit }: { value: string | undefined; onCommit: (v: string | undefined) => void }) {
  const { draft, setDraft, commit } = useDraft(value, (v) => v ?? '', (s) => (s.trim() ? s : undefined), () => true, onCommit, 300);
  return (
    <input
      className="inp"
      type="search"
      aria-label="Keyword"
      placeholder="e.g. duramax"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commit(draft)}
      onKeyDown={(e) => e.key === 'Enter' && commit(draft)}
    />
  );
}

function Card({ l, f, seen, hidden, onSeen, onToggleHide }: { l: Listing; f: FilterState; seen: boolean; hidden: boolean; onSeen: (id: string) => void; onToggleHide: (id: string) => void }) {
  const facets = facetsOf(l, f);
  // flag only what's still unknown once the detail page (if fetched) is folded in
  const unparsed = !effMake(l) || !effModel(l);
  const deal = l.deal;
  const miles = fmtMiles(effMileage(l));
  // Facebook's photo URLs are signed and expire; a dead one shows "no photo", not a broken image
  const [photoFailed, setPhotoFailed] = useState(false);
  const view = (): void => onSeen(l.id);
  // middle-click opens a tab (counts as seen); right-click is just a menu (doesn't)
  const aux = (e: RMouseEvent): void => {
    if (e.button === 1) view();
  };
  return (
    <li className={`card${unparsed ? ' unparsed' : ''}${seen ? ' seen' : ''}${hidden ? ' hidden' : ''}`}>
      <button
        className="hidebtn"
        title={hidden ? 'Unhide' : 'Hide — never show this listing again'}
        aria-label={hidden ? 'Unhide this listing' : 'Hide this listing'}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleHide(l.id);
        }}
      >
        {hidden ? '↩' : '✕'}
      </button>
      <a className="thumb" href={l.listingUrl} target="_blank" rel="noreferrer" tabIndex={-1} onClick={view} onAuxClick={aux}>
        {l.photoUrl && !photoFailed ? (
          <img src={l.photoUrl} alt="" loading="lazy" onError={() => setPhotoFailed(true)} />
        ) : (
          <span className="noimg">no photo</span>
        )}
        {isJustListed(l) && <span className="badge just">Just listed</span>}
        {seen && <span className="badge seen">✓ Seen</span>}
      </a>
      <div className="body">
        <a className="title" href={l.listingUrl} target="_blank" rel="noreferrer" onClick={view} onAuxClick={aux}>
          {l.rawTitle || 'Untitled listing'}
        </a>
        {facets.length > 0 && (
          <div className="facets">
            {facets.map((x, i) => (
              <span className={`facet${x.unknown ? ' unk' : ''}`} key={i} title={x.unknown ? 'Not known yet — shown so nothing is hidden by mistake' : undefined}>
                {x.text}
              </span>
            ))}
          </div>
        )}
        {unparsed && <div className="flag">Couldn’t read the details from this listing</div>}
        {deal && deal.bucket !== 'fair' && (
          <div className="dealrow">
            <span className={`dealb ${deal.bucket}`}>{DEAL_LABEL[deal.bucket]}</span>
            {fmtDelta(deal.delta) && <span className="delta">{fmtDelta(deal.delta)}</span>}
          </div>
        )}
        <div className="meta">
          <span className="price">{fmtPrice(l.price)}</span>
          {l.previousPrice !== null && l.price !== null && l.previousPrice > l.price && <span className="was">{fmtPrice(l.previousPrice)}</span>}
          {miles && <span className="miles">{miles}</span>}
          {l.locationText && <span className="loc">{l.locationText}</span>}
        </div>
      </div>
    </li>
  );
}

function FilterPanel({
  f, set, reset, makes, models, activeCount,
}: {
  f: FilterState;
  set: (patch: Partial<FilterState>) => void;
  reset: () => void;
  makes: [string, number][];
  models: [string, number][];
  activeCount: number;
}) {
  return (
    <div className="filters">
      <div className="fhead">
        <span className="flabel">Filters</span>
        {activeCount > 0 && (
          <button className="linkbtn" onClick={reset}>
            Reset all
          </button>
        )}
      </div>
      {makes.length > 0 && (
        <Section label="Make">
          <div className="chips">
            {makes.map(([m, n]) => (
              <Chip key={m} on={f.makes?.includes(m)} onClick={() => set({ makes: toggleIn(f.makes, m) })}>
                {titleCase(m)}
                <span className="n">{n}</span>
              </Chip>
            ))}
          </div>
        </Section>
      )}
      {models.length > 0 && (
        <Section label="Model">
          <div className="chips">
            {models.map(([m, n]) => (
              <Chip key={m} on={f.models?.includes(m)} onClick={() => set({ models: toggleIn(f.models, m) })}>
                {titleCase(m)}
                <span className="n">{n}</span>
              </Chip>
            ))}
          </div>
        </Section>
      )}
      <div className="grid2">
        <Range label="Year" lo={f.yearMin} hi={f.yearMax} ph={['Any', 'Any']} onLo={(v) => set({ yearMin: v })} onHi={(v) => set({ yearMax: v })} />
        <Range label="Price" lo={f.priceMin} hi={f.priceMax} ph={['Min', 'Max']} onLo={(v) => set({ priceMin: v })} onHi={(v) => set({ priceMax: v })} />
        <Range label="Miles" lo={f.milesMin} hi={f.milesMax} ph={['0', 'Any']} onLo={(v) => set({ milesMin: v })} onHi={(v) => set({ milesMax: v })} />
        <Section label="Keyword">
          <KeywordBox value={f.keyword} onCommit={(v) => set({ keyword: v })} />
        </Section>
      </div>
      <Section label="Listed">
        <div className="chips">
          <Chip on={f.listedWithinDays === undefined} onClick={() => set({ listedWithinDays: undefined })}>
            Any time
          </Chip>
          {LISTED_OPTIONS.map((o) => (
            <Chip key={o.days} on={f.listedWithinDays === o.days} onClick={() => set({ listedWithinDays: f.listedWithinDays === o.days ? undefined : o.days })}>
              {o.label}
            </Chip>
          ))}
        </div>
      </Section>
      <Section label="Fuel">
        <div className="chips">
          {(['gas', 'diesel', 'hybrid', 'electric'] as FuelType[]).map((x) => (
            <Chip key={x} on={f.fuels?.includes(x)} onClick={() => set({ fuels: toggleIn(f.fuels, x) })}>
              {FUEL_LABEL[x]}
            </Chip>
          ))}
        </div>
      </Section>
      <Section label="Transmission">
        <div className="chips">
          {(['automatic', 'manual'] as Transmission[]).map((x) => (
            <Chip key={x} on={f.transmissions?.includes(x)} onClick={() => set({ transmissions: toggleIn(f.transmissions, x) })}>
              {TRANS_LABEL[x]}
            </Chip>
          ))}
        </div>
      </Section>
      <Section label="Deal">
        <div className="chips">
          {(['great', 'good', 'fair', 'high'] as DealBucket[]).map((x) => (
            <Chip key={x} on={f.deals?.includes(x)} onClick={() => set({ deals: toggleIn(f.deals, x) })}>
              {DEAL_LABEL[x]}
            </Chip>
          ))}
        </div>
      </Section>
      <div className="toggles">
        <Toggle on={!!f.hideSoldPending} onClick={() => set({ hideSoldPending: !f.hideSoldPending })}>
          Hide sold &amp; pending
        </Toggle>
        <Toggle on={!!f.titleCleanOnly} onClick={() => set({ titleCleanOnly: !f.titleCleanOnly })}>
          Clean title only
        </Toggle>
        <Toggle on={!!f.privateOnly} onClick={() => set({ privateOnly: !f.privateOnly })}>
          Private sellers only
        </Toggle>
        <Toggle on={!!f.hideSponsored} onClick={() => set({ hideSponsored: !f.hideSponsored })}>
          Hide sponsored
        </Toggle>
      </div>
    </div>
  );
}

export function App({ store, actions }: { store: UiStore; actions: SiftActions }) {
  const snap = useSyncExternalStore(store.subscribe, store.get);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [sortPreset, setSortPreset] = useState<SortPreset>('cheapest');
  const [open, setOpen] = useState(true);
  const [showFilters, setShowFilters] = useState(true);
  const [resizing, setResizing] = useState(false);
  const [width, setWidth] = useState(660);
  const [tile, setTile] = useState(380);
  const [vw, setVw] = useState(() => window.innerWidth);
  const [seen, editSeen] = useStoredIds(seenItem, SEEN_MAX);
  const [hidden, editHidden] = useStoredIds(hiddenItem);
  const [showHidden, setShowHidden] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const scope = useRef(''); // the search the current make/model picks were made under

  // load persisted prefs + last-used filters/sort once
  useEffect(() => {
    let alive = true;
    void Promise.all([prefsItem.getValue(), viewItem.getValue()])
      .then(([p, v]) => {
        if (!alive) return;
        if (typeof p.width === 'number') setWidth(p.width);
        if (typeof p.tile === 'number') setTile(p.tile);
        setOpen(p.open !== false);
        setShowFilters(p.showFilters !== false);
        if (v) {
          setFilters(sanitizeFilters(v.filters));
          setSortPreset(sanitizeSort(v.sort));
          scope.current = typeof v.scope === 'string' ? v.scope : '';
        }
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);
  // save (debounced so dragging/sliding/typing doesn't hammer storage)
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => void prefsItem.setValue({ width, tile, open, showFilters }), 400);
    return () => clearTimeout(t);
  }, [loaded, width, tile, open, showFilters]);
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => void viewItem.setValue({ filters, sort: sortPreset, scope: scope.current }), 400);
    return () => clearTimeout(t);
  }, [loaded, filters, sortPreset, snap.searchLabel]);

  // A different search means a different pool: make/model picks from the old one
  // would silently hide the new results, so they go (see forNewSearch).
  useEffect(() => {
    if (!loaded || !snap.searchLabel) return;
    if (scope.current && scope.current !== snap.searchLabel) setFilters(forNewSearch);
    scope.current = snap.searchLabel;
  }, [loaded, snap.searchLabel]);

  useEffect(() => {
    const onResize = (): void => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const markSeen = useCallback((id: string) => editSeen((s) => void s.add(id)), [editSeen]);
  const toggleHide = useCallback((id: string) => editHidden((s) => void (s.has(id) ? s.delete(id) : s.add(id))), [editHidden]);

  // Deal-score the whole pool (hidden listings are still market data), once per pool
  // change; filtering and sorting re-run on their own when the filters change.
  const scored = useMemo(() => withDeals(snap.listings), [snap.listings]);
  const visiblePool = useMemo(() => scored.filter((l) => !hidden.has(l.id)), [scored, hidden]);
  const hiddenCount = scored.length - visiblePool.length;
  const activePool = showHidden ? scored : visiblePool;
  const view = useMemo(() => viewOf(activePool, filters, SORT_PRESETS[sortPreset]), [activePool, filters, sortPreset]);

  const makes = useMemo(() => facetCounts(activePool, effMake, filters.makes), [activePool, filters.makes]);
  // Models follow the make selection: pick Mercedes-Benz, see only its models.
  // Already-selected models stay listed so they can always be switched off.
  const models = useMemo(() => {
    const mk = filters.makes?.length ? new Set(filters.makes) : null;
    const inMake = mk ? activePool.filter((l) => {
      const m = effMake(l);
      return !!m && mk.has(m);
    }) : activePool;
    return facetCounts(inMake, effModel, filters.models);
  }, [activePool, filters.makes, filters.models]);

  const chips = useMemo(() => activeChips(filters), [filters]);

  // Tell the enricher which trucks to fetch first: exactly the ones on screen, in order.
  // Not before the saved filters are back — the default view would fetch listings
  // the user's own filters hide.
  const viewIds = useMemo(() => view.listings.map((l) => l.id), [view.listings]);
  useEffect(() => {
    if (loaded) actions.setEnrichPriority(viewIds);
  }, [loaded, viewIds, actions]);

  const set = useCallback((patch: Partial<FilterState>) => setFilters((f) => ({ ...f, ...patch })), []);
  const reset = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const panelWidth = Math.max(Math.min(width, vw - 40), Math.min(MIN_WIDTH, vw));
  const onDown = (e: RMouseEvent): void => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWidth;
    setResizing(true);
    const move = (ev: MouseEvent): void => {
      setWidth(Math.max(MIN_WIDTH, Math.min(window.innerWidth - 40, startW + (startX - ev.clientX))));
    };
    const up = (): void => {
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('mouseup', up, true);
      setResizing(false);
    };
    document.addEventListener('mousemove', move, true);
    document.addEventListener('mouseup', up, true);
  };

  // Facebook is a single-page app: off Marketplace, get out of the way entirely.
  if (!snap.onMarketplace) return null;

  if (!open) {
    return (
      <>
        <style>{PANEL_CSS}</style>
        <button className="reopen" onClick={() => setOpen(true)} title="Show Enshittifighter" aria-label={`Show Enshittifighter, ${view.matchCount} matches`}>
          <span className="mark">◧</span>
          <b>{view.matchCount}</b>
        </button>
      </>
    );
  }

  const wide = panelWidth >= WIDE;
  const nothingLoaded = snap.poolCount === 0 && !snap.schemaError;
  const allHidden = snap.poolCount > 0 && activePool.length === 0;

  return (
    <>
      <style>{PANEL_CSS}</style>
      <aside className={`sift${wide ? ' wide' : ''}`} style={{ width: panelWidth }} aria-label="Enshittifighter">
        <div className="rz" onMouseDown={onDown} title="Drag to resize" />

        <div className="head">
          <div className="brand" title="Enshittifighter">
            <span className="mark">◧</span>
            <span className="name">Enshittifighter</span>
          </div>
          <span className="count" title={`${view.matchCount} match your filters, of ${view.poolCount} loaded`}>
            <b>{view.matchCount}</b> of {view.poolCount}
          </span>
          <button className="hbtn" onClick={actions.clearPool} title="Empty the list — use after changing Facebook’s own filters">
            Clear
          </button>
          <button className={`hbtn${showFilters ? ' on' : ''}`} aria-pressed={showFilters} onClick={() => setShowFilters((v) => !v)}>
            Filters{chips.length > 0 && <span className="nbadge">{chips.length}</span>}
          </button>
          <button className="icon" onClick={() => setOpen(false)} title="Hide panel" aria-label="Hide panel">
            –
          </button>
        </div>

        {(snap.searchLabel || snap.enriching > 0) && (
          <div className="ctx">
            {snap.searchLabel && (
              <span className="q">
                Your search for <b>“{snap.searchLabel}”</b>
              </span>
            )}
            {snap.enriching > 0 && <span className="enrich">Getting vehicle details… {snap.enriching} to go</span>}
          </div>
        )}
        {snap.enrichHalted && (
          <div className="halted" title="Several detail pages in a row failed to load, so fetching stopped. Clear restarts it.">
            Stopped getting vehicle details — Facebook isn’t answering. Hit <b>Clear</b> to try again later.
          </div>
        )}

        <div className="sortbar">
          <label className="flabel" htmlFor="sift-sort">
            Sort
          </label>
          <select id="sift-sort" className="sel" value={sortPreset} onChange={(e) => setSortPreset(sanitizeSort(e.target.value))}>
            {(Object.keys(SORT_LABEL) as SortPreset[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </select>
          <label className="sizer" title="Card size">
            <span className="flabel">Size</span>
            <input type="range" aria-label="Card size" min={260} max={580} step={20} value={tile} onChange={(e) => setTile(Number(e.target.value))} />
          </label>
        </div>

        {!showFilters && chips.length > 0 && (
          <div className="activebar">
            {chips.map((c) => (
              <button key={c.id} className="pill" onClick={() => set(c.clear)} title="Remove this filter">
                {c.label}
                <span className="x" aria-hidden>
                  ✕
                </span>
              </button>
            ))}
            <button className="linkbtn" onClick={reset}>
              Reset all
            </button>
          </div>
        )}

        <div className="main">
          {showFilters && (
            <div className="rail">
              <FilterPanel f={filters} set={set} reset={reset} makes={makes} models={models} activeCount={chips.length} />
            </div>
          )}

          <div className="scroll">
            {snap.schemaError && (
              <div className="banner error">
                <b>Couldn’t read Facebook’s results.</b>
                <div>Facebook may have changed its page format — the tool needs an update. Your filters are fine.</div>
              </div>
            )}
            {nothingLoaded && snap.onSearchPage && (
              <div className="banner empty">
                <b>Scroll Facebook’s results</b>
                <div>Vehicles show up here as you scroll your search on the left. Changed Facebook’s own filters? Hit <b>Clear</b> and scroll again.</div>
              </div>
            )}
            {nothingLoaded && !snap.onSearchPage && (
              <div className="banner empty">
                <b>Search Marketplace first</b>
                <div>Search for a vehicle (say, “silverado 2500”), then scroll Facebook’s results — they collect here.</div>
              </div>
            )}
            {allHidden && (
              <div className="banner empty">
                <b>Everything here is hidden.</b>
                <div>
                  You’ve hidden all {snap.poolCount} vehicles loaded so far.{' '}
                  <button className="linkbtn" onClick={() => setShowHidden(true)}>
                    Show them
                  </button>
                </div>
              </div>
            )}
            {view.matchCount === 0 && activePool.length > 0 && (
              <div className="banner empty">
                <b>Nothing matches these filters.</b>
                <div>
                  {activePool.length} vehicles loaded — loosen a filter to see them.{' '}
                  <button className="linkbtn" onClick={reset}>
                    Reset filters
                  </button>
                </div>
              </div>
            )}

            {hiddenCount > 0 && !allHidden && (
              <div className="hiddenbar">
                <span>{hiddenCount} hidden</span>
                <button className="linkbtn" onClick={() => setShowHidden((v) => !v)}>
                  {showHidden ? 'Hide them' : 'Show'}
                </button>
                {showHidden && (
                  <button className="linkbtn" onClick={() => editHidden((s) => s.clear())}>
                    Unhide all
                  </button>
                )}
              </div>
            )}
            <ul className="results" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${tile}px, 100%), 1fr))` }}>
              {view.listings.map((l) => (
                <Card key={l.id} l={l} f={filters} seen={seen.has(l.id)} hidden={hidden.has(l.id)} onSeen={markSeen} onToggleHide={toggleHide} />
              ))}
            </ul>
            {view.matchCount > 0 && snap.onSearchPage && (
              <div className="footer">That’s everything loaded so far. Scroll Facebook’s results to load more.</div>
            )}
          </div>
        </div>
      </aside>
      {resizing && <div className="rz-overlay" />}
    </>
  );
}
