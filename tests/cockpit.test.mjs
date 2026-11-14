// 抽出 yatouge.html 內 @cockpit 區塊（車內視角的純函式，不依賴 THREE / DOM）後在 Node 執行
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
const NAMES = 'GEARS, gearFor, gearLabel, wheelAngle, needleAngle, smoothTo, gatePos, shifterPath, shifterStep, cockpitMotion, newCockpitMotion, CK_LIM, COCKPIT_CARS, clusterY, dashFront, LEAN, leanStep, newLean';
function load() {
  const open = '/* @cockpit:start */', s = html.indexOf(open), e = html.indexOf('/* @cockpit:end */');
  assert.ok(s >= 0 && e > s, '找不到 @cockpit 區塊');
  return new Function(`${html.slice(s + open.length, e)}\nreturn { ${NAMES} };`)();
}
// 外觀與車內共用的車艙數字（純資料，不依賴 THREE）
const loadCab = () => new Function(`${html.slice(html.indexOf('/* @cabin-shape:start */'), html.indexOf('/* @cabin-shape:end */'))}
return CAB;`)();
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
  assert.ok(A.z < -0.008 && A.pitch < -0.3 * DEG && -A.z < B.z * 0.6, `z=${A.z} pitch=${A.pitch}`); // 加速只微微後仰
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
  assert.ok(COCKPIT_CARS.rally, 'COCKPIT_CARS.rally 不存在');
  assert.deepEqual(Object.keys(COCKPIT_CARS).sort(), Object.keys(box).sort());
  for (const k of Object.keys(box)) {
    const c = COCKPIT_CARS[k];
    assert.ok(Math.abs(c.eye.fwd) < box[k].hl && c.eye.right > 0.2 && c.eye.right < box[k].hw, `${k} eye`);
    const top = loadCab()[k].glass[1][1]; // 外觀擋風玻璃上緣
    assert.ok(c.eye.up > 0.9 && c.eye.up < top - 0.1, `${k} 眼睛高度要在擋風玻璃上緣之下`);
    assert.ok(c.fov >= 70 && c.fov <= 80, `${k} fov`);
    assert.ok(c.wheel.spokes.length >= 3 && c.wheel.r > 0.15 && c.wheel.r < 0.22, `${k} wheel`);
    assert.ok(c.mirrorX > c.eye.right && c.mirrorX < box[k].hw, `${k} 側鏡在車寬內`);
    assert.ok(['twin', 'bigTach', 'twinAux'].includes(c.gauges) && ['box', 'wrap'].includes(c.layout), k);
  }
  assert.equal(new Set(Object.values(COCKPIT_CARS).map(c => c.layout + c.gauges)).size, 4, '四台車的內裝風格各不相同');
});

// 從眼睛看出去的視線：儀表板頂面前緣不能高過眼睛到擋風玻璃下緣（取自外觀 CAB）的視線，否則會蓋住從玻璃看出去的引擎蓋；
// SR-7 的大轉速表群也不能高過視線（容許 2 cm）
test('COCKPIT_CARS：儀表板頂面前緣在擋風玻璃下緣的視線上或之下；SR-7 的儀表群也低於視線', () => {
  const { COCKPIT_CARS, clusterY, dashFront } = load(), CAB = loadCab();
  const glassSight = (c, base, z) => c.eye.up + (base[1] - c.eye.up) * (z - c.eye.fwd) / (base[0] - c.eye.fwd);
  for (const k of ['hatch', 'gtr', 'coupe', 'rally']) {
    const c = COCKPIT_CARS[k], base = CAB[k].glass[0], fz = dashFront(c, base);
    assert.ok(!c.hdr && !c.hood, `${k} 車內由 CAB 產生，不再有自己的 hdr / hood`);
    assert.ok(c.dashTop <= glassSight(c, base, fz) + 1e-9, `${k} 儀表板前緣 ${c.dashTop} vs 視線 ${glassSight(c, base, fz).toFixed(3)}`);
    assert.ok(fz <= c.dashZ && fz > 0.74 + 0.03, `${k} 儀表板前緣 z ${fz.toFixed(3)} 在面板之前、不超過 dashZ`);
  }
  const c = COCKPIT_CARS.coupe, top = clusterY(c) + 0.1; // 大轉速表半徑 0.1，儀表罩頂與錶頂同高
  assert.ok(top <= glassSight(c, CAB.coupe.glass[0], 0.86) + 0.02, `coupe 儀表群頂 ${top} vs 視線 ${glassSight(c, CAB.coupe.glass[0], 0.86).toFixed(3)}`);
  assert.ok(clusterY({ dashTop: 0.9 }) > 0.9, '未覆寫 clusterY 時，預設儀表群在儀表板頂面上方');
});

