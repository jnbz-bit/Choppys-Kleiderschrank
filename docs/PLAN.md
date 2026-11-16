# Kleiderschrank – Bauplan v1 (verbindlich für alle Agenten)

Web-App (PWA) fürs iPhone, über Safari auf den Home-Bildschirm gelegt. Nutzerin: Julius' Freundin („Choppy“).
Sie fotografiert ihre Kleidung, die App schneidet sie aus, und sie stellt am eigenen Ganzkörperfoto Outfits
zusammen und speichert sie. Alle Daten bleiben auf dem iPhone (IndexedDB), kein Server, kein Login.

**Ziel dieser Runde:** fertige, auslieferbare App. Die Technik aus dem Prototyp bleibt, die gesamte Oberfläche
wird neu gebaut und muss sich anfühlen wie eine Apple-eigene iOS-App (iOS 26, „Liquid Glass“): ruhig, präzise,
flüssig. Kein Web-Look, kein Material-Look, keine generische Template-Optik.

Sprache der App: Deutsch, Du-Form, kurze klare Texte. Keine Emojis in der Oberfläche.

---

## 1. Was bleibt unangetastet (Engine)

Diese Dateien funktionieren und sind getestet. API nicht ändern, Verhalten nicht ändern. Nur Fehler beheben,
falls ein Test einen echten Fehler zeigt.

- `src/db.js` – IndexedDB (idb-keyval): `loadState, saveItems, saveOutfits, saveBody, saveSettings, saveImage, loadImage, deleteImage, requestPersistence, storageInfo, exportBackup, importBackup`
- `src/imaging.js` – `removeBg(file,{maxSide,onProgress}), trimCanvas, coverage, dominantColor, guessMetal, guessCategory, estimateGuides, loadBitmap, canvasFrom, toBlob, preloadRemover, defaultGuides`
- `src/fit.js` – Form-Anpassung (Warp) der Kleidung an die Körpersilhouette
- `src/render.js` – `layerFor(item,url,body,warp)`, `composeOutfit(...)`, `forgetItem(id)`
- `src/model.js` – `CATEGORIES, CAT, LAYER_ORDER, ZONE_DEFAULT, METALS, WEEKDAYS, todayIndex, placeItem, zoneBox, zoneAt, uid`
- `src/silhouette.js` – Platzhalterfigur
- `public/bgdata/**` – Freistell-Modell, `vite.config.js` PWA-Logik (Manifest-Farben dürfen angepasst werden)

Datenmodell (nicht brechen, bestehende Sicherungen müssen einlesbar bleiben):
- item: `{id, cat, name, color:{hex,name}, metal:'gold'|'silber'|null, w, h, created, fit:{dx,dy,s}|null}` (+ optional neu: `fav:boolean`)
- outfit: `{id, name, sel:{[cat]:itemId}, days:number[], created, sig}`
- body: `{w,h,guides:{s,h,a,floor,cx,w},cutout,updated}`; Bild unter Schlüssel `body`
- settings: `{sel, metal, warp, swiped, hideInstall, todayDismissed, ...}` (+ neu: `tint`, `onboarded`, `appearance`)

Der alte Monolith `src/main.js` + `src/style.css` (Branch-Stand) ist die **funktionale Referenz**: Jede Funktion,
die dort existiert, muss es in der neuen App weiter geben (Liste in Abschnitt 3). Logik darf 1:1 übernommen werden.
Die alte Datei bleibt als `docs/reference/main.old.js` und `docs/reference/style.old.css` zum Nachlesen liegen.

---

## 2. Design: wie eine Apple-eigene App

### Grundhaltung
- Inhalt zuerst: Ihre Kleidung und ihr Foto sind die Bühne. Chrome ist zurückhaltend und schwebt als Glas darüber.
- Ein Akzent (Tint), sonst Systemgrau-Töne. Viel Luft, klare Hierarchie, große Titel.
- Jede Interaktion antwortet sofort: Druckzustand, Federn, weiche Übergänge. Nichts springt, nichts ruckelt.

