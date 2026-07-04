import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extractVehicleDetail, extractVehicleDetailFromHtml } from './pdpAdapter';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const read = (f: string): string => readFileSync(join(FIX, f), 'utf8');

describe('extractVehicleDetail — 2013 Ford F150 (pdp-vehicle-1)', () => {
  const r = extractVehicleDetail(read('pdp-vehicle-1.json'));

  it('pulls the structured vehicle fields', () => {
    expect(r.schemaMiss).toBe(false);
    expect(r.id).toBe('1277856354164190');
    const d = r.detail!;
    expect(d.fuel).toBe('gas');
    expect(d.transmission).toBe('automatic'); // the field that is 0% in titles
    expect(d.mileage).toBe(170000); // exact odometer
    expect(d.make).toBe('ford');
    expect(d.model).toContain('f150');
    expect(d.trim).toContain('fx4');
    expect(d.seller).toBe('private');
    expect(d.exteriorColor).toBe('blue');
    expect(d.titleStatus).toBe('clean');
  });
});

describe('extractVehicleDetail — 1995 Ford F150 (pdp-vehicle-2)', () => {
  const r = extractVehicleDetail(read('pdp-vehicle-2.json'));

  it('pulls fields the seller filled, omits the ones left blank', () => {
    const d = r.detail!;
    expect(d.fuel).toBe('gas');
    expect(d.transmission).toBe('automatic');
    expect(d.mileage).toBe(265000);
    expect(d.seller).toBe('private');
    expect(d.exteriorColor).toBe('black');
    expect(d.interiorColor).toBe('tan');
    expect(d.numberOfOwners).toBe(2);
    // seller left title status blank -> absent (unknown), never a fabricated value
    expect(d.titleStatus).toBeUndefined();
  });
});

describe('extractVehicleDetail — wrong/absent response', () => {
  it('a feed response (no PDP target) is a schema miss', () => {
    const r = extractVehicleDetail(read('search-content-container.json'));
    expect(r.schemaMiss).toBe(true);
    expect(r.detail).toBeNull();
  });

  it('garbage never throws', () => {
    expect(() => extractVehicleDetail('}{ not json')).not.toThrow();
    expect(extractVehicleDetail('}{ not json').schemaMiss).toBe(true);
  });
});

describe('extractVehicleDetailFromHtml — item-page HTML (active enrichment)', () => {
  // Mirrors the real FB embedding: the query result sits inside a
  // RelayPrefetchedStreamCache blob in a <script type="application/json"> tag.
  const target = {
    id: '999',
    vehicle_fuel_type: 'DIESEL',
    vehicle_transmission_type: 'MANUAL',
    vehicle_odometer_data: { unit: 'MILES', value: 88000 },
    vehicle_make_display_name: 'Ram',
    vehicle_seller_type: 'DEALER',
    vehicle_title_status: 'CLEAN',
  };
  const payload = { require: [['RelayPrefetchedStreamCache', 'next', [], [{ __bbox: { result: { data: { viewer: { marketplace_product_details_page: { target } } } } } }]]] };
  const html = `<!doctype html><html><head></head><body>
<script type="application/json" data-sjs>${JSON.stringify(payload)}</script>
<script type="application/json">{"unrelated":true}</script>
</body></html>`;

  it('finds and maps the embedded vehicle target', () => {
    const r = extractVehicleDetailFromHtml(html);
    expect(r.schemaMiss).toBe(false);
    expect(r.id).toBe('999');
    expect(r.detail).toMatchObject({ fuel: 'diesel', transmission: 'manual', mileage: 88000, make: 'ram', seller: 'dealer', titleStatus: 'clean' });
  });

  it('html without a vehicle target is a schema miss, not a throw', () => {
    const r = extractVehicleDetailFromHtml('<html><body><script type="application/json">{"x":1}</script></body></html>');
    expect(r.schemaMiss).toBe(true);
    expect(r.detail).toBeNull();
  });
});
