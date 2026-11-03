import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Collection,PermissionFlagsBits,PermissionsBitField,GatewayIntentBits,IntentsBitField} from 'discord.js';
import {imageSize} from 'image-size';
import {Store} from '../src/store.js';
import {mediaOnly,TradingChannel} from '../src/trading-channel.js';
import {StickerCatalog,PHRASES,parseRarity,parsePortrait} from '../src/sticker-catalog.js';
import {renderSticker,withPurpose,portraitBytes} from '../src/sticker-renderer.js';
import {StickerService,stickerName} from '../src/stickers.js';
const image={contentType:'image/png',name:'trade.png',width:800,height:600};
const collection=values=>new Collection(values.map((v,i)=>[String(i),v]));
const message=(extra={})=>({id:'m',guildId:'g',channelId:'c',content:'',attachments:collection([]),stickers:collection([]),author:{id:'u',bot:false,send:async()=>{}},...extra});
const catalogFixture=()=>({updated:Date.now(),sources:['https://stealabrainrot.wiki/wiki/secret/','https://stealabrainrot.wiki/wiki/og/'],items:[{id:'0123456789abcdef',name:'Meowl',rarity:'OG',tags:'gem',url:'https://stealabrainrot.wiki/wiki/meowl/'}]});
const client=()=>({user:{id:'bot'},options:{intents:new IntentsBitField([GatewayIntentBits.MessageContent])}});

test('Trading-Regel lässt nur reine Bilder und Sticker zu, auch keine Bild-Unterschriften',()=>{
 assert.equal(mediaOnly(message({attachments:collection([image])})),true);
 assert.equal(mediaOnly(message({stickers:collection([{id:'sticker'}])})),true);
 for(const extra of [{content:'Looking for'},{attachments:collection([image]),content:'DM me'},{content:'https://example.com/pic.png'},{attachments:collection([{contentType:'video/mp4',width:800,height:600}])},{attachments:collection([image,{contentType:'application/pdf'}])},{attachments:collection([{contentType:'image/png',width:0,height:0}])},{poll:{}}])assert.equal(mediaOnly(message(extra)),false);
});

test('Trading-Regel betrifft nur den gewählten Serverkanal und dessen Threads',async()=>{
 const s=new Store(':memory:'),service=new TradingChannel(s,client());s.cacheSet('trading:config:g',{channel:'c'});let deleted=0;
 assert.equal(await service.onMessage(message({content:'Text',channelId:'other',delete:async()=>deleted++})),false);
 assert.equal(await service.onMessage(message({content:'Text',guildId:'other',delete:async()=>deleted++})),false);
 assert.equal(await service.onMessage(message({id:'thread',content:'Text',channelId:'thread',channel:{isThread:()=>true,parentId:'c'},delete:async()=>deleted++})),true);
 assert.equal(deleted,1);s.close();
});

test('Text von Mitgliedern, Webhooks und fremden Bots wird entfernt; eigene Systemausgabe bleibt',async()=>{
 const s=new Store(':memory:'),service=new TradingChannel(s,client());s.cacheSet('trading:config:g',{channel:'c'});let deleted=0,notices=0;
 const author={id:'u',send:async()=>notices++};
 for(const m of [message({content:'Text',author}),message({id:'edit',content:'Text',author}),message({id:'hook',content:'Text',webhookId:'h',author:{id:'b',bot:true}})])await service.onMessage({...m,delete:async()=>deleted++});
 assert.equal(deleted,3);assert.equal(notices,1);
 assert.equal(await service.onMessage(message({content:'Bot-Status',author:{id:'bot'}})),false);s.close();
});

test('Bearbeitete partielle Nachrichten werden frisch geprüft und Löschfehler sichtbar gespeichert',async()=>{
 const s=new Store(':memory:'),service=new TradingChannel(s,client());s.cacheSet('trading:config:g',{channel:'c'});let deleted=0;
 await service.onMessage(message({partial:true,fetch:async()=>message({content:'Nachträglich Text',delete:async()=>deleted++})}));assert.equal(deleted,1);
 await service.onMessage(message({content:'Text',delete:async()=>{throw Object.assign(new Error('Missing permissions'),{code:50013});}}));assert.match(s.cacheGet('trading:error:g').value.message,/permissions/);
 await service.onMessage(message({partial:true,author:null,fetch:async()=>message({author:{id:'bot'},content:'Eigenes Embed'})}));assert.equal(deleted,1);s.close();
});

