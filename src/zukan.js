// 歲時記。spec §2.3：不用進度條，用一本隨足跡填滿的曆。
// 依目録的春夏秋冬分部排，未收的留白——空白本身就是「還沒走過那個季節」。
import { seasonJa } from './calendar.js';
import { thumb } from './paths.js';

const ORDER = ['spring', 'summer', 'autumn', 'winter'];

export function showZukan(views, state, onClose) {
  const el = document.createElement('div');
  el.className = 'overlay zukan';
  const groups = ORDER.map(s => {
    const list = views.filter(v => v.season === s);
    const got = list.filter(v => state.collected.includes(v.id)).length;
    return `<section>
      <h3>${seasonJa(s)}<span>${got} / ${list.length}</span></h3>
      <div class="grid">${list.map(v => {
        const has = state.collected.includes(v.id);
        return `<div class="cell ${has ? 'has' : ''}" title="${v.title.ja ?? v.id}">
          ${has ? `<img src="${thumb(v.id)}" alt="${v.title.ja ?? ''}">` : ''}
          <b>${v.id}</b></div>`;
      }).join('')}</div>
    </section>`;
  }).join('');
  const total = views.length;   // main.js 已經濾掉 no.119
  // §2.5 結案：找廣重的謊言是**選做**——它有自己的計數，不併進 118 的分數。
  // 22 景有手腳、118 景要收，把兩者加在一起只會讓兩個數字都變得沒有意義。
  const traps = views.reduce((n, v) => n + (v.distortions?.length ?? 0), 0);
  const got = views.reduce((n, v) => n + (state.found?.[v.id]?.length ?? 0), 0);
  el.innerHTML = `<div class="sheet">
    <header><h2>歲時記</h2><span>${state.collected.length} / ${total}</span>
      ${traps ? `<span class="traps">廣重的手腳 ${got} / ${traps}</span>` : ''}
      <button id="x" class="ghost">閉じる</button></header>
    ${groups}</div>`;
  el.querySelector('#x').onclick = () => { el.remove(); onClose?.(); };
  el.onclick = e => { if (e.target === el) { el.remove(); onClose?.(); } };
  document.body.append(el);
}
