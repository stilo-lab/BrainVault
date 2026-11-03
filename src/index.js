import {acquireLock} from './process-lock.js';
import {registerCommands,inviteUrl} from './registration.js';
import {ValuationAccess} from './access.js';
import {ValueService} from './value.js';
import {StickerCatalog} from './sticker-catalog.js';
import {StickerService} from './stickers.js';
import {TradingChannel} from './trading-channel.js';
import { Client, Events, GatewayIntentBits, ActivityType } from 'discord.js';
import { setTimeout as delay } from 'node:timers/promises';
import { config, requireCredentials,requireRailwayVolume } from './config.js';
import { Store } from './store.js';
import { Knowledge, RobloxSource } from './sources.js';
import { Scheduler } from './scheduler.js';
import { createHandlers, eventsView, eventQuestion } from './handlers.js';
import { ValueSource, TradeService } from './trade.js';
import { SabAssistant } from './assistant.js';
import { TextCommands } from './text-commands.js';
import { EventBoards } from './interface.js';
import { InviteService } from './invites.js';
import { GiveawayService } from './giveaways.js';
import { errorText } from './utils.js';

try { requireCredentials();requireRailwayVolume(); } catch(e) { console.error(e.message);process.exit(1); }
let releaseLock;
try{releaseLock=acquireLock(config.dbPath);}catch(e){console.error(e.message);process.exit(1);}
const store=new Store(config.dbPath);
const auto=process.env.WFL_AUTO_REPLY!=='false';
const textEnabled=process.env.TEXT_COMMANDS!=='false',chatEnabled=process.env.CHAT_AUTO_REPLY==='true';
const invitesEnabled=process.env.INVITES_ENABLED!=='false';
const tradingEnabled=process.env.TRADING_MEDIA_ENABLED!=='false';
const intents=[GatewayIntentBits.Guilds];
if(auto||textEnabled||chatEnabled||tradingEnabled)intents.push(GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent);
if(invitesEnabled)intents.push(GatewayIntentBits.GuildMembers,GatewayIntentBits.GuildInvites);
const client=new Client({intents,allowedMentions:{parse:[]},presence:{activities:[{name:'7ask · /start · SAB 4.0',type:ActivityType.Watching}]}});
const access=new ValuationAccess(store,client);access.recover();
const knowledge=new Knowledge(store),roblox=new RobloxSource(store),values=new ValueSource(store),trades=new TradeService(store,values,undefined,access);
const valueService=new ValueService(store,values,trades,access);
const stickerCatalog=new StickerCatalog(store),stickers=new StickerService(store,stickerCatalog),trading=new TradingChannel(store,client,{enabled:tradingEnabled});
const assistant=new SabAssistant(store,knowledge),boards=new EventBoards(store,client,eventsView);
const invites=new InviteService(store,client),giveaways=new GiveawayService(store,client);
const textCommands=new TextCommands(store,assistant,(query,guild)=>eventQuestion(store,query,guild),{enabled:textEnabled,chatEnabled});
const scheduler=new Scheduler(store,async(job,payload)=>{
  if(!client.guilds.cache.has(job.guild)) {const err=new Error('Server nicht mehr erreichbar');err.code=50001;throw err;}
  if(job.kind==='channel') {
    const channel=await client.channels.fetch(job.target);
    if(!channel?.isTextBased()||!('send' in channel)||channel.guildId!==job.guild) {const err=new Error('Event-Kanal nicht erreichbar');err.code=10003;throw err;}
    return channel.send(payload);
  }
  // Mitgliedschaft prüfen, damit frühere Servermitglieder keine Event-DMs erhalten.
  await client.guilds.cache.get(job.guild).members.fetch(job.target);
  return (await client.users.fetch(job.target)).send(payload);
});
client.on(Events.InteractionCreate,createHandlers({store,knowledge,roblox,client,scheduler,trades,assistant,boards,invites,giveaways,valueService,access,trading,stickers}));
client.on(Events.GuildDelete,guild=>store.deleteGuild(guild.id));
if(invitesEnabled){
  client.on(Events.GuildMemberAdd,member=>void invites.joined(member).catch(e=>console.warn(`Invite-Zuordnung: ${errorText(e)}`)));
  client.on(Events.GuildMemberRemove,member=>invites.left(member));
  client.on(Events.InviteCreate,invite=>invites.onCreate(invite));
  client.on(Events.GuildCreate,guild=>void invites.baseline(guild));
}
if(auto||textEnabled||chatEnabled||tradingEnabled)client.on(Events.MessageCreate,async message=>{
  try{if(await trading.onMessage(message))return;if(auto)await trades.onMessage(message);if(textEnabled||chatEnabled)await textCommands.onMessage(message);}
  catch(e){console.warn(`Chat-Nachricht: ${errorText(e)}`);}
});
if(tradingEnabled)client.on(Events.MessageUpdate,(_old,message)=>void trading.onMessage(message).catch(e=>console.warn(`Trading-Regel: ${errorText(e)}`)));
client.on(Events.Error,e=>console.error(`Discord: ${errorText(e)}`));
let tickTimer,syncTimer,boardTimer,giveawayTimer,stopping=false;
const sync=()=>roblox.sync().catch(e=>console.warn(`Event-Quelle: ${errorText(e)}`));
const tick=()=>scheduler.tick().catch(e=>console.error(`Scheduler: ${errorText(e)}`));
client.once(Events.ClientReady,async c=>{
  console.log(`Bot einladen: ${inviteUrl(config.clientId||c.application.id)}`);
  if(process.env.AUTO_DEPLOY_COMMANDS!=='false'){try{const result=await registerCommands({token:config.token,clientId:config.clientId||c.application.id,guildId:config.guildId,store});console.log(`${result.count} Befehle ${result.updated?'registriert':'bereits aktuell'}. Bot einladen: ${result.url}`);}catch(e){console.warn(`Befehlsregistrierung: ${errorText(e)}`);}}
  if(process.env.RAILWAY_ENVIRONMENT_ID&&!process.env.RAILWAY_VOLUME_MOUNT_PATH&&!process.env.DB_PATH)console.warn('Railway: Bitte ein Volume unter /app/data hinzufügen, damit Tageslimits und Giveaways Neustarts überstehen.');
  console.log(`SAB-Bot 4.0 als ${c.user.tag} verbunden. ${c.guilds.cache.size} Server. 7ask: ${textEnabled?'aktiv':'aus'}. W/L-Bildfragen: ${auto?'aktiv':'Slash-Modus'}.`);
  for(const g of store.guilds())if(!c.guilds.cache.has(g.id))store.deleteGuild(g.id);
  tickTimer=setInterval(tick,config.tickMs);syncTimer=setInterval(sync,config.syncMs);
  boardTimer=setInterval(()=>void boards.tick().catch(e=>console.warn(`Event-Board: ${errorText(e)}`)),60_000);
  giveawayTimer=setInterval(()=>void giveaways.tick().catch(e=>console.warn(`Giveaway: ${errorText(e)}`)),5000);
  void sync();void tick();void boards.tick();void giveaways.tick();
  if(invitesEnabled)for(const guild of c.guilds.cache.values())void invites.baseline(guild);
  void knowledge.index().catch(e=>console.warn(`Wiki-Index: ${errorText(e)}`));
  void values.live().catch(e=>console.warn(`Handelswerte: ${errorText(e)}`));
});
async function shutdown(code=0) {
  if(stopping)return;stopping=true;
  clearInterval(tickTimer);clearInterval(syncTimer);clearInterval(boardTimer);clearInterval(giveawayTimer);
  while(scheduler.running||roblox.running||trades.inFlight||boards.running||giveaways.running||giveaways.locks.size||invites.queues.size||textCommands.active.size||trading.pending.size||stickers.active.size||stickers.locks.size)await delay(100);
  await client.destroy();
  // Andere laufende Interaktionen können beim Prozessende abgebrochen werden.
  store.close();
  releaseLock();
  process.exit(code);
}
process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown());
process.on('unhandledRejection',e=>{console.error(`Unerwarteter Fehler: ${errorText(e)}`);void shutdown(1);});
client.login(config.token).catch(e=>{console.error(`Anmeldung fehlgeschlagen: ${errorText(e)}`);void shutdown(1);});