test('Kanal-Einrichtung benötigt Adminrechte und tatsächliche Löschrechte',async()=>{
 const s=new Store(':memory:'),service=new TradingChannel(s,client()),i={user:{id:'u'},guildId:'g',options:{getSubcommand:()=> 'kanal',getChannel:()=>({id:'c',guildId:'g',permissionsFor:()=>new PermissionsBitField(PermissionFlagsBits.ViewChannel)})},guild:{members:{fetchMe:async()=>({})}},memberPermissions:new PermissionsBitField()};
 await assert.rejects(service.command(i),/Server verwalten/);i.memberPermissions.add(PermissionFlagsBits.ManageGuild);await assert.rejects(service.command(i),/Nachrichten verwalten/);assert.equal(service.config('g'),undefined);
 i.options.getChannel=()=>({id:'c',guildId:'g',permissionsFor:()=>new PermissionsBitField(PermissionsBitField.All)});await service.command(i);assert.equal(service.config('g').channel,'c');s.deleteGuild('g');assert.equal(service.config('g'),undefined);s.close();
});

test('Wiki-Liste lässt angekündigte, verworfene, gelöschte und nur erwähnte Brainrots weg',()=>{
 const rows=Array.from({length:55},(_,n)=>`<li><a class="wiki-link" href="/wiki/pet-${n}/">Pet ${n}</a> $1M/s</li>`).join('');
 const items=parseRarity(`<h1>Secret</h1><div class="article-body"><h2>Brainrots (in order of income)</h2><h3>Income</h3><ul>${rows}<li>Worse than <a class="wiki-link" href="/wiki/not-a-pet/">Other</a> $2M/s</li></ul><h3>Upcoming</h3><ul><li><a class="wiki-link" href="/wiki/future/">Future</a> $1M/s</li></ul></div>`,'Secret');assert.equal(items.length,55);assert.ok(items.every(x=>x.name.startsWith('Pet')));
 assert.throws(()=>parseRarity('<h1>Secret</h1><div class="article-body"></div>','Secret'),/unvollständig/);
});

test('Ein bekannter Schreibfehler der Raritätsliste nutzt den belegten Artikelnamen',()=>{
 const rows=Array.from({length:50},(_,n)=>`<li><a class="wiki-link" href="/wiki/pet-${n}/">Pet ${n}</a> $1M/s</li>`).join('');
 const items=parseRarity(`<h1>Secret</h1><div class="article-body"><h2>Brainrots</h2><ul>${rows}<li><a class="wiki-link" href="/wiki/dragon-cannelloni/">Dragon Cannellloni</a> $250M/s</li></ul></div>`,'Secret');const dragon=items.find(x=>x.url.endsWith('/dragon-cannelloni/'));assert.equal(dragon.name,'Dragon Cannelloni');assert.deepEqual(dragon.aliases,['Dragon Cannellloni']);
});

test('Gleichzeitige Bearbeitungsereignisse entfernen dieselbe Nachricht nur einmal',async()=>{
 const s=new Store(':memory:'),service=new TradingChannel(s,client());s.cacheSet('trading:config:g',{channel:'c'});let deleted=0,release;const done=new Promise(resolve=>release=resolve),m=message({content:'Text',delete:async()=>{deleted++;await done;}});
 const first=service.onMessage(m),second=service.onMessage(m);release();await Promise.all([first,second]);assert.equal(deleted,1);s.close();
});

test('Porträtprüfung akzeptiert nur das primäre Artikelbild vom festen Wiki-Bildhost',()=>{
 assert.equal(parsePortrait('<div class="article-header"><img src="https://wikiassets.net/roblox-steal-a-brainrot-428cec/images/a.webp"></div>'),'https://wikiassets.net/roblox-steal-a-brainrot-428cec/images/a.webp');
 assert.equal(parsePortrait('<aside class="portable-infobox"><figure class="pi-image"><img src="http://127.0.0.1/a.png"></figure></aside>'),null);
 assert.equal(parsePortrait('<img src="https://wikiassets.net/roblox-steal-a-brainrot-428cec/images/unrelated.webp">'),null);
});

test('Ein fehlgeschlagener Wiki-Sync ersetzt den vorhandenen vollständigen Katalog nicht',async()=>{
 const s=new Store(':memory:'),old=catalogFixture();s.cacheSet('stickers:catalog',old);const service=new StickerCatalog(s,{fetcher:async()=>{throw new Error('429');}});await assert.rejects(service.sync(),/429/);assert.deepEqual(await service.get(),old);s.close();
});

