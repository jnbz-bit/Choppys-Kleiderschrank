# Choppys Kleiderschrank

Web-App (PWA) fürs iPhone: Kleidung fotografieren, automatisch ausschneiden lassen und am eigenen Ganzkörperfoto
zu Outfits kombinieren. Oberfläche im Stil einer Apple-eigenen App (iOS 26), hell und dunkel, sechs Akzentfarben.
Alles bleibt auf dem Gerät (IndexedDB), kein Server, kein Konto.

## Bereiche
- **Willkommen:** drei Seiten beim ersten Start (Einführung, Ganzkörperfoto, „Zum Home-Bildschirm“).
- **Anprobe:** Ganzkörperfoto (oder Platzhalterfigur) mit den angezogenen Teilen. Auf Oberkörper, Beinen oder Füßen
  wischen wechselt das Teil; unten Kategorien und Vorschaubilder. Werkzeuge: Zufall, Leeren (mit Rückgängig),
  Sitz anpassen (verschieben, mit zwei Fingern skalieren). „Sichern“ legt ein Outfit mit Wochentagen an.
- **Schrank:** alle Teile mit Suche, Kategorien und Sortierung; Detail mit Kategorie, Metall, Farbe, Favorit, Löschen;
  langes Drücken öffnet ein Kontextmenü.
- **Outfits:** Wochenleiste, Raster, Detail mit Anziehen, Teilen, Tagen und Löschen.
- **Teil scannen („+“):** Foto aufnehmen oder mehrere aus den Fotos wählen; Hintergrund wird auf dem iPhone entfernt,
  Kategorie, Farbe und Name werden vorgeschlagen.
- **Einstellungen:** Foto und Hilfslinien, Akzentfarbe, Erscheinungsbild, Form-Anpassung, Speicher, Sicherung
  erstellen/einlesen.

## Form-Anpassung
Aus dem freigestellten Ganzkörperfoto wird je Bildzeile die Breite von Rumpf und Beinen gemessen, beim Teil ebenso
(Ärmel werden ignoriert). Jede Zeile wird auf die Körperbreite an dieser Höhe gestreckt bzw. gestaucht (`src/fit.js`).
2D-Annäherung, keine echte 3D-Anprobe.

## Entwicklung
```bash
npm install
npm run dev        # lokal starten
npm run build      # Produktions-Build nach dist/
npm run preview    # Build ansehen (Service Worker aktiv)
```
Testhilfen: `?demo=1` (Beispielteile und Outfits in einer leeren Datenbank), `?demo=body` (zusätzlich gezeichnete
Figur als Körperfoto), `?gallery=1` (Schaukasten aller Bausteine), `?onboarding=1`, `?tab=schrank|outfits`.
Aufbau und Regeln: `docs/PLAN.md`, `docs/DESIGN.md`.

Das Freistell-Modell (`public/bgdata`, ca. 45 MB) wird von der eigenen Domain geladen und nach dem ersten Mal vom
Service Worker aus dem Cache bedient; die App läuft danach offline.

## Auf dem iPhone installieren
Seite in Safari öffnen → Teilen → „Zum Home-Bildschirm“. Als App bleiben die Daten dauerhaft erhalten.
