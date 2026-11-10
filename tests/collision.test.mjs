// 抽出 yatouge.html 內 @collision 區塊（純函式，不依賴 THREE / DOM）後在 Node 執行
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const g = () => new Function(`${block('course-geometry')}\n${block('collision')}\nreturn { HW, CAR_BOX, COLL, carCorners, wallContact, wallImpulse, wallPenalty, wallKeep, obbOverlap, carImpulse, wallStep, carStep };`)();

// 與 locate() 同一套座標：前進 (sin h, cos h)、右 (-cos h, sin h)、lat > 0 在中心線右側。
// 道路取 h=0 的直路（前進 +z、右 = -x），所以 lat = -x。
// wallContact 取「點 → 該點的道路座標」函式，直路上 lat = -x。
const road = () => (x, z) => ({ lat: -x, rx: -1, rz: 0, h: 0 });
const car = (lat, h, extra = {}) => ({ x: -lat, z: 0, h, vx: 0, vz: 20, w: 0, ...extra });

test('collision(a): 與路平行、中心 lat=4.4：舊判定(>4.25)會撞，新判定不會', () => {
  const { CAR_BOX, HW, wallContact } = g();
  assert.ok(4.4 > HW - 0.95, '前提：舊判定在這裡會撞');
  for (const k of Object.keys(CAR_BOX)) {
    const L = road(4.4), c = car(4.4, 0);
    assert.equal(wallContact(c, CAR_BOX[k], L, HW + 0.3), null, `${k} 不該接觸`);
  }
});

test('collision(a2): 平行貼牆到車身邊緣剛好超過牆面才算撞', () => {
  const { CAR_BOX, HW, wallContact } = g();
  const b = CAR_BOX.hatch, wall = HW + 0.3;
  assert.equal(wallContact(car(wall - b.hw - 0.01, 0), b, road(wall - b.hw - 0.01), wall), null);
  const hit = wallContact(car(wall - b.hw + 0.05, 0), b, road(wall - b.hw + 0.05), wall);
  assert.ok(hit && Math.abs(hit.pen - 0.05) < 1e-9);
});

function rearRight(k = 'hatch', side = 1) {
  const G = g(), b = G.CAR_BOX[k], wall = G.HW + 0.3;
  // 車頭朝左偏 35°（h>0 左轉），車尾甩向右側牆；找出右後角剛穿入 0.12 m 的中心位置
  const h = 35 * Math.PI / 180 * side;
  const probe = G.carCorners(car(0, h), b);
  const maxLat = Math.max(...probe.map(p => side * -p.x));
  const lat = side * (wall + 0.12 - maxLat);
  return { G, b, wall, h, lat, c: car(lat, h, { vx: side * -4, vz: 20, w: 0 }) };
}

test('collision(b): 35° 甩尾只有右後角穿入：接觸點是右後角、法向反彈 e 倍、車尾被彈離、不再穿入', () => {
  const { G, b, wall, c, lat } = rearRight();
  const L = road(lat), hit = G.wallContact(c, b, L, wall);
  assert.ok(hit, '應該接觸');
  assert.equal(hit.side, 1);
  // 右後角 = 車心 − f·hl + 車右·hw，相對車心的向量 r
  const f = [Math.sin(c.h), Math.cos(c.h)], rt = [-Math.cos(c.h), Math.sin(c.h)];
  assert.ok(Math.abs(hit.rx - (-f[0] * b.hl + rt[0] * b.hw)) < 1e-9 && Math.abs(hit.rz - (-f[1] * b.hl + rt[1] * b.hw)) < 1e-9, '接觸點不是右後角');
  // 其他三個角都沒穿入
  const lats = G.carCorners(c, b).map(p => lat + (p.x - c.x) * -1);
  assert.equal(lats.filter(v => v > wall).length, 1);

  const nx = hit.nx, nz = hit.nz;
  const r = G.wallImpulse(c, hit, G.COLL);
  const vnBefore = (c.vx + c.w * hit.rz) * nx + (c.vz - c.w * hit.rx) * nz;
  const vnAfter = (r.vx + r.w * hit.rz) * nx + (r.vz - r.w * hit.rx) * nz;
  assert.ok(vnBefore > 0 && Math.abs(r.vn - vnBefore) < 1e-9);
  assert.ok(Math.abs(vnAfter + G.COLL.e * vnBefore) < 1e-9, `反彈應為 -e*vn，得到 ${vnAfter}`);
  // 車尾離牆：w 的變化使接觸點的法向速度往牆外之反方向（rn * Δw < 0）
  const rn = hit.rz * nx - hit.rx * nz;
  assert.ok(rn * (r.w - c.w) < 0, '角速度變化方向錯誤，車尾沒有離開牆');
  // 位置修正後沒有任何角仍穿入
  const c2 = { ...c, x: c.x - nx * hit.pen, z: c.z - nz * hit.pen };
  assert.equal(G.wallContact(c2, b, road(lat - hit.pen), wall), null);
});

