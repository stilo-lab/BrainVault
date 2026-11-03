import {createHash} from 'node:crypto';
import {REST,Routes,PermissionsBitField,PermissionFlagsBits} from 'discord.js';
import {commands} from './commands.js';

export function inviteUrl(clientId){
  const permissions=new PermissionsBitField([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.SendMessagesInThreads,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.ManageRoles,PermissionFlagsBits.MentionEveryone,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.ManageGuild,PermissionFlagsBits.ManageMessages,PermissionFlagsBits.CreateGuildExpressions]);
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=${permissions.bitfield}`;
}
export async function registerCommands({token,clientId,guildId,store,force=false,rest=new REST({version:'10'}).setToken(token)}){
  if(!clientId)clientId=(await rest.get(Routes.oauth2CurrentApplication())).id;
  const route=guildId?Routes.applicationGuildCommands(clientId,guildId):Routes.applicationCommands(clientId),key=`commands:${clientId}:${guildId||'global'}`;
  const hash=createHash('sha256').update(JSON.stringify(commands)).digest('hex');let updated=false;
  if(force||store?.cacheGet(key)?.value!==hash){
    try{await rest.put(route,{body:commands});}catch(e){e.inviteUrl=inviteUrl(clientId);throw e;}
    store?.cacheSet(key,hash);updated=true;
  }
  return{clientId,updated,count:commands.length,url:inviteUrl(clientId)};
}
