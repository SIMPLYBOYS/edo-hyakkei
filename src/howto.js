// 玩法。一份隨時打得開的說明。
//
// 為什麼要另外做一份：開場的字幕裡本來就有一段「玩法」，但那是 34 秒捲動字幕的
// 一部分——會被跳過、跳過了就沒了，而且它只講了收景與對照，沒講季節鈕、時間軸、
// 視點狩獵、原寸、看今天。字幕是**氣氛**，這裡是**參考**，兩件事。
//
// 寫法上刻意先講「這是什麼」再講「怎麼按」：這個遊戲跟一般的收集遊戲不一樣的
// 地方（沒有路線、季節是閘門、出版是第二道閘門、時間只由入景推進）如果不先說，
// 玩家會拿線性關卡的預期來玩，然後覺得灰點是 bug。
//
// 數字全部對得上資料，不是寫個大概：118 景／57 景開局／40 景有手腳／
// 圖會 52 景・土產 30 景／一景八日。改資料的話這裡也要跟著改。
import { DAYS_PER_VIEW, SHORTEST_DAYS } from './calendar.js';

const KEY = 'edo-hyakkei/howto';

const BODY = `
<section>
  <h3>這是一趟漫遊，不是一條路線</h3>
  <p>廣重在人生最後三年畫了一百一十八張江戶的名所。這裡把它們放回地圖上——
     一座城、四季、沒有固定順序，也沒有關卡。</p>
  <p>你走的速度就是廣重的速度：<b>入一景耗八日</b>，那是量出來的
     （1856-02 到 1858-10 印完 118 枚，約 8.3 日一枚）。
     <b>漫遊不耗時間，只有入景會推進日子。</b></p>
</section>

<section>
  <h3>開始</h3>
  <ul>
    <li><i class="d open"></i><b>金點</b>　這一季可以收的景。點它 → 看畫 → 收入歲時記</li>
    <li><i class="d closed"></i><b>灰點</b>　不在這一季。同一個地方，不同季節是不同的景</li>
    <li><i class="d got"></i><b>綠點</b>　已經收過了</li>
    <li><b>春 夏 秋 冬</b>　把時鐘推到那一季。這不是切換圖層，是真的過了那些日子</li>
  </ul>
  <p class="note">開局地圖上只有 57 景，<b>其餘的廣重還沒畫</b>。隨著遊戲內時間一張張
     長出來，到安政五年秋滿一百一十八——那正是這套百景出完的那一刻。</p>
</section>

<section>
  <h3>看畫的時候</h3>
  <ul>
    <li><i class="d ring"></i><b>金環的景</b>　可以切換《江戶名所圖會》或《繪本江戶土產》：
        同一個地方，別人怎麼畫、他自己另一次怎麼畫（圖會 52 景・土產 30 景，
        雙環是兩種都有）</li>
    <li><b>對著看，找廣重動的手腳</b>　四十景藏了可以點的變造。
        點空三次會給提示</li>
    <li><b>原寸</b>　館藏的全幅掃描，比畫面上這張大五到九倍。可縮放、可旋轉</li>
    <li><b>現在</b>　同一個地方的今天。街景就在畫框裡，按一下換回廣重的版本</li>
  </ul>
</section>

<section>
  <h3>還有</h3>
  <ul>
    <li><b>視點狩獵</b>　給你一張寫實的鳥瞰圖，你在地圖上指出它畫的是哪裡</li>
    <li><b>歲時記</b>　收過的景按春夏秋冬排。空白本身就是內容——那是還沒走過的季節</li>
    <li><b>繪卷</b>　收過的景連成一卷，由右向左展讀</li>
    <li><b>底部滑桿</b>　推到 1858：鐵路與幹道消失、填海地變回海、區名換成當時的。
        <b>水系留著</b>——江戶城的堀到今天還在</li>
  </ul>
</section>

<section class="keys">
  <h3>鍵盤</h3>
  <table>
    <tr><td>方向鍵</td><td>在地圖上移動</td></tr>
    <tr><td>＋ － 0</td><td>地圖放大・縮小・回到全圖</td></tr>
    <tr><td>F</td><td>全螢幕</td></tr>
    <tr><td>Esc</td><td>關掉目前這一層</td></tr>
    <tr><td>← →</td><td>看畫時翻到上／下一景</td></tr>
    <tr><td>R</td><td>原寸檢視裡旋轉九十度（Shift＋R 反向）</td></tr>
  </table>
</section>

<p class="tail">進度存在瀏覽器裡，關掉再回來會接著走。
  收齊一百一十八景最短要 ${SHORTEST_DAYS} 日——其中 ${118 * DAYS_PER_VIEW} 日在路上，
  其餘全是等季節。</p>`;

/** 開玩法。 */
export function showHowTo({ onClose } = {}) {
  if (document.querySelector('.howto')) return;
  const el = document.createElement('div');
  el.className = 'overlay howto';
  el.innerHTML = `<div class="sheet">
    <header><h2>玩法</h2><button id="hx" class="ghost">關閉</button></header>
    <div class="body">${BODY}</div></div>`;
  const close = () => {
    el.remove();
    removeEventListener('keydown', keys);
    try { localStorage.setItem(KEY, '1'); } catch {}
    onClose?.();
  };
  // Esc 只關這一層。下層（看畫、地圖）看到 .howto 會自己讓開，跟 .lightbox 同一套。
  const keys = e => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', keys);
  el.querySelector('#hx').onclick = close;
  el.onclick = e => { if (e.target === el) close(); };
  document.body.append(el);
}

/** 沒看過就自動開一次。第一次進來的玩家如果跳過了開場，否則什麼都沒讀到。 */
export function howToFirstRun(opts) {
  let seen = false;
  try { seen = !!localStorage.getItem(KEY); } catch {}
  if (!seen) showHowTo(opts);
}
