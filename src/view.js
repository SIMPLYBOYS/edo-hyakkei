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

export function showView(v, { onCollect, onClose, found: seen = [], onFind }) {
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
          <button id="leave" class="ghost">${onCollect ? '先不看' : '關閉'}</button>
        </div>
        ${lore(v)}
      </figcaption>
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
  // 切繪圖は縮めると町名が潰れる——押したら原寸（2400px）まで開いて、
  // .overlay の overflow:auto にそのまま巻かせる。もう一度押すと戻る。
  img.addEventListener('click', () => {
    if (!/切繪圖|近郊圖/.test(img.dataset.other ?? '')) return;
    const on = img.classList.toggle('big');
    // 開いた直後は左上に巻かれている。押した意味は「近くで見たい」なので中央へ。
    if (on) requestAnimationFrame(() => {
      el.scrollTo({ left: (el.scrollWidth - el.clientWidth) / 2,
                    top: (el.scrollHeight - el.clientHeight) / 2 });
    });
  });

  const close = () => { el.remove(); onClose?.(); };
  if (onCollect) el.querySelector('#collect').onclick = () => { el.remove(); onCollect(); };
  el.querySelector('#leave').onclick = close;
  el.onclick = e => { if (e.target === el) close(); };
  document.body.append(el);
}
