// 第三條賽道「白狼峠」與每條賽道各自的路寬（TRACKS[id].hw，預設 HW = 5.2）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const geo = () => new Function(`${block('course-geometry')}\nreturn { TRACKS, buildCourse, DS, HW, bestKey };`)();
const hk = () => { const g = geo(); return { g, c: g.buildCourse('hakuro') }; };
const SCALE = 4; // 公尺 / 像素

test('hakuro 1: 全長 4,000–8,000 m', () => {
  const { c } = hk();
  assert.ok(c.TOTAL >= 4000 && c.TOTAL <= 8000, `TOTAL=${c.TOTAL}`);
});

test('hakuro 2: 起點的下一段在原圖上朝「往上」，且世界座標未鏡像', () => {
  const { g, c } = hk(), wp = g.TRACKS.hakuro.waypoints;
  assert.ok(wp[4][1] - wp[0][1] < 0, '路點前幾點應往上（圖片 y 變小）');
  const a = c.pts[0], b = c.pts[20];
  assert.ok(-(b.z - a.z) / SCALE < 0, '中心線方向與圖上不一致');
  assert.ok(Math.sin(c.pts[10].h) * (b.x - a.x) + Math.cos(c.pts[10].h) * (b.z - a.z) > 0);
  // 終點在起點的右上（圖片座標 dx > 0, dy < 0）；世界座標 x = -px*SCALE, z = -py*SCALE
  const e = c.pts[c.N - 1];
  assert.ok(-(e.x - a.x) / SCALE > 200 && -(e.z - a.z) / SCALE < -150, '終點應在起點右上');
});

test('hakuro 3: 沿路相隔 > 60 m 的點，中心線距離 ≥ 2*hw + 8 m（路段不重疊）', () => {
  const { c } = hk(), need = 2 * c.hw + 8;
  let min = Infinity;
  for (let i = 0; i < c.N; i++) for (let j = i + 1; j < c.N; j++) {
    if (c.pts[j].s - c.pts[i].s <= 60) continue;
    const d = Math.hypot(c.pts[i].x - c.pts[j].x, c.pts[i].z - c.pts[j].z);
    if (d < min) min = d;
  }
  assert.ok(min >= need, `最小間距 ${min.toFixed(2)} < ${need}`);
});

test('hakuro 4: 平滑後最小彎道半徑（1/|ks|）> 2*hw', () => {
  const { c } = hk();
  const minR = Math.min(...c.pts.map(p => 1 / Math.max(Math.abs(p.ks), 1e-9)));
  assert.ok(minR > 2 * c.hw, `minR=${minR.toFixed(2)}`);
});

test('hakuro 5: 相鄰點間距約 DS（±0.05），h 相鄰差 < DS/hw（內側邊不摺疊），s 遞增', () => {
  const { g, c } = hk();
  let maxDev = 0, maxDh = 0;
  for (let i = 1; i < c.N; i++) {
    const a = c.pts[i - 1], b = c.pts[i];
    maxDev = Math.max(maxDev, Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - g.DS));
    maxDh = Math.max(maxDh, Math.abs(Math.atan2(Math.sin(b.h - a.h), Math.cos(b.h - a.h))));
  }
  assert.ok(maxDev <= 0.05, `間距偏差 ${maxDev}`);
  assert.ok(maxDh < g.DS / c.hw, `h 跳變 ${maxDh}`);
  assert.ok(c.pts.every((p, i) => i === 0 || p.s > c.pts[i - 1].s));
});

test('路寬: 黑鷺山與青嵐峠仍是 5.2，白狼峠是 6.2；buildCourse 帶出 hw', () => {
  const g = geo();
  assert.equal(g.HW, 5.2);
  assert.equal(g.buildCourse('kurosagi').hw, 5.2);
  assert.equal(g.buildCourse('seiran').hw, 5.2);
  assert.equal(g.buildCourse('hakuro').hw, 6.2);
});

test('個人最佳 key: 白狼峠是 yatouge-best-hakuro', () => {
  assert.equal(geo().bestKey('hakuro'), 'yatouge-best-hakuro');
});

