// 模擬傳輸層（?mockroom=1）與 Supabase 走同一套簽章：用 node 的 BroadcastChannel 在同一個程序裡跑兩個「分頁」，不開瀏覽器。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const s0 = html.indexOf('\nasync function makeMockRoom('), e0 = html.indexOf('\n}\n', s0);
assert.ok(s0 >= 0 && e0 > s0, '找不到 makeMockRoom');
const SRC = `${block('netcode')}\n${block('supa')}\n${block('sign')}\n${html.slice(s0, e0 + 3)}\nreturn { makeMockRoom, makeIdentity, signPayload };`;
const wait = ms => new Promise(r => setTimeout(r, ms));
const all = [];
class BC extends BroadcastChannel { constructor(n) { super(n); all.push(this); } }
const noTimers = (fn, ms) => 0; // 心跳與逾時計時器不需要：訊息靠建立時的 hi / 送出
const env = { addEventListener() {} };
const load = () => new Function('BroadcastChannel', 'window', 'navigator', 'setInterval', SRC)(BC, env, { onLine: true }, noTimers);
const g = load();
const me = room => room.peers().find(p => p.isMe).peer;
const seen = (room, id) => (room.peers().find(p => p.peer === id) || {}).presence;
test.after(() => { for (const b of all) b.close(); });

test('模擬傳輸層：兩個分頁互相看到簽章後的狀態；離開（簽章的 x）後對方的名單移除它', async () => {
  const A = (await g.makeMockRoom()).room, B = (await g.makeMockRoom()).room;
  const ra = await A.join('room1'), rb = await B.join('room1');
  await ra.presence({ st: 'waiting', nk: 'A' }); await rb.presence({ st: 'racing', nk: 'B' });
  await wait(300);
  assert.equal(seen(rb, me(ra)).nk, 'A'); assert.equal(seen(ra, me(rb)).st, 'racing');
  assert.notEqual(me(ra), me(rb));
  assert.match(me(ra), /^p[a-z0-9]{20}$/);
  await ra.leave(); await wait(300);
  assert.equal(seen(rb, me(ra)), undefined, '簽章的離開訊息讓對方立刻移除');
});
test('模擬傳輸層：沒簽章、簽章不是本人、換頻道重播的偽造訊息都被丟掉', async () => {
  const A = (await g.makeMockRoom()).room, B = (await g.makeMockRoom()).room;
  const ra = await A.join('room2'), rb = await B.join('room2');
  await ra.presence({ st: 'waiting', nk: 'A' }); await wait(250);
  const idA = me(ra), evil = new BC('yatouge-mockroom'), who = await g.makeIdentity();
  evil.postMessage({ k: 'p', s: 'room2', d: { p: idA, q: 99999, s: 'A'.repeat(86), pres: { st: 'finished', ft: 0.001 } } });
  evil.postMessage({ k: 'p', s: 'room2', peer: idA, pres: { st: 'finished', ft: 0.001 } });
  const forged = await g.signPayload(who, 'yatouge-mockroom/room2', 'p', 5, { pres: { st: 'finished', ft: 0.001 } }, true);
  evil.postMessage({ k: 'p', s: 'room2', d: { ...forged, p: idA } });
  const other = await g.signPayload(who, 'yatouge-mockroom/other', 'p', 6, { pres: { st: 'finished' } }, true);
  evil.postMessage({ k: 'p', s: 'room2', d: other });
  await wait(300);
  assert.equal(seen(rb, idA).st, 'waiting'); assert.equal(seen(rb, idA).ft, undefined);
  assert.equal(rb.peers().length, 2, '偽造者沒有變成名單裡的人');
  evil.postMessage({ k: 'p', s: 'room2', d: await g.signPayload(who, 'yatouge-mockroom/room2', 'p', 7, { pres: { st: 'racing' }, t: Date.now() }, true) });
  await wait(200);
  assert.equal(rb.peers().length, 3, '用自己的身分、簽章正確的訊息則照常收下（他是另一位玩家）');
});
