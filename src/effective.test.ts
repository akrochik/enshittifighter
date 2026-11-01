import { describe, it, expect } from 'vitest';
import { mkListing } from './_testkit';
import { effMake, effModel } from './effective';
import { applyFilters } from './filters';
import { parseVehicleTitle } from './parser';

const fromTitle = (id: string, title: string) => mkListing({ id, rawTitle: title, vehicle: parseVehicleTitle(title) });

describe('effective make/model — title and detail page agree', () => {
  it('folds Facebook detail names into the title vocabulary', () => {
    const l = mkListing({ detail: { make: 'mercedes-benz', model: 'glk-class' } });
    expect(effMake(l)).toBe('mercedes-benz');
    expect(effModel(l)).toBe('glk');
  });

  it('an unrecognized detail model falls back to the title model', () => {
    const l = mkListing({
      vehicle: { confidence: 'full', make: 'mercedes-benz', model: 'gle' },
      detail: { make: 'mercedes-benz', model: '🔥 must see 🔥' },
    });
    expect(effModel(l)).toBe('gle');
  });

  it('make filter on Mercedes-Benz drops Audis and Porsches parsed from titles', () => {
    const pool = [
      fromTitle('glk', '2014 Mercedes-Benz glk 350 4 matic'),
      fromTitle('porsche', '2014 Porsche Cayenne · GTS Sport Utility 4D'),
      fromTitle('audi', '2018 Audi Q5 Premium Plus'),
      mkListing({ id: 'enriched', detail: { make: 'mercedes-benz', model: 'gl-class' } }),
    ];
    const out = applyFilters(pool, { makes: ['mercedes-benz'] }).map((l) => l.id);
    expect(out.sort()).toEqual(['enriched', 'glk']);
    expect(applyFilters(pool, { models: ['glk'] }).map((l) => l.id)).toEqual(['glk']);
  });
});
