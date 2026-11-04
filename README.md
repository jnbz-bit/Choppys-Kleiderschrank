# Choppys Kleiderschrank

Web-App (PWA) für das iPhone: Kleidung fotografieren, automatisch ausschneiden lassen und am eigenen Ganzkörperfoto zu Outfits kombinieren.

## Funktionen
- **Teil scannen:** Foto aufnehmen oder aus der Mediathek wählen (auch mehrere). Der Hintergrund wird direkt auf dem Gerät entfernt, Kategorie und Farbe werden vorgeschlagen.
- **Spiegel:** Ganzkörperfoto als Model. Auf Oberkörper, Beinen oder Füßen wischen wechselt Oberteil, Hose/Rock oder Schuhe. Kategorien: Oberteile, Jacken, Kleider, Hosen & Röcke, Socken, Schuhe, Schmuck (Gold/Silber).
- **Form-Anpassung:** Oberteile, Jacken, Kleider und Hosen folgen der Silhouette auf dem Foto (Taille, Hüfte, Beine) und bekommen eine leichte Schattierung. In den Einstellungen abschaltbar.
- **Sitz anpassen:** Mit einem Finger verschieben, mit zwei Fingern skalieren; das merkt sich die App pro Teil.
- **Zufalls-Outfit, Leeren mit Rückgängig, Hinweis auf das für heute geplante Outfit.**
- **Outfits:** Kombinationen speichern und Wochentagen zuordnen.
- **Speicherung:** Alles bleibt dauerhaft auf dem iPhone (IndexedDB), kein Server. Sicherung als Datei exportier- und importierbar.

## Wie die Form-Anpassung funktioniert
Aus dem freigestellten Ganzkörperfoto wird pro Bildzeile die Breite von Rumpf und Beinen gemessen, beim Kleidungsstück ebenso (Ärmel werden dabei ignoriert). Jede Zeile des Teils wird dann so gestreckt bzw. gestaucht und verschoben, dass sie zur Körperbreite auf dieser Höhe passt, geglättet über mehrere Zeilen (`src/fit.js`). Das ist eine 2D-Annäherung, keine echte 3D-Anprobe.

## Entwicklung
```bash
npm install
npm run dev      # lokal starten
npm run build    # Produktions-Build nach dist/
```

Das Freistell-Modell (`public/bgdata`, ca. 45 MB plus Laufzeit) wird von der eigenen Domain geladen und nach dem ersten Mal vom Service Worker aus dem Cache bedient.

## Auf dem iPhone installieren
Seite in Safari öffnen, Teilen-Symbol, „Zum Home-Bildschirm“.
