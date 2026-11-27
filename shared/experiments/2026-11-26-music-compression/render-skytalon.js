// Render two SkyTalon synthesised themes to WAV, offline (paste into the console of the SkyTalon dev server page,
// npm --prefix SkyTalon/game run dev, with serve.mjs running to receive the files). Output: leg1.wav, leg4boss.wav,
// 48 kHz stereo 16-bit, 16 bars each. Music.at() schedules by absolute time, so the whole piece is scheduled at once.
const { Music, THEMES } = await import('/src/audio/music.js');
const toWav = buf => {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate, dv = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, ch, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * ch * 2, true); dv.setUint16(32, ch * 2, true);
  dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * ch * 2, true);
  const d = [...Array(ch)].map((_, c) => buf.getChannelData(c));
  let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { dv.setInt16(o, Math.max(-1, Math.min(1, d[c][i])) * 32767, true); o += 2; }
  return new Blob([dv]);
};
for (const [name, bars] of [['leg1', 16], ['leg4boss', 16]]) {
  const T = THEMES[name], dt = 60 / T.bpm / 4, steps = bars * 16, dur = steps * dt + 3;
  const ctx = new OfflineAudioContext(2, Math.ceil(48000 * dur), 48000);
  const nb = ctx.createBuffer(1, 48000, 48000); { const d = nb.getChannelData(0); let s = 0x2545f491; for (let i = 0; i < d.length; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; d[i] = (s >>> 0) / 2147483648 - 1; } }
  const master = ctx.createGain(); master.gain.value = 2.2;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 8; master.connect(comp).connect(ctx.destination);
  const m = new Music({ ctx, master, noise: () => nb }); m.theme = T;
  const mm = new Map(); let st = 0; for (const [deg, beats] of T.melody) { const len = Math.round(beats * 4); mm.set(st, { deg, len }); st += len; }
  m.notes = { get: k => mm.get(k), len: st };
  m.bus(); for (let i = 0; i < steps; i++) m.at(i, 0.05 + i * dt, dt);
  await fetch(`http://127.0.0.1:5190/?name=${name}.wav`, { method: 'POST', body: toWav(await ctx.startRendering()) });
}
