// 送酒模式：抽出 yatouge.html 的 @sake（純函式）— 碰牆計數、倒數與勝負判斷、杯中酒面的彈簧阻尼晃動、撞牆灑出量、最佳紀錄
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const M = new Function(`${block('sake')}
return { SAKE, sakeKey, sakeNewHits, sakeContact, sakeLeft, sakeJudge, sakeNewSlosh, sakeSlosh, sakeSpill, sakeParseBest, sakeIsNewBest };`)();
const { SAKE, sakeKey, sakeNewHits, sakeContact, sakeLeft, sakeJudge, sakeNewSlosh, sakeSlosh, sakeSpill, sakeParseBest, sakeIsNewBest } = M;
const DT = 1 / 120;
const DEG = Math.PI / 180;
// 連續 n 秒都是同一種狀態（碰牆或沒碰），回傳最後狀態與期間出現幾次新接觸
function run(st, touching, secs) {
  let hits = 0;
  for (let t = 0; t < secs - 1e-9; t += DT) { st = sakeContact(st, touching, DT); if (st.hit) hits++; }
  return { st, hits };
}

test('規則常數：3:15 時限、第 3 次碰牆失敗、離牆 0.4 秒才算新接觸、晃動上限約 25°', () => {
  assert.equal(SAKE.LIMIT, 195);
  assert.equal(SAKE.HITS, 3);
  assert.equal(SAKE.GAP, 0.4);
  assert.ok(Math.abs(SAKE.MAX_TILT - 25 * DEG) < 1e-9);
  assert.equal(sakeKey, 'yatouge-sake-best');
});

test('碰牆計數：第一次碰到就算一次，連續擦牆只算一次', () => {
  let st = sakeNewHits();
  assert.equal(st.n, 0);
  st = sakeContact(st, true, DT);
  assert.equal(st.n, 1); assert.equal(st.hit, true);
  const r = run(st, true, 2.5); // 貼著牆擦 2.5 秒
  assert.equal(r.st.n, 1, '連續擦牆仍是同一次');
  assert.equal(r.hits, 0);
});

test('碰牆計數：離牆不到 0.4 秒又碰到，仍算同一次；離牆滿 0.4 秒後再碰才算新的一次', () => {
  let st = sakeContact(sakeNewHits(), true, DT);
  st = run(st, false, 0.25).st;
  st = sakeContact(st, true, DT);
  assert.equal(st.n, 1, '只離開 0.25 秒：同一次');
  assert.equal(st.hit, false);
  st = run(st, false, 0.45).st;
  st = sakeContact(st, true, DT);
  assert.equal(st.n, 2, '離開 0.45 秒後再碰：第二次');
  assert.equal(st.hit, true);
});

test('碰牆計數：一碰一離交替的輕擦（每次離開都不到 0.4 秒）整段只算一次', () => {
  let st = sakeContact(sakeNewHits(), true, DT);
  for (let k = 0; k < 20; k++) { st = run(st, false, 0.2).st; st = run(st, true, 0.05).st; }
  assert.equal(st.n, 1);
});

test('碰牆計數：沒碰牆時次數不變，且不會產生新接觸', () => {
  const r = run(sakeNewHits(), false, 10);
  assert.equal(r.st.n, 0); assert.equal(r.hits, 0);
});

test('勝負：第 3 次碰牆立即失敗（hits），前兩次不失敗', () => {
  let st = sakeNewHits();
  for (let k = 1; k <= 3; k++) {
    st = sakeContact(st, true, DT); assert.equal(st.n, k);
    const j = sakeJudge({ n: st.n, t: 30, finished: false });
    assert.equal(j, k < 3 ? null : 'hits', `第 ${k} 次`);
    st = run(st, false, 0.5).st;
  }
  assert.equal(sakeJudge({ n: 3, t: 30, finished: true }), 'hits', '撞第 3 次的同時衝線也算失敗');
});

test('倒數：剩餘時間從 3:15 往下數，不會小於 0', () => {
  assert.equal(sakeLeft(0), 195);
  assert.ok(Math.abs(sakeLeft(60.5) - 134.5) < 1e-9);
  assert.equal(sakeLeft(195), 0);
  assert.equal(sakeLeft(300), 0);
});

test('勝負：時間內衝線過關（win），時間到還沒衝線超時（time），進行中為 null', () => {
  assert.equal(sakeJudge({ n: 0, t: 120, finished: false }), null);
  assert.equal(sakeJudge({ n: 2, t: 194.99, finished: true }), 'win');
  assert.equal(sakeJudge({ n: 0, t: 195, finished: false }), 'time');
  assert.equal(sakeJudge({ n: 1, t: 195.2, finished: false }), 'time');
  assert.equal(sakeJudge({ n: 0, t: 195, finished: true }), 'time', '剩餘時間必須 > 0 才過關');
});

// 以固定加速度晃 secs 秒
function slosh(s, aLong, aLat, secs, dt = 1 / 60) {
  let maxAbs = 0;
  for (let t = 0; t < secs - 1e-9; t += dt) { s = sakeSlosh(s, aLong, aLat, dt); maxAbs = Math.max(maxAbs, Math.abs(s.p), Math.abs(s.r), Math.hypot(s.p, s.r)); }
  return { s, maxAbs };
}

