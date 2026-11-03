import {load} from 'cheerio';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {request} from './sources.js';
import {normalize} from './utils.js';

export const PHRASES=[
  ['looking-for','LOOKING FOR','Ich suche','search'],
  ['offering','OFFERING','Ich biete','handshake'],
  ['dm-me','DM ME','Schreib mir eine DM','speech_balloon'],
  ['fair-offers','FAIR OFFERS','Faire Angebote gesucht','scales'],
  ['trade-closed','TRADE CLOSED','Trade abgeschlossen','white_check_mark'],
  ['adds','ADDS?','Kannst du etwas hinzufügen?','heavy_plus_sign'],
  ['nty','NO THANKS','Danke, kein Interesse','no_entry_sign'],
  ['deal','DEAL!','Einverstanden','handshake'],
  ['upgrades','UPGRADING','Suche ein Upgrade','arrow_up'],
  ['downgrades','DOWNGRADING','Suche mehrere Gegenwerte','arrow_down']
].map(([id,name,description,tags])=>({id:`text-${id}`,name,rarity:'Trading',description,tags}));
export const stickerKey=(name,rarity)=>createHash('sha256').update(`${rarity}:${normalize(name)}`).digest('hex').slice(0,16);
export function parseRarity(html,rarity){
  if(!['Secret','OG'].includes(rarity))throw new Error('Unbekannte Sticker-Kategorie.');
  const $=load(html),root=$('.article-body').first(),items=new Map();let active=rarity==='OG';
  if(!root.length||normalize($('h1').first().text())!==normalize(rarity))throw new Error('Wiki-Kategorie konnte nicht geprüft werden.');
  root.find('h2,h3,ul').each((_,el)=>{
    const node=$(el),heading=normalize(node.text());
    if(el.tagName==='h2'){
      if(rarity==='Secret')active=heading.startsWith('brainrots');
      else if(/unreleased|trivia|related|upcoming/.test(heading))active=false;
    }
    if((el.tagName==='h2'||el.tagName==='h3')&&/upcoming|unreleased|deleted|scrapped|trivia/.test(heading))active=false;
    if(el.tagName!=='ul'||!active)return;
    node.children('li').each((_,li)=>{
      const first=$(li).children('a.wiki-link').first(),href=first.attr('href'),label=first.text().replace(/\s+/g,' ').trim();
      // Listed released Brainrots have an explicit income. Ignore trivia, upcoming and deleted lists.
      const text=$(li).text().replace(/\s+/g,' ').trim();
      if(!/^\/wiki\/[^/]+\/$/.test(href||'')||!label||label.length>100||!text.startsWith(label)||!(/^\$[\d,.]+\s*[KMBT]?\s*\/\s*s/i.test(text.slice(label.length).trim())))return;
      // The rarity list misspells this label; the linked article confirms the canonical name.
      const name=href==='/wiki/dragon-cannelloni/'?'Dragon Cannelloni':label;
      const id=stickerKey(name,rarity);items.set(id,{id,name,...(name!==label?{aliases:[label]}:{}),rarity,url:new URL(href,'https://stealabrainrot.wiki').href,tags:rarity==='OG'?'gem':'sparkles'});
    });
  });
  if(items.size<(rarity==='Secret'?50:2))throw new Error(`Der ${rarity}-Katalog ist unvollständig; der bisherige bleibt erhalten.`);
  return [...items.values()];
}
export function parsePortrait(html){
  const $=load(html);
  const primary=$('.portable-infobox .pi-image img,.portable-infobox figure img').first();
  const image=primary.length?primary:$('.article-header > img').first();
  const src=image.attr('src');
  if(!src)return null;
  const url=new URL(src,'https://stealabrainrot.wiki');
  if(url.protocol!=='https:'||url.hostname!=='wikiassets.net'||!url.pathname.startsWith('/roblox-steal-a-brainrot-428cec/images/'))return null;
  return url.href;
}
export class StickerCatalog{
  constructor(store,{fetcher=request,bundled}={}){this.store=store;this.fetcher=fetcher;this.bundled=bundled;this.flight=null;}
  async snapshot(){
    if(!this.bundled)this.bundled=JSON.parse(await readFile(new URL('../assets/stickers/catalog.json',import.meta.url),'utf8'));
    return this.bundled;
  }
  async get(){return this.store.cacheGet('stickers:catalog')?.value||this.snapshot();}
  async entries(){const catalog=await this.get();return [...PHRASES,...catalog.items];}
  async find(input){
    const entries=await this.entries(),exact=entries.find(x=>x.id===input||[x.name,...(x.aliases||[]),x.url?decodeURIComponent(new URL(x.url).pathname.split('/')[2]).replaceAll('-',' '):''].some(name=>name&&normalize(name)===normalize(input)));
    if(!exact)throw new Error('Sticker nicht gefunden. Wähle einen Eintrag mit /sticker liste.');return exact;
  }
  async sync(){
    if(this.flight)return this.flight;
    this.flight=(async()=>{
      const rows=await Promise.all(['Secret','OG'].map(async rarity=>parseRarity(await this.fetcher(`https://stealabrainrot.wiki/wiki/${rarity.toLowerCase()}/`,false),rarity)));
      const items=rows.flat().sort((a,b)=>a.name.localeCompare(b.name,'en'));
      // An item listed in both classes follows OG; do not offer two different current rarities.
      const og=new Set(items.filter(x=>x.rarity==='OG').map(x=>normalize(x.name)));
      const value={updated:Date.now(),sources:['https://stealabrainrot.wiki/wiki/secret/','https://stealabrainrot.wiki/wiki/og/'],items:items.filter(x=>x.rarity==='OG'||!og.has(normalize(x.name)))};
      this.store.cacheSet('stickers:catalog',value);return value;
    })().finally(()=>{this.flight=null;});return this.flight;
  }
}