test('collision(c): 左右鏡像得到鏡像結果', () => {
  const R = rearRight('coupe', 1), Lf = rearRight('coupe', -1);
  const hr = R.G.wallContact(R.c, R.b, road(R.lat), R.wall), hl = Lf.G.wallContact(Lf.c, Lf.b, road(Lf.lat), Lf.wall);
  assert.equal(hr.side, 1); assert.equal(hl.side, -1);
  assert.ok(Math.abs(hr.pen - hl.pen) < 1e-9);
  const a = R.G.wallImpulse(R.c, hr, R.G.COLL), b = Lf.G.wallImpulse(Lf.c, hl, Lf.G.COLL);
  // 鏡像：x 與 w 反號，z 與 vn 相同
  assert.ok(Math.abs(a.vx + b.vx) < 1e-9 && Math.abs(a.vz - b.vz) < 1e-9 && Math.abs(a.w + b.w) < 1e-9 && Math.abs(a.vn - b.vn) < 1e-9);
});

test('collision(d): 輕擦 vn=3 沒有懲罰、速度損失小於 10%', () => {
  const G = g(), b = G.CAR_BOX.hatch, wall = G.HW + 0.3;
  // 與路平行、車側貼牆，以 3 m/s 往牆擦入；前後兩角同時接觸，接觸點取其一
  const lat = wall - b.hw + 0.02, c = car(lat, 0, { vx: -3, vz: 20 });
  const hit = G.wallContact(c, b, road(lat), wall), spd0 = Math.hypot(c.vx, c.vz);
  const r = G.wallImpulse(c, hit, G.COLL);
  assert.ok(Math.abs(r.vn - 3) < 0.5, `前提：vn≈3，得到 ${r.vn}`);
  assert.equal(G.wallPenalty(r.vn, spd0), 0);
  const keep = G.wallKeep(r.vn), spd1 = Math.hypot(r.vx, r.vz) * keep;
  assert.ok(spd1 > spd0 * 0.9, `速度損失過大 ${spd1 / spd0}`);
});

test('collision(e): 懲罰曲線', () => {
  const { wallPenalty: p } = g();
  assert.equal(p(4.9, 20), 0);
  assert.ok(Math.abs(p(5, 20) - 0.8) < 0.01);
  assert.ok(Math.abs(p(12, 20) - 2.5) < 0.01);
  assert.ok(Math.abs(p(12, 28) - 3.5) < 0.01);
  assert.ok(Math.abs(p(8.5, 20) - 1.65) < 0.01);
  for (const spd of [10, 20, 26, 40]) {
    let prev = -1;
    for (let vn = 0; vn <= 30; vn += 0.25) { const v = p(vn, spd); assert.ok(v >= prev, `vn=${vn} spd=${spd} 不單調`); assert.ok(v <= 3.5); prev = v; }
  }
});

test('collision(e2): wallKeep 上限 35%', () => {
  const { wallKeep } = g();
  assert.equal(wallKeep(0), 1);
  assert.ok(Math.abs(wallKeep(5) - 0.925) < 1e-9);
  assert.ok(Math.abs(wallKeep(100) - 0.65) < 1e-9);
});

