// 線上訊息簽章（@sign 區塊，B2 冒充修正）：代號與公開金鑰綁定、簽章驗證、序號、驗證佇列。node 內建 WebCrypto。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const NAMES = 'SIGN, makeIdentity, peerIdOf, importPeerKey, signPayload, verifyMsg, bodyOf, makeSigner, makeInbox, b64u, unb64u, validPeerId, stableJson';
const S = new Function(`${block('netcode')}\n${block('supa')}\n${block('sign')}\nreturn { ${NAMES} };`)();
const wait = ms => new Promise(r => setTimeout(r, ms));
const TOPIC = 'yatouge-room-pvp-abc123';

/* ---------- 代號與金鑰 ---------- */
test('makeIdentity：代號由公開金鑰雜湊算出，格式符合 validPeerId，公開金鑰 65 位元組', async () => {
  const a = await S.makeIdentity(), b = await S.makeIdentity();
  assert.match(a.id, /^p[a-z0-9]{20}$/);
  assert.equal(S.validPeerId(a.id), true);
  const raw = S.unb64u(a.pub, 65);
  assert.ok(raw && raw[0] === 4, '未壓縮的 P-256 點');
  assert.equal(a.pub.length, 87);
  assert.equal(await S.peerIdOf(raw), a.id);
  assert.notEqual(a.id, b.id);
});
test('peerIdOf：同一把金鑰得到同一個代號；金鑰差一個位元就換代號', async () => {
  const a = await S.makeIdentity(), raw = S.unb64u(a.pub, 65), raw2 = raw.slice(); raw2[40] ^= 1;
  assert.equal(await S.peerIdOf(raw), await S.peerIdOf(raw.slice()));
  assert.notEqual(await S.peerIdOf(raw2), a.id);
});
test('importPeerKey：合法金鑰回傳 { id, key }；長度不對、不是曲線上的點、亂碼都回 null', async () => {
  const a = await S.makeIdentity(), k = await S.importPeerKey(a.pub);
  assert.equal(k.id, a.id);
  const raw = S.unb64u(a.pub, 65), off = raw.slice(); off[64] ^= 1; // 改了 y：不在曲線上
  for (const bad of [null, undefined, 5, '', 'abc', a.pub.slice(1), a.pub + 'A', S.b64u(off), S.b64u(raw.slice(0, 64)), '!'.repeat(87)])
    assert.equal(await S.importPeerKey(bad), null, String(bad));
});

