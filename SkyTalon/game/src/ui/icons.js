// Small pictures for the supply cards, one per piece of gear (index = gear id in the sim). Inline SVG: no files, no
// draw calls, and they take their size from the card. Each shows what the gear does, not what it is called.
const C = { fire: '#8ff6ff', hot: '#ffd24a', plasma: '#b46bff', guard: '#7fe7a0', move: '#ffb347', ink: '#f3ecdf' };
const svg = body => `<svg viewBox="0 0 32 32" width="100%" height="100%" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const bolt = (x, y, h, c, w = 3) => `<path d="M${x} ${y + h}V${y + 3}l${w / 2 + 0.01} -3" stroke="${c}" stroke-width="${w}"/>`;
const jet = (x, y, s, c) => `<path d="M${x} ${y - 5 * s}l${4 * s} ${9 * s}l${-4 * s} ${-2 * s}l${-4 * s} ${2 * s}z" fill="${c}"/>`;

export const GEAR_ICON = [
  // rapid fire: bolts one after another in the same line
  svg(`${bolt(11, 3, 6, C.fire)}${bolt(11, 12, 6, C.fire)}${bolt(11, 21, 6, C.fire)}${bolt(21, 3, 6, C.fire)}${bolt(21, 12, 6, C.fire)}${bolt(21, 21, 6, C.fire)}`),
  // spread: shots fanning out from one point
  svg(`<path d="M16 28V6M16 28L6 9M16 28L26 9" stroke="${C.fire}" stroke-width="3"/><circle cx="16" cy="5" r="2.4" fill="${C.ink}"/><circle cx="6" cy="8" r="2.4" fill="${C.ink}"/><circle cx="26" cy="8" r="2.4" fill="${C.ink}"/>`),
  // pierce: one shot through several enemies
  svg(`<path d="M16 29V4M11 9l5 -5l5 5" stroke="${C.fire}" stroke-width="3"/><path d="M7 21h18M7 13h18" stroke="${C.ink}" stroke-width="3" stroke-dasharray="6 6" opacity=".85"/>`),
  // heavy rounds: one big shell
  svg(`<path d="M10 28V13Q10 4 16 3Q22 4 22 13V28Z" fill="${C.hot}"/><path d="M10 22h12" stroke="#6b4a14" stroke-width="2.5"/><path d="M14 18V11" stroke="#fff" stroke-width="2.5"/>`),
  // plasma cannon: a curved arc from the ship to a target
  svg(`<path d="M16 28Q2 16 22 7" stroke="${C.plasma}" stroke-width="5" opacity=".45"/><path d="M16 28Q2 16 22 7" stroke="#f1dcff" stroke-width="2"/><circle cx="23" cy="6.5" r="4" fill="${C.plasma}"/><circle cx="23" cy="6.5" r="1.8" fill="#fff"/><path d="M26 12l3 2M27 3l3 -1M19 2l-1 -1.5" stroke="${C.plasma}" stroke-width="1.6"/>`),
  // wingmen: a small ship on each side
  svg(`${jet(16, 14, 1.5, C.ink)}${jet(5.5, 22, 0.9, C.fire)}${jet(26.5, 22, 0.9, C.fire)}`),
  // barrier: the ship inside a shield
  svg(`<path d="M16 3L27 7V16Q27 25 16 29Q5 25 5 16V7Z" stroke="${C.guard}" stroke-width="2.6" fill="rgba(127,231,160,.16)"/>${jet(16, 17, 1.1, C.ink)}`),
  // thrusters: the ship with a long flame and speed lines
  svg(`${jet(16, 10, 1.4, C.ink)}<path d="M13 19L16 30L19 19Z" fill="${C.move}"/><path d="M5 8v9M27 8v9M8.5 16v8M23.5 16v8" stroke="${C.move}" stroke-width="2" opacity=".8"/>`),
];
