// 開場取景的把關：**裝裱不准入鏡**。
//
// 這支存在的理由是一個實際出過的錯：assets/intro/keisai-1803.jpg 四周還留著掃描的
// 裝裱布（上 315px、左 100px），而 fetch-intro.py 的註解宣稱已經切到畫心了。
// 桌機用 contain 取景看不出來（四周本來就留白），改成 cover 填滿畫面之後，
// 直式手機是高度貼齊，那兩條藍灰布就壓在畫面上下緣。
//
// 驗法：把開場停在**起點**與**終點**兩格，各取畫布四角，看有沒有裝裱色。
// 紙是暖的（R>B），裱布是藍灰（B>R）。門檻取 +4：畫裡最冷的水面約 −2，裱布約 +24。
//
// 用法： node tools/check-intro.mjs        （需要 playwright 的 chromium）

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const { chromium, devices } = createRequire(process.env.HOME + '/')('playwright');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8126;
const MOUNT_BR = 4;              // B−R 大於這個就當作裱布

const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = spawn('python3', [resolve(ROOT, 'tools/serve.py'), String(PORT)],
                     { cwd: ROOT, stdio: 'ignore' });
const bye = code => { server.kill(); process.exit(code); };
process.on('SIGINT', () => bye(1));

// 畫布四角各取 24×24 的平均色
const corners = () => {
  const cv = document.querySelector('#intro-canvas');
  const g = cv.getContext('2d');
  const n = 24, spots = [[0, 0], [cv.width - n, 0], [0, cv.height - n], [cv.width - n, cv.height - n]];
  return spots.map(([x, y]) => {
    const d = g.getImageData(x, y, n, n).data;
    let R = 0, B = 0;
    for (let i = 0; i < d.length; i += 4) { R += d[i]; B += d[i + 2]; }
    return Math.round((B - R) / (d.length / 4));
  });
};

try {
  await sleep(900);
  const browser = await chromium.launch();
  const bad = [];
  // 直式手機是最嚴苛的情形：cover 之下高度貼齊，上下緣一定會碰到圖的邊界
  for (const [name, profile] of [
    ['手機直式', { ...devices['iPhone 13'], isMobile: false, hasTouch: true }],
    ['桌機', { viewport: { width: 1200, height: 835 }, deviceScaleFactor: 2 }],
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
    await page.waitForFunction(() => document.querySelector('#intro').classList.contains('on'),
                               { timeout: 40000 });
    await sleep(500);
    const start = await page.evaluate(corners);
    await sleep(12500);                                    // 推鏡 12 秒，等它落到終點
    const end = await page.evaluate(corners);

    const show = a => a.map(v => (v > 0 ? '+' : '') + v).join(' ');
    console.log(`${name}  起點四角 B−R ${show(start)}   終點四角 B−R ${show(end)}`);
    for (const [when, v] of [['起點', start], ['終點', end]])
      if (Math.max(...v) > MOUNT_BR) bad.push(`${name}的${when}有裱布入鏡（B−R ${show(v)}）`);
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
