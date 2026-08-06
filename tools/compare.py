#!/usr/bin/env python3
"""把百景與對應的圖會插圖並排，供人工複核配對是否成立。

§7-14 的教訓：只讀題簽會過度自信（no.92 就是這樣配錯的）。
題簽適合回答「這一冊有沒有」，要決定「是不是這一張」得看畫面。

用法：
  python3 tools/compare.py 88 12 82          # 每組一張，適合細看
  python3 tools/compare.py --batch 4 1 2 4 5 # 四組疊成一張，適合掃過去複核
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "research" / "compare"
H = 900
HB = 460          # 批次模式每組高度：夠判斷「是不是同一處」，不夠看細節


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


def row(vid, h):
    """一組並排，回傳圖與寬度。左＝廣重，右＝圖會。"""
    a = ROOT / "assets" / "originals" / f"{vid:03d}.jpg"
    if not a.exists():
        a = ROOT / "assets" / "hires" / f"{vid:03d}.jpg"
    b = ROOT / "assets" / "meishozue" / f"{vid:03d}.jpg"
    if not (a.exists() and b.exists()):
        return None
    ims = [Image.open(f).convert("RGB") for f in (a, b)]
    ims = [i.resize((int(i.width * h / i.height), h), Image.Resampling.LANCZOS) for i in ims]
    out = Image.new("RGB", (sum(i.width for i in ims) + 46, h), "#12283c")
    x = 40
    for im in ims:
        out.paste(im, (x, 0))
        x += im.width + 6
    ImageDraw.Draw(out).text((6, h // 2 - 6), str(vid), fill="#c9a227")
    return out


if "--batch" in sys.argv:
    i = sys.argv.index("--batch")
    per = int(sys.argv[i + 1])
    ids = [int(x) for x in sys.argv[1:i] + sys.argv[i + 2:]]
    OUT.mkdir(parents=True, exist_ok=True)
    for k in range(0, len(ids), per):
        rows = [r for r in (row(v, HB) for v in ids[k:k + per]) if r]
        w = max(r.width for r in rows)
        sheet = Image.new("RGB", (w, sum(r.height + 8 for r in rows)), "#0e2233")
        y = 0
        for r in rows:
            sheet.paste(r, (0, y))
            y += r.height + 8
        f = OUT / f"batch-{ids[k]:03d}.jpg"
        sheet.save(f, "JPEG", quality=86, optimize=True)
        print(f"  {f.name}  {[v for v in ids[k:k+per]]}  {sheet.size[0]}x{sheet.size[1]}")
    sys.exit()

for a in sys.argv[1:]:
    f = side_by_side(int(a))
    print(f"  no.{a}: {f.name if f else '缺圖'}")
