// Apple catalogue helper for the question bank. Needs Node 18+ and an internet connection.
//
//   node qbank/apple.mjs find "Umbrella" "Rihanna"                 the best Apple tracks for a song, ready to paste as an S: line
//   node qbank/apple.mjs find "Africa" "Toto" "Toto IV"            the same, preferring a named album
//   node qbank/apple.mjs find-list songs.tsv                       the same for a list ("title<TAB>artist<TAB>album" per line; album optional)
//   node qbank/apple.mjs check                                     looks up every track id in the bank and flags problems
//
// It prefers the original album recording over remixes, live takes, karaoke and compilations, but always
// check the album it picked; naming the original album helps a lot. Searches are spaced 3.2 seconds apart:
// Apple allows about 20 a minute.
// Only song details are fetched here; preview audio is never downloaded.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { norm } from '../src/match.js';
import { parseDays, parseTours } from './parse.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const COUNTRY = process.env.APPLE_COUNTRY || 'us';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url) {
  for (let tries = 0; ; tries++) {
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    if (r.ok) return r.json();
    if (tries >= 2 || (r.status !== 403 && r.status !== 429 && r.status < 500)) throw new Error(`Apple answered HTTP ${r.status}`);
    await sleep(20000); // rate limited: wait and try again
  }
}

const BAD = /\b(karaoke|tribute|made famous|instrumental|in the style of|originally performed|lullab\w*|8.bit|piano version|cover|backing track|workout|cardio)\b/i;
const COMP = /\b(hits|best of|greatest|collection|essential|masters|soundtrack|number ones|anthology|gold|singles|platinum|pop music|now that|anniversary|deluxe|ultimate)\b/i;
const ALTREC = /\b(remix(es)?|mix(es)?|dub|live|acoustic|karaoke|extended|demo|edit|session|unplugged|re-?recorded)\b/i;
const core = (s) => norm(String(s).replace(/\s*[([][^)\]]*[)\]]/g, '').replace(/\s+-\s+.*$/, ''));
const cleanParen = (s) => String(s)
  .replace(/\s*[([](feat\.?|featuring|with|from)\b[^)\]]*[)\]]/gi, '')
  .replace(/\s*[([][^)\]]*remaster[^)\]]*[)\]]/gi, '')
  .replace(/\s+-\s+[^-]*remaster.*$/i, '');

