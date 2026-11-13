// 大廳的非同步加入：離開大廳後才完成的加入不能把玩家拉進房間。純函式 makeGate + 接線檢查。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const { makeGate } = new Function(`${block('lobbygate')}\nreturn { makeGate };`)();
const body = (re) => { const m = html.match(re); assert.ok(m, String(re)); const s = m.index, e = html.indexOf('\n}\n', s); return html.slice(s, e + 2); };

test('makeGate：同一世代的 token 有效；cancel 之後所有舊 token 都失效，新 token 有效', () => {
  const g = makeGate(), a = g.token(), b = g.token();
  assert.ok(g.ok(a) && g.ok(b));
  g.cancel();
  assert.equal(g.ok(a), false);
  assert.equal(g.ok(b), false);
  const c = g.token();
  assert.ok(g.ok(c));
  g.cancel(); g.cancel();
  assert.equal(g.ok(c), false);
});
test('makeGate：兩個閘門互不影響', () => {
  const x = makeGate(), y = makeGate(), t = y.token();
  x.cancel();
  assert.ok(y.ok(t));
});
test('模擬：加入還沒完成就離開大廳 -> 完成時只 leave，不進房間', async () => {
  const g = makeGate(); let entered = 0, left = 0, resolve;
  const join = () => new Promise(r => { resolve = r; });
  const run = async () => { const t = g.token(); const rm = await join(); if (!g.ok(t)) left++; else entered++; return rm; };
  const p = run(); g.cancel(); resolve({}); await p;
  assert.deepEqual([entered, left], [0, 1]);
  const p2 = run(); resolve({}); await p2;
  assert.deepEqual([entered, left], [1, 1]);
});

for (const [name, re] of [['createRoom', /async function createRoom\(/], ['createPrivateRoom', /async function createPrivateRoom\(/], ['joinByCode', /async function joinByCode\(/], ['joinRoom', /async function joinRoom\(/], ['watchRoom', /async function watchRoom\(/]]) {
  test(`接線：${name} 取得 token，join 完成後檢查，失效就只 leave`, () => {
    const b = body(re);
    assert.match(b, /const gt = lobbyGate\.token\(\)/);
    const i = b.indexOf('await room.join'), j = b.indexOf('lobbyGate.ok(gt)', i);
    assert.ok(i >= 0 && j > i, '檢查必須在 await room.join 之後');
    assert.match(b, /!lobbyGate\.ok\(gt\)\) (\{ )?rm\.leave\(\)/);
    // startMatch / startSpectate 一律在檢查之後
    const k = Math.max(b.indexOf('startMatch('), b.indexOf('startSpectate('));
    assert.ok(k > j, '進房間要在檢查之後');
  });
}
test('接線：離開大廳（closeLobby，含手把 B 與返回鈕）與開始單人比賽（startRace）都會 cancel', () => {
  assert.match(body(/function closeLobby\(/ ), /lobbyGate\.cancel\(\)/);
  assert.match(html, /function startRace\(\) \{[^]*?lobbyGate\.cancel\(\)/);
  assert.match(html, /else if \(!\$\('#lobby'\)\.hidden\) closeLobby\(\);/);
  assert.match(html, /\$\('#btnLobbyBack'\)\.addEventListener\('click', closeLobby\)/);
});
