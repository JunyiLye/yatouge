// 抽出 yatouge.html 內 @onlinestatus 區塊（純函式）後在 Node 執行
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const { onlineStatus, ONLINE_CONNECTED_GRACE_MS } = new Function(`${block('onlinestatus')}\nreturn { onlineStatus, ONLINE_CONNECTED_GRACE_MS };`)();
const base = { hasClaude: true, room: 'ok', perm: 'granted', connected: true, isMeSeen: true, elapsed: 0, errCode: null };
const S = (o = {}) => onlineStatus({ ...base, ...o });

test('沒有 window.claude：只能在 claude.ai 內使用', () => {
  assert.deepEqual(S({ hasClaude: false, room: 'pending' }), { key: 'notClaude', enabled: false, action: null });
});
test('use() 還沒回答：連線中', () => {
  assert.deepEqual(S({ room: 'pending', perm: null }), { key: 'connecting', enabled: false, action: null });
});
test('room 為 null 且 permissions 為 null / unavailable：不在 claude.ai', () => {
  for (const perm of [null, 'unavailable']) assert.equal(S({ room: 'null', perm }).key, 'notClaude');
  assert.equal(S({ room: 'null', perm: 'unavailable' }).enabled, false);
});
test('room 為 null 且 prompt：需要允許，附 allow 動作', () => {
  assert.deepEqual(S({ room: 'null', perm: 'prompt' }), { key: 'needPerm', enabled: false, action: 'allow' });
});
test('room 為 null 且 denied：附 manage 動作', () => {
  assert.deepEqual(S({ room: 'null', perm: 'denied' }), { key: 'denied', enabled: false, action: 'manage' });
});
test('看到 isMe：啟用', () => {
  assert.deepEqual(S(), { key: 'ready', enabled: true, action: null });
});
test('沒有 isMe 但已連線：未滿寬限時間仍是連線中，滿了就啟用', () => {
  assert.equal(S({ isMeSeen: false, elapsed: ONLINE_CONNECTED_GRACE_MS - 1 }).key, 'connecting');
  assert.deepEqual(S({ isMeSeen: false, elapsed: ONLINE_CONNECTED_GRACE_MS }), { key: 'ready', enabled: true, action: null });
});
test('沒有 isMe 而且沒連線：久了也不啟用', () => {
  assert.equal(S({ isMeSeen: false, connected: false, elapsed: 60000 }).enabled, false);
});
test('終端錯誤碼：顯示錯誤並停用，優先於其他狀態', () => {
  assert.deepEqual(S({ errCode: 'capability_disabled' }), { key: 'error', enabled: false, action: null });
  assert.equal(S({ errCode: 'revoked', isMeSeen: true }).key, 'error');
});
test('not_granted 依權限狀態導向 allow / manage，其餘才是錯誤', () => {
  assert.equal(S({ errCode: 'not_granted', perm: 'prompt' }).action, 'allow');
  assert.equal(S({ errCode: 'not_granted', perm: 'denied' }).action, 'manage');
  assert.equal(S({ errCode: 'not_granted', perm: null }).key, 'error');
});
