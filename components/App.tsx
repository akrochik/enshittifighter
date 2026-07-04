import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode, MouseEvent as RMouseEvent } from 'react';
import { storage } from 'wxt/utils/storage';
import type { UiStore, SiftActions } from '../src/ui/uiStore';
import type { Listing, FuelType, Transmission, DealBucket } from '../src/types';
import { selectView } from '../src/view';
import type { FilterState, SortField } from '../src/filters';
import { DEFAULT_SORT } from '../src/filters';
import { effMake, effModel, effTrim, effBodyStyle, effFuel, effTransmission, effDrivetrain } from '../src/effective';
import { PANEL_CSS } from './styles';

// Persisted across sessions (needs the "storage" permission).
const seenItem = storage.defineItem<string[]>('local:sift:seen', { fallback: [] });
const prefsItem = storage.defineItem<{ width: number; tile: number }>('local:sift:prefs', { fallback: { width: 660, tile: 380 } });
const hiddenItem = storage.defineItem<string[]>('local:sift:hidden', { fallback: [] });

// ---- user-facing formatting (nothing here reveals where a value came from) ----
const FUEL_LABEL: Record<FuelType, string> = { gas: 'Gas', diesel: 'Diesel', hybrid: 'Hybrid', electric: 'Electric', other: 'Other' };
const TRANS_LABEL: Record<Transmission, string> = { automatic: 'Auto', manual: 'Manual' };
const DRIVE_LABEL: Record<string, string> = { '4wd': '4x4', awd: 'AWD', '2wd': '2WD', rwd: 'RWD', fwd: 'FWD' };
const DEAL_LABEL: Record<DealBucket, string> = { great: 'Great deal', good: 'Good deal', fair: 'Fair price', high: 'High price' };
const UPPER = new Set(['hd', 'ltz', 'lt', 'ls', 'wt', 'gmc', 'awd', 'rst', 'slt', 'sle', 'xlt', 'xl', 'z71', 'sr5', 'fx4', 'trd', 'ram', 'gt']);

