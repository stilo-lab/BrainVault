import { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { TOPICS, LEADS } from './config.js';

export function preferences(store, guild, user, member) {
  const settings = store.getGuild(guild); const subs = store.subscriptions(guild, user);
  const dmTopics = new Set(subs.map(s => s.topic));
  const roleTopics = new Set(Object.entries(settings?.roles || {}).filter(([, id]) => member.roles.cache.has(id)).map(([t]) => t));
  const select = (kind, placeholder, defaults, enabled = true) => new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId(`prefs:${kind}:${user}`).setPlaceholder(placeholder).setMinValues(0).setMaxValues(5).setDisabled(!enabled)
    .addOptions(Object.entries(TOPICS).map(([value, t]) => ({ label: t.name, value, emoji: t.emoji, default: defaults.has(value) }))));
  const lead = subs[0]?.lead ?? 15;
  return {
    content: '## Deine SAB-Benachrichtigungen\nJede Auswahl wird sofort gespeichert. Leere Auswahl schaltet die jeweilige Benachrichtigung aus.\n**Server-Rollen:** Pings im Event-Kanal. **DMs:** persönliche Nachricht mit deinem Vorlauf.\n' + (settings ? `Event-Kanal: <#${settings.channel}> · Rollen-Vorlauf: ${settings.lead} Min. und zum Start.` : 'Ein Admin muss zuerst /setup ausführen, damit Ping-Rollen verfügbar sind. DMs funktionieren bereits.'),
    components: [select('roles','Server-Ping-Rollen auswählen',roleTopics,!!settings), select('dms','Persönliche DM-Themen auswählen',dmTopics),
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`prefs:lead:${user}`).setPlaceholder('DM-Vorlauf')
        .addOptions(LEADS.map(v => ({ label: v ? `${v} Minuten vor dem Start` : 'Genau zum Start', value: String(v), default: lead === v }))))],
    allowedMentions: { parse: [] }
  };
}
export const publicPanel = () => ({
  embeds: [{ title: '🧠 SAB Event-Zentrale', color: 0x5865f2,
    description: 'Wähle selbst, welche Events dich interessieren.\n\n⚡ Admin Abuse\n🌮 Taco Tuesday\n⛏️ Schaufel / Dig / Grave Hunt\n🆕 Updates\n🎉 Andere Events\n\n**Rollen-Pings und persönliche DMs separat einstellbar.**\nMit /events siehst du Termine und Countdown; /sab frage durchsucht das SAB-Wiki.' }],
  components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('prefs:open').setLabel('Meine Pings einstellen').setEmoji('🔔').setStyle(ButtonStyle.Primary))],
  allowedMentions: { parse: [] }
});
export async function applyRoles(member, settings, selected) {
  if (!settings) throw new Error('Ein Admin muss zuerst /setup ausführen.');
  const bot = await member.guild.members.fetchMe();
  const roles = [];
  for (const [topic, id] of Object.entries(settings.roles)) {
    const role = await member.guild.roles.fetch(id);
    if (!role || role.managed || role.permissions.bitfield !== 0n || role.id === member.guild.id || role.position >= bot.roles.highest.position) {
      throw new Error('Eine Ping-Rolle fehlt, hat zusätzliche Rechte oder liegt über meiner Rolle. Ein Admin muss /setup prüfen.');
    }
    roles.push({ topic, role });
  }
  const completed = [];
  try {
    for (const { topic, role } of roles) {
      const has = member.roles.cache.has(role.id), want = selected.includes(topic);
      if (has === want) continue;
      if (want) await member.roles.add(role, 'SAB-Abo durch Mitglied'); else await member.roles.remove(role, 'SAB-Abo durch Mitglied');
      completed.push({ role, had: has });
    }
  } catch (err) {
    for (const c of completed.reverse()) {
      try { if (c.had) await member.roles.add(c.role); else await member.roles.remove(c.role); } catch { /* /abo einstellen zeigt den tatsächlichen Stand. */ }
    }
    throw err;
  }
}
