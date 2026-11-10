// 抽出 yatouge.html 內 @cockpit 區塊（車內視角的純函式，不依賴 THREE / DOM）後在 Node 執行
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
const NAMES = 'GEARS, gearFor, gearLabel, wheelAngle, needleAngle, smoothTo, gatePos, shifterPath, shifterStep, cockpitMotion, newCockpitMotion, CK_LIM, COCKPIT_CARS, clusterY';
function load() {
  const open = '/* @cockpit:start */', s = html.indexOf(open), e = html.indexOf('/* @cockpit:end */');
  assert.ok(s >= 0 && e > s, '找不到 @cockpit 區塊');
  return new Function(`${html.slice(s + open.length, e)}\nreturn { ${NAMES} };`)();
}
const loadBox = () => new Function(`${html.slice(html.indexOf('/* @collision:start */'), html.indexOf('/* @collision:end */'))}\nreturn CAR_BOX;`)();
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const DEG = Math.PI / 180;

test('檔位共用函式：與 HUD 原本的門檻規則一致', () => {
  const { gearFor, gearLabel, GEARS } = load();
  assert.equal(gearFor(0), 1); assert.equal(gearFor(13), 1); assert.equal(gearFor(13.01), 2);
  assert.equal(gearFor(31.5), 4); assert.equal(gearFor(49), 5); assert.equal(gearFor(50.5), 6); assert.equal(gearFor(999), 6);
  assert.equal(GEARS.length, 7);
  assert.equal(gearLabel(0.2, 0), 'N'); assert.equal(gearLabel(5, -3), 'R'); assert.equal(gearLabel(20, 20), 2);
});

test('wheelAngle：±1 對應 ±270°，0 為 0，超出範圍被夾住，右轉為正（順時針）', () => {
  const { wheelAngle } = load();
  near(wheelAngle(1), 270 * DEG); near(wheelAngle(-1), -270 * DEG); near(wheelAngle(0), 0);
  near(wheelAngle(5), 270 * DEG); near(wheelAngle(-5), -270 * DEG); near(wheelAngle(0.5), 135 * DEG);
});

test('needleAngle：0 在 -135°、滿量程 +135°、中點 0°，並夾住範圍', () => {
  const { needleAngle } = load();
  near(needleAngle(0, 9000), -135 * DEG); near(needleAngle(9000, 9000), 135 * DEG); near(needleAngle(4500, 9000), 0);
  near(needleAngle(-50, 260), -135 * DEG); near(needleAngle(999, 260), 135 * DEG);
  assert.ok(needleAngle(100, 260) < needleAngle(150, 260));
});

test('smoothTo：朝目標單調靠近、不越過，dt 很大時也不爆衝', () => {
  const { smoothTo } = load();
  let v = 0; for (let i = 0; i < 30; i++) { const n = smoothTo(v, 10, 12, 1 / 60); assert.ok(n > v && n < 10); v = n; }
  assert.ok(smoothTo(0, 10, 12, 100) <= 10);
  near(smoothTo(3, 3, 12, 0.016), 3);
});

test('H 檔位置：1/2 同欄、3/4 同欄、5/6 同欄；奇數在前、偶數在後；R 在最右後；N 在中線', () => {
  const { gatePos } = load();
  const p = g => gatePos(g, -0.5, { col: 0, row: 0 });
  assert.equal(p(1).col, p(2).col); assert.equal(p(3).col, p(4).col); assert.equal(p(5).col, p(6).col);
  assert.ok(p(1).col < p(3).col && p(3).col < p(5).col && p(5).col < p('R').col);
  for (const g of [1, 3, 5]) assert.equal(p(g).row, 1);
  for (const g of [2, 4, 6, 'R']) assert.equal(p(g).row, -1);
  assert.equal(p('N').row, 0); near(p('N').col, -0.5);
  assert.equal(gatePos('N', 0.5, { col: 0, row: 0 }).col, 0.5);
});

test('shifterPath：起點終點正確；跨欄會先回中線；同欄直線；欄位單調', () => {
  const { shifterPath } = load();
  const o = { col: 0, row: 0 }, at = (fc, fr, tc, tr, t) => ({ ...shifterPath(fc, fr, tc, tr, t, o) });
  assert.deepEqual(at(-1.5, 1, 0.5, -1, 0), { col: -1.5, row: 1 });
  assert.deepEqual(at(-1.5, 1, 0.5, -1, 1), { col: 0.5, row: -1 });
  near(at(-1.5, 1, 0.5, -1, 0.5).row, 0);           // 橫移時一定在中線
  let prev = -Infinity;
  for (let i = 0; i <= 20; i++) { const c = at(-1.5, 1, 0.5, -1, i / 20).col; assert.ok(c >= prev - 1e-12); prev = c; }
  // 同欄 1→2：欄位不動，row 從 1 到 -1
  for (let i = 0; i <= 10; i++) { const r = at(-1.5, 1, -1.5, -1, i / 10); assert.equal(r.col, -1.5); assert.ok(r.row <= 1 && r.row >= -1); }
  near(at(0, 0, 0, 0, 0.5).row, 0);
});

