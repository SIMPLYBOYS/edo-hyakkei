#!/usr/bin/env python3
"""国土地理院の標高タイルから起伏図をつくる。→ data/geo/relief.png

**なぜ標高が要るのか**：江戸の形は地形そのものだから。山の手（武蔵野台地の
東端、20m 前後）と下町（沖積低地、2m 前後）の段差が、町の性格も広重の構図も
決めている。愛宕山から海が見えたのも、道灌山が名所だったのも高低差ゆえ。
そして §2.10 視点狩りは「地形を読め」と要求しているのに、
地図には高低がまったく描かれていなかった。

**OSM にはない**ので国土地理院の標高タイルを使う（出典表示が必要）。

🔴 **DEM10B だけでは足りない**。最初 dem_png（DEM10B、10m メッシュ、z=14）
だけで作ったところ、上野公園の台地が 12.8m にしかならなかった（実際 20m 前後）。
DEM10B は 1/25000 地形図の等高線から内挿した数値なので、等高線の間隔が
10m ある台地の上では平らに均されてしまう。**段差の位置は正しいのに高さが
潰れる**——この図が見せたいのはまさにその段差なので、それでは意味がない。
だから航空レーザ測量の DEM5A（5m メッシュ、z=15）を優先し、
配信されていない区画（404）だけ DEM10B で埋める。
実測：上野公園 12.8m → 22.4m、愛宕山 24.9m → 26.5m。

**投影を合わせること**：タイルは Web メルカトル、こちらの地図は等距円筒
（src/map.js の project）。そのまま貼ると谷が川からずれる。出力画素ごとに
経緯度→メルカトル画素を逆算して取り直す。

使い方： python3 tools/fetch-dem.py [--write]
"""
import argparse, io, math, sys, urllib.error
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetchlib import fetch

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "research" / "dem"
UA = "edo-hyakkei/1.0 (map relief; contact via repo)"
BASE = "https://cyberjapandata.gsi.go.jp/xyz"
# 精度の高い順。上から埋めていき、404 の穴を次で埋める
SOURCES = [("dem5a_png", 15), ("dem_png", 14)]
# src/map.js の B と同じ枠。ここがずれたら地形だけ別の場所を指す
S, W_, N, E = 35.535, 139.565, 35.805, 139.925
OUT_W, OUT_H = 1536, 1418    # 1000×923（地図の紙）と同じ比。約 21m/px


def txf(lon, z): return (lon + 180) / 360 * 2 ** z
def tyf(lat, z):
    r = np.radians(lat)
    return (1 - np.log(np.tan(r) + 1 / np.cos(r)) / np.pi) / 2 * 2 ** z


def decode(png):
    """標高 PNG：R*65536+G*256+B を 0.01 倍。(128,0,0) は無効値。"""
    a = np.asarray(Image.open(png).convert("RGB"), dtype=np.int64)
    v = a[:, :, 0] * 65536 + a[:, :, 1] * 256 + a[:, :, 2]
    v = np.where(a[:, :, 0] >= 128, v - (1 << 24), v) * 0.01
    return np.where((a[:, :, 0] == 128) & (a[:, :, 1] == 0) & (a[:, :, 2] == 0),
                    np.nan, v).astype(np.float32)


