// index:build — the central indexes (knowledge-base/decisions/2026-10-21-kb-asset-architecture.md §5.3–5.4,
// 2026-11-10-libraries-and-loop.md §3.1). Reads every <Game>/art/manifest.json plus shared/recipes/manifest.json, and the
// front-matter / card markers of knowledge-base pages (kb-index.mjs); validates them and writes the generated files
// knowledge-base/index/assets.json, kb.json and INDEX.md.
//
//   node shared/tools/index-build.mjs                  validate + rebuild
//   node shared/tools/index-build.mjs --check          validate + fail if the generated files are stale (pre-commit)
//   node shared/tools/index-build.mjs --update-hashes  rewrite each manifest's contentHash from the files, then rebuild
// No wall-clock timestamps in the output, so a rebuild of unchanged sources is byte-identical.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRoot } from './rules.mjs';
import { buildKb } from './kb-index.mjs';

export const KINDS = ['sprite-sheet', 'background', 'fx-sheet', 'key-art', 'ui', 'reference', 'procedural', 'audio-recipe'];
export const STATUSES = ['shipped', 'raw-only', 'rejected-take', 'placeholder', 'procedural', 'template'];
export const REUSE = ['game-only', 'reusable', 'template'];
const OUT_JSON = join('knowledge-base', 'index', 'assets.json');
const OUT_MD = join('knowledge-base', 'index', 'INDEX.md');
const OUT_KB = join('knowledge-base', 'index', 'kb.json');
const SHARED = join('shared', 'recipes', 'manifest.json');
const BLOCKS = join('shared', 'recipes', 'prompt-blocks.json');
const TEXT = new Set(['.json', '.js', '.mjs', '.txt', '.md', '.py']);

const readJson = p => JSON.parse(readFileSync(p, 'utf8'));
const norm = s => s.replace(/\r\n/g, '\n');
const plain = f => f.split('#')[0];                                  // "textures.js#L44" -> "textures.js"

/** sha256 of a file; text files are hashed with LF line ends so a Windows checkout hashes the same. */
function fileHash(p) {
  const buf = readFileSync(p);
  return 'sha256:' + createHash('sha256').update(TEXT.has(extname(p).toLowerCase()) ? norm(buf.toString('utf8')) : buf).digest('hex');
}
export { fileHash };
const primary = a => plain(a.files.shipped?.[0] ?? a.files.raw?.[0] ?? '');

