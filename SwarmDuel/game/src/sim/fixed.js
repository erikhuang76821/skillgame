// Fixed-point helpers. Sim uses only + - * / and Math.sqrt (IEEE-exact on every engine);
// Math.sin/cos may differ in the last bit between JavaScriptCore and V8, so the trig table
// is built from a Taylor series using basic arithmetic only (gdd/10).
export const ONE = 256;

function taylorSin(x) {
  const x2 = x * x;
  let term = x, sum = x;
  for (let k = 1; k < 14; k++) {
    term *= -x2 / ((2 * k) * (2 * k + 1));
    sum += term;
  }
  return sum;
}

export const SIN = new Int32Array(256);
export const COS = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  let a = (i * 2 * Math.PI) / 256;
  if (a > Math.PI) a -= 2 * Math.PI;
  SIN[i] = Math.round(taylorSin(a) * ONE);
}
for (let i = 0; i < 256; i++) COS[i] = SIN[(i + 64) & 255];

// Eight directions in sprite-row order: down, down_right, right, up_right, up, up_left, left, down_left.
const D = 181; // round(256 / sqrt 2)
export const DX = Int32Array.of(0, D, ONE, D, 0, -D, -ONE, -D);
export const DY = Int32Array.of(ONE, D, 0, -D, -ONE, -D, 0, D);

export const trunc = Math.trunc;
