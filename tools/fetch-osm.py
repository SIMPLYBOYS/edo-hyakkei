#!/usr/bin/env python3
"""§7-21 抓現代街圖向量（OpenStreetMap via Overpass）→ data/geo/modern.json

為什麼 OSM 撐得起「兩層皮」：**江戶城的堀到今天還在，連名字都沒改**——
半蔵濠、千鳥ヶ淵、牛ヶ淵、天神濠、白鳥濠、道灌濠，OSM 裡都有。
加上日本橋川、神田川、音無川這些廣重畫過的河，水系本身就是江戶層。
真正屬於現代的是鐵路與寬馬路，那些才需要隨年代滑桿淡出。

  水系 / 綠地  → 兩個年代都畫（堀與川是江戶遺留）
  鐵路 / 幹道  → 只有現代畫（滑到 1858 就消失）

**一次查完再依 tag 分類**，不要逐層各查一次——Overpass 對連續請求會回 429（實測）。
公園只留有名字的：全部留會多出四千條無名小綠地，全是雜訊。

授權：ODbL，**必須標示 © OpenStreetMap contributors**（見 §8）。

用法： python3 tools/fetch-osm.py
"""
import json, urllib.parse
from pathlib import Path

from fetchlib import fetch

ROOT = Path(__file__).resolve().parent.parent
UA = "edo-hyakkei/0.1 (research; contact: ferrari828@gmail.com)"
API = "https://overpass-api.de/api/interpreter"
BBOX = "35.50,139.66,35.82,139.92"          # 與 src/map.js 的畫框一致

QUERY = f"""[out:json][timeout:240];
(
  way["waterway"~"^(river|canal)$"]({BBOX});
  way["natural"="water"]({BBOX});
  way["leisure"="park"]["name"]({BBOX});
  way["railway"="rail"]["usage"!="industrial"]["service"!~"."]({BBOX});
  way["highway"~"^(motorway|trunk|primary)$"]({BBOX});
);
out geom;"""


def classify(t):
    if t.get("waterway") in ("river", "canal"):
        return "water_line"
    if t.get("natural") == "water":
        return "water_area"
    if t.get("leisure") == "park":
        return "park"
    if t.get("railway") == "rail":
        return "rail"
    if t.get("highway"):
        return "road"
    return None


# 抽稀強度分層：水系是主角要留細節，鐵路道路只是背景紋理，粗一點沒差。
# OSM 把路網切成上萬條小段，不分層抽稀檔案會到 2.5MB，開場直接被拖垮。
TOL = {"water_line": 0.00025, "water_area": 0.00025, "park": 0.0004,
       "rail": 0.0009, "road": 0.0009}


def simplify(pts, tol):
    out = [pts[0]]
    for p in pts[1:]:
        if abs(p[0] - out[-1][0]) + abs(p[1] - out[-1][1]) > tol:
            out.append(p)
    if out[-1] != pts[-1]:
        out.append(pts[-1])
    return out


def extent(pts):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return max(xs) - min(xs) + max(ys) - min(ys)


def main():
    url = API + "?" + urllib.parse.urlencode({"data": QUERY})
    # Overpass 公用實例很常忙不過來：429 是限速，502/503/504 是暫時性閘道錯誤，
    # 這是唯讀 GET，全都可以安全重試。
    els = json.load(fetch(url, UA, timeout=300, retry_on=(429, 502, 503, 504)))["elements"]
    print(f"Overpass 回傳 {len(els)} 個 way")

    geo, named = {}, []
    for e in els:
        layer = classify(e.get("tags") or {})
        g = e.get("geometry") or []
        if not layer or len(g) < 2:
            continue
        raw = [[round(p["lon"], 5), round(p["lat"], 5)] for p in g]
        pts = simplify(raw, TOL[layer])
        # 路口切出來的碎段留著只是徒增檔案大小，畫出來也看不到
        if len(pts) < 2 or extent(raw) < TOL[layer] * 3:
            continue
        geo.setdefault(layer, []).append(pts)
        n = (e.get("tags") or {}).get("name")
        if n and layer == "water_line":
            named.append(n)

    for k in sorted(geo):
        print(f"  {k:<11} {len(geo[k]):>5} 條 / {sum(len(w) for w in geo[k]):>6} 點")

    out = ROOT / "data" / "geo" / "modern.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "source": "OpenStreetMap contributors",
        "license": "ODbL 1.0 — 使用時必須標示出處",
        "bbox": BBOX, "layers": geo,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    kb = out.stat().st_size / 1024
    print(f"\n寫出 {out.relative_to(ROOT)}：{kb:.0f}KB")
    print("水系名稱樣本:", sorted(set(named))[:10])

    assert geo.get("water_line") and geo.get("rail"), "關鍵圖層是空的，查詢可能失效"
    assert kb < 2000, f"{kb:.0f}KB 太大，開場會被拖垮，抽稀要再狠一點"
    print("self-check ok")


if __name__ == "__main__":
    main()
