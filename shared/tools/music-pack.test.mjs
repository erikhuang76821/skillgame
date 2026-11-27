// Tests for music-pack.mjs (RULE-MUSIC-ENCODE, RULE-MUSIC-LOOP). Skipped under plain `node --test` when ffmpeg or
// python+scipy is missing; the test card runs `music-pack.mjs --self-test`, which exits 2 (could not run) instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG, hasDeps, packMusic } from './music-pack.mjs';
import { loadRules } from './rules.mjs';

const skip = !hasDeps() && 'needs ffmpeg with libopus and python with numpy + scipy';
const TOOL = fileURLToPath(new URL('./music-pack.mjs', import.meta.url));

test('a 120 bpm track becomes a loop that matches the rules, with a minimal sidecar and a decode check', { skip }, () => {
  const rules = loadRules({ from: fileURLToPath(import.meta.url) });
  const dir = mkdtempSync(join(tmpdir(), 'music-pack-test-'));
  try {
    // 40 s: a decaying 220 Hz hit every beat (0.5 s) and a 330 Hz accent on every bar, so the music repeats per bar
    const src = join(dir, 'beat.wav');
    const expr = '0.4*sin(2*PI*220*t)*exp(-8*mod(t\\,0.5))+0.3*sin(2*PI*330*t)*exp(-6*mod(t\\,2))';   // commas escaped for the filtergraph
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc=${expr}:c=stereo:s=48000:d=40`, src], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const { sidecar, report } = packMusic(src, join(dir, 'out'), { name: 'beat' });
    const beats = rules.value('RULE-MUSIC-LOOP', 'beats');
    assert.ok(Math.abs(report.technical.bpm - 120) < 1, `bpm ${report.technical.bpm}`);
    assert.ok(Math.abs(sidecar.samples / sidecar.sampleRate - beats * 0.5) < 0.05, `loop ${sidecar.samples / sidecar.sampleRate} s`);
    assert.equal(sidecar.sampleRate, rules.value('RULE-MUSIC-ENCODE', 'sampleRate'));
    assert.equal(report.technical.bitrate, rules.value('RULE-MUSIC-ENCODE', 'bitrate'));
    assert.equal(report.technical.channels, rules.value('RULE-MUSIC-ENCODE', 'channels'));
    assert.ok(report.technical.matchScore >= rules.value('RULE-MUSIC-LOOP', 'minMatch'));
    assert.deepEqual(report.warnings, []);
    assert.equal(report.packer.config, CONFIG.version);
    // the padded tail means the decoded file reaches past loopEnd
    assert.ok(report.decode.coversLoopEnd && report.decode.decodedSamples >= sidecar.samples);
    // sidecar = exactly what the player and the audit need, and its hash is the shipped webm's
    const saved = JSON.parse(readFileSync(join(dir, 'out', 'beat.loop.json'), 'utf8'));
    assert.deepEqual(Object.keys(saved).sort(), ['file', 'sampleRate', 'samples', 'sha256']);
    assert.equal(saved.sha256, createHash('sha256').update(readFileSync(join(dir, 'out', 'beat.webm'))).digest('hex'));
    assert.equal(report.source.sha256, createHash('sha256').update(readFileSync(src)).digest('hex'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the CLI takes no shortcut around the rules (beats / bitrate change only through overrides)', () => {
  const r = spawnSync(process.execPath, [TOOL, 'in.wav', 'out', '--beats', '16'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /rules\.overrides\.json/);
  assert.equal(existsSync('out'), false);
});
