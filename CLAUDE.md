# Badly Described

A daily music game: seven famous songs described badly, 25 seconds each; each right answer moves the player one step
up a career ladder (busking to headlining Glastonbury), and each song's Apple Music preview plays when it ends.
Cloudflare Worker (`src/worker.js`) + D1 database + a single-page front end (`public/index.html`), built on Boreen's engine.
Once connected (see README), pushes to `main` deploy automatically through Cloudflare's GitHub integration.

- Writing or adding days: follow `qbank/WRITING.md`.
- Never edit `public/days.js` or `src/bank.js` by hand; both are built from `qbank/days/*.txt` (`node qbank/build.mjs`).
  The page gets descriptions and hints only. The server checks guesses (`/api/guess`), reveals a song only once the
  player has got it or missed it (`/api/miss`), and releases a day's songs (`/api/answers`) only to players who've
  finished it, or once the day is over everywhere (two UTC days old).
- Answer matching lives in `src/match.js`, shared by the builder and the Worker.
- Song previews: the page looks each track id up with Apple's lookup API and streams the preview from Apple. Apple's
  terms: stream only (never download, cache or store audio), keep the Apple Music link and "Preview provided courtesy
  of iTunes" next to the player, and use previews to promote the song: they're the reveal, never the clue. The badge
  (`public/apple-music-badge.svg`) is Apple's artwork: never edit, tilt or animate it; keep it 30px+ tall.
- Track ids: `node qbank/apple.mjs find "Title" "Artist" "Original album"`; `node qbank/apple.mjs check` verifies the
  whole bank. Behind an HTTPS proxy, run Node with `NODE_USE_ENV_PROXY=1`.
- Only add days at the end of the bank; never renumber or remove days that may already have been played.
- Each day only the first 3 players per connection count towards stats (`seen` table, salted per-day IP hash; set an
  `IP_SALT` secret in Cloudflare to change the salt). Sync codes (`/api/sync`) carry a player's progress between devices.
- The rate-limit `namespace_id` in `wrangler.jsonc` (1002) must differ from Boreen's (1001) on the same account.
- Tour mode (beta): `public/tour.html` (served at `/tour`, linked from the daily page's home screen). Tours live in
  `qbank/tours/*.txt` (format in `qbank/WRITING.md`; the TOUR line's optional fifth part is the decades its news comes
  from) and build into `public/tours.js` (no answers) and `src/tourbank.js`.
  `/api/tour/guess` and `/api/tour/reveal` store nothing; runs, fans and cred live in the player's browser
  (`bd:tour:*` in localStorage). Only add tour songs at the end of a file: they're addressed by position.
- Tour lore lives in `public/tour.html`: `EVENTS` (Pitchblende-reviewed nights and flops), `NEWS` (front pages from the
  parody weeklies New Musical Excess and Melody Faker, by decade), `STATIONS` (rung 3's radio session), `DEZ` (the
  record shop snob), and the "best new band in Britain" straplines (`BNB`). Event ids are saved in players' archives
  (`bd:tour:archive`): add at the end, never rename or reuse one.
- Tone for Tour mode: snobbish and self-aware, all hosts, shows and events are original parodies. No real logos,
  footage or likenesses; no real tragedies, violence or illness; no invented incidents pinned on real, named people;
  parody publications only (Pitchblende, New Musical Excess, Melody Faker). Everything that happens, happens to the
  player's band; real radio stations appear only as places the band plays a session.
