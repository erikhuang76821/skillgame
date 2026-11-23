// After `vite build --mode zip`: inline the JS and CSS into dist-zip/index.html, drop the asset files, and zip it.
// The result opens with a double click (file://): no module fetches, no external URLs, nothing loaded at runtime.
// The size limit comes from RULE-BUNDLE-SIZE (knowledge-base/index/rules.json), never from a number written here.
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url)), GAME_DIR = join(HERE, '..');
let root = HERE;
while (!existsSync(join(root, 'shared', 'tools', 'rules.mjs'))) { const up = dirname(root); if (up === root) throw new Error('shared/tools/rules.mjs not found'); root = up; }
const rules = (await import(pathToFileURL(join(root, 'shared', 'tools', 'rules.mjs')).href)).loadRules({ from: fileURLToPath(import.meta.url) });
const HARD = rules.value('RULE-BUNDLE-SIZE', 'hard');

const DIR = join(GAME_DIR, 'dist-zip'), html = join(DIR, 'index.html');
let page = readFileSync(html, 'utf8');
page = page.replace(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/g, (_, f) =>
  `<script type="module">${readFileSync(join(DIR, f), 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`);
page = page.replace(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/g, (_, f) => `<style>${readFileSync(join(DIR, f), 'utf8')}</style>`);
if (/src="\.\/assets|href="\.\/assets/.test(page)) throw new Error('an asset reference was not inlined');
const urls = [...new Set(page.replace(/<!--[\s\S]*?-->/g, '').match(/https?:\/\/[^\s"'`)<>\\]+/g) ?? [])].filter(u => !/^https?:\/\/www\.w3\.org\//.test(u));
if (urls.length) console.warn(`note: the page text contains ${urls.length} http(s) URL(s) — none may be fetched at runtime:\n  ${urls.slice(0, 12).join('\n  ')}`);
writeFileSync(html, page);
rmSync(join(DIR, 'assets'), { recursive: true, force: true });
const out = join(GAME_DIR, '..', 'release', 'skytalon.zip');
mkdirSync(dirname(out), { recursive: true });
rmSync(out, { force: true });
execFileSync('tar', ['-a', '-c', '-f', out, '-C', DIR, 'index.html']);
const kb = n => `${(n / 1024).toFixed(1)} KB`;
console.log(`index.html ${kb(statSync(html).size)} · zip ${kb(statSync(out).size)} -> ${out}`);
if (statSync(out).size > HARD) { console.error(`zip over the hard limit (${kb(HARD)})`); process.exit(1); }
