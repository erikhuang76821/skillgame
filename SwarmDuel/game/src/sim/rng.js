// Stateless hash RNG: the value depends only on (seed, stream, index), never on call order,
// so two players who act differently still face the same spawns and offers (gdd/02).
const STREAMS = { spawn: 1, kind: 2, offer: 3, ai: 4, beam: 5, map: 6 };

export function hash32(a, b, c) {
  let h = (a ^ Math.imul(b + 0x632be5ab, 0x9e3779b1) ^ Math.imul(c + 0x2545f491, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return (h ^ (h >>> 16)) >>> 0;
}

export function rng(seed, stream, index) {
  const s = STREAMS[stream];
  if (!s) throw new Error(`Unknown RNG stream: ${stream}`);
  return hash32(seed >>> 0, s, index >>> 0);
}

export function seedFromString(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
