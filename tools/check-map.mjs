// 地圖取景與介面尺寸的把關——專門盯**直式手機**。
//
// 這支存在的理由是兩個實際出過的錯，兩個都源自同一個誤解：
// preserveAspectRatio 是 slice，縮放倍率取 max(視窗寬/vb.w, 視窗高/vb.h)，
// 「哪一邊綁住」由視窗寬高比決定——桌機是寬邊，直式手機是**高邊**。
//
//   一、cover() 寫成 max(w, h × 視窗寬高比)，只對寬邊綁住成立。
//       手機上開場只框到 254 個地圖單位（該有 468），拖兩下就到邊。
//   二、px 寫成 vb.w / 視窗寬，同樣只對寬邊綁住成立。
//       手機上高估 1.85 倍，地名被畫成 22px 而不是 12px、圓點畫成 26px 而不是 14px。
//   三、resize 只叫了 remax()，沒重跑 relabel()——視窗一變，尺寸還是用**舊的**視窗寬
//       算的，要等玩家拖動地圖才會修正。量過：1200×835 縮到 700×900，地名 12→9.8px。
//       全螢幕是一次大幅 resize，正面撞上這個，所以下面每個尺寸都會再 resize 一次驗。
//
// 順帶驗地形圖的分級載入（relief.jpg 1536 → relief-hi.jpg 3072）：
// 開場不該去載 1.8MB 的大圖，拉近了又非換不可。兩個方向壞掉都不會噴錯——
// 一個只是開場變慢，一個只是地形變成粗顆粒的「概念圖」。
//
// 兩個在桌機上都看不出來（那裡剛好是寬邊綁住，公式碰巧對）。所以這支一定要
// 用直式視窗量，不然它只會一直綠。
//
// 用法： node tools/check-map.mjs        （需要 playwright 的 chromium）

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const { chromium, devices } = createRequire(process.env.HOME + '/')('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// 🔴 一定要 8000。這支會按「看今天」，而那把 Google 金鑰的 referrer 白名單只放行
// http://localhost:8000/*（線上是 simplyboys.github.io）。跑在別的埠，Google 會回
// 403，主控台就多一則錯——那是限制正常運作，不是 bug，但會讓這支一直紅。
// 換句話說：這個埠號是設定的一部分，不是隨便挑的。
const PORT = 8000;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = spawn('python3', [resolve(ROOT, 'tools/serve.py'), String(PORT)],
                     { cwd: ROOT, stdio: 'ignore' });
const bye = code => { server.kill(); process.exit(code); };
process.on('SIGINT', () => bye(1));

const probe = () => {
  const svg = document.querySelector('#map');
  const r = svg.getBoundingClientRect();
  const [vx, vy, vw, vh] = svg.getAttribute('viewBox').split(' ').map(Number);
  const s = Math.max(r.width / vw, r.height / vh);            // slice
  // 看得見的那塊（地圖單位）。slice 會把溢出的部分切掉，並且置中。
  const visW = r.width / s, visH = r.height / s;
  const vis = { x: vx + (vw - visW) / 2, y: vy + (vh - visH) / 2, w: visW, h: visH };

  // 開場取景 fitCity 的承諾：景的 5–95 百分位要全部入鏡
  const pts = [...document.querySelectorAll('#marks > g')]
    .map(g => (g.getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/) || [])
      .slice(1).map(Number)).filter(p => p.length === 2);
  const pct = (a, p) => a.slice().sort((m, n) => m - n)[Math.round(p * (a.length - 1))];
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const city = { x0: pct(xs, .05), x1: pct(xs, .95), y0: pct(ys, .05), y1: pct(ys, .95) };

  // 介面實際畫出來是幾個 CSS 像素。屬性值的單位是**地圖單位**，所以是乘 s 不是除。
  const font = +document.querySelector('#places').getAttribute('font-size');
  const mark = +(document.querySelector('#marks > g').getAttribute('transform')
                 .match(/scale\(([\d.]+)\)/) || [])[1];
  return { vp: [Math.round(r.width), Math.round(r.height)], vis, city,
           fontCss: +(font * s).toFixed(2), dotCss: +(mark * 7 * s).toFixed(2) };
};

