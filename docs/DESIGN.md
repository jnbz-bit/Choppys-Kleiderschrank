# Kleiderschrank – Design & API (verbindlich für alle View-Entwickler)

Ergänzt `docs/PLAN.md`. Hier steht, **wie** gebaut wird: Dateien, Verträge, JS-API, CSS-Klassen, Regeln.
Schaukasten aller Bausteine: **`/?gallery=1`** (hell/dunkel/Tint dort umschaltbar). Demo-Daten: **`/?demo=1`**
(leere DB → 21 gezeichnete Teile + 3 Outfits, `onboarded=true`), **`/?demo=body`** (zusätzlich gezeichnete Figur als
Körperfoto). Weitere URL-Parameter: `?tab=schrank|outfits|spiegel` (Start-Tab), `?onboarding=1` (Willkommen erzwingen).
Tipp: DB leeren in der Konsole: `indexedDB.deleteDatabase('kleiderschrank')`.

---

## 1. Dateien & Zuständigkeit

| Datei | Wer | Darf |
|---|---|---|
| `src/ui/*`, `src/app/*`, `src/main.js`, `index.html` | Fundament | Andere **nur ergänzen** (neue Funktionen/Klassen ans Ende), nie umbauen/umbenennen; im Bericht nennen |
| `src/views/<name>.js` + `<name>.css` | jeweiliger View-Entwickler | frei |
| Engine (`db, imaging, fit, render, model, silhouette`) | niemand | unverändert |

CSS der Views: **nur Klassen mit Präfix** `.mirror-…`, `.closet-…`, `.outfits-…`, `.scan-…`, `.settings-…`, `.onb-…`.
Keine globalen Selektoren (`button {}`, `.btn {}` …) überschreiben. Farben/Radien/Abstände ausschließlich über Variablen
aus `tokens.css`.

---

## 2. View-Vertrag

### Tab-Views (`mirror.js` → `spiegel`, `closet.js` → `schrank`, `outfits.js` → `outfits`)
```js
import './closet.css';
export default {
  id: 'schrank',                // muss zur Tab-ID passen
  title: 'Schrank',
  mount(container, ctx) {},    // EINMAL beim Start (nach boot), darf async sein
  onShow() {},                  // bei jedem Einblenden des Tabs (auch beim ersten Mal)
  onHide() {},                  // optional, beim Verlassen
  onReselect() {},              // optional, erneutes Tippen auf aktiven Tab (Standard: .page-scroller nach oben)
  unmount() {}                  // optional (Listener abmelden)
};
```
- `container` ist `section.tabview` (absolut, füllt den Bildschirm, `overflow:hidden`). Die View legt ihren Inhalt
  hinein – Standard ist `pageScaffold()` (siehe 4.1). Alle drei Views sind **gleichzeitig gemountet**; inaktive sind
  `aria-hidden`/`inert`/unsichtbar. Scroll-Position bleibt dadurch je Tab erhalten. **Nicht** bei jedem `onShow` neu aufbauen –
  auf Ereignisse reagieren (`on('items', …)`) und gezielt aktualisieren.
- `ctx` = `{ id, container, S, ui, I, on, emit, run, register, go, isActive(), setTabBarHidden(bool) }` (Bequemlichkeit;
  dasselbe gibt es per Import).
- Ein Fehler in einer View wird abgefangen (Hinweis „Dieser Bereich konnte nicht geladen werden.“); die anderen laufen weiter.

### Nebenmodule (`scan.js`, `settings.js`, `onboarding.js`)
Registrieren ihre Aktionen **beim Import** auf oberster Ebene: `register('openScan', fn)`. Optional
`export default { id, init(ctx) }` – `init` wird nach dem Laden aufgerufen.

### Aktionen (Registry `src/app/actions.js`)
Bereiche rufen sich **nur** darüber auf, nie per direktem Import einer anderen View.

