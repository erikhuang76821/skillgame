// Game completeness audit: is a game folder done the way knowledge-base/08 says, not just "tests pass"?
// Checks RULE-GAME-DOCS, RULE-GAME-REPORTS, RULE-AF-ADAPTATION (must) and RULE-TEMPLATE-LEFTOVER (should).
// Everything it requires comes from knowledge-base/index/rules.json via rules.mjs; never list files here.
//
//   node shared/tools/game-audit.mjs <Game> [<Game>…]   one or more game folders
//   node shared/tools/game-audit.mjs --all              every folder with a game/ subfolder
//   cd <Game>/game && npm run audit                     the game this folder belongs to
// Exit 1 when a must-level check fails; should-level findings are printed as warnings.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadRules } from './rules.mjs';

const TEMPLATES = join('.claude', 'skills', 'lite-skillgame-stack', 'templates');
const FAIL_MARK = /❌|✘|\*\*未通過\*\*|\bFAIL\b/;

const read = p => (existsSync(p) ? readFileSync(p, 'utf8').replace(/\r\n/g, '\n') : null);
const nonEmpty = p => existsSync(p) && statSync(p).isFile() && statSync(p).size > 0;

/** Lines of a markdown section: from the heading matching `re` to the next heading of the same or higher level. */
function section(text, re) {
  const lines = text.split('\n'), at = lines.findIndex(l => re.test(l));
  if (at < 0) return null;
  const level = lines[at].match(/^#+/)[0].length, out = [];
  for (let i = at + 1; i < lines.length; i++) {
    const h = lines[i].match(/^(#+)\s/);
    if (h && h[1].length <= level) break;
    out.push(lines[i]);
  }
  return out;
}

export function auditGame(root, game) {
  const rules = loadRules({ from: join(root, game, 'game'), game });
  const dir = join(root, game), results = [];
  const add = (rule, level, ok, item, detail = '') => results.push({ rule, level, ok, item, detail });

  // RULE-GAME-DOCS
  for (const f of rules.value('RULE-GAME-DOCS', 'required')) add('RULE-GAME-DOCS', 'must', nonEmpty(join(dir, f)), f, nonEmpty(join(dir, f)) ? '' : '缺檔或空檔');
  const spec = read(join(dir, 'gdd', '05_game_spec.md'));
  if (spec) {
    const heads = new Map(spec.split('\n').map(l => l.match(/^##\s*(§\d+)\s*(.*)$/)).filter(Boolean).map(m => [m[1], m[2]]));
    const missing = rules.value('RULE-GAME-DOCS', 'specSections').filter(s => !heads.has(s));
    add('RULE-GAME-DOCS', 'must', !missing.length, 'gdd/05 涵蓋規格範本每一節', missing.length ? `缺 ${missing.join('、')}` : '');
    if (heads.has('§10')) add('RULE-GAME-DOCS', 'must', heads.get('§10').includes('公平'), 'gdd/05 §10 是公平檢查', heads.get('§10').includes('公平') ? '' : `§10 標題是「${heads.get('§10')}」`);
  }

  // RULE-GAME-REPORTS
  for (const f of ['docs/skill_dominance_report.md', 'docs/playtest_report.md']) {
    const t = read(join(dir, f));
    if (t) add('RULE-GAME-REPORTS', 'must', !FAIL_MARK.test(t), `${f} 全部通過`, FAIL_MARK.test(t) ? '報告內有未通過項目' : '');
  }

  // RULE-AF-ADAPTATION: every adaptation item of each ad-funnel spec the game cites has a row in gdd/05 §13
  const cites = new Set([...`${spec ?? ''}\n${read(join(dir, 'README.md')) ?? ''}`.matchAll(/ad-funnel\/(af-[\w-]+)\.md/g)].map(m => m[1]));
  const s13 = spec ? section(spec, /^##\s*§13\b/) : null;
  const rows = new Map((s13 ?? []).map(l => l.split('|').map(c => c.trim())).filter(c => /^\d+$/.test(c[1] ?? '')).map(c => [Number(c[1]), c]));
  for (const af of cites) {
    const doc = read(join(root, 'knowledge-base', 'ad-funnel', `${af}.md`));
    const items = doc ? (section(doc, /^## Skill Game 化改造/) ?? []).filter(l => /^\d+\.\s/.test(l)).length : 0;
    if (!s13) { add('RULE-AF-ADAPTATION', 'must', false, `${af}：gdd/05 §13 改造對照`, `缺 §13（規格書有 ${items} 條改造）`); continue; }
    const bad = [];
    for (let n = 1; n <= items; n++) { const c = rows.get(n); if (!c || !c[3] || !c[4]) bad.push(n); }
    add('RULE-AF-ADAPTATION', 'must', !bad.length, `${af}：${items} 條改造逐條回應`, bad.length ? `第 ${bad.join('、')} 條沒有「採用 / 不採用＋做法或理由」` : '');
  }

  // RULE-TEMPLATE-LEFTOVER (should): files that must become this game's own
  for (const f of rules.value('RULE-TEMPLATE-LEFTOVER', 'rewrite')) {
    const mine = read(join(dir, 'game', f)), tpl = read(join(root, TEMPLATES, f));
    if (mine === null) add('RULE-TEMPLATE-LEFTOVER', 'should', false, `game/${f}`, '缺檔（範本有提供）');
    else if (tpl !== null && mine === tpl) add('RULE-TEMPLATE-LEFTOVER', 'should', false, `game/${f}`, '與範本相同：仍是示範遊戲的內容');
  }
  return results;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const args = process.argv.slice(2);
  const here = loadRules({ from: process.cwd() });
  const root = here.root;
  const games = args.includes('--all')
    ? readdirSync(root).filter(d => !d.startsWith('.') && existsSync(join(root, d, 'game')))
    : args.length ? args : here.game ? [here.game] : [];
  if (!games.length) { console.error('用法：node shared/tools/game-audit.mjs <Game> | --all（或在 <Game>/game 內 npm run audit）'); process.exit(2); }
  let failed = false;
  for (const g of games) {
    if (!existsSync(join(root, g, 'game'))) { console.error(`${g}：找不到 ${g}/game/`); failed = true; continue; }
    const r = auditGame(root, g), must = r.filter(x => x.level === 'must'), bad = must.filter(x => !x.ok), warn = r.filter(x => x.level === 'should');
    failed ||= bad.length > 0;
    console.log(`\n## ${g} — ${bad.length ? `❌ ${bad.length} 項未通過` : '✅ 必要項目全部通過'}${warn.length ? `，⚠️ ${warn.length} 項警告` : ''}\n`);
    console.log('| 規則 | 項目 | 結果 | 說明 |\n|---|---|---|---|');
    for (const x of r) console.log(`| ${x.rule} | ${x.item} | ${x.ok ? '✅' : x.level === 'must' ? '❌' : '⚠️'} | ${x.detail} |`);
  }
  process.exitCode = failed ? 1 : 0;
}
