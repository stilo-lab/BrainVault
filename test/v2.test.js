import {test} from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {Store} from '../src/store.js';
import {parseAsk,TextCommands} from '../src/text-commands.js';
import {SabAssistant,factAnswer,parseMoney} from '../src/assistant.js';
import {findGuide} from '../src/assistant.js';
import {searchPages} from '../src/sources.js';
import {weeklyStarts,materializeWeekly} from '../src/weekly.js';
import {attributableInvite,inviteStats,InviteService,safeRewardRole} from '../src/invites.js';
import {parseDuration,pickWinners,seedCommitment,GiveawayService} from '../src/giveaways.js';
import {recognizeLocalTrade,tradeFromOcr} from '../src/ocr.js';
import {TradeService,upsertVariant,evaluateTrade,resultPayload} from '../src/trade.js';
import {homeView,questionModal,eventControls} from '../src/interface.js';
import {manualTradeModal,valueEditorModal} from '../src/trade.js';
import {PermissionsBitField,PermissionFlagsBits} from 'discord.js';
const now=Date.now();
const item=name=>({name,mutation:'Normal',traits:[],quantity:1,details_clear:true});
const trade=()=>({is_trade:true,left:[item('A')],right:[item('B')],issues:[]});
test('7ask, Großschreibung, !ask und Bot-Erwähnung werden exakt erkannt',()=>{
  assert.equal(parseAsk('7ASK Wie geht Rebirth?').question,'Wie geht Rebirth?');
  assert.equal(parseAsk('!ask was sind traits').question,'was sind traits');
  assert.equal(parseAsk('<@123> Dig?', '123').question,'Dig?');
  assert.equal(parseAsk('7asked falscher Trigger'),null);assert.equal(parseAsk('7ask').question,'');
});
test('7ask antwortet tatsächlich und unterdrückt unerwünschte Mentions',async()=>{
  const s=new Store(':memory:'),replies=[];let asked;
  const service=new TextCommands(s,{answer:async q=>{asked=q;return{content:'Antwort @everyone'};}},async()=>null);
  await service.onMessage({content:'7ask Was ist Rebirth?',author:{id:'u',bot:false},guildId:'g',channelId:'c',channel:{sendTyping:async()=>{}},reply:async p=>replies.push(p)});
  assert.equal(asked,'Was ist Rebirth?');assert.equal(replies.length,1);assert.deepEqual(replies[0].allowedMentions.parse,[]);s.close();
});
test('Zeitfragen verwenden den Eventplan, ohne allgemeine Wissensantwort aufzurufen',async()=>{
  const s=new Store(':memory:');let answer=false;const service=new TextCommands(s,{answer:async()=>{answer=true;}},async()=>({content:'Countdown'}));
  let reply;await service.onMessage({content:'7ask Wann Dig?',author:{id:'u',bot:false},guildId:'g',channel:{sendTyping:async()=>{}},reply:async p=>reply=p});assert.equal(reply.content,'Countdown');assert.equal(answer,false);s.close();
});
test('Deutsche Grundlagen bleiben ohne Netzwerk verfügbar',async()=>{
  const s=new Store(':memory:'),assistant=new SabAssistant(s,{search:async()=>{throw new Error('Offline');}});
  const response=await assistant.answer('Wie funktioniert Rebirth?','u','g');assert.match(response.embeds[0].description,/benötigten Brainrots/);assert.match(response.embeds[0].footer.text,/ohne KI-API/);s.close();
});
test('Serverwissen ist exakt zugeordnet und strikt servergetrennt',async()=>{
  const s=new Store(':memory:');s.learn('a','Unser Turnier?','Freitags um acht','https://example.com/source');
  assert.equal(s.knowledgeAnswer('a','UNSER TURNIER').answer,'Freitags um acht');assert.equal(s.knowledgeAnswer('b','unser turnier'),undefined);
  const assistant=new SabAssistant(s,{search:async()=>({pages:[]})});assert.match((await assistant.answer('unser turnier','u','a')).embeds[0].description,/Freitags/);assert.equal(s.forget('a','unser turnier'),1);s.close();
});
test('Datenantwort rechnet nur mit einem tatsächlich gelesenen Einkommen',()=>{
  const a={title:'Tralalero Tralala',fields:[{name:'Income',value:'$50K/s'}]};assert.match(factAnswer(a,'Wie viel Einkommen?'),/3\.000\.000/);assert.equal(parseMoney('$1.5M/s'),1500000);assert.equal(parseMoney('not known'),null);
});
test('Tippfehler und vertauschte Buchstaben finden den richtigen Wiki-Titel',()=>{
  const pages=['tralalero tralala','rebirth','mutations'].map(title=>({title,url:title}));assert.equal(searchPages(pages,'tralalreo tralala')[0].title,'tralalero tralala');assert.equal(findGuide('Wie geht die Wiedergeburt?').id,'rebirth');
});
test('Wochenpläne berücksichtigen die amerikanische Zeitumstellung',()=>{
  const times=weeklyStarts('taco',Date.parse('2026-03-01T00:00Z'),Date.parse('2026-03-20T00:00Z'));assert.equal(times[0],Date.parse('2026-03-03T23:00Z'));assert.equal(times[1],Date.parse('2026-03-10T22:00Z'));
});
test('Offizielle Termine verdrängen denselben Server-Wochentermin',()=>{
  const s=new Store(':memory:'),time=Date.parse('2026-11-02T10:00Z');s.setWeekly('g','taco',time+14*86400000,'https://example.com/plan','u');
  s.upsertEvent({id:'roblox:1',title:'Taco',topics:['taco'],start:Date.parse('2026-11-03T23:30Z'),end:Date.parse('2026-11-04T00:00Z'),source:'https://www.roblox.com/events/1',origin:'roblox',status:'confirmed'});
  materializeWeekly(s,time);const events=s.events('g',time);assert.equal(events.filter(e=>e.start<Date.parse('2026-11-04')).length,1);assert.equal(s.events('other',time).length,1);s.close();
});
test('Nur ein eindeutiger Invite-Zuwachs wird zugeschrieben',()=>{
  const previous=new Map([['a',{uses:0}],['b',{uses:0}]]),current=new Map([['a',{code:'a',uses:1,inviter:{id:'u'}}],['b',{code:'b',uses:0}]]);
  assert.equal(attributableInvite(previous,current).inviter.id,'u');current.get('b').uses=1;assert.equal(attributableInvite(previous,current),null);assert.equal(attributableInvite(null,current),null);
});
test('Invite-Zahlen werden bei Wiederbeitritt nicht verdoppelt und sinken bei Austritt',async()=>{
  const s=new Store(':memory:'),service=new InviteService(s,{});let uses=0;
  const guild={id:'g',invites:{fetch:async()=>new Map([['a',{code:'a',uses,inviter:{id:'owner'}}]])}};
  await service.baseline(guild);uses=1;const member={id:'new',guild,user:{id:'new',bot:false,createdTimestamp:0,username:'New'}};
  await service.recordJoin(member);assert.equal(inviteStats(s,'g','owner').valid,1);service.left(member);assert.equal(inviteStats(s,'g','owner').valid,0);
  uses=2;await service.recordJoin(member);assert.equal(inviteStats(s,'g','owner').valid,1);assert.equal(inviteStats(s,'g','owner').total,1);s.close();
});
test('Reward-Rollen mit Verwaltungsrechten oder hoher Position werden abgelehnt',()=>{
  const me={guild:{id:'g'},roles:{highest:{position:10}}};
  assert.equal(safeRewardRole({id:'r',managed:false,position:2,permissions:new PermissionsBitField()},me),true);
  assert.equal(safeRewardRole({id:'r',managed:false,position:2,permissions:new PermissionsBitField(PermissionFlagsBits.Administrator)},me),false);
});
test('Giveaway-Dauer und reproduzierbare Ziehung sind begrenzt und ohne doppelte Gewinner',()=>{
  assert.equal(parseDuration('10m'),600000);assert.throws(()=>parseDuration('2s'));assert.throws(()=>parseDuration('31d'));
  const a=pickWinners(['1','2','2','3'],3,'seed');assert.equal(new Set(a).size,3);assert.deepEqual(a,pickWinners(['3','1','2'],3,'seed'));assert.equal(pickWinners(['1','2'],2,'seed',1,['1']).includes('1'),false);
});
function giveawayFixture(){
  const s=new Store(':memory:'),seed='example-seed';s.db.prepare("INSERT INTO giveaways(id,guild,channel,message,prize,ends,count,host,state,seed,commitment) VALUES ('test','g','c','m','Secret',?,1,'host','open',?,?)").run(Date.now()-1,seed,seedCommitment(seed));
  for(const id of ['1','2','3'])s.db.prepare('INSERT INTO giveaway_entries VALUES (?,?,?)').run('test',id,Date.now());
  const edits=[],members=new Map(['1','2','3'].map(id=>[id,{id,user:{id,bot:false,createdTimestamp:0},displayName:'User '+id,roles:{cache:new Map()}}]));
  const message={edit:async p=>edits.push(p)},channel={messages:{fetch:async()=>message}};
  const guild={id:'g',members:{fetch:async id=>{const m=members.get(id);if(!m)throw Object.assign(new Error('left'),{code:10007});return m;}},channels:{fetch:async()=>channel}};
  return{s,edits,members,client:{guilds:{fetch:async()=>guild},channels:{fetch:async()=>channel}}};
}
test('Ausgefallene Gewinnergrafik führt beim Neustart zu denselben gespeicherten Gewinnern',async()=>{
  const f=giveawayFixture();let fail=true;const service=new GiveawayService(f.s,f.client,{render:async()=>{if(fail)throw new Error('renderer failure');return Buffer.from('PNG-test');}});
  await assert.rejects(service.draw('test'));const winners=service.get('test').winners;assert.notEqual(winners,null);assert.equal(service.get('test').state,'drawing');
  fail=false;const restarted=new GiveawayService(f.s,f.client,{render:async()=>Buffer.from('PNG-test')});await restarted.draw('test');assert.equal(restarted.get('test').winners,winners);assert.equal(restarted.get('test').state,'ended');assert.equal(f.edits.length,1);assert.equal(f.s.db.prepare('SELECT COUNT(*) AS n FROM giveaway_draws').get().n,1);f.s.close();
});
test('Paralleles Beenden erzeugt nur eine Ziehung und eine Gewinnergrafik',async()=>{
  const f=giveawayFixture();let animations=0;const service=new GiveawayService(f.s,f.client,{render:async()=>{animations++;return Buffer.from('PNG-test');}});
  await Promise.all([service.draw('test'),service.draw('test')]);assert.equal(animations,1);assert.equal(f.edits.length,1);f.s.close();
});
test('Nach Ende ist keine Teilnahme mehr möglich',async()=>{
  const f=giveawayFixture(),service=new GiveawayService(f.s,f.client);await assert.rejects(service.component({deferReply:async()=>{},customId:'gw:join:test',guildId:'g',user:{id:'4'}}),/beendet/);f.s.close();
});
test('Lokale OCR lässt unbekannte Mutation oder nicht sichtbare Traits offen',()=>{
  const result=tradeFromOcr('Meowl\nMutation: Normal\nTraits: none','Dragon Cannelloni', ['Meowl','Dragon Cannelloni']);assert.equal(result.left[0].details_clear,true);assert.equal(result.right[0].details_clear,false);assert.equal(result.right[0].mutation,'Unbekannt');
});
test('OCR liest ein echtes Bild vollständig lokal mit dem installierten Sprachpaket',async()=>{
  const canvas=createCanvas(1200,420),c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,1200,420);c.fillStyle='black';c.font='32px sans-serif';
  for(const[x,name]of [[35,'Meowl'],[650,'Dragon Cannelloni']]){c.fillText(name,x,85);c.fillText('Mutation: Normal',x,145);c.fillText('Traits: none',x,205);}
  const result=await recognizeLocalTrade(canvas.toBuffer('image/png'),['Meowl','Dragon Cannelloni']);assert.equal(result.left[0]?.name,'Meowl');assert.equal(result.right[0]?.name,'Dragon Cannelloni');assert.equal(result.left[0]?.details_clear,true);
});
test('Geänderte Trade-Seite während Berechnung darf kein altes Ergebnis anzeigen',async()=>{
  const s=new Store(':memory:');let release,entered;const started=new Promise(r=>entered=r);const blocker=new Promise(r=>release=r);
  const quotes={quote:async x=>{if(x.name==='A'){entered();await blocker;}return{low:x.name==='A'?100:200,high:x.name==='A'?100:200,unit:'points',source:'https://example.com',updated:now};}};
  const service=new TradeService(s,quotes);service.sessions.set('id',{user:'u',guild:'g',at:now,perspective:'left',trade:trade()});const interaction=action=>({customId:`trade:${action}:id`,user:{id:'u'},guildId:'g',deferUpdate:async()=>{},editReply:async()=>{}});
  const pending=service.component(interaction('confirm'));await started;await service.component(interaction('swap'));release();await assert.rejects(pending,/geändert/);assert.equal(service.sessions.get('id').result,null);s.close();
});
test('Veraltete Werte zeigen Quelle und Fehler je Position, aber kein Teilurteil',async()=>{
  const result=await evaluateTrade(trade(),'left',{quote:async()=>({low:1,high:1,unit:'points',source:'https://example.com',updated:now-80*3600000})},'g',now);
  const payload=resultPayload(result,{trade:trade(),perspective:'left'},'id');assert.equal(result.give,undefined);assert.match(payload.embeds[0].fields.map(x=>x.value).join(),/example\.com/);assert.match(payload.embeds[0].fields[0].value,/veraltet/);
});
test('Trade-Historie ist begrenzt und private Einträge werden beim Löschen entfernt',()=>{
  const s=new Store(':memory:');for(let n=0;n<25;n++)s.saveTrade(String(n),'g','u',{verdict:'Fair'});assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM trade_checks').get().n,20);assert.equal(s.tradeHistory('g','other').length,0);s.deleteUser('g','u');assert.equal(s.tradeHistory('g','u').length,0);s.close();
});
test('Discord-Formulare und Hauptmenü erfüllen echte Komponentenlimits',()=>{
  const s=new Store(':memory:');for(const modal of [questionModal(),manualTradeModal(),valueEditorModal()])assert.doesNotThrow(()=>modal.toJSON());for(const row of [...homeView(s,'g').components,...eventControls(null,0,2)])assert.doesNotThrow(()=>row.toJSON());s.close();
});
test('Laufzeitcode enthält keinen externen KI-Endpunkt und keinen KI-Schlüssel',()=>{
  const root=new URL('../src/',import.meta.url);
  for(const file of readdirSync(root).filter(x=>x.endsWith('.js'))){const source=readFileSync(new URL(file,root),'utf8');assert.doesNotMatch(source,/api\.openai\.com|OPENAI_API_KEY|api\.anthropic\.com|generativelanguage\.googleapis\.com/);}
});
test('Grundwerte werden bei einer angefragten Mutation nicht als Variantenwert ausgegeben',()=>{
  const result=factAnswer({title:'Meowl',fields:[{name:'Income',value:'$600M/s'}]},'Wie viel Einkommen hat Gold Meowl?');assert.match(result,/Grundwerte/);assert.match(result,/allein nicht sicher/);
});
test('Auslastungsgrenze blockiert neue Sessions, aber keine laufende Korrektur',()=>{
  const s=new Store(':memory:'),service=new TradeService(s,{});for(let n=0;n<200;n++)service.sessions.set(String(n),{user:'u',guild:'g',at:Date.now()});
  assert.ok(service.session('0','u','g'));assert.throws(()=>service.ensureCapacity(),/Zu viele/);s.close();
});
test('Giveaway-Verwaltung ist für normale Teilnehmer gesperrt',async()=>{
  const f=giveawayFixture(),service=new GiveawayService(f.s,f.client);await assert.rejects(service.command({options:{getSubcommand:()=> 'beenden'},memberPermissions:{has:()=>false}}),/Server verwalten/);f.s.close();
});
test('Fehlgeschlagene Gewinnerzustellung erhält eine Wartezeit statt einer Endlosschleife',async()=>{
  const f=giveawayFixture();let attempts=0;const service=new GiveawayService(f.s,f.client,{render:async()=>{attempts++;throw new Error('temporarily unavailable');}});
  await assert.rejects(service.draw('test'));assert.ok(service.get('test').retry_at>Date.now());await service.tick();assert.equal(attempts,1);f.s.close();
});
