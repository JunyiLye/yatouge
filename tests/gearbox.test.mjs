// 手排變速箱：抽出 yatouge.html 的 @gearbox（純函式），搭配 @engine / @vehicle / @cars 做決定性模擬
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
${block('course-geometry')}\n${block('engine')}\n${block('gearbox')}\n${block('drift-follow')}\n${block('vehicle')}\n${block('collision')}\n${block('cars')}\n${block('cockpit')}
return { GB, CARS, GEARS, gearFor, engineForce, vehicleAccel, gbRedlineSpeed, gbRpm, gbTorque, gbGearFactor, gbMul, gbShift, gbStep, gbCutting, gbOverSpeed, gbShiftBrake, atGear, atStep, atMul };`)();
const { GB, CARS, GEARS, gearFor, engineForce, vehicleAccel, gbRedlineSpeed, gbRpm, gbTorque, gbGearFactor, gbMul, gbShift, gbStep, gbCutting, gbOverSpeed, gbShiftBrake, atGear, atStep, atMul } = G;
const KEYS = ['hatch', 'coupe', 'gtr'];
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('每台車有 6 檔，紅線車速逐檔遞增，紅線轉速在 7000–8500', () => {
  for (const k of KEYS) {
    let prev = 0;
    for (let g = 1; g <= 6; g++) { const v = gbRedlineSpeed(k, g); assert.ok(v > prev, `${k} ${g}`); prev = v; }
    assert.ok(GB.CARS[k].redline >= 7000 && GB.CARS[k].redline <= 8500, k);
  }
});

test('rpm：紅線車速剛好是紅線、靜止是怠速、同車速檔位越高轉速越低', () => {
  for (const k of KEYS) {
    for (let g = 1; g <= 6; g++) near(gbRpm(k, g, gbRedlineSpeed(k, g)), GB.CARS[k].redline, 1e-6);
    assert.equal(gbRpm(k, 1, 0), GB.IDLE);
    for (let g = 1; g < 6; g++) assert.ok(gbRpm(k, g, 25) > gbRpm(k, g + 1, 25), `${k} ${g}`);
  }
});

test('扭力曲線：低轉弱、中段 1、接近紅線略降但不為 0', () => {
  assert.ok(gbTorque(1000) < 0.3);
  assert.ok(gbTorque(2000) < gbTorque(3000) && gbTorque(3000) < gbTorque(4500));
  near(gbTorque(4500), 1); near(gbTorque(6000), 1); near(gbTorque(7000), 1);
  assert.ok(gbTorque(8000) < 1 && gbTorque(8000) > 0.8);
  assert.equal(gbTorque(-5), gbTorque(0));
});

test('檔位係數：低檔大、6 檔剛好是 1（極速不變的前提）', () => {
  for (const k of KEYS) {
    for (let g = 1; g < 6; g++) assert.ok(gbGearFactor(k, g) > gbGearFactor(k, g + 1) - 1e-12 && gbGearFactor(k, g) >= 1, `${k} ${g}`);
    assert.equal(gbGearFactor(k, 6), 1);
  }
});

test('紅線斷油：到紅線車速推力為 0，略低於則有力', () => {
  for (const k of KEYS) for (let g = 1; g <= 6; g++) {
    const v = gbRedlineSpeed(k, g);
    assert.equal(gbMul(k, g, v, 0), 0, `${k} ${g} 紅線`);
    assert.equal(gbMul(k, g, v * 1.2, 0), 0);
    assert.ok(gbMul(k, g, v * 0.98, 0) > 0.5, `${k} ${g} 紅線前`);
    assert.equal(gbCutting(k, g, v), true);
    assert.equal(gbCutting(k, g, v * 0.9), false);
  }
});

test('拖檔：高檔低轉的推力遠小於合適檔位', () => {
  for (const k of KEYS) {
    const spd = 8; // 約 29 km/h
    assert.ok(gbMul(k, 6, spd, 0) < 0.2, `${k} 6 檔`);
    const best = Math.max(...[1, 2, 3, 4, 5].map(g => gbMul(k, g, spd, 0)));
    assert.ok(gbMul(k, 6, spd, 0) < best * 0.25, `${k} 6 檔 vs 最佳檔`);
  }
});

test('起步：1 檔靜止時以離合器半連動轉速出力（不是 0）', () => {
  for (const k of KEYS) near(gbMul(k, 1, 0, 0), gbGearFactor(k, 1) * gbTorque(GB.LAUNCH_RPM));
  assert.ok(gbMul('hatch', 2, 0, 0) < 0.3); // 2 檔起步會無力
});

test('換檔空檔：shiftT > 0 時推力為 0，0.12 秒後歸零', () => {
  assert.equal(GB.SHIFT_CUT, 0.12);
  for (const k of KEYS) { assert.equal(gbMul(k, 3, 20, 0.05), 0); assert.ok(gbMul(k, 3, 20, 0) > 0); }
  let t = GB.SHIFT_CUT, n = 0;
  while (t > 0) { t = gbStep(t, 1 / 120); n++; }
  assert.equal(t, 0); assert.ok(n >= 14 && n <= 15, `n=${n}`);
  assert.equal(gbStep(0, 0.1), 0);
});

test('換檔與降檔保護', () => {
  const k = 'coupe';
  assert.deepEqual(gbShift(k, 3, 1, 20), { gear: 4, ok: true });
  assert.deepEqual(gbShift(k, 3, -1, 10), { gear: 2, ok: true });
  assert.deepEqual(gbShift(k, 6, 1, 40), { gear: 6, ok: false, why: 'top' });
  assert.deepEqual(gbShift(k, 1, -1, 5), { gear: 1, ok: false, why: 'bottom' });
  // 高速降檔也允許（之後由 gbOverSpeed 把車速降到該檔極速）
  assert.deepEqual(gbShift(k, 5, -1, gbRedlineSpeed(k, 4) * 0.9), { gear: 4, ok: true });
  assert.deepEqual(gbShift(k, 5, -1, gbRedlineSpeed(k, 2) * 3), { gear: 4, ok: true });
  assert.equal(gbShift(k, 99, 1, 10).gear, 6); // 非法檔位被夾住
  assert.equal(gbShift(k, 0, 1, 10).gear, 2);
});

// ---- 決定性模擬：直線、平路，用遊戲自己的 vehicleAccel ----
const DT = 1 / 120;
// 自排與手排都含換檔空檔 + 換檔煞車（與遊戲 physics() 相同的順序）；dips：每次換檔後 0.25 秒內相對換檔瞬間的最大掉速 (km/h)
function sim(key, mode) {
  const P = { ...CARS[key].phys, brake: 24, drag: 0.0008, roll: 0.3 };
  const c = { x: 0, z: 0, h: 0, vx: 0, vz: 0, w: 0, steer: 0, drift: false, penalty: 0 };
  let t = 0, g = 1, cut = 0, ag = 1, t100 = null, top = 0, shifts = 0;
  const dips = [], open = [];
  const mulOf = (gg, v) => gbMul(key, gg, v, 0);
  while (t < 60) {
    const v = c.vz;
    let mul, brakeCut;
    if (mode === 'auto') {
      const r = atStep(ag, cut, v, v, GEARS, DT, true);
      if (r.gear !== ag) { shifts++; open.push({ v, t, min: v }); }
      ag = r.gear; cut = r.shiftT; mul = atMul(cut); brakeCut = cut;
    } else {
      if (mode === 'optimal' && cut <= 0 && g < 6 && gbRpm(key, g, v) > 3500 && mulOf(g + 1, v) >= mulOf(g, v) * 1.0001) { g++; cut = GB.SHIFT_CUT; shifts++; open.push({ v, t, min: v }); }
      if (mode === 'g1') g = 1; else if (mode === 'g6') g = 6;
      mul = gbMul(key, g, v, cut); brakeCut = cut;
      cut = gbStep(cut, DT);
    }
    const a = vehicleAccel(c, P, { sIn: 0, gas: true, brake: false, hb: false, mul }, { grade: 0, h: 0 }, DT);
    c.vz += a * DT; t += DT;
    c.vz = gbShiftBrake(c.vz, brakeCut, DT);
    for (const d of open) d.min = Math.min(d.min, c.vz);
    while (open.length && t - open[0].t > 0.25) { const d = open.shift(); dips.push((d.v - d.min) * 3.6); }
    if (t100 === null && c.vz >= 100 / 3.6) t100 = t;
    top = Math.max(top, c.vz);
  }
  return { t100, top: top * 3.6, shifts, dips };
}

test('模擬：最佳換檔的手排 0–100 km/h 比自排快 3–8%，極速相同', () => {
  for (const k of KEYS) {
    const a = sim(k, 'auto'), m = sim(k, 'optimal'), gain = (a.t100 - m.t100) / a.t100 * 100;
    console.log(`  ${k}: auto ${a.t100.toFixed(3)} s / ${a.top.toFixed(1)} km/h; manual ${m.t100.toFixed(3)} s / ${m.top.toFixed(1)} km/h; 快 ${gain.toFixed(1)}%`);
    assert.ok(gain >= 3 && gain <= 8, `${k} 快了 ${gain.toFixed(2)}%`);
    assert.ok(Math.abs(m.top - a.top) / a.top < 0.005, `${k} 極速 ${m.top} vs ${a.top}`);
  }
});

test('模擬：永遠 1 檔或永遠 6 檔明顯較慢', () => {
  for (const k of KEYS) {
    const a = sim(k, 'auto'), g1 = sim(k, 'g1'), g6 = sim(k, 'g6');
    assert.ok(g1.t100 === null && g1.top < 80, `${k} 1 檔極速 ${g1.top}`);
    assert.ok(g6.t100 === null || g6.t100 > a.t100 * 1.5, `${k} 6 檔 0–100 ${g6.t100}`);
  }
});

// ---- 自排：換檔空檔以外不變 ----
test('自排：換檔空檔以外 vehicleAccel 的值與改動前逐值相同（未傳 mul、mul = 1 或 atMul(0)）', () => {
  // 改動前的公式（逐字）
  const old = (c, P, u, loc) => {
    const fx = Math.sin(c.h), fz = Math.cos(c.h), vf = c.vx * fx + c.vz * fz;
    let a = 0;
    const lagF = P.lag ? Math.max(0.42, Math.min(1.15, 0.42 + Math.max(0, vf) / 36)) : 1;
    const pen = c.penalty > 0 ? 0.1 : 1;
    if (u.gas && vf < P.maxV) a += engineForce(P.engine, lagF, vf, P.maxV, pen);
    if (u.brake) { if (vf > 0.5) a -= P.brake; else if (!u.gas && vf > -6) a -= 5; }
    if (u.hb) a -= Math.sign(vf) * P.hb;
    a -= P.drag * vf * Math.abs(vf) + (Math.abs(vf) > 0.3 ? Math.sign(vf) * P.roll : 0);
    a += -9.8 * loc.grade * (fx * Math.sin(loc.h) + fz * Math.cos(loc.h)) * 0.7;
    if (!u.gas && !u.brake && Math.abs(vf) < 0.4) a -= vf * 4;
    return a;
  };
  for (const k of KEYS) for (const vz of [-3, 0, 2, 5, 12, 30, 45, 60]) for (const gas of [true, false]) for (const brake of [false, true]) for (const penalty of [0, 1]) {
    const P = { ...CARS[k].phys, brake: 24, drag: 0.0008, roll: 0.3 }, loc = { grade: 0.05, h: 0.3 };
    const mk = () => ({ h: 0.2, vx: Math.sin(0.2) * vz, vz: Math.cos(0.2) * vz, steer: 0, penalty });
    const u = { sIn: 0, gas, brake, hb: false };
    const want = old(mk(), P, u, loc);
    assert.equal(vehicleAccel(mk(), P, u, loc, DT), want);
    assert.equal(vehicleAccel(mk(), P, { ...u, mul: 1 }, loc, DT), want);
    assert.equal(vehicleAccel(mk(), P, { ...u, mul: atMul(0) }, loc, DT), want);
    assert.equal(gbShiftBrake(vz, 0, DT), vz, '換檔空檔外沒有換檔煞車');
  }
});

test('自排：engineForce 與 2/3 規格逐值相同', () => {
  for (const [engine, maxV] of [[11.5, 54], [14, 61], [18.5, 70]]) for (const vf of [0, 3, 10, 30, 50]) for (const lagF of [1, 0.42])
    near(engineForce(engine, lagF, vf, maxV, 1), (2 / 3) * ((engine * lagF * (1 - Math.max(0, vf) / maxV) + (vf < 6 ? 2 : 0))));
});

test('超過該檔極速：引擎煞車把車速快速降到該檔極速，不會低於它', () => {
  const k = 'hatch', max2 = gbRedlineSpeed(k, 2);
  assert.equal(gbOverSpeed(k, 2, max2 - 1, 1 / 120), max2 - 1, '沒超速不變');
  let v = 40; // 從高速直接降到 2 檔
  const v1 = gbOverSpeed(k, 2, v, 1 / 120);
  assert.ok(v1 < v && v1 > max2, '一步只降一點，不是瞬間');
  let t = 0; while (v > max2 && t < 5) { v = gbOverSpeed(k, 2, v, 1 / 120); t += 1 / 120; }
  assert.equal(v, max2, '最後剛好停在該檔極速');
  assert.ok(t < 1.5, `約 1 秒內降到（實際 ${t.toFixed(2)} 秒）`);
  assert.equal(gbOverSpeed(k, 3, -5, 1 / 120), -5, '倒車不受影響');
});

// ---- 換檔煞車（自排與手排共用）----
test('換檔煞車：空檔期間沿前進方向輕微減速（2.5–4 m/s²），空檔外、倒車、幾乎靜止時不作用，不會變成倒車', () => {
  assert.ok(GB.SHIFT_BRAKE >= 2.5 && GB.SHIFT_BRAKE <= 4, `SHIFT_BRAKE ${GB.SHIFT_BRAKE}`);
  near(gbShiftBrake(20, 0.05, DT), 20 - GB.SHIFT_BRAKE * DT);
  assert.equal(gbShiftBrake(20, 0, DT), 20);
  assert.equal(gbShiftBrake(-4, 0.1, DT), -4, '倒車不受影響');
  assert.equal(gbShiftBrake(0.3, 0.1, DT), 0.3, '幾乎靜止不受影響');
  assert.equal(gbShiftBrake(0.6, 0.1, 1), 0, '不會減成倒車');
  // 一整段空檔（約 0.12 秒）只靠換檔煞車掉約 1–1.6 km/h
  let v = 30, t = GB.SHIFT_CUT; while (t > 0) { t = gbStep(t, DT); v = gbShiftBrake(v, t, DT); }
  const kmh = (30 - v) * 3.6; assert.ok(kmh >= 0.9 && kmh <= 1.6, `${kmh} km/h`);
});

test('自排檔位：升檔點與 gearFor 完全相同；降檔多一點遲滯，換檔煞車的掉速不會讓檔位跳回去', () => {
  let g = 1;
  for (let i = 0; i <= 6000; i++) { const v = i / 100; g = atGear(g, v, GEARS); assert.equal(g, gearFor(v), `加速 ${v}`); }
  for (const k of [1, 2, 3, 4, 5]) {
    const up = atGear(k, GEARS[k] + 0.001, GEARS);
    assert.equal(up, k + 1, `${k} 升檔`);
    assert.equal(atGear(up, GEARS[k] - 0.7, GEARS), k + 1, `${k + 1} 掉速 0.7 m/s 仍維持`);
    assert.equal(atGear(up, GEARS[k] - 1.2, GEARS), k, `${k + 1} 真的減速才降檔`);
  }
  assert.equal(atGear(6, 5, GEARS), 1, '急煞到低速直接降到 1 檔');
  assert.equal(atGear(6, 0, GEARS), 1);
});

test('自排換檔偵測：比賽中前進時換檔才給空檔；倒數、倒車、檔位沒變都不給', () => {
  let r = atStep(1, 0, GEARS[1] + 0.01, GEARS[1] + 0.01, GEARS, DT, true);
  assert.deepEqual(r, { gear: 2, shiftT: GB.SHIFT_CUT });
  assert.equal(atMul(r.shiftT), 0, '空檔期間沒有動力');
  assert.equal(atMul(0), undefined, '空檔外就是原本的自排');
  r = atStep(2, r.shiftT, GEARS[1] + 0.02, GEARS[1] + 0.02, GEARS, DT, true);
  near(r.shiftT, GB.SHIFT_CUT - DT); assert.equal(r.gear, 2);
  assert.deepEqual(atStep(1, 0, GEARS[1] + 0.01, GEARS[1] + 0.01, GEARS, DT, false), { gear: 2, shiftT: 0 }, '倒數 / 非比賽：檔位照算但不斷油');
  assert.deepEqual(atStep(3, 0, 5, -5, GEARS, DT, true), { gear: 1, shiftT: 0 }, '倒車');
  assert.deepEqual(atStep(3, 0, 25, 25, GEARS, DT, true), { gear: 3, shiftT: 0 });
  assert.deepEqual(atStep(4, 0, 25, 25, GEARS, DT, true), { gear: 3, shiftT: GB.SHIFT_CUT }, '降檔也有');
});

// 自排的斷油只有前 AT_CUT 秒（換檔煞車一樣是整段 SHIFT_CUT），否則手排會比自排快超過 8%
test('模擬：每次換檔都輕微掉速（手排約 1.5–2.7 km/h、自排約 0.5–2 km/h），自排每個門檻只換一次、不會來回跳', () => {
  for (const k of KEYS) {
    const a = sim(k, 'auto'), m = sim(k, 'optimal');
    console.log(`  ${k}: auto ${a.shifts} 次換檔，掉速 ${a.dips.map(d => d.toFixed(2)).join(' / ')} km/h; manual ${m.shifts} 次，掉速 ${m.dips.map(d => d.toFixed(2)).join(' / ')} km/h`);
    assert.equal(a.shifts, GEARS.slice(1, 6).filter(v => v < a.top / 3.6).length, `${k} 自排換檔 ${a.shifts} 次`);
    assert.ok(a.dips.length >= 3 && m.dips.length >= 3);
    for (const d of m.dips) assert.ok(d >= 1.5 && d <= 2.7, `${k} 手排掉速 ${d}`);
    for (const d of a.dips) assert.ok(d >= 0.5 && d <= 2, `${k} 自排掉速 ${d}`);
  }
});

test('自排換檔空檔：斷油只有前 AT_CUT 秒（短於手排），換檔煞車持續整段 SHIFT_CUT', () => {
  assert.ok(GB.AT_CUT > 0 && GB.AT_CUT < GB.SHIFT_CUT);
  let t = GB.SHIFT_CUT, cutN = 0, brakeN = 0;
  while (t > 0) { if (atMul(t) === 0) cutN++; if (gbShiftBrake(20, t, DT) < 20) brakeN++; t = gbStep(t, DT); }
  near(cutN * DT, GB.AT_CUT, DT + 1e-9); near(brakeN * DT, GB.SHIFT_CUT, DT + 1e-9);
});
