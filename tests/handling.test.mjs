// 彎道操控：以遊戲本身的 vehicleAccel / vehicleTurn（@vehicle）+ wallContact 跑一條「直線進彎 → 180° 髮夾 → 直線出彎」，
// 由腳本駕駛（維持進彎速度、比例式轉向）找出每台車「不撞牆的最高進彎速度」。決定性、無隨機、dt 固定。
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
${block('course-geometry')}\n${block('engine')}\n${block('drift-follow')}\n${block('vehicle')}\n${block('collision')}\n${block('cars')}
return { HW, CAR_BOX, CARS, wrap, wallContact, vehicleAccel, vehicleTurn };`)();
const { HW, CAR_BOX, CARS, wrap, wallContact, vehicleAccel, vehicleTurn } = G;
const WALL = HW + 0.3, DT = 1 / 60;

// 右轉半圓髮夾，中心線半徑 R：進彎直線在 x=0 朝 +z，圓心 (-R, 0)，出彎直線在 x=-2R 朝 -z。lat > 0 為行進方向右側（朝圓心）。
function frame(R) {
  return (x, z) => {
    if (z >= 0) { const th = Math.atan2(z, x + R); return { lat: R - Math.hypot(x + R, z), rx: -Math.cos(th), rz: -Math.sin(th), h: -th }; }
    if (x >= -R) return { lat: -x, rx: -1, rz: 0, h: 0 };
    return { lat: x + 2 * R, rx: 1, rz: 0, h: -Math.PI };
  };
}
// 在進彎速度 vE 下跑一次；mode 'grip' = 純抓地，'drift' = 入彎踩一下手煞。回傳 { ok, hit, minLat, maxLat }
function run(key, R, vE, mode) {
  const P = { ...CARS[key].phys, brake: 24, drag: 0.0008, roll: 0.3 }, box = CAR_BOX[key], fr = frame(R);
  const c = { x: 2.5, z: -60, h: 0, vx: 0, vz: vE, w: 0, steer: 0, drift: false, penalty: 0 }; // 從外側 2.5 m 進彎
  let t = 0, tArc = null, maxLat = 0;
  while (t < 40) {
    const f = fr(c.x, c.z), v = Math.hypot(c.vx, c.vz), onArc = c.z >= 0;
    if (onArc && tArc === null) tArc = t;
    const ff = onArc ? (v / R) * (1 + v / 42) / 1.75 : 0; // 圓弧上的前饋轉向量（反推 vehicleTurn 的 wT 公式）
    const u = { sIn: Math.max(-1, Math.min(1, ff - 0.12 * f.lat + 1.5 * wrap(c.h - f.h))), gas: v < vE, brake: v > vE + 3, hb: mode === 'drift' && tArc !== null && t - tArc < 0.35 };
    const a = vehicleAccel(c, P, u, { grade: 0, h: f.h }, DT);
    vehicleTurn(c, P, u, a, DT);
    c.x += c.vx * DT; c.z += c.vz * DT; t += DT;
    maxLat = Math.max(maxLat, Math.abs(fr(c.x, c.z).lat));
    if (wallContact(c, box, fr, WALL)) return { ok: false, hit: { t, x: c.x, z: c.z }, maxLat };
    if (c.z < -50 && c.x < -R) return { ok: true, maxLat };
  }
  return { ok: false, hit: 'timeout', maxLat };
}
// 最高可通過的進彎速度（m/s，0.25 刻度）；從 6 m/s 起掃到 40 m/s，取「連續成功的最後一個」
function maxClean(key, R, mode) {
  let best = 0;
  for (let v = 6; v <= 40; v += 0.25) { if (run(key, R, v, mode).ok) best = v; else if (best) break; }
  return best;
}
const RADII = [17, 22, 30]; // 青嵐峠最緊的髮夾約 17 m，黑鷺山約 22–30 m（中心線半徑）
const CARS3 = ['hatch', 'coupe', 'gtr'];
const best = (k, R) => Math.max(maxClean(k, R, 'grip'), maxClean(k, R, 'drift'));
if (process.env.HAIRPIN_DUMP) {
  for (const R of RADII) for (const m of ['grip', 'drift']) console.log('R', R, m, Object.fromEntries(CARS3.map(k => [k, maxClean(k, R, m)])));
}

test('髮夾：GT-32 是三台車裡最慢通過的（不撞牆的最高進彎速度最低）', () => {
  for (const R of RADII) {
    const [h, c, g] = CARS3.map(k => best(k, R));
    assert.ok(g > 0 && c > 0 && h > 0, `R${R} 三台車都要能通過`);
    assert.ok(g < c && c <= h, `R${R}: gtr ${g} < coupe ${c} <= hatch ${h}`);
  }
});

test('髮夾：GT-32 不是推頭牆——可通過速度至少是 KX-2 的 80%，且慢下來就一定過得了', () => {
  for (const R of RADII) {
    const h = best('hatch', R), g = best('gtr', R);
    assert.ok(g >= 0.8 * h, `R${R}: gtr ${g} 應 >= 0.8 * hatch ${h}`);
  }
  for (const k of CARS3) for (const R of [13, ...RADII]) for (const mode of ['grip', 'drift']) {
    const r = run(k, R, 9, mode);
    assert.ok(r.ok, `${k} R${R} ${mode} 以 9 m/s 進彎應該通過：${JSON.stringify(r.hit)}`);
  }
});

test('髮夾：模擬是決定性的（同一輸入兩次結果相同）', () => {
  assert.deepEqual(run('gtr', 22, 17, 'grip'), run('gtr', 22, 17, 'grip'));
});
