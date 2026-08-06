#!/usr/bin/env python3
"""§2.4 垂直切片：抓已人工核對過的「百景 ↔ 名所圖會」配對插圖。

為什麼是手工表：圖會的 1,242 開頁掃描沒有逐頁地名，自動配對三條路都失敗
（目次頁、影像分類、Commons 逐幅插圖）——見 §7-14。
Commons 上只有 26 幅被逐幅拆出並標了地名，且詞彙重疊會產生大量錯配
（Nakano Pagoda→増上寺塔、目白不動→王子不動、高田八幡宮→高田姿見のはし 都是假陽性）。

所以這裡是**逐筆看過畫面才寫的**配對，不是分數湊出來的。§2.4 的機制先用這幾景跑起來，
證明玩法成立再決定要不要為它翻完 1,242 開（spec §2.4 自己也說「建議先做 10 景試跑」）。

用法： python3 tools/fetch-plates.py [--write]
"""
import argparse, json, time, urllib.parse
from pathlib import Path

from fetchlib import fetch, get_json

UA = "edo-hyakkei/0.1 (research; contact: ferrari828@gmail.com)"
ROOT = Path(__file__).resolve().parent.parent
API = "https://commons.wikimedia.org/w/api.php?"

# 百景編號 → Commons 檔名。每一筆的判斷依據都寫在後面。
PAIRS = {
    1:   ("File:Edo Meisho Zue 01 Nihonbashi.jpg", "同為日本橋本身"),
    22:  ("File:Edo Meisho Zue 07 Hiroo-no-hara.jpg", "広尾／広尾ふる川 同地"),
    48:  ("File:Edo Meisho Zue 01 Ochanomizu Suidobashi.jpg", "水道橋 同名"),
    68:  ("File:Edo Meisho Zue 18 Tomioka Hachiman-gu 01.jpg", "富岡八幡宮＝深川八まん"),
    110: ("File:Edo Meisho Zue 04 Senzoku-no-ike.jpg", "千束の池 同名"),
    116: ("File:Edo Meisho Zue 12 Omokage bridge and Sugatami bridge.jpg",
          "姿見の橋・俤の橋 兩座橋在兩邊標題都出現；圖中題簽亦確認"),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="下載並回填 views.json")
    args = ap.parse_args()

    titles = [t for t, _ in PAIRS.values()]
    d = get_json(API + urllib.parse.urlencode(
        {"action": "query", "titles": "|".join(titles), "prop": "imageinfo",
         "iiprop": "size|url", "iiurlwidth": "1600", "format": "json"}), UA)
    got = {}
    for p in d["query"]["pages"].values():
        if "imageinfo" in p:
            ii = p["imageinfo"][0]
            got[p["title"]] = ((ii.get("thumburl") or ii["url"]).split("?")[0],
                               ii["width"], ii["height"])

    missing = [t for t in titles if t not in got]
    print(f"配對 {len(PAIRS)} 景，Commons 取得 {len(got)}／{len(titles)}")
    if missing:
        print(f"⚠️ 找不到（檔名可能被改）：{missing}")

    if not args.write:
        for vid, (t, why) in sorted(PAIRS.items()):
            mark = "✓" if t in got else "✗"
            print(f"  {mark} no.{vid:>3}  {why}")
        print("\n（未加 --write，沒有下載）")
        return

    dest = ROOT / "assets" / "meishozue"
    dest.mkdir(parents=True, exist_ok=True)
    views = json.loads((ROOT / "data" / "views.json").read_text(encoding="utf-8"))
    by = {v["id"]: v for v in views}
    n = 0
    for vid, (t, why) in sorted(PAIRS.items()):
        if t not in got:
            continue
        url, w, h = got[t]
        out = dest / f"{vid:03d}.jpg"
        if not out.exists():
            out.write_bytes(fetch(url, UA, timeout=180).read())
            time.sleep(0.6)
        by[vid]["assets"]["meishozue"] = True      # 路徑推導得出，這裡只記「有沒有」
        by[vid]["notes"]["commentary"] = f"名所圖會對照：{why}"
        n += 1
        print(f"  no.{vid:>3}  {out.name}  {out.stat().st_size // 1024}KB  ({why})")

    (ROOT / "data" / "views.json").write_text(
        json.dumps(views, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    linked = sum(1 for v in views if v["assets"]["meishozue"])
    print(f"\nviews.json 已標記 {linked} 景有圖會對照")
    assert linked == n, "回填數與下載數不符"
    print("self-check ok")


if __name__ == "__main__":
    main()
