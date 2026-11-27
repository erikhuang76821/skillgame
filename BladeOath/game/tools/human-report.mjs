// Human playtest analysis (N9): reads the JSON files testers export from the game (?playtest=1&tester=<name>),
// re-verifies and REPLAYS every match with the same sim a server would use, and compares real players with the
// human-factor bots (tools/humanBots.mjs) section by section. People and bots are profiled by the same code
// (tools/units.mjs).
// Exit 2 when there is nothing to analyse (no input, or a folder without records): the loop gate reads that as
// "could not run", not as a failed check. Exit 1 when a record cannot be trusted (failed verification).
// Usage: node tools/human-report.mjs <file-or-folder>... [--out ../docs/human_playtest_report.md]
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { verify, decodeLog, TPS } from '../src/sim/core/index.js';
import { GAME } from '../src/sim/sim.js';
import { HUMANS } from './humanBots.mjs';
import { SECTIONS, UNITS, profileMatch, sectionRates } from './units.mjs';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const inputs = args.filter((a, i) => !a.startsWith('--') && !(outIdx >= 0 && i === outIdx + 1));
const missing = inputs.filter(p => !existsSync(p));
const HOWTO = '請試玩者用 ?playtest=1&tester=<代號> 開遊戲，玩完在結算面板按「匯出試玩紀錄」，把 bladeoath-playtest-*.json 放進 BladeOath/playtest-data/ 後再執行。';
if (!inputs.length || missing.length) {
  console.error(missing.length ? `找不到：${missing.join('、')}` : '請指定試玩紀錄的檔案或資料夾');
  console.error(HOWTO);
  process.exit(2);   // no data to analyse: could not run (loop test-card convention), not a failed check
}
const files = inputs.flatMap(p => (statSync(p).isDirectory() ? readdirSync(p).filter(f => f.endsWith('.json')).map(f => join(p, f)) : [p]));
if (!files.length) {
  console.error(`${inputs.join('、')} 裡還沒有試玩紀錄（bladeoath-playtest-*.json）。`);
  console.error(HOWTO);
  process.exit(2);
}

const mean = a => { const v = a.filter(Number.isFinite); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN; };
const pct = v => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : '—');
const num = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const sec = t => (Number.isFinite(t) ? `${Math.round(t / TPS)} s` : '—');
const MAIN = SECTIONS.map((s, k) => (s.main ? k : -1)).filter(k => k >= 0);
const summarise = ps => ({
  sec: SECTIONS.map((_, k) => mean(ps.map(p => sectionRates(p)[k]))),
  cleared: mean(ps.map(p => +p.cleared)), general: mean(ps.map(p => +((p.bossDown & 1) !== 0))),
  deaths: mean(ps.map(p => p.deaths)), score: mean(ps.map(p => p.score)), ticks: mean(ps.map(p => p.ticks)),
  // first fall as a share of the match (the curve target: novices fall first at 55–80% of the run); no fall = 1
  firstDown: mean(ps.map(p => (p.down >= 0 ? p.down / p.ticks : 1))), n: ps.length,
});

// ---------- load + verify + replay ----------
const records = [], rejected = [];
for (const f of files) {
  let list;
  try { list = JSON.parse(readFileSync(f, 'utf8')); } catch { rejected.push(`${f}：不是有效的 JSON`); continue; }
  for (const r of Array.isArray(list) ? list : [list]) {
    const u = r?.upload;
    if (u?.game !== GAME.id) { rejected.push(`${f}：不是 ${GAME.id} 的紀錄`); continue; }
    if (u.version !== GAME.version) { rejected.push(`${r.tester} 第 ${r.run} 局：sim v${u.version}，目前是 v${GAME.version}（請用同版本分析）`); continue; }
    const v = verify(GAME, u);
    if (!v.valid) { rejected.push(`${r.tester} 第 ${r.run} 局：重播驗證失敗（${v.reason}）`); continue; }
    const log = decodeLog(u.log, GAME.maxTicks);
    records.push({ tester: String(r.tester ?? 'anon'), run: r.run ?? 0, at: String(r.at ?? ''), device: r.device ?? {}, seed: u.seed,
      p: profileMatch(u.seed, (_, t) => log[t], (_, c) => u.choices[c][2]) });
  }
}
if (!records.length) {
  console.error(`沒有可分析的紀錄。\n${rejected.join('\n')}`);
  process.exit(rejected.length ? 1 : 2);
}

