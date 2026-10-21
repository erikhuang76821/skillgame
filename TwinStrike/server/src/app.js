// HTTP layer (node:http, no framework). Endpoints and status codes: docs/backend_design.md §2.
import { createServer } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SIMS, GAME_ID, CURRENT_VERSION } from './sims.js';
import { DAY_MS, SUBMIT_GRACE_MS, dayKey, dayStart, isDayKey, dailySeed } from './daily.js';
import { checkSubmission } from './check.js';

const MAX_BODY = 64 * 1024;
const PUBLIC = new Set(['ok', 'cleared']);          // statuses shown on public boards
const REPEAT_REJECTS = 3;                           // forged-looking rejections per day before an account's runs are reviewed
const FORGED = ['replay_failed', 'above_max', 'duplicate_log'];   // wrong_seed / window / offset are usually a stale client
const sha256 = text => createHash('sha256').update(text).digest('hex');

class HttpError extends Error {
  constructor(status, code, detail) { super(code); this.status = status; this.code = code; this.detail = detail; }
}

/**
 * @param store       src/store.js
 * @param secret      daily seed secret (DAILY_SECRET)
 * @param versions    [{ from: 'YYYY-MM-DD', version }] ascending: which sim a NEW day is issued with
 * @param now         clock (tests inject one)
 * @param adminToken  bearer token for /admin/* (null = admin endpoints off)
 */
