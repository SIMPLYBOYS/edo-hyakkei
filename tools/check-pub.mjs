#!/usr/bin/env node
// §2.6 出版閘門的 self-check：  node tools/check-pub.mjs
//
// 這個機制唯一的災難是「鎖死」——開局收不到任何景，或某一景永遠等不到。
// 兩者都不會噴錯，只會讓玩家卡住找不到原因，所以要用資料實際驗過。
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import { pubDay, clockFrom, DAYS_PER_VIEW } from '../src/calendar.js';

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
// 所以這裡照遊戲的真實規則跑一遍，兩個方向都驗：
function playthrough({ canWait }) {
  let day = 0, got = new Set(), waited = 0;
  for (let guard = 0; guard < 5000; guard++) {
    const season = clockFrom(day).season;
    const open = views.filter(v => !got.has(v.id) && v.season === season
      && pubDay(v.published) <= day);
    if (open.length) { got.add(open[0].id); day += DAYS_PER_VIEW; continue; }
    if (!canWait) break;                       // 沒有等待手段 → 卡死
    let next = day + 1;
    while (next < day + 730 && !views.some(v => !got.has(v.id)
      && v.season === clockFrom(next).season && pubDay(v.published) <= next)) next++;
    if (next >= day + 730) break;
    waited += next - day; day = next;
  }
  return { got: got.size, day, waited };
}

const stuck = playthrough({ canWait: false });
assert.ok(stuck.got < views.length,
  '沒有等待手段竟然收得完？那 waitOn() 就是多餘的，回去確認規則');
const ok = playthrough({ canWait: true });
assert.equal(ok.got, views.length,
  `即使能等待也只收到 ${ok.got}/${views.length}——遊戲不可完成`);
console.log(`可完成性：不能等待 → 卡在 ${stuck.got}/${views.length}（第 ${stuck.day} 日）；`
  + `能等待 → ${ok.got}/${views.length}，第 ${ok.day} 日、其中等待 ${ok.waited} 日`);

const byYear = {};
for (const v of views) (byYear[v.published.slice(0, 4)] ??= []).push(v);
console.log(`開局 ${day0.label}：已出版 ${views.filter(v => pubDay(v.published) <= 0).length} 景，`
  + `其中當季可收 ${openNow.length} 景`);
for (const y of Object.keys(byYear).sort()) console.log(`  ${y}  +${byYear[y].length} 景`);
const last = Math.max(...views.map(v => pubDay(v.published)));
console.log(`最後一枚出版於第 ${last} 日（${(last / 365).toFixed(2)} 年）——在那之前不可能收滿。`);
console.log('self-check ok');
