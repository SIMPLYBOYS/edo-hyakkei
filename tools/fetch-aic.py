#!/usr/bin/env python3
"""§7-9 用羅馬拼音把 AIC 館藏對回百景編號，取每景解析度最高的一刷。

為什麼是 AIC：Brooklyn 硬封、Met 只有部分且會 403、MIA 的 IIIF 主機已不存在。
AIC 331 件全公有領域、IIIF 免 key，且藏有同一圖的多種刷次（§5.2 要的顏色比對材料）。

對號分三段，**每一段的把握度不同，所以分開報**：
  1. 拼音正規化後精確相符      → 確定
  2. 折疊濁音後相符            → 確定（連濁是規律現象，非猜測）
  3. difflib 模糊比對過門檻     → **列出來給人看**，不靜靜寫進去

不做無把握的猜測：三段都不過的就是沒對上，照實報。

用法：
  python3 tools/fetch-aic.py                 # 只對號 + 報告
  python3 tools/fetch-aic.py --write         # 對號結果寫進 data/aic.json
  python3 tools/fetch-aic.py --write --download
"""
import argparse, difflib, json, re, time, unicodedata, urllib.parse
from pathlib import Path

from fetchlib import fetch, get_json, jpeg_size

UA = "edo-hyakkei/0.1 (research; contact: ferrari828@gmail.com)"
ROOT = Path(__file__).resolve().parent.parent
API = "https://api.artic.edu/api/v1/artworks"
IIIF = "https://www.artic.edu/iiif/2"
SERIES = "One Hundred Famous Views of Edo"
FIELDS = "id,title,artist_title,image_id,is_public_domain,date_display,main_reference_number"
FUZZ = 0.82                                    # 模糊比對門檻，寧可漏不可錯配

# 歷史假名讀法：同一個標題，各館採的讀音差到音韻折疊與模糊比對都接不上。
# 這兩筆是逐一查證過畫作本身才寫的，不是湊分數；有第三筆再往下加。
#   no.8   する賀てふ      → 歷史假名 tefu ＝ 現代 chō
#   no.118 ゑの木大晦日     → wenoki ōtsugomorihi ＝ enoki omisoka
ALIAS = {8: ["Surugacho"], 118: ["Oji shozoku enoki omisoka no kitsunebi"]}


def norm(s):
    """拼音正規化：去長音符號、逐詞折疊長音。
    長音折疊一定要逐詞做，整串做會跨詞界吃字
    （kameido umeyashiki → kameidoumeyashiki → kameidomeyashiki）。"""
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    out = []
    for w in re.findall(r"[a-z]+", s.lower()):
        if w == "and":
            continue                            # AIC 有 "Horie and Nekozane" 這種接詞
        for a, b in (("ou", "o"), ("uu", "u"), ("oo", "o")):
            w = w.replace(a, b)
        out.append(w)
    return "".join(out)


def devoice(s):
    """折疊濁音。連濁（tsutsumi↔zutsumi、hashi↔bashi）與清濁書寫差異
    （Kamada↔Kamata、Ōtenma↔Odenma）在各館轉寫間普遍存在，是規律不是巧合。"""
    s = s.replace("ch", "s").replace("ts", "s").replace("dz", "s")
    return s.translate(str.maketrans("gzdbpj", "ssthhs"))




def px_count(p):
    w, h = jpeg_size(p)
    return w * h


def aic_romaji(t):
    t = re.sub(r",?\s*from the series.*$", "", t or "", flags=re.I).strip()
    m = re.search(r"\(([^)]+)\)\s*$", t)
    return m.group(1) if m else t


def harvest():
    rows, page = [], 1
    while page <= 12:
        d = get_json(f"{API}/search?" + urllib.parse.urlencode(
            {"q": SERIES, "limit": 100, "page": page, "fields": FIELDS}), UA)
        keep = [a for a in d["data"] if SERIES.lower() in (a.get("title") or "").lower()]
        rows += keep
        if not d["data"] or (not keep and page > 2):
            break                               # 相關度排序，掉到 0 就沒必要再翻
        page += 1
        time.sleep(0.3)
    return [a for a in rows if a.get("image_id") and a.get("is_public_domain")]


