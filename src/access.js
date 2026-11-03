import {createHash,randomUUID} from 'node:crypto';
import {DateTime} from 'luxon';
import {ActionRowBuilder,ButtonBuilder,ButtonStyle} from 'discord.js';

export const COMMUNITY_ID='1562906673549541427';
export const COMMUNITY_INVITE='https://discord.gg/Z3fq8Uu2cU';
export function dayWindow(now=Date.now()){
  const local=DateTime.fromMillis(now,{zone:'Europe/Berlin'});
  return{day:local.toISODate(),reset:local.startOf('day').plus({days:1}).toMillis()};
}
const userHash=user=>createHash('sha256').update(String(user)).digest('hex');
export const joinControls=()=>[new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Unlimited freischalten · Server beitreten').setStyle(ButtonStyle.Link).setURL(COMMUNITY_INVITE),new ButtonBuilder().setCustomId('access:refresh').setLabel('Mitgliedschaft prüfen').setStyle(ButtonStyle.Secondary))];
export class QuotaError extends Error{
  constructor(reset,reason='') {super(`Deine kostenlose W/L- oder Value-Anfrage für heute ist bereits verbraucht. Neues Tageskontingent um <t:${Math.floor(reset/1000)}:t> (Europe/Berlin). Für unbegrenzte Anfragen tritt ${COMMUNITY_INVITE} bei.${reason?` ${reason}`:''}`);this.name='QuotaError';this.reset=reset;}
}
export class ValuationAccess{
  constructor(store,client,{membership,clock=()=>Date.now()}={}){this.store=store;this.client=client;this.clock=clock;this.checkMembership=membership||this.membership.bind(this);}
  async membership(user){
    const guild=this.client?.guilds?.cache?.get(COMMUNITY_ID);
    if(!guild)return{unlimited:false,reason:'Der Bot muss ebenfalls im Freischalt-Server installiert sein, um Mitgliedschaften zu prüfen.'};
    try{await guild.members.fetch({user,force:true,cache:false});return{unlimited:true};}
    catch(e){return Number(e.code)===10007?{unlimited:false}:{unlimited:false,reason:'Die Mitgliedschaft konnte gerade nicht verlässlich geprüft werden. Bitte später erneut prüfen.'};}
  }
  prune(){this.store.db.prepare('DELETE FROM valuation_usage WHERE created<?').run(this.clock()-3*86400_000);}
  async status(user){
    this.prune();const window=dayWindow(this.clock()),membership=await this.checkMembership(user);
    const used=this.store.db.prepare("SELECT COUNT(*) AS n FROM valuation_usage WHERE user_hash=? AND day=? AND unlimited=0 AND state IN ('used','reserved')").get(userHash(user),window.day).n;
    return{...window,...membership,used,remaining:Math.max(0,1-used)};
  }
  async start(user,kind){
    const status=await this.status(user),request=randomUUID(),hash=userHash(user);
    this.store.db.exec('BEGIN IMMEDIATE');
    try{
      const current=this.store.db.prepare("SELECT COUNT(*) AS n FROM valuation_usage WHERE user_hash=? AND day=? AND unlimited=0 AND state IN ('used','reserved')").get(hash,status.day).n;
      if(!status.unlimited&&current>=1)throw new QuotaError(status.reset,status.reason);
      this.store.db.prepare('INSERT INTO valuation_usage VALUES (?,?,?,?,?,?,?,?)').run(hash,status.day,request,kind,'reserved',status.unlimited?1:0,null,this.clock());
      this.store.db.exec('COMMIT');
    }catch(e){this.store.db.exec('ROLLBACK');throw e;}
    return{user,day:status.day,request,kind,unlimited:status.unlimited};
  }
  commit(token){this.store.db.prepare("UPDATE valuation_usage SET state='used' WHERE user_hash=? AND day=? AND request=?").run(userHash(token.user),token.day,token.request);}
  recover(){this.store.db.prepare("DELETE FROM valuation_usage WHERE state='reserved'").run();}
  refund(token){if(token)this.store.db.prepare("DELETE FROM valuation_usage WHERE user_hash=? AND day=? AND request=? AND fingerprint IS NULL").run(userHash(token.user),token.day,token.request);}
  async bind(token,user,kind,fingerprint){
    fingerprint=createHash('sha256').update(fingerprint).digest('hex');
    const row=token&&this.store.db.prepare('SELECT * FROM valuation_usage WHERE user_hash=? AND day=? AND request=?').get(userHash(user),token.day,token.request);
    if(row&&(!row.fingerprint||row.fingerprint===fingerprint)){
      this.store.db.prepare("UPDATE valuation_usage SET state='used',fingerprint=? WHERE user_hash=? AND day=? AND request=?").run(fingerprint,userHash(user),token.day,token.request);return token;
    }
    const next=await this.start(user,kind);this.store.db.prepare("UPDATE valuation_usage SET state='used',fingerprint=? WHERE user_hash=? AND day=? AND request=?").run(fingerprint,userHash(user),next.day,next.request);return next;
  }
  async view(user){
    const s=await this.status(user);return{embeds:[{title:s.unlimited?'💎 Unlimited aktiv':'🎟️ Dein Tageskontingent',color:s.unlimited?0x57f2b0:0x5865f2,
      description:s.unlimited?'Deine Mitgliedschaft bei GAME BROS | COMMUNITY wurde direkt bei Discord bestätigt. Du hast keine Tagesgrenze für W/L und /value.':`**${s.remaining} von 1** gemeinsamer W/L- oder Value-Anfrage heute übrig.\nGilt pro Discord-Nutzer über alle Server dieses Bots.\nNächster Tagesbeginn: <t:${Math.floor(s.reset/1000)}:F>\n\n[Für Unlimited dem Server beitreten](${COMMUNITY_INVITE})${s.reason?`\n\n${s.reason}`:''}`,
      footer:{text:'Kein Screenshot-Nachweis nötig • Mitgliedschaft wird live geprüft • kurze technische Abstände bleiben bestehen'}}],components:joinControls(),allowedMentions:{parse:[]}};
  }
}
