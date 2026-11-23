// The stage map on the start layer: the legs of the campaign from the bottom up, three in view, the later ones by
// scrolling up. Legs open one after another: a leg can be entered once every leg before it has been flown to the end.
// The map names the legs reached so far and the next one; the rest are secret missions until they are reached. The
// last entry is a teaser for what comes after, never entered. DOM only.
export const LEGS = [
  { name: '守住地球', path: '海岸黃昏 → 雲海夜航 → 峽谷黎明 → 軌道深空', open: true },
  // legs two to six exist in the dev build only while they are being built; what ships them is not decided yet
  { name: '反攻內圈', path: '月球 → 水星 → 金星 → 地球廢墟', open: !!import.meta.env?.DEV, leg: 2 },
  { name: '外圈巨神', path: '火星 → 木星 → 土衛泰坦 → 土星', open: !!import.meta.env?.DEV, leg: 3 },
  { name: '冥界邊境', path: '天王星 → 天衛三 → 海王星 → 冥王星', open: !!import.meta.env?.DEV, leg: 4 },
  { name: '太陽與黑洞', open: !!import.meta.env?.DEV, leg: 5, path: '日冕 → 日面深處 → 黑洞（一） → 黑洞（二）' },
  { name: '失落的中生代', path: '三疊紀裂谷 → 侏羅紀巨木林 → 白堊紀內海 → 白堊紀末日', open: !!import.meta.env?.DEV, leg: 6 },
  { name: '敬請期待', teaser: true },
];

const NUMERAL = '一二三四五六七八九十';

/** Build the map into `root`; `onEnter(index)` is called for a leg that can be entered. Returns { toStart, refresh, guide }. */
export function stageMap(root, onEnter) {
  let cleared = 0;
  const playable = i => !!LEGS[i].open && i <= cleared;
  const nodes = LEGS.map((leg, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = '<span class="no"></span><span><div class="name"></div><div class="path"></div><div class="state"></div></span><span class="best"></span>';
    b.querySelector('.no').textContent = String(i + 1);
    // a tap enters; a drag scrolls the map (the browser cancels the click after a scroll gesture)
    b.addEventListener('click', e => { if (!playable(i)) return; e.stopPropagation(); onEnter(i); });
    return b;
  });
  root.replaceChildren(...nodes);
  const toStart = () => { root.scrollTop = root.scrollHeight; };
  /** Show how far the player has got: `n` = how many legs have been flown to the end; `best[i]` = the best score on
   *  leg i so far (shown at the right of every leg that has one). */
  const refresh = (n, best = []) => {
    cleared = n;
    nodes.forEach((b, i) => {
      const leg = LEGS[i], go = playable(i), named = leg.teaser || i <= cleared + 1;
      const top = best[i] > 0 && !leg.teaser ? best[i] : 0;
      b.querySelector('.best').innerHTML = top ? `最佳<b>${top.toLocaleString('en-US')}</b>` : '';
      b.className = `leg ${go ? 'open' : 'locked'}${i < cleared ? ' done' : ''}${named ? '' : ' secret'}`;
      b.disabled = !go;
      b.querySelector('.name').textContent = `航段${NUMERAL[i]}　${named ? leg.name : '秘密任務'}`;
      b.querySelector('.path').textContent = '';   // the card shows the leg and its state only (the route stays in LEGS for the cutscenes and docs)
      b.querySelector('.state').textContent =
        leg.teaser ? '新航段製作中' :
        go ? (i < cleared ? '已通關' : '可出擊') :
        !named ? '待解鎖' :
        i <= cleared ? '已解鎖：這個航段還在製作，尚未開放' : '打完前一個航段解鎖';
    });
  };
  /** Point at leg i (one a clear has just opened): scroll it into view, outline it and pin a tip on it, until a leg is
   *  entered. -1 takes the pointer away. */
  const guide = i => {
    nodes.forEach(b => { b.classList.remove('guide'); b.querySelector('.tip')?.remove(); });
    if (i < 0 || i >= nodes.length) return;
    const b = nodes[i], tip = document.createElement('span');
    tip.className = 'tip'; tip.textContent = LEGS[i].teaser ? '敬請期待' : playable(i) ? '新航段開啟：點這裡出發' : '已解鎖：製作中';
    b.classList.add('guide'); b.append(tip);
    root.scrollTop = b.offsetTop - root.offsetTop - (root.clientHeight - b.offsetHeight) / 2;
  };
  for (const b of nodes) b.addEventListener('click', () => guide(-1));
  refresh(0);
  toStart();
  return { toStart, refresh, guide };
}
