// 貓捉老鼠：抽出 yatouge.html 的 @netcode + @roompick + @catmouse（純函式）— 第一回合誰領先（房主的 seed）、起跑位置、
// 回合判定（終點時的位置與時間，含幾乎同時衝線、領先者沒衝線、追擊者先到）、交換角色、下一回合重新投距離、收到的回合訊息驗證
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const M = new Function(`${block('netcode')}\n${block('roompick')}\n${block('catmouse')}
return { NET, RP, CAT, catOther, catFirstLeader, catInit, catRole, catStart, catSure, judgeRound, catRecord, catResult, catWinner, catNext, catNextGap, validCat, validGapVote, catState, trailAt, catMsg };`)();
const { RP, CAT, catOther, catFirstLeader, catInit, catRole, catStart, catSure, judgeRound, catRecord, catResult, catWinner, catNext, catNextGap, validCat, validGapVote, catState, trailAt, catMsg } = M;

const BOUNDS = { x0: -100, x1: 100, z0: -500, z1: 100, s1: 4000 };
const R = (o = {}) => ({ v: RP.V, st: 'racing', car: 'coupe', col: 2, trk: 'kurosagi', go: 1, nk: 'Bob', vote: { t: 'kurosagi', d: 'down', m: 'cat', g: 50 }, gb: 1, ...o });
const J = (o = {}) => judgeRound({ ftL: null, ftF: null, gap: null, g: 50, sure: false, ...o });

/* ---------- 常數、角色、起跑 ---------- */
test('CAT：領先者在前方 10 m 起跑', () => {
  assert.equal(CAT.LEAD, 10);
  assert.ok(CAT.WAIT_MS > 0 && CAT.WAIT_MS <= 2000);
  assert.ok(CAT.HIST >= 10);
});

test('catOther / catRole / catStart：領先者 10 m，追擊者在原本的起跑位置', () => {
  assert.equal(catOther('h'), 'g'); assert.equal(catOther('g'), 'h');
  assert.equal(catRole('h', 'h'), 'lead'); assert.equal(catRole('h', 'g'), 'chase');
  assert.equal(catRole('g', 'g'), 'lead'); assert.equal(catRole('g', 'h'), 'chase');
  assert.equal(catStart('h', 'h'), 10); assert.equal(catStart('h', 'g'), 0);
  assert.equal(catStart('g', 'g'), 10); assert.equal(catStart('g', 'h'), 0);
});

/* ---------- 第一回合誰領先 ---------- */
test('catFirstLeader：由房主的 seed 決定，同一個 seed 結果一致，兩邊都抽得到', () => {
  let h = 0;
  for (let i = 0; i < 400; i++) {
    const seed = i * 2654435761 >>> 0, a = catFirstLeader(seed);
    assert.ok(a === 'h' || a === 'g'); assert.equal(catFirstLeader(seed), a, '同 seed 同結果（房主與來賓各算一次也一樣）');
    if (a === 'h') h++;
  }
  assert.ok(h > 140 && h < 260, `約一半：${h}/400`);
  const small = new Set(); for (let s = 0; s < 20; s++) small.add(catFirstLeader(s));
  assert.equal(small.size, 2, '連續的小 seed 也兩邊都有');
  for (const bad of [-1, 1.5, '3', null, undefined, NaN, 2 ** 32]) assert.equal(catFirstLeader(bad), null, String(bad));
});

test('catInit：第 1 回合、seed 決定的領先者、距離、空紀錄；不合法回傳 null', () => {
  const c = catInit(12345, 70, true);
  assert.deepEqual(c, { r: 1, L: catFirstLeader(12345), g: 70, dg: true, hist: [] });
  assert.equal(catInit(12345, 70).dg, false);
  assert.equal(catInit(-1, 50), null); assert.equal(catInit(1, 45), null); assert.equal(catInit(1, null), null);
});

