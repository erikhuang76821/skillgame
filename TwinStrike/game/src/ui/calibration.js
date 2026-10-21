// Latency calibration (knowledge-base/13 §3, gdd/06 §8). Two tap-along passes of 4 count-in + 8 measured beats:
//   1. LISTEN: drum clicks scheduled on the AudioContext clock, nothing on screen moves
//      -> tap error = touch latency + audio output latency (+ habit)
//   2. WATCH: a silent flash on every beat
//      -> tap error = touch / display latency (+ habit)
// inputOffsetMs = WATCH result: shifts every tap earlier before the sim judges it (fair: windows unchanged, ±150 ms cap).
// audioLatencyMs = LISTEN − WATCH: how late sound reaches the ear; keysound snap + BGM are scheduled that much earlier.
// Results are kept per device (localStorage). Render / UI layer only.
import { calibrate } from '../sim/core/input.js';

const BEAT_MS = 600, COUNT_IN = 4, MEASURED = 8;
const KEY = 'twinstrike-latency-v1';

export function loadLatency() {
  try { const v = JSON.parse(localStorage.getItem(KEY)); return v && Number.isFinite(v.inputOffsetMs) ? v : null; } catch { return null; }
}
function saveLatency(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage may be blocked */ } }

export class Calibration {
  /** @param o { sfx, panel: HTMLElement, onDone(result|null) } */
  constructor(o) { Object.assign(this, o); this.active = false; this.raf = 0; }

  start() {
    this.active = true;
    this.sfx.unlock();
    this.results = {};
    this.panel.hidden = false;
    this.show('準備', '第 1 步：<b>閉上眼睛聽</b>，聽到「咚」就點一下畫面（或按任意方向鍵）<br>前 4 下是預備拍，之後要點 8 下', '開始第 1 步', () => this.pass('listen'));
  }

  show(title, html, button, onClick, extra = '') {
    this.panel.innerHTML = `<h2>${title}</h2><p>${html}</p><div class="cal-dot"></div><p class="cal-count small"></p>${extra}` +
      (button ? `<button class="cal-go">${button}</button>` : '') + '<button class="cal-cancel secondary">返回</button>';
    this.panel.querySelector('.cal-go')?.addEventListener('click', onClick);
    this.panel.querySelector('.cal-cancel').addEventListener('click', () => this.stop(null));
  }

  pass(kind) {
    const listen = kind === 'listen';
    this.show(listen ? '第 1 步：聽拍子' : '第 2 步：看閃光', listen ? '聽到「咚」就點（畫面不會動）' : '圓點亮起就點（沒有聲音）', null, null);
    const dot = this.panel.querySelector('.cal-dot'), count = this.panel.querySelector('.cal-count');
    const total = COUNT_IN + MEASURED, t0 = performance.now() + 800;
    this.beats = Array.from({ length: total }, (_, k) => t0 + k * BEAT_MS);    // performance-clock beat times
    this.taps = new Array(total).fill(null);
    if (listen) {
      // schedule every click exactly on its beat (no latency compensation here: latency is what we measure)
      const perfNow = performance.now();
      this.beats.forEach((p, k) => this.sfx.play(k < COUNT_IN ? 'accent' : 'taiko', { delay: Math.max(0, (p - perfNow) / 1000), gain: 1, exact: true }));
    }
    this.kind = kind;
    const tick = () => {
      const now = performance.now(), k = Math.floor((now - t0) / BEAT_MS);
      if (!listen) dot.classList.toggle('on', k >= 0 && k < total && now - this.beats[k] < 120);
      const n = this.taps.slice(COUNT_IN).filter(v => v !== null).length;
      count.textContent = k < 0 ? '預備…' : k < COUNT_IN ? `預備 ${COUNT_IN - k}` : `已點 ${n} / ${MEASURED}`;
      if (now > this.beats[total - 1] + 700) { this.finishPass(); return; }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Pointer / key press from main.js while calibrating (event timeStamp, same clock as performance.now()). */
  tap(ts) {
    if (!this.beats) return;
    let best = -1, d = 1e9;
    this.beats.forEach((p, k) => { if (Math.abs(ts - p) < Math.abs(d)) { d = ts - p; best = k; } });
    if (best >= 0 && Math.abs(d) < BEAT_MS * 0.45 && this.taps[best] === null) this.taps[best] = d;
  }

  finishPass() {
    const samples = this.taps.slice(COUNT_IN).filter(v => v !== null);
    const r = calibrate(samples, { maxAbs: this.kind === 'listen' ? 400 : 150 });
    this.beats = null;
    if (!r.ok) {
      this.show('不太穩定', `這一輪點了 ${samples.length} 下，間隔差距太大（需要 8 下且穩定）。請再試一次。`, '重做這一步', () => this.pass(this.kind));
      return;
    }
    this.results[this.kind] = r.offsetMs;
    if (this.kind === 'listen') {
      this.show('第 1 步完成', `聽拍子的平均偏差：${r.offsetMs} ms<br>第 2 步：<b>看螢幕</b>，圓點亮起就點（不會有聲音）`, '開始第 2 步', () => this.pass('watch'));
      return;
    }
    const inputOffsetMs = Math.max(-150, Math.min(150, this.results.watch));
    const audioLatencyMs = Math.max(0, Math.min(400, this.results.listen - this.results.watch));
    const result = { inputOffsetMs, audioLatencyMs, at: Date.now() };
    saveLatency(result);
    this.show('校正完成', `觸控／畫面延遲：<b>${inputOffsetMs} ms</b>（判定時會自動扣除）<br>音訊延遲：<b>${audioLatencyMs} ms</b>（打擊音和音樂會提早這麼多排程）<br><span class="small">換耳機或換手機時請重做一次</span>`,
      '完成', () => this.stop(result));
  }

  stop(result) {
    cancelAnimationFrame(this.raf);
    this.active = false; this.beats = null;
    this.panel.hidden = true;
    this.onDone?.(result);
  }
}