| Aktion | Eigentümer | Signatur / Verhalten |
|---|---|---|
| `go` | main.js | `go(tabId, {keepOverlays})` – schließt offene Overlays (außer `keepOverlays`), wechselt Tab, Haptik, Ereignis `tab` |
| `setTabBarHidden` | main.js | `(bool)` – Tab-Leiste weg-/hereinfedern (z. B. Sitz-anpassen-Modus) |
| `openScan` | scan.js | `({cat?})` – Scannen-Sheet (large); `cat` = vorgewählte Kategorie |
| `openBodySetup` | scan.js | `()` – Ganzkörperfoto |
| `openGuides` | scan.js | `()` – Hilfslinien für vorhandenes Foto |
| `openItem` | closet.js | `(itemId)` – Teil-Detail-Sheet |
| `startAdjust` | mirror.js | `(itemId)` – wechselt in die Anprobe, Teil anziehen, Sitz-anpassen-Modus |
| `openOutfit` | outfits.js | `(outfitId)` – Outfit-Detail-Sheet |
| `openSaveOutfit` | outfits.js | `()` – „Outfit sichern“-Sheet (medium) aus aktueller Auswahl |
| `openSettings` | settings.js | `()` – Einstellungen (Sheet large) |
| `openOnboarding` | onboarding.js | `()` – Willkommen; von main.js aufgerufen, wenn `!S.settings.onboarded` |

```js
import { register, run, go, openItem } from '../app/actions.js';
register('openItem', (id) => { /* … */ });
run('openItem', id);          // generisch
openItem(id);                 // Kurzform, identisch
go('spiegel');                // Kurzform für run('go','spiegel')
```
`run()` vor dem Laden aller Module wartet automatisch; fehlt eine Aktion danach, gibt es nur eine Konsolen-Warnung.

---

## 3. Zustand: `src/app/state.js`

```js
import { S, on, emit, select, addItem, … } from '../app/state.js';
```

### Daten
`S = { items, outfits, body, settings, sel, cat, metal, tab, closetFilter, dayFilter, adjusting, ready }`
(Datenmodell siehe PLAN 1; `item.fav` ist neu.) **Daten nur über die Helfer unten ändern**, dann stimmen
IndexedDB, Bild-URLs, Render-Cache und Ereignisse. Reine UI-Felder (`S.cat`, `S.metal`, `S.closetFilter`, `S.dayFilter`,
`S.adjusting`) dürfen direkt gesetzt werden; danach bei Bedarf `persistSettings()` (für `cat`/`metal` nötig, sel/metal
werden mitgesichert).

### Ereignisse
`on(event, fn) → off()`, `once(event, fn)`, `emit(event, data)`, `on('*', (event, data) => …)`.

| Ereignis | Daten | ausgelöst von |
|---|---|---|
| `ready` | `S` | `boot()` |
| `items` | `{added}` \| `{updated, patch}` \| `{removed}` \| `{reloaded}` | addItem/updateItem/deleteItem/boot |
| `outfits` | `{added}` \| `{updated, patch}` \| `{removed}` \| `{reloaded}` | addOutfit/updateOutfit/deleteOutfit |
| `thumb` | `{id, url}` | refreshStaleThumbs – neues Vorschaubild eines Outfits |
| `body` | `S.body` | setBody |
| `sel` | `{changed:[cat…], sel}` | select/setSel/updateItem(cat)/deleteItem |
| `settings` | `{key, value}` | setSetting (+ `systemAppearance` bei Systemwechsel hell/dunkel) |
| `tab` | `{tab, prev}` | go |

Beispiel:
```js
const off = on('items', ({ added, removed }) => renderGrid());
// in unmount(): off();
```

### Lesende Helfer
| Funktion | Ergebnis |
|---|---|
| `itemById(id)`, `outfitById(id)` | Objekt oder `undefined` |
| `listFor(cat)` | Teile der Kategorie, neueste zuerst; Schmuck nach `S.metal` gefiltert |
| `countFor(cat)` | Anzahl (ungefiltert) |
| `byNewest` | Sortierfunktion |
| `urls` (Map), `ensureUrl(id)`, `itemUrl(id)`, `outfitUrl(id)` | Blob-URLs; Schlüssel `item.id`, `'outfit:'+id`, `'body'`. Nach `boot()` sind alle vorhanden |
| `bodyView()` | `{…S.body, src}` oder `SILHOUETTE` (`placeholder:true`) – für `layerFor/placeItem` |
| `warpOn()`, `hasOutfit()`, `isStandalone()`, `isDark()` | bool |
| `plannedToday()` | heute geplante Outfits (neueste zuerst) |
| `dateKey()` | `'2026-11-17'` (für `todayDismissed`) |
| `sameSel(a,b)`, `cleanSel(sel)`, `nextId(cat, dir)` | Vergleichen / gelöschte Teile entfernen / nächstes Teil inkl. „Ohne“ (`null`) |
| `outfitsWith(itemId)` | Outfits, die das Teil enthalten („In 2 Outfits“) |
| `missingIn(outfit)` | Anzahl gelöschter Teile im Outfit |
| `outfitSig(sel)` | Signatur für Vorschau-Aktualität |
| `TINTS`, `APPEARANCES` | `[{id,label,light,dark}]`, `[{id:'auto'|'light'|'dark',label}]` |
| `CATEGORIES`, `LAYER_ORDER`, `todayIndex` | aus model.js weitergereicht |

