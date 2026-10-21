// Human playtest records (docs/human_playtest_plan.md). Only active in playtest mode (?playtest=1&tester=<name>):
// every finished match is kept on the device with its full input log (the same upload the server would verify),
// so tools/human-report.mjs can replay it exactly and compare real players with the human-factor bots.
// Nothing leaves the device unless the tester presses "匯出試玩紀錄" and sends the file. Render / UI layer only.
const KEY = 'twinstrike-playtest-v1', CAP = 300;

const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? []; } catch { return []; } };
const save = list => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-CAP))); } catch { /* storage full or blocked */ } };

export class PlaytestLog {
  /** @param tester name from ?tester= (or '' to disable) */
  constructor(tester) { this.tester = tester; this.enabled = !!tester; }

  get count() { return load().filter(r => r.tester === this.tester).length; }

  /** Store one finished match. `rec` = core/match.js Recorder, `summary` = scoreBreakdown + extras. */
  add(rec, summary, latency) {
    if (!this.enabled) return;
    const list = load();
    const run = list.filter(r => r.tester === this.tester && r.upload.seed === rec.seed).length + 1;
    list.push({
      v: 1, tester: this.tester, at: new Date().toISOString(), run,
      upload: rec.upload(),                                          // game, version, seed, ticks, score, hash, log, choices, meta
      summary,
      latency: { ...latency },
      device: {
        ua: navigator.userAgent, w: innerWidth, h: innerHeight, dpr: devicePixelRatio,
        touch: navigator.maxTouchPoints || 0, lang: navigator.language,
      },
    });
    save(list);
  }

  /** JSON text of this tester's records (also used by tests / the console). */
  exportText() { return JSON.stringify(load().filter(r => r.tester === this.tester), null, 1); }

  /** Save this tester's records as a file the tester sends back. */
  download() {
    const blob = new Blob([this.exportText()], { type: 'application/json' });
    const a = document.createElement('a'), d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    a.href = URL.createObjectURL(blob);
    a.download = `twinstrike-playtest-${this.tester.replace(/[^\w一-鿿-]/g, '_')}-${stamp}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}
