#!/usr/bin/env node
// Music track -> seamless Opus/WebM loop + its sidecar (knowledge-base/14 §5, RULE-MUSIC-ENCODE, RULE-MUSIC-LOOP).
// The shipping contract (codec, bitrate, channels, beats, minMatch) comes from rules.json through rules.mjs, so a game
// changes it only by an override with a reason. How the loop is cut (crossfade, pad, start candidates, bpm range) is
// this tool's own versioned setting: audio/music-pack.config.json. Needs ffmpeg (libopus) and python 3 + numpy + scipy.
//
//   node shared/tools/music-pack.mjs <in.wav|flac|mp3> <outDir> [--name battle] [--game LanternHold] [--report out.json]
//
// Writes <outDir>/<name>.webm and <outDir>/<name>.loop.json { file, samples, sampleRate, sha256 } (what the player
// needs: loopEnd = samples / sampleRate). Prints a pack report (source hash, bpm, start, matchScore, decode check,
// config version) to copy into the game's art/manifest.json entry (kind music). Exit 1 if the decoded file does not
// reach loopEnd.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRules } from './rules.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CONFIG = JSON.parse(readFileSync(join(HERE, 'audio', 'music-pack.config.json'), 'utf8'));

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} failed: ${String(r.stderr || r.stdout).trim().split('\n').slice(-3).join(' | ')}`);
  return r.stdout;
}
const python = () => (spawnSync('python', ['--version']).status === 0 ? 'python' : 'python3');
const sha256 = p => createHash('sha256').update(readFileSync(p)).digest('hex');

/** Samples per channel that ffmpeg decodes from `file` at `rate` (pre-skip and end trimming applied). */
function decodedSamples(file, rate) {
  const pcm = run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(rate), '-f', 's16le', '-'], { encoding: 'buffer' });
  return pcm.length / 2;
}

/** @returns { sidecar, report } */
export function packMusic(src, outDir, { name = basename(src, extname(src)), game } = {}) {
  const rules = loadRules({ from: HERE, game });
  const v = (id, c) => rules.value(id, c);
  const enc = { codec: v('RULE-MUSIC-ENCODE', 'codec'), bitrate: v('RULE-MUSIC-ENCODE', 'bitrate'), sampleRate: v('RULE-MUSIC-ENCODE', 'sampleRate'), channels: v('RULE-MUSIC-ENCODE', 'channels') };
  const beats = v('RULE-MUSIC-LOOP', 'beats'), minMatch = v('RULE-MUSIC-LOOP', 'minMatch');
  if (enc.codec !== 'opus-webm') throw new Error(`music-pack: codec ${enc.codec} is not implemented`);

  const tmp = mkdtempSync(join(tmpdir(), 'music-pack-'));
  try {
    const wav = join(tmp, 'in.wav'), cut = join(tmp, 'loop.wav');
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-ar', String(enc.sampleRate), '-ac', String(enc.channels), '-c:a', 'pcm_s16le', wav]);
    const meta = JSON.parse(run(python(), ['-I', join(HERE, 'audio', 'mkloop.py'), wav, cut, '--beats', String(beats),
      '--crossfade-ms', String(CONFIG.crossfadeMs), '--pad-ms', String(CONFIG.padMs), '--starts', CONFIG.startCandidates.join(','),
      '--bpm-range', CONFIG.bpmRange.join(',')]));
    mkdirSync(outDir, { recursive: true });
    const out = join(outDir, `${name}.webm`);
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', cut, '-c:a', 'libopus', '-b:a', String(enc.bitrate), '-application', 'audio', out]);

    const decoded = decodedSamples(out, meta.sampleRate);
    const decoder = run('ffmpeg', ['-hide_banner', '-version']).split('\n')[0].trim();
    const sidecar = { file: `${name}.webm`, samples: meta.samples, sampleRate: meta.sampleRate, sha256: sha256(out) };
    const report = {
      sidecar: `${name}.loop.json`,
      source: { file: basename(src), sha256: sha256(src) },
      technical: { bpm: meta.bpm, start_s: meta.start_s, beats, matchScore: meta.matchScore, codec: enc.codec, bitrate: enc.bitrate, channels: enc.channels, bytes: readFileSync(out).length },
      decode: { decoder, decodedSamples: decoded, coversLoopEnd: decoded >= meta.samples },
      packer: { config: CONFIG.version },
      warnings: meta.matchScore < minMatch ? [`matchScore ${meta.matchScore} < ${minMatch}: no start lines up well; listen to the seam or use another source section`] : [],
    };
    if (!report.decode.coversLoopEnd) throw new Error(`music-pack: ${out} decodes to ${decoded} samples, short of loopEnd ${meta.samples} (RULE-MUSIC-LOOP decodedCoversLoopEnd)`);
    writeFileSync(join(outDir, `${name}.loop.json`), JSON.stringify(sidecar, null, 2) + '\n');
    return { sidecar, report };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

/** ffmpeg with libopus and python with numpy + scipy are on PATH */
export function hasDeps() {
  const py = ['python', 'python3'].some(p => spawnSync(p, ['-c', 'import numpy, scipy']).status === 0);
  const ff = String(spawnSync('ffmpeg', ['-hide_banner', '-encoders']).stdout ?? '').includes('libopus');
  return py && ff;
}

const same = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();
if (process.argv[1] && same(fileURLToPath(import.meta.url), process.argv[1]) && process.argv[2] === '--self-test') {
  // Test-card entry (TEST-MUSIC-PACK): exit 2 = could not run (missing tools), never a silent pass.
  if (!hasDeps()) { console.error('music-pack self-test: needs ffmpeg with libopus and python with numpy + scipy'); process.exit(2); }
  const r = spawnSync(process.execPath, ['--test', join(HERE, 'music-pack.test.mjs')], { stdio: 'inherit' });
  process.exit(r.status === 0 ? 0 : 1);
} else if (process.argv[1] && same(fileURLToPath(import.meta.url), process.argv[1])) {
  const [src, outDir, ...rest] = process.argv.slice(2);
  const opt = {};
  for (let i = 0; i < rest.length; i += 2) {
    const k = rest[i].replace(/^--/, '');
    if (!['name', 'game', 'report'].includes(k) || rest[i + 1] === undefined) { opt.bad = rest[i]; break; }
    opt[k] = rest[i + 1];
  }
  if (!src || !outDir || opt.bad) {
    console.error(`usage: node shared/tools/music-pack.mjs <in> <outDir> [--name n] [--game G] [--report file]${opt.bad ? `\n(unknown or incomplete option ${opt.bad}; change beats or bitrate through <Game>/config/rules.overrides.json)` : ''}`);
    process.exit(2);
  }
  try {
    const { report } = packMusic(src, outDir, opt);
    if (opt.report) writeFileSync(opt.report, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    for (const w of report.warnings) console.warn('WARN ' + w);
  } catch (e) { console.error(e.message); process.exit(1); }
}
