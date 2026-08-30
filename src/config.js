// 執行期設定。目前只有一項：Google Maps 的金鑰，給看畫畫面的「看今天」用
// （把街景嵌在同一個畫框裡，跟廣重的版本互翻）。
//
// 🔴 這把金鑰是**公開的**，而且沒辦法不公開。
//
// GitHub Pages 服務的是靜態檔：不論金鑰是寫在 repo 裡、還是由 Actions 在部署時
// 注入，最後都會落在使用者拿得到的檔案裡。GitHub Secret 能做的是「不進 git 歷史、
// 可以隨時換掉」，不是「看不見」。
//
// 所以防護不靠隱藏，靠三道限制（設在 Google Cloud Console，不在程式裡）：
//   一、API 限制：這把金鑰只准用 Maps Embed API
//   二、referrer 限制：只准 simplyboys.github.io/*
//   三、Maps Embed API 本身免費且無配額上限，所以就算被抄走也生不出帳單
// 三道合起來，金鑰被看到也用不了——Google 的前端金鑰本來就是這樣設計的。
//
// 沒有這個檔（或沒有 key）時，「看今天」不會出現，現在地仍然是開新分頁的街景連結。
// clone 下來的人什麼都不必設定就能跑，那條路一直都在。
export const cfg = {};

export async function loadConfig() {
  try {
    const r = await fetch('data/config.json');
    if (r.ok) Object.assign(cfg, await r.json());
  } catch { /* 沒有就沒有，不是錯 */ }
}

/** 街景嵌入的網址。沒金鑰就回 null——呼叫端據此決定要不要給那顆鈕。 */
export function embedUrl(v) {
  if (!cfg.mapsKey || !v.subject) return null;
  const p = [`key=${encodeURIComponent(cfg.mapsKey)}`,
             `location=${v.subject.lat},${v.subject.lng}`];
  // heading 的定義兩邊一致：正北 0°、順時針。map.js 畫視線扇形用的是同一套。
  if (v.bearing != null) p.push(`heading=${Math.round(v.bearing)}`, 'pitch=0', 'fov=90');
  return `https://www.google.com/maps/embed/v1/streetview?${p.join('&')}`;
}
