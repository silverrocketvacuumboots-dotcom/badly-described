// Badly Described API. Runs on Cloudflare Workers next to the static site in ./public.
// The answers live only here (src/bank.js); the page gets the descriptions and hints only.
//   POST /api/guess { day, pid, q, g }  -> checks a typed title. A right guess is recorded as that player's
//                                          result for the song and returns { match, song, got, n }.
//   POST /api/miss  { day, pid, q }     -> records a song the player didn't get (time ran out or passed) and
//                                          returns { song, got, n } so the page can reveal it.
//   POST /api/done  { day, pid }        -> records a finished day's score (worked out here, from the results
//                                          above) and returns how everyone's scores are spread: hist[0..7]
//   GET  /api/stats?day=YYYY-MM-DD      -> { day, players, hist }  (no answers)
//   GET  /api/answers?day=…&pid=…       -> the day's seven songs and how many players got each, once that
//                                          player has finished the day or the day is over everywhere
//   POST /api/sync  { code?, data }     -> saves a player's progress under a sync code (makes one if needed)
//   GET  /api/sync?code=…               -> loads it on another device
// got/n: how many players got this song, out of how many tried it, before this player.
// A song is { t: title, a: artist, y: year, id: Apple track id }. The page looks up the preview itself,
// straight from Apple, so this Worker never contacts Apple.
// Each day only the first PER_CONN players from one connection (IP) count towards the stats; more can play
// but don't move the numbers. Connections are stored as a salted, per-day hash.

import { prepareSong, matchSong, parseTitles } from './match.js';
import { LAUNCH, DAYS } from './bank.js';
import { TOURS } from './tourbank.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SONGS = 7;
const KEEP_DAYS = 14; // individual results are deleted after this; the per-song totals are kept
const PER_CONN = 3;

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });

// Whole days between `day` and today (UTC). NaN if it isn't a real YYYY-MM-DD date.
function dayOffset(day) {
  if (typeof day !== 'string' || !DAY.test(day)) return NaN;
  const t = Date.parse(day + 'T00:00:00Z');
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== day) return NaN;
  const now = new Date();
  return Math.round((t - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 864e5);
}

// The songs for a date, ready for matching (worked out once per Worker instance).
const prepared = new Map();
function songsOf(day) {
  const i = Math.round((Date.parse(day + 'T00:00:00Z') - Date.parse(LAUNCH + 'T00:00:00Z')) / 864e5);
  if (!(i >= 0) || !DAYS.length) return null;
  const idx = i % DAYS.length;
  if (!prepared.has(idx)) prepared.set(idx, DAYS[idx].map((s) => ({ ...s, m: prepareSong(s.t, s.a) })));
  return prepared.get(idx);
}
const publicSong = (s) => ({ t: parseTitles(s.t).d, a: s.a, y: s.y, id: s.id });

// ---------- tables (created on first use, so a new database needs no setup) ----------
let ready = false;
async function ensureTables(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS plays (day TEXT NOT NULL, pid TEXT NOT NULL, q INTEGER NOT NULL, ok INTEGER NOT NULL, PRIMARY KEY (day, pid, q)) WITHOUT ROWID'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS counts (day TEXT NOT NULL, q INTEGER NOT NULL, ok INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, q, ok)) WITHOUT ROWID'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS totals (day TEXT NOT NULL, pid TEXT NOT NULL, score INTEGER NOT NULL, PRIMARY KEY (day, pid)) WITHOUT ROWID'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS seen (day TEXT NOT NULL, iph TEXT NOT NULL, pid TEXT NOT NULL, ok INTEGER NOT NULL, PRIMARY KEY (day, iph, pid)) WITHOUT ROWID'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS sync (code TEXT PRIMARY KEY, data TEXT NOT NULL, updated TEXT NOT NULL) WITHOUT ROWID'),
  ]);
  ready = true;
}

