import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { imageSize } from 'image-size';
import { normalize, clean } from './utils.js';

const require=createRequire(import.meta.url);
const mutations=['Normal','Gold','Diamond','Rainbow','Bloodrot','Candy','Lava','Galaxy','Yin Yang','Radioactive','Cursed','Divine','Cyber','Phantom'];
export function parseOcrSide(text,names){
  const lines=String(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);const found=[];
  const candidates=[...new Map(names.filter(x=>typeof x==='string'&&x.trim()).map(name=>[normalize(name),name])).values()].sort((a,b)=>b.length-a.length);
  for(let index=0;index<lines.length;index++){
    const line=normalize(lines[index]);
    const name=candidates.find(n=>{const normalized=normalize(n);return normalized.length>=3?(` ${line} `).includes(` ${normalized} `):line===normalized;});
    if(!name)continue;
    // Nur angrenzende Metadaten bis zur nächsten erkennbaren Position übernehmen.
    const next=lines.slice(index+1,index+4).findIndex(l=>candidates.some(n=>(` ${normalize(l)} `).includes(` ${normalize(n)} `)));
    const block=lines.slice(index,index+1+(next<0?3:next)).join('\n');const normBlock=` ${normalize(block)} `;
    const mutationText=block.match(/(?:mutation|mut)\s*[:=]\s*([^\n]+)/i)?.[1];
    const mutation=mutations.find(m=>normalize(mutationText||'')===normalize(m)||block.split('\n').some(l=>normalize(l)===normalize(m)))||'Unbekannt';
    const traitsLine=block.match(/(?:traits?|merkmale)\s*[:=]\s*([^\n]+)/i)?.[1]?.trim();
    const knownNone=traitsLine&&/^(none|no traits|keine|normal|-)$/i.test(traitsLine);
    const traits=traitsLine&&!knownNone?traitsLine.split(/[,;]/).map(clean).filter(Boolean):[];
    const amount=block.match(/(?:^|\s)(?:x\s*(\d{1,3})|(\d{1,3})\s*[x×])(?:\s|$)/i);
    const quantity=amount?Number(amount[1]||amount[2]):1;
    found.push({name,mutation,traits,quantity,details_clear:mutation!=='Unbekannt'&&!!traitsLine});
    if(found.length>=20)break;
  }
  return found;
}
export function tradeFromOcr(left,right,names){
  const result={is_trade:true,left:parseOcrSide(left,names),right:parseOcrSide(right,names),issues:[]};
  if(!result.left.length||!result.right.length){result.is_trade=false;result.issues.push('Nicht auf beiden Bildhälften konnten bekannte Brainrot-Namen gelesen werden. Ergänze alle Positionen über „Positionen korrigieren“.');}
  return result;
}
let running=false;
async function recognizeImage(buffer,names,{createWorkerFactory,single=false}={}){
  if(running)throw new Error('Die lokale Texterkennung arbeitet gerade. Bitte gleich erneut versuchen.');
  const dimensions=imageSize(buffer);
  if(!dimensions.width||!dimensions.height||dimensions.width<100||dimensions.height<60||dimensions.width>6000||dimensions.height>6000||dimensions.width*dimensions.height>16_000_000)throw new Error('Das Bild braucht 100×60 bis 6000×6000 Pixel und darf höchstens 16 Megapixel haben.');
  running=true;let worker,timer;
  try{
    const create=createWorkerFactory||(await import('tesseract.js')).createWorker;
    const langPath=join(dirname(require.resolve('@tesseract.js-data/eng/package.json')),'4.0.0_best_int');
    worker=await create('eng',1,{langPath,gzip:true,cacheMethod:'none',errorHandler:()=>{}});
    const work=(async()=>{
      await worker.setParameters({tessedit_pageseg_mode:'11'});
      if(single){const result=await worker.recognize(buffer);return parseOcrSide(result.data.text,names);}
      const mid=Math.floor(dimensions.width/2);
      const left=await worker.recognize(buffer,{rectangle:{left:0,top:0,width:mid,height:dimensions.height}});
      const right=await worker.recognize(buffer,{rectangle:{left:mid,top:0,width:dimensions.width-mid,height:dimensions.height}});
      return tradeFromOcr(left.data.text,right.data.text,names);
    })();
    return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Die lokale Texterkennung hat das Zeitlimit überschritten. Nutze /trade eingeben.')),60_000);})]);
  }finally{clearTimeout(timer);if(worker)await worker.terminate().catch(()=>{});running=false;}
}
export const recognizeLocalTrade=(buffer,names,options={})=>recognizeImage(buffer,names,options);
export const recognizeLocalPet=(buffer,names,options={})=>recognizeImage(buffer,names,{...options,single:true});
