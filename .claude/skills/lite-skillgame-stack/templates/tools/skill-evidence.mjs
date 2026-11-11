// Skill evidence: the result table for this game's frozen strategies (tools/strategies.mjs).
//   node tools/skill-evidence.mjs [questions=30] [--out report.md] [--json table.json]
//        [--confirm [--generation <n>]] [--ledger <path>] [--alpha <0..1> --min-questions <n>]
// Without --confirm the questions are the tuning batch: use them freely, but they are not confirmation evidence.
// --confirm uses a confirmation batch and records it in the ledger (default: docs/skill_evidence_ledger.json next to
// the game folder, wherever the command is started from). Without --generation it re-runs the latest recorded batch
// (or starts batch 1). A recorded batch can only be re-run unchanged; after the strategies, the rules, this tool, the
// question count or the thresholds change, the next generation must be used.
// Thresholds are never hard-coded: pass --alpha and --min-questions (the values live in knowledge-base/index/rules.json).
// Without them the report holds measurements only.
// Exit codes: 0 = done (and passed, when a verdict was asked for); 1 = the verdict failed; 2 = anything else
// (misuse, a refused run, a file that cannot be loaded or written).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLedger, recordConfirmation, runEvidence, toMarkdown } from './lib/evidence.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), GAME_DIR = resolve(HERE, '..');
const fail = msg => { console.error(`✘ ${msg}`); process.exit(2); };

// --- arguments: --confirm is a flag; every other option takes exactly one value ---
const VALUE_OPTS = ['--out', '--json', '--ledger', '--alpha', '--min-questions', '--generation'];
const argv = process.argv.slice(2), o = {}, positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--confirm') o.confirm = true;
  else if (VALUE_OPTS.includes(a)) { if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) fail(`${a} 需要一個值`); o[a] = argv[++i]; }
  else if (a.startsWith('--')) fail(`不認識的選項 ${a}`);
  else positional.push(a);
}
if (positional.length > 1) fail(`只接受一個位置參數（題數），收到：${positional.join(' ')}`);
const int = (text, what) => { if (!/^\d+$/.test(text) || Number(text) < 1) fail(`${what} 要是 1 以上的整數，收到 ${text}`); return Number(text); };
const n = positional.length ? int(positional[0], '題數') : 30;
if ((o['--alpha'] === undefined) !== (o['--min-questions'] === undefined)) fail('--alpha 與 --min-questions 要一起給（數值見 knowledge-base/index/rules.json）');
if (o['--generation'] !== undefined && !o.confirm) fail('--generation 只能和 --confirm 一起用');
const thresholds = o['--alpha'] === undefined ? null : { alpha: Number(o['--alpha']), minQuestions: int(o['--min-questions'], '--min-questions') };

// --- ledger: its location does not depend on where the command is started from ---
const ledgerPath = o['--ledger'] ? resolve(o['--ledger']) : resolve(GAME_DIR, '..', 'docs', 'skill_evidence_ledger.json');
let ledger = null;
if (o.confirm) {
  if (existsSync(ledgerPath)) { try { ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')); } catch (e) { fail(`紀錄檔 ${ledgerPath} 不是合法的 JSON：${e.message}`); } }
  const broken = checkLedger(ledger);
  if (broken) fail(`紀錄檔 ${ledgerPath}：${broken}；請修復或還原，不要刪除`);
}
const used = ledger?.length ?? 0;
const generation = !o.confirm ? 1 : o['--generation'] === undefined ? Math.max(1, used) : int(o['--generation'], '--generation');
if (generation > used + 1) fail(`確認批次要依序使用：下一批是第 ${used + 1} 批`);

// --- hash: the strategy file, the sim, this tool and its measuring code, and every local file they import ---
// Found by scanning the text for relative specifiers written as string literals after `from` or `import` (comments
// in between are allowed). This is a text scan, not a parser: it can include a path that only appears in a comment
// (harmless), and it cannot see a file loaded through a computed specifier or read with fs. The report lists the
// files so a person can check that nothing that shapes the result is missing.
function importClosure(entries) {
  const seen = new Set(), todo = [...entries];
  while (todo.length) {
    const file = todo.pop();
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\b(?:from|import)\s*\(?\s*(?:\/\*[\s\S]*?\*\/\s*)*(['"])(\.{1,2}\/[^'"?#]+)(?:[?#][^'"]*)?\1/g)) todo.push(resolve(dirname(file), m[2]));
  }
  return [...seen].map(f => relative(GAME_DIR, f).split('\\').join('/')).sort();
}
const hashedFiles = importClosure([resolve(HERE, 'strategies.mjs'), resolve(GAME_DIR, 'src/sim/sim.js'), fileURLToPath(import.meta.url)]);
const hasher = createHash('sha256');
for (const f of hashedFiles) hasher.update(f).update('\0').update(readFileSync(resolve(GAME_DIR, f))).update('\0');
const strategyHash = hasher.digest('hex').slice(0, 16);

let report;
try {
  const { GAME } = await import('../src/sim/sim.js');
  const { STRATEGIES } = await import('./strategies.mjs');
  report = runEvidence(GAME, STRATEGIES, { n, mode: o.confirm ? 'confirm' : 'tuning', generation, thresholds, strategyHash, hashedFiles,
    ...(ledger?.length ? { seedBase: ledger[0].seedBase } : {}), command: `node tools/skill-evidence.mjs ${argv.join(' ')}`.trim() });
} catch (e) { fail(e.message); }

const md = toMarkdown(report);
try {
  // Reports first: if one cannot be written, the batch is not recorded as used.
  if (o['--out']) writeFileSync(o['--out'], md, 'utf8');
  if (o['--json']) writeFileSync(o['--json'], JSON.stringify(report, null, 1) + '\n', 'utf8');
  if (o.confirm) {
    const rec = recordConfirmation(ledger, report);
    if (!rec.ok) fail(rec.reason);
    writeFileSync(ledgerPath, JSON.stringify(rec.ledger, null, 1) + '\n', 'utf8');
    console.error(`紀錄檔：${ledgerPath}`);
  }
} catch (e) { fail(e.message); }
console.log(md);
process.exitCode = report.verdict && !report.verdict.pass ? 1 : 0;
