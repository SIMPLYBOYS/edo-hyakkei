// 進入點：狀態、遇景判定、存檔。
// ponytail: 遇景邏輯只有十幾行，沒有另開 roam.js——一個檔就講得完的事不必拆兩個。
import { clockFrom, dateDay, DAYS_PER_VIEW, pubDay, seasonJa, SHORTEST_DAYS } from './calendar.js';
import { createMap } from './map.js';
import { showView } from './view.js';
import { showHunt } from './hunt.js';
import { showZukan } from './zukan.js';
import { showEmaki } from './emaki.js';
import { bgmInit, bgmLoad } from './bgm.js';
import { introInit } from './intro.js';
import { canFullscreen, standalone } from './ui.js';
import { showHowTo, howToFirstRun } from './howto.js';
import { loadConfig } from './config.js';

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
// 🔴 但「任何錯誤」抓得太寬了。瀏覽器外掛會往每個頁面注入程式並丟錯，
// 而那跟這個遊戲毫無關係——實測 MetaMask 的「Failed to connect to MetaMask」
// 把整張地圖蓋掉了，地圖其實好好地在底下。
// 這個框存在的理由是「解釋白畫面」，所以只在兩個條件同時成立時才蓋畫面：
//   1. 還沒開完場（開完了就表示地圖是好的，之後的錯誤不該蓋掉它）
//   2. 錯誤真的是我們自己的程式丟的（堆疊裡有本站的網址）
// 其餘一律只留在 Console——資訊還在，只是不再劫持整個畫面。
let booted = false;
const ours = trace => typeof trace === 'string' && trace.includes(location.origin);
const filtered = (why, msg) => console.error(`[不蓋畫面：${why}]`, msg);
addEventListener('error', e => {
  if (booted) return filtered('開場已完成', e.message);
  if (!ours(e.filename || e.error?.stack || '')) return filtered('不是本站的程式', e.message);
  fatal(e.message);
});
addEventListener('unhandledrejection', e => {
  const msg = e.reason?.message ?? e.reason;
  if (booted) return filtered('開場已完成', msg);
  if (!ours(e.reason?.stack || '')) return filtered('不是本站的程式', msg);
  fatal(msg);
});

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

