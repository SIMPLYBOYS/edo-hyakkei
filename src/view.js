// 單張畫面呈現。進一景 → 看畫 → 收入歲時記。
import { DAYS_PER_VIEW, kanjiDays, seasonJa } from './calendar.js';
import { plate, hires, meishozue, miyage } from './paths.js';
import { findLies } from './lie.js';

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
          <button id="leave" class="ghost">${onCollect ? '先不看' : '關閉'}</button>
        </div>
        ${v.assets.meishozue ? `<p class="hint">《名所圖會》是地誌——俯瞰、寫實、地名齊全。
          廣重畫的是同一個地方，但他動了手腳。兩邊對著看。</p>` : ''}
        ${v.assets.miyage ? `<p class="hint">《繪本江戶土產》是<b>廣重本人</b>畫的同一個地方。
          跟圖會比是「別人怎麼畫」，跟土產比是<b>他自己怎麼畫</b>——
          同一雙手，只是用途不同。</p>` : ''}
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
      onShow(d) { tally.innerHTML = `<b>${d.target}</b>${d.note}`; tally.classList.add('on'); },
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
  const flips = [
    ['#flip', meishozue, '《名所圖會》', true],
    ['#flip2', miyage, '《江戶土產》', false],
  ].map(([sel, path, label, wide]) => {
    const b = el.querySelector(sel);
    return b && { b, path, label, wide, on: false };
  }).filter(Boolean);

  for (const f of flips) {
    f.b.onclick = () => {
      const want = !f.on;
      for (const g of flips) {          // 一次只開一個，其餘復位
        g.on = g === f && want;
        g.b.textContent = g.on ? '看廣重的版本' : `看${g.label}`;
      }
      img.src = want ? f.path(v.id) : print;
      img.classList.toggle('zue', want && f.wide);
    };
  }
  const close = () => { el.remove(); onClose?.(); };
  if (onCollect) el.querySelector('#collect').onclick = () => { el.remove(); onCollect(); };
  el.querySelector('#leave').onclick = close;
  el.onclick = e => { if (e.target === el) close(); };
  document.body.append(el);
}
