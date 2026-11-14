// 抽出 yatouge.html 內 @interp 區塊（純函式，不依賴 THREE / DOM）後在 Node 執行
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function load() {
  const open = '/* @interp:start */', s = html.indexOf(open), e = html.indexOf('/* @interp:end */');
  assert.ok(s >= 0 && e > s, '找不到 @interp 區塊');
  const pre = 'const clamp = (v, a, b) => Math.min(b, Math.max(a, v)); const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }; const lerpAngle = (a, b, t) => a + wrap(b - a) * t;';
  return new Function(`${pre}\n${html.slice(s + open.length, e)}\nreturn { PHYS_FIX, lerpPose, makeStepper, makeRenderPrev };`)();
}
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('lerpPose：線性插值，朝向走短弧', () => {
  const { lerpPose } = load();
  const p = lerpPose({ x: 0, z: 10, h: 3.0, y: 1 }, { x: 4, z: 20, h: -3.0, y: 3 }, 0.5);
  near(p.x, 2); near(p.z, 15); near(p.y, 2);
  near(Math.cos(p.h), -1, 1e-6); // 3.0 與 -3.0 的短弧中點是 π，不是 0
  const q = lerpPose({ x: 0, h: 0 }, { x: 8, h: 1 }, 0); near(q.x, 0); near(q.h, 0);
  const r = lerpPose({ x: 0, h: 0 }, { x: 8, h: 1 }, 1); near(r.x, 8); near(r.h, 1);
});

// 模擬 frame()：每幀 dt 之後累積器跑固定步，畫的位置 = 上一步與目前步之間依 alpha 插值
function simulate(dts, interpolate) {
  const { PHYS_FIX, makeStepper, makeRenderPrev } = load();
  const st = makeStepper(PHYS_FIX), rp = makeRenderPrev(), cur = { x: 0 }, speed = 30, drawn = [], steps = [];
  for (const dt of dts) {
    st.add(dt); let n = 0;
    st.run(() => { rp.save(cur); cur.x += speed * PHYS_FIX; n++; });
    steps.push(n);
    drawn.push(interpolate ? rp.pose(cur, st.alpha(), {}).x : cur.x);
  }
  return { drawn, steps };
}
const deltas = a => a.slice(1).map((v, i) => v - a[i]);
const spread = a => Math.max(...a) - Math.min(...a);

test('每幀步數 1/2 交替：不插值位移忽大忽小，插值後每幀位移相等', () => {
  const F = 1 / 120, dts = Array.from({ length: 200 }, () => 1.6 * F); // 75 Hz：每幀 1 或 2 步
  const a = simulate(dts, false), b = simulate(dts, true);
  assert.ok(new Set(a.steps.slice(2)).size > 1, '情境要真的有不均勻的步數');
  const step = 30 * F;
  assert.ok(spread(deltas(a.drawn).slice(4)) > 0.5 * step, '不插值時位移不均');
  const d = deltas(b.drawn).slice(6);
  assert.ok(spread(d) < 0.25 * step, `插值後位移應近似均勻：${spread(d)}`);
});

test('每幀 0/1 步（144 Hz）：插值後每幀位移均勻，且不倒退', () => {
  const dts = Array.from({ length: 300 }, () => 1 / 144), b = simulate(dts, true), a = simulate(dts, false);
  assert.ok(new Set(a.steps).size > 1);
  const d = deltas(b.drawn).slice(6);
  assert.ok(Math.min(...d) > 0);
  assert.ok(spread(d) < 0.05 * 30 / 144, `${spread(d)}`);
  assert.ok(spread(deltas(a.drawn).slice(6)) > 0.5 * 30 / 120);
});

test('插值不改物理：同樣的 dt 序列，目前狀態逐位元相同', () => {
  const { PHYS_FIX, makeStepper } = load();
  let acc = 0, x = 0; const st = makeStepper(PHYS_FIX); let y = 0;
  for (let i = 0; i < 500; i++) {
    const dt = 0.004 + (i % 7) * 0.0013;
    acc += dt; while (acc >= PHYS_FIX) { x += 0.1; acc -= PHYS_FIX; }
    st.add(dt); st.run(() => { y += 0.1; });
  }
  assert.equal(st.acc, acc); assert.equal(y, x);
});

