#!/usr/bin/env python3
"""開場動畫用的江戶鳥瞰圖 → assets/intro/keisai-1803.jpg ＋ data/intro.json

**為什麼是這一張**：開場要一張能「一眼看完整個江戶」的圖，讓鏡頭從全城
慢慢推到日本橋——遊戲的起點。tokaido 用的是北齋的《東海道名所一覽》，
江戶的對應物是鍬形蕙斎《江戸名所之繪》（享和三年・1803）：從本所上空
向西鳥瞰，富士在天邊，隅田川橫過前景，江戶城在正中。

它跟這套百景的關係不只是「同一座城」：蕙斎畫的是**一目**（一眼看盡），
廣重畫的是**百景**（一百次凝視）——開場從一目推進到一景，就是整部作品
的結構。而且兩人看的是同一個方向：§7-15 推出的視線方位，大半朝西望富士。

蕙斎另有 1809 年的屏風版《江戸一目図屏風》（津山郷土博物館），構圖相近、
更精緻，但 Commons 上只有 1906px，推鏡 12 秒進日本橋會糊成一片。
1803 的一枚刷有 4669px，夠。

來源：Wikimedia Commons「Famous-Places-of-Edo-1803-Kuwagata-Shoshin.jpg」
公有領域。裁掉掃描時的裝裱邊（灰藍色布與黑框線），只留畫心。

用法： python3 tools/fetch-intro.py
"""
import io, json, sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetchlib import fetch

ROOT = Path(__file__).resolve().parent.parent
UA = "edo-hyakkei/1.0 (research; contact via repo)"
URL = ("https://upload.wikimedia.org/wikipedia/commons/b/bc/"
       "Famous-Places-of-Edo-1803-Kuwagata-Shoshin.jpg")
PAGE = "https://commons.wikimedia.org/wiki/File:Famous-Places-of-Edo-1803-Kuwagata-Shoshin.jpg"
# 🔴 這一步只切掉最外圈的裝裱與黑框，**裡面還留著一大圈裝裱布**——
# 原本的註解寫「畫心 (28,18)–(4639,3591)」是錯的，那是外框不是畫心。
# 錯的代價：開場用 cover 取景時，上下緣會出現藍灰色的裱布（直式手機尤其明顯）。
# 真正的畫心由 find_art() 量出來寫進 data/intro.json 的 art，開場只在那塊裡取景。
# 這裡的 CROP 保持原樣：圖檔不重切，重壓一次 JPEG 只會掉畫質。
CROP = (42, 32, 4625, 3577)
# 日本橋在畫心裡的位置（比例）。推鏡的終點。
# 定法：中央區域放大後讀到「日本ハシ」的標籤與那座橋，記下座標換成比例。
# 不是憑印象點的——憑印象會點到江戸城，那是畫面的視覺中心，不是起點。
# 放大後核對：標籤「日本ハシ」在 (0.521, 0.503)，橋本身在標籤右邊約 80px——
# 鏡頭要落在橋上，不是落在字上。
NIHONBASHI = {"x": 0.536, "y": 0.501}


