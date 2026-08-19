// 單張畫面呈現。進一景 → 看畫 → 收入歲時記。
import { DAYS_PER_VIEW, kanjiDays, seasonJa } from './calendar.js';
import { plate, hires, meishozue, miyage, kiriezu } from './paths.js';
import { findLies, md } from './lie.js';

// ── 來歷。這些資料一直躺在 repo 裡，畫面上一個字都沒出現過 ────────────────
// 對照書的卷・丁・頁名與「這兩張圖差在哪」是人工比對寫下來的（meishozue-map.json
// 與 miyage-map.json），先前只有工具在讀；bearing 是從畫中地標反推的視線方位
// （tools/derive-bearing.py），先前只畫成地圖上的扇形，沒有一句說明；
// 典藏館與編號則是連提都沒提過——那既是知識點，也是本來就該給的致謝。
const KANJI = '〇一二三四五六七八九';
const kanji = n => n < 10 ? KANJI[n] : n < 20 ? '十' + (n % 10 ? KANJI[n % 10] : '')
  : KANJI[Math.floor(n / 10)] + '十' + (n % 10 ? KANJI[n % 10] : '');
// v01 → 卷一。丁は和本の数え方（表裏で一丁）なので「頁」ではなく「丁」
const vol = v => v ? `卷${kanji(+v.replace(/\D/g, ''))}・` : '';

// 方位を言葉に。±30° の不確かさがあるので 16 方位まで刻む意味はない
const DIRS = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];
const compass = deg => DIRS[Math.round(deg / 45) % 8];

// notes.bearing 是給工程看的（英文地標名、還寫著算它的腳本路徑），
// 不能直接倒給玩家。取出地標、換成中文，說一句人話。
const LANDMARK = { 'Mount Fuji': '富士山', 'Mount Tsukuba': '筑波山',
                   'Edo Castle': '江戶城', 'Nihonbashi': '日本橋' };
const why = v => {
  const m = /「([^」]+)」/.exec(v.notes?.bearing ?? '');
  const l = m && (LANDMARK[m[1]] ?? m[1]);
  return l ? `由畫中的${l}推得，誤差約 ±30°` : '誤差約 ±30°';
};

const cite = (label, p, unit) => p ? `<p class="cite"><b>《${label}》</b>
  ${unit === '丁' ? vol(p.vol) : ''}${p.page ? `第${kanji(p.page)}${unit}` : ''}
  ${p.plate ? `〈${p.plate}〉` : ''}
  ${p.note ? `<span>${md(p.note)}</span>` : ''}</p>` : '';

function lore(v) {
  const b = v.bearing != null ? `<p class="bearing">廣重朝<b>${compass(v.bearing)}</b>看
    <span>${Math.round(v.bearing)}°　${why(v)}</span></p>` : '';
  const s = v.source ?? {};
  const prov = s.institution ? `<p class="prov">${s.url
    ? `<a href="${s.url}" target="_blank" rel="noopener">${s.institution}</a>`
    : s.institution}${v.accession ? `　${v.accession}` : ''}${
    s.license ? `　${s.license}` : ''}</p>` : '';
  // 現在地を最初に置く：これは「今どこか」への答えで、玩家が実際に
  // 立ちに行ける唯一の手がかり。tools/derive-place.py が OSM の行政界から出す。
  const pl = v.place ?? {};
  const now = pl.modern_ward
    ? `<p class="now">現在　<b>${pl.modern_ward}${pl.modern_town ?? ''}</b></p>` : '';
  // 切繪圖は**この一帯**の図であって、この一点がどこに描かれているかまでは
  // 言えない（図幅は数 km 四方、方位も比例も一定でない）。だから「〜あたりの」。
  // 市街図と近郊図で言い方を分ける。近郊図は町の地図ではなく**村の地図**——
  // 描いてあるのは町名ではなく村名で、尺度も範囲も別物。同じ文句で出すと嘘になる。
  const kz = !pl.kiriezu ? ''
    : pl.kiriezu.role === 'suburb'
    ? `<p class="cite"><b>《江戶近郊圖》</b>
       <span>這一景在江戶市街之外，切繪圖畫不到。這是當時江戶周邊的廣域圖——
       村名、道路、神社佛寺與郡界。</span></p>`
    : `<p class="cite"><b>《江戶切繪圖》</b>〈${pl.kiriezu.title.replace(/絵図$|辺図$/, '')}〉
       <span>當時這一帶的市街圖。町名、大名屋敷的戶名、寺社、橋與御門都在上面。</span></p>`;
  const body = now + kz + cite('江戶名所圖會', v.pair?.meishozue, '丁')
    + cite('繪本江戶土產', v.pair?.miyage, '頁') + b + prov;
  return body ? `<div class="lore">${body}</div>` : '';
}

