// RV-4 拉力四驅（第一段：外觀車身）：資料、尺寸與載入順序
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const CARS = new Function(`${block('cars')}\nreturn CARS;`)();
const CAB = new Function(`${block('cabin-shape')}\nreturn CAB;`)();
const CAR_BOX = new Function(`${block('collision')}\nreturn CAR_BOX;`)();
const GB = new Function(`${block('gearbox')}\nreturn GB;`)();
const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}（容許 ${eps}）`);
const ptY = p => p[p.length - 1]; // [z, y] 或 ['Q', cz, cy, z, y] 的終點 y

test('rally: 名稱、星等 [4,3,2,5]（總分 14）與四種顏色', () => {
  const r = CARS.rally;
  assert.ok(r, 'CARS.rally 不存在');
  assert.deepEqual(r.name, { zh: 'RV-4 拉力四驅', en: 'RV-4 Rally 4WD' });
  assert.ok(r.sub.zh.length > 5 && r.sub.en.length > 5);
  assert.deepEqual(r.stats.map(s => s[1]), [4, 3, 2, 5]);
  assert.equal(r.stats.reduce((a, s) => a + s[1], 0), 14);
  assert.deepEqual(r.colors.map(c => c.n.zh), ['拉力藍', '白', '銀', '黑']);
  assert.ok(r.colors.every(c => !c.locked), '一開始就能選，不解鎖');
});

test('rally: 輪圈顏色依車色（藍、白配金色；銀、黑配銀色），其他三台車沒有此欄位', () => {
  const w = CARS.rally.colors.map(c => c.wheel);
  assert.equal(w[0], w[1]); assert.equal(w[2], w[3]);
  assert.notEqual(w[0], w[2]);
  const gold = w[0], r = (gold >> 16) & 255, b = gold & 255;
  assert.ok(r > b + 40, '金色：紅明顯大於藍');
  for (const k of ['hatch', 'coupe', 'gtr']) assert.ok(CARS[k].colors.every(c => c.wheel === undefined), k);
});

// 第三段已把暫定物理換成調校值：平衡與數值的測試在 rv4-physics.test.mjs；這裡只留 AI 表可用
test('rally: AI 數值可用', () => {
  const { rally } = CARS;
  assert.ok(rally.ai.top > 30 && rally.ai.acc > 3 && rally.ai.lat > 5);
});

test('rally: 其他三台車的星等與物理資料不變', () => {
  assert.deepEqual(CARS.hatch.stats.map(s => s[1]), [2, 2, 5, 4]);
  assert.deepEqual(CARS.coupe.stats.map(s => s[1]), [4, 4, 3, 3]);
  assert.deepEqual(CARS.gtr.stats.map(s => s[1]), [5, 5, 1, 1]);
  assert.deepEqual(CARS.hatch.phys, { maxV: 54, engine: 11.5, lag: 0, grip: 9, gripLimit: 20.5, drift: 1.12, slide: 0.1, hb: 3.5 });
  assert.deepEqual(CARS.coupe.phys, { maxV: 61, engine: 14, lag: 1, grip: 8, gripLimit: 19, drift: 1, slide: 0.22, hb: 7 });
  assert.deepEqual(CARS.gtr.phys, { maxV: 70, engine: 18.5, lag: 1, grip: 6.5, gripLimit: 15.5, drift: 0.72, slide: 0.5, hb: 8 });
  assert.deepEqual(CARS.hatch.colors.length, 5); assert.equal(CARS.coupe.colors.length, 4); assert.equal(CARS.gtr.colors.length, 4);
});

test('CAB.rally: 實車尺寸（全長 4.35、全寬 1.69、車高 1.40、軸距 2.52）', () => {
  const K = CAB.rally;
  assert.ok(K, 'CAB.rally 不存在');
  assert.equal(K.axleZ, 1.26); assert.equal(K.axleZ * 2, 2.52);
  const b = K.body;
  near(b[0][0] - b[b.length - 1][0], 4.35, 0.01);
  near(Math.max(...b.map(s => s[1])) * 2, 1.69, 0.01);
  const roof = Math.max(...K.house.map(ptY));
  near(roof, 1.40, 0.01);
});

test('CAB.rally: 車身斷面站由車頭到車尾遞減、底低於頂、頂不超過車頂，輪拱在車身中段', () => {
  const K = CAB.rally;
  for (let i = 1; i < K.body.length; i++) assert.ok(K.body[i][0] < K.body[i - 1][0], `站 ${i} 的 z 要遞減`);
  for (const [z, w, y0, yf, yc] of K.body) { assert.ok(y0 < yf && y0 < yc && w > 0, `z ${z}`); assert.ok(yf < 1.4 && yc < 1.4); }
  assert.ok(K.body[0][0] > K.axleZ + 0.5 && K.body[K.body.length - 1][0] < -K.axleZ - 0.5, '前後懸');
  near(K.wheelR, 0.31, 0.02);
});

test('CAB.rally: 擋風玻璃在車頂前緣之前、後玻璃在行李箱之前；車窗圖形都落在車艙輪廓上方的帶狀範圍', () => {
  const K = CAB.rally, [base, top] = K.glass, roofFront = K.house[1];
  assert.ok(base[0] > top[0] && base[1] < top[1], '擋風玻璃由下往上、由前往後');
  assert.ok(top[0] > roofFront[0] - 0.01, '擋風玻璃上緣不超過車頂前緣');
  assert.ok(Math.max(...K.side.flat().map(p => p[1])) < K.roof, '側窗低於車頂');
  assert.equal(K.side.length, 2, '雙門：門窗與後三角窗各一片');
  const [door, quarter] = K.side, zMin = a => Math.min(...a.map(p => p[0])), zMax = a => Math.max(...a.map(p => p[0]));
  assert.ok(zMin(door) > zMax(quarter), '門窗在前、後三角窗在後，中間留黑色窗柱');
  assert.ok(zMin(door) - zMax(quarter) >= 0.05 && zMin(door) - zMax(quarter) <= 0.15, '窗柱寬度 5–15 cm（無 B 柱窗框）');
});

test('CAB.rally: 尾翼高而拱起，頂端不高於車頂、高出行李箱蓋 25 cm 以上，兩根支柱在翼寬之內', () => {
  const W = CAB.rally.wing, deck = Math.max(...CAB.rally.body.filter(s => s[0] < -1.5).map(s => s[4]));
  assert.ok(W, 'CAB.rally.wing 不存在');
  const top = W.y + W.rise + W.plateH / 2;
  assert.ok(top <= CAB.rally.roof + 1e-9 && top - deck >= 0.25, `top ${top} deck ${deck}`);
  assert.ok(W.rise > 0.02, '拱形：兩端比中央高');
  assert.ok(W.postX > 0.3 && W.postX < W.halfW && W.halfW < 0.8);
  assert.ok(W.z < -1.6 && W.z > -2.1, '在行李箱上');
});

test('CAR_BOX.rally 存在，尺寸與全長全寬相稱', () => {
  const b = CAR_BOX.rally;
  assert.ok(b, 'CAR_BOX.rally 不存在');
  near(b.hl, 2.19, 0.06); near(b.hw, 0.85, 0.03);
  assert.deepEqual(Object.keys(CAR_BOX).sort(), Object.keys(CARS).sort());
});

test('GB.CARS.rally 存在（暫定），紅線與 6 檔車速合理', () => {
  const g = GB.CARS.rally;
  assert.ok(g, 'GB.CARS.rally 不存在');
  assert.ok(g.redline >= 7000 && g.redline <= 8500 && g.v6 > CARS.rally.phys.maxV && g.gain > 0);
});

test('載入順序：車用貼圖在第一次頂層 buildCars() 之前宣告', () => {
  const first = html.search(/^buildCars\(\);/m);
  assert.ok(first > 0);
  const m = html.match(/^let rallyMeshTex\b/m);
  assert.ok(m && m.index < first, 'rallyMeshTex 要在 buildCars() 之前宣告');
});

test('disposeCar 不釋放共用的拉力車格柵貼圖', () => {
  const line = html.split('\n').find(l => l.startsWith('function disposeCar(c)'));
  assert.ok(line && line.includes('rallyMeshTex'));
});

// 第一段修正（依截圖）
test('CAB.rally: 車艙側面採線性收窄（lin），且從車艙底部就開始，窗板與車艙殼才會共面（否則車身色斜片穿出玻璃）', () => {
  const K = CAB.rally;
  assert.equal(K.S.lin, true);
  assert.ok(K.S.ty0 <= Math.min(...K.house.map(ptY)) + 1e-9, 'ty0 不高於車艙最低點');
  assert.ok(/S\.lin \? clamp\(\(y - S\.ty0\) \/ \(S\.ty1 - S\.ty0\), 0, 1\)/.test(html), 'widthK 要支援 S.lin');
});

test('CAB.rally: 車頭保險桿明顯前凸、燈帶是近乎垂直的平面（臺階 >= 12 cm 高、<= 4 cm 深）', () => {
  const b = CAB.rally.body;
  let found = false;
  for (let i = 1; i < b.length; i++) { const dy = b[i][3] - b[i - 1][3], dz = b[i - 1][0] - b[i][0]; if (b[i][0] > 1.8 && dy >= 0.12 && dz <= 0.04) found = true; }
  assert.ok(found, '前面要有一個陡的臺階');
  assert.ok(b[0][0] - b.find(s => s[3] > 0.7)[0] >= 0.07, '保險桿比燈帶前凸 7 cm 以上');
});

const { rallyLampEdge } = new Function(`${block('cabin-shape')}
return { rallyLampEdge };`)();

test('CAB.rally: 尾燈是楔形：內側窄而低、外側高，外端收圓繞過車尾角落；上緣向中央傾斜；上紅下白，紅色內有一條琥珀帶', () => {
  const T = CAB.rally.tail, half = Math.max(...CAB.rally.body.map(s => s[1]));
  assert.ok(T, 'CAB.rally.tail 不存在');
  const w = T.x1 - T.x0;
  assert.ok(w / (2 * half) >= 0.3 && w / (2 * half) <= 0.38, `寬度比 ${w / (2 * half)}`);
  assert.ok(T.x1 >= half - 0.08 && T.x1 <= half && T.x0 > 0.15 && T.x0 < 0.3);
  assert.ok(T.h1 >= T.h0 * 1.4, '外側至少比內側高 40%');
  assert.ok(T.phi1 > Math.atan2(T.x1, 0.6), '外端繞過車尾角落');
  const e = u => { const [b, t] = rallyLampEdge(T, u); return { b, t, h: t - b }; };
  assert.ok(e(0).h > 0.08 && e(0.8).h > e(0).h * 1.3, '高度由內向外增加');
  assert.ok(e(0.8).t > e(0).t + 0.03, '上緣向外上升、向中央下傾');
  assert.ok(e(1).h < 0.01 && e(0.97).h < e(0.8).h, '外端收圓');
  assert.ok(e(0).b >= 0.7 && e(0.5).b >= 0.7, '燈在保險桿上緣之上');
  assert.ok(T.clearV > 0.25 && T.clearV < 0.5, '下方白色倒車燈占 25–50%');
  const A = T.amber; assert.ok(A.v0 >= T.clearV && A.v1 <= 1 && A.u0 >= 0 && A.u1 < 0.7 && A.u1 > A.u0, '琥珀帶在紅色範圍內、靠內側');
});

test('CAB.rally: 車尾圓潤——行李箱蓋是向下漸陡的凸面，保險桿獨立、前凸 >= 5 cm、有水平上緣與足夠高度', () => {
  const b = CAB.rally.body, lid = b.filter(s => s[0] <= -1.58 && s[3] > 0.78);
  for (let i = 1; i < lid.length; i++) assert.ok(lid[i][3] <= lid[i - 1][3] + 1e-9, '蓋面只下降不上翹');
  const sl = i => (lid[i - 1][3] - lid[i][3]) / (lid[i - 1][0] - lid[i][0]);
  for (let i = 2; i < lid.length; i++) assert.ok(sl(i) >= sl(i - 1) - 1e-9, `第 ${i} 站起坡度漸陡（凸面）`);
  const end = b[b.length - 1], lidEnd = lid[lid.length - 1];
  assert.ok(lidEnd[0] - end[0] >= 0.05, '保險桿比蓋面尾端凸出 5 cm 以上');
  assert.ok(end[3] > 0.68 && end[3] < 0.76 && end[3] - end[2] >= 0.3, '保險桿高度 >= 30 cm、上緣約 0.7');
  assert.ok(b.find(s => s[0] < lidEnd[0])[3] < 0.76, '蓋面下緣接保險桿上緣的水平檯面');
});

test('CAB.rally: 引擎蓋進氣口明顯隆起（前緣高出引擎蓋 >= 10 cm）', () => {
  const sc = CAB.rally.scoop, st = CAB.rally.body, yc = z => { for (let i = 0; i < st.length - 1; i++) if (z <= st[i][0] && z >= st[i + 1][0]) return st[i + 1][4] + (st[i][4] - st[i + 1][4]) * (z - st[i + 1][0]) / (st[i][0] - st[i + 1][0]); };
  assert.ok(sc.y1 - yc(sc.z1) >= 0.1, `前緣高 ${sc.y1 - yc(sc.z1)}`);
});

test('rally: 拉力藍是偏深的金屬感藍（各色版在 0x1d3a8a–0x24479e 附近），輪圈仍為金色', () => {
  const c = CARS.rally.colors[0].top, r = c >> 16, g = (c >> 8) & 255, b = c & 255;
  assert.ok(r >= 0x1d - 4 && r <= 0x24 + 4 && g >= 0x3a - 4 && g <= 0x47 + 8 && b >= 0x8a - 4 && b <= 0x9e + 4, c.toString(16));
  assert.equal(CARS.rally.colors[0].wheel, 0xc9a14a);
  assert.deepEqual(CARS.rally.colors.slice(1).map(x => x.top), [0xeceef2, 0xaeb3bc, 0x15161a]);
});