/* ---------- 回合判定 ---------- */
test('judgeRound：追擊者先衝線（超車並保持到終點）→ 追擊者勝', () => {
  assert.deepEqual(J({ ftF: 60.1, ftL: 60.4, gap: 0 }), { w: 'f', gap: null }, '兩邊時間都知道：追擊者較快');
  assert.deepEqual(J({ ftF: 60.1, ftL: 60.4, gap: 0, sure: false }), { w: 'f', gap: null }, '兩邊都知道就不必等');
});

test('judgeRound：追擊者先到、領先者還沒到（領先者撞車停下）→ 等確定後追擊者勝', () => {
  assert.equal(J({ ftF: 70 }), null, '領先者的時間可能還在路上：先等');
  assert.deepEqual(J({ ftF: 70, sure: true }), { w: 'f', gap: null });
});

test('judgeRound：幾乎同時衝線，追擊者必須嚴格領先；同時間不算超車', () => {
  assert.deepEqual(J({ ftF: 60.00, ftL: 60.01, gap: 0.3 }), { w: 'f', gap: null });
  assert.deepEqual(J({ ftF: 60.01, ftL: 60.00, gap: 0.3 }), { w: 'd', gap: 0.3 }, '晚一點點：在距離內 → 平手');
  assert.deepEqual(J({ ftF: 60, ftL: 60, gap: 0 }), { w: 'd', gap: 0 }, '同時間：不是嚴格領先 → 平手');
});

test('judgeRound：領先者衝線時追擊者落後超過 G → 領先者勝；G 以內（含剛好 G）→ 平手', () => {
  assert.equal(J({ ftL: 80, gap: 70 }), null, '追擊者也許早已衝線、訊息還在路上：先等');
  assert.deepEqual(J({ ftL: 80, gap: 70, sure: true }), { w: 'l', gap: 70 });
  assert.deepEqual(J({ ftL: 80, gap: 50.4, sure: true }), { w: 'l', gap: 50.4 });
  assert.deepEqual(J({ ftL: 80, gap: 50, sure: true }), { w: 'd', gap: 50 }, '剛好 G：還在 G 以內');
  assert.deepEqual(J({ ftL: 80, gap: 12, sure: true }), { w: 'd', gap: 12 });
  assert.deepEqual(J({ ftL: 80, gap: 35, g: 30, sure: true }), { w: 'l', gap: 35 }, '依投票的距離判定');
  assert.deepEqual(J({ ftL: 80, gap: 95, g: 100, sure: true }), { w: 'd', gap: 95 });
  assert.deepEqual(J({ ftL: 80, ftF: 85, gap: 60 }), { w: 'l', gap: 60 }, '追擊者之後才到：看領先者衝線那一刻的差距');
  assert.deepEqual(J({ ftL: 80, gap: -3, sure: true }), { w: 'd', gap: 0 }, '負的差距（量測誤差）當 0');
});

test('judgeRound：還沒有人衝線、缺差距、不合法的輸入 → 不判定', () => {
  assert.equal(J({}), null); assert.equal(J({ sure: true }), null);
  assert.equal(J({ ftL: 80, sure: true }), null, '缺少差距');
  for (const o of [{ ftL: NaN, gap: 70, sure: true }, { ftL: '80', gap: 70, sure: true }, { ftL: 80, gap: NaN, sure: true }, { ftL: 80, gap: 70, g: 45, sure: true }, { ftF: -1, sure: true }, { ftF: 1e9, sure: true }])
    assert.equal(J(o), null, JSON.stringify(o));
});

test('catSure：對方較早的衝線不可能還在路上時才確定', () => {
  assert.equal(catSure(null, null, 30, null), false);
  assert.equal(catSure(70, 72, 75, 5000), true, '兩邊都到了');
  assert.equal(catSure(null, 70, 70.5, null), true, '對方 70 s 到，我在 70.5 s 還沒到：我不可能更早');
  assert.equal(catSure(null, 70, 69.8, null), false, '我的時鐘還沒走到對方的時間');
  assert.equal(catSure(70, null, 71, CAT.WAIT_MS - 1), false, '我剛到：對方更早的衝線可能還在路上');
  assert.equal(catSure(70, null, 72, CAT.WAIT_MS), true);
});