### Mutierende Helfer (alle speichern + lösen Ereignisse aus)
```js
select(cat, id)                 // → geänderte Kategorien; Kleid ⟷ Oberteil/Hose; 'sel'
setSel(sel)                     // ganze Auswahl (Zufall, Leeren, Rückgängig); 'sel'
setSetting(key, value)          // z. B. setSetting('warp', false); tint/appearance wenden sich sofort an
persistSettings()               // nur speichern (verzögert), kein Ereignis
saveItemsSoon()                 // S.items verzögert speichern (beim Ziehen), kein Ereignis
await addItem({cat,name,color,metal,w,h}, pngBlob)        // → item; 'items' {added}
await updateItem(id, {name|cat|metal|fit|fav}, blob?)     // → item; Render-Cache bei fit/cat/Bild geleert
await deleteItem(id)                                      // Bild, Auswahl, Cache; 'items' {removed}
await addOutfit({name, days, sel?})                       // komponiert Vorschaubild; 'outfits' {added}
await updateOutfit(id, {name|days})                       // 'outfits' {updated}
await deleteOutfit(id)                                    // 'outfits' {removed}
wearOutfit(id)                  // setSel(outfit.sel) – danach selbst go('spiegel')
await setBody({w,h,guides,cutout}, blob?)                 // Körperfoto/Hilfslinien; 'body'
await composeOutfit(sel)        // JPEG-Blob (mit SVG-Fallback)
refreshStaleThumbs()            // Promise; zeichnet veraltete Outfit-Bilder neu → 'thumb'
applyAppearance()               // Tint + Hell/Dunkel aus S.settings auf <html>, theme-color
await boot()                    // lädt alles neu (nach importBackup aufrufen) → alle Ereignisse
```
Sitz beim Ziehen: `item.fit = {...}` direkt setzen + `forgetItem` nicht nötig (layerKey enthält fit) + `saveItemsSoon()`;
am Ende `updateItem(id, {fit})` für Ereignis/Speichern.

---

## 4. UI-Bausteine: `src/ui/ui.js`

```js
import { sheet, actionSheet, alert, confirm, prompt, toast, contextMenu, bindLongPress, haptic,
  pageScaffold, segmented, searchField, button, iconButton, emptyState, setProgress, spinnerHTML,
  springAnimate, springEasing, transition, prefersReducedMotion, h, frag, esc, $, $$, clamp, wait, nextFrame,
  overlayOpen, closeAll, syncSlider } from '../ui/ui.js';
import { I } from '../ui/icons.js';
```
Druckzustand ist **global** aktiv (main.js ruft `initUI()`): `button`, `a[href]`, `label.btn`, `label.cell`,
`[role=button]`, `.pressable`, `.tile`, `.card.is-pressable` bekommen beim Berühren sofort `data-pressed`. Die Klassen
reagieren selbst darauf (skalieren über `--press`). Eigene Elemente: `.pressable` + `transform: scale(var(--press,1))` +
`[data-pressed]{--press:.96}`.

