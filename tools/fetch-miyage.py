#!/usr/bin/env python3
"""§7-11 抓《繪本江戶土產》全冊（Commons 上的 Musée Cernuschi 逐頁掃描）。

找法：先前找 NDL-DC 那批高解析度時發現 Commons 的檔名裡常內嵌館藏編號，
用同一招搜 "Ehon Edo miyage" 就撈到這批 —— 逐頁 JPG、連號、頁碼 1–113 無缺、
中位 5,481px 寬。比 §5.3 原本設想的「整冊掃描」好用得多，不必自己切頁。

備援：Commons 上另有 NDL 的整冊 PDF 14 冊（`NDL8369306 絵本江戸土産 10編.(1).pdf`
那組），逐頁這批若有問題再回頭用。

**這批不進 build**，落在 research/ ——原始冊頁是研究材料，
遊戲只用 §7-12 配對後裁出的插圖（assets/miyage/NNN.jpg，見 §6.2）。

用法：
  python3 tools/fetch-miyage.py              # 只建索引 data/miyage.json
  python3 tools/fetch-miyage.py --download
"""
import argparse, json, re, time, urllib.parse
from pathlib import Path

from fetchlib import fetch, get_json, jpeg_size

UA = "edo-hyakkei/0.1 (research; contact: ferrari828@gmail.com)"
ROOT = Path(__file__).resolve().parent.parent
API = "https://commons.wikimedia.org/w/api.php?"
QUERY = 'intitle:"Ehon Edo miyage"'


def harvest(width=0):
    names, off = [], 0
    while True:
        d = get_json(API + urllib.parse.urlencode(
            {"action": "query", "list": "search", "srsearch": QUERY, "srnamespace": "6",
             "srlimit": "500", "sroffset": off, "format": "json"}), UA)
        names += [h["title"] for h in d["query"]["search"]]
        if "continue" not in d:
            break
        off = d["continue"]["sroffset"]
        time.sleep(0.4)

    pages = {}
    names = [n for n in names if n.lower().endswith((".jpg", ".jpeg"))]
    for i in range(0, len(names), 10):          # 標題長，批次大了 URL 會爆
        q = {"action": "query", "titles": "|".join(names[i:i + 10]), "prop": "imageinfo",
             "iiprop": "size|url", "format": "json"}
        if width:
            q["iiurlwidth"] = str(width)        # 讓 Commons 給縮圖 URL，不要自己拼
        d = get_json(API + urllib.parse.urlencode(q), UA)
        for p in d["query"]["pages"].values():
            if "imageinfo" not in p:
                continue
            m = re.search(r"\((\d+)\)", p["title"])
            if not m:
                continue
            ii = p["imageinfo"][0]
            n = int(m.group(1))
            # url 永遠存原尺寸（要細看時的退路）；dl 才是這次要抓的
            cand = {"page": n, "file": p["title"], "url": ii["url"].split("?")[0],
                    "px": [ii["width"], ii["height"]],
                    "dl": (ii.get("thumburl") or ii["url"]).split("?")[0],
                    "dl_px": [ii.get("thumbwidth") or ii["width"],
                              ii.get("thumbheight") or ii["height"]]}
            if n not in pages or ii["width"] * ii["height"] > pages[n]["px"][0] * pages[n]["px"][1]:
                pages[n] = cand
        time.sleep(0.25)
    return pages


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--download", action="store_true")
    ap.add_argument("--size", type=int, default=1500,
                    help="下載寬度 px，預設 1500（翻閱配對用）；0 = 原尺寸")
    args = ap.parse_args()

    pages = harvest(args.size)
    nums = sorted(pages)
    gaps = [n for n in range(nums[0], nums[-1] + 1) if n not in pages]
    w = sorted(p["px"][0] for p in pages.values())
    print(f"取得 {len(pages)} 頁（{nums[0]}–{nums[-1]}），缺頁 {gaps or '無'}")
    print(f"寬 min/中位/max = {w[0]}/{w[len(w)//2]}/{w[-1]}")

    out = ROOT / "data" / "miyage.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({
        "work": "繪本江戶土產",
        "note": "整冊掃描屬研究材料，落在 research/ 不進 build；遊戲只用 §7-12 配對後裁出的插圖",
        "institution": "Musée Cernuschi (via Wikimedia Commons)",
        "license": "public domain",
        "pages": [pages[n] for n in nums],
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"寫出 {out.relative_to(ROOT)}")

    assert not gaps, f"頁碼不連續：{gaps}"
    assert len(pages) > 100, "頁數過少，搜尋條件或這批檔案可能變了"
    print("self-check ok")

    if args.download:
        dest = ROOT / "research" / "miyage"
        dest.mkdir(parents=True, exist_ok=True)
        want = args.size or max(p["px"][0] for p in pages.values())
        print(f"\n下載中（{len(pages)} 頁，寬 {args.size or '原尺寸'}）…")
        for n in nums:
            f = dest / f"p{n:03d}.jpg"
            # 尺寸換了就重抓：已存在但寬度差太多的要覆蓋，否則瘦身不會生效
            if abs(jpeg_size(f)[0] - min(want, pages[n]["px"][0])) <= 2:
                continue
            f.write_bytes(fetch(pages[n]["dl"], UA, timeout=300).read())
            time.sleep(0.8)
        mb = sum(f.stat().st_size for f in dest.glob("*.jpg")) / 1024 / 1024
        print(f"  {len(list(dest.glob('*.jpg')))} 頁，{mb:.0f}MB")


if __name__ == "__main__":
    main()
