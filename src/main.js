// 進入點：狀態、遇景判定、存檔。
// ponytail: 遇景邏輯只有十幾行，沒有另開 roam.js——一個檔就講得完的事不必拆兩個。
import { clockFrom, DAYS_PER_VIEW, pubDay, seasonJa } from './calendar.js';
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

// 白畫面是這個專案最貴的 bug：查過兩輪才知道一次是伺服器被關掉、
// 一次是別的原因。沒有訊息就沒有線索，所以任何開場失敗一律印在畫面上。
const fatal = msg => document.body.insertAdjacentHTML('beforeend',
  `<div id="err"><b>地圖載入失敗</b><code>${msg}</code>
   <small>先確認 <code>python3 tools/serve.py</code> 還開著，再看 Console</small></div>`);
addEventListener('error', e => fatal(e.message));
addEventListener('unhandledrejection', e => fatal(e.reason?.message ?? e.reason));

// 本機開發一律繞過快取。serve.py 已經送 no-store，實測仍然擋不住：
// 把 data/views.json 從硬碟移走之後，瀏覽器照樣 fetch 到 200 與完整內容。
// 拿到舊資料的症狀（欄位不見、畫面跟程式對不上）比多一次傳輸難查太多。
// 線上（GitHub Pages）不加，那裡本來就該讓瀏覽器快取。
const DEV = ['localhost', '127.0.0.1', ''].includes(location.hostname);
const grab = async url => {
  const r = await fetch(DEV ? `${url}?t=${Date.now()}` : url);
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);   // fetch 對 404 不會 reject
  return r.json();
};

const [all, world, edo] = await Promise.all([
  grab('data/views.json'),
  grab('data/geo/modern.json'),
  // 地名只是裝飾，掛掉不該連地圖一起拖下水（§2.7）
  grab('data/edo-places.json').catch(e => (console.warn('江戶地名層略過:', e), { places: [] })),
]);
// §2.7 江戶地名。白名單只存名字，錨點與大小留在 OSM 那份——
// 座標只有一個來源，重抓才不會有兩份會對不上的位置。
// fetch-osm.py 的 self-check 會驗這個 join 沒斷。
// labels 是 2026/08/07 才加進 modern.json 的欄位。舊的檔案沒有它——
// 而瀏覽器**真的會**餵舊檔案給你（實測：no-store 擋不住，見該次 commit）。
// 少一個裝飾用的欄位不該讓整張地圖消失，所以這裡一律當作可能不存在。
if (!world.labels) console.warn('modern.json 沒有 labels 欄位——多半是快取到舊檔，強制重新整理看看');
const anchor = new Map((world.labels ?? []).map(l => [l.name, l]));
const places = (edo.places ?? []).map(p => ({ ...p, ...anchor.get(p.osm) }))
  .filter(p => p.lng != null);
// no.119 赤坂桐畑是二代廣重 1859 年補的一枚，不屬於廣重的 118 景。
// 資料裡留著（那是完整的），但遊戲只玩 1–118——先前地圖收得到、歲時記卻不算，
// 會跑出「119 / 118」這種分數。要一致就兩邊都排除。
// （這一枚該怎麼記在全集裡是 §6.1 未決的另一個問題，與此無關。）
const views = all.filter(v => v.id <= 118);
const TOTAL = views.length;
const state = load();

const map = createMap(document.getElementById('map'), views, world.layers, places, pick);

// §2.6：已經出版的景數。玩家看到地圖稀疏時，這個數字是唯一的解釋。
const published = day => views.filter(v => pubDay(v.published) <= day).length;

// 系列最後一枚出版的日子。廣重歿於安政五年九月六日（1858-10-12），
// 而最後一枚就出在那前後——查資料時算出來只差一天，不是我編的。
// 過了這天，地圖再也不會長出新的景：剩下的只是還沒輪到它的季節。
const LAST_PUB = Math.max(...views.map(v => pubDay(v.published)));

