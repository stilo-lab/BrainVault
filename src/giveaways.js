import { randomBytes, createHash, createHmac } from 'node:crypto';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { clean, clip, stamp } from './utils.js';
import { inviteStats } from './invites.js';
import { winnerCard } from './animation.js';

export function parseDuration(input){
  const match=String(input).trim().match(/^(\d+)\s*(s|m|h|d|sek|min|std|tage?)$/i);
  if(!match)throw new Error('Dauer z.B. 30s, 10m, 2h oder 3d.');
  const unit=match[2].toLowerCase(),factor=unit.startsWith('s')&&!unit.startsWith('std')?1000:unit.startsWith('m')?60000:unit==='h'||unit==='std'?3600000:86400000;
  const ms=Number(match[1])*factor;if(ms<10000||ms>30*86400000)throw new Error('Giveaways müssen 10 Sekunden bis 30 Tage laufen.');return ms;
}
export const seedCommitment=seed=>createHash('sha256').update(seed).digest('hex');
export function pickWinners(ids,count,seed,round=0,exclude=[]){
  const excluded=new Set(exclude);
  return [...new Set(ids)].filter(id=>!excluded.has(id)).map(id=>({id,key:createHmac('sha256',seed).update(`${round}\0${id}`).digest('hex')})).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:a.id<b.id?-1:1).slice(0,count).map(x=>x.id);
}
export function giveawayPayload(g,entries){
  const open=g.state==='open'&&g.ends>Date.now(),winners=g.winners?JSON.parse(g.winners):[];
  return{embeds:[{title:clip(`🎁 ${g.prize}`,256),color:open?0x9b59b6:0x57f2b0,
    description:open?`**SECRET LUCKY BLOCK GIVEAWAY**\nKlicke auf „Teilnehmen“. Zum Ende zeigt eine statische Lucky-Block-Grafik die Gewinnernamen.\n\n⏰ Ende: ${stamp(g.ends)} · ${stamp(g.ends,'R')}\n🏆 Gewinner: **${g.count}**\n🎟️ Teilnehmer: **${entries}**`:
      g.state==='cancelled'?'Dieses Giveaway wurde abgebrochen.':g.winners?`**${winners.length?'Der Secret Lucky Block wurde geöffnet!':'Keine gültigen Teilnehmer vorhanden.'}**\n${winners.map(id=>`🏆 <@${id}>`).join('\n')}`:'Der Secret Lucky Block wird geöffnet. Die Ziehung läuft ...',
    fields:[{name:'Teilnahmebedingungen',value:`${g.required_invites?`${g.required_invites} aktive gültige Invites`:'Keine Invite-Mindestzahl'}${g.required_role?`\nRolle <@&${g.required_role}>`:''}${g.min_age?`\nKontoalter mindestens ${g.min_age} Tage`:''}\nBots nehmen nicht teil.`},
      {name:'Nachweis der Ziehung',value:`Seed-Hash: \`${g.commitment}\`${g.state==='ended'?`\nSeed: \`${g.seed}\`\nRunde: ${g.round}`:''}`}],footer:{text:`ID: ${g.id} • /gw info • Auslosung wird dauerhaft gespeichert`}}],
    components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gw:join:${g.id}`).setLabel('Teilnehmen / verlassen').setEmoji('🎟️').setStyle(ButtonStyle.Primary).setDisabled(!open))],allowedMentions:{parse:[]}};
}
export class GiveawayService{
  constructor(store,client,{render=winnerCard}={}){this.store=store;this.client=client;this.render=render;this.running=false;this.locks=new Set();this.entryUpdates=new Set();}
  get(id,guild){const row=this.store.db.prepare('SELECT * FROM giveaways WHERE id=?').get(id);if(!row||guild&&row.guild!==guild)throw new Error('Giveaway auf diesem Server nicht gefunden.');return row;}
  count(id){return this.store.db.prepare('SELECT COUNT(*) AS n FROM giveaway_entries WHERE giveaway=?').get(id).n;}
  checkMember(g,member){
    if(member.user.bot)return 'Bots sind ausgeschlossen.';
    if(g.required_role&&!member.roles.cache.has(g.required_role))return 'Die erforderliche Rolle fehlt.';
    if(g.min_age&&Date.now()-member.user.createdTimestamp<g.min_age*86400_000)return 'Dein Konto erfüllt das Mindestalter nicht.';
    if(g.required_invites&&inviteStats(this.store,g.guild,member.id).valid<g.required_invites)return `Du brauchst ${g.required_invites} aktive gültige Invites.`;
    return null;
  }
  async component(i){
    await i.deferReply({flags:MessageFlags.Ephemeral});const id=i.customId.split(':')[2],g=this.get(id,i.guildId);
    if(g.state!=='open'||g.ends<=Date.now())throw new Error('Die Teilnahme an diesem Giveaway ist beendet.');
    const existing=this.store.db.prepare('SELECT 1 FROM giveaway_entries WHERE giveaway=? AND user=?').get(id,i.user.id);
    if(existing){this.store.db.prepare('DELETE FROM giveaway_entries WHERE giveaway=? AND user=?').run(id,i.user.id);this.entryUpdates.add(id);return i.editReply({content:'Du hast das Giveaway verlassen.'});}
    const member=await i.guild.members.fetch(i.user.id),problem=this.checkMember(g,member);if(problem)throw new Error(problem);
    // Nach dem Netzwerkaufruf den Ablauf erneut prüfen.
    const current=this.get(id,i.guildId);if(current.state!=='open'||current.ends<=Date.now())throw new Error('Das Giveaway ist inzwischen beendet.');
    if(this.count(id)>=2000)throw new Error('Das Teilnehmerlimit von 2000 ist erreicht.');
    this.store.db.prepare('INSERT OR IGNORE INTO giveaway_entries VALUES (?,?,?)').run(id,i.user.id,Date.now());this.entryUpdates.add(id);
    return i.editReply({content:'✅ Du nimmst teil! Bedingungen werden bei der Ziehung erneut geprüft. Mit demselben Button kannst du wieder aussteigen.'});
  }
  async eligible(g){
    const guild=await this.client.guilds.fetch(g.guild),ids=this.store.db.prepare('SELECT user FROM giveaway_entries WHERE giveaway=? ORDER BY user').all(g.id).map(x=>x.user),eligible=[];
    for(const id of ids){
      let member;
      try{member=await guild.members.fetch(id);}catch(e){if(Number(e.code)===10007)continue;throw e;}
      if(!this.checkMember(g,member))eligible.push(id);
    }
    return eligible;
  }
  async draw(id){
    if(this.locks.has(id))return;this.locks.add(id);
    try{
      let g=this.get(id);if(!['open','drawing'].includes(g.state))return;
      this.store.db.prepare("UPDATE giveaways SET state='drawing' WHERE id=? AND state='open'").run(id);g=this.get(id);
      if(g.winners===null){
        const eligible=await this.eligible(g);
        const past=this.store.db.prepare('SELECT winners FROM giveaway_draws WHERE giveaway=?').all(id).flatMap(r=>JSON.parse(r.winners));
        const winners=pickWinners(eligible,g.count,g.seed,g.round,past);
        this.store.db.exec('BEGIN IMMEDIATE');
        try{this.store.db.prepare('INSERT OR REPLACE INTO giveaway_draws VALUES (?,?,?,?,?)').run(id,g.round,JSON.stringify(eligible),JSON.stringify(winners),Date.now());this.store.db.prepare('UPDATE giveaways SET winners=?,draw_error=NULL WHERE id=?').run(JSON.stringify(winners),id);this.store.db.exec('COMMIT');}catch(e){this.store.db.exec('ROLLBACK');throw e;}
        g=this.get(id);
      }
      const guild=await this.client.guilds.fetch(g.guild),channel=await guild.channels.fetch(g.channel);if(!channel?.messages)throw new Error('Giveaway-Kanal nicht erreichbar.');
      const message=await channel.messages.fetch(g.message),winners=JSON.parse(g.winners),names=[];
      for(const user of winners){const member=await guild.members.fetch(user).catch(()=>null);names.push(member?.displayName||user);}
      const final={...g,state:'ended'},payload=giveawayPayload(final,this.count(id));
      if(names.length){
        const buffer=await this.render(names);payload.files=[new AttachmentBuilder(buffer,{name:'secret-lucky-block.png'})];payload.attachments=[];payload.embeds[0].image={url:'attachment://secret-lucky-block.png'};
      }
      await message.edit(payload);
      this.store.db.prepare("UPDATE giveaways SET state='ended',draw_error=NULL,retry_at=0,failures=0 WHERE id=?").run(id);this.entryUpdates.delete(id);
    }catch(e){
      const previous=this.store.db.prepare('SELECT failures FROM giveaways WHERE id=?').get(id)?.failures||0;
      this.store.db.prepare('UPDATE giveaways SET draw_error=?,retry_at=?,failures=failures+1 WHERE id=?').run(clip(e.message,400),Date.now()+Math.min(300000,15000*2**Math.min(previous,5)),id);throw e;
    }
    finally{this.locks.delete(id);}
  }
  async tick(){
    if(this.running)return;this.running=true;
    try{
      const due=this.store.db.prepare("SELECT id FROM giveaways WHERE (state='open' AND ends<=?) OR (state='drawing' AND retry_at<=?) ORDER BY ends LIMIT 5").all(Date.now(),Date.now());
      for(const g of due)await this.draw(g.id).catch(e=>console.warn(`Giveaway ${g.id}: ${clip(e.message,180)}`));
      for(const id of [...this.entryUpdates].slice(0,10)){
        const g=this.get(id);if(g.state!=='open'){this.entryUpdates.delete(id);continue;}
        try{const channel=await this.client.channels.fetch(g.channel),message=await channel.messages.fetch(g.message);if(this.locks.has(id)||this.get(id).state!=='open')continue;await message.edit(giveawayPayload(g,this.count(id)));this.entryUpdates.delete(id);}catch{}
      }
    }finally{this.running=false;}
  }
  async command(i){
    const sub=i.options.getSubcommand(),admin=['starten','beenden','neu','abbrechen'];
    if(admin.includes(sub)&&!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild))throw new Error('Dafür benötigst du „Server verwalten“.');
    if(sub==='starten'){
      const requiredInvites=i.options.getInteger('invites')||0;if(requiredInvites&&process.env.INVITES_ENABLED!=='true')throw new Error('Invite-Bedingungen benötigen INVITES_ENABLED=true und eingerichtetes Invite-Tracking.');
      const active=this.store.db.prepare("SELECT COUNT(*) AS n FROM giveaways WHERE guild=? AND state IN ('open','drawing')").get(i.guildId).n;if(active>=20)throw new Error('Maximal 20 gleichzeitig laufende Giveaways pro Server.');
      const channel=i.options.getChannel('kanal')||i.channel;if(!channel.isTextBased()||!('send' in channel))throw new Error('Bitte einen Textkanal wählen.');
      const me=await i.guild.members.fetchMe(),permissions=channel.permissionsFor(me);for(const bit of [PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.ReadMessageHistory])if(!permissions?.has(bit))throw new Error('Im Giveaway-Kanal brauche ich Sende-, Einbettungs-, Datei- und Nachrichtenverlauf-Rechte.');
      const prize=clean(i.options.getString('preis',true));if(!prize)throw new Error('Bitte einen lesbaren Preisnamen angeben.');
      const id=randomBytes(5).toString('hex'),seed=randomBytes(32).toString('hex'),g={id,guild:i.guildId,channel:channel.id,prize,ends:Date.now()+parseDuration(i.options.getString('dauer',true)),count:i.options.getInteger('gewinner')||1,host:i.user.id,state:'open',seed,commitment:seedCommitment(seed),winners:null,round:0,required_invites:requiredInvites,required_role:i.options.getRole('rolle')?.id||null,min_age:i.options.getInteger('mindestalter')||0};
      this.store.db.prepare('INSERT INTO giveaways(id,guild,channel,prize,ends,count,host,state,seed,commitment,required_invites,required_role,min_age) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(g.id,g.guild,g.channel,g.prize,g.ends,g.count,g.host,g.state,g.seed,g.commitment,g.required_invites,g.required_role,g.min_age);
      try{const message=await channel.send(giveawayPayload(g,0));this.store.db.prepare('UPDATE giveaways SET message=? WHERE id=?').run(message.id,id);return{content:`✅ [Giveaway öffnen](${message.url}) · ID \`${id}\`. Zum Ende erscheint die Secret-Lucky-Block-Gewinnergrafik.`};}
      catch(e){this.store.db.prepare('DELETE FROM giveaways WHERE id=?').run(id);throw e;}
    }
    if(sub==='liste'){
      const rows=this.store.db.prepare('SELECT id,prize,ends,state FROM giveaways WHERE guild=? ORDER BY ends DESC LIMIT 15').all(i.guildId);
      return{content:rows.length?clip(rows.map(g=>`\`${g.id}\` · **${clip(clean(g.prize),80)}** · ${stamp(g.ends,'R')} · ${g.state}`).join('\n'),1900):'Noch keine Giveaways auf diesem Server.'};
    }
    const g=this.get(i.options.getString('id',true),i.guildId);
    if(sub==='abbrechen'){
      if(this.locks.has(g.id)||!['open','drawing'].includes(g.state))throw new Error('Ein abgeschlossenes Giveaway oder eine gerade laufende Ziehung kann nicht abgebrochen werden.');
      this.store.db.prepare("UPDATE giveaways SET state='cancelled' WHERE id=?").run(g.id);
      let messageUpdated=true;
      try{const channel=await i.guild.channels.fetch(g.channel);await(await channel.messages.fetch(g.message)).edit(giveawayPayload(this.get(g.id),this.count(g.id)));}catch{messageUpdated=false;}
      return{content:`✅ Giveaway abgebrochen. Es erfolgen keine weiteren Ziehungs- oder Zustellversuche.${messageUpdated?'':' Die ursprüngliche Discord-Nachricht konnte nicht mehr aktualisiert werden.'}`};
    }
    if(sub==='beenden'){if(!['open','drawing'].includes(g.state))throw new Error('Das Giveaway ist bereits abgeschlossen.');this.store.db.prepare('UPDATE giveaways SET ends=?,retry_at=0 WHERE id=?').run(Date.now(),g.id);await this.draw(g.id);return{content:'✅ Giveaway beendet. Die Gewinnergrafik steht in der Giveaway-Nachricht.'};}
    if(sub==='neu'){
      if(g.state!=='ended'||this.locks.has(g.id))throw new Error('Nur beendete Giveaways können neu ausgelost werden.');
      this.store.db.prepare("UPDATE giveaways SET state='drawing',winners=NULL,round=round+1 WHERE id=?").run(g.id);await this.draw(g.id);return{content:'✅ Neu ausgelost. Frühere Gewinner dieser Verlosung wurden ausgeschlossen.'};
    }
    const draws=this.store.db.prepare('SELECT * FROM giveaway_draws WHERE giveaway=? ORDER BY round').all(g.id);
    if(sub==='pruefen'){
      if(g.state!=='ended')throw new Error('Der Seed wird nach der abgeschlossenen Ziehung offengelegt.');
      let past=[];const valid=draws.every(d=>{const expected=pickWinners(JSON.parse(d.eligible),g.count,g.seed,d.round,past),actual=JSON.parse(d.winners);past.push(...actual);return JSON.stringify(expected)===JSON.stringify(actual);});
      return{content:`${valid&&seedCommitment(g.seed)===g.commitment?'✅':'⚠️'} Seed-Hash und gespeicherte Ziehungen ${valid?'stimmen überein':'abweichend'}.\nSeed: \`${g.seed}\`\nHash: \`${g.commitment}\`\nRunden: ${draws.length}\nAuswahl: HMAC-SHA256(seed, Runde + NUL + Nutzer-ID), aufsteigend sortiert. Verwendet werden die zur Ziehung gültigen Teilnehmer.`};
    }
    return{...giveawayPayload(g,this.count(g.id)),content:g.draw_error?`⚠️ Letzter Zustellfehler: ${clean(g.draw_error)}. Die gespeicherte Ziehung wird erneut zugestellt.`:undefined,components:[]};
  }
}
