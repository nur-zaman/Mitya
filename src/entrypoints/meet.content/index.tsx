import { createRoot } from 'react-dom/client';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { Overlay } from './Overlay';
import { MeetWatcher } from './watcher';
import './overlay.css';

export default defineContentScript({
  matches: ['https://meet.google.com/*'],
  cssInjectionMode: 'ui',
  runAt: 'document_idle',

  async main(ctx) {
    const watcher = new MeetWatcher();
    watcher.start();
    ctx.onInvalidated(() => watcher.stop());

    const ui = await createShadowRootUi(ctx, {
      name: 'mitya-overlay',
      position: 'overlay',
      zIndex: 2147483000,
      anchor: 'body',
      onMount(container) {
        const root = createRoot(container);
        root.render(<Overlay watcher={watcher} />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();
  },
});