// Candidates for a song, best first. pen = how likely it's not the original recording (0 = looks right).
export function rank(title, artist, results, album = '') {
  const t = core(title);
  const a = norm(artist).replace(/^the/, '');
  const al = album ? norm(album) : '';
  const out = [];
  const seen = new Set();
  for (const r of results) {
    if (seen.has(r.trackId)) continue;
    seen.add(r.trackId);
    if (r.kind !== 'song') continue;
    const ra = norm(r.artistName || '').replace(/^the/, '');
    if (ra.length < 2 || !(ra.includes(a) || a.includes(ra))) continue; // an artist in another alphabet normalises to nothing
    if (core(r.trackName) !== t) continue;
    if (BAD.test(`${r.trackName} ${r.collectionName}`)) continue;
    let pen = 0;
    if (/[([]/.test(cleanParen(r.trackName))) pen += 3; // a leftover bracket usually means a remix or alternate take
    if (ALTREC.test(r.collectionName || '')) pen += 2;
    if (COMP.test(r.collectionName || '')) pen += 1;
    if (al && norm(r.collectionName || '').startsWith(al)) pen -= 10; // the album asked for
    out.push({ pen, r });
  }
  return out.sort((x, y) => x.pen - y.pen || String(x.r.releaseDate).localeCompare(String(y.r.releaseDate)));
}

async function search(term) {
  const q = new URLSearchParams({ term, entity: 'song', media: 'music', limit: '50', country: COUNTRY });
  return (await getJSON(`https://itunes.apple.com/search?${q}`)).results || [];
}

const line = (title, artist, r) => `S: ${title} | ${artist} | ${String(r.releaseDate || '').slice(0, 4)} | ${r.trackId}`;

async function find(title, artist, album = '', all = true) {
  let results = await search(`${title} ${artist}`);
  // If the named album isn't among the results, search for it directly too.
  if (album && !results.some((r) => norm(r.collectionName || '').startsWith(norm(album)))) {
    await sleep(3200);
    results = results.concat(await search(`${artist} ${album}`));
  }
  const ranked = rank(title, artist, results, album);
  if (!ranked.length) { console.log(`?? ${title} | ${artist}: no match on Apple (${COUNTRY} store)`); return; }
  const best = ranked[0];
  const flag = best.pen > 0 || /[([]/.test(cleanParen(best.r.trackName).replace(/^\(.*?\)\s*/, '')) ? '   <- CHECK: may not be the original recording' : '';
  console.log(`${line(title, artist, best.r)}   // ${best.r.trackName} · ${best.r.artistName} · ${best.r.collectionName}${best.r.previewUrl ? '' : ' · NO PREVIEW'}${flag}`);
  if (all) for (const x of ranked.slice(1, 6)) console.log(`   or ${x.r.trackId}  ${String(x.r.releaseDate).slice(0, 4)}  ${x.r.trackName} · ${x.r.collectionName}`);
}

async function check() {
  const { days, problems } = parseDays(path.join(ROOT, 'days'));
  const t = parseTours(path.join(ROOT, 'tours'));
  if (problems.length || t.problems.length) { console.log([...problems, ...t.problems].join('\n')); process.exit(1); }
  const songs = [...days.flatMap((d) => d.songs.map((s) => ({ ...s, day: d.n }))), ...t.tours.flatMap((x) => x.songs.map((s) => ({ ...s, day: x.id })))];
  const found = new Map();
  for (let i = 0; i < songs.length; i += 150) {
    const ids = songs.slice(i, i + 150).map((s) => s.id).join(',');
    const j = await getJSON(`https://itunes.apple.com/lookup?id=${ids}&country=${COUNTRY}&entity=song`);
    for (const r of j.results || []) if (r.kind === 'song') found.set(String(r.trackId), r);
    await sleep(3200);
  }
  let bad = 0, warn = 0;
  for (const s of songs) {
    const r = found.get(String(s.id));
    const title = s.titles.split('/')[0];
    const tag = `${typeof s.day === "number" ? "#" + s.day : s.day} ${title} (${s.id})`;
    if (!r) { console.log(`ERROR ${tag}: not found in the ${COUNTRY} store`); bad++; continue; }
    if (!r.previewUrl) { console.log(`ERROR ${tag}: no preview`); bad++; }
    const ra = norm(r.artistName), a = norm(s.artist);
    if (!(ra.includes(a.slice(0, 6)) || a.includes(ra.slice(0, 6)))) { console.log(`WARN  ${tag}: Apple's artist is "${r.artistName}"`); warn++; }
    if (core(r.trackName) !== core(title) && !s.titles.split('/').some((t) => core(t) === core(r.trackName))) { console.log(`WARN  ${tag}: Apple's title is "${r.trackName}"`); warn++; }
    const y = Number(String(r.releaseDate || '').slice(0, 4));
    if (y && y !== s.year) { console.log(`note  ${tag}: bank says ${s.year}, Apple's release date says ${y} (${r.collectionName})`); }
  }
  console.log(`\nChecked ${songs.length} songs: ${bad} error(s), ${warn} warning(s).`);
  if (bad) process.exit(1);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'find' && args.length >= 2) await find(args[0], args[1], args[2] || '');
else if (cmd === 'find-list' && args[0]) {
  const rows = fs.readFileSync(args[0], 'utf8').split('\n').map((l) => l.split('\t')).filter((r) => r.length >= 2 && r[0].trim());
  for (const [i, [t, a, al]] of rows.entries()) {
    try { await find(t.trim(), a.trim(), (al || '').trim(), false); } catch (e) { console.log(`?? ${t} | ${a}: ${e.message}`); }
    if (i < rows.length - 1) await sleep(3200);
  }
} else if (cmd === 'check') await check();
else {
  console.log('Usage:\n  node qbank/apple.mjs find "Title" "Artist"\n  node qbank/apple.mjs find-list songs.tsv\n  node qbank/apple.mjs check');
  process.exit(1);
}