// 全螢幕原寸檢視。作法照 tokaido：fit ↔ 原寸兩段式，點背景或 Esc 關掉。
//
// 廣重的畫看的是 assets/hires——那批是 NDL 等館的檔案級全幅拍攝，
// 4096–7503px（展示用的 originals 只有 790×1200，差 5–9 倍）。
// **它們帶著色卡、比例尺與館藏印**，所以不能當遊戲畫面（見上面 <img> 的註解）；
// 但在這裡反而是對的：這一格看的不是「畫」，是**那張掃描件本身**。
function lightbox(src, note) {
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `<img src="${src}" alt="">
    <div class="tip">滾輪縮放・拖曳移動・雙擊切換原寸　·　點背景或 Esc 關閉${
      note ? `　·　${note}` : ''}</div>`;
  const img = lb.querySelector('img');

  // 連續縮放。先前是 fit ⇄ 原寸兩段跳，點一下就衝到最大，中間沒有東西。
  // 這裡用 transform 自己算：scale 與位移都是連續量，滾輪轉多少就走多少。
  let k = 1, x = 0, y = 0, fit = 1;
  const apply = () => { img.style.transform = `translate(${x}px,${y}px) scale(${k})`; };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function reset() {
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w) return;
    fit = Math.min(lb.clientWidth / w, lb.clientHeight / h);
    k = fit;
    x = (lb.clientWidth - w * k) / 2;
    y = (lb.clientHeight - h * k) / 2;
    apply();
  }
  // 縮到比 fit 還小沒有意義（周圍只會多出空白）；
  // 放到比 1 更大也沒有意義——超過原寸就只是把同一顆像素放大成糊的。
  const bounds = () => [Math.min(fit, 1), Math.max(1, fit)];

  function zoomAt(cx, cy, factor) {
    const [lo, hi] = bounds();
    const k2 = clamp(k * factor, lo, hi);
    if (k2 === k) return;
    // 游標底下的那一點要留在原地：這是「以游標為中心」的全部意思
    x = cx - (cx - x) * (k2 / k);
    y = cy - (cy - y) * (k2 / k);
    k = k2;
    apply();
  }

  img.onload = reset;
  if (img.complete) reset();
  addEventListener('resize', reset);

  lb.addEventListener('wheel', e => {
    e.preventDefault();
    const r = lb.getBoundingClientRect();
    // exp 讓每一格滾輪的比例一致——用加減的話拉近時會愈走愈快
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  // 拖曳。不用 setPointerCapture，理由同 map.js：capture 之後 click 會改派，
  // 底下那層的「點背景關閉」就叫不出來了。
  let drag = null, moved = 0;
  lb.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; moved = 0; });
  addEventListener('pointermove', e => {
    if (!drag) return;
    x += e.clientX - drag.x; y += e.clientY - drag.y;
    moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
    drag = { x: e.clientX, y: e.clientY };
    apply();
  });
  addEventListener('pointerup', () => { drag = null; });

  lb.addEventListener('dblclick', e => {
    const r = lb.getBoundingClientRect();
    const [, hi] = bounds();
    // 已經放大過就回到 fit，否則跳到原寸——雙擊是捷徑，不是唯一的路
    if (k > fit * 1.01) reset();
    else zoomAt(e.clientX - r.left, e.clientY - r.top, hi / k);
  });

  const close = () => { removeEventListener('keydown', esc); lb.remove(); };
  const esc = e => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', esc);
  // 拖曳結束時滑鼠常停在畫面上，不擋掉的話一拖就關掉（map.js 踩過同一個坑）
  lb.onclick = () => { if (moved <= 6) close(); };
  document.body.append(lb);
}

