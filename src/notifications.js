import {PermissionFlagsBits} from 'discord.js';
import {TOPICS,LEADS} from './config.js';
import {channelTargets} from './event-targets.js';
import {materializeTimers} from './scheduler.js';
import {materializeWeekly} from './weekly.js';
import {clip,clean,stamp,errorText} from './utils.js';

const WEEKLY_SOURCE='https://stealabrainrot.wiki/wiki/admin-abuse/';
const problem=message=>Object.assign(new Error(message),{permanent:true});

export async function checkNotificationChannel(guild,channel,roleIds){
  if(!channel||channel.guildId!==guild.id||typeof channel.send!=='function')throw problem('Der eingestellte Event-Kanal fehlt oder gehört zu einem anderen Server.');
  const me=await guild.members.fetchMe(),permissions=channel.permissionsFor(me);
  for(const bit of [PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks])if(!permissions?.has(bit))throw problem('Im Event-Kanal fehlen Kanal ansehen, Nachrichten senden oder Links einbetten.');
  for(const id of roleIds){
    const role=await guild.roles.fetch(id,{force:true});
    if(!role||role.id===guild.id||role.managed)throw problem('Eine ausgewählte Event-Rolle fehlt oder ist keine normale Serverrolle. Bitte /benachrichtigung rolle erneut einstellen.');
    if(!role.mentionable&&!permissions.has(PermissionFlagsBits.MentionEveryone))throw problem(`Die Rolle „${clean(role.name)}“ ist nicht erwähnbar. Gib dem Bot im Event-Kanal „@everyone, @here und alle Rollen erwähnen“ oder mache diese Rolle erwähnbar.`);
    if(!channel.permissionsFor(role)?.has(PermissionFlagsBits.ViewChannel))throw problem(`Die Rolle „${clean(role.name)}“ darf den Event-Kanal nicht ansehen. Passe die Kanalrechte an.`);
  }
  return channel;
}

export async function sendRoleNotification(client,job,payload){
  const guild=client.guilds.cache.get(job.guild);
  if(!guild)throw problem('Der Bot ist nicht mehr im Server.');
  const channel=await guild.channels.fetch(job.target);
  await checkNotificationChannel(guild,channel,payload.allowedMentions?.roles||[]);
  return channel.send(payload);
}

export function calibrateEventTimer(store,{guild,topic='dig',rest,interval,duration,hours=72,creator,created},now=Date.now()){
  const match=String(rest).match(/^(\d{1,3}):([0-5]\d):([0-5]\d)$/);
  if(!match)throw new Error('Restzeit bitte als HH:MM:SS eingeben, z.B. 02:15:00.');
  if(!TOPICS[topic]||!Number.isInteger(interval)||interval<10||interval>1440||!Number.isInteger(duration)||duration<1||duration>120||duration>=interval||!Number.isInteger(hours)||hours<1||hours>72)throw new Error('Bitte ein gültiges Thema, Intervall 10–1440 Minuten, eine kürzere Dauer von 1–120 Minuten und eine Gültigkeit von 1–72 Stunden angeben.');
  const remaining=(Number(match[1])*3600+Number(match[2])*60+Number(match[3]))*1000;
  if(remaining>interval*60000)throw new Error('Die Restzeit ist größer als der Abstand zwischen zwei Starts. Übernimm die aktuellen Angaben aus dem Spiel.');
  const anchor=(Number.isFinite(created)?created:now)+remaining,expires=now+hours*3600000;
  if(anchor>=expires)throw new Error('Die Gültigkeit endet vor dem ersten Event. Wähle eine längere Gültigkeit.');
  store.setTimer(guild,topic,anchor,interval*60000,duration*60000,expires,creator);
  materializeTimers(store,now);return{anchor,expires};
}

