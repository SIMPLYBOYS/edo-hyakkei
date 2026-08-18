// 素材檔名規則只寫在這裡。
// views.json 刻意不存路徑（§9.5）：路徑一律是 {id:03d}.jpg，存下來等於把規則抄 119 遍，
// 而且會說謊——舊版有 118 筆指向根本不存在的 assets/pixel/。推導出來的值不會過期。
const n = id => String(id).padStart(3, '0');

export const plate = id => `assets/originals/${n(id)}.jpg`;   // 展示用，裁到畫面本身
export const hires = id => `assets/hires/${n(id)}.jpg`;       // 研究用，多半含色卡比例尺
export const thumb = id => `assets/thumbs/${n(id)}.jpg`;      // 歲時記
export const meishozue = id => `assets/meishozue/${n(id)}.jpg`;
export const miyage = id => `assets/miyage/${n(id)}.jpg`;   // §7-12 廣重自己的另一種答案
// 切繪圖只有 28 張，多景共用一張，所以鍵是圖的 PID 不是景的 id——
// 這是唯一一個不照 {id:03d} 規則的素材，因為它本來就不是「每景一張」。
export const kiriezu = pid => `assets/kiriezu/${pid}.jpg`;
