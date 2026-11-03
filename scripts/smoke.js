import { Store } from '../src/store.js';
import { Knowledge, RobloxSource } from '../src/sources.js';
import { ValueSource } from '../src/trade.js';
const store=new Store(':memory:');
try {
  const knowledge=new Knowledge(store);const roblox=new RobloxSource(store);const values=new ValueSource(store);
  const results=await Promise.allSettled([
    (async()=>{const index=await knowledge.index();const found=await knowledge.search('Tralalero Tralala');const article=await knowledge.article(found.pages[0]);return{wikiTopics:index.value.length,title:article.title,facts:article.fields};})(),
    roblox.sync(),roblox.stats(),
    (async()=>{const data=await values.live();return{valueSource:'SABTradingValues',brainrots:data.items.length,sourceUpdated:new Date(data.updated).toISOString(),fresh:Date.now()-data.updated<=72*3600_000};})()
  ]);
  let failed=false;
  for(let i=0;i<results.length;i++){console.log(i,results[i].status==='fulfilled'?JSON.stringify(results[i].value):results[i].reason.message);if(results[i].status==='rejected')failed=true;}
  if(failed)process.exitCode=1;
}finally{store.close();}
