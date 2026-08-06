#!/usr/bin/env python3
"""§7-3 抓《名所江戶百景》全套 metadata，產出 data/views.json 骨架。

來源改走 Wikimedia Commons，不是 brooklynmuseum.org —— 2026/08/05 實測
布魯克林全站（含 /api/v2）對外一律回 429，網頁與 API 都進不去。
Commons 上的 Category:One Hundred Famous Views of Edo (Brooklyn Museum)
就是同一批布魯克林掃描（PD-Art），且已帶編號、季節分部、日英標題與座標，
不需 API key。每筆仍保留 brooklyn_url，日後站方通了可直接回頭補高解析度。

用法：
  python3 tools/fetch-brooklyn.py              # 只寫 metadata
  python3 tools/fetch-brooklyn.py --download   # 順便抓圖到 assets/originals/
"""
import argparse, json, re, time, urllib.parse
from pathlib import Path

from fetchlib import fetch, get_json

UA = "edo-hyakkei/0.1 (research; contact: ferrari828@gmail.com)"
API = "https://commons.wikimedia.org/w/api.php"
ROOT = Path(__file__).resolve().parent.parent
CATS = ["Category:One Hundred Famous Views of Edo (Brooklyn Museum)",
        "Category:One Hundred Famous Views of Edo"]
SEASON = {"Spring": "spring", "Summer": "summer", "Autumn": "autumn", "Winter": "winter"}
# §6.1 目録分部——spec 明訂季節以此為準，出版月只是額外欄位
PARTS = [(1, 42, "spring"), (43, 72, "summer"), (73, 98, "autumn"), (99, 118, "winter")]
season_of = lambda n: next((s for a, b, s in PARTS if a <= n <= b), None)


def api(**p):
    p.setdefault("format", "json")
    return get_json(API + "?" + urllib.parse.urlencode(p), UA)


def catfiles(cat):
    out, cont = [], {}
    while True:
        d = api(action="query", list="categorymembers", cmtitle=cat, cmlimit="500",
                cmtype="file", **cont)
        out += [m["title"] for m in d["query"]["categorymembers"]]
        if "continue" not in d:
            return out
        cont = d["continue"]


untag = lambda h: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", h or "")).strip()


def grab(pat, s, default=None):
    m = re.search(pat, s or "")
    return m.group(1) if m else default


def harvest():
    """回傳 {編號: [候選檔案…]}。
    兩條路都要走：分類（連號檔名只覆蓋 113/119，缺號另有其名）＋ 連號檔名
    （有些檔沒被歸進任一分類，例：no.115）。號碼優先認 metadata 的 no. NNN，
    沒有才回退認檔名。"""
    bk = set(catfiles(CATS[0]))
    titles = sorted(bk | set(catfiles(CATS[1]))
                    | {f"File:100 views edo {n:03d}.jpg" for n in range(1, 120)})
    found = {}
    for i in range(0, len(titles), 50):
        d = api(action="query", titles="|".join(titles[i:i + 50]),
                prop="imageinfo", iiprop="url|size|extmetadata")
        for p in d["query"]["pages"].values():
            if "imageinfo" not in p:
                continue
            ii = p["imageinfo"][0]
            m = ii["extmetadata"]
            get = lambda k: m.get(k, {}).get("value")
            desc = untag(get("ImageDescription"))
            num = (grab(r"(?i)no\.\s*(\d{1,3})", desc)          # 有的頁寫 "No. 008"，要 case-insensitive
                   or grab(r"100 views (?:of )?edo (\d{3})", p["title"]))
            if not num:
                continue                      # 系列外的雜檔（畫家肖像等）
            # 標題取 Commons 的結構化 label（QS 那組），別先 strip HTML——
            # 剝完標籤會剩下 "Japanese: …" 前綴，正規式一定咬錯。
            # 但 label 值自己可能包 <a>，所以吃到 "</div> 為止再 untag，
            # 不能用 [^"]+（會斷在 class="extiw" 的引號上，例：no.82 月の岬）。
            name = get("ObjectName") or ""
            lbl = lambda lang: untag(grab(rf'label QS:L{lang},"(.*?)"</div>', name)) or None
            found.setdefault(int(num), []).append({
                "file": p["title"], "url": ii["url"].split("?")[0],
                "w": ii["width"], "h": ii["height"], "brooklyn_scan": p["title"] in bk,
                "season": SEASON.get(grab(r"part\s*\d+:\s*(\w+)", desc, "")),
                "ja": lbl("ja") or untag(grab(r'lang="ja"[^>]*>(.*?)</div>', name)) or None,
                "en": lbl("en") or untag(grab(r'lang="en"[^>]*>(.*?)</div>', name)) or None,
                "artist": untag(get("Artist")),
                "year": grab(r"\b(18\d{2})\b", untag(get("DateTimeOriginal"))),
                "lat": get("GPSLatitude"), "lng": get("GPSLongitude"),
                "brooklyn_url": grab(r"(https?://[^\s\"]*brooklynmuseum\.org[^\s\"]*)", get("Credit")),
                "license": untag(get("LicenseShortName")),
            })
        time.sleep(0.2)
    return found


