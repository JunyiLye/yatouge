// 抽出 yatouge.html 內 @course-geometry 與 @gutter 區塊（純函式，不依賴 THREE / DOM）後在 Node 執行
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
const NAMES = ['buildCourse', 'HW', 'DS', 'wrap', 'GUTTER', 'gutterSections', 'gutterGrip', 'gutterStep', 'gutterToll', 'gutterSpend', 'gutterApply', 'gutterEntryLat', 'gutterRelease', 'gutterCooldown', 'gutterStay', 'gutterTick'];

function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
function load() {
  const exp = NAMES.map(n => `${n}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(', ');
  return new Function(`${block('course-geometry')}\n${block('gutter')}\nreturn { ${exp} };`)();
}
const seiran = () => { const g = load(), c = g.buildCourse('seiran'); return { g, c, secs: g.gutterSections('seiran', c.pts) }; };

/* ---------- 任務 1：水溝區段 ---------- */
// 使用者確認的 4 個彎（約略範圍）；side：+1 = 內側在右（右彎），-1 = 內側在左（左彎），與 locate() 的 lat 正負一致
const BENDS = [
  { a: 3567, b: 3615, side: +1 },
  { a: 3618, b: 3669, side: -1 },
  { a: 3777, b: 3832, side: +1 },
  { a: 3844, b: 3897, side: -1 }
];

test('任務1: 青嵐峠剛好 4 段水溝，且依序涵蓋指定的 4 個彎', () => {
  const { secs } = seiran();
  assert.equal(secs.length, 4);
  secs.forEach((sec, n) => {
    assert.ok(sec.s0 <= BENDS[n].a + 5 && sec.s1 >= BENDS[n].b - 5, `第 ${n + 1} 段 ${sec.s0.toFixed(0)}–${sec.s1.toFixed(0)} 未涵蓋 ${BENDS[n].a}–${BENDS[n].b}`);
    assert.ok(sec.s0 > BENDS[n].a - 25 && sec.s1 < BENDS[n].b + 25, `第 ${n + 1} 段延伸過頭`);
  });
});

test('任務1: side 與彎的轉向一致（用路點航向變化獨立驗證）', () => {
  const { c, secs } = seiran();
  secs.forEach((sec, n) => {
    const inside = c.pts.filter(p => p.s >= BENDS[n].a && p.s <= BENDS[n].b);
    let turn = 0;
    for (let i = 1; i < inside.length; i++) turn += (() => { let d = inside[i].h - inside[i - 1].h; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; })();
    // h 增加 = 左轉；左彎內側在左 = lat 為負
    const expected = turn > 0 ? -1 : +1;
    assert.equal(expected, BENDS[n].side, `第 ${n + 1} 個彎的測試資料與幾何不符`);
    assert.equal(sec.side, expected, `第 ${n + 1} 段 side`);
  });
});

test('任務1: 第 1 個彎（約 3478–3519 m）與黑鷺山都沒有水溝', () => {
  const { g, c, secs } = seiran();
  assert.ok(secs.every(sec => sec.s0 > 3519), '第 1 個彎不該有水溝');
  assert.deepEqual(g.gutterSections('kurosagi', g.buildCourse('kurosagi').pts), []);
});

/* ---------- 任務 2：判定與卡水溝物理 ---------- */
const LAT_MID = (g) => g.HW - 1.275;
const car = (h, spd, extra) => ({ h, vx: Math.sin(h) * spd, vz: Math.cos(h) * spd, ...extra });
const SEC = { s0: 100, s1: 200, side: +1 };

test('任務2: 水溝帶內 18 m/s 判定為卡住；一步後速度方向等於道路切線，速度損失 < 1%', () => {
  const g = load(), dt = 1 / 60, L = { s: 150, h: 0.7, lat: LAT_MID(g) };
  const c = car(0.7, 18);
  assert.equal(g.gutterGrip([SEC], c, L), SEC);
  const r = g.gutterStep(c, L, 0, 0, dt);
  assert.ok(Math.abs(Math.atan2(r.vx, r.vz) - 0.7) < 1e-9, `方向 ${Math.atan2(r.vx, r.vz)}`);
  const loss = 1 - Math.hypot(r.vx, r.vz) / 18;
  assert.ok(loss > 0 && loss < 0.01, `loss=${loss}`);
});

test('任務2: 速度 30 m/s、倒車、路中央、車頭偏 60°、外側、區段外、過慢：都不卡', () => {
  const g = load(), mid = LAT_MID(g), ok = { s: 150, h: 0.7, lat: mid };
  assert.equal(g.gutterGrip([SEC], car(0.7, 30), ok), null, '超速');
  assert.equal(g.gutterGrip([SEC], car(0.7, -18), ok), null, '倒車');
  assert.equal(g.gutterGrip([SEC], car(0.7, 18), { ...ok, lat: 0 }), null, '路中央');
  assert.equal(g.gutterGrip([SEC], car(0.7 + Math.PI / 3, 18), ok), null, '車頭偏 60°');
  assert.equal(g.gutterGrip([SEC], car(0.7, 18), { ...ok, lat: -mid }), null, '外側');
  assert.equal(g.gutterGrip([SEC], car(0.7, 18), { ...ok, s: 250 }), null, '區段外');
  assert.equal(g.gutterGrip([SEC], car(0.7, 5), ok), null, '太慢');
  assert.ok(g.gutterGrip([SEC], car(0.7, 18), ok), '對照組應該卡住');
});

// 與遊戲 locate() 相同的投影與 lat 符號（右為正）
function locate(pts, o) {
  let best = o.idx, bd = Infinity;
  for (let i = Math.max(0, o.idx - 22), b = Math.min(pts.length - 1, o.idx + 22); i <= b; i++) {
    const p = pts[i], d = (o.x - p.x) ** 2 + (o.z - p.z) ** 2; if (d < bd) { bd = d; best = i; }
  }
  o.idx = best;
  let i = Math.min(best, pts.length - 2), p = pts[i], q = pts[i + 1];
  let sx = q.x - p.x, sz = q.z - p.z, L2 = sx * sx + sz * sz, t = ((o.x - p.x) * sx + (o.z - p.z) * sz) / L2;
  if (t < 0 && i > 0) { i--; p = pts[i]; q = pts[i + 1]; sx = q.x - p.x; sz = q.z - p.z; L2 = sx * sx + sz * sz; t = ((o.x - p.x) * sx + (o.z - p.z) * sz) / L2; }
  t = Math.min(1, Math.max(0, t));
  const cx = p.x + sx * t, cz = p.z + sz * t, h = p.h + (q.h - p.h) * t;
  return { i, h, lat: (o.x - cx) * -Math.cos(h) + (o.z - cz) * Math.sin(h), s: p.s + (q.s - p.s) * t };
}

for (const n of [0, 1, 2, 3]) {
  test(`任務2: 第 ${n + 2} 個髮夾彎以 18 m/s 進入，固定步長全程卡水溝、不碰牆、出彎速度 ≥ 85%`, () => {
    const { g, c, secs } = seiran(), sec = secs[n], dt = 1 / 120, limit = g.HW - 0.95;
    const i0 = c.pts.findIndex(p => p.s >= sec.s0 + g.GUTTER.RAMP + 0.1), p0 = c.pts[i0];
    const lat0 = sec.side * LAT_MID(g);
    const st = { x: p0.x - Math.cos(p0.h) * lat0, z: p0.z + Math.sin(p0.h) * lat0, h: p0.h, vx: Math.sin(p0.h) * 18, vz: Math.cos(p0.h) * 18, idx: i0 };
    let L = locate(c.pts, st), steps = 0, maxLat = 0, maxDev = 0, latT = g.gutterEntryLat(sec, L.lat);
    Object.assign(st, { gutSide: 0, gutT: 0, gutLat: 0, gutCool: 0, steer: 0 });
    while (L.s < sec.s1 - g.GUTTER.RAMP && steps < 5000) {
      const hold = g.gutterGrip([sec], st, L);
      assert.ok(hold, `step ${steps} s=${L.s.toFixed(1)} lat=${L.lat.toFixed(2)} 脫離水溝`);
      const tk = g.gutterTick(st, hold, null, L, dt);   // 與遊戲相同：先更新卡住狀態，再依 gutLat 前進
      Object.assign(st, { gutSide: tk.gutSide, gutT: tk.gutT, gutLat: tk.gutLat, gutCool: tk.gutCool });
      Object.assign(st, g.gutterStep(st, L, c.pts[L.i].ks, 0, dt, st.gutLat));
      st.x += st.vx * dt; st.z += st.vz * dt;
      L = locate(c.pts, st); steps++;
      maxLat = Math.max(maxLat, Math.abs(L.lat)); maxDev = Math.max(maxDev, Math.abs(L.lat - latT));
    }
    assert.ok(steps < 5000, '沒有跑出區段');
    assert.ok(maxLat <= limit, `碰牆 maxLat=${maxLat}`);
    assert.ok(maxDev <= 0.05, `橫向位置與進入時相差 ${maxDev}`);
    assert.ok(Math.hypot(st.vx, st.vz) >= 18 * 0.85, `出彎速度 ${Math.hypot(st.vx, st.vz)}`);
  });
}

/* ---------- 任務 3：卡水溝要付甩尾分數 ---------- */
const S1 = { s0: 100, s1: 200, side: +1 }, S2 = { s0: 300, s1: 400, side: -1 };
const SECS = [S1, S2];
const fresh = () => ({ paid: [], warned: [] });

test('任務3: 分數 ≥ 1,000 可卡、扣 1,000；同區段再次卡回不再扣', () => {
  const g = load();
  assert.equal(g.GUTTER.COST, 1000);
  const a = g.gutterToll(SECS, 150, fresh(), S1, 1000);
  assert.equal(a.hook, true); assert.equal(a.cost, 1000); assert.equal(a.warn, false);
  const b = g.gutterToll(SECS, 160, a.st, S1, 0);   // 被彈出後同區段再卡回：不再扣，即使分數已是 0
  assert.equal(b.hook, true); assert.equal(b.cost, 0);
});

test('任務3: 分數 999 不卡、不扣分，提示只跳一次', () => {
  const g = load();
  const a = g.gutterToll(SECS, 150, fresh(), S1, 999);
  assert.equal(a.hook, false); assert.equal(a.cost, 0); assert.equal(a.warn, true);
  const b = g.gutterToll(SECS, 155, a.st, S1, 999);
  assert.equal(b.hook, false); assert.equal(b.cost, 0); assert.equal(b.warn, false, '同一趟不重複提示');
});

test('任務3: 連段分數可以補足不夠的部分（呼叫端以 driftTotal + driftChain 傳入）', () => {
  const g = load(), driftTotal = 700, driftChain = 300;
  const r = g.gutterToll(SECS, 150, fresh(), S1, driftTotal + driftChain);
  assert.equal(r.hook, true); assert.equal(r.cost, 1000);
  assert.equal(g.gutterToll(SECS, 150, fresh(), S1, 700 + 299).hook, false);
});

test('任務3: 離開區段範圍再進入，重新扣分；沒有 grip 時不扣不提示', () => {
  const g = load();
  const a = g.gutterToll(SECS, 150, fresh(), S1, 5000);
  assert.equal(a.cost, 1000);
  const away = g.gutterToll(SECS, 250, a.st, null, 5000);   // 已離開 S1 範圍
  assert.deepEqual([away.hook, away.cost, away.warn], [false, 0, false]);
  const again = g.gutterToll(SECS, 150, away.st, S1, 5000);
  assert.equal(again.hook, true); assert.equal(again.cost, 1000, '下一趟重新計費');
  // 不足而被提示過，離開再回來也會重新提示
  const w = g.gutterToll(SECS, 150, fresh(), S1, 10);
  const w2 = g.gutterToll(SECS, 250, w.st, null, 10);
  assert.equal(g.gutterToll(SECS, 150, w2.st, S1, 10).warn, true);
});

test('任務3: 付費只對該區段有效，另一段要另外扣', () => {
  const g = load();
  const a = g.gutterToll(SECS, 150, fresh(), S1, 5000);
  const b = g.gutterToll(SECS, 350, a.st, S2, 4000);
  assert.equal(b.cost, 1000);
});

test('任務3: 扣分不會讓分數低於零', () => {
  const g = load();
  assert.equal(g.gutterSpend(1000, 1000), 0);
  assert.equal(g.gutterSpend(1500, 1000), 500);
  assert.equal(g.gutterSpend(200, 1000), 0);
});

/* ---------- 回歸：貼著護欄刮行不可以卡水溝、扣分或提示 ---------- */
test('回歸: 第 2、3 個彎區段重疊處，貼著第 2 彎外側護欄刮行（lat 在牆限）不卡、不扣分、不提示', () => {
  const { g, c, secs } = seiran();
  const bendTwo = secs[0], bendThree = secs[1];
  assert.equal(bendTwo.side, +1); assert.equal(bendThree.side, -1);
  const s = (bendThree.s0 + bendTwo.s1) / 2;                       // 兩段重疊處
  assert.ok(s >= bendThree.s0 && s <= bendTwo.s1, '測試位置要在重疊範圍內');
  const limit = g.HW - 0.95;                                        // 護欄夾限，第 2 彎外側 = 第 3 彎內側（lat 為負）
  const h = c.pts.find(p => p.s >= s).h;
  for (const lat of [-limit, -(limit - 1e-6), -(limit - 0.01), -(limit - 0.03)]) {
    const car = { h, vx: Math.sin(h) * 14.3, vz: Math.cos(h) * 14.3, gutSide: 0 };
    const L = { s, h, lat };
    assert.equal(g.gutterGrip(secs, car, L), null, `lat=${lat} 不該卡`);
    for (const pts of [1500, 999]) {
      const t = g.gutterToll(secs, s, { paid: [], warned: [] }, g.gutterGrip(secs, car, L), pts);
      assert.deepEqual([t.hook, t.cost, t.warn], [false, 0, false], `lat=${lat} points=${pts}`);
    }
  }
});

test('回歸: 真正進入水溝（lat 3.9–4.2）仍然會卡，且迴圈中的 lat 偏移不會中途脫鉤', () => {
  const { g, secs } = seiran(), sec = secs[1], h = 1.2, s = (sec.s0 + sec.s1) / 2;
  for (const a of [3.9, 4.0, 4.1, 4.19]) {
    const car = { h, vx: Math.sin(h) * 18, vz: Math.cos(h) * 18, gutSide: 0 };
    assert.equal(g.gutterGrip(secs, car, { s, h, lat: sec.side * a }), sec, `lat=${a}`);
  }
});

/* ---------- 使用者決定：遲滯、淡出端、帳務、整數、文案 ---------- */
test('遲滯: 已卡住（gutSide 與區段相同）時可停留到護欄夾限；未卡住者 4.22 不會卡', () => {
  const { g, secs } = seiran(), sec = secs[1], h = 1.2, s = (sec.s0 + sec.s1) / 2, lat = sec.side * 4.22;
  const car = gs => ({ h, vx: Math.sin(h) * 18, vz: Math.cos(h) * 18, gutSide: gs });
  assert.equal(g.gutterGrip(secs, car(sec.side), { s, h, lat }), sec, '已卡住者 4.22 維持');
  assert.equal(g.gutterGrip(secs, car(sec.side), { s, h, lat: sec.side * (g.HW - 0.95) }), sec, '夾限處維持');
  assert.equal(g.gutterGrip(secs, car(0), { s, h, lat }), null, '未卡住者 4.22 不卡');
  assert.equal(g.gutterGrip(secs, car(-sec.side), { s, h, lat }), null, '另一側的 gutSide 不算');
});

test('淡出端: 區段兩端各 RAMP 公尺不卡、不扣、不提示；完整溝槽處才卡', () => {
  const { g } = seiran(), R = g.GUTTER.RAMP, h = 0.7, lat = g.HW - 1.275;
  assert.equal(R, 3);
  const car = { h, vx: Math.sin(h) * 18, vz: Math.cos(h) * 18, gutSide: 0 };
  const at = s => g.gutterGrip([SEC], car, { s, h, lat });
  assert.equal(at(SEC.s0 + 1), null); assert.equal(at(SEC.s1 - 1), null);
  assert.equal(at(SEC.s0 + 4), SEC); assert.equal(at(SEC.s1 - 4), SEC);
  const t = g.gutterToll([SEC], SEC.s0 + 1, fresh(), at(SEC.s0 + 1), 10);
  assert.deepEqual([t.hook, t.cost, t.warn], [false, 0, false]);
  assert.equal(g.gutterToll([SEC], SEC.s0 + 4, fresh(), at(SEC.s0 + 4), 10).warn, true);
});

test('帳務: 連段 400 + 已入帳 700 → 卡住、入帳 100、連段歸零', () => {
  const g = load();
  const r = g.gutterApply({ driftTotal: 700, driftChain: 400, toll: fresh(), grip: S1, secs: SECS, s: 150 });
  assert.equal(r.hook, true); assert.equal(r.driftTotal, 100); assert.equal(r.driftChain, 0);
  assert.deepEqual(r.popup, { kind: 'hook', cost: 1000 }); assert.deepEqual(r.toll.paid, [S1]);
});

test('帳務: 分數不足時不入帳連段、不扣分，只出不足提示', () => {
  const g = load();
  const r = g.gutterApply({ driftTotal: 700, driftChain: 299, toll: fresh(), grip: S1, secs: SECS, s: 150 });
  assert.equal(r.hook, false); assert.equal(r.driftTotal, 700); assert.equal(r.driftChain, 299);
  assert.deepEqual(r.popup, { kind: 'low' });
  const again = g.gutterApply({ driftTotal: 700, driftChain: 299, toll: r.toll, grip: S1, secs: SECS, s: 151 });
  assert.equal(again.popup, null, '同一趟不重複提示');
});

test('帳務: 剛好 1,000 扣到 0；已付費的同區段再卡不動帳；沒有 grip 不動帳', () => {
  const g = load();
  const r = g.gutterApply({ driftTotal: 1000, driftChain: 0, toll: fresh(), grip: S1, secs: SECS, s: 150 });
  assert.equal(r.driftTotal, 0);
  const free = g.gutterApply({ driftTotal: 0, driftChain: 50, toll: r.toll, grip: S1, secs: SECS, s: 155 });
  assert.deepEqual([free.hook, free.driftTotal, free.driftChain, free.popup], [true, 0, 50, null]);
  const none = g.gutterApply({ driftTotal: 5000, driftChain: 70, toll: fresh(), grip: null, secs: SECS, s: 250 });
  assert.deepEqual([none.hook, none.driftTotal, none.driftChain, none.popup], [false, 5000, 70, null]);
});

test('整數: 連段是小數時，扣分後 driftTotal 仍為整數', () => {
  const g = load();
  const r = g.gutterApply({ driftTotal: 700.4, driftChain: 400.3, toll: fresh(), grip: S1, secs: SECS, s: 150 });
  assert.ok(Number.isInteger(r.driftTotal), String(r.driftTotal)); assert.equal(r.driftTotal, 101);
  assert.ok(Number.isInteger(g.gutterSpend(1500.5, 1000)));
});

test('文案: zh 與 en 都有 gutter / gutterLow / gutterNeed，且非空', () => {
  for (const key of ['gutter', 'gutterLow', 'gutterNeed']) {
    const vals = [...html.matchAll(new RegExp('\\b' + key + ": '([^']*)'", 'g'))].map(m => m[1]);
    assert.equal(vals.length, 2, `${key} 應該在 zh 與 en 各出現一次`);
    vals.forEach(v => assert.ok(v.trim().length > 0, `${key} 為空`));
    assert.ok(/[一-鿿]/.test(vals[0]) && /[A-Za-z]/.test(vals[1]), `${key} 語言順序`);
  }
});

/* ---------- 撞牆處罰期間不卡；已卡住時速度與角度也要遲滯 ---------- */
test('撞牆處罰中（blocked）: 1,500 分不卡、不扣、不提示；999 分不提示', () => {
  const g = load();
  for (const points of [1500, 999]) {
    const r = g.gutterApply({ driftTotal: points, driftChain: 0, toll: fresh(), grip: S1, secs: SECS, s: 150, blocked: true });
    assert.deepEqual([r.hook, r.driftTotal, r.driftChain, r.popup], [false, points, 0, null], `points=${points}`);
    assert.deepEqual(r.toll, fresh(), '不留下已付費或已警告的標記');
  }
});

test('沒有 blocked 時行為不變', () => {
  const g = load();
  const hook = g.gutterApply({ driftTotal: 1500, driftChain: 0, toll: fresh(), grip: S1, secs: SECS, s: 150, blocked: false });
  assert.deepEqual([hook.hook, hook.driftTotal, hook.popup], [true, 500, { kind: 'hook', cost: 1000 }]);
  assert.equal(g.gutterApply({ driftTotal: 999, driftChain: 0, toll: fresh(), grip: S1, secs: SECS, s: 150 }).popup.kind, 'low');
});

test('卡住後不因速度或角度門檻脫出（只有倒車、超速、打方向、到區段尾才會）；未卡住者不會卡', () => {
  const g = load(), h = 0.7, lat = g.HW - 1.275, L = { s: 150, h, lat }, G = g.GUTTER;
  const car = (spd, dh, gs) => ({ h: h + dh, vx: Math.sin(h + dh) * spd, vz: Math.cos(h + dh) * spd, gutSide: gs });
  for (const [spd, dh, what] of [[G.MIN_V - 2, 0, '速度略低'], [18, G.MAX_ANGLE + 0.15, '角度略大'], [G.MIN_V - 4, 0, '速度慢很多'], [18, 1.2, '角度大很多']]) {
    assert.equal(g.gutterGrip([SEC], car(spd, dh, SEC.side), L), SEC, `已卡住 ${what}`);
    assert.equal(g.gutterGrip([SEC], car(spd, dh, 0), L), null, `未卡住 ${what}`);
  }
  assert.equal(g.gutterGrip([SEC], car(-5, 0, SEC.side), L), null, '倒車一定脫鉤');
});

/* ---------- 護欄接觸後 1 秒內不卡 ---------- */
test('護欄接觸 0.5 秒前（railAgo）: 1,500 / 999 分都不卡、不扣、不提示', () => {
  const g = load();
  assert.equal(g.GUTTER.RAIL_COOLDOWN, 1);
  for (const points of [1500, 999]) {
    const r = g.gutterApply({ driftTotal: points, driftChain: 0, toll: fresh(), grip: S1, secs: SECS, s: 150, railAgo: 0.5 });
    assert.deepEqual([r.hook, r.driftTotal, r.driftChain, r.popup], [false, points, 0, null], `points=${points}`);
    assert.deepEqual(r.toll, fresh());
  }
});

test('護欄接觸 1.1 秒前（railAgo）與從未接觸: 行為正常', () => {
  const g = load();
  for (const railAgo of [1.1, Infinity, undefined]) {
    const r = g.gutterApply({ driftTotal: 1500, driftChain: 0, toll: fresh(), grip: S1, secs: SECS, s: 150, railAgo });
    assert.deepEqual([r.hook, r.driftTotal, r.popup], [true, 500, { kind: 'hook', cost: 1000 }], `railAgo=${railAgo}`);
    assert.equal(g.gutterApply({ driftTotal: 999, driftChain: 0, toll: fresh(), grip: S1, secs: SECS, s: 150, railAgo }).popup.kind, 'low');
  }
});

/* ---------- 手感：固定橫向位置、超速彈出、1 秒後打方向脫出、脫出冷卻 ---------- */
const FL = { s: 150, h: 0.7 };
const hooked = (extra, spd = 18) => ({ h: 0.7, vx: Math.sin(0.7) * spd, vz: Math.cos(0.7) * spd, gutSide: SEC.side, gutT: 0.5, steer: 0, gutCool: 0, ...extra });

test('手感(a): 進入橫向位置限制在 3.7–4.1（保留側別）', () => {
  const g = load();
  assert.equal(g.gutterEntryLat(SEC, 3.9), 3.9);
  assert.equal(g.gutterEntryLat(SEC, 4.19), 4.1);
  assert.equal(g.gutterEntryLat(SEC, 3.62), 3.7);
  assert.equal(g.gutterEntryLat({ ...SEC, side: -1 }, -4.19), -4.1);
});

test('手感(a2): 一步內橫向偏差會被拉回目標位置，且沒有偏差時速度方向仍等於切線', () => {
  const g = load(), L = { ...FL, lat: 4.0 }, c = hooked();
  const r = g.gutterStep(c, L, 0, 0, 1 / 60, 3.9);   // 目標在內側（較小的 lat）
  const right = [-Math.cos(0.7), Math.sin(0.7)], vl = r.vx * right[0] + r.vz * right[1];
  assert.ok(vl < -0.1, `應往目標拉回 vl=${vl}`);
  const on = g.gutterStep(c, { ...FL, lat: 3.9 }, 0, 0, 1 / 60, 3.9);
  assert.ok(Math.abs(Math.atan2(on.vx, on.vz) - 0.7) < 1e-9);
});

test('手感(b): 卡住 0.5 秒按左、按右：仍然卡住', () => {
  const g = load(), L = { ...FL, lat: 3.9 };
  for (const steer of [-1, 1, 0.31, -0.31]) assert.equal(g.gutterGrip([SEC], hooked({ gutT: 0.5, steer }), L), SEC, `steer=${steer}`);
});

test('手感(c): 卡住 1.1 秒按左、按右：一步內脫出，並有往路面方向的橫向速度；|steer| ≤ 0.3 不脫出', () => {
  const g = load(), L = { ...FL, lat: 3.9 }, G = g.GUTTER;
  assert.equal(G.HOLD_T, 1); assert.equal(G.STEER_EXIT, 0.3); assert.equal(G.PUSH, 2.5);
  for (const steer of [-1, 1]) {
    const c = hooked({ gutT: 1.1, steer });
    assert.equal(g.gutterGrip([SEC], c, L), null, `steer=${steer}`);
    const r = g.gutterRelease(c, L), right = [-Math.cos(0.7), Math.sin(0.7)];
    const dx = r.vx - c.vx, dz = r.vz - c.vz, lateral = dx * right[0] + dz * right[1];
    assert.ok(Math.abs(lateral + 2.5) < 1e-9, `往路面（lat 變小）2.5 m/s，實得 ${lateral}`);   // 內側在右（lat>0）→ 路面方向 = lat 減小
    assert.equal(r.cool, 0.6);
  }
  assert.equal(g.gutterGrip([SEC], hooked({ gutT: 1.1, steer: 0.3 }), L), SEC, '|steer| = 0.3 不脫出');
  const left = g.gutterRelease(hooked({ gutSide: -1 }), { ...FL, lat: -3.9 }), c2 = hooked({ gutSide: -1 });
  assert.ok(((left.vx - c2.vx) * -Math.cos(0.7) + (left.vz - c2.vz) * Math.sin(0.7)) > 2.49, '內側在左時往 lat 增加方向');
});

test('手感(d): 卡住時速度超過 MAX_V 彈出；gutterStep 不再把速度壓在上限', () => {
  const g = load(), L = { ...FL, lat: 3.9 };
  assert.equal(g.gutterGrip([SEC], hooked({}, 24.5), L), null);
  assert.equal(g.gutterGrip([SEC], hooked({}, 23.9), L), SEC);
  const r = g.gutterStep(hooked({}, 23.99), L, 0, 20, 1 / 60, 3.9);
  assert.ok(Math.hypot(r.vx, r.vz) > 24, `加速不再被壓住 ${Math.hypot(r.vx, r.vz)}`);
});

test('手感(e): 脫出後冷卻 0.3 秒內仍在進入帶不重新卡入；離開進入帶或過 0.6 秒可重新卡入且不扣分', () => {
  const g = load(), L = { ...FL, lat: 3.9 };
  assert.equal(g.gutterGrip([SEC], hooked({ gutSide: 0, gutCool: 0.3 }), L), null, '冷卻中');
  assert.equal(g.gutterGrip([SEC], hooked({ gutSide: 0, gutCool: 0 }), L), SEC, '冷卻結束');
  assert.equal(g.gutterCooldown(0.6, 3.9, 0.3), 0.3);
  assert.ok(g.gutterCooldown(0.05, 3.9, 0.1) === 0, '過 0.6 秒');
  assert.equal(g.gutterCooldown(0.5, g.HW - 1.6 - 0.01, 1 / 60), 0, '離開進入帶即清除');
  const r = g.gutterApply({ driftTotal: 0, driftChain: 0, toll: { paid: [SEC], warned: [] }, grip: SEC, secs: [SEC], s: 150 });
  assert.deepEqual([r.hook, r.driftTotal, r.popup], [true, 0, null], '重新卡入不扣分');
});

/* ---------- gutterTick：每步的卡住狀態；只有「打方向」造成的脫出才有推力與冷卻 ---------- */
const TL = { s: 150, h: 0.7, lat: 3.9 };
const tcar = extra => ({ h: 0.7, vx: Math.sin(0.7) * 18, vz: Math.cos(0.7) * 18, gutSide: 0, gutT: 0, gutLat: 0, gutCool: 0, steer: 0, ...extra });

test('gutterTick: 新卡入時 gutT 歸零、記下進入位置；持續卡住則累計', () => {
  const g = load(), dt = 1 / 60;
  let c = tcar({ gutT: 5 });
  let r = g.gutterTick(c, SEC, null, { ...TL, lat: 4.19 }, dt);
  assert.deepEqual([r.gutSide, r.gutT, r.gutLat, r.thud], [SEC.side, 0, 4.1, true]);
  c = { ...c, gutSide: r.gutSide, gutT: r.gutT, gutLat: r.gutLat };
  for (let i = 0; i < 60; i++) { r = g.gutterTick(c, SEC, null, { ...TL, lat: 4.0 }, dt); c = { ...c, gutT: r.gutT, gutLat: r.gutLat }; assert.equal(r.thud, false); }
  assert.ok(Math.abs(c.gutT - 1) < 1e-9, `gutT=${c.gutT}`);
  assert.equal(c.gutLat, 4.1, '進入位置不被覆蓋');
});

test('gutterTick: 卡住滿 1 秒後打方向脫出 → 推力與冷卻，gutSide 清除', () => {
  const g = load(), dt = 1 / 60, c = tcar({ gutSide: SEC.side, gutT: 1.2, gutLat: 3.9, steer: 0.8 });
  const stay = g.gutterStay([SEC], c, TL, false);
  assert.equal(stay, SEC);
  assert.equal(g.gutterGrip([SEC], c, TL), null, '打方向 → 不再卡住');
  const r = g.gutterTick(c, null, stay, TL, dt);
  assert.equal(r.released, true); assert.equal(r.gutSide, 0); assert.equal(r.gutCool, 0.6);
  const right = [-Math.cos(0.7), Math.sin(0.7)];
  assert.ok(Math.abs(((r.vx - c.vx) * right[0] + (r.vz - c.vz) * right[1]) + 2.5) < 1e-9);
  const next = g.gutterTick({ ...c, gutSide: r.gutSide, gutCool: r.gutCool, vx: r.vx, vz: r.vz }, null, null, TL, dt);
  assert.ok(Math.abs(next.gutCool - (0.6 - dt)) < 1e-9, '冷卻繼續倒數');
  assert.equal(next.released, false);
});

test('gutterTick: 未滿 1 秒打方向不脫出（仍然卡住）', () => {
  const g = load(), c = tcar({ gutSide: SEC.side, gutT: 0.5, gutLat: 3.9, steer: 1 });
  assert.equal(g.gutterGrip([SEC], c, TL), SEC);
});

test('CR2: 區段尾、超過 24 m/s、倒車、撞牆處罰（含護欄 1 秒）造成的脫出，即使打方向也沒有推力與冷卻', () => {
  const g = load(), dt = 1 / 60;
  const base = { gutSide: SEC.side, gutT: 2, gutLat: 3.9, steer: 1 };
  const cases = [
    ['區段尾 s1-3 之外', tcar(base), { ...TL, s: SEC.s1 - 2 }, false],
    ['超速 24.5', tcar({ ...base, vx: Math.sin(0.7) * 24.5, vz: Math.cos(0.7) * 24.5 }), TL, false],
    ['倒車', tcar({ ...base, vx: -Math.sin(0.7) * 5, vz: -Math.cos(0.7) * 5 }), TL, false],
    ['撞牆處罰', tcar(base), TL, true]
  ];
  for (const [what, c, L, blocked] of cases) {
    const stay = g.gutterStay([SEC], c, L, blocked);
    assert.equal(stay, null, what);
    const r = g.gutterTick(c, null, stay, L, dt);
    assert.equal(r.released, false, what); assert.equal(r.gutCool, 0, what);
    assert.equal(r.vx, c.vx, what); assert.equal(r.vz, c.vz, what);
    assert.equal(r.gutSide, 0, what + '：gutSide 仍要清除');
  }
});
