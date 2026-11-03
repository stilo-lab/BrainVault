import { PermissionFlagsBits } from 'discord.js';
import { clean, clip } from './utils.js';

const dangerous=[PermissionFlagsBits.Administrator,PermissionFlagsBits.ManageGuild,PermissionFlagsBits.ManageRoles,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ManageWebhooks,PermissionFlagsBits.KickMembers,PermissionFlagsBits.BanMembers,PermissionFlagsBits.ModerateMembers,PermissionFlagsBits.ManageMessages,PermissionFlagsBits.MentionEveryone];
export function attributableInvite(previous,current){
  if(!previous)return null;
  const changes=[...current.values()].map(i=>({invite:i,delta:(i.uses||0)-(previous.get(i.code)?.uses||0)})).filter(x=>x.delta>0);
  return changes.length===1&&changes[0].delta===1?changes[0].invite:null;
}
export function inviteStats(store,guild,user){
  const rows=store.db.prepare('SELECT active,eligible FROM invite_members WHERE guild=? AND inviter=?').all(guild,user);
  return{valid:rows.filter(x=>x.active&&x.eligible).length,left:rows.filter(x=>!x.active&&x.eligible).length,invalid:rows.filter(x=>!x.eligible).length,total:rows.length};
}
export function safeRewardRole(role,me){return !!role&&!role.managed&&role.id!==me.guild.id&&role.position<me.roles.highest.position&&!role.permissions.any(dangerous);}
export class InviteService{
  constructor(store,client){this.store=store;this.client=client;this.snapshots=new Map();this.queues=new Map();}
  async baseline(guild){
    try{const invites=await guild.invites.fetch();this.snapshots.set(guild.id,new Map([...invites.values()].map(i=>[i.code,{code:i.code,uses:i.uses||0,inviter:i.inviter}])));}
    catch(e){this.snapshots.delete(guild.id);this.store.cacheSet(`invites:error:${guild.id}`,{message:clip(e.message,200),at:Date.now()});}
  }
  onCreate(invite){const map=this.snapshots.get(invite.guild?.id);if(map&&!map.has(invite.code))map.set(invite.code,{code:invite.code,uses:invite.uses||0,inviter:invite.inviter});}
  joined(member){
    const before=this.queues.get(member.guild.id)||Promise.resolve();
    const next=before.catch(()=>{}).then(()=>this.recordJoin(member));this.queues.set(member.guild.id,next);
    void next.finally(()=>{if(this.queues.get(member.guild.id)===next)this.queues.delete(member.guild.id);}).catch(()=>{});return next;
  }
  async recordJoin(member){
    if(member.user.bot)return;
    let inviter=null,reason='Nicht eindeutig zuordenbar',eligible=0;
    const previous=this.snapshots.get(member.guild.id);let current;
    try{current=await member.guild.invites.fetch();}catch(e){reason='Invite-Liste nicht lesbar';}
    if(current){
      const used=attributableInvite(previous,current);inviter=used?.inviter?.bot?null:used?.inviter?.id||null;
      this.snapshots.set(member.guild.id,new Map([...current.values()].map(i=>[i.code,{code:i.code,uses:i.uses||0,inviter:i.inviter}])));
    }
    const existing=this.store.db.prepare('SELECT inviter FROM invite_members WHERE guild=? AND member=?').get(member.guild.id,member.id);
    // Ein bekanntes Mitglied bleibt bei Wiederkehr seinem ursprünglichen Werber zugeordnet.
    if(existing?.inviter)inviter=existing.inviter;
    const config=this.store.cacheGet(`invites:config:${member.guild.id}`)?.value||{minAge:7};
    const age=Date.now()-member.user.createdTimestamp;
    if(inviter===member.id){reason='Selbsteinladung';inviter=null;}
    else if(inviter&&age<config.minAge*86400_000)reason=`Konto jünger als ${config.minAge} Tage`;
    else if(inviter){eligible=1;reason='Invite-Zuwachs eindeutig beobachtet';}
    this.store.db.prepare('INSERT INTO invite_members VALUES (?,?,?,?,?,?,?) ON CONFLICT(guild,member) DO UPDATE SET inviter=excluded.inviter,joined=excluded.joined,active=1,eligible=excluded.eligible,reason=excluded.reason').run(member.guild.id,member.id,inviter,Date.now(),1,eligible,reason);
    if(eligible)await this.grant(member.guild,inviter).catch(e=>this.store.cacheSet(`invites:error:${member.guild.id}`,{message:clip(e.message,200),at:Date.now()}));
    if(config.channel){
      const channel=await member.guild.channels.fetch(config.channel).catch(()=>null);
      if(channel?.isTextBased())await channel.send({content:`📨 ${clean(member.user.username)} ist beigetreten. ${inviter?`Werber: <@${inviter}>`:'Werber unbekannt'} · ${reason}${eligible?` · aktive gültige Invites: ${inviteStats(this.store,member.guild.id,inviter).valid}`:''}`,allowedMentions:{parse:[]}}).catch(()=>{});
    }
  }
  left(member){this.store.db.prepare('UPDATE invite_members SET active=0 WHERE guild=? AND member=?').run(member.guild.id,member.id);}
  async grant(guild,user){
    const count=inviteStats(this.store,guild.id,user).valid;
    const rewards=this.store.db.prepare('SELECT * FROM invite_rewards WHERE guild=? AND threshold<=?').all(guild.id,count);if(!rewards.length)return 0;
    const me=await guild.members.fetchMe(),member=await guild.members.fetch(user);let granted=0;
    for(const reward of rewards){
      if(this.store.db.prepare('SELECT 1 FROM invite_claims WHERE guild=? AND user=? AND threshold=? AND role=?').get(guild.id,user,reward.threshold,reward.role))continue;
      const role=await guild.roles.fetch(reward.role);if(!safeRewardRole(role,me))throw new Error('Eine Reward-Rolle fehlt, liegt zu hoch oder hat Verwaltungsrechte.');
      await member.roles.add(role,'Erreichte SAB Invite-Belohnung');
      this.store.db.prepare('INSERT OR IGNORE INTO invite_claims VALUES (?,?,?,?,?)').run(guild.id,user,reward.threshold,reward.role,Date.now());granted++;
    }
    return granted;
  }
  async command(i){
    const sub=i.options.getSubcommand();
    if(['einrichten','reward_add','reward_remove'].includes(sub)&&!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild))throw new Error('Dafür benötigst du „Server verwalten“.');
    if(sub==='einrichten'){
      const channel=i.options.getChannel('logkanal');const minAge=i.options.getInteger('mindestalter')??7;
      this.store.cacheSet(`invites:config:${i.guildId}`,{channel:channel?.id||null,minAge});await this.baseline(i.guild);
      return{content:`✅ Invite-System eingerichtet. Mindest-Kontoalter: ${minAge} Tage. ${this.snapshots.has(i.guildId)?'Invite-Liste lesbar.':'Mir fehlt Zugriff auf die Invite-Liste; prüfe „Server verwalten“.'}\nINVITES_ENABLED=true und Server Members Intent im Developer Portal sind erforderlich. Bereits vergangene Einladungen können nicht rückwirkend zugeordnet werden.`};
    }
    if(sub==='reward_add'){
      const role=i.options.getRole('rolle',true),me=await i.guild.members.fetchMe();if(!safeRewardRole(role,me))throw new Error('Reward-Rollen müssen unter meiner Rolle liegen und dürfen keine Verwaltungsrechte haben.');
      this.store.db.prepare('INSERT OR IGNORE INTO invite_rewards VALUES (?,?,?)').run(i.guildId,i.options.getInteger('anzahl',true),role.id);
      return{content:'✅ Invite-Belohnung gespeichert. Erreichte Rollen werden beim nächsten gültigen Beitritt oder mit /invites claim zugeteilt.'};
    }
    if(sub==='reward_remove'){this.store.db.prepare('DELETE FROM invite_rewards WHERE guild=? AND threshold=? AND role=?').run(i.guildId,i.options.getInteger('anzahl',true),i.options.getRole('rolle',true).id);return{content:'✅ Reward-Regel entfernt. Bereits verdiente Rollen bleiben erhalten.'};}
    if(sub==='claim')return{content:`✅ ${await this.grant(i.guild,i.user.id)} neue Reward-Rollen zugeteilt.`};
    if(sub==='rewards'){
      const rewards=this.store.db.prepare('SELECT * FROM invite_rewards WHERE guild=? ORDER BY threshold LIMIT 25').all(i.guildId);
      return{content:rewards.length?rewards.map(r=>`**${r.threshold}** aktive gültige Invites → <@&${r.role}>`).join('\n'):'Noch keine Invite-Rewards. Ein Admin kann mit /invites reward_add Rollen festlegen.',allowedMentions:{parse:[]}};
    }
    if(sub==='top'){
      const top=this.store.db.prepare('SELECT inviter,COUNT(*) AS n FROM invite_members WHERE guild=? AND eligible=1 AND active=1 AND inviter IS NOT NULL GROUP BY inviter ORDER BY n DESC,inviter LIMIT 10').all(i.guildId);
      return{content:top.length?'🏆 **Invite-Rangliste**\n'+top.map((r,n)=>`${n+1}. <@${r.inviter}> · **${r.n}**`).join('\n'):'Noch keine eindeutig zugeordneten gültigen Einladungen.',allowedMentions:{parse:[]}};
    }
    const user=i.options.getUser('nutzer')||i.user,stats=inviteStats(this.store,i.guildId,user.id);
    return{embeds:[{title:`📨 Invites · ${clean(user.username)}`,color:0x9b59b6,description:`**${stats.valid}** aktive gültige Invites\n**${stats.left}** eingeladene Mitglieder wieder ausgetreten\n**${stats.invalid}** nicht für Rewards gewertete Zuordnungen\n\nUnklare Links, Vanity-Links und Beitritte während Ausfällen können unzugeordnet bleiben. Wiederbeitritte werden nicht mehrfach gezählt. Verdiente Rollen bleiben nach späteren Austritten bestehen.`}]};
  }
}
