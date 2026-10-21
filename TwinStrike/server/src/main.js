// Entry point: `npm start`. Configuration is environment-only (README.md).
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createStore } from './store.js';
import { CURRENT_VERSION, GAME_ID } from './sims.js';

const env = process.env;
const production = env.NODE_ENV === 'production';
if (production && !env.DAILY_SECRET) throw new Error('DAILY_SECRET is required in production');
if (!env.DAILY_SECRET) console.warn('[twin-strike-server] DAILY_SECRET not set: using a dev secret (seeds are predictable)');

const port = Number(env.PORT) || 8787;
const dataFile = env.DATA_FILE ?? fileURLToPath(new URL('../data/store.json', import.meta.url));

createApp({
  store: createStore(dataFile),
  secret: env.DAILY_SECRET ?? 'dev-only-secret',
  adminToken: env.ADMIN_TOKEN ?? null,
  corsOrigin: env.CORS_ORIGIN ?? (production ? 'null' : '*'),
}).listen(port, () => console.log(`[twin-strike-server] ${GAME_ID} sim v${CURRENT_VERSION} on http://localhost:${port} · data ${dataFile}`));