test('晃動方向：煞車時酒往前湧（p > 0），加速時往後（p < 0）', () => {
  const brake = slosh(sakeNewSlosh(), -8, 0, 0.3).s;
  assert.ok(brake.p > 0.02, `煞車 p=${brake.p}`);
  assert.ok(Math.abs(brake.r) < 1e-9);
  const gas = slosh(sakeNewSlosh(), 4, 0, 0.3).s;
  assert.ok(gas.p < -0.01, `加速 p=${gas.p}`);
});

test('晃動方向：往右轉（向心加速度向右，aLat > 0）時酒甩向左側（r < 0），左轉相反', () => {
  const right = slosh(sakeNewSlosh(), 0, 7, 0.3).s;
  assert.ok(right.r < -0.02, `右轉 r=${right.r}`);
  assert.ok(Math.abs(right.p) < 1e-9);
  const left = slosh(sakeNewSlosh(), 0, -7, 0.3).s;
  assert.ok(left.r > 0.02, `左轉 r=${left.r}`);
});

test('晃動：持續加速度下會停在接近 atan(a/g) 的傾角', () => {
  const s = slosh(sakeNewSlosh(), -3, 0, 12).s;
  assert.ok(Math.abs(s.p - Math.atan(3 / 9.81)) < 0.01, `p=${s.p}`);
});

test('晃動有上限：再大的 G（撞牆尖峰、長時間甩尾）合成傾角都不超過約 25°', () => {
  const r = slosh(sakeNewSlosh(), -200, 150, 3);
  assert.ok(r.maxAbs <= SAKE.MAX_TILT + 1e-9, `max ${r.maxAbs / DEG}°`);
  const r2 = slosh(r.s, 200, -150, 0.5, 1 / 30);
  assert.ok(r2.maxAbs <= SAKE.MAX_TILT + 1e-9);
  // 甩尾時左右來回擺盪
  let s = sakeNewSlosh(), m = 0;
  for (let k = 0; k < 10; k++) { const a = slosh(s, 0, k % 2 ? 14 : -14, 0.6); s = a.s; m = Math.max(m, a.maxAbs); }
  assert.ok(m <= SAKE.MAX_TILT + 1e-9);
  assert.ok(m > 15 * DEG, '甩尾要明顯擺盪');
});

test('晃動會回穩：G 力消失後幾秒內停下，而且過程中有來回擺盪（不是一次就停）', () => {
  let s = slosh(sakeNewSlosh(), -9, 0, 1).s;
  const start = s.p;
  assert.ok(start > 0.3);
  let crossed = false, prev = s.p;
  for (let t = 0; t < 6; t += 1 / 60) { s = sakeSlosh(s, 0, 0, 1 / 60); if (Math.sign(s.p) !== Math.sign(prev) && prev !== 0) crossed = true; prev = s.p; }
  assert.ok(crossed, '要往回擺過中線');
  assert.ok(Math.abs(s.p) < 0.01 && Math.abs(s.vp) < 0.05, `6 秒後 p=${s.p} vp=${s.vp}`);
});

test('晃動：影格長度忽大忽小或異常（0、NaN、超大）都不會發散', () => {
  let s = sakeNewSlosh();
  for (const dt of [0, NaN, 0.2, 1, 1 / 144, 0.05]) s = sakeSlosh(s, -6, 3, dt);
  for (const v of [s.p, s.r, s.vp, s.vr]) assert.ok(Number.isFinite(v));
  s = sakeSlosh(s, NaN, Infinity, 1 / 60);
  for (const v of [s.p, s.r, s.vp, s.vr]) assert.ok(Number.isFinite(v));
  assert.ok(Math.hypot(s.p, s.r) <= SAKE.MAX_TILT + 1e-9);
});

test('灑出量：每次撞牆 3–10%，撞得越重灑越多', () => {
  assert.equal(sakeSpill(0), 0.03);
  assert.equal(sakeSpill(0.2), 0.03);
  assert.equal(sakeSpill(100), 0.1);
  let prev = 0;
  for (let v = 0; v <= 30; v += 0.5) {
    const x = sakeSpill(v);
    assert.ok(x >= 0.03 - 1e-12 && x <= 0.1 + 1e-12, `v=${v} spill=${x}`);
    assert.ok(x >= prev - 1e-12, '不能隨力道變小'); prev = x;
  }
  assert.ok(sakeSpill(8) > sakeSpill(3));
  assert.equal(sakeSpill(NaN), 0.03);
  assert.equal(sakeSpill(-5), 0.03);
});

test('最佳紀錄：只接受 0 到時限之間的秒數；新紀錄判斷', () => {
  assert.equal(sakeParseBest(null), null);
  assert.equal(sakeParseBest('abc'), null);
  assert.equal(sakeParseBest('0'), null);
  assert.equal(sakeParseBest('200'), null);
  assert.equal(sakeParseBest('172.53'), 172.53);
  assert.equal(sakeIsNewBest(null, 180), true);
  assert.equal(sakeIsNewBest(170, 180), false);
  assert.equal(sakeIsNewBest(190, 180), true);
});
