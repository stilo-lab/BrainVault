import { GUIDES } from './knowledge-de.js';
import { clean, clip, normalize, stamp } from './utils.js';
import { helpView } from './help.js';

const translations={Income:'Einkommen',Cost:'Kaufpreis',Price:'Preis',Rarity:'Seltenheit',Status:'Verfügbarkeit',Duration:'Dauer',Power:'Stärke',Cooldown:'Abklingzeit',Multiplier:'Multiplikator',Fragments:'Benötigte Teile'};
const translatedValue=value=>clean(value).replace(/^Unobtainable\b/i,'Nicht erhältlich').replace(/^Obtainable\b/i,'Erhältlich').replace(/^Removed\b/i,'Entfernt').replace(/^Unknown\b/i,'Unbekannt');
export function findGuide(query){
  const q=normalize(query);
  return GUIDES.map(g=>({...g,score:g.keywords.reduce((n,k)=>{const key=normalize(k);return n+(new RegExp(`(?:^| )${key}(?: |$)`).test(q)?key.split(' ').length*4:0);},0)}))
    .filter(g=>g.score>0).sort((a,b)=>b.score-a.score)[0];
}
export function parseMoney(value){
  const m=String(value).replaceAll(',','').match(/^\$?([\d.]+)\s*(K|M|B|T|Qa|Qi)?(?:\/s)?$/i);if(!m)return null;
  const multiplier={k:1e3,m:1e6,b:1e9,t:1e12,qa:1e15,qi:1e18}[m[2]?.toLowerCase()]||1;
  const n=Number(m[1])*multiplier;return Number.isFinite(n)?n:null;
}
export function factAnswer(article,query){
  const q=normalize(query),fields=article.fields||[],find=pattern=>fields.find(f=>pattern.test(f.name));
  const income=find(/^income$/i),cost=find(/^(cost|price)$/i),rarity=find(/^rarity$/i),status=find(/^status$/i);
  if(/\bwert\b|\bvalue\b|\bhandelswert\b/.test(q)&&!/einkommen|income/.test(q))return `Für einen Handelswert von **${clean(article.title)}** brauche ich die genaue Mutation und alle Traits. Nutze dafür /trade wert. Die Wiki-Infobox unten enthält Spielwerte; sie ist keine Marktpreisliste.`;
  const variant=/\b(gold|diamond|rainbow|bloodrot|candy|lava|galaxy|radioactive|cursed|divine|cyber|phantom)\b/.exec(q)?.[1];
  if(variant&&!normalize(article.title).includes(variant)&&/einkommen|income|kostet|kaufpreis|preis/.test(q))return `Die gefundene Infobox beschreibt die **Grundwerte** von ${clean(article.title)}. Den Wert der angefragten Mutation **${variant}** kann ich daraus allein nicht sicher bestimmen. Für Einkommen kannst du den im Spiel angezeigten Gesamtfaktor mit /rechner verwenden; für Handelswerte /trade wert.`;
  if(/einkommen|income|pro sekunde|pro stunde|macht .* geld/.test(q)&&income){
    const value=parseMoney(income.value);let text=`**${clean(article.title)}** erzeugt laut Wiki **${clean(income.value)}**.`;
    if(value!==null)text+=`\nRechnerisch: **$${(value*60).toLocaleString('de-DE')} pro Minute** und **$${(value*3600).toLocaleString('de-DE')} pro Stunde**. Das basiert auf dem angegebenen Einkommen, ohne zusätzliche eigene Faktoren.`;
    return text;
  }
  if(/kostet|kaufpreis|preis|cost/.test(q)&&cost)return `Der dokumentierte Kaufpreis von **${clean(article.title)}** beträgt **${clean(cost.value)}**.\nDas ist der Spiel-Kaufpreis. Für Handelswerte nutze /trade wert mit der genauen Variante.`;
  if(/selten|rarity/.test(q)&&rarity)return `**${clean(article.title)}** gehört laut Wiki zur Seltenheit **${clean(rarity.value)}**. Seltenheit und tatsächlicher Handelswert sind unterschiedliche Angaben.`;
  if(/bekomm|erhalt|erhaltlich|obtained|obtain|finden|finde/.test(q)&&status)return `**${clean(article.title)}** wird aktuell in der Quelle so geführt: **${translatedValue(status.value)}**.\nPrüfe für den genauen Erwerbsweg und Event-Voraussetzungen den verlinkten Artikel. Eine Wiki-Angabe belegt nicht, dass ein bestimmter Ingame-Server gerade das passende Event ausführt.`;
  if(fields.length)return `Hier sind die dokumentierten Angaben zu **${clean(article.title)}**. Für Details zum Erwerb und eventabhängige Änderungen findest du unten die Quelle.`;
  return null;
}
export class SabAssistant{
  constructor(store,knowledge){this.store=store;this.knowledge=knowledge;}
  async answer(query,user,guild){
    if(['hilfe','help','befehle','was kannst du'].includes(normalize(query)))return helpView();
    const learned=this.store.knowledgeAnswer?.(guild,query);
    if(learned)return{embeds:[{title:'📚 SAB Serverwissen',color:0x5865f2,description:clip(clean(learned.answer),3000),fields:[{name:'Quelle',value:`[Beleg öffnen](${learned.source}) · vom Serverteam eingetragen ${stamp(learned.updated,'d')}`}],footer:{text:'Redaktionell gepflegte Antwort dieses Servers • ohne KI-API'}}],allowedMentions:{parse:[]}};
    let guide=findGuide(query);let found,error;
    try{found=await this.knowledge.search(query,4);}catch(e){error=e;}
    const best=found?.pages[0];
    if(guide&&best&&guide.source!==best.url&&normalize(query).includes(normalize(best.title))&&!GUIDES.some(g=>g.source===best.url))guide=null;
    if(guide)return{embeds:[{title:`🧠 ${guide.title}`,color:0x5865f2,description:guide.answer,
      fields:[{name:'Quelle und weitere Details',value:`[Grundlage öffnen](${guide.source})${found?.pages?.length?'\n'+found.pages.slice(0,3).map(p=>`[${clean(p.title)}](${p.url})`).join(' · '):''}`}],footer:{text:`Deutsche Wissensredaktion • Stand 02.11.2026${error?' • Live-Suche derzeit nicht erreichbar':''} • ohne KI-API`}}],allowedMentions:{parse:[]}};
    if(!found?.pages.length)return{content:error?'Die Live-Wikisuche ist gerade nicht erreichbar. Grundlagen wie Rebirth, Traits oder Dig kann ich trotzdem erklären.':
      'Dazu finde ich noch keine passende geprüfte Antwort. Nenne einen genauen Brainrot-, Item- oder Eventnamen. Mit `7ask hilfe` bekommst du Beispiele. Das Serverteam kann Antworten mit /sab lernen ergänzen.',allowedMentions:{parse:[]}};
    const results=await Promise.allSettled(found.pages.slice(0,2).map(p=>this.knowledge.article(p)));
    const articles=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
    if(!articles.length)throw new Error('Passende Artikel gefunden, aber derzeit nicht lesbar. Versuche /sab suche für die Quellenlinks.');
    const article=articles[0],answer=factAnswer(article,query);
    return{embeds:[{title:clip(`🧠 ${article.title}`,256),color:0x9b59b6,description:answer||'Für diesen Spezialfall ist noch keine geprüfte deutsche Erklärung hinterlegt. Der passende Guide ist unten verlinkt.',
      fields:[...(article.fields||[]).slice(0,8).map(f=>({...f,name:translations[f.name]||f.name,value:translatedValue(f.value)})),
        {name:'Quelle und Datenstand',value:`[${clean(article.title)}](${article.url}) · abgerufen ${stamp(article.fetched)}${article.stale?' · älterer Cache':''}`},
        ...(found.pages.length>1?[{name:'Weitere Treffer',value:found.pages.slice(1,4).map(p=>`[${clean(p.title)}](${p.url})`).join('\n')}]:[])],
      footer:{text:'Aus gelesenen Wiki-Fakten formuliert • Änderungen im Spiel möglich • keine KI-API'}}],allowedMentions:{parse:[]}};
  }
}
