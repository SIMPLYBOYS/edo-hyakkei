#!/usr/bin/env python3
"""建立編號↔羅馬拼音對照，並回填 data/views.json。

為什麼需要：AIC／Met／MIA 這些館藏都沒有系列編號，標題又各家英譯不同。
羅馬拼音是同一個日文標題的轉寫，**跨館比英譯穩定得多**，建一次就能當通用鑰匙。

來源是 en.wikipedia「One Hundred Famous Views of Edo」的清單表，每列帶
  編號 / {{nihongo|英譯|漢字|romaji}} / 出版年月 / 座標 / Commons 檔名

⚠️ 維基不是權威，所以**不盲信**：只有當維基的漢字標題與 views.json 既有的
漢字標題一致時才採用該列的拼音（漢字來自 Commons／布魯克林品名）。
兩邊對不上的會列出來人工判，不會靜靜寫進去。

用法： python3 tools/fetch-wikipedia.py [--write]
"""
import argparse, json, math, re, unicodedata, urllib.parse
from pathlib import Path

from fetchlib import get_json

UA = "edo-hyakkei/0.1 (research; contact: ferrari828@gmail.com)"
ROOT = Path(__file__).resolve().parent.parent
PAGE = "One Hundred Famous Views of Edo"

# 清單表沒附座標、Commons 也沒有的，才在這裡補；每筆都要寫出處，不憑印象填。
#   no.64 堀切の花菖蒲 → 現地即今葛飾區堀切菖蒲園，座標取自 ja.wikipedia〈堀切菖蒲園〉
# 注意這是「地點」不是廣重的視點（§6.3-1），仍待 §7-15 查證。
MANUAL_COORD = {64: {"lat": 35.742361, "lng": 139.825972, "src": "ja.wikipedia 堀切菖蒲園"}}


def wikitext():
    q = urllib.parse.urlencode({"action": "parse", "page": PAGE, "prop": "wikitext",
                                "format": "json", "formatversion": "2"})
    return get_json(f"https://en.wikipedia.org/w/api.php?{q}", UA)["parse"]["wikitext"]


def split_params(s):
    """依 | 切模板參數，但要跳過 [[…|…]] 裡的管線符號。"""
    out, buf, depth = [], "", 0
    for ch in s:
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
        if ch == "|" and depth == 0:
            out.append(buf); buf = ""
        else:
            buf += ch
    out.append(buf)
    return out


