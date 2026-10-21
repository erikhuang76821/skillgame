// End-to-end tests over HTTP: the server verifies with the game's own sim (no copy).
import test from 'node:test';
import assert from 'node:assert/strict';
import { playMatch } from '../../game/src/sim/core/index.js';
import { GAME, SUB, IN_L, IN_R, encode } from '../../game/src/sim/sim.js';
import { BOTS } from '../../game/tools/bots.mjs';
import { createApp } from '../src/app.js';
import { createStore } from '../src/store.js';
import { dailySeed, dayKey, dayStart, DAY_MS, SUBMIT_GRACE_MS } from '../src/daily.js';
import { checkSubmission } from '../src/check.js';

const SECRET = 'test-secret';
const ADMIN = 'admin-test-token';
const NOON = Date.parse('2026-10-21T12:00:00+08:00');

/** Taps every note exactly on time: zero timing spread, 100 % — a textbook input bot. */
const perfect = {
  input(sim) {
    let i = sim.judge.next;
    while (i < sim.chart.length && sim.judge.grade[i] >= 0) i++;
    const n = sim.chart[i];
    return n && Math.floor(n.t / SUB) === sim.tick ? encode(n.lane ? IN_R : IN_L, n.t % SUB) : 0;
  },
};

async function boot(t, opts = {}) {
  const clock = { now: NOON };
  const server = createApp({ store: createStore(), secret: SECRET, adminToken: ADMIN, now: () => clock.now, ...opts });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { token, body } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
  const guest = async name => (await call('POST', '/account/guest', { body: { name } })).body;
  return { clock, call, guest };
}

const play = (seed, bot = BOTS.intermediate) => {
  const up = playMatch(GAME, seed, bot).upload();
  up.meta = { inputOffsetMs: 12, audioLatencyMs: 40, lateTaps: 0 };
  return up;
};

test('GET /daily: Taipei date, secret HMAC seed, future days hidden', async t => {
  const { clock, call } = await boot(t);
  const d = (await call('GET', '/daily')).body;
  assert.equal(d.date, '2026-10-21');
  assert.equal(d.seed, dailySeed(SECRET, 'twin-strike', '2026-10-21'));
  assert.equal(d.version, GAME.version);
  assert.equal(d.opensAt, Date.parse('2026-10-21T00:00:00+08:00'));
  assert.equal(d.closesAt - d.opensAt, DAY_MS);
  assert.equal((await call('GET', '/daily?date=2026-10-22')).status, 404, 'tomorrow is not public yet');
  assert.equal((await call('GET', '/daily?date=2026-02-31')).status, 404);

  clock.now = Date.parse('2026-10-21T16:30:00Z');                          // 00:30 on the 22nd in Taipei
  assert.equal((await call('GET', '/daily')).body.date, '2026-10-22');
  assert.equal(dayKey(dayStart('2026-10-22')), '2026-10-22');
});

test('legal upload is accepted and ranked', async t => {
  const { call, guest } = await boot(t);
  const a = await guest('阿喵'), b = await guest('小虎');
  const d = (await call('GET', '/daily')).body;
  const upA = play(d.seed, BOTS.expert), upB = play(d.seed, BOTS.intermediate);

  const ra = await call('POST', '/submit', { token: a.token, body: { date: d.date, upload: upA } });
  assert.equal(ra.status, 200, JSON.stringify(ra.body));
  assert.equal(ra.body.status, 'ok');
  assert.equal(ra.body.score, upA.score);
  const rb = await call('POST', '/submit', { token: b.token, body: { date: d.date, upload: upB } });
  assert.equal(rb.body.status, 'ok');

  const again = await call('POST', '/submit', { token: a.token, body: { date: d.date, upload: upA } });
  assert.equal(again.body.duplicate, true, 'own retry is idempotent');

  const lb = (await call('GET', `/leaderboard/${d.date}`, { token: b.token })).body;
  assert.equal(lb.players, 2);
  assert.deepEqual(lb.top.map(r => r.name), upA.score >= upB.score ? ['阿喵', '小虎'] : ['小虎', '阿喵']);
  assert.equal(lb.me.name, '小虎');
});

test('tampered score is rejected', async t => {
  const { call, guest } = await boot(t);
  const p = await guest();
  const d = (await call('GET', '/daily')).body;
  const up = play(d.seed);
  const r = await call('POST', '/submit', { token: p.token, body: { date: d.date, upload: { ...up, score: up.score + 10 } } });
  assert.equal(r.status, 422);
  assert.equal(r.body.error, 'replay_failed');
  assert.equal(r.body.detail, 'score/hash mismatch');

  const forged = { ...up, score: up.score + 10, hash: (up.hash + 1) >>> 0 };
  assert.equal((await call('POST', '/submit', { token: p.token, body: { date: d.date, upload: forged } })).body.error, 'replay_failed');
  assert.equal((await call('GET', `/leaderboard/${d.date}`)).body.players, 0);
});