### 4.1 `pageScaffold(o)` – Seite mit großem Titel
```js
const page = pageScaffold({
  title: 'Schrank', subtitle: '21 Teile',
  trailing: [{ icon: I.gear, label: 'Einstellungen', onTap: () => openSettings() }], // Element oder Spezifikation
  leading: [],                       // optional
  search: { placeholder: 'Suchen', onInput: (t) => filter(t), onCancel },          // optional
  largeTitle: true,                  // false = nur kleiner Titel in der Leiste
  tabbar: true                       // false = kein Platz für Tab-Leiste unten
});
container.appendChild(page.root);
page.content.append(…);             // eigener Inhalt
// → {root, scroller, content, navBar, search, setTitle, setSubtitle, setTrailing([…]), setLeading([…]), scrollToTop()}
```
Spezifikation für Knöpfe: `{icon, label, onTap, variant:'plain'|'tint'|'filled', size:'small'|'large'}` → runder
Glas-Knopf; nur `label` ohne `icon` → kleine Glas-Kapsel. Der große Titel scrollt mit und geht in eine Glasleiste mit
kleinem Titel über (`--p`, `--nav-bg` an `.page`). Unten hält `.page-scroller` automatisch `var(--tabbar-space)` frei.
Tippen auf die Leiste scrollt nach oben.

### 4.2 `sheet(o)`
```js
const s = sheet({
  title: 'Outfit sichern',
  detent: 'medium',                         // 'medium' (schwebende Glas-Karte, Höhe nach Inhalt, max 64 %) | 'large'
  leading: { label: 'Abbrechen' },          // ohne onTap → schließt (reason 'cancel')
  trailing: { label: 'Sichern', bold: true, onTap: async (s, btn) => { await save(); s.close('done'); } },
  content: el,                              // Element oder HTML-String (oder html: '…')
  onClose: (reason) => {},                  // 'drag'|'backdrop'|'escape'|'cancel'|'done'|'programmatic'|eigener
  dismissible: true,                        // false: kein Wegziehen/Hintergrund-Tipp (federt nur)
  plain: false,                             // true: weißer statt grauer Grund (large)
  className: 'closet-detail', label: 'aria-Name ohne Titel'
});
s.body;                 // scrollender Inhalt (.sheet-body), Ränder 16px bereits gesetzt
s.setTitle('…'); s.setTrailingEnabled(false); s.setLeadingEnabled(true);
s.setTrailing({…}); s.setLeading({…}); s.setContent(elOderHtml);
await s.close('done');  // Promise nach Animation; s.closed = Promise<reason>
```
Header-Knöpfe: `{label, bold, destructive, disabled, onTap}` oder `{icon, label}` (runder Knopf, z. B. `I.close`).
Verhalten: federt von unten ein, Griff, folgt dem Finger 1:1 (ziehen vom Kopf oder wenn Inhalt oben ist), schließt ab
1/3 Höhe oder schnellem Wisch, sonst Feder zurück. Large: App dahinter skaliert zurück (Page-Sheet). Mehrere Sheets
stapelbar (unteres skaliert zurück). Escape schließt, Fokus bleibt im Sheet. Tastatur: Overlays folgen `visualViewport`,
fokussierte Felder werden in Sicht gescrollt. Elemente mit Klasse `.no-sheet-drag` (und Eingabefelder/Regler) starten
kein Ziehen – z. B. für eigene Zieh-Gesten im Sheet (Hilfslinien!).

### 4.3 Action Sheet, Alert, Bestätigung, Eingabe
```js
const v = await actionSheet({ title: '„Ringelshirt“ löschen?', message: 'Es wird auch aus 2 Outfits entfernt.',
  actions: [{ label: 'Löschen', destructive: true, value: 'delete' }], cancel: 'Abbrechen' }); // → value | null
const v2 = await alert({ title: 'Fehler', message: '…', buttons: [{ label: 'OK', value: true, bold: true }] });
const ok = await confirm({ title: 'Sicherung einlesen?', message: '…', confirmLabel: 'Einlesen', destructive: false }); // bool
const name = await prompt({ title: 'Umbenennen', value: 'Bürotag' });  // string | null
```
Nie `window.confirm/alert/prompt` benutzen.

### 4.4 Toast (HUD)
```js
toast('Im Schrank gesichert', { icon: I.checkCircleFill });
const t = toast('Outfit geleert', { icon: I.reset, action: { label: 'Rückgängig', onTap: undo }, duration: 4500 });
t.close();
```
`position: 'auto'` (Standard: über der Tab-Leiste; oben, wenn ein Overlay offen oder Tab-Leiste versteckt) | `'top'` | `'bottom'`.
Ein neuer Toast ersetzt den alten.

