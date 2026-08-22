// 開場。起程門（一次點擊，順便解鎖配樂）→ 蕙斎的江戶鳥瞰從全城慢推到日本橋
// → 標題 → 字幕捲過 → 淡出，底下正好是地圖的起點。
//
// 結構照 tokaido 的開場（全圖推近 12 秒、字幕 30 秒、計時器而非 transitionend
// 收尾以免重播殘留）。換掉的是圖與字：
//
//   圖   鍬形蕙斎《江戸名所之繪》（1803）——從本所上空向西鳥瞰，富士在天邊。
//        蕙斎畫的是「一目」，廣重畫的是「百景」；開場從一目推進到一景，
//        就是整部作品的結構。為什麼不是別張見 tools/fetch-intro.py。
//   字   只寫查得到的事：年代、刊行、地震、梵谷的臨摹。廣重的死因不寫
//        （§2.4 的 _rule：要引學說才能主張的，一律不寫）。
//
// 推鏡終點是日本橋，不是江戶城。城是畫面的視覺中心，但遊戲從日本橋開始，
// 而且淡出之後底下地圖上的紅點就在那裡——鏡頭要落在同一個地方。
import { kanjiDays } from './calendar.js';

const KEY = 'edo-hyakkei/intro';
const ZOOM_SECS = 12;
const SCROLL_SECS = 34;

const TEXT = `
  <h2>名所江戶百景</h2>
  <div class="sub">HIROSHIGE ・ ONE HUNDRED FAMOUS VIEWS OF EDO</div>
  <h2>歌川廣重</h2>
  <div class="sub">UTAGAWA HIROSHIGE ・ 1797–1858</div>
  <p>生於江戶，定火消同心之家。<br>以風景畫成名，<br>筆下的雨、雪、月與黃昏，<br>後來渡海，<br>被梵谷一筆一筆臨摹。</p>
  <div class="sep">✦</div>
  <p><b>安政二年十月</b>，大地震。<br>翌年，廣重開始刊行這套百景。</p>
  <p>安政三年到五年，<br>一百一十八枚，<br>按春夏秋冬編成一部歲時記——<br>同一座城，一百一十八次凝視。</p>
  <p>安政五年秋，廣重歿。<br>這套百景，在那個秋天才出完。</p>
  <div class="sep">✦</div>
  <p><b>腳下這張大圖</b><br>是鍬形蕙斎的《江戸名所之繪》（1803）——<br>從本所上空向西望，<br>隅田川在眼前，富士在天邊。</p>
  <p>他畫的是一目，<br>廣重畫的是百景。</p>
  <div class="sep">✦</div>
  <p><b>玩法</b><br>你在安政四年春天走進江戶。<br>廣重的畫一枚枚出版，<br>地圖上的景也一枚枚長出來。</p>
  <p>同一個地方，不同季節是不同的景。<br>入一景，耗${kanjiDays(8)}日。<br>收齊一百一十八景。</p>
  <p>每一景都附《江戶名所圖會》或《繪本江戶土產》——<br>同一個地方，別人怎麼畫、他自己另一次怎麼畫。<br>對著看，找廣重動的手腳。</p>
  <p class="sub" style="line-height:1.9">畫作：Brooklyn Museum・國立國會圖書館（public domain）<br>鳥瞰：Wikimedia Commons（鍬形蕙斎・1803）<br>街圖：OpenStreetMap　地形：国土地理院</p>
  <div class="sep">✦</div>
  <p style="color:var(--gold)">安政四年、春。<br>日本橋から。</p>`;

let timers = [];
const clear = () => { timers.forEach(clearTimeout); timers = []; };

