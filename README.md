# Badly Described

A daily music game. Every day there are seven famous songs, each described as badly as possible, plus a theme that links them. Players type the title within 25 seconds. Each right answer moves them one step up a career ladder, from busking outside the station to headlining Glastonbury. When a song ends, its 30-second Apple Music preview plays.

It runs on Cloudflare's free tier, like Boreen: the game is a static page, and a small Worker checks guesses and records results in a D1 (SQLite) database.

```
public/index.html    the game
public/days.js       each day's theme, descriptions and hints, no answers (built from qbank/, don't edit by hand)
src/bank.js          the answers, kept on the server (also built from qbank/)
src/match.js         how typed guesses are matched to titles (typos, "the", artist names, other spellings)
src/worker.js        the API: guess, miss, done, stats, answers, sync
qbank/days/*.txt     the question bank, seven days per file
qbank/build.mjs      checks the bank and builds days.js and bank.js
qbank/apple.mjs      finds Apple track ids for songs, and checks every id in the bank
schema.sql           what the database stores (the Worker creates the tables itself)
wrangler.jsonc       Cloudflare config
public/og.png        share preview image; favicon.svg
```

## Put it online

Nothing is deployed yet. These steps connect the GitHub repo to Cloudflare, so every push to `main` goes live the same way Boreen does.

1. **Make the database.** In the Cloudflare dashboard, go to **Storage & Databases → D1 SQL Database → Create**. Name it `badly-described` and pick the location closest to most of your players. Copy its **Database ID**.
2. **Put the ID in the config.** It goes in `wrangler.jsonc` as `database_id` (done for this game). The Worker creates its own tables on first use, so there's nothing else to set up in the database.
3. **Connect the repo.** Go to **Workers & Pages → Create → Import a repository**, pick `badly-described`, and set:
   - Project name: `badly-described` (it must match `"name"` in `wrangler.jsonc`)
   - Build command: `node qbank/build.mjs` (so a broken question bank never goes live)
   - Deploy command: leave the default, `npx wrangler deploy`
4. **Play it.** It goes live at https://badly-described.theshedd.workers.dev. Until the launch date it plays day 1. If the Worker's **Settings → Domains & Routes** shows workers.dev as Disabled, click Enable (the config also switches it on with every deploy).

### Before going public

- **Launch date.** Day 1 is played on `BD_LAUNCH` in `qbank/build.mjs`, currently `2026-11-28`. Change it to your launch day; every day number follows from it. Changing it after launch renumbers every day, so set it once.
- **Apple's badge.** The reveal uses Apple's official "Listen on Apple Music" badge (`public/apple-music-badge.svg`, downloaded unchanged from Apple's marketing tools). Apple's rules: don't edit, tilt or animate it, keep it at least 30 px tall with clear space around it. Joining Apple's affiliate programme (Apple Services Performance Partners) would also earn a commission on those links.
- **Domain.** Add a custom domain to the Worker under **Settings → Domains & Routes**, then change the `og:image` address in `public/index.html` to match. Cloudflare only caches the daily stats on a custom domain, which keeps database reads down.
- **Salt (optional).** Set a secret called `IP_SALT` on the Worker (**Settings → Variables and Secrets**). It changes how connections are hashed for the "3 players per connection" rule.

## Song previews and Apple's terms

When a song ends, the player's browser asks Apple for the track's preview and streams it straight from Apple. Nothing is downloaded or stored, and this Worker never contacts Apple. Apple's conditions for previews, which the game follows:

- streamed only, never downloaded, saved or cached;
- shown next to Apple's official badge linking to the song, with the line "Preview provided courtesy of iTunes";
- used to promote the song, not as entertainment on their own. That's why the preview only plays after the answer, as the reveal, never as the clue.

If Apple ever objects, the fallback is an official embedded player (Spotify, YouTube or Apple Music) in the reveal.

## Adding days

The bank holds 14 days. Days loop after the last one, so **add days at the end** and keep about two months ahead. The full guide is in `qbank/WRITING.md`; the short version:

```bash
node qbank/list-days.mjs --last                                   # where the bank is up to
node qbank/apple.mjs find "Africa" "Toto" "Toto IV"               # the Apple track id for a song
node qbank/build.mjs                                              # check everything and rebuild
node qbank/apple.mjs check                                        # check every track id still has a preview
```

## Tour mode (beta)

Tour mode lives at `/tour` (https://badly-described.theshedd.workers.dev/tour), linked from the daily page's home
screen ("Tour mode (beta)").

Pick a tour, then climb 12 rungs from busking to headlining that tour's festival, one badly described song at a
time. Three misses and the band splits, announced on Music News; then you get back in the van and try again.
Fans and Cred build up across every run. The songs get deeper the higher you climb.

Along the way:

- **Rung 3** is a live session on a small, famous station (RTR FM, FBi Radio, 4ZZZ, 3RRR, KEXP, KROQ, WFMU, KCRW, NTS),
  using the name it had in the tour's era (KCMU before KEXP).
- **Dez**, behind the counter at Second Pressings Records, has an opinion on every song.
- **The road:** after rungs 2, 5, 8 and 11 there's a chance of a legendary night (reviewed by Pitchblende) or a front
  page in one of the music weeklies, New Musical Excess and Melody Faker: news from the tour's decades with your band
  in the story. After the first strike there's a chance of a famous flop. Each one goes in the Bootleg Archive.
- **The best new band in Britain:** the weeklies crown you after rungs 1, 4, 7 and 10 and on every front page, with a
  strapline that gets more desperate each time.

```
public/tour.html      the page: tours, runs, the spinning telly, the theme song, and the lore: EVENTS (Pitchblende),
                      NEWS (front pages), STATIONS (radio sessions), DEZ (the record shop)
public/tours.js       each tour's descriptions, hints and cred tiers, no answers (built from qbank/tours/)
src/tourbank.js       the tour answers, kept on the server (also built)
qbank/tours/*.txt     one tour per file, listed in file-name order
```

Tour mode stores nothing on the server: `/api/tour/guess` checks a title and `/api/tour/reveal` shows a missed song.
Progress lives in the player's browser. To add songs or a whole tour, see `qbank/WRITING.md`.

The hosts, shows, channel, papers and events are all made-up parodies. Keep it that way: nods that people in the know
will get, not real logos, footage or likenesses, nothing about real tragedies, and no invented incidents pinned on
real, named people. Everything that happens, happens to the player's band. Real radio stations appear only as places
the band plays a session. Event ids are saved in players' archives, so never rename or reuse one; add new events at
the end of `EVENTS` or `NEWS`.

## Try it on your own computer

```bash
npm install
npx wrangler dev      # http://localhost:8787, with a local test database
```

## Limits and costs

Cloudflare's free plan allows 100,000 Worker requests and 100,000 D1 rows written a day. A player uses about 12 requests (7 results, a few wrong guesses, the stats) and about 25 rows written (16 when they play, 9 when the nightly clean-up deletes their results two weeks later). That's a few thousand players a day before the US$5/month Workers Paid plan is needed. The page itself is a static file and is free. Apple previews come from Apple, not Cloudflare.

## Keeping an eye on it

- **Players per day:** `npm run stats`
- **How each song went on a day:** `npx wrangler d1 execute badly-described --remote --command "SELECT q, ok, n FROM counts WHERE day = '2026-12-01' ORDER BY q, ok"`
- **Abuse:** `/api/*` takes at most 60 requests a minute from one connection. Change it under `ratelimits` in `wrangler.jsonc`.