/* ---------- 簽章與驗證 ---------- */
const sendAs = async (ident, event, body, q = 1, withKey = false, topic = TOPIC) => JSON.parse(JSON.stringify(await S.signPayload(ident, topic, event, q, { t: Date.now(), ...body }, withKey)));
test('簽章來回：簽出去的訊息驗得過；欄位順序、經過 JSON 來回都不影響', async () => {
  const a = await S.makeIdentity(), key = await S.importPeerKey(a.pub);
  const d = await sendAs(a, 'p', { low: { v: 3, st: 'waiting', vote: { t: 'x', m: 'first', g: 50 }, ft: undefined, nk: '玩家' } });
  assert.equal(d.p, a.id); assert.equal(d.q, 1); assert.equal(d.s.length, 86); assert.equal(d.k, undefined);
  assert.equal(await S.verifyMsg(key, TOPIC, 'p', d), true);
  const shuffled = { t: d.t, s: d.s, low: { nk: '玩家', vote: { g: 50, m: 'first', t: 'x' }, st: 'waiting', v: 3 }, q: d.q, p: d.p };
  assert.equal(await S.verifyMsg(key, TOPIC, 'p', shuffled), true);
  assert.equal((await sendAs(a, 'x', {}, 2, true)).k, a.pub, 'withKey 時附上公開金鑰');
});
test('簽章拒絕：竄改內容、換代號、換頻道、換事件、換序號、別人的金鑰、壞掉的簽章', async () => {
  const a = await S.makeIdentity(), b = await S.makeIdentity(), ka = await S.importPeerKey(a.pub), kb = await S.importPeerKey(b.pub);
  const d = await sendAs(a, 'p', { low: { st: 'waiting' } });
  assert.equal(await S.verifyMsg(ka, TOPIC, 'p', d), true);
  assert.equal(await S.verifyMsg(ka, TOPIC, 'p', { ...d, low: { st: 'finished' } }), false, '竄改內容');
  assert.equal(await S.verifyMsg(ka, TOPIC, 'p', { ...d, low: { st: 'waiting', ft: 0.001 } }), false, '多塞欄位');
  assert.equal(await S.verifyMsg(ka, TOPIC, 'p', { ...d, p: b.id }), false, '換代號（金鑰的代號對不上）');
  assert.equal(await S.verifyMsg(kb, TOPIC, 'p', { ...d, p: b.id }), false, '換成對方的代號與金鑰也不行：簽章不是他簽的');
  assert.equal(await S.verifyMsg(ka, 'yatouge-room-pvp-other', 'p', d), false, '換頻道');
  assert.equal(await S.verifyMsg(ka, TOPIC, 'c', d), false, '換事件');
  assert.equal(await S.verifyMsg(ka, TOPIC, 'p', { ...d, q: 2 }), false, '換序號');
  assert.equal(await S.verifyMsg(kb, TOPIC, 'p', d), false, '別人的金鑰');
  for (const s of [undefined, '', 'abc', d.s.slice(1), d.s.replace(/^./, c => (c === 'A' ? 'B' : 'A'))]) assert.equal(await S.verifyMsg(ka, TOPIC, 'p', { ...d, s }), false, String(s));
  for (const q of [0, -1, 1.5, '1', NaN, null]) assert.equal(await S.verifyMsg(ka, TOPIC, 'p', { ...d, q }), false, String(q));
});
test('signPayload：頻道名或事件含換行就丟錯（簽章文字不會被偷換欄位）', async () => {
  const a = await S.makeIdentity();
  await assert.rejects(() => S.signPayload(a, 'a\nb', 'p', 1, {}));
  await assert.rejects(() => S.signPayload(a, TOPIC, 'p\n', 1, {}));
});
test('bodyOf：去掉 p / q / s / k，其餘原樣', () => {
  assert.deepEqual(S.bodyOf({ p: 'a', q: 1, s: 'x', k: 'y', low: { a: 1 }, n: 2 }), { low: { a: 1 }, n: 2 });
});

