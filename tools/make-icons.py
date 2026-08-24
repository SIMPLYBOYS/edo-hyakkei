#!/usr/bin/env python3
"""主畫面圖示 → assets/icon-192.png、assets/icon-512.png

為什麼需要：iPhone 的 Safari **沒有 Fullscreen API**（iPad 有）。手機上要全螢幕，
只有「加到主畫面」之後的獨立模式一條路，而那條路要 manifest 與 apple-touch-icon。
沒有圖示的話，主畫面上會是一張網頁截圖，看起來就不像一個作品。

圖案跟 index.html 的 favicon 同一個：深藍底、金色圓點——地圖上「這季可收的景」。
不畫圓角：Android 會自己套遮罩（maskable），iOS 也會自己切圓角，
自己先切一次只會在圓角外緣留下透明的鋸齒。所以底色滿版，金點放在安全區內
（Android 的 maskable 安全區是中心 80% 的圓，金點直徑 50% 遠在裡面）。

用法： python3 tools/make-icons.py
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BG = (27, 58, 86)        # --sea #1b3a56
GOLD = (201, 162, 39)    # --gold #c9a227
SIZES = (192, 512)


def main():
    out = ROOT / "assets"
    out.mkdir(parents=True, exist_ok=True)
    for n in SIZES:
        # 4 倍超取樣再縮回來：直接畫的圓在 192px 下邊緣會有階梯
        s = n * 4
        im = Image.new("RGB", (s, s), BG)
        d = ImageDraw.Draw(im)
        r = s * 0.25                                  # 直徑 50%，在 maskable 安全區內
        d.ellipse([s / 2 - r, s / 2 - r, s / 2 + r, s / 2 + r], fill=GOLD)
        im = im.resize((n, n), Image.LANCZOS)
        p = out / f"icon-{n}.png"
        im.save(p, "PNG", optimize=True)
        kb = p.stat().st_size / 1024
        print(f"寫出 {p.relative_to(ROOT)}  {n}×{n}  {kb:.1f}KB")
        assert kb < 40, f"{kb:.1f}KB 太大——這只是一個圓點"

    # self-check：中心該是金的，角落該是底色。畫錯顏色或畫歪了這裡會抓到。
    im = Image.open(out / f"icon-{SIZES[0]}.png").convert("RGB")
    n = im.size[0]
    mid, corner = im.getpixel((n // 2, n // 2)), im.getpixel((2, 2))
    assert max(abs(a - b) for a, b in zip(mid, GOLD)) < 6, f"中心不是金色：{mid}"
    assert max(abs(a - b) for a, b in zip(corner, BG)) < 6, f"角落不是底色：{corner}"
    print("self-check ok")


if __name__ == "__main__":
    sys.exit(main())
