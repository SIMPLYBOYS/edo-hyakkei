// §2.10 視點狩獵（原型）。給你一張畫，你在地圖上指出它畫的是哪裡。
//
// 為什麼要有這個：現在唯一的動詞是「收集」，而收集不需要技巧——
// 點金點、看畫、按收藏。這個模式把方向反過來（看畫 → 找地方），
// 玩家要讀的是畫裡的橋、堀、水系彎法、富士的方向，對回地圖上的江戶地名（§2.7）。
//
// **廣重會騙你，正是難度的來源。** 他放大富士、清空人群、把池子撐滿畫面——
// §2.4「找廣重的謊言」從註腳變成機制：你不能全信畫面。
//
// 照 §2.4 的老路：先 6 景驗證手感成立，再決定要不要為它投入 viewpoint 考據。
import { plate } from './paths.js';

// 挑選標準：畫面裡真的讀得到線索，而且難度要有梯度。
// 這是人工判斷，理由逐筆寫在後面（與 fetch-plates.py 的 PAIRS 同一個規矩）。
const HUNT = [
  [1,   '日本橋。畫裡有江戶城與富士——方位關係本身就是答案，當開場'],
  [58,  '新大橋橫跨大川。橋的形制與河寬可讀，兩岸町屋密度也給了線索'],
  [111, '目黒太鼓橋。石造拱橋＋丘陵＋單一小河，在西南丘地才有這種組合'],
  [118, '王子装束榎。田野中的獨立大樹與狐火，畫面幾乎沒有建築——難'],
  [107, '深川洲崎十萬坪。雪原、鷲、遠處水平線，判斷全靠「這是填海前的海邊」'],
  [87,  '井の頭池。★最難：它根本不在江戶，在三鷹。答對與否不重要，'
        + '重要的是揭曉時玩家會發現這套百景的範圍比想像大'],
];

const km = (a, b) => {                       // 這個尺度用等距近似就夠，不需要 haversine
  const k = Math.cos((a.lat + b.lat) / 2 * Math.PI / 180);
  return Math.hypot((a.lng - b.lng) * k, a.lat - b.lat) * 111.19;
};

// 帶狀評語。距離門檻是照江戶的尺度訂的：城東西約 30km，
// 3km 大約是「認得出是哪一區」，1km 是「認得出是哪一座橋」。
const BANDS = [
  [0.3, '的中', 5], [1, '見事', 4], [3, '惜しい', 3], [8, '遠い', 2], [Infinity, '大外れ', 1],
];
const band = d => BANDS.find(([lim]) => d <= lim);

export function showHunt(views, map, onDone) {
  const rounds = HUNT.map(([id, why]) => ({ v: views.find(x => x.id === id), why }))
    .filter(r => r.v);
  let i = 0, guess = null;
  const results = [];

  const el = document.createElement('div');
  el.id = 'hunt-ui';
  document.body.append(el);
  map.hunt.on((lng, lat) => {                // 點地圖＝下針
    guess = { lng, lat };
    map.hunt.pin(lng, lat);
    el.querySelector('#hgo').disabled = false;
    el.querySelector('.q').textContent = '再點可以改；決定了就按下面';
  });

  function ask() {
    const { v } = rounds[i];
    guess = null;
    map.hunt.clear();
    // 標題就是答案，所以不能給。季節給——那是畫面本來就看得出來的
    el.innerHTML = `
      <img src="${plate(v.id)}" alt="">
      <div class="body">
        <p class="n">${i + 1} / ${rounds.length}</p>
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
    el.innerHTML = `
      <img src="${plate(v.id)}" alt="">
      <div class="body">
        <p class="n">${i + 1} / ${rounds.length}</p>
        <p class="verdict ${pts >= 4 ? 'good' : pts <= 2 ? 'bad' : ''}">${word}
          <span>差 ${d < 1 ? Math.round(d * 1000) + ' m' : d.toFixed(1) + ' km'}</span></p>
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
    const best = results.reduce((a, r) => r.d < a.d ? r : a);
    map.hunt.clear();
    el.innerHTML = `
      <div class="body wide">
        <h3>視点狩り</h3>
        <p class="verdict">${total} / ${results.length * 5}</p>
        <ul class="list">${results.map(r =>
          `<li><span>${r.v.title.ja}</span><b>${r.d < 1
            ? Math.round(r.d * 1000) + ' m' : r.d.toFixed(1) + ' km'}</b></li>`).join('')}</ul>
        <p class="why">最も近かったのは「${best.v.title.ja}」。</p>
        <div class="act"><button id="hquit">閉じる</button></div>
      </div>`;
    el.querySelector('#hquit').onclick = quit;
  }

  function quit() { map.hunt.off(); el.remove(); onDone?.(); }
  ask();
}