### 4.5 Kontextmenü + langes Drücken
```js
bindLongPress(grid, (tile) => contextMenu(tile, { actions: [
  { label: 'Anprobieren', icon: I.mirror, onTap: () => … },
  { label: 'Favorit', icon: I.heart, onTap: () => … },
  { label: 'Löschen', icon: I.trash, destructive: true, onTap: () => … }
] }), { selector: '.tile' });     // → unbind()
```
`bindLongPress(el, fn(target, event), {delay=500, selector})`: bricht bei Bewegung > 10 px/Scroll ab, unterdrückt den
folgenden Klick, iOS-Callout aus; Rechtsklick (Desktop) löst ebenfalls aus. `contextMenu` hebt eine Kopie an
(Canvas-Inhalte werden mitkopiert), Hintergrund unscharf, Menü darunter/darüber; `onTap` läuft nach dem Schließen an.

### 4.6 Weitere
```js
haptic('light'|'medium'|'heavy'|'selection'|'success'|'warning');   // bei Teilwechsel, Tab, Schalter (automatisch), Sichern, Menü (automatisch)
const seg = segmented({ items: [{value:'alle',label:'Alles'},{value:'gold',label:'Gold'}], value: 'alle', onChange: (v) => …, small: false, label: 'Metall' });
el.append(seg.el); seg.set('gold', { silent: true }); seg.value;     // auch segmented(vorhandenesElement)
const sf = searchField({ placeholder: 'Suchen', onInput, onCancel, onSubmit }); // {el,input,value,setValue,clear,blur}
button({ label: 'Sichern', icon: I.bookmark, variant: 'filled'|'tinted'|'gray'|'plain'|'glass'|'destructive', size: 'small'|'large', block: true, onTap });
iconButton({ icon: I.dice, label: 'Zufall', variant: ''|'plain'|'tint'|'filled', size: 'small'|'large', onTap });
emptyState({ icon: I.hanger, title: 'Der Schrank ist leer', text: '…', action: { label: 'Erstes Teil scannen', icon: I.camera, onTap } });
setProgress(progressEl, 0.42);  setProgress(progressEl, null /* unbestimmt */);
spinnerHTML(large?)             // iOS-Spinner als HTML
syncSlider(input)               // nach programmatischem input.value = … (Füllung des Reglers)
await springAnimate(el, [{transform:'scale(.9)'},{transform:'none'}], { spring: 'smooth'|'snappy'|'bouncy'|'sheet'|{response,damping}, velocity, delay, fill }).finished;
await transition(() => rerender());   // View Transition API mit Fallback
prefersReducedMotion(); overlayOpen(); await closeAll();
h('<div class="x">…</div>') → Element; frag(html) → Fragment; esc(text) → HTML-sicher
```

### 4.7 Symbole `src/ui/icons.js`
`I.<name>` = SVG-String (24er Raster, `currentColor`, Größe über CSS `width/height`). Vorhanden:
`mirror mirrorFill hanger hangerFill looks looksFill plus plusCircleFill minus close xmarkCircleFill check checkCircleFill
chevronRight chevronLeft chevronDown chevronUp back arrowLeft camera cameraFill photo image photoStack person personCircle
figure gear dice shuffle reset undo clear move adjust sliders rotate crop wand sparkles layers heart heartFill share trash
search sort filter calendar lock iphone lockIphone bookmark bookmarkFill save pencil ellipsis ellipsisCircle info
infoCircleFill warning download upload doc sun moon paintpalette tshirt eye hand swipe`.
Alle Symbole sichtbar unter `?gallery=1`. Neue Symbole nur am Ende von `I` ergänzen, gleicher Stil (Strich 1.7–2, runde Enden).

---

## 5. CSS – Variablen (`tokens.css`)