try {
  await sleep(900);
  const browser = await chromium.launch();
  const bad = [];
  for (const [name, profile, wantFont, wantDot] of [
    // 直式手機：兩個 bug 都只在這裡現形。ui 係數 0.8 是刻意的（見 map.js 的 relabel）
    ['手機直式', { ...devices['iPhone 13'], isMobile: false, hasTouch: true }, 12 * 0.8, 7 * 0.8],
    ['桌機', { viewport: { width: 1200, height: 835 }, deviceScaleFactor: 2 }, 12, 7],
  ]) {
    const ctx = await browser.newContext(profile);
    await ctx.addInitScript(() => { try { localStorage.clear(); } catch {} });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    const relief = [];
    page.on('response', r => {
      const f = r.url().split('/').pop();
      if (f.startsWith('relief')) relief.push(f);
    });

    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#gate', { timeout: 20000 });
    await page.evaluate(() => document.querySelector('#gate').click());
    await sleep(400);
    await page.evaluate(() => document.querySelector('#intro-skip')?.click());
    await sleep(1200);
    const p = await page.evaluate(probe);

    const { vis, city } = p;
    const fits = city.x0 >= vis.x && city.x1 <= vis.x + vis.w
              && city.y0 >= vis.y && city.y1 <= vis.y + vis.h;
    console.log(`${name} ${p.vp.join('×')}  可見 ${Math.round(vis.w)}×${Math.round(vis.h)} 地圖單位`
              + `  江戶本體入鏡=${fits ? '是' : '否'}  地名 ${p.fontCss}px  圓點半徑 ${p.dotCss}px`);

    if (!fits) bad.push(`${name}：開場沒把江戶本體框進來`
      + `（要 ${Math.round(city.x1 - city.x0)}×${Math.round(city.y1 - city.y0)}，`
      + `只看得到 ${Math.round(vis.w)}×${Math.round(vis.h)}）`);
    if (Math.abs(p.fontCss - wantFont) > 0.6) bad.push(`${name}：地名 ${p.fontCss}px，應為 ${wantFont.toFixed(1)}px`);
    if (Math.abs(p.dotCss - wantDot) > 0.4) bad.push(`${name}：圓點半徑 ${p.dotCss}px，應為 ${wantDot.toFixed(1)}px`);
    // 🔴 開一景。這一段是因為 view.js 有一次 const 遮蔽（把 paths.js 的 plate
    // 遮成 TDZ）——整個看畫畫面開不起來，而當時所有檢查都還是綠的。
    // 這裡只驗最粗的：點得開、圖在、來歷在、主控台沒噴東西。
    await page.evaluate(() => {
      const g = document.querySelector('#marks > g.mark.open');
      const b = g.getBoundingClientRect();
      for (const t of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'])
        g.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerId: 1,
          clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 }));
    });
    await sleep(900);
    const view = await page.evaluate(() => {
      const img = document.querySelector('.overlay .plate img');
      return { 圖: img?.getAttribute('src') ?? null,
               寬: Math.round(img?.getBoundingClientRect().width ?? 0),
               現在地: document.querySelector('.lore .now')?.textContent.trim().slice(0, 20) ?? null,
               鈕: [...document.querySelectorAll('.overlay button')].length };
    });
    console.log(`  └ 看畫：${view.圖} ${view.寬}px　${view.現在地}　${view.鈕} 顆鈕`);
    if (!view.圖 || view.寬 < 50) bad.push(`${name}：看畫畫面沒有畫（${JSON.stringify(view)}）`);
    if (!view.現在地) bad.push(`${name}：看畫畫面沒有來歷（lore 掛了？）`);

    // 🔴 「看今天」翻回去，畫必須真的回得來。
    // 出過的錯：iframe 的 CSS 沒綁 .today，建立之後就永遠蓋在圖上（z-index:2）。
    // 那時 img 的 visibility 確實變回 visible——**量那個會以為是好的**，
    // 但人看到的還是街景。所以這裡問的是「畫框中央那一點上是誰」。
    // 沒填金鑰就沒有這顆鈕，跳過（clone 下來的預設狀態）。
    const mid = () => page.evaluate(() => {
      const p = document.querySelector('.plate'), r = p.getBoundingClientRect();
      const el = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
      return el?.tagName.toLowerCase() ?? '?';
    });
    if (await page.locator('#today').count()) {
      await page.locator('#today').click(); await sleep(1200);
      const on = await mid();
      await page.locator('#today').click(); await sleep(1200);
      const off = await mid();
      console.log(`    看今天：開→框中央 ${on}　關→框中央 ${off}`);
      if (on !== 'iframe') bad.push(`${name}：按了「看今天」，畫框中央卻是 ${on}`);
      if (off !== 'img') bad.push(`${name}：翻回廣重之後，畫框中央還是 ${off}——畫被蓋住回不來`);
    }
    await page.evaluate(() => document.querySelectorAll('.overlay').forEach(e => e.remove()));
    await sleep(200);

    // 地形圖的分級：開場只該有小的，拉到底必須換成大的
    if (relief.includes('relief-hi.jpg'))
      bad.push(`${name}：開場就去載了 relief-hi.jpg（1.8MB）——那是拉近才該載的`);
    if (!relief.includes('relief.jpg')) bad.push(`${name}：開場沒載 relief.jpg`);
    for (let i = 0; i < 20; i++) {
      if (await page.locator('#zin').isDisabled()) break;
      await page.locator('#zin').click();
      await sleep(140);
    }
    await sleep(2500);                       // 等大圖載完並換上
    const used = await page.evaluate(() =>
      document.querySelector('#relief').getAttribute('href').split('/').pop());
    console.log(`  └ 地形圖：開場 ${relief[0]} → 拉到底 ${used}`);
    if (used !== 'relief-hi.jpg')
      bad.push(`${name}：拉到底了還在用 ${used}——地形會是粗顆粒的概念圖`);
    await page.locator('#zfit').click();
    await sleep(400);

    // 換個視窗大小再量一次：尺寸必須立刻跟上，不能等玩家拖地圖。
    // （全螢幕、轉螢幕、手機網址列伸縮走的都是這條路。）
    const vp = page.viewportSize();
    await page.setViewportSize({ width: vp.height, height: vp.width });   // 轉個向
    await sleep(500);
    const q = await page.evaluate(probe);
    const want2 = q.vp[0] < 700 ? [12 * 0.8, 7 * 0.8] : [12, 7];
    console.log(`  └ 轉成 ${q.vp.join('×')} 之後：地名 ${q.fontCss}px  圓點半徑 ${q.dotCss}px`);
    if (Math.abs(q.fontCss - want2[0]) > 0.6)
      bad.push(`${name} resize 後：地名 ${q.fontCss}px，應為 ${want2[0].toFixed(1)}px`
             + '——resize 沒有重跑 relabel()');
    if (Math.abs(q.dotCss - want2[1]) > 0.4)
      bad.push(`${name} resize 後：圓點半徑 ${q.dotCss}px，應為 ${want2[1].toFixed(1)}px`);

    if (errs.length) bad.push(`${name} 主控台有錯：${errs.slice(0, 2).join(' / ')}`);
    await ctx.close();
  }
  await browser.close();

  if (bad.length) { bad.forEach(b => console.error('FAIL:', b)); bye(1); }
  console.log('self-check ok');
  bye(0);
} catch (e) {
  console.error('FAIL:', e.message);
  bye(1);
}
