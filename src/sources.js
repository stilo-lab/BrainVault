import { load } from 'cheerio';
import { WIKI, UNIVERSE } from './config.js';
import { normalize, clean, clip, shortQuote } from './utils.js';

// Es werden ausschließlich fest vorgegebene öffentliche Hosts abgerufen.
export async function request(url, json = true) {
  if (!['stealabrainrot.wiki','apis.roblox.com','games.roblox.com','sabtradingvalues.com'].includes(new URL(url).hostname)) throw new Error('Nicht erlaubter Quellenhost.');
  const res = await fetch(url, { headers: { 'User-Agent': 'SAB-Discord-Companion/1.0 (+read-only; cached)' }, signal: AbortSignal.timeout(12000), redirect: 'error' });
  if (!res.ok) throw new Error(`Quelle ${new URL(url).hostname}: HTTP ${res.status}`);
  const reader = res.body.getReader(); const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 5_000_000) throw new Error('Quellenantwort zu groß.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const body = Buffer.concat(chunks).toString('utf8');
  return json ? JSON.parse(body) : body;
}
export function classify(text) {
  const s = normalize(text); const topics = [];
  if (/admin abuse|admin event/.test(s)) topics.push('admin');
  if (/taco tuesday/.test(s)) topics.push('taco');
  if (/grave hunt|gravehunt|dig event|digging event|grave digger|shovel|graben|grabungs|schaufel/.test(s)) topics.push('dig');
  if (/update|\bupd\b|new brainrot|new content|mutation/.test(s)) topics.push('update');
  return topics.length ? topics : ['other'];
}
export function parseRobloxEvent(row) {
  // Alte Datensätze haben ebenfalls eventStatus=active: immer UTC-Fenster auswerten.
  const start = Date.parse(row.eventTime?.startUtc), end = Date.parse(row.eventTime?.endUtc);
  if (String(row.universeId) !== UNIVERSE || !row.id || !row.title || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  if (row.eventVisibility && row.eventVisibility !== 'public') return null;
  const text = `${row.title} ${row.subtitle || ''} ${row.description || ''}`;
  return { id: `roblox:${row.id}`, title: clip(clean(row.title), 150), start, end, topics: classify(text),
    source: `https://www.roblox.com/events/${row.id}`, origin: 'roblox',
    status: /cancel|delete|moderated|inactive/i.test(row.eventStatus || '') ? 'cancelled' : 'confirmed', note: '' };
}
export class RobloxSource {
  constructor(store, fetcher = request) { this.store = store; this.fetcher = fetcher; this.running = false; }
  async sync(now = Date.now()) {
    if (this.running) return { busy: true };
    this.running = true;
    try {
      const rows = []; let cursor = ''; const seen = new Set();
      for (let page = 0; page < 30; page++) {
        const url = new URL(`https://apis.roblox.com/virtual-events/v1/universes/${UNIVERSE}/virtual-events`);
        url.searchParams.set('limit', '50'); if (cursor) url.searchParams.set('cursor', cursor);
        const data = await this.fetcher(url.href);
        if (!Array.isArray(data.data)) throw new Error('Roblox hat ein unbekanntes Datenformat geliefert.');
        rows.push(...data.data); cursor = data.nextPageCursor;
        if (!cursor) break;
        if (seen.has(cursor)) throw new Error('Roblox hat einen wiederholten Seiten-Cursor geliefert.');
        seen.add(cursor);
        if (page === 29) throw new Error('Roblox-Paginierung unvollständig; gespeicherte Termine bleiben erhalten.');
      }
      const events = rows.map(parseRobloxEvent).filter(Boolean);
      for (const e of events) if (e.end > now - 86400_000 || this.store.event(e.id)) this.store.upsertEvent(e, now);
      // Nur nach einer vollständig erfolgreichen Abfrage fehlende künftige Termine zurückziehen.
      const ids = new Set(events.map(e => e.id));
      for (const e of this.store.allEvents(now)) if (e.origin === 'roblox' && e.start > now && !ids.has(e.id)) this.store.cancel(e.id);
      const result = { at: now, upcoming: events.filter(e => e.end > now && e.status === 'confirmed').length, total: events.length };
      this.store.cacheSet('roblox:status', result); return result;
    } catch (e) {
      this.store.cacheSet('roblox:error', { at: now, message: e.message }); throw e;
    } finally { this.running = false; }
  }
  async stats() {
    const cached = this.store.cacheGet('roblox:game', 60_000); if (cached) return cached.value;
    const data = await this.fetcher(`https://games.roblox.com/v1/games?universeIds=${UNIVERSE}`);
    const game = data.data?.find(x => String(x.id) === UNIVERSE);
    if (!game) throw new Error('Roblox-Spielstatistik gerade nicht verfügbar.');
    const value = { name: game.name, playing: game.playing, visits: game.visits, favorites: game.favoritedCount, updated: game.updated, at: Date.now() };
    this.store.cacheSet('roblox:game', value); return value;
  }
}
export function parseSitemap(xml) {
  const $ = load(xml, { xml: true }); const pages = [];
  $('url').each((_, el) => {
    const url = $(el).find('loc').text();
    if (!/^https:\/\/stealabrainrot\.wiki\/wiki\/[^/]+\/$/.test(url)) return;
    const slug = decodeURIComponent(new URL(url).pathname.split('/')[2]);
    pages.push({ url, title: slug.replaceAll('-', ' '), modified: $(el).find('lastmod').text() });
  });
  if (pages.length < 50) throw new Error('Wiki-Index ist leer oder das Format wurde geändert.');
  return pages;
}
const aliases = {
  schaufel: 'shovel shop grave hunt', graben: 'grave hunt', dig: 'grave hunt', digging: 'grave hunt',
  rebirths: 'rebirth', wiedergeburt: 'rebirth', mutation: 'mutations', mutationen: 'mutations',
  einkommen: 'income', geld: 'money', tauschen: 'trading', handel: 'trading', codes: 'codes',
  adminabuse: 'admin abuse', seltenheit: 'rarities', lucky: 'lucky block', fusion: 'fuse',
  basis: 'base', tipps: 'tips', traits: 'traits', event: 'events'
};
const stopwords = new Set('wie was ist sind der die das ein eine einen zu für fuer von wann nächste naechste aktuelle aktuell habe ich du man bekommt bekomme kann dem den im in und über ueber wissen alles does what how the a an is of to get'.split(' '));
export function searchPages(pages, query, limit = 5) {
  const raw = normalize(query); if(!raw)return [];
  const input = raw.split(' ');
  const terms = [...new Set(input.filter(x => !stopwords.has(x)).flatMap(x => [x, ...(aliases[x]?.split(' ') || [])]))];
  return pages.map(p => {
    const title = normalize(p.title); const words = title.split(' ');
    let score = title === raw ? 1000 : title.includes(raw) ? 100 : 0;
    let matches=0;
    for (const term of terms) {
      const direct=words.includes(term)?15:title.includes(term)?4:0;
      const fuzzy=!direct&&term.length>=5&&words.some(word=>similarWord(term,word))?8:0;
      if(direct||fuzzy)matches++;
      score+=direct+fuzzy;
    }
    score+=matches/Math.max(1,terms.length)*10;
    score -= Math.abs(words.length - terms.length) * 0.2;
    if (/gallery|history|disambiguation/.test(title)) score -= 8;
    return { ...p, score };
  }).filter(p => p.score > 3).sort((a,b) => b.score - a.score).slice(0, limit);
}
function similarWord(a,b) {
  if(Math.abs(a.length-b.length)>1||b.length<5)return false;
  // Ein Fehler oder zwei vertauschte benachbarte Buchstaben.
  let prev=Array.from({length:b.length+1},(_,i)=>i),older;
  for(let i=1;i<=a.length;i++){
    const row=[i];
    for(let j=1;j<=b.length;j++){
      row[j]=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
      if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])row[j]=Math.min(row[j],older[j-2]+1);
    }
    older=prev;prev=row;
  }
  return prev[b.length]<=1;
}
export function parseArticle(html, url) {
  const $ = load(html);
  const title = clean($('h1').first().text() || $('title').text().split('|')[0]);
  const root = $('.mw-parser-output').first().length ? $('.mw-parser-output').first() : $('article').first().length ? $('article').first() : $('main').first();
  root.find('script,style,nav,.related-pages,.toc,footer,.wc-consent').remove();
  const fields = [];
  const addField = (key,value) => {
    key=clean(key).replace(/\s+/g,' ');value=clean(value).replace(/\s+/g,' ');
    if (/^(cost|price|income|rarity|tier|power|fragments|multiplier|obtain|release|event|duration|cooldown|status)/i.test(key) && value && value.length<160 && fields.length<12 && !fields.some(f=>f.name===key)) fields.push({name:clip(key,70),value:clip(value,160),inline:true});
  };
  root.find('.pi-horizontal-group').each((_,table)=>{
    const labels=$(table).find('thead .pi-data-label');const values=$(table).find('tbody .pi-data-value');
    labels.each((idx,label)=>addField($(label).text(),values.eq(idx).text()));
  });
  root.find('[data-source]').each((_, el) => {
    const key = clean($(el).find('.pi-data-label').text()); const value = clean($(el).find('.pi-data-value').text()).replace(/\s+/g, ' ');
    if (key && value) addField(key,value);
  });
  // Zahlen und kurze Fakten aus der Infobox; keine langen Wiki-Artikel kopieren.
  root.find('.infobox tr,.portable-infobox tr,table tr').each((_, el) => {
    if (fields.length >= 12) return;
    if ($(el).closest('.pi-horizontal-group').length) return;
    const cells = $(el).children('th,td');
    if (cells.length !== 2) return;
    const key = clean(cells.eq(0).text()).replace(/\s+/g, ' '); const val = clean(cells.eq(1).text()).replace(/\s+/g, ' ');
    addField(key,val);
  });
  const textRoot=root.find('.article-body').first().length?root.find('.article-body').first().clone():root.clone();
  textRoot.find('.portable-infobox,.wc-sound-notice,.article-header,.usernav,.card').remove();
  const paragraphs = textRoot.find('p').map((_, p) => clean($(p).text()).replace(/\s+/g, ' ')).get().filter(t => t.length > 40 && !/cookie|javascript|you can help/i.test(t));
  const description = shortQuote(paragraphs[0] || $('meta[name="description"]').attr('content') || 'Artikel direkt in der Quelle öffnen.');
  if (!title || !root.length) throw new Error('Die Wiki-Seite konnte nicht gelesen werden.');
  const sections=textRoot.find('h2,h3,p,li,tr').map((_,el)=>clean($(el).text()).replace(/\s+/g,' ')).get()
    .filter(t=>t.length>=25&&t.length<=1600&&!/cookie|javascript|you can help/i.test(t)).slice(0,100);
  const modified=$('time[datetime]').first().attr('datetime')||null;
  return { title, description, fields: fields.slice(0, 9), sections, modified, url, fetched: Date.now() };
}
export class Knowledge {
  constructor(store, fetcher = request) { this.store = store; this.fetcher = fetcher; this.indexFlight = null; this.articleFlights = new Map(); }
  async index() {
    const fresh = this.store.cacheGet('wiki:index', 86400_000); if (fresh) return { ...fresh, stale: false };
    if (this.indexFlight) return this.indexFlight;
    this.indexFlight = (async () => {
      try {
        const pages = parseSitemap(await this.fetcher(`${WIKI}/sitemap.xml`, false));
        this.store.cacheSet('wiki:index', pages); return { value: pages, at: Date.now(), stale: false };
      } catch (e) {
        const cached = this.store.cacheGet('wiki:index'); if (cached) return { ...cached, stale: true };
        throw e;
      } finally { this.indexFlight = null; }
    })();
    return this.indexFlight;
  }
  async search(query, limit = 5) {
    const index = await this.index(); return { pages: searchPages(index.value, query, limit), stale: index.stale, at: index.at };
  }
  async article(page) {
    const fresh = this.store.cacheGet(`wiki:${page.url}`, 3600_000); if (fresh?.value.sections) return { ...fresh.value, stale: false };
    if (this.articleFlights.has(page.url)) return this.articleFlights.get(page.url);
    const flight = (async () => {
      try {
        const value = parseArticle(await this.fetcher(page.url, false), page.url); this.store.cacheSet(`wiki:${page.url}`, value); return { ...value, stale: false };
      } catch (e) {
        const old = this.store.cacheGet(`wiki:${page.url}`); if (old) return { ...old.value, stale: true };
        throw e;
      } finally { this.articleFlights.delete(page.url); }
    })();
    this.articleFlights.set(page.url, flight); return flight;
  }
}