// 儀表群太高會擋住前方視野：每台車的儀表群中心至少要比眼睛低 0.25（SR-7 的 0.28 為基準）
test('clusterY：KX-2 0.84、GT-32 0.78、SR-7 0.72、RV-4 比眼睛低 0.28，且都比眼睛低至少 0.25', () => {
  const { COCKPIT_CARS, clusterY } = load();
  assert.equal(clusterY(COCKPIT_CARS.hatch), 0.84);
  assert.equal(clusterY(COCKPIT_CARS.gtr), 0.78);
  assert.equal(clusterY(COCKPIT_CARS.coupe), 0.72);
  near(clusterY(COCKPIT_CARS.rally), COCKPIT_CARS.rally.eye.up - 0.28, 1e-9);
  for (const k of ['hatch', 'gtr', 'coupe', 'rally']) {
    const c = COCKPIT_CARS[k];
    assert.ok(c.eye.up - clusterY(c) >= 0.25 - 1e-9, `${k} 儀表群離眼睛 ${(c.eye.up - clusterY(c)).toFixed(3)}`);
  }
});

// 視線不被儀表板擋住時，從玻璃下緣看出去要看得到 KX-2 的引擎蓋（它的引擎蓋高過視線），GT-32 則幾乎被車頭擋線吃掉
test('KX-2：從擋風玻璃下緣看出去，引擎蓋從 z 0.9 附近起就在視線之上', () => {
  const { COCKPIT_CARS } = load(), CAB = loadCab(), c = COCKPIT_CARS.hatch, [b, n] = CAB.hatch.hood, base = CAB.hatch.glass[0];
  const hoodY = z => b[1] + (n[1] - b[1]) * (z - b[0]) / (n[0] - b[0]);
  const ray = z => c.eye.up + (base[1] - c.eye.up) * (z - c.eye.fwd) / (base[0] - c.eye.fwd);
  assert.ok(hoodY(0.95) > ray(0.95) && hoodY(2.05) > ray(2.05), 'KX-2 引擎蓋大部分可見');
});

// KX-2 的擋風玻璃上緣在視野之上（垂直半視角之外），車內頂棚前緣飾板沿玻璃往下垂到 header：飾板下緣要落在畫面上緣之內（至少低 3°），
// 才看得到車頂；但不能垂得比舊車內的車頂前緣（hdr y 1.46、z 0.45，仰角約 32°）低太多，下緣仰角至少 25°
test('KX-2：車內頂棚前緣飾板從座位看得到，又不擋前方視野', () => {
  const { COCKPIT_CARS } = load(), K = loadCab().hatch, c = COCKPIT_CARS.hatch, [a, b] = K.house;
  const elev = (z, y) => Math.atan2(y - c.eye.up, z - c.eye.fwd) / DEG;
  assert.ok(elev(...K.glass[1]) > c.fov / 2, '外觀擋風玻璃上緣本身在視野之外');
  assert.ok(c.header < K.glass[1][1] && c.header > c.eye.up + 0.05, `header ${c.header}`);
  const hz = a[0] + (c.header - a[1]) * (b[0] - a[0]) / (b[1] - a[1]), e = elev(hz, c.header);
  assert.ok(e < c.fov / 2 - 3 && e > 25, `飾板下緣仰角 ${e.toFixed(1)}° vs 半視角 ${c.fov / 2}°`);
  for (const k of ['gtr', 'coupe']) assert.equal(COCKPIT_CARS[k].header, undefined, `${k} 沒有 header`);
});