def match(views, aic):
    exact = {}
    for v in views:
        exact.setdefault(norm(v["title"]["romaji"]), []).append(v["id"])
        for alt in ALIAS.get(v["id"], []):
            exact.setdefault(norm(alt), []).append(v["id"])
    dev = {}
    for k, ids in exact.items():
        dev.setdefault(devoice(k), []).extend(ids)
    # 折疊後撞號代表兩張不同的畫被折成同一把鑰匙，那把鑰匙就不能用
    bad = {k for k, ids in dev.items() if len(set(ids)) > 1}

    hits, fuzzy, misses = {}, [], []
    for a in aic:
        k = norm(aic_romaji(a["title"]))
        if k in exact:
            hits.setdefault(exact[k][0], []).append(("exact", a))
            continue
        dk = devoice(k)
        if dk in dev and dk not in bad:
            hits.setdefault(dev[dk][0], []).append(("devoiced", a))
            continue
        near = difflib.get_close_matches(dk, [x for x in dev if x not in bad], 1, FUZZ)
        if near:
            vid = dev[near[0]][0]
            score = difflib.SequenceMatcher(None, dk, near[0]).ratio()
            hits.setdefault(vid, []).append(("fuzzy", a))
            fuzzy.append((vid, score, aic_romaji(a["title"])))
        else:
            misses.append(aic_romaji(a["title"]))
    return hits, fuzzy, misses, bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--download", action="store_true")
    ap.add_argument("--size", default="full", help="IIIF size，預設 full（原尺寸）")
    args = ap.parse_args()

    views = json.loads((ROOT / "data" / "views.json").read_text(encoding="utf-8"))
    aic = harvest()
    print(f"AIC 取得 {len(aic)} 件（公有領域且有圖）")

    hits, fuzzy, misses, bad = match(views, aic)
    kinds = [k for v in hits.values() for k, _ in v]
    print(f"對上 {len(kinds)} 件，涵蓋 {len(hits)}/118 景"
          f"（精確 {kinds.count('exact')}／濁音折疊 {kinds.count('devoiced')}／模糊 {kinds.count('fuzzy')}）")
    if bad:
        print(f"⚠️ 折疊後撞號、該鑰匙已停用：{len(bad)} 組")
    if fuzzy:
        print(f"\n⚠️ 模糊比對的 {len(fuzzy)} 件，**需人工確認**：")
        seen = set()
        for vid, sc, t in sorted(fuzzy, key=lambda x: x[1]):
            if vid in seen:
                continue
            seen.add(vid)
            ours = next(v["title"]["romaji"] for v in views if v["id"] == vid)
            print(f"    no.{vid:>3} {sc:.2f}  我們:{ours[:32]:<34} AIC:{t[:34]}")
    # 免費的正確性檢查：部分 AIC 標題自帶 "No.13" 這種編號。
    # 有寫的就拿來驗對號結果——錯配正是這整段最危險的失敗模式，能驗就要驗。
    conflict = [(vid, n, a["title"][:50]) for vid, v in hits.items() for _, a in v
                if (n := (re.search(r"\bNo\.\s*(\d{1,3})", a["title"] or "") or [None, None])[1])
                and int(n) != vid]
    checked = sum(1 for v in hits.values() for _, a in v if re.search(r"\bNo\.\s*\d", a["title"] or ""))
    print(f"\nAIC 標題自帶編號可驗的 {checked} 件：{'全部吻合 ✅' if not conflict else f'❌ {len(conflict)} 件衝突'}")
    for vid, n, t in conflict[:10]:
        print(f"    對到 no.{vid} 但 AIC 標題寫 No.{n}  |  {t}")
    assert not conflict, "對號與 AIC 自帶編號衝突，先查清楚再繼續"

    gaps = [v["id"] for v in views if v["id"] not in hits]
    print(f"\n沒對上的百景編號（{len(gaps)}）：{gaps}")
    print(f"沒對上的 AIC 件數：{len(misses)}")

    best = {vid: max((a for _, a in v), key=lambda a: a["id"]) for vid, v in hits.items()}
    index = {
        "source": {"institution": "Art Institute of Chicago", "iiif": IIIF,
                   "license": "public domain (CC0)"},
        "note": "best=每景挑一刷下載；impressions 保留其餘刷次的 IIIF id，需要時再取",
        "views": {str(vid): {
            "best": {"aic_id": best[vid]["id"], "image_id": best[vid]["image_id"],
                     "title": best[vid]["title"], "ref": best[vid].get("main_reference_number"),
                     "date": best[vid].get("date_display"),
                     "match": next(k for k, a in hits[vid] if a["id"] == best[vid]["id"])},
            "impressions": [{"aic_id": a["id"], "image_id": a["image_id"]} for _, a in hits[vid]],
        } for vid in sorted(hits)},
    }
    assert len(hits) >= 100, "涵蓋率過低，AIC API 或標題格式可能變了"

    if args.write:
        p = ROOT / "data" / "aic.json"
        p.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\n寫出 {p.relative_to(ROOT)}")
    print("self-check ok")

    if args.download:
        dest = ROOT / "assets" / "hires"
        dest.mkdir(parents=True, exist_ok=True)
        print(f"\n下載中（{len(best)} 張，IIIF size={args.size}）…")
        for vid in sorted(best):
            out = dest / f"{vid:03d}.jpg"
            if out.exists():
                continue
            url = f"{IIIF}/{best[vid]['image_id']}/full/{args.size}/0/default.jpg"
            out.write_bytes(fetch(url, UA, timeout=180, retry_on=(403, 429),
                                  headers={"AIC-User-Agent": UA}).read())
            time.sleep(1.0)                     # AIC 節流很緊，別搶
        mb = sum(f.stat().st_size for f in dest.glob("*.jpg")) / 1024 / 1024
        print(f"  {len(list(dest.glob('*.jpg')))} 張，{mb:.0f}MB")

        # AIC 不是每張都比較大：Commons 上有少數幾張本來就是高解析度掃描。
        # assets/hires/ 的定義是「現有最好的一張」，所以逐張比過才算數。
        orig = ROOT / "assets" / "originals"
        swapped = []
        for f in sorted(dest.glob("*.jpg")):
            o = orig / f.name
            if o.exists() and px_count(o) > px_count(f):
                swapped.append((int(f.stem), jpeg_size(f), jpeg_size(o)))
                f.write_bytes(o.read_bytes())
        if swapped:
            print(f"\n{len(swapped)} 張 Commons 版本較大，已改用 Commons：")
            for i, a, b in swapped:
                print(f"    no.{i:>3}  AIC {a[0]}x{a[1]} → Commons {b[0]}x{b[1]}")
        small = [(int(f.stem), jpeg_size(f)) for f in sorted(dest.glob("*.jpg"))
                 if jpeg_size(f)[0] < 900]
        if small:
            print(f"⚠️ 仍偏小、需另找來源：{[(i, f'{w}x{h}') for i, (w, h) in small]}")


if __name__ == "__main__":
    main()
