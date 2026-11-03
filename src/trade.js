import { recognizeLocalTrade } from './ocr.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, PermissionFlagsBits, AttachmentBuilder } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { request } from './sources.js';
import { clean, clip, normalize, validSource, stamp } from './utils.js';
import {ValuationAccess} from './access.js';

export const VALUE_SOURCE = 'https://sabtradingvalues.com/brainrots';
export const MAX_VALUE_AGE = 72 * 3600_000;
const MAX_IMAGE_BYTES = 8_000_000;
const normMutation = x => ['no mutation','none','normal','default','base','keine'].includes(normalize(x)) ? 'normal' : normalize(x);
export const variantKey = x => JSON.stringify([normalize(x.name),normMutation(x.mutation),[...new Set(x.traits.map(normalize))].sort()]);
export function validateTrade(value) {
  if (!value || typeof value.is_trade!=='boolean' || !Array.isArray(value.issues) || value.issues.some(x=>typeof x!=='string') || value.issues.length>20) throw new Error('Ungültige Bilderkennungs-Antwort.');
  for (const side of ['left','right']) {
    if (!Array.isArray(value[side]) || value[side].length>20) throw new Error('Zu viele oder ungültige Trade-Positionen.');
    for (const x of value[side]) {
      if (!x || typeof x.name!=='string' || !x.name.trim() || x.name.length>120 || typeof x.mutation!=='string' || !x.mutation.trim() || x.mutation.length>60 || !Array.isArray(x.traits) || x.traits.length>20 || x.traits.some(t=>typeof t!=='string' || !t.trim() || t.length>60) || !Number.isInteger(x.quantity) || x.quantity<1 || x.quantity>100 || typeof x.details_clear!=='boolean') throw new Error('Unvollständige oder ungültige Trade-Position.');
    }
  }
  return value;
}
export async function downloadAttachment(attachment, image = true, fetcher = fetch) {
  const limit = image ? MAX_IMAGE_BYTES : 1_000_000;
  if (attachment.size>limit) throw new Error(`Datei zu groß (max. ${image ? '8 MB' : '1 MB'}).`);
  const url = new URL(attachment.url);
  if (url.protocol!=='https:' || !['cdn.discordapp.com','media.discordapp.net'].includes(url.hostname) || !/^\/(ephemeral-)?attachments\//.test(url.pathname)) throw new Error('Nur direkt in Discord hochgeladene Dateien sind erlaubt.');
  const r = await fetcher(url.href,{signal:AbortSignal.timeout(15000),redirect:'error'});
  if (!r.ok) throw new Error('Discord-Datei nicht mehr erreichbar. Bitte erneut hochladen.');
  const chunks=[]; let bytes=0; const reader=r.body.getReader();
  try {
    for (;;) { const {done,value}=await reader.read();if(done) break; bytes+=value.length;if(bytes>limit) throw new Error('Datei zu groß.');chunks.push(value); }
  } finally { await reader.cancel().catch(()=>{}); }
  const buffer=Buffer.concat(chunks);
  let mime;
  if (buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mime='image/png';
  else if (buffer[0]===255 && buffer[1]===216 && buffer[2]===255) mime='image/jpeg';
  else if (buffer.subarray(0,4).toString()==='RIFF' && buffer.subarray(8,12).toString()==='WEBP') mime='image/webp';
  if (image && !mime) throw new Error('Bitte ein echtes PNG-, JPG- oder WEBP-Bild hochladen.');
  return {buffer,mime};
}
export async function recognizeTrade(attachment, { downloader=downloadAttachment, recognizer=recognizeLocalTrade, names=[] } = {}) {
  const {buffer}=await downloader(attachment);
  return validateTrade(await recognizer(buffer,names));
}
export function validateCatalog(data, now=Date.now()) {
  if (!data || typeof data.unit!=='string' || !data.unit.trim() || data.unit.length>60 || !Array.isArray(data.items) || !data.items.length || data.items.length>10000) throw new Error('Werteliste braucht unit und 1–10000 items. Format siehe README.md.');
  const keys=new Set();
  const items=data.items.map(x=>{
    validateTrade({is_trade:true,left:[{...x,quantity:1,details_clear:true}],right:[],issues:[]});
    const updated=Date.parse(x.updatedAt);
    if (!Number.isFinite(x.low) || !Number.isFinite(x.high) || x.low<=0 || x.high<x.low || x.high>1e12 || !Number.isFinite(updated) || updated>now+300_000) throw new Error('Jeder Eintrag braucht positive low/high-Werte, Quelle und ein gültiges updatedAt ohne Zukunftsdatum.');
    const key=variantKey(x);if(keys.has(key)) throw new Error('Doppelte Variante in der Werteliste.');keys.add(key);
    return {name:clean(x.name),mutation:clean(x.mutation),traits:x.traits.map(clean),low:x.low,high:x.high,updated,source:validSource(x.source),unit:clean(data.unit),key};
  });
  return {unit:clean(data.unit),items,imported:now};
}
export class ValueSource {
  constructor(store,fetcher=request) { this.store=store;this.fetcher=fetcher;this.flight=null; }
  async live() {
    const cache=this.store.cacheGet('trade:live',300_000);if(cache) return cache.value;
    if(this.flight) return this.flight;
    this.flight=(async()=>{
      try {
        const results=await Promise.allSettled(['items','modifiers','lastUpdated'].map(x=>this.fetcher(`https://sabtradingvalues.com/static/${x}.json`)));
        const failed=results.find(x=>x.status==='rejected');if(failed) throw failed.reason;
        const [items,mods,dates]=results.map(x=>x.value);const updated=Date.parse(dates?.[0]);
        if(!Array.isArray(items) || items.length<10 || !mods?.mutations || !Number.isFinite(updated) || updated>Date.now()+300_000) throw new Error('SABTradingValues-Datenformat oder Aktualisierungsdatum ist ungültig.');
        const value={items:items.map(x=>({name:x.name,alp:x.alp})),mutations:Object.fromEntries(Object.entries(mods.mutations).map(([k,v])=>[normMutation(v.name),k])),updated,fetched:Date.now(),source:VALUE_SOURCE};
        this.store.cacheSet('trade:live',value);return value;
      } finally { this.flight=null; }
    })();
    return this.flight;
  }
  async quote(item,guild,now=Date.now()) {
    const imported=this.store.cacheGet(`trade:catalog:${guild}`)?.value;
    const exact=imported?.items.find(x=>x.key===variantKey(item));
    if(exact&&now-exact.updated<=MAX_VALUE_AGE) return exact;
    if(item.traits.length) return exact || {error:`${item.name}: Für diese exakte Trait-Kombination liefert die Standardquelle keinen eigenen bestätigten Variantenwert. Keine Hochrechnung aus Einkommensmultiplikatoren.`};
    let live;
    try{live=await this.live();}catch(e){if(exact)return exact;throw e;}
    const row=live.items.find(x=>normalize(x.name)===normalize(item.name));const code=live.mutations[normMutation(item.mutation)];
    const value=row?.alp?.[code]?.[0];
    if(!Number.isFinite(value) || value<=0) return exact || {error:`${item.name} (${item.mutation}): kein exakter Handelswert in der Quelle.`};
    if(exact&&exact.updated>live.updated)return exact;
    return {name:row.name,mutation:item.mutation,traits:[],low:value,high:value,updated:live.updated,source:VALUE_SOURCE,unit:'USD-Community-Schätzung'};
  }
  async alternatives(guild,now=Date.now()){
    const exact=this.store.cacheGet(`trade:catalog:${guild}`)?.value?.items||[];let live;
    try{live=await this.live();}catch{}
    const quotes=exact.filter(q=>now-q.updated<=MAX_VALUE_AGE&&q.updated<=now+300000);
    if(live&&now-live.updated<=MAX_VALUE_AGE){
      const mutationNames=Object.fromEntries(Object.entries(live.mutations).map(([name,code])=>[code,name==='normal'?'Normal':name]));
      const keys=new Set(quotes.map(variantKey));
      for(const row of live.items)for(const[code,entry]of Object.entries(row.alp||{})){
        const q={name:row.name,mutation:mutationNames[code],traits:[],low:entry?.[0],high:entry?.[0],unit:'USD-Community-Schätzung',source:VALUE_SOURCE,updated:live.updated};
        if(q.mutation&&Number.isFinite(q.low)&&q.low>0&&!keys.has(variantKey(q)))quotes.push(q);
      }
    }
    return quotes;
  }
}
export async function evaluateTrade(trade,perspective,values,guild,now=Date.now()) {
  validateTrade(trade);
  if(!['left','right'].includes(perspective)) throw new Error('Deine Trade-Seite fehlt.');
  const problems=[];
  if(!trade.is_trade || !trade.left.length || !trade.right.length) problems.push('Beide vollständigen Trade-Seiten müssen sichtbar sein.');
  if(trade.issues.length) problems.push(...trade.issues.map(clean));
  const sides={left:[],right:[]},positions={left:[],right:[]};
  for(const side of ['left','right']) for(const item of trade[side]) {
    const position={item,status:'ok'};positions[side].push(position);
    if(!item.details_clear) {position.status='unclear';position.reason='Bilddetails nicht vollständig';problems.push(`${item.name}: Name, Mutation, Traits oder Menge nicht vollständig erkannt.`);continue; }
    let q;
    try { q=await values.quote(item,guild,now); } catch(e) {position.status='offline';position.reason='Wertequelle nicht erreichbar';problems.push(`Wertequelle nicht erreichbar: ${e.message}`);continue; }
    if(q.error) {position.status='missing';position.reason=q.error;problems.push(q.error);continue; }
    position.quote=q;
    if(!Number.isFinite(q.low)||!Number.isFinite(q.high)||q.low<=0||q.high<q.low||!q.unit||!Number.isFinite(q.updated)){position.status='missing';position.reason='Ungültige Quellenwerte';problems.push(`${item.name}: Ungültige Quellenwerte.`);continue;}
    if(now-q.updated>MAX_VALUE_AGE || q.updated>now+300_000) {position.status='stale';position.reason='Quellenstand veraltet';problems.push(`${item.name}: Quellenstand ${new Date(q.updated).toISOString().slice(0,10)} ist älter als 72 Stunden oder ungültig.`);continue; }
    sides[side].push({...q,quantity:item.quantity,low:q.low*item.quantity,high:q.high*item.quantity});
  }
  const units=new Set([...sides.left,...sides.right].map(x=>x.unit));
  if(units.size>1) problems.push('Unterschiedliche Werte-Einheiten lassen sich nicht addieren.');
  if(problems.length) return {verdict:'Nicht belastbar bewertbar',problems:[...new Set(problems)],sides,positions};
  const give=sides[perspective],receive=sides[perspective==='left'?'right':'left'];
  const total=items=>({low:items.reduce((n,x)=>n+x.low,0),high:items.reduce((n,x)=>n+x.high,0)});
  const g=total(give),r=total(receive);const min=r.low/g.high,max=r.high/g.low;
  let verdict='Unklar';
  if(min>1.1) verdict='W';else if(max<0.9) verdict='L';else if(min>=0.9 && max<=1.1) verdict='Fair';
  return {verdict,problems:verdict==='Unklar'?['Die Wertebereiche überlappen zu stark für ein eindeutiges Urteil.']:[],sides,positions,give:g,receive:r,unit:[...units][0],delta:[(min-1)*100,(max-1)*100]};
}
const fmt=n=>n.toLocaleString('de-DE',{maximumFractionDigits:2});
const position=x=>`${x.quantity}× ${clean(x.name)} | ${clean(x.mutation)} | ${x.traits.length?x.traits.map(clean).join(', '):'keine Traits'}${x.details_clear?'':' ⚠️ unklar'}`;
function tradeRows(id,confirmed=false) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`trade:confirm:${id}`).setLabel(confirmed?'Neu bewerten':'Erkennung stimmt – bewerten').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`trade:edit:${id}`).setLabel('Positionen korrigieren').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`trade:swap:${id}`).setLabel('Meine Seite wechseln').setStyle(ButtonStyle.Secondary),
    ...(confirmed?[new ButtonBuilder().setCustomId(`trade:share:${id}`).setLabel('Ergebnis teilen').setStyle(ButtonStyle.Primary)]:[]))];
}
export function draftPayload(session,id) {
  return {content:`**${session.origin==='manual'?'Trade eingegeben':'Screenshot gelesen'} · du gibst ${session.perspective==='left'?'links':'rechts'} ab.**\nPrüfe Namen, Menge, Mutation und alle Traits vor der Bewertung. Fehlende Details zuerst korrigieren.`,
    embeds:[{title:'🔎 Erkannte Trade-Positionen',color:0xf5b041,fields:['left','right'].map(side=>({name:side==='left'?'Links':'Rechts',value:clip(session.trade[side].map(position).join('\n') || 'Keine Position erkannt',1000)})),description:clip(session.trade.issues.map(clean).join('\n') || 'Nach Bestätigung werden ausschließlich aktuelle Quellenwerte verglichen.',1000)}],components:tradeRows(id),allowedMentions:{parse:[]}};
}
export function resultPayload(result,session,id) {
  const sources=[...new Map([...result.positions.left,...result.positions.right].map(x=>x.quote).filter(x=>x?.source&&Number.isFinite(x.updated)).map(x=>[`${x.source}|${x.updated}`,{url:x.source,updated:x.updated}])).values()];
  const showSide=side=>result.positions[side].map(p=>`${p.status==='ok'?'✅':p.status==='stale'?'🕒':'⚠️'} ${position(p.item)}${p.status==='ok'?`\n↳ ${fmt(p.quote.low*p.item.quantity)}${p.quote.low!==p.quote.high?`–${fmt(p.quote.high*p.item.quantity)}`:''} ${p.quote.unit}`:`\n↳ ${clip(p.reason,110)}`}`).join('\n');
  return {content:`**${result.verdict==='W'?'🟢 W':result.verdict==='L'?'🔴 L':result.verdict==='Fair'?'⚖️ Fair':`⚠️ ${result.verdict}`} · aus deiner Sicht (${session.perspective==='left'?'links':'rechts'} abgeben)**`,
    embeds:[{title:'SAB Trade-Check · Quellenvergleich',color:result.verdict==='W'?0x2ecc71:result.verdict==='L'?0xed4245:0xf5b041,
      description:result.give?`**Du gibst:** ${fmt(result.give.low)}${result.give.low!==result.give.high?`–${fmt(result.give.high)}`:''}\n**Du erhältst:** ${fmt(result.receive.low)}${result.receive.low!==result.receive.high?`–${fmt(result.receive.high)}`:''}\nEinheit: ${result.unit}\nUnterschied: ${fmt(result.delta[0])}%${result.delta[0]!==result.delta[1]?` bis ${fmt(result.delta[1])}%`:''}\nFair-Bereich: ±10%. Community-Schätzung, kein garantierter Marktpreis.`:'Es gibt keine vollständige, aktuelle Grundlage für ein W/L/Fair-Urteil.',
      fields:[{name:'Du gibst',value:clip(showSide(session.perspective)||'–',1000)},{name:'Du erhältst',value:clip(showSide(session.perspective==='left'?'right':'left')||'–',1000)},
        ...(result.problems.length?[{name:'Offene Punkte',value:clip(result.problems.map(x=>`• ${clean(x)}`).join('\n'),1000)}]:[]),
        ...(sources.length?[{name:'Quellen und tatsächlicher Datenstand',value:clip(sources.map(x=>`[Quelle](${x.url}) · ${stamp(x.updated)}`).join('\n'),1000)}]:[])],
      footer:{text:'Nur bestätigte Positionen und exakte Variantenwerte • keine Trait-Preisannahmen • keine Garantie für einen späteren Tausch'} }],
    components:tradeRows(id,true),allowedMentions:{parse:[]}};
}
export function parseTradeLines(input) {
  const lines=input.split('\n').map(x=>x.trim()).filter(Boolean);if(lines.length>20) throw new Error('Maximal 20 Positionen pro Seite.');
  return lines.map(line=>{
    const parts=line.split('|').map(x=>x.trim());
    if(parts.length!==4) throw new Error('Pro Zeile: Menge | Brainrot | Mutation | Traits (oder keine)');
    const [q,name,mutation,traits]=parts;
    return {name,mutation,quantity:/^\d+$/.test(q)?Number(q):NaN,traits:['keine','none','-'].includes(normalize(traits))||traits==='-'?[]:traits.split(',').map(x=>x.trim()),details_clear:true};
  });
}
export function manualTradeModal(){
  const modal=new ModalBuilder().setCustomId('trade:new').setTitle('Trade ohne Bild prüfen');
  for(const[side,label]of [['left','Du gibst'],['right','Du erhältst']])modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(side)
    .setLabel(`${label}: Menge | Name | Mutation | Traits`).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1800).setPlaceholder('1 | Meowl | Normal | keine\n1 | Dragon Cannelloni | Gold | Taco')));
  return modal;
}
export function valueEditorModal(){
  const modal=new ModalBuilder().setCustomId('trade:value-save').setTitle('Exakten Handelswert eintragen');
  const fields=[['variant','Brainrot | Mutation | Traits','Meowl | Normal | keine'],['range','Wertebereich: Minimum | Maximum','100 | 110'],['unit','Einheit deiner Quellenwerte','community-points'],['source','Nachprüfbare Quelle (HTTPS)','https://...'],['updated','Tatsächlicher Quellenstand mit UTC-Offset','2026-11-02T12:00:00Z']];
  for(const[id,label,placeholder]of fields)modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(id==='source'?500:200).setPlaceholder(placeholder)));
  return modal;
}
export function upsertVariant(store,guild,entry,unit,now=Date.now()){
  const data=validateCatalog({unit,items:[entry]},now);const previous=store.cacheGet(`trade:catalog:${guild}`)?.value;
  if(previous&&previous.unit!==data.unit)throw new Error(`Deine Serverliste verwendet „${previous.unit}“. Werte verschiedener Einheiten dürfen nicht vermischt werden.`);
  const items=[...(previous?.items||[]).filter(x=>x.key!==data.items[0].key),data.items[0]];
  if(items.length>10000)throw new Error('Maximal 10000 Varianten pro Serverliste.');
  store.cacheSet(`trade:catalog:${guild}`,{unit:data.unit,items,imported:now});return data.items[0];
}
export class TradeService {
  constructor(store,values,recognizer=recognizeTrade,access=new ValuationAccess(store)) {this.store=store;this.values=values;this.recognizer=recognizer;this.access=access;this.sessions=new Map();this.inFlight=0;this.lastOcr=new Map();}
  prune() {for(const[id,s]of this.sessions) if(Date.now()-s.at>15*60_000)this.sessions.delete(id);}
  ensureCapacity(){this.prune();if(this.sessions.size>=200)throw new Error('Zu viele offene Bildprüfungen. Bitte später erneut versuchen.');}
  session(id,user,guild) {this.prune();const s=this.sessions.get(id);if(!s||s.user!==user||s.guild!==guild)throw new Error('Diese Bildprüfung ist abgelaufen oder gehört einem anderen Nutzer. Starte /trade bild erneut.');return s;}
  claim(user) {
    const last=this.lastOcr.get(user)||0;
    if(Date.now()-last<60_000)throw new Error('Bitte warte eine Minute zwischen Bildprüfungen.');
    if(this.inFlight>=1)throw new Error('Gerade läuft eine lokale Bildprüfung. Bitte gleich erneut versuchen.');
    this.lastOcr.set(user,Date.now());
    if(this.lastOcr.size>5000)for(const[id,at]of this.lastOcr)if(Date.now()-at>60000)this.lastOcr.delete(id);
  }
  async analyze(attachment,perspective,user,guild) {
    this.ensureCapacity();this.claim(user);this.inFlight++;
    let quota;
    try {
      quota=await this.access.start(user,'wl');
      const wiki=this.store.cacheGet('wiki:index')?.value||[];const catalog=this.store.cacheGet(`trade:catalog:${guild}`)?.value?.items||[];const market=this.store.cacheGet('trade:live')?.value?.items||[];
      const names=[...new Set([...catalog,...market,...wiki].map(x=>x.name||x.title).filter(Boolean))];
      if(!names.length&&this.recognizer===recognizeTrade)throw new Error('Der Namenskatalog lädt noch. Versuche es gleich erneut oder nutze /trade eingeben.');
      const trade=await this.recognizer(attachment,{names});const id=randomUUID().slice(0,12);this.access.commit(quota);this.sessions.set(id,{trade,perspective,origin:'ocr',user,guild,at:Date.now(),quota});return draftPayload(this.sessions.get(id),id);
    }
    catch(e){this.access.refund(quota);this.lastOcr.delete(user);throw e;}
    finally {this.inFlight--;}
  }
  async command(i) {
    const sub=i.options.getSubcommand();
    if(['import','import_loeschen','kanal','export','pflegen'].includes(sub)&&!i.memberPermissions.has(PermissionFlagsBits.ManageGuild))throw new Error('Dafür benötigst du „Server verwalten“.');
    if(sub==='bild') return this.analyze(i.options.getAttachment('bild',true),i.options.getString('ich_gebe',true),i.user.id,i.guildId);
    if(sub==='verlauf'){
      const history=this.store.tradeHistory(i.guildId,i.user.id);
      return{content:history.length?clip(history.map(h=>`**${clean(h.data.verdict)}** · ${stamp(h.created)}\n${clip(h.data.give,80)} → ${clip(h.data.receive,80)}`).join('\n\n'),1900):'Noch keine bewerteten Trades gespeichert. Es werden bis zu 20 eigene Ergebnisse ohne Bilder aufbewahrt.'};
    }
    if(sub==='wert'){
      const item={name:i.options.getString('name',true),mutation:i.options.getString('mutation')||'Normal',traits:(i.options.getString('traits')||'').split(',').map(x=>x.trim()).filter(Boolean),quantity:1,details_clear:true};
      validateTrade({is_trade:true,left:[item],right:[],issues:[]});const quota=await this.access.start(i.user.id,'value');let q;
      try{q=await this.values.quote(item,i.guildId);this.access.commit(quota);}catch(e){this.access.refund(quota);throw e;}
      if(q.error)return{content:`⚠️ ${q.error}`};
      return{embeds:[{title:clip(`📊 ${item.name} · ${item.mutation}`,256),color:Date.now()-q.updated>MAX_VALUE_AGE?0xf5b041:0x2ecc71,
        description:`**${fmt(q.low)}${q.high!==q.low?`–${fmt(q.high)}`:''} ${q.unit}**\nTraits: ${item.traits.map(clean).join(', ')||'keine'}\n[Quelle](${q.source}) · Stand ${stamp(q.updated)}\n${Date.now()-q.updated>MAX_VALUE_AGE?'🕒 Veralteter Referenzwert · für heutige W/L-Urteile gesperrt.':'✅ Innerhalb des 72-Stunden-Fensters.'}`}],allowedMentions:{parse:[]}};
    }
    if(sub==='export'){
      const catalog=this.store.cacheGet(`trade:catalog:${i.guildId}`)?.value;if(!catalog)throw new Error('Keine Server-Werteliste vorhanden.');
      const data={unit:catalog.unit,items:catalog.items.map(x=>({name:x.name,mutation:x.mutation,traits:x.traits,low:x.low,high:x.high,source:x.source,updatedAt:new Date(x.updated).toISOString()}))};
      return{content:'Deine Server-Werteliste als wieder importierbare JSON-Datei.',files:[new AttachmentBuilder(Buffer.from(JSON.stringify(data,null,2)),{name:'sab-werte.json'})]};
    }
    if(sub==='import') {
      const {buffer}=await downloadAttachment(i.options.getAttachment('datei',true),false);
      const data=validateCatalog(JSON.parse(buffer.toString('utf8')));this.store.cacheSet(`trade:catalog:${i.guildId}`,data);
      return {content:`✅ ${data.items.length} exakte Varianten importiert. Einheit: ${data.unit}. Einträge älter als 72 Stunden werden nicht bewertet.`};
    }
    if(sub==='import_loeschen') {this.store.db.prepare('DELETE FROM cache WHERE key=?').run(`trade:catalog:${i.guildId}`);return{content:'✅ Server-Werteliste gelöscht. SABTradingValues bleibt Standard.'};}
    if(sub==='kanal') {const channel=i.options.getChannel('kanal');this.store.cacheSet(`trade:channel:${i.guildId}`,channel?.id||null);return{content:channel?`✅ W-or-L-Bildfragen in <#${channel.id}> aktiviert. Der Betreiber muss zusätzlich WFL_AUTO_REPLY=true setzen und den Message Content Intent aktivieren. Nutzer wählen ihre Seite vor der Erkennung.`:'✅ Automatische W-or-L-Erkennung deaktiviert.'};}
    return this.valuesView(i.guildId);
  }
  async valuesView(guild){
    const imported=this.store.cacheGet(`trade:catalog:${guild}`)?.value;let data,error;
    try{data=await this.values.live();}catch(e){error=e.message;}
    return {content:`**Standard:** [SABTradingValues](${VALUE_SOURCE})\n${data?`**Quellenstand:** ${stamp(data.updated)}${Date.now()-data.updated>MAX_VALUE_AGE?' · 🕒 veraltet, keine heutige Bewertung':''}\n**Live abgerufen:** ${stamp(data.fetched)}\n**Brainrots:** ${data.items.length}`:`**Quellenstatus:** ${clip(clean(error),160)}`}\n**Serverliste:** ${imported?`${imported.items.length} exakte Varianten (${imported.unit})`:'keine'}\nPreise kommen aus exakten Quellenwerten. Aktuelle Server-Varianten haben Vorrang. Admins können /trade pflegen oder /trade import verwenden.`};
  }
  async component(i) {
    if(i.customId==='trade:value-save'){
      if(!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild))throw new Error('Dafür benötigst du „Server verwalten“.');
      await i.deferReply({flags:MessageFlags.Ephemeral});
      const parts=i.fields.getTextInputValue('variant').split('|').map(x=>x.trim());
      if(parts.length!==3)throw new Error('Variante: Brainrot | Mutation | Traits (oder keine).');
      const item=parseTradeLines(`1 | ${parts.join(' | ')}`)[0];
      const range=i.fields.getTextInputValue('range').split('|').map(x=>Number(x.trim().replace(',','.')));
      if(range.length!==2)throw new Error('Wertebereich: Minimum | Maximum.');
      const rawDate=i.fields.getTextInputValue('updated').trim();if(!/(Z|[+-]\d{2}:?\d{2})$/i.test(rawDate))throw new Error('Quellenstand braucht einen UTC-Offset, z.B. +01:00 oder Z.');
      const q=upsertVariant(this.store,i.guildId,{...item,low:range[0],high:range[1],source:i.fields.getTextInputValue('source'),updatedAt:rawDate},i.fields.getTextInputValue('unit'));
      return i.editReply({content:`✅ ${clean(q.name)} (${clean(q.mutation)}) gespeichert: ${fmt(q.low)}–${fmt(q.high)} ${clean(q.unit)}.`,allowedMentions:{parse:[]}});
    }
    if(i.customId==='trade:new'){
      await i.deferReply({flags:MessageFlags.Ephemeral});this.ensureCapacity();
      const trade=validateTrade({is_trade:true,left:parseTradeLines(i.fields.getTextInputValue('left')),right:parseTradeLines(i.fields.getTextInputValue('right')),issues:[]});
      const quota=await this.access.start(i.user.id,'wl');this.access.commit(quota);
      const id=randomUUID().slice(0,12);const s={trade,perspective:'left',origin:'manual',user:i.user.id,guild:i.guildId,at:Date.now(),quota};this.sessions.set(id,s);
      return i.editReply(draftPayload(s,id));
    }
    const [,action,id]=i.customId.split(':');const s=this.session(id,i.user.id,i.guildId);
    if(action==='edit') {
      const modal=new ModalBuilder().setCustomId(`trade:save:${id}`).setTitle('Trade-Positionen korrigieren');
      for(const side of ['left','right']) modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(side).setLabel(`${side==='left'?'Links':'Rechts'}: Menge | Name | Mutation | Traits`).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1800)
        .setValue(clip(s.trade[side].map(x=>`${x.quantity} | ${x.name} | ${x.mutation} | ${x.traits.join(', ')||'keine'}`).join('\n')||'1 | Name | Normal | keine',1800))));
      return i.showModal(modal);
    }
    await i.deferUpdate();
    if(action==='chooseleft'||action==='chooseright') {
      const payload=await this.analyze(s.attachment,action==='chooseleft'?'left':'right',i.user.id,i.guildId);this.sessions.delete(id);return i.editReply(payload);
    }
    if(action==='swap') {s.revision=(s.revision||0)+1;s.result=null;s.perspective=s.perspective==='left'?'right':'left';return i.editReply(draftPayload(s,id));}
    if(action==='save') {
      const updated=validateTrade({is_trade:true,left:parseTradeLines(i.fields.getTextInputValue('left')),right:parseTradeLines(i.fields.getTextInputValue('right')),issues:[]});
      s.revision=(s.revision||0)+1;s.result=null;s.trade=updated;
      return i.editReply(draftPayload(s,id));
    }
    if(action==='confirm'){
      const revision=s.revision||0;const snapshot=structuredClone(s.trade),perspective=s.perspective;
      s.quota=await this.access.bind(s.quota,i.user.id,'wl',JSON.stringify(snapshot));
      const result=await evaluateTrade(snapshot,perspective,this.values,i.guildId);
      if((s.revision||0)!==revision)throw new Error('Der Trade wurde während der Berechnung geändert. Bitte die aktuellen Positionen erneut bestätigen.');
      s.result=result;s.evaluatedAt=Date.now();
      this.store.saveTrade(id,i.guildId,i.user.id,{verdict:s.result.verdict,give:s.trade[s.perspective].map(position).join(', '),receive:s.trade[s.perspective==='left'?'right':'left'].map(position).join(', ')});
      return i.editReply(resultPayload(s.result,s,id));
    }
    if(action==='share'){
      if(!s.result)throw new Error('Bitte den Trade erst erneut bewerten.');
      if(Date.now()-(s.evaluatedAt||0)>120_000)throw new Error('Bitte das Ergebnis vor dem Teilen neu bewerten; die letzte Prüfung ist über zwei Minuten alt.');
      const signature=JSON.stringify([s.result,s.perspective,s.trade]);if(s.sharedSignature===signature)throw new Error('Dieses Ergebnis wurde bereits in den Kanal geteilt.');
      s.sharedSignature=signature;
      const payload=resultPayload(s.result,s,id);payload.components=[];payload.content=`Trade-Check von **${clean(i.user.username)}**\n${payload.content}`;
      try{await i.channel.send(payload);}catch(e){s.sharedSignature=null;throw e;}
      return i.followUp({content:'✅ Ergebnis im Kanal geteilt.',flags:MessageFlags.Ephemeral});
    }
  }
  async onMessage(message) {
    if(message.author.bot||!message.guildId||!message.content||message.webhookId)return;
    if(this.store.cacheGet(`trade:channel:${message.guildId}`)?.value!==message.channelId)return;
    if(!/\bw\s*(?:or|oder|\/)\s*l\b|\bwfl\b|\bwin\s*(?:or|oder)\s*loss\b/i.test(message.content))return;
    const image=message.attachments.find(a=>/^image\/(png|jpeg|webp)$/.test(a.contentType||''));if(!image)return;
    this.ensureCapacity();const id=randomUUID().slice(0,12);this.sessions.set(id,{attachment:{url:image.url,size:image.size},user:message.author.id,guild:message.guildId,at:Date.now()});
    await message.reply({content:`<@${message.author.id}> Welche Seite gibst du ab? Der Bot liest den Screenshot lokal aus und prüft anschließend die bestätigten Positionen anhand der Quellenwerte.`,allowedMentions:{parse:[],repliedUser:false},
      components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`trade:chooseleft:${id}`).setLabel('Ich gebe links ab').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId(`trade:chooseright:${id}`).setLabel('Ich gebe rechts ab').setStyle(ButtonStyle.Primary))]});
  }
}
