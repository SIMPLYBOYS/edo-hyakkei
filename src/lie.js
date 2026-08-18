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
// 空點幾次之後給提示。提示的內容是 distortions 的 target——**他動的是什麼**，
// 不是在哪裡。「富士山」「大提灯」「船頭の脚と櫓」講出來，玩家還是得自己在
// 畫上找到它，但不再是盲點。這份資料本來就在，不必另外寫提示文案。
//
// 為什麼是三次而不是按鈕：需要提示的人本來就會一直點，不需要的人碰不到它。
// 多一顆「ヒント」鈕等於在畫面上永遠貼著「這題你大概不會」。
const MISSES_BEFORE_HINT = 3;

/** 策展筆記的極簡標記。★／★★ 是寫筆記時給自己標「這條是好例子」的記號，
 *  ** ** 是強調。distortions 與兩份對照配對都用同一套寫法，而先前
 *  **星號是直接印在畫面上的**——三個地方都在讀這些字，所以收在這裡一次。
 *  ★ 不只出現在開頭（no.87 的變造筆記寫在句中），所以整串都剝。 */
export const md = t => String(t ?? '').replace(/★+\s*/g, '')
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

// prompt 是「點畫面找找看」那一行；提示直接改寫它，不另外長出一塊 UI。
// 兩個玩法都有這一行，所以提示的文案也只寫在這裡一次。
export function findLies(img, v, seen, { onFind, onShow, prompt }) {
  const found = new Set(seen);
  let missed = 0;
  const hint = () => {
    // 只報還沒找到的那幾樣，不然找到一個之後提示會把它再講一次
    const left = v.distortions.filter((_, i) => !found.has(i)).map(d => d.target);
    if (prompt && left.length) {
      prompt.innerHTML = `他動的是<b>${left.join('、')}</b>——在畫裡把它找出來。`;
    }
  };
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
  // 全部找完就把「找找看」那行收掉。重開時也要——不然存檔裡明明找完了，
  // 畫面還在叫你找一次不存在的東西。
  const done = () => { if (prompt && found.size === v.distortions.length) prompt.remove(); };
  done();
  img.onclick = e => {
    const r = img.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    const hit = v.distortions.findIndex((d, i) =>
      !found.has(i) && Math.hypot(px - d.hitbox.x, py - d.hitbox.y) < d.hitbox.r);
    if (hit < 0) {
      if (++missed >= MISSES_BEFORE_HINT) hint();
      return;
    }
    missed = 0;
    found.add(hit);
    onFind?.(hit);
    draw(hit);
    done();
  };
  return found;
}
