# Event-Pings einrichten – SAB Hub 4.1

## Update installieren

`SAB-Ping-Fix-4.1.zip` enthält nur die geänderten Projektdateien und Tests. Entpacken und den Inhalt in das Hauptverzeichnis deines bestehenden Bot-Repositorys kopieren. Die vorhandenen Dateien ersetzen. Danach auf GitHub committen und pushen. Railway deployt über die vorhandene GitHub-Verbindung; alternativ „Deploy Latest Commit“ auslösen.

Im GitHub-Browser: „Add file → Upload files“ wählen und die entpackten Dateien und Ordner in das Repository-Hauptverzeichnis ziehen. Die Struktur `src/...` und `test/...` erhalten. Das Update enthält weniger als 100 Dateien. Die ZIP selbst wird nicht als Projektdatei hochgeladen.

Token-Variable und bestehendes Volume unter `/app/data` behalten. Die Datenbank ergänzt die neue Konfiguration automatisch. In den Logs steht anschließend `SAB-Bot 4.1`. Die 30 Slash-Commands registrieren sich automatisch. Falls die neue Befehlsgruppe noch fehlt, Discord neu laden und den Registrierungsstatus in den Logs prüfen.

## Admin Abuse für alle mit einer vorhandenen Rolle

```text
/benachrichtigung rolle thema:Admin Abuse rolle:@SAB-Pings kanal:#events vorlauf:5
```

In Discord die tatsächliche vorhandene Rolle und den Zielkanal auswählen. Alle Mitglieder dieser Rolle mit Zugriff auf den Kanal werden erwähnt. Die Rolle wird niemandem automatisch zugeteilt. Auch Rollen mit Zusatzrechten können als Empfänger dienen; sie bleiben von den frei auswählbaren Abo-Rollen getrennt.

Für Admin Abuse aktiviert der Befehl standardmäßig dauerhafte Wochen-Erinnerungen für den üblichen Samstagstermin. Taco Tuesday wird mit entsprechendem Thema separat eingerichtet. Die Berechnung verwendet `America/New_York` inklusive Sommerzeit. Discord zeigt die lokale Uhrzeit an.

Das sind ausdrücklich **geplante Wochen-Erinnerungen nach dem Community-Zeitplan**, kein Live-Nachweis. Explizite Roblox-Ankündigungen für dasselbe Wochen-Event haben Vorrang. Überraschungs-Events brauchen einen angekündigten oder manuell hinterlegten Termin. Mit `wochenplan:false` aktiviert der Rollenbefehl keinen neuen Wochenplan; ein bereits aktiver Plan wird damit nicht beendet.

## Graben: Rolle und Countdown gemeinsam einrichten

```text
/benachrichtigung graben rolle:@SAB-Pings kanal:#events rest:02:15:00 intervall:180 dauer:10 vorlauf:5
```

**Die Zahlen sind Beispiele.** Übernimm die aktuelle Restzeit, den Abstand zwischen Starts und die Rundendauer aus deinem Spiel. `180` bedeutet drei Stunden. Der Bot liest keinen laufenden Roblox-Server aus und behauptet keinen universellen Drei-Stunden-Takt.

Die Einrichtung speichert Rolle, Kanal und Timer gemeinsam. Pings erfolgen zum Vorlauf und zum berechneten Start. Standardgültigkeit: 72 Stunden, einstellbar über `gueltig:1` bis `gueltig:72`. Das Ablaufdatum wird direkt angezeigt. Nach Ablauf oder bei verändertem Countdown erneut kalibrieren. `/timer setzen` funktioniert weiterhin und verwendet ebenfalls standardmäßig 72 Stunden.

## Test und Fehlerprüfung

```text
/benachrichtigung test thema:Admin Abuse
/benachrichtigung test thema:Schaufel / Dig / Grave Hunt
/benachrichtigung status
```

