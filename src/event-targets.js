// Broadcast roles are separate from self-service subscription roles. Never grant them to users.
export function channelTargets(store,event){
  const targets=new Map();
  const add=(guild,channel,lead,roles)=>{
    roles=[...new Set(roles.filter(Boolean))];if(!roles.length)return;
    for(const before of new Set([lead,0])){
      const key=JSON.stringify([guild,channel,before]);
      const row=targets.get(key)||{guild,channel,lead:before,roles:[]};
      row.roles=[...new Set([...row.roles,...roles])];targets.set(key,row);
    }
  };
  for(const g of store.guilds())if(!event.guild||event.guild===g.id)add(g.id,g.channel,g.lead,event.topics.map(t=>g.roles[t]));
  for(const p of store.allEventPings())if((!event.guild||event.guild===p.guild)&&event.topics.includes(p.topic))add(p.guild,p.channel,p.lead,[p.role]);
  return [...targets.values()];
}
export function currentChannelTarget(store,event,job){
  if(!event)return null;
  const rows=channelTargets(store,event).filter(t=>t.guild===job.guild&&t.channel===job.target&&(job.lead===-1||t.lead===job.lead));
  return rows.length?{...rows[0],roles:[...new Set(rows.flatMap(t=>t.roles))]}:null;
}
