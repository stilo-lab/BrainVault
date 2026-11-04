import{test}from'node:test';
import assert from'node:assert/strict';
import{mkdtempSync,rmSync}from'node:fs';
import{tmpdir}from'node:os';
import{join,relative,isAbsolute}from'node:path';
import{DatabaseSync}from'node:sqlite';
import{PermissionsBitField,PermissionFlagsBits}from'discord.js';
import{Store}from'../src/store.js';
import{Scheduler,eventEmbed}from'../src/scheduler.js';
import{materializeWeekly}from'../src/weekly.js';
import{NotificationService,checkNotificationChannel,sendRoleNotification,calibrateEventTimer}from'../src/notifications.js';
import{classify}from'../src/sources.js';

const now=Date.parse('2026-11-04T12:00:00Z'),all=()=>new PermissionsBitField(PermissionsBitField.All);
const event=(overrides={})=>({id:'e',guild:'g',title:'Admin Abuse',topics:['admin'],start:now+15*60000,end:now+45*60000,source:'https://example.com/event',origin:'manual',status:'confirmed',note:'',...overrides});
function fixture(){
 const role={id:'member-role',name:'Member',guild:{id:'g'},mentionable:false,managed:false,permissions:new PermissionsBitField(PermissionFlagsBits.Administrator)};
 const channel={id:'c',guildId:'g',send:async()=>{},permissionsFor:()=>all()};
 const guild={id:'g',members:{fetchMe:async()=>({id:'bot'})},roles:{fetch:async id=>id===role.id?role:null},channels:{fetch:async id=>id===channel.id?channel:null}};
 const client={guilds:{cache:new Map([['g',guild]])}};
 const i={guild,guildId:'g',user:{id:'admin'},memberPermissions:new PermissionsBitField(PermissionFlagsBits.ManageGuild),createdTimestamp:now,options:{getSubcommand:()=> 'rolle',getRole:()=>role,getChannel:()=>channel,getString:name=>({thema:'admin',rest:'00:15:00'})[name]||null,getInteger:name=>({intervall:180,dauer:10,vorlauf:5,gueltig:72})[name]??null,getBoolean:()=>null}};
 return{role,channel,guild,client,i};
}

test('Vorhandene Serverrolle funktioniert ohne /setup und ohne sie einem Nutzer zuzuteilen',async()=>{
 const s=new Store(':memory:'),{client,i}=fixture(),service=new NotificationService(s,client,{clock:()=>now});const result=await service.command(i);
 assert.equal(s.getGuild('g'),undefined);assert.equal(s.eventPings('g')[0].role,'member-role');assert.equal(s.weekly('g')[0].auto_renew,1);assert.match(result.content,/dauerhaft/i);
 assert.equal(s.allSubscriptions().length,0);assert.ok(s.events('g',now).some(e=>e.topics.includes('admin')));s.close();
});

test('Einrichtung prüft Kanal- und Mention-Rechte; erlaubte mentionable Rolle braucht kein MentionEveryone',async()=>{
 const{role,channel,guild}=fixture();channel.permissionsFor=()=>new PermissionsBitField([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks]);
 await assert.rejects(checkNotificationChannel(guild,channel,[role.id]),/nicht erwähnbar/);role.mentionable=true;await assert.doesNotReject(checkNotificationChannel(guild,channel,[role.id]));
 channel.permissionsFor=entity=>entity===role?new PermissionsBitField():all();await assert.rejects(checkNotificationChannel(guild,channel,[role.id]),/nicht ansehen/);
});

test('Gelöschte und fremde Rollen oder Kanäle werden nicht als funktionierender Ping gespeichert',async()=>{
 const s=new Store(':memory:'),{client,i,role,channel}=fixture(),service=new NotificationService(s,client,{clock:()=>now});role.guild.id='other';await assert.rejects(service.command(i),/dieses Servers/);role.guild.id='g';channel.guildId='other';await assert.rejects(service.command(i),/anderen Server/);assert.equal(s.eventPings('g').length,0);s.close();
});

test('Rollen-Ping erreicht vor dem Event und zum Start die konfigurierte Rolle genau einmal',async()=>{
 const s=new Store(':memory:');s.setEventPing('g','admin','members','c',15);s.upsertEvent(event());const sent=[],scheduler=new Scheduler(s,async(j,p)=>sent.push({j,p}));
 await scheduler.tick(now);await scheduler.tick(now+1000);assert.equal(sent.length,1);assert.equal(sent[0].p.content,'<@&members>');assert.deepEqual(sent[0].p.allowedMentions,{parse:[],roles:['members']});await scheduler.tick(now+15*60000);assert.equal(sent.length,2);s.close();
});

