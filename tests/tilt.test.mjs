// 抽出 yatouge.html 內 @tilt 區塊（傾斜轉向與單指踏板的純函式，不依賴 DOM）後在 Node 執行
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function load() {
  const open = '/* @tilt:start */', s = html.indexOf(open), e = html.indexOf('/* @tilt:end */');
  assert.ok(s >= 0 && e > s, '找不到 @tilt 區塊');
  return new Function(`const clamp = (v, a, b) => Math.max(a, Math.min(b, v));\n${html.slice(s + open.length, e)}\nreturn { TILT, pedalState, tiltSteer, tiltMaxAngle, tiltAxis, tiltAngle, tiltSmooth, steerModeOf, tiltSensOf, zoneHit, zoneSteer };`)();
}
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('pedalState：沒有觸碰時，比賽中油門開、倒數中不給油', () => {
  const { pedalState } = load();
  assert.deepEqual(pedalState(false, 0, true), { gas: true, brake: false, hb: false });
  assert.deepEqual(pedalState(false, 5, true), { gas: true, brake: false, hb: false });
  assert.deepEqual(pedalState(false, 0, false), { gas: false, brake: false, hb: false });
});

test('pedalState：剛按下踢一下手煞車，之後只剩煞車；按住時油門一律關', () => {
  const { pedalState, TILT } = load();
  assert.deepEqual(pedalState(true, 0, true), { gas: false, brake: true, hb: true });
  assert.deepEqual(pedalState(true, TILT.KICK_S * 0.99, true), { gas: false, brake: true, hb: true });
  assert.deepEqual(pedalState(true, TILT.KICK_S, true), { gas: false, brake: true, hb: false });
  assert.deepEqual(pedalState(true, 3, true), { gas: false, brake: true, hb: false });
  assert.equal(TILT.KICK_S, 0.25);
});

test('pedalState：放開後恢復油門、煞車與手煞車歸零；倒數中按住不會多給油', () => {
  const { pedalState } = load();
  const held = pedalState(true, 1, true), freed = pedalState(false, 0, true);
  assert.equal(held.gas, false); assert.equal(freed.gas, true); assert.equal(freed.brake, false); assert.equal(freed.hb, false);
  assert.equal(pedalState(true, 0.1, false).gas, false);
});

test('tiltSteer：死區為 0、右傾為正、左傾為負、對稱、超過上限鎖在 ±1', () => {
  const { tiltSteer } = load();
  assert.equal(tiltSteer(10, 10, 20), 0);
  assert.equal(tiltSteer(10.5, 10, 20), 0); // 0.5° 在死區內
  near(tiltSteer(30, 10, 20), -tiltSteer(-10, 10, 20));
  assert.ok(tiltSteer(15, 10, 20) > 0 && tiltSteer(5, 10, 20) < 0);
  assert.equal(tiltSteer(60, 10, 20), 1); assert.equal(tiltSteer(-60, 10, 20), -1);
  near(tiltSteer(30, 10, 20), 1); // 剛好到上限
  let prev = -2; for (let a = -50; a <= 70; a += 1) { const v = tiltSteer(a, 10, 20); assert.ok(v >= prev); prev = v; }
});

test('tiltSteer：死區邊緣連續；跨越 ±180° 時取最短角差；壞輸入回 0', () => {
  const { tiltSteer, TILT } = load();
  const d = TILT.DEAD * 20;
  near(tiltSteer(d + 1e-6, 0, 20), 0, 1e-4);
  assert.ok(tiltSteer(-175, 175, 20) > 0); // 175 -> -175 是右轉 10°，不是左轉 350°
  assert.equal(tiltSteer(NaN, 0, 20), 0); assert.equal(tiltSteer(5, 0, 0), 0); assert.equal(tiltSteer(null, 0, 20), 0);
});

test('tiltMaxAngle：靈敏度越高需要的傾斜角越小，範圍 12° 到 35°，超出會被夾住', () => {
  const { tiltMaxAngle } = load();
  assert.equal(tiltMaxAngle(0), 35); assert.equal(tiltMaxAngle(1), 12);
  assert.ok(tiltMaxAngle(0.7) < tiltMaxAngle(0.3));
  assert.equal(tiltMaxAngle(-3), 35); assert.equal(tiltMaxAngle(9), 12); assert.equal(tiltMaxAngle(NaN), tiltMaxAngle(0.5));
});

