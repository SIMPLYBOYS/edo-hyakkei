#!/usr/bin/env python3
"""掃 Commons 上其他批次的高解析度掃描，比 assets/hires/ 現有的大才換掉。

起因：補 no.103／no.89 兩個解析度缺口時，發現 Commons 上還有兩批我們一直沒看到的
（`fetch-brooklyn.py` 只掃了兩個分類 + 連號檔名，這兩批都不在裡面）：

  NDL-DC …  國立國會圖書館批次，檔名帶漢字標題，**統一 4096px 寬**
  LCCN …    美國國會圖書館批次，檔名帶羅馬拼音，部分達 5500–5900px 寬

只升級不降級：逐張比像素，比現有大才下載替換。`assets/originals/` 不動
（那是布魯克林初版，留著是為了 §5.1 的版本來源，不是為了解析度）。

用法： python3 tools/upgrade-hires.py [--apply]
"""
import argparse, json, re, time, unicodedata, urllib.parse
from pathlib import Path

from fetchlib import fetch, get_json, jpeg_size

UA = "edo-hyakkei/0.1 (research; contact: ferrari828@gmail.com)"
ROOT = Path(__file__).resolve().parent.parent
API = "https://commons.wikimedia.org/w/api.php?"
BATCHES = [("NDL-DC", 'intitle:"NDL-DC" intitle:"名所江戸百景"')]
# 其他批次（例如美國國會圖書館那批 LCCN…，部分達 5,900px）**沒有可用的批次查法**：
# 檔名裡不含 Hiroshige 或系列名，intitle:LCCN 配任何關鍵字都回 0。
# 只能靠標題文字逐張搜，所以放在 NDL-DC 之後、只對仍偏小的景做。
FALLBACK_UNDER = 4096

# ponytail: 這裡的拼音正規化跟 fetch-aic.py 是同一套想法但各自一份。
# 折疊寬鬆一點只會少對到幾張並照實報出來，不像下載重試那樣「錯了會靜靜壞掉」，
# 不值得為它多開一個共用模組。
def ja_norm(s):
    """漢字標題正規化。濁點要折掉：NDL 的檔名寫「霞かせき」，我們的資料是
    「霞がせき」，同一張畫。NFD 拆出濁點再丟掉即可（跟拼音去長音符號同一招）。"""
    s = re.sub(r"[\s『』「」・]", "", s or "").translate(str.maketrans("瀧藪", "滝薮"))
    return "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c))


def ro_norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    out = []
    for w in re.findall(r"[a-z]+", s.lower()):
        for a, b in (("ou", "o"), ("uu", "u"), ("oo", "o")):
            w = w.replace(a, b)
        out.append(w)
    s = "".join(out).replace("ch", "s").replace("ts", "s").replace("dz", "s")
    return s.translate(str.maketrans("gzdbpj", "ssthhs"))




def search(q):
    out, off = [], 0
    while True:
        d = get_json(API + urllib.parse.urlencode(
            {"action": "query", "list": "search", "srsearch": q, "srnamespace": "6",
             "srlimit": "500", "sroffset": off, "format": "json"}), UA)
        out += [h["title"] for h in d["query"]["search"]]
        if "continue" not in d:
            return out
        off = d["continue"]["sroffset"]
        time.sleep(0.4)


