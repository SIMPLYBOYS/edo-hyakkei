// 曆法。模型見 spec §2.1：時間只由「入景」推進，漫遊不耗時間。
// 一景 3 日是 tools/pacing-sim.js 反推出來的——空等最少（39 日）、
// 只有「春」42 景塞不進單季，張力來源乾淨。改這個數字前先重跑那支模擬。
export const DAYS_PER_VIEW = 3;

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const SEASON_JA = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
const SEASON_DAYS = 365 / 4;

// 廣重畫百景是安政三年（1856）起，玩家就從那年春天出發
const START_YEAR = 1856;
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
