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
      /**
       * Sem isso, os eventos de teclado digitados no popup borbulham para fora
       * do shadow root e a página reage a eles (atalhos, busca interna, etc.).
       */
      isolateEvents: ['keydown', 'keyup', 'keypress'],
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
