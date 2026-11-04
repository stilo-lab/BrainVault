import { GAME_URL, TOPICS } from './config.js';
import { clean, clip, stamp, errorText } from './utils.js';
import { materializeWeekly } from './weekly.js';
import {channelTargets,currentChannelTarget} from './event-targets.js';

export function materializeTimers(store, now = Date.now()) {
  for (const timer of store.allTimers()) {
    if (timer.expires < now) continue;
    const first = Math.max(0, Math.ceil((now - timer.duration - timer.anchor) / timer.interval));
    for (let n = first; n < first + 500; n++) {
      const start = timer.anchor + n * timer.interval;
      if (start >= timer.expires || start > now + 3 * 86400_000) break;
      store.upsertEvent({ id: `${timer.id}:${start}`, guild: timer.guild, title: TOPICS[timer.topic].name,
        topics: [timer.topic], start, end: start + timer.duration, source: GAME_URL, origin: 'timer', status: 'confirmed',
        note: `Aus Ingame-Countdown berechnet • Intervall ${timer.interval / 60_000} Min. • kalibriert von ${timer.creator} • gültig bis ${new Date(timer.expires).toISOString()}` }, now);
    }
  }
}
export function eventEmbed(e, { lead = 0, correction = false, now = Date.now() } = {}) {
  const cancelled = e.status === 'cancelled';
  return {
    title: clip(`${cancelled ? '🚫 Abgesagt / zurückgezogen' : correction ? '🔄 Termin geändert' : lead > 0 ? `⏰ In ${lead} Minuten` : now > e.end ? 'Event beendet' : e.origin==='weekly'?'🗓️ Geplanter Start':e.origin==='timer'?'⏱️ Berechneter Start':'🔔 Event-Start'} · ${clean(e.title)}`, 256),
    color: cancelled ? 0xed4245 : TOPICS[e.topics[0]]?.color || 0x5865f2,
    description: `${stamp(e.start)} · ${stamp(e.start, 'R')}\nEnde: ${stamp(e.end, 't')}\n\n[Quelle öffnen](${e.source})${e.note ? `\n${clip(clean(e.note), 500)}` : ''}`,
    footer: { text: `${e.origin === 'roblox' ? 'Roblox-Ankündigung' : e.origin === 'timer' ? 'Kalibrierter Intervall-Timer' : e.origin==='weekly'?'Wochen-Erinnerung nach Community-Zeitplan':'Vom Serverteam eingetragen'} • ${e.id}` }
  };
}
export function planJobs(store, now = Date.now()) {
  materializeTimers(store, now);
  materializeWeekly(store, now);
  const subs = store.allSubscriptions();
  for (const e of store.allEvents(now)) {
    // Bereits versendete Nachrichten bekommen bei Änderungen oder Absage eine Korrektur.
    const previous = store.db.prepare("SELECT DISTINCT kind,target,guild FROM deliveries WHERE event=? AND revision<? AND state='sent' AND kind!='reminder'").all(e.id, e.revision);
    for (const p of previous) {
      const active = p.kind === 'channel' ? !!currentChannelTarget(store,e,{...p,lead:-1}) : subs.some(s => s.guild === p.guild && s.user === p.target && e.topics.includes(s.topic));
      if (!active) continue;
      store.queue({ id: `${e.id}|${e.revision}|${p.kind}|${p.guild}|${p.target}|change`, event: e.id, revision: e.revision, ...p, lead: -1, due: now });
    }
    if (e.status !== 'confirmed') continue;
    const add = (kind, target, guild, lead) => {
      const due = e.start - lead * 60_000;
      if (due < now - (lead === 0 ? 300_000 : 120_000)) return;
      store.queue({ id: `${e.id}|${e.revision}|${kind}|${guild}|${target}|${lead}`, event: e.id, revision: e.revision, kind, target, guild, lead, due });
    };
    for(const target of channelTargets(store,e))add('channel',target.channel,target.guild,target.lead);
    // Bei mehreren abonnierten Themen desselben Events nur eine DM pro Zeitpunkt.
    for (const s of subs) if ((!e.guild || e.guild === s.guild) && e.topics.includes(s.topic)) add('dm', s.user, s.guild, s.lead);
  }
  for (const r of store.db.prepare('SELECT * FROM reminders').all()) store.queue({ id: `reminder:${r.id}`, event: r.id, revision: 1, kind: 'reminder', target: r.user, guild: r.guild, lead: 0, due: r.due });
}
export class Scheduler {
  constructor(store, sender, logger = console) { this.store = store; this.sender = sender; this.logger = logger; this.running = false; }
  async tick(now = Date.now()) {
    if (this.running) return;
    this.running = true;
    try {
      planJobs(this.store, now);
      const jobs = this.store.db.prepare("SELECT * FROM deliveries WHERE state='pending' AND due<=? AND next<=? ORDER BY due LIMIT 100").all(now, now);
      for (const job of jobs) {
        const e = job.kind === 'reminder' ? null : this.store.event(job.event);
        const reminder = job.kind === 'reminder' ? this.store.db.prepare('SELECT * FROM reminders WHERE id=?').get(job.event) : null;
        const target=job.kind==='channel'?currentChannelTarget(this.store,e,job):null;
        const subscribed = job.kind !== 'dm' || this.store.subscriptions(job.guild, job.target).some(s => e?.topics.includes(s.topic) && (job.lead === -1 || s.lead === job.lead));
        const expired = job.lead >= 0 && job.kind !== 'reminder' && job.due < now - (job.lead === 0 ? 300_000 : 120_000);
        if (expired || !subscribed || (job.kind === 'reminder' ? !reminder : !e || e.revision !== job.revision || job.lead >= 0 && e.status !== 'confirmed') || job.kind === 'channel' && !target) {
          this.store.db.prepare("UPDATE deliveries SET state='skipped' WHERE id=?").run(job.id); continue;
        }
        try {
          const roles=target?.roles||[];
          const payload = reminder ? { content: `⏰ Deine Erinnerung: ${clip(clean(reminder.text), 1000)}\nGeplant für ${stamp(reminder.due)}${now - reminder.due > 300_000 ? '\nNach Neustart verspätet zugestellt.' : ''}`, allowedMentions: { parse: [] } } : {
            content: roles.map(id => `<@&${id}>`).join(' ') || undefined,
            embeds: [eventEmbed(e, { lead: job.lead, correction: job.lead === -1, now })],
            allowedMentions: { parse: [], roles }
          };
          await this.sender(job, payload);
          this.store.db.prepare("UPDATE deliveries SET state='sent',sent=?,error=NULL WHERE id=?").run(now, job.id);
          if (reminder) this.store.db.prepare('DELETE FROM reminders WHERE id=?').run(reminder.id);
        } catch (err) {
          const permanent = !!err.permanent||[50007, 50013, 50001, 10003, 10007, 10013].includes(Number(err.code));
          const tries = job.tries + 1;
          this.store.db.prepare('UPDATE deliveries SET state=?,tries=?,next=?,error=? WHERE id=?').run(permanent || tries >= 5 ? 'failed' : 'pending', tries, now + Math.min(300_000, 15_000 * 2 ** tries), errorText(err), job.id);
          this.logger.warn(`Zustellung ${job.kind} fehlgeschlagen: ${errorText(err)}`);
          if (reminder && (permanent || tries >= 5)) this.store.db.prepare('DELETE FROM reminders WHERE id=?').run(reminder.id);
        }
      }
      // Endliche Aufbewahrung von Zustellprotokollen und beendeten Terminen.
      this.store.db.prepare("DELETE FROM deliveries WHERE due<? AND state!='pending'").run(now - 14 * 86400_000);
      this.store.db.prepare('DELETE FROM events WHERE end<? AND id NOT IN (SELECT event FROM deliveries)').run(now - 14 * 86400_000);
      this.store.db.prepare("DELETE FROM cache WHERE key LIKE 'vision:usage:%' AND at<?").run(now-2*86400_000);
      this.store.db.prepare("DELETE FROM cache WHERE (key LIKE 'answers:usage:%' OR key LIKE 'answer:%') AND at<?").run(now-2*86400_000);
      this.store.db.prepare('DELETE FROM trade_checks WHERE created<?').run(now-30*86400_000);
      this.store.db.prepare('DELETE FROM valuation_usage WHERE created<?').run(now-3*86400_000);
      this.store.cacheSet('notifications:scheduler',{at:now});
    } finally { this.running = false; }
  }
}
