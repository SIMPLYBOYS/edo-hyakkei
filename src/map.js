// 地圖：一套真實座標，江戶／現代兩層皮（spec §3.1），SVG + viewBox 平移縮放。
// 不用 Leaflet 的理由見 §4.3；不用 canvas 是因為 viewBox 本身就是免費的 pan/zoom。
//
// ponytail: 海岸線是讀圖手描的近似值，足夠驗證視覺效果（§3.2 已驗證成立）。
// 正式版換國土地理院向量 + 明治迅速測圖／江戶切繪圖 georeference。

const EDO = [ // 1858 安政五年 汀線
  [139.745, 35.520], [139.740, 35.545], [139.735, 35.570], [139.738, 35.595], [139.740, 35.620],
  [139.744, 35.638], [139.755, 35.650], [139.766, 35.657], [139.775, 35.663], [139.786, 35.668],
  [139.797, 35.668], [139.803, 35.665], [139.820, 35.663], [139.835, 35.662], [139.850, 35.657],
  [139.865, 35.648], [139.885, 35.655], [139.885, 35.700],
];
const MODERN = [
  [139.745, 35.520], [139.775, 35.522], [139.790, 35.535], [139.828, 35.547], [139.818, 35.567],
  [139.800, 35.583], [139.790, 35.598], [139.788, 35.612], [139.795, 35.622], [139.810, 35.630],
  [139.828, 35.632], [139.860, 35.638], [139.885, 35.625], [139.885, 35.700],
];
// 手描的四條河已刪：OSM 有真的隅田川(17段)／中川／多摩川／江戸川／荒川，
// 而且畫得比手描準。留著只會在海面上多兩條戳出去的線。
const DAIBA = [[139.7745, 35.6295], [139.7695, 35.6325]]; // 品川台場（1854 築）

// 畫框要涵蓋所有景（王子、千住在北邊 35.75 上下），比 §3.2 原型放大
const B = { w: 139.66, e: 139.92, s: 35.50, n: 35.82 };
// 收邊點要遠遠落在任何縮放看得到的範圍外，否則縮到底時陸地多邊形的邊界會露出來，
// 內陸看起來變成海。南邊那段沿 lng 139.745 往下走再往西——那條線以西是川崎橫濱，
// 確實是陸地，所以這樣收邊不會把海畫成陸。
const CLOSE = [[140.25, 35.70], [140.25, 36.15], [139.25, 36.15], [139.25, 35.10], [139.745, 35.10]];

const K = Math.cos((B.s + B.n) / 2 * Math.PI / 180);
const W = 1000;
const H = Math.round(W * (B.n - B.s) / ((B.e - B.w) * K));

export const project = (lng, lat) => [
  (lng - B.w) / (B.e - B.w) * W,
  (B.n - lat) / (B.n - B.s) * H,
];
const d = pts => pts.map(p => project(p[0], p[1]))
  .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');

// 每層合成一個 path（多段 subpath）。OSM 那批有 5,800 條線，
// 一條一個 <path> 會讓瀏覽器吃掉五千多個節點，pan/zoom 立刻卡。
const multi = ways => ways.map(w => d(w)).join('');

