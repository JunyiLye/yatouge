// 抽出 yatouge.html 內 @course-geometry 區塊（純幾何，不依賴 THREE / DOM）後在 Node 執行
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
const NAMES = ['TRACKS', 'buildCourse', 'DS', 'HW', 'courseBounds', 'ridgeDistance', 'bestKey'];

function loadGeometry() {
  const m = html.match(/\/\* @course-geometry:start \*\/([\s\S]*?)\/\* @course-geometry:end \*\//);
  assert.ok(m, '找不到 @course-geometry 區塊');
  const exp = NAMES.map(n => `${n}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(', ');
  return new Function(`${m[1]}\nreturn { ${exp} };`)();
}

/* ---------- 任務 1：測試環境 ---------- */
test('任務1: 可從 yatouge.html 抽出並執行 @course-geometry 區塊', () => {
  const g = loadGeometry();
  assert.equal(typeof g.buildCourse, 'function');
  assert.equal(typeof g.TRACKS, 'object');
});

/* ---------- 任務 2：黑鷺山必須與改動前完全相同 ---------- */
// 基準值由 docs/runs/2026-11-08-add-seiran-track/yatouge.before.html 的原始 plan 程式算出
const KUROSAGI = {
  N: 1653, TOTAL: 2448.406954533597, FINISH_I: 1633, FINISH_S: 2419.906954533597, hairpins: 6,
  first: { x: 0, z: 0, h: 0, s: 0, k: 0, y: 230, ks: 0 },
  last: { x: -701.459056257751, z: 659.0106521391795, h: -1.5707963267948837, s: 2448.406954533597, k: 0, y: 77.17999999805747, ks: 0 },
  sha1: '97dd57ea81fe3b4d84593c6fd5fbcd0bc3285df7'
};

test('任務2: 黑鷺山的點數、長度、首尾點、髮夾彎數與改動前相同', () => {
  const c = loadGeometry().buildCourse('kurosagi');
  assert.equal(c.N, KUROSAGI.N);
  assert.equal(c.pts.length, KUROSAGI.N);
  assert.equal(c.TOTAL, KUROSAGI.TOTAL);
  assert.equal(c.FINISH_I, KUROSAGI.FINISH_I);
  assert.equal(c.FINISH_S, KUROSAGI.FINISH_S);
  assert.equal(c.hairpins, KUROSAGI.hairpins);
  assert.deepEqual(c.pts[0], KUROSAGI.first);
  assert.deepEqual(c.pts[c.N - 1], KUROSAGI.last);
});

test('任務2: 黑鷺山每個點的 x,z,h,s,k,y,ks 逐位元相同（雜湊比對）', () => {
  const c = loadGeometry().buildCourse('kurosagi');
  assert.equal(createHash('sha1').update(JSON.stringify(c.pts)).digest('hex'), KUROSAGI.sha1);
});

/* ---------- 任務 3：青嵐峠 ---------- */
const seiran = () => loadGeometry().buildCourse('seiran');

test('任務3a: 青嵐峠全長 5,000–5,500 m', () => {
  const c = seiran();
  assert.ok(c.TOTAL >= 5000 && c.TOTAL <= 5500, `TOTAL=${c.TOTAL}`);
});

test('任務3b: 起點的下一段在原圖上朝「往上偏右」，且世界座標未鏡像', () => {
  const g = loadGeometry(), c = g.buildCourse('seiran'), wp = g.TRACKS.seiran.waypoints;
  // 路點本身（圖片像素，x 右 y 下）：往上偏右 = dx > 0 且 dy < 0
  assert.ok(wp[4][0] - wp[0][0] > 0 && wp[4][1] - wp[0][1] < 0, '路點前幾點應往上偏右');
  // 由中心線點換回圖片座標（px = -x/3, py = -z/3）必須同方向
  const a = c.pts[0], b = c.pts[20];
  assert.ok(-(b.x - a.x) / 3 > 0 && -(b.z - a.z) / 3 < 0, '中心線方向與圖上不一致（可能鏡像）');
  // h 的前進方向 (sin h, cos h) 與中心線位移同向
  assert.ok(Math.sin(c.pts[10].h) * (b.x - a.x) + Math.cos(c.pts[10].h) * (b.z - a.z) > 0);
});

test('任務3c: 平滑後最小彎道半徑（1/|ks|）≥ 10 m', () => {
  const c = seiran();
  const minR = Math.min(...c.pts.map(p => 1 / Math.max(Math.abs(p.ks), 1e-9)));
  assert.ok(minR >= 10, `minR=${minR.toFixed(2)}`);
});

test('任務3d: 沿路相隔 > 60 m 的點，中心線距離 ≥ 2*HW + 8 m（路段不重疊）', () => {
  const g = loadGeometry(), c = g.buildCourse('seiran'), need = 2 * g.HW + 8;
  let min = Infinity;
  for (let i = 0; i < c.N; i++) for (let j = i + 1; j < c.N; j++) {
    if (c.pts[j].s - c.pts[i].s <= 60) continue;
    const d = Math.hypot(c.pts[i].x - c.pts[j].x, c.pts[i].z - c.pts[j].z);
    if (d < min) min = d;
  }
  assert.ok(min >= need, `最小間距 ${min.toFixed(2)} < ${need}`);
});

test('任務3e: 青嵐峠髮夾彎數 8–14', () => {
  const c = seiran();
  assert.ok(c.hairpins >= 8 && c.hairpins <= 14, `hairpins=${c.hairpins}`);
});

test('任務3f: 相鄰點間距約 DS（±0.05），h 連續（相鄰差 < DS/HW rad，即局部半徑 > HW，路面內側邊不會摺疊）', () => {
  const g = loadGeometry(), c = g.buildCourse('seiran');
  let maxDev = 0, maxDh = 0;
  for (let i = 1; i < c.N; i++) {
    const a = c.pts[i - 1], b = c.pts[i];
    maxDev = Math.max(maxDev, Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - g.DS));
    maxDh = Math.max(maxDh, Math.abs(Math.atan2(Math.sin(b.h - a.h), Math.cos(b.h - a.h))));
  }
  assert.ok(maxDev <= 0.05, `間距偏差 ${maxDev}`);
  assert.ok(maxDh < g.DS / g.HW, `h 跳變 ${maxDh}`);
  assert.ok(c.pts.every((p, i) => i === 0 || p.s > c.pts[i - 1].s), 's 必須遞增');
});

/* ---------- 任務 4：遠山距離（賽道重建用的純函式） ---------- */
for (const id of ['kurosagi', 'seiran']) {
  test(`任務4: ${id} 遠山距離 > 賽道上任一點到中心的距離 + 150 m，且山腳（半徑）不碰到賽道`, () => {
    const g = loadGeometry(), c = g.buildCourse(id), b = g.courseBounds(c.pts);
    const far = Math.max(...c.pts.map(p => Math.hypot(p.x - b.cx, p.z - b.cz)));
    assert.ok(Math.abs(b.radius - far) < 1e-9, '外接半徑應等於最遠點距離');
    assert.equal(b.minY, Math.min(...c.pts.map(p => p.y)));
    for (const coneR of [180, 260, 340]) for (const r01 of [0, 0.5, 1]) {
      const d = g.ridgeDistance(b.radius, coneR, r01);
      assert.ok(d > far + 150, `d=${d}`);
      assert.ok(d - coneR >= far + 100, `山腳最近處 ${d - coneR} 離賽道不足`);
    }
  });
}

/* ---------- 任務 5：各賽道個人最佳的 localStorage key ---------- */
test('任務5: 黑鷺山沿用 yatouge-best，青嵐峠用 yatouge-best-seiran，兩者不同', () => {
  const g = loadGeometry();
  assert.equal(g.bestKey('kurosagi'), 'yatouge-best');
  assert.equal(g.bestKey('seiran'), 'yatouge-best-seiran');
});
