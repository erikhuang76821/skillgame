// Human playtest analysis (N9): reads the JSON files testers export from the game (?playtest=1&tester=<name>),
// re-verifies and REPLAYS every match with the same sim a server would use, and compares real players with the
// human-factor bots (tools/humanBots.mjs) section by section. People and bots are profiled by the same code
// (tools/units.mjs). Records of leg one and of leg six may be mixed: each leg gets its own part of the report.
// Exit 2 when there is nothing to analyse (no input, or a folder without records): the loop gate reads that as
// "could not run", not as a failed check. Exit 1 when a record cannot be trusted (failed verification).
// Usage: node tools/human-report.mjs <file-or-folder>... [--out ../docs/human_playtest_report.md]
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { verify, decodeLog, TPS } from '../src/sim/core/index.js';
import { GAME, SCRIPT } from '../src/sim/sim.js';
import { GAME6 } from '../src/sim/leg6.js';
import { counts6, sectionName6 } from './leg6-units.mjs';
import { HUMANS } from './humanBots.mjs';
import { MAIN_SECTIONS, profileMatch, sectionRates } from './units.mjs';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const inputs = args.filter((a, i) => !a.startsWith('--') && !(outIdx >= 0 && i === outIdx + 1));
const missing = inputs.filter(p => !existsSync(p));
const HOWTO = '請試玩者用 ?playtest=1&tester=<代號> 開遊戲，玩完按「匯出試玩紀錄」，把 skytalon-playtest-*.json 放進 SkyTalon/playtest-data/ 後再執行。';
if (!inputs.length || missing.length) {
  console.error(missing.length ? `找不到：${missing.join('、')}` : '請指定試玩紀錄的檔案或資料夾');
  console.error(HOWTO);
  process.exit(2);   // no data to analyse: could not run (loop test-card convention), not a failed check
}
const files = inputs.flatMap(p => (statSync(p).isDirectory() ? readdirSync(p).filter(f => f.endsWith('.json')).map(f => join(p, f)) : [p]));
if (!files.length) {
  console.error(`${inputs.join('、')} 裡還沒有試玩紀錄（skytalon-playtest-*.json）。`);
  console.error(HOWTO);
  process.exit(2);
}

const mean = a => { const v = a.filter(Number.isFinite); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN; };
const pct = v => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : '—');
const num = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const summarise = ps => ({
  sec: SCRIPT.map((s, k) => mean(ps.map(p => sectionRates(p)[k]))),
  survived: mean(ps.map(p => +p.survived)), boss: mean(ps.map(p => +p.bossDown)), hits: mean(ps.map(p => p.hits)),
  grazes: mean(ps.map(p => p.grazes)), score: mean(ps.map(p => p.score)), n: ps.length,
});

// what differs between legs: the game, which enemies count as targets, and what the sections are called
const LEGS = [
  { title: '航段一', game: GAME, create: GAME.createSim, counts: () => true, name: s => s.name },
  { title: '航段六', game: GAME6, create: GAME6.createSim, counts: counts6, name: sectionName6 },
];

// ---------- load + verify + replay ----------
const records = [], rejected = [];
for (const f of files) {
  let list;
  try { list = JSON.parse(readFileSync(f, 'utf8')); } catch { rejected.push(`${f}：不是有效的 JSON`); continue; }
  for (const r of Array.isArray(list) ? list : [list]) {
    const u = r?.upload;
    const leg = LEGS.find(l => l.game.id === u?.game);
    if (!leg) { rejected.push(`${f}：不是 ${LEGS.map(l => l.game.id).join(' 或 ')} 的紀錄`); continue; }
    if (u.version !== leg.game.version) { rejected.push(`${r.tester} 第 ${r.run} 局（${leg.title}）：sim v${u.version}，目前是 v${leg.game.version}（請用同版本分析）`); continue; }
    const v = verify(leg.game, u);
    if (!v.valid) { rejected.push(`${r.tester} 第 ${r.run} 局：重播驗證失敗（${v.reason}）`); continue; }
    const log = decodeLog(u.log, leg.game.maxTicks);
    records.push({ leg, tester: String(r.tester ?? 'anon'), run: r.run ?? 0, at: String(r.at ?? ''), device: r.device ?? {}, seed: u.seed, p: profileMatch(u.seed, sim => log[sim.tick], sim => (u.choices?.[sim.picks]?.[2] ?? -1), leg.create, leg.counts) });
  }
}
if (!records.length) {
  console.error(`沒有可分析的紀錄。\n${rejected.join('\n')}`);
  process.exit(rejected.length ? 1 : 2);
}

