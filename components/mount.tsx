import ReactDOM from 'react-dom/client';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { App } from './App';
import type { UiStore, SiftActions } from '../src/ui/uiStore';

// Mount the panel inside an isolated shadow root so Facebook's CSS can't reach in
// and ours can't leak out — satisfies the "independent sidebar, no DOM surgery" rule.
export async function mountSidebar(ctx: ContentScriptContext, store: UiStore, actions: SiftActions): Promise<void> {
  const ui = await createShadowRootUi(ctx, {
    name: 'marketplace-sift',
    position: 'inline',
    anchor: 'body',
    append: 'last',
    onMount(container) {
      const root = ReactDOM.createRoot(container);
      root.render(<App store={store} actions={actions} />);
      return root;
    },
    onRemove(root) {
      root?.unmount();
    },
  });
  // The relay runs at document_start to catch early captures, but the panel
  // anchors to <body> — wait for it before mounting.
  if (!document.body) {
    await new Promise<void>((resolve) => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
  }
  ui.mount();
}