**Farben** (hell/dunkel automatisch; `html[data-appearance=light|dark]` erzwingt): `--bg` (grauer Grund),
`--bg-elevated` (Karten/Gruppen), `--bg-secondary`, `--bg-tertiary` (Fläche in Gruppe), `--bg-sheet`, `--fill`,
`--fill-2`, `--fill-3`, `--fill-4`, `--label`, `--label-2`, `--label-3`, `--label-4`, `--separator`, `--separator-opaque`,
`--red`, `--green`, `--yellow`, `--gold`, `--silver`, `--tint`, `--tint-soft`, `--tint-softer`, `--on-tint` (Text auf Tint),
`--scrim`, `--stage-top`, `--stage-bottom`, `--stage-shadow` (Studio-Bühne).
**Tint**: nur `var(--tint)` verwenden; gesetzt über `html[data-tint=rose|indigo|blue|mint|orange|graphite]` via
`setSetting('tint', id)`.
**Glas**: `--glass-bg`, `--glass-bg-strong`, `--glass-blur` (für `backdrop-filter` **und** `-webkit-backdrop-filter`),
`--glass` (box-shadow inkl. Innenrand) – oder einfach Klasse `.glass`.
**Schrift** (`font:`-Kurzform): `--text-large-title`, `--text-title1/2/3`, `--text-headline`, `--text-body`,
`--text-callout`, `--text-subhead`, `--text-footnote`, `--text-caption`, `--text-caption2`; Laufweite `--track-*`.
**Radien**: `--r-xs 10`, `--r-s 14`, `--r-m 18` (Kacheln), `--r-l 22` (Gruppen/Karten), `--r-xl 26`, `--r-sheet 34`, `--r-capsule`.
**Maße**: `--gap 16px`, `--gap-title 20px`, `--row-h 48px`, `--nav-h 52px`, `--tabbar-h 62px`, `--tap 44px`, `--hairline`
(0.5px auf Retina), `--safe-t/-b/-l/-r`, `--tabbar-bottom`, **`--tabbar-space`** (Abstand unten unter Tab-Leiste).
**Bewegung**: `--spring` (iOS-Sheet-Kurve), `--spring-bounce` (echte Feder via `linear()`), `--ease-out`, `--ease-in`,
`--dur-press 120ms`, `--dur-fast 220ms`, `--dur 380ms`, `--dur-slow 500ms` (bei reduzierter Bewegung kürzer).

## 6. CSS – Klassen (`base.css`, `components.css`) mit Schnipseln

**Text**: `.t-large-title .t-title1 .t-title2 .t-title3 .t-headline .t-body .t-callout .t-subhead .t-footnote .t-caption .t-caption2`,
`.t-bold .t-num (tabular) .t-center .t-truncate`, Farben `.c-2 .c-3 .c-tint .c-red`. Hilfen: `.glass .sr-only .stack .hstack .spacer .divider .no-select`.

**Knöpfe**
```html
<button class="btn btn-filled btn-large btn-block">…Foto aufnehmen</button>
<button class="btn btn-tinted">Getönt</button> <button class="btn btn-gray">Grau</button> <button class="btn btn-plain">Schlicht</button>
<button class="btn btn-destructive">Löschen</button> <button class="btn btn-filled btn-destructive">Löschen</button>
<button class="btn btn-glass btn-small">Glas</button>  <!-- über Bild/Bühne -->
<div class="btn-row">…2 Knöpfe nebeneinander…</div> <div class="btn-stack">…untereinander…</div>
<label class="btn btn-filled">${I.camera}Foto aufnehmen<input class="sr-only" type="file" accept="image/*" capture="environment"></label>
```
Größen: Standard 44 px, `.btn-small` 32 px, `.btn-large` 52 px. `.btn-label` = Text in `--label` statt Tint.

**Runde Glas-Knöpfe**: `<button class="icon-btn" aria-label="Zufall">${I.dice}</button>` · Modifikatoren
`.is-small` (36) `.is-large` (52) `.is-tint` `.is-filled` (Tint-Fläche) `.is-plain` (graue Fläche ohne Glas, z. B. Schließen im Sheet),
`aria-pressed="true"` → Tint. Badge: `<button class="icon-btn">…<span class="badge">3</span></button>`.

**Chips**
```html
<div class="chips" role="group" aria-label="Kategorie">            <!-- horizontal scrollend, Rand 16px, weiche Kanten -->
  <button class="chip" aria-pressed="true">Oberteile<span class="chip-count">5</span></button>
  <button class="chip" aria-pressed="false"><span class="metal-dot is-gold"></span>Gold</button>
</div>
<div class="chips is-wrap">…umbrechend, ohne Rand…</div>
```
Aktiv = `aria-pressed="true"` (dunkle Kapsel); `.chip.is-tinted` → aktiv in Tint; `.chip.on-glass` über Bildern.