test('sim version mismatch is rejected with the version the day needs', async t => {
  const { call, guest } = await boot(t);
  const p = await guest();
  const d = (await call('GET', '/daily')).body;
  const r = await call('POST', '/submit', { token: p.token, body: { date: d.date, upload: { ...play(d.seed), version: GAME.version - 1 } } });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'version_mismatch');
  assert.deepEqual(r.body.detail, { need: GAME.version });
});

test('score above the theoretical max is rejected before replay', async t => {
  const { call, guest } = await boot(t);
  const p = await guest();
  const d = (await call('GET', '/daily')).body;
  const r = await call('POST', '/submit', { token: p.token, body: { date: d.date, upload: { ...play(d.seed), score: d.maxScore + 1 } } });
  assert.equal(r.status, 422);
  assert.equal(r.body.error, 'above_max');
  assert.equal(r.body.detail.max, d.maxScore);
});

test('wrong seed, closed window, offset out of range, copied log, no auth', async t => {
  const { clock, call, guest } = await boot(t);
  const p = await guest(), q = await guest();
  const d = (await call('GET', '/daily')).body;
  const up = play(d.seed);
  const submit = (who, upload, date = d.date) => call('POST', '/submit', { token: who?.token, body: { date, upload } });

  assert.equal((await submit(null, up)).status, 401);
  assert.equal((await submit(p, play(1234))).body.error, 'wrong_seed');
  assert.equal((await submit(p, { ...up, meta: { ...up.meta, inputOffsetMs: 151 } })).body.error, 'offset_out_of_range');
  assert.equal((await submit(p, { ...up, meta: {} })).body.error, 'offset_out_of_range');
  assert.equal((await submit(p, { ...up, log: 'not base64!' })).status, 400);

  assert.equal((await submit(p, up)).body.status, 'ok');
  assert.equal((await submit(q, up)).body.error, 'duplicate_log', 'someone else\'s log');

  clock.now = d.closesAt + SUBMIT_GRACE_MS - 1;
  assert.equal((await submit(p, play(d.seed, BOTS.novice))).body.status, 'ok', 'grace period after midnight');
  clock.now = d.closesAt + SUBMIT_GRACE_MS + 1;
  assert.equal((await submit(p, play(d.seed, BOTS.expert))).body.error, 'window_closed');
});

test('bot-like run is held for review; admin clears it onto the board', async t => {
  const { call, guest } = await boot(t);
  const p = await guest('機器貓');
  const d = (await call('GET', '/daily')).body;
  const r = await call('POST', '/submit', { token: p.token, body: { date: d.date, upload: play(d.seed, perfect) } });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'review');
  assert.equal(r.body.flags, undefined, 'flag details never go back to the client');

  let lb = (await call('GET', `/leaderboard/${d.date}`, { token: p.token })).body;
  assert.equal(lb.players, 0);
  assert.equal(lb.me.underReview, r.body.score);

  assert.equal((await call('GET', '/admin/review-queue')).status, 403);
  const queue = (await call('GET', '/admin/review-queue', { token: ADMIN })).body;
  assert.deepEqual(queue[0].flags.map(f => f.code).sort(), ['error_sd', 'top_score']);
  assert.equal((await call('POST', `/admin/runs/${r.body.runId}/review`, { token: ADMIN, body: { decision: 'clear', note: 'test' } })).body.status, 'cleared');

  lb = (await call('GET', `/leaderboard/${d.date}`)).body;
  assert.equal(lb.top[0].name, '機器貓');
  assert.equal(lb.top[0].score, d.maxScore);
});

test('repeated replay failures put the account\'s next runs under review', async t => {
  const { call, guest } = await boot(t);
  const p = await guest();
  const d = (await call('GET', '/daily')).body;
  const up = play(d.seed);
  for (let i = 1; i <= 3; i++) await call('POST', '/submit', { token: p.token, body: { date: d.date, upload: { ...up, score: up.score + i } } });
  assert.equal((await call('POST', '/submit', { token: p.token, body: { date: d.date, upload: up } })).body.status, 'review');
});

test('full-match verification stays inside the 500 ms budget', () => {
  const seed = dailySeed(SECRET, 'twin-strike', '2026-10-21');
  const up = play(seed, BOTS.expert);
  assert.equal(up.ticks, GAME.maxTicks, 'expert bot plays the whole 90 s');
  const daily = { date: '2026-10-21', version: GAME.version, seed, maxScore: Infinity, opensAt: 0, closesAt: Infinity };
  const v = checkSubmission(up, daily, NOON);
  assert.equal(v.ok, true);
  assert.ok(v.verifyMs < 500, `verify + analyze took ${v.verifyMs} ms`);
});
