import {PermissionFlagsBits,GatewayIntentBits} from 'discord.js';

export function mediaOnly(message){
  if((message.content||'').trim()||message.poll)return false;
  const attachments=[...(message.attachments?.values()||[])],stickers=message.stickers?.size||0;
  const image=a=>Number(a.width)>0&&Number(a.height)>0&&(
    /^image\/(?:png|jpe?g|webp|gif|avif)$/i.test(a.contentType||'')||
    !a.contentType&&/\.(?:png|jpe?g|webp|gif|avif)$/i.test(a.name||''));
  return (attachments.length>0||stickers>0)&&attachments.every(image);
}
export class TradingChannel{
  constructor(store,client,{enabled=true,clock=()=>Date.now()}={}){this.store=store;this.client=client;this.enabled=enabled;this.clock=clock;this.pending=new Set();this.notices=new Map();}
  config(guild){return this.store.cacheGet(`trading:config:${guild}`)?.value;}
  async command(i){
    if(!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild))throw new Error('Dafür benötigst du „Server verwalten“.');
    const sub=i.options.getSubcommand();
    if(sub==='aus'){this.store.db.prepare('DELETE FROM cache WHERE key=?').run(`trading:config:${i.guildId}`);return{content:'✅ Bilder-/Sticker-Regel deaktiviert. Der Kanal bleibt bestehen.'};}
    if(sub==='status'){
      const cfg=this.config(i.guildId),error=this.store.cacheGet(`trading:error:${i.guildId}`)?.value;
      return{content:cfg?`Trading-Kanal: <#${cfg.channel}>\nErlaubt: Bilder und Sticker ohne Begleittext. Gilt auch für Threads und bearbeitete Nachrichten.\n${error?`Letzter Moderationsfehler: ${error.message}`:'Keine gespeicherten Moderationsfehler.'}`:'Noch kein Bilder-/Sticker-Trading-Kanal eingerichtet.'};
    }
    if(!this.enabled||!this.client.options.intents.has(GatewayIntentBits.MessageContent))throw new Error('TRADING_MEDIA_ENABLED=true setzen und Message Content Intent im Developer Portal aktivieren.');
    const channel=i.options.getChannel('kanal',true);
    if(channel.guildId!==i.guildId)throw new Error('Der Trading-Kanal muss in diesem Server liegen.');
    const me=await i.guild.members.fetchMe(),permissions=channel.permissionsFor(me);
    for(const bit of [PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.ManageMessages,PermissionFlagsBits.ReadMessageHistory]){
      if(!permissions?.has(bit))throw new Error('Im Trading-Kanal brauche ich Kanal ansehen, Nachrichten senden, Dateien anhängen, Nachrichten verwalten und Nachrichtenverlauf anzeigen.');
    }
    this.store.cacheSet(`trading:config:${i.guildId}`,{channel:channel.id,by:i.user.id,at:this.clock()});
    this.store.db.prepare('DELETE FROM cache WHERE key=?').run(`trading:error:${i.guildId}`);
    return{content:`✅ Trading-Kanal: <#${channel.id}>. Neue Beiträge dürfen nur Bilder oder Sticker enthalten, ohne Begleittext. Text, Links, Videos und sonstige Dateien werden entfernt – auch nach Bearbeitungen und in Threads. Bestehende Nachrichten bleiben stehen.\nMit /sticker liste wählst du Trading-Motive; /sticker senden postet sie mit deinem Profil. Der Bot muss für die Regel online sein.`};
  }
  async onMessage(input){
    if(!this.enabled||!input.guildId||input.system||input.author?.id===this.client.user?.id)return false;
    const cfg=this.config(input.guildId);
    if(!cfg||!(input.channelId===cfg.channel||input.channel?.isThread?.()&&input.channel.parentId===cfg.channel))return false;
    if(this.pending.has(input.id))return true;
    this.pending.add(input.id);
    try{
      const message=input.partial?await input.fetch():input;
      if(message.author?.id===this.client.user?.id||message.system)return false;
      if(mediaOnly(message))return false;
      await message.delete();
      this.store.db.prepare('DELETE FROM cache WHERE key=?').run(`trading:error:${message.guildId}`);
      const key=`${message.guildId}:${message.author?.id}`;
      if(message.author&&!message.author.bot&&(!this.notices.has(key)||this.clock()-this.notices.get(key)>600000)){
        this.notices.set(key,this.clock());
        for(const[k,at]of this.notices)if(this.clock()-at>600000)this.notices.delete(k);
        await message.author.send({content:`Im Trading-Kanal von ${message.guild?.name||'diesem Server'} sind nur Bilder und Sticker **ohne Begleittext** erlaubt. Dein Beitrag wurde entfernt. Nutze /sticker liste oder /sticker senden für Looking for, Offering, DM me und Brainrots.`,allowedMentions:{parse:[]}}).catch(()=>{});
      }
      return true;
    }catch(e){
      if(Number(e.code)!==10008)this.store.cacheSet(`trading:error:${input.guildId}`,{message:String(e.message).slice(0,200),at:this.clock()});
      return true;
    }finally{this.pending.delete(input.id);}
  }
}