def build(found, clashes):
    views = []
    for n in sorted(found):
        cs = found[n]
        # 優先布魯克林掃描；同組內取解析度最高的
        c = max(cs, key=lambda c: (c["brooklyn_scan"], c["w"] * c["h"]))
        alt = max(cs, key=lambda c: c["w"] * c["h"])
        if c["season"] and season_of(n) and c["season"] != season_of(n):
            clashes.append((n, c["season"], season_of(n)))
        views.append({
            "id": n,
            # 連號在 1–118 成立（spec §5.1 的 32／82 樣本已對上，另抽驗 no.1）。
            # 119 例外：spec §5.1 說 30.1478.119 是目録，但 Commons／布魯克林
            # 品名都把赤坂桐畑編為 no.119 → 這一枚的館藏號待查，不亂填。
            "accession": f"30.1478.{n}" if n <= 118 else None,
            "title": {"ja": c["ja"], "romaji": None, "en": c["en"]},
            # 分類頁沒寫季節的（靠連號檔名撈到的那批）就用目録分部回推；
            # 兩邊都有時交叉比對，不一致要吵出來——那代表其中一邊的編號有問題
            "season": c["season"] or season_of(n),
            "published": c["year"],                 # Commons 只到年，月份待布魯克林 metadata
            "attribution": "hiroshige2" if re.search(r"\bII\b|二代", c["artist"] or "") else "hiroshige",
            # ⚠️ Commons 的座標是「地點」不是廣重的視點（§6.3-1 要求兩者分開）
            "viewpoint": {"lat": None, "lng": None, "confidence": "unknown"},
            "subject": ({"lat": float(c["lat"]), "lng": float(c["lng"])} if c["lat"] else None),
            "bearing": None,
            "place": {"edo": None, "modern_ward": None, "modern_landmark": None},
            "conditions": {"weather": None, "time_of_day": None},
            # §9.5：只存推導不出來的東西。檔名一律是 {id:03d}.jpg，
            # 存路徑等於把同一條規則抄 119 遍，而且會說謊——檔案搬了、資料夾沒建，
            # 欄位不會自己更新（舊版有 118 筆指向不存在的 assets/pixel/）。
            # 這兩個欄位回答的是「有沒有對照圖」，那才是推導不出來的資訊。
            "assets": {"meishozue": False, "miyage": False},
            "distortions": [],
            # notes 只放這一筆特有的事。119 筆都一樣的句子不是資料，是雜訊。
            "notes": {"geo": None, "commentary": None},
            "source": {
                "institution": "Brooklyn Museum" if c["brooklyn_scan"] else "Wikimedia Commons",
                "commons_file": c["file"], "image_url": c["url"],
                "px": [c["w"], c["h"]], "best_available_px": [alt["w"], alt["h"]],
                "url": c["brooklyn_url"], "license": c["license"] or "public domain",
            },
        })

    # Commons 撈不到的編號也要有骨架記錄，否則後續 fetch-wikipedia／fetch-aic
    # 根本沒有 id 可以對——別家有那張畫也接不上（no.30 就是這樣漏掉的）。
    for n in sorted(set(range(1, 119)) - {v["id"] for v in views}):
        views.append({
            "id": n, "accession": f"30.1478.{n}",
            "title": {"ja": None, "romaji": None, "en": None},
            "season": season_of(n), "published": None, "attribution": "hiroshige",
            "viewpoint": {"lat": None, "lng": None, "confidence": "unknown"},
            "subject": None, "bearing": None,
            "place": {"edo": None, "modern_ward": None, "modern_landmark": None},
            "conditions": {"weather": None, "time_of_day": None},
            "assets": {"meishozue": False, "miyage": False},
            "distortions": [],
            "notes": {"geo": None, "commentary": "Commons 無此圖，待他館補齊"},
            "source": None,
        })
    return sorted(views, key=lambda v: v["id"])


def download(views, dest):
    dest.mkdir(parents=True, exist_ok=True)
    for v in views:
        out = dest / f"{v['id']:03d}.jpg"
        if out.exists() or not v["source"]:          # 骨架記錄沒有圖可抓
            continue
        out.write_bytes(fetch(v["source"]["image_url"], UA, timeout=120).read())
        print(f"  {out.name}  {out.stat().st_size // 1024}KB", flush=True)
        time.sleep(1.0)                              # 對 Commons 客氣一點


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--download", action="store_true", help="順便抓圖到 assets/originals/")
    args = ap.parse_args()

    found = harvest()
    clashes = []
    views = build(found, clashes)
    out = ROOT / "data" / "views.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(views, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    got = {v["id"] for v in views}
    gaps = [v["id"] for v in views if not v["source"]]
    lowres = [v["id"] for v in views if v["source"] and v["source"]["px"][0] < 1000]
    print(f"寫出 {out.relative_to(ROOT)}：{len(views)} 筆（編號 {min(got)}–{max(got)}）")
    print(f"Commons 無圖、僅建骨架 {len(gaps)}：{gaps}")
    print(f"有座標：{sum(1 for v in views if v['subject'])} 筆")
    print(f"⚠️ 寬度<1000px：{len(lowres)} 筆 —— 夠做像素化，不夠做 §2.4 的變造比對")
    for n, a, b in clashes:
        print(f"⚠️ no.{n} 季節打架：Commons 說 {a}，§6.1 目録分部說 {b}")
    for v in views:
        if v["attribution"] == "hiroshige2":
            print(f"⚠️ §9.6：no.{v['id']} 標為二代廣重 → {v['title']['en']}")

    assert len(views) > 100, "抓到的數量不對，API 或分類可能變了"
    assert all(v["season"] for v in views if v["id"] <= 118), "有景缺季節分部"
    # 標題缺漏是資料坑不是程式錯（有些 Commons 頁沒用 Artwork 模板），報出來人工補
    notitle = [v["id"] for v in views if not (v["title"]["ja"] and v["title"]["en"])]
    if notitle:
        print(f"⚠️ 缺標題待人工補：{notitle}")
    assert not [v for v in views if "<" in (v["title"]["ja"] or "") + (v["title"]["en"] or "")], "標題殘留 HTML"
    print("self-check ok")

    if args.download:
        print("\n下載中…")
        download(views, ROOT / "assets" / "originals")


if __name__ == "__main__":
    main()
