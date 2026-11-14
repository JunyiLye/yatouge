// 線上對戰：每一回合的結果判定互不影響。以遊戲本身的 beginCountdown / pvpResultTick 加上 @netcode 的 pvpResult / lockedResult 模擬兩個回合。
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
  const e = html.indexOf('\n}\n', s);
  return html.slice(s, e + 2);
}

function setup() {
  const els = { '#result': { hidden: false }, '#resTitle': {}, '#resGap': {}, '#resOpp': {} };
  const env = { now: 0, ft: 60 };
  const p = { st: 'finished', ft: 60, oppFt: null, oppLeft: false, finishAt: 0, dnfLocked: false, match: { m: 'first' }, host: true, track: 'kurosagi', cat: null };
  const api = new Function('env', 'els', 'pvp', `
    ${block('netcode')}
    const $ = q => els[q], T = k => k, fmtT = t => String(t), DNF_WAIT_S = 60;
    const performance = { now: () => env.now };
    let playerFinishT = 60, startLat = 0, startS = 0;
    const catOn = () => false, showCatResult = () => {}, resNames = () => {}, rpResolve = () => {}, catBegin = () => {}, catStart = () => 0, catMe = () => 0;
    const pvpPublish = () => {}, advertise = () => {}, startRace = () => {}, closeRoomDialogs = () => {};
    ${fn('pvpResultTick')}
    ${fn('beginCountdown')}
    return { tick: pvpResultTick, begin: beginCountdown, setFt: t => { playerFinishT = t; } };
  `)(env, els, p);
  return { api, els, env, p };
}

test('兩個回合：第一回合對手沒完賽（勝），第二回合對手 50 秒、我 60 秒 -> 第二回合顯示輸', () => {
  const { api, els, env, p } = setup();
  env.now = 61000; api.tick(); // 第一回合：等超過 60 秒，顯示「未完賽」並鎖定勝利
  assert.equal(els['#resTitle'].textContent, 'win');
  assert.equal(p.dnfLocked, true);
  api.begin(0); // 第二回合開始
  Object.assign(p, { ft: 60, oppFt: 50, finishAt: env.now });
  api.setFt(60); els['#result'].hidden = false; api.tick();
  assert.equal(els['#resTitle'].textContent, 'lose', '第二回合應照實際成績判定');
  assert.equal(els['#resOpp'].textContent, '50');
});
test('兩個回合：第一回合鎖定後，同回合對手晚到仍維持勝（原行為）', () => {
  const { api, els, env, p } = setup();
  env.now = 61000; api.tick();
  Object.assign(p, { oppFt: 50 }); api.tick();
  assert.equal(els['#resTitle'].textContent, 'win');
});