// ---------- the bots on the same questions ----------
/** One leg's part of the report. */
function part(leg, records) {
const GAME = leg.game;
const seeds = [...new Set(records.map(r => r.seed))];
const bots = Object.fromEntries(Object.entries(HUMANS).map(([name, bot]) => [name, summarise(seeds.map(seed => profileMatch(seed, sim => bot.input(sim), sim => bot.pick(sim), leg.create, leg.counts)))]));
const distance = (a, b) => {
  const d = MAIN_SECTIONS.filter(k => Number.isFinite(a.sec[k]) && Number.isFinite(b.sec[k])).map(k => (a.sec[k] - b.sec[k]) ** 2);
  return d.length ? Math.sqrt(mean(d)) : Infinity;
};
const nearest = s => Object.entries(bots).map(([name, b]) => [name, distance(s, b)]).sort((x, y) => x[1] - y[1])[0];

// ---------- per tester ----------
const testers = [...new Set(records.map(r => r.tester))].map(name => {
  const rs = records.filter(r => r.tester === name).sort((a, b) => a.run - b.run || a.at.localeCompare(b.at));
  const all = summarise(rs.map(r => r.p)), first = summarise([rs[0].p]), last = summarise([rs[rs.length - 1].p]);
  const [model, dist] = nearest(all);
  return { name, rs, all, first, last, model, dist, device: rs[0].device };
});
const humans = summarise(records.map(r => r.p));

// ---------- report ----------
const secHead = SCRIPT.map(s => leg.name(s)).join(' | ');
const secRow = s => SCRIPT.map((_, k) => pct(s.sec[k])).join(' | ');
const gaps = Object.entries(bots).map(([name, b]) => ({ name, gap: MAIN_SECTIONS.map(k => (humans.sec[k] - b.sec[k]) * 100) }));
return [
  `## ${leg.title}（${GAME.id}）`,
  '',
  `- 產生：\`node tools/human-report.mjs\`；sim v${GAME.version}；${testers.length} 位試玩者、${records.length} 局、${seeds.length} 個題目`,
  '- 每一局都先以輸入紀錄重播驗分，再用和模擬玩家相同的程式（tools/units.mjs）切成 4 秒單位量擊破率',
  '- 擊破率 = 該段進場敵機被擊破的比例（只計該單位開始時還活著的局）；主段落 = ' + MAIN_SECTIONS.map(k => leg.name(SCRIPT[k])).join('、'),
  '- 人機一致性目前沒有通過線（假設階段），這份報告只陳述差距，由人下結論',
  '',
  '### 真人與模擬玩家（同一批題目）',
  '',
  `| 玩家 | 局數 | ${secHead} | 活到最後 | 擊破頭目 | 平均被打中 | 平均擦彈 | 平均分數 |`,
  `|---|---|${SCRIPT.map(() => '---').join('|')}|---|---|---|---|---|`,
  `| **真人（全部）** | ${humans.n} | ${secRow(humans)} | ${pct(humans.survived)} | ${pct(humans.boss)} | ${num(humans.hits)} | ${num(humans.grazes)} | ${num(humans.score, 0)} |`,
  ...Object.entries(bots).map(([name, b]) => `| 模擬 ${name} | ${b.n} | ${secRow(b)} | ${pct(b.survived)} | ${pct(b.boss)} | ${num(b.hits)} | ${num(b.grazes)} | ${num(b.score, 0)} |`),
  '',
  '### 主段落差距（真人 − 模擬，百分點）',
  '',
  `| 模擬玩家 | ${MAIN_SECTIONS.map(k => leg.name(SCRIPT[k])).join(' | ')} | 被打中次數差 |`,
  `|---|${MAIN_SECTIONS.map(() => '---').join('|')}|---|`,
  ...gaps.map(g => `| ${g.name} | ${g.gap.map(v => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(0)}` : '—')).join(' | ')} | ${num(humans.hits - bots[g.name].hits)} |`),
  '',
  '負值 = 真人打得比模擬差（模擬太樂觀）。被打中次數差為正 = 真人比模擬更常被打中。',
  '',
  '### 每位試玩者',
  '',
  `| 試玩者 | 裝置 | 局數 | ${secHead} | 活到最後 | 擊破頭目 | 平均被打中 | 第一局分數 | 最後一局分數 | 最像哪位模擬玩家（主段落均方根差） |`,
  `|---|---|---|${SCRIPT.map(() => '---').join('|')}|---|---|---|---|---|---|`,
  ...testers.map(t => `| ${t.name} | ${t.device.touch ? '觸控' : '鍵鼠'} ${t.device.w ?? '?'}×${t.device.h ?? '?'} | ${t.rs.length} | ${secRow(t.all)} | ${pct(t.all.survived)} | ${pct(t.all.boss)} | ${num(t.all.hits)} | ${num(t.first.score, 0)} | ${num(t.last.score, 0)} | ${t.model}（${Number.isFinite(t.dist) ? (t.dist * 100).toFixed(0) : '—'} pp） |`),
  '',
  '### 逐局',
  '',
  '| 試玩者 | 局 | 題目 | 分數 | 時間（秒） | 被打中 | 擦彈 | 結果 |',
  '|---|---|---|---|---|---|---|---|',
  ...records.sort((a, b) => a.tester.localeCompare(b.tester) || a.run - b.run).map(r => `| ${r.tester} | ${r.run} | ${r.seed} | ${r.p.score} | ${(r.p.ticks / TPS).toFixed(1)} | ${r.p.hits} | ${r.p.grazes} | ${r.p.bossDown ? '擊破頭目' : r.p.survived ? '時間到' : '被擊落'} |`),
  '',
];
}

const md = [
  '# Human Playtest Report（自動產生）',
  '',
  rejected.length ? `- 未採用的紀錄：${rejected.length} 筆（見文末）` : '- 所有紀錄都通過重播驗證',
  '',
  ...LEGS.filter(leg => records.some(r => r.leg === leg)).flatMap(leg => part(leg, records.filter(r => r.leg === leg))),
  ...(rejected.length ? ['## 未採用的紀錄', '', ...rejected.map(x => `- ${x}`), ''] : []),
].join('\n');

if (outIdx >= 0) writeFileSync(args[outIdx + 1], md, 'utf8');
console.log(md);
process.exitCode = rejected.some(x => x.includes('重播驗證失敗')) ? 1 : 0;
