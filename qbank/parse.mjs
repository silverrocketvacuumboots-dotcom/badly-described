// Reads the question bank: qbank/days/*.txt, five or so days per file.
//
//   # 12 Check the Forecast                                   <- day number, then the day's theme
//   D: Woman offers to share her weather equipment            <- the bad description (D!: skips the word check)
//   S: Umbrella | Rihanna | 2007 | 1441154437                 <- titles (/ for other spellings) | artist | year | Apple track id
//
// Seven D:/S: pairs per day. Lines starting with // are comments.
import fs from 'node:fs';
import path from 'node:path';

export function parseDays(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort();
  const days = [];
  const problems = [];
  let cur = null;
  let pendingD = null;
  for (const f of files) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
    lines.forEach((ln, i) => {
      const where = `${f}:${i + 1}`;
      ln = ln.trim();
      if (!ln || ln.startsWith('//')) return;
      const h = ln.match(/^#\s*(\d+)\s*(.*)$/);
      if (h) {
        if (pendingD) problems.push(`${pendingD.where}: description without a song line`);
        pendingD = null;
        cur = { n: +h[1], theme: h[2].trim(), songs: [], where };
        days.push(cur);
        return;
      }
      const d = ln.match(/^D(!?):\s*(.*)$/);
      if (d) {
        if (!cur) { problems.push(`${where}: description before any "# day" line`); return; }
        if (pendingD) problems.push(`${pendingD.where}: description without a song line`);
        pendingD = { text: d[2].trim(), skipCheck: d[1] === '!', where };
        return;
      }
      const s = ln.match(/^S:\s*(.*)$/);
      if (s) {
        if (!cur || !pendingD) { problems.push(`${where}: song line without a description above it`); return; }
        const parts = s[1].split('|').map((x) => x.trim());
        if (parts.length !== 4) { problems.push(`${where}: song line needs 4 parts (titles | artist | year | track id), found ${parts.length}`); pendingD = null; return; }
        const [titles, artist, year, id] = parts;
        cur.songs.push({ d: pendingD.text, skipCheck: pendingD.skipCheck, dWhere: pendingD.where, titles, artist, year: Number(year), yearRaw: year, id, where });
        pendingD = null;
        return;
      }
      problems.push(`${where}: can't read line: ${ln.slice(0, 60)}`);
    });
  }
  if (pendingD) problems.push(`${pendingD.where}: description without a song line`);
  return { days, problems };
}