/** Manifest paths: shared recipes first, then every top-level folder with art/manifest.json, alphabetically. */
export function manifestPaths(root) {
  const games = readdirSync(root, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.') && existsSync(join(root, d.name, 'art', 'manifest.json')))
    .map(d => join(d.name, 'art', 'manifest.json')).sort();
  return [...(existsSync(join(root, SHARED)) ? [SHARED] : []), ...games];
}

/** Validate all manifests; returns { manifests, errors }. */
export function loadManifests(root) {
  const errors = [], ids = new Map(), manifests = [];
  for (const rel of manifestPaths(root)) {
    const m = readJson(join(root, rel)), where = rel.replace(/\\/g, '/');
    manifests.push({ rel: where, m });
    if (m.schemaVersion !== 1) errors.push(`${where}: schemaVersion 必須是 1`);
    const prefix = `${m.game.toLowerCase()}.`;
    for (const a of m.assets) {
      const at = `${where} ${a.id}`;
      if (!a.id?.startsWith(prefix)) errors.push(`${at}: id 要以 ${prefix} 開頭`);
      if (ids.has(a.id)) errors.push(`${at}: id 與 ${ids.get(a.id)} 重複`); else ids.set(a.id, where);
      if (!KINDS.includes(a.kind)) errors.push(`${at}: kind「${a.kind}」不在 ${KINDS.join(' / ')}`);
      if (!STATUSES.includes(a.status)) errors.push(`${at}: status「${a.status}」不在 ${STATUSES.join(' / ')}`);
      if (!REUSE.includes(a.reusePolicy)) errors.push(`${at}: reusePolicy「${a.reusePolicy}」不在 ${REUSE.join(' / ')}`);
      for (const f of Object.values(a.files ?? {}).flat()) if (!existsSync(join(root, m.pathBase, plain(f)))) errors.push(`${at}: 找不到檔案 ${m.pathBase}${plain(f)}`);
      if (!primary(a) && a.kind !== 'procedural') errors.push(`${at}: 至少要有一個 raw 或 shipped 檔`);
    }
  }
  for (const { rel, m } of manifests) for (const a of m.assets) {
    for (const r of [a.derivedFrom, ...(a.provenance?.reference ?? [])].filter(Boolean)) if (!ids.has(r)) errors.push(`${rel} ${a.id}: 參照的資產 ${r} 不存在`);
    const p = primary(a);
    if (p && existsSync(join(root, m.pathBase, p)) && a.contentHash !== fileHash(join(root, m.pathBase, p)))
      errors.push(`${rel} ${a.id}: contentHash 與 ${m.pathBase}${p} 不符（檔案改過？改完跑 --update-hashes）`);
  }
  return { manifests, errors };
}

/** Rewrite contentHash in every manifest from its primary file. Returns the number of changed assets. */
export function updateHashes(root) {
  let changed = 0;
  for (const rel of manifestPaths(root)) {
    const p = join(root, rel), m = readJson(p);
    for (const a of m.assets) {
      const f = primary(a);
      if (!f || !existsSync(join(root, m.pathBase, f))) continue;
      const h = fileHash(join(root, m.pathBase, f));
      if (a.contentHash !== h) { a.contentHash = h; changed++; }
    }
    writeFileSync(p, JSON.stringify(m, null, 2) + '\n', 'utf8');
  }
  return changed;
}

const count = (list, key) => Object.fromEntries([...list.reduce((m, a) => m.set(a[key], (m.get(a[key]) ?? 0) + 1), new Map())].sort());

/** Build the generated files' contents (strings). */
export function buildIndex(root) {
  const { manifests, errors } = loadManifests(root);
  const assets = manifests.flatMap(({ m }) => m.assets.map(a => ({
    ...a, game: m.game,
    files: Object.fromEntries(Object.entries(a.files).map(([k, v]) => [k, v.map(f => m.pathBase + f)])),
  })));
  const blocks = existsSync(join(root, BLOCKS)) ? readJson(join(root, BLOCKS)).blocks : {};
  const json = {
    generated: true, schemaVersion: 1,
    about: '產生物，禁止手改。來源：各款 <Game>/art/manifest.json 與 shared/recipes/（manifest.json、prompt-blocks.json）；重建：node shared/tools/index-build.mjs。路徑以 repo 根為基準。',
    sources: manifests.map(({ rel }) => ({ path: rel, sha256: fileHash(join(root, rel)) })),
    counts: { total: assets.length, byGame: count(assets, 'game'), byKind: count(assets, 'kind'), byStatus: count(assets, 'status') },
    assets, promptBlocks: blocks,
  };
  const kb = buildKb(root);
  const kbJson = {
    generated: true, schemaVersion: 1,
    about: '產生物，禁止手改。來源：knowledge-base/ 各頁的 front-matter 與 <!-- card: … --> 標記，詞彙 shared/index/facets.json；重建：node shared/tools/index-build.mjs。',
    ...kb.data,
  };
  return {
    errors: [...errors, ...kb.errors], warnings: kb.warnings, json: JSON.stringify(json, null, 1) + '\n',
    kb: JSON.stringify(kbJson, null, 1) + '\n', md: indexMd(root, assets, json.counts, kb.data),
  };
}

function indexMd(root, assets, counts, kb) {
  const rules = readJson(join(root, 'knowledge-base', 'index', 'rules.json')).rules;
  const link = ref => { const p = ref?.match(/^[\w./-]+/)?.[0]; return p ? `[${p.split('/').pop()}](../../${p})` : ''; };   // "a/b.md §3（…）" -> a/b.md
  const out = [
    '# 規則 ↔ 知識庫 ↔ 資產 索引（自動產生）', '',
    '> 產生物，禁止手改：`node shared/tools/index-build.mjs`。規則來源 [rules.json](rules.json)，資產來源各款 `art/manifest.json` 與 `shared/recipes/`，知識卡來源各頁 front-matter；機器可讀版 [assets.json](assets.json)、[kb.json](kb.json)。', '',
    `## 規則（${rules.length} 條）`, '',
    '| 規則 | 等級 | 把關 | 為什麼 | 怎麼做 |', '|---|---|---|---|---|',
    ...rules.map(r => `| \`${r.id}\` | ${r.level} | ${r.enforcement.type === 'script' ? '程式' : '人工審查'} | ${link(r.whyRef)} | ${link(r.howRef)} |`),
    '', `## 知識卡（${kb.counts.cards} 張，${kb.counts.pages} 頁；未分卡 ${kb.counts.unindexed} 頁）`, '',
    '| 頁 | id | kind | topic | 卡片 | 略過 |', '|---|---|---|---|---|---|',
    ...kb.pages.map(p => `| [${p.path.split('/').pop()}](../../${p.path}) | \`${p.id}\` | ${p.kind} | ${(p.facets.topic ?? []).join(', ')} | ${p.cards} | ${p.skipped} |`),
    '', `## 資產（${counts.total} 筆）`, '',
    `依遊戲：${Object.entries(counts.byGame).map(([g, n]) => `${g} ${n}`).join('、')}　依狀態：${Object.entries(counts.byStatus).map(([s, n]) => `${s} ${n}`).join('、')}`, '',
  ];
  for (const g of Object.keys(counts.byGame)) {
    out.push(`### ${g}`, '', '| id | 類型 | 狀態 | 名稱 | 檔案 | 重用 |', '|---|---|---|---|---|---|');
    for (const a of assets.filter(x => x.game === g)) {
      const f = a.files.shipped?.[0] ?? a.files.raw?.[0];
      out.push(`| \`${a.id}\` | ${a.kind} | ${a.status} | ${a.name} | ${f ? `[${plain(f).split('/').pop()}](../../${plain(f)})` : '—'} | ${a.reusePolicy} |`);
    }
    out.push('');
  }
  return out.join('\n');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url).endsWith(process.argv[1].replace(/\//g, '\\').split('\\').pop());
if (isMain) {
  const root = findRoot(process.cwd()), args = process.argv.slice(2);
  if (args.includes('--update-hashes')) console.log(`contentHash 更新 ${updateHashes(root)} 筆`);
  const { errors, warnings, json, kb, md } = buildIndex(root);
  if (warnings.length) console.warn(`⚠ ${warnings.length} 個警告：\n- ${warnings.join('\n- ')}`);
  if (errors.length) { console.error(`✘ manifest / 知識卡有 ${errors.length} 個錯誤：\n- ${errors.join('\n- ')}`); process.exit(1); }
  const jp = join(root, OUT_JSON), mp = join(root, OUT_MD), kp = join(root, OUT_KB);
  if (args.includes('--check')) {
    const stale = [[jp, json], [kp, kb], [mp, md]].filter(([p, s]) => !existsSync(p) || norm(readFileSync(p, 'utf8')) !== s).map(([p]) => p);
    if (stale.length) { console.error(`✘ 中央索引過期：${stale.map(p => p.slice(root.length + 1)).join('、')}。請跑 node shared/tools/index-build.mjs 後一起 commit。`); process.exit(1); }
    console.log('✔ 中央資產與知識卡索引是最新的');
  } else {
    writeFileSync(jp, json, 'utf8'); writeFileSync(kp, kb, 'utf8'); writeFileSync(mp, md, 'utf8');
    const kc = JSON.parse(kb).counts;
    console.log(`✔ ${OUT_JSON.replace(/\\/g, '/')}：${JSON.parse(json).counts.total} 筆；${OUT_KB.replace(/\\/g, '/')}：${kc.cards} 張卡 / ${kc.pages} 頁；${OUT_MD.replace(/\\/g, '/')}`);
  }
}
