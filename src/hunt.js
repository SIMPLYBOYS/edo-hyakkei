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
import { meishozue, miyage, plate } from './paths.js';
import { findLies } from './lie.js';

// 題庫。挑選標準：出題那張要讀得出地形，而且要涵蓋整個畫框。
// 這是人工判斷，理由逐筆寫在後面（與 fetch-plates.py 的 PAIRS 同一個規矩）。
// 池子是「有任一種對照的 73 景」——這裡收 32 景，全部確認過來源。
//
// 分三層是為了每局都給得出難度梯度：一局抽 8 題（2 易 4 中 2 難），
// 由易到難排。**同一個池子每局抽不同題**，所以重玩才有意義；
// 而 32 題全塞進一局會太長——這個模式的樂趣在一次幾分鐘，不在耐力。
//
// 為什麼不把 73 景全放進來：狩獵的品質不看有沒有變造，只看
// 「那張寫實版讀不讀得出地形」。有些配對是室內、特寫或純建築立面，
// 讀不出地形，放進來只會變成猜謎。
const POOL = [
  // ── 易：形狀好認，或位置太有名 ─────────────────────────────
  [1,   'e', '橋、河、兩岸町屋與魚市。江戶最中心的那座橋'],
  [43,  'e', '另一座橋與沿河的長屋——它就在前一座的下游'],
  [46,  'e', '一排白牆土藏與渡船。階梯狀的屋脊線是這一帶的特徵'],
  [99,  'e', '大寺的境內與參道兩側的攤棚'],
  [58,  'e', '一座木橋橫過寬闊的大川，橋墩的支撐結構清楚'],
  [2,   'e', '一條坡道，兩側是大名屋敷的長牆與海鼠壁'],
  // ── 中：要讀地形或水系才定得出來 ───────────────────────────
  [70,  'm', '兩條河的匯流口，渡場、石垣、載客的船'],
  [88,  'm', '岩隙峽谷與橫跨的木橋。全江戶只有一處有這種地形'],
  [107, 'm', '海濱與弁天社。判斷全靠「這是填海前的海邊」——把年代滑桿推到 1858 會有幫助'],
  [64,  'm', '整片菖蒲田與其旁的河'],
  [111, 'm', '石造的太鼓橋跨在谷上，兩側是坡地與樹'],
  [100, 'm', '一道築高的堤，堤上一排茶屋，堤外是水田'],
  [61,  'm', '大川岸邊的茶屋與探出水面的松'],
  [92,  'm', '隅田川東岸的寺與村落，田畝與水道交錯'],
  // no.65 亀戸天神 2026/08/09 移除：出題會拿到圖會 v18 p49，那頁一半是文字，
  // 剩下一半是遠遠一排屋頂，讀不出地形。原本的提示寫「太鼓橋、藤棚與大松」——
  // 講的是廣重與土產的畫，不是玩家會看到的那張。
  // 🔴 提示是照著「這一景是什麼」寫的，不是照著「出題會顯示哪張圖」寫的。
  // 池子裡其餘各題值得照這個標準再看一遍。
  [83,  'm', '伸進海裡的一條沙嘴與嘴上的社叢'],
  [33,  'm', '一條筆直的用水與旁邊的縴道'],
  [104, 'm', '一道堤與堤下的水路，堤上有橋'],
  [26,  'm', '一株斜出的松長在坡上，坡下就是海'],
  [50,  'm', '林間的一片池與環池的樹'],
  [5,   'm', '橋、柳與河岸的茶屋，對岸是町屋'],
  [90,  'm', '一整條芝居町：街屋、櫓與看板'],
  [40,  'm', '一條上水橫過畫面，右側是坡與坡上的庵'],
  [16,  'm', '坡上的花屋敷，庭與樓閣'],
  [76,  'm', '河岸邊立起的竹束，後面看得到富士'],
  [72,  'm', '河口的社叢與海濱鳥居，渡船往來'],
  // ── 難：在江戶的邊上，甚至在江戶之外 ───────────────────────
  [87,  'h', '★它根本不在江戶，在三鷹。答錯不要緊——重點是揭曉時你會發現這套百景的範圍比想像大'],
  [20,  'h', '一條大河與對岸的寺。那條河是江戶的北界'],
  [94,  'h', '丘上的寺與丘下的平野。這裡已經過了江戶川，在下總'],
  [27,  'h', '一片梅園，四周是田。位置比品川還南'],
  [110, 'h', '一片池與池畔的松。在西南的丘地裡'],
];

const TIERS = [['e', 2], ['m', 4], ['h', 2]];   // 一局的組成，由易到難

