#!/usr/bin/env node
// §9.2 —「1 步 ≈ 半日」到底合不合理？跑法： node tools/pacing-sim.js
//
// 問題：118 景綁季節，走路要花時間。走路和等季節，哪個才是真正的瓶頸？
import assert from 'node:assert';

const CITY_KM = 12;                    // 江戶東西約 12km（品川↔葛西）
const CITY_KM_NS = 7.2;                // 南北較窄
const WALK_KMH = 4;
const SEASONS = [42, 30, 26, 20];      // §6.1 目録分部 春夏秋冬
const N = SEASONS.reduce((a, b) => a + b);

const rng = s => () => (s = (s * 1664525 + 1013904223) >>> 0, s / 4294967296);

function makeViews(seed) {
  const r = rng(seed), v = [];
  SEASONS.forEach((n, s) => {
    for (let i = 0; i < n; i++) v.push({ s, x: r() * CITY_KM, y: r() * CITY_KM_NS, got: false });
  });
  return v;
}

// greedy = 玩家看得到全圖、每次走最近的；naive = 隨手挑一個在季的目標
function sim(hoursPerStep, seed, mode) {
  const v = makeViews(seed);
  const stepsPerYear = Math.round(365 * 24 / hoursPerStep);
  const perSeason = stepsPerYear / 4;
  const reach = WALK_KMH * hoursPerStep;          // 一步能走多遠
  const r = rng(seed ^ 0x9e37);
  let pos = { x: CITY_KM / 2, y: CITY_KM_NS / 2 }, step = 0, idle = 0, walked = 0, left = N;

  while (left && step < stepsPerYear * 10) {
    const season = Math.floor((step % stepsPerYear) / perSeason);
    let budget = reach, got = 0;
    for (;;) {
      const open = v.filter(t => !t.got && t.s === season);
      if (!open.length) break;
      const dist = t => Math.hypot(t.x - pos.x, t.y - pos.y);
      const target = mode === 'greedy'
        ? open.reduce((a, b) => dist(b) < dist(a) ? b : a)
        : open[Math.floor(r() * open.length)];
      const dd = dist(target);
      if (dd > budget) {                            // 走不到，用完預算停在半路
        const k = budget / dd;
        pos = { x: pos.x + (target.x - pos.x) * k, y: pos.y + (target.y - pos.y) * k };
        walked += budget; budget = 0; break;
      }
      pos = { x: target.x, y: target.y };
      target.got = true; left--; got++; walked += dd; budget -= dd;
    }
    if (!got) idle++;                               // 這一步啥也沒收到 = 空步
    step++;
  }
  return { steps: step, idle, walked, left, stepsPerYear, years: step / stepsPerYear };
}

const pad = (s, n) => String(s).padStart(n);
function report(mode) {
  console.log(`\n【${mode}】 118 景走完需要：`);
  console.log('  1步=  每年步數   完成步數    年   空步%   實際走了');
  for (const h of [12, 6, 2, 1]) {
    const r = sim(h, 42, mode);
    console.log(`  ${pad(h, 2)}h ${pad(r.stepsPerYear, 9)} ${pad(r.steps, 10)} ${pad(r.years.toFixed(2), 6)}` +
      ` ${pad((100 * r.idle / r.steps).toFixed(1), 7)} ${pad(r.walked.toFixed(0) + 'km', 9)}`);
  }
}
report('greedy');
report('naive');

// 空步降到 50% 需要多短的一年？（用 greedy 的實際生產步數回推）
const g = sim(12, 42, 'greedy');
const productive = g.steps - g.idle;
console.log(`\n→ greedy 全程只有 ${productive} 步真的收到景，其餘 ${g.idle} 步是等季節。`);
console.log(`→ 要讓空步降到 50%，一年只能有 ~${Math.round(productive / 4 * 2)} 步（1 步 ≈ ${(365 / (productive / 4 * 2)).toFixed(1)} 天）。`);
console.log(`→ 走路總距離 ${g.walked.toFixed(0)}km ÷ 時速4 = ${(g.walked / 4).toFixed(0)} 小時，` +
  `佔遊戲內一年（8760h）的 ${(100 * g.walked / 4 / 8760).toFixed(1)}%。`);

// ── 模型 B：時間由「入景」推進，不由走路推進 ────────────────────────
// 漫遊免費，進一景耗 D 日（觀察／寫生／等光線），移動另計。
// 反推：D 要多大，才會像廣重本人一樣畫了三年？
const DAY_KM = 32;                      // 一天走 8 小時 × 4km/h
const SEASON_DAYS = 365 / 4;

function simDays(D, seed) {
  const v = makeViews(seed);
  let pos = { x: CITY_KM / 2, y: CITY_KM_NS / 2 }, day = 0, travel = 0, idle = 0, left = N;
  while (left && day < 365 * 30) {
    const inYear = day % 365;
    const open = v.filter(t => !t.got && t.s === Math.floor(inYear / SEASON_DAYS));
    if (!open.length) {                                   // 這季沒得收，空等到下一季
      const jump = (Math.floor(inYear / SEASON_DAYS) + 1) * SEASON_DAYS - inYear;
      idle += jump; day += jump; continue;
    }
    const dist = t => Math.hypot(t.x - pos.x, t.y - pos.y);
    const target = open.reduce((a, b) => dist(b) < dist(a) ? b : a);
    const td = dist(target) / DAY_KM;
    travel += td; day += td + D;
    pos = { x: target.x, y: target.y }; target.got = true; left--;
  }
  return { days: day, years: day / 365, travel, idle, left };
}

