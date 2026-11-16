// PLATZHALTER – wird vom Outfits-Entwickler ersetzt. Zeigt bereits Akzentfarbe + Erscheinungsbild (zum Testen).
import './settings.css';
import { S, setSetting, TINTS, APPEARANCES } from '../app/state.js';
import { register } from '../app/actions.js';
import { sheet, h, segmented } from '../ui/ui.js';

register('openSettings', () => {
  const content = h(`<div>
    <div class="list"><div class="list-header">Darstellung</div><div class="list-group">
      <div class="swatches" role="group" aria-label="Akzentfarbe">${TINTS.map((t) => `<button class="swatch" style="--c:${t.light}" data-tint="${t.id}" aria-label="${t.label}" aria-pressed="${(S.settings.tint || 'rose') === t.id}"></button>`).join('')}</div>
      <div class="cell" data-seg></div>
    </div><p class="list-footer">Platzhalter – vollständige Einstellungen folgen.</p></div></div>`);
  const seg = segmented({ items: APPEARANCES.map((a) => ({ value: a.id, label: a.label })), value: S.settings.appearance || 'auto', onChange: (v) => setSetting('appearance', v) });
  seg.el.style.flex = '1';
  content.querySelector('[data-seg]').appendChild(seg.el);
  content.addEventListener('click', (e) => {
    const b = e.target.closest('.swatch');
    if (!b) return;
    setSetting('tint', b.dataset.tint);
    content.querySelectorAll('.swatch').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  return sheet({ title: 'Einstellungen', detent: 'large', trailing: { label: 'Fertig', bold: true, onTap: (s) => s.close('done') }, content });
});

export default { id: 'settings' };
