// 聊天：抽出 yatouge.html 的 @netcode + @spectate + @chat（純函式）— 訊息清理與截斷、送出頻率、收到時的頻率上限與去重、
// 訊息列表上限、觀戰者標示、誰可以在房間裡發言、靜音、T 鍵只在線上有作用
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const M = new Function(`${block('netcode')}\n${block('spectate')}\n${block('chat')}
return { CHAT, cleanChat, chatGate, chatOut, chatField, chatRx, chatPush, chatShown, chatFrom, chatLive, chatKey };`)();
const { CHAT, cleanChat, chatGate, chatOut, chatField, chatRx, chatPush, chatShown, chatFrom, chatLive, chatKey } = M;

const PL = (o = {}) => ({ v: 2, st: 'waiting', car: 'hatch', col: 0, trk: 'kurosagi', nk: 'Bob', ...o });
const SP = (o = {}) => ({ v: 1, role: 'spectator', nk: 'Eve', ...o });
const PEER = (peer, presence, o = {}) => ({ peer, by: null, isMe: false, kind: 'viewer', updatedAt: 1, presence, ...o });

/* ---------- 常數 ---------- */
test('CHAT：80 字、1.5 秒一則、保留 30 則、約 6 秒淡出', () => {
  assert.equal(CHAT.MAX, 80);
  assert.equal(CHAT.GAP_MS, 1500);
  assert.equal(CHAT.LIST, 30);
  assert.equal(CHAT.FADE_MS, 6000);
  assert.ok(CHAT.KEEP >= 2 && CHAT.KEEP <= 4, '狀態裡只帶最近幾則');
});

/* ---------- cleanChat ---------- */
test('cleanChat：去掉控制字元與不可見字元、去頭尾空白；空的就是 null', () => {
  assert.equal(cleanChat('  hi  '), 'hi');
  assert.equal(cleanChat('a\u0000b\u0007c\nd\r\te'), 'abcde');
  assert.equal(cleanChat('x\u200b\u202ey\u2066z\ufeff'), 'xyz', '零寬與雙向控制字元');
  assert.equal(cleanChat('\u0085\u009fq'), 'q', 'C1 控制字元');
  assert.equal(cleanChat('<b>x</b>'), '<b>x</b>', 'HTML 原樣保留（畫面一律用 textContent）');
  assert.equal(cleanChat('你好 👋'), '你好 👋');
  for (const bad of ['', '   ', '\u0000\n\t', '\u200b', null, undefined, 5, {}, ['a']]) assert.equal(cleanChat(bad), null, JSON.stringify(bad));
});
test('cleanChat：超過 80 字截斷（以字元計，emoji 不會被切半）', () => {
  assert.equal(cleanChat('a'.repeat(81)), 'a'.repeat(80));
  assert.equal(cleanChat('a'.repeat(500)).length, 80);
  const emo = cleanChat('😀'.repeat(90));
  assert.equal(Array.from(emo).length, 80);
  assert.equal(emo, '😀'.repeat(80));
  assert.equal(cleanChat('字'.repeat(80)), '字'.repeat(80), '剛好 80 字不截');
  assert.equal(cleanChat('a'.repeat(79) + ' b'), 'a'.repeat(79), '截斷後的尾端空白也去掉');
});

/* ---------- chatGate（送出頻率） ---------- */
test('chatGate：上一則送出後 1.5 秒內不能再送，並回傳還要等多久', () => {
  assert.deepEqual(chatGate(-Infinity, 0), { ok: true, wait: 0 }, '第一則');
  assert.deepEqual(chatGate(1000, 2500), { ok: true, wait: 0 }, '剛好 1.5 秒');
  assert.deepEqual(chatGate(1000, 1001), { ok: false, wait: 1499 });
  assert.deepEqual(chatGate(1000, 2499.5), { ok: false, wait: 1 });
});

/* ---------- chatOut（自己的滾動欄位） ---------- */
test('chatOut：附上新的一則，只留最近 KEEP 則，不改動原陣列', () => {
  const a = chatOut([], 1, 'one');
  assert.deepEqual(a, [[1, 'one']]);
  let ch = a;
  for (let i = 2; i <= 10; i++) ch = chatOut(ch, i, 'm' + i);
  assert.equal(ch.length, CHAT.KEEP);
  assert.deepEqual(ch[ch.length - 1], [10, 'm10']);
  assert.deepEqual(a, [[1, 'one']], '原陣列不變');
  assert.deepEqual(chatOut(undefined, 3, 'x'), [[3, 'x']]);
  const big = chatOut(chatOut(chatOut([], 1, '😀'.repeat(80)), 2, '字'.repeat(80)), 3, '😀'.repeat(80));
  assert.ok(new TextEncoder().encode(JSON.stringify({ ch: big })).length < 1200, '最多幾則滿字的訊息也遠小於 4 KiB');
});

