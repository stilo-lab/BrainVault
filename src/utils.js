import { DateTime } from 'luxon';

export const clip = (text, max = 1000) => String(text || '').slice(0, max);
export const clean = text => String(text || '').replace(/<[^>]*>/g, '').replace(/@/g, '@\u200b').replace(/[`*_~|\\[\]]/g, '').trim();
export const normalize = text => String(text || '').normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const stamp = (ms, style = 'F') => `<t:${Math.floor(ms / 1000)}:${style}>`;
export const shortQuote = text => clip(clean(text).split(/\s+/).slice(0, 20).join(' '), 240);
export function validSource(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Bitte einen gültigen HTTPS-Quellenlink angeben.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Die Quelle muss ein HTTPS-Link ohne Zugangsdaten sein.');
  return url.href;
}
export function parseWhen(input, zone = 'Europe/Berlin') {
  const match = input.match(/^<t:(\d{9,12})(?::[tTdDfFR])?>$/);
  const dt = match ? DateTime.fromMillis(Number(match[1]) * 1000) : DateTime.fromISO(input, { zone });
  if (!dt.isValid || !/[T ]\d{2}:\d{2}/.test(input) && !match) {
    throw new Error('Zeitformat: 2026-11-07T21:00 (Europe/Berlin), mit UTC-Offset oder <t:UNIX:F>.');
  }
  // Luxon verschiebt nicht existierende Sommerzeit-Uhrzeiten; solche Eingaben ablehnen.
  if (!match && !/(Z|[+-]\d{2}:?\d{2})$/i.test(input)) {
    const wall = input.slice(0, 16).replace(' ', 'T');
    if (dt.toFormat("yyyy-MM-dd'T'HH:mm") !== wall) throw new Error('Diese lokale Uhrzeit existiert wegen der Zeitumstellung nicht. Bitte UTC-Offset angeben.');
    if (dt.getPossibleOffsets().length > 1) throw new Error('Diese Uhrzeit ist wegen der Zeitumstellung doppeldeutig. Bitte +01:00 oder +02:00 angeben.');
  }
  return dt.toMillis();
}
export function expectedSchedule(now = Date.now()) {
  return [{ name: 'Admin Abuse (Samstag)', day: 6, hour: 15 }, { name: 'Taco Tuesday', day: 2, hour: 18 }].map(x => {
    const local = DateTime.fromMillis(now, { zone: 'America/New_York' });
    let next = local.startOf('day').plus({ days: (x.day - local.weekday + 7) % 7 }).set({ hour: x.hour });
    if (next.toMillis() <= now) next = next.plus({ weeks: 1 });
    return { name: x.name, start: next.toMillis() };
  });
}
export function errorText(error) {
  const code = error?.code ?? error?.status;
  if (code === 50013 || code === 50001) return 'Mir fehlen Discord-Rechte. Prüfe Kanalrechte und die Position meiner Bot-Rolle.';
  if (code === 50007) return 'Ich kann dir keine DM senden. Erlaube DMs von Servermitgliedern und versuche es erneut.';
  if (code === 10011) return 'Eine Ping-Rolle wurde gelöscht. Ein Admin muss /setup erneut ausführen.';
  return clip(error?.message || 'Unbekannter Fehler.', 350);
}
