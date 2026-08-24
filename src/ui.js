// 「還在載」的兩種說法。
//
// 這個作品的圖都不小：展示圖 0.9MB、圖會與切繪圖 0.3–1.1MB、原寸掃描 1.8–3.6MB。
// 桌機上感覺不到，手機上點下去要等好幾秒——沒有任何反饋的話，那幾秒看起來就是
// 「點了沒用」，玩家會再點一次。
//
//   loading()  換頁式的等待：整個畫面就是在等這一張（原寸）。
//   waitImg()  就地的等待：圖只是版面裡的一塊，其他內容照樣可讀（看畫、對照、狩獵）。
//
// 兩者都用文字不用轉圈：這個作品裡沒有別的旋轉元件，而且「載入原寸」比一個
// spinner 更說得清楚在等什麼。

/** 整頁遮罩。回傳的 done() 順便回報「取消之前就好了嗎」，呼叫端據此決定要不要繼續。 */
export function loading(text) {
  const el = document.createElement('div');
  el.className = 'loading';
  el.innerHTML = `<span>${text}<span class="dots"></span></span>`;
  const key = e => { if (e.key === 'Escape') off(); };   // 下層看到 .loading 會自己讓開
  const off = () => { el.remove(); removeEventListener('keydown', key); };
  el.onclick = off;                                     // 可以點掉——不能取消的全螢幕遮罩更糟
  addEventListener('keydown', key);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('on'));  // 讓 transition 生效
  return { done: () => { const live = el.isConnected; off(); return live; } };
}

/**
 * 在圖自己的框裡等。
 *
 * text 省略就只有一層淡底，不寫字：歲時記那種一次上百格的網格，每格都寫字會很吵。
 *
 * 🔴 要換圖的話**把新的 src 交給它**，不要自己指派：
 * 「已在快取就不必閃」這個判斷看的是 img 當下的狀態，而換版的當下 img 還是
 * 「舊圖已載完」——自己指派的話會被這個判斷擋掉，等待提示根本不會出現。
 * 交給它就能先佈置好再換，順序不會錯。
 */
export function waitImg(img, text = '', src = null) {
  if (!img) return;
  if (src == null && img.complete && img.naturalWidth) return;   // 已在快取，不必閃一下
  const box = img.parentElement;
  box.querySelector('.imgwait')?.remove();              // 連點兩下不要疊兩層

  // 🔴 <img> 在圖到之前是 0×0，框會跟著塌——提示無處可放，圖一到版面還會跳一下。
  // 已經有尺寸（例如換對照版）就把當下的尺寸釘住，換完再放開；
  // 還沒有尺寸（第一次開景）就交給 CSS 的 .waiting 先撐一個約 2:3 的框。
  const h = box.offsetHeight, w = box.offsetWidth;
  if (h > 4 && w > 4) { box.style.minHeight = `${h}px`; box.style.minWidth = `${w}px`; }
  else box.classList.add('waiting');

  const tag = document.createElement('div');
  tag.className = 'imgwait';
  if (text) tag.innerHTML = `<span>${text}<span class="dots"></span></span>`;
  box.append(tag);

  const off = () => {
    tag.remove();
    box.classList.remove('waiting');
    box.style.minHeight = box.style.minWidth = '';
  };
  img.addEventListener('load', off, { once: true });
  img.addEventListener('error', off, { once: true });
  if (src != null) img.src = src;          // 佈置好才換，順序反了提示就不會出現
}

// 已經在獨立視窗裡跑嗎（加到主畫面之後開的）。瀏覽器的邊框本來就不在了。
export const standalone = () =>
  matchMedia('(display-mode: standalone)').matches
  || matchMedia('(display-mode: fullscreen)').matches
  || navigator.standalone === true;

// 這台裝置按得出全螢幕嗎。**iPhone 的 Safari 沒有 Fullscreen API**（iPad 有），
// 那邊唯一的全螢幕是「加到主畫面」。用能力偵測不用 UA 字串：要判斷的本來就是
// 「有沒有這個功能」，而 UA 會說謊、也會過期。
export const canFullscreen = () => !!document.documentElement.requestFullscreen;