/** 每層洗牌後取 n 題，串成一局。同一個池子每局抽到的不一樣。 */
function draw(views) {
  const out = [];
  for (const [tier, n] of TIERS) {
    const bag = POOL.filter(([id, t]) => t === tier && views.some(v => v.id === id
      && (v.assets.meishozue || v.assets.miyage)));
    for (let i = bag.length - 1; i > 0; i--) {          // Fisher–Yates
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    out.push(...bag.slice(0, n));
  }
  return out;
}

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

export function showHunt(views, map, { found = {}, onFind, onDone } = {}) {
  const rounds = draw(views).map(([id, , why]) => ({ v: views.find(x => x.id === id), why }))
    // 兩種對照都能出題。優先圖會——它是寫實鳥瞰，最適合「讀地形」；
    // 沒有圖會就用土產，那是廣重自己的繪本版，同樣讀得出地物。
    .map(r => r.v?.assets.meishozue ? { ...r, src: meishozue, from: '江戶名所圖會' }
            : r.v?.assets.miyage ? { ...r, src: miyage, from: '繪本江戶土產' } : null)
    .filter(Boolean);
  if (!rounds.length) return onDone?.();
  let i = 0, guess = null;
  const results = [];

  const el = document.createElement('div');
  el.id = 'hunt-ui';
  // 🔴 離開鈕以前寫在各畫面的 innerHTML 裡，而揭曉那頁忘了寫——
  // 答完第一題就出不去，只能一路按到結果。每個畫面各自負責同一顆鈕，
  // 就一定會有一頁漏掉。改成掛在會被重寫的區塊外面，三個畫面共用一顆。
  el.innerHTML = '<button id="hquit" class="ghost">やめる</button><div id="hbody"></div>';
  const body = el.querySelector('#hbody');
  el.querySelector('#hquit').onclick = quit;
  const esc = e => { if (e.key === 'Escape') quit(); };
  addEventListener('keydown', esc);
  document.body.append(el);
  map.hunt.on((lng, lat) => {                  // 點地圖＝下針
    // 🔴 揭曉頁沒有 #hgo。答案都公布了還在收針，直接對 null 設 disabled——
    // 而 main.js 的全域 error handler 會把它變成整片紅色的致命錯誤框。
    // 地圖在揭曉時照樣點得到（要看答案在哪），所以這條路一定會有人走到。
    const go = el.querySelector('#hgo');
    if (!go) return;
    guess = { lng, lat };
    map.hunt.pin(lng, lat);
    go.disabled = false;
    el.querySelector('.q').textContent = '再點可以改；決定了就按下面';
  });

  function ask() {
    const { v } = rounds[i];
    guess = null;
    map.hunt.clear();
    // masked：遮住頂部那一帶（題簽與和歌都在那裡）
    body.innerHTML = `
      <div class="qimg masked"><img src="${rounds[i].src(v.id)}" alt=""></div>
      <div class="body">
        <p class="n">${i + 1} / ${rounds.length}　${rounds[i].from}</p>
        <p class="q">這是江戶的哪裡？在地圖上點一下</p>
        <div class="act"><button id="hgo" disabled>ここだ</button></div>
      </div>`;
    el.querySelector('#hgo').onclick = answer;
  }

  function answer() {
    const { v, why } = rounds[i];
    const d = km(guess, v.subject);
    const [, word, pts] = band(d);
    results.push({ v, d, pts });
    map.hunt.reveal(v.subject.lng, v.subject.lat);
    // 揭曉：換成廣重畫的同一個地方。你剛剛讀的是寫實版，落差在這一刻才看得到。
    const lies = v.distortions?.length;
    body.innerHTML = `
      <div class="qimg plate"><img src="${plate(v.id)}" alt=""></div>
      <div class="body">
        <p class="verdict ${pts >= 4 ? 'good' : pts <= 2 ? 'bad' : ''}">${word}
          <span>差 ${dist(d)}</span></p>
        <h3>${v.title.ja}</h3>
        ${lies ? '<p class="hunt">同一個地方，廣重動了手腳。點畫面找找看。</p>' : ''}
        <div id="tally"></div>
        <p class="why">${why}</p>
        <div class="act">
          <button id="hnext">${i + 1 < rounds.length ? '次へ' : '結果'}</button>
        </div>
      </div>`;
    // 不直接把答案印出來——印了，玩家之後在 §2.4 打開同一景就沒得找。
    // 找到的算同一筆，跟看畫那邊共用存檔。
    if (lies) {
      const tally = body.querySelector('#tally');
      findLies(body.querySelector('img'), v, found[v.id] ?? [], {
        onFind: n => onFind?.(v.id, n),
        prompt: body.querySelector('.hunt'),
        onShow(x) { tally.innerHTML = `<b>${x.target}</b>${x.note}`; tally.classList.add('on'); },
      });
    }
    el.querySelector('#hnext').onclick = () => { i++; i < rounds.length ? ask() : summary(); };
  }

  function summary() {
    const total = results.reduce((a, r) => a + r.pts, 0);
    const best = results.reduce((a, r) => (r.d < a.d ? r : a));
    map.hunt.clear();
    el.querySelector('#hquit').textContent = '閉じる';   // 走到底了，這顆不再是「放棄」
    body.innerHTML = `
      <div class="body">
        <h3>視点狩り</h3>
        <p class="verdict">${total} / ${results.length * 5}</p>
        <ul class="list">${results.map(r =>
          `<li><span>${r.v.title.ja}</span><b>${dist(r.d)}</b></li>`).join('')}</ul>
        <p class="why">最も近かったのは「${best.v.title.ja}」（${dist(best.d)}）。</p>
      </div>`;
  }

  function quit() { map.hunt.off(); removeEventListener('keydown', esc); el.remove(); onDone?.(); }
  ask();
}
