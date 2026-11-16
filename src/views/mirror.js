// PLATZHALTER – wird vom Spiegel-Entwickler ersetzt. Vertrag: docs/DESIGN.md › View-Vertrag
import './mirror.css';
import { S, on, hasOutfit } from '../app/state.js';
import { register, run } from '../app/actions.js';
import { pageScaffold, emptyState, iconButton, toast } from '../ui/ui.js';
import { I } from '../ui/icons.js';

// Aktionen dieses Bereichs
register('startAdjust', (itemId) => {
  toast('Sitz anpassen folgt', { icon: I.move });
});

let page, offs = [];

export default {
  id: 'spiegel',
  title: 'Anprobe',
  mount(container, ctx) {
    page = pageScaffold({
      title: 'Anprobe',
      subtitle: new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }),
      trailing: [
        { icon: I.bookmark, label: 'Outfit sichern', onTap: () => run('openSaveOutfit') },
        { icon: I.gear, label: 'Einstellungen', onTap: () => run('openSettings') }
      ]
    });
    page.content.appendChild(emptyState({
      icon: I.mirror,
      title: 'Anprobe',
      text: 'Hier entsteht der Spiegel mit deinem Foto und der Kleidung.',
      action: { label: 'Teil scannen', icon: I.camera, onTap: () => run('openScan', {}) }
    }));
    container.appendChild(page.root);
    offs.push(on('sel', () => {}));
  },
  unmount() { offs.forEach((f) => f()); offs = []; },
  onShow() {}
};
