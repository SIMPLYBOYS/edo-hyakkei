// 曆法。模型見 spec §2.1：時間只由「入景」推進，漫遊不耗時間。
//
// 一景 9 日。原本是 3 日（§9.2 反推：無出版閘門時空等最少）；加上 §2.6
// 「出版才出現」後 3 日變成最差解——收景比出版快太多，七成遊戲時間在等紙。
// 9 日不是調出來的，是量出來的：廣重 1856-02→1858-10 印完 118 枚，約 8.3 日一枚。
// 讓玩家的速度等於廣重的速度，兩個閘門就重合而不是相乘（空等 68% → 11%）。
// 改這個數字前先重跑 tools/pacing-sim.js 與 tools/check-pub.mjs。
export const DAYS_PER_VIEW = 9;

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const SEASON_JA = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
const SEASON_DAYS = 365 / 4;

// 遊戲起點：安政三年七月（1856-07）。系列本身始於 1856-02，玩家晚五個月才上路，
// 已經出版的那批視為「你出發時架上已有」。
// 這個對齊是「出版才出現」的基礎——遊戲內的一天就是史實的一天。
//
// 為什麼是七月：起點只影響開局手上有多少，**完全不影響節奏**。
// 卡住總時長的是最後一枚出版（1858-10）加上季節輪替，不是起點。實測：
//   1856-04 → 開局 4 個金點、3.28 年、空等 134 日（11%）
//   1856-07 → 開局 12 個金點、3.28 年、空等 134 日（11%）
// 四月開局全圖只有 4 個點可以按，太空；七月三倍於此而代價為零。
// 仍然看得到 118 景中的 90 景在遊戲中陸續出版，「陪廣重畫」的敘事不受影響。
const START_YEAR = 1856, START_MONTH = 7;

/** views.json 的 published（YYYY-MM）換算成遊戲內第幾日；早於起點的一律當第 0 日。 */
export function pubDay(published) {
  if (!published) return 0;
  const [y, m] = published.split('-').map(Number);
  return Math.max(0, Math.round(((y - START_YEAR) * 12 + (m - START_MONTH)) * 30.44));
}
const ERA = [[1854, '安政'], [1860, '万延'], [1861, '文久']];
const KANJI = '〇一二三四五六七八九';

const kanjiNum = n => n < 10 ? KANJI[n] : n < 20 ? '十' + (n % 10 ? KANJI[n % 10] : '')
  : KANJI[Math.floor(n / 10)] + '十' + (n % 10 ? KANJI[n % 10] : '');

function era(year) {
  const [start, name] = ERA.filter(([y]) => y <= year).pop();
  return `${name}${kanjiNum(year - start + 1)}年`;
}

export function clockFrom(day = 0) {
  const inYear = ((day % 365) + 365) % 365;
  const year = START_YEAR + Math.floor(day / 365);
  const season = SEASONS[Math.min(3, Math.floor(inYear / SEASON_DAYS))];
  const dayOfSeason = Math.floor(inYear - SEASONS.indexOf(season) * SEASON_DAYS) + 1;
  return {
    day, year, season,
    // 這一季還剩幾天——玩家要靠它決定「這個春天還來不來得及再收一景」
    daysLeftInSeason: Math.ceil((SEASONS.indexOf(season) + 1) * SEASON_DAYS - inYear),
    label: `${era(year)} ${SEASON_JA[season]} ${kanjiNum(dayOfSeason)}日`,
  };
}

export const seasonJa = s => SEASON_JA[s];
// 給 UI 用：DAYS_PER_VIEW 改了，畫面上的字要跟著改。
// 先前 view.js 把「耗三日」寫死，D 改成 9 之後那行說了兩天的謊。
export const kanjiDays = kanjiNum;