async function limited(request, env) {
  if (!env.PLAY_LIMIT) return false;
  const { success } = await env.PLAY_LIMIT.limit({ key: request.headers.get('cf-connecting-ip') || 'unknown' });
  return !success;
}
async function readBody(request, max) {
  if (Number(request.headers.get('content-length') || 0) > max) return null;
  try {
    const b = await request.json();
    return b && typeof b === 'object' ? b : null;
  } catch {
    return null;
  }
}
async function sha(text) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
// Does this player count towards today's stats? The first PER_CONN players seen on a connection each day do.
async function countsTowardStats(request, env, day, pid) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const iph = (await sha(`${env.IP_SALT || 'badly-described'}|${day}|${ip}`)).slice(0, 24);
  const row = await env.DB.prepare('SELECT ok FROM seen WHERE day = ?1 AND iph = ?2 AND pid = ?3').bind(day, iph, pid).first();
  if (row) return row.ok === 1;
  const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM seen WHERE day = ?1 AND iph = ?2 AND ok = 1').bind(day, iph).first();
  const ok = (c?.n || 0) < PER_CONN ? 1 : 0;
  await env.DB.prepare('INSERT INTO seen (day, iph, pid, ok) VALUES (?1, ?2, ?3, ?4) ON CONFLICT DO NOTHING').bind(day, iph, pid, ok).run();
  return ok === 1;
}
// How many players got song q, out of how many have finished it.
async function songCounts(env, day, q) {
  const { results } = await env.DB.prepare('SELECT ok, n FROM counts WHERE day = ?1 AND q = ?2').bind(day, q).all();
  let got = 0, n = 0;
  for (const r of results) { n += r.n; if (r.ok === 1) got += r.n; }
  return { got, n };
}
// Records a player's result for a song. The first result per song counts; later ones change nothing.
async function record(request, env, day, pid, q, ok) {
  const ins = await env.DB.prepare('INSERT INTO plays (day, pid, q, ok) VALUES (?1, ?2, ?3, ?4) ON CONFLICT DO NOTHING')
    .bind(day, pid, q, ok).run();
  if (ins.meta.changes !== 1) return false;
  if (!(await countsTowardStats(request, env, day, pid))) return false;
  await env.DB.prepare('INSERT INTO counts (day, q, ok, n) VALUES (?1, ?2, ?3, 1) ON CONFLICT (day, q, ok) DO UPDATE SET n = n + 1')
    .bind(day, q, ok).run();
  return true;
}

// Shared checks for guess and miss: a real day near today, a player id, a song number.
function checkPlay(body) {
  const { day, pid, q } = body || {};
  const off = dayOffset(day);
  if (!(off >= -1 && off <= 1)) return 'bad day';
  if (typeof pid !== 'string' || !PID.test(pid)) return 'bad player id';
  if (!Number.isInteger(q) || q < 0 || q >= SONGS) return 'bad song number';
  return null;
}

async function guess(request, env) {
  if (await limited(request, env)) return json({ error: 'slow down' }, 429);
  const body = await readBody(request, 1024);
  const bad = !body ? 'bad request' : checkPlay(body) || (typeof body.g !== 'string' || body.g.length > 100 ? 'bad guess' : null);
  if (bad) return json({ error: bad }, 400);
  const { day, pid, q, g } = body;
  const songs = songsOf(day);
  if (!songs || !songs[q]) return json({ error: 'no song' }, 404);
  if (!matchSong(songs[q].m, g)) return json({ match: false });
  await ensureTables(env);
  const before = await songCounts(env, day, q);
  const counted = await record(request, env, day, pid, q, 1);
  return json({ match: true, counted, song: publicSong(songs[q]), ...before });
}

async function miss(request, env) {
  if (await limited(request, env)) return json({ error: 'slow down' }, 429);
  const body = await readBody(request, 1024);
  const bad = !body ? 'bad request' : checkPlay(body);
  if (bad) return json({ error: bad }, 400);
  const { day, pid, q } = body;
  const songs = songsOf(day);
  if (!songs || !songs[q]) return json({ error: 'no song' }, 404);
  await ensureTables(env);
  const before = await songCounts(env, day, q);
  const counted = await record(request, env, day, pid, q, 0);
  return json({ ok: true, counted, song: publicSong(songs[q]), ...before });
}

async function histOf(env, day) {
  const { results } = await env.DB.prepare('SELECT score, COUNT(*) AS n FROM totals WHERE day = ?1 GROUP BY score').bind(day).all();
  const hist = Array(SONGS + 1).fill(0);
  for (const r of results) if (r.score >= 0 && r.score <= SONGS) hist[r.score] = r.n;
  return hist;
}

async function done(request, env) {
  if (await limited(request, env)) return json({ error: 'slow down' }, 429);
  const body = await readBody(request, 512);
  const { day, pid } = body || {};
  const off = dayOffset(day);
  if (!(off >= -1 && off <= 1)) return json({ error: 'bad day' }, 400);
  if (typeof pid !== 'string' || !PID.test(pid)) return json({ error: 'bad player id' }, 400);
  await ensureTables(env);
  // The score is worked out here from the recorded results, so it can't be made up.
  const row = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(ok), 0) AS score FROM plays WHERE day = ?1 AND pid = ?2').bind(day, pid).first();
  if (!row || row.n < SONGS) return json({ ok: false, error: 'not finished' }, 409);
  let counted = false;
  if (await countsTowardStats(request, env, day, pid)) {
    const ins = await env.DB.prepare('INSERT INTO totals (day, pid, score) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING').bind(day, pid, row.score).run();
    counted = ins.meta.changes === 1;
  }
  return json({ ok: true, counted, score: row.score, hist: await histOf(env, day) });
}

