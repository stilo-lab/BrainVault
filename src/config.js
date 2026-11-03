import { resolve,join } from 'node:path';

export const TOPICS = {
  admin: { name: 'Admin Abuse', emoji: '⚡', color: 0xf5b041 },
  taco: { name: 'Taco Tuesday', emoji: '🌮', color: 0xf5b041 },
  dig: { name: 'Schaufel / Dig / Grave Hunt', emoji: '⛏️', color: 0x9b59b6 },
  update: { name: 'Updates', emoji: '🆕', color: 0x5865f2 },
  other: { name: 'Andere Events', emoji: '🎉', color: 0x2ecc71 }
};
export const LEADS = [0, 5, 15, 30, 60];
export const GAME_URL = 'https://www.roblox.com/games/109983668079237/Steal-a-Brainrot';
export const OFFICIAL_DISCORD = 'https://discord.com/servers/steal-a-brainrot-1376018788041887795';
export const WIKI = 'https://stealabrainrot.wiki';
export const UNIVERSE = '7709344486';
export const config = {
  token: process.env.DISCORD_TOKEN?.trim(),
  clientId: process.env.CLIENT_ID?.trim(),
  guildId: process.env.GUILD_ID?.trim(),
  dbPath: resolve(process.env.DB_PATH || join(process.env.RAILWAY_VOLUME_MOUNT_PATH || 'data','sab.sqlite')),
  syncMs: 15 * 60_000,
  tickMs: 15_000
};
export function requireCredentials() {
  if (!config.token) {
    throw new Error('Bitte DISCORD_TOKEN als Railway-Variable oder lokal in .env eintragen.');
  }
  if(config.clientId&&!/^\d{17,22}$/.test(config.clientId))throw new Error('CLIENT_ID ist keine Application-ID. Leer lassen für automatische Erkennung.');
  if (config.guildId && !/^\d{17,22}$/.test(config.guildId)) throw new Error('GUILD_ID ist keine Discord-ID.');
}
export function requireRailwayVolume(env=process.env){
  if(env.RAILWAY_ENVIRONMENT_ID&&!env.RAILWAY_VOLUME_MOUNT_PATH)throw new Error('Railway: Bitte beim Bot-Service ein Volume mit Mount Path /app/data hinzufügen und erneut deployen. Darin bleiben Tageslimits und Giveaways erhalten.');
}
