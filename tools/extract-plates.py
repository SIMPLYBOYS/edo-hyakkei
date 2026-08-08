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
# 兩個來源，同一套流程。差別只在檔案擺哪、裁多少、回填哪個旗標。
# 裁切比例都是量出來的（拍攝框各家不同），所以留成常數不寫死在迴圈裡。
SOURCES = {
    "meishozue": dict(
        src=ROOT / "research" / "meishozue",       # 底下還有 vNN/ 一層
        dst=ROOT / "assets" / "meishozue",
        map=ROOT / "data" / "meishozue-map.json",
        crop=(0.055, 0.075, 0.945, 0.845),         # NDL 的拍攝框
        flag="meishozue",
    ),
    "miyage": dict(
        src=ROOT / "research" / "miyage",          # 平的一層
        dst=ROOT / "assets" / "miyage",
        map=ROOT / "data" / "miyage-map.json",
        crop=(0.035, 0.03, 0.965, 0.97),           # Cernuschi 逐頁掃描，邊框窄得多
        flag="miyage",
    ),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source", nargs="?", default="meishozue", choices=list(SOURCES),
                    help="要裁哪一個來源（預設 meishozue）")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--prune", action="store_true", help="清掉對照表已無的舊圖檔")
    args = ap.parse_args()
    S = SOURCES[args.source]

    m = json.loads(S["map"].read_text(encoding="utf-8"))
    views = json.loads((ROOT / "data" / "views.json").read_text(encoding="utf-8"))
    by = {v["id"]: v for v in views}
    flag = S["flag"]

    ok, missing = [], []
    for p in m["pairs"]:
        # 名所圖會有 vNN/ 一層，土產是平的
        src = (S["src"] / p["vol"] / f"p{p['page']:03d}.jpg") if "vol" in p \
            else (S["src"] / f"p{p['page']:03d}.jpg")
        (ok if src.exists() else missing).append((p, src))

    print(f"[{args.source}] 對照表 {len(m['pairs'])} 組，來源齊備 {len(ok)}")
    for p, src in missing:
        print(f"  ⚠️ no.{p['id']} 找不到 {src}")
    for p, src in ok:
        where = f"{p.get('vol', '')}/p{p['page']:03d}".lstrip("/")
        print(f"  no.{p['id']:>3}  {where}  「{p['plate']}」 ← {p['view']}")

    if not args.write:
        print("\n（未加 --write，沒有裁切）")
        return

    DST = S["dst"]
    CROP = S["crop"]
    DST.mkdir(parents=True, exist_ok=True)
    # fetch-plates.py（Commons 逐幅插圖）與這支（整開頁裁切）會撞同一個檔名。
    # 先前是誰後跑誰贏、而且不出聲——那種沉默的覆蓋遲早會讓人搞不清畫面是哪來的。
    # 現在明講：整開頁優先（看得到上下文，§2.4 對照更完整），但要報出來。
    overwritten = []
    for p, src in ok:
        out = DST / f"{p['id']:03d}.jpg"
        if out.exists() and by[p["id"]]["assets"][flag] is not False:
            overwritten.append(p["id"])
        im = Image.open(src)
        w, h = im.size
        im.crop((int(w * CROP[0]), int(h * CROP[1]),
                 int(w * CROP[2]), int(h * CROP[3]))).save(out, "JPEG", quality=88, optimize=True)
        by[p["id"]]["assets"][flag] = True
    if overwritten and args.source == "meishozue":
        print(f"\n覆蓋了 fetch-plates.py 的 Commons 版 {len(overwritten)} 張：{overwritten}")
        print("  （整開頁優先；要用 Commons 版就重跑 fetch-plates.py --write）")

    # 撤銷配對時圖檔會留下來，變成「資料說沒有、檔案卻在」的矛盾。
    # 預設只警告不刪——刪檔要明講才做。
    paired = {p["id"] for p in m["pairs"]}
    live = paired | {v["id"] for v in views if v["assets"][flag] and v["id"] not in paired}
    stale = sorted(int(f.stem) for f in DST.glob("*.jpg") if int(f.stem) not in live)
    if stale:
        print(f"\n⚠️ 對照表已無、但圖檔還在：{stale}")
        print("   加 --prune 可清掉（assets/ 是 gitignore 的衍生目錄，刪了能重建）")
        if args.prune:
            for i in stale:
                (DST / f"{i:03d}.jpg").unlink()
            print(f"   已清除 {len(stale)} 張")

    linked = sum(1 for v in views if v["assets"][flag])
    assert linked >= len(ok), "回填數不足"
    (ROOT / "data" / "views.json").write_text(
        json.dumps(views, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\n裁出 {len(ok)} 張；views.json 現有 {linked} 景標記有 {args.source} 對照")
    print("self-check ok")


if __name__ == "__main__":
    main()
