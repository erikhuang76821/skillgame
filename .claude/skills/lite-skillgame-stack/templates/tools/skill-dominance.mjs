// Usage: node tools/skill-dominance.mjs [seeds=30] [--out ../docs/skill_dominance_report.md]
// Exits 1 when the game fails the skill-dominance thresholds, so it can gate CI.
import { writeFileSync } from 'node:fs';
import { GAME } from '../src/sim/sim.js';
import { BOTS } from './bots.mjs';
import { runDominance, toMarkdown } from './lib/dominance.mjs';

const args = process.argv.slice(2);
const n = Number(args.find(a => /^\d+$/.test(a))) || 30;
const outIdx = args.indexOf('--out');

const report = runDominance(GAME, BOTS, n);
const md = toMarkdown(report, `node tools/skill-dominance.mjs ${n}`);
if (outIdx >= 0) writeFileSync(args[outIdx + 1], md, 'utf8');
console.log(md);
process.exitCode = report.pass ? 0 : 1;