function titleCase(s?: string): string {
  if (!s) return '';
  return s
    .split(' ')
    .map((w) => (UPPER.has(w) ? w.toUpperCase() : /^\d/.test(w) ? w.replace(/hd$/i, 'HD') : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}
const fmtMiles = (n?: number): string => (n === undefined ? '' : n >= 1000 ? `${Math.round(n / 1000)}k mi` : `${n} mi`);
const fmtPrice = (n: number | null): string => (n === null ? '—' : '$' + n.toLocaleString('en-US'));
const fmtDelta = (n: number | null): string => (n === null || n >= 0 ? '' : `$${Math.round(-n / 100) / 10}k under similar`);
const effMileageStr = (l: Listing): string => fmtMiles(l.detail?.mileage ?? l.vehicle.mileage);

const num = (s: string): number | undefined => {
  const n = Number(s.replace(/[^0-9.]/g, ''));
  return s.trim() && Number.isFinite(n) ? n : undefined;
};
function toggleIn<T>(arr: T[] | undefined, v: T): T[] {
  const s = new Set(arr ?? []);
  if (s.has(v)) s.delete(v);
  else s.add(v);
  return [...s];
}

function facetsOf(l: Listing): string[] {
  const mm = [effMake(l), effModel(l)].filter(Boolean).map(titleCase).join(' ');
  const f = effFuel(l);
  const t = effTransmission(l);
  const d = effDrivetrain(l);
  return [
    l.vehicle.year ? String(l.vehicle.year) : '',
    mm,
    titleCase(effTrim(l)),
    titleCase(effBodyStyle(l)),
    f ? FUEL_LABEL[f] : '',
    t ? TRANS_LABEL[t] : '',
    d ? DRIVE_LABEL[d] ?? '' : '',
  ].filter((x): x is string => x.length > 0);
}
const isJustListed = (l: Listing): boolean => l.createdAt !== null && Date.now() - l.createdAt < 24 * 3600 * 1000;

function Chip({ on, onClick, children }: { on?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className={`chip${on ? ' on' : ''}`} onClick={onClick}>
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
    <button className={`toggle${on ? '' : ' off'}`} onClick={onClick}>
      <span className="sw" />
      {children}
    </button>
  );
}

function Card({ l, seen, hidden, onSeen, onToggleHide }: { l: Listing; seen: boolean; hidden: boolean; onSeen: (id: string) => void; onToggleHide: (id: string) => void }) {
  const facets = facetsOf(l);
  const unparsed = l.vehicle.confidence === 'none';
  const deal = l.deal;
  const view = (): void => onSeen(l.id);
  return (
    <li className={`card${unparsed ? ' unparsed' : ''}${seen ? ' seen' : ''}${hidden ? ' hidden' : ''}`}>
      <button
        className="hidebtn"
        title={hidden ? 'Unhide' : 'Hide — never show this listing again'}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleHide(l.id);
        }}
      >
        {hidden ? '↩' : '✕'}
      </button>
      <a className="thumb" href={l.listingUrl} target="_blank" rel="noreferrer" onClick={view} onAuxClick={view}>
        {l.photoUrl ? <img src={l.photoUrl} alt="" loading="lazy" /> : <span className="noimg">no photo</span>}
        {isJustListed(l) && <span className="badge just">Just listed</span>}
        {seen && <span className="badge seen">✓ Seen</span>}
      </a>
      <div className="body">
        <a className="title" href={l.listingUrl} target="_blank" rel="noreferrer" onClick={view} onAuxClick={view}>
          {l.rawTitle || 'Untitled listing'}
        </a>
        {facets.length > 0 && (
          <div className="facets">
            {facets.map((f, i) => (
              <span className="facet" key={i}>
                {f}
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
          {effMileageStr(l) && <span className="miles">{effMileageStr(l)}</span>}
          {l.locationText && <span className="loc">{l.locationText}</span>}
        </div>
      </div>
    </li>
  );
}

export function App({ store, actions }: { store: UiStore; actions: SiftActions }) {
  const snap = useSyncExternalStore(store.subscribe, store.get);
  const [filters, setFilters] = useState<FilterState>({ hideSponsored: true, hideSoldPending: true });
  const [sort, setSort] = useState<SortField[]>(DEFAULT_SORT);
  const [open, setOpen] = useState(true);
  const [showFilters, setShowFilters] = useState(true);
  const [resizing, setResizing] = useState(false);
  const [width, setWidth] = useState(660);
  const [tile, setTile] = useState(380);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);
  const loaded = useRef(false);

  // load persisted "seen" set + panel prefs once
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [s, p, h] = await Promise.all([seenItem.getValue(), prefsItem.getValue(), hiddenItem.getValue()]);
      if (!alive) return;
      setSeen(new Set(s));
      setHidden(new Set(h));
      setWidth(p.width);
      setTile(p.tile);
      loaded.current = true;
    })();
    return () => {
      alive = false;
    };
  }, []);
  // save prefs (debounced so dragging/sliding doesn't hammer storage)
  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => void prefsItem.setValue({ width, tile }), 400);
    return () => clearTimeout(t);
  }, [width, tile]);

  const markSeen = (id: string): void => {
    setSeen((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      void seenItem.setValue([...next]);
      return next;
    });
  };
  const toggleHide = (id: string): void => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      void hiddenItem.setValue([...next]);
      return next;
    });
  };

  const hiddenCount = useMemo(() => snap.listings.reduce((n, l) => n + (hidden.has(l.id) ? 1 : 0), 0), [snap.listings, hidden]);
  const activePool = useMemo(() => (showHidden ? snap.listings : snap.listings.filter((l) => !hidden.has(l.id))), [snap.listings, hidden, showHidden]);
  const view = useMemo(() => selectView(activePool, filters, sort), [activePool, filters, sort]);
  const makes = useMemo(() => [...new Set(snap.listings.map(effMake).filter((x): x is string => !!x))].sort(), [snap.listings]);
  const set = (patch: Partial<FilterState>): void => setFilters((f) => ({ ...f, ...patch }));

  const onDown = (e: RMouseEvent): void => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    setResizing(true);
    const move = (ev: MouseEvent): void => {
      setWidth(Math.max(380, Math.min(window.innerWidth - 40, startW + (startX - ev.clientX))));
    };
    const up = (): void => {
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('mouseup', up, true);
      setResizing(false);
    };
    document.addEventListener('mousemove', move, true);
    document.addEventListener('mouseup', up, true);
  };

  if (!open) {
    return (
      <>
        <style>{PANEL_CSS}</style>
        <button className="reopen" onClick={() => setOpen(true)}>
          <span className="mark">◧</span>
          <b>{view.matchCount}</b>
        </button>
      </>
    );
  }

  const priceAsc = sort[0]?.key === 'price' && sort[0]?.dir === 'asc';
  const hasDeal = sort.some((s) => s.key === 'deal');

  return (
    <>
      <style>{PANEL_CSS}</style>
      <aside className="sift" style={{ width }}>
        <div className="rz" onMouseDown={onDown} title="Drag to resize" />

        <div className="head">
          <div className="brand">
            <span className="mark">◧</span> Enshittifighter
          </div>
          <span className="count">
            <b>{view.matchCount}</b> of {view.poolCount}
          </span>
          <button className="hbtn" onClick={actions.clearPool} title="Empty the list — use after changing Facebook’s own filters">
            Clear
          </button>
          <button className={`hbtn${showFilters ? ' on' : ''}`} onClick={() => setShowFilters((v) => !v)}>
            Filters
          </button>
          <button className="icon" onClick={() => setOpen(false)} title="Hide">
            –
          </button>
        </div>

        {snap.searchLabel && (
          <div className="ctx">
            Your search for <b>“{snap.searchLabel}”</b>
          </div>
        )}
        {snap.enriching > 0 && <div className="enrich">Getting vehicle details… {snap.enriching} to go</div>}

        <div className="sortbar">
          <span className="flabel">Sort</span>
          <Chip on={priceAsc} onClick={() => setSort(DEFAULT_SORT)}>
            Cheapest first
          </Chip>
          <Chip on={!priceAsc && !hasDeal} onClick={() => setSort([{ key: 'price', dir: 'desc' }, ...DEFAULT_SORT.slice(1)])}>
            Priciest first
          </Chip>
          <Chip on={hasDeal} onClick={() => setSort([{ key: 'deal', dir: 'asc' }, ...DEFAULT_SORT])}>
            Best deals first
          </Chip>
          <label className="sizer" title="Card size">
            <input type="range" min={260} max={580} step={20} value={tile} onChange={(e) => setTile(Number(e.target.value))} />
          </label>
        </div>

        <div className="scroll">
          {showFilters && (
            <div className="filters">
              {makes.length > 0 && (
                <Section label="Make">
                  <div className="chips">
                    {makes.map((m) => (
                      <Chip key={m} on={filters.makes?.includes(m)} onClick={() => set({ makes: toggleIn(filters.makes, m) })}>
                        {titleCase(m)}
                      </Chip>
                    ))}
                  </div>
                </Section>
              )}
              <div className="grid2">
                <Section label="Year">
                  <div className="range">
                    <input className="inp" placeholder="Any" defaultValue={filters.yearMin ?? ''} onBlur={(e) => set({ yearMin: num(e.target.value) })} />
                    <span>–</span>
                    <input className="inp" placeholder="Any" defaultValue={filters.yearMax ?? ''} onBlur={(e) => set({ yearMax: num(e.target.value) })} />
                  </div>
                </Section>
                <Section label="Price">
                  <div className="range">
                    <input className="inp" placeholder="Min" defaultValue={filters.priceMin ?? ''} onBlur={(e) => set({ priceMin: num(e.target.value) })} />
                    <span>–</span>
                    <input className="inp" placeholder="Max" defaultValue={filters.priceMax ?? ''} onBlur={(e) => set({ priceMax: num(e.target.value) })} />
                  </div>
                </Section>
                <Section label="Miles">
                  <div className="range">
                    <input className="inp" placeholder="0" defaultValue={filters.milesMin ?? ''} onBlur={(e) => set({ milesMin: num(e.target.value) })} />
                    <span>–</span>
                    <input className="inp" placeholder="Any" defaultValue={filters.milesMax ?? ''} onBlur={(e) => set({ milesMax: num(e.target.value) })} />
                  </div>
                </Section>
                <Section label="Keyword">
                  <input className="inp" placeholder="e.g. duramax" defaultValue={filters.keyword ?? ''} onBlur={(e) => set({ keyword: e.target.value })} />
                </Section>
              </div>
              <Section label="Fuel">
                <div className="chips">
                  {(['gas', 'diesel', 'hybrid', 'electric'] as FuelType[]).map((f) => (
                    <Chip key={f} on={filters.fuels?.includes(f)} onClick={() => set({ fuels: toggleIn(filters.fuels, f) })}>
                      {FUEL_LABEL[f]}
                    </Chip>
                  ))}
                </div>
              </Section>
              <Section label="Transmission">
                <div className="chips">
                  {(['automatic', 'manual'] as Transmission[]).map((t) => (
                    <Chip key={t} on={filters.transmissions?.includes(t)} onClick={() => set({ transmissions: toggleIn(filters.transmissions, t) })}>
                      {TRANS_LABEL[t]}
                    </Chip>
                  ))}
                </div>
              </Section>
              <Section label="Deal">
                <div className="chips">
                  {(['great', 'good', 'fair', 'high'] as DealBucket[]).map((d) => (
                    <Chip key={d} on={filters.deals?.includes(d)} onClick={() => set({ deals: toggleIn(filters.deals, d) })}>
                      {DEAL_LABEL[d]}
                    </Chip>
                  ))}
                </div>
              </Section>
              <div className="toggles">
                <Toggle on={!!filters.hideSoldPending} onClick={() => set({ hideSoldPending: !filters.hideSoldPending })}>
                  Hide sold &amp; pending
                </Toggle>
                <Toggle on={!!filters.titleCleanOnly} onClick={() => set({ titleCleanOnly: !filters.titleCleanOnly })}>
                  Clean title only
                </Toggle>
                <Toggle on={!!filters.privateOnly} onClick={() => set({ privateOnly: !filters.privateOnly })}>
                  Private sellers only
                </Toggle>
                <Toggle on={!!filters.hideSponsored} onClick={() => set({ hideSponsored: !filters.hideSponsored })}>
                  Hide sponsored
                </Toggle>
              </div>
            </div>
          )}

          {snap.schemaError && (
            <div className="banner error">
              <b>Couldn’t read Facebook’s results.</b>
              <div>Facebook may have changed its page format — the tool needs an update. Your filters are fine.</div>
            </div>
          )}
          {view.matchCount === 0 && view.poolCount > 0 && (
            <div className="banner empty">
              <b>Nothing matches these filters.</b>
              <div>{view.poolCount} vehicles loaded — loosen a filter to see them.</div>
            </div>
          )}
          {view.poolCount === 0 && !snap.schemaError && (
            <div className="banner empty">
              <b>Scroll Facebook’s results</b>
              <div>Vehicles show up here as you browse your search. Changed Facebook’s filters? Hit <b>Clear</b> and scroll again.</div>
            </div>
          )}

          {hiddenCount > 0 && (
            <div className="hiddenbar">
              <span>{hiddenCount} hidden</span>
              <button className="linkbtn" onClick={() => setShowHidden((v) => !v)}>
                {showHidden ? 'Hide them' : 'Show'}
              </button>
              {showHidden && (
                <button
                  className="linkbtn"
                  onClick={() => {
                    setHidden(new Set());
                    void hiddenItem.setValue([]);
                  }}
                >
                  Unhide all
                </button>
              )}
            </div>
          )}
          <ul className="results" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tile}px, 1fr))` }}>
            {view.listings.map((l) => (
              <Card key={l.id} l={l} seen={seen.has(l.id)} hidden={hidden.has(l.id)} onSeen={markSeen} onToggleHide={toggleHide} />
            ))}
          </ul>
        </div>
      </aside>
      {resizing && <div className="rz-overlay" />}
    </>
  );
}
