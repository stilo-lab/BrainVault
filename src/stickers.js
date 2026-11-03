import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {ActionRowBuilder,ButtonBuilder,ButtonStyle,StringSelectMenuBuilder,PermissionFlagsBits} from 'discord.js';
import {PHRASES} from './sticker-catalog.js';
import {fetchPortrait,renderSticker,withPurpose} from './sticker-renderer.js';
import {normalize,clean,clip,stamp} from './utils.js';

const ADMIN=new Set(['installieren','basispaket','sync']);
export function stickerName(item){return `SAB ${item.name.replace(/[^\p{L}\p{N} ]/gu,'').trim()}`.slice(0,23)+' '+item.id.slice(-6);}
const marker=item=>`SAB Companion • ${item.id}`;
export const stickerCapacity=guild=>[5,15,30,60][Number(guild.premiumTier)]||5;
export class StickerService{
  constructor(store,catalog,{renderer=renderSticker,portrait=fetchPortrait,read=readFile,clock=()=>Date.now()}={}){
    this.store=store;this.catalog=catalog;this.renderer=renderer;this.portrait=portrait;this.read=read;this.clock=clock;this.sessions=new Map();this.locks=new Set();this.active=new Map();this.lastSend=new Map();
  }
  async buffer(item){
    if(!/^(?:[a-f0-9]{16}|text-[a-z-]+)$/.test(item.id))throw new Error('Ungültiger Sticker-Schlüssel.');
    try{return await this.read(new URL(`../assets/stickers/${item.id}.png`,import.meta.url));}catch(e){if(e.code!=='ENOENT')throw e;}
    const cached=this.store.cacheGet(`stickers:png:${item.id}`,7*86400000);if(cached)return Buffer.from(cached.value.data,'base64');
    if(this.active.has(item.id))return this.active.get(item.id);
    if(this.active.size>=2)throw new Error('Die Sticker-Erstellung ist ausgelastet. Bitte gleich erneut versuchen.');
    const flight=(async()=>{
      let portrait;try{portrait=await this.portrait(item);}catch{}
      const buffer=await this.renderer(item,portrait?.buffer);
      // New entries are usable even when the image host is down: make an explicit name card.
      this.store.cacheSet(`stickers:png:${item.id}`,{data:buffer.toString('base64'),art:!!portrait,at:this.clock()});
      const rows=this.store.db.prepare("SELECT key FROM cache WHERE key LIKE 'stickers:png:%' ORDER BY at DESC LIMIT -1 OFFSET 150").all();for(const row of rows)this.store.db.prepare('DELETE FROM cache WHERE key=?').run(row.key);
      return buffer;
    })().finally(()=>this.active.delete(item.id));this.active.set(item.id,flight);return flight;
  }
  async autocomplete(query){const q=normalize(query);return(await this.catalog.entries()).filter(x=>!q||[x.name,...(x.aliases||[])].some(name=>normalize(name).includes(q))).slice(0,25).map(x=>({name:clip(`${x.rarity} · ${x.name}`,100),value:x.id}));}
  prune(){for(const[id,s]of this.sessions)if(this.clock()-s.at>15*60000)this.sessions.delete(id);for(const[key,at]of this.lastSend)if(this.clock()-at>60000)this.lastSend.delete(key);}
  async view(s,id){
    const all=(await this.catalog.entries()).filter(x=>s.category==='all'||x.rarity===s.category),pages=Math.max(1,Math.ceil(all.length/20));s.page=Math.max(0,Math.min(s.page,pages-1));const items=all.slice(s.page*20,s.page*20+20),selected=s.selected?await this.catalog.find(s.selected):null;
    const catalogue=await this.catalog.get();
    return{content:null,attachments:[],embeds:[{title:'🪄 SAB Trading-Sticker',color:0x9678f5,description:selected?`**${clean(selected.name)}** · ${selected.rarity}\nMit „Im Kanal senden“ postest du das Motiv mit deinem Profil. Für das native Discord-Stickermenü installiert ein Admin das Motiv mit /sticker installieren.`:items.map(x=>`• ${clean(x.name)} · ${x.rarity}`).join('\n')||'Keine Sticker in dieser Auswahl.',...(selected?{image:{url:`attachment://${selected.id}.png`}}:{}),footer:{text:`Seite ${s.page+1}/${pages} • ${all.length} Motive • Wiki-Katalog ${new Date(catalogue.updated).toLocaleDateString('de-DE',{timeZone:'Europe/Berlin'})} • Fehlende Abbildungen: Name-Sticker`}}],
      ...(selected?{files:[{attachment:await this.buffer(selected),name:`${selected.id}.png`}]}:{}),
      components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`sticker:pick:${id}`).setPlaceholder('Sticker auswählen').addOptions(items.map(x=>({label:clip(x.name,100),description:x.rarity,value:x.id,default:s.selected===x.id})))),
        new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`sticker:prev:${id}`).setLabel('Zurück').setStyle(ButtonStyle.Secondary).setDisabled(s.page===0),new ButtonBuilder().setCustomId(`sticker:next:${id}`).setLabel('Weiter').setStyle(ButtonStyle.Secondary).setDisabled(s.page===pages-1),new ButtonBuilder().setCustomId(`sticker:send:${id}`).setLabel('Im Kanal senden').setStyle(ButtonStyle.Success).setDisabled(!selected))],allowedMentions:{parse:[]}};
  }
  async send(i,item,purpose){
    this.prune();const key=`${i.guildId}:${i.user.id}`;if(this.clock()-(this.lastSend.get(key)||0)<5000)throw new Error('Bitte fünf Sekunden zwischen Sticker-Beiträgen warten.');
    this.lastSend.set(key,this.clock());
    try{
      const me=await i.guild.members.fetchMe(),perms=i.channel?.permissionsFor(me),send=i.channel?.isThread?.()?PermissionFlagsBits.SendMessagesInThreads:PermissionFlagsBits.SendMessages;
      if(!perms?.has([PermissionFlagsBits.ViewChannel,send,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks]))throw new Error('Hier fehlen mir die Rechte zum Senden von Bildern und Einbettungen.');
      // Include the author in the public offer, since Discord otherwise only shows the bot.
      const name=clip(clean(i.member?.displayName||i.user.globalName||i.user.username||i.user.id),100);
      const message=await i.channel.send({embeds:[{color:item.rarity==='OG'?0xffd76d:0x9678f5,author:{name,icon_url:i.user.displayAvatarURL?.()},description:`[Profil / DM öffnen](https://discord.com/users/${i.user.id})`,image:{url:`attachment://${item.id}.png`}}],files:[{attachment:await withPurpose(await this.buffer(item),purpose),name:`${item.id}.png`}],allowedMentions:{parse:[]}});
      return{content:`✅ [Dein Trading-Sticker](${message.url}) wurde gesendet.`,embeds:[],components:[],attachments:[]};
    }catch(e){this.lastSend.delete(key);throw e;}
  }
  async install(guild,items,user){
    if(this.locks.has(guild.id))throw new Error('Für diesen Server läuft bereits eine Sticker-Installation.');
    this.locks.add(guild.id);
    try{
      const me=await guild.members.fetchMe();
      if(!me.permissions.has(PermissionFlagsBits.CreateGuildExpressions)&&!me.permissions.has(PermissionFlagsBits.ManageGuildExpressions))throw new Error('Für echte Server-Sticker brauche ich „Ausdrücke erstellen“ oder „Ausdrücke verwalten“.');
      const existing=await guild.stickers.fetch(),results=[];let free=Math.max(0,stickerCapacity(guild)-existing.size);
      for(const item of items){
        const old=[...existing.values()].find(s=>s.description===marker(item));
        if(old){results.push({item,sticker:old,created:false});continue;}
        if(!free){results.push({item,error:'Keine freien Discord-Stickerplätze.'});continue;}
        try{
          const sticker=await guild.stickers.create({file:{attachment:await this.buffer(item),name:`${item.id}.png`},name:stickerName(item),description:marker(item),tags:item.tags||'sparkles',reason:`SAB Trading-Sticker durch ${user}`});
          existing.set(sticker.id,sticker);free--;results.push({item,sticker,created:true});
        }catch(e){results.push({item,error:Number(e.code)===30039?'Discord meldet volle Stickerplätze.':clip(e.message,120)});break;}
      }
      return results;
    }finally{this.locks.delete(guild.id);}
  }
  async command(i){
    const sub=i.options.getSubcommand();
    if(ADMIN.has(sub)&&!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild))throw new Error('Dafür benötigst du „Server verwalten“.');
    if(sub==='sync'){const cat=await this.catalog.sync();return{content:`✅ ${cat.items.filter(x=>x.rarity==='Secret').length} Secret- und ${cat.items.filter(x=>x.rarity==='OG').length} OG-Namen aus den veröffentlichten Wiki-Listen geprüft. Stand ${stamp(cat.updated)}. Unveröffentlichte, gelöschte und verworfene Listen werden ausgelassen. Neue Motive werden bei Bedarf erstellt.`};}
    if(sub==='status'){
      const cat=await this.catalog.get(),stickers=await i.guild.stickers.fetch();
      return{content:`**${cat.items.length} Brainrot-Motive + ${PHRASES.length} Trading-Vorlagen**\nWiki-Katalog: ${stamp(cat.updated)}\nServer-Stickerplätze: ${stickers.size}/${stickerCapacity(i.guild)} (nach Boost-Stufe).\n/sticker senden nutzt Bilder und braucht keinen Stickerplatz. /sticker installieren legt einen nativen Sticker an. Fehlende Abbildungen werden als Name-Sticker dargestellt.\n[Secret-Liste](${cat.sources[0]}) · [OG-Liste](${cat.sources[1]})`};
    }
    if(sub==='liste'){
      this.prune();if(this.sessions.size>=300)throw new Error('Zu viele offene Sticker-Menüs. Bitte später erneut versuchen.');
      const id=randomUUID().slice(0,12),s={user:i.user.id,guild:i.guildId,category:i.options.getString('kategorie')||'all',page:0,at:this.clock()};this.sessions.set(id,s);return this.view(s,id);
    }
    if(sub==='basispaket'||sub==='installieren'){
      const items=sub==='basispaket'?PHRASES.slice(0,5):[await this.catalog.find(i.options.getString('name',true))];
      const results=await this.install(i.guild,items,i.user.id);
      return{content:results.map(r=>`${r.sticker?'✅':'⚠️'} ${clean(r.item.name)}: ${r.error|| (r.created?'im Server-Stickermenü installiert':'bereits installiert')}`).join('\n')+'\nVorhandene Sticker werden nicht gelöscht. Alle Motive bleiben über /sticker senden als Bild nutzbar.'};
    }
    const item=await this.catalog.find(i.options.getString('name',true));
    if(sub==='senden')return this.send(i,item,i.options.getString('zweck'));
    return{content:`**${clean(item.name)}** · ${item.rarity}${item.url?` · [Quelle](${item.url})`:''}\n320 × 320 PNG. Wenn kein belegtes Bild vorliegt, zeigt das Motiv den Namen.`,files:[{attachment:await this.buffer(item),name:`${item.id}.png`}]};
  }
  async component(i){
    this.prune();const[,action,id]=i.customId.split(':'),s=this.sessions.get(id);
    if(!s||s.user!==i.user.id||s.guild!==i.guildId)throw new Error('Dieses Sticker-Menü ist abgelaufen oder gehört jemand anderem.');
    await i.deferUpdate();
    if(action==='send'){if(!s.selected)throw new Error('Wähle zuerst ein Motiv.');return i.editReply(await this.send(i,await this.catalog.find(s.selected)));}
    if(action==='pick')s.selected=(await this.catalog.find(i.values[0])).id;
    else if(action==='next'||action==='prev'){s.page+=action==='next'?1:-1;s.selected=null;}
    return i.editReply(await this.view(s,id));
  }
}
