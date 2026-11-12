// 抽出 yatouge.html 內 @supa 區塊（Supabase 傳輸層的純函式）後在 Node 執行
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const NAMES = 'ROOM_CODE_CHARS, genRoomCode, validRoomCode, normalizeCode, privRoomName, pickTransport, mergePeer, throttleStep, makeLimiter, lowOf';
const load = () => new Function(`${block('netcode')}\n${block('supa')}\nreturn { ${NAMES} };`)();

/* ---------- 房間代碼 ---------- */
test('字元集：只有大寫英數，排除 0 O 1 I L', () => {
  const { ROOM_CODE_CHARS } = load();
  assert.match(ROOM_CODE_CHARS, /^[A-Z2-9]+$/);
  for (const bad of '0O1IL') assert.ok(!ROOM_CODE_CHARS.includes(bad), bad);
  assert.equal(new Set(ROOM_CODE_CHARS).size, ROOM_CODE_CHARS.length);
  assert.equal(ROOM_CODE_CHARS.length, 31);
});
test('genRoomCode：由 4 個位元組決定，長度 4 且合法', () => {
  const { genRoomCode, validRoomCode } = load();
  assert.equal(genRoomCode([0, 0, 0, 0]), 'AAAA');
  assert.equal(genRoomCode([255, 254, 253, 252]).length, 4);
  for (let i = 0; i < 200; i++) assert.ok(validRoomCode(genRoomCode([i, i * 3 % 256, i * 7 % 256, 255 - i])));
});
test('genRoomCode：位元組不足或不是數字就丟錯', () => {
  const { genRoomCode } = load();
  assert.throws(() => genRoomCode([1, 2, 3]));
  assert.throws(() => genRoomCode(null));
});
test('validRoomCode：只收 4 碼合法字元', () => {
  const { validRoomCode } = load();
  for (const ok of ['AB23', 'ZZZZ', '2345']) assert.equal(validRoomCode(ok), true, ok);
  for (const bad of ['ab23', 'AB2', 'AB234', 'AB20', 'AB2O', 'AB21', 'AB2I', 'AB2L', 'AB 3', '', null, undefined, 1234, ['AB23'], 'AB2\n', 'ＡＢ２３'])
    assert.equal(validRoomCode(bad), false, String(bad));
});
test('normalizeCode：去空白、轉大寫，不合法回 null', () => {
  const { normalizeCode } = load();
  assert.equal(normalizeCode(' ab23 '), 'AB23');
  assert.equal(normalizeCode('ab20'), null);
  assert.equal(normalizeCode('abcde'), null);
  assert.equal(normalizeCode(7), null);
});
test('privRoomName：小寫 pvt- 開頭，不會被大廳當成公開房間名', () => {
  const { privRoomName } = load();
  const { validRoomName } = new Function(`${block('netcode')}\nreturn { validRoomName };`)();
  assert.equal(privRoomName('AB23'), 'pvt-ab23');
  assert.equal(validRoomName(privRoomName('AB23')), false);
  assert.throws(() => privRoomName('ab20'));
});

/* ---------- 傳輸層選擇 ---------- */
test('pickTransport：mock 優先（沿用原行為），其次 claude，其餘 Supabase', () => {
  const { pickTransport } = load();
  assert.equal(pickTransport({ hasClaude: true, mockOk: false }), 'claude');
  assert.equal(pickTransport({ hasClaude: false, mockOk: true }), 'mock');
  assert.equal(pickTransport({ hasClaude: true, mockOk: true }), 'mock');
  assert.equal(pickTransport({ hasClaude: false, mockOk: false }), 'supabase');
  assert.equal(pickTransport({}), 'supabase');
});