// SR-7 的擋風玻璃下緣與上緣（CAB.coupe.glass）要落在車艙外殼上：下緣是車頂中線高度到 glassY 的位置，上緣是車頂中線與 A 柱線 aPil 的交點
// （與外觀的 loftStations 一樣在關鍵斷面間做 Catmull-Rom，斷面之間線性），容許 5 mm
test('SR-7：CAB.coupe 的擋風玻璃下緣、上緣與車艙外殼及玻璃分區一致', () => {
  const s = html.indexOf('function loftStations'), loftStations = new Function(`${html.slice(s, html.indexOf('\n}\n', s) + 3)}\nreturn loftStations;`)();
  const K = loadCab().coupe, st = loftStations(K.cabin);
  const roofY = z => { for (let i = 0; i < st.length - 1; i++) { const a = st[i], b = st[i + 1]; if (z <= a[0] && z >= b[0]) return b[3] + (a[3] - b[3]) * (z - b[0]) / (a[0] - b[0]); } return NaN; };
  const zA = y => K.aPil[0] - (y - K.aPil[1]) * K.aPil[2];
  const [base, top] = K.glass;
  near(base[1], K.glassY, 1e-9);
  near(roofY(base[0]), K.glassY, 0.005);
  near(roofY(top[0]), top[1], 0.005);
  near(zA(top[1]), top[0], 0.005);
  const { COCKPIT_CARS } = load(), c = COCKPIT_CARS.coupe;
  assert.ok(c.eye.fwd < top[0] && c.eye.up < top[1] - 0.1, 'SR-7 眼睛在擋風玻璃上緣之後、之下');
});

// SR-7 的翼子板稜線高過低窪的引擎蓋中央；從玻璃下緣看出去，車頭段的兩側稜線（升降頭燈所在）在視線之上
test('SR-7：從擋風玻璃下緣看出去，翼子板稜線在視線之上', () => {
  const { COCKPIT_CARS } = load(), K = loadCab().coupe, c = COCKPIT_CARS.coupe, base = K.glass[0];
  const ray = z => c.eye.up + (base[1] - c.eye.up) * (z - c.eye.fwd) / (base[0] - c.eye.fwd);
  const front = K.body.filter(q => q[0] >= 1.2 && q[0] <= 2.05);
  assert.ok(front.length >= 4);
  for (const [z, , , yS, , yC] of front) {
    assert.ok(yS > yC, `z ${z} 稜線 ${yS} 高過中央 ${yC}`);
    assert.ok(yS > ray(z), `z ${z} 稜線 ${yS} vs 視線 ${ray(z).toFixed(3)}`);
  }
});

// ---- @lean：車內慣性前傾（彈簧阻尼）----
test('@lean 區塊存在且在 @cockpit 內', () => {
  const s = html.indexOf('/* @lean:start */'), e = html.indexOf('/* @lean:end */');
  assert.ok(s > html.indexOf('/* @cockpit:start */') && e > s && e < html.indexOf('/* @cockpit:end */'));
});

const leanRun = (aLong, secs, dt = 1 / 60, s) => { const { leanStep, newLean } = load(); s = s || newLean(); const zs = []; for (let t = 0; t < secs - 1e-9; t += dt) zs.push(leanStep(s, typeof aLong === 'function' ? aLong(t) : aLong, dt).z); return { s, zs }; };

test('leanStep：煞車前傾（前移 + 低頭）、加速微微後仰，都在上限內；儀表要看得到所以前移 ≤ 4 cm、低頭 ≤ 2.5°', () => {
  const { LEAN } = load();
  assert.ok(LEAN.FWD <= 0.04 + 1e-12 && LEAN.BACK <= 0.02 && LEAN.PITCH <= 2.5 * DEG + 1e-12 && LEAN.PITCH_BACK <= 1 * DEG + 1e-12);
  const B = leanRun(-24, 2).s;
  assert.ok(B.z > 0.03 && B.z <= LEAN.FWD + 1e-12, `z=${B.z}`);
  assert.ok(B.pitch > 1.5 * DEG && B.pitch <= LEAN.PITCH + 1e-12, `pitch=${B.pitch}`);
  const A = leanRun(10, 2).s;
  assert.ok(A.z < -0.005 && A.z >= -LEAN.BACK - 1e-12 && A.pitch < 0 && A.pitch >= -LEAN.PITCH_BACK - 1e-12, `z=${A.z} pitch=${A.pitch}`);
  for (const a of [1e6, -1e6]) { const s = leanRun(a, 3).s; assert.ok(s.z <= LEAN.FWD + 1e-12 && s.z >= -LEAN.BACK - 1e-12 && Math.abs(s.pitch) <= LEAN.PITCH + 1e-12); }
  const z = leanRun(0, 2).s; assert.equal(z.z, 0); assert.equal(z.pitch, 0);
});

