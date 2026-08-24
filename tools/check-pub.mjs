#!/usr/bin/env node
// §2.6 出版閘門的 self-check：  node tools/check-pub.mjs
//
// 這個機制唯一的災難是「鎖死」——開局收不到任何景，或某一景永遠等不到。
// 兩者都不會噴錯，只會讓玩家卡住找不到原因，所以要用資料實際驗過。
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import { pubDay, clockFrom, DAYS_PER_VIEW, SHORTEST_DAYS } from '../src/calendar.js';

const views = JSON.parse(readFileSync(new URL('../data/views.json', import.meta.url), 'utf8'))
  .filter(v => v.id <= 118);

assert.equal(pubDay('1856-02'), 0, '起點該對齊系列第一枚出版');
assert.ok(views.every(v => v.published), '有景沒有出版年月——閘門會把它當第 0 日誤放');
assert.ok(views.every(v => pubDay(v.published) >= 0), '有景的出版日早於遊戲起點');

const day0 = clockFrom(0);
const openNow = views.filter(v => pubDay(v.published) <= 0 && v.season === day0.season);
assert.ok(openNow.length, '開局一景都收不到——遊戲鎖死');

// 每一景都要存在某一天同時滿足「已出版 + 在季」。季節會循環，所以掃六年夠了。
for (const v of views) {
  const p = pubDay(v.published);
  assert.ok([...Array(365 * 6).keys()].some(d => d >= p && clockFrom(d).season === v.season),
    `no.${v.id} ${v.title.ja} 永遠收不到`);
}

// 🔴 這一段是 2026/08/08 補的，因為上面那些檢查全部通過，遊戲卻還是會卡死。
//
// 「每一景都存在某天可收」不等於「玩家走得到那一天」。日期只在收景時前進，
// 所以一旦當季無景可收，時間就停住——實測停在第 712 日、89/118，剩 29 景永遠拿不到。
// 我先前每一支模擬在無景可收時都寫 day++，而那個動作在遊戲裡不存在：
// **模擬的是一個有「等待」的遊戲，而遊戲沒有。**
//
// 所以這裡照遊戲的真實規則跑一遍，兩個方向都驗。
// 2026/08/08：規則改成「按季節鈕＝把時鐘推進到那個季節」（§2.2），
// 舊的「待つ」被吸收掉了，但要驗的東西不變——沒有推進手段就會卡死。
function playthrough({ canJump }) {
  let day = 0, got = new Set(), jumps = 0, jumped = 0;
  const openAt = (d, s) => views.filter(v => !got.has(v.id) && v.season === s
    && pubDay(v.published) <= d);
  for (let guard = 0; guard < 5000; guard++) {
    const open = openAt(day, clockFrom(day).season);
    if (open.length) { got.add(open[0].id); day += DAYS_PER_VIEW; continue; }
    if (!canJump) break;                       // 沒有推進手段 → 卡死
    let best = null;
    for (const s of ['spring', 'summer', 'autumn', 'winter']) {
      for (let d = day + 1; d < day + 800; d++) {
        if (clockFrom(d).season !== s) continue;
        if (openAt(d, s).length) { if (best === null || d < best) best = d; break; }
      }
    }
    if (best === null) break;
    jumps++; jumped += best - day; day = best;
  }
  return { got: got.size, day, jumps, jumped };
}

const stuck = playthrough({ canJump: false });
assert.ok(stuck.got < views.length,
  '沒有季節鈕竟然收得完？那季節鈕就是多餘的，回去確認規則');
const ok = playthrough({ canJump: true });
assert.equal(ok.got, views.length,
  `即使能跳季節也只收到 ${ok.got}/${views.length}——遊戲不可完成`);
console.log(`可完成性：不能跳季節 → 卡在 ${stuck.got}/${views.length}（第 ${stuck.day} 日）；`
  + `能跳 → ${ok.got}/${views.length}，第 ${ok.day} 日、跳 ${ok.jumps} 次共 ${ok.jumped} 日`);

