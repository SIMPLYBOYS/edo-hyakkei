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

// 遊戲起點：安政三年四月（1856-04）。系列本身始於 1856-02，玩家晚兩個月才上路——
// 因為二月那批只有 5 枚、其中僅 1 枚是春景，從那裡開局要空等 60 日才收得到第二景。
// 四月開局手上就有 4 個春景可挑。已經出版的那批視為「你出發時架上已有」。
// 這個對齊是「出版才出現」的基礎——遊戲內的一天就是史實的一天。
const START_YEAR = 1856, START_MONTH = 4;

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
