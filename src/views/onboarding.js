// PLATZHALTER – wird vom Outfits-Entwickler ersetzt (Willkommen-Ablauf).
import './onboarding.css';
import { setSetting } from '../app/state.js';
import { register } from '../app/actions.js';
import { sheet, h, button } from '../ui/ui.js';
import { I } from '../ui/icons.js';

register('openOnboarding', () => {
  const content = h(`<div class="empty"><div class="empty-symbol">${I.hanger}</div><div class="empty-title">Willkommen bei Kleiderschrank</div><p class="empty-text">Platzhalter – der Willkommen-Ablauf folgt.</p></div>`);
  const s = sheet({ detent: 'large', dismissible: false, label: 'Willkommen', content });
  content.appendChild(button({ label: 'Weiter', variant: 'filled', size: 'large', block: true, onTap: () => { setSetting('onboarded', true); s.close('done'); } }));
  return s;
});

export default { id: 'onboarding' };
