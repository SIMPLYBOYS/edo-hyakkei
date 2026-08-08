#!/usr/bin/env python3
"""把 data/distortions.json 套進 views.json 的 distortions 欄位。

為什麼要獨立存檔：views.json 是 fetch-brooklyn.py 從 Commons 重建的，
直接寫進去下次重跑就沒了。跟 meishozue-map.json 同樣的道理——
**人工判斷的成果不能放在會被機器覆寫的地方。**

用法： python3 tools/apply-distortions.py [--write]
"""
import argparse, json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TYPES = {"scale", "distance", "impossible", "addition", "removal"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    d = json.loads((ROOT / "data" / "distortions.json").read_text(encoding="utf-8"))
    vp = ROOT / "data" / "views.json"
    views = json.loads(vp.read_text(encoding="utf-8"))
    by = {v["id"]: v for v in views}
    # 對照來源有兩種，變造只要**至少有一種**能並排就成立。
    # 這條檢查原本寫「必須有圖會」，那是土產還沒接上時的假設；
    # 2026/08/08 起有五筆的證據來源是土產（廣重本人），比圖會更沒有干擾。
    def load(name):
        return {q["id"]: q for q in json.loads(
            (ROOT / "data" / name).read_text(encoding="utf-8"))["pairs"]}
    zue, miya = load("meishozue-map.json"), load("miyage-map.json")

    n = 0
    for k, items in d["views"].items():
        vid = int(k)
        assert vid in by, f"no.{vid} 不在 views.json"
        # 每一筆變造都該有可比對的圖會頁——沒有對照就沒有「並排指出來」這回事
        assert vid in zue or vid in miya, \
        f"no.{vid} 圖會與土產都沒有對照，不該有 distortions（並排不出來就不能寫）"
        for it in items:
            assert it["type"] in TYPES, f"no.{vid} 的 type「{it['type']}」不在 §6.2 定義內"
            h = it["hitbox"]
            assert all(0 <= h[c] <= 1 for c in "xyr"), f"no.{vid} 的 hitbox 超出 0-1"
        if args.write:
            by[vid]["distortions"] = items
        n += len(items)
        src, q = ("圖會", zue[vid]) if vid in zue else ("土產", miya[vid])
        where = f"{q.get('vol', '')}/p{q['page']:03d}".lstrip("/")
        print(f"  no.{vid:>3}  {len(items)} 筆  ← {src} {where}「{q['plate']}」")

    print(f"\n共 {n} 筆變造，涵蓋 {len(d['views'])} 景")
    if args.write:
        vp.write_text(json.dumps(views, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        got = sum(1 for v in views if v["distortions"])
        print(f"已寫入 views.json：{got} 景有 distortions")
        assert got == len(d["views"]), "寫入數不符"
    else:
        print("（未加 --write，沒有寫入）")
    print("self-check ok")


if __name__ == "__main__":
    main()
