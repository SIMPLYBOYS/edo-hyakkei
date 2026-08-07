#!/usr/bin/env node
// §2.6 出版閘門的 self-check：  node tools/check-pub.mjs
//
// 這個機制唯一的災難是「鎖死」——開局收不到任何景，或某一景永遠等不到。
// 兩者都不會噴錯，只會讓玩家卡住找不到原因，所以要用資料實際驗過。
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import { pubDay, clockFrom } from '../src/calendar.js';

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

const byYear = {};
for (const v of views) (byYear[v.published.slice(0, 4)] ??= []).push(v);
console.log(`開局 ${day0.label}：已出版 ${views.filter(v => pubDay(v.published) <= 0).length} 景，`
  + `其中當季可收 ${openNow.length} 景`);
for (const y of Object.keys(byYear).sort()) console.log(`  ${y}  +${byYear[y].length} 景`);
const last = Math.max(...views.map(v => pubDay(v.published)));
console.log(`最後一枚出版於第 ${last} 日（${(last / 365).toFixed(2)} 年）——在那之前不可能收滿。`);
console.log('self-check ok');
