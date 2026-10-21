// Daily puzzle calendar (docs/backend_design.md §3). Days run on Asia/Taipei time (UTC+8, no DST), so a
// day key is pure arithmetic — no Intl / tz database. The seed is an HMAC of the date under a server secret:
// unlike the client's old seedFromString('daily-…'), nobody can compute tomorrow's chart before it opens.
import { createHmac } from 'node:crypto';

export const TZ_OFFSET_MS = 8 * 3600 * 1000;
export const DAY_MS = 24 * 3600 * 1000;
export const SUBMIT_GRACE_MS = 5 * 60 * 1000;   // a 90 s match started at 23:59 + upload retries

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' (Taipei) of a UTC timestamp. */
export const dayKey = ms => new Date(ms + TZ_OFFSET_MS).toISOString().slice(0, 10);
/** UTC timestamp of 00:00 Taipei on `key`. */
export const dayStart = key => Date.parse(`${key}T00:00:00Z`) - TZ_OFFSET_MS;
/** Rejects malformed and impossible dates ('2026-02-31'). */
export const isDayKey = key => typeof key === 'string' && DATE_RE.test(key) && dayKey(dayStart(key)) === key;

/** uint32 seed for (game, date). Changing `secret` changes every future chart; keep it stable and private. */
export function dailySeed(secret, gameId, key) {
  return createHmac('sha256', secret).update(`${gameId}:daily:${key}`).digest().readUInt32BE(0);
}
