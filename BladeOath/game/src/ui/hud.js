// DOM HUD and panels (UI is always HTML/CSS over the canvas). Reads the sim; never writes it — the shrine panel only
// calls the Recorder's choose(), which logs the choice for replay.
import { gsap } from 'gsap';
import { FEEL } from '../fx/feel.js';
import {
  FOES, SKILLS, NODES, ARMORS, XP_TABLE, LEVEL_CAP, FORGE_COST, PARRY_PTS, PERFECT_PTS, INTERRUPT_PTS, EXEC_PTS, BOSS_PTS, FINAL_PTS, TIME_PTS,
  TECH_CAP, MATCH_TICKS, TICK_MS, ESCAPE_CD, CH_LEAVE, CH_LEVEL, CH_NODE, CH_RESET, CH_SLOT, CH_ARMOR, CH_FORGE, CH_ROUTE,
} from '../sim/sim.js';

const h = (tag, cls, html = '') => { const n = document.createElement(tag); if (cls) n.className = cls; n.innerHTML = html; return n; };
const pct = (v, max) => `${Math.max(0, Math.min(100, (100 * v) / max))}%`;
const sec = ticks => +(ticks * TICK_MS / 1000).toFixed(2);
// Shrine node names and one-line effects in player units (A6). Index = NODES index in sim.js; tick counts mirror its effects.
const NODE_UI = [
  ['氣血 +20', '氣血上限提高'],
  ['體力 +200', '能多閃、多擋幾次'],
  ['閃避距離 +16', '閃得更遠'],
  ['卸勁窗口 +2 tick', () => `卸勁判定多 ${sec(2)} 秒`],
  [() => `脫離冷卻 −${sec(300)} 秒`, () => `從 ${sec(ESCAPE_CD)} 秒減到 ${sec(ESCAPE_CD - 300)} 秒`],
  ['內力 +30', '多放一次耗內力的招'],
  ['架勢 +30', '比較晚被破防'],
  ['負重 +1', '穿重甲也閃得遠'],
  ['解鎖回風', '後撤一步再橫斬（耗內力）'],
  ['解鎖連星', '向前三連刺（耗內力）'],
  [() => `解鎖劍幕`, () => `架式 ${sec(24)} 秒內白光攻擊自動卸勁（耗內力）`],
  ['解鎖流光', '遠距直線劍氣，能「斷」（耗內力）'],
  ['普攻架勢 +25%', '普攻削敵人架勢更多'],
  ['劍招冷卻 −15%', '所有劍招冷卻縮短'],
].map(([n, d]) => [typeof n === 'function' ? n() : n, typeof d === 'function' ? d() : d]);
const mmss = ticks => { const s = Math.max(0, Math.ceil(ticks / 60)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class Hud {
  constructor(root) {
    this.root = root;
    // Each bar carries a one-character label so colour is not the only cue (UX #7): 血 HP, 勢 posture, 體 stamina, 氣 qi.
    root.append(this.bars = h('div', 'bars', `
      <div class="row"><b style="color:var(--hp)">血</b><div class="bar hp" role="meter" aria-label="氣血"><i></i></div></div>
      <div class="row"><b style="color:var(--pos)">勢</b><div class="bar pos" role="meter" aria-label="架勢（滿了會破防）"><i></i></div></div>
      <div class="row"><b style="color:var(--sta)">體</b><div class="bar sta" role="meter" aria-label="體力"><i></i></div></div>
      <div class="row"><b style="color:var(--qi)">氣</b><div class="bar qi" role="meter" aria-label="內力"><i></i></div></div>
      <div class="meta"></div>`));
    root.append(this.scoreEl = h('div', 'score', '0<small></small>'));
    root.append(this.boss = h('div', 'boss', '<div class="name"></div><div class="bar hp"><i></i></div><div class="bar pos"><i></i></div>'));
    root.append(this.toastEl = h('div', 'toast'));
    root.append(this.dcEl = h('div', 'dc'));
    this.dcEl.hidden = true;
    // Touch has no Esc: a pause button under the score (A2). The label carries the pauses left.
    root.append(this.pauseEl = h('button', 'pause', '暫停'));
    this.pauseEl.type = 'button'; this.pauseEl.tabIndex = -1; this.pauseEl.hidden = true;
    this.boss.hidden = true;
    addEventListener('resize', () => { this.barsRect = null; });
    this.q = sel => this.bars.querySelector(sel);
  }

  /** A fight under the status bars fades them (A4). pts = screen points of the player and nearby foes. */
  fadeBars(pts) {
    const r = this.barsRect ??= this.bars.getBoundingClientRect();
    this.bars.classList.toggle('under', pts.some(q => q.x > r.left - 12 && q.x < r.right + 12 && q.y > r.top - 24 && q.y < r.bottom + 40));
  }
  pauseButton(show, left) { this.pauseEl.hidden = !show; this.pauseEl.setAttribute('aria-label', `暫停（剩 ${left} 次）`); }

  update(sim, score) {
    const p = sim.p;
    this.q('.hp i').style.width = pct(p.hp, p.hpMax);
    this.q('.pos i').style.width = pct(p.pos, p.posMax);
    this.q('.bar.pos').classList.toggle('warn', p.pos >= p.posMax * 0.8);
    this.q('.sta i').style.width = pct(p.sta, p.staMax);
    this.q('.qi i').style.width = pct(p.qi, p.qiMax);
    const need = p.lv < LEVEL_CAP ? XP_TABLE[p.lv - 1] : 0;
    this.q('.meta').textContent = `Lv ${p.lv}　修為 ${p.xp}${need ? ` / ${need}` : ''}　鍛材 ${p.ore}　${ARMORS[p.armor].name}${p.forge ? `　劍+${p.forge}` : ''}`;
    this.scoreEl.firstChild.textContent = score;
    this.scoreEl.querySelector('small').textContent = `剩 ${mmss(MATCH_TICKS - sim.tick)}`;
    // Boss bar: the boss whose room the player stands in
    const boss = sim.foes.find(f => f.boss >= 0 && f.alive && f.boss === p.room && f.st !== 0);
    this.boss.hidden = !boss;
    if (boss) {
      this.boss.querySelector('.name').textContent = FOES[boss.type].name + (boss.phase === 2 ? '・二' : '');
      this.boss.querySelector('.hp i').style.width = pct(boss.hp, boss.hpMax);
      this.boss.querySelector('.pos i').style.width = pct(boss.pos, FOES[boss.type].pos);
    }
  }

  toast(text, color = '#e9e4d8') {
    this.toastEl.textContent = text; this.toastEl.style.color = color;
    announce(text);
    gsap.fromTo(this.toastEl, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: FEEL.ui.in, overwrite: true });
    gsap.to(this.toastEl, { opacity: 0, duration: 0.4, delay: 1.4 });
  }
}

/** Modal panel helper: show(html-builder) / hide(). */
export class Panel {
  constructor() {
    this.el = h('div', 'panel'); this.card = h('div', 'card'); this.el.append(this.card); document.body.append(this.el);
    this.card.setAttribute('role', 'dialog'); this.card.setAttribute('aria-modal', 'true');
  }
  /** Rebuilds the card; keyboard focus goes to the main button (or stays on the same button after a rebuild). */
  show(build) {
    const wasOpen = this.open, keep = wasOpen ? document.activeElement?.dataset?.k : null, top = this.card.scrollTop;
    this.card.innerHTML = ''; build(this.card); this.el.classList.add('show');
    const heading = this.card.querySelector('h1'); if (heading) { heading.id = 'panel-title'; this.card.setAttribute('aria-labelledby', 'panel-title'); }
    this.card.querySelectorAll('button').forEach((b, i) => { b.dataset.k = b.dataset.k || `${i}:${b.textContent}`; });
    const again = keep && [...this.card.querySelectorAll('button')].find(b => b.dataset.k === keep && !b.disabled);
    (again || this.card.querySelector('.cta .btn.primary') || this.card.querySelector('.btn.primary:not(:disabled)') || this.card.querySelector('button'))?.focus({ preventScroll: true });
    if (wasOpen) { this.card.scrollTop = top; return; }
    gsap.fromTo(this.card, { scale: 0.96, opacity: 0 }, { scale: 1, opacity: 1, duration: FEEL.ui.in, ease: FEEL.ui.inEase });
  }
  hide() { this.el.classList.remove('show'); if (this.el.contains(document.activeElement)) document.activeElement.blur(); }   // Enter in play must not re-press a hidden button
  get open() { return this.el.classList.contains('show'); }
}

const button = (label, on, { primary = false, disabled = false, active = false } = {}) => {
  const b = h('button', `btn${primary ? ' primary' : ''}${active ? ' on' : ''}`, label);
  b.type = 'button'; b.disabled = disabled; b.addEventListener('click', on); return b;
};

/** Screen-reader announcement (UX #11): boss, down, pickup and other toasts land in the polite live region. */
export function announce(text) { const n = document.getElementById('sr'); if (n) { n.textContent = ''; n.textContent = text; } }

/** Sticky footer row holding a panel's main action(s) (UX #4). */
export function cta(...nodes) { const row = h('div', 'cta'); row.append(...nodes); return row; }

/** In-game effect settings (UX #9): prefs = { low, cancelHint }; onToggle(key) flips one and returns the new prefs. */
export function settingsRow(prefs, onToggle) {
  const row = h('div', '');
  const toggle = (key, name) => {
    const paint = (b, on) => { b.textContent = `${name}：${on ? '開' : '關'}`; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); };
    const b = button('', () => paint(b, !!onToggle(key)[key]));
    paint(b, !!prefs[key]); row.append(b);
  };
  toggle('low', '降低特效'); toggle('cancelHint', '取消窗提示');
  return row;
}

