// Loop-seam check in the browser (paste into the console of listen.html served by serve.mjs). For each case: decode
// with decodeAudioData, play with AudioBufferSourceNode.loop (loopStart / loopEnd), render offline across one seam and
// report  seamVsP999 = max |2nd difference| within +-2 ms of the seam / its 99.9th percentile over the rest of the loop.
// ~1 means the seam is as smooth as the music itself; an audible click is typically > 10.
const SR = 48000, dec = new OfflineAudioContext(2, SR, SR);
const get = async f => dec.decodeAudioData(await (await fetch(f)).arrayBuffer());
async function seam(label, buf, loopStart, loopEnd) {
  const len = Math.round((loopEnd - loopStart) * SR);
  const ctx = new OfflineAudioContext(1, len + 9600, SR), src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true; src.loopStart = loopStart; src.loopEnd = loopEnd; src.connect(ctx.destination); src.start(0, loopStart);
  const y = (await ctx.startRendering()).getChannelData(0), d2 = i => Math.abs(y[i + 1] - 2 * y[i] + y[i - 1]);
  let s = 0; for (let i = len - 96; i < len + 96; i++) s = Math.max(s, d2(i));
  const all = []; for (let i = 1; i < len - 200; i += 5) all.push(d2(i)); all.sort((a, b) => a - b);
  return { label, decoded: buf.length, seamVsP999: +(s / all[Math.floor(all.length * 0.999)]).toFixed(2) };
}
// The cases of 2026-11-26 (start / bpm / samples from the prototype cut, see README):
const LOOPS = { inst_orchestral: [28.128, 80.06, 1152002], inst_synthwave: [52.736, 124.15, 743231], inst_tango: [64.352, 116.57, 791549] };
const out = [];
for (const [n, [st, bpm, N]] of Object.entries(LOOPS)) {
  out.push(await seam(`${n} naive 32-beat cut`, await get(`${n}.wav`), st, st + 32 * 60 / bpm));
  out.push(await seam(`${n} processed wav`, await get(`${n}_loop.wav`), 0, N / SR));
  const op = await get(`out/${n}_loop.opus_s48.webm`);
  out.push(await seam(`${n} opus48, loopEnd = decoded length`, op, 0, Math.min(op.length, N) / SR));
  out.push(await seam(`${n} opus48 padded, loopEnd = samples`, await get(`out/${n}_looppad.opus_s48.webm`), 0, N / SR));
}
console.table(out);