test('leanStep：緩入（不是瞬間到位）、略帶回彈後穩定下來', () => {
  const { zs } = leanRun(-18, 3), fin = zs[zs.length - 1];
  assert.ok(zs[0] < fin * 0.05, `第一幀 ${zs[0]}`);
  const half = zs.findIndex(z => z >= fin * 0.5);
  assert.ok(half >= 5 && half <= 20, `到一半要 ${half} 幀`);   // 約 0.08–0.33 秒
  const peak = Math.max(...zs); assert.ok(peak <= fin * 1.1 + 1e-12, `回彈 ${peak / fin}`);
  for (const z of zs.slice(90)) assert.ok(Math.abs(z - fin) < fin * 0.02, '1.5 秒後已穩定');
  // 放開煞車後回到 0
  const { s } = leanRun(-18, 1); const back = leanRun(0, 2, 1 / 60, s).zs; assert.ok(Math.abs(back[back.length - 1]) < 1e-4);
});

test('leanStep：逐幀加速度抖動（幀率不穩造成 0 / 2 倍）不會讓鏡頭抖，結果接近平均值', () => {
  const j = leanRun(t => (Math.round(t * 60) % 2 ? -16 : 0), 2).zs, c = leanRun(-8, 2).zs;
  for (let i = 30; i < j.length; i++) assert.ok(Math.abs(j[i] - c[i]) < 0.0015, `第 ${i} 幀差 ${j[i] - c[i]}`);
  for (let i = 1; i < j.length; i++) assert.ok(Math.abs(j[i] - j[i - 1]) < 0.004);
});

test('leanStep：換檔煞車（加速中短暫失去動力 + 約 3 m/s² 減速 0.12 秒）會往前點一下再回去', () => {
  const { leanStep, newLean } = load(), s = newLean();
  for (let i = 0; i < 120; i++) leanStep(s, 8, 1 / 120);
  const before = s.z; let peak = before;
  for (let i = 0; i < 14; i++) leanStep(s, -3.5, 1 / 120);
  for (let i = 0; i < 60; i++) { leanStep(s, 8, 1 / 120); peak = Math.max(peak, s.z); }
  assert.ok(peak - before > 0.003, `點頭 ${((peak - before) * 1000).toFixed(1)} mm`);
  assert.ok(peak - before < 0.02);
  for (let i = 0; i < 240; i++) leanStep(s, 8, 1 / 120);
  assert.ok(Math.abs(s.z - before) < 1e-4, '之後回到原位');
});

test('leanStep：大 dt、NaN 都穩定', () => {
  const { leanStep, newLean, LEAN } = load(), s = newLean();
  for (let i = 0; i < 200; i++) { leanStep(s, i % 2 ? -30 : 30, 0.05); assert.ok(Number.isFinite(s.z) && Math.abs(s.z) <= LEAN.FWD + 1e-12); }
  leanStep(s, NaN, NaN); leanStep(s, -10, 1 / 60); assert.ok(Number.isFinite(s.z) && Number.isFinite(s.v) && Number.isFinite(s.pitch));
});

test('cockpitMotion：縱向用 leanStep（相同輸入 → 相同前移與低頭），側向不變', () => {
  const { cockpitMotion, newCockpitMotion, leanStep, newLean } = load(), m = newCockpitMotion(), s = newLean();
  for (let i = 0; i < 90; i++) { const a = i < 45 ? -20 : 6; cockpitMotion(m, { ...rest, aLong: a }, 1 / 60); leanStep(s, a, 1 / 60); }
  near(m.z, s.z, 1e-12); near(m.pitch, s.pitch, 1e-12);
});

