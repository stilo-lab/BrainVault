# In wenigen Schritten zu GitHub und Railway

Die fertige ZIP enthält den Quellcode. Du brauchst keinen lokalen Node-Setup für den Cloud-Start. Der Bot verwendet keine KI-API und keine Video-Dateien.

## 1. Discord-Anwendung vorbereiten

Im [Discord Developer Portal](https://discord.com/developers/applications) eine eigene Anwendung mit Bot anlegen. Unter **Bot** aktivieren:

- **Message Content Intent** für `7ask`, `!ask` und W-or-L-Bildfragen.
- **Server Members Intent** für Invite-Tracking.

Den **Bot-Token** kopieren. Er wird gleich als Railway-Variable eingetragen. Die Application ID erkennt der Bot selbst.

## 2. Quellcode auf GitHub hochladen

1. ZIP entpacken und den Ordner `sab-bot` öffnen.
2. [GitHub Desktop](https://desktop.github.com/) installieren und mit deinem GitHub-Konto anmelden. Für die über 400 Dateien inklusive Sticker ist das der einfache Upload-Weg.
3. In GitHub Desktop **File → New repository** wählen, z. B. Name `sab-bot`. Ein neues lokales Repository erstellen.
4. Mit **Repository → Show in Explorer** dessen Ordner öffnen. Den **Inhalt** des entpackten `sab-bot`-Ordners hineinkopieren. Das von GitHub Desktop angelegte `.git`-Verzeichnis behalten.
5. In GitHub Desktop unter **Changes** eine Zusammenfassung wie `SAB Bot 4` eintragen und **Commit to main** wählen. Danach **Publish repository**. Das Repository kann privat bleiben; erlaube Railway dann den Zugriff darauf.
6. Im Hauptverzeichnis des Repositorys müssen `Dockerfile`, `package.json`, `package-lock.json`, `railway.json`, `src/` und `assets/` liegen. `.github/` enthält die automatische Prüfung. Auf GitHub prüfen, dass `assets/stickers/` samt PNGs vorhanden ist.

Alternativ kannst du im Browser **Add file → Upload files** verwenden, dabei höchstens **100 Dateien pro Upload** in mehreren Durchgängen hochladen und die Ordnerstruktur erhalten. Die ZIP selbst hochzuladen reicht für den Railway-Build nicht. Sie muss entpackt sein. [GitHub-Uploadlimits](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository) · [GitHub-Desktop-Anleitung](https://docs.github.com/en/desktop/overview/creating-your-first-repository-using-github-desktop).

Die ZIP enthält keine installierten Abhängigkeiten, keine Datenbank und keinen Token. Eine eigene `.env` bleibt lokal. GitHub Actions prüft Syntax und Tests sowie den Docker-Build.

## 3. Railway starten

1. In [Railway](https://railway.com/) **New Project → Deploy from GitHub Repo** wählen und dieses Repository verbinden.
2. Beim Bot-Service unter **Variables** eine Variable setzen:

   ```text
   DISCORD_TOKEN=DEIN_BOT_TOKEN
   ```

3. Dem Service ein **Volume** hinzufügen und bei **Mount Path** `/app/data` eintragen. Der Bot speichert darin automatisch SQLite. Dadurch bleiben Tageslimits, Giveaways, Rewards und Abos bei Neustarts erhalten.
4. Deploy starten. `railway.json` wählt Docker und eine Instanz; das Dockerfile startet den Hintergrundprozess. Ein öffentlicher Webport ist für diesen Discord-Bot nicht nötig.
5. In den Logs erscheint **Bot einladen:** mit deinem persönlichen Einladungslink. Den Bot damit in deinen Discord-Server aufnehmen.

Die Slash-Commands werden beim Start automatisch registriert. Ein zusätzlicher Deploy- oder Pre-deploy-Befehl ist nicht nötig. Optional setzt `GUILD_ID` die Registrierung auf deinen Testserver; ohne Angabe wird sie global angelegt.

Die im Projekt enthaltene Startdatei richtet die Schreibrechte des gemounteten Volumes ein und startet den Bot danach als normalen `node`-Benutzer. Docker-Builds werden zusätzlich in GitHub Actions geprüft. Ein tatsächlicher Railway-Deploy kann erst in deinem verbundenen Railway-Konto erfolgen.

## 4. Unlimited mit deiner Community verbinden

Voreingestellt ist genau dieser Server:

- Einladung: [GAME BROS | COMMUNITY](https://discord.gg/Z3fq8Uu2cU)
- Server-ID: `1562906673549541427`

**Installiere denselben Bot auch dort.** Nur dann kann er die Mitgliedschaft direkt bei Discord prüfen. Mit `/limit` kann ein Nutzer sofort nach dem Beitritt erneut prüfen. Screenshots oder Behauptungen über eine Mitgliedschaft schalten nichts frei. Verlässt der Nutzer den Server, entfällt Unlimited bei der nächsten neuen Anfrage.

Ohne bestätigte Mitgliedschaft gibt es eine gemeinsame kostenlose W/L- oder Value-Anfrage je Kalendertag in **Europe/Berlin**. Das gilt über alle Server dieses Bots hinweg. Ohne erreichbare Mitgliedschaftsprüfung wird kein Unlimited-Zugriff behauptet.

## 5. Discord-Ersteinrichtung

```text
/diagnose
/setup kanal:#events
/panel
/trade kanal kanal:#trade-checks
/invites einrichten logkanal:#invite-log
/trading kanal kanal:#trading
/sticker basispaket
```

Danach sind unter anderem verfügbar:

```text
7ask Wie funktioniert das Dig-Event?
/value bild:DEIN_BRAINROT_BILD
/wl bild:TRADE_BILD ich_gebe:Links
/limit
/vergleich erster:Meowl zweiter:Tralalero Tralala
/farm ziel:1000000000 pro_sekunde:50000
/gw starten preis:Secret Lucky Block dauer:1h
```

Mit `/trade pflegen` kann das Serverteam aktuelle exakte Variantenwerte eintragen. Der Bot erfindet keine neuen Marktwerte, wenn die Standardquelle veraltet ist.

Für den Trading-Kanal braucht der Bot **Nachrichten verwalten** und Message Content Intent. `/sticker liste` bietet alle Motive als Bilder an; `/sticker basispaket` installiert bis zu fünf Trading-Vorlagen als native Server-Sticker, wenn **Ausdrücke erstellen** und freie Plätze vorhanden sind. [Alle Trading-/Sticker-Befehle](TRADING_STICKERS.md).

## Wenn etwas fehlt

- **Bot beendet sich direkt:** In den Logs stehen fehlender Token oder abgelehnte Intents. Beide Intents im Portal einschalten und neu deployen.
- **Unlimited wird trotz Beitritt nicht erkannt:** Derselbe Bot muss im Community-Server installiert sein. `/limit` erneut prüfen.
- **Daten nach Neustart weg:** Volume unter `/app/data` mit genau diesem Service verbinden. Eine Instanz verwenden.
- **Rollen können nicht zugeteilt werden:** Bot-Rolle in Discord über die Ping- und Reward-Rollen verschieben und `/diagnose` prüfen.
- **Keine Tauschvorschläge:** Aktuelle Werte für die exakte Mutation und Traits fehlen. `/trade pflegen` ergänzt belegte Werte; ein aktueller Download macht alte Quelldaten nicht frisch.

Die Railway-Konfiguration und Schritte richten sich nach den offiziellen Anleitungen zu [Dockerfiles](https://docs.railway.com/builds/dockerfiles), [Volumes](https://docs.railway.com/volumes) und [Config as Code](https://docs.railway.com/config-as-code/reference).
