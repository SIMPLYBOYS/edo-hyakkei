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

export function introInit({ image, target, button }) {
  const el = document.createElement('div');
  el.id = 'intro';
  el.innerHTML = `
    <img id="intro-img" src="${image}" alt="">
    <div id="intro-veil"></div>
    <div id="intro-title"><h1>名所江戶百景</h1><div>漫遊記</div></div>
    <div id="intro-scroll"></div>
    <div id="intro-ctl">
      <button id="intro-replay" class="ghost">重播</button>
      <button id="intro-skip" class="ghost">跳過</button>
    </div>`;
  document.body.append(el);
  const img = el.querySelector('#intro-img');
  const sc = el.querySelector('#intro-scroll');

  // 兩個取景：wide＝整張入鏡；near＝cover-fit 到日本橋周圍那一塊
  const fit = mode => {
    const vw = innerWidth, vh = innerHeight, nw = img.naturalWidth, nh = img.naturalHeight;
    if (!nw) return null;
    if (mode === 'wide') {
      const s = Math.min(vw / nw, vh / nh) * 0.98;
      return { s, tx: (vw - nw * s) / 2, ty: (vh - nh * s) / 2 };
    }
    const R = { x: target.x - 0.11, y: target.y - 0.11, w: 0.22, h: 0.22 };
    const rw = R.w * nw, rh = R.h * nh, s = Math.max(vw / rw, vh / rh);
    return { s, tx: -R.x * nw * s + (vw - rw * s) / 2, ty: -R.y * nh * s + (vh - rh * s) / 2 };
  };
  const apply = t => { if (t) img.style.transform = `translate(${t.tx}px,${t.ty}px) scale(${t.s})`; };

  function end() {
    clear();
    el.style.transition = 'opacity .8s'; el.style.opacity = '0';
    timers.push(setTimeout(() => {
      el.classList.remove('on'); el.style.opacity = ''; el.style.transition = '';
    }, 800));
    try { localStorage.setItem(KEY, '1'); } catch {}
  }

  function play() {
    clear();
    el.style.transition = ''; el.style.opacity = ''; el.classList.add('on');
    const run = () => {
      sc.innerHTML = TEXT;
      el.querySelector('#intro-title').classList.remove('show');
      el.querySelector('#intro-veil').classList.remove('show');
      img.style.transition = 'none'; apply(fit('wide'));
      sc.style.transition = 'none'; sc.style.transform = 'translateX(-50%) translateY(100vh)';
      void img.offsetWidth;                                       // reflow，讓 none 生效
      el.querySelector('#intro-title').classList.add('show');
      img.style.transition = `transform ${ZOOM_SECS}s cubic-bezier(.45,0,.15,1)`;
      apply(fit('near'));
      const tTitle = ZOOM_SECS * 550, tCredits = ZOOM_SECS * 640;
      timers.push(setTimeout(() => {
        el.querySelector('#intro-title').classList.remove('show');
        el.querySelector('#intro-veil').classList.add('show');
      }, tTitle));
      timers.push(setTimeout(() => {
        sc.style.transition = `transform ${SCROLL_SECS}s linear`;
        sc.style.transform = `translateX(-50%) translateY(-${sc.offsetHeight}px)`;
      }, tCredits));
      timers.push(setTimeout(end, tCredits + SCROLL_SECS * 1000 + 800));
    };
    // 圖沒載到（素材沒抓、或 404）就直接收場，不然會卡在一片黑只剩兩顆鈕
    img.onerror = end;
    if (img.complete && img.naturalWidth) run(); else img.onload = run;
  }

  el.querySelector('#intro-skip').onclick = end;
  el.querySelector('#intro-replay').onclick = play;
  if (button) button.onclick = play;
  addEventListener('resize', () => { if (el.classList.contains('on')) apply(fit('near')); });

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