async function stats(request, env, ctx) {
  const url = new URL(request.url);
  const day = url.searchParams.get('day') ?? '';
  const off = dayOffset(day);
  if (!(off <= 1)) return json({ error: 'bad day' }, 400);
  // Cache each day's totals briefly so busy days don't hit the database on every request.
  // (Cloudflare only honours this on a custom domain; on *.workers.dev every request reads the database.)
  const cache = caches.default;
  const key = new Request(`${url.origin}/api/stats?day=${day}`);
  const hit = await cache.match(key);
  if (hit) return hit;
  await ensureTables(env);
  const p = await env.DB.prepare('SELECT COALESCE(SUM(n), 0) AS n FROM counts WHERE day = ?1 AND q = 0').bind(day).first();
  const res = json({ day, players: p?.n || 0, hist: await histOf(env, day) }, 200, {
    'cache-control': `public, max-age=${off < -1 ? 3600 : 120}`,
  });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

async function answers(request, env) {
  const url = new URL(request.url);
  const day = url.searchParams.get('day') ?? '';
  const pid = url.searchParams.get('pid') ?? '';
  const off = dayOffset(day);
  if (!(off <= 1)) return json({ error: 'bad day' }, 400);
  const songs = songsOf(day);
  if (!songs) return json({ error: 'no such day' }, 404);
  await ensureTables(env);
  // A day is over everywhere once it's two UTC days old (time zones run from UTC-12 to UTC+14).
  if (off > -2) {
    if (!PID.test(pid)) return json({ error: 'locked' }, 403);
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM plays WHERE day = ?1 AND pid = ?2').bind(day, pid).first();
    if (!row || row.n < SONGS) return json({ error: 'locked' }, 403);
  }
  const { results } = await env.DB.prepare('SELECT q, ok, n FROM counts WHERE day = ?1').bind(day).all();
  const got = songs.map(() => [0, 0]);
  for (const r of results) if (got[r.q]) { got[r.q][1] += r.n; if (r.ok === 1) got[r.q][0] += r.n; }
  return json({ day, songs: songs.map(publicSong), got }, 200, { 'cache-control': 'private, max-age=60' });
}

// ---------- Tour mode ----------
// Endless runs, so nothing is stored: the server only checks guesses and reveals songs, keeping the answers private.
//   POST /api/tour/guess  { tour, i, g } -> { match } or { match, song }
//   POST /api/tour/reveal { tour, i }    -> { song }   (the player missed or passed; the page counts the strike)
const tourPrepared = new Map();
function tourSong(tour, i) {
  const list = typeof tour === 'string' && Object.hasOwn(TOURS, tour) ? TOURS[tour] : null;
  if (!list || !Number.isInteger(i) || i < 0 || i >= list.length) return null;
  const key = tour + ':' + i;
  if (!tourPrepared.has(key)) tourPrepared.set(key, { ...list[i], m: prepareSong(list[i].t, list[i].a) });
  return tourPrepared.get(key);
}
async function tourGuess(request, env) {
  if (await limited(request, env)) return json({ error: 'slow down' }, 429);
  const body = await readBody(request, 512);
  if (!body || typeof body.g !== 'string' || body.g.length > 100) return json({ error: 'bad request' }, 400);
  const s = tourSong(body.tour, body.i);
  if (!s) return json({ error: 'no such song' }, 404);
  return matchSong(s.m, body.g) ? json({ match: true, song: publicSong(s) }) : json({ match: false });
}
async function tourReveal(request, env) {
  if (await limited(request, env)) return json({ error: 'slow down' }, 429);
  const body = await readBody(request, 256);
  const s = body && tourSong(body.tour, body.i);
  if (!s) return json({ error: 'no such song' }, 404);
  return json({ song: publicSong(s) });
}

// ---------- sync codes ----------
const WORDS = ['riff', 'chorus', 'encore', 'verse', 'bridge', 'tempo', 'vinyl', 'cassette', 'amp', 'drum', 'bass', 'synth',
  'banjo', 'ukulele', 'fiddle', 'kazoo', 'tuba', 'cello', 'piano', 'organ', 'harp', 'sitar', 'groove', 'disco', 'punk', 'grunge',
  'funk', 'soul', 'blues', 'jazz', 'reggae', 'ska', 'polka', 'tango', 'waltz', 'mambo', 'salsa', 'gospel', 'opera', 'ballad',
  'anthem', 'hook', 'setlist', 'roadie', 'backstage', 'soundcheck', 'mixtape', 'jukebox', 'headliner', 'busker', 'falsetto',
  'crescendo', 'tambourine', 'cowbell', 'maracas', 'theremin', 'metronome', 'turntable', 'speaker', 'feedback', 'chord', 'octave',
  'harmony', 'melody'];
const CODE = /^[a-z]+-[a-z]+-[a-z]+-\d{4}$/;
function newCode() {
  const r = crypto.getRandomValues(new Uint32Array(4));
  return `${WORDS[r[0] % WORDS.length]}-${WORDS[r[1] % WORDS.length]}-${WORDS[r[2] % WORDS.length]}-${String(r[3] % 10000).padStart(4, '0')}`;
}
async function sync(request, env) {
  if (await limited(request, env)) return json({ error: 'slow down' }, 429);
  await ensureTables(env);
  if (request.method === 'GET') {
    const code = (new URL(request.url).searchParams.get('code') || '').trim().toLowerCase();
    if (!CODE.test(code)) return json({ error: 'bad code' }, 400);
    const row = await env.DB.prepare('SELECT data, updated FROM sync WHERE code = ?1').bind(await sha('sync|' + code)).first();
    if (!row) return json({ error: 'no such code' }, 404);
    return json({ ok: true, code, data: JSON.parse(row.data), updated: row.updated }, 200, { 'cache-control': 'no-store' });
  }
  const body = await readBody(request, 300000);
  if (!body || typeof body.data !== 'object' || body.data === null) return json({ error: 'bad request' }, 400);
  const { data } = body;
  if (typeof data.pid !== 'string' || !PID.test(data.pid)) return json({ error: 'bad player id' }, 400);
  let code = typeof body.code === 'string' ? body.code.trim().toLowerCase() : '';
  if (code && !CODE.test(code)) return json({ error: 'bad code' }, 400);
  if (code) {
    // only a device that knows a code can update it, and only for the same player
    const row = await env.DB.prepare('SELECT data FROM sync WHERE code = ?1').bind(await sha('sync|' + code)).first();
    if (!row) return json({ error: 'no such code' }, 404);
    if (JSON.parse(row.data).pid !== data.pid) return json({ error: 'different player' }, 409);
  } else {
    code = newCode();
  }
  const text = JSON.stringify(data);
  if (text.length > 250000) return json({ error: 'too big' }, 413);
  await env.DB.prepare('INSERT INTO sync (code, data, updated) VALUES (?1, ?2, ?3) ON CONFLICT (code) DO UPDATE SET data = ?2, updated = ?3')
    .bind(await sha('sync|' + code), text, new Date().toISOString()).run();
  return json({ ok: true, code });
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (pathname === '/api/guess' && request.method === 'POST') return await guess(request, env);
      if (pathname === '/api/miss' && request.method === 'POST') return await miss(request, env);
      if (pathname === '/api/done' && request.method === 'POST') return await done(request, env);
      if (pathname === '/api/stats' && request.method === 'GET') return await stats(request, env, ctx);
      if (pathname === '/api/answers' && request.method === 'GET') return await answers(request, env);
      if (pathname === '/api/sync' && (request.method === 'GET' || request.method === 'POST')) return await sync(request, env);
      if (pathname === '/api/tour/guess' && request.method === 'POST') return await tourGuess(request, env);
      if (pathname === '/api/tour/reveal' && request.method === 'POST') return await tourReveal(request, env);
      return json({ error: 'not found' }, 404);
    } catch (err) {
      // e.g. a daily free-tier limit was hit, or the database isn't set up yet
      console.error(err);
      return json({ error: 'unavailable' }, 503);
    }
  },

  // Runs nightly (see "triggers" in wrangler.jsonc): deletes individual results older than KEEP_DAYS.
  async scheduled(event, env, ctx) {
    const cutoff = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
    ctx.waitUntil(ensureTables(env).then(() => env.DB.batch([
      env.DB.prepare('DELETE FROM plays WHERE day < ?1').bind(cutoff),
      env.DB.prepare('DELETE FROM totals WHERE day < ?1').bind(cutoff),
      env.DB.prepare('DELETE FROM seen WHERE day < ?1').bind(cutoff),
    ])));
  },
};