**Segmented**: per JS `segmented({...})` (erzeugt `.segmented > .segmented-thumb + button[aria-pressed]`; `.is-small`).

**Schalter / Regler**
```html
<input type="checkbox" class="switch" checked>            <!-- 51×31, grün; .is-tint für Tint; Haptik automatisch -->
<div class="slider-row">${I.minus}<input type="range" class="slider" min="0.4" max="2.2" step="0.01" value="1">${I.plus}</div>
```

**Suchfeld**: per JS `searchField()` (Markup `.search > label.search-field + .search-cancel`).

**Listen (Inset Grouped)**
```html
<div class="list">
  <div class="list-header">Darstellung</div>              <!-- .is-prominent: großer Titel-Stil -->
  <div class="list-group">
    <label class="cell has-icon"><span class="cell-icon is-indigo">${I.wand}</span>
      <span class="cell-body"><span class="cell-title">An Körperform anpassen</span><span class="cell-subtitle">…</span></span>
      <input type="checkbox" class="switch"></label>
    <button class="cell"><span class="cell-body"><span class="cell-title">Foto ändern</span></span>
      <span class="cell-value">Rosé</span><span class="cell-chevron">${I.chevronRight}</span></button>
    <label class="cell"><input class="cell-input" placeholder="Name"></label>
    <button class="cell is-button">Sicherung erstellen</button>
    <button class="cell is-destructive">Löschen</button>
  </div>
  <p class="list-footer">Alle Daten bleiben auf diesem iPhone.</p>
</div>
```
`.cell-icon` Farben: Standard Tint, `.is-gray .is-green .is-blue .is-orange .is-red .is-indigo .is-plain`. Trenner werden
automatisch eingerückt (`.has-icon` → hinter dem Symbol). Im Sheet hat `.list` keinen Seitenrand (Sheet-Body hat ihn).
`.cell.is-center`, `.cell-check` (Haken rechts).

**Textfelder**: `<input class="textfield" placeholder="…">`, `<textarea class="textfield">`,
`<div class="field"><span class="field-label">Name</span><input class="textfield"></div>`,
`<input class="inline-edit" value="Ringelshirt">` (Title2, inline bearbeitbar).

**Karten / Banner**
```html
<button class="card"><div class="card-media"><img src="…"></div>
  <div class="card-body"><div class="card-title">Bürotag</div><div class="card-subtitle">Mo, Mi</div></div></button>
<div class="banner"><span class="banner-icon">${I.calendar}</span>
  <span class="banner-body"><span class="banner-title">Für heute geplant</span><span class="banner-text">Bürotag</span></span>
  <button class="btn btn-filled btn-small">Anziehen</button><button class="banner-close" aria-label="Ausblenden">${I.close}</button></div>
```
`.card-media` hat Studio-Verlauf und Seitenverhältnis 3:4; `.card-pad` für Text-Karten; `.banner.is-solid` ohne Glas.

**Raster & Kacheln**
```html
<h2 class="section-title">Oberteile<span class="count">5</span><button class="btn btn-plain">Alle</button></h2>
<div class="grid grid-3">
  <button class="tile" aria-label="Ringelshirt"><img src="…" alt="">
    <span class="tile-badge"><span class="metal-dot is-gold"></span>${I.heartFill}</span></button>
</div>
```
`.grid-2` (12 px Abstand) / `.grid-3` (8 px), Rand 16 px. `.tile` quadratisch, Bild mit 11 % Innenabstand und weichem
Schatten; `aria-pressed="true"`/`.is-selected` → Tint-Ring; `.tile.is-studio` Studio-Grund; `.tile-label` Beschriftung unten.

**Studio-Bühne**: `<div class="studio">…<div class="studio-floor" style="top:92%"></div></div>`.

**Leerzustand**: per JS `emptyState()`; Markup `.empty > .empty-symbol + .empty-title + .empty-text + .btn`, `.empty.is-fill` füllt Höhe.

