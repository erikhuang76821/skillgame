// After `vite build --mode zip`: inline the JS and CSS into dist-zip/index.html, drop the asset files, and zip it.
// The result opens with a double click (file://): no module fetches, no external URLs, nothing loaded at runtime.
import { readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const DIR = 'dist-zip', html = join(DIR, 'index.html');
let page = readFileSync(html, 'utf8');
page = page.replace(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/g, (_, f) =>
  `<script type="module">${readFileSync(join(DIR, f), 'utf8').replace(/<\/script/gi, '<\/script')}</script>`);
page = page.replace(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/g, (_, f) => `<style>${readFileSync(join(DIR, f), 'utf8')}</style>`);
if (/src="\.\/assets|href="\.\/assets/.test(page)) throw new Error('an asset reference was not inlined');
if (/https?:\/\/(?!www\.w3\.org)/.test(page.replace(/<!--[\s\S]*?-->/g, ''))) console.warn('note: the page text contains an http(s) URL — check that nothing is fetched at runtime');
writeFileSync(html, page);
rmSync(join(DIR, 'assets'), { recursive: true, force: true });
const out = join('..', 'release', 'lanternhold.zip');
mkdirSync(dirname(out), { recursive: true });
rmSync(out, { force: true });
execFileSync('tar', ['-a', '-c', '-f', out, '-C', DIR, 'index.html']);
const kb = n => `${(n / 1024).toFixed(1)} KB`;
console.log(`index.html ${kb(statSync(html).size)} · zip ${kb(statSync(out).size)} -> ${out}`);
if (statSync(out).size > 10 * 1024 * 1024) { console.error('zip over 10 MB'); process.exit(1); }
