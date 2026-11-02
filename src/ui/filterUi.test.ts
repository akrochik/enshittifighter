import { describe, it, expect } from 'vitest';
import { parseAmount, isBadAmount, activeChips, forNewSearch, sanitizeFilters, sanitizeSort, DEFAULT_FILTERS } from './filterUi';
import { shortAmount } from './format';

describe('parseAmount — what people type into a number box', () => {
  it.each<[string, number | undefined]>([
    ['15000', 15000],
    ['15,000', 15000],
    ['$15k', 15000],
    ['1.5k', 1500],
    ['150k mi', 150000],
    ['150,000 miles', 150000],
    ['2015', 2015],
    ['', undefined],
    ['  ', undefined],
    ['abc', undefined],
    ['-5', undefined],
    ['12abc', undefined], // not silently read as 12
  ])('%j -> %s', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it('blank is fine, garbage is flagged', () => {
    expect(isBadAmount('')).toBe(false);
    expect(isBadAmount('20k')).toBe(false);
    expect(isBadAmount('twenty')).toBe(true);
  });
});

describe('shortAmount', () => {
  it.each<[number, string]>([
    [850, '850'],
    [1500, '1.5k'],
    [15000, '15k'],
    [150000, '150k'],
  ])('%s -> %s', (n, s) => expect(shortAmount(n)).toBe(s));
});

describe('activeChips — one removable chip per restriction', () => {
  it('the defaults alone are not "active filters"', () => {
    expect(activeChips(DEFAULT_FILTERS)).toEqual([]);
  });

  it('labels ranges and removes only the chip clicked', () => {
    const f = { makes: ['chevrolet', 'gmc'], priceMax: 20000, milesMin: 50000, yearMin: 2011, yearMax: 2016, fuels: ['diesel' as const] };
    const chips = activeChips(f);
    expect(chips.map((c) => c.label)).toEqual(['Chevrolet', 'GMC', '2011–2016', '≤ $20k', '50k+ mi', 'Diesel']);
    expect(chips[0]!.clear).toEqual({ makes: ['gmc'] });
    expect(chips[2]!.clear).toEqual({ yearMin: undefined, yearMax: undefined });
  });

  it('includes keyword, listed-within and the detail toggles', () => {
    const chips = activeChips({ keyword: ' duramax ', listedWithinDays: 7, titleCleanOnly: true, privateOnly: true });
    expect(chips.map((c) => c.label)).toEqual(['“duramax”', 'Listed in last week', 'Clean title', 'Private sellers']);
  });
});

describe('forNewSearch', () => {
  it('drops make/model picks (they belong to the old pool) and keeps preferences', () => {
    const f = { makes: ['ford'], models: ['f-150'], priceMax: 20000, hideSponsored: true };
    expect(forNewSearch(f)).toEqual({ makes: undefined, models: undefined, priceMax: 20000, hideSponsored: true });
  });
  it('returns the same object when there is nothing to drop', () => {
    const f = { priceMax: 1 };
    expect(forNewSearch(f)).toBe(f);
  });
});

describe('sanitizeFilters / sanitizeSort — persisted state from any version', () => {
  it('garbage -> defaults', () => {
    expect(sanitizeFilters(null)).toEqual(DEFAULT_FILTERS);
    expect(sanitizeFilters('x')).toEqual(DEFAULT_FILTERS);
  });
  it('keeps well-typed fields, drops malformed ones', () => {
    const f = sanitizeFilters({ makes: ['ford'], priceMax: 20000, yearMin: 'old', hideSponsored: false, models: [1, 2], keyword: '' });
    expect(f).toEqual({ makes: ['ford'], priceMax: 20000, hideSponsored: false });
  });
  it('drops values outside a closed vocabulary (they would hide every known value)', () => {
    expect(sanitizeFilters({ fuels: ['propane', 'diesel'], deals: ['amazing'] })).toEqual({ fuels: ['diesel'] });
  });
  it('unknown sort -> cheapest', () => {
    expect(sanitizeSort('deal')).toBe('deal');
    expect(sanitizeSort('bogus')).toBe('cheapest');
    expect(sanitizeSort(undefined)).toBe('cheapest');
  });
});