clean = lambda s: re.sub(r"\s+", " ", re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", s or "")).strip()


def parse(wt):
    rows = {}
    for blk in wt.split("\n|-"):
        # 夏部（45–71）的編號欄寫成 "45 (62)"——兩套編號並存，別漏掉括號那段，
        # 不然整個夏天都解析不到。採用主編號，括號內另存待查。
        num = re.search(r'^\s*!\s*style="[^"]*"\s*\|\s*(\d{1,3})(?:\s*\((\d{1,3})\))?\s*$', blk, re.M)
        nh = re.search(r"\{\{nihongo\|(.*?)\}\}", blk, re.S)
        if not (num and nh):
            continue
        p = [clean(x) for x in split_params(nh.group(1))]
        en, ja = (p + ["", ""])[0], (p + ["", ""])[1]
        romaji = p[2] if len(p) > 2 and p[2] else en   # 省略第三參數 = 拼音同英文
        rows[int(num.group(1))] = {
            "en": en, "ja": ja, "romaji": romaji, "alt_no": num.group(2),
            # {{sort|1856-05|1856 / 5}} → 取可排序的那個，才有月份
            "published": (re.search(r"\{\{sort\|(\d{4}-\d{2})\|", blk) or [None, None])[1],
            "commons": (re.search(r"\[\[File:([^|\]]+)", blk) or [None, None])[1],
            "coord": coord(blk),
        }
    return rows


def dist_km(a, b):
    """兩點距離。江戶尺度用平面近似就夠，不必動用 haversine。"""
    k = math.cos(math.radians(a["lat"]))
    return math.hypot((a["lat"] - b["lat"]) * 111, (a["lng"] - b["lng"]) * 111 * k)


def coord(blk):
    """{{coord|35|41|2.5|N|139|46|28|E|…}} → 十進位度。"""
    m = re.search(r"\{\{coord\|(\d+)\|(\d+)\|([\d.]+)\|N\|(\d+)\|(\d+)\|([\d.]+)\|E", blk)
    if not m:
        return None
    d1, m1, s1, d2, m2, s2 = (float(x) for x in m.groups())
    return {"lat": round(d1 + m1 / 60 + s1 / 3600, 6), "lng": round(d2 + m2 / 60 + s2 / 3600, 6)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="回填 data/views.json")
    args = ap.parse_args()

    rows = parse(wikitext())
    print(f"維基清單解析出 {len(rows)} 列（編號 {min(rows)}–{max(rows)}）")

    vp = ROOT / "data" / "views.json"
    views = json.loads(vp.read_text(encoding="utf-8"))
    # 舊字體↔新字體在兩邊混用（瀧/滝、藪/薮），不折算就會誤判成不同張。
    # 另外要先做 NFC：兩邊有肉眼完全相同卻不相等的字串（no.64 堀切の花菖蒲），
    # 差別在 Unicode 正規化形式，不統一就會白白掉一筆。
    kyuji = str.maketrans("瀧藪", "滝薮")
    norm = lambda s: unicodedata.normalize("NFC",
                                           re.sub(r"[\s『』「」・]", "", (s or ""))).translate(kyuji)

    ok, clash, absent, filematch, filled = [], [], [], 0, []
    coords, far = [], []
    for v in views:
        r = rows.get(v["id"])
        if not r:
            absent.append(v["id"]); continue
        # 兩個獨立證據，任一成立就認定是同一張：
        #   1. 漢字標題一致
        #   2. 維基那列指向的 Commons 檔就是我們抓的那個（精確比對）
        # 只靠 1 會被異體字與贅字打掉（瀧/滝、藪/薮、多了「（江戸百景余興）」等 7 筆）。
        # 骨架記錄（Commons 沒有這張）本來就沒東西可比對，也沒東西可矛盾，
        # 直接採維基那列——它就是這批編號的來源清單本身。
        skeleton = not v["title"]["ja"] and not v["source"]
        same_ja = skeleton or norm(r["ja"]) == norm(v["title"]["ja"])
        cf = (v["source"] or {}).get("commons_file") or ""      # 骨架記錄沒有 source
        same_file = bool(r["commons"]) and r["commons"].replace("_", " ") == \
            cf[5:].replace("_", " ")
        filematch += same_file
        if same_ja or same_file:
            ok.append(v["id"])
            if args.write:
                v["title"]["romaji"] = r["romaji"]
                if r["published"]:
                    v["published"] = r["published"]      # 補上月份，Commons 只給年
                if not v["title"]["ja"] and r["ja"]:     # no.8 那種 Commons 沒標題的
                    v["title"]["ja"] = r["ja"]
                    v["title"]["en"] = v["title"]["en"] or r["en"]
                    filled.append(v["id"])
                # 座標只補缺的，不覆蓋 Commons 既有的——兩邊都是「地點」不是視點，
                # 沒有哪一邊更權威，重複填只會製造假的變動
                m = MANUAL_COORD.get(v["id"])
                if not v["subject"] and (r["coord"] or m):
                    v["subject"] = r["coord"] or {"lat": m["lat"], "lng": m["lng"]}
                    if not r["coord"]:
                        v["notes"]["geo"] = f"座標取自 {m['src']}（地點非視點，待 §7-15 查證）"
                    coords.append(v["id"])
        else:
            clash.append((v["id"], v["title"]["ja"], r["ja"]))
        if r["coord"] and v["subject"]:
            far.append((v["id"], dist_km(v["subject"], r["coord"])))

    print(f"漢字一致、拼音可採用：{len(ok)} 筆")
    print(f"Commons 檔名與維基指向一致：{filematch} 筆（反向驗證我們抓對了）")
    if absent:
        print(f"⚠️ 維基清單沒有的編號：{absent}")
    if clash:
        print(f"⚠️ 漢字對不上、拼音不採用（{len(clash)} 筆，需人工）：")
        for i, a, b in clash[:12]:
            print(f"    no.{i:>3}  我們:{str(a):<18} 維基:{b}")

    # 兩個獨立來源的座標對照——差太遠代表其中一邊把景認錯了，值得看一眼
    bad = sorted([x for x in far if x[1] > 1.5], key=lambda x: -x[1])
    print(f"\n座標雙來源比對：{len(far)} 筆，相距 >1.5km 的 {len(bad)} 筆"
          f"（中位 {sorted(d for _, d in far)[len(far) // 2]:.2f}km）" if far else "")
    for i, dkm in bad[:8]:
        print(f"    no.{i:>3}  相距 {dkm:.1f}km")

    assert len(ok) > 100, "採用數過低，維基表格結構可能變了"

    if args.write:
        vp.write_text(json.dumps(views, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        got = sum(1 for v in views if v["title"]["romaji"])
        mon = sum(1 for v in views if (v["published"] or "").count("-"))
        print(f"\n已回填 {vp.relative_to(ROOT)}：romaji {got} 筆、出版年月精確到月 {mon} 筆")
        if filled:
            print(f"順帶補上原本缺的標題：{filled}")
        if coords:
            print(f"補上原本缺的座標：{coords}")
    else:
        print("\n（未加 --write，沒有寫入）")


if __name__ == "__main__":
    main()