// ── 結局要顯示的「最短可能」──────────────────────────────────
// 遊戲會把 SHORTEST_DAYS 秀給玩家看（「最短是 1151 日，你多等了 N 日」），
// 所以那個數字不能是寫死之後就沒人管的常數。這裡重新算一次並釘住：
//   一、上面那場貪心走法本身就是目前已知的最短
//   二、收景的日子是固定的，其餘全是等季節——這條讓結局的「走 X 日／等 Y 日」成立
//   三、灑一批隨機走法，確認沒有更短的（是搜尋不是證明，所以要真的搜）
assert.equal(ok.day, SHORTEST_DAYS,
  `最短走法變成 ${ok.day} 日，但 calendar.js 的 SHORTEST_DAYS 還寫 ${SHORTEST_DAYS}`);
assert.equal(ok.day - views.length * DAYS_PER_VIEW, ok.jumped,
  '總日數扣掉收景的日子不等於跳季節的日子——結局的「走 X 日／等 Y 日」會對不起來');

// 這一段要跑幾千次，所以先把兩個慢的地方拿掉：
//   clockFrom(d) 每次都往前後掃季節邊界 → 季節查表一次算好
//   openAt() 每次都 filter 全部 118 景 → 只留「該季未收景裡最早的出版日」，
//                                       「第 d 天有沒有景可收」就變成一次比較
// 沒優化的版本 400 次要 34 秒，而且 400 次還搜不到最短的那條路。
const SEASONS4 = ['spring', 'summer', 'autumn', 'winter'];
const HORIZON = 2600;
const seasonAtDay = Array.from({ length: HORIZON }, (_, d) => clockFrom(d).season);

function randomRun(seed0) {
  let day = 0, seed = seed0, left = views.length;
  const rnd = n => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
  // 每一季：未收景的出版日，由早到晚
  const pool = {};
  for (const t of SEASONS4) {
    pool[t] = views.filter(v => v.season === t).map(v => pubDay(v.published)).sort((a, b) => a - b);
  }
  const openCount = (d, t) => { let n = 0; for (const p of pool[t]) { if (p > d) break; n++; } return n; };
  while (left) {
    if (day >= HORIZON) return Infinity;
    const s = seasonAtDay[day], n = openCount(day, s);
    if (n) { pool[s].splice(rnd(n), 1); left--; day += DAYS_PER_VIEW; continue; }
    const cand = [];
    for (const t of SEASONS4) {
      if (!pool[t].length) continue;
      for (let d = day + 1; d < Math.min(day + 900, HORIZON); d++) {
        if (seasonAtDay[d] !== t) continue;
        if (openCount(d, t)) { cand.push(d); break; }
      }
    }
    if (!cand.length) return Infinity;
    day = cand[rnd(cand.length)];
  }
  return day;
}
let found = Infinity;
for (let i = 1; i <= 4000; i++) found = Math.min(found, randomRun(i));
assert.ok(found >= SHORTEST_DAYS,
  `隨機走法找到更短的 ${found} 日——SHORTEST_DAYS 該改成它`);
console.log(`最短 ${SHORTEST_DAYS} 日 ＝ 收景 ${views.length * DAYS_PER_VIEW} 日`
  + `（${views.length} × ${DAYS_PER_VIEW}）＋ 等季節 ${ok.jumped} 日`
  + `　（另灑 4000 種隨機走法，最短 ${found} 日）`);

const byYear = {};
for (const v of views) (byYear[v.published.slice(0, 4)] ??= []).push(v);
console.log(`開局 ${day0.label}：已出版 ${views.filter(v => pubDay(v.published) <= 0).length} 景，`
  + `其中當季可收 ${openNow.length} 景`);
for (const y of Object.keys(byYear).sort()) console.log(`  ${y}  +${byYear[y].length} 景`);
const last = Math.max(...views.map(v => pubDay(v.published)));
console.log(`最後一枚出版於第 ${last} 日（${(last / 365).toFixed(2)} 年）——在那之前不可能收滿。`);
console.log('self-check ok');