### Schrift
System-Schrift, keine Webfonts (die `@fontsource`-Pakete entfernen):
`font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, "Helvetica Neue", sans-serif;`
Größen nach iOS-Textstilen (Dynamic-Type-Standard):
Large Title 34/41 bold · Title1 28/34 bold · Title2 22/28 bold · Title3 20/25 semibold · Headline 17/22 semibold ·
Body 17/22 · Callout 16/21 · Subhead 15/20 · Footnote 13/18 · Caption 12/16. Letter-spacing wie iOS (große Titel leicht negativ, z. B. 34px: 0.37px→ in CSS `letter-spacing: .011em`; Body `-.022em`). Zahlen `font-variant-numeric: tabular-nums` wo sie sich ändern.

### Farben (CSS-Variablen, hell + dunkel automatisch über `prefers-color-scheme`, zusätzlich per `data-appearance` übersteuerbar)
iOS-Systemfarben verwenden:
- Hintergründe hell: `--bg: #F2F2F7` (systemGroupedBackground), `--bg-elevated: #FFFFFF`, `--bg-secondary: #FFFFFF`, `--fill: rgba(120,120,128,.20)`, `--fill-2: rgba(120,120,128,.16)`, `--fill-3: rgba(118,118,128,.12)`
- Hintergründe dunkel: `--bg: #000000`, `--bg-elevated: #1C1C1E`, `--bg-secondary: #1C1C1E`, darüber `#2C2C2E`, Fills `rgba(120,120,128,.36/.32/.24)`
- Text: `--label: #000 / #FFF`, `--label-2: rgba(60,60,67,.6) / rgba(235,235,245,.6)`, `--label-3: rgba(60,60,67,.3) / rgba(235,235,245,.3)`
- Trenner: `--separator: rgba(60,60,67,.29) / rgba(84,84,88,.6)`, 0.5px-Linien (`@media (min-resolution: 2dppx)` → `0.5px`)
- Systemfarben: Rot `#FF3B30/#FF453A` (destruktiv), Grün `#34C759/#30D158`, Gold-Punkt `#D4AF37`, Silber-Punkt `#C0C0C8`
- **Tint (Akzent):** Standard „Rosé“ `#FF2D55` (dunkel `#FF375F`). In den Einstellungen wählbar aus 6 Systemtönen:
  Rosé `#FF2D55`, Indigo `#5856D6`, Blau `#007AFF`, Mint `#00C7BE`, Orange `#FF9500`, Graphit `#8E8E93` (je mit Dunkel-Variante).
  Umsetzung: `--tint` auf `:root`, gesetzt aus `settings.tint`.
- Bühne (Spiegel): eigener ruhiger Verlauf als „Studio-Hintergrund“, hell `#FAFAFC → #E9E9EF`, dunkel `#1C1C1E → #0A0A0C`, mit weichem Bodenschatten unter der Figur.

### Materialien / Glas (iOS 26)
- Schwebende Elemente (Tab-Leiste, runde Werkzeug-Knöpfe über der Bühne, Navigationsleiste beim Scrollen, HUD-Toast):
  `background: color-mix(in srgb, var(--bg-elevated) 62%, transparent); -webkit-backdrop-filter: blur(24px) saturate(180%); backdrop-filter: …;`
  feiner Innenrand `box-shadow: inset 0 0 0 .5px rgba(255,255,255,.5), 0 8px 30px rgba(0,0,0,.12)` (dunkel: Innenrand `rgba(255,255,255,.12)`).
- Radien: Karten/Gruppen 20–26px (iOS 26 ist runder), Kacheln 18px, Knöpfe als Kapsel (`999px`), Sheets oben 34px (bzw. Geräteradius). `border-radius` möglichst mit weicher Anmutung; keine harten 4–8px-Ecken.
- Schatten sparsam, weich, groß. Keine harten Rahmen; Flächen statt Linien.

### Layout
- Viewport 390×844 (iPhone 15/16) ist das Hauptziel, 375×667 und 430×932 müssen sauber funktionieren.
- Safe-Areas überall: `env(safe-area-inset-*)`. App füllt `100dvh`, `overscroll-behavior: none` am Body, Scrollbereiche mit eigenem Momentum.
- Standard-Rand 16px (20px bei großen Titeln), Raster 8px. Mindest-Tippfläche 44×44.
- **Navigationsleiste:** große Titel (34px bold, linksbündig), die beim Scrollen in einen kleinen zentrierten 17px-Titel
  in einer Glasleiste übergehen. Rechts runde Glas-Knöpfe (36–44px) für Aktionen.