export function scoringHtml() {
  return `<table>
    <tr><td>擊倒中頭目／終頭目</td><td class="n">${BOSS_PTS}／${FINAL_PTS}</td></tr>
    <tr><td>剩餘時間（打倒終頭目時）</td><td class="n">每秒 ${TIME_PTS}</td></tr>
    <tr><td>卸勁／完美閃避</td><td class="n">${PARRY_PTS}／${PERFECT_PTS}（各最多 ${TECH_CAP} 次）</td></tr>
    <tr><td>斷招／處決</td><td class="n">${INTERRUPT_PTS}／${EXEC_PTS}</td></tr>
  </table>
  <p>倒下後重打的小兵：修為與技巧分依次遞減（100% → 50% → 25% → 0）。等級與裝備不加分，只讓你打得過。沒有暴擊、沒有隨機掉落。</p>`;
}

export function startPanel(panel, seed, onStart, prefs, onToggle) {
  panel.show(c => {
    c.append(h('h1', '', '刀誓'), h('p', '', `橫向卷軸的暗黑仙俠清版。一路往右打，一章一局，最長 7 分鐘。題目 #${seed}：同一題每個人遇到一樣的敵人與出招。`));
    c.append(h('h2', '', '讀起手光色'), h('ul', '', `
      <li><b class="glow-w">白光・頭上「擋」</b>（細實線）：按「擋」，壓在出手前一瞬間 = <b>卸勁</b>（不受傷、削敵架勢、冷卻退還）</li>
      <li><b class="glow-g">金光＋讀條・頭上「斷」</b>（虛線）：讀條內用帶「斷」的招式（疾刺、點穴）打中 = <b>斷招</b></li>
      <li><b class="glow-r">赤光・頭上「閃」</b>（粗線）：只能<b>閃</b>，格擋會被破防；壓線閃開 = 完美閃避</li>
      <li>敵人架勢滿 → 破防 → 任何一擊都是<b>處決</b>。繞到背後打，架勢加倍</li>
      <li>只有<b>同一條線上</b>（上下差不多高）的攻擊打得到；上下錯開就躲開了</li>
      <li>貼著小兵往前推 = <b>抓</b>，再按攻 = 膝撞，推方向＋攻 = 摔出去撞倒別人；跳起來可以躲過掃地</li>`));
    c.append(h('h2', '', '操作'), h('ul', '', `
      <li>手機：左半邊拖曳＝移動；右下按鈕</li>
      <li>鍵盤：WASD／方向鍵移動（上下＝往裡、往外）；J 攻、K 擋、Space 跳、Shift 閃、L 脫離、U I O P 招式、E 互動、Esc 暫停（劍塚裡 Esc＝離開）</li>
      <li>只用滑鼠：點地面走過去（按住會跟著游標），點畫面上的按鈕出招</li>`));
    c.append(h('h2', '', '計分'), h('div', '', scoringHtml()));
    c.append(h('h2', '', '設定'), settingsRow(prefs, onToggle));
    c.append(cta(button('開始', onStart, { primary: true }), h('span', 'hint', 'Enter 開始')));
  });
}

