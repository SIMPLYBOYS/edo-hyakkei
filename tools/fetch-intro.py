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
# 畫心。用「與裝裱色的距離」沿多條線掃出黑框線，再往內縮 14px 去掉框線本身。
# 原圖 4669×3643，畫心 (28,18)–(4639,3591)。
CROP = (42, 32, 4625, 3577)
# 日本橋在畫心裡的位置（比例）。推鏡的終點。
# 定法：中央區域放大後讀到「日本ハシ」的標籤與那座橋，記下座標換成比例。
# 不是憑印象點的——憑印象會點到江戸城，那是畫面的視覺中心，不是起點。
# 放大後核對：標籤「日本ハシ」在 (0.521, 0.503)，橋本身在標籤右邊約 80px——
# 鏡頭要落在橋上，不是落在字上。
NIHONBASHI = {"x": 0.536, "y": 0.501}


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
    }
    (ROOT / "data" / "intro.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("寫出 data/intro.json")
    print("self-check ok")


if __name__ == "__main__":
    main()
