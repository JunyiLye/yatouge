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

test('rally: 暫定物理與 AI 數值介於 SR-7 與 GT-32 之間', () => {
  const { coupe, gtr, rally } = CARS;
  for (const k of ['maxV', 'engine']) assert.ok(rally.phys[k] > coupe.phys[k] && rally.phys[k] < gtr.phys[k], k);
  for (const k of ['gripLimit', 'drift']) assert.ok(rally.phys[k] < coupe.phys[k] && rally.phys[k] > gtr.phys[k], k);
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

test('載入順序：車用貼圖在第一次頂層 buildCars() 之前宣告；沒有車內資料時視角退回追車', () => {
  const first = html.search(/^buildCars\(\);/m);
  assert.ok(first > 0);
  const m = html.match(/^let rallyMeshTex\b/m);
  assert.ok(m && m.index < first, 'rallyMeshTex 要在 buildCars() 之前宣告');
  assert.match(html, /const camNow = \(\) => sakeRun \? 'cockpit' : camMode === 'cockpit' && !COCKPIT_CARS\[choice\.car\] \? 'chase' : camMode;/);
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

test('CAB.rally: 尾燈每邊約占車寬三分之一、貼到車身角落', () => {
  const T = CAB.rally.tail, half = Math.max(...CAB.rally.body.map(s => s[1]));
  assert.ok(T, 'CAB.rally.tail 不存在');
  const w = T.x1 - T.x0;
  assert.ok(w / (2 * half) >= 0.3 && w / (2 * half) <= 0.38, `寬度比 ${w / (2 * half)}`);
  assert.ok(T.x1 >= half - 0.08 && T.x1 <= half, '外側到車身角落');
  assert.ok(T.x0 > 0.15 && T.x0 < 0.3, '內側留出行李箱蓋');
  assert.ok(T.split > T.x0 && T.split < T.x1 && T.x1 - T.split > T.split - T.x0, '外側紅色部分比內側大');
});

test('CAB.rally: 引擎蓋進氣口明顯隆起（前緣高出引擎蓋 >= 10 cm）', () => {
  const sc = CAB.rally.scoop, st = CAB.rally.body, yc = z => { for (let i = 0; i < st.length - 1; i++) if (z <= st[i][0] && z >= st[i + 1][0]) return st[i + 1][4] + (st[i][4] - st[i + 1][4]) * (z - st[i + 1][0]) / (st[i][0] - st[i + 1][0]); };
  assert.ok(sc.y1 - yc(sc.z1) >= 0.1, `前緣高 ${sc.y1 - yc(sc.z1)}`);
});