/** Route panel at the end of the gate (gdd/05 §8): two logged choices, taken once. */
export function routePanel(panel, choose) {
  panel.show(c => {
    c.append(h('h1', '', '岔路'), h('p', '', '山門到此分成兩條路，都通往屍傀將殿，選了不能回頭。'));
    c.append(button('蠱林<small>較長；蠱師與精英蠱母，多修為與鍛材</small>', () => choose(CH_ROUTE), { primary: true }));
    c.append(button('枯井<small>較短；蠱師與蠱蟲，路底有寶箱</small>', () => choose(CH_ROUTE + 1)));
  });
}

/** Shrine panel: every button is one logged choice (gdd/05 §8). */
export function shrinePanel(panel, sim, choose, onChange) {
  const p = sim.p, has = n => (p.nodes >> n) & 1, unlocked = s => s < 2 || has(6 + s);
  panel.show(c => {
    c.append(h('h1', '', '劍塚'), h('p', '', `Lv ${p.lv}　修為 ${p.xp}　技能點 ${p.sp}　鍛材 ${p.ore}。休息時小兵已在原處重生；面板開著時間不走。`));
    const act = idx => () => { onChange(choose(idx)); };
    const need = p.lv < LEVEL_CAP ? XP_TABLE[p.lv - 1] : 0;
    c.append(button(need ? `升級（需修為 ${need}）` : '已達等級上限', act(CH_LEVEL), { disabled: !need || p.xp < need, primary: need && p.xp >= need }));
    c.append(button(p.forge < FORGE_COST.length ? `鍛劍 +${p.forge + 1}（鍛材 ${FORGE_COST[p.forge]}）` : '劍已鍛滿', act(CH_FORGE), { disabled: p.forge >= FORGE_COST.length || p.ore < FORGE_COST[p.forge] }));
    c.append(h('h2', '', '技能樹（每級 1 點；可重置）'));
    const g = h('div', 'grid');
    NODES.forEach((n, i) => {
      const b = button(`${i < 8 ? '共通' : '劍'}・${NODE_UI[i][0]}<small>${NODE_UI[i][1]}</small>`, act(CH_NODE + i), { disabled: has(i) || p.sp < 1, active: !!has(i) });
      b.classList.add('node'); g.append(b);
    });
    c.append(g, button('重置技能樹', act(CH_RESET), { disabled: !p.nodes }));
    c.append(h('h2', '', '招式欄（點招式名放進該格）'));
    for (let slot = 0; slot < 4; slot++) {
      const row = h('div', '', `<span class="meta">第 ${slot + 1} 格：</span>`);
      SKILLS.forEach((s, i) => { if (unlocked(i)) row.append(button(`${s.name}${s.brk ? '（斷）' : ''}`, act(CH_SLOT + slot * 8 + i), { active: p.slots[slot] === i })); });
      c.append(row);
    }
    c.append(h('h2', '', '護具'));
    ARMORS.forEach((a, i) => { if ((p.armors >> i) & 1) c.append(button(`${a.name}（負重 ${a.weight}、減傷 ${a.cut}%）`, act(CH_ARMOR + i), { active: p.armor === i })); });
    c.append(cta(button('離開劍塚', act(CH_LEAVE), { primary: true }), h('span', 'hint', 'Esc 離開')));
  });
}

