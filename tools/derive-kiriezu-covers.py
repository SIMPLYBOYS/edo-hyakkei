#!/usr/bin/env python3
"""切繪圖 28 張各自涵蓋哪一帶 → data/kiriezu.json 的 covers，
並把 118 景各自對到一張 → views.json 的 place.kiriezu。

**怎麼定「涵蓋哪裡」而不用猜**：切繪圖的圖名就是地名，而**江戶的地名在
現代町名裡活得相當好**——麻布・赤坂・深川・本所・浅草・下谷・巣鴨・音羽・
駒込・根岸・谷中・番町，今天都還是町名。所以拿圖名的關鍵詞去比對 OSM 的
町點，取重心，就得到一張圖的實際位置——**不是我憑印象標的**。

關鍵詞是人工從圖名拆的（見 KEYWORDS），那一步透明可查：
「今戸箕輪浅草絵図」→ 今戸・箕輪・浅草，只是斷詞，沒有加入圖名以外的知識。

**這個對應是「這一帶」不是「這一點」。** 切繪圖一張涵蓋數平方公里，
邊界互相重疊，而且比例不均。所以：
  · 只在最近的那張 2.5km 內才對上，超過就留 null——寧可不說
  · 畫面上的說法是「這一帶的切繪圖」，不是「這個地點在這張圖的某處」

用法： python3 tools/derive-kiriezu-covers.py [--write]
"""
import argparse, json, math, sys, urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetchlib import fetch

ROOT = Path(__file__).resolve().parent.parent
UA = "edo-hyakkei/1.0 (research; contact via repo)"
API = "https://overpass-api.de/api/interpreter"
BBOX = "35.535,139.565,35.805,139.925"
QUERY = f"""[out:json][timeout:180];
node["place"~"^(quarter|neighbourhood|suburb|town)$"]["name"]({BBOX});
out;"""

# 圖名の斷詞のみ。圖名に無い地名は足さない——足した瞬間に
# 「私の記憶」が根拠になってしまい、確かめようがなくなる。
# 旧字・旧表記は現代の町名に合わせる（八町堀→八丁堀、四ツ谷→四谷）。
# 圖名の斷詞のみ。圖名に無い地名は足さない——足した瞬間に
# 「私の記憶」が根拠になってしまい、確かめようがなくなる。
# 旧字・旧表記は現代の町名に合わせる（八町堀→八丁堀、四ツ谷→四谷）。
#
# 🔴 **同じ語を二枚に入れてはいけない。** 最初「浅草」を〈今戸箕輪浅草絵図〉と
# 〈浅草御蔵前辺図〉の両方に入れたところ、重心が寄って浅草寺が御蔵前の図に
# 落ちた。「浅草御蔵前」は複合語（浅草の御蔵前）で、区の名は御蔵前のほう——
# 斷詞の誤り。白金・青山・湯島・日本橋も同じ重複をしていた。
# 下の assert が二度と黙って混ざらないようにする。
KEYWORDS = {
    "下谷絵図": ["下谷", "上野"],
    "今戸箕輪浅草絵図": ["今戸", "三ノ輪", "浅草", "橋場"],
    "浅草御蔵前辺図": ["蔵前", "駒形", "三筋"],
    "日本橋北神田浜町絵図": ["日本橋", "神田", "浜町", "馬喰町", "小伝馬"],
    "御江戸大名小路絵図": ["丸の内", "大手町", "有楽町"],
    "外桜田永田町絵図": ["永田町", "霞が関", "内幸町"],
    "御江戸番町絵図": ["番町", "麹町", "九段"],
    "駿河台小川町絵図": ["駿河台", "小川町", "神保町", "猿楽町"],
    "築地八町堀日本橋南絵図": ["築地", "八丁堀", "京橋", "銀座", "新富"],
    "芝愛宕下絵図": ["愛宕", "新橋", "虎ノ門"],
    "芝高輪辺絵図": ["高輪", "三田", "芝浦"],
    "目黒白金辺図": ["目黒", "白金", "上大崎"],
    "麻布絵図": ["麻布", "六本木"],
    "赤坂絵図": ["赤坂"],
    "青山渋谷絵図": ["青山", "渋谷", "神宮前", "広尾"],
    "四ツ谷絵図": ["四谷", "信濃町", "須賀町"],
    "内藤新宿千駄ヶ谷絵図": ["千駄ヶ谷", "内藤町"],
    "市ヶ谷牛込絵図": ["市谷", "市ヶ谷", "牛込", "神楽坂"],
    "大久保絵図": ["大久保", "百人町", "戸山"],
    "小日向絵図": ["小日向", "関口", "目白台"],
    "音羽絵図": ["音羽", "雑司が谷", "護国寺"],
    "巣鴨絵図": ["巣鴨", "大塚"],
    "駒込絵図": ["駒込", "田端"],
    "本郷湯島絵図": ["本郷", "湯島", "西片"],
    "根岸谷中辺絵図": ["根岸", "谷中", "日暮里"],
    "隅田川向島絵図": ["向島", "堤通"],
    "本所絵図": ["本所", "石原", "亀沢", "横網"],
    "深川絵図": ["深川", "門前仲町", "富岡", "佐賀", "清澄"],
}
# 一語が二枚に入ると重心が寄って、隣り合う図の取り違えが起きる（浅草で実際に起きた）
_seen = {}
for _t, _ws in KEYWORDS.items():
    for _w in _ws:
        assert _w not in _seen, f"「{_w}」が {_seen[_w]} と {_t} の両方にある"
        _seen[_w] = _t

NEAR_KM = 2.5          # これより遠ければ「この一帯」とは言えない

