#!/usr/bin/env python3
"""把名所圖會的一冊拼成一張接觸印樣，供快速找出插圖頁。

§7-14 的成本問題：1,242 開逐張細看太貴。但「這頁是圖還是文」在縮圖上一眼可辨
（自動分類試過兩種特徵都分不開，見 §7-14——人眼零成本做到的事）。
所以流程是：先看印樣挑出插圖頁 → 只對那幾頁細讀題簽。

第二種模式 --strips：只裁版面上緣拼成長條。名所圖會的題簽幾乎都在上緣，
整頁縮到 300px 讀不到字，但只裁上緣就能維持高解析度——用五分之一的像素讀到同樣的資訊。

用法：
  python3 tools/make-sheet.py v12               # 整冊印樣，用來挑出插圖頁
  python3 tools/make-sheet.py v12 --strips 4,6,7,8   # 只裁這幾頁的上緣讀題簽
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "research" / "meishozue"
DST = ROOT / "research" / "sheets"
CELL, COLS = 300, 7


def sheet(vol):
    pages = sorted((SRC / vol).glob("*.jpg"))
    if not pages:
        return None
    rows = (len(pages) + COLS - 1) // COLS
    cw, ch = CELL, int(CELL * 0.78) + 16          # 開頁是橫的，下緣留白寫頁碼
    out = Image.new("RGB", (COLS * cw, rows * ch), "#12283c")
    dr = ImageDraw.Draw(out)
    for i, p in enumerate(pages):
        im = Image.open(p).convert("RGB")
        im.thumbnail((cw - 4, ch - 20), Image.Resampling.LANCZOS)
        x, y = (i % COLS) * cw, (i // COLS) * ch
        out.paste(im, (x + 2, y + 2))
        dr.text((x + 4, y + ch - 15), p.stem, fill="#e9e1cf")
    DST.mkdir(parents=True, exist_ok=True)
    f = DST / f"{vol}.jpg"
    out.save(f, "JPEG", quality=88, optimize=True)
    return f, len(pages), out.size


def strips(vol, nums, width=1500, frac=0.30):
    """裁每頁上緣 frac 高度，直向堆疊。題簽在上緣，這樣能保住解析度。

    ⚠️ 一批最多約 18 頁。實測 24 頁疊成 7776px 後，讀取端會把整張縮到寬 386px，
    題簽就糊了——高度換寬度，超過就白做。寧可多跑兩批。"""
    if len(nums) > 18:
        print(f"  ⚠️ 一批 {len(nums)} 頁過多，題簽會糊；建議拆成 ≤18 頁")
    imgs = []
    for n in nums:
        p = SRC / vol / f"p{n:03d}.jpg"
        if not p.exists():
            continue
        im = Image.open(p).convert("RGB")
        im = im.crop((0, int(im.height * 0.06), im.width, int(im.height * frac)))
        im = im.resize((width, int(im.height * width / im.width)), Image.Resampling.LANCZOS)
        imgs.append((n, im))
    lab = 22
    out = Image.new("RGB", (width, sum(i.height + lab for _, i in imgs)), "#12283c")
    dr, y = ImageDraw.Draw(out), 0
    for n, im in imgs:
        dr.text((6, y + 5), f"p{n:03d}", fill="#c9a227")
        out.paste(im, (0, y + lab))
        y += im.height + lab
    DST.mkdir(parents=True, exist_ok=True)
    f = DST / f"{vol}-strips.jpg"
    out.save(f, "JPEG", quality=90, optimize=True)
    return f, len(imgs), out.size


if "--strips" in sys.argv:
    i = sys.argv.index("--strips")
    vol, nums = sys.argv[1], [int(x) for x in sys.argv[i + 1].split(",")]
    f, n, size = strips(vol, nums)
    print(f"  {vol} 上緣長條 {n} 頁 → {f.name} {size[0]}x{size[1]} {f.stat().st_size // 1024}KB")
    sys.exit()

vols = [a for a in sys.argv[1:] if not a.startswith("-")] or \
       sorted(d.name for d in SRC.iterdir() if d.is_dir())
for v in vols:
    r = sheet(v)
    print(f"  {v}  {r[1]:>3}頁 → {r[0].name} {r[2][0]}x{r[2][1]} "
          f"{r[0].stat().st_size // 1024}KB" if r else f"  {v}  (無檔案)")