test('對手: 白狼峠固定是黑色 GT-32，與我方選哪台車無關', () => {
  const { CARS, rivalFor } = new Function(`${block('cars')}\nreturn { CARS, rivalFor };`)();
  for (const mine of Object.keys(CARS)) {
    const r = rivalFor('hakuro', mine);
    assert.equal(r.car, 'gtr');
    assert.equal(CARS.gtr.colors[r.color].n.en, 'Black');
  }
});

test('PvP: 白狼峠在白名單，白狼峠的狀態通過驗證', () => {
  const { NET, validatePeerState } = new Function(`${block('netcode')}\nreturn { NET, validatePeerState };`)();
  assert.ok(NET.TRACKS.includes('hakuro'));
  assert.ok(validatePeerState({ v: 1, st: 'waiting', car: 'gtr', col: 1, trk: 'hakuro' }, null));
});

test('水溝純函式: 路寬由參數傳入（預設 HW 時行為不變）', () => {
  const g = new Function(`${block('course-geometry')}\n${block('gutter')}\nreturn { HW, gutterGrip, gutterCooldown };`)();
  const sec = { s0: 100, s1: 200, side: 1 }, h = 0.7, c = { h, vx: Math.sin(h) * 18, vz: Math.cos(h) * 18 };
  const lat = 6.2 - 1.275;                                      // 在寬 6.2 的路上正好是水溝帶中央
  assert.equal(g.gutterGrip([sec], c, { s: 150, h, lat }), null, '預設 5.2 時此 lat 已超出夾限');
  assert.equal(g.gutterGrip([sec], c, { s: 150, h, lat }, 6.2), sec);
  assert.equal(g.gutterCooldown(0.5, 6.2 - 1.6 - 0.01, 1 / 60, 6.2), 0);
});

test('執行期: 區塊外不得再直接用 HW 當路寬（只有 roadHW 的初始化可以）', () => {
  const rest = html.replace(/\/\* @([\w-]+):start \*\/[\s\S]*?\/\* @\1:end \*\//g, '');
  const bad = rest.split('\n').filter(l => /\bHW\b/.test(l) && !/^let roadHW = HW\b/.test(l.trim()));
  assert.deepEqual(bad, []);
});

/* ---------- 0 個髮夾彎時不顯示髮夾彎數；lead 不再提髮夾彎 ---------- */
const i18n = () => {
  const m = html.match(/const I18N = \{[\s\S]*?\n\};\n/);
  assert.ok(m, '找不到 I18N');
  return new Function(`${m[0]}\nreturn I18N;`)();
};

test('i18n: n = 0 時 course / trackSub 只顯示長度；n >= 1 維持原文', () => {
  const I = i18n();
  assert.equal(I.zh.course('白狼峠', '4.7', 0), '白狼峠 · 下坡 4.7 km');
  assert.equal(I.zh.trackSub('4.7', 0), '4.7 km');
  assert.equal(I.en.course('Hakuro Pass', '4.7', 0), 'Hakuro Pass · Downhill 4.7 km');
  assert.equal(I.en.trackSub('4.7', 0), '4.7 km');
  assert.equal(I.zh.course('青嵐峠', '5.1', 9), '青嵐峠 · 下坡 5.1 km · 9 個髮夾彎');
  assert.equal(I.zh.trackSub('2.4', 6), '2.4 km · 6 個髮夾彎');
  assert.equal(I.en.course('Seiran Pass', '5.1', 9), 'Seiran Pass · Downhill 5.1 km · 9 hairpins');
  assert.equal(I.en.trackSub('2.4', 6), '2.4 km · 6 hairpins');
});

test('i18n: lead 改說彎道，不提髮夾彎', () => {
  const I = i18n();
  assert.ok(I.zh.lead('白狼峠').includes('在彎道甩尾超車') && !I.zh.lead('白狼峠').includes('髮夾彎'));
  assert.ok(I.en.lead('Hakuro Pass').includes('drift past it in the corners') && !I.en.lead('Hakuro Pass').includes('hairpin'));
  assert.ok(html.includes('data-i18n="lead">凌晨兩點的黑鷺山，路上只剩你和前面那台對手車。跟緊它，在彎道甩尾超車'));
});
