// PLATZHALTER – wird vom Outfits-Entwickler ersetzt. Vertrag: docs/DESIGN.md › View-Vertrag
import './outfits.css';
import { S, on, outfitById, outfitUrl, byNewest, refreshStaleThumbs, addOutfit, hasOutfit } from '../app/state.js';
import { register, run } from '../app/actions.js';
import { pageScaffold, emptyState, sheet, h, esc, toast } from '../ui/ui.js';
import { I } from '../ui/icons.js';
import { WEEKDAYS } from '../model.js';

register('openOutfit', (id) => {
  const o = outfitById(id);
  if (!o) return;
  sheet({ title: o.name, detent: 'large', leading: { label: 'Schließen' },
    content: h(`<div><div class="card" style="max-width:260px;margin:8px auto"><div class="card-media"><img src="${outfitUrl(id)}" alt=""></div></div><p class="t-subhead c-2 t-center" style="margin-top:16px">Outfit-Detail folgt.</p></div>`) });
});
register('openSaveOutfit', () => {
  if (!hasOutfit()) return toast('Zieh zuerst etwas an', { icon: I.info });
  const date = new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  const s = sheet({
    title: 'Outfit sichern', detent: 'medium',
    leading: { label: 'Abbrechen' },
    trailing: { label: 'Sichern', bold: true, onTap: async (sh) => { await addOutfit({ name: sh.body.querySelector('input').value }); sh.close('done'); toast('Unter Outfits gesichert', { icon: I.checkCircleFill }); } },
    content: h(`<div class="list"><div class="list-group"><label class="cell"><input class="cell-input" value="Outfit ${esc(date)}" aria-label="Name"></label></div><p class="list-footer">Platzhalter – Wochentage folgen.</p></div>`)
  });
  return s;
});

let page, box, offs = [];
function render() {
  page.setSubtitle(`${S.outfits.length} gesichert`);
  if (!S.outfits.length) {
    box.replaceChildren(emptyState({ icon: I.looks, title: 'Noch keine Outfits', text: 'Stell in der Anprobe ein Outfit zusammen und tippe auf „Sichern“.', action: { label: 'Zur Anprobe', onTap: () => run('go', 'spiegel') } }));
    return;
  }
  box.innerHTML = `<div class="grid grid-2">${[...S.outfits].sort(byNewest).map((o) => `<button class="card" data-id="${o.id}"><div class="card-media"><img src="${outfitUrl(o.id)}" alt=""></div><div class="card-body"><div class="card-title">${esc(o.name)}</div><div class="card-subtitle">${(o.days || []).length ? o.days.map((d) => WEEKDAYS[d]).join(', ') : 'Kein Tag geplant'}</div></div></button>`).join('')}</div>`;
}

export default {
  id: 'outfits',
  title: 'Outfits',
  mount(container) {
    page = pageScaffold({ title: 'Outfits', trailing: [{ icon: I.gear, label: 'Einstellungen', onTap: () => run('openSettings') }] });
    box = document.createElement('div');
    page.content.appendChild(box);
    container.appendChild(page.root);
    box.addEventListener('click', (e) => { const c = e.target.closest('.card'); if (c) run('openOutfit', c.dataset.id); });
    render();
    offs.push(on('outfits', render), on('thumb', ({ id, url }) => { const img = box.querySelector(`[data-id="${id}"] img`); if (img) img.src = url; }));
  },
  unmount() { offs.forEach((f) => f()); offs = []; },
  onShow() { refreshStaleThumbs(); }
};