// ---------- the bots on the same questions ----------
const seeds = [...new Set(records.map(r => r.seed))];
const bots = Object.fromEntries(Object.entries(HUMANS).map(([name, bot]) => [name, summarise(seeds.map(seed => profileMatch(seed, sim => bot.input(sim), sim => bot.pick(sim))))]));
const distance = (a, b) => {
  const d = MAIN.filter(k => Number.isFinite(a.sec[k]) && Number.isFinite(b.sec[k])).map(k => (a.sec[k] - b.sec[k]) ** 2);
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
const secHead = SECTIONS.map(s => s.name).join(' | ');
const secRow = s => SECTIONS.map((_, k) => pct(s.sec[k])).join(' | ');
const whole = s => `${pct(s.general)} | ${pct(s.cleared)} | ${num(s.deaths)} | ${pct(s.firstDown)} | ${sec(s.ticks)} | ${num(s.score, 0)}`;
const lastUnit = p => (p.reached >= 0 ? `#${p.reached + 1} ${SECTIONS[UNITS[p.reached].section].name}` : '—');
const md = [
  `# Human Playtest Report — ${GAME.id} v${GAME.version}（自動產生）`,
  '',
  `- 產生：\`node tools/human-report.mjs\`；${testers.length} 位試玩者、${records.length} 局、${seeds.length} 個題目`,
  rejected.length ? `- 未採用的紀錄：${rejected.length} 筆（見文末）` : '- 所有紀錄都通過重播驗證',
  '- 每一局都先以輸入紀錄重播驗分，再用和模擬玩家相同的程式（tools/units.mjs）切段量命中率',
  '- 命中率 = 威脅到玩家的敵招中，玩家沒有被打實的比例（卸勁、格擋、閃避、走出範圍都算）；主段落 = ' + MAIN.map(k => SECTIONS[k].name).join('、'),
  '- 第一次倒下 = 第一次倒下的時間占整局的比例（沒倒下算 100%）；曲線目標：新手落在 55–80%',
  '- 人機一致性目前沒有通過線（假設階段），這份報告只陳述差距，由人下結論',
  '',
  '## 真人與模擬玩家（同一批題目）',
  '',
  `| 玩家 | 局數 | ${secHead} | 斬屍傀將 | 斬墮仙 | 平均倒下 | 第一次倒下 | 平均局長 | 平均分數 |`,
  `|---|---|${SECTIONS.map(() => '---').join('|')}|---|---|---|---|---|---|`,
  `| **真人（全部）** | ${humans.n} | ${secRow(humans)} | ${whole(humans)} |`,
  ...Object.entries(bots).map(([name, b]) => `| 模擬 ${name} | ${b.n} | ${secRow(b)} | ${whole(b)} |`),
  '',
  '## 主段落差距（真人 − 模擬，百分點）',
  '',
  `| 模擬玩家 | ${MAIN.map(k => SECTIONS[k].name).join(' | ')} | 倒下次數差 |`,
  `|---|${MAIN.map(() => '---').join('|')}|---|`,
  ...Object.entries(bots).map(([name, b]) => `| ${name} | ${MAIN.map(k => { const v = (humans.sec[k] - b.sec[k]) * 100; return Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(0)}` : '—'; }).join(' | ')} | ${num(humans.deaths - b.deaths)} |`),
  '',
  '負值 = 真人比模擬更常被打實（模擬太樂觀）。倒下次數差為正 = 真人比模擬更常倒下。',
  '',
  '## 每位試玩者',
  '',
  `| 試玩者 | 裝置 | 局數 | ${secHead} | 斬墮仙 | 平均倒下 | 第一局分數 | 最後一局分數 | 最像哪位模擬玩家（主段落均方根差） |`,
  `|---|---|---|${SECTIONS.map(() => '---').join('|')}|---|---|---|---|---|`,
  ...testers.map(t => `| ${t.name} | ${t.device.touch ? '觸控' : '鍵鼠'} ${t.device.w ?? '?'}×${t.device.h ?? '?'} | ${t.rs.length} | ${secRow(t.all)} | ${pct(t.all.cleared)} | ${num(t.all.deaths)} | ${num(t.first.score, 0)} | ${num(t.last.score, 0)} | ${t.model}（${Number.isFinite(t.dist) ? (t.dist * 100).toFixed(0) : '—'} pp） |`),
  '',
  '## 逐局',
  '',
  '| 試玩者 | 局 | 題目 | 分數 | 局長 | 倒下 | 第一次倒下 | 走到哪 | 結果 |',
  '|---|---|---|---|---|---|---|---|---|',
  ...records.sort((a, b) => a.tester.localeCompare(b.tester) || a.run - b.run).map(r => `| ${r.tester} | ${r.run} | ${r.seed} | ${r.p.score} | ${sec(r.p.ticks)} | ${r.p.deaths} | ${r.p.down >= 0 ? sec(r.p.down) : '—'} | ${lastUnit(r.p)} | ${r.p.cleared ? '斬下墮仙' : (r.p.bossDown & 1) ? '斬下屍傀將' : '時辰已盡'} |`),
  '',
  ...(rejected.length ? ['## 未採用的紀錄', '', ...rejected.map(x => `- ${x}`), ''] : []),
].join('\n');

if (outIdx >= 0) writeFileSync(args[outIdx + 1], md, 'utf8');
console.log(md);
process.exitCode = rejected.some(x => x.includes('重播驗證失敗')) ? 1 : 0;