const [, all, world, edo, hist, zueMap, miyMap, tunes] = await Promise.all([
  // 設定（目前只有 Google Maps 金鑰）。沒有就沒有——「看今天」不出現，其餘照常。
  loadConfig(),
  grab('data/views.json'),
  grab('data/geo/modern.json'),
  // 地名只是裝飾，掛掉不該連地圖一起拖下水（§2.7）
  grab('data/edo-places.json').catch(e => (console.warn('江戶地名層略過:', e), { places: [] })),
  // 史實事件同理，掛掉只是少了註腳（§2.9）
  grab('data/events.json').catch(e => (console.warn('史實事件層略過:', e), { events: [] })),
  // 對照書的配對筆記。這兩份是人工比對的成果（卷・丁・頁名＋「這兩張圖差在哪」），
  // 一直只有工具在讀，畫面上一個字都沒出現過——按了「看《名所圖會》」只換圖，
  // 不說你正在看哪一頁，也不說這兩張圖是什麼關係。
  grab('data/meishozue-map.json').catch(e => (console.warn('圖會配對略過:', e), { pairs: [] })),
  grab('data/miyage-map.json').catch(e => (console.warn('土產配對略過:', e), { pairs: [] })),
  // 配樂的旋律（江戶期のわらべ唄・子守唄）。掛掉只是沒有聲音，不該擋住遊戲。
  grab('data/bgm.json').catch(e => (console.warn('配樂略過:', e), { tracks: [] })),
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
// 現代地名（23 區＋周邊市，OSM 的 place=city）。跟江戶地名走同一套避讓與縮放，
// 差別只在 kind——地圖只在滑桿推到現代側時畫它們。
// 江戶那 62 個是水系與堀，那些名字兩個時代都通；區名不是，1858 年沒有新宿区。
places.push(...(world.labels ?? []).filter(l => l.kind === 'city')
  .map(l => ({ ...l, osm: l.name, edo: null })));
// §2.9 史實事件。日期換算成遊戲日，跨過去的時候講一聲。
// 這些事件**不改變任何數值**——理由見 events.json 的 _no_mechanics：
// 它們真正的機制後果早就在資料裡了（台風之後三個月，地圖確實不長新的景）。
const EVENTS = (hist.events ?? []).map(e => ({ ...e, day: dateDay(e.date) }))
  .sort((a, b) => a.day - b.day);

// no.119 赤坂桐畑是二代廣重 1859 年補的一枚，不屬於廣重的 118 景。
// 資料裡留著（那是完整的），但遊戲只玩 1–118——先前地圖收得到、歲時記卻不算，
// 會跑出「119 / 118」這種分數。要一致就兩邊都排除。
// （這一枚該怎麼記在全集裡是 §6.1 未決的另一個問題，與此無關。）
const byId = m => new Map((m.pairs ?? []).map(q => [q.id, q]));
const zuePair = byId(zueMap), miyPair = byId(miyMap);
const views = all.filter(v => v.id <= 118)
  .map(v => ({ ...v, pair: { meishozue: zuePair.get(v.id), miyage: miyPair.get(v.id) } }));
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

// 找到廣重動的手腳就記一筆。看畫（§2.4）與狩獵揭曉（§2.10）共用同一格。
const noteLie = (id, i) => { (state.found[id] ??= []).push(i); save(state); };

// 從歲時記翻回來重看。不移動、不耗日、不能再收一次——收過的畫本來就是你的了，
// 再看一次不該有代價。變造照樣找得，記在同一格。
//
// 前後翻頁的順序＝歲時記畫面上的順序（春夏秋冬，季內依景號），不是景號本身。
// 玩家看到的是那本簿子的排法，翻頁跟著它走才不會覺得跳來跳去。
const SEASON_ORDER = ['spring', 'summer', 'autumn', 'winter'];
const inBook = () => SEASON_ORDER.flatMap(s =>
  views.filter(v => v.season === s && state.collected.includes(v.id)));

const reopen = v => {
  const book = inBook();
  const at = book.findIndex(x => x.id === v.id);
  // step(dir) 回傳「開下一張的函式」或 null——null 就把鈕變灰。
  // 未收的景不在 book 裡，所以自然跳過，不必另外濾。
  const step = dir => {
    const nx = book[at + dir];
    return nx ? () => reopen(nx) : null;
  };
  showView(v, { found: state.found[v.id] ?? [], onFind: i => noteLie(v.id, i),
                step: at < 0 ? undefined : step });
};

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
    // 在看畫找到、還是在狩獵揭曉找到，都存進同一格——同一個變造只算一次。
    // 先前 found 是 view.js 的區域變數，關掉畫面就忘了——
    // 玩家做了事而遊戲沒記住，那才是真正的問題，不是「算不算完成度」。
    found: state.found[v.id] ?? [],
    onFind: i => noteLie(v.id, i),
    onCollect() {
      state.collected.push(v.id);
      advance(DAYS_PER_VIEW, {                 // 入景耗日（§2.1）
        fallback: `${v.title.ja ?? `第 ${v.id} 景`}　收入歲時記`,
      });
      // 地圖上那一點閃一圈。畫消失的那一刻，改變全在角落——給視線一個落點。
      map.flash(v.id);
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
/** days：推進幾日。
 *  word：呼叫端想說的話，**蓋過**這裡算出來的通則訊息——例如季節鈕的
 *        「到秋——…（173 日後）」比「季節轉了」精確。
 *  fallback：通則訊息也沒話說時才用的墊底句——例如收景的「◯◯　收入歲時記」。
 *        收景多半不跨季也沒有新出版，那時整個畫面只有角落三個小地方變了。
 *
 *  兩者都交給這裡而不是自己 say()，是為了跟史實事件排好順序：
 *  有事件時要等最後一格「知道了」按掉才說，不然 toast 會被遮罩蓋住。 */
function advance(days, { word = null, fallback = '' } = {}) {
  const was = state.day, before = published(was);
  state.day += days;
  paint();
  if (state.collected.length === TOTAL) return showEnd();

  // 🔴 這一次推進要說的話**先算好**，不要等到下面。
  // 舊寫法是「有史實事件就 return」，於是同一次推進的「廣重又出了 3 景」
  // 「季節轉了」整個被吞掉——而那是玩家唯一會知道地圖長大的管道。
  // 順序仍然是事件優先（台風跟出版同時發生時該講台風），但後者改成
  // 交給 showEvents，等最後一格「知道了」按掉再說。
  const fresh = published(state.day) - before;
  word ??=
    // 跨過最後一枚出版的那一刻要說清楚，否則玩家只會覺得「怎麼不再長了」
    before < TOTAL && published(state.day) === TOTAL
      ? '廣重畫完了最後一枚——此後地圖不會再長出新的景'
      : fresh ? `廣重又出了 ${fresh} 景`
      : clockFrom(state.day).season !== clockFrom(was).season
        ? `季節轉了——${seasonJa(clockFrom(state.day).season)}`
        : fallback;

  // 跨過的史實事件優先講（§2.9）。另外補講起點之前的事——那是他走進這座城時，
  // 城剛經歷過的。
  //
  // 🔴 條件是「時鐘第一次動」（was === 0），不是「已收一景」。
  // 舊寫法 state.collected.length === 1 描述的是**狀態**不是**時刻**：
  // 只要還停在一景，之後每一次 advance（按季節鈕也算）都會再講一遍台風。
  // 實測收一景講一次、接著按「秋」又講一次。用 was === 0 就自然只有一次，
  // 而且不必存旗標——重整之後 day 已經 > 0，本來就不會再觸發。
  const crossed = EVENTS.filter(e => e.day > was && e.day <= state.day)
    .concat(was === 0 ? EVENTS.filter(e => e.day <= 0) : []);
  if (crossed.length) return showEvents(crossed.sort((a, b) => a.day - b.day), word);
  if (word) say(word);
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
  // 話交給 advance 說，不要自己 say——那一步可能會跳出史實事件，
  // 自己說的話會被遮罩蓋住，等玩家按掉時已經消失了。
  advance(n, { word: `到${seasonJa(season)}——${clockFrom(d).label}（${n} 日後）` });
}

const seasonBar = document.getElementById('seasons');
seasonBar.innerHTML = SEASONS.map(([k, ja]) =>
  `<button data-s="${k}">${ja}</button>`).join('');
for (const b of seasonBar.children) b.onclick = () => goSeason(b.dataset.s);

// §2.9 事件通知。一步九日，理論上可能一次跨過兩件，所以做成佇列依序顯示。
// seen_in_data 那行是這個功能的重點：它寫的是 views.json 裡看得到的事實
// （台風之後三個月沒有出版），**不是「因為台風所以沒出版」**。
// 兩件事並列擺著，玩家自己看——與 §2.4 變造同一條規矩。
/** after：所有事件都按掉之後要說的那句話（見 advance 的註解）。
 *  中途說沒有意義——toast 會被事件的遮罩蓋住。 */
function showEvents([e, ...rest], after = '') {
  if (!e) { paint(); if (after) say(after); return; }
  const el = document.createElement('div');
  el.className = 'overlay ending event';
  el.innerHTML = `<div class="sheet">
    <p class="date">${e.day <= 0 ? '在你出發之前　' : ''}<span>${e.wareki}</span>　<span class="dim">${e.date}</span></p>
    <h2>${e.title}</h2>
    <p class="note">${e.note}</p>
    ${e.seen_in_data ? `<p class="note seen">這套系列的出版紀錄裡：${e.seen_in_data}</p>` : ''}
    <div class="act"><button id="evok">知道了</button></div></div>`;
  el.querySelector('#evok').onclick = () => { el.remove(); showEvents(rest, after); };
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
  const walk = TOTAL * DAYS_PER_VIEW;          // 收景的日子：每個玩家都一樣
  const wait = state.day - walk;               // 其餘全是等季節
  const extra = state.day - SHORTEST_DAYS;
  const el = document.createElement('div');
  el.className = 'overlay ending';
  el.innerHTML = `<div class="sheet">
    <h2>歳時記 満</h2>
    <!-- 和曆包在 span 裡不是為了樣式，是為了**不被拆開**（見 index.html 的 .date > span）。
         裸文字節點沒得套 white-space。 -->
    <p class="date"><span>${clock.label}</span>　<span class="dim">${clock.iso}</span></p>
    <p>一百十八景走完，歷時 ${(state.day / 365).toFixed(1)} 年（${state.day} 日）。</p>
    <!-- 「你花了多久」是這場遊戲裡唯一因人而異的量。收景的日子誰都一樣（118×8），
         差別全在等季節——在還有景可收時離開一季，下次就得多等一整年。
         先前結局只寫「歷時 3.2 年」，沒有對照，玩家不知道那是快是慢。 -->
    <p class="pace">走 ${walk} 日　等 ${wait} 日${extra <= 0
      ? '<br><span class="dim">最短的走法就是這樣——你一天都沒多等。</span>'
      : `<br><span class="dim">最短是 ${SHORTEST_DAYS} 日，你多等了 ${extra} 日。</span>`}</p>
    <p class="note dim">等待歸不了零：春有四十二景，而一個春天最多收十一二景——
      誰都得走過四個春天。夏三個、秋三個、冬兩個。</p>
    <p class="note dim">第百十九枚〈赤坂桐畑雨中夕けい〉是二代廣重於安政六年四月補的，
      不在這一百十八景之內。</p>
    <div class="act">
      <button id="endbook">看歲時記</button>
      <button id="endclose" class="ghost">繼續</button>
    </div></div>`;
  el.querySelector('#endclose').onclick = () => { el.remove(); paint(); };
  el.querySelector('#endbook').onclick = () =>
    { el.remove(); showZukan(views, state,
        { onClose: paint, onPick: reopen, onEmaki: openEmaki }); };
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
const eraNow = document.getElementById('eranow');
// 拖動時要看得到自己在哪。
//
// 🔴 但**不內插年份**。這條滑桿只有兩份圖資：2026 的 OSM 與 1858 的江戶層，
// 中間是交叉淡入，沒有 1900 也沒有 1942。在半路印「1942 年」等於告訴玩家
// 昭和十七年的東京長這樣——那是 distortions 的 _rule 禁的同一件事，
// 遊戲裡言之鑿鑿的假知識。所以讀數講的是「疊了多少」，不是哪一年。
//
// 兩端才報年份，因為那兩端是真的有資料的年份。
let eraFade;
eraInput.oninput = () => {
  const t = eraInput.value / 1000;
  map.setEra(t);
  eraNow.textContent = t > 0.98 ? '安政五年 1858 的地圖'
    : t < 0.02 ? '2026 現在的地圖'
    : `兩張圖疊著 — 江戶 ${Math.round(t * 100)}%`;
  // 停手兩秒就淡出：它是拖動時的回饋，不是常駐的抬頭顯示
  eraNow.classList.add('on');
  clearTimeout(eraFade);
  eraFade = setTimeout(() => eraNow.classList.remove('on'), 2000);
};
// §2.10 視點狩獵。不動收集進度與日期，但揭曉頁能找變造，那筆要記住——
// 兩個玩法用同一份 state.found，才不會互相把答案洩掉又各記各的。
document.getElementById('hunt').onclick = () =>
  showHunt(views, map, { found: state.found, onFind: noteLie, onDone: paint });
// 歲時記 →（繪卷）→ 看畫，三層都留在原地：繪卷點一張開看畫，關掉回繪卷，
// 再關掉回歲時記。回頭路不該把前面兩層一起收掉。
const openBook = () => showZukan(views, state, { onPick: reopen, onEmaki: openEmaki });
const openEmaki = () => showEmaki(views, state, reopen);
document.getElementById('book').onclick = openBook;
// 全螢幕。用原生的 Fullscreen API——這件事不值得為它裝任何東西。
//
// 🔴 **iPhone 的 Safari 沒有這個 API**（iPad 有）。手機上的全螢幕是「加到主畫面」
// 之後的獨立視窗，靠 index.html 那份 manifest 與 apple-* meta，跟這顆鈕無關。
// 所以不支援就把鈕拿掉——留一顆按了沒反應的鈕比沒有這顆鈕更糟。
// 已經在獨立視窗裡跑的也拿掉：瀏覽器的邊框本來就不在了，那顆鈕沒有意義。
{
  const btn = document.getElementById('fs');
  if (standalone() || !canFullscreen()) {
    btn.remove();
  } else {
    // 四個角：向外＝進去，向內＝出來。不用文字（「全螢幕」三個字會把桌機的 HUD
    // 從 64px 擠成 94px），也不用字型裡的 ⤢（看起來像「外部連結」，而且不是每套
    // 字型都有那個字）。圖示與說明跟著**實際狀態**走——使用者也可能按 F11 或 Esc。
    const icon = d => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor"`
      + ` stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
    const OUT = 'M6 1.5H1.5V6M10 1.5H14.5V6M6 14.5H1.5V10M10 14.5H14.5V10';
    const IN = 'M1.5 6H6V1.5M14.5 6H10V1.5M1.5 10H6V14.5M14.5 10H10V14.5';
    const sync = () => {
      const on = !!document.fullscreenElement;
      btn.innerHTML = icon(on ? IN : OUT);
      btn.title = on ? '離開全螢幕（Esc）' : '全螢幕（F）';
    };
    const flip = () => (document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen()).catch(() => {});
    btn.onclick = flip;
    addEventListener('fullscreenchange', sync);
    // F 是遊戲的慣例。這個作品沒有任何文字輸入框，但還是讓開——
    // 之後真的加了輸入框，這裡不會變成「打不出 f」的怪 bug。
    addEventListener('keydown', e => {
      if (e.key !== 'f' && e.key !== 'F') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.activeElement?.matches('input, textarea, [contenteditable]')) return;
      flip();
    });
    sync();
  }
}

document.getElementById('reset').onclick = () => {
  if (confirm('清除進度，從安政三年春天重來？')) { localStorage.removeItem(SAVE); location.reload(); }
};
// 用滑桿當下的值開場，不要寫死 1——瀏覽器重整時會還原表單值，
// 寫死的話滑桿位置與地圖年代會對不上。
bgmLoad(tunes);
bgmInit(document.getElementById('bgm'));
eraInput.oninput();
// 開場那次不該留著讀數：它是「你剛剛拖到這裡」的回饋，玩家還沒碰過它。
eraNow.classList.remove('on');
clearTimeout(eraFade);
paint();
// 走到這裡＝地圖畫出來了。之後再出什麼錯都不該蓋掉它（見上面的 fatal）。
booted = true;

// 開場。放在地圖畫好之後：開場淡出時底下正好是起點（日本橋的紅點）。
// 素材在 assets/（gitignore），由 tools/fetch-intro.py 重建；沒抓的話就沒有開場，
// 遊戲照常——開場是門面，不是門檻。
const introMeta = await grab('data/intro.json').catch(e => (console.warn('開場略過:', e), null));
if (introMeta) {
  // 開場放完（或按了跳過）才開玩法：兩層文字疊在一起沒人讀得下去。
  // 不播開場的回訪玩家，onEnd 不會來，所以下面自己接一次。
  const intro = introInit({
    image: 'assets/intro/keisai-1803.jpg', target: introMeta.nihonbashi,
    art: introMeta.art, button: document.getElementById('intro-btn'),
    onEnd: () => howToFirstRun(),
  });
  if (!intro.playing) howToFirstRun();
} else {
  document.getElementById('intro-btn').remove();   // 沒素材就沒得重看
  howToFirstRun();                                 // 但玩法還是要有
}

document.getElementById('howto').onclick = () => showHowTo();
// ? 是說明的通用鍵。打字框裡不搶（這個遊戲沒有輸入框，但將來有的話不必回來改）
addEventListener('keydown', e => {
  if (e.key !== '?' || document.activeElement?.matches('input, textarea')) return;
  showHowTo();
});