export function introInit({ image, target, art, button }) {
  const el = document.createElement('div');
  el.id = 'intro';
  el.innerHTML = `
    <canvas id="intro-canvas"></canvas>
    <div id="intro-veil"></div>
    <div id="intro-title"><h1>名所江戶百景</h1><div>漫遊記</div></div>
    <div id="intro-scroll"></div>
    <div id="intro-ctl">
      <button id="intro-replay" class="ghost">重播</button>
      <button id="intro-skip" class="ghost">跳過</button>
    </div>`;
  document.body.append(el);
  const cv = el.querySelector('#intro-canvas');
  const ctx = cv.getContext('2d');
  const sc = el.querySelector('#intro-scroll');

  // 🔴 推鏡不再是 CSS transform 一張 <img>，改成每幀往 canvas 畫視窗大小的一塊。
  //
  // 為什麼換掉：手機上 zoom in 會**一塊一塊**渲染。原本是把 4583×3545 的 <img>
  // 用 transform 放大，終點時那個合成圖層有 4.5 個視窗寬（手機上換算成裝置像素
  // 超過 60MP）——瀏覽器不可能一次光柵化，只能邊放大邊補磚，補一塊就看到一塊。
  // 先試過 decode()（Chrome 上量不出差別）、也看過 will-change，都不是這件事的因。
  //
  // canvas 沒有這個問題：畫布永遠只有視窗那麼大，每幀 drawImage 一塊原圖上去，
  // 沒有超大圖層可以分塊。終點取樣的是原圖同一批像素，**畫質跟原本一模一樣**。
  //
  // 前提是取景改成 cover（見 fit）：contain 的起點只有 0.083 倍，整段要跨 13 倍
  // 縮放，每幀都在大幅縮小取樣；cover 之後最大縮小倍率不到 2 倍，一次 drawImage
  // 就是一次普通的全螢幕貼圖。
  const src = new Image();
  src.src = image;
  // decode() 而不是 onload。Chrome 上兩者量起來一樣（img.onload 本來就等到解碼完，
  // 8× 節流下三次對三次完全重疊）；Safari 的 load 早於解碼，那裡才有差。
  const ready = src.decode().then(() => true, () => false);

  // 畫布配合視窗與螢幕密度。dpr 封頂 3：再高原圖也供不出那麼多像素。
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 3);
    cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
  };
  resize();

  // 🔴 取景只在**畫心**裡，不是整個檔案。掃描件四周還留著裝裱布與黑框線
  // （上 63px、左 96px……），直式手機用 cover 是高度貼齊，那兩條就會出現在
  // 畫面上下緣——正是「一開始看到原圖的邊角」。畫心的座標量在 data/intro.json，
  // 由 tools/fetch-intro.py 掃框線掃出來。沒有這筆就退回整張，開場照跑。
  const A = art && art.length === 4
    ? { x: art[0], y: art[1], w: art[2], h: art[3] } : null;
  const area = () => A || { x: 0, y: 0, w: src.naturalWidth, h: src.naturalHeight };

  // 兩個取景。回傳的是「螢幕座標 = 畫心座標 × s + t」，跟原本用 transform 時同一組參數。
  // wide 從 contain（Math.min × 0.98）改成 cover（Math.max）：contain 會在四周留白，
  // 那不是要的畫面，而且起點只有 0.083 倍——整段要跨 13 倍縮放，才需要分塊。
  const fit = mode => {
    const vw = innerWidth, vh = innerHeight;
    if (!src.naturalWidth) return null;
    const { w: nw, h: nh } = area();
    if (mode === 'wide') {
      const s = Math.max(vw / nw, vh / nh);
      return { s, tx: (vw - nw * s) / 2, ty: (vh - nh * s) / 2 };
    }
    // target 是「整張檔案」的比例（資料先有、畫心後加），換算到畫心的比例
    const a = area(), tx0 = (target.x * src.naturalWidth - a.x) / a.w,
                      ty0 = (target.y * src.naturalHeight - a.y) / a.h;
    const R = { x: tx0 - 0.11, y: ty0 - 0.11, w: 0.22, h: 0.22 };
    const rw = R.w * nw, rh = R.h * nh, s = Math.max(vw / rw, vh / rh);
    return { s, tx: -R.x * nw * s + (vw - rw * s) / 2, ty: -R.y * nh * s + (vh - rh * s) / 2 };
  };

  // 把 (s, tx, ty) 換回原圖上的一塊，畫滿畫布。夾在畫心內，裝裱就永遠不會入鏡。
  const apply = t => {
    if (!t || !src.naturalWidth) return;
    const a = area();
    const sw = Math.min(innerWidth / t.s, a.w), sh = Math.min(innerHeight / t.s, a.h);
    const sx = a.x + Math.max(0, Math.min(-t.tx / t.s, a.w - sw));
    const sy = a.y + Math.max(0, Math.min(-t.ty / t.s, a.h - sh));
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
  };

  // CSS 的 cubic-bezier(.45,0,.15,1)。canvas 這邊沒有 transition 可用，自己解：
  // 二分法從 x 找回參數 u，再取 y。24 次的誤差在一格畫面之下。
  const ease = (() => {
    const at = (a, b, u) => 3 * (1 - u) ** 2 * u * a + 3 * (1 - u) * u * u * b + u ** 3;
    return x => {
      let lo = 0, hi = 1;
      for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; at(.45, .15, m) < x ? lo = m : hi = m; }
      return at(0, 1, (lo + hi) / 2);
    };
  })();

  let raf = 0;
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  // 每幀重算取景，所以轉螢幕、手機網址列伸縮都自然跟上，不必特別處理。
  const zoomTo = () => {
    const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
    const t0 = performance.now();
    const step = now => {
      const a = fit('wide'), b = fit('near');
      const u = reduce ? 1 : Math.min(1, (now - t0) / (ZOOM_SECS * 1000));
      const e = ease(u);
      apply({ s: a.s + (b.s - a.s) * e, tx: a.tx + (b.tx - a.tx) * e, ty: a.ty + (b.ty - a.ty) * e });
      raf = u < 1 ? requestAnimationFrame(step) : 0;
    };
    stop(); raf = requestAnimationFrame(step);
  };

  function end() {
    clear(); stop();
    el.style.transition = 'opacity .8s'; el.style.opacity = '0';
    timers.push(setTimeout(() => {
      el.classList.remove('on'); el.style.opacity = ''; el.style.transition = '';
    }, 800));
    try { localStorage.setItem(KEY, '1'); } catch {}
  }

  function play() {
    clear();
    el.style.transition = ''; el.style.opacity = ''; el.classList.add('on');
    const title = el.querySelector('#intro-title');
    const run = () => {
      sc.innerHTML = TEXT;
      el.querySelector('#intro-veil').classList.remove('show');
      apply(fit('wide'));
      sc.style.transition = 'none'; sc.style.transform = 'translateX(-50%) translateY(100vh)';
      void sc.offsetWidth;                                        // reflow，讓 none 生效
      title.classList.add('show');
      zoomTo();
      const tTitle = ZOOM_SECS * 550, tCredits = ZOOM_SECS * 640;
      timers.push(setTimeout(() => {
        title.classList.remove('show');
        el.querySelector('#intro-veil').classList.add('show');
      }, tTitle));
      timers.push(setTimeout(() => {
        sc.style.transition = `transform ${SCROLL_SECS}s linear`;
        sc.style.transform = `translateX(-50%) translateY(-${sc.offsetHeight}px)`;
      }, tCredits));
      timers.push(setTimeout(end, tCredits + SCROLL_SECS * 1000 + 800));
    };
    // 解碼還沒好就先把題名亮起來——黑底加標題本來就是開場的第一格，
    // 這樣「等」看起來是設計，不是當掉。（重播時要先復位再亮。）
    title.classList.remove('show'); void title.offsetWidth; title.classList.add('show');
    // 圖沒載到（素材沒抓、或 404）就直接收場，不然會卡在一片黑只剩兩顆鈕
    ready.then(ok => (ok ? run : end)());
  }

  el.querySelector('#intro-skip').onclick = end;
  el.querySelector('#intro-replay').onclick = play;
  if (button) button.onclick = play;
  addEventListener('resize', () => {
    if (!el.classList.contains('on')) return;
    resize();                                   // 畫布跟著視窗；取景在 step 裡每幀重算
    if (!raf) apply(fit('near'));               // 推鏡已結束就重畫終點那一格
  });

  // 第一次來：起程門。點擊本身就是瀏覽器要的使用者手勢，配樂也靠它啟動
  // （bgm.js 聽的是 window 的 click，這一下會冒泡到那裡）。
  let seen = false;
  try { seen = !!localStorage.getItem(KEY); } catch {}
  if (seen) return;
  const gate = document.createElement('div');
  gate.id = 'gate';
  gate.innerHTML = `<div><h1>名所江戶百景</h1><div class="g-sub">漫遊記 ・ 安政四年、江戶</div>
    <div class="g-go">— 點擊啟程 —</div></div>`;
  document.body.append(gate);
  gate.addEventListener('click', () => {
    gate.style.opacity = '0';
    setTimeout(() => gate.remove(), 600);
    play();
  }, { once: true });
}
