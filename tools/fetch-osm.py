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
# 與 src/map.js 的畫框 B 一致。2026/08/07 西邊推到 139.565 收 no.87 井の頭，
# 舊 bbox 只到 139.66，那一景先前落在街圖資料之外 1.1km，站在一片空白上。
BBOX = "35.535,139.565,35.805,139.925"

# 🔴 2026/08/07：原本只查 way["natural"="water"]，漏掉了不忍池——
# 它在 OSM 是 relation（multipolygon）而且標成 natural=wetland + water=pond，
# 兩個條件都不符。上野恩賜公園、小名木川同樣是 relation。
# 廣重畫最多次的那口池子從來沒上過圖，而且不會有任何錯誤訊息。
# 所以：水域與公園一律 way + rel 都查，natural 放寬到 water|wetland。
QUERY = f"""[out:json][timeout:240];
(
  way["waterway"~"^(river|canal)$"]({BBOX});
  rel["waterway"~"^(river|canal)$"]({BBOX});
  way["natural"~"^(water|wetland)$"]({BBOX});
  rel["natural"~"^(water|wetland)$"]({BBOX});
  way["leisure"="park"]["name"]({BBOX});
  rel["leisure"="park"]["name"]({BBOX});
  way["railway"="rail"]["usage"!="industrial"]["service"!~"."]({BBOX});
  way["highway"~"^(motorway|trunk|primary)$"]({BBOX});
);
out geom;"""


def classify(t):
    if t.get("waterway") in ("river", "canal"):
        return "water_line"
    if t.get("natural") in ("water", "wetland"):
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


def parts(e, seen):
    """把一個 element 攤成幾條線。way 是一條；relation（multipolygon）是每個外環一條。

    只取 outer：inner 是水中的島（不忍池的弁天島就是），畫出來會多一圈黑邊。
    代價是島會被水蓋掉，但這個尺度看不出來，不值得為它做偶奇填充。

    seen 是已經單獨回傳過的 way id。河川的 relation 只是把沿線的 way 串起來，
    那些 way 我們已經查到了——不扣掉會整條河畫兩次（實測 water_line
    從 632 條變成 1411 條、檔案破 2MB）。只有 relation 獨有的成員才要留。
    """
    if e.get("type") == "way":
        return [e.get("geometry") or []]
    return [m.get("geometry") or [] for m in (e.get("members") or [])
            if m.get("role") in ("outer", "", None) and m.get("ref") not in seen]


def extent(pts):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return max(xs) - min(xs) + max(ys) - min(ys)