test('SR-7 引擎蓋：0.95 ≤ z ≤ 2.165 的肩線到中線落差不超過 2 cm，且肩線仍高於中線', () => {
  const rows = loadCab().coupe.body.filter(r => r[0] >= 0.95 && r[0] <= 2.165);
  assert.ok(rows.length >= 7);
  for (const [z, , , yS, , yC] of rows) {
    const drop = yS - yC;
    assert.ok(drop > 0 && drop <= 0.02 + 1e-9, `z=${z} 落差 ${drop}`);
  }
});

// ---- RV-4（rally）車內視角 ----
const fnSrc = name => { const i = html.indexOf('function ' + name + '('); return html.slice(i, html.indexOf('\n}\n', i) + 3); };

test('RV-4：儀表群頂（大轉速表與罩）不高過擋風玻璃下緣視線，且儀表板不高過視線', () => {
  const { COCKPIT_CARS, clusterY } = load(), c = COCKPIT_CARS.rally, base = loadCab().rally.glass[0];
  const sight = z => c.eye.up + (base[1] - c.eye.up) * (z - c.eye.fwd) / (base[0] - c.eye.fwd);
  const pz = 0.74, top = clusterY(c) + 0.1; // 儀表罩頂與大轉速表（半徑 0.1）同高，罩的最高點在 pz + 0.12
  assert.equal(c.gauges, 'bigTach');
  assert.ok(top <= sight(pz + 0.12) + 1e-9, `儀表群頂 ${top.toFixed(3)} vs 視線 ${sight(pz + 0.12).toFixed(3)}`);
  assert.ok(c.dashTop <= sight(1.0) + 1e-9);
});

test('RV-4：眼睛在側窗玻璃的腰線與窗頂之間、在擋風玻璃上緣之下；方向盤三輻、側鏡在車寬內', () => {
  const { COCKPIT_CARS } = load(), c = COCKPIT_CARS.rally, K = loadCab().rally, door = K.side[0];
  assert.ok(c.eye.up > Math.min(...door.map(p => p[1])) + 0.1 && c.eye.up < Math.max(...door.map(p => p[1])) - 0.1, `eye.up ${c.eye.up}`);
  assert.ok(c.eye.fwd < door[0][0] && c.eye.fwd > door[3][0], '眼睛在門窗前後緣之間');
  assert.equal(c.wheel.spokes.length, 3);
});

test('RV-4：從座位看得到引擎蓋中央的進氣口（前緣在視線之上），引擎蓋也在玻璃下緣視線之上', () => {
  const { COCKPIT_CARS } = load(), c = COCKPIT_CARS.rally, K = loadCab().rally, base = K.glass[0], sc = K.scoop;
  const ray = z => c.eye.up + (base[1] - c.eye.up) * (z - c.eye.fwd) / (base[0] - c.eye.fwd);
  assert.ok(sc.y1 > ray(sc.z1) + 0.05, `進氣口前緣 ${sc.y1} vs 視線 ${ray(sc.z1).toFixed(3)}`);
  const hood = K.body.filter(q => q[0] >= 1.5 && q[0] <= 2.07); // 引擎蓋後段被擋風玻璃下緣的視線遮住（車頭低），從 z 1.4 附近起才看得到
  for (const q of hood) assert.ok(q[4] > ray(q[0]), `z ${q[0]} 引擎蓋中線 ${q[4]} vs 視線 ${ray(q[0]).toFixed(3)}`);
});

