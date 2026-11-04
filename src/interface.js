import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } from 'discord.js';
import { TOPICS } from './config.js';
import { clip, clean, stamp } from './utils.js';

const button=(id,label,emoji,style=ButtonStyle.Secondary)=>new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style);
export function homeView(store,guild) {
  const settings=store.getGuild(guild);const upcoming=store.events(guild).slice(0,2);const catalog=store.cacheGet(`trade:catalog:${guild}`)?.value;
  return {embeds:[{title:'🧠 SAB Hub 4.1',color:0x5865f2,
    description:'**Deine Zentrale für Steal a Brainrot.**\nFragen stellen, Trades prüfen und die nächsten Events im Blick behalten.',
    fields:[{name:'📅 Nächste Termine',value:upcoming.map(e=>`**${clean(e.title)}** · ${stamp(e.start,'R')}`).join('\n')||'Noch keine bestätigten Termine. Ein Admin kann einen Ingame-Timer kalibrieren.'},
      {name:'🔔 Deine Benachrichtigungen',value:settings?`Event-Kanal: <#${settings.channel}>\nRollen und DMs lassen sich getrennt abonnieren.`:'DM-Abos sind verfügbar. Server-Rollen nach /setup.'},
      {name:'⚖️ Value und W/L',value:`/value für deinen Brainrot, /wl für einen Trade. Eine gemeinsame Anfrage pro Tag, Unlimited für Mitglieder der Community.\n${catalog?`${catalog.items.length} Server-Varianten hinterlegt.`:'SABTradingValues ist die Standardquelle.'}`}],
    footer:{text:'Quellenstand sichtbar • W/L aus deiner Sicht • /hilfe für alle Befehle'}}],
    components:[new ActionRowBuilder().addComponents(button('hub:ask','SAB-Frage','🧠',ButtonStyle.Primary),button('hub:events','Events','📅'),button('hub:dig','Dig-Timer','⛏️')),
      new ActionRowBuilder().addComponents(button('hub:trade','Trade eingeben','⚖️'),button('prefs:open','Meine Pings','🔔'),button('hub:market','Wertequelle','📊'),button('hub:limit','Mein Limit / Unlimited','💎'))],allowedMentions:{parse:[]}};
}
export function eventControls(topic,page,pages) {
  return [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('eventview:filter').setPlaceholder('Event-Thema auswählen').addOptions(
    {label:'Alle Events',value:'all',default:!topic},...Object.entries(TOPICS).map(([value,t])=>({label:t.name,value,emoji:t.emoji,default:topic===value})))),
    new ActionRowBuilder().addComponents(
      button(`eventview:page:${topic||'all'}:${Math.max(0,page-1)}`,'Zurück','◀️').setDisabled(page===0),
      button(`eventview:page:${topic||'all'}:${page}`,'Aktualisieren','🔄'),
      button(`eventview:page:${topic||'all'}:${page+1}`,'Weiter','▶️').setDisabled(page>=pages-1),button('prefs:open','Abonnieren','🔔'))];
}
export function questionModal() {
  return new ModalBuilder().setCustomId('hub:question').setTitle('Frag den SAB-Assistenten').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('question').setLabel('Was möchtest du über SAB wissen?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(3).setMaxLength(300).setPlaceholder('Wie bekomme ich Spooketti Tualetti?')));
}
export class EventBoards {
  constructor(store,client,render){this.store=store;this.client=client;this.render=render;this.running=false;}
  async create(guild,channel) {
    if(channel.guildId!==guild)throw new Error('Das Event-Board muss im eigenen Server stehen.');
    const me=await channel.guild.members.fetchMe(),permissions=channel.permissionsFor(me);
    for(const bit of [PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.ReadMessageHistory])if(!permissions?.has(bit))throw new Error('Für das Live-Board benötige ich Kanal ansehen, Nachrichten senden, Links einbetten und Nachrichtenverlauf anzeigen.');
    const payload=await this.render(this.store,guild);const message=await channel.send({...payload,content:'📌 **SAB Live-Board** · aktualisiert sich automatisch',allowedMentions:{parse:[]}});
    this.store.cacheSet(`board:${guild}`,{channel:channel.id,message:message.id});return message;
  }
  async tick() {
    if(this.running)return;this.running=true;
    try {
      for(const row of this.store.db.prepare("SELECT key,value FROM cache WHERE key LIKE 'board:%' AND key NOT LIKE 'board:error:%'").all()) {
        const guild=row.key.slice(6),board=JSON.parse(row.value);
        try {
          if(!this.client.guilds.cache.has(guild))continue;
          const channel=await this.client.channels.fetch(board.channel);
          if(channel?.guildId!==guild||!channel.messages)throw Object.assign(new Error('Board-Kanal fehlt'),{code:10003});
          const message=await channel.messages.fetch(board.message);
          if(message.author.id!==this.client.user.id)throw Object.assign(new Error('Board-Nachricht gehört nicht dem Bot'),{code:10008});
          await message.edit({...await this.render(this.store,guild),content:'📌 **SAB Live-Board** · aktualisiert sich automatisch',allowedMentions:{parse:[]}});
          this.store.db.prepare('DELETE FROM cache WHERE key=?').run(`board:error:${guild}`);
        }catch(e){
          this.store.cacheSet(`board:error:${guild}`,{message:clip(e.message,200),at:Date.now()});
          if([10003,10008].includes(Number(e.code)))this.store.db.prepare('DELETE FROM cache WHERE key=?').run(row.key);
        }
      }
    }finally{this.running=false;}
  }
}