def sample(src, z, out):
    """out（NaN の穴）を src のタイルで埋める。

    出力の格子は経度・緯度それぞれ単調なので、タイルごとに「担当する
    出力の行列範囲」が連続したスライスになる。全面のモザイクを組むと
    z=15 では 300MB 要るが、この組み方なら出力サイズ（8MB）で済む。
    """
    lon = np.linspace(W_, E, OUT_W)
    lat = np.linspace(N, S, OUT_H)
    gx, gy = txf(lon, z) * 256, tyf(lat, z) * 256      # 全球画素座標
    cx, cy = (gx // 256).astype(int), (gy // 256).astype(int)
    CACHE.mkdir(parents=True, exist_ok=True)
    got = miss = 0
    for X in range(cx.min(), cx.max() + 1):
        cols = np.flatnonzero(cx == X)
        if not len(cols):
            continue
        for Y in range(cy.min(), cy.max() + 1):
            rows = np.flatnonzero(cy == Y)
            if not len(rows):
                continue
            # この区画にまだ穴が無いなら落とすまでもない
            if not np.isnan(out[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]).any():
                continue
            p = CACHE / f"{src}_{z}_{X}_{Y}.png"
            if not p.exists():
                try:
                    p.write_bytes(fetch(f"{BASE}/{src}/{z}/{X}/{Y}.png", UA,
                                        timeout=60,
                                        retry_on=(429, 502, 503, 504)).read())
                except urllib.error.HTTPError as e:
                    if e.code != 404:
                        raise
                    (CACHE / f"{src}_{z}_{X}_{Y}.404").touch()   # 無い印を残す
                    miss += 1
                    continue
            if not p.exists():
                miss += 1
                continue
            got += 1
            tile = decode(p)
            px = (gx[cols] - X * 256).astype(int).clip(0, 255)
            py = (gy[rows] - Y * 256).astype(int).clip(0, 255)
            patch = tile[np.ix_(py, px)]
            view = out[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]
            np.copyto(view, patch, where=np.isnan(view))
        print(f"  {src} … {got} 枚取得 / {miss} 欠", end="\r", flush=True)
    print(f"  {src:<10} {got:>5} 枚  欠 {miss:>5}        ")
    return out


def shade(z, zfactor, azimuth=315.0, altitude=45.0):
    """標準的な陰影起伏。斜面の向きと光源の角度から明るさを出す。"""
    dx = (E - W_) * 111320 * math.cos(math.radians((N + S) / 2)) / OUT_W
    dy = (N - S) * 110540 / OUT_H
    gy, gx = np.gradient(np.nan_to_num(z, nan=0.0), dy, dx)
    slope = np.arctan(zfactor * np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    az, al = math.radians(360 - azimuth + 90), math.radians(altitude)
    return np.clip(math.sin(al) * np.cos(slope)
                   + math.cos(al) * np.sin(slope) * np.cos(az - aspect), 0, 1)


# 標高帯。境目は江戸の地勢そのもの：2m 以下は埋立と川沿い、
# 15〜25m が台地の上（山の手）、それ以上は西の丘。
# 色は紙の色調から外さない——地図の主役は水系と地名で、地形は下地。
BANDS = [
    (2.0,  (211, 202, 183)),   # 低地・埋立
    (5.0,  (220, 211, 192)),
    (10.0, (229, 221, 203)),
    (18.0, (237, 230, 213)),   # 台地の縁
    (28.0, (243, 237, 222)),
    (45.0, (247, 242, 230)),
    (1e9,  (250, 246, 236)),   # 西の丘
]
# 起伏を読ませるための誇張。江戸の起伏は 20km に対して高々 60m しかない
# ——実比では陰影がまったく出ない。地形図が等高線を使うのと同じ理由。
ZFACTOR = 14


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    z = np.full((OUT_H, OUT_W), np.nan, dtype=np.float32)
    for src, lvl in SOURCES:
        sample(src, lvl, z)
        left = int(np.isnan(z).sum())
        print(f"    残り穴 {left}（{left / z.size * 100:.1f}%）")
        if not left:
            break
    print(f"\n標高 最低 {np.nanmin(z):.1f}m 最高 {np.nanmax(z):.1f}m "
          f"中央 {np.nanmedian(z):.1f}m")
    for q in (5, 25, 50, 75, 95, 99):
        print(f"    {q:>2}% … {np.nanpercentile(z, q):5.1f}m")

    # ── 検査。点で見る：総数や平均では「肝心なところが違う」を捕まえられない ──
    #
    # 🔴 ただし 1 画素で見てはいけない。DEM5A は航空レーザなので水面は
    # そのまま水面の高さになる——日本橋の座標はまさに日本橋川の水路に
    # 落ちて -0.3m と出た（まわりは 3.8m）。1 画素は 21m しかない。
    # だから「平場がその高さか」は近傍の中央値、「その山が在るか」は
    # 近傍の最大値で見る。確かめたいのは地形であって画素ではない。
    def area(lon, lat, r=5):
        j, i = jj(lat), ii(lon)
        return float(np.nanmedian(z[j - r:j + r + 1, i - r:i + r + 1]))

    def peak(lon, lat, r=5):
        j, i = jj(lat), ii(lon)
        return float(np.nanmax(z[j - r:j + r + 1, i - r:i + r + 1]))

    ii = lambda lon: int((lon - W_) / (E - W_) * OUT_W)
    jj = lambda lat: int((N - lat) / (N - S) * OUT_H)
    spots = [
        ("日本橋あたり（下町の低地）",     area, 139.7745, 35.6838, 2, 6),
        ("砂町（河口の低地）",           area, 139.8300, 35.6600, -2, 5),
        ("愛宕山（市中で最も高い自然地形）", peak, 139.7489, 35.6656, 22, 30),
        ("上野の山（台地の東端）",        peak, 139.7735, 35.7148, 17, 28),
        ("道灌山",                    peak, 139.7660, 35.7330, 15, 30),
        ("新宿御苑あたり（山の手）",      area, 139.7100, 35.6852, 28, 42),
        ("西端 三鷹寄り（武蔵野台地）",    area, 139.5750, 35.7000, 40, 60),
    ]
    print()
    for name, how, lon, lat, lo, hi in spots:
        v = how(lon, lat)
        tag = "近傍中央値" if how is area else "近傍最高"
        print(f"  {name:<32}{v:6.1f}m  {tag}（{lo}〜{hi} を期待）")
        assert lo <= v <= hi, f"{name} が {v:.1f}m。投影か枠か出典がずれている"
    # この図の存在理由そのもの：山の手と下町に段差があること
    yamanote, shitamachi = area(139.7100, 35.6852), area(139.7745, 35.6838)
    assert yamanote - shitamachi > 20, \
        f"山の手と下町の差が {yamanote - shitamachi:.1f}m しかない。台地が潰れている"
    # 上野の崖：台地の上と下町は 800m ほどしか離れていない。
    # 投影が数百メートル狂えば真っ先にここが壊れる
    step = peak(139.7735, 35.7148) - area(139.7830, 35.7148)
    print(f"  上野の崖（800m で {step:.1f}m の段差）")
    assert step > 12, "上野の崖が出ていない。投影がずれている疑い"

    rgb = np.zeros((OUT_H, OUT_W, 3), dtype=np.float32)
    zz = np.nan_to_num(z, nan=0.0)
    prev = -1e9
    for hi_, col in BANDS:
        rgb[(zz > prev) & (zz <= hi_)] = col
        prev = hi_
    # 陰影は 0.78〜1.06 の幅でしかかけない。真っ黒な影は紙の地図には出ない
    rgb *= (0.78 + 0.28 * shade(z, ZFACTOR))[:, :, None]
    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")

    # JPEG。この図は文字も鋭い輪郭も無い連続階調なので、圧縮の痕は出ない。
    # 実測（1536×1418）：PNG24 3005KB / パレット64色 1201KB / JPEG85 425KB。
    # 陰影は画素ごとに違う値なので PNG の可逆圧縮がまったく効かない。
    # 4:4:4（subsampling=0）にしているのは、色差を間引くと標高帯の境目が
    # にじむから——帯の境目こそこの図が伝えたいものなので。
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=85, subsampling=0, optimize=True)
    kb = buf.tell() / 1024
    print(f"\n{OUT_W}×{OUT_H}  {kb:.0f}KB")
    assert kb < 600, f"{kb:.0f}KB は大きすぎる"
    out = ROOT / "data" / "geo" / "relief.jpg"
    if args.write:
        out.write_bytes(buf.getvalue())
        print(f"書き出した {out.relative_to(ROOT)}")
    else:
        print("（--write で書き出し）")
    print("self-check ok")


if __name__ == "__main__":
    main()