test('collision(f): 各種輸入都不產生 NaN', () => {
  const G = g(), b = G.CAR_BOX.coupe, wall = G.HW + 0.3;
  const vals = [0, -0, 1e-12, 3, -7, 60, 1e6, NaN, Infinity, -Infinity, undefined];
  for (const lat of [0, 5.4, -5.4, 9, NaN]) for (const h of [0, 1, -2.5, 7, NaN]) for (const v of vals) {
    const c = { x: -lat, z: 0, h, vx: v, vz: 20, w: v };
    const hit = G.wallContact(c, b, road(lat), wall);
    if (hit) {
      for (const k of ['pen', 'nx', 'nz', 'rx', 'rz']) assert.ok(Number.isFinite(hit[k]), `hit.${k}`);
      const r = G.wallImpulse(c, hit, G.COLL);
      for (const k of ['vx', 'vz', 'w', 'vn']) assert.ok(Number.isFinite(r[k]), `impulse.${k} lat=${lat} h=${h} v=${v}`);
    }
    assert.ok(Number.isFinite(G.wallPenalty(v, v)) && Number.isFinite(G.wallKeep(v)));
  }
});

/* ---------- 任務 (g)：車與車 ---------- */
// a = 玩家（有 w）、b = 對手（質點）；法線 n 由 b 指向 a
const S = (x, z, h = 0, vx = 0, vz = 0, w = 0) => ({ x, z, h, vx, vz, w });
const rel = (a, b, n) => (a.vx - b.vx) * n.nx + (a.vz - b.vz) * n.nz;

test('collision(g1): 並排 1.8 m 不撞（舊圓形 2.3 m 會撞）；前後 4.0 m 會撞', () => {
  const G = g(), h = G.CAR_BOX.hatch, c = G.CAR_BOX.coupe;
  assert.equal(G.obbOverlap(S(0, 0), h, S(1.8, 0), h), null);
  assert.equal(G.obbOverlap(S(0, 0), c, S(1.8, 0), h), null);
  const hit = G.obbOverlap(S(0, 0), h, S(0, 4.0), h);
  assert.ok(hit && Math.abs(hit.pen - (2 * h.hl - 4.0)) < 1e-9, '前後 4.0 m 應穿入 hl*2-4.0');
  assert.ok(Math.abs(hit.nz + 1) < 1e-9 && Math.abs(hit.nx) < 1e-9, '法線由 b 指向 a');
});

test('collision(g2): 斜角碰撞各退一半後不再重疊', () => {
  const G = g(), h = G.CAR_BOX.hatch, c = G.CAR_BOX.coupe;
  const a = S(0, 0, 0.5), b = S(1.0, 3.6, -0.4);
  const hit = G.obbOverlap(a, c, b, h);
  assert.ok(hit && hit.pen > 0);
  const a2 = { ...a, x: a.x + hit.nx * hit.pen / 2, z: a.z + hit.nz * hit.pen / 2 };
  const b2 = { ...b, x: b.x - hit.nx * hit.pen / 2, z: b.z - hit.nz * hit.pen / 2 };
  const again = G.obbOverlap(a2, c, b2, h);
  assert.ok(!again || again.pen < 1e-9, `仍重疊 ${again && again.pen}`);
});

test('collision(g3): 衝量後沿法線的相對速度反向、大小為 e 倍', () => {
  const G = g(), h = G.CAR_BOX.hatch;
  const a = S(0.3, 0, 0.1, 0, 20), b = S(0, 4.0, 0, 0, 8);
  const hit = G.obbOverlap(a, h, b, h), relBefore = rel(a, b, hit);
  assert.ok(relBefore < 0, '前提：相互靠近');
  const r = G.carImpulse(a, b, hit, G.COLL);
  const A = { vx: r.a.vx, vz: r.a.vz }, B = r.b;
  // 接觸點速度：玩家要加上轉動
  const vA = { vx: A.vx + r.a.w * hit.rz, vz: A.vz - r.a.w * hit.rx };
  const vA0 = { vx: a.vx + a.w * hit.rz, vz: a.vz - a.w * hit.rx };
  const before = rel(vA0, b, hit), after = rel(vA, B, hit);
  assert.ok(Math.abs(after + G.COLL.e * before) < 1e-9 && Math.abs(r.closing + before) < 1e-9, `after=${after} before=${before}`);
  // 總動量守恆（等質量）
  assert.ok(Math.abs((r.a.vx + r.b.vx) - (a.vx + b.vx)) < 1e-9 && Math.abs((r.a.vz + r.b.vz) - (a.vz + b.vz)) < 1e-9);
});

