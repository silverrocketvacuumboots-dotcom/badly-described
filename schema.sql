-- Badly Described database (Cloudflare D1 / SQLite).
-- You don't need to run this: the Worker creates these tables itself the first time it's used.
-- It's here so you can see what's stored, or set up a database by hand:
--   npx wrangler d1 execute badly-described --remote --file=./schema.sql

-- One row per player, per song, per day. The primary key makes a player's first result the only one that counts.
-- Rows older than 14 days are deleted nightly by the Worker's cron job.
CREATE TABLE IF NOT EXISTS plays (
  day TEXT    NOT NULL,  -- the player's local date, YYYY-MM-DD
  pid TEXT    NOT NULL,  -- random ID kept in the player's browser
  q   INTEGER NOT NULL,  -- song number, 0-6
  ok  INTEGER NOT NULL,  -- 1 = got it, 0 = time ran out or passed
  PRIMARY KEY (day, pid, q)
) WITHOUT ROWID;

-- Running totals per song: how many got it (ok = 1) and how many didn't (ok = 0). Kept forever (they're tiny).
-- Players on a day = SUM(n) WHERE q = 0.
CREATE TABLE IF NOT EXISTS counts (
  day TEXT    NOT NULL,
  q   INTEGER NOT NULL,
  ok  INTEGER NOT NULL,
  n   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, q, ok)
) WITHOUT ROWID;

-- Each finished day's score (0-7), for "you did better than X% of today's players". Deleted after 14 days.
CREATE TABLE IF NOT EXISTS totals (
  day   TEXT    NOT NULL,
  pid   TEXT    NOT NULL,
  score INTEGER NOT NULL,
  PRIMARY KEY (day, pid)
) WITHOUT ROWID;

-- Players seen per connection per day (iph = salted hash of the IP and day). Only the first 3 per connection
-- count towards the stats. Deleted after 14 days.
CREATE TABLE IF NOT EXISTS seen (day TEXT NOT NULL, iph TEXT NOT NULL, pid TEXT NOT NULL, ok INTEGER NOT NULL, PRIMARY KEY (day, iph, pid)) WITHOUT ROWID;

-- Sync codes: a player's progress, saved under a hash of their code so it can be loaded on another device.
CREATE TABLE IF NOT EXISTS sync (code TEXT PRIMARY KEY, data TEXT NOT NULL, updated TEXT NOT NULL) WITHOUT ROWID;
