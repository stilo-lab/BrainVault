import { createCanvas } from '@napi-rs/canvas';

export function renderLuckyFrame(names,progress,width=600,height=360){
  const canvas=createCanvas(width,height),c=canvas.getContext('2d');
  c.fillStyle='#090b16';c.fillRect(0,0,width,height);
  const glow=c.createRadialGradient(width/2,210,10,width/2,190,270);glow.addColorStop(0,progress>0.5?'#572381':'#25143c');glow.addColorStop(1,'#090b16');c.fillStyle=glow;c.fillRect(0,0,width,height);
  c.textAlign='center';c.fillStyle='#e5d5ff';c.font='bold 22px sans-serif';c.fillText('SECRET LUCKY BLOCK',width/2,39);
  const reveal=Math.max(0,Math.min(1,(progress-0.48)/0.2));
  if(reveal>0){
    c.save();c.translate(width/2,190);c.rotate(progress*0.7);c.fillStyle='#b04cff35';
    for(let i=0;i<12;i++){c.rotate(Math.PI/6);c.beginPath();c.moveTo(0,0);c.lineTo(-18,-280);c.lineTo(18,-280);c.closePath();c.fill();}c.restore();
  }
  const shake=progress<0.42?Math.sin(progress*100)*Math.min(8,progress*25):0;
  const x=width/2-65+shake,y=progress>0.55?230:157;
  c.save();c.translate(x,y);
  const polygon=(points,color)=>{c.fillStyle=color;c.beginPath();points.forEach(([px,py],i)=>i?c.lineTo(px,py):c.moveTo(px,py));c.closePath();c.fill();c.strokeStyle='#c35aff';c.lineWidth=3;c.stroke();};
  polygon([[0,0],[130,0],[130,98],[0,98]],'#16121e');polygon([[130,0],[157,-18],[157,79],[130,98]],'#291036');
  c.strokeStyle='#9837db';c.lineWidth=7;c.strokeRect(7,7,116,84);c.fillStyle='#f5eaff';c.font='bold 67px sans-serif';c.fillText('?',65,75);
  const lidLift=reveal*65;
  polygon([[0,-lidLift],[26,-22-lidLift],[157,-22-lidLift],[130,-lidLift]],'#4e1b68');
  if(reveal>0){c.fillStyle=`rgba(239,200,255,${reveal*0.8})`;c.fillRect(4,-lidLift+4,122,6);}
  c.restore();
  for(let i=0;i<28;i++){
    const px=(i*97+progress*40)%width,py=(i*71+progress*90)%height;
    c.fillStyle=i%2?'#d1a0ff':'#58e7da';c.globalAlpha=0.25+reveal*0.65;c.fillRect(px,py,3+(i%3),3+(i%3));
  }c.globalAlpha=1;
  if(reveal>0.7){
    c.fillStyle='#68f5c9';c.font='bold 16px sans-serif';c.fillText(names.length>1?'DIE GEWINNER':'GEWONNEN HAT',width/2,82);
    names.slice(0,5).forEach((name,i)=>{
      let font=names.length>3?19:27;const label=String(name).replace(/\p{C}/gu,'').slice(0,36)||'Gewinner';
      c.font=`bold ${font}px sans-serif`;while(c.measureText(label).width>width-70&&font>12)c.font=`bold ${--font}px sans-serif`;
      c.fillStyle='#ffffff';c.fillText(label,width/2,119+i*(names.length>3?24:34));
    });
  }else{c.fillStyle='#c4b6d7';c.font='15px sans-serif';c.fillText('Der Block wird geöffnet ...',width/2,height-28);}
  return canvas;
}
export async function winnerCard(names){return renderLuckyFrame(names,1).toBuffer('image/png');}
