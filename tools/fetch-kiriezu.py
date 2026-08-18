#!/usr/bin/env python3
"""江戶切繪圖（尾張屋版）索引 → data/kiriezu.json

**為什麼要有這批**：1858 那一側的地圖沒有街。現在滑到江戶只剩水系、地形、
寺社境內——可是江戶是一座城，看不到町。切繪圖是當時實際在用的市街圖，
上面有町名、大名屋敷的戶名、寺社、橋、御門。

🔴 **但它不能疊到現代地圖上。** 看過實物（番町繪圖）之後就清楚：

  · 方位是斜的，而且每張的偏法不同——四邊的「東南西北」記號各在不同角落
  · 比例不均勻：每塊屋敷的矩形大小是**遷就名字的字數**畫的，不是土地面積
  · 街區是示意格網，不是實測形狀

要疊上去得逐張非剛性變形、每張抓十幾個控制點；就算做了，街區層級仍然是
系統性錯的，卻會看起來很權威。這比「不做」更糟——遊戲裡言之鑿鑿的假知識，
正是 distortions.json 的 _rule 禁的那件事。

所以這批當**文獻**用，不當底圖：某一景所在的那一帶，當時的市街圖長這樣。
不需要對位，而且看得到的東西更多（旗本的名字、寺社、橋名）。

來源：國立國會圖書館數位典藏，IIIF。江戶期刊行，公有領域。
PID 不連號，是掃描 manifest 標題找出來的（見 _how）。

用法：
  python3 tools/fetch-kiriezu.py                 # 只建索引
  python3 tools/fetch-kiriezu.py --download      # 抓 1600px 瀏覽版到 research/
"""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetchlib import fetch, get_json

ROOT = Path(__file__).resolve().parent.parent
UA = "edo-hyakkei/1.0 (research; contact via repo)"
MANIFEST = "https://dl.ndl.go.jp/api/iiif/{pid}/manifest.json"

# PID 是掃 manifest 標題掃出來的，不是連號：主群 1286656–1286680，
# 但日本橋北神田浜町在 1286645，下谷・浅草三張遠在 1286207–1286209。
# 憑「應該是連號」去猜會漏掉浅草一帶——而那正是百景畫得最密的地方。
PIDS = [1286207, 1286208, 1286209, 1286645] + \
       [p for p in range(1286656, 1286681) if p != 1286661]

