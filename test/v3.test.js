import {test} from 'node:test';
import assert from 'node:assert/strict';
import{mkdtempSync,rmSync,writeFileSync,existsSync,readFileSync}from'node:fs';
import{join}from'node:path';
import{tmpdir}from'node:os';
import{createCanvas}from'@napi-rs/canvas';
import{Store}from'../src/store.js';
import{ValuationAccess,QuotaError,dayWindow,COMMUNITY_ID}from'../src/access.js';
import{ValueService,comparableOffers}from'../src/value.js';
import{TradeService}from'../src/trade.js';
import{recognizeLocalPet}from'../src/ocr.js';
import{winnerCard}from'../src/animation.js';
import{registerCommands}from'../src/registration.js';
import{acquireLock}from'../src/process-lock.js';
import{farmPlan,compareBrainrots}from'../src/sab-tools.js';
import{requireRailwayVolume}from'../src/config.js';
const now=Date.now(),free=async()=>({unlimited:false}),item=name=>({name,mutation:'Normal',traits:[],quantity:1,details_clear:true});
const quote=(name,value,extra={})=>({name,mutation:'Normal',traits:[],low:value,high:value,unit:'points',source:'https://example.com/values',updated:now,...extra});

test('W/L und Value teilen exakt einen globalen kostenlosen Tagesslot',async()=>{
  const s=new Store(':memory:'),gate=new ValuationAccess(s,null,{membership:free});const token=await gate.start('u','wl');gate.commit(token);
  await assert.rejects(gate.start('u','value'),QuotaError);assert.equal((await gate.status('u')).remaining,0);assert.equal((await gate.status('other')).remaining,1);s.close();
});
test('Zwei parallele Anfragen können den Tagesslot nicht doppelt reservieren',async()=>{
  const s=new Store(':memory:'),gate=new ValuationAccess(s,null,{membership:free});const results=await Promise.allSettled([gate.start('u','wl'),gate.start('u','value')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);s.close();
});
test('Technischer Fehler gibt einen reservierten Slot wieder frei',async()=>{
  const s=new Store(':memory:'),gate=new ValuationAccess(s,null,{membership:free});const token=await gate.start('u','value');gate.refund(token);assert.equal((await gate.status('u')).remaining,1);s.close();
});
test('Löschen eigener Abos setzt den globalen Tageszähler nicht zurück',async()=>{
  const s=new Store(':memory:'),gate=new ValuationAccess(s,null,{membership:free});gate.commit(await gate.start('u','value'));s.deleteUser('g','u');await assert.rejects(gate.start('u','wl'),QuotaError);s.close();
});
test('Abgestürzte Reservierungen werden freigegeben, erfolgreiche Anfragen bleiben gesperrt',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'sab-quota-')),path=join(dir,'data.sqlite');
  try{let s=new Store(path),gate=new ValuationAccess(s,null,{membership:free});gate.commit(await gate.start('used','wl'));await gate.start('pending','value');s.close();
    s=new Store(path);gate=new ValuationAccess(s,null,{membership:free});gate.recover();assert.equal((await gate.status('pending')).remaining,1);await assert.rejects(gate.start('used','value'),QuotaError);s.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('Der Tageswechsel erfolgt um Berliner Mitternacht, auch über Sommerzeit',async()=>{
  const before=Date.parse('2026-03-28T23:30:00Z'),window=dayWindow(before);assert.equal(window.day,'2026-03-29');assert.equal(window.reset,Date.parse('2026-03-29T22:00:00Z'));
  const s=new Store(':memory:');let time=before;const gate=new ValuationAccess(s,null,{membership:free,clock:()=>time});gate.commit(await gate.start('u','wl'));time=window.reset+1;assert.equal((await gate.status('u')).remaining,1);s.close();
});
test('Servermitglieder haben keine Tagesgrenze; nach Austritt greift wieder das freie Kontingent',async()=>{
  const s=new Store(':memory:');let member=false;const gate=new ValuationAccess(s,null,{membership:async()=>({unlimited:member})});gate.commit(await gate.start('u','value'));member=true;
  for(let n=0;n<12;n++)gate.commit(await gate.start('u',n%2?'value':'wl'));
  assert.equal((await gate.status('u')).unlimited,true);member=false;await assert.rejects(gate.start('u','value'),QuotaError);s.close();
});
test('Mitgliedschaft wird am konkreten Community-Server frisch abgefragt und nicht aus Cache behauptet',async()=>{
  const s=new Store(':memory:');let member=true,calls=0;const client={guilds:{cache:new Map([[COMMUNITY_ID,{members:{fetch:async options=>{calls++;assert.equal(options.force,true);assert.equal(options.cache,false);if(!member)throw Object.assign(new Error('not member'),{code:10007});return{id:options.user};}}}]])}};
  const gate=new ValuationAccess(s,client);assert.equal((await gate.status('u')).unlimited,true);member=false;assert.equal((await gate.status('u')).unlimited,false);assert.equal(calls,2);s.close();
});
test('Fehlender Bot oder Discord-Fehler kann niemals Unlimited freischalten',async()=>{
  const s=new Store(':memory:'),gate=new ValuationAccess(s,{guilds:{cache:new Map()}});assert.equal((await gate.status('u')).unlimited,false);
  gate.client.guilds.cache.set(COMMUNITY_ID,{members:{fetch:async()=>{throw Object.assign(new Error('forbidden'),{code:50001});}}});const status=await gate.status('u');assert.equal(status.unlimited,false);assert.ok(status.reason);s.close();
});
test('Dieselbe Analyse bleibt wiederholbar, veränderte Positionen benötigen eine neue Anfrage',async()=>{
  const s=new Store(':memory:'),gate=new ValuationAccess(s,null,{membership:free});let token=await gate.start('u','wl');gate.commit(token);token=await gate.bind(token,'u','wl','same');assert.equal((await gate.bind(token,'u','wl','same')).request,token.request);
  await assert.rejects(gate.bind(token,'u','wl','different'),QuotaError);const row=s.db.prepare('SELECT * FROM valuation_usage').get();assert.equal(row.fingerprint.length,64);assert.notEqual(row.user_hash,'u');s.close();
});
test('Tauschvorschläge verwenden frische vergleichbare Einheiten und sinnvolle Mengen',()=>{
  const current=quote('A',100),options=comparableOffers(item('A'),current,[quote('A',100),quote('B',50),quote('Old',100,{updated:now-80*3600000}),quote('OtherUnit',100,{unit:'USD'}),quote('Tiny',1)],now);
  assert.equal(options.length,1);assert.equal(options[0].name,'B');assert.equal(options[0].count,2);
});
test('/value verarbeitet Bilddaten, bewertet nach Bestätigung und belegt das gemeinsame Kontingent',async()=>{
  const s=new Store(':memory:');s.cacheSet('wiki:index',[{title:'A'}]);const gate=new ValuationAccess(s,null,{membership:free}),values={quote:async()=>quote('A',100),alternatives:async()=>[quote('B',50)]},trades=new TradeService(s,values,undefined,gate);
  const service=new ValueService(s,values,trades,gate,{downloader:async()=>({buffer:Buffer.from('photo')}),recognizer:async()=>[item('A')]});
  const draft=await service.start({user:{id:'u'},guildId:'g',options:{getAttachment:()=>({})}});assert.match(draft.content,/lokal/);const id=[...service.sessions.keys()][0];let result;
  await service.component({customId:`value:confirm:${id}`,user:{id:'u'},guildId:'g',deferUpdate:async()=>{},editReply:async p=>result=p});assert.match(result.embeds[0].description,/100/);assert.match(result.embeds[0].fields.map(f=>f.value).join(),/2× B/);await assert.rejects(gate.start('u','wl'),QuotaError);s.close();
});
test('Value-Anfragen sind nutzergebunden und Fehler vor dem Bildlesen verbrauchen nichts',async()=>{
  const s=new Store(':memory:');s.cacheSet('wiki:index',[{title:'A'}]);const gate=new ValuationAccess(s,null,{membership:free}),trades=new TradeService(s,{},undefined,gate),service=new ValueService(s,{},trades,gate,{downloader:async()=>{throw new Error('bad upload');}});
  await assert.rejects(service.start({user:{id:'u'},guildId:'g',options:{getAttachment:()=>({})}}));assert.equal((await gate.status('u')).remaining,1);
  service.sessions.set('x',{user:'u',guild:'g',at:now});await assert.rejects(service.component({customId:'value:confirm:x',user:{id:'other'},guildId:'g'}),/anderen Nutzer/);s.close();
});
test('Bestehender Text-Wert-Befehl verwendet dasselbe Limit und erstattet einen Quellenausfall',async()=>{
  const s=new Store(':memory:'),gate=new ValuationAccess(s,null,{membership:free}),service=new TradeService(s,{quote:async()=>{throw new Error('Offline');}},undefined,gate);
  const i={user:{id:'u'},guildId:'g',options:{getSubcommand:()=> 'wert',getString:name=>name==='name'?'A':null}};
  await assert.rejects(service.command(i),/Offline/);assert.equal((await gate.status('u')).remaining,1);s.close();
});
test('Lokale OCR kann einen einzelnen Brainrot über die gesamte Bildfläche lesen',async()=>{
  const canvas=createCanvas(600,300),c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,600,300);c.fillStyle='black';c.font='32px sans-serif';c.fillText('Meowl',35,70);c.fillText('Mutation: Normal',35,130);c.fillText('Traits: none',35,190);
  const items=await recognizeLocalPet(canvas.toBuffer('image/png'),['Meowl']);assert.equal(items[0].name,'Meowl');assert.equal(items[0].details_clear,true);
});
test('Gewinnerausgabe ist eine statische PNG-Datei',async()=>{
  const image=await winnerCard(['GEWINNER']);assert.deepEqual([...image.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.ok(image.length>1000);
  const source=readFileSync(new URL('../src/animation.js',import.meta.url),'utf8');assert.doesNotMatch(source,/GIFEncoder|gifenc|worker_threads|\.gif/);
});
test('Befehle können ohne CLIENT_ID erkannt und bei unverändertem Stand übersprungen werden',async()=>{
  const s=new Store(':memory:');let puts=0,gets=0;const rest={get:async()=>{gets++;return{id:'123456789012345678'};},put:async()=>{puts++;}};
  const first=await registerCommands({token:'test',rest,store:s});assert.equal(first.clientId,'123456789012345678');assert.equal(first.count,29);assert.equal(puts,1);
  await registerCommands({token:'test',rest,store:s});assert.equal(puts,1);assert.equal(gets,2);s.close();
});
test('Ein Container-Neustart mit wiederverwendeter PID blockiert sich nicht selbst',()=>{
  const dir=mkdtempSync(join(tmpdir(),'sab-lock-')),db=join(dir,'bot.sqlite');
  try{writeFileSync(db+'.lock',String(process.pid));const release=acquireLock(db);assert.throws(()=>acquireLock(db),/bereits/);release();assert.equal(existsSync(db+'.lock'),false);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('Zusätzliche SAB-Werkzeuge vergleichen Grundwerte und berechnen Farmzeiten',async()=>{
  assert.match(farmPlan(360000,100).embeds[0].description,/60 Minuten/);assert.throws(()=>farmPlan(100,0));
  const knowledge={search:async name=>({pages:[{title:name}]}),article:async page=>({title:page.title,fields:[{name:'Income',value:page.title==='A'?'$100/s':'$50/s'}],url:'https://example.com/'+page.title,fetched:now})};const result=await compareBrainrots(knowledge,'A','B');assert.match(result.embeds[0].description,/2 : 1/);
});
test('Railway-Konfiguration startet genau eine Docker-Instanz mit Volume-Startskript',()=>{
  const railway=JSON.parse(readFileSync(new URL('../railway.json',import.meta.url),'utf8'));assert.equal(railway.build.builder,'DOCKERFILE');assert.equal(railway.deploy.numReplicas,1);const docker=readFileSync(new URL('../Dockerfile',import.meta.url),'utf8');assert.match(docker,/ENTRYPOINT.*docker-entrypoint/);assert.match(docker,/gosu/);
});
test('Ein fehlendes Railway-Volume wird verständlich gemeldet, lokale Starts bleiben möglich',()=>{
  assert.throws(()=>requireRailwayVolume({RAILWAY_ENVIRONMENT_ID:'production'}),/Volume.*app\/data/);
  assert.doesNotThrow(()=>requireRailwayVolume({}));assert.doesNotThrow(()=>requireRailwayVolume({RAILWAY_ENVIRONMENT_ID:'production',RAILWAY_VOLUME_MOUNT_PATH:'/app/data'}));
});
test('Fehlgeschlagene Registrierung enthält trotzdem den Bot-Einladungslink',async()=>{
  await assert.rejects(registerCommands({token:'test',clientId:'123456789012345678',rest:{put:async()=>{throw new Error('Noch nicht im Testserver');}}}),error=>error.inviteUrl.includes('client_id=123456789012345678'));
});