- **Tab-Leiste (iOS 26):** schwebende Glas-Kapsel unten, mit Abstand zum Rand (links 16px, unten `max(12px, safe-area)`),
  drei Tabs: **Anprobe** (Spiegel), **Schrank**, **Outfits**. Aktiver Tab: Tint-farbig, darunter eine weiche Glas-„Pille“,
  die beim Wechsel federnd zum neuen Tab gleitet. Rechts daneben, getrennt, ein runder Glas-Knopf **„+“** (Teil scannen).
- **Listen/Einstellungen:** „Inset Grouped“ – weiße Gruppen mit 20–26px Radius auf grauem Grund, Zeilen 44–52px,
  Trenner eingerückt, Chevron/Schalter rechts, Gruppen-Fußnoten in Footnote/label-2.
- **Sheets:** von unten, Griff oben (36×5px), Hintergrund abgedunkelt (`rgba(0,0,0,.3)`), Seite dahinter skaliert leicht zurück
  (0.94, Radius 12–16px) wie bei iOS-Page-Sheets. Mit dem Finger nach unten ziehbar zum Schließen (Feder zurück, wenn
  nicht weit genug). Detents: `medium` (ca. 55 %) und `large`. Kopfzeile: Titel zentriert 17px semibold, links „Abbrechen“,
  rechts fette Tint-Aktion („Fertig“/„Sichern“).
- **Bestätigungen:** nie `confirm()`/`alert()` des Browsers. Eigene iOS-Aktionsliste (Action Sheet von unten, destruktive
  Option rot, „Abbrechen“ separat) bzw. iOS-Alert (zentriert, 270px, Glas, zwei Knöpfe).
- **Kontextmenü:** Langes Drücken auf eine Kachel hebt sie an (scale 1.04, Schatten), Hintergrund wird unscharf,
  darunter erscheint ein Glas-Menü mit Aktionen (wie iOS Context Menu).
- **Segmented Control**, **Schalter** (51×31, grün), **Regler**, **Suchfeld** (36px hoch, Fill-Hintergrund, Lupe, „Abbrechen“)
  im iOS-Look nachbauen.
- **Leerzustände:** wie `ContentUnavailableView`: großes dünnes Symbol in label-2, Titel (Title2), ein Satz, eine Kapsel-Taste.

### Bewegung
- Federn statt linearer Kurven. Standard: `--spring: cubic-bezier(.32,.72,0,1)` (iOS-Sheet-Kurve), Dauer 350–500ms für
  Sheets/Navigation, 200–250ms für Druck/Hervorhebung. Für JS-Animationen Web Animations API oder
  `linear()`-Federkurven; Gesten folgen dem Finger 1:1 und federn mit Restgeschwindigkeit aus.
- Druckzustand jedes tippbaren Elements: `transform: scale(.96)` + leichte Abdunklung, sofort beim `pointerdown`.
- Tab-Wechsel: Inhalte blenden weich über (kein hartes Neuaufbauen mit Flackern). Zahlen/Listen-Änderungen animiert
  (View Transitions API verwenden, wo vorhanden, mit Fallback).
- Haptik: `ui.haptic()` – nutzt auf iOS den Trick mit einem versteckten `<input type="checkbox" switch>` + `<label>`
  (Safari ≥ 17.4 gibt dabei ein Tick), sonst `navigator.vibrate?.(8)`. Einsetzen bei: Teilwechsel im Spiegel, Tab-Wechsel,
  Schalter, Speichern, Kontextmenü.
- `prefers-reduced-motion`: Bewegungen auf kurze Überblendungen reduzieren.

### Symbole
Eigene Linien-Symbole im Stil von SF Symbols (keine Apple-Dateien kopieren): runde Enden, Strichstärke 1.7–2 bei 24px,
optisch mittig, je eine gefüllte Variante für aktive Tabs. In `src/ui/icons.js` als SVG-Strings.

### App-Icon & Splash
Neues Icon: Kleiderbügel-Symbol, weiß, auf weichem Rosé-Verlauf (`#FF6B8A → #FF2D55`), iOS-Proportionen.
`scripts/make-icons.mjs` anpassen und Icons neu erzeugen. `theme-color` je Hell/Dunkel (`#F2F2F7` / `#000000`),
`apple-mobile-web-app-status-bar-style: black-translucent`.

