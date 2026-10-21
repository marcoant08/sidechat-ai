import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',
  runAt: 'document_idle',

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'sidechat-ai',
      position: 'overlay',
      zIndex: 2147483646,
      onMount(container) {
        const root = createRoot(container);
        root.render(<App />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });

    ui.mount();
  },
});
