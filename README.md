# SAB Companion 4.0 – ohne KI-API

**Cloud-Schnellstart:** [GitHub + Railway einrichten](GITHUB_RAILWAY.md). Auf Railway ist nur `DISCORD_TOKEN` als eigene Variable nötig; ein Volume unter `/app/data` hält alle Einstellungen und Limits dauerhaft fest. Befehle registrieren sich automatisch.

**Trading-Update:** `/trading kanal kanal:#trading` aktiviert einen Kanal für Bilder und Sticker ohne Begleittext. `/sticker liste` zeigt Secret-/OG-Motive und zehn Trading-Vorlagen. `/sticker senden` postet ein Motiv mit deinem Profil; `/sticker installieren` und `/sticker basispaket` legen ausgewählte echte Server-Sticker in freien Plätzen an. Der mitgelieferte Katalog enthält 355 Secret- und 6 OG-Einträge aus den Wiki-Listen vom 2. November 2026. [Einrichtung und Befehle](TRADING_STICKERS.md).

**Neu:** `/value bild:...` zeigt nach der Prüfung deines Brainrots aktuelle Referenzwerte und passende Gegenwerte. `/wl` prüft Trade-Bilder. Ohne bestätigte Community-Mitgliedschaft teilen sich alle W/L- und Value-Wege **eine Anfrage pro Kalendertag in Europe/Berlin**. Mitglieder von [GAME BROS | COMMUNITY](https://discord.gg/Z3fq8Uu2cU) haben keine Tagesgrenze. Der Bot muss für die direkte Mitgliedschaftsprüfung ebenfalls dort installiert sein. `/limit` zeigt Status und Freischaltlink.

Neue SAB-Werkzeuge: `/vergleich`, `/farm`, `/rebirth`, `/mutationen`, `/traits`. Die Giveaway-Ausgabe verwendet eine **statische PNG-Grafik**.

Deutscher Discord-Bot für **Steal a Brainrot**, mit `7ask`, Quellenwissen, lokalen Screenshot-Tradechecks, Event-Abos, Invite-Rewards und Giveaways mit statischer Secret-Lucky-Block-Gewinnergrafik.

**Es wird kein KI-Dienst angesprochen und kein KI-API-Schlüssel benötigt.** Antworten entstehen aus deutschen Wissensartikeln, direkt gelesenen Wiki-Fakten und eigenen Server-Antworten. Die Texterkennung rechnet lokal auf dem Bot-Host. Für öffentliche Wiki-/Roblox-/Wertequellen und Discord ist Internet erforderlich.

## Start unter Windows

1. [Node.js](https://nodejs.org/) **24.17 oder neuer inklusive npm** installieren.
2. Im [Discord Developer Portal](https://discord.com/developers/applications) eine eigene Anwendung mit Bot erstellen.
3. Unter **Bot → Privileged Gateway Intents** einschalten:
   - **Message Content Intent** für `7ask`, `!ask` und normale W-or-L-Bildfragen.
   - **Server Members Intent** für Invite-Tracking und die Erfassung von Austritten.
4. `SETUP.cmd` öffnen. `.env` wird beim ersten Mal im Editor geöffnet. Lokal ausfüllen:

   ```dotenv
   DISCORD_TOKEN=DEIN_BOT_TOKEN
   # Optional, sonst automatische Application ID und globale Befehle:
   CLIENT_ID=
   GUILD_ID=
   TEXT_COMMANDS=true
   INVITES_ENABLED=true
   ```

5. Speichern und Editor schließen. Setup installiert die festgelegten Abhängigkeiten, registriert **29 Slash-Commands** und gibt den Einladungslink aus. Bot darüber zum Server hinzufügen.
6. `START.cmd` starten. Der Prozess muss für Benachrichtigungen und Giveaways weiterlaufen.
7. In Discord `/diagnose` prüfen, dann `/setup kanal:#events`, `/panel` und bei Bedarf `/invites einrichten` ausführen.

Die Application ID erkennt der Bot automatisch; CLIENT_ID ist optional. Server-ID: Discord-Entwicklermodus aktivieren, Rechtsklick auf den Server → ID kopieren. `GUILD_ID` kann leer bleiben, dann werden Befehle global registriert. Den Bot-Token lokal in `.env` oder auf Railway in den Variables speichern.

Terminal-Alternative im Bot-Ordner:

```powershell
Copy-Item .env.example .env
# .env lokal ausfüllen
npm ci --ignore-scripts
npm run deploy
npm start
```

Der Deploy-Befehl ersetzt die Slash-Command-Liste dieser eigenen Bot-Anwendung im gewählten Geltungsbereich. Beim normalen Start registriert der Bot geänderte Befehle ebenfalls automatisch.

## Update von Version 1, 2 oder 3

Bot stoppen, `data/` und `.env` sichern und die neuen Projektdateien übernehmen. Anschließend `npm ci --ignore-scripts` und `npm run deploy` ausführen. SQLite ergänzt die neuen Tabellen automatisch. Bestehende Abos und Timer bleiben erhalten.

In eine vorhandene `.env` zusätzlich `TEXT_COMMANDS=true` und `INVITES_ENABLED=true` eintragen und beide oben genannten Intents einschalten. Alte KI-Schlüssel werden nicht verwendet und können aus der Konfiguration entfernt werden. `/ask` funktioniert auch ohne Message Content Intent. Ohne die erforderlichen privilegierten Intents lehnt Discord die Verbindung ab; setze das jeweilige Feature auf `false`, wenn es nicht verwendet werden soll.

Für den neuen Trading-Kanal braucht der Bot **Nachrichten verwalten**, für die native Stickerinstallation **Ausdrücke erstellen**. Nutze den neuen Einladungslink aus den Logs oder ergänze die Rechte an seiner Rolle. `TRADING_MEDIA_ENABLED=true` benötigt ebenfalls Message Content Intent; wenn du alle Textfunktionen abschalten möchtest, setze auch diese Variable auf `false`.

## Rechte

Der Einladungslink verlangt **Kanal ansehen, Nachrichten senden, In Threads senden, Links einbetten, Dateien anhängen, Nachrichtenverlauf anzeigen, Nachrichten verwalten, Ausdrücke erstellen, Rollen verwalten, Server verwalten sowie alle Rollen erwähnen**. Administratorrechte sind nicht nötig. „Server verwalten“ wird zum Lesen der Server-Invite-Zähler benötigt. Die Bot-Rolle muss über den Ping- und Reward-Rollen stehen. Kanal-Überschreibungen müssen die nötigen Sende-, Datei- und Einbettungsrechte erlauben.

Ping-Rollen haben keine zusätzlichen Rechte und sind nicht allgemein erwähnbar. Jede Event-Nachricht begrenzt erlaubte Erwähnungen auf die passenden SAB-Rollen. Invite-Reward-Rollen dürfen keine Verwaltungsrechte besitzen. Admin-Funktionen erfordern beim Aufrufer **Server verwalten** und prüfen das zusätzlich im Code.

## Fragen mit 7ask

```text
7ask Wie funktioniert Rebirth?
7ask Was ist der Unterschied zwischen Mutation und Traits?
7ask Wann ist das nächste Dig-Event?
7ask Wie viel Einkommen hat Tralalero Tralala?
7ask Wie bekomme ich Spooketti Tualetti?
7ask Was bedeutet W oder L?
```

`7ASK` ist ebenfalls gültig; außerdem `!ask`, `/ask frage:...` und `/sab frage text:...`. Im Discord-Hauptmenü `/start` öffnet ein Button ein Frageformular. Auf Zeitfragen antwortet der Bot aus dem gespeicherten Eventplan, auf Grundlagen mit redaktionellen deutschen Erklärungen, auf konkrete Datenfragen mit Angaben aus der Wiki-Infobox. Die Suche toleriert einfache Tippfehler.

Die deutschen Grundlagen behandeln Einstieg, Rebirth, Mutationen, Traits, Dig/Grave Hunt, Shovel Shop, Admin Abuse, Taco Tuesday, Basis, Red Carpet, Index, Rituale, Lucky Blocks, Trade-Bewertung und Einkommensrechnung. Für noch nicht abgedeckte Spezialfragen zeigt der Bot Fakten und passende Quellenlinks und kennzeichnet fehlendes Wissen. Das ist ein regelbasierter Wissensassistent; freie Sprachmodell-Unterhaltungen und allwissende Antworten sind damit nicht möglich.

**Eigenes Serverwissen ergänzen:**

```text
/sab lernen frage:Wie läuft unser SAB-Turnier? antwort:DEINE GEPRÜFTE ANTWORT quelle:https://discord.com/channels/...
/sab vergessen frage:Wie läuft unser SAB-Turnier?
```

Bis zu 200 eigene Antworten pro Server. Fragen werden ohne Beachtung von Großschreibung, Akzenten und Satzzeichen zugeordnet. Eigene Antworten sind als vom Serverteam eingetragen gekennzeichnet.

Mit `CHAT_AUTO_REPLY=true` und `/sab kanal kanal:#sab-fragen` beantwortet der Bot auch normale Textfragen in einem ausdrücklich gewählten Kanal. Ohne Kanalangabe wird dieser Modus deaktiviert. Textbefehle funktionieren mit `TEXT_COMMANDS=true` in allen Kanälen, in denen der Bot die Nachricht lesen und antworten kann. Es gibt eine kurze Sperre gegen parallele Fragen desselben Nutzers; Bots und Webhooks werden ignoriert.

## Invites und Rewards

```text
/invites einrichten logkanal:#invite-log mindestalter:7
/invites reward_add anzahl:5 rolle:@5-Invites
/invites reward_add anzahl:10 rolle:@10-Invites
/invites stats
/invites top
/invites rewards
/invites claim
```

Reward-Rollen werden beim nächsten gültigen Beitritt automatisch vergeben oder mit `claim` abgeholt. Bereits verdiente Rollen bleiben bei späteren Austritten bestehen. `/invites reward_remove` löscht eine Reward-Regel.

Gezählt werden **aktive, gültige, beobachtete Zuordnungen**. Bots, Selbsteinladungen und zu junge Konten zählen nicht. Verlässt ein eingeladener Nutzer den Server, sinkt die aktive Zahl. Ein Wiederbeitritt erzeugt keinen zweiten Datensatz; ein bekanntes Mitglied bleibt seinem ursprünglichen Werber zugeordnet.

Discord nennt im Beitrittsereignis keinen verwendeten Invite-Link. Der Bot vergleicht deshalb die vorherigen und aktuellen Invite-Zähler und schreibt nur einen eindeutig beobachteten Zuwachs gut. Gleichzeitige Beitritte, Vanity-Links, gelöschte Einmal-Links, fehlende Rechte oder Beitritte während Ausfällen können **unzugeordnet** bleiben. Vor dem ersten erfolgreichen Snapshot gibt es keine rückwirkende Zuordnung. Die Zahlen sind daher kein lückenloser Nachweis aller jemals erfolgten Einladungen. Austritte während einer längeren Offline-Zeit können nicht vollständig nachgeholt werden.

## Giveaways mit Lucky-Block-Grafik

```text
/gw starten preis:Secret Lucky Block dauer:1h gewinner:1
/gw starten preis:VIP-Rolle dauer:2d gewinner:3 invites:5 rolle:@Mitglied mindestalter:7
/gw liste
/gw info id:...
/gw beenden id:...
/gw neu id:...
/gw abbrechen id:...
/gw pruefen id:...
```

Mitglieder treten über **Teilnehmen / verlassen** bei. Pro Mitglied gibt es genau einen Eintrag, Bots sind ausgeschlossen. Optional sind aktive Invite-Zahl, erforderliche Rolle und Mindest-Kontoalter nötig. Diese Bedingungen werden beim Beitritt und bei der Ziehung geprüft. Dauer: 10 Sekunden bis 30 Tage; bis zu fünf Gewinner, 2000 Teilnehmer und 20 gleichzeitig laufende Giveaways pro Server.

**Zum Ende:** Die Ziehung wird gespeichert. Eine lokal erzeugte statische PNG-Grafik zeigt den geöffneten Lucky Block und die Gewinnernamen. Die ursprüngliche Giveaway-Nachricht wird damit aktualisiert. Es wird kein Video und kein animiertes Bild erzeugt. Die Preisübergabe erledigt das Serverteam.

Die Auswahl verwendet einen zufälligen kryptografischen Seed. Sein SHA-256-Hash steht vorab in der Giveaway-Nachricht. Nach Abschluss werden Seed und Runde offengelegt. Die Teilnehmer werden anhand von HMAC-SHA256 sortiert; `/gw pruefen` prüft die gespeicherten Ziehungen. Rerolls schließen alle bisherigen Gewinner desselben Giveaways aus.

Giveaways und gezogene Gewinner liegen in SQLite. Nach einem Neustart werden überfällige Giveaways bearbeitet. Scheitert nur die Grafik oder Discord-Zustellung, wird dieselbe gespeicherte Ziehung erneut verwendet. Der Bot bestimmt dann keine neuen Gewinner. Die bereits gepostete Nachricht wird aktualisiert; die Gewinnergrafik bleibt als normales Bild sichtbar.

## Events, Dig-Timer und Abos

`/events` zeigt fünf Termine je Seite, mit Themenfilter und Discord-Countdown. `/event board kanal:#events` postet ein Board, das sich jede Minute aktualisiert. `/event board_stoppen` beendet die automatische Aktualisierung. `/abo einstellen` wählt Rollen-Pings und persönliche DMs getrennt für Admin Abuse, Taco Tuesday, Dig, Updates und andere Events.

**Dig-Timer übernehmen:**

```text
/timer setzen thema:Schaufel rest:02:59:30 intervall:180 dauer:10 gueltig:24
```

Das sind **Bedienbeispiele**: Restzeit, Abstand und Dauer müssen zum aktuellen Ingame-Board passen. `180` bedeutet drei Stunden zwischen Starts. Der Bot liest keinen laufenden Roblox-Server aus. Die Berechnung wird an der Befehlszeit verankert und gilt maximal 72 Stunden; bei geändertem Countdown neu kalibrieren. `/timer stoppen` zieht offene berechnete Termine zurück. Kein Drei-Stunden-Takt wird ohne Kalibrierung als aktuelle globale Regel behauptet.

**Bestätigte Einzeltermine:** `/event setzen` mit Titel, Thema, ISO-Startzeit, Dauer und HTTPS-Beleg. Zur Änderung dieselbe ID erneut angeben; `/event absagen` zieht den Termin zurück.

**Wochenplan:** `/event wochenplan` aktiviert vom Serverteam geprüfte Wochen-Pings für Admin Abuse oder Taco Tuesday für maximal 28 Tage. Berechnet wird in `America/New_York`, inklusive Sommerzeit. Das Planungsfenster beträgt 45 Minuten und ist als solches gekennzeichnet. Offizielle Roblox-Termine desselben Event-Tages haben Vorrang. `/event plan_stoppen` beendet den Plan.

Die öffentliche Roblox-Eventliste wird beim Start und alle 15 Minuten vollständig paginiert geprüft. Eine leere Zukunftsliste beweist nicht, dass keine Ingame-Aktivität stattfindet. Übliche Wochenzeiten werden zusätzlich als **unbestätigte Vorschau** angezeigt; dafür allein gibt es keine Pings.

Rollen-Pings erfolgen mit dem Server-Vorlauf und zum Start, DMs zum persönlichen Vorlauf: 0, 5, 15, 30 oder 60 Minuten. Mehrere passende Themen erzeugen im selben Server keine doppelten DMs. Änderungen und Absagen korrigieren schon gesendete Hinweise an noch aktive Abonnenten. Alte Vorwarnungen werden nach zwei Minuten, Start-Pings nach fünf Minuten übersprungen, damit Neustarts keine alten Nachrichtenfluten erzeugen.

Eigene DM-Erinnerungen: `/erinnerung setzen`, `liste`, `loeschen`; maximal 20 pro Nutzer und bis zu ein Jahr im Voraus. Ohne UTC-Offset gilt Europe/Berlin. Doppeldeutige oder nicht existierende Uhrzeiten bei Zeitumstellungen benötigen einen expliziten Offset. Discord zeigt jedem Nutzer seine lokale Zeit.

## Trade-Checks ohne KI-API

**Einzelnen Brainrot bewerten:** `/value bild:...` liest das ganze Bild. Wähle bei mehreren erkannten Brainrots den gewünschten aus und korrigiere fehlende Angaben. Nach der Bestätigung zeigt der Bot den belegten Wert der exakten Variante und bis zu fünf ähnliche Gegenwerte aus aktuellen Daten derselben Einheit. Das sind Vergleichswerte, keine aktiven Angebote. Eine Menge von bis zu fünf Exemplaren kann als Gegenwert vorgeschlagen werden.

**Tageskontingent:** `/limit` zeigt die eine gemeinsame W/L- oder Value-Anfrage und den Zeitpunkt des nächsten Tagesbeginns. Korrekturen vor dem ersten Ergebnis sind enthalten; ein anderer Brainrot oder Trade nach der ersten Bewertung ist eine neue Anfrage. Technische Fehler vor dem Anlegen der Anfrage geben das Kontingent frei. Ein fehlender oder veralteter Marktwert kann als Ergebnis ausgegeben werden und zählt als Anfrage. Community-Mitglieder werden für neue Anfragen direkt bei Discord geprüft.

`/trade bild` lädt den Discord-Bildanhang und liest die linke und rechte Bildhälfte mit **lokalem Tesseract OCR**. Das englische Sprachpaket wird mit den npm-Abhängigkeiten installiert; zur Erkennung wird kein Cloud-OCR- oder KI-Dienst kontaktiert. PNG, JPG und WEBP bis 8 MB, maximal 16 Megapixel und 6000 Pixel je Kante sind erlaubt. Eine Erkennung läuft gleichzeitig, mit einer Minute Abstand pro Nutzer. W/L und Value teilen sich eine kostenlose Anfrage je Kalendertag in Europe/Berlin. Bestätigte Mitglieder der Community haben keine Tagesgrenze.

OCR liest sichtbaren Text. Sie kann keine zuverlässige Aussage über rein bildliche Traits, verdeckte Slots, schlecht lesbare Namen oder ein manipuliertes Bild treffen. Der Bot übernimmt bekannte Namen nur bei einem Texttreffer. Mutation und Traits brauchen explizite lesbare Angaben; sonst bleiben sie unklar. **Alle Positionen prüfen und fehlende Angaben über Positionen korrigieren ergänzen.** Kein Handelswert wird aus einem unlesbaren Symbol oder Einkommen geraten.

Ohne Bild: `/trade eingeben`. Pro Zeile im Formular:

```text
1 | Meowl | Normal | keine
2 | Dragon Cannelloni | Gold | Taco, Lightning
```

Nach der Bestätigung vergleicht der Bot die vollständigen Variantenwerte. Seitenwechsel und Korrekturen verwerfen die vorherige Bewertung. Im Ergebnis stehen Werte oder Fehler pro Position. `Ergebnis teilen` postet eine bestätigte aktuelle Bewertung in den Kanal. `/trade verlauf` zeigt die letzten eigenen Ergebnisse ohne Bilder.

**Werte:** SABTradingValues bleibt Standard. Genutzt werden der genaue Brainrot und konkrete Mutationsdaten, keine Einkommensmultiplikatoren als Preise. Exakte aktuelle Server-Varianten haben Vorrang. Quellenwerte dürfen höchstens 72 Stunden alt sein. Bei veralteten oder fehlenden Werten beziehungsweise verschiedenen Einheiten gibt es kein W/L-Gesamturteil.

- **W:** selbst der niedrigste Empfangswert liegt mehr als 10 % über dem höchsten Abgabewert.
- **L:** selbst der höchste Empfangswert liegt mehr als 10 % darunter.
- **Fair:** der vollständige Vergleich liegt innerhalb ±10 %.
- Größere überlappende Wertebereiche: **Unklar**.

Es sind Community-Schätzungen, keine garantierten Marktpreise. Beim Live-Test am 2. November 2026 meldete SABTradingValues 306 Brainrots, aber den Datenstand **5. Mai 2026**. Der Bot sperrt diese alten Daten für heutige Urteile. Ein neuer Download macht sie nicht aktuell.

**Werte pflegen:** `/trade pflegen` öffnet ein Admin-Formular für Name, Mutation, vollständige Traits, Wertebereich, Einheit, echte Quelle und deren tatsächlichen Stand. `/trade wert` prüft eine konkrete Variante. `/trade import` übernimmt eine JSON-Liste, `/trade export` sichert sie, `/trade import_loeschen` entfernt sie. `values.template.json` ist absichtlich leer.

Format eines Eintrags innerhalb `items`:

```json
{
  "name": "EXAKTER NAME",
  "mutation": "Normal",
  "traits": [],
  "low": 100,
  "high": 110,
  "source": "https://example.com/deine-echte-quelle",
  "updatedAt": "2026-11-02T08:00:00Z"
}
```

Die Zahlen zeigen nur das Format. Die umgebende Liste enthält `unit` und `items`. Pro Kombination genau ein Eintrag; Preise pro Exemplar. Unterschiedliche Quellen dürfen nur mit derselben tatsächlich vergleichbaren Einheit gemischt werden.

## Daten, Hosting und Grenzen

SQLite unter `data/sab.sqlite` hält Konfiguration, Abos, Termine, Zustellungen, Werte, eigenes Serverwissen, Invite-Zuordnungen, Reward-Claims, Giveaways, Teilnehmer und Ziehungsnachweise. Bot stoppen und den ganzen `data`-Ordner sichern. Bei einer laufenden WAL-Datenbank nicht nur die Hauptdatei kopieren. Eine Prozesssperre verhindert parallele Starts auf demselben Host; pro Datenbank nur eine Instanz betreiben.

`/abo loeschen` beendet eigene DMs, entfernt persönliche Erinnerungen, Trade-Verlauf und offene Giveaway-Teilnahmen dieses Servers sowie verfügbare Ping-Rollen. Bereits erfolgte Giveaway-Ziehungen und Invite-Reward-Nachweise bleiben als Verwaltungsprotokolle bestehen. Bereits veröffentlichte Discord-Nachrichten werden dadurch nicht entfernt. Trade-Screenshots werden nicht als Bilddateien auf dem Bot-Host gespeichert und nicht an einen KI-Dienst geschickt. Bearbeitungssitzungen sind zeitlich begrenzt. Persönliche Trade-Ergebnisse werden auf 20 pro Server/Nutzer und 30 Tage begrenzt. Der mit Nutzer-Hash geführte globale Tageszähler bleibt beim Löschen persönlicher Daten erhalten und wird nach drei Tagen bereinigt. Entfernte Server werden bereinigt.

Dauerbetrieb benötigt einen laufenden Host mit ausgehendem HTTPS und Discord-Gateway-Zugriff; kein öffentlicher Eingangsport nötig. Bei ausgeschaltetem oder schlafendem Rechner wird nichts zugestellt. Ein Absturz genau zwischen Discord-Versand und Datenbankbestätigung kann bei normalen Benachrichtigungen zu einer doppelten Nachricht führen; eine transaktionsübergreifende Zustellgarantie bietet Discord nicht. Giveaways bearbeiten dagegen dieselbe gespeicherte Originalnachricht und bewahren die gezogenen Gewinner.

Docker:

```sh
docker compose build
docker compose run --rm sab-bot node scripts/deploy.js
docker compose up -d
```

`.env` vorher anlegen, Volume `sab-data` behalten. Die Docker-Konfiguration installiert eine Schrift für die Gewinnergrafik. Windows verwendet vorhandene Systemschriften.

Prüfen:

```sh
npm run check
npm test
npm run smoke
```

Die Tests verwenden für Discord-Interaktionen Simulationen. Echte Rollenvergabe, Invite-Erfassung und Giveaway-Nachrichten müssen nach dem Eintragen deines Bot-Tokens auf deinem Testserver geprüft werden. Lokale OCR wird zusätzlich mit einem echten Testbild ausgeführt. Kein System kann perfekte Bildlesung, unveröffentlichte Spielinhalte oder vollständige Invite-Zuordnung garantieren.

## Quellen

[Offizielles Spiel](https://www.roblox.com/games/109983668079237/Steal-a-Brainrot), [SAB-Community-Wiki](https://stealabrainrot.wiki/), [öffentliche Roblox-Events](https://apis.roblox.com/virtual-events/v1/universes/7709344486/virtual-events), [SABTradingValues](https://sabtradingvalues.com/brainrots), [Tesseract.js](https://github.com/naptha/tesseract.js), [Discord-Dokumentation](https://github.com/discord/discord-api-docs).
