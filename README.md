# 名所江戶百景・漫遊記

廣重《名所江戸百景》118 景，做成一趟在江戶地圖上的四季漫遊。
前作是[東海道五十三次](https://github.com/SIMPLYBOYS/tokaido-pixel)的線性旅程；
這次是**面狀 + 四季**——一座城、118 景、沒有固定順序。

## 跑起來

```bash
python3 -m http.server 8000     # 用了原生 ES modules，file:// 開不起來
open http://localhost:8000
```

repo 裡**沒有圖**（見下方「重建素材」）。第一次 clone 完要先跑腳本把素材抓下來。

## 玩法

- 🟡 金點是當季可收的景，點它 → 看畫 → 收入歲時記，**耗三日**
- ⚫ 灰點不在季。同一地點在不同季節是不同的景，**錯過要等一年**
- 🟡⭕ 有金環的景可切換《江戶名所圖會》的寫實版本，對照廣重動了什麼手腳（目前 6 景）
- 底部滑桿：推到 1858，鐵路與幹道消失、填海地變回海。**水系留著——江戶城的堀到今天還在**
- 進度存 localStorage

時間只由「入景」推進，漫遊不耗時間。這個模型是 `tools/pacing-sim.js` 反推出來的：
原訂「走路耗時、一步半日」跑出 99% 空步，因為 12km 的城和 365 天的年差了四個數量級。

## 重建素材

每支腳本都附 self-check，跑完會自報數量與缺漏。

```bash
python3 tools/fetch-brooklyn.py --download   # 118 景（Commons 上的布魯克林掃描）
python3 tools/fetch-wikipedia.py --write     # 編號↔羅馬拼音、出版年月、座標
python3 tools/fetch-aic.py --write --download
python3 tools/upgrade-hires.py --apply       # 升到 4096px（NDL-DC 批次）
python3 tools/fetch-plates.py --write        # §2.4 的 6 組圖會對照
python3 tools/make-thumbs.py                 # 歲時記縮圖
python3 tools/fetch-osm.py                   # 街圖向量（已含在 repo，重抓才需要）
```

順序不能跳：`fetch-brooklyn` 要先為 Commons 缺號建骨架記錄，
否則後面的腳本沒有 id 可對，別家有那張畫也接不上（而且不會報錯）。

研究材料（不進 build，落在 `research/`）：

```bash
python3 tools/fetch-ndl.py --download        # 江戶名所圖會 20 冊 1,242 開
python3 tools/fetch-miyage.py --download     # 繪本江戶土產 113 頁
open research/contact.html                   # 對照表建置台
```

## 素材與授權

| | 來源 | 授權 |
|---|---|---|
| 百景畫作 | Wikimedia Commons（布魯克林／NDL／AIC 掃描） | 公有領域 |
| 江戶名所圖會 | 国立国会図書館デジタルコレクション | PDM |
| 繪本江戶土產 | Musée Cernuschi via Commons | 公有領域 |
| **街圖向量** | **OpenStreetMap** | **ODbL 1.0 — 必須標示 © OpenStreetMap contributors** |
| 程式 | | MIT |

布魯克林美術館官網目前對外一律回 429，抓不到，所以走 Commons 上的同一批掃描。

## 設計筆記

完整規格與決策記錄在 vault：`projects/2026-08-edo-hyakkei/名所江戶百景-漫遊記-Spec.md`
