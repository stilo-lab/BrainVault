import { clean } from './utils.js';

export function parseAsk(text,botId){
  const input=String(text||'').trim();
  const prefix=input.match(/^(?:7ask|!ask)(?:\s+|$)([\s\S]*)/i);
  if(prefix)return{explicit:true,question:prefix[1].trim()};
  if(botId){
    const mention=input.match(new RegExp(`^<@!?${botId}>(?:\\s+|$)([\\s\\S]*)`));
    if(mention)return{explicit:true,question:mention[1].trim()};
  }
  return null;
}
export class TextCommands {
  constructor(store,assistant,eventAnswer,{enabled=true,chatEnabled=false}={}){this.store=store;this.assistant=assistant;this.eventAnswer=eventAnswer;this.enabled=enabled;this.chatEnabled=chatEnabled;this.active=new Set();this.last=new Map();}
  async onMessage(message){
    if(message.author.bot||message.webhookId||!message.guildId||!message.content)return false;
    const parsed=this.enabled?parseAsk(message.content,message.client?.user?.id):null;
    const freeChat=this.chatEnabled&&this.store.cacheGet(`chat:channel:${message.guildId}`)?.value===message.channelId;
    if(!parsed&&!freeChat)return false;
    if(!parsed&&message.attachments?.size)return false;
    const question=(parsed?.question||(!parsed&&freeChat?message.content:'')).trim();
    if(!question){await message.reply({content:'🧠 Schreibe zum Beispiel: `7ask Wie funktioniert das Dig-Event?`\nAuch `/ask` und `!ask deine Frage` funktionieren.',allowedMentions:{parse:[],repliedUser:false}});return true;}
    if(question.length>300){await message.reply({content:'Bitte formuliere deine SAB-Frage in höchstens 300 Zeichen.',allowedMentions:{parse:[],repliedUser:false}});return true;}
    if(this.active.has(message.author.id)||Date.now()-(this.last.get(message.author.id)||0)<5000)return true;
    this.active.add(message.author.id);this.last.set(message.author.id,Date.now());
    if(this.last.size>5000)for(const[id,at]of this.last)if(Date.now()-at>60_000)this.last.delete(id);
    try{
      await message.channel.sendTyping().catch(()=>{});
      const payload=await this.eventAnswer(question,message.guildId)||await this.assistant.answer(question,message.author.id,message.guildId);
      await message.reply({...payload,allowedMentions:{parse:[],repliedUser:false}});
    }catch(e){await message.reply({content:`⚠️ ${clean(e.message).slice(0,250)}`,allowedMentions:{parse:[],repliedUser:false}}).catch(()=>{});}
    finally{this.active.delete(message.author.id);}
    return true;
  }
}