export class NotificationService{
  constructor(store,client,{clock=()=>Date.now(),sender=(job,payload)=>sendRoleNotification(client,job,payload)}={}){this.store=store;this.client=client;this.clock=clock;this.sender=sender;this.testAt=new Map();}
  async configure(i,topic){
    const role=i.options.getRole('rolle',true),channel=i.options.getChannel('kanal',true),lead=i.options.getInteger('vorlauf')??15;
    if(!TOPICS[topic]||!LEADS.includes(lead))throw new Error('Ungültiges Event-Thema oder ungültiger Vorlauf.');
    if(role.guild?.id!==i.guildId||role.id===i.guildId||role.managed)throw new Error('Wähle eine normale Rolle dieses Servers. Die Rolle wird nur gepingt und niemandem automatisch zugeteilt.');
    await checkNotificationChannel(i.guild,channel,[role.id]);
    return{role,channel,lead};
  }
  weekly(guild,topic,user){
    if(!['admin','taco'].includes(topic))return false;
    const now=this.clock(),old=this.store.weekly(guild).find(p=>p.topic===topic);
    if(!old||old.expires<=now)this.store.setWeekly(guild,topic,now+28*86400000,WEEKLY_SOURCE,user,{autoRenew:true});
    else if(!old.auto_renew)this.store.db.prepare('UPDATE weekly SET auto_renew=1 WHERE guild=? AND topic=?').run(guild,topic);
    materializeWeekly(this.store,now);return true;
  }
  async status(guild){
    const now=this.clock();materializeTimers(this.store,now);materializeWeekly(this.store,now);
    const settings=this.store.getGuild(guild),configured=this.store.eventPings(guild),events=this.store.events(guild,now),plans=this.store.weekly(guild),fields=[];
    for(const[topic,t]of Object.entries(TOPICS)){
      const custom=configured.find(p=>p.topic===topic),defaultRole=settings?.roles[topic],next=events.find(e=>e.topics.includes(topic));
      let value=custom?`**Alle mit <@&${custom.role}>** → <#${custom.channel}> · ${custom.lead} Min. vorher und zum Start.`:'Keine zusätzliche Serverrolle gewählt. /benachrichtigung rolle';
      if(defaultRole)value+=`\nAbo-Rolle: <@&${defaultRole}> in <#${settings.channel}>.`;
      value+=next?`\nNächster Termin: ${stamp(next.start)} · ${next.origin==='weekly'?'Wochen-Erinnerung, geplant':next.origin==='timer'?'aus kalibriertem Countdown berechnet':next.origin==='roblox'?'Roblox-Ankündigung':'Server-Termin'}.`:'\n⚠️ Kein Termin: dafür kann aktuell kein Event-Ping eingeplant werden.';
      const timer=this.store.timers(guild).find(p=>p.topic===topic),plan=plans.find(p=>p.topic===topic&&p.expires>now);
      if(topic==='dig')value+=timer&&timer.expires>now?`\nTimer gültig bis ${stamp(timer.expires)}.`:'\nGraben mit /benachrichtigung graben am aktuellen Spiel-Countdown einrichten.';
      if(['admin','taco'].includes(topic))value+=plan?`\nWochenplan: ${plan.auto_renew?'dauerhaft aktiv':`bis ${stamp(plan.expires)}`}.`:'\nWochen-Erinnerung mit /benachrichtigung rolle aktivieren.';
      if(custom){try{const discordGuild=this.client.guilds.cache.get(guild);if(!discordGuild)throw new Error('Bot nicht im Server.');await checkNotificationChannel(discordGuild,await discordGuild.channels.fetch(custom.channel),[custom.role]);value+='\n✅ Kanal- und Ping-Rechte geprüft.';}catch(e){value+='\n⚠️ '+errorText(e);}}
      fields.push({name:`${t.emoji} ${t.name}`,value:clip(value,1024)});
    }
    const sent=this.store.db.prepare("SELECT sent FROM deliveries WHERE guild=? AND kind='channel' AND state='sent' ORDER BY sent DESC LIMIT 1").get(guild);
    const failed=this.store.db.prepare("SELECT error,due FROM deliveries WHERE guild=? AND kind='channel' AND state='failed' ORDER BY due DESC LIMIT 1").get(guild);
    const tick=this.store.cacheGet('notifications:scheduler')?.value;
    fields.push({name:'Zustellung',value:`Scheduler zuletzt: ${tick?stamp(tick.at,'R'):'noch nicht gelaufen'}\nLetzte erfolgreiche Event-Nachricht: ${sent?stamp(sent.sent,'R'):'noch keine'}${failed?`\nLetzter Fehler: ${clip(clean(failed.error),250)}`:''}`});
    return{embeds:[{title:'🔔 Event-Pings · Einrichtung und Termine',color:0x5865f2,description:'Rolle, Kanal und Termin müssen zusammen vorhanden sein. /benachrichtigung test prüft einen echten Rollen-Ping. Persönliche Discord-Stummschaltungen können Push-Nachrichten verhindern.',fields}],allowedMentions:{parse:[]}};
  }
  async test(guild,topic){
    if(!TOPICS[topic])throw new Error('Ungültiges Event-Thema.');
    const key=`${guild}:${topic}`,now=this.clock();
    if(this.testAt.has(key)&&now-this.testAt.get(key)<60000)throw new Error('Ein Test-Ping pro Thema und Server ist jede Minute möglich.');
    const targets=channelTargets(this.store,{guild,topics:[topic]}).filter(t=>t.lead===0);
    if(!targets.length)throw new Error('Wähle zuerst mit /benachrichtigung rolle eine Rolle und einen Kanal.');
    this.testAt.set(key,now);for(const[k,at]of this.testAt)if(now-at>600000)this.testAt.delete(k);
    const results=[];let success=0;
    for(const target of targets){try{
      await this.sender({guild,target:target.channel,kind:'channel'},{content:target.roles.map(id=>`<@&${id}>`).join(' '),embeds:[{title:`🔔 Test-Ping · ${TOPICS[topic].name}`,color:0x5865f2,description:'Das ist ein Einrichtungstest. Er kündigt kein laufendes Event an. Alle Mitglieder der genannten Rollen mit Zugriff auf diesen Kanal werden erwähnt; persönliche Discord-Einstellungen bestimmen Push-Mitteilungen.'}],allowedMentions:{parse:[],roles:target.roles}});
      results.push(`✅ Test-Ping in <#${target.channel}> gesendet.`);success++;
    }catch(e){results.push(`⚠️ <#${target.channel}>: ${errorText(e)}`);}}
    if(!success)this.testAt.delete(key);
    return{content:results.join('\n'),allowedMentions:{parse:[]}};
  }
  async command(i){
    if(!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild))throw new Error('Dafür benötigst du „Server verwalten“.');
    const sub=i.options.getSubcommand(),topic=sub==='graben'?'dig':i.options.getString('thema');
    if(sub==='status')return this.status(i.guildId);
    if(!TOPICS[topic])throw new Error('Ungültiges Event-Thema.');
    if(sub==='test')return this.test(i.guildId,topic);
    if(sub==='aus'){this.store.removeEventPing(i.guildId,topic);return{content:`✅ Zusätzliche Rollen-Pings für ${TOPICS[topic].name} entfernt. Persönliche Abos bleiben über /abo einstellbar. Wochenpläne lassen sich mit /event plan_stoppen beenden.`};}
    const {role,channel,lead}=await this.configure(i,topic),now=this.clock();let detail='';
    this.store.db.exec('BEGIN IMMEDIATE');
    try{
    if(sub==='graben'){
      const timer=calibrateEventTimer(this.store,{guild:i.guildId,rest:i.options.getString('rest',true),interval:i.options.getInteger('intervall',true),duration:i.options.getInteger('dauer',true),hours:i.options.getInteger('gueltig')??72,creator:i.user.id,created:i.createdTimestamp},now);
      detail=`\n⛏️ Nächster berechneter Start: ${stamp(timer.anchor)}. Timer gültig bis ${stamp(timer.expires)}. Bei geändertem Countdown neu kalibrieren.`;
    }else if(i.options.getBoolean('wochenplan')!==false&&this.weekly(i.guildId,topic,i.user.id))detail='\n🗓️ Dauerhafte Wochen-Erinnerungen nach dem Community-Zeitplan aktiviert. Das sind geplante Zeiten, kein Live-Nachweis. Mit /event plan_stoppen abschaltbar.';
    this.store.setEventPing(i.guildId,topic,role.id,channel.id,lead);
    this.store.db.exec('COMMIT');
    }catch(e){this.store.db.exec('ROLLBACK');throw e;}
    const upcoming=this.store.events(i.guildId,now).find(e=>e.topics.includes(topic));
    if(!upcoming)detail+='\n⚠️ Noch kein Termin vorhanden. Für Graben /benachrichtigung graben mit dem aktuellen Countdown verwenden; Einzeltermine mit /event setzen eintragen.';
    return{content:`✅ **Alle Mitglieder mit <@&${role.id}>** erhalten Rollen-Pings für **${TOPICS[topic].name}** in <#${channel.id}>: ${lead?`${lead} Minuten vorher und `:''}zum Start. Die Rolle wird niemandem automatisch zugeteilt.${detail}\nMit /benachrichtigung test kannst du den Ping sofort prüfen.`,allowedMentions:{parse:[]}};
  }
}
