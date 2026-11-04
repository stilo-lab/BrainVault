import { DateTime } from 'luxon';
import { TOPICS } from './config.js';

export function weeklyStarts(topic,from,until){
  if(!['admin','taco'].includes(topic))throw new Error('Wochenpläne gibt es für Admin Abuse und Taco Tuesday.');
  const day=topic==='admin'?6:2,hour=topic==='admin'?15:18;
  const local=DateTime.fromMillis(from,{zone:'America/New_York'});
  let next=local.startOf('day').plus({days:(day-local.weekday+7)%7}).set({hour});
  if(next.toMillis()<from)next=next.plus({weeks:1});
  const starts=[];
  while(next.toMillis()<until&&starts.length<10){starts.push(next.toMillis());next=next.plus({weeks:1});}
  return starts;
}
export function materializeWeekly(store,now=Date.now()){
  store.db.prepare('UPDATE weekly SET expires=? WHERE auto_renew=1 AND expires<?').run(now+28*86400_000,now+7*86400_000);
  const official=store.allEvents(now).filter(e=>e.origin==='roblox'&&e.status==='confirmed');
  for(const plan of store.db.prepare('SELECT * FROM weekly WHERE expires>?').all(now)){
    for(const start of weeklyStarts(plan.topic,now-300_000,plan.expires)){
      const id=`weekly:${plan.guild}:${plan.topic}:${start}`;
      const day=DateTime.fromMillis(start,{zone:'America/New_York'}).toISODate();
      const announced=official.some(e=>e.topics.includes(plan.topic)&&DateTime.fromMillis(e.start,{zone:'America/New_York'}).toISODate()===day);
      if(announced){if(store.event(id))store.cancel(id);continue;}
      store.upsertEvent({id,guild:plan.guild,title:TOPICS[plan.topic].name,topics:[plan.topic],start,end:start+45*60_000,source:plan.source,origin:'weekly',status:'confirmed',
        note:`${plan.auto_renew?'Dauerhaft aktivierte Wochen-Erinnerung':'Vom Serverteam aktivierter Wochenplan'} • Start aus America/New_York berechnet • Planungsfenster 45 Min. • ${plan.auto_renew?'Community-Zeitplan; Spieländerungen sind möglich. Kein Live-Nachweis.':`gültig bis ${new Date(plan.expires).toISOString()}`}`},now);
    }
  }
}