test('Alle ausgelieferten Motive sind echte 320×320-PNGs unter dem Discord-Limit',async()=>{
 const dir=new URL('../assets/stickers/',import.meta.url),catalog=JSON.parse(await readFile(new URL('catalog.json',dir),'utf8'));assert.ok(catalog.items.filter(x=>x.rarity==='Secret').length>=50);assert.ok(catalog.items.filter(x=>x.rarity==='OG').length>=2);
 const items=[...PHRASES,...catalog.items];assert.equal(new Set(items.map(x=>x.id)).size,items.length);
 for(const item of items){const bytes=await readFile(new URL(item.id+'.png',dir)),size=imageSize(bytes);assert.equal(size.type,'png');assert.equal(size.width,320);assert.equal(size.height,320);assert.ok(bytes.length<=512*1024,item.name);assert.ok(stickerName(item).length<=30);}
});

test('Trading-Vorlage und Zweck-Banner werden ohne Bild-/KI-API lokal erzeugt',async()=>{
 const sticker=await renderSticker(PHRASES[0]);assert.equal(imageSize(sticker).width,320);assert.equal(imageSize(await withPurpose(sticker,'LOOKING FOR')).height,320);
 await assert.rejects(portraitBytes('https://example.com/a.png'),/Unzulässige/);
});

test('Sticker-Menüs sind benutzergebunden, paginiert und erfüllen Discord-Komponentenlimits',async()=>{
 const s=new Store(':memory:'),catalog=new StickerCatalog(s,{bundled:catalogFixture()}),service=new StickerService(s,catalog);const view=await service.command({guildId:'g',user:{id:'u'},options:{getSubcommand:()=> 'liste',getString:()=>null}});
 for(const row of view.components)row.toJSON();assert.ok(view.embeds[0].description.length<4096);assert.equal((await service.autocomplete('meowl'))[0].value,'0123456789abcdef');const id=[...service.sessions.keys()][0];await assert.rejects(service.component({customId:`sticker:next:${id}`,user:{id:'other'},guildId:'g'}),/jemand anderem/);s.close();
});

test('Stickerinstallation überspringt vorhandene Motive und überschreibt keine fremden Sticker',async()=>{
 const s=new Store(':memory:'),service=new StickerService(s,{}),all=new Collection(),guild={id:'g',premiumTier:0,members:{fetchMe:async()=>({permissions:new PermissionsBitField(PermissionFlagsBits.CreateGuildExpressions)})},stickers:{fetch:async()=>all,create:async data=>{const sticker={id:String(all.size),name:data.name,description:data.description};all.set(sticker.id,sticker);return sticker;}}};
 service.buffer=async()=>Buffer.from('png');const first=await service.install(guild,PHRASES.slice(0,5),'admin');assert.equal(first.filter(x=>x.created).length,5);const second=await service.install(guild,PHRASES.slice(0,5),'admin');assert.equal(second.filter(x=>x.created).length,0);const full=await service.install(guild,[PHRASES[5]],'admin');assert.match(full[0].error,/Keine freien/);assert.equal(all.size,5);s.close();
});

test('Nur das Serverteam darf native Sticker installieren oder den Katalog synchronisieren',async()=>{
 const s=new Store(':memory:'),service=new StickerService(s,{});for(const sub of ['installieren','basispaket','sync'])await assert.rejects(service.command({options:{getSubcommand:()=>sub},memberPermissions:new PermissionsBitField()}),/Server verwalten/);s.close();
});

test('Gesendete Trading-Karten enthalten das tatsächliche Nutzerprofil und sind gegen Spam begrenzt',async()=>{
 const s=new Store(':memory:'),service=new StickerService(s,{});service.buffer=async()=>renderSticker(PHRASES[0]);let payload;
 const i={guildId:'g',guild:{members:{fetchMe:async()=>({})}},user:{id:'123',username:'Trader'},channel:{permissionsFor:()=>new PermissionsBitField(PermissionsBitField.All),send:async p=>{payload=p;return{url:'https://discord.com/channels/g/c/m'};}}};await service.send(i,PHRASES[0]);assert.match(payload.embeds[0].description,/users\/123/);assert.equal(payload.embeds[0].author.name,'Trader');assert.deepEqual(payload.allowedMentions.parse,[]);await assert.rejects(service.send(i,PHRASES[0]),/fünf Sekunden/);s.close();
});