/** @param playtest  null, or { label, note, onExport } when ?playtest=1 (N9): an export button under the restart one */
export function endPanel(panel, sim, breakdown, verified, onRestart, playtest = null) {
  const b = breakdown;
  panel.show(c => {
    c.append(h('h1', '', sim.bossDown & 2 ? '斬下墮仙' : '時辰已盡'));
    c.append(h('div', '', `<table>
      <tr><td>頭目</td><td class="n">${b.bosses}</td></tr>
      <tr><td>剩餘時間</td><td class="n">${b.time}</td></tr>
      <tr><td>卸勁 ×${b.parries}</td><td class="n">${b.parry}</td></tr>
      <tr><td>完美閃避 ×${b.perfects}</td><td class="n">${b.perfect}</td></tr>
      <tr><td>斷招 ×${b.interrupts}</td><td class="n">${b.interrupt}</td></tr>
      <tr><td>處決 ×${b.executions}</td><td class="n">${b.exec}</td></tr>
      <tr><td><b>總分</b></td><td class="n"><b>${b.bosses + b.time + b.parry + b.perfect + b.interrupt + b.exec}</b></td></tr>
      <tr><td class="meta">倒下 ${b.deaths} 次（不扣分）　等級 ${b.level}</td><td></td></tr></table>`));
    c.append(h('p', 'verify', verified));
    if (playtest) c.append(h('p', 'meta', playtest.note));
    c.append(cta(button('再來一局', onRestart, { primary: true }), ...(playtest ? [button(playtest.label, playtest.onExport)] : [])));
  });
}
