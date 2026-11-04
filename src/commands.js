import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, InteractionContextType } from 'discord.js';
import { TOPICS, LEADS } from './config.js';

const topics = Object.entries(TOPICS).map(([value, t]) => ({ name: t.name, value }));
const leadChoices = LEADS.map(value => ({ name: value ? `${value} Minuten vorher` : 'Zum Start', value }));
const base = (name, description, admin = false) => {
  const c = new SlashCommandBuilder().setName(name).setDescription(description).setContexts(InteractionContextType.Guild);
  if (admin) c.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild); return c;
};
const topicOption = (o, required = false) => o.setName('thema').setDescription('Event-Typ').setRequired(required).addChoices(...topics);
export const commands = [
  base('benachrichtigung','Event-Pings für vorhandene Serverrollen einrichten und prüfen',true)
    .addSubcommand(s=>s.setName('rolle').setDescription('Event-Rolle wählen; für Admin/Taco standardmäßig Wochen-Erinnerungen aktivieren')
      .addStringOption(o=>topicOption(o,true))
      .addRoleOption(o=>o.setName('rolle').setDescription('Alle Mitglieder dieser Rolle werden erwähnt; keine automatische Vergabe').setRequired(true))
      .addChannelOption(o=>o.setName('kanal').setDescription('Kanal für Event-Pings').setRequired(true).addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement))
      .addIntegerOption(o=>o.setName('vorlauf').setDescription('Vorlauf und zusätzlich zum Start; Standard 15 Minuten').addChoices(...leadChoices))
      .addBooleanOption(o=>o.setName('wochenplan').setDescription('Admin/Taco: dauerhafte Wochen-Erinnerung aktivieren; Standard ja')))
    .addSubcommand(s=>s.setName('graben').setDescription('Graben-Pings mit Rolle und dem aktuellen Ingame-Countdown gemeinsam einrichten')
      .addRoleOption(o=>o.setName('rolle').setDescription('Alle Mitglieder dieser Rolle erhalten Graben-Pings').setRequired(true))
      .addChannelOption(o=>o.setName('kanal').setDescription('Graben-Event-Kanal').setRequired(true).addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement))
      .addStringOption(o=>o.setName('rest').setDescription('Aktuelle Restzeit im Spiel als HH:MM:SS').setRequired(true).setMaxLength(12))
      .addIntegerOption(o=>o.setName('intervall').setDescription('Minuten zwischen zwei Starts laut Spiel, z.B. 180').setRequired(true).setMinValue(10).setMaxValue(1440))
      .addIntegerOption(o=>o.setName('dauer').setDescription('Rundendauer in Minuten laut Spiel').setRequired(true).setMinValue(1).setMaxValue(120))
      .addIntegerOption(o=>o.setName('vorlauf').setDescription('Vorlauf und zusätzlich zum Start; Standard 15 Minuten').addChoices(...leadChoices))
      .addIntegerOption(o=>o.setName('gueltig').setDescription('Kalibrierung gilt 1–72 Stunden; Standard 72').setMinValue(1).setMaxValue(72)))
    .addSubcommand(s=>s.setName('status').setDescription('Rollen, Rechte, fehlende Termine und letzte Zustellungen prüfen'))
    .addSubcommand(s=>s.setName('test').setDescription('Einen echten, klar markierten Test-Ping an die ausgewählten Rollen senden')
      .addStringOption(o=>topicOption(o,true)))
    .addSubcommand(s=>s.setName('aus').setDescription('Zusätzliche Rollen-Pings für ein Event-Thema entfernen')
      .addStringOption(o=>topicOption(o,true))),
  base('trading','Bilder-/Sticker-Trading-Kanal verwalten',true)
    .addSubcommand(s=>s.setName('kanal').setDescription('Nur Bilder und Sticker ohne Begleittext in diesem Kanal erlauben')
      .addChannelOption(o=>o.setName('kanal').setDescription('Trading-Kanal auswählen').setRequired(true).addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s=>s.setName('status').setDescription('Trading-Regel und letzte Moderationsfehler anzeigen'))
    .addSubcommand(s=>s.setName('aus').setDescription('Bilder-/Sticker-Regel deaktivieren')),
  base('sticker','Secret-/OG-Brainrots und Trading-Vorlagen auswählen')
    .addSubcommand(s=>s.setName('liste').setDescription('Sticker-Menü mit Vorschau und Senden öffnen')
      .addStringOption(o=>o.setName('kategorie').setDescription('Motive filtern').addChoices({name:'Alle',value:'all'},{name:'Secrets',value:'Secret'},{name:'OGs',value:'OG'},{name:'Trading-Texte',value:'Trading'})))
    .addSubcommand(s=>s.setName('senden').setDescription('Motiv als Bild mit deinem Profil im aktuellen Kanal senden')
      .addStringOption(o=>o.setName('name').setDescription('Brainrot oder Trading-Vorlage').setRequired(true).setMaxLength(100).setAutocomplete(true))
      .addStringOption(o=>o.setName('zweck').setDescription('Optionaler Trading-Hinweis auf dem Bild').addChoices({name:'Looking for',value:'LOOKING FOR'},{name:'Offering',value:'OFFERING'},{name:'DM me',value:'DM ME'},{name:'Fair offers',value:'FAIR OFFERS'})))
    .addSubcommand(s=>s.setName('vorschau').setDescription('320×320-PNG privat ansehen und herunterladen')
      .addStringOption(o=>o.setName('name').setDescription('Brainrot oder Trading-Vorlage').setRequired(true).setMaxLength(100).setAutocomplete(true)))
    .addSubcommand(s=>s.setName('installieren').setDescription('Serverteam: einen echten Server-Sticker in einen freien Platz installieren')
      .addStringOption(o=>o.setName('name').setDescription('Brainrot oder Trading-Vorlage').setRequired(true).setMaxLength(100).setAutocomplete(true)))
    .addSubcommand(s=>s.setName('basispaket').setDescription('Serverteam: fünf grundlegende Trading-Sticker in freie Plätze installieren'))
    .addSubcommand(s=>s.setName('sync').setDescription('Serverteam: veröffentlichte Secret-/OG-Namenslisten neu prüfen'))
    .addSubcommand(s=>s.setName('status').setDescription('Katalogstand, Motive und freie Stickerplätze anzeigen')),
  base('value','Bild deines Brainrots bewerten und mögliche Gegenwerte finden')
    .addAttachmentOption(o=>o.setName('bild').setDescription('Ein gut lesbares Bild deines Brainrots mit Name, Mutation und Traits').setRequired(true)),
  base('wl','W/L/Fair für einen Trade-Screenshot prüfen')
    .addAttachmentOption(o=>o.setName('bild').setDescription('Bild mit beiden Trade-Seiten').setRequired(true))
    .addStringOption(o=>o.setName('ich_gebe').setDescription('Welche Bildseite gibst du ab?').setRequired(true).addChoices({name:'Links',value:'left'},{name:'Rechts',value:'right'})),
  base('limit','Tageskontingent und Unlimited-Mitgliedschaft prüfen'),
  base('vergleich','Grundwerte von zwei Brainrots mit Quellen vergleichen')
    .addStringOption(o=>o.setName('erster').setDescription('Erster Brainrot').setRequired(true).setMaxLength(100).setAutocomplete(true))
    .addStringOption(o=>o.setName('zweiter').setDescription('Zweiter Brainrot').setRequired(true).setMaxLength(100).setAutocomplete(true)),
  base('farm','Berechnen, wie lange du bis zu deinem Geldziel farmen musst')
    .addNumberOption(o=>o.setName('ziel').setDescription('Gewünschter zusätzlicher Geldbetrag').setRequired(true).setMinValue(1).setMaxValue(1e24))
    .addNumberOption(o=>o.setName('pro_sekunde').setDescription('Dein gesamtes aktuelles Einkommen pro Sekunde').setRequired(true).setMinValue(1).setMaxValue(1e18)),
  base('rebirth','Rebirth, Anforderungen und Folgen verständlich erklären'),
  base('mutationen','Mutation, Grundwerte und Traits unterscheiden'),
  base('traits','Erklärt Traits und was für eine korrekte Bewertung benötigt wird'),
  base('invites','Invite-Statistiken, Rangliste und Belohnungen')
    .addSubcommand(s=>s.setName('stats').setDescription('Deine oder fremde Invite-Zahlen ansehen').addUserOption(o=>o.setName('nutzer').setDescription('Optional: anderes Servermitglied')))
    .addSubcommand(s=>s.setName('top').setDescription('Rangliste aktiver gültiger Invites'))
    .addSubcommand(s=>s.setName('rewards').setDescription('Alle Invite-Belohnungen anzeigen'))
    .addSubcommand(s=>s.setName('claim').setDescription('Erreichte Reward-Rollen abholen'))
    .addSubcommand(s=>s.setName('einrichten').setDescription('Serverteam: Invite-Tracking und Kontoalter konfigurieren')
      .addChannelOption(o=>o.setName('logkanal').setDescription('Optionaler Invite-Logkanal').addChannelTypes(ChannelType.GuildText))
      .addIntegerOption(o=>o.setName('mindestalter').setDescription('Mindest-Kontoalter in Tagen, Standard 7').setMinValue(0).setMaxValue(365)))
    .addSubcommand(s=>s.setName('reward_add').setDescription('Serverteam: Reward-Rolle für ein Invite-Ziel festlegen')
      .addIntegerOption(o=>o.setName('anzahl').setDescription('Benötigte aktive gültige Invites').setRequired(true).setMinValue(1).setMaxValue(10000))
      .addRoleOption(o=>o.setName('rolle').setDescription('Belohnungsrolle ohne Verwaltungsrechte').setRequired(true)))
    .addSubcommand(s=>s.setName('reward_remove').setDescription('Serverteam: Reward-Regel entfernen')
      .addIntegerOption(o=>o.setName('anzahl').setDescription('Invite-Ziel').setRequired(true).setMinValue(1).setMaxValue(10000))
      .addRoleOption(o=>o.setName('rolle').setDescription('Reward-Rolle').setRequired(true))),
  base('gw','Giveaways mit Secret-Lucky-Block-Gewinnergrafik')
    .addSubcommand(s=>s.setName('starten').setDescription('Serverteam: Giveaway mit lokaler Gewinnergrafik starten')
      .addStringOption(o=>o.setName('preis').setDescription('Was wird verlost?').setRequired(true).setMaxLength(150))
      .addStringOption(o=>o.setName('dauer').setDescription('Z.B. 30s, 10m, 2h, 3d; maximal 30 Tage').setRequired(true).setMaxLength(15))
      .addIntegerOption(o=>o.setName('gewinner').setDescription('Anzahl Gewinner, Standard 1').setMinValue(1).setMaxValue(5))
      .addChannelOption(o=>o.setName('kanal').setDescription('Giveaway-Kanal, Standard dieser Kanal').addChannelTypes(ChannelType.GuildText))
      .addIntegerOption(o=>o.setName('invites').setDescription('Benötigte aktive gültige Invites').setMinValue(0).setMaxValue(10000))
      .addRoleOption(o=>o.setName('rolle').setDescription('Optional erforderliche Teilnehmerrolle'))
      .addIntegerOption(o=>o.setName('mindestalter').setDescription('Mindest-Kontoalter in Tagen').setMinValue(0).setMaxValue(365)))
    .addSubcommand(s=>s.setName('liste').setDescription('Giveaways dieses Servers anzeigen'))
    .addSubcommand(s=>s.setName('info').setDescription('Status eines Giveaways prüfen').addStringOption(o=>o.setName('id').setDescription('Giveaway-ID').setRequired(true).setMaxLength(30)))
    .addSubcommand(s=>s.setName('beenden').setDescription('Serverteam: Giveaway sofort auslosen').addStringOption(o=>o.setName('id').setDescription('Giveaway-ID').setRequired(true).setMaxLength(30)))
    .addSubcommand(s=>s.setName('neu').setDescription('Serverteam: neue Gewinner ohne frühere Gewinner ziehen').addStringOption(o=>o.setName('id').setDescription('Giveaway-ID').setRequired(true).setMaxLength(30)))
    .addSubcommand(s=>s.setName('abbrechen').setDescription('Serverteam: Giveaway ohne Ziehung abbrechen').addStringOption(o=>o.setName('id').setDescription('Giveaway-ID').setRequired(true).setMaxLength(30)))
    .addSubcommand(s=>s.setName('pruefen').setDescription('Seed-Hash und gespeicherte Ziehungen nachprüfen').addStringOption(o=>o.setName('id').setDescription('Giveaway-ID').setRequired(true).setMaxLength(30))),
  base('start','SAB-Hauptmenü mit Fragen, Trades, Events und Abos öffnen'),
  base('ask','Stelle eine Frage über Steal a Brainrot – auch per 7ask im Chat')
    .addStringOption(o=>o.setName('frage').setDescription('Deine SAB-Frage').setRequired(true).setMaxLength(300)),
  base('diagnose','Serverteam: Einrichtung, Rechte und aktivierte Funktionen prüfen',true),
  base('hilfe','Alle Funktionen und erste Schritte anzeigen'),
  base('sab','SAB-Wissen mit aktuellen Quellen durchsuchen')
    .addSubcommand(s => s.setName('frage').setDescription('Frage zu Steal a Brainrot stellen').addStringOption(o => o.setName('text').setDescription('Zum Beispiel: Wie bekomme ich Spooketti Tualetti?').setRequired(true).setMaxLength(200)))
    .addSubcommand(s => s.setName('suche').setDescription('Wiki nach Brainrots, Mechaniken, Items oder Events durchsuchen').addStringOption(o => o.setName('begriff').setDescription('Name oder Thema').setRequired(true).setAutocomplete(true).setMaxLength(100)))
    .addSubcommand(s => s.setName('quellen').setDescription('Quellen, Stand und Grenzen anzeigen'))
    .addSubcommand(s=>s.setName('kanal').setDescription('Serverteam: Kanal für normale SAB-Fragen setzen oder entfernen')
      .addChannelOption(o=>o.setName('kanal').setDescription('Ohne Angabe wird der automatische Fragekanal deaktiviert').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s=>s.setName('lernen').setDescription('Serverteam: geprüfte deutsche Wissensantwort ergänzen')
      .addStringOption(o=>o.setName('frage').setDescription('Genaue Frage oder Suchbegriff').setRequired(true).setMaxLength(200))
      .addStringOption(o=>o.setName('antwort').setDescription('Geprüfte deutsche Antwort').setRequired(true).setMaxLength(1500))
      .addStringOption(o=>o.setName('quelle').setDescription('HTTPS-Beleglink').setRequired(true).setMaxLength(500)))
    .addSubcommand(s=>s.setName('vergessen').setDescription('Serverteam: eigene Wissensantwort löschen')
      .addStringOption(o=>o.setName('frage').setDescription('Frage des Eintrags').setRequired(true).setMaxLength(200))),
  base('brainrot','Brainrot-Daten aus dem Live-Wiki anzeigen').addStringOption(o => o.setName('name').setDescription('Brainrot-Name').setRequired(true).setAutocomplete(true).setMaxLength(100)),
  base('events','Termine, Countdown und laufende Events anzeigen').addStringOption(o => topicOption(o)),
  base('abo','Persönliche Rollen-Pings und DMs einstellen')
    .addSubcommand(s => s.setName('einstellen').setDescription('Ping-Rollen, DM-Themen und Vorlauf auswählen'))
    .addSubcommand(s => s.setName('status').setDescription('Eigene Abos und offene Erinnerungen anzeigen'))
    .addSubcommand(s => s.setName('dmtest').setDescription('Eine Test-DM an dich senden'))
    .addSubcommand(s => s.setName('loeschen').setDescription('Alle eigenen Abos, Ping-Rollen und gespeicherten Daten dieses Servers löschen')),
  base('erinnerung','Eigene Erinnerungen per DM verwalten')
    .addSubcommand(s => s.setName('setzen').setDescription('Persönliche Erinnerung erstellen')
      .addStringOption(o => o.setName('zeit').setDescription('ISO-Zeit, z.B. 2026-11-07T21:00+01:00; ohne Offset Europe/Berlin').setRequired(true).setMaxLength(60))
      .addStringOption(o => o.setName('text').setDescription('Woran soll ich dich erinnern?').setRequired(true).setMaxLength(500)))
    .addSubcommand(s => s.setName('liste').setDescription('Deine offenen Erinnerungen'))
    .addSubcommand(s => s.setName('loeschen').setDescription('Eine eigene Erinnerung löschen').addStringOption(o => o.setName('id').setDescription('ID aus /erinnerung liste').setRequired(true).setMaxLength(20))),
  base('setup','Event-Kanal und sichere Ping-Rollen einrichten',true)
    .addChannelOption(o => o.setName('kanal').setDescription('Kanal für automatische Event-Pings').setRequired(true).addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement))
    .addIntegerOption(o => o.setName('vorlauf').setDescription('Rollen-Pings: vor dem Event UND zum Start').addChoices(...leadChoices)),
  base('panel','Öffentliches Abo-Panel in diesem Kanal posten',true),
  base('event','Bestätigte Server-Termine verwalten',true)
    .addSubcommand(s => s.setName('setzen').setDescription('Bestätigten Event-Termin mit Quellenlink eintragen')
      .addStringOption(o => o.setName('titel').setDescription('Event-Name').setRequired(true).setMaxLength(150))
      .addStringOption(o => topicOption(o,true))
      .addStringOption(o => o.setName('start').setDescription('ISO-Zeit mit Offset oder Europe/Berlin; siehe /hilfe').setRequired(true).setMaxLength(60))
      .addIntegerOption(o => o.setName('dauer').setDescription('Dauer in Minuten').setRequired(true).setMinValue(1).setMaxValue(10080))
      .addStringOption(o => o.setName('quelle').setDescription('HTTPS-Link zur Ankündigung').setRequired(true).setMaxLength(500))
      .addStringOption(o => o.setName('id').setDescription('Vorhandene manuelle ID zum Ändern; leer = neuer Termin').setMaxLength(100)))
    .addSubcommand(s => s.setName('absagen').setDescription('Einen manuell eingetragenen Termin absagen').addStringOption(o => o.setName('id').setDescription('ID aus /events').setRequired(true).setMaxLength(100)))
    .addSubcommand(s => s.setName('sync').setDescription('Offizielle Roblox-Eventliste jetzt neu abrufen'))
    .addSubcommand(s=>s.setName('board').setDescription('Automatisch aktualisiertes Live-Event-Board posten')
      .addChannelOption(o=>o.setName('kanal').setDescription('Zielkanal').setRequired(true).addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s=>s.setName('board_stoppen').setDescription('Automatische Board-Aktualisierung stoppen'))
    .addSubcommand(s=>s.setName('wochenplan').setDescription('Wochen-Pings nach geprüftem Zeitplan für maximal 28 Tage aktivieren')
      .addStringOption(o=>o.setName('thema').setDescription('Wochen-Event').setRequired(true).addChoices({name:'Admin Abuse',value:'admin'},{name:'Taco Tuesday',value:'taco'}))
      .addStringOption(o=>o.setName('quelle').setDescription('HTTPS-Link zum geprüften Zeitplan').setRequired(true).setMaxLength(500))
      .addIntegerOption(o=>o.setName('tage').setDescription('Gültigkeit in Tagen, Standard 14').setMinValue(1).setMaxValue(28)))
    .addSubcommand(s=>s.setName('plan_stoppen').setDescription('Einen aktivierten Wochenplan beenden')
      .addStringOption(o=>o.setName('thema').setDescription('Wochen-Event').setRequired(true).addChoices({name:'Admin Abuse',value:'admin'},{name:'Taco Tuesday',value:'taco'}))),
  base('timer','Wiederkehrende Ingame-Timer kalibrieren und stoppen',true)
    .addSubcommand(s => s.setName('setzen').setDescription('Angezeigten Ingame-Countdown als Startpunkt übernehmen')
      .addStringOption(o => topicOption(o,true))
      .addStringOption(o => o.setName('rest').setDescription('Verbleibende Zeit laut Spiel: HH:MM:SS, z.B. 02:59:30').setRequired(true).setMaxLength(12))
      .addIntegerOption(o => o.setName('intervall').setDescription('Abstand zwischen Starts in Minuten, z.B. 180 für 3 Stunden').setRequired(true).setMinValue(10).setMaxValue(1440))
      .addIntegerOption(o => o.setName('dauer').setDescription('Dauer einer Runde in Minuten, laut Spiel').setRequired(true).setMinValue(1).setMaxValue(120))
      .addIntegerOption(o => o.setName('gueltig').setDescription('Wie viele Stunden gilt diese Kalibrierung? Standard 72, maximal 72.').setMinValue(1).setMaxValue(72)))
    .addSubcommand(s => s.setName('liste').setDescription('Aktive Timer und Kalibrierung anzeigen'))
    .addSubcommand(s => s.setName('stoppen').setDescription('Timer stoppen und künftige berechnete Termine absagen').addStringOption(o => topicOption(o,true))),
  base('rechner','Einkommen und Amortisationszeit mit eigenen aktuellen Werten berechnen')
    .addNumberOption(o => o.setName('basis').setDescription('Basis-Einkommen in $ pro Sekunde').setRequired(true).setMinValue(0).setMaxValue(1e18))
    .addNumberOption(o => o.setName('gesamtfaktor').setDescription('Gesamtmultiplikator laut Spiel, inklusive Traits/Mutation; Standard 1').setMinValue(0).setMaxValue(1e12))
    .addNumberOption(o => o.setName('preis').setDescription('Optional: Kaufpreis in $').setMinValue(0).setMaxValue(1e24)),
  base('status','Bot, Datenquellen und Zustellfehler prüfen'),
  base('spiel','Aktuelle Roblox-Spielerzahlen und offizieller Spiellink')
  ,base('trade','Screenshot lesen und echten Quellenvergleich für W/L/Fair durchführen')
    .addSubcommand(s=>s.setName('eingeben').setDescription('Trade ohne Bild und ohne Bilderkennungs-API eingeben'))
    .addSubcommand(s=>s.setName('pflegen').setDescription('Serverteam: exakten Variantenwert per Formular pflegen'))
    .addSubcommand(s=>s.setName('verlauf').setDescription('Deine letzten Trade-Ergebnisse anzeigen'))
    .addSubcommand(s=>s.setName('export').setDescription('Serverteam: eigene Werteliste als JSON sichern'))
    .addSubcommand(s=>s.setName('wert').setDescription('Handelswert einer exakten Brainrot-Variante prüfen')
      .addStringOption(o=>o.setName('name').setDescription('Brainrot-Name').setRequired(true).setAutocomplete(true).setMaxLength(100))
      .addStringOption(o=>o.setName('mutation').setDescription('Mutation, Standard Normal').setMaxLength(60))
      .addStringOption(o=>o.setName('traits').setDescription('Alle Traits, durch Komma getrennt; leer = keine').setMaxLength(300)))
    .addSubcommand(s => s.setName('bild').setDescription('Trade-Screenshot lokal mit Texterkennung prüfen – ohne KI-API')
      .addAttachmentOption(o => o.setName('bild').setDescription('PNG, JPG oder WEBP; beide Trade-Seiten und Details gut lesbar').setRequired(true))
      .addStringOption(o => o.setName('ich_gebe').setDescription('Welche Seite des Bildes gibst DU ab?').setRequired(true).addChoices({name:'Links',value:'left'},{name:'Rechts',value:'right'})))
    .addSubcommand(s => s.setName('werte').setDescription('Wertequelle, Datenstand und unterstützte Varianten prüfen'))
    .addSubcommand(s => s.setName('import').setDescription('Serverteam: aktuelle exakte Variantenwerte als JSON importieren')
      .addAttachmentOption(o => o.setName('datei').setDescription('JSON-Datei im dokumentierten Werteformat').setRequired(true)))
    .addSubcommand(s => s.setName('import_loeschen').setDescription('Serverteam: importierte Liste löschen, Standardquelle nutzen'))
    .addSubcommand(s => s.setName('kanal').setDescription('Serverteam: W-or-L-Bildfragen in einem Kanal erkennen')
      .addChannelOption(o => o.setName('kanal').setDescription('Kanal; leer lassen, um Erkennung zu deaktivieren').addChannelTypes(ChannelType.GuildText)))
].map(c => c.toJSON());
