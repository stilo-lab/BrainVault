import {randomUUID} from 'node:crypto';
import {ActionRowBuilder,ButtonBuilder,ButtonStyle,ModalBuilder,TextInputBuilder,TextInputStyle,StringSelectMenuBuilder} from 'discord.js';
import {recognizeLocalPet} from './ocr.js';
import {downloadAttachment,parseTradeLines,validateTrade,variantKey,MAX_VALUE_AGE} from './trade.js';
import {clean,clip,stamp} from './utils.js';

const fmt=n=>n.toLocaleString('de-DE',{maximumFractionDigits:2});
const itemLine=x=>`${x.quantity}× ${clean(x.name)} · ${clean(x.mutation)} · ${x.traits.length?x.traits.map(clean).join(', '):'keine Traits'}`;
export function comparableOffers(item,quote,candidates,now=Date.now()){
  const center=(quote.low+quote.high)/2*item.quantity,results=[];
  for(const q of candidates){
    if(variantKey(q)===variantKey(item)||q.unit!==quote.unit||!Number.isFinite(q.low)||!Number.isFinite(q.high)||q.low<=0||q.high<q.low||now-q.updated>MAX_VALUE_AGE||q.updated>now+300000)continue;
    const mid=(q.low+q.high)/2,count=Math.round(center/mid);
    if(count<1||count>5)continue;
    const ratio=mid*count/center;if(ratio<0.9||ratio>1.1)continue;
    results.push({...q,count,low:q.low*count,high:q.high*count,distance:Math.abs(Math.log(ratio))});
  }
  const seen=new Set();return results.sort((a,b)=>a.distance-b.distance||a.count-b.count).filter(x=>{const name=x.name.toLowerCase();if(seen.has(name))return false;seen.add(name);return true;}).slice(0,5);
}
function controls(s,id){
  const rows=[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`value:confirm:${id}`).setLabel('Angaben stimmen · bewerten').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`value:edit:${id}`).setLabel('Angaben korrigieren').setStyle(ButtonStyle.Secondary))];
  if(s.items.length>1)rows.unshift(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`value:pick:${id}`).setPlaceholder('Welcher Brainrot ist gemeint?').addOptions(s.items.slice(0,20).map((x,index)=>({label:clip(`${x.name} · ${x.mutation}`,100),value:String(index),default:s.selected===index})))));
  return rows;
}
function draft(s,id){const item=s.items[s.selected];return{content:'**Dein Brainrot wurde lokal aus dem Bild gelesen.** Prüfe Name, Mutation, Menge und alle Traits. Das zählt als deine heutige Anfrage; Korrekturen vor der ersten Bewertung sind enthalten.',embeds:[{title:'📸 /value · Angaben prüfen',color:0x5865f2,description:itemLine(item)+(!item.details_clear?'\n\n⚠️ Details sind unklar. Bitte „Angaben korrigieren“ verwenden.':''),footer:{text:'Lokale OCR erkennt Text, keine verdeckten Traits oder rein bildlichen Merkmale.'}}],components:controls(s,id),allowedMentions:{parse:[]}};}
export class ValueService{
  constructor(store,values,trades,access,{recognizer=recognizeLocalPet,downloader=downloadAttachment}={}){this.store=store;this.values=values;this.trades=trades;this.access=access;this.recognizer=recognizer;this.downloader=downloader;this.sessions=new Map();}
  prune(){for(const[id,s]of this.sessions)if(Date.now()-s.at>15*60000)this.sessions.delete(id);}
  async start(i){
    this.prune();if(this.sessions.size>=200)throw new Error('Zu viele offene Value-Anfragen. Bitte später erneut versuchen.');
    this.trades.claim(i.user.id);this.trades.inFlight++;let quota;
    try{
      quota=await this.access.start(i.user.id,'value');
      const names=[...new Set([...(this.store.cacheGet(`trade:catalog:${i.guildId}`)?.value?.items||[]),...(this.store.cacheGet('trade:live')?.value?.items||[]),...(this.store.cacheGet('wiki:index')?.value||[])].map(x=>x.name||x.title).filter(Boolean))];
      if(!names.length)throw new Error('Der Namenskatalog lädt noch. Bitte gleich erneut versuchen.');
      const{buffer}=await this.downloader(i.options.getAttachment('bild',true));let items=await this.recognizer(buffer,names);
      if(!items.length)items=[{name:'Unbekannt',mutation:'Unbekannt',traits:[],quantity:1,details_clear:false}];
      validateTrade({is_trade:true,left:items,right:[],issues:[]});
      const id=randomUUID().slice(0,12),s={user:i.user.id,guild:i.guildId,items,selected:0,quota,at:Date.now(),revision:0};
      this.access.commit(quota);this.sessions.set(id,s);return draft(s,id);
    }catch(e){this.access.refund(quota);this.trades.lastOcr.delete(i.user.id);throw e;}
    finally{this.trades.inFlight--;}
  }
  async component(i){
    this.prune();const[,action,id]=i.customId.split(':'),s=this.sessions.get(id);
    if(!s||s.user!==i.user.id||s.guild!==i.guildId)throw new Error('Diese Value-Anfrage ist abgelaufen oder gehört einem anderen Nutzer.');
    if(action==='edit'){
      const x=s.items[s.selected];return i.showModal(new ModalBuilder().setCustomId(`value:save:${id}`).setTitle('Brainrot-Angaben korrigieren').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('item').setLabel('Menge | Brainrot | Mutation | alle Traits').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500).setValue(`${x.quantity} | ${x.name} | ${x.mutation} | ${x.traits.join(', ')||'keine'}`))));
    }
    await i.deferUpdate();
    if(action==='pick'){const n=Number(i.values[0]);if(!Number.isInteger(n)||!s.items[n])throw new Error('Ungültige Auswahl.');s.selected=n;s.revision++;return i.editReply(draft(s,id));}
    if(action==='save'){
      const items=parseTradeLines(i.fields.getTextInputValue('item'));if(items.length!==1)throw new Error('Bitte genau einen Brainrot eintragen.');
      validateTrade({is_trade:true,left:items,right:[],issues:[]});s.items[s.selected]=items[0];s.revision++;return i.editReply(draft(s,id));
    }
    if(action!=='confirm')return;
    const item=structuredClone(s.items[s.selected]),revision=s.revision;
    if(!item.details_clear||/unbekannt/i.test(item.name+' '+item.mutation))throw new Error('Bitte zuerst alle unklaren Angaben korrigieren.');
    s.quota=await this.access.bind(s.quota,s.user,'value',JSON.stringify(item));
    const q=await this.values.quote(item,s.guild),fields=[{name:'Dein Brainrot',value:itemLine(item)}];let description,color=0xf5b041;
    if(q.error)description=`**Kein belegter Variantenwert.**\n${clean(q.error)}`;
    else if(!Number.isFinite(q.low)||!Number.isFinite(q.high)||q.low<=0||q.high<q.low||!Number.isFinite(q.updated)||!q.unit)description='**Keine belastbare Bewertung möglich.** Die Quelle liefert unvollständige oder ungültige Werte.';
    else{
      fields.push({name:'Wertequelle',value:`[Quelle öffnen](${q.source}) · Stand ${stamp(q.updated)}`});
      if(Date.now()-q.updated>MAX_VALUE_AGE||q.updated>Date.now()+300000)description='**Keine aktuelle Bewertung möglich.** Der Quellenstand ist veraltet. Daraus berechne ich keine Tauschvorschläge.';
      else{
        description=`**Geschätzter Handelswert: ${fmt(q.low*item.quantity)}${q.high!==q.low?`–${fmt(q.high*item.quantity)}`:''} ${clean(q.unit)}**`;
        const alternatives=comparableOffers(item,q,await this.values.alternatives(s.guild));
        fields.push({name:'Was du dafür ungefähr bekommen könntest',value:alternatives.length?clip(alternatives.map(x=>`• **${x.count}× ${clean(x.name)}** · ${clean(x.mutation)}${x.traits.length?' · '+x.traits.map(clean).join(', '):''}\n  ${fmt(x.low)}${x.high!==x.low?`–${fmt(x.high)}`:''} ${clean(x.unit)} · [Beleg](${x.source})`).join('\n'),1000):'In der aktuellen Liste stehen keine passend bewerteten Varianten. Es wird kein Angebot erfunden.'});color=0x57f2b0;
      }
    }
    if(s.revision!==revision)throw new Error('Die Angaben wurden während der Bewertung geändert. Bitte erneut bestätigen.');
    this.store.saveTrade(id,s.guild,s.user,{verdict:'Value',give:itemLine(item),receive:description});
    return i.editReply({content:'**/value · Werte und mögliche Gegenwerte**',embeds:[{title:clip(`📊 ${item.name}`,256),description,color,fields,footer:{text:'Vergleichbare Community-Werte, keine aktiven Angebote oder zugesicherten Tauschs. Einkommen ist kein Handelswert.'}}],components:controls(s,id),allowedMentions:{parse:[]}});
  }
}
