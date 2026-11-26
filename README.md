# LocalNote

Schnelle, komplett lokale Alternative zu RemNote für die Schule. Du schreibst Notizen als Stichpunkte, LocalNote macht daraus automatisch Karteikarten und fragt sie mit FSRS (dem Algorithmus hinter modernem Anki) im richtigen Abstand ab.

Kein Account, keine Cloud. Alles liegt in einer einzigen Datei: `localnote.db`.

## Windows-App (.exe), ohne Terminal

1. Auf GitHub unter **Releases** die neueste Version öffnen und `LocalNote-Setup-x.y.z.exe` herunterladen.
2. Doppelklick. LocalNote installiert sich in deinen Benutzerordner (kein Admin nötig), legt eine Verknüpfung auf den Desktop und startet.
3. Windows zeigt beim ersten Mal evtl. **"Der Computer wurde durch Windows geschützt"**, weil die App nicht kostenpflichtig signiert ist. Dann auf **Weitere Informationen → Trotzdem ausführen** klicken.

Alternativ `LocalNote-x.y.z-portable.exe`: läuft ohne Installation, startet aber jedes Mal ein paar Sekunden langsamer.

Deine Daten liegen in `%APPDATA%\LocalNote\localnote.db` und bleiben bei Updates und Deinstallation erhalten. Updates: einfach die neue Setup-Datei ausführen.

Für den Feynman-Check brauchst du weiterhin Ollama (siehe unten), das ist nicht in die .exe eingebaut. Diktieren gibt's in der Desktop-App nicht, dafür bleibt dort alles komplett lokal.

## Aus dem Quellcode starten

### Voraussetzungen

- [Node.js](https://nodejs.org) 20 oder neuer (empfohlen: aktuelle LTS)

### Starten

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
   - `F` Frei erklären (Feynman-Check, siehe unten)
5. **Strg+K** (Mac: Cmd+K) öffnet die Schnellsuche über alle Seiten und Notizen.

Gespeichert wird automatisch.

## Klausuren-Autopilot

Unter **Klausuren** trägst du Prüfungen ein: Fach, Thema, Datum und optional nur bestimmte Seiten (sonst zählt das ganze Fach).

- **Countdown** in Tagen und ein Fortschrittsbalken: *sitzt* (FSRS sagt am Klausurtag mindestens 85 % Abrufwahrscheinlichkeit voraus), *wackelig*, *neu*.
- **Tagesziel**: heute fällige Karten aus dem Stoff plus die neuen Karten, gleichmäßig verteilt auf die Tage bis zur Klausur. Der letzte Tag bleibt frei.
- **Lernen** fragt die regulär fälligen Karten nur aus dem Klausur-Stoff ab.
- **Cram-Modus**: schaltet sich 48 Stunden vor der Klausur automatisch frei (eine Klausur zählt ab 8:00 Uhr am Prüfungstag), oder du schaltest ihn per Button früher frei. Dann kommen zuerst die Karten, die du zuletzt mit *Nochmal* oder *Schwer* bewertet hast, danach die wackeligen. *Nochmal* kommt nach 3 Karten wieder, *Schwer* nach 6. Cram-Bewertungen werden getrennt geloggt und **verändern deinen normalen FSRS-Plan nicht**.

## Feynman-Check mit lokaler KI (Ollama)

Im Lernmodus kannst du bei Frage/Antwort- und Begriffskarten vor dem Aufdecken **F** drücken (oder auf *Frei erklären* klicken) und die Antwort in eigenen Worten erklären. Eine lokale KI vergleicht das mit der Rückseite und deinen Notizen drumherum und gibt dir:

- einen **Verständnis-Score** (0 bis 100 %)
- was du **schon richtig** erklärt hast
- was **fehlt oder ungenau** ist
- eine **Rückfrage**, die die Lücke schließt

`Strg+Enter` schickt ab. Danach ist die Karte aufgedeckt und du bewertest sie wie gewohnt mit 1 bis 4. Der Score ist ein Richtwert, keine Note: kleine lokale Modelle liegen auch mal daneben.

### Einrichtung

1. [Ollama](https://ollama.com/download) installieren und starten (die App läuft im Hintergrund, alternativ `ollama serve`).
2. Ein Modell laden, z. B.:
   ```bash
   ollama pull qwen2.5:7b      # Standard, gutes Deutsch, braucht ca. 5 GB RAM/VRAM
   ollama pull llama3.2        # kleiner und schneller, etwas schwächer
   ```
3. In LocalNote unter **Einstellungen** Adresse und Modell prüfen (*Verbindung testen*). Installierte Modelle kannst du dort per Klick auswählen.

Alternativ per Umgebungsvariable beim Start: `OLLAMA_URL` (Standard `http://127.0.0.1:11434`) und `OLLAMA_MODEL` (Standard `qwen2.5:7b`). Was du in der App einstellst, hat Vorrang.

Läuft Ollama nicht oder fehlt das Modell, zeigt LocalNote einen Hinweis mit dem passenden Befehl, und du lernst einfach normal weiter. Der erste Check nach dem Start kann etwas dauern, weil Ollama das Modell erst in den Speicher lädt.

**Diktieren:** Wenn dein Browser die Web-Speech-API hat (Chrome, Edge), gibt's einen Mikrofon-Button. Achtung: Diese Browser schicken die Audiodaten zur Erkennung an ihre eigenen Server. Das ist der einzige Teil, der nicht lokal läuft. Wenn dir das wichtig ist, tipp einfach.

## Daten & Backup

Alles steckt in `localnote.db` im Projektordner. Zum Sichern einfach die Datei kopieren (am besten, wenn die App nicht läuft). Mit der Umgebungsvariable `LOCALNOTE_DB` kannst du einen anderen Speicherort wählen, z. B. einen Ordner, der eh gesichert wird.

## Entwicklung

```bash
npm test           # Backend-Tests (inkl. Fake-Ollama, kein echtes Modell nötig)
npm run typecheck  # TypeScript für Server und Client
```

Desktop-App lokal bauen (auf Windows):

```bash
npm run dist:win   # Ergebnis in desktop/release/
npm run desktop    # Desktop-App starten, ohne zu packen
```

Neue Version veröffentlichen: Version in `desktop/package.json` hochsetzen und nach `main` mergen. GitHub Actions baut die .exe und legt automatisch das Release `vX.Y.Z` an (gibt es die Version schon, passiert nichts).

Architektur, Datenbankschema und API stehen in [`CLAUDE.md`](./CLAUDE.md).
