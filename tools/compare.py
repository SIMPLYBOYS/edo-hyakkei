#!/usr/bin/env python3
"""把百景與對應的圖會插圖並排，供人工複核配對是否成立。

§7-14 的教訓：只讀題簽會過度自信（no.92 就是這樣配錯的）。
題簽適合回答「這一冊有沒有」，要決定「是不是這一張」得看畫面。

用法： python3 tools/compare.py 88 12 82
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "research" / "compare"
H = 900


def side_by_side(vid):
    a = ROOT / "assets" / "originals" / f"{vid:03d}.jpg"
    if not a.exists():
        a = ROOT / "assets" / "hires" / f"{vid:03d}.jpg"
    b = ROOT / "assets" / "meishozue" / f"{vid:03d}.jpg"
    if not (a.exists() and b.exists()):
        return None
    ims = []
    for f in (a, b):
        im = Image.open(f).convert("RGB")
        ims.append(im.resize((int(im.width * H / im.height), H), Image.Resampling.LANCZOS))
    out = Image.new("RGB", (sum(i.width for i in ims) + 12, H), "#12283c")
    x = 0
    for im in ims:
        out.paste(im, (x, 0))
        x += im.width + 12
    OUT.mkdir(parents=True, exist_ok=True)
    f = OUT / f"{vid:03d}.jpg"
    out.save(f, "JPEG", quality=88, optimize=True)
    return f


for a in sys.argv[1:]:
    f = side_by_side(int(a))
    print(f"  no.{a}: {f.name if f else '缺圖'}")
