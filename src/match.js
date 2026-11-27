/* Badly Described answer matching, shared by the question builder (qbank/build.mjs) and the API (src/worker.js).
   A song is right if the typed guess matches its title or one of its other spellings, allowing for:
   capitals, punctuation, accents, "&" for "and", a leading "the" or "a", small typos (1 letter in titles of 5+
   letters, 2 in titles of 9+), and the artist's name typed before or after the title ("umbrella rihanna",
   "umbrella by rihanna", "rihanna umbrella"). */
export function norm(s) {
  s = String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ')
    .replace(/['’‘`.!?,]/g, '').replace(/[^a-z0-9]+/g, ' ');
  s = ' ' + s.trim() + ' ';
  s = s.replace(/ n /g, ' and ');
  let out = s.replace(/^ (the|a) /, ' ').replace(/ /g, '');
  if (out.length < 2) out = s.replace(/ /g, '');
  return out;
}

export function lev(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let k = 1; k <= n; k++) cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

// "Title/Other spelling/Another" -> display name and accepted spellings.
export function parseTitles(raw) {
  const names = String(raw).split('/').map((x) => x.trim()).filter(Boolean);
  return { d: names[0] || '', names, al: [...new Set(names.map(norm).filter(Boolean))] };
}

// Ways a player might type the artist: the full credit, and each act in it ("Mark Ronson feat. Bruno Mars").
export function artistForms(artist) {
  const full = String(artist || '');
  const parts = full.split(/\s+(?:feat\.?|ft\.?|featuring|with|&|and|x|vs\.?)\s+|,\s*/i);
  const forms = [...new Set([full, ...parts].map(norm).filter((f) => f.length >= 2))];
  // norm() drops a leading "the", so also allow it typed: "by the smiths", "the cure boys dont cry"
  return [...new Set(forms.flatMap((f) => [f, 'the' + f]))];
}

// Everything matchSong needs, worked out once per song.
export function prepareSong(titles, artist) {
  const t = parseTitles(titles);
  const combos = new Set();
  for (const a of t.al) for (const f of artistForms(artist)) { combos.add(a + f); combos.add(a + 'by' + f); combos.add(f + a); }
  return { d: t.d, names: t.names, al: t.al, combos: [...combos] };
}

const near = (target, c) => {
  if (target.length < 5) return false;
  const lim = target.length >= 9 ? 2 : 1;
  return Math.abs(target.length - c.length) <= lim && lev(target, c) <= lim;
};

export function matchSong(song, input) {
  const c = norm(input);
  if (c.length < 1) return false;
  if (song.al.includes(c) || song.combos.includes(c)) return true;
  return song.al.some((a) => near(a, c)) || song.combos.some((a) => near(a, c));
}

// First letter hint: "The Lady in Red" -> L, "(I've Had) The Time of My Life" -> I, "9 to 5" -> 9.
export function firstLetter(title) {
  const s = String(title).replace(/^[^A-Za-z0-9]+/, '').replace(/^(the|a)\s+/i, '');
  return (s[0] || '?').toUpperCase();
}
