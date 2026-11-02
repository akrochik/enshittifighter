import { describe, it, expect } from 'vitest';
import { classify } from './capture/classify';
import { deriveSearchKey } from './searchKey';
import { isCaptureMessage, MS_SOURCE, MS_CAPTURE } from './capture/types';

describe('classify', () => {
  it.each([
    ['CometMarketplaceSearchContentContainerQuery', 'search'],
    ['CometMarketplaceSearchContentPaginationQuery', 'search'],
    ['MarketplacePDPContainerQuery', 'pdp'],
    ['CometMarketplaceSearchRootQuery', 'ignore'],
    ['MarketplaceSuggestionDataSourceQuery', 'ignore'],
    ['MAWSecureThreadQPContainerQuery', 'ignore'],
  ])('%s -> %s', (name, kind) => {
    expect(classify(name)).toBe(kind);
  });
});

describe('deriveSearchKey — text query only', () => {
  it('extracts and normalizes the query param', () => {
    expect(deriveSearchKey('https://www.facebook.com/marketplace/raleigh/search/?query=Silverado%202500&sortBy=x')).toBe('silverado 2500');
  });
  it('ignores location + FB filters (same query = same key)', () => {
    const a = deriveSearchKey('https://www.facebook.com/marketplace/raleigh/search/?query=f250&minPrice=5000');
    const b = deriveSearchKey('https://www.facebook.com/marketplace/durham/search/?query=f250&maxPrice=20000');
    expect(a).toBe(b);
  });
  it('non-search / junk urls yield empty key', () => {
    expect(deriveSearchKey('https://www.facebook.com/marketplace/item/123/')).toBe('');
    expect(deriveSearchKey('not a url')).toBe('');
  });
});

describe('isCaptureMessage', () => {
  it('accepts a well-formed message and rejects noise', () => {
    const payload = { transport: 'xhr', url: 'x', friendlyName: 'q', status: 200, body: '{}' };
    expect(isCaptureMessage({ source: MS_SOURCE, type: MS_CAPTURE, payload })).toBe(true);
    expect(isCaptureMessage({ source: MS_SOURCE, type: MS_CAPTURE, payload: { url: 'x' } })).toBe(false); // no body
    expect(isCaptureMessage({ source: MS_SOURCE, type: MS_CAPTURE, payload: { ...payload, body: 42 } })).toBe(false);
    expect(isCaptureMessage({ source: 'other', type: MS_CAPTURE, payload: {} })).toBe(false);
    expect(isCaptureMessage(null)).toBe(false);
    expect(isCaptureMessage({ hello: 1 })).toBe(false);
  });
});
