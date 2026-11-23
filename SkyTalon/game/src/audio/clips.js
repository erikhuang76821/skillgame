// Recorded combat clips (art/manifest skytalon.audio.combat-clips), 22 kHz mono MP3 at 48 kbps. A clip with the same
// name as a recipe in sfx.js replaces it once decoded; the recipe plays until then, if decoding fails, and whenever
// the file is not in this checkout.
//   効果音ラボ (https://soundeffect-lab.info/): shot, hit, kill, boom, bossdown, hurt (stereo), built by
//     art/tools/make_battle_sfx.py.
//     Free for games and commercial use, but the files may not be redistributed, so they are kept out of the public
//     repository (SkyTalon/.gitignore): a clone builds without them and those six play the synthesised recipes.
//   DevsDaddy/Unity-UI-Audio-Collection (MIT, Copyright (c) 2024 Elijah Brown): clear, pickup, powerup, boost, appear.
const FILES = import.meta.glob('../assets/sfx/*.mp3', { eager: true, query: '?url', import: 'default' });

const GAIN = {
  shot: 0.16,       // the ship's gun (every other volley, pitch spread by the caller)
  hit: 0.3,         // a shot lands (panned to where, with a little room)
  kill: 0.55,       // an enemy goes down: a deep rolling boom-boom-boom
  boom: 0.6,        // bombs, slams, a boss's stage breaking
  hurt: 0.75,       // the ship is hit: a dull, drawn-out break, wide in stereo
  clear: 0.7,       // a leg flown to the end
  pickup: 0.55,     // a drop collected
  powerup: 0.55,    // a piece of gear chosen at a supply
  bossdown: 0.8,    // a boss destroyed
  boost: 0.6,       // the boost between chapters
  appear: 0.5,      // a boss arrives (under the warning tones)
};

/** name -> { url, gain }, for the clips present in this checkout */
export const CLIPS = Object.fromEntries(Object.entries(GAIN)
  .filter(([name]) => FILES[`../assets/sfx/${name}.mp3`])
  .map(([name, gain]) => [name, { url: FILES[`../assets/sfx/${name}.mp3`], gain }]));