export function createApp({ store, secret, versions = [{ from: '2000-01-01', version: CURRENT_VERSION }], now = Date.now, adminToken = null, corsOrigin = '*' }) {
  if (!secret) throw new Error('daily secret required');
  for (const v of versions) if (!SIMS.has(v.version)) throw new Error(`sim v${v.version} is scheduled but not loaded (src/sims.js)`);

  const versionFor = date => versions.filter(v => v.from <= date).at(-1)?.version ?? CURRENT_VERSION;

  /** The day's record; issued (and its version pinned) on first request. Future days do not exist yet. */
  function dailyFor(date) {
    const known = store.daily(date);
    if (known) return known;
    if (!isDayKey(date) || dayStart(date) > now()) return null;
    const version = versionFor(date), S = SIMS.get(version), seed = dailySeed(secret, GAME_ID, date);
    return store.putDaily({
      date, game: GAME_ID, version, seed, maxScore: S.maxScore(S.createSim(seed)),
      opensAt: dayStart(date), closesAt: dayStart(date) + DAY_MS,
    });
  }

  const publicDaily = d => ({ ...d, submitUntil: d.closesAt + SUBMIT_GRACE_MS, serverTime: now() });

  function auth(req, required = true) {
    const m = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '');
    const player = m ? store.playerByToken(sha256(m[1])) : null;
    if (!player && required) throw new HttpError(401, 'unauthorized');
    return player;
  }

  function requireAdmin(req) {
    const given = Buffer.from(/^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1] ?? '');
    const want = Buffer.from(adminToken ?? '');
    if (!adminToken || given.length !== want.length || !timingSafeEqual(given, want)) throw new HttpError(403, 'forbidden');
  }

  /** Best public run per player, score desc, earlier submit first on ties. */
  function standings(date) {
    const best = new Map();
    for (const r of store.runsFor(date)) {
      if (!PUBLIC.has(r.status)) continue;
      const b = best.get(r.playerId);
      if (!b || r.score > b.score || (r.score === b.score && r.at < b.at)) best.set(r.playerId, r);
    }
    return [...best.values()].sort((a, b) => b.score - a.score || a.at - b.at);
  }

  const row = (r, i) => ({ rank: i + 1, playerId: r.playerId, name: store.player(r.playerId)?.name ?? '?', score: r.score, ratePermille: r.ratePermille });

  async function readJson(req) {
    let size = 0;
    const chunks = [];
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BODY) throw new HttpError(413, 'too_large');
      chunks.push(c);
    }
    try { return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; } catch { throw new HttpError(400, 'bad_json'); }
  }

  const routes = [
    ['GET', /^\/health$/, () => ({ ok: true, game: GAME_ID, versions: [...SIMS.keys()], today: dayKey(now()) })],

    ['GET', /^\/daily$/, (req, url) => {
      const d = dailyFor(url.searchParams.get('date') ?? dayKey(now()));
      if (!d) throw new HttpError(404, 'no_daily');
      return publicDaily(d);
    }],

    ['POST', /^\/account\/guest$/, async req => {
      const body = await readJson(req);
      const raw = typeof body.name === 'string' ? body.name.replace(/[\p{Cc}\p{Cf}]/gu, '').trim() : '';
      const name = raw ? [...raw].slice(0, 12).join('') : `貓拳手${randomBytes(2).readUInt16BE(0) % 10000}`;
      const token = randomBytes(32).toString('base64url');
      const player = store.addPlayer({ id: `p_${randomBytes(6).toString('hex')}`, name, createdAt: now(), lineSub: null }, sha256(token));
      return { playerId: player.id, name: player.name, token };
    }],

    ['POST', /^\/account\/line$/, () => { throw new HttpError(501, 'not_implemented', 'LINE login: docs/backend_design.md §2.4'); }],

    ['POST', /^\/submit$/, async req => {
      const player = auth(req);
      const body = await readJson(req);
      const date = typeof body.date === 'string' ? body.date : '';
      const daily = isDayKey(date) ? dailyFor(date) : null;
      if (!daily) throw new HttpError(404, 'no_daily');

      const v = checkSubmission(body.upload, daily, now());
      if (!v.ok) {
        if (v.http === 422) store.addReject(date, player.id, v.code);
        throw new HttpError(v.http, v.code, v.detail);
      }

      // Same log already on file: the player's own retry is idempotent; anyone else's copy is rejected.
      const logDigest = sha256(`${body.upload.seed}:${body.upload.log}`);
      const prior = store.runByDigest(date, logDigest);
      if (prior && prior.playerId === player.id) return { runId: prior.id, status: prior.status, score: prior.score, duplicate: true };
      if (prior) { store.addReject(date, player.id, 'duplicate_log'); throw new HttpError(422, 'duplicate_log'); }

      const flags = [...v.flags];
      const counts = store.rejectsFor(date, player.id), rejects = FORGED.reduce((s, c) => s + (counts[c] ?? 0), 0);
      if (rejects >= REPEAT_REJECTS) flags.push({ code: 'repeat_rejects', count: rejects });

      const run = store.addRun({
        playerId: player.id, date, version: daily.version, seed: daily.seed,
        score: v.score, hash: v.hash, ticks: v.ticks, ratePermille: v.ratePermille, breakdown: v.breakdown,
        status: flags.length ? 'review' : 'ok', flags, verifyMs: v.verifyMs, logDigest,
        upload: { log: body.upload.log, choices: body.upload.choices, meta: body.upload.meta }, at: now(),
      });
      const rank = standings(date).findIndex(r => r.id === run.id);
      return { runId: run.id, status: run.status, score: run.score, ratePermille: run.ratePermille, rank: rank >= 0 ? rank + 1 : null };
    }],

    ['GET', /^\/leaderboard\/([^/]+)$/, (req, url, [, date]) => {
      const d = dailyFor(decodeURIComponent(date));
      if (!d) throw new HttpError(404, 'no_daily');
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
      const all = standings(d.date), out = { date: d.date, version: d.version, maxScore: d.maxScore, players: all.length, top: all.slice(0, limit).map(row) };
      const me = auth(req, false);
      if (me) {
        const i = all.findIndex(r => r.playerId === me.id);
        const pending = store.runsFor(d.date).filter(r => r.playerId === me.id && r.status === 'review').sort((a, b) => b.score - a.score)[0];
        out.me = { ...(i >= 0 ? row(all[i], i) : { rank: null, playerId: me.id, name: me.name }), ...(pending && (i < 0 || pending.score > all[i].score) ? { underReview: pending.score } : {}) };
      }
      return out;
    }],

    ['GET', /^\/admin\/review-queue$/, req => {
      requireAdmin(req);
      return store.runsWithStatus('review').map(({ upload, ...r }) => r);
    }],

    ['POST', /^\/admin\/runs\/(\d+)\/review$/, async (req, url, [, id]) => {
      requireAdmin(req);
      const body = await readJson(req);
      if (!['clear', 'void'].includes(body.decision)) throw new HttpError(400, 'bad_decision');
      const run = store.run(Number(id));
      if (!run) throw new HttpError(404, 'no_run');
      const updated = store.updateRun(run.id, {
        status: body.decision === 'clear' ? 'cleared' : 'void',
        review: { decision: body.decision, note: String(body.note ?? '').slice(0, 500), at: now() },
      });
      return { runId: updated.id, status: updated.status };
    }],
  ];

  return createServer(async (req, res) => {
    const headers = {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': corsOrigin,
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
    };
    const send = (status, body) => { res.writeHead(status, headers); res.end(JSON.stringify(body)); };
    if (req.method === 'OPTIONS') { res.writeHead(204, headers); res.end(); return; }
    try {
      const url = new URL(req.url, 'http://localhost');
      for (const [method, re, handler] of routes) {
        const m = re.exec(url.pathname);
        if (m && req.method === method) return send(200, await handler(req, url, m));
      }
      throw new HttpError(404, 'not_found');
    } catch (e) {
      if (e instanceof HttpError) return send(e.status, { error: e.code, ...(e.detail === undefined ? {} : { detail: e.detail }) });
      console.error(e);
      send(500, { error: 'internal' });
    }
  });
}
