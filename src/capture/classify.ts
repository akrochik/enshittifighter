// Which captured GraphQL responses we care about, keyed off the request's
// friendly name. Everything else (notifications, presence, typeahead, the many
// decoy queries) is ignored. This is the ONE spot that names FB's queries.

export type CaptureKind = 'search' | 'pdp' | 'ignore';

const SEARCH_CONTENT = /^CometMarketplaceSearchContent(Container|Pagination)Query$/;
const PDP = 'MarketplacePDPContainerQuery';

export function classify(friendlyName: string): CaptureKind {
  if (SEARCH_CONTENT.test(friendlyName)) return 'search';
  if (friendlyName === PDP) return 'pdp';
  return 'ignore';
}
