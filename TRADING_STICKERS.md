# Trading-Kanal und SAB-Sticker

## Schnellstart

```text
/trading kanal kanal:#trading
/sticker basispaket
/sticker liste
/sticker senden name:Meowl zweck:Looking for
```

Die Namensfelder bieten eine Auswahl an. Die Beispieltexte stehen für die angezeigten Optionen.

Ein Serverteam-Mitglied mit **Server verwalten** wählt den Kanal. Der Bot benötigt dort **Kanal ansehen**, **Nachrichten senden**, **Dateien anhängen**, **Nachrichtenverlauf anzeigen** und **Nachrichten verwalten**. Für vom Bot gesendete Trading-Karten zusätzlich **Links einbetten**, in Threads **In Threads senden**. Im Developer Portal muss **Message Content Intent** aktiviert sein. `TRADING_MEDIA_ENABLED` ist standardmäßig `true`.

## Kanalregel

Erlaubt sind ausschließlich Bildanhänge oder Discord-Sticker **ohne Begleittext**. Auch Bild und Sticker zusammen sind erlaubt. Ein normaler Text, Emoji-Text, Link, Video, eine Sprachnachricht, Umfrage oder sonstige Datei wird entfernt. Ein Bild plus Text ist ebenfalls ungültig. Discord muss einen Bildanhang mit Bildtyp und Abmessungen erkennen; der Bot prüft dafür die Discord-Metadaten. Er beurteilt hier keine Bildinhalte.

Die Regel gilt für neue Beiträge, nachträgliche Bearbeitungen und Threads unter diesem Kanal. Alte Nachrichten werden nicht durchsucht. Mitglieder, Serverteam, fremde Bots und Webhooks unterliegen derselben Regel. Eigene Bot-Ausgaben und Systemnachrichten sind ausgenommen. Bei einer Entfernung erhält das Mitglied höchstens alle zehn Minuten eine Erklärung per DM, sofern DMs möglich sind.

Der Bot muss online sein und die Löschrechte behalten. Discord bietet keine Berechtigung, die Text bei gleichzeitig erlaubten Bildern automatisch sperrt; die Entfernung erfolgt nach dem Eingang der Nachricht. Bei fehlenden Rechten zeigt `/trading status` den letzten Fehler.

```text
/trading status
/trading aus
```

`aus` beendet die Regel und behält den Kanal. Für `7ask` und W/L-Fragen mit Text empfiehlt sich ein eigener Frage-/Tradecheck-Kanal. `/trade kanal` steuert weiterhin die W/L-Erkennung; `/trading kanal` steuert die Medienregel.

## Sticker für Mitglieder

| Befehl | Funktion |
| --- | --- |
| `/sticker liste kategorie:Secrets` | Secret-, OG- oder Trading-Motive im privaten Menü auswählen. |
| `/sticker vorschau name:Meowl` | PNG privat ansehen und herunterladen. |
| `/sticker senden name:Meowl` | Bild im aktuellen Kanal posten, mit deinem Namen und Profil-/DM-Link. |
| `/sticker senden name:Meowl zweck:Looking for` | Zusätzlich „LOOKING FOR“, „OFFERING“, „DM ME“ oder „FAIR OFFERS“ auf das Bild setzen. |
| `/sticker status` | Katalogstand, Umfang und Server-Stickerplätze ansehen. |

Das Menü gehört dem aufrufenden Nutzer und läuft nach 15 Minuten ab. Zwischen öffentlichen Sticker-Beiträgen liegen mindestens fünf Sekunden. Die Stickerfunktionen verbrauchen keine W/L-/Value-Anfrage.

Zehn Textmotive: **Looking for**, **Offering**, **DM me**, **Fair offers**, **Trade closed**, **Adds?**, **No thanks**, **Deal!**, **Upgrading**, **Downgrading**.

## Echte Server-Sticker installieren

```text
/sticker basispaket
/sticker installieren name:Meowl
/sticker installieren name:DM ME
```

Diese Befehle erfordern beim Nutzer **Server verwalten**, beim Bot **Ausdrücke erstellen** oder **Ausdrücke verwalten**. `basispaket` installiert Looking for, Offering, DM me, Fair offers und Trade closed, soweit freie Plätze vorhanden sind. Bereits installierte Motive werden übersprungen. Vorhandene Sticker werden niemals automatisch gelöscht oder ersetzt. Teilfehler werden pro Motiv angezeigt, ein erneuter Aufruf ist möglich.

Discord erlaubt abhängig von Boost-Stufe standardmäßig **5, 15, 30 oder 60 native Sticker**. Hunderte Motive passen daher nicht gleichzeitig in das native Stickermenü. Alle Motive bleiben über `/sticker senden` als PNG verfügbar; dafür braucht man weder Stickerplätze noch Nitro. Native Server-Sticker sind im eigenen Server-Stickermenü verwendbar. Die PNGs sind 320 × 320 Pixel groß und unter 512 KiB.

## Katalog und Quellen

Der beigefügte Stand vom **2. November 2026** enthält alle 355 Secret- und 6 OG-Einträge aus den veröffentlichten Einkommenslisten dieser Wiki-Seiten. Die Zahl folgt den tatsächlich gelesenen Listeneinträgen; eine ältere Zahl im Wiki-Einleitungstext kann davon abweichen. Als angekündigt, unveröffentlicht, gelöscht oder verworfen markierte Abschnitte werden ausgelassen. Die Community-Wiki ist kein offizieller, vollständiger Spiel-Datenfeed.

Für alle **361 ausgelieferten Brainrot-Motive** liegt ein Bild aus dem zugehörigen Wiki-Artikel bei. Mit den zehn Trading-Vorlagen sind **371 PNG-Dateien** enthalten. Die Namenssticker dienen als Rückfall für neue oder künftig nicht bebilderte Einträge.

```text
/sticker sync
```

Das Serverteam kann die Namenslisten neu prüfen. Nur wenn beide Listen erfolgreich geprüft wurden, ersetzt der Bot den Katalog. Neue Motive erstellt er beim ersten Abruf und hält bis zu 150 davon sieben Tage in SQLite vor. Die ausgelieferten PNGs funktionieren ohne Netzabruf. Wo kein überprüfbares Porträt verfügbar ist, wird ein ausdrücklich als **NAME STICKER** beschriftetes Motiv verwendet. Es wird kein vermeintliches Originalbild erfunden. Der aktuelle Namenskatalog und die Bilder können unterschiedliche Aktualisierungsstände haben.

Die Einträge in `assets/stickers/catalog.json` nennen Artikel und Bildquelle je Motiv. Bilder stammen aus dem jeweiligen Wiki-Artikel; Rahmen, Beschriftung und Trading-Vorlagen werden lokal mit Canvas erzeugt. Es wird keine KI-API angesprochen. `sync` lädt keine hunderten Bilder auf einmal nach.

Quellen: [Secret-Liste](https://stealabrainrot.wiki/wiki/secret/), [OG-Liste](https://stealabrainrot.wiki/wiki/og/), [Discord-Sticker-Anforderungen und Platzlimits](https://discord.com/blog/how-to-create-upload-your-own-stickers-on-discord), [offizielle Sticker-API](https://discord.com/developers/docs/resources/sticker#create-guild-sticker).
