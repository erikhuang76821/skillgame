// Prototype storage: everything in memory, optionally mirrored to one JSON file (atomic tmp + rename).
// Tables mirror docs/backend_design.md §6 so moving to Postgres is a swap of this file only.
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const empty = () => ({ players: {}, tokens: {}, dailies: {}, runs: [], rejects: {} });

export function createStore(file = null) {
  const db = file && existsSync(file) ? { ...empty(), ...JSON.parse(readFileSync(file, 'utf8')) } : empty();
  const save = () => {
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify(db));
    renameSync(`${file}.tmp`, file);
  };

  return {
    addPlayer(player, tokenHash) { db.players[player.id] = player; db.tokens[tokenHash] = player.id; save(); return player; },
    playerByToken: tokenHash => db.players[db.tokens[tokenHash]] ?? null,
    player: id => db.players[id] ?? null,

    daily: date => db.dailies[date] ?? null,
    putDaily(daily) { db.dailies[daily.date] = daily; save(); return daily; },

    addRun(run) { run.id = db.runs.length + 1; db.runs.push(run); save(); return run; },
    run: id => db.runs[id - 1] ?? null,
    updateRun(id, patch) { Object.assign(db.runs[id - 1], patch); save(); return db.runs[id - 1]; },
    runsFor: date => db.runs.filter(r => r.date === date),
    runByDigest: (date, digest) => db.runs.find(r => r.date === date && r.logDigest === digest) ?? null,
    runsWithStatus: status => db.runs.filter(r => r.status === status),

    /** Hard rejections per (date, player): repeated replay failures mark the account's later runs for review. */
    addReject(date, playerId, code) {
      const k = `${date}|${playerId}`;
      (db.rejects[k] ??= {})[code] = (db.rejects[k][code] ?? 0) + 1;
      save();
    },
    rejectsFor: (date, playerId) => db.rejects[`${date}|${playerId}`] ?? {},
  };
}
