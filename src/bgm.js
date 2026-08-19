// BGM。Web Audio 合成，零音檔——素材已經 424MB，不該再為配樂加檔案。
// 排程用 look-ahead（setInterval 粗排、AudioContext 的時鐘細排），
// 這是 Web Audio 的標準作法：setTimeout 的精度撐不起節拍。
//
// **三首用不同的音階分**，那是真的有分別的東西，不是換個旋律而已：
//
//   道中（地圖）  陽音階   D E G A B    —— 民謠的音階，明亮、沒有半音
//   狩り（狩獵）  都節音階 D E♭ G A B♭  —— 江戶市井的音階，半音讓它帶著緊
//   繪卷（看畫）  律音階   D E G A C    —— 雅樂的音階，寬、慢、不推進
//
// 陽と都節の差は半音の有無で、それが「野」と「街」の差になっている。
// 同じ旋律を移調しただけでは出ない差なので、三曲は別々に書いてある。
//
// 瀏覽器規定要有使用者手勢才出得了聲，所以第一次點擊才啟動。
const KEY = 'edo-hyakkei/bgm';

const T = (lead, bass, bpm) => ({ lead, bass, bpm, beats: lead.reduce((a, [, d]) => a + d, 0) });

// [MIDI, 拍長]，0 ＝ 休止
const TRACKS = {
  // 道中：步行的拍子。四小節一句，句尾落回主音——走了一段、停下來看一眼
  map: T([
    [62, 1], [64, .5], [67, .5], [69, 1], [67, 1],
    [69, .5], [71, .5], [74, 1], [71, 1.5], [69, .5],
    [67, 1], [69, .5], [67, .5], [64, 1], [62, 1],
    [64, 1.5], [62, .5], [0, 2],
    [69, 1], [71, .5], [74, .5], [76, 1], [74, 1],
    [71, 1], [69, .5], [67, .5], [69, 2],
    [67, 1], [64, .5], [62, .5], [64, 1], [59, 1],
    [62, 2], [0, 2],
  ], [50, 55, 57, 50, 57, 55, 52, 50], 84),

  // 狩り：句子短、留白多——在找東西的時候不該有人一直唱歌。
  // E♭ 與 B♭ 那兩個半音是這首的全部性格
  hunt: T([
    [62, 1], [63, 1], [0, 1], [67, 1],
    [69, 1.5], [67, .5], [63, 1], [0, 1],
    [70, 1], [69, 1], [0, 1], [67, 1],
    [63, 2], [0, 2],
    [67, 1], [69, .5], [70, .5], [69, 1], [0, 1],
    [63, 1.5], [62, .5], [0, 2],
  ], [50, 51, 55, 50, 55, 51, 50, 50], 72),

  // 繪卷：長音為主，幾乎不推進。翻卷子的時候，音樂不該催你
  scroll: T([
    [69, 3], [67, 1], [64, 4],
    [62, 3], [64, 1], [67, 4],
    [72, 3], [69, 1], [67, 4],
    [64, 2], [62, 2], [0, 4],
  ], [50, 45, 47, 50], 56),
};

const st = {
  ctx: null, master: null, timer: 0, next: 0, beat: 0,
  name: 'map', on: localStorage.getItem(KEY) !== 'off', started: false,
};

function note(midi, at, dur, type, gain) {
  const c = st.ctx;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.value = 440 * 2 ** ((midi - 69) / 12);
  // 起音給 20ms、收尾拉長：方波直接切會有「喀」的一聲
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.02);
  g.gain.setValueAtTime(gain, at + dur * 0.7);
  g.gain.linearRampToValueAtTime(0.0001, at + dur);
  o.connect(g); g.connect(st.master);
  o.start(at); o.stop(at + dur + 0.05);
}

function tick() {
  const c = st.ctx, t = TRACKS[st.name];
  const beat = 60 / t.bpm;
  // 往前排 0.4 秒。排太短會被主執行緒的卡頓咬到，排太長則換曲要等很久
  while (st.next < c.currentTime + 0.4) {
    const b = st.beat % t.beats;
    let at = 0;
    for (const [n, d] of t.lead) {
      if (at === b && n) note(n, st.next, d * beat * 0.92, 'triangle', 0.10);
      at += d;
    }
    // 低音兩拍一擊，一小節換一個根音
    if (b % 2 === 0) {
      note(t.bass[Math.floor(b / 4) % t.bass.length], st.next, beat * 1.6, 'square', 0.03);
    }
    st.beat += 0.5;
    st.next += beat * 0.5;
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
  if (!TRACKS[name] || st.name === name) return;
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
