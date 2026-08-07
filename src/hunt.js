// §2.10 視點狩獵。用《江戶名所圖會》出題，用廣重的畫揭曉。
//
// 為什麼要有這個：主循環唯一的動詞是收集，而收集不需要技巧——
// 點金點、看畫、按收藏。這個模式把方向反過來（看畫 → 找地方），
// 玩家要讀的是畫裡的橋、堀、水系彎法，對回地圖上那 62 個江戶地名（§2.7）。
//
// 🔴 為什麼出題用圖會而不是廣重：原型（08/08 上午）用廣重出題，
// 但**這套百景每一張都有短冊題簽印在畫面上**——「日本橋雪晴」就在右上角。
// 藏起 metadata 的標題等於沒藏，謎題退化成「這個地名在地圖哪裡」。
//
// 改用圖會出題同時解決兩件事：
//   1. 圖會是寫實鳥瞰，本來就適合「讀地形」
//   2. **落差本身變成獎勵**——你照著寫實版找出地點，揭曉時看到廣重
//      對同一個地方做了什麼（放大富士、清空人群、把池子撐滿畫面）。
//      §2.4「找廣重的謊言」從註腳變成這個模式的收尾。
//
// 圖會的題簽也印在畫面上（070 在右上、094 在左上），位置不固定，
// 但都落在頂部那一帶——而那裡是天空／遠山／和歌。出題時遮掉頂部，
// 幾乎不損失地理資訊；揭曉時整張放出來。
import { meishozue, plate } from './paths.js';

// 挑選標準：圖會那張要讀得出地形，而且六題要有難度梯度與地理跨度。
// 這是人工判斷，理由逐筆寫在後面（與 fetch-plates.py 的 PAIRS 同一個規矩）。
// 池子是「有圖會對照的 52 景」（§7-14），要擴充從那裡挑。
const HUNT = [
  [1,   '圖會畫的是日本橋魚市：橋、河、兩岸町屋。開場題，形狀最好認'],
  [58,  '新大橋橫跨大川。圖會是晴天的鳥瞰，橋墩結構與河寬清楚'],
  [88,  '石神井川的岩隙峽谷與橫跨的木橋。全江戶只有王子一帶有這種地形'],
  [107, '洲崎弁天社與海濱。判斷全靠「這是填海前的海邊」——把年代滑桿推到 1858 會有幫助'],
  [70,  '兩條河的匯流口，渡場、石垣、載客的船。中川與小名木川交會處'],
  [87,  '★最難：它根本不在江戶，在三鷹。答錯不要緊——'
        + '重點是揭曉時你會發現這套百景的範圍比想像大'],
];

const km = (a, b) => {                       // 這個尺度用等距近似就夠，不需要 haversine
  const k = Math.cos((a.lat + b.lat) / 2 * Math.PI / 180);
  return Math.hypot((a.lng - b.lng) * k, a.lat - b.lat) * 111.19;
};

// 帶狀評語。門檻照江戶的尺度訂：城東西約 30km，六題最遠相距 22km，
// 亂猜期望誤差約 7km——所以 3km 大約是「認得出是哪一區」，1km 是「認得出是哪座橋」。
const BANDS = [
  [0.3, '的中', 5], [1, '見事', 4], [3, '惜しい', 3], [8, '遠い', 2], [Infinity, '大外れ', 1],
];
const band = d => BANDS.find(([lim]) => d <= lim);
const dist = d => (d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`);

export function showHunt(views, map, onDone) {
  const rounds = HUNT.map(([id, why]) => ({ v: views.find(x => x.id === id), why }))
    .filter(r => r.v?.assets.meishozue);       // 沒有圖會就出不了題
  if (!rounds.length) return onDone?.();
  let i = 0, guess = null;
  const results = [];

  const el = document.createElement('div');
  el.id = 'hunt-ui';
  document.body.append(el);
  map.hunt.on((lng, lat) => {                  // 點地圖＝下針
    guess = { lng, lat };
    map.hunt.pin(lng, lat);
    el.querySelector('#hgo').disabled = false;
    el.querySelector('.q').textContent = '再點可以改；決定了就按下面';
  });

  function ask() {
    const { v } = rounds[i];
    guess = null;
    map.hunt.clear();
    // masked：遮住頂部那一帶（題簽與和歌都在那裡）
    el.innerHTML = `
      <div class="qimg masked"><img src="${meishozue(v.id)}" alt=""></div>
      <div class="body">
        <p class="n">${i + 1} / ${rounds.length}　江戶名所圖會</p>
        <p class="q">這是江戶的哪裡？在地圖上點一下</p>
        <div class="act">
          <button id="hgo" disabled>ここだ</button>
          <button id="hquit" class="ghost">やめる</button>
        </div>
      </div>`;
    el.querySelector('#hgo').onclick = answer;
    el.querySelector('#hquit').onclick = quit;
  }

  function answer() {
    const { v, why } = rounds[i];
    const d = km(guess, v.subject);
    const [, word, pts] = band(d);
    results.push({ v, d, pts });
    map.hunt.reveal(v.subject.lng, v.subject.lat);
    // 揭曉：廣重的畫在上、圖會不再遮罩在下——落差就是這個模式的收尾
    el.innerHTML = `
      <div class="qimg"><img src="${plate(v.id)}" alt="" class="tall"></div>
      <div class="body">
        <p class="verdict ${pts >= 4 ? 'good' : pts <= 2 ? 'bad' : ''}">${word}
          <span>差 ${dist(d)}</span></p>
        <h3>${v.title.ja}</h3>
        <p class="why">${why}</p>
        <div class="act">
          <button id="hnext">${i + 1 < rounds.length ? '次へ' : '結果'}</button>
        </div>
      </div>`;
    el.querySelector('#hnext').onclick = () => { i++; i < rounds.length ? ask() : summary(); };
  }

  function summary() {
    const total = results.reduce((a, r) => a + r.pts, 0);
    const best = results.reduce((a, r) => (r.d < a.d ? r : a));
    map.hunt.clear();
    el.innerHTML = `
      <div class="body">
        <h3>視点狩り</h3>
        <p class="verdict">${total} / ${results.length * 5}</p>
        <ul class="list">${results.map(r =>
          `<li><span>${r.v.title.ja}</span><b>${dist(r.d)}</b></li>`).join('')}</ul>
        <p class="why">最も近かったのは「${best.v.title.ja}」（${dist(best.d)}）。</p>
        <div class="act"><button id="hquit">閉じる</button></div>
      </div>`;
    el.querySelector('#hquit').onclick = quit;
  }

  function quit() { map.hunt.off(); el.remove(); onDone?.(); }
  ask();
}