test('shifterStep：換檔後約 0.18 秒抵達新檔位；換檔途中再換檔從目前位置接續', () => {
  const { shifterStep, gatePos } = load();
  const st = { col: -0.5, row: 0, fc: -0.5, fr: 0, tc: -0.5, tr: 0, t: 1, gear: null };
  shifterStep(st, 1, 0); shifterStep(st, 1, 0.2);
  const g1 = gatePos(1, -0.5, { col: 0, row: 0 }); near(st.col, g1.col); near(st.row, g1.row);
  shifterStep(st, 2, 0.05); assert.ok(st.row < 1 && st.row > -1, '動畫途中');
  shifterStep(st, 2, 0.2); near(st.row, -1); near(st.col, g1.col);
  // 1→3 跨欄，途中換成 4：不跳變（col 連續）
  shifterStep(st, 3, 0.07); const c1 = st.col, r1 = st.row;
  shifterStep(st, 4, 0); near(st.col, c1); near(st.row, r1);
  shifterStep(st, 4, 0.2); const g4 = gatePos(4, -0.5, { col: 0, row: 0 }); near(st.col, g4.col); near(st.row, g4.row);
});

const rest = { aLat: 0, aLong: 0, w: 0, spd: 0, steer: 0, shake: 0 };
const run = (inp, secs, dt = 1 / 60) => { const m = load().newCockpitMotion(), { cockpitMotion } = load(); let o; for (let t = 0; t < secs; t += dt) o = cockpitMotion(m, inp, dt); return { m, o }; };

test('cockpitMotion：靜止、無輸入時幾乎不動', () => {
  const { o } = run(rest, 1);
  for (const k of ['x', 'y', 'z', 'roll', 'pitch', 'yaw']) assert.ok(Math.abs(o[k]) < 0.001, `${k}=${o[k]}`);
});

test('cockpitMotion：極端輸入也不超過上限（約 ±4 cm、±3°、視線 ≤ 9°）', () => {
  const { CK_LIM } = load();
  assert.ok(CK_LIM.x <= 0.04 + 1e-12 && CK_LIM.roll <= 3 * DEG + 1e-12 && CK_LIM.yaw <= 9 * DEG + 1e-12);
  for (const s of [1, -1]) {
    const { o } = run({ aLat: s * 1e6, aLong: s * 1e6, w: s * 1e6, spd: 1e6, steer: s * 50, shake: 99 }, 3);
    assert.ok(Math.abs(o.x) <= CK_LIM.x + 1e-12 && Math.abs(o.z) <= CK_LIM.z + 1e-12 && Math.abs(o.y) <= CK_LIM.y + 1e-12);
    assert.ok(Math.abs(o.roll) <= CK_LIM.roll + 1e-12 && Math.abs(o.pitch) <= CK_LIM.pitch + 1e-12 && Math.abs(o.yaw) <= CK_LIM.yaw + 1e-12);
  }
  // 有限但很大的輸入也一樣；NaN 不會污染狀態
  const m = load().newCockpitMotion(), { cockpitMotion } = load();
  cockpitMotion(m, { ...rest, aLat: NaN, aLong: NaN, w: NaN, spd: NaN, steer: NaN, shake: NaN }, 1 / 60);
  const o = cockpitMotion(m, rest, 1 / 60);
  for (const k of ['x', 'y', 'z', 'roll', 'pitch', 'yaw']) assert.ok(Number.isFinite(o[k]), k);
});

test('cockpitMotion：方向 — 右轉（向右加速度）頭往左（局部 +x）並向外傾；煞車頭往前低頭；轉向往內看', () => {
  const R = run({ ...rest, spd: 30, aLat: 12 }, 1).o;
  assert.ok(R.x > 0.02 && R.roll > 1.5 * DEG, `x=${R.x} roll=${R.roll}`);
  const L = run({ ...rest, spd: 30, aLat: -12 }, 1).o;
  assert.ok(L.x < -0.02 && L.roll < -1.5 * DEG);
  const B = run({ ...rest, spd: 30, aLong: -20 }, 1).o;
  assert.ok(B.z > 0.02 && B.pitch > 1 * DEG, `z=${B.z} pitch=${B.pitch}`);
  const A = run({ ...rest, spd: 30, aLong: 20 }, 1).o;
  assert.ok(A.z < -0.02 && A.pitch < -1 * DEG);
  assert.ok(run({ ...rest, spd: 30, steer: 1 }, 1).o.yaw > 4 * DEG);       // 右轉 → 視線往右
  assert.ok(run({ ...rest, spd: 30, steer: -1 }, 1).o.yaw < -4 * DEG);
  assert.ok(run({ ...rest, spd: 30, w: 1.2 }, 1).o.yaw < -2 * DEG);        // w > 0 是向左轉
});

