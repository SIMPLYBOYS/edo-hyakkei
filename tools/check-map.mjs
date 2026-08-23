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
const PORT = 8128;

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