def main():
    url = API + "?" + urllib.parse.urlencode({"data": QUERY})
    # Overpass 公用實例很常忙不過來：429 是限速，502/503/504 是暫時性閘道錯誤，
    # 這是唯讀 GET，全都可以安全重試。
    els = json.load(fetch(url, UA, timeout=300, retry_on=(429, 502, 503, 504)))["elements"]
    print(f"Overpass 回傳 {len(els)} 個 way")

    seen = {e["id"] for e in els if e.get("type") == "way"}
    bs, bw, bn, be = (float(x) for x in BBOX.split(","))
    def inbox(p):
        return bw <= p[0] <= be and bs <= p[1] <= bn

    geo, cand = {}, {}
    for e in els:
        tags = e.get("tags") or {}
        layer = classify(tags)
        if not layer:
            continue
        n = tags.get("name")
        for g in parts(e, seen):
            # relation 的成員幾何可能缺節點（跨出 bbox 的那段），過濾掉
            raw = [[round(p["lon"], 5), round(p["lat"], 5)]
                   for p in g if p and "lon" in p and "lat" in p]
            if len(raw) < 2:
                continue
            pts = simplify(raw, TOL[layer])
            # 路口切出來的碎段留著只是徒增檔案大小，畫出來也看不到
            if len(pts) < 2 or extent(raw) < TOL[layer] * 3:
                continue
            geo.setdefault(layer, []).append(pts)

            # 地名。江戶城的堀連名字都沒改（半蔵濠、千鳥ヶ淵…），這些字就是江戶層本身。
            # 只留水系與綠地：道路鐵路的名字全是現代的，標上去會毀掉 1858 那一側。
            # OSM 把一條河切成很多段（隅田川 17 段），同名只留最長的一段當錨點，
            # 否則同一個名字會沿著河出現十幾次。
            if n and layer in ("water_line", "water_area", "park"):
                # 比大小要用「框內那一段」，不是整條。整條最長的那一段有可能
                # 完全落在框外（真間川、玉川上水都是），選它當代表就等於沒有錨點。
                ins = [p for p in raw if inbox(p)]
                if ins and extent(ins) > cand.get(n, (0,))[0]:
                    cand[n] = (extent(ins), ins, layer)

    # 錨點只取框內的點。Overpass 回的是「與 bbox 相交的整條 way」，
    # 拿整條的中點當錨點，長河的名字會掉到畫紙外面去
    # （實測：真間川往東、玉川上水往西、江戸川往北，三個都飄在圖框外）。
    labels = []
    for n, (size, ins, layer) in sorted(cand.items()):
        # 線用中點（沿著河擺），面用外接框中心（擺在水域裡）
        if layer == "water_line":
            anchor = ins[len(ins) // 2]
        else:
            xs = [p[0] for p in ins]; ys = [p[1] for p in ins]
            anchor = [round((min(xs) + max(xs)) / 2, 5), round((min(ys) + max(ys)) / 2, 5)]
        # size 也是框內那段算的——決定的是「在畫面上看起來多大」，
        # 框外那段再長也不影響要不要標名字
        labels.append({"name": n, "kind": layer,
                       "lng": anchor[0], "lat": anchor[1], "size": round(size, 4)})
    labels.sort(key=lambda l: -l["size"])

    for k in sorted(geo):
        print(f"  {k:<11} {len(geo[k]):>5} 條 / {sum(len(w) for w in geo[k]):>6} 點")
    print(f"  {'labels':<11} {len(labels):>5} 個地名")

    # 先組好內容、跑完所有檢查，最後才落地。
    # 先前是寫檔在前、assert 在後——檢查擋下來的時候壞資料已經蓋掉好資料了
    # （實測踩過：一次 assert 失敗留下一份少了兩個地名的 modern.json）。
    text = json.dumps({
        "source": "OpenStreetMap contributors",
        "license": "ODbL 1.0 — 使用時必須標示出處",
        "bbox": BBOX, "layers": geo, "labels": labels,
    }, ensure_ascii=False, separators=(",", ":")) + "\n"
    kb = len(text.encode("utf-8")) / 1024
    print(f"\n準備寫出 {kb:.0f}KB")
    print("最大的 12 個地名:", "・".join(l["name"] for l in labels[:12]))

    assert geo.get("water_line") and geo.get("rail"), "關鍵圖層是空的，查詢可能失效"
    assert kb < 2000, f"{kb:.0f}KB 太大，開場會被拖垮，抽稀要再狠一點"
    # 江戶城的堀是這份資料的賣點（見檔頭），抓不到就是查詢或 bbox 壞了
    moats = [l["name"] for l in labels if "濠" in l["name"] or "淵" in l["name"]]
    assert len(moats) >= 3, f"江戶城的堀只抓到 {moats}，bbox 或查詢可能不對"
    # 錨點現在一律取自框內的點，所以這裡可以嚴格驗——有一個在框外就是算錯了。
    # 先前放寬成 70% 是錯的：它讓真間川、玉川上水、江戸川三個名字飄在畫紙外面，
    # 一路到使用者截圖才發現。「大部分是對的」不是一個檢查。
    stray = [l["name"] for l in labels
             if not (bw <= l["lng"] <= be and bs <= l["lat"] <= bn)]
    assert not stray, f"這些地名的錨點落在畫框外：{stray}"
    print(f"江戶城的堀抓到 {len(moats)} 個:", "・".join(moats))
    # 廣重畫最多次的幾個水體。這幾個先前全數缺席（都是 relation），
    # 而且缺席時完全不會報錯——所以要點名驗，不能只看總數。
    must = ["不忍池", "隅田川", "神田川", "日本橋川", "半蔵濠"]
    got = {l["name"] for l in labels}
    missing = [m for m in must if m not in got]
    assert not missing, f"點名驗失敗，這幾個沒抓到：{missing}"
    print("點名驗過:", "・".join(must))

    # data/edo-places.json 是人工挑的白名單，靠名字字串連到這份檔案。
    # OSM 隨時可能改名或拆併，連結斷掉不會有任何錯誤——地名只是默默不見了。
    # 所以重抓完一定要對一次。
    curated = ROOT / "data" / "edo-places.json"
    if curated.exists():
        want = [p["osm"] for p in json.loads(curated.read_text(encoding="utf-8"))["places"]]
        lost = [n for n in want if n not in got]
        assert not lost, f"edo-places.json 這些名字在 OSM 已經找不到了：{lost}"
        print(f"白名單 {len(want)} 個地名全部對得上")

    out = ROOT / "data" / "geo" / "modern.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    print(f"寫出 {out.relative_to(ROOT)}")
    print("self-check ok")


if __name__ == "__main__":
    main()
