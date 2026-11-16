// PLATZHALTER – wird vom Schrank-Entwickler ersetzt. Vertrag: docs/DESIGN.md › View-Vertrag
import './closet.css';
import { S, on, itemById, itemUrl, byNewest, select, deleteItem } from '../app/state.js';
import { register, run, go } from '../app/actions.js';
import { pageScaffold, emptyState, sheet, h, esc, bindLongPress, contextMenu, confirm, toast } from '../ui/ui.js';
import { I } from '../ui/icons.js';

register('openItem', (id) => {
  const it = itemById(id);
  if (!it) return;
  sheet({
    title: it.name,
    detent: 'large',
    leading: { label: 'Schließen' },
    content: h(`<div><div class="tile is-studio" style="max-width:240px;margin:8px auto 20px"><img src="${itemUrl(id)}" alt=""></div>
      <p class="t-subhead c-2 t-center">Teil-Detail folgt.</p></div>`)
  });
});

let page, grid, offs = [];
function render() {
  page.setSubtitle(`${S.items.length} ${S.items.length === 1 ? 'Teil' : 'Teile'}`);
  if (!S.items.length) {
    grid.replaceChildren(emptyState({ icon: I.hanger, title: 'Der Schrank ist leer', text: 'Fotografiere ein Kleidungsstück, die App schneidet es aus und legt es hier ab.', action: { label: 'Erstes Teil scannen', icon: I.camera, onTap: () => run('openScan', {}) } }));
    return;
  }
  grid.innerHTML = `<div class="grid grid-3">${[...S.items].sort(byNewest).map((i) => `<button class="tile" data-id="${i.id}" aria-label="${esc(i.name)}"><img src="${itemUrl(i.id)}" alt="" loading="lazy">${i.metal ? `<span class="tile-badge"><span class="metal-dot is-${i.metal}"></span></span>` : ''}</button>`).join('')}</div>`;
}

export default {
  id: 'schrank',
  title: 'Schrank',
  mount(container) {
    page = pageScaffold({
      title: 'Schrank',
      search: { placeholder: 'Suchen' },
      trailing: [{ icon: I.gear, label: 'Einstellungen', onTap: () => run('openSettings') }]
    });
    grid = document.createElement('div');
    page.content.appendChild(grid);
    container.appendChild(page.root);
    grid.addEventListener('click', (e) => { const t = e.target.closest('.tile'); if (t) run('openItem', t.dataset.id); });
    bindLongPress(grid, (tile) => {
      const it = itemById(tile.dataset.id);
      contextMenu(tile, { actions: [
        { label: 'Anprobieren', icon: I.mirror, onTap: () => { select(it.cat, it.id); go('spiegel'); } },
        { label: 'Löschen', icon: I.trash, destructive: true, onTap: async () => { if (await confirm({ title: `„${it.name}“ löschen?`, confirmLabel: 'Löschen', destructive: true })) { await deleteItem(it.id); toast('Gelöscht'); } } }
      ] });
    }, { selector: '.tile' });
    render();
    offs.push(on('items', render));
  },
  unmount() { offs.forEach((f) => f()); offs = []; }
};