# 🔴 部分一致で拾ってはいけない。日本の地名は部品を共有する——
# 「大塚」で拾ったら大田区の**雪谷大塚町**が当たり、洗足池（巣鴨から 16km）が
# 〈巣鴨絵図〉になった。実際に起きた。
# なので **先頭一致**。ただし東西南北などの接頭辞は一つだけ許す
# （東上野・西巣鴨・南青山は同じ町域なので落としたくない）。
PREFIX = "東西南北中上下新元本奥"


def match(name, kws):
    for w in kws:
        if name.startswith(w):
            return True
        if len(name) > 1 and name[0] in PREFIX and name[1:].startswith(w):
            return True
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    url = API + "?" + urllib.parse.urlencode({"data": QUERY})
    nodes = [(e["tags"]["name"], e["lon"], e["lat"])
             for e in json.load(fetch(url, UA, timeout=240,
                                      retry_on=(429, 502, 503, 504)))["elements"]
             if e.get("tags", {}).get("name")]
    print(f"OSM の町点 {len(nodes)}")

    kp = ROOT / "data" / "kiriezu.json"
    kz = json.loads(kp.read_text(encoding="utf-8"))
    k = math.cos(math.radians(35.67))

    # 各図の当たった町点をそのまま持っておく。割り当ては重心ではなく
    # **最寄りの町点**で決める——重心だと図幅の形が細長いとき（深川は広がり
    # 3.7km）や、境目にある景（上野広小路）で隣の図に落ちる。実際に落ちた。
    owned = []          # (町名, lng, lat, 図)
    for s in kz["sheets"]:
        kws = KEYWORDS.get(s["title"])
        assert kws, f"{s['title']} の斷詞が無い"
        hit = [(n, lo, la) for n, lo, la in nodes if match(n, kws)]
        assert hit, f"{s['title']}（{kws}）に一致する町点が無い"
        # 同じ名の町が遠くにもある場合がある（先頭一致でも起きうる）。
        # 中央値から 6km 以上離れた点は別物として落とす。
        mx = sorted(x[1] for x in hit)[len(hit)//2]
        my = sorted(x[2] for x in hit)[len(hit)//2]
        far = [x[0] for x in hit
               if math.hypot((x[1]-mx)*k, x[2]-my) * 111.19 > 6]
        if far:
            print(f"    外れ値を除外: {'、'.join(far[:4])}")
            hit = [x for x in hit if x[0] not in set(far)]
        lo = sum(x[1] for x in hit) / len(hit)
        la = sum(x[2] for x in hit) / len(hit)
        sp = sum(math.hypot((x[1]-lo)*k, x[2]-la) * 111.19 for x in hit) / len(hit)
        s["covers"] = {"lng": round(lo, 5), "lat": round(la, 5),
                       "spread_km": round(sp, 2), "matched": len(hit), "keywords": kws}
        owned += [(n, x, y, s) for n, x, y in hit]
        print(f"  {s['title']:<24}{len(hit):>3} 点  広がり {sp:.1f}km")

    kz.pop("_todo", None)
    kz["_covers"] = ("covers は圖名の地名を OSM の町点に当てて出した重心。"
                     "「この一帯」であって「この一点」ではない——切繪圖一枚は数 km 四方、"
                     "境界は互いに重なり、比例も不均一。")

    vp = ROOT / "data" / "views.json"
    views = json.loads(vp.read_text(encoding="utf-8"))
    hit = 0
    for v in views:
        s0 = v.get("subject") or {}
        v.setdefault("place", {})
        v["place"]["kiriezu"] = None
        if s0.get("lat") is None:
            continue
        best, bd, bn = None, 1e9, None
        for n, lo, la, sh in owned:
            d = math.hypot((lo - s0["lng"]) * k, la - s0["lat"]) * 111.19
            if d < bd:
                best, bd, bn = sh, d, n
        if bd <= NEAR_KM:
            v["place"]["kiriezu"] = {"pid": best["pid"], "title": best["title"],
                                     "km": round(bd, 2), "near": bn}
            hit += 1
    print(f"\n対応がついた景 {hit} / {len(views)}（{NEAR_KM}km 以内）")

    # ── 検査。点名で。総数では「肝心の景が外れている」を捕まえられない ──
    by = {v["id"]: v for v in views}
    # 期待値は「その地名がどこにあるか」で決まるものだけを書く。
    # 浅草寺は浅草に、深川三十三間堂は深川に、下谷広小路は下谷にある——
    # これは確かめられる。図幅の端がどこまでかは実物を検分していないので
    # 書かない（no.110 千束池を「圖幅外」と書いて落ちたが、それは検分した
    # 事実ではなく私の推測だった。推測を assert に書いてはいけない）。
    must = {99: "今戸箕輪浅草絵図", 69: "深川絵図", 111: "目黒白金辺図",
            1: "日本橋北神田浜町絵図", 51: "御江戸番町絵図", 13: "下谷絵図",
            79: "芝愛宕下絵図", 106: "深川絵図", 92: "隅田川向島絵図",
            87: None}       # 井之頭は三鷹、最寄りの町点から 15km——これは疑いない
    for i, want in must.items():
        got = (by[i]["place"]["kiriezu"] or {}).get("title")
        print(f"  no.{i:<4}{by[i]['title']['ja'][:16]:<18}{str(got):<22}（{want} を期待）")
        assert got == want, f"no.{i} が {got}"

    if args.write:
        kp.write_text(json.dumps(kz, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        vp.write_text(json.dumps(views, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print("寫入 kiriezu.json / views.json")
    else:
        print("（--write 才會寫檔）")
    print("self-check ok")


if __name__ == "__main__":
    main()
