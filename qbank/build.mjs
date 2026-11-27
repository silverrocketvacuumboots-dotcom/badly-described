// Badly Described question-bank compiler.
// Reads qbank/days/*.txt and qbank/tours/*.txt (formats in qbank/parse.mjs and qbank/WRITING.md), checks every
// song, and writes:
//   public/days.js    the daily sets: each day's theme, descriptions and hints (decade, first letter)
//   public/tours.js   Tour mode: each tour's details and its songs' descriptions, hints and cred tiers
//   src/bank.js       the daily answers, which stay on the server
//   src/tourbank.js   the tour answers, which stay on the server
// It refuses to write anything if there's a problem, and names the file and line.
//
//   node qbank/build.mjs                 build for real
//   node qbank/build.mjs /tmp/check.js   check only: writes /tmp/check.js and friends instead
//   STATS=1 node qbank/build.mjs         also list every day and tour
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { norm, parseTitles, prepareSong, matchSong, firstLetter } from '../src/match.js';
import { parseDays, parseTours } from './parse.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// The day that plays day #1 (players' local midnight). Change it to your launch day before going public.
const LAUNCH = process.env.BD_LAUNCH || '2026-11-28';
const CHECK = process.argv[2];
const OUT = CHECK || path.join(ROOT, '..', 'public', 'days.js');
const BANK = process.env.BANK_OUT || (CHECK ? OUT.replace(/\.js$/, '') + '.bank.js' : path.join(ROOT, '..', 'src', 'bank.js'));
const TOURS_OUT = CHECK ? OUT.replace(/\.js$/, '') + '.tours.js' : path.join(ROOT, '..', 'public', 'tours.js');
const TOURBANK = CHECK ? OUT.replace(/\.js$/, '') + '.tourbank.js' : path.join(ROOT, '..', 'src', 'tourbank.js');
const SONGS_PER_DAY = 7;
const THIS_YEAR = new Date().getUTCFullYear();
// Tour mode ramps up: early rungs draw hits, later ones fan favourites and deep cuts, so each tour needs enough of each.
const TOUR_MIN = { easy: 12, mid: 10, deep: 6 };

// Words a description may share with the title or artist (short words are never checked).
const STOP = new Set(('that this with from your have what when will just like into over been were they them then than ' +
  'about there their only some more very much does dont cant would could should here where which while because before ' +
  'after again also each every both such what whats youre theyre feat featuring').split(' '));
const words = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’]/g, '')
  .split(/[^a-z0-9]+/).filter(Boolean);
function bannedWords(title, artist) {
  const out = new Set();
  for (const w of [...words(title), ...words(artist)]) {
    if (w.length < 4 || STOP.has(w)) continue;
    out.add(w);
    out.add(w.endsWith('s') ? w.slice(0, -1) : w + 's');
  }
  return out;
}

const problems = [];
// The checks every song gets, daily or tour. `seen` catches repeats within one bank.
function checkSong(s, seen, label) {
  const t = parseTitles(s.titles);
  const w = `${s.where} "${t.d}"`;
  if (!t.d) problems.push(`${s.where}: no title`);
  if (!s.artist) problems.push(`${w}: no artist`);
  if (!Number.isInteger(s.year) || s.year < 1900 || s.year > THIS_YEAR + 1) problems.push(`${w}: year "${s.yearRaw}" doesn't look right`);
  if (!/^\d{5,12}$/.test(s.id)) problems.push(`${w}: Apple track id "${s.id}" should be digits (find it with: node qbank/apple.mjs find "title" "artist")`);
  if (!s.d) problems.push(`${s.dWhere}: empty description`);
  if (s.d.length > 80) problems.push(`${s.dWhere}: description is ${s.d.length} characters; keep it under 80`);
  if (!s.skipCheck) {
    const banned = bannedWords(t.d, s.artist);
    const hit = words(s.d).filter((x) => banned.has(x));
    if (hit.length) problems.push(`${s.dWhere}: description gives away "${[...new Set(hit)].join('", "')}" from the title or artist (use D!: if that's deliberate)`);
  }
  const song = prepareSong(s.titles, s.artist);
  for (const nm of t.names) if (!matchSong(song, nm)) problems.push(`${w}: typing "${nm}" wouldn't be accepted`);
  if (seen.id.has(s.id)) problems.push(`${w}: same Apple track as ${seen.id.get(s.id)}`); else seen.id.set(s.id, label);
  const key = norm(t.d) + '|' + norm(s.artist);
  if (seen.song.has(key)) problems.push(`${w}: already used in ${seen.song.get(key)}`); else seen.song.set(key, label);
  return t;
}
const decade = (y) => `${Math.floor(y / 10) * 10}s`;

/* ---------- the daily sets ---------- */
const daily = parseDays(path.join(ROOT, 'days'));
problems.push(...daily.problems);
const days = daily.days.sort((a, b) => a.n - b.n);
const seenDaily = { id: new Map(), song: new Map() };
let expected = 1;
for (const d of days) {
  if (d.n !== expected) problems.push(`${d.where}: day ${d.n}, but expected day ${expected}`);
  expected = d.n + 1;
  if (!d.theme) problems.push(`${d.where}: day ${d.n} has no theme (put it after the number: "# ${d.n} Check the Forecast")`);
  if (d.theme.length > 40) problems.push(`${d.where}: theme is longer than 40 characters`);
  if (d.songs.length !== SONGS_PER_DAY) problems.push(`${d.where}: day ${d.n} has ${d.songs.length} songs, needs ${SONGS_PER_DAY}`);
  for (const s of d.songs) checkSong(s, seenDaily, `day ${d.n}`);
}
if (!days.length) problems.push('no days found in qbank/days/*.txt');