---

## 3. Funktionsumfang (alles muss am Ende funktionieren)

### Start / Onboarding (neu)
Beim ersten Start (`!settings.onboarded`): drei ruhige Seiten im Apple-„Willkommen“-Stil (großes Icon, „Willkommen bei
Kleiderschrank“, drei Merkmalszeilen mit Symbol + Titel + Satz, Kapsel-Taste „Weiter“). Danach: Ganzkörperfoto
hinzufügen (überspringbar → Platzhalterfigur) und Hinweis „Zum Home-Bildschirm“ (nur wenn nicht standalone).
Danach nie wieder zeigen.

### Tab „Anprobe“ (Spiegel) – Herzstück
- Bühne mit Körperfoto (oder Platzhalterfigur), darüber die Kleidungsebenen (`layerFor`), Studio-Hintergrund.
- Wischen links/rechts auf Oberkörper / Beinen / Füßen wechselt Teil der jeweiligen Zone, das Teil folgt dem Finger und
  gleitet federnd raus/rein; kleines Glas-Etikett zeigt „Oberteil 2/5“.
- Unten: Kategorie-Auswahl (horizontal scrollende Kapseln mit Anzahl) und Streifen mit Vorschaubildern inkl. „Ohne“;
  gewähltes Teil mit Tint-Ring. Bei Schmuck zusätzlich Segmented Control Alles / Gold / Silber.
- Kleid schließt Oberteil+Hose aus und umgekehrt (Logik `select()` aus Referenz).
- Werkzeuge als runde Glas-Knöpfe über der Bühne: Zufall (Würfeln mit gestaffelter Animation), Leeren (mit „Rückgängig“-HUD),
  Sitz anpassen (ein Finger verschieben, zwei Finger skalieren, Regler „Größe“, „Zurücksetzen“, „Fertig“).
- „Sichern“ → Sheet (medium): Name (vorbelegt „Outfit 17. Nov.“), Wochentage Mo–So als runde Tages-Knöpfe, „Sichern“.
- Banner als Glas-Karte oben: „Für heute geplant: … [Anziehen]“ (ausblendbar) bzw. „Dein Foto fehlt noch [Hinzufügen]“.
- Erster-Start-Hinweis „Auf Oberkörper, Beinen oder Füßen wischen“ als dezente animierte Geste, verschwindet nach erstem Wischen.

### Tab „Schrank“
- Großer Titel „Schrank“, darunter Suchfeld (Name/Farbe/Kategorie), Kategorie-Kapseln (Alle + Kategorien), Sortierung
  (Neueste / Farbe) über Menü-Knopf.
- Raster 3 Spalten, Kacheln quadratisch mit weichem Grund (`--bg-elevated`), freigestelltes Teil mittig mit Padding,
  bei Schmuck Metall-Punkt, bei Favoriten kleines Herz. Abschnittsüberschriften je Kategorie bei „Alle“.
- Tippen → Detail-Sheet (large): großes Bild auf Studio-Grund, Name (inline editierbar), Kategorie (Kapseln), Metall (bei Schmuck),
  erkannte Farbe, „In X Outfits“, Aktionen: Anprobieren, Sitz anpassen, Favorit, Löschen (Action Sheet).
- Langes Drücken → Kontextmenü: Anprobieren, Favorit, Löschen.
- Leerzustand mit Taste „Erstes Teil scannen“.

### Scannen (Sheet large, vom „+“ oder aus Leerzuständen)
Ablauf wie Referenz (`openScan` … `scanSave`), neu gestaltet:
1. Start: kurze Anleitung als drei Zeilen mit Symbolen, „Foto aufnehmen“ (Kamera, `capture=environment`), „Aus Fotos wählen“ (mehrere).
2. Verarbeitung: ruhige Fortschrittsanzeige (iOS-Fortschrittsbalken + Text „Wird ausgeschnitten … 42 %“, Hinweis „Passiert
   direkt auf dem iPhone“). Beim ersten Mal lädt das Modell (~45 MB) – das klar und freundlich anzeigen.