function paint() {
  const clock = clockFrom(state.day);
  map.render(state, clock);
  document.getElementById('date').textContent = clock.label;
  const pub = published(state.day);
  document.getElementById('left').textContent =
    `${seasonJa(clock.season)}還剩 ${clock.daysLeftInSeason} 日`
    + (pub < TOTAL ? ` ・ 廣重已出 ${pub} 景` : '');
  document.getElementById('count').textContent = `${state.collected.length} / ${TOTAL}`;
  save(state);
}

function pick(v) {
  const clock = clockFrom(state.day);
  if (state.collected.includes(v.id)) return say(`${v.title.ja} 已經收過了`);
  // §2.6 出版才出現。地圖上本來就藏起來了，這裡是點不到的保險（歲時記／鍵盤都可能繞過）。
  if (pubDay(v.published) > state.day) return say(`${v.title.ja} 廣重還沒畫`);
  // 同一地點在不同季節是不同的景（§2.2）——季節不對就是遇不到
  if (v.season !== clock.season) {
    return say(`${v.title.ja} 是${seasonJa(v.season)}的景，現在是${seasonJa(clock.season)}`);
  }
  state.pos = { lat: v.subject.lat, lng: v.subject.lng };   // 漫遊不耗時間（§2.1）
  paint();
  showView(v, {
    onCollect() {
      const before = published(state.day);
      state.collected.push(v.id);
      state.day += DAYS_PER_VIEW;              // 時間只由入景推進
      paint();
      const c = clockFrom(state.day);
      if (state.collected.length === TOTAL) return showEnd();
      // 新出版的景是無聲地長在地圖上的，不講一聲玩家不會發現（§2.6）
      const fresh = published(state.day) - before;
      // 跨過最後一枚出版的那一刻要說清楚，否則玩家只會覺得「怎麼不再長了」
      if (before < TOTAL && published(state.day) === TOTAL) {
        say('廣重畫完了最後一枚——此後地圖不會再長出新的景');
      } else if (fresh) say(`廣重又出了 ${fresh} 景`);
      else if (c.season !== clock.season) say(`季節轉了——${seasonJa(c.season)}`);
    },
    onClose: paint,
  });
}

// 收滿 118 景。先前這裡什麼都不會發生——計數器停在 118/118 就沒了，
// 玩家花了遊戲內三年多，遊戲一句話都沒說。
//
// 內容全是查證過的事實，沒有一句是修辭：
// 玩家收滿大約在第 1187 日（安政六年夏），而廣重歿於第 821 日前後，
// 系列最後一枚出在第 822 日。也就是說**最後那段路他已經不在了**。
function showEnd() {
  const clock = clockFrom(state.day);
  const alone = state.day - LAST_PUB;
  const el = document.createElement('div');
  el.className = 'overlay ending';
  el.innerHTML = `<div class="sheet">
    <h2>歳時記 満</h2>
    <p class="date">${clock.label}</p>
    <p>一百十八景走完，歷時 ${(state.day / 365).toFixed(1)} 年。</p>
    <p class="note">廣重歿於安政五年九月六日，系列的最後一枚就出在那前後。
      你在他停筆之後又獨自走了 ${alone} 日，把剩下的季節等完。</p>
    <p class="note dim">第百十九枚〈赤坂桐畑雨中夕けい〉是二代廣重於安政六年四月補的，
      不在這一百十八景之內。</p>
    <div class="act">
      <button id="endbook">看歲時記</button>
      <button id="endclose" class="ghost">閉じる</button>
    </div></div>`;
  el.querySelector('#endclose').onclick = () => { el.remove(); paint(); };
  el.querySelector('#endbook').onclick = () => { el.remove(); showZukan(views, state, paint); };
  document.body.append(el);
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

const eraInput = document.getElementById('era');
eraInput.oninput = () => map.setEra(eraInput.value / 1000);
document.getElementById('book').onclick = () => showZukan(views, state);
document.getElementById('reset').onclick = () => {
  if (confirm('清除進度，從安政三年春天重來？')) { localStorage.removeItem(SAVE); location.reload(); }
};
// 用滑桿當下的值開場，不要寫死 1——瀏覽器重整時會還原表單值，
// 寫死的話滑桿位置與地圖年代會對不上。
eraInput.oninput();
paint();