test('cockpitMotion：平滑 — 輸入階躍時每幀變化量很小', () => {
  const { cockpitMotion, newCockpitMotion } = load(), m = newCockpitMotion();
  for (let i = 0; i < 60; i++) cockpitMotion(m, { ...rest, spd: 30 }, 1 / 60);
  let prev = cockpitMotion(m, { ...rest, spd: 30 }, 1 / 60);
  prev = { ...prev };
  const big = { ...rest, spd: 30, aLat: 15, aLong: -20, steer: 1, w: -1.2 };
  for (let i = 0; i < 120; i++) {
    const o = cockpitMotion(m, big, 1 / 60);
    assert.ok(Math.abs(o.x - prev.x) < 0.006, `dx ${o.x - prev.x}`);
    assert.ok(Math.abs(o.z - prev.z) < 0.006 && Math.abs(o.y - prev.y) < 0.006);
    assert.ok(Math.abs(o.roll - prev.roll) < 0.5 * DEG && Math.abs(o.pitch - prev.pitch) < 0.5 * DEG && Math.abs(o.yaw - prev.yaw) < 0.6 * DEG);
    prev = { ...o };
  }
});

test('cockpitMotion：路面震動隨車速增加；撞牆（shake）會晃一下，shake 歸零後恢復', () => {
  const amp = spd => { const { cockpitMotion, newCockpitMotion } = load(), m = newCockpitMotion(); let mx = 0; for (let i = 0; i < 240; i++) mx = Math.max(mx, Math.abs(cockpitMotion(m, { ...rest, spd }, 1 / 60).y)); return mx; };
  assert.ok(amp(50) > amp(10) && amp(10) >= amp(0));
  assert.ok(amp(50) <= 0.005, '震動幅度很小');
  const { cockpitMotion, newCockpitMotion } = load(), m = newCockpitMotion();
  let mx = 0; for (let i = 0; i < 30; i++) { const o = cockpitMotion(m, { ...rest, shake: 0.6 }, 1 / 60); mx = Math.max(mx, Math.abs(o.y), Math.abs(o.pitch) * 0.1); }
  assert.ok(mx > 0.003, `撞擊晃動 ${mx}`);
  let o; for (let i = 0; i < 300; i++) o = cockpitMotion(m, rest, 1 / 60);
  assert.ok(Math.abs(o.y) < 0.001 && Math.abs(o.pitch) < 0.001 && Math.abs(o.yaw) < 0.001);
});

test('COCKPIT_CARS：涵蓋每台車，眼睛在 CAR_BOX 內、右駕，FOV 70–80，方向盤與儀表參數完整', () => {
  const { COCKPIT_CARS } = load(), box = loadBox();
  assert.deepEqual(Object.keys(COCKPIT_CARS).sort(), Object.keys(box).sort());
  for (const k in box) {
    const c = COCKPIT_CARS[k];
    assert.ok(Math.abs(c.eye.fwd) < box[k].hl && c.eye.right > 0.2 && c.eye.right < box[k].hw, `${k} eye`);
    assert.ok(c.eye.up > 0.9 && c.eye.up < c.hdr.y - 0.1, `${k} 眼睛高度要在車頂前緣之下`);
    assert.ok(c.fov >= 70 && c.fov <= 80, `${k} fov`);
    assert.ok(c.wheel.spokes.length >= 3 && c.wheel.r > 0.15 && c.wheel.r < 0.22, `${k} wheel`);
    assert.ok(c.mirrorX > c.eye.right && c.mirrorX < box[k].hw, `${k} 側鏡在車寬內`);
    assert.ok(['twin', 'bigTach', 'twinAux'].includes(c.gauges) && ['box', 'wrap'].includes(c.layout), k);
  }
  assert.equal(new Set(Object.values(COCKPIT_CARS).map(c => c.layout + c.gauges)).size, 3, '三台車的內裝風格各不相同');
});

// 從眼睛看向引擎蓋後緣的視線：儀表板頂面不能高過它；SR-7 的大轉速表群也不能高過它（容許 2 cm），否則會擋住前方路面
test('COCKPIT_CARS：儀表板頂面低於眼睛到引擎蓋後緣的視線；SR-7 的儀表群也是', () => {
  const { COCKPIT_CARS, clusterY } = load();
  const sight = (c, z) => c.eye.up + (c.hood[0] - c.eye.up) / (c.dashZ - c.eye.fwd) * (z - c.eye.fwd);
  for (const k in COCKPIT_CARS) {
    const c = COCKPIT_CARS[k];
    assert.ok(c.dashTop <= sight(c, c.dashZ) + 0.01, `${k} 儀表板頂 ${c.dashTop} vs 視線 ${sight(c, c.dashZ).toFixed(3)}`);
    assert.ok(Math.abs(c.hood[0] - c.dashTop) < 0.03, `${k} 引擎蓋後緣要貼齊儀表板頂，不留縫`);
  }
  const c = COCKPIT_CARS.coupe, top = clusterY(c) + 0.1; // 大轉速表半徑 0.1，儀表罩頂與錶頂同高
  assert.ok(top <= sight(c, 0.86) + 0.02, `coupe 儀表群頂 ${top} vs 視線 ${sight(c, 0.86).toFixed(3)}`);
  assert.ok(clusterY(COCKPIT_CARS.hatch) > COCKPIT_CARS.hatch.dashTop, '預設儀表群在儀表板頂面上方');
});