test('RV-4 車內：窗框、A 柱、側窗、車頂與引擎蓋由 CAB.rally 產生（同一組數字），車內沒有自己的外形數字', () => {
  const { COCKPIT_CARS } = load(), c = COCKPIT_CARS.rally, src = fnSrc('makeInterior');
  assert.ok(!c.hdr && !c.hood && !c.header, 'COCKPIT_CARS.rally 沒有自己的 hdr / hood / header');
  assert.ok(src.includes('const K = CAB[style]'));
  for (const key of ['K.house', 'K.side', 'K.glass', 'K.houseW', 'K.glassW', 'K.S', 'K.scoop', 'K.body']) assert.ok(src.includes(key), `makeInterior 要用 ${key}`);
  assert.ok(src.includes("style === 'rally'"));
  assert.ok(!/CAB.rally/.test(src), '一律經由 K = CAB[style]');
  // 車身斷面函式只有一份（外觀的 loftBody 與車內引擎蓋共用），不是兩份各自抄一遍
  assert.equal((html.match(/const rallyHalf = /g) || []).length, 1);
  assert.ok(src.includes('rallyHalf('), '車內引擎蓋用 rallyHalf');
  assert.equal((html.match(/function rallyScoop[(]/g) || []).length, 1, '進氣口外殼只有一份建構函式');
  assert.ok(src.includes('rallyScoop(grp, K.scoop'), '車內進氣口用共用外殼');
  assert.ok(fnSrc('makeCar').includes('rallyScoop(g, sc'), '外觀進氣口用共用外殼');
  assert.ok(fnSrc('makeCar').includes('loftBody(K.body, col.top, g, [[ax, 0.36], [-ax, 0.36]], rallyHalf'), '外觀同樣用 rallyHalf');
});

test('RV-4：camNow() 沒有「無車內資料就退回追車」的後備；宣告順序：rallyHalf 在 makeCar 第一次被呼叫（頂層 buildCars()）之前', () => {
  assert.ok(html.includes("const camNow = () => sakeRun ? 'cockpit' : camMode;"));
  assert.ok(!html.includes('!COCKPIT_CARS[choice.car]'));
  const first = html.indexOf('\nbuildCars();'), d = html.indexOf('\nconst rallyHalf = ');
  assert.ok(d > 0 && d < first, 'rallyHalf 要在 buildCars() 之前宣告');
  const ci = html.indexOf('const COCKPIT_CARS = {'), ce = html.indexOf('/* @cockpit:end */');
  assert.ok(html.slice(ci, ce).includes('rally:'), 'COCKPIT_CARS 內有 rally');
});

test('RV-4：後照鏡與側鏡的寬度／位置沿用其他車的機制（mirrorWidth 與車無關，mirrorX 在車寬內）', () => {
  assert.ok(html.includes('const mirrorWidth = (w, h) => Math.min(Math.max(Math.min(w * 0.38, h * 0.5), 150), 380);'));
  const { COCKPIT_CARS } = load(), box = loadBox();
  assert.ok(COCKPIT_CARS.rally.mirrorX > COCKPIT_CARS.rally.eye.right && COCKPIT_CARS.rally.mirrorX < box.rally.hw);
});

test('RV-4：眼睛高度不高於 1.13（再高引擎蓋與進氣口占畫面太多），且不低於引擎蓋中線仍從玻璃看得到的高度', () => {
  const c = load().COCKPIT_CARS.rally, K = loadCab().rally, base = K.glass[0];
  assert.ok(c.eye.up <= 1.13 + 1e-9, `eye.up ${c.eye.up}`);
  const ray = z => c.eye.up + (base[1] - c.eye.up) * (z - c.eye.fwd) / (base[0] - c.eye.fwd);
  assert.ok(K.body.find(q => q[0] === 1.85)[4] > ray(1.85) + 0.005, '車頭段的引擎蓋中線在視線之上');
  // 引擎蓋與進氣口用的車身顏色材質與外觀一樣（Lambert、同一個色票），見 makeInterior 的 mPaint
  assert.ok(fnSrc('makeInterior').includes('mPaint = lam(paintHex)') && fnSrc('makeCar').includes('const paint = new THREE.MeshLambertMaterial({ color: col.top })'));
});

// ---- RV-4 引擎蓋進氣口的明暗與細節（純幾何，不需要 THREE）----
const loadScoop = () => {
  const s = html.indexOf('/* @rally-scoop:start */'), e = html.indexOf('/* @rally-scoop:end */'), a = html.indexOf('const rallyHalf = '), b = html.indexOf('\n// RV-4 hood scoop');
  const ls = html.indexOf('function loftStations'), lsrc = html.slice(ls, html.indexOf('\n}\n', ls) + 3);
  assert.ok(s > 0 && e > s && a > 0, '找不到 @rally-scoop 區塊');
  const rh = html.slice(a, html.indexOf('\n// ', a));
  return new Function(`${lsrc}\n${rh}\n${html.slice(s, e)}\nreturn { rallyScoopGeo, rallyHoodY, rallyHalf };`)();
};
const faceNormals = ({ pos, idx }) => {
  const out = [];
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map(k => idx[i + k] * 3), u = [0, 1, 2].map(k => pos[b + k] - pos[a + k]), v = [0, 1, 2].map(k => pos[c + k] - pos[a + k]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n);
    if (l > 1e-12) out.push({ n: n.map(q => q / l), c: [0, 1, 2].map(k => (pos[a + k] + pos[b + k] + pos[c + k]) / 3) });
  }
  return out;
};

