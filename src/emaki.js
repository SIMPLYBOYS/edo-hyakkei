// 繪卷。收過的景連成一條橫卷，由右向左展讀——和卷子的讀法一樣。
//
// 作法照搬 tokaido-pixel 的「旅之繪卷」（flex row-reverse ＋ rAF 等速捲動），
// 但編排跟著百景自己的骨架走：**東海道是一條路，百景是一年**。
// 所以卷上的分段不是驛站而是四季，季與季之間插一枚題簽。
//
// 不等收滿 118 才給。歲時記的空白本來就是內容（§2.3），繪卷同理——
// 收三景就是三景的卷子，短，但它會跟著長。
import { plate } from './paths.js';
import { seasonJa } from './calendar.js';

const KANJI = '〇一二三四五六七八九';
const kanji = n => n < 10 ? KANJI[n]
  : n < 20 ? '十' + (n % 10 ? KANJI[n % 10] : '')
  : n < 100 ? KANJI[Math.floor(n / 10)] + '十' + (n % 10 ? KANJI[n % 10] : '')
  : '百' + (n % 100 ? kanji(n % 100) : '');

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const SPEED = 0.07;        // px/ms ＝ 70px/s。快了看不清，慢了像卡住

export function showEmaki(views, state, onPick, onClose) {
  const got = SEASONS.flatMap(s =>
    views.filter(v => v.season === s && state.collected.includes(v.id)));

  const el = document.createElement('div');
  el.className = 'overlay emaki';
  el.innerHTML = `
    <div class="ebar">
      <button id="eback" class="ghost">← 回歲時記</button>
      <button id="eplay">▶ 自動展卷</button>
      <span class="etip">由右向左展讀・點畫可開該景</span>
      <span class="ecount">${got.length} / ${views.length}</span>
    </div>
    <div id="escroll"></div>`;

  const sc = el.querySelector('#escroll');
  // 軸：卷子兩端的木軸。少了它就只是一排圖片，不是一卷。
  const jiku = () => { const d = document.createElement('div'); d.className = 'ejiku'; return d; };
  sc.append(jiku());
  let season = null;
  for (const v of got) {
    if (v.season !== season) {
      season = v.season;
      const m = document.createElement('div');
      m.className = 'emark';
      m.textContent = seasonJa(season);
      sc.append(m);
    }
    const p = document.createElement('div');
    p.className = 'epanel';
    p.innerHTML = `<img src="${plate(v.id)}" alt="${v.title.ja ?? ''}" loading="lazy">
      <div class="elabel">${kanji(v.id)}　${v.title.ja ?? ''}</div>`;
    p.onclick = () => { play(false); onPick?.(v); };
    sc.append(p);
  }
  sc.append(jiku());

  // 自動展卷：等速往左（＝閱讀方向），到卷尾自停。
  // row-reverse 的 scrollLeft 是負的，所以「往左讀」是讓它更負。
  let on = false, raf = 0, last = 0, pos = 0;
  const btn = el.querySelector('#eplay');
  function play(want) {
    on = want;
    btn.textContent = on ? '⏸ 暫停' : '▶ 自動展卷';
    cancelAnimationFrame(raf);
    if (!on) return;
    last = 0; pos = sc.scrollLeft;
    const stepFn = t => {
      if (!on) return;
      if (last) {
        pos -= (t - last) * SPEED;
        sc.scrollLeft = pos;
        // 被夾住＝到卷尾了。用「設進去的值有沒有生效」判斷，
        // 比自己算總寬可靠——圖是 lazy 載入的，總寬會邊捲邊變。
        if (Math.abs(sc.scrollLeft - pos) > 2) return play(false);
      }
      last = t;
      raf = requestAnimationFrame(stepFn);
    };
    raf = requestAnimationFrame(stepFn);
  }
  btn.onclick = () => play(!on);

  // 滑鼠滾輪是縱向的，但這裡只有橫向可捲——不轉換的話滾了沒反應。
  sc.addEventListener('wheel', e => {
    play(false);
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      sc.scrollLeft -= e.deltaY;      // row-reverse：往下滾＝往左讀
      e.preventDefault();
    }
  }, { passive: false });
  sc.addEventListener('touchstart', () => play(false), { passive: true });

  const close = () => {
    play(false);
    removeEventListener('keydown', keys);
    el.remove();
    onClose?.();
  };
  const keys = e => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', keys);
  el.querySelector('#eback').onclick = close;
  document.body.append(el);
  return { close };
}
