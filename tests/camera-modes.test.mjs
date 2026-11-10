// 抽出 yatouge.html 內 @camera-modes 區塊（純函式，不依賴 THREE / DOM）後在 Node 執行
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function load() {
  const open = '/* @camera-modes:start */', s = html.indexOf(open), e = html.indexOf('/* @camera-modes:end */');
  assert.ok(s >= 0 && e > s, '找不到 @camera-modes 區塊');
  return new Function(`${html.slice(s + open.length, e)}\nreturn { CAM_MODES, nextCam, camModeFromStore, nearChasePose, cockpitLocal };`)();
}
const BOXES = { hatch: { hl: 2.15, hw: 0.83 }, coupe: { hl: 2.25, hw: 0.87 } };
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('nextCam 依 chase → near → cockpit → chase 循環', () => {
  const { nextCam } = load();
  assert.equal(nextCam('chase'), 'near');
  assert.equal(nextCam('near'), 'cockpit');
  assert.equal(nextCam('cockpit'), 'chase');
});

test('nextCam 遇到未知值回到 chase', () => {
  const { nextCam } = load();
  for (const v of ['', 'foo', null, undefined, 3]) assert.equal(nextCam(v), 'chase');
});

test('camModeFromStore：有效值原樣回傳，無效值回 chase', () => {
  const { camModeFromStore, CAM_MODES } = load();
  for (const m of CAM_MODES) assert.equal(camModeFromStore(m), m);
  for (const v of [null, undefined, '', 'Chase', 'cockpit ', '1', {}]) assert.equal(camModeFromStore(v), 'chase');
});

test('nearChasePose：比 chase 公式更近，且不穿進車身（距離 > 半車長 + 1）', () => {
  const { nearChasePose } = load();
  for (const key in BOXES) for (const spd of [0, 10, 25, 50]) for (const camH of [0, 0.7, -2.4]) {
    const car = { x: 12, y: 30, z: -8 };
    const p = nearChasePose(car, camH, spd).pos;
    // chase 公式（逐字取自 updateCamera）
    const cd = 6.4 + spd * 0.035, chase = { x: car.x - Math.sin(camH) * cd, y: car.y + 2.5 + spd * 0.012, z: car.z - Math.cos(camH) * cd };
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    const dh = Math.hypot(p.x - car.x, p.z - car.z);
    assert.ok(dist(p, car) < dist(chase, car), `spd ${spd}: near ${dist(p, car)} 應小於 chase ${dist(chase, car)}`);
    assert.ok(dh > BOXES[key].hl + 1, `spd ${spd}: 水平距離 ${dh} 應大於 ${BOXES[key].hl + 1}`);
  }
});

test('nearChasePose：鏡頭在 camH 方向的後方，注視點在前方', () => {
  const { nearChasePose } = load();
  const camH = 0.9, car = { x: 0, y: 0, z: 0 }, { pos, look } = nearChasePose(car, camH, 20);
  const f = { x: Math.sin(camH), z: Math.cos(camH) };
  assert.ok(pos.x * f.x + pos.z * f.z < 0, '鏡頭應在後方');
  assert.ok(look.x * f.x + look.z * f.z > 0, '注視點應在前方');
  assert.ok(pos.y > look.y, '鏡頭高於注視點');
});

// 車身 group rotation.y = h 時，局部座標 (lx, lz) 換成世界方向（與 updateCamera 使用的 localToWorld 同一慣例）
const toWorld = (l, h) => ({ x: l.x * Math.cos(h) + l.z * Math.sin(h), z: -l.x * Math.sin(h) + l.z * Math.cos(h) });

test('cockpitLocal：眼睛在碰撞框內、位於右側（右駕）、高度 1.05', () => {
  const { cockpitLocal } = load();
  for (const key in BOXES) {
    const { local } = cockpitLocal(BOXES[key]);
    assert.ok(Math.abs(local.z) < BOXES[key].hl, `前後 ${local.z}`);
    assert.ok(Math.abs(local.x) < BOXES[key].hw, `左右 ${local.x}`);
    near(local.y, 1.05);
    // 局部 -x 是車右：任何朝向下，眼睛相對車心的偏移在 (-cos h, sin h) 方向上都為正
    for (const h of [0, 0.8, 2.5, -1.9]) {
      const w = toWorld(local, h);
      assert.ok(w.x * -Math.cos(h) + w.z * Math.sin(h) > 0.2, `h=${h} 應在右側`);
    }
  }
});

test('cockpitLocal：偏移被收進很小的碰撞框內', () => {
  const { cockpitLocal } = load();
  const { local } = cockpitLocal({ hl: 0.1, hw: 0.1 });
  assert.ok(Math.abs(local.z) < 0.1 && Math.abs(local.x) < 0.1);
});

test('cockpitLocal：後照鏡相機在車中線、車頭方向上緣（高於眼睛）、位於碰撞框內', () => {
  const { cockpitLocal } = load();
  for (const key in BOXES) {
    const { local, mirrorLocal } = cockpitLocal(BOXES[key]);
    near(mirrorLocal.x, 0);
    assert.ok(mirrorLocal.y > local.y, '後照鏡相機高於眼睛');
    assert.ok(Math.abs(mirrorLocal.z) < BOXES[key].hl);
  }
});

test('out 參數：nearChasePose / cockpitLocal 寫入並回傳傳入的物件，內容與新建結果相同', () => {
  const { nearChasePose, cockpitLocal } = load();
  const car = { x: 1, y: 2, z: 3 };
  const outN = { pos: {}, look: {} };
  assert.equal(nearChasePose(car, 0.5, 20, outN), outN);
  assert.deepEqual(outN, nearChasePose(car, 0.5, 20));
  const outC = { local: {}, mirrorLocal: {} };
  assert.equal(cockpitLocal(BOXES.hatch, outC), outC);
  assert.deepEqual(outC, cockpitLocal(BOXES.hatch));
});

test('nearChasePose：鏡頭略高於車，向下俯角 9°–15°（spd 0 與 30）', () => {
  const { nearChasePose } = load();
  for (const spd of [0, 30]) {
    const { pos, look } = nearChasePose({ x: 0, y: 0, z: 0 }, 0.6, spd);
    const pitch = Math.atan2(pos.y - look.y, Math.hypot(look.x - pos.x, look.z - pos.z)) * 180 / Math.PI;
    assert.ok(pitch >= 9 && pitch <= 15, `spd ${spd}: 俯角 ${pitch.toFixed(1)}°`);
  }
});
