// 計時賽：抽出 yatouge.html 的 @timeattack（純函式）— 幽靈車取樣、量化壓縮與還原、依時間插值、與最佳的時間差、紀錄存取
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const M = new Function(`${block('timeattack')}
return { TA, taKey, taGhostOn, taRecord, taEncode, taDecode, taAt, taTimeAtS, taDelta, taFmtDelta, taParse, taSerialize, taIsNewBest };`)();
const { TA, taKey, taGhostOn, taRecord, taEncode, taDecode, taAt, taTimeAtS, taDelta, taFmtDelta, taParse, taSerialize, taIsNewBest } = M;
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} vs ${b}`);

// 模擬一段下坡：約 25 m/s、方向慢慢轉，跨過 ±π
function drive(seconds, fps = 60) {
  const buf = [];
  let x = 120.37, z = -845.12, h = 3.0, s = 40, t = 0;
  for (let f = 0; t < seconds; f++) {
    const dt = 1 / fps + (f % 7 === 0 ? 0.004 : 0); // 影格長度會抖動
    t += dt; h += 0.35 * dt * Math.sin(t / 4); s += 25 * dt;
    x += Math.sin(h) * 25 * dt; z += Math.cos(h) * 25 * dt;
    taRecord(buf, t, { s, x, z, h });
  }
  return buf;
}

test('紀錄 key 依賽道 × 車型，與比賽模式的最佳時間 key 不同', () => {
  assert.equal(taKey('kurosagi', 'hatch'), 'yatouge-ta-best-kurosagi-hatch');
  assert.equal(taKey('hakuro', 'gtr'), 'yatouge-ta-best-hakuro-gtr');
  assert.notEqual(taKey('kurosagi', 'hatch'), 'yatouge-best');
});

test('幽靈車開關：沒存過或存 1 時開，存 0 時關', () => {
  assert.equal(taGhostOn(null), true);
  assert.equal(taGhostOn('1'), true);
  assert.equal(taGhostOn('0'), false);
});

test('錄製取樣：約每 0.1 秒一筆，第一筆立即收，force 一定收', () => {
  const buf = [];
  assert.equal(taRecord(buf, 0.01, { s: 1, x: 0, z: 0, h: 0 }), true);
  assert.equal(buf.length, 1);
  taRecord(buf, 0.05, { s: 2, x: 0, z: 0, h: 0 });
  assert.equal(buf.length, 1, '不到 0.1 秒不收');
  taRecord(buf, 0.111, { s: 3, x: 0, z: 0, h: 0 });
  assert.equal(buf.length, 2);
  taRecord(buf, 0.13, { s: 4, x: 0, z: 0, h: 0 }, true);
  assert.equal(buf.length, 3, '衝線那一刻 force 要收');
  const run = drive(60);
  assert.ok(run.length >= 520 && run.length <= 601, `60 秒約 600 筆（影格對齊會略少），實得 ${run.length}`);
  for (let i = 1; i < run.length; i++) assert.ok(run[i].t - run[i - 1].t >= TA.DT - 1e-9);
});

test('錄製：進度 s 只增不減（倒退或打滑時取到目前為止的最遠）', () => {
  const buf = [];
  taRecord(buf, 0, { s: 100, x: 0, z: 0, h: 0 });
  taRecord(buf, 0.2, { s: 90, x: 0, z: 0, h: 0 });
  assert.equal(buf[1].s, 100);
});

test('錄製：超過上限就不再收並回傳 false（時間照記，幽靈不存）', () => {
  const buf = [];
  for (let i = 0; i < TA.MAX_SAMPLES; i++) assert.equal(taRecord(buf, i * 0.1, { s: i, x: 0, z: 0, h: 0 }), true);
  assert.equal(taRecord(buf, TA.MAX_SAMPLES * 0.1, { s: 1, x: 0, z: 0, h: 0 }), false);
  assert.equal(buf.length, TA.MAX_SAMPLES);
});

test('壓縮後還原：筆數相同，誤差在量化範圍內（位置 ≤ 0.05 m、角度 ≤ 0.001 rad、時間 ≤ 0.005 s）', () => {
  const run = drive(90);
  const str = taEncode(run);
  assert.equal(typeof str, 'string');
  const back = taDecode(str);
  assert.equal(back.length, run.length);
  for (let i = 0; i < run.length; i++) {
    const a = run[i], b = back[i];
    near(b.t, a.t, 0.005 + 1e-9, 't'); near(b.s, a.s, 0.05 + 1e-9, 's'); near(b.x, a.x, 0.05 + 1e-9, 'x'); near(b.z, a.z, 0.05 + 1e-9, 'z');
    near(Math.atan2(Math.sin(b.h - a.h), Math.cos(b.h - a.h)), 0, 0.001, 'h');
  }
});

test('壓縮大小：3 分鐘的跑法遠低於上限（每筆不到 12 字元）', () => {
  const run = drive(180), str = taEncode(run);
  assert.ok(str.length < run.length * 12, `${str.length} 字元 / ${run.length} 筆`);
  assert.ok(str.length <= TA.MAX_CHARS);
});

test('壓縮：空資料或超過字數上限回傳 null', () => {
  assert.equal(taEncode([]), null);
  const huge = [];
  for (let i = 0; i < TA.MAX_SAMPLES; i++) huge.push({ t: i * 0.1, s: i * 1e4, x: (i % 2 ? 1 : -1) * 9e4, z: (i % 2 ? -1 : 1) * 9e4, h: (i % 2) * 3 });
  assert.equal(taEncode(huge), null);
});

test('還原：壞資料、版本不符、時間倒退或進度倒退一律回 null', () => {
  for (const bad of [null, undefined, 42, '', 'x', '9.AAAAA', '1.', '1.!!!!!', '1.AAAA', 'A'.repeat(TA.MAX_CHARS + 10)]) assert.equal(taDecode(bad), null, String(bad).slice(0, 20));
  const ok = taEncode([{ t: 0, s: 0, x: 0, z: 0, h: 0 }, { t: 0.1, s: 1, x: 1, z: 1, h: 0.1 }]);
  assert.ok(taDecode(ok));
  const backT = taEncode([{ t: 1, s: 0, x: 0, z: 0, h: 0 }, { t: 0.5, s: 1, x: 0, z: 0, h: 0 }]);
  assert.equal(taDecode(backT), null, '時間不可倒退');
  const backS = taEncode([{ t: 0, s: 5, x: 0, z: 0, h: 0 }, { t: 0.1, s: 1, x: 0, z: 0, h: 0 }]);
  assert.equal(taDecode(backS), null, '進度不可倒退');
});

test('依時間插值：取樣點上剛好重合、中間線性、超出範圍夾在頭尾', () => {
  const g = [{ t: 0, s: 0, x: 0, z: 0, h: 0 }, { t: 1, s: 10, x: 10, z: -4, h: 1 }, { t: 2, s: 30, x: 30, z: -4, h: 1 }];
  let p = taAt(g, 1); near(p.x, 10, 1e-9); near(p.z, -4, 1e-9); near(p.h, 1, 1e-9); near(p.s, 10, 1e-9);
  p = taAt(g, 0.5); near(p.x, 5, 1e-9); near(p.z, -2, 1e-9); near(p.h, 0.5, 1e-9); near(p.s, 5, 1e-9);
  p = taAt(g, 1.25); near(p.x, 15, 1e-9);
  p = taAt(g, -3); near(p.x, 0, 1e-9);
  p = taAt(g, 99); near(p.x, 30, 1e-9); assert.equal(p.end, true);
  assert.equal(taAt(g, 1.5).end, false);
});

test('依時間插值：角度跨過 ±π 時走短邊', () => {
  const g = [{ t: 0, s: 0, x: 0, z: 0, h: 3.1 }, { t: 1, s: 1, x: 0, z: 0, h: -3.1 }];
  const h = taAt(g, 0.5).h;
  near(Math.abs(Math.atan2(Math.sin(h), Math.cos(h))), Math.PI, 1e-6);
});

test('依時間插值：提示索引 i 不影響結果，倒著查也對', () => {
  const run = taDecode(taEncode(drive(30)));
  let i = 0;
  for (const t of [0.3, 5.55, 12.01, 29.9, 3.2, 0]) {
    const a = taAt(run, t, i), b = taAt(run, t, 0);
    near(a.x, b.x, 1e-9); near(a.z, b.z, 1e-9); i = a.i;
  }
});

test('依進度找時間：s 對應的時間、超出範圍回 null', () => {
  const g = [{ t: 0, s: 100, x: 0, z: 0, h: 0 }, { t: 2, s: 120, x: 0, z: 0, h: 0 }, { t: 3, s: 120, x: 0, z: 0, h: 0 }, { t: 4, s: 160, x: 0, z: 0, h: 0 }];
  near(taTimeAtS(g, 110), 1, 1e-9);
  near(taTimeAtS(g, 140), 3.5, 1e-9);
  near(taTimeAtS(g, 100), 0, 1e-9);
  assert.equal(taTimeAtS(g, 99), null);
  assert.equal(taTimeAtS(g, 161), null);
});

test('與最佳的時間差：慢了是正、快了是負，沒有幽靈回 null', () => {
  const g = [{ t: 0, s: 0, x: 0, z: 0, h: 0 }, { t: 10, s: 250, x: 0, z: 0, h: 0 }];
  near(taDelta(g, 125, 6), 1, 1e-9);
  near(taDelta(g, 125, 4.5), -0.5, 1e-9);
  assert.equal(taDelta(null, 125, 6), null);
  assert.equal(taDelta(g, 300, 6), null);
});

test('時間差格式：正負號、兩位小數、接近 0 顯示 ±0.00', () => {
  assert.equal(taFmtDelta(1.234), '+1.23');
  assert.equal(taFmtDelta(-0.456), '−0.46');
  assert.equal(taFmtDelta(0.004), '±0.00');
  assert.equal(taFmtDelta(-0.004), '±0.00');
});

test('新紀錄判定：沒有紀錄或比較快才算', () => {
  assert.equal(taIsNewBest(null, 80), true);
  assert.equal(taIsNewBest(NaN, 80), true);
  assert.equal(taIsNewBest(81, 80), true);
  assert.equal(taIsNewBest(80, 80), false);
  assert.equal(taIsNewBest(79, 80), false);
});

test('紀錄存取：序列化後讀回，壞資料一律當作沒有紀錄或沒有幽靈', () => {
  const g = taEncode(drive(5));
  assert.deepEqual(taParse(taSerialize(83.27, g)), { t: 83.27, g });
  assert.deepEqual(taParse(taSerialize(83.27, null)), { t: 83.27, g: null });
  for (const bad of [null, '', 'nope', '{"t":-1}', '{"t":"9"}', '{"t":0}', '{"t":1e9}', '[]', 'null']) assert.equal(taParse(bad), null, String(bad));
  assert.deepEqual(taParse('{"v":1,"t":70,"g":42}'), { t: 70, g: null }, '幽靈資料型別錯就丟掉幽靈，時間保留');
  assert.deepEqual(taParse(JSON.stringify({ v: 1, t: 70, g: 'A'.repeat(TA.MAX_CHARS + 1) })), { t: 70, g: null });
});