/* ---------- the tours ---------- */
const tourData = parseTours(path.join(ROOT, 'tours'));
problems.push(...tourData.problems);
const tours = tourData.tours;
const seenTours = { id: new Map(), song: new Map() }, tourIds = new Set();
for (const t of tours) {
  if (!/^[a-z0-9]{2,24}$/.test(t.id)) problems.push(`${t.where}: tour id "${t.id}" should be 2-24 lower-case letters and digits`);
  if (tourIds.has(t.id)) problems.push(`${t.where}: tour id "${t.id}" used twice`); tourIds.add(t.id);
  if (!t.name || t.name.length > 40) problems.push(`${t.where}: tour name should be 1-40 characters`);
  if (!t.fest || t.fest.length > 60) problems.push(`${t.where}: festival should be 1-60 characters`);
  if (t.blurb.length > 120) problems.push(`${t.where}: blurb is longer than 120 characters`);
  for (const s of t.songs) {
    checkSong(s, seenTours, `tour ${t.id}`);
    if (![-1, 1, 2, 3].includes(s.tier)) problems.push(`${s.where}: cred tier "${s.tierRaw}" should be 1, 2, 3 or -1`);
  }
  const n = { easy: t.songs.filter((s) => s.tier === 1 || s.tier === -1).length, mid: t.songs.filter((s) => s.tier === 2).length, deep: t.songs.filter((s) => s.tier === 3).length };
  for (const k of Object.keys(TOUR_MIN)) if (n[k] < TOUR_MIN[k]) problems.push(`${t.where}: tour ${t.id} has ${n[k]} ${k} songs, needs at least ${TOUR_MIN[k]}`);
  t.counts = n;
}

if (problems.length) {
  console.log(problems.join('\n'));
  console.log(`\n${problems.length} problem(s); not writing.`);
  process.exit(1);
}

const head = `/* Badly Described question bank (built ${new Date().toISOString().slice(0, 10)} by qbank/build.mjs; don't edit by hand).
   BD_LAUNCH is the day that plays day #1 (players' local midnight). Day N is played on day N, in this order;
   when the list runs out it loops back to the start. Add new days to the END only, and keep the list longer
   than the number of days you've been running, so past days never change.

   Descriptions and hints only: the answers live in src/bank.js on the server.
   th: theme, d: description, h: [decade, first letter] hints.  */
window.BD_LAUNCH = '${LAUNCH}';
window.BD_DAYS = [
`;
const body = days.map((d) => `{th:${JSON.stringify(d.theme)},s:[\n` + d.songs.map((s) => {
  const t = parseTitles(s.titles);
  return `{d:${JSON.stringify(s.d)},h:${JSON.stringify([decade(s.year), firstLetter(t.d)])}}`;
}).join(',\n') + ']}').join(',\n');
fs.writeFileSync(OUT, head + body + '\n];\n');
fs.writeFileSync(BANK, `// Built by qbank/build.mjs. Do not edit: change qbank/days/*.txt and rebuild.\n` +
  `export const LAUNCH = '${LAUNCH}';\n` +
  `export const DAYS = ${JSON.stringify(days.map((d) => d.songs.map((s) => ({ t: s.titles, a: s.artist, y: s.year, id: Number(s.id) }))))};\n`);

const toursHead = `/* Badly Described Tour mode (built ${new Date().toISOString().slice(0, 10)} by qbank/build.mjs; don't edit by hand).
   Descriptions, hints and cred tiers only: the answers live in src/tourbank.js on the server.
   A song is asked for by its tour id and its position in that tour's list, so only ever add songs at the END of a
   tour file; changing the order would mix up runs that are in progress.
   d: description, h: [decade, first letter], c: cred tier (1 hit, 2 fan favourite, 3 deep cut, -1 too mainstream).  */
window.BD_TOURS = [
`;
fs.writeFileSync(TOURS_OUT, toursHead + tours.map((t) => `{id:${JSON.stringify(t.id)},name:${JSON.stringify(t.name)},fest:${JSON.stringify(t.fest)},blurb:${JSON.stringify(t.blurb)},s:[\n` +
  t.songs.map((s) => `{d:${JSON.stringify(s.d)},h:${JSON.stringify([decade(s.year), firstLetter(parseTitles(s.titles).d)])},c:${s.tier}}`).join(',\n') + ']}').join(',\n') + '\n];\n');
fs.writeFileSync(TOURBANK, `// Built by qbank/build.mjs. Do not edit: change qbank/tours/*.txt and rebuild.\n` +
  `export const TOURS = ${JSON.stringify(Object.fromEntries(tours.map((t) => [t.id, t.songs.map((s) => ({ t: s.titles, a: s.artist, y: s.year, id: Number(s.id) }))])))};\n`);

const rel = (p) => path.relative(process.cwd(), p);
console.log(`wrote ${rel(OUT)}: ${days.length} days; ${rel(TOURS_OUT)}: ${tours.length} tours (${tours.reduce((n, t) => n + t.songs.length, 0)} songs); answers in ${rel(BANK)} and ${rel(TOURBANK)}`);
if (process.env.STATS) {
  const dateOf = (n) => { const x = new Date(LAUNCH + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n - 1); return x.toISOString().slice(0, 10); };
  for (const d of days) console.log(`#${String(d.n).padStart(3)} ${dateOf(d.n)}  ${d.theme.padEnd(28)} ${d.songs.map((s) => parseTitles(s.titles).d).join(' · ')}`);
  for (const t of tours) console.log(`tour ${t.id.padEnd(16)} ${t.name.padEnd(26)} ${t.songs.length} songs: ${t.counts.easy} hits, ${t.counts.mid} favourites, ${t.counts.deep} deep cuts`);
}