export function createMap(svg, views, geo, onPick) {
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  // slice 不是 meet：畫框是直幅、視窗多半是橫的，用 meet 會留兩條黑邊。
  // 反正有 pan/zoom，讓它填滿、看不到的用拖的。
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  const edoLand = `${d([...EDO, ...CLOSE])}Z`;
  svg.innerHTML = `
    <defs>
      <!-- OSM 圖層一律裁在江戶陸地內。不裁的話推到 1858 時，
           填海區的碼頭與運河會浮在海面上——那些地方當年還是海。
           代價是現代圖層的港區沒有細節，但這是講江戶的地圖，不缺那塊。 -->
      <clipPath id="land"><path d="${edoLand}"/></clipPath>
    </defs>
    <path d="${edoLand}" fill="var(--land)"/>
    <path id="reclaimed" d="${d([...MODERN, ...EDO.slice().reverse()])}Z"
          fill="var(--land)" stroke="var(--land)" stroke-width="1.5"/>
    <g clip-path="url(#land)">
    <path id="park" d="${multi(geo.park)}Z" fill="#b9c4a6" opacity=".5"/>
    <!-- 堀與川是江戶就有的（半蔵濠、千鳥ヶ淵、日本橋川…），兩個年代都畫 -->
    <path id="warea" d="${multi(geo.water_area)}Z" fill="var(--river)" opacity=".55"/>
    <path id="wline" d="${multi(geo.water_line)}" fill="none" stroke="var(--river)"
          stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity=".8"/>
    <!-- 鐵路與幹道才是現代的，滑到 1858 要消失 -->
    <g id="modern">
      <path d="${multi(geo.road)}" fill="none" stroke="#a89880" stroke-width="1.1" opacity=".6"/>
      <path d="${multi(geo.rail)}" fill="none" stroke="#8a7f72" stroke-width="1"
            stroke-dasharray="5 3" opacity=".7"/>
    </g>
    </g>
    <g id="daiba" fill="var(--land)" stroke="#b8ad93">${DAIBA.map(p => {
      const [x, y] = project(p[0], p[1]);
      return `<rect x="${x - 5}" y="${y - 5}" width="10" height="10" transform="rotate(20 ${x} ${y})"/>`;
    }).join('')}</g>
    <g id="marks"></g>
    <circle id="player" r="7" fill="#c0392b" stroke="#fff" stroke-width="2.5"/>`;

  const marks = svg.querySelector('#marks');
  const nodes = new Map();
  let dragged = () => false;                   // 下面 pan/zoom 那段會覆寫
  for (const v of views) {
    if (!v.subject) continue;                  // 沒座標的景暫時上不了圖
    const [x, y] = project(v.subject.lng, v.subject.lat);
    const g = document.createElementNS(svg.namespaceURI, 'g');
    g.setAttribute('class', 'mark');
    // 有《名所圖會》對照的景加一圈，玩家才知道哪個能切換對照。
    // 有方位角的畫一道視線扇形——那是 §7-15 從畫中地標推出來的廣重視線方向，
    // 不確定度約 ±30°，所以畫成扇形不是箭頭：形狀本身就在說「大概往這邊」。
    const cone = v.bearing == null ? '' : (() => {
      const r = 26, half = 30 * Math.PI / 180, a = (v.bearing - 90) * Math.PI / 180;
      const p = (t) => `${(x + r * Math.cos(t)).toFixed(1)} ${(y + r * Math.sin(t)).toFixed(1)}`;
      return `<path class="cone" d="M${x} ${y} L${p(a - half)} A${r} ${r} 0 0 1 ${p(a + half)} Z"/>`;
    })();
    g.innerHTML = `${cone}${v.assets.meishozue ? `<circle class="ring" cx="${x}" cy="${y}" r="11"/>` : ''}
      <circle cx="${x}" cy="${y}" r="6"/>
      <text x="${x + 10}" y="${y + 5}">${v.title.ja ?? v.id}</text>`;
    g.onclick = e => { e.stopPropagation(); if (!dragged()) onPick(v); };
    marks.append(g);
    nodes.set(v.id, g);
  }

  // 平移縮放：直接改 viewBox，不需要任何函式庫
  let vb = { x: 0, y: 0, w: W, h: H };
  let onChange = () => {};
  const apply = () => { svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); onChange(); };
  const toSvg = e => {
    const r = svg.getBoundingClientRect();
    const s = Math.max(r.width / vb.w, r.height / vb.h);   // 對應 slice
    return [vb.x + (e.clientX - r.left - (r.width - vb.w * s) / 2) / s,
            vb.y + (e.clientY - r.top - (r.height - vb.h * s) / 2) / s];
  };
  // 舊版把縮小上限鎖在初始 viewBox（Math.min(W,…)），加上 slice 會裁滿畫面，
  // 結果是**永遠看不到整張圖**——王子與羽田無法同時入鏡。那就是「格局很僵」的成因。
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // slice 會裁滿畫面，所以「看得到全圖」需要的 viewBox 比內容本身還寬——
  // 寬到讓 viewBox 的長寬比追上視窗的長寬比為止。橫向視窗算出來通常是內容的兩倍以上。
  function fitWidth() {
    const r = svg.getBoundingClientRect();
    return W * Math.max(1, (r.width / r.height) / (W / H));
  }
  // 縮小的極限就是「剛好看得到全圖」，不再往外——再縮只是看更多空白，沒有意義
  const MIN = W / 16;
  let MAX = fitWidth();

  function fitAll() {
    const nw = fitWidth();
    vb = { x: (W - nw) / 2, y: (H - (H / W) * nw) / 2, w: nw, h: (H / W) * nw };
    svg.classList.remove('zoomed');
    apply();
  }

  function zoomTo(nw, cx, cy) {
    nw = clamp(nw, MIN, MAX);
    const f = nw / vb.w;
    vb = { x: cx - (cx - vb.x) * f, y: cy - (cy - vb.y) * f, w: nw, h: (H / W) * nw };
    // 別讓地圖被拖到畫面外完全不見：中心點限制在內容範圍加半個畫面的餘裕
    vb.x = clamp(vb.x, -vb.w * 0.6, W - vb.w * 0.4);
    vb.y = clamp(vb.y, -vb.h * 0.6, H - vb.h * 0.4);
    svg.classList.toggle('zoomed', nw < W * 0.45);  // 拉近才顯示地名，否則市中心疊成一團
    apply();
  }

  svg.onwheel = e => {
    e.preventDefault();
    // 依滾動量連續縮放，不是每格固定倍率——觸控板一次會送出很多小事件，
    // 固定倍率會跳得很兇。ctrlKey 是 Mac 觸控板雙指捏合，幅度要放大。
    const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    const k = Math.exp(clamp(px, -80, 80) * (e.ctrlKey ? 0.012 : 0.0022));
    const [cx, cy] = toSvg(e);
    zoomTo(vb.w * k, cx, cy);
  };
  svg.ondblclick = e => { const [cx, cy] = toSvg(e); zoomTo(vb.w / 2, cx, cy); };
  addEventListener('resize', () => { MAX = fitWidth(); });
  addEventListener('keydown', e => {
    if (document.querySelector('.overlay')) return;      // 看畫時不要動地圖
    const c = { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 };
    if (e.key === '=' || e.key === '+') zoomTo(vb.w / 1.5, c.x, c.y);
    if (e.key === '-' || e.key === '_') zoomTo(vb.w * 1.5, c.x, c.y);
    if (e.key === '0') fitAll();                         // 迷路了按 0 回到全圖
  });
  // 不要用 setPointerCapture：capture 之後 pointerup 落在 svg 上，
  // click 就改派到 svg 而不是景點那個 <g>，onclick 永遠不會觸發。
  // svg 本來就滿版，不 capture 也不會跟丟。
  let drag = null, moved = 0;
  svg.onpointerdown = e => {
    const [x, y] = toSvg(e);
    drag = { x, y }; moved = 0;
  };
  addEventListener('pointerup', () => { drag = null; });
  svg.onpointermove = e => {
    if (!drag) return;
    const [x, y] = toSvg(e);
    moved += Math.abs(x - drag.x) + Math.abs(y - drag.y);
    // 拖曳同樣要夾住，否則可以把地圖整個拖出畫面外
    vb.x = clamp(vb.x - (x - drag.x), -vb.w * 0.6, W - vb.w * 0.4);
    vb.y = clamp(vb.y - (y - drag.y), -vb.h * 0.6, H - vb.h * 0.4);
    apply();
  };
  // 拖曳結束時滑鼠常常正好停在某個景上，不擋掉的話一拖就誤入該景
  dragged = () => moved > 6;

  fitAll();   // 開場就看得到整張圖，不是一上來就被裁掉一半

  const centre = () => [vb.x + vb.w / 2, vb.y + vb.h / 2];

  return {
    zoomIn: () => zoomTo(vb.w / 1.6, ...centre()),
    zoomOut: () => zoomTo(vb.w * 1.6, ...centre()),
    fitAll,
    // 縮放按鈕要能反映「還能不能再縮」，否則按下去沒反應會像壞掉
    atMax: () => vb.w >= MAX - 1,
    atMin: () => vb.w <= MIN + 1,
    // 註冊當下就先跑一次：初始的 fitAll() 發生在 createMap 內部、
    // 外部還來不及註冊，不補這一下開場按鈕狀態會是錯的
    onChange: cb => { onChange = cb; cb(); },
    // 只有「地點對 + 季節對」的景才亮起來——同一地點不同季節是不同的景（§2.2）
    render(state, clock) {
      for (const v of views) {
        const g = nodes.get(v.id);
        if (!g) continue;
        const got = state.collected.includes(v.id);
        const open = v.season === clock.season && !got;
        g.classList.toggle('got', got);
        g.classList.toggle('open', open);
        g.classList.toggle('closed', !got && !open);
        // 標記依編號順序畫，後面的一律蓋住前面的——景點在市中心擠成一團時，
        // 不在季的點會把可收的點整個吸走。把可收的提到最上層才點得到。
        if (open) marks.append(g);
      }
      const [px, py] = project(state.pos.lng, state.pos.lat);
      const p = svg.querySelector('#player');
      p.setAttribute('cx', px); p.setAttribute('cy', py);
    },
    setEra(t) {                                 // 0=現代 1=1858，§3.2 那支滑桿
      svg.querySelector('#reclaimed').style.opacity = 1 - t;
      svg.querySelector('#daiba').style.opacity = t;
      svg.querySelector('#modern').style.opacity = 1 - t;   // 鐵路幹道只屬於現代
    },
  };
}