test('tiltAxis：依螢幕角度選軸與正負號（橫向 90 / 270 用 beta，直向 0 / 180 用 gamma）', () => {
  const { tiltAxis } = load();
  assert.deepEqual(tiltAxis(90), { axis: 'beta', sign: 1 });
  assert.deepEqual(tiltAxis(-90), { axis: 'beta', sign: -1 });
  assert.deepEqual(tiltAxis(270), { axis: 'beta', sign: -1 });
  assert.deepEqual(tiltAxis(0), { axis: 'gamma', sign: 1 });
  assert.deepEqual(tiltAxis(180), { axis: 'gamma', sign: -1 });
  assert.deepEqual(tiltAxis(undefined), { axis: 'gamma', sign: 1 });
});

test('tiltAngle：兩個橫向方向傾斜同一側都得到同號的轉向角；無資料回 null', () => {
  const { tiltAngle } = load();
  assert.equal(tiltAngle({ beta: 20, gamma: 3 }, 90), 20);
  assert.equal(tiltAngle({ beta: -20, gamma: 3 }, 270), 20); // 反方向橫向，beta 變號
  assert.equal(tiltAngle({ beta: 4, gamma: -12 }, 0), -12);
  assert.equal(tiltAngle({ beta: null, gamma: null }, 90), null);
  assert.equal(tiltAngle({ beta: 5 }, 0), null);
  assert.equal(tiltAngle(null, 90), null);
});

test('tiltSmooth：往目標靠近且不越過；dt 為 0 時不動', () => {
  const { tiltSmooth } = load();
  assert.equal(tiltSmooth(0.2, 1, 0, 14), 0.2);
  const v = tiltSmooth(0, 1, 1 / 60, 14); assert.ok(v > 0 && v < 1);
  assert.ok(tiltSmooth(0, 1, 10, 14) <= 1);
});

test('steerModeOf / tiltSensOf：儲存值驗證，壞值回預設', () => {
  const { steerModeOf, tiltSensOf } = load();
  assert.equal(steerModeOf('tilt'), 'tilt'); assert.equal(steerModeOf('drag'), 'drag');
  assert.equal(steerModeOf(null), 'drag'); assert.equal(steerModeOf('x'), 'drag');
  assert.equal(tiltSensOf('70'), 0.7); assert.equal(tiltSensOf(null), 0.5); assert.equal(tiltSensOf('abc'), 0.5);
  assert.equal(tiltSensOf('500'), 1); assert.equal(tiltSensOf('-5'), 0);
});

test('steerModeOf：zones 是合法模式', () => {
  const { steerModeOf } = load();
  assert.equal(steerModeOf('zones'), 'zones'); assert.equal(steerModeOf('Zones'), 'drag');
});

test('zoneHit：上方左右各半、下方 30% 全寬為煞車區，邊界歸屬明確', () => {
  const { zoneHit, TILT } = load();
  const W = 844, H = 390;
  assert.equal(TILT.BOTTOM_FRAC, 0.3);
  assert.equal(zoneHit(10, 10, W, H), 'left');
  assert.equal(zoneHit(W - 10, 10, W, H), 'right');
  assert.equal(zoneHit(W / 2 - 0.01, 10, W, H), 'left');
  assert.equal(zoneHit(W / 2, 10, W, H), 'right'); // 正中線歸右
  assert.equal(zoneHit(10, H * 0.7 - 0.01, W, H), 'left');
  assert.equal(zoneHit(10, H * 0.7, W, H), 'bottom'); // 邊界歸煞車區
  assert.equal(zoneHit(W - 1, H - 1, W, H), 'bottom');
  assert.equal(zoneHit(W / 2, H - 1, W, H), 'bottom'); // 下方不分左右
  assert.equal(zoneHit(0, 0, W, H), 'left');
});

test('zoneHit：超出畫面或壞輸入為 none', () => {
  const { zoneHit } = load();
  for (const a of [[-1, 5, 100, 100], [5, -1, 100, 100], [100, 5, 100, 100], [5, 100, 100, 100], [NaN, 5, 100, 100], [5, 5, 0, 100], [5, 5, 100, 0], [undefined, 5, 100, 100]])
    assert.equal(zoneHit(...a), 'none', JSON.stringify(a));
});

test('zoneSteer：只按左為 -1、只按右為 +1、都不按或兩邊同時按為 0（兩邊同時按互相抵消）', () => {
  const { zoneSteer } = load();
  assert.equal(zoneSteer({ left: true, right: false }), -1);
  assert.equal(zoneSteer({ left: false, right: true }), 1);
  assert.equal(zoneSteer({ left: false, right: false }), 0);
  assert.equal(zoneSteer({ left: true, right: true }), 0);
  assert.equal(zoneSteer({}), 0);
  assert.equal(zoneSteer({ left: true, bottom: true }), -1); // 煞車區不影響轉向
});
