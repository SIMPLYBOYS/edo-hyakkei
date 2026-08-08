// 進入點：狀態、遇景判定、存檔。
// ponytail: 遇景邏輯只有十幾行，沒有另開 roam.js——一個檔就講得完的事不必拆兩個。
import { clockFrom, dateDay, DAYS_PER_VIEW, pubDay, seasonJa } from './calendar.js';
import { createMap } from './map.js';
import { showView } from './view.js';
import { showHunt } from './hunt.js';
import { showZukan } from './zukan.js';

const SAVE = 'edo-hyakkei/v1';
const load = () => {
  try {
    return { pos: { lat: 35.684, lng: 139.7745 }, day: 0, collected: [], found: {},
             ...JSON.parse(localStorage[SAVE]) };
  } catch {
    return { pos: { lat: 35.684, lng: 139.7745 }, day: 0, collected: [], found: {} };  // 日本橋起點
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

const [all, world, edo, hist] = await Promise.all([
  grab('data/views.json'),
  grab('data/geo/modern.json'),
  // 地名只是裝飾，掛掉不該連地圖一起拖下水（§2.7）
  grab('data/edo-places.json').catch(e => (console.warn('江戶地名層略過:', e), { places: [] })),
  // 史實事件同理，掛掉只是少了註腳（§2.9）
  grab('data/events.json').catch(e => (console.warn('史實事件層略過:', e), { events: [] })),
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
// §2.9 史實事件。日期換算成遊戲日，跨過去的時候講一聲。
// 這些事件**不改變任何數值**——理由見 events.json 的 _no_mechanics：
// 它們真正的機制後果早就在資料裡了（台風之後三個月，地圖確實不長新的景）。
const EVENTS = (hist.events ?? []).map(e => ({ ...e, day: dateDay(e.date) }))
  .sort((a, b) => a.day - b.day);

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

function paint() {
  const clock = clockFrom(state.day);
  map.render(state, clock);
  // 和曆＋西元並置。年號認不出年代，而事件框用的是西元，兩邊要對得起來（§2.9）
  document.getElementById('date').innerHTML =
    `${clock.label}<span class="ad">${clock.iso}</span>`;
  const pub = published(state.day);
  document.getElementById('left').textContent =
    `${seasonJa(clock.season)}還剩 ${clock.daysLeftInSeason} 日`
    + (pub < TOTAL ? ` ・ 廣重已出 ${pub} 景` : '');
  document.getElementById('count').textContent = `${state.collected.length} / ${TOTAL}`;
  // 目前所在的季節標亮；那一季已經收齊的就變灰（按了也沒用）
  for (const b of seasonBar.children) {
    b.classList.toggle('now', b.dataset.s === clock.season);
    b.disabled = !views.some(v => !state.collected.includes(v.id) && v.season === b.dataset.s);
  }
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
    // §2.5 結案：找廣重的謊言是**選做**，但要記得。
    // 先前 found 是 view.js 的區域變數，關掉畫面就忘了——
    // 玩家做了事而遊戲沒記住，那才是真正的問題，不是「算不算完成度」。
    found: state.found[v.id] ?? [],
    onFind(i) {
      (state.found[v.id] ??= []).push(i);
      save(state);
    },
    onCollect() {
      state.collected.push(v.id);
      advance(DAYS_PER_VIEW);                  // 入景耗日（§2.1）
    },
    onClose: paint,
  });
}

/** 這一天有沒有景可收 */
const anythingOpen = day => {
  const s = clockFrom(day).season;
  return views.some(v => !state.collected.includes(v.id)
    && v.season === s && pubDay(v.published) <= day);
};

// 🔴 2026/08/08：時間推進集中在這裡，因為先前**只有**入景會推進日期，
// 而那會讓遊戲卡死。實測（照遊戲真正的規則，不是模擬裡那個會 day++ 的版本）：
// 收到第 89 景、第 712 日時當季已無景可收，於是日期再也不動，剩下 29 景永遠拿不到。
// 我跑過的每一支模擬在無景可收時都寫 day++，那個動作在遊戲裡不存在——
// **模擬的是一個有「等待」的遊戲，而遊戲沒有。**
function advance(days) {
  const was = state.day, before = published(was);
  state.day += days;
  paint();
  if (state.collected.length === TOTAL) return showEnd();
  // 跨過的史實事件優先講（§2.9）：台風跟「又出了三景」同時發生時，該講的是台風。
  // 收下第一景時另外補講起點之前的事——那是他走進這座城時，城剛經歷過的。
  const crossed = EVENTS.filter(e => e.day > was && e.day <= state.day)
    .concat(state.collected.length === 1 ? EVENTS.filter(e => e.day <= 0) : []);
  if (crossed.length) return showEvents(crossed.sort((a, b) => a.day - b.day));
  const fresh = published(state.day) - before;
  // 跨過最後一枚出版的那一刻要說清楚，否則玩家只會覺得「怎麼不再長了」
  if (before < TOTAL && published(state.day) === TOTAL) {
    say('廣重畫完了最後一枚——此後地圖不會再長出新的景');
  } else if (fresh) say(`廣重又出了 ${fresh} 景`);
  else if (clockFrom(state.day).season !== clockFrom(was).season) {
    say(`季節轉了——${seasonJa(clockFrom(state.day).season)}`);
  }
}

// §2.2 季節由玩家選（2026/08/08 改）。舊版是「收到換季為止」，
// 那個限制**不產生任何決策**——沒有取捨、沒有技巧，只是強迫你按四季輪替看畫。
// 現在按季節鈕＝把時鐘推進到那個季節。
//
// 為什麼是「推進時鐘」而不是「切換濾鏡」：日期要永遠是真的。
// 出版閘門（§2.6）與史實事件（§2.9）都掛在日期上，濾鏡會讓它們失去意義。
// 這也順便吸收掉舊的「待つ」，並消掉整類卡死 bug。
const SEASONS = [['spring', '春'], ['summer', '夏'], ['autumn', '秋'], ['winter', '冬']];

/** 那個季節下一次「有景可收」是哪一天；沒有就回 null */
function nextOpen(season) {
  for (let d = state.day + 1; d <= state.day + 800; d++) {
    if (clockFrom(d).season === season && anythingOpen(d)) return d;
  }
  return null;
}

function goSeason(season) {
  if (state.collected.length === TOTAL) return say('一百十八景都收齊了');
  if (clockFrom(state.day).season === season && anythingOpen(state.day)) {
    return say(`已經在${seasonJa(season)}了`);
  }
  const d = nextOpen(season);
  if (d == null) return say(`${seasonJa(season)}的景都收齊了`);
  const n = d - state.day;
  advance(n);
  say(`${seasonJa(season)}へ——${clockFrom(state.day).label}（${n} 日後）`);
}

const seasonBar = document.getElementById('seasons');
seasonBar.innerHTML = SEASONS.map(([k, ja]) =>
  `<button data-s="${k}">${ja}</button>`).join('');
for (const b of seasonBar.children) b.onclick = () => goSeason(b.dataset.s);

// §2.9 事件通知。一步九日，理論上可能一次跨過兩件，所以做成佇列依序顯示。
// seen_in_data 那行是這個功能的重點：它寫的是 views.json 裡看得到的事實
// （台風之後三個月沒有出版），**不是「因為台風所以沒出版」**。
// 兩件事並列擺著，玩家自己看——與 §2.4 變造同一條規矩。
function showEvents([e, ...rest]) {
  if (!e) return paint();
  const el = document.createElement('div');
  el.className = 'overlay ending event';
  el.innerHTML = `<div class="sheet">
    <p class="date">${e.day <= 0 ? '在你出發之前　' : ''}${e.wareki}<span class="dim">　${e.date}</span></p>
    <h2>${e.title}</h2>
    <p class="note">${e.note}</p>
    ${e.seen_in_data ? `<p class="note seen">這套系列的出版紀錄裡：${e.seen_in_data}</p>` : ''}
    <div class="act"><button id="evok">知道了</button></div></div>`;
  el.querySelector('#evok').onclick = () => { el.remove(); showEvents(rest); };
  document.body.append(el);
}

// 收滿 118 景。先前這裡什麼都不會發生——計數器停在 118/118 就沒了。
//
// 🔴 2026/08/08 改成開放結局。原本寫的是「廣重歿於…你在他停筆之後又獨自走了
// N 日」——那在季節綁死時還算數，因為每個人的路徑都一樣。
// **季節改成玩家自選之後，路徑是他自己挑的**，那句話就變成替別人的旅程下結論。
// 廣重之死留在它本來的位置：你走到 1858 年秋天時會遇到的一件事（§2.9 事件），
// 不是通關獎勵。這裡只報你自己的數字，不加敘事。
function showEnd() {
  const clock = clockFrom(state.day);
  const el = document.createElement('div');
  el.className = 'overlay ending';
  el.innerHTML = `<div class="sheet">
    <h2>歳時記 満</h2>
    <p class="date">${clock.label}<span class="dim">　${clock.iso}</span></p>
    <p>一百十八景走完，歷時 ${(state.day / 365).toFixed(1)} 年。</p>
    <p class="note dim">第百十九枚〈赤坂桐畑雨中夕けい〉是二代廣重於安政六年四月補的，
      不在這一百十八景之內。</p>
    <div class="act">
      <button id="endbook">看歲時記</button>
      <button id="endclose" class="ghost">続ける</button>
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
// §2.10 原型：獨立模式，不動主循環的任何狀態
document.getElementById('hunt').onclick = () => showHunt(views, map, paint);
document.getElementById('book').onclick = () => showZukan(views, state);
document.getElementById('reset').onclick = () => {
  if (confirm('清除進度，從安政三年春天重來？')) { localStorage.removeItem(SAVE); location.reload(); }
};
// 用滑桿當下的值開場，不要寫死 1——瀏覽器重整時會還原表單值，
// 寫死的話滑桿位置與地圖年代會對不上。
eraInput.oninput();
paint();