def sizes(names):
    out = {}
    for i in range(0, len(names), 10):        # 標題很長，批次大了 URL 會爆
        d = get_json(API + urllib.parse.urlencode(
            {"action": "query", "titles": "|".join(names[i:i + 10]), "prop": "imageinfo",
             "iiprop": "size|url", "format": "json"}), UA)
        for p in d["query"]["pages"].values():
            if "imageinfo" in p:
                ii = p["imageinfo"][0]
                out[p["title"]] = (ii["width"], ii["height"], ii["url"].split("?")[0])
        time.sleep(0.25)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="實際下載替換")
    args = ap.parse_args()

    views = json.loads((ROOT / "data" / "views.json").read_text(encoding="utf-8"))
    by_ja = {ja_norm(v["title"]["ja"]): v["id"] for v in views if v["title"]["ja"]}
    by_ro = {ro_norm(v["title"]["romaji"]): v["id"] for v in views if v["title"]["romaji"]}

    best = {}
    for label, q in BATCHES:
        names = search(q)
        got = sizes(names)
        n = 0
        for t, (w, h, u) in got.items():
            if not t.lower().endswith((".jpg", ".jpeg")):
                continue                       # .tif 同尺寸但檔案大得多，不划算
            if label == "NDL-DC":
                m = re.search(r"名所江戸百景\s*(.+?)(?:-[^-]*)?\.jpe?g$", t)
                key = by_ja.get(ja_norm(re.sub(r"-(安政|文久|万延)\d*.*$", "", m.group(1)))) if m else None
            else:
                key = by_ro.get(ro_norm(re.sub(r"\s*LCCN.*$", "", t[5:])))
            if key and (key not in best or w * h > best[key][0] * best[key][1]):
                best[key] = (w, h, u, label)
                n += 1
        print(f"{label}: {len(names)} 檔 → 對上並成為候選 {n} 景")

    dest = ROOT / "assets" / "hires"

    # 逐張補搜：只找仍偏小的，且**檔名必須含該景的漢字或拼音才採用**——
    # 全站搜很容易撈到別張畫，沒有這道識別就會把錯的圖裝進去而且不會報錯。
    todo = [v for v in views if v["id"] <= 118
            and best.get(v["id"], (0,))[0] < FALLBACK_UNDER
            and jpeg_size(dest / f"{v['id']:03d}.jpg")[0] < FALLBACK_UNDER]
    print(f"\n逐張補搜 {len(todo)} 景（NDL-DC 未涵蓋且現有 <{FALLBACK_UNDER}px）…")
    for v in todo:
        for q in filter(None, [v["title"]["romaji"], v["title"]["ja"]]):
            d = get_json(API + urllib.parse.urlencode(
                {"action": "query", "list": "search", "srsearch": f"{q} Hiroshige",
                 "srnamespace": "6", "srlimit": "8", "format": "json"}), UA)
            names = [h["title"] for h in d["query"]["search"]]
            for t, (w, h, u) in (sizes(names) if names else {}).items():
                if not t.lower().endswith((".jpg", ".jpeg")) or w >= h:
                    continue     # 百景全是直幅大判；橫幅一定是別的作品
                                 # （no.2 差點裝到 Rijksmuseum 的《江都名所》橫幅）
                ok = ja_norm(v["title"]["ja"] or "\0") in ja_norm(t) or \
                    ro_norm(v["title"]["romaji"] or "\0") in ro_norm(t)
                if ok and w * h > best.get(v["id"], (0, 0))[0] * best.get(v["id"], (0, 1))[1]:
                    best[v["id"]] = (w, h, u, "逐張補搜")
            time.sleep(0.4)

    up, same = [], 0
    for vid, (w, h, u, label) in sorted(best.items()):
        cur = dest / f"{vid:03d}.jpg"
        cw, ch = jpeg_size(cur) if cur.exists() else (0, 0)
        if w * h > cw * ch:
            up.append((vid, (cw, ch), (w, h), u, label))
        else:
            same += 1
    print(f"\n可升級 {len(up)} 景，現有已較大或相同 {same} 景")
    for vid, a, b, _, label in up[:8]:
        print(f"    no.{vid:>3}  {a[0]}x{a[1]} → {b[0]}x{b[1]}  ({label})")
    if len(up) > 8:
        print(f"    …另 {len(up) - 8} 景")

    if not args.apply:
        print("\n（未加 --apply，沒有下載）")
        return
    print(f"\n下載中（{len(up)} 張）…")
    for vid, _, _, u, _ in up:
        (dest / f"{vid:03d}.jpg").write_bytes(fetch(u, UA, timeout=300).read())
        time.sleep(1.0)
    ws = sorted(jpeg_size(p)[0] for p in dest.glob("*.jpg"))
    mb = sum(p.stat().st_size for p in dest.glob("*.jpg")) / 1024 / 1024
    print(f"完成。assets/hires 寬 min/中位/max = {ws[0]}/{ws[len(ws)//2]}/{ws[-1]}，共 {mb:.0f}MB")


if __name__ == "__main__":
    main()
