// Badly Described question-bank compiler.
// Reads qbank/days/*.txt (format in qbank/parse.mjs and qbank/WRITING.md), checks every day, and writes:
//   public/days.js   what the page gets: each day's theme, the seven descriptions, and the hints (decade, first letter)
//   src/bank.js      the answers (title, other spellings, artist, year, Apple track id), which stay on the server
// It refuses to write anything if there's a problem, and names the file and line.
//
//   node qbank/build.mjs                 build for real
//   node qbank/build.mjs /tmp/check.js   check only: writes to /tmp/check.js and /tmp/check.bank.js instead
//   STATS=1 node qbank/build.mjs         also list every day
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { norm, parseTitles, prepareSong, matchSong, firstLetter } from '../src/match.js';
import { parseDays } from './parse.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// The day that plays day #1 (players' local midnight). Change it to your launch day before going public.
const LAUNCH = process.env.BD_LAUNCH || '2026-11-28';
const OUT = process.argv[2] || path.join(ROOT, '..', 'public', 'days.js');
const BANK = process.env.BANK_OUT || (process.argv[2] ? OUT.replace(/\.js$/, '') + '.bank.js' : path.join(ROOT, '..', 'src', 'bank.js'));
const SONGS_PER_DAY = 7;
const THIS_YEAR = new Date().getUTCFullYear();

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

const { days, problems } = parseDays(path.join(ROOT, 'days'));
const seenId = new Map();
const seenSong = new Map();
let expected = 1;
for (const d of days.sort((a, b) => a.n - b.n)) {
  if (d.n !== expected) problems.push(`${d.where}: day ${d.n}, but expected day ${expected}`);
  expected = d.n + 1;
  if (!d.theme) problems.push(`${d.where}: day ${d.n} has no theme (put it after the number: "# ${d.n} Check the Forecast")`);
  if (d.theme.length > 40) problems.push(`${d.where}: theme is longer than 40 characters`);
  if (d.songs.length !== SONGS_PER_DAY) problems.push(`${d.where}: day ${d.n} has ${d.songs.length} songs, needs ${SONGS_PER_DAY}`);
  for (const s of d.songs) {
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
    for (const a of t.al) if (a.length < 1) problems.push(`${w}: empty spelling`);
    const song = prepareSong(s.titles, s.artist);
    for (const nm of t.names) if (!matchSong(song, nm)) problems.push(`${w}: typing "${nm}" wouldn't be accepted`);
    if (seenId.has(s.id)) problems.push(`${w}: same Apple track as day ${seenId.get(s.id)}`); else seenId.set(s.id, d.n);
    const key = norm(t.d) + '|' + norm(s.artist);
    if (seenSong.has(key)) problems.push(`${w}: already used on day ${seenSong.get(key)}`); else seenSong.set(key, d.n);
  }
}
if (!days.length) problems.push('no days found in qbank/days/*.txt');

if (problems.length) {
  console.log(problems.join('\n'));
  console.log(`\n${problems.length} problem(s); not writing.`);
  process.exit(1);
}

const decade = (y) => `${Math.floor(y / 10) * 10}s`;
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
const bank = `// Built by qbank/build.mjs. Do not edit: change qbank/days/*.txt and rebuild.\n` +
  `export const LAUNCH = '${LAUNCH}';\n` +
  `export const DAYS = ${JSON.stringify(days.map((d) => d.songs.map((s) => ({ t: s.titles, a: s.artist, y: s.year, id: Number(s.id) }))))};\n`;
fs.writeFileSync(OUT, head + body + '\n];\n');
fs.writeFileSync(BANK, bank);
console.log(`wrote ${path.relative(process.cwd(), OUT)}: ${days.length} days (descriptions only); answers in ${path.relative(process.cwd(), BANK)}`);
if (process.env.STATS) {
  const dateOf = (n) => { const x = new Date(LAUNCH + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n - 1); return x.toISOString().slice(0, 10); };
  for (const d of days) console.log(`#${String(d.n).padStart(3)} ${dateOf(d.n)}  ${d.theme.padEnd(28)} ${d.songs.map((s) => parseTitles(s.titles).d).join(' · ')}`);
}
