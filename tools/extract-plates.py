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
    ap.add_argument("--prune", action="store_true", help="清掉對照表已無的舊圖檔")
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
    # fetch-plates.py（Commons 逐幅插圖）與這支（NDL 整開頁裁切）會撞同一個檔名。
    # 先前是誰後跑誰贏、而且不出聲——那種沉默的覆蓋遲早會讓人搞不清畫面是哪來的。
    # 現在明講：NDL 版優先（整個開頁看得到上下文，§2.4 對照更完整），但要報出來。
    overwritten = []
    for p, src in ok:
        out = DST / f"{p['id']:03d}.jpg"
        if out.exists() and not by[p["id"]]["assets"]["meishozue"] is False:
            overwritten.append(p["id"])
        im = Image.open(src)
        w, h = im.size
        im.crop((int(w * CROP[0]), int(h * CROP[1]),
                 int(w * CROP[2]), int(h * CROP[3]))).save(out, "JPEG", quality=88, optimize=True)
        by[p["id"]]["assets"]["meishozue"] = True
    if overwritten:
        print(f"\n覆蓋了 fetch-plates.py 的 Commons 版 {len(overwritten)} 張：{overwritten}")
        print("  （NDL 整開頁優先；要用 Commons 版就重跑 fetch-plates.py --write）")

    # 撤銷配對時圖檔會留下來，變成「資料說沒有、檔案卻在」的矛盾。
    # 預設只警告不刪——刪檔要明講才做。
    live = {p["id"] for p in m["pairs"]} | {v["id"] for v in views
                                            if v["assets"]["meishozue"] and v["id"] not in
                                            {q["id"] for q in m["pairs"]}}
    stale = sorted(int(f.stem) for f in DST.glob("*.jpg") if int(f.stem) not in live)
    if stale:
        print(f"\n⚠️ 對照表已無、但圖檔還在：{stale}")
        print("   加 --prune 可清掉（assets/ 是 gitignore 的衍生目錄，刪了能重建）")
        if args.prune:
            for i in stale:
                (DST / f"{i:03d}.jpg").unlink()
            print(f"   已清除 {len(stale)} 張")

    (ROOT / "data" / "views.json").write_text(
        json.dumps(views, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    linked = sum(1 for v in views if v["assets"]["meishozue"])
    print(f"\n裁出 {len(ok)} 張；views.json 現有 {linked} 景標記有圖會對照")
    assert linked >= len(ok), "回填數不足"
    print("self-check ok")


if __name__ == "__main__":
    main()
