// §2.4 找廣重的謊言：在畫上點出他動了手腳的地方。
//
// 看畫（view.js）與狩獵揭曉（hunt.js）共用這一套，理由有兩個：
//   1. 洩題。狩獵揭曉如果直接印出「廣重把富士放大了」，玩家之後在 §2.4
//      打開同一景就沒得找了——兩個玩法會互相把對方的答案講掉。
//   2. 同一筆。在哪裡找到的不重要，找到就是找到，存檔記同一個位置
//      （§2.5：選做，但要記得）。
//
// 呼叫端只負責「說明文字要顯示在哪」——那是兩邊唯一不同的地方。
//
// hitbox 是相對「圖本身」的歸一化座標，所以 img 的容器必須剛好包住 img
// （.plate 是 inline-block）。容器比圖大的話，圈會整片偏掉。
export function findLies(img, v, seen, { onFind, onShow }) {
  const found = new Set(seen);
  const draw = i => {
    const d = v.distortions[i];
    const mark = document.createElement('div');
    mark.className = 'found';
    mark.style.cssText = `left:${d.hitbox.x * 100}%;top:${d.hitbox.y * 100}%;`
      + `width:${d.hitbox.r * 200}%;padding-bottom:${d.hitbox.r * 200}%`;
    img.parentElement.append(mark);
    onShow(d);
  };
  img.style.cursor = 'crosshair';
  for (const i of found) draw(i);      // 找過的重開時直接標出來，不叫人再找一次
  img.onclick = e => {
    const r = img.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    const hit = v.distortions.findIndex((d, i) =>
      !found.has(i) && Math.hypot(px - d.hitbox.x, py - d.hitbox.y) < d.hitbox.r);
    if (hit < 0) return;
    found.add(hit);
    onFind?.(hit);
    draw(hit);
  };
  return found;
}