3. Ergebnis: Teil groß auf Studio-Grund mit sanftem Einblenden, „Drehen“, Kategorie-Kapseln (Vorschlag vorgewählt),
   Metall (nur Schmuck), Name (Platzhalter „Blaues Oberteil“), erkannte Farbe; „Verwerfen“ / „Sichern“.
4. Fehlerfall: „Kein Kleidungsstück erkannt“ → erneut, „Foto ohne Ausschneiden übernehmen“, ggf. „Überspringen“.
5. Warteschlange bei mehreren Fotos („2 von 5“). Nach dem Sichern: Teil ist im Spiegel angezogen.

### Ganzkörperfoto & Hilfslinien
Wie Referenz (`openBodySetup`, `processBody`, `openGuides`, `guidesSave`): Foto aufnehmen/wählen, freistellen,
drei ziehbare Linien (Schultern, Hüfte, Knöchel) + Regler „Körperbreite“. Neu gestaltet: Linien als Tint-Linien mit
Kapsel-Etikett und großem Griff, Lupe/Haptik beim Ziehen optional.

### Tab „Outfits“
- Großer Titel „Outfits“. Oben **Wochenleiste** Mo–So (heute hervorgehoben): je Tag ein kleines Vorschaubild des geplanten
  Outfits oder ein „+“. Tippen auf Tag filtert bzw. öffnet Auswahl.
- Darunter Raster 2 Spalten mit Outfit-Karten (Bild im Studio-Look, Name, Tage). Segmented Control „Alle / Diese Woche“.
- Tippen → Detail-Sheet: großes Bild, Name editierbar, Tage-Knöpfe, „Anziehen“ (wechselt in die Anprobe), „Teilen“
  (Bild über `navigator.share({files})`, Fallback Download), „Löschen“ (Action Sheet). Hinweis, wenn Teile fehlen.
- Langes Drücken → Kontextmenü: Anziehen, Teilen, Löschen.
- Vorschaubilder neu zeichnen, wenn sich Teile/Sitz/Foto ändern (`refreshStaleThumbs` aus Referenz).

### Einstellungen (Sheet large, über runden Knopf oben rechts in jedem Tab)
Inset-Grouped-Liste:
- **Mein Foto:** Vorschau, „Foto ändern“, „Hilfslinien anpassen“
- **Darstellung:** Akzentfarbe (6 Farbpunkte), Erscheinungsbild (Automatisch / Hell / Dunkel – Segmented), Schalter
  „Kleidung an Körperform anpassen“ (Warp)
- **Speicher:** „X Teile · Y Outfits · Z MB“, Status „Dauerhaft gespeichert“/Hinweis Home-Bildschirm, „Sicherung erstellen“
  (Share/Download), „Sicherung einlesen“ (mit iOS-Alert-Bestätigung)
- **Info:** Version, „Alle Daten bleiben auf diesem iPhone.“

### Sonstiges
- Installations-Hinweis (nur in Safari, nicht standalone): dezente Glas-Karte mit Teilen-Symbol „Zum Home-Bildschirm“.
- Offline lauffähig (Service Worker bleibt). Update leise.
- Demo-Daten: `?demo=1` füllt eine **leere** Datenbank mit gezeichneten Beispielteilen (siehe `src/dev/seed.js`) – zum Testen.

---

## 4. Architektur

Kein Framework. Vanilla JS (ES-Module), Vite, bestehende Abhängigkeiten. Keine neuen Laufzeit-Abhängigkeiten ohne Not.

```
index.html
src/
  main.js              Start, Tab-Gerüst, lädt Views (Fundament)
  app/state.js         Zustand S, Bild-URLs, Helfer, Ereignisse (Fundament)
  ui/tokens.css        Farben, Schrift, Maße, Kurven (Fundament)
  ui/base.css          Reset, Layout-Gerüst, Navigationsleiste, Tab-Leiste (Fundament)
  ui/components.css    Knöpfe, Kapseln, Listen, Sheets, Alerts, Menüs, Schalter … (Fundament)
  ui/ui.js             sheet(), actionSheet(), alert(), toast(), contextMenu(), haptic(), navBar(), … (Fundament)
  ui/icons.js          Symbole (Fundament)
  views/mirror.js + mirror.css        Tab Anprobe  (Agent Spiegel)
  views/closet.js + closet.css        Tab Schrank + Teil-Detail (Agent Schrank)
  views/scan.js + scan.css            Scannen, Ganzkörperfoto, Hilfslinien (Agent Schrank)
  views/outfits.js + outfits.css      Tab Outfits + Outfit-Detail + Sichern-Sheet-Logik (Agent Outfits)
  views/settings.js + settings.css    Einstellungen (Agent Outfits)
  views/onboarding.js + onboarding.css  Willkommen (Agent Outfits)
  dev/seed.js          Demo-Daten (Fundament)
  db.js imaging.js fit.js render.js model.js silhouette.js   Engine (unverändert)
docs/DESIGN.md         Vom Fundament-Agenten: genaue API von state.js und ui.js + Klassenliste, mit Beispielen
```