/* ---------- 紀錄、勝者、交換角色 ---------- */
test('catRecord / catResult / catWinner：記錄本回合；領先者勝或追擊者勝結束比賽；平手不結束', () => {
  const c0 = catInit(7, 50), L = c0.L, F = catOther(L);
  assert.equal(catResult(c0), null); assert.equal(catWinner(c0), null);
  const d = catRecord(c0, { w: 'd', gap: 31.6 });
  assert.notEqual(d, c0, '回傳新物件'); assert.deepEqual(c0.hist, [], '原本的不變');
  assert.deepEqual(d.hist, [{ r: 1, L, w: 'd', gap: 32, g: 50 }]);
  assert.deepEqual(catResult(d), { r: 1, L, w: 'd', gap: 32, g: 50 });
  assert.equal(catWinner(d), null, '平手：比賽繼續');
  assert.equal(catRecord(d, { w: 'l', gap: 99 }), d, '同一回合只記一次');
  assert.equal(catWinner(catRecord(c0, { w: 'l', gap: 70 })), L, '領先者勝');
  assert.equal(catWinner(catRecord(c0, { w: 'f', gap: null })), F, '追擊者勝');
  assert.equal(catRecord(c0, { w: 'x', gap: 1 }), c0, '不合法的結果不記');
});

test('catNext：平手後交換角色、回合 +1、換成新距離；比賽已結束或本回合未判定不能下一回合', () => {
  const c0 = catInit(7, 50), d = catRecord(c0, { w: 'd', gap: 20 });
  const n = catNext(d, 80, true);
  assert.deepEqual(n, { r: 2, L: catOther(c0.L), g: 80, dg: true, hist: d.hist });
  assert.equal(catResult(n), null, '新回合還沒有結果');
  assert.equal(catNext(c0, 80, false), null, '本回合還沒判定');
  assert.equal(catNext(catRecord(c0, { w: 'l', gap: 70 }), 80, false), null, '比賽已結束');
  assert.equal(catNext(d, 45, false), null, '不合法的距離');
  // 沒有回合上限：一直平手就一直交換
  let c = c0;
  for (let i = 0; i < 30; i++) { c = catNext(catRecord(c, { w: 'd', gap: 10 }), 50, false); assert.equal(c.L, i % 2 ? c0.L : catOther(c0.L)); }
  assert.equal(c.r, 31);
  assert.equal(c.hist.length, CAT.HIST, '紀錄只保留最近幾回合（訊息大小有上限）');
  assert.equal(c.hist[c.hist.length - 1].r, 30);
});

test('catNextGap：下一回合的距離重新投票，沿用 resolveVote（相同直接採用，不同依 seed 抽）', () => {
  for (let s = 0; s < 30; s++) assert.deepEqual(catNextGap(60, 60, s), { g: 60, dg: false });
  const seen = new Set();
  for (let s = 0; s < 200; s++) { const r = catNextGap(30, 100, s); assert.equal(r.dg, true); assert.deepEqual(catNextGap(30, 100, s), r); seen.add(r.g); }
  assert.deepEqual([...seen].sort((a, b) => a - b), [30, 100]);
  assert.equal(catNextGap(45, 50, 1), null); assert.equal(catNextGap(50, 50, -1), null);
});

/* ---------- 收到的回合訊息 ---------- */
test('catMsg / validCat：房主送出的回合狀態可以原樣驗證回來', () => {
  const c0 = catInit(99, 60, true), d = catRecord(c0, { w: 'd', gap: 40 }), n = catNext(d, 70, false), w = catRecord(n, { w: 'l', gap: 88 });
  for (const c of [c0, d, n, w]) assert.deepEqual(validCat(catMsg(c)), c);
  assert.deepEqual(catMsg(c0), { r: 1, L: c0.L, g: 60, dg: 1, hist: [] }, 'dg 用 0/1 傳');
  assert.ok(JSON.stringify(catMsg({ ...n, hist: Array.from({ length: CAT.HIST }, (_, i) => ({ r: i + 1, L: i % 2 ? 'g' : 'h', w: 'd', gap: 99999, g: 100 })) })).length < 1500, '訊息不會太大');
});

