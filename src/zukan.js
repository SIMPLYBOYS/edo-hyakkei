// 歲時記。spec §2.3：不用進度條，用一本隨足跡填滿的曆。
// 依目録的春夏秋冬分部排，未收的留白——空白本身就是「還沒走過那個季節」。
import { seasonJa } from './calendar.js';

const ORDER = ['spring', 'summer', 'autumn', 'winter'];

export function showZukan(views, state, onClose) {
  const el = document.createElement('div');
  el.className = 'overlay zukan';
  const groups = ORDER.map(s => {
    const list = views.filter(v => v.season === s && v.id <= 118);
    const got = list.filter(v => state.collected.includes(v.id)).length;
    return `<section>
      <h3>${seasonJa(s)}<span>${got} / ${list.length}</span></h3>
      <div class="grid">${list.map(v => {
        const has = state.collected.includes(v.id);
        const n = String(v.id).padStart(3, '0');
        return `<div class="cell ${has ? 'has' : ''}" title="${v.title.ja ?? v.id}">
          ${has ? `<img src="assets/thumbs/${n}.jpg" alt="${v.title.ja ?? ''}">` : ''}
          <b>${v.id}</b></div>`;
      }).join('')}</div>
    </section>`;
  }).join('');
  const total = views.filter(v => v.id <= 118).length;
  el.innerHTML = `<div class="sheet">
    <header><h2>歲時記</h2><span>${state.collected.length} / ${total}</span>
      <button id="x" class="ghost">閉じる</button></header>
    ${groups}</div>`;
  el.querySelector('#x').onclick = () => { el.remove(); onClose?.(); };
  el.onclick = e => { if (e.target === el) { el.remove(); onClose?.(); } };
  document.body.append(el);
}
