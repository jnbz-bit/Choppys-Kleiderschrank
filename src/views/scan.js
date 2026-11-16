// PLATZHALTER – wird vom Schrank-Entwickler ersetzt (Scannen, Ganzkörperfoto, Hilfslinien).
// Nebenmodul: registriert seine Aktionen beim Import. Vertrag: docs/DESIGN.md
import './scan.css';
import { register } from '../app/actions.js';
import { sheet, h } from '../ui/ui.js';
import { I } from '../ui/icons.js';

const placeholder = (title, text) => sheet({
  title, detent: 'large', leading: { label: 'Abbrechen' },
  content: h(`<div class="empty">${'<div class="empty-symbol">' + I.camera + '</div>'}<div class="empty-title">${title}</div><p class="empty-text">${text}</p></div>`)
});

register('openScan', (opts = {}) => placeholder('Teil scannen', 'Scannen folgt.' + (opts.cat ? ` (Kategorie: ${opts.cat})` : '')));
register('openBodySetup', () => placeholder('Dein Foto', 'Ganzkörperfoto folgt.'));
register('openGuides', () => placeholder('Hilfslinien', 'Hilfslinien folgen.'));

export default { id: 'scan' };