test('validCat：任何欄位錯誤、紀錄前後矛盾 → null（整筆丟棄）', () => {
  const c0 = catInit(99, 60), d = catRecord(c0, { w: 'd', gap: 40 }), n = catNext(d, 70, false);
  const m = catMsg(n);
  const bad = [null, 1, 'x', [], { ...m, r: 0 }, { ...m, r: 1.5 }, { ...m, r: CAT.MAX_R + 1 }, { ...m, L: 'x' }, { ...m, g: 45 }, { ...m, dg: 2 }, { ...m, hist: 'x' },
    { ...m, hist: null }, { ...m, L: catOther(m.L) }, { ...m, r: 3 }, { ...m, r: 1 },
    { ...m, hist: [{ ...m.hist[0], w: 'x' }] }, { ...m, hist: [{ ...m.hist[0], gap: -1 }] }, { ...m, hist: [{ ...m.hist[0], gap: 1.5 }] }, { ...m, hist: [{ ...m.hist[0], g: 1 }] },
    { ...m, hist: [{ ...m.hist[0], r: 2 }] }, { ...m, hist: [{ ...m.hist[0], w: 'l' }] }, { ...m, hist: [m.hist[0], m.hist[0]] },
    { ...catMsg(c0), r: 2 }, { ...m, hist: Array.from({ length: CAT.HIST + 1 }, (_, i) => ({ r: i + 1, L: i % 2 ? 'g' : 'h', w: 'd', gap: 1, g: 50 })) }];
  for (const b of bad) assert.equal(validCat(b), null, JSON.stringify(b));
  // 被截斷的紀錄（最早的回合已不在訊息裡）仍然合法
  let c = c0; for (let i = 0; i < 25; i++) c = catNext(catRecord(c, { w: 'd', gap: 5 }), 50, false);
  assert.deepEqual(validCat(catMsg(c)), c);
  assert.deepEqual(validCat({ ...m, evil: '<b>' }), n, '多的欄位丟掉');
});

test('validGapVote / catState：距離票只接受 30–100 m 的選項；回合訊息錯誤時整筆狀態丟棄', () => {
  for (const g of RP.GAPS) assert.equal(validGapVote(g), g);
  for (const g of [45, '50', 0, 110, NaN, undefined]) assert.equal(validGapVote(g), null, String(g));
  const cm = catMsg(catInit(5, 50));
  const s = catState(R({ cm, cg: 70 }), BOUNDS);
  assert.deepEqual(s.cm, validCat(cm)); assert.equal(s.cg, 70);
  const plain = catState(R(), BOUNDS);
  assert.ok(plain); assert.equal(plain.cm, null); assert.equal(plain.cg, null, '先到者勝模式沒有這兩個欄位');
  assert.equal(catState(R({ cm: { ...cm, r: 0 } }), BOUNDS), null);
  assert.equal(catState(R({ cg: 45 }), BOUNDS), null);
  assert.equal(catState(R({ vote: null }), BOUNDS), null, '房間狀態本身錯誤');
});

/* ---------- 位置紀錄 ---------- */
test('trailAt：依比賽時間內插自己的位置（追擊者在領先者衝線那一刻的位置）', () => {
  const tr = [{ t: 0, s: 0 }, { t: 1, s: 10 }, { t: 2, s: 30 }];
  assert.equal(trailAt(tr, 0.5), 5); assert.equal(trailAt(tr, 1.5), 20);
  assert.equal(trailAt(tr, -1), 0); assert.equal(trailAt(tr, 9), 30, '超出紀錄：最後的位置');
  assert.equal(trailAt([], 1), null);
});