test('collision(g4): 對手從後方撞到玩家右後角：w 為正（車頭往左、車尾被推向右）', () => {
  const G = g(), h = G.CAR_BOX.hatch;
  const a = S(0, 0, 0), b = S(-1.4, -4.1, 0, 0, 25);
  const hit = G.obbOverlap(a, h, b, h);
  assert.ok(hit, '應該相撞');
  assert.ok(hit.rx < 0 && hit.rz < 0, `接觸點應在玩家右後，得到 (${hit.rx}, ${hit.rz})`);
  const r = G.carImpulse(a, b, hit, G.COLL);
  assert.ok(r.a.w > 0.1, `w=${r.a.w}`);
  assert.ok(r.a.vz > a.vz, '玩家被往前推');
  // 鏡像（左後角）：w 為負
  const hm = G.obbOverlap(S(0, 0, 0), h, S(1.4, -4.1, 0, 0, 25), h), rm = G.carImpulse(S(0, 0, 0), S(1.4, -4.1, 0, 0, 25), hm, G.COLL);
  assert.ok(Math.abs(rm.a.w + r.a.w) < 1e-9);
});

test('collision(g5): 鏡像情境得到鏡像結果', () => {
  const G = g(), h = G.CAR_BOX.hatch, c = G.CAR_BOX.coupe;
  const m = s => ({ ...s, x: -s.x, h: -s.h, vx: -s.vx, w: -s.w });
  const a = S(0.2, 0, 0.3, 1, 18, 0.4), b = S(-0.9, 3.5, -0.2, -2, 9);
  const h1 = G.obbOverlap(a, c, b, h), h2 = G.obbOverlap(m(a), c, m(b), h);
  assert.ok(h1 && h2 && Math.abs(h1.pen - h2.pen) < 1e-9 && Math.abs(h1.nx + h2.nx) < 1e-9 && Math.abs(h1.nz - h2.nz) < 1e-9);
  const r1 = G.carImpulse(a, b, h1, G.COLL), r2 = G.carImpulse(m(a), m(b), h2, G.COLL);
  const E = (x, y) => Math.abs(x - y) < 1e-9;
  assert.ok(E(r1.a.vx, -r2.a.vx) && E(r1.a.vz, r2.a.vz) && E(r1.a.w, -r2.a.w) && E(r1.b.vx, -r2.b.vx) && E(r1.b.vz, r2.b.vz));
});

test('collision(g6): 車與車各種輸入都不產生 NaN', () => {
  const G = g(), h = G.CAR_BOX.hatch;
  const vals = [0, 3, -7, 60, 1e6, NaN, Infinity, undefined];
  for (const hh of [0, 1.2, NaN]) for (const dx of [0, 1.5, NaN]) for (const v of vals) {
    const a = S(0, 0, hh, v, 20, v), b = S(dx, 3.9, 0, v, v);
    const hit = G.obbOverlap(a, h, b, h);
    if (!hit) continue;
    for (const k of ['pen', 'nx', 'nz', 'rx', 'rz', 'i']) assert.ok(Number.isFinite(hit[k]), `hit.${k}`);
    const r = G.carImpulse(a, b, hit, G.COLL);
    for (const x of [r.a.vx, r.a.vz, r.a.w, r.b.vx, r.b.vz, r.closing]) assert.ok(Number.isFinite(x));
  }
  assert.equal(G.obbOverlap(S(NaN, 0), h, S(0, 0), h), null);
});