test('Abo-Rollen und zusätzliche Rollen werden im selben Kanal pro Zeitpunkt zusammengefasst',async()=>{
 const s=new Store(':memory:');s.saveGuild('g','c',{admin:'optin'},15);s.setEventPing('g','admin','members','c',15);s.setEventPing('g','update','members','c',15);s.upsertEvent(event({topics:['admin','update']}));const sent=[];await new Scheduler(s,async(j,p)=>sent.push(p)).tick(now);assert.equal(sent.length,1);assert.deepEqual(sent[0].allowedMentions.roles,['optin','members']);s.close();
});

test('Unterschiedliche Kanäle und Vorläufe bekommen nur die jeweils ausgewählten Rollen',async()=>{
 const s=new Store(':memory:');s.saveGuild('g','c',{admin:'optin'},15);s.setEventPing('g','admin','members','other',5);s.upsertEvent(event());const sent=[],scheduler=new Scheduler(s,async(j,p)=>sent.push({j,p}));
 await scheduler.tick(now);assert.equal(sent.length,1);assert.equal(sent[0].j.target,'c');await scheduler.tick(now+10*60000);assert.equal(sent.length,2);assert.equal(sent[1].j.target,'other');assert.deepEqual(sent[1].p.allowedMentions.roles,['members']);s.close();
});

test('Nach Rollenentfernung oder Kanalwechsel werden alte geplante Pings übersprungen',async()=>{
 const s=new Store(':memory:');s.setEventPing('g','admin','old','old-channel',15);s.upsertEvent(event());const sent=[],scheduler=new Scheduler(s,async(j,p)=>sent.push({j,p}));await scheduler.tick(now-1000);
 s.setEventPing('g','admin','new','new-channel',15);await scheduler.tick(now);assert.equal(sent.length,1);assert.equal(sent[0].j.target,'new-channel');assert.deepEqual(sent[0].p.allowedMentions.roles,['new']);s.removeEventPing('g','admin');await scheduler.tick(now+15*60000);assert.equal(sent.length,1);s.close();
});

test('Absagen korrigieren auch einen zuvor gesendeten Ping an eine zusätzliche Rolle nur einmal',async()=>{
 const s=new Store(':memory:');s.setEventPing('g','admin','members','c',15);s.upsertEvent(event());const sent=[],scheduler=new Scheduler(s,async(j,p)=>sent.push(p));await scheduler.tick(now);s.cancel('e');await scheduler.tick(now+1000);await scheduler.tick(now+2000);assert.equal(sent.length,2);assert.match(sent[1].embeds[0].title,/Abgesagt/);assert.deepEqual(sent[1].allowedMentions.roles,['members']);s.close();
});

test('Zusätzliche Rollen-Pings bleiben zwischen Servern getrennt',async()=>{
 const s=new Store(':memory:');s.setEventPing('g','admin','members','c',15);s.setEventPing('other','admin','foreign','foreign-channel',15);s.upsertEvent(event());const sent=[];await new Scheduler(s,async j=>sent.push(j)).tick(now);assert.equal(sent.length,1);assert.equal(sent[0].guild,'g');s.deleteGuild('g');assert.equal(s.eventPings('g').length,0);assert.equal(s.eventPings('other').length,1);s.close();
});

test('Graben-Einrichtung verbindet aktuellen Countdown mit Rollen-Pings für mehrere Runden',async()=>{
 const s=new Store(':memory:'),{client,i}=fixture();i.options.getSubcommand=()=> 'graben';const service=new NotificationService(s,client,{clock:()=>now});await service.command(i);assert.equal(s.timers('g')[0].interval,180*60000);assert.equal(s.eventPings('g')[0].topic,'dig');const sent=[],scheduler=new Scheduler(s,async(j,p)=>sent.push({j,p}));
 await scheduler.tick(now+10*60000);assert.equal(sent.length,1);await scheduler.tick(now+15*60000);assert.equal(sent.length,2);await scheduler.tick(now+195*60000);assert.equal(sent.length,3);assert.match(sent[2].p.embeds[0].title,/Berechneter Start/);s.close();
});

test('Ungültiger Graben-Countdown hinterlässt keine halbe Rollen-/Timer-Einrichtung',async()=>{
 const s=new Store(':memory:'),{client,i}=fixture();i.options.getSubcommand=()=> 'graben';i.options.getString=()=> 'falsch';const service=new NotificationService(s,client,{clock:()=>now});await assert.rejects(service.command(i),/HH:MM:SS/);assert.equal(s.timers('g').length,0);assert.equal(s.eventPings('g').length,0);
 assert.throws(()=>calibrateEventTimer(s,{guild:'g',rest:'03:00:00',interval:180,duration:10,hours:1,creator:'u'},now),/Gültigkeit/);s.close();
});