**Fortschritt**: `<div class="progress"><i></i></div>` + `setProgress(el, v)`; `.progress.is-indeterminate`; Spinner `spinnerHTML()`.

**Badge & Punkte**: `.badge` (rot), `.badge.is-tint`, `.badge.is-gray`; `<span class="color-dot" style="--c:#C2333D"></span>`
(`.is-large`); `<span class="metal-dot is-gold|is-silber"></span>`; Tint-Auswahl
`<div class="swatches"><button class="swatch" style="--c:#FF2D55" aria-pressed="true"></button>…</div>`.

**Tages-Knöpfe**
```html
<div class="days" role="group" aria-label="Tage">
  <button class="day is-today" aria-pressed="false">Mo</button> … <button class="day" aria-pressed="true">So</button></div>
```

**Features (Willkommen/Anleitung)**: `<div class="feature-row">${I.camera}<div><div class="feature-title">…</div><div class="feature-text">…</div></div></div>`.

Sheets, Action Sheets, Alerts, Menüs, Toasts **nie selbst bauen** – immer die JS-Funktionen (Klassen `.sheet*`,
`.action-sheet`, `.as-*`, `.alert*`, `.cm-*`, `.toast*`, `.overlay-layer` sind intern).

---

## 7. Regeln

**Do**
- Unten scrollbare Inhalte: `padding-bottom: var(--tabbar-space)` (in `pageScaffold` schon drin). Nichts unter die Tab-Leiste legen.
- Oben `var(--safe-t)` beachten, wenn ohne `pageScaffold` gebaut wird (Spiegel!). Seitenränder 16 px (`--gap`), große Titel 20 px.
- Tippflächen ≥ 44×44. Schrift nie < 11 px; Eingabefelder ≥ 16 px (sonst zoomt iOS) – `.textfield`/`.cell-input` erledigen das.
- Nur `transform`/`opacity` animieren; Federn mit `springAnimate` oder `var(--spring)` / `var(--spring-bounce)`.
- Bilder/Kacheln: `-webkit-touch-callout:none` (für `img`, `.tile` schon global gesetzt).
- Bild-URLs nur aus `urls`/`itemUrl()`/`outfitUrl()`; nie selbst `URL.createObjectURL` für gespeicherte Bilder.
- Texte HTML-sicher mit `esc()` einsetzen. Deutsch, Du-Form, iOS-Wörter: Sichern, Fertig, Abbrechen, Löschen, Bearbeiten, Teilen, Weiter.
- Haptik bei: Teilwechsel im Spiegel, Sichern, eigenen Auswahl-Gesten (`haptic('selection')`). Tab-Wechsel, Schalter, Kontextmenü, Alerts machen es selbst.
- Für Listenänderungen `transition(() => …)` (View Transitions) verwenden, wo es Sinn ergibt.
- Hell **und** dunkel prüfen, sowie 375×667.

**Don't**
- Keine eigenen Farben (Hex) außer Systemfarben über Variablen; keine Rahmen-Linien statt Flächen; keine kleinen Radien (< 10 px).
- Kein `confirm()/alert()`, keine Browser-Standard-Elemente sichtbar (Range, Checkbox, Select → Klassen nutzen).
- Keine globalen CSS-Selektoren in View-CSS; keine `!important`; kein `position:fixed` in Views (außer gut begründet) – Overlays über `ui.js`.
- `S.items`/`S.outfits` nicht direkt verändern (außer `item.fit` beim Ziehen + `saveItemsSoon`).
- Andere Views nicht importieren – nur `run()`/Aktionen.
- Nicht bei jedem `onShow` komplett neu rendern (Flackern, Scroll-Verlust).

## 8. Bekannte Eigenheiten
- `composeOutfit` (Engine) zeichnet Outfit-Bilder auf festem Grund `#E1E4DD`. Für die Studio-Optik in Karten kann das Bild
  über `.card-media` mit `object-fit: cover` gezeigt werden; im Dunkelmodus bleibt der helle Grund sichtbar.
- Status-Leiste im Home-Bildschirm-Modus ist `black-translucent`: Inhalt liegt unter der Statusleiste → `--safe-t` beachten.
- Testen in Chrome: `-apple-system` gibt es dort nicht; Screenshots weichen in der Schrift leicht ab.
