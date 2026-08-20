// BGM。**江戶時期實際唱過的曲子**，不是自己編的。
//
// 這個作品裡每樣東西都是真的文獻——畫、名所圖會、江戶土產、切繪圖、
// 國土地理院的標高。配樂原本是我編的，它是唯一的異物；使用者指出來之後換掉。
//
// 三首，而且**歌詞本身就對得上玩家在做的事**：
//
//   地圖  通りゃんせ「ここはどこの細道じゃ」／お江戸日本橋「七つ立ち」——
//         這遊戲就是在問路，而起點正是日本橋
//   狩獵  かごめかごめ「うしろの正面だあれ」／ずいずいずっころばし——都是猜的遊戲歌
//   看畫  江戸子守唄／うさぎ（『山家鳥虫歌』1772）——慢、靜
//
// **一個場面配一組，一曲播完換下一曲**：一首循環到底會膩。
//
// 旋律由 tools/fetch-bgm.py 從 ja.wikipedia 的 <score>（LilyPond）解析成
// data/bgm.json——**不憑記憶抄譜**，抄錯比自己寫更糟。
//
// 合成仍是 Web Audio、零音檔（素材已經 424MB）。排程用 look-ahead：
// setInterval 粗排、AudioContext 的時鐘細排，setTimeout 的精度撐不起節拍。
const KEY = 'edo-hyakkei/bgm';

// 由 main.js 在開場時餵進來（data/bgm.json）。每個場面是一組曲子。
let TRACKS = {};
export function bgmLoad(data) { TRACKS = data?.tracks ?? {}; }
// 現在這個場面播到第幾首。換場面時不歸零——回到地圖時接著上次那首之後，
// 不然每次從地圖進出都從同一首開始，等於沒有輪播。
//
// 🔴 名字不能叫 at：tick() 裡有個走訪旋律用的區域變數也叫 at，
// 會把這個蓋掉，然後對一個數字設屬性。而且錯誤被 main.js 的過濾器接住
// 只記進 console——音樂照播，只是永遠不換曲，看畫面完全看不出來。
const spun = {};
const cur = () => (TRACKS[st.name] ?? [])[(spun[st.name] ?? 0) % (TRACKS[st.name]?.length || 1)];

const st = {
  ctx: null, master: null, timer: 0, next: 0, beat: 0,
  name: 'map', on: localStorage.getItem(KEY) !== 'off', started: false,
};

// 撥弦的包絡：起音極短、之後一路衰減。箏與三味線是撥出來的，
// 用「按著不放」的持續音會立刻變成電子遊戲的聲音——這幾首是傳統曲，
// 音色不對的話旋律再真也白搭。
function note(midi, at, dur, gain) {
  const c = st.ctx;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'triangle';
  o.frequency.value = 440 * 2 ** ((midi - 69) / 12);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.006);        // 撥的那一下
  g.gain.exponentialRampToValueAtTime(0.0001, at + Math.min(dur * 2.2, 2.6));
  o.connect(g); g.connect(st.master);
  o.start(at); o.stop(at + Math.min(dur * 2.2, 2.6) + 0.05);
}

// 低音は主音のドローンだけ。伝統曲に機能和声の低音を付けると
// 途端に「西洋の曲を日本風に編曲したもの」になる——付けないほうが近い。
function drone(midi, at, dur) {
  const c = st.ctx;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine';
  o.frequency.value = 440 * 2 ** ((midi - 69) / 12);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(0.045, at + 0.4);
  g.gain.setValueAtTime(0.045, at + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g); g.connect(st.master);
  o.start(at); o.stop(at + dur + 0.05);
}

function tick() {
  const c = st.ctx, t = cur();
  if (!t) return;
  const beat = 60 / t.bpm;
  const total = t.lead.reduce((a, [, d]) => a + d, 0);
  // 往前排 0.4 秒。排太短會被主執行緒的卡頓咬到，排太長則換曲要等很久
  while (st.next < c.currentTime + 0.4) {
    const b = +(st.beat % total).toFixed(4);
    let at = 0;
    for (const [n, d] of t.lead) {
      if (+at.toFixed(4) === b && n) note(n, st.next, d * beat, 0.085);
      at += d;
    }
    // 主音のドローンは八拍に一度。曲全体の半分ごとにしていたら
    // 通りゃんせでは 19 秒に一度になり、事実上鳴っていなかった（実測 0 回）。
    if (b % 8 === 0) drone(t.tonic - 12, st.next, beat * 8);
    st.beat = +(st.beat + 0.25).toFixed(4);
    st.next += beat * 0.25;
    // 一曲播完就換下一首。beat 歸零，下一輪的 cur() 會拿到新的曲子
    if (st.beat >= total) {
      st.beat = 0;
      spun[st.name] = ((spun[st.name] ?? 0) + 1) % (TRACKS[st.name]?.length || 1);
      return;                    // 這一輪排到這裡為止，下次 tick 用新曲的拍長
    }
  }
}

function boot() {
  if (st.ctx) return;
  const c = new (window.AudioContext || window.webkitAudioContext)();
  st.ctx = c;
  // 低通：方波的高次諧波很刺，這是水墨調的地圖不是街機
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 2200;
  st.master = c.createGain(); st.master.gain.value = 0.5;
  st.master.connect(lp); lp.connect(c.destination);
  st.next = c.currentTime + 0.1;
  st.beat = 0;
  st.timer = setInterval(tick, 150);
}

/** 換曲。淡出→換→淡入，硬切會像斷電 */
export function bgmTo(name) {
  if (!TRACKS[name]?.length || st.name === name) return;
  if (!st.ctx) { st.name = name; return; }
  const g = st.master.gain, now = st.ctx.currentTime;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(0.0001, now + 0.5);
  setTimeout(() => {
    st.name = name;
    st.beat = 0;                       // 新的一首從頭起，不要接在半句上
    st.next = st.ctx.currentTime + 0.05;
    if (!st.on) return;
    const t2 = st.ctx.currentTime;
    g.cancelScheduledValues(t2);
    g.setValueAtTime(0.0001, t2);
    g.linearRampToValueAtTime(0.5, t2 + 0.6);
  }, 520);
}

function start() {
  if (st.started || !st.on) return;
  st.started = true;
  boot();
  st.ctx.resume?.();
}

export function bgmSet(on, btn) {
  st.on = on;
  localStorage.setItem(KEY, on ? 'on' : 'off');
  btn?.classList.toggle('off', !on);
  btn?.setAttribute('title', on ? '關掉配樂' : '打開配樂');
  if (on) { start(); st.ctx?.resume(); if (st.master) st.master.gain.value = 0.5; }
  else if (st.master) st.master.gain.value = 0;
}

export function bgmInit(btn) {
  // 這裡只反映狀態，**不能呼叫 start()**——開場還沒有使用者手勢，
  // 建了 AudioContext 只會拿到一則警告與一個 suspended 的 context。
  // 真正開聲的是下面那個 click（或使用者自己按 ♪，那本身就是手勢）。
  btn.classList.toggle('off', !st.on);
  btn.title = st.on ? '關掉配樂' : '打開配樂';
  btn.onclick = () => bgmSet(!st.on, btn);
  // 觸控裝置的 pointerdown 不帶 user activation（瀏覽器分不清點擊或捲動），
  // 要用 click 才播得動。start() 內有防重入，重複觸發無害。
  addEventListener('click', start);
}
