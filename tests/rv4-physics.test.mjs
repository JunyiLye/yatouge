// RV-4 拉力四驅（出彎王）的物理與平衡：以遊戲本身的 vehicleAccel / vehicleTurn（@vehicle）做決定性模擬，
// 比較四台車的起步、極速、彎中極限、甩尾難易與出彎。另外釘死其他三台車的數值不變（新參數 exitBoost 預設不影響它們）。
// 設 RV4_DUMP=1 會印出平衡表。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const G = new Function(`const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
${block('course-geometry')}\n${block('engine')}\n${block('gearbox')}\n${block('drift-follow')}\n${block('vehicle')}\n${block('collision')}\n${block('cars')}
return { HW, CAR_BOX, CARS, GB, wrap, wallContact, vehicleAccel, vehicleTurn, exitBoostFactor };`)();
const { HW, CAR_BOX, CARS, GB, wrap, wallContact, vehicleAccel, vehicleTurn } = G;
const KEYS = ['hatch', 'coupe', 'gtr', 'rally'];
const BASE = { brake: 24, drag: 0.0008, roll: 0.3 };
const physOf = (k, ov) => ({ ...CARS[k].phys, ...BASE, ...ov });
const newCar = (vz = 0) => ({ x: 0, z: 0, h: 0, vx: 0, vz, w: 0, steer: 0, drift: false, penalty: 0 });
const ROAD = { grade: 0, h: 0 };

// ---- 其他三台車逐字不變 ----
test('其他三台車的物理、AI、變速箱數值逐字不變（RV-4 不影響它們）', () => {
  assert.deepEqual(CARS.hatch.phys, { maxV: 54, engine: 11.5, lag: 0, grip: 9, gripLimit: 20.5, drift: 1.12, slide: 0.1, hb: 3.5 });
  assert.deepEqual(CARS.coupe.phys, { maxV: 61, engine: 14, lag: 1, grip: 8, gripLimit: 19, drift: 1, slide: 0.22, hb: 7 });
  assert.deepEqual(CARS.gtr.phys, { maxV: 70, engine: 18.5, lag: 1, grip: 6.5, gripLimit: 15.5, drift: 0.72, slide: 0.5, hb: 8 });
  assert.deepEqual(CARS.hatch.ai, { top: 44, acc: 6, lat: 11.5 });
  assert.deepEqual(CARS.coupe.ai, { top: 50, acc: 8.5, lat: 9.5 });
  assert.deepEqual(CARS.gtr.ai, { top: 52, acc: 9, lat: 8.5 });
  assert.deepEqual(GB.CARS.hatch, { redline: 8000, v6: 58, gain: 1.25 });
  assert.deepEqual(GB.CARS.coupe, { redline: 8000, v6: 67, gain: 0.75 });
  assert.deepEqual(GB.CARS.gtr, { redline: 7600, v6: 78, gain: 0.8 });
  for (const k of ['hatch', 'coupe', 'gtr']) assert.equal(CARS[k].phys.exitBoost, undefined, `${k} 不該有 exitBoost`);
});

// ---- exitBoost：只在「油門＋轉向」時加推力；沒有這個參數時完全等於舊算法 ----
test('exitBoost：沒有這個參數時，不論轉向角，加速度與 exitBoost: 0 逐位相同', () => {
  for (const k of ['hatch', 'coupe', 'gtr'])
    for (const steer of [0, 0.3, 1, -1]) for (const vz of [0, 5, 20, 45]) {
      const P = physOf(k), u = { sIn: steer, gas: true, brake: false, hb: false };
      const a = vehicleAccel({ ...newCar(vz), steer }, P, u, ROAD, 1 / 60);
      const b = vehicleAccel({ ...newCar(vz), steer }, { ...P, exitBoost: 0 }, u, ROAD, 1 / 60);
      assert.equal(a, b, `${k} steer ${steer} v ${vz}`);
    }
});
test('exitBoost：直線不加推力、沒踩油門不加推力、轉向越大推力越大（0.4 飽和）、左右對稱', () => {
  const P = physOf('rally'), u = (gas, sIn) => ({ sIn, gas, brake: false, hb: false });
  const acc = (steer, gas, p = P) => vehicleAccel({ ...newCar(15), steer }, p, u(gas, steer), ROAD, 1 / 60);
  const noBoost = { ...P, exitBoost: 0 };
  assert.ok(P.exitBoost > 0, 'RV-4 要有 exitBoost');
  assert.equal(acc(0, true), acc(0, true, noBoost), '直線不變');
  assert.ok(acc(0.2, true) > acc(0.1, true) && acc(0.4, true) > acc(0.2, true), '轉向越大推力越大');
  assert.equal(acc(1, true), acc(0.4, true), '轉向 0.4 以上飽和');
  assert.ok(Math.abs((acc(1, true) - acc(1, false)) / (acc(0, true) - acc(0, false)) - (1 + P.exitBoost)) < 1e-9, "飽和時推力 = (1 + exitBoost) 倍");
  assert.equal(acc(1, false), acc(1, false, noBoost), '沒踩油門不加');
  assert.equal(acc(-1, true), acc(1, true), '左右對稱');
});

// ---- 平衡模擬 ----
const DT = 1 / 120;
function launch(k) { // 直線全油門（自排、不含換檔損失）：0–60、0–100 km/h 與極速
  const P = physOf(k), c = newCar(0); let t = 0, t60 = null, t100 = null;
  while (t < 80) { const a = vehicleAccel(c, P, { sIn: 0, gas: true, brake: false, hb: false }, ROAD, DT); c.vz += a * DT; t += DT; if (t60 === null && c.vz >= 60 / 3.6) t60 = t; if (t100 === null && c.vz >= 100 / 3.6) t100 = t; }
  return { t60, t100, top: c.vz * 3.6 };
}
// 右轉半圓髮夾（同 handling.test.mjs）：lat > 0 為行進方向右側
const frame = R => (x, z) => {
  if (z >= 0) { const th = Math.atan2(z, x + R); return { lat: R - Math.hypot(x + R, z), rx: -Math.cos(th), rz: -Math.sin(th), h: -th }; }
  if (x >= -R) return { lat: -x, rx: -1, rz: 0, h: 0 };
  return { lat: x + 2 * R, rx: 1, rz: 0, h: -Math.PI };
};
function hairpinOk(k, R, vE) {
  const P = physOf(k), box = CAR_BOX[k], fr = frame(R), D = 1 / 60;
  const c = { x: 2.5, z: -60, h: 0, vx: 0, vz: vE, w: 0, steer: 0, drift: false, penalty: 0 };
  let t = 0, tArc = null;
  while (t < 40) {
    const f = fr(c.x, c.z), v = Math.hypot(c.vx, c.vz), onArc = c.z >= 0;
    if (onArc && tArc === null) tArc = t;
    const ff = onArc ? (v / R) * (1 + v / 42) / 1.75 : 0;
    const u = { sIn: Math.max(-1, Math.min(1, ff - 0.12 * f.lat + 1.5 * wrap(c.h - f.h))), gas: v < vE, brake: v > vE + 3, hb: false };
    const a = vehicleAccel(c, P, u, { grade: 0, h: f.h }, D);
    vehicleTurn(c, P, u, a, D);
    c.x += c.vx * D; c.z += c.vz * D; t += D;
    if (wallContact(c, box, fr, HW + 0.3)) return false;
    if (c.z < -50 && c.x < -R) return true;
  }
  return false;
}
function corner(k, R) { let best = 0; for (let v = 6; v <= 40; v += 0.25) { if (hairpinOk(k, R, v)) best = v; else if (best) break; } return best; } // 純抓地不撞牆的最高進彎速度 (m/s)
function driftTest(k) { // 25 m/s 進彎：轉向 0.6 持續 1 秒、第 0.3–0.65 秒點手煞；peak = 最大滑移角 (rad)；dur = 放開方向盤後還在甩尾的秒數；vEnd = 4 秒後（全程油門）的車速，代表甩出彎後還剩多少速度
  const P = physOf(k), c = newCar(25), D = 1 / 60; let t = 0, peak = 0, dur = 0;
  while (t < 4) {
    const u = { sIn: t > 0.1 && t < 1.1 ? 0.6 : 0, gas: true, brake: false, hb: t > 0.3 && t < 0.65 };
    const a = vehicleAccel(c, P, u, ROAD, D); vehicleTurn(c, P, u, a, D); c.x += c.vx * D; c.z += c.vz * D; t += D;
    if (c.drift && t < 1.2) peak = Math.max(peak, Math.abs(wrap(c.h - Math.atan2(c.vx, c.vz))));
    if (c.drift && t >= 1.1) dur += D;
  }
  return { peak, dur, vEnd: Math.hypot(c.vx, c.vz) };
}
function sustainedDrift(k) { // 同一個進彎，但方向盤一直壓著不回正的 4 秒長甩尾（全程油門）；回傳 4 秒後車速 (m/s)
  const P = physOf(k), c = newCar(25), D = 1 / 60; let t = 0;
  while (t < 4) { const u = { sIn: t > 0.1 ? 0.6 : 0, gas: true, brake: false, hb: t > 0.3 && t < 0.65 }; const a = vehicleAccel(c, P, u, ROAD, D); vehicleTurn(c, P, u, a, D); c.x += c.vx * D; c.z += c.vz * D; t += D; }
  return Math.hypot(c.vx, c.vz);
}
function holdSpeed(k, R, v0) { // 全油門過彎（車速低於上限就踩油門）：連續繞 14 秒（穩態）不離開車道 2.5 m 的最高上限速度 (m/s)；上限掃到 45 都過就回 45
  const P = physOf(k), D = 1 / 60; let best = 0;
  for (let vT = 14; vT <= 45; vT += 0.25) {
    const c = { x: 0, z: 0, h: 0, vx: 0, vz: v0, w: 0, steer: 0, drift: false, penalty: 0 }; let t = 0, ok = true;
    for (;;) {
      const th = Math.atan2(c.z, c.x + R), lat = R - Math.hypot(c.x + R, c.z), h = -th, v = Math.hypot(c.vx, c.vz);
      if (t >= 14) break;
      if (Math.abs(lat) > 2.5) { ok = false; break; }
      const ff = (v / R) * (1 + v / 42) / 1.75, u = { sIn: Math.max(-1, Math.min(1, ff - 0.12 * lat + 1.5 * wrap(c.h - h))), gas: v < vT, brake: v > vT + 3, hb: false };
      const a = vehicleAccel(c, P, u, { grade: 0, h }, D); vehicleTurn(c, P, u, a, D); c.x += c.vx * D; c.z += c.vz * D; t += D;
    }
    if (ok) best = vT; else if (best) break;
  }
  return best;
}
function exitSpeed(k, vA) { // 出彎：從彎心速度 vA 起、全油門、方向盤 0.5 持續 1.5 秒再放開；回傳 3.5 秒後的車速 (m/s)
  const P = physOf(k), c = newCar(vA), D = 1 / 60; let t = 0;
  while (t < 3.5) { const u = { sIn: t < 1.5 ? 0.5 : 0, gas: true, brake: false, hb: false }; const a = vehicleAccel(c, P, u, ROAD, D); vehicleTurn(c, P, u, a, D); c.x += c.vx * D; c.z += c.vz * D; t += D; }
  return Math.hypot(c.vx, c.vz);
}
const M = {};
for (const k of KEYS) { const c22 = corner(k, 22), c30 = corner(k, 30); M[k] = { ...launch(k), c22, c30, ...driftTest(k), exit: exitSpeed(k, 10), sust: sustainedDrift(k), hold60: holdSpeed(k, 60, 14), hold30: holdSpeed(k, 30, 12) }; }
if (process.env.RV4_DUMP) {
  console.log('car    0-60  0-100  top   R22  R30  slipPk  driftDur  driftExit  hairpinExit  sustDrift  hold60  hold30(m/s)');
  for (const k of KEYS) { const m = M[k]; console.log(k.padEnd(6), m.t60.toFixed(2), m.t100.toFixed(2).padStart(6), m.top.toFixed(0).padStart(5), m.c22.toFixed(2).padStart(5), m.c30.toFixed(2).padStart(5), m.peak.toFixed(2).padStart(6), m.dur.toFixed(2).padStart(8), m.vEnd.toFixed(1).padStart(9), m.exit.toFixed(1).padStart(10), m.sust.toFixed(1).padStart(11), m.hold60.toFixed(2).padStart(7), m.hold30.toFixed(2).padStart(7)); }
}

test('平衡：起步（0–60 km/h）快於 SR-7 與 KX-2（不必是四台最快，GT-32 動力更大）；0–100 介於 GT-32 與 SR-7 之間、貼近 SR-7', () => {
  for (const k of ['hatch', 'coupe']) assert.ok(M.rally.t60 < M[k].t60, `rally ${M.rally.t60} < ${k} ${M[k].t60}`);
  assert.ok(M.gtr.t100 < M.rally.t100 && M.rally.t100 < M.coupe.t100, `0-100 ${M.gtr.t100} < ${M.rally.t100} < ${M.coupe.t100}`);
  assert.ok(M.rally.t100 > M.coupe.t100 * 0.85, `0-100 與 SR-7 相差不到 15%：${M.rally.t100} vs ${M.coupe.t100}`);
});
test('平衡：極速低於 SR-7、高於 KX-2', () => {
  assert.ok(M.hatch.top < M.rally.top && M.rally.top < M.coupe.top, `${M.hatch.top} < ${M.rally.top} < ${M.coupe.top}`);
});
test('平衡：彎中極限速度低於 SR-7 與 KX-2、高於 GT-32（R22 與 R30 兩種半徑）', () => {
  for (const R of ['c22', 'c30']) assert.ok(M.gtr[R] < M.rally[R] && M.rally[R] < M.coupe[R] && M.coupe[R] < M.hatch[R], `${R}: ${M.gtr[R]} < ${M.rally[R]} < ${M.coupe[R]} < ${M.hatch[R]}`);
});
test('平衡：甩尾比 SR-7 難（滑移角較小、很快回正）', () => {
  assert.ok(M.rally.peak < M.coupe.peak, `peak ${M.rally.peak} < ${M.coupe.peak}`);
  assert.ok(M.rally.dur < M.coupe.dur * 0.7, `dur ${M.rally.dur} < 0.7 * ${M.coupe.dur}`);
});
test('平衡：短甩尾出彎的速度（driftExit）高於 GT-32、不高於 SR-7 / KX-2 的 1.03 倍（甩尾不划算）', () => {
  assert.ok(M.rally.vEnd > M.gtr.vEnd, `rally ${M.rally.vEnd} > gtr ${M.gtr.vEnd}`);
  for (const k of ['hatch', 'coupe']) assert.ok(M.rally.vEnd < M[k].vEnd * 1.03, `rally ${M.rally.vEnd} vs ${k} ${M[k].vEnd}`);
});
test('平衡：持續 4 秒的長甩尾，RV-4 的車速低於 SR-7 與 KX-2（甩尾不划算）、高於 GT-32', () => {
  assert.ok(M.rally.sust < M.coupe.sust && M.rally.sust < M.hatch.sust && M.rally.sust > M.gtr.sust, `${M.gtr.sust} < ${M.rally.sust} < ${M.coupe.sust}, ${M.hatch.sust}`);
});
// 試玩第 2 輪（engine 12.5）：使用者接受出彎與 SR-7 打平，只要不輸 SR-7、明顯勝過 KX-2
test('平衡：髮夾出彎（hairpinExit：10 m/s 起、全油門、方向盤 0.5 持續 1.5 秒）勝過 KX-2、不輸 SR-7；GT-32 的純直線動力更大，不在此比較', () => {
  assert.ok(M.rally.exit > M.hatch.exit + 0.3, `rally ${M.rally.exit} > hatch ${M.hatch.exit}`);
  assert.ok(M.rally.exit >= M.coupe.exit, `rally ${M.rally.exit} >= coupe ${M.coupe.exit}`);
});
test('平衡：全油門穩態過彎（中、高速半徑 R60、R30），RV-4 的可維持速度不超過 SR-7 與 KX-2、高於 GT-32（exitBoost 不能撐起彎中速度）', () => {
  assert.ok(M.rally.hold60 <= M.coupe.hold60 && M.rally.hold60 <= M.hatch.hold60 && M.rally.hold60 > M.gtr.hold60, `R60 ${M.gtr.hold60} < ${M.rally.hold60} <= ${M.coupe.hold60}, ${M.hatch.hold60}`);
  assert.ok(M.rally.hold30 <= M.coupe.hold30 && M.rally.hold30 <= M.hatch.hold30 && M.rally.hold30 > M.gtr.hold30, `R30 ${M.gtr.hold30} < ${M.rally.hold30} <= ${M.coupe.hold30}, ${M.hatch.hold30}`);
});
test('exitBoostFactor：15 m/s 以下全額、25 m/s 以上為 1（無加成）、中間線性；方向盤 0.4 飽和', () => {
  const f = (st, v) => G.exitBoostFactor(0.8, st, v);
  assert.equal(f(0.4, 10), 1.8); assert.equal(f(0.4, 15), 1.8); assert.equal(f(0.4, 25), 1); assert.equal(f(0.4, 40), 1);
  assert.ok(Math.abs(f(0.4, 20) - 1.4) < 1e-12); assert.ok(Math.abs(f(1, 20) - 1.4) < 1e-12 && Math.abs(f(0.2, 10) - 1.4) < 1e-12);
  assert.equal(f(0, 10), 1); assert.equal(f(-0.4, 10), 1.8);
});
test('RV-4 資料：星等 [4, 3, 2, 5]、AI 表合理、模擬是決定性的', () => {
  assert.deepEqual(CARS.rally.stats.map(s => s[1]), [4, 3, 2, 5]);
  const ai = CARS.rally.ai; assert.ok(ai.top > 30 && ai.acc > 3 && ai.lat > 5);
  assert.deepEqual(driftTest('rally'), driftTest('rally'));
});
