#!/usr/bin/env python3
"""開發用靜態伺服器，強制不快取。

為什麼需要：python -m http.server 不送 Cache-Control，瀏覽器會用啟發式快取。
改了 src/*.js 之後常常 index.html 是新的、模組卻是舊的——
畫面看起來更新了但行為沒變，這比完全沒更新更難察覺
（實際踩過：縮放按鈕出現了但點了沒反應，因為 main.js 是舊的）。

用法： python3 tools/serve.py [port]
"""
import sys
from functools import partial
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        # 🔴 這些 header 擋不住所有情況。實測：把 data/views.json 從硬碟移走，
        # 瀏覽器仍然 fetch 到 200 與完整內容（伺服器對缺檔確實回 404，curl 驗過）。
        # 真正靠得住的是 src/main.js 那邊在 localhost 給 URL 加 ?t=timestamp。
        # 這裡留著是多一層，不是保證。
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
root = Path(__file__).resolve().parent.parent
print(f"http://localhost:{port}  （不快取，改完直接重整就好）")
HTTPServer(("", port), partial(NoCache, directory=str(root))).serve_forever()
