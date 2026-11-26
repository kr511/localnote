# LocalNote

Schnelle, komplett lokale Alternative zu RemNote für die Schule. Du schreibst Notizen als Stichpunkte, LocalNote macht daraus automatisch Karteikarten und fragt sie mit FSRS (dem Algorithmus hinter modernem Anki) im richtigen Abstand ab.

Kein Account, keine Cloud. Alles liegt in einer einzigen Datei: `localnote.db`.

## Voraussetzungen

- [Node.js](https://nodejs.org) 20 oder neuer (empfohlen: aktuelle LTS)

## Starten

```bash
npm install      # nur beim ersten Mal
npm run dev      # startet alles, dann http://localhost:5173 öffnen
```

Alternativ ohne Dev-Server (schneller Start, ein Port):

```bash
npm start        # baut die Oberfläche und startet http://localhost:3001
```

## So funktioniert's

1. Links ein **Fach** anlegen (z. B. Biologie), darin **Seiten**.
2. Auf einer Seite in Stichpunkten schreiben. `Enter` neuer Punkt, `Tab` / `Shift+Tab` ein- und ausrücken, `Shift+Enter` Zeilenumbruch im Punkt, `Alt+Shift+↑/↓` Punkt verschieben. Mehrzeilige Listen kannst du einfach einfügen.
3. Karteikarten entstehen automatisch, während du tippst:

| Du schreibst | Es entsteht |
| --- | --- |
| `Was ist das Kraftwerk der Zelle? >> Mitochondrium` | normale Karte |
| `Ribosom << Ort der Proteinbiosynthese` | zwei Karten, in beide Richtungen |
| `Das Herz pumpt {{Blut}} durch den Körper.` | Lückentext (eine Karte pro Lücke) |

Erkannte Karten bekommen ein kleines Badge rechts. Wenn du den Text später korrigierst, bleibt dein Lernfortschritt erhalten.

4. **Heute lernen**: zeigt alle fälligen Karten, auf Wunsch nach Fach gefiltert.
   - `Leertaste` Antwort zeigen
   - `1` Nochmal · `2` Schwer · `3` Gut · `4` Einfach
5. **Strg+K** (Mac: Cmd+K) öffnet die Schnellsuche über alle Seiten und Notizen.

Gespeichert wird automatisch.

## Daten & Backup

Alles steckt in `localnote.db` im Projektordner. Zum Sichern einfach die Datei kopieren (am besten, wenn die App nicht läuft). Mit der Umgebungsvariable `LOCALNOTE_DB` kannst du einen anderen Speicherort wählen, z. B. einen Ordner, der eh gesichert wird.

## Entwicklung

```bash
npm test           # Backend-Tests
npm run typecheck  # TypeScript für Server und Client
```

Architektur, Datenbankschema und API stehen in [`CLAUDE.md`](./CLAUDE.md).
