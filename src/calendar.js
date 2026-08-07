// 曆法。模型見 spec §2.1：時間只由「入景」推進，漫遊不耗時間。
//
// 一景 8 日。量出來的：廣重 1856-02→1858-10 印完 118 枚，約 8.3 日一枚。
// （原本是 3 日，§9.2 在沒有出版閘門時反推的；§2.6 加上閘門後 3 日變成最差解——
//  收景比出版快太多，七成遊戲時間在等紙。當時取 9，是把 8.3 四捨五入上去。）
//
// 2026/08/08 季節改用真實月份之後重新掃過，8 比 9 明顯好，也更貼近 8.3：
//   D=7 → 3.08 年 / 空等 26%
//   D=8 → 3.15 年 / 空等 18%   ← 取這個，最接近廣重的三年而且空等最少
//   D=9 → 4.05 年 / 空等 28%
// 卡住的是春：42 景 × D 日必須塞進每年約 89 天的春天，D 一大就多吃一個春。
// 改這個數字前先重跑 tools/pacing-sim.js 與 tools/check-pub.mjs。
export const DAYS_PER_VIEW = 8;

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const SEASON_JA = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };

// 遊戲起點：安政四年正月（1857-02-01）。系列始於 1856-02，玩家晚一年才上路，
// 先前出版的 57 枚視為「你出發時架上已有」；其餘 61 枚在遊戲進行中陸續問世。
// 這個對齊是「出版才出現」的基礎——遊戲內的一天就是史實的一天。
//
// 🔴 起點必須落在春天的第一天。季節改用真實月份之後（見下），起點的相位
// 變成節奏的關鍵：春有 42 景是最卡的一季，開局若不在春，等於整整浪費一個春。
//   1856-07（夏）→ 4.64 年 / 空等 37%
//   1856-11（冬）→ 4.30 年 / 空等 32%
//   1857-02（春）→ 3.15 年 / 空等 18%   ← 取這個
// 先前寫「起點完全不影響節奏」，那是等分四季時才成立的話，現在不成立了。
const START = Date.UTC(1857, 1, 1);          // 月份 0-based：1 = 二月
const DAY_MS = 86400000;

// 🔴 季節必須從真實月份算，不能假設「第 0 日是春天」。
// 先前就是那樣寫的，起點還在 1856-04 時大致對得上；把起點移到七月之後
// 整套季節偏了三個月——玩家會在真實的七月收梅花，而事件層一擺出真實日期
// 這個矛盾就藏不住（安政江戸台風 1856-09-23 被標成「春 八十四日」）。
//
// 對應取舊曆：春＝正月〜三月，換算新曆約二〜四月，其餘依此類推。
// 這是近似——舊曆月份會漂移——但比「起點即春天」誠實得多。
const SEASON_OF_MONTH = [3, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3];  // 一月…十二月

const dateOf = day => new Date(START + day * DAY_MS);

/** YYYY-MM 或 YYYY-MM-DD → 遊戲內第幾日。省略日則視為當月一日。 */
export function dateDay(iso) {
  const [y, m, d = 1] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - START) / DAY_MS);
}

/** views.json 的 published（YYYY-MM）→ 遊戲日；早於起點的一律當第 0 日
 *  （那批視為「你出發時架上已有」，見上面的起點說明）。 */
export const pubDay = published => (published ? Math.max(0, dateDay(published)) : 0);

// 改元是年中發生的，不是一月一日。用「哪一年開始」判斷會把改元前的月份算錯——
// 實測：1860-02-01 會被標成「万延元年」，但那時還是安政七年（万延 1860-03-18 改元）。
// 年號用實際改元日判斷，年次仍由起始年推算（万延元年＝1860、安政四年＝1857）。
const ERA = [
  ['1854-11-27', 1854, '安政'],
  ['1860-03-18', 1860, '万延'],
  ['1861-03-29', 1861, '文久'],
];
const KANJI = '〇一二三四五六七八九';

const kanjiNum = n => n < 10 ? KANJI[n] : n < 20 ? '十' + (n % 10 ? KANJI[n % 10] : '')
  : KANJI[Math.floor(n / 10)] + '十' + (n % 10 ? KANJI[n % 10] : '');

function era(iso, year) {
  const [, start, name] = ERA.filter(([from]) => from <= iso).pop();
  const n = year - start + 1;
  return `${name}${n === 1 ? '元' : kanjiNum(n)}年`;   // 改元那年是「元年」，不是「一年」
}

/** 這一天是不是某一季的第一天（用來算季內第幾日與還剩幾日） */
const seasonAt = day => SEASON_OF_MONTH[dateOf(day).getUTCMonth()];

export function clockFrom(day = 0) {
  const d = dateOf(day);
  const year = d.getUTCFullYear();
  const iso = d.toISOString().slice(0, 10);
  const s = seasonAt(day);
  // 往前後掃到季節換手的地方。一季約 91 天，掃這點量不值得做數學。
  let first = day; while (seasonAt(first - 1) === s) first--;
  let next = day + 1; while (seasonAt(next) === s) next++;
  return {
    day, year, season: SEASONS[s],
    // 這一季還剩幾天——玩家要靠它決定「這個春天還來不來得及再收一景」
    daysLeftInSeason: next - day,
    label: `${era(iso, year)} ${SEASON_JA[SEASONS[s]]} ${kanjiNum(day - first + 1)}日`,
    // 和曆年號對現代人沒有直覺，而事件框（§2.9）用的是西元——兩邊要對得起來。
    iso,
  };
}

export const seasonJa = s => SEASON_JA[s];
// 給 UI 用：DAYS_PER_VIEW 改了，畫面上的字要跟著改。
// 先前 view.js 把「耗三日」寫死，D 改成 9 之後那行說了兩天的謊。
export const kanjiDays = kanjiNum;
