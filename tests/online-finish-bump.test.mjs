// 線上對戰：衝線後的車對車碰撞（pvpBump）與大廳「連線較忙」提示不被洗掉。用遊戲本身的函式加假的相依物件。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
function fn(name) {
  const s = html.indexOf(`\nfunction ${name}(`);
  assert.ok(s >= 0, name);
  return html.slice(s, html.indexOf('\n}\n', s) + 2);
}
const FS = 5000;

function bumper({ state, oppFt, oppS, myS }) {
  const calls = { carStep: 0 };
  const run = new Function('calls', 'state', 'pvp', 'FINISH_S', `
    ${block('finish-hit')}
    const CAR_BOX = { a: 1 }, choice = { car: 'a' }, roadHW = 9, COLL = {};
    const carStep = () => { calls.carStep++; return null; }, remoteAsRival = o => o, wallHit = () => {};
    ${fn('pvpBump')}
    return pvpBump;
  `)(calls, state, { pose: { s: oppS, stale: false }, opp: { car: 'a' }, oppFt }, FS);
  run({ loc: { s: myS } });
  return calls.carStep;
}

test('pvpBump：比賽中（雙方沒過終點、或對手過了但還沒完賽）照常碰撞', () => {
  assert.equal(bumper({ state: 'race', oppFt: null, oppS: 100, myS: 120 }), 1);
  assert.equal(bumper({ state: 'race', oppFt: null, oppS: FS + 5, myS: FS - 5 }), 1);
  assert.equal(bumper({ state: 'done', oppFt: null, oppS: 100, myS: FS - 1 }), 1);
});

test('pvpBump：對手已完賽且位置過了終點 -> 不碰撞', () => {
  assert.equal(bumper({ state: 'race', oppFt: 61.2, oppS: FS + 8, myS: FS - 20 }), 0);
});

test('pvpBump：我方已完賽（done）且位置過了終點 -> 不碰撞', () => {
  assert.equal(bumper({ state: 'done', oppFt: null, oppS: FS - 10, myS: FS + 6 }), 0);
});

function noteEnv() {
  const el = { textContent: '' }, T = k => '[' + k + ']';
  const g = new Function('el', 'T', `
    const $ = () => el; let lobbyKey = '';
    ${html.slice(html.indexOf('let trackBusyOn'), html.indexOf('\nfunction openLobby'))}
    return { lobbyNote, trackBusyNote, key: () => lobbyKey };
  `)(el, T);
  return { g, el };
}

test('大廳提示：忙碌中呼叫 lobbyNote("") 或 "onConnecting" 仍顯示 trackBusy；忙碌結束後清掉', () => {
  const { g, el } = noteEnv();
  g.trackBusyNote(true); assert.equal(el.textContent, '[trackBusy]');
  g.lobbyNote(''); assert.equal(el.textContent, '[trackBusy]');
  g.lobbyNote('onConnecting'); assert.equal(el.textContent, '[trackBusy]');
  g.lobbyNote('pvpJoinFail'); assert.equal(el.textContent, '[pvpJoinFail]', '其他訊息照常顯示');
  g.lobbyNote(''); assert.equal(el.textContent, '[trackBusy]', '忙碌仍在，空白提示又回到忙碌');
  g.trackBusyNote(false); assert.equal(el.textContent, '');
});

test('大廳提示：不忙碌時 lobbyNote 行為不變；忙碌結束不會洗掉別的訊息', () => {
  const { g, el } = noteEnv();
  g.lobbyNote('onConnecting'); assert.equal(el.textContent, '[onConnecting]');
  g.trackBusyNote(true); g.lobbyNote('pvpJoinFail'); g.trackBusyNote(false);
  assert.equal(el.textContent, '[pvpJoinFail]');
});
