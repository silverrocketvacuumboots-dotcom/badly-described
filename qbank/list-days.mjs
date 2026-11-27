// Lists every day in the bank with its date, theme and songs, so a new batch can avoid repeats.
//   node qbank/list-days.mjs            every day
//   node qbank/list-days.mjs --last     the last day written, and the next day's number and date
//   node qbank/list-days.mjs --artists  how often each artist appears
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDays } from './parse.mjs';
import { parseTitles } from '../src/match.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const LAUNCH = process.env.BD_LAUNCH || '2026-11-28';
const dateOf = (n) => { const d = new Date(LAUNCH + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n - 1); return d.toISOString().slice(0, 10); };
const { days, problems } = parseDays(path.join(ROOT, 'days'));
if (problems.length) console.log(problems.join('\n') + '\n');
days.sort((a, b) => a.n - b.n);
const last = days.length ? days[days.length - 1].n : 0;
if (process.argv.includes('--last')) {
  console.log(`last day: ${last} (${dateOf(last)}); next: ${last + 1} (${dateOf(last + 1)})`);
} else if (process.argv.includes('--artists')) {
  const c = new Map();
  for (const d of days) for (const s of d.songs) c.set(s.artist, [...(c.get(s.artist) || []), d.n]);
  for (const [a, ns] of [...c].sort((x, y) => y[1].length - x[1].length || x[0].localeCompare(y[0]))) console.log(`${String(ns.length).padStart(3)}  ${a}  (days ${ns.join(', ')})`);
} else {
  for (const d of days) {
    console.log(`#${String(d.n).padStart(3)} ${dateOf(d.n)}  ${d.theme}`);
    for (const s of d.songs) console.log(`       ${parseTitles(s.titles).d} · ${s.artist} · ${s.year}`);
  }
}
