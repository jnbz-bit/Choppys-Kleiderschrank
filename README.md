# Choppys Kleiderschrank

Web-App (PWA) für das iPhone: Kleidung fotografieren, automatisch ausschneiden lassen und am eigenen Ganzkörperfoto zu Outfits kombinieren.

## Funktionen
- **Teil scannen:** Foto aufnehmen oder aus der Mediathek wählen (auch mehrere). Der Hintergrund wird direkt auf dem Gerät entfernt, Kategorie und Farbe werden vorgeschlagen.
- **Spiegel:** Ganzkörperfoto als Model. Auf Oberkörper, Beinen oder Füßen wischen wechselt Oberteil, Hose/Rock oder Schuhe. Kategorien: Oberteile, Jacken, Kleider, Hosen & Röcke, Socken, Schuhe, Schmuck (Gold/Silber).
- **Sitz anpassen:** Jedes Teil lässt sich verschieben und in der Größe ändern; das merkt sich die App.
- **Outfits:** Kombinationen speichern und Wochentagen zuordnen.
- **Speicherung:** Alles bleibt dauerhaft auf dem iPhone (IndexedDB), kein Server. Sicherung als Datei exportier- und importierbar.

## Entwicklung
```bash
npm install
npm run dev      # lokal starten
npm run build    # Produktions-Build nach dist/
```

Das Freistell-Modell (`public/bgdata`, ca. 45 MB plus Laufzeit) wird von der eigenen Domain geladen und nach dem ersten Mal vom Service Worker aus dem Cache bedient.

## Auf dem iPhone installieren
Seite in Safari öffnen, Teilen-Symbol, „Zum Home-Bildschirm“.
