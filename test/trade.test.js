import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { ValueSource, evaluateTrade, variantKey, validateCatalog, validateTrade, recognizeTrade, downloadAttachment, parseTradeLines, TradeService } from '../src/trade.js';
const now=Date.now();
const item=(name,overrides={})=>({name,mutation:'Normal',traits:[],quantity:1,details_clear:true,...overrides});
const trade=(left=[item('A')],right=[item('B')])=>({is_trade:true,left,right,issues:[]});
const quote=(value,overrides={})=>({low:value,high:value,unit:'Punkte',source:'https://example.com/current-values',updated:now,...overrides});
const values=(a,b)=>({quote:async x=>x.name==='A'?a:b});
test('W/L folgt exakt der vom Nutzer angegebenen Trade-Seite',async()=>{
  const source=values(quote(100),quote(200));
  assert.equal((await evaluateTrade(trade(),'left',source,'g',now)).verdict,'W');
  assert.equal((await evaluateTrade(trade(),'right',source,'g',now)).verdict,'L');
});
test('Fair-Bereich und Mengen werden deterministisch berechnet',async()=>{
  const source=values(quote(100),quote(200));
  assert.equal((await evaluateTrade(trade([item('A',{quantity:2})]),'left',source,'g',now)).verdict,'Fair');
  assert.equal((await evaluateTrade(trade(),'left',values(quote(100),quote(108)),'g',now)).verdict,'Fair');
});
test('Überlappende breite Wertebereiche sind nicht automatisch Fair',async()=>{
  assert.equal((await evaluateTrade(trade(),'left',values(quote(100,{high:200}),quote(110,{high:220})),'g',now)).verdict,'Unklar');
});
test('Ein einziger veralteter, unlesbarer oder fehlender Wert blockiert Teilbewertungen',async()=>{
  for(const source of [values(quote(100,{updated:now-73*3600_000}),quote(200)),values({error:'Kein Variantenwert'},quote(200))]) {
    const r=await evaluateTrade(trade(),'left',source,'g',now);assert.equal(r.verdict,'Nicht belastbar bewertbar');assert.equal(r.give,undefined);
  }
  const unclear=trade([item('A',{details_clear:false})]);
  assert.equal((await evaluateTrade(unclear,'left',values(quote(100),quote(200)),'g',now)).verdict,'Nicht belastbar bewertbar');
});
test('Unvollständige Screenshots, offene Hinweise und gemischte Einheiten blockieren Urteil',async()=>{
  const source=values(quote(100),quote(200,{unit:'Dragons'}));
  assert.match((await evaluateTrade(trade(),'left',source,'g',now)).problems.join(),/Einheiten/);
  const t=trade();t.issues=['Dritter Slot ist verdeckt'];assert.equal((await evaluateTrade(t,'left',values(quote(1),quote(2)),'g',now)).verdict,'Nicht belastbar bewertbar');
  assert.equal((await evaluateTrade(trade([],[]),'left',source,'g',now)).verdict,'Nicht belastbar bewertbar');
});
test('Varianten-Schlüssel enthält Mutation und vollständige sortierte Trait-Kombination',()=>{
  assert.equal(variantKey(item('A',{mutation:'None',traits:['Taco','Gold']})),variantKey(item('a',{mutation:'Normal',traits:['Gold','Taco']})));
  assert.notEqual(variantKey(item('A')),variantKey(item('A',{traits:['Taco']})));
});
test('Wertelisten akzeptieren nur echte positive Werte, Quellen und gültigen Stand',()=>{
  const row={name:'A',mutation:'Normal',traits:[],low:100,high:110,source:'https://example.com/list',updatedAt:new Date(now).toISOString()};
  assert.equal(validateCatalog({unit:'Punkte',items:[row]},now).items[0].low,100);
  for(const patch of [{low:-1},{high:50},{source:'http://x'},{updatedAt:'2099-01-01'},{traits:null}])assert.throws(()=>validateCatalog({unit:'Punkte',items:[{...row,...patch}]},now));
  assert.throws(()=>validateCatalog({unit:'Punkte',items:[row,row]},now),/Doppelte/);
});
test('SABTradingValues nutzt exakte Mutationsdaten, keinen Einkommensfaktor',async()=>{
  const s=new Store(':memory:');
  const source=new ValueSource(s,async url=>url.includes('items.json')?Array.from({length:10},(_,i)=>({name:i?'Other'+i:'A',alp:{A:[10,1],B:[12,1]},generation:999999})):
    url.includes('modifiers')?{mutations:{A:{name:'No Mutation'},B:{name:'Gold',multipliers:{generation:999}}}}:[new Date(now).toISOString()]);
  assert.equal((await source.quote(item('A',{mutation:'Gold'}),'g',now)).low,12);
  assert.match((await source.quote(item('A',{traits:['Taco']}),'g',now)).error,/Trait-Kombination/);
  assert.match((await source.quote(item('Unknown'),'g',now)).error,/kein exakter/);s.close();
});
test('Exakt importierte Trait-Variante hat Vorrang und gilt nur für ihren Server',async()=>{
  const s=new Store(':memory:');s.cacheSet('trade:catalog:g',validateCatalog({unit:'Punkte',items:[{name:'A',mutation:'Gold',traits:['Taco'],low:20,high:25,source:'https://example.com/list',updatedAt:new Date(now).toISOString()}]},now));
  const source=new ValueSource(s,async()=>{throw new Error('Offline');});assert.equal((await source.quote(item('A',{mutation:'Gold',traits:['Taco']}),'g',now)).low,20);
  assert.match((await source.quote(item('A',{mutation:'Gold',traits:['Taco']}),'other',now)).error,/Trait-Kombination/);s.close();
});
test('Korrektureingabe bewahrt Mengen, Mutation und Trait-Namen',()=>{
  const rows=parseTradeLines('2 | Meowl | Gold | Taco, Lightning\n1 | Dragon Cannelloni | Normal | keine');
  assert.equal(rows[0].quantity,2);assert.deepEqual(rows[0].traits,['Taco','Lightning']);assert.deepEqual(rows[1].traits,[]);
  assert.throws(()=>parseTradeLines('Meowl 5'));
  assert.throws(()=>validateTrade(trade(parseTradeLines('0 | A | Normal | keine'))));
});
test('Dateidownload blockiert fremde Hosts, falsche Bilder und übergroße Dateien',async()=>{
  await assert.rejects(downloadAttachment({url:'https://localhost/attachments/a',size:1}));
  await assert.rejects(downloadAttachment({url:'https://cdn.discordapp.com/attachments/a',size:9_000_000}));
  await assert.rejects(downloadAttachment({url:'https://cdn.discordapp.com/attachments/a',size:4},true,async()=>new Response('FAKE')));
  const png=Buffer.from([137,80,78,71,13,10,26,10,0]);
  assert.equal((await downloadAttachment({url:'https://cdn.discordapp.com/attachments/a',size:9},true,async()=>new Response(png))).mime,'image/png');
});
test('Bildprüfung verwendet lokale Erkennung und den vorhandenen Namenskatalog',async()=>{
  let called=false;
  const result=await recognizeTrade({}, {names:['A','B'],downloader:async()=>({buffer:Buffer.from('image')}),recognizer:async(buffer,names)=>{
    called=true;assert.equal(buffer.toString(),'image');assert.deepEqual(names,['A','B']);return trade();
  }});
  assert.equal(called,true);assert.equal(result.left[0].name,'A');
});
test('Ungültige lokale Erkennung wird nicht als Trade übernommen',async()=>{
  await assert.rejects(recognizeTrade({}, {downloader:async()=>({buffer:Buffer.from('x')}),recognizer:async()=>({})}));
});
test('Trade-Sessions sind nutzergebunden und laufen ab',async()=>{
  const s=new Store(':memory:');const service=new TradeService(s,values(quote(1),quote(2)),async()=>trade());
  await service.analyze({},'left','u','g');const id=[...service.sessions.keys()][0];assert.ok(service.session(id,'u','g'));
  assert.throws(()=>service.session(id,'other','g'));assert.throws(()=>service.session(id,'u','other'));
  service.sessions.get(id).at=0;assert.throws(()=>service.session(id,'u','g'));s.close();
});
