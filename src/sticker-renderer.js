import {createCanvas,loadImage} from '@napi-rs/canvas';
import {imageSize} from 'image-size';
import {parsePortrait} from './sticker-catalog.js';
import {request} from './sources.js';

export async function portraitBytes(url,fetcher=fetch){
  const u=new URL(url);
  if(u.protocol!=='https:'||u.hostname!=='wikiassets.net'||!u.pathname.startsWith('/roblox-steal-a-brainrot-428cec/images/'))throw new Error('Unzulässige Bildquelle.');
  const res=await fetcher(u,{signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!res.ok||!/^image\/(?:png|jpe?g|webp)$/i.test(res.headers.get('content-type')?.split(';')[0]||''))throw new Error('Wiki-Bild nicht verfügbar.');
  const reader=res.body.getReader(),chunks=[];let size=0;
  try{for(;;){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>4_000_000)throw new Error('Wiki-Bild zu groß.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  const data=Buffer.concat(chunks),dimensions=imageSize(data);
  if(!['png','jpg','webp'].includes(dimensions.type)||dimensions.width>6000||dimensions.height>6000||dimensions.width*dimensions.height>16_000_000)throw new Error('Wiki-Bildformat nicht unterstützt.');
  return data;
}
export async function fetchPortrait(item,{fetcher=request,download=portraitBytes}={}){
  if(!item.url)return null;
  const url=parsePortrait(await fetcher(item.url,false));return url?{buffer:await download(url),url}:null;
}
function fitLines(ctx,text,maxWidth,maxLines=3){
  for(let size=30;size>=15;size--){
    ctx.font=`900 ${size}px sans-serif`;const lines=[];let current='';
    for(const word of text.split(/\s+/)){const next=current?current+' '+word:word;if(ctx.measureText(next).width>maxWidth&&current){lines.push(current);current=word;}else current=next;}
    if(current)lines.push(current);
    if(lines.length<=maxLines&&lines.every(line=>ctx.measureText(line).width<=maxWidth))return{lines,size};
  }
  return{lines:[text.slice(0,25),text.slice(25,50),text.slice(50,75)].filter(Boolean),size:15};
}
function text(ctx,value,x,y,color='#fff',stroke=true){ctx.textAlign='center';ctx.textBaseline='middle';if(stroke){ctx.strokeStyle='#090d18';ctx.lineWidth=5;ctx.strokeText(value,x,y);}ctx.fillStyle=color;ctx.fillText(value,x,y);}
function tradeIcon(c,id,accent){
  if(id==='text-looking-for'||id==='text-dm-me'){c.font='900 72px sans-serif';text(c,id==='text-looking-for'?'?':'@',160,115,accent);return;}
  c.strokeStyle=accent;c.lineWidth=9;c.lineCap='round';c.lineJoin='round';
  const path=points=>{c.beginPath();points.forEach(([x,y],n)=>n?c.lineTo(x,y):c.moveTo(x,y));c.stroke();};
  if(id==='text-trade-closed'||id==='text-deal'){path([[132,115],[151,134],[190,94]]);return;}
  if(id==='text-adds'){path([[134,115],[186,115]]);path([[160,89],[160,141]]);return;}
  if(id==='text-upgrades'||id==='text-downgrades'){
    const down=id==='text-downgrades';path([[160,down?91:139],[160,down?139:91]]);path([[140,down?120:110],[160,down?140:90],[180,down?120:110]]);return;
  }
  path([[123,100],[190,100],[177,87]]);path([[190,100],[177,113]]);path([[197,134],[130,134],[143,121]]);path([[130,134],[143,147]]);
}
export async function renderSticker(item,portrait){
  const canvas=createCanvas(320,320),c=canvas.getContext('2d'),phrase=item.rarity==='Trading',og=item.rarity==='OG',accent=phrase?'#72ffc0':og?'#ffd76d':'#b0a0ff';
  c.fillStyle='#0b1020';c.beginPath();c.roundRect(7,7,306,306,34);c.fill();
  c.strokeStyle=accent;c.lineWidth=5;c.stroke();
  const grad=c.createRadialGradient(160,135,10,160,155,180);grad.addColorStop(0,og?'#6a471f':phrase?'#205c4c':'#483a75');grad.addColorStop(1,'#10162b');c.fillStyle=grad;c.beginPath();c.roundRect(16,16,288,288,26);c.fill();
  c.globalAlpha=0.2;c.strokeStyle=accent;c.lineWidth=1;for(let n=0;n<5;n++){c.beginPath();c.moveTo(25,70+n*36);c.lineTo(295,30+n*36);c.stroke();}c.globalAlpha=1;
  c.font='900 16px sans-serif';text(c,phrase?'SAB • TRADE':`${item.rarity.toUpperCase()} • SAB`,160,36,accent,false);
  if(phrase){
    tradeIcon(c,item.id,accent);
    const title=fitLines(c,item.name,265,2);c.font=`900 ${title.size}px sans-serif`;title.lines.forEach((line,n)=>text(c,line,160,192+n*(title.size+5)));
    c.font='600 14px sans-serif';text(c,item.description,160,278,'#c8d5e8',false);
  }else{
    if(portrait){const image=await loadImage(portrait),scale=Math.min(252/image.width,185/image.height);c.save();c.shadowColor=accent;c.shadowBlur=12;c.drawImage(image,160-image.width*scale/2,58+(185-image.height*scale)/2,image.width*scale,image.height*scale);c.restore();}
    else{c.font='900 78px sans-serif';text(c,'?',160,145,accent);c.font='600 13px sans-serif';text(c,'NAME STICKER',160,202,'#c8d5e8',false);}
    const title=fitLines(c,item.name,274,3);c.font=`900 ${title.size}px sans-serif`;title.lines.forEach((line,n)=>text(c,line,160,254+(n-(title.lines.length-1)/2)*(title.size+2)));
  }
  const png=canvas.toBuffer('image/png');if(png.length>512*1024)throw new Error('Der Sticker überschreitet das Discord-Limit.');return png;
}
export async function withPurpose(buffer,purpose){
  if(!purpose)return buffer;
  const canvas=createCanvas(320,320),c=canvas.getContext('2d');c.drawImage(await loadImage(buffer),0,0);c.fillStyle='#72ffc0';c.beginPath();c.roundRect(45,48,230,29,10);c.fill();c.fillStyle='#10162b';c.textAlign='center';c.textBaseline='middle';c.font='900 17px sans-serif';c.fillText(purpose,160,63);return canvas.toBuffer('image/png');
}
