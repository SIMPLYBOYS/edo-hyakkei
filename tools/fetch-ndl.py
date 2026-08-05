#!/usr/bin/env python3
"""§7-7 抓《江戶名所圖會》全 20 冊（國立國會圖書館數位典藏，IIIF）。

PID 2563380–2563399 連號 = 七卷二十冊，天保 5–7（1834–36），
松濤軒齋藤長秋 著／長谷川雪旦 畫，授權 PDM（公有領域）——與 §5.3 記載相符。

**這批不進 build**，落在 research/ 不在 assets/：整冊掃描是研究材料，
遊戲只用 §7-7 配對後裁出來的插圖（存 assets/meishozue/NNN.jpg，見 §6.2）。

IIIF Image API 的意義是不必存全尺寸。實測單開頁：
  full=2766KB  2000px=1105KB  1200px=475KB  800px=237KB
全 1242 開 → 全尺寸 3.4GB、2000px 1.4GB、**1200px 575MB（預設）**。
索引留下每冊的 IIIF template，選定的插圖之後直接用
  {iiif}/{region}/{size}/0/default.jpg
取全解析度或裁切，不必重抓整冊。

用法：
  python3 tools/fetch-ndl.py                      # 只建索引 data/meishozue.json
  python3 tools/fetch-ndl.py --download           # 抓 1200px 瀏覽版（約 575MB）
  python3 tools/fetch-ndl.py --download --size 2000
"""
import argparse, json, time
from pathlib import Path

from fetchlib import fetch, get_json

UA = "edo-hyakkei/0.1 (research; contact: ferrari828@gmail.com)"
ROOT = Path(__file__).resolve().parent.parent
PIDS = range(2563380, 2563400)                     # 20 冊，邊界已驗（見 self-check）
MANIFEST = "https://dl.ndl.go.jp/api/iiif/{pid}/manifest.json"


def volume(pid):
    m = get_json(MANIFEST.format(pid=pid), UA)
    md = {d["label"]: d["value"] for d in m.get("metadata", [])}
    cvs = m["sequences"][0]["canvases"]
    res = [c["images"][0]["resource"] for c in cvs]
    # 每頁的 IIIF service id 是 .../{pid}/R{n:07d}，用 template 存就好，
    # 但別憑印象——逐頁核對過才敢省掉 1242 筆 URL。
    tmpl = f"https://dl.ndl.go.jp/api/iiif/{pid}/R{{page:07d}}"
    assert all(r["service"]["@id"] == tmpl.format(page=i + 1) for i, r in enumerate(res)), \
        f"pid {pid} 的 IIIF id 不照 R{{n:07d}} 規律，template 不能用"
    return {
        "pid": pid, "label": m.get("label"), "pages": len(cvs),
        "date": md.get("Publication Date"), "rights": md.get("Access Restrictions"),
        "creator": md.get("Creator"), "iiif": tmpl,
        "px": [cvs[0]["width"], cvs[0]["height"]],
        "url": md.get("URL"),
    }


def download(vols, dest, size):
    dest.mkdir(parents=True, exist_ok=True)
    done = skipped = 0
    for i, v in enumerate(vols, 1):
        d = dest / f"v{i:02d}"
        d.mkdir(exist_ok=True)
        for p in range(1, v["pages"] + 1):
            out = d / f"p{p:03d}.jpg"
            if out.exists():
                skipped += 1
                continue
            url = f"{v['iiif'].format(page=p)}/full/{size},/0/default.jpg"
            out.write_bytes(fetch(url, UA, timeout=120).read())
            done += 1
            time.sleep(0.3)                        # 對 NDL 客氣一點
        mb = sum(f.stat().st_size for f in d.glob("*.jpg")) / 1024 / 1024
        print(f"  v{i:02d} {v['label'][:28]:<30} {v['pages']:>3}頁  {mb:>6.0f}MB", flush=True)
    print(f"新抓 {done} 頁，略過已存在 {skipped} 頁")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--download", action="store_true")
    ap.add_argument("--size", type=int, default=1200, help="長邊寬度 px，預設 1200")
    args = ap.parse_args()

    vols = []
    for pid in PIDS:
        v = volume(pid)
        vols.append(v)
        print(f"  {pid}  {v['label'][:30]:<32} {v['pages']:>3}頁  {v['px'][0]}px  {v['rights']}")
        time.sleep(0.3)

    total = sum(v["pages"] for v in vols)
    out = ROOT / "data" / "meishozue.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({
        "work": "江戶名所圖會",
        "note": "整冊掃描屬研究材料，落在 research/ 不進 build；遊戲只用 §7-7 配對後裁出的插圖",
        "institution": "国立国会図書館",
        "license": "PDM (public domain)",
        "volumes": vols,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\n寫出 {out.relative_to(ROOT)}：{len(vols)} 冊 / {total} 開")

    assert len(vols) == 20, f"應為二十冊，實得 {len(vols)}"
    assert all("江戸名所図会" in (v["label"] or "") for v in vols), "PID 範圍撈到別的書"
    assert all(v["rights"] == "PDM" for v in vols), "有冊次不是公有領域"
    print("self-check ok")

    if args.download:
        est = total * {800: 237, 1200: 475, 2000: 1105}.get(args.size, 475) / 1024
        print(f"\n下載中（{args.size}px，估 {est:.0f}MB）…")
        download(vols, ROOT / "research" / "meishozue", args.size)


if __name__ == "__main__":
    main()