/* ---------- 修正：彎道上每個角用自己的道路座標 ---------- */
// 與 locate() 同樣的投影：最近的路段，lat 為點到中心線的有號距離，rx/rz 為該處的右向量
function frameOn(pts) {
  return (x, z) => {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < pts.length - 1; i++) { const d = (x - pts[i].x) ** 2 + (z - pts[i].z) ** 2; if (d < bd) { bd = d; bi = i; } }
    const i = Math.min(Math.max(bi, 0), pts.length - 2);
    const p = pts[i], q = pts[i + 1], sx = q.x - p.x, sz = q.z - p.z;
    const t = Math.max(0, Math.min(1, ((x - p.x) * sx + (z - p.z) * sz) / (sx * sx + sz * sz)));
    const h = p.h + (q.h - p.h) * t, rx = -Math.cos(h), rz = Math.sin(h);
    return { lat: (x - (p.x + sx * t)) * rx + (z - (p.z + sz * t)) * rz, rx, rz, h };
  };
}
function bendCar(G, s, lat, yaw) {
  const pts = G.buildCourse('seiran').pts;
  const i = pts.findIndex(p => p.s >= s), p = pts[i], h = p.h;
  return { frame: frameOn(pts), c: { x: p.x - Math.cos(h) * lat, z: p.z + Math.sin(h) * lat, h: h + yaw, vx: 0, vz: 0, w: 0 } };
}
const gb = () => new Function(`${block('course-geometry')}\n${block('collision')}\nreturn { HW, CAR_BOX, COLL, buildCourse, wallContact, carCorners, wallStep };`)();

test('collision(h): 彎心內側（s 3570–3600、中心 lat 3.9、車身偏 -0.5 / -0.4 / 0.3 rad）不會誤判碰到護欄', () => {
  const G = gb(), wall = G.HW + 0.3;
  let phantom = 0;
  for (const k of Object.keys(G.CAR_BOX)) for (const [yaw, s] of [[-0.5, 3585.2], [-0.5, 3592], [-0.4, 3585.2], [-0.4, 3592], [0.3, 3578], [0.3, 3600]]) {
    const { frame, c } = bendCar(G, s, 3.9, yaw), box = G.CAR_BOX[k];
    assert.equal(G.wallContact(c, box, frame, wall), null, );
    // 前提：舊做法（用車心的道路座標投影各角）在這些情境中會誤判
    const L = frame(c.x, c.z);
    if (G.carCorners(c, box).some(p => Math.abs(L.lat + (p.x - c.x) * L.rx + (p.z - c.z) * L.rz) > wall)) phantom++;
  }
  assert.ok(phantom > 0, '測試情境本身必須能讓舊做法誤判');
});

test('collision(h2): 彎道外側真的穿入護欄仍然會撞，且用該角自己的法線', () => {
  const G = gb(), wall = G.HW + 0.3, b = G.CAR_BOX.hatch;
  const { frame, c } = bendCar(G, 3585.2, -(wall - b.hw + 0.1), 0);
  const hit = G.wallContact(c, b, frame, wall);
  assert.ok(hit, '外側貼牆應該接觸');
  assert.equal(hit.side, -1);
  assert.ok(hit.pen > 0 && hit.pen < 1);
  const deepest = G.carCorners(c, b).map(p => ({ p, f: frame(p.x, p.z) })).reduce((m, q) => -q.f.lat > -m.f.lat ? q : m);
  assert.ok(Math.abs(hit.nx - deepest.f.rx * -1) < 1e-9 && Math.abs(hit.nz - deepest.f.rz * -1) < 1e-9, '法線應為最深那個角所在處的護欄法線');
});

/* ---------- 修正：車與車的接觸點取重疊區域中心 ---------- */
test('collision(g7): 從後方偏移追撞，左右鏡像得到鏡像的 w，且偏移 1.3 m 時 |w| 不是零', () => {
  const G = g(), h = G.CAR_BOX.hatch, c = G.CAR_BOX.coupe;
  const run = off => {
    const a = S(0, 0, 0, 0, 16), b = S(off, 4.1, 0, 0, 8), hit = G.obbOverlap(a, c, b, h);
    assert.ok(hit, `off=${off} 應該相撞`);
    return { hit, r: G.carImpulse(a, b, hit, G.COLL) };
  };
  for (const d of [0.9, 1.3, 1.55]) {
    const p = run(d), m = run(-d);
    assert.ok(Math.abs(p.r.a.w + m.r.a.w) < 1e-9, `d=${d} w 沒有鏡像：${p.r.a.w} vs ${m.r.a.w}`);
    assert.ok(Math.abs(p.r.b.vx + m.r.b.vx) < 1e-9, `d=${d} 對手側向速度沒有鏡像`);
    assert.ok(Math.abs(p.hit.rx + m.hit.rx) < 1e-9, `d=${d} 接觸點沒有鏡像`);
  }
  assert.ok(Math.abs(run(1.3).r.a.w) > 0.3, `w=${run(1.3).r.a.w}`);
  // 接觸點必須落在兩車重疊的橫向範圍內（右向為 -x，所以 |rx| 介於重疊範圍內）
  const lo = 1.3 - h.hw, hi = c.hw, cx = Math.abs(run(1.3).hit.rx);
  assert.ok(cx >= lo - 1e-9 && cx <= hi + 1e-9, `接觸點橫向 ${cx} 不在重疊範圍 [${lo}, ${hi}]`);
  assert.ok(Math.abs(run(0).r.a.w) < 1e-9, '正對時不該轉');
});