console.log('\n【模型B】一景耗 D 日、漫遊免費：');
console.log('  D日   完成年數   移動日   入景日   空等日   移動佔比   卡關的季');
for (const D of [1, 2, 3, 4, 5, 6, 7, 8]) {
  const r = simDays(D, 42);
  // 哪一季塞不進單季 → 那季就是逼玩家等下一年的來源
  const stuck = SEASONS.map((n, i) => n * D > SEASON_DAYS ? '春夏秋冬'[i] : '')
    .join('') || '無（一年收完）';
  console.log(`  ${pad(D, 2)}日 ${pad(r.years.toFixed(2), 9)} ${pad(r.travel.toFixed(1), 8)}` +
    ` ${pad((N * D).toFixed(0), 8)} ${pad(r.idle.toFixed(0), 8)}` +
    ` ${pad((100 * r.travel / r.days).toFixed(1) + '%', 10)}   ${stuck}`);
}

const [a, b] = [simDays(3, 42), simDays(7, 42)];
console.log(`\n→ D=3 日：${a.years.toFixed(2)} 年、空等僅 ${a.idle.toFixed(0)} 日，且只有「春」塞不進單季。`);
console.log('  = §2.3 要的「超過一年」，張力來源乾淨（春 42 景太多，得留一批到明年）。');
console.log(`→ D=7 日：${b.years.toFixed(2)} 年，對上廣重的三年——但代價是 ${b.idle.toFixed(0)} 日空等，四季全滿溢。`);
console.log('  三年是佳話不是設計目標，買它要付九個月的死曆法。建議取 D=3。');
console.log(`→ 兩者移動都只佔 1% 上下（${a.travel.toFixed(0)} 日）。12km 的城怎麼調都撐不起移動成本，`);
console.log('  地圖要有重量得另外給代價（渡船／關所／天候封路），不能靠距離。');
console.log('  註：空等日對季節邊界的餘數敏感（見上表非單調），別拿它微調 D。');

// self-check：兩種玩法都要能收完，且 greedy 走的路不該比 naive 長
assert.equal(g.left, 0, 'greedy 沒收完');
const n = sim(12, 42, 'naive');
assert.equal(n.left, 0, 'naive 沒收完');
assert.ok(g.walked < n.walked, 'greedy 應該比 naive 省路');
assert.ok(g.idle / g.steps > 0.5, '空步比例低於預期，模型可能寫錯');
assert.equal(simDays(5, 42).left, 0, '模型B 沒收完');
assert.ok(simDays(6, 42).years > simDays(2, 42).years, '模型B：D 越大該花越久');
console.log('\nself-check ok');

// ── 模型 C：加上「出版才出現」——景要等到廣重畫出來才收得到 ──────────
// 起因是使用者提的「資訊隨時間更迭」。查資料才發現一個巧合：
// 出版期間 1856-02→1859-04，而遊戲從安政三年(1856)春起算，**兩者是同一段時間**。
// 玩家等於陪著廣重把這套畫做出來。
// 用遊戲本身的 pubDay，不自己再算一次——模擬跟遊戲對出版日的定義若不同，
// 這支模擬就在替另一個遊戲調參數。
import { readFileSync } from 'node:fs';
import { pubDay } from '../src/calendar.js';
const PUB = JSON.parse(readFileSync(new URL('../data/views.json', import.meta.url), 'utf8'))
  .filter(v => v.id <= 118 && v.published)
  .map(v => ({ id: v.id, season: v.season, pub: pubDay(v.published) }));

function simPub(D) {
  const v = PUB.map(x => ({ ...x, got: false }));
  let day = 0, left = v.length, idle = 0, waitPub = 0;
  while (left && day < 365 * 12) {
    const season = SEASONS.map((n, i) => i)[Math.floor((day % 365) / SEASON_DAYS)];
    const name = ['spring', 'summer', 'autumn', 'winter'][season];
    const open = v.filter(t => !t.got && t.season === name && t.pub <= day);
    if (!open.length) {
      // 分辨「這季沒景」與「景還沒出版」——後者是新機制帶來的等待
      const seasonAny = v.some(t => !t.got && t.season === name);
      if (seasonAny) waitPub++; else idle++;
      day += 1;
      continue;
    }
    open[0].got = true; left--; day += D;
  }
  return { days: day, years: day / 365, idle, waitPub, left };
}

{
  console.log('\n【模型C】再加上「出版才出現」：');
  console.log('  D日   完成年數   等季節   等出版   未收');
  for (const D of [3, 4, 5]) {
    const r = simPub(D);
    console.log(`  ${pad(D, 2)}日 ${pad(r.years.toFixed(2), 9)} ${pad(r.idle, 8)} ${pad(r.waitPub, 8)} ${pad(r.left, 6)}`);
  }
  const r = simPub(3);
  console.log(`\n→ D=3 加出版限制：${r.years.toFixed(2)} 年（原本 1.09 年）。`);
  console.log(`  廣重本人畫了三年（1856-58）——這個延長不是灌水，是史實。`);
}
