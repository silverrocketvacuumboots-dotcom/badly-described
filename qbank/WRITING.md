# Writing Badly Described days

The question bank lives in `qbank/days/*.txt`, seven days per file (`d001-007.txt`, `d008-014.txt` …).
`node qbank/build.mjs` checks every file and writes `public/days.js` (descriptions and hints) and `src/bank.js`
(answers). Cloudflare runs the same build on every push, so a broken bank never goes live.

## Where the bank is up to

```bash
node qbank/list-days.mjs --last      # last day written, and the next day's number and date
node qbank/list-days.mjs             # every day so far, to avoid repeats
node qbank/list-days.mjs --artists   # how often each artist appears
```

Day N is played on day N. Day 1 is `BD_LAUNCH` in `qbank/build.mjs`. The bank loops back to day 1 if it runs
out, so **only ever add days at the end**, and keep about two months ahead.

## Format

```
# 15 Check the Forecast
D: Woman offers to share her weather equipment
S: Umbrella | Rihanna feat. Jay-Z | 2007 | 1441154437
```

- `# N Theme` starts day N. The theme is shown before the day starts, as a clue that links all seven songs.
- Each day has exactly seven `D:`/`S:` pairs.
- `D:` is the bad description (80 characters at most).
- `S:` is `titles | artist | year | Apple track id`.
  - Titles: the first is the one shown; `/` adds other accepted spellings (`9 to 5/Nine to Five/Working 9 to 5`).
    Add common misnamings and short forms players will type, and number words for numbers.
  - Artist: the performer of the best-known version, as credited (`Mark Ronson feat. Bruno Mars`).
  - Year: the original release year of that recording (the album's year if it was on an album first).
  - Track id: see below.
- Lines starting with `//` are comments.

Matching already allows small typos (1 letter in titles of 5+ letters, 2 in 9+), capitals, punctuation, a leading
"the", and the artist typed before or after the title, so you don't need aliases for those.

## Finding the Apple track id

```bash
node qbank/apple.mjs find "Africa" "Toto" "Toto IV"
```

Name the original album: without it, the search often lands on a compilation, a remix or a re-recording. The tool
prints a ready-made `S:` line and flags picks that might not be the original recording. Check the album it chose.
For a batch, put `title<TAB>artist<TAB>album` lines in a file and run `node qbank/apple.mjs find-list file.tsv`.
Searches are spaced 3 seconds apart (Apple allows about 20 a minute).

After adding days, run `node qbank/apple.mjs check`: it looks up every id in the bank and fails if a song has gone
missing or lost its preview. It also notes where Apple's date differs from the bank's year; Apple's dates are
often reissue dates, so check before changing anything.

## Tours

Tour mode's songs live in `qbank/tours/*.txt`, one tour per file. Files are listed in name order (`1-van86.txt`,
`2-lollapaloser93.txt` …), so number new ones.

```
TOUR: van86 | The Van Tour '86 | the Reading Glasses Festival | 80s indie, college radio and the van's mixtape.
D: Flat bike tyre on a hill, nothing to wear, a stranger offers a lift
S: This Charming Man | The Smiths | 1983 | 799980295 | 1
```

- `TOUR:` is the id (lower-case letters and digits) | the tour's name | the festival you headline at the end
  ("the Reading Glasses Festival", shown as "Headlining the Reading Glasses Festival") | a one-line blurb.
- Song lines are like the daily ones with a fifth part, the **cred tier**:
  `1` a hit everyone knows, `2` a fan favourite, `3` a deep cut, `-1` too mainstream (getting it right *costs* cred,
  and the page says so; use it for the songs the record shop guy would sneer at).
- Runs start on tier 1 and drift to tiers 2 and 3 as you climb, so each tour needs at least 12 hits (1 or -1),
  10 fan favourites and 6 deep cuts. About 50 songs a tour keeps repeat runs fresh.
- **Only ever add songs at the END of a tour file.** Songs are asked for by their position in the list, so
  reordering or deleting mixes up runs in progress.
- The same song can't appear twice across the tours, but a tour song can also be a daily song.

## Rules for good descriptions

- **Bad but fair.** Literal, deadpan, slightly wrong-headed, but a fan should get there:
  *"Meteorological event, entirely blokes"*, *"Attempted arson in extremely damp conditions"*.
- **No words from the title or artist.** The build rejects them (use `D!:` for a rare deliberate exception).
  Famous lyric fragments, video moments, film scenes and real facts make great clues.
- **Every fact must be right.** If you're not sure the guitarist really solos outside a chapel, leave it out.
- **Keep lyric quotes short**: a few words, never whole lines.
- **Keep it friendly**: no tragedies involving named people, nothing cruel about artists' looks or lives.

## Rules for good days

- **A theme that helps without giving answers away** ("Check the Forecast": weather songs). Days where the theme
  is a strong hint ("Seven Days": weekdays in every title) are fine now and then, as easy days.
- **Famous songs, mixed decades.** It's an international game: big hits people around the world know, from the
  1950s to now, with a range of difficulty within each day.
- **No repeated songs.** The build rejects the same track or title-and-artist twice. Spread artists out
  (`list-days.mjs --artists`).
- **Previews.** The song must have an Apple preview (`apple.mjs check`).
- Fit the calendar when it's natural: Christmas songs in late December, summer songs in summer.

## After writing a file

```bash
node qbank/build.mjs /tmp/check.js    # checks without touching the real files
node qbank/build.mjs                  # writes public/days.js and src/bank.js
node qbank/apple.mjs check            # every track id still on Apple, with a preview
```

Commit each file with a message like `Add days 15-21 (12 to 18 Dec)`.
