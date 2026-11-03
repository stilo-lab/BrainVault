import { helpView } from './help.js';
import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { TOPICS, LEADS, WIKI, GAME_URL, OFFICIAL_DISCORD } from './config.js';
import { clean, clip, normalize, stamp, validSource, parseWhen, expectedSchedule, errorText } from './utils.js';
import { preferences, publicPanel, applyRoles } from './preferences.js';
import { materializeTimers } from './scheduler.js';
import { materializeWeekly } from './weekly.js';
import { homeView, eventControls, questionModal } from './interface.js';
import { manualTradeModal, valueEditorModal } from './trade.js';
import {QuotaError,joinControls} from './access.js';
import {compareBrainrots,farmPlan} from './sab-tools.js';

const adminCommands = new Set(['setup','panel','event','timer','diagnose','trading']);
const number = n => Number(n || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 });
const topicNames = topics => topics.map(t => `${TOPICS[t].emoji} ${TOPICS[t].name}`).join(', ') || 'Keine';
export async function eventsView(store, guild, topic, requestedPage=0) {
  if(topic&&!TOPICS[topic])topic=null;
  const now = Date.now(); materializeTimers(store, now);materializeWeekly(store,now);
  const events = store.events(guild, now).filter(e => !topic || e.topics.includes(topic));
  const pages=Math.max(1,Math.ceil(events.length/5));const page=Math.min(pages-1,Math.max(0,Number.isFinite(requestedPage)?Math.floor(requestedPage):0));
  const status = store.cacheGet('roblox:status')?.value;
  const stale = !status || now - status.at > 30 * 60_000;
  const lines = events.slice(page*5,page*5+5).map(e => `**${e.start <= now ? '🟢 Läuft' : '🔜'} ${clean(e.title)}**\n${stamp(e.start)} · ${stamp(e.start,'R')} · Ende ${stamp(e.end,'t')}\n${e.origin === 'timer' ? '⏱️ Aus kalibriertem Ingame-Timer berechnet' : e.origin === 'roblox' ? '✅ Roblox-Ankündigung' : e.origin==='weekly'?'🗓️ Vom Server aktivierter Wochenplan · berechnet':'✅ Vom Serverteam bestätigt'} · [Quelle](${e.source})\nID: \`${e.id}\``);
  if (!lines.length) lines.push('Für diese Auswahl ist kein laufender oder kommender Termin hinterlegt.');
  const timers = store.timers(guild).filter(t => t.expires > now && (!topic || t.topic === topic));
  if ((!topic || topic === 'dig') && !timers.some(t => t.topic === 'dig')) lines.push('⛏️ **Dig-Countdown:** Noch nicht kalibriert. Ein Admin kann mit `/timer setzen` die Restzeit vom Ingame-Board und den aktuellen Abstand übernehmen. Ein fester Takt allein verrät die nächste Startzeit nicht.');
  const fields = [];
  if (!topic || ['admin','taco'].includes(topic)) fields.push({ name: 'Übliche Wochenzeiten · unbestätigte Vorschau', value: expectedSchedule(now).filter(e => !topic || (topic === 'admin' ? e.name.startsWith('Admin') : e.name.startsWith('Taco'))).map(e => `${e.name}: ${stamp(e.start)}`).join('\n') + '\nNur Orientierung, dafür werden keine automatischen Pings gesendet. [Community-Zeitplan](https://stealabrainrothelper.com/admin-abuse-timer)' });
  return { embeds: [{ title: `📅 SAB Events${topic ? ` · ${TOPICS[topic].name}` : ''}`, color: 0x5865f2, description: clip(lines.join('\n\n'), 3900), fields,
    footer: { text: `Seite ${page+1}/${pages} • ${events.length} Termine • Roblox zuletzt: ${status ? new Date(status.at).toLocaleString('de-DE',{timeZone:'Europe/Berlin'}) : 'noch nicht erfolgreich abgerufen'}${stale ? ' • Quelle veraltet / nicht erreichbar' : ''} • Zeiten lokal in Discord` } }],components:eventControls(topic,page,pages) };
}
export async function eventQuestion(store,query,guild){
  const norm=normalize(query);
  if(!/wann|countdown|nachste|naechste|wie lange bis|when|next event/.test(norm)||!/event|admin|taco|dig|schaufel|grave/.test(norm))return null;
  return eventsView(store,guild,/dig|schaufel|grave/.test(norm)?'dig':/taco/.test(norm)?'taco':/admin/.test(norm)?'admin':null);
}
async function diagnosis(i,store){
  const me=await i.guild.members.fetchMe(),g=store.getGuild(i.guildId),lines=[];
  const add=(ok,label)=>lines.push(`${ok?'✅':'⚠️'} ${label}`);
  add(me.permissions.has(PermissionFlagsBits.ManageRoles),'Rollen verwalten');
  add(!!g,'Event-Kanal eingerichtet');
  if(g){
    const channel=await i.guild.channels.fetch(g.channel).catch(()=>null),permissions=channel?.permissionsFor(me);
    for(const[bit,label]of [[PermissionFlagsBits.ViewChannel,'Event-Kanal ansehen'],[PermissionFlagsBits.SendMessages,'Event-Nachrichten senden'],[PermissionFlagsBits.EmbedLinks,'Event-Karten einbetten'],[PermissionFlagsBits.MentionEveryone,'SAB-Rollen erwähnen']])add(!!permissions?.has(bit),label);
    for(const[topic,t]of Object.entries(TOPICS)){
      const role=g.roles[topic]?await i.guild.roles.fetch(g.roles[topic]).catch(()=>null):null;
      add(!!role&&!role.managed&&role.permissions.bitfield===0n&&role.position<me.roles.highest.position,`${t.name}: sichere, zuweisbare Ping-Rolle`);
    }
  }
  add(process.env.TEXT_COMMANDS!=='false','7ask / !ask Textbefehle aktiviert (zusätzlich Message Content Intent im Portal nötig)');
  add(process.env.INVITES_ENABLED!=='false','Invite-Tracking aktiviert (zusätzlich Server Members Intent im Portal nötig)');
  add(me.permissions.has(PermissionFlagsBits.ManageGuild),'Server-Invite-Liste lesen');
  add(me.permissions.has(PermissionFlagsBits.AttachFiles),'PNG-Dateien für Gewinnergrafiken anhängen');
  add(me.permissions.has(PermissionFlagsBits.ManageMessages),'Trading-Kanal: Nachrichten verwalten');
  add(me.permissions.has(PermissionFlagsBits.CreateGuildExpressions)||me.permissions.has(PermissionFlagsBits.ManageGuildExpressions),'Native Server-Sticker erstellen');
  add(true,'Antworten und lokale Texterkennung benötigen keine KI-API');
  add(i.client?.guilds?.cache?.has?.('1562906673549541427'),'Bot im Community-Server für die Unlimited-Prüfung installiert');
  const board=store.cacheGet(`board:${i.guildId}`)?.value,error=store.cacheGet(`board:error:${i.guildId}`)?.value;
  lines.push(`📌 Live-Board: ${board?`<#${board.channel}>`:'nicht eingerichtet'}${error?` · ${clean(error.message)}`:''}`);
  return{embeds:[{title:'🛠️ SAB Einrichtungsprüfung',description:lines.join('\n'),color:lines.some(x=>x.startsWith('⚠'))?0xf5b041:0x2ecc71,footer:{text:'Lokale Wissensantworten + öffentliche Quellen • /abo dmtest prüft persönliche DMs.'}}]};
}
async function setup(i, store) {
  const channel = i.options.getChannel('kanal',true); const lead = i.options.getInteger('vorlauf') ?? 15;
  const me = await i.guild.members.fetchMe();
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) throw new Error('Ich benötige „Rollen verwalten“. Verschiebe meine Bot-Rolle über die SAB-Ping-Rollen.');
  const perms = channel.permissionsFor(me);
  for (const p of [PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.MentionEveryone]) {
    if (!perms?.has(p)) throw new Error('Im Event-Kanal benötige ich „Kanal ansehen“, „Nachrichten senden“, „Links einbetten“ und „@everyone, @here und alle Rollen erwähnen“. Die Pings bleiben auf SAB-Rollen begrenzt.');
  }
  const current = store.getGuild(i.guildId); const roles = { ...current?.roles };
  for (const [topic,t] of Object.entries(TOPICS)) {
    let role = roles[topic] ? await i.guild.roles.fetch(roles[topic]) : null;
    if (role && (role.managed || role.permissions.bitfield !== 0n || role.position >= me.roles.highest.position || role.id === i.guildId)) throw new Error(`Die konfigurierte Rolle für ${t.name} muss ohne Zusatzrechte unter meiner Bot-Rolle liegen.`);
    if (!role) role = await i.guild.roles.create({ name: `SAB • ${t.name}`, permissions: [], mentionable: false, reason: `SAB-Setup durch ${i.user.id}` });
    roles[topic] = role.id;
    // Fortschritt speichern: ein erneuter Aufruf erzeugt nach Teilfehlern keine doppelten Rollen.
    store.saveGuild(i.guildId, channel.id, roles, lead);
  }
  return { content: `✅ Event-Kanal <#${channel.id}> und fünf Ping-Rollen eingerichtet.\nRollen-Pings: ${lead ? `${lead} Minuten vorher und ` : ''}zum Start.\nMit /panel das Abo-Menü posten. Mit /timer setzen einen Ingame-Countdown kalibrieren.` };
}
async function knowledgeView(knowledge, query, searchOnly = false) {
  const found = await knowledge.search(query, searchOnly ? 8 : 4);
  if (!found.pages.length) return { content: `Dazu habe ich keinen passenden Wiki-Titel gefunden. Versuche den englischen Item-/Brainrot-Namen.\n[Wiki öffnen](${WIKI}/wiki/)` };
  if (searchOnly) return { embeds: [{ title: '🔎 SAB-Wikisuche', color: 0x9b59b6, description: found.pages.map(p => `• [${clean(p.title)}](${p.url})`).join('\n'), footer: { text: `Community-Wiki • ${found.stale ? 'Index aus Cache, Quelle derzeit nicht erreichbar' : 'Index höchstens 24 Stunden alt'}` } }] };
  const article = await knowledge.article(found.pages[0]);
  return { embeds: [{ title: clip(`🧠 ${article.title}`,256), url: article.url, color: 0x9b59b6,
    description: `**Kurzer Quellenauszug (ggf. Englisch):**\n${article.description}\n\n[Kompletten Guide / Werte öffnen](${article.url})`,
    fields: [...article.fields, ...(found.pages.length > 1 ? [{ name: 'Weitere passende Themen', value: found.pages.slice(1).map(p => `[${clean(p.title)}](${p.url})`).join('\n') }] : [])],
    footer: { text: `Community-Wiki • abgerufen ${new Date(article.fetched).toLocaleString('de-DE',{timeZone:'Europe/Berlin'})}${article.stale ? ' • veralteter Cache, Quelle gerade nicht erreichbar' : ''} • Werte können sich durch Updates ändern` } }] };
}
export function createHandlers({ store, knowledge, roblox, client, scheduler, trades, assistant, boards, invites, giveaways, valueService, access, trading, stickers }) {
  const cooldown = new Map();
  const respond = (i,payload) => i.editReply({ ...payload, allowedMentions: { parse: [] } });
  async function component(i) {
    if (i.customId === 'prefs:open') {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const member = await i.guild.members.fetch(i.user.id);
      return await respond(i, preferences(store,i.guildId,i.user.id,member));
    }
    const [prefix, kind, owner] = i.customId.split(':');
    if (prefix !== 'prefs') return;
    if (owner !== i.user.id) return await i.reply({ content:'Öffne dein eigenes Abo-Menü mit /abo einstellen.',flags:MessageFlags.Ephemeral });
    await i.deferUpdate();
    const member = await i.guild.members.fetch(i.user.id);
    if (kind === 'roles') await applyRoles(member,store.getGuild(i.guildId),i.values.filter(t => TOPICS[t]));
    if (kind === 'dms') {
      const topics = i.values.filter(t => TOPICS[t]); const current = store.subscriptions(i.guildId,i.user.id);
      if (topics.length && !current.length) await i.user.send({ content:`✅ Deine SAB-DMs auf „${i.guild.name}“ sind erreichbar. Themen: ${topicNames(topics)}. Abmelden: /abo einstellen oder /abo loeschen im Server.`,allowedMentions:{parse:[]} });
      store.setSubscriptions(i.guildId,i.user.id,topics,current[0]?.lead ?? 15);
    }
    if (kind === 'lead') {
      const lead = Number(i.values[0]); if (!LEADS.includes(lead)) throw new Error('Ungültiger Vorlauf.');
      const current = store.subscriptions(i.guildId,i.user.id);
      if (!current.length) return await i.followUp({ content:'Wähle zuerst mindestens ein DM-Thema, danach den Vorlauf.',flags:MessageFlags.Ephemeral });
      store.setSubscriptions(i.guildId,i.user.id,current.map(s => s.topic),lead);
    }
    return await respond(i,preferences(store,i.guildId,i.user.id,member));
  }
  async function slash(i) {
    const name = i.commandName; const o = i.options; const sub = o.getSubcommand(false);
    if (adminCommands.has(name) && !i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) throw new Error('Dafür benötigst du „Server verwalten“.');
    switch (name) {
      case 'value':return valueService.start(i);
      case 'wl':return trades.analyze(o.getAttachment('bild',true),o.getString('ich_gebe',true),i.user.id,i.guildId);
      case 'limit':return access.view(i.user.id);
      case 'vergleich':return compareBrainrots(knowledge,o.getString('erster',true),o.getString('zweiter',true));
      case 'farm':return farmPlan(o.getNumber('ziel',true),o.getNumber('pro_sekunde',true));
      case 'rebirth':return assistant.answer('Wie funktioniert Rebirth?',i.user.id,i.guildId);
      case 'mutationen':return assistant.answer('Was ist der Unterschied zwischen Mutation und Traits?',i.user.id,i.guildId);
      case 'traits':return assistant.answer('Was sind Traits?',i.user.id,i.guildId);
      case 'invites':return invites.command(i);
      case 'gw':return giveaways.command(i);
      case 'trading':return trading.command(i);
      case 'sticker':return stickers.command(i);
      case 'start':materializeTimers(store);materializeWeekly(store);return homeView(store,i.guildId);
      case 'ask':return await eventQuestion(store,o.getString('frage',true),i.guildId)||assistant.answer(o.getString('frage',true),i.user.id,i.guildId);
      case 'diagnose':return diagnosis(i,store);
      case 'trade': return trades.command(i);
      case 'hilfe': return helpView();
      case 'setup': return setup(i,store);
      case 'panel': await i.channel.send(publicPanel()); return { content:'✅ Abo-Panel gepostet.' };
      case 'abo': {
        const member = await i.guild.members.fetch(i.user.id);
        if (sub === 'einstellen') return preferences(store,i.guildId,i.user.id,member);
        if (sub === 'dmtest') { await i.user.send({content:'🧠 SAB-Test: Deine DMs funktionieren. Abos stellst du im Server mit /abo einstellen ein.',allowedMentions:{parse:[]}}); return {content:'✅ Test-DM gesendet.'}; }
        if (sub === 'loeschen') {
          // Datenspeicherung immer beenden, auch wenn eine alte Discord-Rolle nicht entfernbar ist.
          store.deleteUser(i.guildId,i.user.id);
          for(const[id,s]of trades.sessions)if(s.user===i.user.id&&s.guild===i.guildId)trades.sessions.delete(id);
          try { if (store.getGuild(i.guildId)) await applyRoles(member,store.getGuild(i.guildId),[]); }
          catch (e) { return {content:`Deine gespeicherten Daten und DMs wurden gelöscht. Ping-Rollen konnten nicht vollständig entfernt werden: ${errorText(e)}`}; }
          return {content:'✅ Eigene Abos, Erinnerungen, Zustellprotokolle und Ping-Rollen dieses Servers gelöscht.'};
        }
        const subs = store.subscriptions(i.guildId,i.user.id); const g = store.getGuild(i.guildId);
        return {content:`**Deine Server-Rollen:** ${topicNames(Object.entries(g?.roles || {}).filter(([,id]) => member.roles.cache.has(id)).map(([t])=>t))}\n**Deine DMs:** ${topicNames(subs.map(s=>s.topic))}\n**DM-Vorlauf:** ${subs[0]?.lead ?? 15} Minuten\n**Offene Erinnerungen:** ${store.reminders(i.guildId,i.user.id).length}\nÄndern: /abo einstellen · Daten löschen: /abo loeschen`};
      }
      case 'events': return eventsView(store,i.guildId,o.getString('thema'));
      case 'sab': {
        if(sub==='lernen'||sub==='vergessen'){
          if(!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild))throw new Error('Dafür benötigst du „Server verwalten“.');
          const question=o.getString('frage',true);
          if(sub==='vergessen')return{content:store.forget(i.guildId,question)?'✅ Eigene Wissensantwort gelöscht.':'Kein eigener Eintrag zu dieser Frage vorhanden.'};
          store.learn(i.guildId,question,clean(o.getString('antwort',true)),validSource(o.getString('quelle',true)));
          return{content:'✅ Geprüfte Server-Antwort gespeichert. 7ask und /ask können sie sofort unter dieser Frage abrufen.'};
        }
        if(sub==='kanal'){
          if(!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild))throw new Error('Dafür benötigst du „Server verwalten“.');
          const channel=o.getChannel('kanal');store.cacheSet(`chat:channel:${i.guildId}`,channel?.id||null);
          return{content:channel?`✅ Fragekanal: <#${channel.id}>. Für automatische Antworten auf normale Fragen zusätzlich CHAT_AUTO_REPLY=true und Message Content Intent aktivieren. 7ask funktioniert mit TEXT_COMMANDS=true in allen lesbaren Kanälen.`:'✅ Automatischer Fragekanal deaktiviert. 7ask bleibt separat verfügbar.'};
        }
        if (sub === 'quellen') return {content:`**Offiziell:** [Roblox-Spiel](${GAME_URL}), öffentliche Roblox-Eventliste und [SAB-Discord](${OFFICIAL_DISCORD}).\n**Wissen:** [Community-Wiki](${WIKI}) mit Live-Titelsuche, kurzen Auszügen, Fakten und Quellenlinks. Index täglich, Artikeldaten bis zu einer Stunde gecacht.\n**Dig-Timer:** vom Serverteam am Ingame-Board kalibriert; Wiederholungen sind berechnet und zeitlich begrenzt. Der Bot liest keinen laufenden Roblox-Server aus.\n**Admin Abuse/Taco:** übliche Wochenzeiten sind als unbestätigt markiert. Pings nur für Roblox-Ankündigungen, manuell bestätigte Termine und kalibrierte Timer.\nKein Bot kann unveröffentlichte Änderungen oder jeden Ingame-Wert automatisch kennen. Bei Problemen wird der letzte Datenstand angezeigt.`};
        const query = o.getString(sub === 'frage' ? 'text' : 'begriff',true);
        const norm = normalize(query);
        if (sub === 'frage' && /wann|countdown|nachste|naechste|timer|how long|when/.test(norm) && /event|admin|taco|dig|schaufel|grave/.test(norm)) {
          const topic = /dig|schaufel|grave/.test(norm) ? 'dig' : /taco/.test(norm) ? 'taco' : /admin/.test(norm) ? 'admin' : null;
          return eventsView(store,i.guildId,topic);
        }
        if(sub==='frage')return assistant.answer(query,i.user.id,i.guildId);
        return knowledgeView(knowledge,query,true);
      }
      case 'brainrot': return knowledgeView(knowledge,o.getString('name',true));
      case 'erinnerung': {
        if (sub === 'setzen') {
          const due = parseWhen(o.getString('zeit',true));
          if (due < Date.now()+10_000 || due > Date.now()+365*86400_000) throw new Error('Die Erinnerung muss zwischen 10 Sekunden und einem Jahr in der Zukunft liegen.');
          await i.user.send({content:`✅ Erinnerung geplant für ${stamp(due)}.`,allowedMentions:{parse:[]}});
          const id = store.addReminder(i.guildId,i.user.id,clean(o.getString('text',true)),due);
          return {content:`✅ Erinnerung \`${id}\` für ${stamp(due)} gespeichert.`};
        }
        if (sub === 'loeschen') return {content:store.removeReminder(i.guildId,i.user.id,o.getString('id',true)) ? '✅ Erinnerung gelöscht.' : 'Keine eigene Erinnerung mit dieser ID gefunden.'};
        const reminders = store.reminders(i.guildId,i.user.id);
        return {content:reminders.length ? reminders.map(r=>`\`${r.id}\` · ${stamp(r.due)} · ${clip(clean(r.text),100)}`).join('\n') : 'Du hast keine offenen Erinnerungen.'};
      }
      case 'event': {
        if(sub==='board'){
          const message=await boards.create(i.guildId,o.getChannel('kanal',true));return{content:`✅ [Live-Board öffnen](${message.url}). Es aktualisiert sich jede Minute. Ich benötige dafür auch „Nachrichtenverlauf anzeigen“. Ein neues Board ersetzt die automatische Aktualisierung des alten.`};
        }
        if(sub==='board_stoppen'){store.db.prepare('DELETE FROM cache WHERE key=?').run(`board:${i.guildId}`);return{content:'✅ Board-Aktualisierung beendet. Die zuletzt gepostete Nachricht bleibt stehen.'};}
        if(sub==='wochenplan'){
          const topic=o.getString('thema',true),days=o.getInteger('tage')??14;
          store.setWeekly(i.guildId,topic,Date.now()+days*86400_000,validSource(o.getString('quelle',true)),i.user.id);materializeWeekly(store);
          return{content:`✅ Wochenplan für ${TOPICS[topic].name} für ${days} Tage aktiviert. Die üblichen Startzeiten werden in America/New_York inklusive Sommerzeit berechnet. Offizielle Roblox-Termine desselben Tages haben Vorrang. Änderungen im Spiel mit /event plan_stoppen berücksichtigen.`};
        }
        if(sub==='plan_stoppen'){store.stopWeekly(i.guildId,o.getString('thema',true));return{content:'✅ Wochenplan beendet und offene berechnete Termine zurückgezogen.'};}
        if (sub === 'sync') { const result = await roblox.sync(); return {content:result.busy ? 'Eine Synchronisierung läuft bereits.' : `✅ ${result.upcoming} aktuelle/künftige Events aus ${result.total} Roblox-Ankündigungen geprüft.`}; }
        if (sub === 'absagen') {
          const e = store.event(o.getString('id',true));
          if (!e || e.guild !== i.guildId || e.origin !== 'manual') throw new Error('Du kannst nur manuelle Termine dieses Servers absagen. Berechnete Timer mit /timer stoppen beenden.');
          store.cancel(e.id); return {content:'✅ Termin abgesagt. Bereits benachrichtigte Abonnenten erhalten eine Korrektur, sofern ihr Abo noch aktiv ist.'};
        }
        const start = parseWhen(o.getString('start',true));
        if (start < Date.now()-60_000 || start > Date.now()+365*86400_000) throw new Error('Der Start muss innerhalb des nächsten Jahres liegen.');
        const existingId = o.getString('id'); const old = existingId ? store.event(existingId) : null;
        if (existingId && (!old || old.guild !== i.guildId || old.origin !== 'manual')) throw new Error('Keine passende manuelle Event-ID dieses Servers.');
        const e = store.upsertEvent({id:old?.id || `manual:${i.guildId}:${randomUUID().slice(0,8)}`,guild:i.guildId,title:clean(o.getString('titel',true)),topics:[o.getString('thema',true)],start,end:start+o.getInteger('dauer',true)*60_000,source:validSource(o.getString('quelle',true)),origin:'manual',status:'confirmed',note:`Vom Serverteam bestätigt (${i.user.id})`});
        return {content:`✅ ${e.title}: ${stamp(e.start)}\nID: \`${e.id}\`\nÄnderungen mit derselben ID eintragen.`};
      }
      case 'timer': {
        if (sub === 'stoppen') { store.stopTimer(i.guildId,o.getString('thema',true)); return {content:'✅ Timer gestoppt; berechnete offene Termine zurückgezogen.'}; }
        if (sub === 'liste') {
          const timers = store.timers(i.guildId);
          return {content:timers.length ? timers.map(t=>`**${TOPICS[t.topic].name}** · alle ${t.interval/60_000} Min. · Runde ${t.duration/60_000} Min.\nAnker: ${stamp(t.anchor)} · gültig bis ${stamp(t.expires)}${t.expires < Date.now() ? ' · ABGELAUFEN' : ''}`).join('\n\n') : 'Keine Timer kalibriert. Nutze /timer setzen mit der Restzeit vom Ingame-Board.'};
        }
        const rest = o.getString('rest',true).match(/^(\d{1,3}):([0-5]\d):([0-5]\d)$/);
        if (!rest) throw new Error('Restzeit bitte als HH:MM:SS eingeben, z.B. 02:59:30.');
        const remaining = (Number(rest[1])*3600+Number(rest[2])*60+Number(rest[3]))*1000;
        const interval = o.getInteger('intervall',true)*60_000, duration = o.getInteger('dauer',true)*60_000;
        if (duration >= interval) throw new Error('Die Event-Dauer muss kleiner als der Abstand zwischen Starts sein.');
        if (remaining > interval) throw new Error('Die Restzeit ist größer als das Intervall. Prüfe die Werte vom Ingame-Board.');
        const now = Date.now(), anchor = i.createdTimestamp+remaining, expires = now+(o.getInteger('gueltig') ?? 24)*3600_000;
        const topic = o.getString('thema',true);
        store.setTimer(i.guildId,topic,anchor,interval,duration,expires,i.user.id); materializeTimers(store,now);
        return {content:`✅ **${TOPICS[topic].name}** kalibriert.\nNächster Start: ${stamp(anchor)} · ${stamp(anchor,'R')}\nAbstand: ${interval/60_000} Minuten · Rundendauer: ${duration/60_000} Minuten\nBerechnung gültig bis ${stamp(expires)}.\nDie Startzeiten werden aus deiner Ingame-Beobachtung berechnet. Bei einem geänderten Countdown erneut kalibrieren.`};
      }
      case 'rechner': {
        const base = o.getNumber('basis',true), factor = o.getNumber('gesamtfaktor') ?? 1, price = o.getNumber('preis');
        const income = base*factor;
        return {embeds:[{title:'💸 SAB-Einkommensrechner',color:0x2ecc71,description:`**$${number(income)} / Sekunde**\n$${number(income*60)} / Minute\n$${number(income*3600)} / Stunde\n${price !== null ? `\nAmortisationszeit: ${income > 0 ? `${number(price/income/60)} Minuten` : 'bei 0 Einkommen nicht erreichbar'}` : ''}\n\nBerechnung: Basis × dein Gesamtfaktor. Den fertigen Faktor aus dem Spiel übernehmen; Trait- und Mutationsregeln werden nicht geraten.`}]};
      }
      case 'spiel': {
        const s = await roblox.stats(); return {embeds:[{title:clean(s.name),url:GAME_URL,color:0x2ecc71,description:`👥 **${number(s.playing)}** Spieler online\n🎮 **${number(s.visits)}** Besuche\n⭐ **${number(s.favorites)}** Favoriten\n\n[Spielen](${GAME_URL})`,footer:{text:`Roblox-API • ${new Date(s.at).toLocaleTimeString('de-DE',{timeZone:'Europe/Berlin'})} Europe/Berlin • Cache max. 60 Sek.`}}]};
      }
      case 'status': {
        const sync = store.cacheGet('roblox:status')?.value, err = store.cacheGet('roblox:error')?.value;
        const isAdmin = i.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
        const failures = isAdmin ? store.db.prepare("SELECT kind,error FROM deliveries WHERE guild=? AND state='failed' ORDER BY due DESC LIMIT 3").all(i.guildId) : [];
        return {content:`🟢 Verbunden · ${Math.max(0,Math.round(client.ws.ping))} ms Gateway-Ping\nRoblox erfolgreich geprüft: ${sync ? stamp(sync.at) : 'Noch nie'}\n${err && (!sync || err.at > sync.at) ? `Letzter Quellenfehler: ${clean(err.message)}\n` : ''}Wiki-Index: ${store.cacheGet('wiki:index')?.value.length ?? 0} Themen\nEvent-Kanal: ${store.getGuild(i.guildId) ? `<#${store.getGuild(i.guildId).channel}>` : 'Noch nicht eingerichtet'}\nScheduler: ${scheduler.running ? 'arbeitet' : 'bereit'}\n${failures.length ? `Letzte Zustellprobleme (Serverteam):\n${failures.map(f=>`• ${f.kind}: ${clean(f.error)}`).join('\n')}` : 'Deine DMs prüfst du mit /abo dmtest.'}`};
      }
      default: throw new Error('Unbekannter Befehl. Bitte Slash-Commands neu registrieren.');
    }
  }
  return async function handle(i) {
    try {
      if (!i.inGuild()) {
        if (i.isAutocomplete()) return await i.respond([]);
        if (i.isRepliable()) return await i.reply({content:'Nutze die Befehle in deinem Discord-Server. DMs dienen für abonnierte Benachrichtigungen.',flags:MessageFlags.Ephemeral});
        return;
      }
      if (i.isAutocomplete()) {
        // Keine langsamen Netzwerkabrufe innerhalb des 3-Sekunden-Autocomplete-Fensters.
        const query = i.options.getFocused(); const index = store.cacheGet('wiki:index');
        if(i.commandName==='sticker')return await i.respond(await stickers.autocomplete(query));
        if (!index || !query) return await i.respond([]);
        const { searchPages } = await import('./sources.js');
        return await i.respond(searchPages(index.value,query,15).map(p=>({name:clip(p.title,100),value:clip(p.title,100)})));
      }
      if((i.isButton()||i.isStringSelectMenu())&&i.customId.startsWith('eventview:')){
        const parts=i.customId.split(':');const topic=parts[1]==='filter'?i.values[0]:parts[2];
        const page=parts[1]==='page'?Number(parts[3]):0;
        if(i.message.flags.has(MessageFlags.Ephemeral))await i.deferUpdate();else await i.deferReply({flags:MessageFlags.Ephemeral});
        return await respond(i,await eventsView(store,i.guildId,topic==='all'?null:topic,page));
      }
      if(i.isButton()&&i.customId.startsWith('gw:'))return await giveaways.component(i);
      if((i.isButton()||i.isStringSelectMenu())&&i.customId.startsWith('sticker:'))return await stickers.component(i);
      if(i.isButton()&&(i.customId==='access:refresh'||i.customId==='hub:limit')){
        await i.deferReply({flags:MessageFlags.Ephemeral});return await respond(i,await access.view(i.user.id));
      }
      if((i.isButton()||i.isStringSelectMenu()||i.isModalSubmit())&&i.customId.startsWith('value:'))return await valueService.component(i);
      if(i.isButton()&&i.customId==='hub:ask')return await i.showModal(questionModal());
      if(i.isButton()&&i.customId==='hub:trade')return await i.showModal(manualTradeModal());
      if(i.isModalSubmit()&&i.customId==='hub:question'){
        await i.deferReply({flags:MessageFlags.Ephemeral});const query=i.fields.getTextInputValue('question');
        return await respond(i,await eventQuestion(store,query,i.guildId)||await assistant.answer(query,i.user.id,i.guildId));
      }
      if(i.isButton()&&i.customId.startsWith('hub:')){
        await i.deferReply({flags:MessageFlags.Ephemeral});
        if(i.customId==='hub:market')return await respond(i,await trades.valuesView(i.guildId));
        return await respond(i,await eventsView(store,i.guildId,i.customId==='hub:dig'?'dig':null));
      }
      if ((i.isButton() || i.isModalSubmit()) && i.customId.startsWith('trade:')) return await trades.component(i);
      if (i.isButton() || i.isStringSelectMenu()) return await component(i);
      if (!i.isChatInputCommand()) return;
      const last = cooldown.get(i.user.id) || 0;
      if (Date.now()-last < 2000) return await i.reply({content:'Bitte warte kurz vor dem nächsten Befehl.',flags:MessageFlags.Ephemeral});
      cooldown.set(i.user.id,Date.now()); if (cooldown.size>10000) for (const [id,t] of cooldown) if (Date.now()-t>60_000) cooldown.delete(id);
      if(i.commandName==='trade'&&['eingeben','pflegen'].includes(i.options.getSubcommand())){
        if(i.options.getSubcommand()==='pflegen'&&!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild))throw new Error('Dafür benötigst du „Server verwalten“.');
        return await i.showModal(i.options.getSubcommand()==='pflegen'?valueEditorModal():manualTradeModal());
      }
      const privateReply = ['abo','setup','panel','event','timer','erinnerung','status','hilfe','trade','start','diagnose','invites','gw','value','wl','limit','trading','sticker'].includes(i.commandName)||i.commandName==='sab'&&['kanal','lernen','vergessen'].includes(i.options.getSubcommand());
      await i.deferReply(privateReply ? {flags:MessageFlags.Ephemeral} : {});
      return await respond(i,await slash(i));
    } catch (error) {
      console.warn(`Interaktion fehlgeschlagen: ${errorText(error)}`);
      const payload = {content:`⚠️ ${errorText(error)}`,allowedMentions:{parse:[]},...(error instanceof QuotaError?{components:joinControls()}: {})};
      try {
        if (i.isAutocomplete()) return await i.respond([]);
        if (i.isMessageComponent() && i.deferred) return await i.followUp({...payload,flags:MessageFlags.Ephemeral});
        if (i.deferred || i.replied) return await i.editReply(payload);
        return await i.reply({...payload,flags:MessageFlags.Ephemeral});
      } catch { /* Interaktion kann nach Disconnect abgelaufen sein. */ }
    }
  };
}