/* ---------- CR1：正面撞牆不亂轉、角速度上限 ---------- */
const headOn = (G, k, yaw, v) => {
  const b = G.CAR_BOX[k], wall = G.HW + 0.3, h = -Math.PI / 2 + yaw; // 車頭朝右側牆
  const c = { x: -(wall - b.hl + 0.1), z: 0, h, vx: -v, vz: 0, w: 0 };
  const hit = G.wallContact(c, b, road(), wall);
  return { c, hit, r: hit && G.wallImpulse(c, hit, G.COLL) };
};

test('collision(i): 正面以 25 m/s 撞牆 w≈0；偏 ±0.001 rad 得到鏡像且很小的 w', () => {
  const G = g();
  for (const k of Object.keys(G.CAR_BOX)) {
    const a = headOn(G, k, 0, 25), p = headOn(G, k, 0.001, 25), m = headOn(G, k, -0.001, 25);
    assert.ok(a.hit && p.hit && m.hit);
    assert.ok(Math.abs(a.r.w) < 1e-6, `${k} 正面 w=${a.r.w}`);
    assert.ok(Math.abs(p.r.w) < 0.05 && Math.abs(m.r.w) < 0.05, `${k} w=${p.r.w}/${m.r.w}`);
    assert.ok(Math.abs(p.r.w + m.r.w) < 0.01, `${k} 沒有鏡像：${p.r.w} vs ${m.r.w}`);
  }
});

test('collision(j): |w| 上限 3.5 rad/s（牆角撞擊與車角撞擊）', () => {
  const G = g(), uncapped = { ...G.COLL, wMax: Infinity };
  assert.equal(G.COLL.wMax, 3.5);
  const R = rearRight('hatch', 1), hit = G.wallContact({ ...R.c, vx: -30, vz: 20 }, R.b, road(), R.wall), c = { ...R.c, vx: -30, vz: 20 };
  assert.ok(Math.abs(G.wallImpulse(c, hit, uncapped).w) > 3.5, '前提：沒有上限時會超過 3.5');
  assert.ok(Math.abs(G.wallImpulse(c, hit, G.COLL).w) <= 3.5 + 1e-12);
  const h = G.CAR_BOX.hatch, a = S(0, 0, 0), b = S(-1.4, -4.1, 0, 0, 60), ch = G.obbOverlap(a, h, b, h);
  assert.ok(Math.abs(G.carImpulse(a, b, ch, uncapped).a.w) > 3.5, '前提：車角撞擊沒有上限時會超過 3.5');
  const r = G.carImpulse(a, b, ch, G.COLL);
  assert.ok(Math.abs(r.a.w) <= 3.5 + 1e-12 && r.a.w > 0);
});

/* ---------- CR2：懲罰與連段歸零看車心速度 ---------- */
test('collision(k): 車尾高速旋轉擦牆：角落 vn > 5 但車心 vn < 5，沒有懲罰、沒有連段歸零', () => {
  const G = g(), R = rearRight('coupe', 1), c = { ...R.c, vx: -1, vz: 3, w: 3.3 };
  const hit = G.wallContact(c, R.b, road(), R.wall), r = G.wallImpulse(c, hit, G.COLL);
  assert.ok(r.vn > 5, `前提：角落 vn=${r.vn}`);
  assert.ok(r.vc < 5 && r.vc > 0, `前提：車心 vn=${r.vc}`);
  assert.ok(G.wallPenalty(r.vn, 3) > 0, '前提：若用角落速度會被罰');
  const st = G.wallStep(c, R.b, road(), R.wall, 0, G.COLL);
  assert.equal(st.penalty, 0);
  assert.equal(st.pop, 0);
  assert.equal(st.hitSpeed, 0);
  assert.ok(st.w < c.w, '彈性反彈仍然生效（角速度被改變）');
});

