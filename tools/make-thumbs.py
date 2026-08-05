#!/usr/bin/env python3
"""產歲時記用的縮圖。assets/hires 是 4096px、單張 1–2MB，
118 張排在同一頁上瀏覽器會死，所以另存一份 240px 的。

用法： python3 tools/make-thumbs.py [--force]
"""
import sys
from pathlib import Path

from PIL import Image

FORCE = "--force" in sys.argv

ROOT = Path(__file__).resolve().parent.parent
# originals 優先：那是裁到畫面本身的版本。hires 多半是 NDL 的檔案級全幅拍攝，
# 帶色卡比例尺館標，縮成 240px 後畫面只剩一半，不能當展示圖。
SRC = ROOT / "assets" / "originals"
FALLBACK = ROOT / "assets" / "hires"
DST = ROOT / "assets" / "thumbs"
W = 240

DST.mkdir(parents=True, exist_ok=True)
n = 0
for f in sorted(FALLBACK.glob("*.jpg")):
    src = SRC / f.name if (SRC / f.name).exists() else f
    out = DST / f.name
    if out.exists() and not FORCE:
        continue
    im = Image.open(src)
    im.thumbnail((W, W * 4), Image.LANCZOS)      # 高不設限，維持直幅比例
    im.convert("RGB").save(out, "JPEG", quality=82, optimize=True)
    n += 1

fs = list(DST.glob("*.jpg"))
mb = sum(f.stat().st_size for f in fs) / 1024 / 1024
print(f"新產 {n} 張，共 {len(fs)} 張 {mb:.1f}MB")
assert len(fs) == len(list(FALLBACK.glob("*.jpg"))), "縮圖數與來源數對不上"
print("self-check ok")