def find_art(im):
    """量畫心（框線內側）。回傳 (x, y, w, h)，座標在裁切後的圖裡。

    兩個信號分開用，因為各有各的盲點：
      左右 → 列的**變異**。裝裱是均勻布面，畫心全是墨線。
      上下 → 列的**色偏**（R−B）。紙偏黃、裱布偏藍。
              上下不能用變異：畫的上半是天空，變異低到跟裱布一樣，
              會把畫心的頂邊誤判在城區開始的地方（實測差了 850px）。
      左右不能用色偏：裱布左緣有一道紅飾邊，R−B 高達 +121，會被當成紙。
    """
    import statistics
    g = im.convert("L")
    W, H = g.size
    gp, cp = g.load(), im.load()

    def longest(vals, hit):
        best = cur = None
        for i, v in enumerate(list(vals) + [None]):
            if v is not None and hit(v):
                cur = i if cur is None else cur
            elif cur is not None:
                if best is None or i - cur > best[1] - best[0]:
                    best = (cur, i)
                cur = None
        return best

    # 一、變異先框出左右的大概。紅飾邊落在這個範圍之外，後面才敢用色偏修邊。
    colsd = [statistics.pstdev([gp[x, y] for y in range(0, H, 11)]) for x in range(W)]
    cx0, cx1 = longest(colsd, lambda v: v > 18)

    # 二、上下用色偏，取樣限制在粗框內
    def warm_row(y):
        return statistics.median(cp[x, y][0] - cp[x, y][2] for x in range(cx0, cx1, 13))
    y0 = next(y for y in range(H) if warm_row(y) > 8)
    y1 = next(y for y in range(H - 1, 0, -1) if warm_row(y) > 8)

    # 三、左右再用色偏往內修。變異法會把黑框線一起算進來（實測右緣多吃 20px，
    # 框線本身就在 4497–4510），色偏對純黑的框線是 0，修得掉。
    def warm_col(x):
        return statistics.median(cp[x, y][0] - cp[x, y][2] for y in range(y0, y1, 13))
    x0 = next(x for x in range(cx0, cx1) if warm_col(x) > 8)
    x1 = next(x for x in range(cx1, cx0, -1) if warm_col(x) > 8)

    pad = 6                      # 往內縮一點，邊界那幾列常有掃描的暈開
    x0, y0, x1, y1 = x0 + pad, y0 + pad, x1 - pad, y1 - pad
    w, h = x1 - x0, y1 - y0
    assert 0.30 * W < w < W and 0.60 * H < h < H, f"畫心 {w}×{h} 不合理"
    assert 1.40 < w / h < 1.55, f"畫心比例 {w/h:.3f} 不像這張橫幅鳥瞰"
    return x0, y0, w, h


def main():
    raw = fetch(URL, UA, timeout=180, retry_on=(429, 503)).read()
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    assert im.size == (4669, 3643), f"原圖尺寸變了 {im.size}，CROP 要重量"
    im = im.crop(CROP)
    w, h = im.size
    print(f"畫心 {w}×{h}  比例 {w/h:.3f}")
    assert 1.25 < w / h < 1.33, "畫心比例不對，裁切偏了"

    out = ROOT / "assets" / "intro"
    out.mkdir(parents=True, exist_ok=True)
    p = out / "keisai-1803.jpg"
    # quality 86 → 3.7MB、80 → 3.0MB。鳥瞰是密線條，JPEG 壓不太下去；
    # 開場只載一次，但它跟 modern.json（1.8MB）搶同一條開場頻寬，不能太大。
    im.save(p, "JPEG", quality=80, optimize=True, progressive=True)
    kb = p.stat().st_size / 1024
    print(f"寫出 {p.relative_to(ROOT)}  {kb:.0f}KB")
    assert kb < 3500, f"{kb:.0f}KB 太大，開場會等很久"

    art = find_art(im)
    print(f"畫心 {art[2]}×{art[3]} @ ({art[0]},{art[1]})  比例 {art[2]/art[3]:.3f}")

    meta = {
        "_": "開場動畫的鳥瞰圖。為什麼是這張見 tools/fetch-intro.py。",
        "title": "江戸名所之繪",
        "artist": "鍬形蕙斎（北尾政美）",
        "year": 1803,
        "era": "享和三年",
        "source": PAGE,
        "license": "Public domain",
        "px": [w, h],
        "nihonbashi": NIHONBASHI,
        "art": list(art),
        "_art": ("畫心 x,y,w,h（在這個檔案的座標裡）。開場只在這塊取景——"
                 "外面是掃描的裝裱布。量法見 tools/fetch-intro.py 的 find_art。"),
    }
    (ROOT / "data" / "intro.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("寫出 data/intro.json")
    print("self-check ok")


if __name__ == "__main__":
    main()
