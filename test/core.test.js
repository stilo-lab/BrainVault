import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.js';
import { parseWhen, expectedSchedule } from '../src/utils.js';
import { classify, parseArticle, parseRobloxEvent, searchPages, Knowledge, RobloxSource } from '../src/sources.js';
import { Scheduler, materializeTimers } from '../src/scheduler.js';
import { commands } from '../src/commands.js';

const now=Date.parse('2026-11-02T12:00:00Z');
const event=(overrides={})=>({id:'test:1',guild:null,title:'Admin Abuse',topics:['admin','update'],start:now+15*60_000,end:now+45*60_000,source:'https://www.roblox.com/events/1',origin:'roblox',status:'confirmed',note:'',...overrides});
function setupStore(){const s=new Store(':memory:');s.saveGuild('g','c',{admin:'role',update:'role2'},15);s.setSubscriptions('g','u',['admin','update'],15);return s;}
test('29 valide Slash-Commands mit eindeutigen Namen',()=>{assert.equal(commands.length,29);assert.equal(new Set(commands.map(c=>c.name  )).size,29);for(const c of commands){assert.ok(c.name.length<=32);assert.ok(c.description.length<=100);}});
test('Zeitparser berücksichtigt Berlin, Offset und Discord-Zeitstempel',()=>{
  assert.equal(parseWhen('2026-11-07T21:00'),Date.parse('2026-11-07T20:00Z'));
  assert.equal(parseWhen('2026-07-07T21:00+02:00'),Date.parse('2026-07-07T19:00Z'));
  assert.equal(parseWhen('<t:1793600000:F>'),1793600000000);
  assert.throws(()=>parseWhen('morgen 15 Uhr'));
  assert.throws(()=>parseWhen('2026-03-29T02:30'),/existiert/);
  assert.throws(()=>parseWhen('2026-10-25T02:30'),/doppeldeutig/);
});
test('Wochenvorschau verwendet US-Sommerzeit statt fixer UTC-Offsets',()=>{
  const a=expectedSchedule(Date.parse('2026-03-25T00:00Z'));
  assert.equal(a.find(x=>x.name.startsWith('Admin')).start,Date.parse('2026-03-28T19:00Z'));
  const b=expectedSchedule(now);assert.equal(b.find(x=>x.name.startsWith('Taco')).start,Date.parse('2026-11-03T23:00Z'));
});
test('Ereignisse sind servergetrennt, aktualisierbar und dauerhaft gespeichert',()=>{
  const dir=mkdtempSync(join(tmpdir(),'sab-test-'));const path=join(dir,'test.sqlite');
  try{let s=new Store(path);s.upsertEvent(event());s.upsertEvent(event({id:'private',guild:'a'}));assert.equal(s.events('b',now).length,1);assert.equal(s.events('a',now).length,2);
    assert.equal(s.upsertEvent(event()).revision,1);assert.equal(s.upsertEvent(event({start:now+60_000})).revision,2);s.close();s=new Store(path);assert.equal(s.event('test:1').revision,2);s.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('Roblox-Klassifizierung kann mehrere Abos treffen; Universe wird validiert',()=>{
  assert.deepEqual(classify('New Update with Admin Abuse and Dig Event'),['admin','dig','update']);
  const row={id:'3',universeId:7709344486,title:'DIG EVENT',eventTime:{startUtc:'2026-11-02T14:00Z',endUtc:'2026-11-02T14:10Z'},eventStatus:'active'};
  assert.equal(parseRobloxEvent(row).topics[0],'dig');assert.equal(parseRobloxEvent({...row,universeId:1}),null);
});
test('Roblox-Sync paginiert vollständig und zieht fehlende Zukunftstermine zurück',async()=>{
  const s=new Store(':memory:');let count=0;
  const row={id:'3',universeId:7709344486,title:'ADMIN ABUSE',eventTime:{startUtc:'2026-11-02T14:00Z',endUtc:'2026-11-02T15:00Z'},eventStatus:'active'};
  const source=new RobloxSource(s,async url=>{count++;return new URL(url).searchParams.has('cursor')?{data:[row],nextPageCursor:''}:{data:[],nextPageCursor:'page2'};});
  await source.sync(now);assert.equal(count,2);assert.equal(s.event('roblox:3').status,'confirmed');
  source.fetcher=async()=>({data:[],nextPageCursor:''});await source.sync(now);assert.equal(s.event('roblox:3').status,'cancelled');s.close();
});
test('Fehlgeschlagene Roblox-Seite sagt keine gespeicherten Events ab',async()=>{
  const s=new Store(':memory:');s.upsertEvent(event({id:'roblox:old'}));let count=0;
  const source=new RobloxSource(s,async()=>{if(++count===1)return{data:[],nextPageCursor:'more'};throw new Error('Offline');});
  await assert.rejects(source.sync(now));assert.equal(s.event('roblox:old').status,'confirmed');s.close();
});
test('Scheduler dedupliziert mehrere Themen und startet nach Neustart nicht erneut',async()=>{
  const s=setupStore();s.upsertEvent(event());const sent=[];const scheduler=new Scheduler(s,async(j,p)=>sent.push({j,p}));
  await scheduler.tick(now);assert.equal(sent.length,2);assert.equal(sent.filter(x=>x.j.kind==='dm').length,1);
  const channel=sent.find(x=>x.j.kind==='channel');assert.deepEqual(channel.p.allowedMentions.roles,['role','role2']);assert.deepEqual(channel.p.allowedMentions.parse,[]);
  await new Scheduler(s,async()=>sent.push('duplicate')).tick(now+1000);assert.equal(sent.length,2);
  await scheduler.tick(now+15*60_000);assert.equal(sent.length,3);s.close();
});
test('Nach Abmeldung werden schon geplante DMs übersprungen',async()=>{
  const s=setupStore();s.upsertEvent(event());const sent=[];const scheduler=new Scheduler(s,async j=>sent.push(j));
  await scheduler.tick(now-60_000);s.setSubscriptions('g','u',[],15);await scheduler.tick(now);
  assert.equal(sent.filter(x=>x.kind==='dm').length,0);s.close();
});
test('Absagen und Zeitänderungen korrigieren bereits gesendete Pings einmal',async()=>{
  const s=setupStore();s.upsertEvent(event());const sent=[];const scheduler=new Scheduler(s,async j=>sent.push(j));
  await scheduler.tick(now);s.cancel('test:1');await scheduler.tick(now+1000);assert.equal(sent.length,4);
  await scheduler.tick(now+2000);assert.equal(sent.length,4);
  s.upsertEvent(event({start:now+90*60_000,end:now+120*60_000}));await scheduler.tick(now+3000);assert.equal(sent.length,6);s.close();
});
test('Verpasste Event-Pings fluten nach Ausfall nicht den Server',async()=>{
  const s=setupStore();s.upsertEvent(event({start:now-10*60_000,end:now+10*60_000}));let sent=0;
  await new Scheduler(s,async()=>sent++).tick(now);assert.equal(sent,0);s.close();
});
test('Temporäre Zustellfehler werden wiederholt; blockierte DMs nicht',async()=>{
  const s=setupStore();s.upsertEvent(event());const scheduler=new Scheduler(s,async j=>{if(j.kind==='dm'){const e=new Error('DM gesperrt');e.code=50007;throw e;}throw new Error('Netzwerk');},{warn(){}});
  await scheduler.tick(now);
  assert.equal(s.db.prepare("SELECT state FROM deliveries WHERE kind='dm'").get().state,'failed');
  assert.equal(s.db.prepare("SELECT state FROM deliveries WHERE kind='channel' AND lead=15").get().state,'pending');s.close();
});
test('Kalibrierter Drei-Stunden-Timer läuft nur bis zum Ablauf und stoppt sauber',()=>{
  const testNow=Date.now();const s=new Store(':memory:');s.setTimer('g','dig',testNow+60_000,180*60_000,10*60_000,testNow+7*3600_000,'u');materializeTimers(s,testNow);
  const events=s.events('g',testNow);assert.equal(events.length,3);assert.equal(events[1].start-events[0].start,180*60_000);
  assert.equal(s.events('other',testNow).length,0);
  s.stopTimer('g','dig');assert.equal(s.events('g',testNow).length,0);assert.equal(s.timers('g').length,0);s.close();
});
test('Eigene Erinnerungen sind gegen fremdes Löschen geschützt',async()=>{
  const s=new Store(':memory:');const id=s.addReminder('g','u','Farmen',now);assert.equal(s.removeReminder('g','other',id),0);
  const sent=[];await new Scheduler(s,async(j,p)=>sent.push({j,p})).tick(now+3600_000);
  assert.equal(sent.length,1);assert.match(sent[0].p.content,/verspätet/);assert.equal(s.reminders('g','u').length,0);s.close();
});
test('Wiki-Parser ordnet horizontale Infobox-Werte den richtigen Überschriften zu',()=>{
  const html='<h1>Testrot</h1><article><div class="article-body"><aside class="portable-infobox"><table class="pi-horizontal-group"><thead><tr><th class="pi-data-label">Income</th><th class="pi-data-label">Cost</th></tr></thead><tbody><tr><td class="pi-data-value">$50K/s</td><td class="pi-data-value">$10M</td></tr></tbody></table><p>Audio license notice that should never be used as the article summary.</p></aside><p>Testrot is a creature in the game with an income from the red carpet. This is a sufficiently long example paragraph.</p></div></article>';
  const a=parseArticle(html,'https://stealabrainrot.wiki/wiki/testrot/');assert.equal(a.fields[0].value,'$50K/s');assert.equal(a.fields[1].value,'$10M');assert.match(a.description,/Testrot/);assert.ok(a.description.split(' ').length<=20);
});
test('Deutsche Wissenssuche löst Schaufel und Brainrot-Namen auf',()=>{
  const pages=['shovel shop','grave hunt','tralalero tralala','admin abuse'].map(title=>({title,url:'https://x/'+title}));
  assert.ok(searchPages(pages,'Wie funktioniert die Schaufel?')[0].title.includes('shovel'));
  assert.equal(searchPages(pages,'Wie bekomme ich Tralalero Tralala?')[0].title,'tralalero tralala');
});
test('Wiki kann bei Quellenausfall gekennzeichneten Cache liefern',async()=>{
  const s=new Store(':memory:');s.cacheSet('wiki:index',[{title:'a'}]);s.db.prepare("UPDATE cache SET at=0 WHERE key='wiki:index'").run();
  const knowledge=new Knowledge(s,async()=>{throw new Error('Offline');});assert.equal((await knowledge.index()).stale,true);s.close();
});