/* ---------- presence + broadcast 合併 ---------- */
test('lowOf：去掉 presence_ref、n、c，非物件回 null', () => {
  const { lowOf } = load();
  assert.deepEqual(lowOf({ v: 1, st: 'ready', presence_ref: 'x', n: 9, c: { x: 1 } }), { v: 1, st: 'ready' });
  assert.equal(lowOf(null), null);
  assert.equal(lowOf([1]), null);
  assert.equal(lowOf('x'), null);
});
test('mergePeer：低頻欄位與車子合成同一個凍結物件', () => {
  const { mergePeer } = load();
  const car = { n: 5, c: { x: 1 } };
  const r = mergePeer(undefined, { v: 1, st: 'racing' }, car, 1000);
  assert.deepEqual(r.presence, { v: 1, st: 'racing', n: 5, c: { x: 1 } });
  assert.ok(Object.isFrozen(r.presence));
  assert.equal(r.at, 1000);
});
test('mergePeer：沒有車子時只有低頻欄位', () => {
  const { mergePeer } = load();
  assert.deepEqual(mergePeer(undefined, { v: 1 }, null, 1).presence, { v: 1 });
});
test('mergePeer：輸入沒變就回傳同一個物件（凍結語意同 mock）', () => {
  const { mergePeer } = load();
  const car = { n: 5, c: null }, a = mergePeer(undefined, { v: 1, st: 'ready' }, car, 1000);
  const b = mergePeer(a, { st: 'ready', v: 1 }, car, 2000); // 欄位順序不同也算沒變
  assert.equal(b, a);
  assert.equal(b.presence, a.presence);
  assert.equal(b.at, 1000);
});
test('mergePeer：只有車子變了 -> 新 presence，updatedAt 更新', () => {
  const { mergePeer } = load();
  const a = mergePeer(undefined, { v: 1, st: 'racing' }, { n: 1, c: null }, 1000);
  const b = mergePeer(a, { v: 1, st: 'racing' }, { n: 2, c: null }, 2000);
  assert.notEqual(b.presence, a.presence);
  assert.equal(b.presence.n, 2);
  assert.equal(b.at, 2000);
});
test('mergePeer：低頻變了 -> 新 presence，車子沿用', () => {
  const { mergePeer } = load();
  const car = { n: 1, c: null }, a = mergePeer(undefined, { v: 1, st: 'ready' }, car, 1000);
  const b = mergePeer(a, { v: 1, st: 'countdown' }, car, 2000);
  assert.equal(b.presence.st, 'countdown');
  assert.equal(b.presence.n, 1);
});
test('mergePeer：低頻欄位裡偷塞的 n / c 不能蓋過 broadcast，也不能直通', () => {
  const { mergePeer, lowOf } = load();
  const evil = lowOf({ v: 1, n: 999, c: { x: 9e9 } });
  assert.deepEqual(mergePeer(undefined, evil, null, 1).presence, { v: 1 });
  assert.equal(mergePeer(undefined, evil, { n: 3, c: null }, 1).presence.n, 3);
});
test('mergePeer：合併結果交給 validatePeerState 後可用', () => {
  const { mergePeer } = load();
  const { validatePeerState } = new Function(`${block('netcode')}\nreturn { validatePeerState };`)();
  const low = { v: 1, st: 'racing', car: 'hatch', col: 1, trk: 'kurosagi', go: 1, nk: 'A' };
  const c = { x: 0, z: 0, h: 0, vx: 0, vz: 1, w: 0, s: 1, lat: 0, sr: 0, dr: 0, bk: 0 };
  const v = validatePeerState(mergePeer(undefined, low, { n: 4, c }, 1).presence, null);
  assert.equal(v.n, 4);
  assert.deepEqual(v.c, c);
});

/* ---------- 節流 ---------- */
test('throttleStep：間隔已過就立刻送，否則回剩餘時間', () => {
  const { throttleStep } = load();
  assert.deepEqual(throttleStep(-Infinity, 0, 50), { run: true, delay: 0 });
  assert.deepEqual(throttleStep(100, 150, 50), { run: true, delay: 0 });
  assert.deepEqual(throttleStep(100, 120, 50), { run: false, delay: 30 });
});
test('makeLimiter：一個間隔內連續呼叫只送一次，最後補送一次（trailing）', () => {
  const { makeLimiter } = load();
  let t = 0; const calls = [], timers = [];
  const lim = makeLimiter(50, () => calls.push(t), () => t, (f, d) => { timers.push({ f, at: t + d }); return timers.length; }, () => {});
  for (let i = 0; i < 10; i++) lim.poke();
  assert.deepEqual(calls, [0]);
  assert.equal(timers.length, 1);
  t = 50; timers.shift().f();
  assert.deepEqual(calls, [0, 50]);
  t = 60; lim.poke(); // 10 ms 後又呼叫：排在 t=100
  assert.deepEqual(calls, [0, 50]);
  assert.equal(timers[0].at, 100);
});
test('makeLimiter：每秒送出次數不超過 1000 / interval', () => {
  const { makeLimiter } = load();
  let t = 0, n = 0; const timers = [];
  const lim = makeLimiter(50, () => n++, () => t, (f, d) => { timers.push({ f, at: t + d }); return 1; }, () => {});
  for (t = 0; t < 1000; t++) { // 每 ms 都呼叫
    while (timers.length && timers[0].at <= t) timers.shift().f();
    lim.poke();
  }
  assert.ok(n <= 21 && n >= 19, `1 秒內送了 ${n} 次`);
});
test('makeLimiter：cancel 後排好的補送不會執行', () => {
  const { makeLimiter } = load();
  let n = 0; const timers = [], cancelled = [];
  const lim = makeLimiter(50, () => n++, () => 0, f => { timers.push(f); return timers.length; }, id => cancelled.push(id));
  lim.poke(); lim.poke(); lim.cancel();
  assert.deepEqual(cancelled, [1]);
  lim.poke(); // cancel 之後不再送
  assert.equal(n, 1);
});
