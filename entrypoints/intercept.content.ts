// MAIN-world capture hook. Must run at document_start so it patches fetch/XHR
// before Facebook grabs its own references. See src/capture/hook.ts.
import { installCaptureHook } from '../src/capture/hook';

export default defineContentScript({
  matches: ['https://www.facebook.com/marketplace/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    installCaptureHook();
  },
});