Das Thema wird aus dem Discord-Menü gewählt. Der Test erzeugt einen **echten Rollen-Ping**, klar als Einrichtungstest beschriftet, maximal einmal pro Thema und Server je Minute. Er behauptet kein laufendes Event.

`status` zeigt Rolle, Kanal, Vorlauf, nächsten Termin, fehlende Rechte, Timer-Gültigkeit, letzten Scheduler-Lauf sowie erfolgreiche oder fehlgeschlagene Event-Zustellungen. Ohne Termin gibt es keinen zeitgerechten Event-Ping. `/diagnose` prüft jetzt ebenfalls, ob für Graben und Admin Abuse Termine vorliegen.

Die Befehle erfordern beim Nutzer **Server verwalten**. Der Bot braucht im Kanal **Kanal ansehen**, **Nachrichten senden** und **Links einbetten**. Für nicht allgemein erwähnbare Rollen braucht er zusätzlich **@everyone, @here und alle Rollen erwähnen**. Alternativ kann die ausgewählte Rolle selbst erwähnbar sein. Das wird beim Speichern und vor dem Versand geprüft. Die Empfängerrolle braucht Kanalzugriff.

Persönliche Discord-Stummschaltungen können Push-Mitteilungen verhindern. Ein Bot kann sie nicht überschreiben. [Offizielle Discord-Dokumentation zu Erwähnungen](https://docs.discord.com/developers/resources/message#allowed-mentions-object).

Persönliche DMs und Abo-Rollen bleiben über `/abo einstellen` separat einstellbar. Abo-Rollen und zusätzliche Rollen im selben Kanal mit gleichem Vorlauf werden zu einer Nachricht zusammengefasst. Unterschiedliche Vorläufe und Kanäle werden getrennt bedient. Bereits zugestellte Ereignisse werden nach Neustarts nicht erneut gepingt.

## Abschalten

```text
/benachrichtigung aus thema:Admin Abuse
/event plan_stoppen thema:Admin Abuse
/timer stoppen thema:Schaufel / Dig / Grave Hunt
```

`benachrichtigung aus` entfernt die zusätzliche Serverrolle. `plan_stoppen` beendet den jeweiligen Wochenplan. `timer stoppen` beendet den jeweiligen Countdown. Persönliche Abos werden mit `/abo einstellen` geändert.

## Behobene Probleme und Prüfung

- Vorhandene Serverrollen lassen sich pro Event und Kanal als Empfänger wählen, auch ohne vorheriges `/setup`.
- Rollenwahl kann Admin-/Taco-Wochen-Erinnerungen dauerhaft aktivieren. Bewusst befristete ältere Wochenpläne bleiben befristet.
- Graben-Rolle und Countdown werden gemeinsam gespeichert; ungültige Eingaben hinterlassen keine halbe Einrichtung.
- Kanalzugriff und tatsächliche Rollen-Erwähnbarkeit werden vor dem Versand geprüft.
- Mehrere passende Rollen im selben Kanal und zum selben Zeitpunkt erzeugen eine gemeinsame Nachricht.
- „NEXT UPD“ wird als Update erkannt. Eine fehlende ausdrückliche Admin-Abuse-Ankündigung wird daraus nicht erfunden.
- Änderungen, Absagen, Neustarts, unterschiedliche Vorläufe und entfernte Empfänger werden berücksichtigt.

Validierung: **115 automatische Tests bestanden**, einschließlich lokaler OCR und bisheriger Bot-Funktionen; Syntaxprüfung für alle JavaScript-Dateien. Discord wurde dabei simuliert. Der echte Test-Ping wird nach dem Update auf deinem Server ausgeführt.

Quelle des üblichen Wochenplans: [SAB-Community-Wiki – Admin Abuse und Taco Tuesday](https://stealabrainrot.wiki/wiki/admin-abuse/). Die öffentliche Roblox-Eventliste enthält nicht jeden laufenden Ingame-Timer.
