// Human playtest mode (N9): ?playtest=1&tester=<name> keeps every finished match on this device and exports them as
// one JSON file for tools/human-report.mjs. Nothing is sent anywhere: the game is offline, the tester hands the file
// over. A record is the same upload a server would verify (seed + input log + claimed score), plus who and on what.
const KEY = 'blade-oath.playtest-';

export class PlaytestLog {
  /** @param tester  '' = playtest mode off */
  constructor(tester) {
    this.tester = tester;
    this.enabled = tester !== '';
    this.records = [];
    if (this.enabled) { try { this.records = JSON.parse(localStorage.getItem(KEY + tester) || '[]'); } catch { this.records = []; } }
  }
  get count() { return this.records.length; }

  /** @param upload  Recorder.upload()   @param summary  the result panel's numbers (for reading the file by eye) */
  add(upload, summary) {
    if (!this.enabled) return;
    this.records.push({
      tester: this.tester, run: this.records.length + 1, at: new Date().toISOString(),
      device: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio, touch: matchMedia('(pointer: coarse)').matches },
      upload, summary,
    });
    try { localStorage.setItem(KEY + this.tester, JSON.stringify(this.records)); } catch { /* storage may be blocked; the export still has this session */ }
  }

  download() {
    if (!this.records.length) return;
    const blob = new Blob([JSON.stringify(this.records, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bladeoath-playtest-${this.tester}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}
