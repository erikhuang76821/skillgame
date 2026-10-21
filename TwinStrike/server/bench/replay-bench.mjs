// Verification cost per upload (docs/backend_design.md §7): full checkSubmission (verify replay + analysis replay).
// Usage: npm run bench [-- <matches per bot>]
import { playMatch } from '../../game/src/sim/core/index.js';
import { GAME } from '../../game/src/sim/sim.js';
import { BOTS } from '../../game/tools/bots.mjs';
import { checkSubmission } from '../src/check.js';

const N = Number(process.argv[2]) || 50;
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
console.log(`node ${process.version} · sim v${GAME.version} · ${N} matches per bot`);
for (const [name, bot] of Object.entries(BOTS)) {
  const ms = [], ticks = [];
  for (let i = 0; i < N; i++) {
    const seed = (0x9e3779b9 * (i + 1)) >>> 0, up = playMatch(GAME, seed, bot).upload();
    up.meta = { inputOffsetMs: 0, lateTaps: 0 };
    const v = checkSubmission(up, { version: GAME.version, seed, maxScore: Infinity, opensAt: 0, closesAt: Infinity }, 1);
    if (!v.ok) throw new Error(`${name} seed ${seed}: ${v.code}`);
    ms.push(v.verifyMs); ticks.push(v.ticks);
  }
  const first = ms[0];
  ms.sort((a, b) => a - b);
  console.log(`${name.padEnd(12)} avg ${(ticks.reduce((s, t) => s + t, 0) / N / 60).toFixed(1)} s/match · first ${first} ms · p50 ${q(ms, 0.5)} ms · p99 ${q(ms, 0.99)} ms · max ${ms.at(-1)} ms`);
}
