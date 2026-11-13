// 自訂按鍵：抽出 yatouge.html 的 @keybind（純函式：預設值、讀取與驗證、依按鍵查動作、衝突互換、固定鍵拒絕、按鍵名稱）
// 以及 @gamepad / @chat（手把與 T 鍵改走目前的設定後，預設仍與改動前完全相同）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const K = new Function(`${block('keybind')}
return { KB, KB_DEF, kbLoad, kbSave, kbKeyAction, kbPadAction, kbSetKey, kbClearKey, kbSetPad, kbReset, kbKeyLabel, kbPadLabel, kbShort };`)();
const G = new Function(`${block('gamepad')}\nreturn { GP, gpDrive, gpAction };`)();
const C = new Function(`${block('netcode')}\n${block('spectate')}\n${block('chat')}\nreturn { chatKey };`)();
const { KB, KB_DEF, kbLoad, kbSave, kbKeyAction, kbPadAction, kbSetKey, kbClearKey, kbSetPad, kbReset, kbKeyLabel, kbPadLabel, kbShort } = K;
const def = () => kbLoad(null);

/* ---------- 改動前程式碼裡的按鍵（從 keydown / keyup 與 @gamepad 抄下來） ---------- */
const TODAY_KEYS = { // const KEYMAP + Shift / Z / C / M / T 的判斷
  ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'hb',
  ShiftLeft: 'shiftUp', ShiftRight: 'shiftUp', KeyZ: 'shiftDown', KeyC: 'cam', KeyM: 'music', KeyT: 'chat',
};
const TODAY_PAD = { 7: 'gas', 6: 'brake', 3: 'hb', 5: 'shiftUp', 4: 'shiftDown', 12: 'cam', 8: 'music' }; // RT LT Y RB LB 十字上 View
const OTHER_CODES = ['KeyR', 'Escape', 'Enter', 'Tab', 'Digit1', 'Digit2', 'Digit3', 'Numpad1', 'KeyQ', 'KeyE', 'KeyX', 'KeyF', 'ControlLeft', 'AltLeft', 'Digit4', 'Backspace', 'NumpadEnter', 'KeyJ'];

test('預設值與改動前每一個鍵完全相同', () => {
  const b = def();
  for (const [code, a] of Object.entries(TODAY_KEYS)) assert.equal(kbKeyAction(b, code), a, code);
  for (const code of OTHER_CODES) assert.equal(kbKeyAction(b, code), null, code);
  assert.deepEqual(b.keys, {
    gas: ['ArrowUp', 'KeyW'], brake: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], hb: ['Space'],
    shiftUp: ['ShiftLeft', 'ShiftRight'], shiftDown: ['KeyZ'], cam: ['KeyC'], music: ['KeyM'], chat: ['KeyT'],
  });
  assert.deepEqual(KB.ACTIONS, ['gas', 'brake', 'left', 'right', 'hb', 'shiftUp', 'shiftDown', 'cam', 'music', 'chat']);
});

test('手把預設與改動前完全相同（每個按鈕、每個情境）', () => {
  const b = def();
  for (let i = 0; i < 17; i++) assert.equal(kbPadAction(b, i), TODAY_PAD[i] || null, String(i));
  for (const ctx of ['drive', 'ui', 'spec']) for (let i = 0; i < 17; i++) assert.equal(G.gpAction(i, ctx, b.pad), G.gpAction(i, ctx), `${ctx} ${i}`);
  const f = Array(16).fill(false);
  for (let m = 0; m < 1 << 16; m += 257) { // 各種按鈕組合
    const bt = f.map((_, i) => !!(m & (1 << i)));
    for (const x of [0, -1, 0.5]) assert.deepEqual(G.gpDrive(bt, x, b.pad), G.gpDrive(bt, x), `${m} ${x}`);
  }
});

test('改動前的手把行為仍成立（gpAction / gpDrive 沒給設定時）', () => {
  assert.equal(G.gpAction(12, 'drive'), 'cam');
  assert.equal(G.gpAction(8, 'ui'), 'music');
  assert.equal(G.gpAction(12, 'ui'), 'up');
  const f = Array(16).fill(false), b = f.slice(); b[7] = b[6] = b[3] = true;
  assert.deepEqual(G.gpDrive(b, -1), { gas: true, brake: true, hb: true, steer: -1 });
});

/* ---------- 讀取與驗證 ---------- */
test('kbLoad：沒有資料、壞掉的 JSON、版本不對都回到預設', () => {
  for (const raw of [null, undefined, '', 'x', '{', '[]', '5', 'null', JSON.stringify({ v: 99, keys: { gas: ['KeyJ'] } }), JSON.stringify({ keys: { gas: ['KeyJ'] } })])
    assert.deepEqual(kbLoad(raw), def(), String(raw));
});

test('kbLoad / kbSave：存了再讀回來一樣，帶版本號', () => {
  let b = kbSetKey(def(), 'gas', 0, 'KeyI').b;
  b = kbSetPad(b, 'hb', 2).b;
  const s = kbSave(b), o = JSON.parse(s);
  assert.equal(o.v, KB.V);
  assert.deepEqual(kbLoad(s), b);
  assert.equal(KB.STORE, 'yatouge-keys');
});

test('kbLoad：壞掉的單一動作回到該動作的預設，其他保留', () => {
  const raw = JSON.stringify({ v: KB.V, keys: { gas: ['KeyI'], brake: 'x', left: [], right: ['KeyL', 'KeyL'], hb: ['Escape'], cam: ['KeyV', 'KeyB', 'KeyN'], music: [5] }, pad: { hb: 2, gas: 'RT', brake: 99, cam: 0, music: 1.5 } });
  const b = kbLoad(raw), d = def();
  assert.deepEqual(b.keys.gas, ['KeyI']);
  for (const a of ['brake', 'left', 'right', 'hb', 'cam', 'music', 'shiftUp', 'chat']) assert.deepEqual(b.keys[a], d.keys[a], a);
  assert.equal(b.pad.hb, 2);
  for (const a of ['gas', 'brake', 'cam', 'music']) assert.equal(b.pad[a], d.pad[a], a);
});

test('kbLoad：回到預設後兩個動作撞同一個鍵 → 那一頁整頁回到預設（不會有一鍵兩用）', () => {
  const raw = JSON.stringify({ v: KB.V, keys: { gas: ['KeyT'], chat: 'bad' }, pad: { gas: 3, hb: 'bad' } });
  const b = kbLoad(raw);
  assert.deepEqual(b.keys, def().keys);
  assert.deepEqual(b.pad, def().pad);
});

test('kbLoad：不認得的動作、原型上的名字一律忽略', () => {
  const b = kbLoad('{"v":1,"keys":{"__proto__":["KeyJ"],"fly":["KeyJ"]},"pad":{"constructor":2}}');
  assert.deepEqual(b, def());
  assert.equal(kbKeyAction(b, 'KeyJ'), null);
  assert.equal(kbKeyAction(b, 'constructor'), null);
  assert.equal(kbKeyAction(b, 'toString'), null);
});

/* ---------- 改鍵、互換、拒絕 ---------- */
test('kbSetKey：換成沒用過的鍵；新鍵生效、舊鍵失效；原物件不變', () => {
  const d = def(), r = kbSetKey(d, 'gas', 0, 'KeyI');
  assert.equal(r.res, 'set');
  assert.deepEqual(r.b.keys.gas, ['KeyI', 'KeyW']);
  assert.equal(kbKeyAction(r.b, 'KeyI'), 'gas');
  assert.equal(kbKeyAction(r.b, 'ArrowUp'), null);
  assert.deepEqual(d.keys.gas, ['ArrowUp', 'KeyW']);
});

test('kbSetKey：鍵已被其他動作使用 → 互換，回報對方', () => {
  const r = kbSetKey(def(), 'gas', 1, 'KeyS');
  assert.equal(r.res, 'swap');
  assert.equal(r.with, 'brake');
  assert.deepEqual(r.b.keys.gas, ['ArrowUp', 'KeyS']);
  assert.deepEqual(r.b.keys.brake, ['ArrowDown', 'KeyW']);
});

test('kbSetKey：第二格（空的）加上新鍵；加上別人的鍵時從對方移過來，對方只剩這個鍵就拒絕', () => {
  let r = kbSetKey(def(), 'hb', 1, 'KeyB');
  assert.equal(r.res, 'set'); assert.deepEqual(r.b.keys.hb, ['Space', 'KeyB']);
  r = kbSetKey(def(), 'hb', 1, 'KeyW');
  assert.equal(r.res, 'moved'); assert.equal(r.with, 'gas');
  assert.deepEqual(r.b.keys.hb, ['Space', 'KeyW']); assert.deepEqual(r.b.keys.gas, ['ArrowUp']);
  r = kbSetKey(def(), 'hb', 1, 'KeyC');
  assert.equal(r.res, 'last'); assert.equal(r.with, 'cam');
  assert.deepEqual(r.b, def());
});

test('kbSetKey：同一個動作的另一格 → 兩格對調；同一格同一鍵 → 不變', () => {
  let r = kbSetKey(def(), 'gas', 0, 'KeyW');
  assert.equal(r.res, 'set'); assert.deepEqual(r.b.keys.gas, ['KeyW', 'ArrowUp']);
  r = kbSetKey(def(), 'gas', 0, 'ArrowUp');
  assert.equal(r.res, 'same'); assert.deepEqual(r.b, def());
});

test('kbSetKey：Esc、Enter、Tab、R、觀戰 1/2/3、Win 鍵固定，拒絕；壞的鍵碼拒絕', () => {
  for (const code of ['Escape', 'Enter', 'NumpadEnter', 'Tab', 'KeyR', 'Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3', 'MetaLeft', 'MetaRight']) {
    const r = kbSetKey(def(), 'gas', 0, code);
    assert.equal(r.res, 'fixed', code); assert.deepEqual(r.b, def());
  }
  for (const code of ['', 'Unidentified', null, 5, 'a b', '<x>']) assert.equal(kbSetKey(def(), 'gas', 0, code).res, 'bad', String(code));
  assert.equal(kbSetKey(def(), 'fly', 0, 'KeyJ').res, 'bad');
  assert.equal(kbSetKey(def(), 'gas', 2, 'KeyJ').res, 'bad');
});

test('kbSetKey：只有一個鍵的動作，第二格以後的格子要先有第一格（slot 1 只在有一個鍵時可用）', () => {
  const r = kbSetKey(def(), 'cam', 1, 'KeyV');
  assert.deepEqual(r.b.keys.cam, ['KeyC', 'KeyV']);
});

test('kbSetKey：只有一個鍵的動作，把它的鍵設到第二格 → 不變（沒有第二格可對調，不能留下空洞）', () => {
  const r = kbSetKey(def(), 'cam', 1, 'KeyC');
  assert.equal(r.res, 'same'); assert.deepEqual(r.b, def());
});

test('kbClearKey：兩個鍵時可以移除其中一個，只剩一個時不行', () => {
  let r = kbClearKey(def(), 'gas', 0);
  assert.equal(r.res, 'cleared'); assert.deepEqual(r.b.keys.gas, ['KeyW']);
  r = kbClearKey(r.b, 'gas', 0);
  assert.equal(r.res, 'last'); assert.deepEqual(r.b.keys.gas, ['KeyW']);
});

test('kbSetPad：換成沒用過的按鈕（Y→X）', () => {
  const r = kbSetPad(def(), 'hb', 2);
  assert.equal(r.res, 'set');
  assert.equal(kbPadAction(r.b, 2), 'hb'); assert.equal(kbPadAction(r.b, 3), null);
});

test('kbSetPad：衝突互換（LB/RB 對調），空的一方則從對方移過來', () => {
  let r = kbSetPad(def(), 'shiftUp', 4);
  assert.equal(r.res, 'swap'); assert.equal(r.with, 'shiftDown');
  assert.equal(r.b.pad.shiftUp, 4); assert.equal(r.b.pad.shiftDown, 5);
  r = kbSetPad(def(), 'chat', 12);
  assert.equal(r.res, 'moved'); assert.equal(r.with, 'cam');
  assert.equal(r.b.pad.chat, 12); assert.equal(r.b.pad.cam, null);
});

test('kbSetPad：A、B、Menu、十字下/左/右固定；十字上可以設定（鏡頭）；扳機可當按鈕', () => {
  for (const i of [0, 1, 9, 13, 14, 15]) assert.equal(kbSetPad(def(), 'cam', i).res, 'fixed', String(i));
  for (const bad of [-1, 16, 1.5, '3', null]) assert.equal(kbSetPad(def(), 'cam', bad).res, 'bad', String(bad));
  let r = kbSetPad(kbSetPad(def(), 'cam', 2).b, 'cam', 12);
  assert.equal(r.res, 'set'); assert.equal(r.b.pad.cam, 12);
  r = kbSetPad(def(), 'hb', 7);
  assert.equal(r.res, 'swap'); assert.equal(r.b.pad.hb, 7); assert.equal(r.b.pad.gas, 3);
});

test('kbReset：每一頁各自恢復預設', () => {
  let b = kbSetKey(def(), 'gas', 0, 'KeyI').b; b = kbSetPad(b, 'hb', 2).b;
  const k = kbReset(b, 'keys');
  assert.deepEqual(k.keys, def().keys); assert.equal(k.pad.hb, 2);
  const p = kbReset(b, 'pad');
  assert.deepEqual(p.pad, def().pad); assert.deepEqual(p.keys.gas, ['KeyI', 'KeyW']);
});

test('預設值物件不會被改到', () => {
  const b = def(); b.keys.gas.push('KeyJ'); b.pad.gas = 0;
  assert.deepEqual(def().keys.gas, ['ArrowUp', 'KeyW']);
  assert.equal(def().pad.gas, 7);
  assert.ok(Object.isFrozen(KB_DEF));
});

/* ---------- 改過的設定真的生效 ---------- */
test('改過之後：手把動作與駕駛都跟著設定走', () => {
  let b = kbSetPad(def(), 'hb', 2).b; b = kbSetPad(b, 'shiftUp', 4).b; b = kbSetPad(b, 'cam', 10).b; b = kbSetPad(b, 'chat', 12).b;
  assert.equal(G.gpAction(4, 'drive', b.pad), 'shiftUp');
  assert.equal(G.gpAction(5, 'drive', b.pad), 'shiftDown');
  assert.equal(G.gpAction(10, 'drive', b.pad), 'cam');
  assert.equal(G.gpAction(12, 'drive', b.pad), 'chat');
  assert.equal(G.gpAction(12, 'ui', b.pad), 'up', '選單裡十字上仍是移動焦點');
  assert.equal(G.gpAction(9, 'drive', b.pad), 'menu');
  const f = Array(16).fill(false), x = f.slice(); x[2] = true;
  assert.equal(G.gpDrive(x, 0, b.pad).hb, true);
  const y = f.slice(); y[3] = true;
  assert.equal(G.gpDrive(y, 0, b.pad).hb, false);
});

test('手把左轉 / 右轉設成按鈕：按下就是全舵，搖桿有推時以搖桿為準', () => {
  let b = kbSetPad(def(), 'left', 2).b; b = kbSetPad(b, 'right', 10).b;
  const f = Array(16).fill(false), l = f.slice(); l[2] = true;
  const r = f.slice(); r[10] = true;
  assert.equal(G.gpDrive(l, 0, b.pad).steer, -1);
  assert.equal(G.gpDrive(r, 0, b.pad).steer, 1);
  assert.equal(G.gpDrive(f, 0, b.pad).steer, null);
  assert.equal(G.gpDrive(l, 1, b.pad).steer, 1);
});

test('chatKey：聊天鍵依設定；沒給時仍是 T', () => {
  const base = { repeat: false, mod: false, online: true, spec: false, room: true, state: 'title' };
  assert.equal(C.chatKey({ ...base, code: 'KeyT' }), 'room');
  assert.equal(C.chatKey({ ...base, code: 'KeyY', keys: ['KeyY'] }), 'room');
  assert.equal(C.chatKey({ ...base, code: 'KeyT', keys: ['KeyY'] }), null);
});

/* ---------- 名稱 ---------- */
test('kbKeyLabel：好讀的名稱；提示用的短名不分左右', () => {
  assert.equal(kbKeyLabel('ArrowUp', 'zh'), '↑');
  assert.equal(kbKeyLabel('ArrowLeft', 'en'), '←');
  assert.equal(kbKeyLabel('KeyW', 'en'), 'W');
  assert.equal(kbKeyLabel('Digit4', 'en'), '4');
  assert.equal(kbKeyLabel('Space', 'zh'), 'Space');
  assert.equal(kbKeyLabel('ShiftLeft', 'zh'), '左 Shift');
  assert.equal(kbKeyLabel('ShiftRight', 'en'), 'Right Shift');
  assert.equal(kbKeyLabel('ShiftRight', 'en', true), 'Shift');
  assert.equal(kbKeyLabel('Escape', 'en'), 'Esc');
  assert.equal(kbKeyLabel('Numpad5', 'en'), 'Num 5');
  assert.equal(kbKeyLabel('Semicolon', 'en'), ';');
  assert.equal(kbKeyLabel('F5', 'en'), 'F5');
});

test('kbPadLabel：Xbox 按鈕名稱；十字上依語言；沒設定為 —', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => kbPadLabel(i, 'en')), ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS']);
  assert.equal(kbPadLabel(12, 'zh'), '十字鍵上');
  assert.equal(kbPadLabel(12, 'en'), 'D-pad up');
  assert.equal(kbPadLabel(null, 'en'), '—');
});

test('kbShort：提示列用的短名（Shift 左右合併、依設定順序）', () => {
  assert.deepEqual(kbShort(def(), 'shiftUp', 'zh'), ['Shift']);
  assert.deepEqual(kbShort(def(), 'gas', 'zh'), ['↑', 'W']);
  assert.deepEqual(kbShort(kbSetKey(def(), 'chat', 0, 'KeyY').b, 'chat', 'en'), ['Y']);
});