/* ---------- CR3 / CR4：每幀處理函式 ---------- */
test('collision(l): wallStep 無接觸回傳 null；接觸時推回牆面、套用掉速與懲罰', () => {
  const G = g(), b = G.CAR_BOX.hatch, wall = G.HW + 0.3;
  assert.equal(G.wallStep({ x: -3, z: 0, h: 0, vx: -9, vz: 9, w: 0 }, b, road(), wall, 0, G.COLL), null);
  const lat = wall - b.hw + 0.05, c = { x: -lat, z: 0, h: 0, vx: -12, vz: 10, w: 0 };
  const st = G.wallStep(c, b, road(), wall, 0, G.COLL);
  assert.ok(Math.abs(st.x - (-lat + 0.05)) < 1e-9 && st.z === 0, '應沿法線推回剛好不穿入');
  assert.ok(Math.abs(st.penalty - 2.5) < 0.01 && Math.abs(st.pop - 2.5) < 0.01, `penalty=${st.penalty} pop=${st.pop}`);
  assert.ok(st.hitSpeed > 3.5 && Math.abs(st.hitSpeed - 12) < 1e-9);
  assert.ok(st.vx > 0, '往牆的速度反向');
  assert.ok(Math.hypot(st.vx, st.vz) < Math.hypot(c.vx, c.vz));
});

test('collision(m): 懲罰取最大值不累加；更重的撞擊延長懲罰時重新提示、較輕的不提示', () => {
  const G = g(), b = G.CAR_BOX.hatch, wall = G.HW + 0.3, lat = wall - b.hw + 0.05;
  const hitWith = (vx, pen) => G.wallStep({ x: -lat, z: 0, h: 0, vx, vz: 10, w: 0 }, b, road(), wall, pen, G.COLL);
  const first = hitWith(-6, 0);
  assert.ok(first.pop > 0.8 - 1e-9 && first.penalty === first.pop, '第一次撞擊顯示秒數');
  const harder = hitWith(-12, first.penalty);
  assert.ok(harder.pop > first.penalty && harder.penalty === harder.pop, '更重的撞擊延長並重新提示');
  const lighter = hitWith(-6, 3);
  assert.equal(lighter.pop, 0);
  assert.equal(lighter.penalty, 3, '較短的不累加也不縮短');
  const light = hitWith(-3, 0.5);
  assert.equal(light.pop, 0); assert.equal(light.penalty, 0.5);
});

test('collision(n): carStep 把玩家與對手各推開一半，並換算成 rival.s / lat；lat 受上限限制', () => {
  const G = g(), h = G.CAR_BOX.hatch, k = G.COLL;
  const rv = (x, z, extra = {}) => ({ x, z, h: 0, vis: 0, s: 100, lat: -2.2, v: 8, latV: 0, ...extra });
  assert.equal(G.carStep(S(0, 0, 0, 0, 16), h, rv(1.8, 4), h, 4.2, k), null);
  const st = G.carStep(S(0, 0, 0, 0, 16), h, rv(0, 4.0), h, 4.2, k);
  assert.ok(Math.abs(st.z + 0.15) < 1e-9 && Math.abs(st.s - 100.15) < 1e-9 && Math.abs(st.lat + 2.2) < 1e-9, `z=${st.z} s=${st.s} lat=${st.lat}`);
  assert.ok(st.v > 8 && st.vz < 16, '對手被推快、玩家被減速');
  assert.ok(Math.abs(st.hitSpeed - 4) < 1e-9, `hitSpeed=${st.hitSpeed}`);
  const side = G.carStep(S(0, 0), h, rv(-1.6, 0, { lat: 4.19, v: 0 }), h, 4.2, k);
  assert.ok(side && Math.abs(side.lat - 4.2) < 1e-12, `lat=${side && side.lat}`);
  assert.equal(side.hitSpeed, 0);
});
