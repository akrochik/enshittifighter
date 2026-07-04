import { defineConfig } from 'wxt';

// Chrome MV3 is the build target; WXT keeps a Firefox build a flag away.
export default defineConfig({
  srcDir: '.',
  manifest: {
    name: 'Marketplace Sift',
    description: 'Cleaner filtering and sorting for Facebook Marketplace vehicle search.',
    version: '0.0.1',
    // Narrow: Marketplace only, and chrome.storage for saved searches/filters.
    host_permissions: ['https://www.facebook.com/marketplace/*'],
    permissions: ['storage'],
  },
});
