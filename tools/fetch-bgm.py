#!/usr/bin/env python3
"""江戶時期的曲子 → data/bgm.json

**為什麼不自己作曲**：這個作品裡每樣東西都是真的文獻——畫、名所圖會、
江戶土產、切繪圖、國土地理院的標高。只有配樂是編出來的，它是唯一的異物。

三首，而且**歌詞本身就對得上玩家在做的事**：

  地圖    通りゃんせ    「ここはどこの細道じゃ」——這遊戲就是在問這個
  狩獵    かごめかごめ  「うしろの正面だあれ」——猜謎的歌，而狩獵就是猜
  看畫    江戸子守唄    慢、靜

**年代**：三首都是江戶期的わらべ唄／子守唄（通りゃんせ與かごめかごめ的
成立年代有數說，但都在江戶期；文政・天保の童謡集に既に見える）。
不寫得更細，因為再細就需要引用學說了（§2.4 的 _rule 同一條規矩）。

**來源**：ja.wikipedia 的 <score>（LilyPond 原始碼）。旋律本身是公有領域的
傳統曲；維基的譜是它的一份轉寫，出處記在 data/bgm.json 裡。
**只取單聲部旋律**，不取任何編曲。

用法： python3 tools/fetch-bgm.py [--write]
"""
import argparse, json, re, sys, urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetchlib import fetch

ROOT = Path(__file__).resolve().parent.parent
UA = "edo-hyakkei/1.0 (research; contact via repo)"
API = "https://ja.wikipedia.org/w/api.php"

# 曲 → 遊戲裡的哪個場面
PIECES = [
    ("map",    "通りゃんせ",   "道中",  "「ここはどこの細道じゃ」——問路的歌"),
    ("hunt",   "かごめかごめ", "狩り",  "「うしろの正面だあれ」——猜的歌"),
    ("scroll", "江戸子守唄",   "子守唄", "江戶的搖籃曲"),
]

# LilyPond（オランダ式音名）→ 半音。is＝♯、es＝♭
STEP = {"c": 0, "d": 2, "e": 4, "f": 5, "g": 7, "a": 9, "b": 11}
NOTE_RE = re.compile(r"""
    (?P<name>[a-g])(?P<acc>(?:is|es|s)*)      # 音名と臨時記号
    (?P<oct>[',]*)                            # オクターブ記号
    (?P<dur>\d+)?(?P<dots>\.*)                # 音価
""", re.X)


