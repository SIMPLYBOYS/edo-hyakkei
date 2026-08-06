// 單張畫面呈現。進一景 → 看畫 → 收入歲時記。
import { seasonJa } from './calendar.js';
import { plate, hires, meishozue } from './paths.js';

export function showView(v, { onCollect, onClose }) {
  const el = document.createElement('div');
  el.className = 'overlay';
  el.innerHTML = `
    <figure>
      <!-- 展示用 originals（Commons／布魯克林版，裁到畫面本身）。
           assets/hires 多半是 NDL 的檔案級全幅拍攝，帶色卡比例尺館標，
           那批是給 §2.4 研究用的，不能直接當遊戲畫面。缺的才退回 hires（如 no.30 是 AIC 版，乾淨）。 -->
      <img src="${plate(v.id)}" alt="${v.title.ja ?? ''}"
           onerror="this.onerror=null;this.src='${hires(v.id)}'">
      <figcaption>
        <div class="no">第 ${v.id} 景 · ${seasonJa(v.season)}</div>
        <h2>${v.title.ja ?? '(缺標題)'}</h2>
        <div class="ro">${v.title.romaji ?? ''}</div>
        <div class="en">${v.title.en ?? ''}</div>
        <div class="pub">${v.published ?? ''} 刊</div>
        <div class="act">
          <button id="collect">收入歲時記（耗三日）</button>
          ${v.assets.meishozue ? '<button id="flip" class="ghost">看《名所圖會》</button>' : ''}
          <button id="leave" class="ghost">先不看</button>
        </div>
        ${v.assets.meishozue ? `<p class="hint">《名所圖會》是地誌——俯瞰、寫實、地名齊全。
          廣重畫的是同一個地方，但他動了手腳。兩邊對著看。</p>` : ''}
      </figcaption>
    </figure>`;

  // §2.4 找廣重的謊言：同一景切換到寫實版本。目前只有 6 景有對照圖（見 §7-14）。
  const flip = el.querySelector('#flip');
  if (flip) {
    const img = el.querySelector('img');
    const print = img.getAttribute('src');
    let zue = false;
    flip.onclick = () => {
      zue = !zue;
      img.src = zue ? meishozue(v.id) : print;
      img.classList.toggle('zue', zue);
      flip.textContent = zue ? '看廣重的版本' : '看《名所圖會》';
    };
  }
  el.querySelector('#collect').onclick = () => { el.remove(); onCollect(); };
  el.querySelector('#leave').onclick = () => { el.remove(); onClose(); };
  el.onclick = e => { if (e.target === el) { el.remove(); onClose(); } };
  document.body.append(el);
}