test('Dauerhafte Wochen-Erinnerungen laufen nach Ablauf weiter, ohne Revisionen ständig zu ändern',()=>{
 const s=new Store(':memory:');s.setWeekly('g','admin',now+86400000,'https://example.com/plan','u',{autoRenew:true});materializeWeekly(s,now);const first=s.events('g',now)[0];assert.ok(first);assert.equal(first.origin,'weekly');assert.equal(s.weekly('g')[0].expires,now+28*86400000);
 s.db.prepare('UPDATE weekly SET expires=?').run(now+2*86400000);materializeWeekly(s,now+60000);assert.equal(s.event(first.id).revision,first.revision);assert.match(eventEmbed(first,{now}).title,/Geplanter Start/);s.stopWeekly('g','admin');materializeWeekly(s,now+2*86400000);assert.equal(s.weekly('g').length,0);s.close();
});

test('Ein ausdrücklich zeitlich begrenzter Wochenplan wird nicht automatisch verlängert',()=>{
 const s=new Store(':memory:');s.setWeekly('g','admin',now-1,'https://example.com/plan','u');materializeWeekly(s,now);assert.equal(s.weekly('g')[0].expires,now-1);assert.equal(s.events('g',now).length,0);s.close();
});

test('Ein Test-Ping erwähnt die echte Rolle, behauptet kein Event und ist gegen Wiederholung begrenzt',async()=>{
 const s=new Store(':memory:'),{client}=fixture();s.setEventPing('g','dig','members','c',15);const sent=[],service=new NotificationService(s,client,{clock:()=>now,sender:async(j,p)=>sent.push(p)});await service.test('g','dig');assert.equal(sent.length,1);assert.deepEqual(sent[0].allowedMentions.roles,['members']);assert.match(sent[0].embeds[0].description,/kein laufendes Event/);assert.equal(s.allEvents(now).length,0);await assert.rejects(service.test('g','dig'),/jede Minute/);s.close();
});

test('Normale Mitglieder dürfen weder fremde Rollen einstellen noch Test-Pings auslösen',async()=>{
 const s=new Store(':memory:'),{client,i}=fixture(),service=new NotificationService(s,client);i.memberPermissions=new PermissionsBitField();await assert.rejects(service.command(i),/Server verwalten/);i.options.getSubcommand=()=> 'test';await assert.rejects(service.command(i),/Server verwalten/);s.close();
});

test('Eine stille, nicht erlaubte Rollen-Erwähnung wird vor dem Versand als Fehler erkannt',async()=>{
 const{client,channel}=fixture();channel.permissionsFor=()=>new PermissionsBitField([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks]);let sends=0;channel.send=async()=>sends++;
 await assert.rejects(sendRoleNotification(client,{guild:'g',target:'c'},{allowedMentions:{parse:[],roles:['member-role']}}),/nicht erwähnbar/);assert.equal(sends,0);
});

test('Status nennt fehlende Graben-Termine und fehlende Rollenrechte, ohne einen Ping zu senden',async()=>{
 const s=new Store(':memory:'),{client,channel}=fixture();s.setEventPing('g','dig','member-role','c',15);channel.permissionsFor=()=>new PermissionsBitField();const service=new NotificationService(s,client,{clock:()=>now}),result=await service.status('g'),text=result.embeds[0].fields.map(f=>f.value).join('\n');assert.match(text,/Kein Termin/);assert.match(text,/benachrichtigung graben/);assert.match(text,/fehlen/);assert.deepEqual(result.allowedMentions.parse,[]);s.close();
});

test('Roblox-Kurzform NEXT UPD wird als Update erkannt; fehlender Admin-Beleg wird nicht erfunden',()=>{
 assert.deepEqual(classify('NEXT UPD'),['update']);assert.deepEqual(classify('GRABEN EVENT'),['dig']);assert.deepEqual(classify('GraveHunt'),['dig']);
});

test('Vorhandene Datenbank bekommt die neue Konfiguration ohne Verlust alter Wochenpläne',()=>{
 const dir=mkdtempSync(join(tmpdir(),'sab-notify-')),path=join(dir,'old.sqlite');let store;
 try{
  const old=new DatabaseSync(path);old.exec('CREATE TABLE weekly(guild TEXT,topic TEXT,expires INTEGER,source TEXT,creator TEXT,PRIMARY KEY(guild,topic))');old.prepare('INSERT INTO weekly VALUES(?,?,?,?,?)').run('g','admin',now+86400000,'https://example.com','u');old.close();
  store=new Store(path);assert.equal(store.weekly('g')[0].auto_renew,0);store.setEventPing('g','dig','members','c',5);store.close();store=new Store(path);assert.equal(store.eventPings('g')[0].role,'members');assert.equal(store.weekly('g')[0].creator,'u');store.close();store=null;
 }finally{store?.close();const child=relative(tmpdir(),dir);assert.ok(child&&!child.startsWith('..')&&!isAbsolute(child));rmSync(dir,{recursive:true,force:true});}
});