def lily(src):
    """\\relative の単声部を [(midi|0, 拍), …] にする。0 は休符。"""
    m = re.search(r"\\relative\s+([a-g](?:is|es|s)*[',]*)\s*\{", src)
    assert m, "\\relative が見つからない"
    ref = NOTE_RE.match(m.group(1))
    prev = 48 + STEP[ref.group("name")] + 12 * (
        ref.group("oct").count("'") - ref.group("oct").count(","))
    body = src[m.end():]
    body = body.split("\\addlyrics")[0]        # 以降は歌詞、音符ではない
    body = body[:body.rfind("}")] if "}" in body else body
    # 🔴 命令は「まとめて」落とすこと。\key d \minor の d を先に消さないと、
    # それが音符として読まれる（実測：通りゃんせの音域が 38 半音に膨らんだ）。
    # \time 4/4 の数字、\tempo 4 = 120 の数字も同じ。
    # 総称の \\w+ だけで消すと、命令の**引数が残る**。
    body = re.sub(r"\\tempo\s*\d+\s*=\s*\d+", " ", body)
    body = re.sub(r"\\time\s*\d+\s*/\s*\d+", " ", body)
    body = re.sub(r"\\key\s+[a-g](?:is|es|s)*\s*\\\w+", " ", body)
    body = re.sub(r"\\set\s+[\w.]+\s*=\s*#?\"?[^\s\"]*\"?", " ", body)
    body = re.sub(r"\\bar\s*\"[^\"]*\"", " ", body)
    body = re.sub(r"\\[a-zA-Z]+", " ", body)          # 残りの命令（\break など）
    body = re.sub(r"[|~()\[\]{}<>]|\\\\", " ", body)
    out, dur = [], 4.0
    for tok in body.split():
        if tok.startswith("r"):
            d = re.match(r"r(\d+)?(\.*)", tok)
            if not d:
                continue
            if d.group(1):
                dur = float(d.group(1))
            beats = 4 / dur * (2 - 0.5 ** len(d.group(2)))
            out.append((0, round(beats, 4)))
            continue
        n = NOTE_RE.fullmatch(tok)
        if not n:
            continue
        pc = STEP[n.group("name")]
        # 🔴 "es" の中には "s" が入っている。両方数えると二重に引く——
        # bes（B♭）が A になり、\relative の八度選択がそこから狂って
        # 音域が 36 半音に膨らんだ。is を先に外し、残りで es／s を数える。
        acc = n.group("acc")
        sharps = acc.count("is")
        rest = acc.replace("is", "")
        flats = rest.count("es") + rest.replace("es", "").count("s")
        pc += sharps - flats
        # \relative：直前の音にいちばん近いオクターブを採る
        base = prev - prev % 12 + pc
        cand = min((base - 12, base, base + 12), key=lambda v: abs(v - prev))
        cand += 12 * (n.group("oct").count("'") - n.group("oct").count(","))
        if n.group("dur"):
            dur = float(n.group("dur"))
        beats = 4 / dur * (2 - 0.5 ** len(n.group("dots")))
        out.append((cand, round(beats, 4)))
        prev = cand
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    tracks = {}
    for key, page, label, why in PIECES:
        u = (API + "?action=parse&format=json&prop=wikitext&page="
             + urllib.parse.quote(page))
        w = json.load(fetch(u, UA, timeout=60, retry_on=(429, 503)))["parse"]["wikitext"]["*"]
        m = re.search(r"<score[^>]*>(.*?)</score>", w, re.S)
        assert m, f"{page} に <score> が無い"
        src = m.group(1)
        bpm = float(re.search(r"\\tempo\s*4\s*=\s*(\d+)", src).group(1)) if \
            re.search(r"\\tempo\s*4\s*=\s*(\d+)", src) else 80.0
        lead = lily(src)
        # 終止音＝主音。ドローンをそこに置くために出しておく
        tonic = next((n for n, _ in reversed(lead) if n), 0)
        tracks[key] = {
            "title": page, "label": label, "why": why, "bpm": bpm, "tonic": tonic,
            "lead": [[n, d] for n, d in lead],
            "source": f"ja.wikipedia「{page}」の <score>（LilyPond）",
        }
        pitches = sorted({n for n, _ in lead if n})
        beats = sum(d for _, d in lead)
        print(f"  {key:<7}{page:<8}{len(lead):>3} 音  {beats:>6.1f} 拍  "
              f"{bpm:>3.0f}BPM  音高 {pitches}")

    # ── 檢査。曲ごとに「知られている形」で照合する ──────────────
    # 総数だけでは、解析が半分で止まっても気づけない
    assert len(tracks) == 3
    for k, t in tracks.items():
        assert 16 <= len(t["lead"]) <= 200, f"{k} の音数 {len(t['lead'])} がおかしい"
        assert sum(d for _, d in t["lead"]) >= 12, f"{k} が短すぎる"
        ps = {n for n, _ in t["lead"] if n}
        assert max(ps) - min(ps) <= 24, f"{k} の音域 {max(ps)-min(ps)} 半音は広すぎる（解析ミス）"
    # かごめかごめは 2/4・ヨナ抜き短音階、最初の音は主音の a
    kg = tracks["hunt"]["lead"]
    assert kg[0][0] % 12 == 9, f"かごめの初音が a でない（{kg[0][0]}）"
    # 通りゃんせは d minor、最初の音は a（属音から入る）
    assert tracks["map"]["lead"][0][0] % 12 == 9, "通りゃんせの初音が a でない"

    out = {
        "_": "江戶期のわらべ唄・子守唄。旋律は公有領域、譜は ja.wikipedia の <score> から。",
        "_use": "単声部の旋律のみ。編曲は取っていない。",
        "tracks": tracks,
    }
    p = ROOT / "data" / "bgm.json"
    txt = json.dumps(out, ensure_ascii=False, indent=1) + "\n"
    print(f"\n{len(txt)/1024:.1f}KB")
    if args.write:
        p.write_text(txt, encoding="utf-8")
        print(f"寫入 {p.relative_to(ROOT)}")
    else:
        print("（--write 才會寫檔）")
    print("self-check ok")


if __name__ == "__main__":
    main()
