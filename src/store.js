import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

export class Store {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS guilds (id TEXT PRIMARY KEY, channel TEXT NOT NULL, roles TEXT NOT NULL, lead INTEGER NOT NULL DEFAULT 15);
      CREATE TABLE IF NOT EXISTS subscriptions (guild TEXT NOT NULL, user TEXT NOT NULL, topic TEXT NOT NULL, lead INTEGER NOT NULL,
        PRIMARY KEY (guild,user,topic));
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, guild TEXT, title TEXT NOT NULL, topics TEXT NOT NULL,
        start INTEGER NOT NULL, end INTEGER NOT NULL, source TEXT NOT NULL, origin TEXT NOT NULL, status TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1, checked INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '');
      CREATE TABLE IF NOT EXISTS deliveries (id TEXT PRIMARY KEY, event TEXT NOT NULL, revision INTEGER NOT NULL,
        kind TEXT NOT NULL, target TEXT NOT NULL, guild TEXT NOT NULL, lead INTEGER NOT NULL, due INTEGER NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending', tries INTEGER NOT NULL DEFAULT 0, next INTEGER NOT NULL DEFAULT 0,
        sent INTEGER, error TEXT);
      CREATE TABLE IF NOT EXISTS reminders (id TEXT PRIMARY KEY, guild TEXT NOT NULL, user TEXT NOT NULL, text TEXT NOT NULL, due INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS timers (id TEXT PRIMARY KEY, guild TEXT NOT NULL, topic TEXT NOT NULL,
        anchor INTEGER NOT NULL, interval INTEGER NOT NULL, duration INTEGER NOT NULL, expires INTEGER NOT NULL, creator TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS deliveries_due ON deliveries(state,due,next);
      CREATE INDEX IF NOT EXISTS subscriptions_user ON subscriptions(guild,user);
      CREATE INDEX IF NOT EXISTS events_window ON events(guild,end,status);
      CREATE TABLE IF NOT EXISTS weekly (guild TEXT NOT NULL, topic TEXT NOT NULL, expires INTEGER NOT NULL, source TEXT NOT NULL, creator TEXT NOT NULL, PRIMARY KEY(guild,topic));
      CREATE TABLE IF NOT EXISTS event_pings (guild TEXT NOT NULL,topic TEXT NOT NULL,role TEXT NOT NULL,channel TEXT NOT NULL,lead INTEGER NOT NULL DEFAULT 15,PRIMARY KEY(guild,topic));
      CREATE TABLE IF NOT EXISTS trade_checks (id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,created INTEGER NOT NULL,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS knowledge (guild TEXT NOT NULL,question TEXT NOT NULL,answer TEXT NOT NULL,source TEXT NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(guild,question));
      CREATE TABLE IF NOT EXISTS invite_members (guild TEXT NOT NULL,member TEXT NOT NULL,inviter TEXT,joined INTEGER NOT NULL,active INTEGER NOT NULL,eligible INTEGER NOT NULL,reason TEXT NOT NULL,PRIMARY KEY(guild,member));
      CREATE TABLE IF NOT EXISTS invite_rewards (guild TEXT NOT NULL,threshold INTEGER NOT NULL,role TEXT NOT NULL,PRIMARY KEY(guild,threshold,role));
      CREATE TABLE IF NOT EXISTS invite_claims (guild TEXT NOT NULL,user TEXT NOT NULL,threshold INTEGER NOT NULL,role TEXT NOT NULL,claimed INTEGER NOT NULL,PRIMARY KEY(guild,user,threshold,role));
      CREATE TABLE IF NOT EXISTS giveaways (id TEXT PRIMARY KEY,guild TEXT NOT NULL,channel TEXT NOT NULL,message TEXT,prize TEXT NOT NULL,ends INTEGER NOT NULL,count INTEGER NOT NULL,host TEXT NOT NULL,state TEXT NOT NULL,seed TEXT NOT NULL,commitment TEXT NOT NULL,winners TEXT,round INTEGER NOT NULL DEFAULT 0,required_invites INTEGER NOT NULL DEFAULT 0,required_role TEXT,min_age INTEGER NOT NULL DEFAULT 0,draw_error TEXT);
      CREATE TABLE IF NOT EXISTS giveaway_entries (giveaway TEXT NOT NULL,user TEXT NOT NULL,joined INTEGER NOT NULL,PRIMARY KEY(giveaway,user));
      CREATE TABLE IF NOT EXISTS giveaway_draws (giveaway TEXT NOT NULL,round INTEGER NOT NULL,eligible TEXT NOT NULL,winners TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(giveaway,round));
      CREATE INDEX IF NOT EXISTS giveaways_due ON giveaways(state,ends);
      CREATE TABLE IF NOT EXISTS valuation_usage (user_hash TEXT NOT NULL,day TEXT NOT NULL,request TEXT NOT NULL,kind TEXT NOT NULL,state TEXT NOT NULL,unlimited INTEGER NOT NULL,fingerprint TEXT,created INTEGER NOT NULL,PRIMARY KEY(user_hash,day,request));
      CREATE INDEX IF NOT EXISTS valuation_created ON valuation_usage(created);
    `);
    const giveawayColumns=this.db.prepare('PRAGMA table_info(giveaways)').all().map(x=>x.name);
    if(!giveawayColumns.includes('retry_at'))this.db.exec('ALTER TABLE giveaways ADD COLUMN retry_at INTEGER NOT NULL DEFAULT 0');
    if(!giveawayColumns.includes('failures'))this.db.exec('ALTER TABLE giveaways ADD COLUMN failures INTEGER NOT NULL DEFAULT 0');
    if(!this.db.prepare('PRAGMA table_info(weekly)').all().some(x=>x.name==='auto_renew'))this.db.exec('ALTER TABLE weekly ADD COLUMN auto_renew INTEGER NOT NULL DEFAULT 0');
  }
  close() { this.db.close(); }
  getGuild(id) { const r = this.db.prepare('SELECT * FROM guilds WHERE id=?').get(id); return r && { ...r, roles: JSON.parse(r.roles) }; }
  guilds() { return this.db.prepare('SELECT id FROM guilds').all().map(r => this.getGuild(r.id)); }
  saveGuild(id, channel, roles, lead = 15) {
    this.db.prepare('INSERT INTO guilds VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET channel=excluded.channel,roles=excluded.roles,lead=excluded.lead').run(id, channel, JSON.stringify(roles), lead);
  }
  eventPings(guild){return this.db.prepare('SELECT * FROM event_pings WHERE guild=? ORDER BY topic').all(guild);}
  allEventPings(){return this.db.prepare('SELECT * FROM event_pings').all();}
  setEventPing(guild,topic,role,channel,lead){this.db.prepare('INSERT INTO event_pings VALUES (?,?,?,?,?) ON CONFLICT(guild,topic) DO UPDATE SET role=excluded.role,channel=excluded.channel,lead=excluded.lead').run(guild,topic,role,channel,lead);}
  removeEventPing(guild,topic){return this.db.prepare('DELETE FROM event_pings WHERE guild=? AND topic=?').run(guild,topic).changes;}
  subscriptions(guild, user) { return this.db.prepare('SELECT * FROM subscriptions WHERE guild=? AND user=?').all(guild, user); }
  allSubscriptions() { return this.db.prepare('SELECT * FROM subscriptions').all(); }
  setSubscriptions(guild, user, topics, lead) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM subscriptions WHERE guild=? AND user=?').run(guild, user);
      for (const topic of topics) this.db.prepare('INSERT INTO subscriptions VALUES (?,?,?,?)').run(guild, user, topic, lead);
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  event(id) { const e = this.db.prepare('SELECT * FROM events WHERE id=?').get(id); return e && { ...e, topics: JSON.parse(e.topics) }; }
  events(guild, now = Date.now(), includeCancelled = false) {
    return this.db.prepare(`SELECT id FROM events WHERE (guild IS NULL OR guild=?) AND end>=? ${includeCancelled ? '' : "AND status='confirmed'"} ORDER BY start`).all(guild, now).map(e => this.event(e.id));
  }
  allEvents(now = Date.now()) {
    return this.db.prepare('SELECT id FROM events WHERE end>=? OR id IN (SELECT event FROM deliveries WHERE sent>=?)').all(now - 300_000, now - 7 * 86400_000).map(e => this.event(e.id));
  }
  upsertEvent(e, now = Date.now()) {
    const old = this.event(e.id);
    const changed = old && ['title','start','end','source','status','note'].some(k => old[k] !== (e[k] ?? (k === 'note' ? '' : undefined))) || old && JSON.stringify(old.topics) !== JSON.stringify(e.topics);
    const revision = old ? old.revision + (changed ? 1 : 0) : 1;
    this.db.prepare(`INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,
      topics=excluded.topics,start=excluded.start,end=excluded.end,source=excluded.source,status=excluded.status,
      revision=excluded.revision,checked=excluded.checked,note=excluded.note`).run(
      e.id, e.guild ?? null, e.title, JSON.stringify(e.topics), e.start, e.end, e.source, e.origin, e.status, revision, now, e.note || '');
    return this.event(e.id);
  }
  cancel(id) { const e = this.event(id); if (e) return this.upsertEvent({ ...e, status: 'cancelled' }); }
  addReminder(guild, user, text, due) {
    const count = this.db.prepare('SELECT COUNT(*) AS n FROM reminders WHERE user=?').get(user).n;
    if (count >= 20) throw new Error('Du kannst höchstens 20 offene Erinnerungen haben.');
    const id = randomUUID().slice(0, 8);
    this.db.prepare('INSERT INTO reminders VALUES (?,?,?,?,?)').run(id, guild, user, text, due); return id;
  }
  reminders(guild, user) { return this.db.prepare('SELECT * FROM reminders WHERE guild=? AND user=? ORDER BY due').all(guild, user); }
  removeReminder(guild, user, id) { return this.db.prepare('DELETE FROM reminders WHERE id=? AND guild=? AND user=?').run(id, guild, user).changes; }
  cacheGet(key, maxAge = Infinity) {
    const r = this.db.prepare('SELECT * FROM cache WHERE key=?').get(key);
    return r && Date.now() - r.at < maxAge ? { value: JSON.parse(r.value), at: r.at } : null;
  }
  cacheSet(key, value) { this.db.prepare('INSERT INTO cache VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,at=excluded.at').run(key, JSON.stringify(value), Date.now()); }
  queue(job) {
    this.db.prepare('INSERT OR IGNORE INTO deliveries(id,event,revision,kind,target,guild,lead,due) VALUES (?,?,?,?,?,?,?,?)').run(job.id, job.event, job.revision, job.kind, job.target, job.guild, job.lead, job.due);
  }
  timers(guild) { return this.db.prepare('SELECT * FROM timers WHERE guild=? ORDER BY topic').all(guild); }
  setTimer(guild, topic, anchor, interval, duration, expires, creator) {
    const id = `timer:${guild}:${topic}`;
    this.stopTimer(guild, topic);
    this.db.prepare('INSERT INTO timers VALUES (?,?,?,?,?,?,?,?)').run(id, guild, topic, anchor, interval, duration, expires, creator);
    return id;
  }
  stopTimer(guild, topic) {
    this.db.prepare('DELETE FROM timers WHERE guild=? AND topic=?').run(guild, topic);
    const rows = this.db.prepare("SELECT id FROM events WHERE guild=? AND origin='timer' AND end>?").all(guild, Date.now());
    for (const r of rows) if (r.id.startsWith(`timer:${guild}:${topic}:`)) this.cancel(r.id);
  }
  allTimers() { return this.db.prepare('SELECT * FROM timers').all(); }
  weekly(guild) {return this.db.prepare('SELECT * FROM weekly WHERE guild=?').all(guild);}
  setWeekly(guild,topic,expires,source,creator,{autoRenew=false}={}){this.stopWeekly(guild,topic);this.db.prepare('INSERT INTO weekly(guild,topic,expires,source,creator,auto_renew) VALUES (?,?,?,?,?,?)').run(guild,topic,expires,source,creator,autoRenew?1:0);}
  stopWeekly(guild,topic){
    this.db.prepare('DELETE FROM weekly WHERE guild=? AND topic=?').run(guild,topic);
    for(const e of this.events(guild))if(e.origin==='weekly'&&e.topics.includes(topic))this.cancel(e.id);
  }
  saveTrade(id,guild,user,data){
    this.db.prepare('INSERT INTO trade_checks VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET created=excluded.created,data=excluded.data').run(id,guild,user,Date.now(),JSON.stringify(data));
    this.db.prepare('DELETE FROM trade_checks WHERE guild=? AND user=? AND id NOT IN (SELECT id FROM trade_checks WHERE guild=? AND user=? ORDER BY created DESC LIMIT 20)').run(guild,user,guild,user);
  }
  tradeHistory(guild,user){return this.db.prepare('SELECT * FROM trade_checks WHERE guild=? AND user=? ORDER BY created DESC LIMIT 10').all(guild,user).map(r=>({...r,data:JSON.parse(r.data)}));}
  learn(guild,question,answer,source){
    const normalized=question.normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
    if(!normalized)throw new Error('Eine gültige Frage angeben.');
    const count=this.db.prepare('SELECT COUNT(*) AS n FROM knowledge WHERE guild=?').get(guild).n;
    if(count>=200&&!this.db.prepare('SELECT 1 FROM knowledge WHERE guild=? AND question=?').get(guild,normalized))throw new Error('Maximal 200 eigene Wissensantworten pro Server.');
    this.db.prepare('INSERT INTO knowledge VALUES (?,?,?,?,?) ON CONFLICT(guild,question) DO UPDATE SET answer=excluded.answer,source=excluded.source,updated=excluded.updated').run(guild,normalized,answer,source,Date.now());
  }
  knowledgeAnswer(guild,question){
    const normalized=question.normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
    return this.db.prepare('SELECT * FROM knowledge WHERE guild=? AND question=?').get(guild,normalized);
  }
  forget(guild,question){const entry=this.knowledgeAnswer(guild,question);return entry?this.db.prepare('DELETE FROM knowledge WHERE guild=? AND question=?').run(guild,entry.question).changes:0;}
  deleteUser(guild, user) {
    this.db.prepare('DELETE FROM giveaway_entries WHERE user=? AND giveaway IN (SELECT id FROM giveaways WHERE guild=? AND state=?)').run(user,guild,'open');
    this.db.prepare('DELETE FROM trade_checks WHERE guild=? AND user=?').run(guild,user);
    this.db.prepare('DELETE FROM subscriptions WHERE guild=? AND user=?').run(guild, user);
    this.db.prepare('DELETE FROM reminders WHERE guild=? AND user=?').run(guild, user);
    this.db.prepare("DELETE FROM deliveries WHERE guild=? AND target=? AND kind IN ('dm','reminder')").run(guild, user);
    for(const row of this.db.prepare("SELECT key,value FROM cache WHERE key LIKE 'vision:usage:%' OR key LIKE 'answers:usage:%'").all()) {
      const value=JSON.parse(row.value);
      for(const id of [user,createHash('sha256').update(String(user)).digest('hex')])if(value.users?.[id])delete value.users[id];
      this.cacheSet(row.key,value);
    }
  }
  deleteGuild(guild) {
    for(const table of ['giveaway_entries','giveaway_draws'])this.db.prepare(`DELETE FROM ${table} WHERE giveaway IN (SELECT id FROM giveaways WHERE guild=?)`).run(guild);
    for (const table of ['subscriptions','reminders','deliveries','events','timers','weekly','event_pings','trade_checks','knowledge','invite_members','invite_rewards','invite_claims','giveaways']) this.db.prepare(`DELETE FROM ${table} WHERE guild=?`).run(guild);
    this.db.prepare('DELETE FROM guilds WHERE id=?').run(guild);
    for(const key of [`trade:catalog:${guild}`,`trade:channel:${guild}`,`board:${guild}`,`board:error:${guild}`,`chat:channel:${guild}`,`invites:config:${guild}`,`invites:error:${guild}`,`trading:config:${guild}`,`trading:error:${guild}`])this.db.prepare('DELETE FROM cache WHERE key=?').run(key);
  }
}
