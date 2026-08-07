#!/usr/bin/env python3
"""§7-15 第一步：從畫面中的地標推算視線方位角。

原理：畫裡看得到某個地標，視線就朝那個方向。地標清單取自
en.wikipedia「One Hundred Famous Views of Edo」列表的地標欄。

⚠️ 這是**視野內**不是**畫面中心**：地標在畫裡只代表它落在視野內，
所以求出的是「視軸的近似」，不確定度約 ±視野半角（浮世繪大判約 ±30°）。
欄位因此存 bearing_method / bearing_note，不假裝是精確值。

⚠️ 富士的方位在整個江戶只差 5.3°（247.6–252.9°）——因為它遠在 100km 外。
所以富士能確認「朝西南西」但無法區分各景；江戶城距離近，方位隨地點大幅變化，
那才是真正有鑑別力的基準。

用法： python3 tools/derive-bearing.py [--write]
"""
import argparse, json, math, re, urllib.parse
from pathlib import Path

from fetchlib import get_json

UA = "edo-hyakkei/0.1 (research; contact: ferrari828@gmail.com)"
ROOT = Path(__file__).resolve().parent.parent
PAGE = "One Hundred Famous Views of Edo"

# 只放位置明確、當年確實看得見的地標
LANDMARK = {
    "Mount Fuji":    (35.3606, 138.7274),
    "Mount Tsukuba": (36.2253, 140.1067),
    "Edo Castle":    (35.6852, 139.7528),
    "Nihonbashi":    (35.6838, 139.7745),
}


def bearing(a, b):
    la1, lo1, la2, lo2 = map(math.radians, [*a, *b])
    dl = lo2 - lo1
    return (math.degrees(math.atan2(
        math.sin(dl) * math.cos(la2),
        math.cos(la1) * math.sin(la2) - math.sin(la1) * math.cos(la2) * math.cos(dl))) + 360) % 360


def km(a, b):
    return math.hypot((a[0] - b[0]) * 111, (a[1] - b[1]) * 111 * math.cos(math.radians(a[0])))


def landmarks():
    q = urllib.parse.urlencode({"action": "parse", "page": PAGE, "prop": "wikitext",
                                "format": "json", "formatversion": "2"})
    wt = get_json(f"https://en.wikipedia.org/w/api.php?{q}", UA)["parse"]["wikitext"]
    strip = lambda h: re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", h)
    out = {}
    for blk in wt.split("\n|-"):
        m = re.search(r'^\s*!\s*style="[^"]*"\s*\|\s*(\d{1,3})', blk, re.M)
        if not m:
            continue
        parts = blk.split("\n|")
        for i, c in enumerate(parts):
            if "nihongo" in c and i + 1 < len(parts):
                out[int(m.group(1))] = strip(parts[i + 1])
                break
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    land = landmarks()
    views = json.loads((ROOT / "data" / "views.json").read_text(encoding="utf-8"))
    got, multi = [], []
    for v in views:
        if not v["subject"] or v["id"] not in land:
            continue
        s = (v["subject"]["lat"], v["subject"]["lng"])
        hits = [(n, p) for n, p in LANDMARK.items() if n in land[v["id"]]]
        # 地標本身就是這一景時不能拿來定方位（例如 no.1 日本橋畫的就是日本橋）
        hits = [(n, p) for n, p in hits if km(s, p) > 0.4]
        if not hits:
            continue
        bs = {n: round(bearing(s, p), 1) for n, p in hits}
        if len(bs) > 1:
            spread = max(bs.values()) - min(bs.values())
            if spread > 60:          # 視野塞不下，代表其中一個不是同時入畫
                multi.append((v["id"], bs))
                continue
        # 取最遠的那個：距離越遠，用 subject 代替視點造成的誤差越小
        name = max(hits, key=lambda h: km(s, h[1]))[0]
        got.append((v["id"], name, bs[name], bs))
        if args.write:
            v["bearing"] = bs[name]
            v["notes"]["bearing"] = (f"由畫中地標「{name}」推得；視野內非畫面中心，"
                                     f"不確定度約 ±30°。基準座標見 tools/derive-bearing.py")

    print(f"可推方位的景：{len(got)}")
    for i, n, b, allb in got:
        extra = f"  （{allb}）" if len(allb) > 1 else ""
        print(f"  no.{i:>3}  {b:6.1f}°  ← {n}{extra}")
    if multi:
        print(f"\n⚠️ 地標方位相差過大、無法同時入畫，不採用（{len(multi)}）：")
        for i, bs in multi:
            print(f"    no.{i:>3}  {bs}")

    if args.write:
        (ROOT / "data" / "views.json").write_text(
            json.dumps(views, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        n = sum(1 for v in views if v["bearing"] is not None)
        print(f"\n已寫入 views.json：{n} 景有 bearing")
    else:
        print("\n（未加 --write，沒有寫入）")
    assert len(got) >= 15, "推得數量過低，維基地標欄格式可能變了"
    print("self-check ok")


if __name__ == "__main__":
    main()
