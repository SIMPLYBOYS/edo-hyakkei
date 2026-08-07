// 進入點：狀態、遇景判定、存檔。
// ponytail: 遇景邏輯只有十幾行，沒有另開 roam.js——一個檔就講得完的事不必拆兩個。
import { clockFrom, DAYS_PER_VIEW, seasonJa } from './calendar.js';
import { createMap } from './map.js';
import { showView } from './view.js';
import { showZukan } from './zukan.js';

const SAVE = 'edo-hyakkei/v1';
const load = () => {
  try {
    return { pos: { lat: 35.684, lng: 139.7745 }, day: 0, collected: [], ...JSON.parse(localStorage[SAVE]) };
  } catch {
    return { pos: { lat: 35.684, lng: 139.7745 }, day: 0, collected: [] };  // 日本橋起點
  }
};
const save = s => localStorage[SAVE] = JSON.stringify(s);

const [all, geo] = await Promise.all([
  fetch('data/views.json').then(r => r.json()),
  fetch('data/geo/modern.json').then(r => r.json()).then(g => g.layers),
]);
// no.119 赤坂桐畑是二代廣重 1859 年補的一枚，不屬於廣重的 118 景。
// 資料裡留著（那是完整的），但遊戲只玩 1–118——先前地圖收得到、歲時記卻不算，
// 會跑出「119 / 118」這種分數。要一致就兩邊都排除。
// （這一枚該怎麼記在全集裡是 §6.1 未決的另一個問題，與此無關。）
const views = all.filter(v => v.id <= 118);
const TOTAL = views.length;
const state = load();

const map = createMap(document.getElementById('map'), views, geo, pick);

function paint() {
  const clock = clockFrom(state.day);
  map.render(state, clock);
  document.getElementById('date').textContent = clock.label;
  document.getElementById('left').textContent =
    `${seasonJa(clock.season)}還剩 ${clock.daysLeftInSeason} 日`;
  document.getElementById('count').textContent = `${state.collected.length} / ${TOTAL}`;
  save(state);
}

function pick(v) {
  const clock = clockFrom(state.day);
  if (state.collected.includes(v.id)) return say(`${v.title.ja} 已經收過了`);
  // 同一地點在不同季節是不同的景（§2.2）——季節不對就是遇不到
  if (v.season !== clock.season) {
    return say(`${v.title.ja} 是${seasonJa(v.season)}的景，現在是${seasonJa(clock.season)}`);
  }
  state.pos = { lat: v.subject.lat, lng: v.subject.lng };   // 漫遊不耗時間（§2.1）
  paint();
  showView(v, {
    onCollect() {
      state.collected.push(v.id);
      state.day += DAYS_PER_VIEW;              // 時間只由入景推進
      paint();
      const c = clockFrom(state.day);
      if (c.season !== clock.season) say(`季節轉了——${seasonJa(c.season)}`);
    },
    onClose: paint,
  });
}

let timer;
function say(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('on'), 2600);
}

zin.onclick = map.zoomIn;
zout.onclick = map.zoomOut;
zfit.onclick = map.fitAll;
// 按到底了就把按鈕變灰——按下去沒反應會讓人以為壞了
map.onChange(() => { zin.disabled = map.atMin(); zout.disabled = map.atMax(); });

document.getElementById('era').oninput = e => map.setEra(e.target.value / 1000);
document.getElementById('book').onclick = () => showZukan(views, state);
document.getElementById('reset').onclick = () => {
  if (confirm('清除進度，從安政三年春天重來？')) { localStorage.removeItem(SAVE); location.reload(); }
};
map.setEra(1);
paint();