# 尾張屋版の切繪圖は**江戸の市街**しか描かない。百景の 13 景（大森・蒲田・
# 羽田・砂村・小松川・中川・新宿・市川・国府台・真間・浦安・川口・三鷹）は
# その外にある。そこは〔江戸近郊図〕が受け持つ——村名・道・神社佛寺・郡界を
# 描いた広域図で、凡例に「名所古跡／佛寺／神社／郡界／村名／新田／里塚／道」。
# 図中の説明に西は小金井橋・南は羽田・北は大宮とあり、東は「下総国」の界線が
# 引かれている（実物で確認）。13 景はすべてこの内側。
#
# **市街図ではないので、画面での言い方も変える**（村の地図であって町の地図ではない）。
SUBURB_PID = 2543086
SUBURB_PX = 3600      # 原寸 13042px。村名まで読ませたいので他より大きく採る


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--download", action="store_true")
    ap.add_argument("--assets", action="store_true",
                    help="遊戲用：2400px 落到 assets/kiriezu/{pid}.jpg")
    ap.add_argument("--size", type=int, default=1600)
    args = ap.parse_args()

    # 🔴 このファイルは derive-kiriezu-covers.py が covers を書き足す先でもある。
    # 素で書き直すと、その派生結果を黙って消す——実際に消した（--assets を
    # 走らせた拍子に 28 枚ぶんの covers が飛んだ）。既存の値は拾って戻す。
    kp = ROOT / "data" / "kiriezu.json"
    prev = {}
    if kp.exists():
        prev = {s["pid"]: s for s in json.loads(kp.read_text(encoding="utf-8"))["sheets"]}

    sheets = []
    for pid in PIDS + [SUBURB_PID]:
        m = get_json(MANIFEST.format(pid=pid), UA)
        label = m.get("label", "")
        md = {d["label"]: d["value"] for d in m.get("metadata", [])}
        cvs = m["sequences"][0]["canvases"]
        # 一枚ものなので面は 1。複数あるなら最大の面を採る
        c = max(cvs, key=lambda c: c["images"][0]["resource"].get("width", 0))
        r = c["images"][0]["resource"]
        sheets.append({
            "pid": pid,
            "role": "suburb" if pid == SUBURB_PID else "city",
            "title": label.split(".")[-1].strip().strip("[]〔〕") or "江戸近郊図",
            "full_title": label,
            "published": str(md.get("出版年月日等", "")).strip() or None,
            "iiif": r["service"]["@id"],
            "px": [r.get("width"), r.get("height")],
        })
        if "covers" in prev.get(pid, {}):
            sheets[-1]["covers"] = prev[pid]["covers"]
        print(f"  {pid}  {sheets[-1]['title']:<22}{r.get('width')}×{r.get('height')}"
              + ("  covers 保留" if "covers" in sheets[-1] else ""))

    assert len(sheets) >= 29, f"只抓到 {len(sheets)} 張（市街 28 ＋ 近郊 1）"
    assert any(x["role"] == "suburb" for x in sheets), "近郊図が無い"
    # 點名：百景畫得最密的幾區缺一不可。只數總數的話，
    # 缺了浅草或深川也一樣是「28 張」。
    got = {s["title"] for s in sheets}
    must = ["今戸箕輪浅草絵図", "深川絵図", "本所絵図", "下谷絵図",
            "日本橋北神田浜町絵図", "目黒白金辺図", "隅田川向島絵図"]
    missing = [m for m in must if m not in got]
    assert not missing, f"缺了 {missing}"

    out = {
        "_": "江戶切繪圖（尾張屋清七板）。國立國會圖書館數位典藏，IIIF，公有領域。",
        "_use": "當**文獻**用，不當底圖：切繪圖方位各異、比例不均、街區是示意格網，"
                "疊到現代地圖上會產生看起來很權威的系統性錯誤。理由詳見 tools/fetch-kiriezu.py。",
        "_how": "PID 以掃描 manifest 標題取得，不連號（見該檔的 PIDS）。",
        "_todo": "covers：每張涵蓋哪一帶，用來把 118 景各自對到一張。尚未填。",
        "sheets": sheets,
    }
    p = kp
    p.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\n{len(sheets)} 張 → data/kiriezu.json")

    if args.assets:
        # 遊戲畫面用。原寸 6144px を丸ごと置いても、重ねて表示する枠は
        # せいぜい 800px——2400px なら拡大しても字が潰れず、28 枚で 30MB 前後。
        d = ROOT / "assets" / "kiriezu"
        d.mkdir(parents=True, exist_ok=True)
        for s2 in sheets:
            f = d / f"{s2['pid']}.jpg"
            if f.exists():
                continue
            px = SUBURB_PX if s2["pid"] == SUBURB_PID else 2400
            f.write_bytes(fetch(f"{s2['iiif']}/full/{px},/0/default.jpg",
                                UA, timeout=240, retry_on=(429, 502, 503, 504)).read())
            print(f"    {f.name}  {f.stat().st_size/1024:.0f}KB  {s2['title']}")
        tot = sum(f.stat().st_size for f in d.glob("*.jpg")) / 1024 / 1024
        print(f"  assets/kiriezu/ 合計 {tot:.0f}MB")

    if args.download:
        d = ROOT / "research" / "kiriezu"
        d.mkdir(parents=True, exist_ok=True)
        for s in sheets:
            f = d / f"{s['pid']}_{s['title']}.jpg"
            if f.exists():
                continue
            f.write_bytes(fetch(f"{s['iiif']}/full/{args.size},/0/default.jpg",
                                UA, timeout=180, retry_on=(429, 502, 503, 504)).read())
            print(f"    {f.name}  {f.stat().st_size/1024:.0f}KB")
    print("self-check ok")


if __name__ == "__main__":
    main()