/* ---------- chatField（收到的欄位） ---------- */
test('chatField：只接受 [序號, 文字]；清理文字並依序號排序', () => {
  assert.deepEqual(chatField([[2, ' b '], [1, 'a']]), [{ seq: 1, text: 'a' }, { seq: 2, text: 'b' }]);
  assert.deepEqual(chatField([[1, 'a'], [1, 'dup']]), [{ seq: 1, text: 'a' }], '同一個序號只算一次');
  assert.deepEqual(chatField([[1, 'x'.repeat(200)]]), [{ seq: 1, text: 'x'.repeat(80) }], '收到時也截到 80 字');
  for (const bad of [[0, 'zero'], [-1, 'neg'], [1.5, 'f'], ['2', 's'], [3], [4, 5], [5, ''], [6, '  '], null, 'x', [7, 'y', 'extra'], [CHAT.MAX_SEQ + 1, 'big']])
    assert.deepEqual(chatField([[1, 'ok'], bad]), [{ seq: 1, text: 'ok' }], '壞掉的項目個別丟掉：' + JSON.stringify(bad));
  assert.deepEqual(chatField([[1, 'x'.repeat(CHAT.RAW + 1)]]), [], '原始字串太長：不處理');
});
test('chatField：不是陣列、或超過 KEEP 則，整個欄位忽略', () => {
  for (const bad of [undefined, null, 1, 'hi', {}, { 0: [1, 'a'] }]) assert.deepEqual(chatField(bad), [], JSON.stringify(bad));
  const many = Array.from({ length: CHAT.KEEP + 1 }, (_, i) => [i + 1, 'm']);
  assert.deepEqual(chatField(many), []);
});