test('瞬間移動：snap 之後不從舊位置插值，下一步才開始', () => {
  const { makeRenderPrev } = load();
  const rp = makeRenderPrev(), cur = { x: 100, h: 0 };
  rp.save(cur);
  cur.x = 0; rp.snap(); // 重新開始 / R 回到路面
  assert.equal(rp.pose(cur, 0.5, {}).x, 0);
  assert.equal(rp.pose(cur, 0.0, {}).x, 0);
  rp.save(cur); cur.x = 2;
  near(rp.pose(cur, 0.5, {}).x, 1);
});

test('makeStepper：reset 把累積器歸零，alpha 落在 0..1', () => {
  const { PHYS_FIX, makeStepper } = load();
  const st = makeStepper(PHYS_FIX); st.add(PHYS_FIX * 2.6); st.run(() => {});
  near(st.alpha(), 0.6, 1e-9); st.reset();
  assert.equal(st.acc, 0); assert.equal(st.alpha(), 0);
});

test('接線：resetRace 與 resetCar 會 snap 並歸零，畫面只在 race/done 用插值姿態', () => {
  const rr = html.slice(html.indexOf('function resetRace()'), html.indexOf('resetRace();\n'));
  assert.match(rr, /rp\.snap\(\)/); assert.match(rr, /stepper\.reset\(\)/);
  const rc = html.slice(html.indexOf('function resetCar()'), html.indexOf('/* @tapguard:start */'));
  assert.match(rc, /rp\.snap\(\)/);
  const fr = html.slice(html.indexOf('function frame(now)'), html.indexOf('function resize()'));
  assert.match(fr, /drawInterp\(dt\)/); assert.doesNotMatch(fr, /placeCars\(dt\); updateCamera\(dt\)/);
});

// 真正的 drawInterp：畫的時候換成插值姿態，畫完（包括畫的過程丟出例外）一定還原成真實物理狀態
function drawInterpWith(placeCars) {
  const s = html.indexOf('\nfunction drawInterp('), e = html.indexOf('\n}\n', s) + 2;
  assert.ok(s >= 0, '找不到 drawInterp');
  const { lerpPose } = load();
  const car = { x: 10, z: 20, h: 0.5, loc: { y: 3 } }, rival = { s: 100, lat: 1, vis: 0.2 }, seen = {};
  const rpRead = () => ({ x: car.x, z: car.z, h: car.h, y: car.loc.y, rs: rival.s, rlat: rival.lat, rvis: rival.vis });
  const prev = { x: 0, z: 0, h: 0, y: 0, rs: 90, rlat: 0, rvis: 0 };
  const rp = { pose: (cur, a, out) => Object.assign(out, lerpPose(prev, cur, a), { rs: prev.rs + (cur.rs - prev.rs) * a, rlat: prev.rlat + (cur.rlat - prev.rlat) * a, rvis: prev.rvis + (cur.rvis - prev.rvis) * a }) };
  const f = new Function('car', 'rival', 'rpRead', 'rp', 'stepper', '_rpDraw', 'placeCars', 'updateCamera', 'state', `${html.slice(s, e)}\nreturn drawInterp;`)(
    car, rival, rpRead, rp, { alpha: () => 0.5 }, {}, () => { seen.x = car.x; seen.rs = rival.s; placeCars(); }, () => {}, 'race');
  return { f, car, rival, seen };
}
test('drawInterp：畫的時候用插值姿態，畫完還原真實狀態', () => {
  const { f, car, rival, seen } = drawInterpWith(() => {});
  f(1 / 60);
  near(seen.x, 5); near(seen.rs, 95);
  assert.deepEqual([car.x, car.z, car.h, car.loc.y, rival.s, rival.lat, rival.vis], [10, 20, 0.5, 3, 100, 1, 0.2]);
});
test('drawInterp：畫的過程丟出例外也會還原真實狀態', () => {
  const { f, car, rival } = drawInterpWith(() => { throw new Error('boom'); });
  assert.throws(() => f(1 / 60), /boom/);
  assert.deepEqual([car.x, car.z, car.h, car.loc.y, rival.s, rival.lat, rival.vis], [10, 20, 0.5, 3, 100, 1, 0.2]);
});
test('physics 裡的對手位置變數不與全域 rp 同名（避免日後誤用而掉進 TDZ）', () => {
  assert.ok(!/const rp = samplePos\(rival\.s, rival\.lat\)/.test(html));
});
