#!/usr/bin/env python3
"""把 data/meishozue-map.json 裡對到的圖會頁裁出來，放進 assets/meishozue/。

research/ 裡的原掃描含桌面、比例尺與館標（約佔畫框 35%），
直接當遊戲畫面會讓插圖只佔一半。這裡裁掉外框只留版面。

裁切比例是量出來的，不是猜的——NDL 這批的拍攝框相當一致，
但若換了來源就要重量一次，所以留成常數而不是寫死在迴圈裡。

用法： python3 tools/extract-plates.py [--write]
"""
import argparse, json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "research" / "meishozue"
DST = ROOT / "assets" / "meishozue"
# 左右上下各裁掉的比例（量自 NDL 的拍攝框）
CROP = (0.055, 0.075, 0.945, 0.845)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    m = json.loads((ROOT / "data" / "meishozue-map.json").read_text(encoding="utf-8"))
    views = json.loads((ROOT / "data" / "views.json").read_text(encoding="utf-8"))
    by = {v["id"]: v for v in views}

    ok, missing = [], []
    for p in m["pairs"]:
        src = SRC / p["vol"] / f"p{p['page']:03d}.jpg"
        if not src.exists():
            missing.append((p["id"], str(src)))
            continue
        ok.append((p, src))

    print(f"對照表 {len(m['pairs'])} 組，來源齊備 {len(ok)}")
    for i, s in missing:
        print(f"  ⚠️ no.{i} 找不到 {s}")
    for p, src in ok:
        print(f"  no.{p['id']:>3}  {p['vol']}/p{p['page']:03d}  「{p['plate']}」 ← {p['view']}")

    if not args.write:
        print("\n（未加 --write，沒有裁切）")
        return

    DST.mkdir(parents=True, exist_ok=True)
    for p, src in ok:
        im = Image.open(src)
        w, h = im.size
        im.crop((int(w * CROP[0]), int(h * CROP[1]),
                 int(w * CROP[2]), int(h * CROP[3]))).save(
            DST / f"{p['id']:03d}.jpg", "JPEG", quality=88, optimize=True)
        by[p["id"]]["assets"]["meishozue"] = True

    (ROOT / "data" / "views.json").write_text(
        json.dumps(views, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    linked = sum(1 for v in views if v["assets"]["meishozue"])
    print(f"\n裁出 {len(ok)} 張；views.json 現有 {linked} 景標記有圖會對照")
    assert linked >= len(ok), "回填數不足"
    print("self-check ok")


if __name__ == "__main__":
    main()
