import {clean,clip,stamp} from './utils.js';
import {parseMoney} from './assistant.js';

export function farmPlan(target,perSecond){
  if(!Number.isFinite(target)||!Number.isFinite(perSecond)||target<=0||perSecond<=0)throw new Error('Ziel und Einkommen müssen positive Zahlen sein.');
  const seconds=target/perSecond,fmt=n=>n.toLocaleString('de-DE',{maximumFractionDigits:2});
  return{embeds:[{title:'💸 Dein Farm-Ziel',color:0x57f2b0,description:`Ziel: **$${fmt(target)}** zusätzlich\nEinkommen: **$${fmt(perSecond)}/s**\n\nBenötigte Zeit: **${fmt(seconds/60)} Minuten**\nDas entspricht **${fmt(seconds/3600)} Stunden**.`,footer:{text:'Ziel ÷ aktuelles Gesamteinkommen • konstantes Einkommen angenommen • keine Änderung von Traits oder Boosts eingerechnet.'}}]};
}
export async function compareBrainrots(knowledge,first,second){
  const articles=await Promise.all([first,second].map(async query=>{
    const result=await knowledge.search(query,1);if(!result.pages.length)throw new Error(`Keinen passenden Wiki-Eintrag für „${clean(query)}“ gefunden.`);return knowledge.article(result.pages[0]);
  }));
  const fields=articles.map(a=>({name:clip(a.title,150),value:(a.fields||[]).filter(f=>/income|cost|price|rarity|status/i.test(f.name)).map(f=>`${({Income:'Einkommen',Cost:'Kaufpreis',Price:'Preis',Rarity:'Seltenheit',Status:'Verfügbarkeit'})[f.name]||f.name}: **${clean(f.value)}**`).join('\n')||'Keine vergleichbaren Infobox-Daten verfügbar.',inline:true}));
  const income=articles.map(a=>parseMoney(a.fields?.find(f=>/^income$/i.test(f.name))?.value));
  let text='Verglichen werden die dokumentierten Grundwerte. Mutationen, persönliche Traits und Handelswerte sind darin nicht automatisch enthalten.';
  if(income.every(x=>x!==null&&x>0))text+=`\n\nEinkommensverhältnis: **${(income[0]/income[1]).toLocaleString('de-DE',{maximumFractionDigits:3})} : 1** (${clean(articles[0].title)} zu ${clean(articles[1].title)}).`;
  return{embeds:[{title:'⚖️ Brainrot-Vergleich',color:0x5865f2,description:text,fields:[...fields,{name:'Quellen und Stand',value:articles.map(a=>`[${clean(a.title)}](${a.url}) · ${stamp(a.fetched)}${a.stale?' · älterer Cache':''}`).join('\n')}]}],allowedMentions:{parse:[]}};
}
