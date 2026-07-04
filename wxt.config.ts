import { defineConfig } from 'wxt';

// Chrome MV3 is the build target; WXT keeps a Firefox build a flag away.
export default defineConfig({
  srcDir: '.',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Enshittifighter',
    description: 'Fights Facebook Marketplace enshittification — real filters, real sorting, and the best deals up top.',
    version: '0.0.2',
    // Narrow: Marketplace only, and chrome.storage for saved searches/filters.
    host_permissions: ['https://www.facebook.com/marketplace/*'],
    permissions: ['storage'],
  },
});