### Verträge zwischen den Modulen (vom Fundament festzulegen und in docs/DESIGN.md zu dokumentieren)
- Jede View exportiert `export default { id, title, mount(container, ctx), unmount?(), onShow?() }`.
  `main.js` lädt Views per `import()` mit try/catch, damit ein Fehler in einer View die anderen nicht mitreißt.
- `state.js` exportiert mindestens: `S`, `urls`, `ensureUrl`, `setUrl`, `itemById`, `listFor(cat)`, `select(cat,id)`,
  `persistSettings()`, `saveItemsSoon()`, `bodyView()`, `warpOn()`, `hasOutfit()`, `on(event, fn)`, `emit(event, data)`,
  `boot()`. Ereignisse: `items`, `outfits`, `body`, `sel`, `settings`, `tab`.
- Navigation zwischen Bereichen ausschließlich über `ctx`/Exports aus `main.js` bzw. `state.js`:
  `go(tabId)`, `openScan({cat})`, `openBodySetup()`, `openGuides()`, `openSettings()`, `openItem(id)`, `openOutfit(id)`,
  `openSaveOutfit()`, `startAdjust(itemId)`. Das Fundament legt dafür eine kleine Registry an (`app/actions.js`:
  `register(name, fn)`, `run(name, ...args)`), damit Views sich gegenseitig aufrufen können, ohne sich direkt zu importieren.

---

## 5. Arbeitsregeln für Agenten

- Arbeitsverzeichnis: `/home/claude/choppys-kleiderschrank`, Branch `app-v1`. **Nicht pushen, kein `git commit`**, außer es
  steht ausdrücklich im Auftrag. Keine Branch-Wechsel.
- Nur die eigenen Dateien bearbeiten (Abschnitt 4). Gemeinsame Dateien (`ui/*`, `app/*`, `main.js`) nur **ergänzen**, nie
  umbauen oder umbenennen, und im Abschlussbericht nennen.
- Nicht `npm run build` ins gemeinsame `dist/` laufen lassen, solange andere parallel arbeiten:
  `npx vite build --outDir /tmp/dist-<name> --emptyOutDir` und eigener Dev-Port (wird im Auftrag genannt).
- Testen im echten Browser in iPhone-Größe, nicht nur „baut fehlerfrei“:
  Python-Playwright mit `executable_path='/usr/bin/google-chrome'`, `args=['--no-sandbox']`, Viewport 390×844,
  `device_scale_factor=3`, `is_mobile=True`, `has_touch=True`, iPhone-User-Agent. Screenshots nach `/tmp/shots-<name>/`
  und **selbst ansehen** (Read-Tool). Hell **und** Dunkel prüfen (`color_scheme='dark'`). Konsole muss fehlerfrei sein.
  Demo-Daten über `?demo=1`.
- Qualitätsmaßstab: Würde das als Bildschirmfoto neben Apples Fotos-, Fitness- oder Journal-App fremd wirken? Dann nachbessern.
  Typische Fehler vermeiden: zu kleine Schrift, harte Ränder, zu viele Farben, gedrängte Abstände, Standard-Browser-Elemente,
  Text der umbricht/abschneidet, Elemente unter der Tab-Leiste oder im Notch-Bereich.
- Texte Deutsch, Du-Form, iOS-typische Begriffe: Sichern, Fertig, Abbrechen, Löschen, Bearbeiten, Teilen, Weiter.
- Abschlussbericht kurz: was gebaut, was getestet (mit Screenshot-Pfaden), was offen ist, welche gemeinsamen Dateien ergänzt wurden.
