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
// 等待時的一格。用文字不用轉圈：這個作品裡沒有別的旋轉元件，
// 而且「載入原寸」比一個 spinner 更說得清楚在等什麼。
// 可以點掉或按 Esc——慢速網路下卡著一個不能取消的全螢幕遮罩比沒有還糟。
// done() 回報「取消之前就好了嗎」，呼叫端據此決定要不要真的開燈箱。
function loading(text) {
  const el = document.createElement('div');
  el.className = 'loading';
  el.innerHTML = `<span>${text}<span class="dots"></span></span>`;
  const key = e => { if (e.key === 'Escape') off(); };   // 下層看到 .loading 會自己讓開
  const off = () => { el.remove(); removeEventListener('keydown', key); };
  el.onclick = off;
  addEventListener('keydown', key);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('on'));       // 讓 transition 生效
  return { done: () => { const live = el.isConnected; off(); return live; } };
}

function lightbox(src, note) {
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `<img src="${src}" alt="">
    <div class="lzoom">
      <button id="lin" title="放大（滾輪也可以）">＋</button>
      <button id="lout" title="縮小">－</button>
      <button id="lfit" title="整張入鏡">全幅</button>
      <button id="lccw" title="逆時針轉 90°">↺</button>
      <button id="lcw" title="順時針轉 90°（R）">↻</button>
    </div>
    <div class="tip">拖曳或方向鍵移動・滾輪或 ＋ － 縮放・↺ ↻ 轉向　·　點背景或 Esc 關閉${
      note ? `　·　${note}` : ''}</div>`;
  const img = lb.querySelector('img');

  // 連續縮放。先前是 fit ⇄ 原寸兩段跳，點一下就衝到最大，中間沒有東西。
  // 這裡用 transform 自己算：scale 與位移都是連續量，滾輪轉多少就走多少。
  let k = 1, x = 0, y = 0, fit = 1, rot = 0;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // 旋轉後內容在「影像座標」裡的外接框。90/270° 時寬高互換，
  // 而且因為是繞影像中心轉，框的原點也跟著位移——不算進去的話，
  // 夾邊與置中會用錯的尺寸，圖會偏出去。
  const box = () => {
    const W = img.naturalWidth, H = img.naturalHeight;
    const bw = (rot % 180) ? H : W, bh = (rot % 180) ? W : H;
    return { bx: (W - bw) / 2, by: (H - bh) / 2, bw, bh };
  };
  // 夾住位移。沒有它可以把圖整個拖到畫面外，然後就找不回來了——
  // 放大後用方向鍵連續移動更容易撞到這件事。
  // 圖比畫面大：邊緣不准跑進畫面內。比畫面小：置中，沒有可移動的餘地。
  const rein = () => {
    const { bx, by, bw, bh } = box();
    const w = bw * k, h = bh * k, W = lb.clientWidth, H = lb.clientHeight;
    x = w <= W ? (W - w) / 2 - bx * k : clamp(x, W - w - bx * k, -bx * k);
    y = h <= H ? (H - h) / 2 - by * k : clamp(y, H - h - by * k, -by * k);
  };
  const apply = () => {
    rein();
    // 旋轉夾在 scale 之後，繞影像自己的中心轉——這樣 scale 之前的座標系
    // 仍然是「影像像素」，上面 zoomAt 那套以游標為中心的算法不必改。
    const cx = img.naturalWidth / 2, cy = img.naturalHeight / 2;
    img.style.transform = `translate(${x}px,${y}px) scale(${k})`
      + (rot ? ` translate(${cx}px,${cy}px) rotate(${rot}deg) translate(${-cx}px,${-cy}px)` : '');
  };
  // 按鈕跳一步時補一段短過場，才不會是「啪」的一下；
  // 滾輪與拖曳要即時，補了過場反而變成拖尾，所以每次都先關掉。
  const ease = on => { img.style.transition = on ? 'transform .18s ease-out' : ''; };
  function reset() {
    if (!img.naturalWidth) return;
    const { bw, bh } = box();
    fit = Math.min(lb.clientWidth / bw, lb.clientHeight / bh);
    k = fit;
    apply();          // 置中交給 rein()，它已經知道旋轉後的框
    grey();
  }

  // 轉 90°。古地圖的字各朝各的方向（切繪圖的方位記號散在四角），
  // 不轉就看不了——這是使用者指出來的。
  function turn(d) {
    const wasFit = Math.abs(k - fit) < 1e-6;
    rot = (rot + d + 360) % 360;
    const { bw, bh } = box();
    fit = Math.min(lb.clientWidth / bw, lb.clientHeight / bh);   // 轉了之後 fit 會變
    ease(true);
    if (wasFit) reset(); else { apply(); grey(); }
    setTimeout(() => ease(false), 220);
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
    grey();
  }

  // 按到底了就把鈕變灰——按下去沒反應會讓人以為壞了（跟地圖的縮放鈕同一條）
  const grey = () => {
    const [lo, hi] = bounds();
    lb.querySelector('#lin').disabled = k >= hi - 1e-6;
    lb.querySelector('#lout').disabled = k <= lo + 1e-6;
    lb.querySelector('#lfit').disabled = Math.abs(k - fit) < 1e-6;
  };
  // 鈕以畫面中心為基準（沒有游標可用），一步 1.35 倍——
  // 比滾輪一格大，因為按鈕是「明確要跳一階」，不是連續微調
  const bump = f => {
    ease(true);
    zoomAt(lb.clientWidth / 2, lb.clientHeight / 2, f);
    setTimeout(() => ease(false), 200);
  };

  img.onload = reset;
  if (img.complete) reset();
  addEventListener('resize', reset);

  lb.addEventListener('wheel', e => {
    e.preventDefault();
    ease(false);
    const r = lb.getBoundingClientRect();
    // exp 讓每一格滾輪的比例一致——用加減的話拉近時會愈走愈快。
    // 係數 0.0007：滑鼠一格（deltaY 120）約 ×1.09，fit→原寸要滾約 24 格。
    // 先前 0.0015（每格 ×1.20）跳得太粗，這是使用者指出來的。
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0007));
  }, { passive: false });

  // 控制鈕。stopPropagation 是必要的——不擋的話按完會冒泡到 lb 把檢視關掉
  const ctl = lb.querySelector('.lzoom');
  ctl.addEventListener('pointerdown', e => e.stopPropagation());
  ctl.addEventListener('click', e => e.stopPropagation());
  lb.querySelector('#lin').onclick = () => bump(1.35);
  lb.querySelector('#lout').onclick = () => bump(1 / 1.35);
  lb.querySelector('#lfit').onclick = () => { ease(true); reset(); setTimeout(() => ease(false), 200); };
  lb.querySelector('#lccw').onclick = () => turn(-90);
  lb.querySelector('#lcw').onclick = () => turn(90);

  // 拖曳。不用 setPointerCapture，理由同 map.js：capture 之後 click 會改派，
  // 底下那層的「點背景關閉」就叫不出來了。
  let drag = null, moved = 0;
  // 兩指縮放，跟 map.js 同一套：ptrs 記每一指，兩指時走 pinch。
  // 縮放以兩指中點為中心（zoomAt 已經會把中點底下那一點留在原地），
  // 再跟著中點的位移平移，手指張開時畫面就跟著手指。
  const ptrs = new Map();
  let pinch = null;
  const gauge = () => {
    const [a, b] = [...ptrs.values()];
    return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
             mx: (a.clientX + b.clientX) / 2, my: (a.clientY + b.clientY) / 2 };
  };
  lb.addEventListener('pointerdown', e => {
    ease(false);
    ptrs.set(e.pointerId, e);
    if (ptrs.size === 2) { pinch = gauge(); drag = null; moved = 99; return; }
    if (ptrs.size > 2) return;
    drag = { x: e.clientX, y: e.clientY }; moved = 0;
  });
  addEventListener('pointermove', e => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, e);
    if (ptrs.size === 2 && pinch) {
      const g = gauge(), r = lb.getBoundingClientRect();
      zoomAt(g.mx - r.left, g.my - r.top, g.d / pinch.d);
      x += g.mx - pinch.mx; y += g.my - pinch.my;
      apply();
      pinch = g; moved = 99;
      return;
    }
    if (!drag) return;
    x += e.clientX - drag.x; y += e.clientY - drag.y;
    moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
    drag = { x: e.clientX, y: e.clientY };
    apply();
  });
  // 放開任一指就結束這一輪；moved 留著 99，放開後補發的 click 才不會把檢視關掉
  const lift = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; drag = null; };
  addEventListener('pointerup', lift);
  addEventListener('pointercancel', lift);

  lb.addEventListener('dblclick', e => {
    const r = lb.getBoundingClientRect();
    const [, hi] = bounds();
    // 已經放大過就回到 fit，否則跳到原寸——雙擊是捷徑，不是唯一的路
    if (k > fit * 1.01) reset();
    else zoomAt(e.clientX - r.left, e.clientY - r.top, hi / k);
  });

  // 方向鍵移動。按住連續走，跟地圖那邊同一套手感（見 map.js）：
  // 每秒走 0.7 個畫面，用時間差算而不是每幀固定量——120Hz 的螢幕不會跑兩倍快。
  const ARROWS = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  const held = new Set();
  let raf = 0, last = 0;
  const halt = () => { held.clear(); cancelAnimationFrame(raf); raf = 0; last = 0; };
  const tick = t => {
    if (!held.size) return halt();
    const dt = Math.min((t - (last || t - 16)) / 1000, 0.1);
    last = t;
    let dx = 0, dy = 0;
    for (const key of held) { dx += ARROWS[key][0]; dy += ARROWS[key][1]; }
    const len = Math.hypot(dx, dy) || 1;      // 斜著走不該比直著走快
    ease(false);
    x += dx / len * lb.clientWidth * 0.7 * dt;
    y += dy / len * lb.clientHeight * 0.7 * dt;
    apply();
    raf = requestAnimationFrame(tick);
  };

  const close = () => {
    halt();
    removeEventListener('keydown', keys); removeEventListener('keyup', up);
    removeEventListener('blur', halt); lb.remove();
  };
  const keys = e => {
    if (e.key === 'Escape') return close();
    if (e.key === '+' || e.key === '=') return bump(1.35);
    if (e.key === '-' || e.key === '_') return bump(1 / 1.35);
    if (e.key === '0') { ease(true); reset(); return setTimeout(() => ease(false), 200); }
    if (e.key === 'r' || e.key === 'R') return turn(e.shiftKey ? -90 : 90);
    if (!ARROWS[e.key]) return;
    e.preventDefault();
    held.add(e.key);
    if (!raf) raf = requestAnimationFrame(tick);
  };
  const up = e => { held.delete(e.key); if (!held.size) halt(); };
  addEventListener('keydown', keys);
  addEventListener('keyup', up);
  addEventListener('blur', halt);       // 按著鍵切走視窗，放開的那一下不在這裡
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
          <button id="full" class="ghost" title="看原寸的掃描件">原寸</button>
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
    // それでも足りないので「原寸」（下の #full）で全画面に開く。
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
  // 🔴 id 不能叫 zoom：地圖右下那組縮放鈕的容器就是 #zoom，CSS 的 position:fixed
  // 會套到這顆鈕上，讓它浮到畫面右下角壓住來歷文字——桌機上正好疊在地圖縮放鈕
  // 的位置，所以一直沒人發現，縮到手機寬度才露出來。跟 #hunt 撞名是同一類。
  el.querySelector('#full').onclick = () => {
    const other = img.dataset.other;
    if (other) return lightbox(img.getAttribute('src'), other);
    // 🔴 原本是「載完才開燈箱」，那幾秒畫面完全沒反應，玩家會以為沒點到。
    // 先開一格「載入原寸」，載完（或失敗）再換上燈箱；中途按掉就不開了。
    const wait = loading('載入原寸');
    const big = new Image();
    big.onload = () => { if (wait.done()) lightbox(hires(v.id), '館藏的全幅掃描，帶色卡與館藏印'); };
    big.onerror = () => { if (wait.done()) lightbox(print); };   // hires 沒這張就退回展示版
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
    // 「載入原寸」那格同理——Esc 是要取消載入，不是連看畫一起關掉。
    // 🔴 不能靠 stopPropagation——兩個 handler 都掛在 window 上，
    // 同一個節點上的監聽不會被 stopPropagation 擋住（要 stopImmediate，
    // 而那又得賭註冊順序）。讓下層自己判斷才不必賭。
    if (document.querySelector('.lightbox, .loading')) return;
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