test('RV-4 進氣口外殼：頂面、圓角、側壁的法線明顯不同（才會有不同明暗），頂面略為隆起，前面是平的 +z 面', () => {
  const sc = loadCab().rally.scoop, g = loadScoop().rallyScoopGeo(sc), f = faceNormals(g), hw = sc.w / 2;
  const body = f.filter(q => q.c[2] > sc.z0 + 0.01 && q.c[2] < sc.z1 - 0.01);
  const top = body.filter(q => Math.abs(q.c[0]) < hw * 0.6), wall = body.filter(q => Math.abs(q.c[0]) > hw - 0.002), corner = body.filter(q => Math.abs(q.c[0]) > hw * 0.8 && Math.abs(q.c[0]) < hw - 0.002 && q.c[1] > 0.9);
  assert.ok(top.length && wall.length && corner.length);
  for (const q of body) assert.ok(q.n[1] > -0.05 || Math.abs(q.c[0]) > hw - 0.002, '外殼法線朝外（頂面朝上）');
  assert.ok(top.every(q => q.n[1] > 0.9), "頂面朝上");
  assert.ok(wall.every(q => Math.abs(q.n[1]) < 0.2 && Math.abs(q.n[0]) > 0.95), '側壁近乎垂直、朝外');
  assert.ok(corner.some(q => q.n[1] > 0.3 && q.n[1] < 0.9), '圓角的法線介於頂面與側壁之間');
  const ys = top.map(q => q.n[1]); assert.ok(Math.max(...ys) - Math.min(...ys) > 0.003, '頂面有隆起（法線不全相同）');
  const front = f.filter(q => Math.abs(q.c[2] - sc.z1) < 1e-9); assert.ok(front.length >= 10 && front.every(q => q.n[2] > 0.99), '前面是朝 +z 的平面');
  assert.ok(Math.max(...g.pos.filter((_, i) => i % 3 === 1)) > sc.y1 + 0.02, '隆起讓頂面中央高過 y1');
});

test('rallyHoodY：與車身中線高度一致、往外側單調下降；進氣口底下沒有穿出引擎蓋', () => {
  const { rallyHoodY } = loadScoop(), K = loadCab().rally, sc = K.scoop;
  const yc = z => { for (let i = 0; i < K.body.length - 1; i++) if (z <= K.body[i][0] && z >= K.body[i + 1][0]) return K.body[i + 1][4]; };
  near(rallyHoodY(K.body, 0, 1.5), K.body.find(q => q[0] === 1.5)[4], 1e-9);
  for (const z of [0.9, 1.2, 1.44]) { let p = Infinity; for (const x of [0, 0.1, 0.2, 0.3, 0.5, 0.7]) { const y = rallyHoodY(K.body, x, z); assert.ok(y <= p + 1e-9, `z ${z} x ${x}`); p = y; } }
  assert.ok(sc.y0 >= rallyHoodY(K.body, 0, sc.z0) - 0.01 && sc.y1 > rallyHoodY(K.body, 0, sc.z1) + 0.1, '進氣口後緣貼著引擎蓋、前緣高出');
  assert.ok(yc);
});

test('RV-4 進氣口細節：頂面與引擎蓋接縫有深色細線（外觀與車內共用）；車內引擎蓋近座艙段較暗、不是一整片亮色', () => {
  const src = html.slice(html.indexOf('function rallyScoop('), html.indexOf('// halfOf: station'));
  assert.ok(src.includes('seamMat') && src.includes('hoodY('), 'rallyScoop 會畫接縫細線');
  assert.ok(fnSrc('makeCar').includes('rallyScoop(g, sc, paint, topY, seam)'));
  const mi = fnSrc('makeInterior');
  assert.ok(mi.includes('vertexColors: true') && mi.includes('sstep(0.95, 1.6, q[0])'), '車內引擎蓋近座艙段較暗');
  assert.ok(mi.includes('rallyHoodY(K.body'), '接縫高度由車身數字算出');
});