/* ---------- chatRx（收到：去重、頻率上限、暱稱與觀戰標示） ---------- */
test('chatRx：新訊息帶出暱稱；同一份狀態再收到一次不會重複顯示', () => {
  const p1 = PL({ ch: [[1, 'hello']] });
  let r = chatRx(new Map(), 'bob', p1, 1000);
  assert.equal(r.msgs.length, 1);
  assert.deepEqual({ ...r.msgs[0] }, { peer: 'bob', seq: 1, text: 'hello', nk: 'Bob', spec: false, me: false, at: 1000 });
  const again = chatRx(r.rx, 'bob', p1, 1100);
  assert.deepEqual(again.msgs, []);
  assert.equal(again.rx, r.rx, '沒有新東西：同一個狀態物件');
  r = chatRx(r.rx, 'bob', PL({ ch: [[1, 'hello'], [2, 'again']] }), 3000);
  assert.deepEqual(r.msgs.map(m => m.text), ['again'], '只顯示序號比上次大的');
});
test('chatRx：觀戰者的訊息標示 spec；暱稱不合法就是 null（畫面顯示「玩家」）', () => {
  const r = chatRx(new Map(), 'eve', SP({ ch: [[1, 'go go']] }), 0);
  assert.equal(r.msgs[0].spec, true);
  assert.equal(r.msgs[0].nk, 'Eve');
  const n = chatRx(new Map(), 'x', PL({ nk: '\u200b', ch: [[1, 'hi']] }), 0);
  assert.equal(n.msgs[0].nk, null);
  const fake = chatRx(new Map(), 'y', PL({ role: 'Spectator', ch: [[1, 'hi']] }), 0);
  assert.equal(fake.msgs[0].spec, false, '只有 role === spectator 才標觀戰');
});
test('chatRx：同一人送太快，多的丟掉（每 1.5 秒一則，剛加入時可補看最近 KEEP 則）', () => {
  const hist = Array.from({ length: CHAT.KEEP }, (_, i) => [i + 1, 'h' + (i + 1)]);
  let r = chatRx(new Map(), 'm', PL({ ch: hist }), 0);
  assert.equal(r.msgs.length, CHAT.KEEP, '加入時已經在狀態裡的最近幾則都看得到');
  // a client that ignores the send limit: a new message every 100 ms for 6 s
  let shown = 0, ch = hist, seq = CHAT.KEEP;
  for (let t = 100; t <= 6000; t += 100) { ch = [...ch, [++seq, 'spam' + seq]].slice(-CHAT.KEEP); r = chatRx(r.rx, 'm', PL({ ch }), t); shown += r.msgs.length; }
  assert.ok(shown <= 4, `6 秒內最多 4 則（實際 ${shown}）`);
  assert.ok(shown >= 3, `仍持續放行合理的頻率（實際 ${shown}）`);
  const late = chatRx(r.rx, 'm', PL({ ch }), 6100);
  assert.deepEqual(late.msgs, [], '丟掉的訊息之後也不會補出現');
});
test('chatRx：正常速度（1.5 秒一則）、偶爾兩則一起到，全部顯示', () => {
  let r = { rx: new Map() }, ch = [], shown = [];
  for (let i = 1; i <= 8; i++) {
    ch = chatOut(ch, i, 'n' + i);
    if (i % 3 === 1) continue; // that update was lost: the next one carries both
    r = chatRx(r.rx, 'ok', PL({ ch }), i * 1500); shown.push(...r.msgs.map(m => m.text));
  }
  assert.deepEqual(shown, ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8'], '依序、不重複、遺失的那次由下一份狀態補上');
});
test('chatRx：壞資料、無效的 peer、沒有 ch 都不產生訊息', () => {
  const rx = new Map();
  for (const [peer, pres] of [['a', null], ['a', 'x'], ['a', PL()], ['a', PL({ ch: 'hi' })], ['a', PL({ ch: [[0, 'x']] })], ['', PL({ ch: [[1, 'x']] })], [5, PL({ ch: [[1, 'x']] })], ['a\u200bb', PL({ ch: [[1, 'x']] })]]) {
    const r = chatRx(rx, peer, pres, 0);
    assert.deepEqual(r.msgs, [], JSON.stringify([peer, pres]));
    assert.equal(r.rx, rx);
  }
});
test('chatRx：追蹤的發言者數量有上限', () => {
  let rx = new Map();
  for (let i = 0; i < CHAT.MAX_PEERS; i++) rx = chatRx(rx, 'p' + i, PL({ ch: [[1, 'x']] }), 0).rx;
  assert.equal(rx.size, CHAT.MAX_PEERS);
  const r = chatRx(rx, 'extra', PL({ ch: [[1, 'x']] }), 0);
  assert.deepEqual(r.msgs, []);
  assert.equal(r.rx.size, CHAT.MAX_PEERS);
});

/* ---------- chatPush / chatShown / chatLive ---------- */
test('chatPush：最多保留最近 30 則', () => {
  let list = [];
  for (let i = 0; i < 45; i++) list = chatPush(list, [{ text: 't' + i }]);
  assert.equal(list.length, CHAT.LIST);
  assert.equal(list[0].text, 't15');
  assert.equal(list[29].text, 't44');
  assert.equal(chatPush(list, []), list, '沒有新訊息：同一個陣列');
});
test('chatShown：關掉「聊天訊息」只留自己的', () => {
  const list = [{ text: 'a', me: false }, { text: 'b', me: true }, { text: 'c', me: false }];
  assert.equal(chatShown(list, true), list);
  assert.deepEqual(chatShown(list, false).map(m => m.text), ['b']);
});
test('chatLive：比賽中的訊息約 6 秒後淡出', () => {
  assert.equal(chatLive({ at: 1000 }, 1000), true);
  assert.equal(chatLive({ at: 1000 }, 6999), true);
  assert.equal(chatLive({ at: 1000 }, 7000), false);
});

/* ---------- chatFrom（誰可以在房間裡發言） ---------- */
test('chatFrom：這場的玩家與有效的觀戰者；不含自己、別的玩家、agent', () => {
  const peers = [
    PEER('me', PL(), { isMe: true }), PEER('opp', PL()), PEER('w1', SP()), PEER('w2', SP({ v: 9 })), PEER('third', PL()),
    PEER('bot', SP(), { kind: 'agent' }), null, PEER('', SP())
  ];
  assert.deepEqual(chatFrom(peers, ['opp']).map(x => x.peer), ['opp', 'w1']);
  assert.deepEqual(chatFrom(peers, ['opp', 'third']).map(x => x.peer), ['opp', 'w1', 'third']);
  assert.deepEqual(chatFrom(peers, []).map(x => x.peer), ['w1']);
  assert.deepEqual(chatFrom(null, ['opp']), []);
});

/* ---------- chatKey（T 鍵） ---------- */
test('chatKey：T 只在線上（房間、比賽中、觀戰）有作用；單人、計時賽、送酒模式不做事', () => {
  const K = (o = {}) => chatKey({ code: 'KeyT', repeat: false, mod: false, online: true, spec: false, room: false, state: 'race', ...o });
  assert.equal(K(), 'race');
  assert.equal(K({ state: 'count' }), 'race');
  assert.equal(K({ room: true, state: 'title' }), 'room');
  assert.equal(K({ spec: true, online: false, state: 'watch' }), 'spec');
  assert.equal(K({ online: false }), null, '單人（包含計時賽、送酒模式）');
  assert.equal(K({ online: false, state: 'title' }), null);
  assert.equal(K({ state: 'title' }), null, '線上但在結果畫面：沒有輸入列');
  assert.equal(K({ state: 'done' }), null);
  assert.equal(K({ repeat: true }), null);
  assert.equal(K({ mod: true }), null, 'Ctrl / Alt / Meta + T 留給瀏覽器');
  assert.equal(K({ code: 'KeyY' }), null);
});
