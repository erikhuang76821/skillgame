// Client for the route-A backend (docs/backend_design.md §2; prototype in TwinStrike/server). Render / UI layer:
// the sim never sees any of this. Every call fails soft (returns { ok: false, error }) so the game stays playable
// offline; failed score uploads are queued on the device and retried (the server is idempotent per log).
const ACCOUNT = 'twinstrike-account-v1', PENDING = 'twinstrike-pending-v1', TIMEOUT_MS = 5000;

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

/** API base: ?api=<url> (dev / playtest), else VITE_API_URL at build time, else this host on port 8787 (dev). */
export function apiBase(params) {
  return params.get('api') || import.meta.env?.VITE_API_URL || `${location.protocol}//${location.hostname}:8787`;
}

export class Api {
  constructor(base) { this.base = base.replace(/\/$/, ''); this.account = read(ACCOUNT, null); this.clockSkewMs = 0; }

  async call(method, path, body, auth = false) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const headers = { 'content-type': 'application/json' };
      if (auth && this.account?.token) headers.authorization = `Bearer ${this.account.token}`;
      const res = await fetch(this.base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
      const data = await res.json().catch(() => ({}));
      return res.ok ? { ...data, ok: true, http: res.status } : { ok: false, http: res.status, error: data.error ?? `http_${res.status}`, detail: data.detail };
    } catch (e) {
      return { ok: false, http: 0, error: e.name === 'AbortError' ? 'timeout' : 'offline' };
    } finally { clearTimeout(timer); }
  }

  /** C1 / C7: today's challenge; also measures the server clock (display-only countdown). */
  async daily() {
    const t0 = Date.now(), r = await this.call('GET', '/daily');
    if (r.ok && r.serverTime) this.clockSkewMs = r.serverTime - (t0 + Date.now()) / 2;
    return r;
  }

  serverNow() { return Date.now() + this.clockSkewMs; }

  /** C4: a guest account is created silently the first time it is needed. */
  async ensureAccount() {
    if (this.account?.token) return { ok: true, ...this.account };
    const r = await this.call('POST', '/account/guest', {});
    if (r.ok) { this.account = { playerId: r.playerId, name: r.name, token: r.token }; write(ACCOUNT, this.account); }
    return r;
  }

  /** C2: upload one finished daily run. Network failures are queued and retried by flushPending(). */
  async submit(date, upload) {
    const acc = await this.ensureAccount();
    if (!acc.ok) { this.queue(date, upload); return { ok: false, error: acc.error, queued: true }; }
    const r = await this.call('POST', '/submit', { date, upload }, true);
    if (r.http === 401) {                                         // token lost server-side: make a new guest, retry once
      this.account = null; write(ACCOUNT, null);
      const again = await this.ensureAccount();
      if (again.ok) return this.call('POST', '/submit', { date, upload }, true);
    }
    if (!r.ok && (r.http === 0 || r.http >= 500)) { this.queue(date, upload); return { ...r, queued: true }; }
    return r;
  }

  queue(date, upload) {
    const list = read(PENDING, []);
    if (!list.some(p => p.upload.log === upload.log)) list.push({ date, upload });
    write(PENDING, list.slice(-20));
  }

  /** Retry queued uploads (called at boot). Drops the ones the server answered for good (accepted or rejected). */
  async flushPending() {
    const list = read(PENDING, []);
    if (!list.length) return 0;
    const keep = [];
    for (const p of list) {
      const r = await this.call('POST', '/submit', p, true);
      if (!r.ok && (r.http === 0 || r.http >= 500 || r.http === 401)) keep.push(p);
    }
    write(PENDING, keep);
    return list.length - keep.length;
  }

  leaderboard(date, limit = 5) { return this.call('GET', `/leaderboard/${encodeURIComponent(date)}?limit=${limit}`, null, true); }
}

/** Player-facing text for submit errors (docs/backend_design.md §2.2). */
export function submitMessage(r) {
  if (r.ok) return r.status === 'review' ? '成績審核中，通過後會出現在排行榜' : r.rank ? `今日排名 第 ${r.rank} 名` : '成績已上傳';
  if (r.queued) return '目前離線，成績會在下次開啟時自動上傳';
  return {
    version_mismatch: '有新版本，請重新整理頁面後再挑戰',
    window_closed: '今日題目已結束，成績未計入',
    not_open: '題目還沒開放',
    no_daily: '今日題目已更新，請重新整理',
  }[r.error] ?? `成績未計入（${r.error}）`;
}
