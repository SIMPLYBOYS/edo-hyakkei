# 名所江戶百景・漫遊記

廣重《名所江戶百景》118 景，做成一趟在江戶地圖上的四季漫遊。
前作是[東海道五十三次](https://github.com/SIMPLYBOYS/tokaido-pixel)的線性旅程；
這次是**面狀 + 四季**——一座城、118 景、沒有固定順序。

**玩：** https://simplyboys.github.io/edo-hyakkei/

## 玩法

- 你在安政四年（1857）春天走進江戶。🟡 金點是當季可收的景，點它 → 看畫 → 收入歲時記，**耗八日**
- ⚫ 灰點不在季。同一地點在不同季節是不同的景——按季節鈕把時鐘推到那一季
- 開局地圖上只有 57 景，**其餘的廣重還沒畫**。地圖隨遊戲內時間一張張長出來，
  到安政五年秋（1858）滿 118——那是這套百景出完的那一刻
- 🟡⭕ 有金環的景可切換《江戶名所圖會》或《繪本江戶土產》——同一個地方，別人怎麼畫、
  他自己另一次怎麼畫（73 景）。對著看，找廣重動的手腳（40 景有可點的變造；點空三次給提示）
- 每一景附來歷：現代地址、當時的切繪圖（118 景各自對到一張，可開原寸、旋轉）、視線方位、典藏編號
- **視點狩獵**：給你一張寫實的鳥瞰插圖，你在地圖上指出它畫的是哪裡
- **繪卷**：收過的景連成一卷，由右向左展讀
- 底部滑桿：推到 1858，鐵路與幹道消失、填海地變回海、區名換成當時的。
  **水系留著——江戶城的堀到今天還在**
- 配樂是六首江戶期的わらべ唄・子守唄，Web Audio 合成，零音檔
- 進度存 `localStorage`

時間只由「入景」推進，漫遊不耗時間。這個模型是 `tools/pacing-sim.js` 反推出來的：
原訂「走路耗時、一步半日」跑出 99% 空步，因為 12km 的城和 365 天的年差了四個數量級。

一景八日也是量出來的，不是調出來的——廣重 1856-02→1858-10 印完 118 枚，約 8.3 日一枚。
玩家的速度等於廣重的速度，「季節」與「出版」兩個閘門才會重合而不是相乘。
改動前先跑 `tools/check-pub.mjs`：它驗的是這機制唯一的災難——鎖死，
而鎖死不會噴錯，只會讓玩家卡住（實際發生過一次，卡在 89/118）。
它同時釘住結局要顯示的**最短一場 1151 日**（收景 944 日＋等季節 207 日）——
那個數字是搜出來的不是證出來的，所以每次都重搜一遍，資料一改就會紅。

## 跑起來

```bash
python3 tools/serve.py          # 用了原生 ES modules，file:// 開不起來
open http://localhost:8000
```

用 `tools/serve.py` 不用 `python3 -m http.server`：後者不送 Cache-Control，
改了 `src/*.js` 之後常常 index.html 是新的、模組卻是舊的——
**畫面看起來更新了但行為沒變，比完全沒更新更難察覺。** `serve.py` 會在 import 網址加版本號。

零依賴：vanilla JS、ES modules、沒有 build。

## 素材

`assets/`（約 430MB）直接在 repo 裡——GitHub Pages 不會服務 Git LFS 的檔案，所以沒走 LFS。
每一份都能用 `tools/` 重建，每支腳本都附 self-check，跑完會自報數量與缺漏。

```bash
python3 tools/fetch-brooklyn.py --download   # 118 景（Commons 上的布魯克林掃描）
python3 tools/fetch-wikipedia.py --write     # 編號↔羅馬拼音、出版年月、座標
python3 tools/fetch-aic.py --write --download
python3 tools/upgrade-hires.py --apply       # 升到 4096px（NDL-DC 批次）
python3 tools/fetch-plates.py --write        # 圖會對照
python3 tools/make-thumbs.py                 # 歲時記縮圖
python3 tools/fetch-kiriezu.py --assets      # 江戶切繪圖 29 張
python3 tools/fetch-intro.py                 # 開場的鳥瞰圖（順便量出畫心）
python3 tools/fetch-osm.py                   # 街圖向量 data/geo/modern.json（已含在 repo）
python3 tools/fetch-dem.py --write           # 標高 data/geo/relief.jpg（已含在 repo）
python3 tools/fetch-bgm.py --write           # 配樂旋律 data/bgm.json（已含在 repo）
```

全螢幕有兩條路，因為 **iPhone 的 Safari 沒有 Fullscreen API**（iPad 有）：
桌機與 Android 走 HUD 上的 ⤢（或按 F）；iPhone 只能「加到主畫面」，
靠 `manifest.webmanifest` 與 `apple-*` meta 開成獨立視窗（圖示：`python3 tools/make-icons.py`）。
不支援、或已經在獨立視窗裡跑的，那顆鈕會自己拿掉——按了沒反應的鈕比沒有更糟。

動到地圖的取景或介面尺寸之後跑 `node tools/check-map.mjs`：它用直式視窗量，
驗開場有沒有把江戶本體框進來、地名與圓點畫出來是不是該有的 CSS 像素數。
`preserveAspectRatio` 是 slice，「哪一邊綁住縮放」在桌機是寬邊、直式手機是高邊——
只按寬邊寫的公式在桌機碰巧會對，錯只在手機現形。

開場改動之後跑 `node tools/check-intro.mjs`：它把推鏡停在起點與終點，
看畫布四角有沒有掃描件的裝裱布入鏡——那個錯在桌機上看不出來（contain 取景四周本來就留白），
只有手機直式會把它壓在畫面上下緣。

順序不能跳：`fetch-brooklyn` 要先為 Commons 缺號建骨架記錄，
否則後面的腳本沒有 id 可對，別家有那張畫也接不上（而且不會報錯）。
布魯克林美術館官網對外一律回 429，抓不到，所以走 Commons 上的同一批掃描。

研究材料（約 1GB，不進 repo，落在 `research/`）：

```bash
python3 tools/fetch-ndl.py --download        # 江戶名所圖會 20 冊 1,242 開
python3 tools/fetch-miyage.py --download     # 繪本江戶土產 113 頁
open research/contact.html                   # 對照表建置台
```

## 素材與授權

| | 來源 | 授權 |
|---|---|---|
| 百景畫作 | Wikimedia Commons（布魯克林／NDL／AIC 掃描） | 公有領域 |
| 江戶名所圖會・江戶切繪圖・江戶近郊圖 | 国立国会図書館デジタルコレクション（IIIF） | 公有領域 |
| 繪本江戶土產 | Musée Cernuschi via Commons | 公有領域 |
| 江戸名所之繪（開場鳥瞰・鍬形蕙斎 1803） | Wikimedia Commons | 公有領域 |
| **街圖向量** | **OpenStreetMap** | **ODbL 1.0——必須標示 © OpenStreetMap contributors** |
| 標高 | 国土地理院 標高タイル（DEM5A・DEM10B） | 国土地理院コンテンツ利用規約（出典明示） |
| 配樂旋律 | 江戶期の傳統曲；譜取自 ja.wikipedia 的 LilyPond 轉寫 | 公有領域 |
| 程式 | | MIT |

## 設計筆記

為什麼這樣做、哪些路試過不通，寫在程式的註解裡——每個 🔴 都是一個踩過的坑。
完整規格與決策記錄在 vault：`projects/2026-08-edo-hyakkei/名所江戶百景-漫遊記-Spec.md`