/* ---------- 收件匣（驗證佇列） ---------- */
function inbox(opts = {}) {
  const got = []; const ib = S.makeInbox({ topic: TOPIC, selfId: 'me', onMsg: (ev, id, body) => got.push({ ev, id, body }), ...opts });
  return { ib, got };
}
const flush = async ib => { await ib.idle(); };
test('收件匣：驗證通過才交出；內容原樣；代號要與金鑰對得上（用 k 取得金鑰）', async () => {
  const a = await S.makeIdentity(), { ib, got } = inbox();
  ib.submit('p', await sendAs(a, 'p', { low: { st: 'waiting' } }, 1, true));
  await flush(ib);
  assert.deepEqual(got, [{ ev: 'p', id: a.id, body: { low: { st: 'waiting' } } }]);
});
test('收件匣：冒充者用自己的金鑰、寫別人的代號，被丟掉；之後真的那位仍可正常通過', async () => {
  const host = await S.makeIdentity(), evil = await S.makeIdentity(), { ib, got } = inbox();
  ib.learn(host.id, host.pub); await wait(5);
  const forged = await sendAs(evil, 'p', { low: { st: 'finished', ft: 0.001 } }, 5, true);
  ib.submit('p', { ...forged, p: host.id }); // 簽章是 evil 簽的，代號改成 host
  ib.submit('p', await sendAs(evil, 'p', { low: { st: 'finished' } }, 6, true)); // evil 以自己的代號：通過，但這是他自己
  ib.submit('p', await sendAs(host, 'p', { low: { st: 'waiting' } }, 1, true));
  await flush(ib);
  assert.deepEqual(got.map(g => [g.id === host.id ? 'host' : 'evil', g.body.low.st]), [['evil', 'finished'], ['host', 'waiting']]);
});
test('收件匣：不帶金鑰也不在名單裡的訊息先暫存，金鑰到了才依序交出；逾時就丟掉', async () => {
  const a = await S.makeIdentity(); let t = 0;
  const { ib, got } = inbox({ now: () => t, holdMs: 3000 });
  ib.submit('p', await sendAs(a, 'p', { low: { n: 1 } }, 1));
  ib.submit('c', await sendAs(a, 'c', { n: 7, c: null }, 2));
  await flush(ib); assert.equal(got.length, 0, '沒有金鑰：還不能交出');
  t = 1000; assert.equal(await ib.learn(a.id, a.pub), true); await flush(ib);
  assert.deepEqual(got.map(g => g.ev), ['p', 'c'], '補到金鑰後依原順序');
  const b = await S.makeIdentity(), r = inbox({ now: () => t, holdMs: 3000 });
  r.ib.submit('p', await sendAs(b, 'p', { low: {} }, 1)); await r.ib.idle();
  t = 9000; assert.equal(await r.ib.learn(b.id, b.pub), true); await r.ib.idle();
  assert.equal(r.got.length, 0, '暫存逾時：丟掉');
});
test('收件匣：暫存有上限（每個發送者 holdMax 則）', async () => {
  const a = await S.makeIdentity(), { ib, got } = inbox({ holdMax: 3, rate: { burst: 100, perSec: 100 } });
  for (let q = 1; q <= 6; q++) ib.submit('c', await sendAs(a, 'c', { n: q, c: null }, q));
  await flush(ib); await ib.learn(a.id, a.pub); await flush(ib);
  assert.deepEqual(got.map(g => g.body.n), [4, 5, 6], '只留最新的 3 則');
});
test('收件匣：learn 拿到對不上代號的金鑰會拒絕，且不會污染已有的金鑰', async () => {
  const a = await S.makeIdentity(), evil = await S.makeIdentity(), { ib, got } = inbox();
  assert.equal(await ib.learn(a.id, evil.pub), false);
  assert.equal(await ib.learn(a.id, 'garbage'), false);
  assert.equal(await ib.learn(a.id, a.pub), true);
  assert.equal(await ib.learn(a.id, evil.pub), false);
  ib.submit('p', await sendAs(a, 'p', { low: { st: 'x' } }, 1)); await flush(ib);
  assert.equal(got.length, 1);
});
test('收件匣：序號必須比上一則被接受的新；重播與舊訊息丟掉；序號可跳號', async () => {
  const a = await S.makeIdentity(), { ib, got } = inbox();
  await ib.learn(a.id, a.pub);
  const m = {}; for (const q of [1, 2, 5, 9]) m[q] = await sendAs(a, 'c', { n: q, c: null }, q);
  for (const q of [2, 2, 1, 5, 9, 5, 9, 2]) ib.submit('c', m[q]); await flush(ib);
  assert.deepEqual(got.map(g => g.body.n), [2, 5, 9]);
});
test('收件匣：p 與 c 共用同一個序號空間（換事件重播不行）', async () => {
  const a = await S.makeIdentity(), { ib, got } = inbox(); await ib.learn(a.id, a.pub);
  const c3 = await sendAs(a, 'c', { n: 1, c: null }, 3), p2 = await sendAs(a, 'p', { low: { st: 'x' } }, 2);
  ib.submit('c', c3); ib.submit('p', p2); await flush(ib);
  assert.deepEqual(got.map(g => g.ev), ['c']);
});
test('收件匣：非同步驗證時同一發送者仍保持到達順序（驗證時間隨機）', async () => {
  const a = await S.makeIdentity(), b = await S.makeIdentity();
  let k = 0; const verify = async (...args) => { await wait([9, 1, 6, 0, 4, 2, 8, 3][k++ % 8]); return S.verifyMsg(...args); };
  const { ib, got } = inbox({ verify, rate: { burst: 100, perSec: 100 } }); await ib.learn(a.id, a.pub); await ib.learn(b.id, b.pub);
  for (let q = 1; q <= 24; q++) { ib.submit('c', await sendAs(a, 'c', { n: q, c: null }, q)); if (q % 3 === 0) ib.submit('c', await sendAs(b, 'c', { n: 100 + q, c: null }, q)); }
  await flush(ib);
  assert.deepEqual(got.filter(g => g.id === a.id).map(g => g.body.n), Array.from({ length: 24 }, (_, i) => i + 1));
  assert.deepEqual(got.filter(g => g.id === b.id).map(g => g.body.n), Array.from({ length: 8 }, (_, i) => 100 + 3 * (i + 1)));
});
test('收件匣：速率上限（每個發送者）；超過的在驗證前就丟掉；時間過了又恢復', async () => {
  const a = await S.makeIdentity(); let t = 0, verifies = 0;
  const verify = (...args) => { verifies++; return S.verifyMsg(...args); };
  const { ib, got } = inbox({ now: () => t, verify, rate: { burst: 5, perSec: 5 } }); await ib.learn(a.id, a.pub);
  const ms = []; for (let q = 1; q <= 12; q++) ms.push(await sendAs(a, 'c', { n: q, c: null }, q));
  for (const m of ms.slice(0, 10)) ib.submit('c', m); await flush(ib);
  assert.equal(got.length, 5); assert.equal(verifies, 5, '超量的沒有花驗證時間');
  t = 1000; ib.submit('c', ms[10]); await flush(ib);
  assert.equal(got.length, 6);
});
test('收件匣：佇列上限；格式不對、自己的代號、不認得的事件一律丟掉', async () => {
  const a = await S.makeIdentity(), me = await S.makeIdentity(), { ib, got } = inbox({ selfId: me.id, events: ['p', 'c', 'x'] }); await ib.learn(a.id, a.pub);
  const good = await sendAs(a, 'p', { low: { st: 'x' } }, 1);
  for (const [ev, d] of [['p', null], ['p', 5], ['p', []], ['p', { ...good, p: 5 }], ['p', { ...good, q: '1' }], ['p', { ...good, s: 5 }], ['p', { ...good, p: 'bad id\n' }],
    ['bye', good], ['__proto__', good], ['p', await sendAs(me, 'p', { low: {} }, 1, true)]]) ib.submit(ev, d);
  await flush(ib); assert.equal(got.length, 0);
  ib.submit('p', good); await flush(ib); assert.equal(got.length, 1);
  const q = inbox({ maxQueue: 2, rate: { burst: 100, perSec: 100 } }); await q.ib.learn(a.id, a.pub);
  const ms = []; for (let i = 1; i <= 6; i++) ms.push(await sendAs(a, 'c', { n: i, c: null }, i));
  for (const m of ms) q.ib.submit('c', m); await flush(q.ib);
  assert.ok(q.got.length >= 2 && q.got.length < 6, `佇列滿了丟掉多的：收到 ${q.got.length}`);
});
const junkId = () => 'p' + Array.from({ length: 20 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
const up = async (ib, ident, q, st = 'x') => { ib.submit('p', await sendAs(ident, 'p', { pres: { st } }, q, true)); await ib.idle(); };
test('收件匣：只有簽章驗證過的發送者才進受保護的表；300 個亂編代號灌爆也擠不掉真玩家，舊訊息重播被拒絕（evict.mjs 情境）', async () => {
  const victim = await S.makeIdentity(), { ib, got } = inbox();
  const old = await sendAs(victim, 'p', { pres: { st: 'waiting' } }, 10, true);
  ib.submit('p', old); await flush(ib); await up(ib, victim, 50, 'racing');
  for (let i = 0; i < 300; i++) ib.submit('p', { p: junkId(), q: 1, s: 'A'.repeat(86) });
  await flush(ib); ib.submit('p', old); await flush(ib);
  assert.deepEqual(got.map(g => g.body.pres.st), ['waiting', 'racing']);
});
test('收件匣：攻擊者產生 300 把真金鑰、簽章都正確，仍擠不掉被釘住（在名單裡）的玩家，舊訊息重播被拒絕', async () => {
  const victim = await S.makeIdentity(), pinned = new Set([victim.id]);
  const { ib, got } = inbox({ maxSenders: 20, isPinned: id => pinned.has(id), rate: { burst: 100, perSec: 100 } });
  const old = await sendAs(victim, 'p', { pres: { st: 'waiting' } }, 10, true);
  ib.submit('p', old); await flush(ib); await up(ib, victim, 50, 'racing');
  for (let i = 0; i < 300; i++) await up(ib, await S.makeIdentity(), 1);
  ib.submit('p', old); await flush(ib);
  assert.equal(got.filter(g => g.id === victim.id).map(g => g.body.pres.st).join(), 'waiting,racing');
  assert.equal(got.length, 302, '攻擊者自己的訊息（用自己的身分）照常收下');
});
test('收件匣：沒被釘住而被擠掉的發送者，墓碑記著最後序號：舊訊息與同序號都拒絕，新序號重新通過', async () => {
  const victim = await S.makeIdentity(), { ib, got } = inbox({ maxSenders: 5, rate: { burst: 100, perSec: 100 } });
  const old = await sendAs(victim, 'p', { pres: { st: 'waiting' } }, 10, true);
  ib.submit('p', old); await flush(ib); await up(ib, victim, 50, 'racing');
  for (let i = 0; i < 30; i++) await up(ib, await S.makeIdentity(), 1);
  ib.submit('p', old); await flush(ib);
  ib.submit('p', await sendAs(victim, 'p', { pres: { st: 'racing' } }, 50, true)); await flush(ib);
  assert.equal(got.filter(g => g.id === victim.id).length, 2, '被擠掉之後重播都被墓碑擋下');
  await up(ib, victim, 51, 'finished');
  assert.equal(got.filter(g => g.id === victim.id).map(g => g.body.pres.st).pop(), 'finished', '真的新訊息仍通過');
});
test('收件匣：未驗證的暫存區有上限（每人 holdMax、總共 maxPending 個代號），且不影響已驗證的發送者', async () => {
  const good = await S.makeIdentity(), { ib, got } = inbox({ maxPending: 10, holdMax: 2, rate: { burst: 100, perSec: 100 } });
  await up(ib, good, 1);
  const ids = []; for (let i = 0; i < 40; i++) { const x = await S.makeIdentity(); ids.push(x); ib.submit('c', await sendAs(x, 'c', { n: i, c: null }, 1)); }
  await flush(ib);
  assert.equal(got.length, 1, '沒有金鑰的暫存著，沒有交出');
  const last = ids[39]; await ib.learn(last.id, last.pub); await flush(ib);
  assert.equal(got.length, 2, '最新的還在暫存區');
  const first = ids[0]; await ib.learn(first.id, first.pub); await flush(ib);
  assert.equal(got.length, 2, '最舊的已被擠掉（暫存區滿了淘汰最舊的）');
  await up(ib, good, 2); assert.equal(got.length, 3, '已驗證的發送者不受影響');
});
test('收件匣：晚加入者仍可用（名單給金鑰，之後正常收訊息）；暫存逾時後的空紀錄會清掉', async () => {
  const a = await S.makeIdentity(); let t = 0; const { ib, got } = inbox({ now: () => t });
  ib.submit('c', await sendAs(a, 'c', { n: 1, c: null }, 1)); await flush(ib);
  t = 100; await ib.learn(a.id, a.pub); await flush(ib);
  ib.submit('c', await sendAs(a, 'c', { n: 2, c: null }, 2)); await flush(ib);
  assert.deepEqual(got.map(g => g.body.n), [1, 2]);
});

/* ---------- 簽署端 ---------- */
test('makeSigner：序號依呼叫順序遞增，即使簽章完成的先後不同，送出順序也維持；同一個頻道跨 signer 延續序號', async () => {
  const a = await S.makeIdentity(), out = [];
  const sg = S.makeSigner(a, TOPIC, 0);
  for (let i = 0; i < 20; i++) sg.post(i % 5 === 0 ? 'p' : 'c', { n: i }, d => out.push(d));
  await sg.idle();
  assert.deepEqual(out.map(d => d.q), Array.from({ length: 20 }, (_, i) => i + 1));
  assert.deepEqual(out.map(d => d.n), Array.from({ length: 20 }, (_, i) => i));
  const again = S.makeSigner(a, TOPIC, 0); again.post('c', {}, d => out.push(d)); await again.idle();
  assert.equal(out.at(-1).q, 21, '離開再進同一個頻道：序號接著算，不會被接收端當成舊訊息');
  const other = S.makeSigner(a, 'yatouge-lobby', 0); other.post('c', {}, d => out.push(d)); await other.idle();
  assert.equal(out.at(-1).q, 1, '不同頻道各自計');
});
test('makeSigner：公開金鑰只在 p 事件、且距上次超過間隔時附上', async () => {
  const a = await S.makeIdentity(); let t = 0, out = [];
  const sg = S.makeSigner(a, TOPIC, 5000, () => t);
  sg.post('p', {}, d => out.push(d)); sg.post('p', {}, d => out.push(d)); sg.post('c', {}, d => out.push(d)); await sg.idle();
  assert.deepEqual(out.map(d => !!d.k), [true, false, false]);
  t = 5001; sg.post('p', {}, d => out.push(d)); await sg.idle();
  assert.equal(out.at(-1).k, a.pub);
});
test('makeSigner：送出的訊息交給 makeInbox 驗證可通過（簽署端與接收端對得上）', async () => {
  const a = await S.makeIdentity(), out = [], sg = S.makeSigner(a, TOPIC, 5000), { ib, got } = inbox();
  sg.post('p', { low: { st: 'waiting' } }, d => out.push(JSON.parse(JSON.stringify(d)))); sg.post('c', { n: 1, c: { x: 1.5, z: -2 } }, d => out.push(JSON.parse(JSON.stringify(d)))); await sg.idle();
  for (const d of out) ib.submit(d.q === 1 ? 'p' : 'c', d); await flush(ib);
  assert.deepEqual(got.map(g => g.ev), ['p', 'c']);
});

/* ---------- 補強：時間戳、早期大小檢查、失敗額度、競態 ---------- */
test('時間戳：沒有基準（這個收件匣第一次收到該發送者）時 t 必須在 10 分鐘內；舊訊息的重播被拒絕，新訊息與 60 秒內的時鐘誤差通過', async () => {
  const a = await S.makeIdentity(); let wall = 1_000_000_000_000;
  const old = await sendAs(a, 'p', { pres: { st: 'finished' }, t: wall }, 40, true);
  const mk = () => inbox({ wall: () => wall });
  wall += 601_000; let r = mk(); r.ib.submit('p', old); await flush(r.ib);
  assert.equal(r.got.length, 0, '超過 10 分鐘前錄下的訊息：晚加入者不收');
  wall += 600_000; r = mk(); for (let q = 41; q < 100; q++) r.ib.submit('p', await sendAs(a, 'p', { pres: { st: 'finished' }, t: wall - 700_000 }, q, true)); await flush(r.ib);
  assert.equal(r.got.length, 0, '攻擊者用遞增序號重播一整串舊訊息也不行');
  r.ib.submit('p', await sendAs(a, 'p', { pres: { st: 'racing' }, t: wall }, 100, true)); await flush(r.ib);
  assert.equal(r.got.length, 1, '現在真的訊息通過');
  const skew = mk(); skew.ib.submit('p', await sendAs(a, 'p', { pres: { st: 'x' }, t: wall - 599_000 }, 101, true)); await flush(skew.ib);
  assert.equal(skew.got.length, 1, '誤差 10 分鐘內通過');
  const two = mk(); two.ib.submit('p', await sendAs(a, 'p', { pres: { st: 'x' }, t: wall - 120_000 }, 104, true)); two.ib.submit('p', await sendAs(a, 'p', { pres: { st: 'x' }, t: wall + 120_000 }, 105, true)); await flush(two.ib);
  assert.equal(two.got.length, 2, '時鐘差 2 分鐘（快或慢）都通過');
  const fut = mk(); fut.ib.submit('p', await sendAs(a, 'p', { pres: { st: 'x' }, t: wall + 601_000 }, 102, true)); fut.ib.submit('p', await sendAs(a, 'p', { pres: { st: 'x' }, t: wall }, 103, true));
  await flush(fut.ib); assert.equal(fut.got.length, 1, '未來超過 10 分鐘的丟掉；只有第二則（t 是現在）通過');
  const noT = mk(); noT.ib.submit('p', JSON.parse(JSON.stringify(await S.signPayload(a, TOPIC, 'p', 200, { pres: {} }, true)))); await flush(noT.ib);
  assert.equal(noT.got.length, 0, '沒有 t 的第一則不收');
});
test('時間戳：有基準之後只看序號，不再看 t（手機時鐘跳動不會中斷）；交給 onMsg 的內容不含 t', async () => {
  const a = await S.makeIdentity(); let wall = 5_000_000_000_000; const { ib, got } = inbox({ wall: () => wall });
  ib.submit('p', await sendAs(a, 'p', { pres: { n: 1 }, t: wall }, 1, true)); await flush(ib);
  wall += 3_600_000; ib.submit('p', await sendAs(a, 'p', { pres: { n: 2 }, t: wall - 3_600_000 }, 2, true)); await flush(ib);
  assert.deepEqual(got.map(g => g.body), [{ pres: { n: 1 } }, { pres: { n: 2 } }]);
});
test('makeSigner：每則的簽章內容都帶 t（取自 wall）', async () => {
  const a = await S.makeIdentity(), out = [], sg = S.makeSigner(a, TOPIC, 0, () => 0, () => 123456);
  sg.post('c', { n: 1 }, d => out.push(d)); await sg.idle();
  assert.equal(out[0].t, 123456);
  assert.equal(await S.verifyMsg(await S.importPeerKey(a.pub), TOPIC, 'c', out[0]), true);
  assert.equal(await S.verifyMsg(await S.importPeerKey(a.pub), TOPIC, 'c', { ...out[0], t: 1 }), false, 't 被竄改就驗不過');
});
test('早期檢查：s 不是 86 字元、k 不是 87 字元、p 太長、q 不是正整數、內容超過 8 KB 的訊息，在碰 base64 / 驗證 / 佇列之前就丟掉', async () => {
  const a = await S.makeIdentity(); let verifies = 0, imports = 0;
  const sub = globalThis.crypto.subtle;
  const c = { subtle: { importKey: (...x) => { imports++; return sub.importKey(...x); }, digest: (...x) => { imports++; return sub.digest(...x); }, verify: sub.verify.bind(sub) } };
  const { ib, got } = inbox({ c, verify: (...x) => { verifies++; return S.verifyMsg(...x); } });
  const good = await sendAs(a, 'p', { pres: { st: 'x' } }, 1, true);
  for (const bad of [{ ...good, s: good.s + 'A' }, { ...good, s: 'A'.repeat(1e6) }, { ...good, k: 'A'.repeat(88) }, { ...good, k: 'A'.repeat(1e6) }, { ...good, k: 5 }, { ...good, p: 'p' + 'a'.repeat(5000) },
    { ...good, q: 0 }, { ...good, q: 2 ** 60 }, { ...good, pres: { blob: 'x'.repeat(9000) } }]) ib.submit('p', bad);
  await flush(ib);
  assert.equal(verifies, 0); assert.equal(imports, 0, 'importPeerKey / peerIdOf 都沒被呼叫'); assert.equal(got.length, 0);
  ib.submit('p', good); await flush(ib); assert.equal(got.length, 1);
});
test('暫存：過期的暫存在下一次收訊息時就清掉（不必等計時器），總量有上限', async () => {
  let t = 0; const ids = []; for (let i = 0; i < 6; i++) ids.push(await S.makeIdentity());
  const { ib, got } = inbox({ now: () => t, wall: () => t, holdMs: 3000, maxPending: 4 });
  ib.submit('c', await sendAs(ids[0], 'c', { n: 0, c: null, t: 0 }, 1)); await flush(ib);
  t = 3500; ib.submit('c', await sendAs(ids[1], 'c', { n: 1, c: null, t }, 1)); await flush(ib);
  await ib.learn(ids[0].id, ids[0].pub); await flush(ib);
  assert.equal(got.length, 0, '第 0 位的暫存過期了，金鑰到了也不交出');
  for (let i = 2; i < 6; i++) ib.submit('c', await sendAs(ids[i], 'c', { n: i, c: null, t }, 1)); await flush(ib);
  await ib.learn(ids[1].id, ids[1].pub); await flush(ib);
  assert.equal(got.length, 0, '暫存只留 4 個代號：最舊的被擠掉');
});
test('失敗額度：以受害者代號灌大量假簽章，不會耗掉受害者真實訊息的額度', async () => {
  const v = await S.makeIdentity(); const { ib, got } = inbox({ rate: { burst: 5, perSec: 5 }, now: () => 0 });
  await ib.learn(v.id, v.pub);
  for (let q = 1; q <= 40; q++) { ib.submit('c', { p: v.id, q: 1000 + q, s: 'A'.repeat(86), n: q }); await flush(ib); }
  for (let q = 1; q <= 5; q++) ib.submit('c', await sendAs(v, 'c', { n: q, c: null }, q)); await flush(ib);
  assert.equal(got.length, 5, '真實訊息 5 則全部通過');
});
test('失敗額度：被判為可疑（失敗太多）的代號受全域驗證額度限制，其他代號不受影響', async () => {
  const v = await S.makeIdentity(), ok = await S.makeIdentity(); let verifies = 0;
  const { ib, got } = inbox({ now: () => 0, fail: { burst: 2, perSec: 0 }, suspect: { burst: 3, perSec: 0 }, verify: (...x) => { verifies++; return S.verifyMsg(...x); }, rate: { burst: 1000, perSec: 1000 } });
  await ib.learn(v.id, v.pub); await ib.learn(ok.id, ok.pub);
  for (let q = 1; q <= 20; q++) { ib.submit('c', { p: v.id, q: 1000 + q, s: 'A'.repeat(86), t: Date.now() }); await flush(ib); }
  assert.ok(verifies <= 5, '可疑代號最多 2 次失敗額度 + 3 次全域額度：' + verifies);
  ib.submit('c', await sendAs(ok, 'c', { n: 1, c: null }, 1)); await flush(ib);
  assert.equal(got.length, 1);
});
test('競態：匯入金鑰的途中名單先給了金鑰，暫存的舊訊息仍排在前面（序號順序不亂）', async () => {
  const a = await S.makeIdentity(), sub = globalThis.crypto.subtle;
  let release; const gate = new Promise(r => { release = r; }); let first = true;
  const c = { subtle: { digest: sub.digest.bind(sub), verify: sub.verify.bind(sub), importKey: async (...x) => { if (first) { first = false; await gate; } return sub.importKey(...x); } } };
  const { ib, got } = inbox({ c });
  ib.submit('c', await sendAs(a, 'c', { n: 1, c: null }, 1));
  ib.submit('c', await sendAs(a, 'c', { n: 2, c: null }, 2, true));
  await wait(5);
  const learned = ib.learn(a.id, a.pub); await wait(5); release(); await learned; await flush(ib);
  assert.deepEqual(got.map(g => g.body.n), [1, 2]);
});
test('被擠出表的發送者在跑佇列時不會產生重複紀錄；舊序號仍被擋下', async () => {
  const x = await S.makeIdentity(), others = []; for (let i = 0; i < 3; i++) others.push(await S.makeIdentity());
  const verify = async (...a) => { await wait(20); return S.verifyMsg(...a); };
  const { ib, got } = inbox({ maxSenders: 2, verify, rate: { burst: 100, perSec: 100 } });
  for (let q = 1; q <= 3; q++) ib.submit('c', await sendAs(x, 'c', { n: q, c: null }, q, true));
  for (const o of others) ib.submit('c', await sendAs(o, 'c', { n: 0, c: null }, 1, true));
  await flush(ib);
  ib.submit('c', await sendAs(x, 'c', { n: 9, c: null }, 2, true)); await flush(ib);
  assert.deepEqual(got.filter(g => g.id === x.id).map(g => g.body.n), [1, 2, 3], '舊序號 2 被擋下');
});
test('時間戳：只因時鐘誤差被拒絕時，每個發送者只在 console.warn 一次（假簽章不會觸發）', async () => {
  const a = await S.makeIdentity(), b = await S.makeIdentity(), warns = [], w = console.warn; console.warn = (...x) => warns.push(x);
  try {
    const wall = 9_000_000_000_000, { ib, got } = inbox({ wall: () => wall });
    for (let q = 1; q <= 5; q++) ib.submit('c', await sendAs(a, 'c', { n: q, c: null, t: wall - 700_000 }, q, true));
    ib.submit('c', { ...(await sendAs(b, 'c', { n: 1, c: null, t: wall - 700_000 }, 1, true)), s: 'A'.repeat(86) });
    await flush(ib);
    assert.equal(got.length, 0); assert.equal(warns.length, 1, 'a 一次；b 的簽章是假的，不記錄');
    assert.ok(warns[0].includes(a.id));
  } finally { console.warn = w; }
});
test('時間戳：窗外的假訊息也算失敗：失敗額度用完後不再花驗證（已知金鑰的代號）', async () => {
  const v = await S.makeIdentity(); let verifies = 0, warns = 0; const w = console.warn; console.warn = () => { warns++; };
  try {
    const wall = 9_000_000_000_000, { ib, got } = inbox({ wall: () => wall, fail: { burst: 3, perSec: 0 }, verify: (...x) => { verifies++; return S.verifyMsg(...x); } });
    await ib.learn(v.id, v.pub);
    for (let q = 1; q <= 30; q++) { ib.submit('c', { p: v.id, q, s: 'A'.repeat(86), t: wall - 700_000 }); await flush(ib); }
    assert.equal(verifies, 3, '最多花掉失敗額度那麼多次');
    ib.submit('c', await sendAs(v, 'c', { n: 1, c: null, t: wall }, 100)); await flush(ib);
    assert.equal(got.length, 1, '真實的新訊息仍通過'); assert.equal(warns, 0);
  } finally { console.warn = w; }
});