export function showView(v, { onCollect, onClose, found: seen = [], onFind, step }) {
  const el = document.createElement('div');
  el.className = 'overlay';
  el.innerHTML = `
    <figure>
      <div class="plate">
      <!-- 展示用 originals（Commons／布魯克林版，裁到畫面本身）。
           assets/hires 多半是 NDL 的檔案級全幅拍攝，帶色卡比例尺館標，
           那批是給 §2.4 研究用的，不能直接當遊戲畫面。缺的才退回 hires（如 no.30 是 AIC 版，乾淨）。 -->
      <img src="${plate(v.id)}" alt="${v.title.ja ?? ''}"
           onerror="this.onerror=null;this.src='${hires(v.id)}'">
      </div>
      <figcaption>
        <div class="no">第 ${v.id} 景 · ${seasonJa(v.season)}</div>
        <h2>${v.title.ja ?? '(缺標題)'}</h2>
        <div class="ro">${v.title.romaji ?? ''}</div>
        <div class="en">${v.title.en ?? ''}</div>
        <div class="pub">${v.published ?? ''} 刊</div>
        ${v.distortions.length ? `<div class="hunt">廣重在這張畫裡動了手腳。點畫面找找看。</div>
        <div id="tally"></div>` : ''}
        <div class="act">
          <!-- 沒有 onCollect＝從歲時記翻回來重看的，已經收過了，不能再收一次 -->
          ${onCollect ? `<button id="collect">收入歲時記（耗${kanjiDays(DAYS_PER_VIEW)}日）</button>` : ''}
          ${v.assets.meishozue ? '<button id="flip" class="ghost">看《名所圖會》</button>' : ''}
          ${v.assets.miyage ? '<button id="flip2" class="ghost">看《江戶土產》</button>' : ''}
          ${v.place?.kiriezu ? `<button id="flip3" class="ghost">看《${
            v.place.kiriezu.role === 'suburb' ? '江戶近郊圖' : '江戶切繪圖'}》</button>` : ''}
          <button id="zoom" class="ghost" title="看原寸的掃描件">原寸</button>
          <button id="leave" class="ghost">${onCollect ? '先不看' : '關閉'}</button>
        </div>
        ${lore(v)}
      </figcaption>
      <!-- 歲時記翻回來時才有：在已收的景之間前後翻，不必關掉再點下一張。
           剛收到一景時不放——那時該看的是這一景，不是整本。 -->
      ${step ? `<nav class="flip">
        <button id="prev" ${step(-1) ? '' : 'disabled'} title="上一景（←）">‹</button>
        <button id="next" ${step(1) ? '' : 'disabled'} title="下一景（→）">›</button>
      </nav>` : ''}
    </figure>`;

  // §2.4 的玩法是玩家「自己找」，所以 hitbox 不預先顯示——
  // 標出來就變成看圖說故事，找到的當下才有「他動了手腳」的感覺。
  // 🔴 已找到的清單以前是純區域變數，一關畫面就忘了；現在由 main.js
  // 從存檔傳進來，找到時回報出去（§2.5：選做，但要記得）。
  // 命中判定本身在 lie.js，跟狩獵揭曉共用同一套。
  if (v.distortions.length) {
    const tally = el.querySelector('#tally');
    findLies(el.querySelector('img'), v, seen, {
      onFind,
      prompt: el.querySelector('.hunt'),      // 空點三次後這行會變成提示
      onShow(d) { tally.innerHTML = `<b>${d.target}</b>${md(d.note)}`; tally.classList.add('on'); },
    });
  }

  // §2.4 找廣重的謊言：同一景切換到別人／他自己畫的版本。
  //   《名所圖會》＝雪旦的寫實鳥瞰，回答「那裡實際長什麼樣」
  //   《繪本江戶土產》＝**廣重本人**的繪本版，回答「他自己另一次怎麼畫」
  // 後者才拿掉「不同畫家」這個干擾——同一雙手，只是用途不同。
  //
  // 兩顆鈕各自負責一個來源、再按一次回到廣重。做成單一循環鈕的話，
  // 玩家不知道下一下會看到什麼。
  const img = el.querySelector('img');
  const print = img.getAttribute('src');
  const kz = v.place?.kiriezu;
  const flips = [
    ['#flip', meishozue(v.id), '《名所圖會》', 'zue'],
    ['#flip2', miyage(v.id), '《江戶土產》', ''],
    // 切繪圖は横長でしかも字が細かい。zue より更に広く出し、
    // それでも足りないので押すと原寸まで開く（下の #zoom）。
    ['#flip3', kz && kiriezu(kz.pid),
     kz?.role === 'suburb' ? '《江戶近郊圖》' : '《江戶切繪圖》', 'map'],
  ].map(([sel, src, label, cls]) => {
    const b = el.querySelector(sel);
    return b && src && { b, src, label, cls, on: false };
  }).filter(Boolean);

  for (const f of flips) {
    f.b.onclick = () => {
      const want = !f.on;
      for (const g of flips) {          // 一次只開一個，其餘復位
        g.on = g === f && want;
        g.b.textContent = g.on ? '看廣重的版本' : `看${g.label}`;
      }
      img.src = want ? f.src : print;
      img.classList.remove('zue', 'map', 'big');
      if (want && f.cls) img.classList.add(f.cls);
      // findLies が読む印。対照版のあいだは当たり判定を止める（lie.js 参照）
      if (want) img.dataset.other = f.label; else delete img.dataset.other;
    };
  }
  // 「原寸」是看**現在顯示的那一版**。廣重的畫有更大的掃描件（hires），
  // 其餘來源本機只有一種尺寸，但全螢幕比塞在 56vw 的框裡看得清楚得多。
  // 先前切繪圖另做了一套 .big 就地放大——兩套縮放沒必要，併掉了。
  el.querySelector('#zoom').onclick = () => {
    const other = img.dataset.other;
    if (other) return lightbox(img.getAttribute('src'), other);
    const big = new Image();
    big.onload = () => lightbox(hires(v.id), '館藏的全幅掃描，帶色卡與館藏印');
    big.onerror = () => lightbox(print);       // hires 沒有這一張就退回展示版
    big.src = hires(v.id);
  };

  // 翻頁：關掉這一張、開下一張。鍵盤的 ←/→ 也走同一條路。
  // （地圖的方向鍵在 .overlay 存在時本來就會讓開，見 map.js 的 busy()）
  const go = dir => { const nx = step?.(dir); if (!nx) return; el.remove(); nx(); };
  if (step) {
    el.querySelector('#prev').onclick = () => go(-1);
    el.querySelector('#next').onclick = () => go(1);
  }
  const keys = e => {
    // 原寸檢視開著時這一層完全讓開：Esc 要先關掉上面那層，←/→ 也不該翻頁。
    // 🔴 不能靠 stopPropagation——兩個 handler 都掛在 window 上，
    // 同一個節點上的監聽不會被 stopPropagation 擋住（要 stopImmediate，
    // 而那又得賭註冊順序）。讓下層自己判斷才不必賭。
    if (document.querySelector('.lightbox')) return;
    if (e.key === 'Escape') return close();
    if (!step) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
  };
  addEventListener('keydown', keys);

  const close = () => { removeEventListener('keydown', keys); el.remove(); onClose?.(); };
  if (onCollect) el.querySelector('#collect').onclick =
    () => { removeEventListener('keydown', keys); el.remove(); onCollect(); };
  el.querySelector('#leave').onclick = close;
  el.onclick = e => { if (e.target === el) close(); };
  document.body.append(el);
}
