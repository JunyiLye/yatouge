// 第二次深度檢查第 5 批：單機與操作的小問題（R1-1～R1-4、R3-1～R3-3／R4-2、R4-1、R5-3）
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
  return html.slice(s + 1, html.indexOf('\n}\n', s) + 2);
}
function line(prefix) {
  const s = html.indexOf(`\n${prefix}`);
  assert.ok(s >= 0, prefix);
  return html.slice(s + 1, html.indexOf('\n', s + 1));
}
// 沒給的識別字都是「什麼都不做」的替身；給了的變數（含賦值）都落在 vars 上
const noop = new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : noop, apply: () => noop, set: () => true });
function scope(vars) {
  return new Proxy(vars, {
    has: (t, k) => typeof k === 'string' && k !== '__env' && (k in t || !(k in globalThis)),
    get: (t, k) => k === Symbol.unscopables ? undefined : k in t ? t[k] : noop,
    set: (t, k, v) => { t[k] = v; return true; },
  });
}
const expr = (src, vars) => new Function('__env', `with (__env) { return (${src}); }`)(scope(vars));
const stmt = (src, vars) => new Function('__env', `with (__env) { ${src} }`)(scope(vars));
function dom() { // $('#x') 回傳同一個假元素
  const els = {};
  const $ = q => els[q] ??= { hidden: false, textContent: '', innerHTML: '', value: '', classes: new Set(), classList: { remove(c) { els[q].classes.delete(c); }, add(c) { els[q].classes.add(c); }, toggle() {} }, setAttribute() {}, addEventListener(ev, h) { els[q].on = { ...els[q].on, [ev]: h }; } };
  return { $, els };
}
const fakeRoad = () => Array.from({ length: 40 }, (_, i) => ({ x: i, z: 0, h: 0, s: i }));

/* ---------- R1-1 自選音樂被拒絕 ---------- */
test('R1-1：被拒絕的檔案把錯誤寫在主畫面的 #ownMsg，不呼叫 showPop；選到好檔案會清掉舊訊息', () => {
  const { $, els } = dom(); let popped = 0, used = 0;
  const env = { $, T: k => k, showPop: () => popped++, ownUse: () => used++, ownCheck: f => f.v, setTimeout: () => 1, clearTimeout() {}, ownNoteT: 0, state: 'title' };
  const ownPicked = new Function('__env', `with (__env) { ${fn('ownNote')}\n${fn('ownPicked')}\nreturn ownPicked; }`)(scope(env));
  ownPicked({ v: 'bad', name: 'a' }); assert.equal(els['#ownMsg'].textContent, 'ownBad'); assert.equal(popped, 0);
  env.state = 'race'; ownPicked({ v: 'bad', name: 'a' }); assert.equal(popped, 1, '比賽中仍用 #pop'); env.state = 'title';
  ownPicked({ v: 'size', name: 'a' }); assert.equal(els['#ownMsg'].textContent, 'ownBig');
  ownPicked({ v: 'ok', name: 'a.mp3' }); assert.equal(els['#ownMsg'].textContent, ''); assert.equal(used, 1);
});

test('R1-1：#ownMsg 數秒後自動清除', () => {
  const { $, els } = dom(); let fire = null;
  const env = { $, setTimeout: f => { fire = f; return 7; }, clearTimeout() {}, ownNoteT: 0 };
  const ownNote = new Function('__env', `with (__env) { ${fn('ownNote')}\nreturn ownNote; }`)(scope(env));
  ownNote('x'); assert.equal(els['#ownMsg'].textContent, 'x'); fire(); assert.equal(els['#ownMsg'].textContent, '');
});

test('R1-1：startRace 清掉 #pop 與 popTimer（上一場或主畫面的提示不殘留在倒數上）', () => {
  const { $, els } = dom(); $('#pop').classes.add('show');
  const vars = { $, popTimer: 1.2, trans: 'auto', pvp: null, mode: 'race', car: { x: 0, h: 0, loc: { y: 0 } }, document: { body: { classList: { toggle() {} } } } };
  expr(fn('startRace'), vars)();
  assert.equal(vars.popTimer, 0); assert.equal(els['#pop'].classes.has('show'), false);
});

/* ---------- R1-2 綁 Ctrl 的警告 ---------- */
const KBF = () => new Function(`${block('keybind')}\nreturn { KB_DEF, kbCtrlClash };`)();
test('R1-2：kbCtrlClash 只有「有 Ctrl 綁定」且「W／T／N 有綁定」同時成立才為真', () => {
  const keys = () => structuredClone(KBF().KB_DEF.keys);
  assert.equal(KBF().kbCtrlClash(keys()), false, '預設沒綁 Ctrl，不警告');
  const a = keys(); a.hb = ['ControlLeft']; assert.equal(KBF().kbCtrlClash(a), true, '左 Ctrl + 預設的 W');
  const b = keys(); b.hb = ['ControlRight']; assert.equal(KBF().kbCtrlClash(b), true);
  const c = keys(); c.hb = ['ControlLeft']; c.gas = ['ArrowUp']; c.chat = ['KeyG']; assert.equal(KBF().kbCtrlClash(c), false, '沒有任何動作在 W／T／N');
  const d = keys(); d.hb = ['ControlLeft']; d.gas = ['ArrowUp']; d.chat = ['KeyG']; d.music = ['KeyN']; assert.equal(KBF().kbCtrlClash(d), true, 'N');
});
test('R1-2：警告列在頁面、kbRender 會顯示，zh／en 文字都有', () => {
  assert.ok(html.includes('id="kbWarn"'));
  assert.ok(/kbCtrlClash\(kb\.keys\)/.test(fn('kbRender')));
  assert.equal(html.split('kbCtrlWarn:').length - 1, 2);
});

/* ---------- R1-3 取消變速箱詢問後焦點回到「同一台再跑」 ---------- */
test('R1-3：btnAgain 的單機分支呼叫 askTrans(startRace, "#btnAgain")', () => {
  const { $, els } = dom(); const calls = [], startRace = () => {};
  stmt(line("$('#btnAgain').addEventListener('click'"), { $, pvp: null, startRace, askTrans: (...a) => calls.push(a) });
  els['#btnAgain'].on.click();
  assert.deepEqual(calls, [[startRace, '#btnAgain']]);
});

/* ---------- R1-4 AltGr ---------- */
test('R1-4：AltRight 帶 ctrlKey（Windows 的 AltGr）不算按住其他修飾鍵；其他情況不變', () => {
  const kbModHeld = new Function(`${line('const kbModHeld')}\nreturn kbModHeld;`)();
  assert.equal(kbModHeld('AltRight', { ctrlKey: true, altKey: true }), false);
  assert.equal(kbModHeld('AltRight', { altKey: true }), false);
  assert.equal(kbModHeld('KeyZ', { ctrlKey: true }), true);
  assert.equal(kbModHeld('KeyZ', { altKey: true }), true);
  assert.equal(kbModHeld('AltLeft', { ctrlKey: true, altKey: true }), true, '左 Alt 加 Ctrl 仍是組合鍵');
  assert.equal(kbModHeld('ControlLeft', { ctrlKey: true, altKey: true }), true);
  assert.equal(kbModHeld('ControlLeft', { ctrlKey: true }), false);
  assert.equal(kbModHeld('KeyZ', { metaKey: true }), true);
});

/* ---------- R3-1 車門字樣遵守車身隱藏 ---------- */
test('R3-1：車內視角（車身隱藏）時開啟車門字樣，玩家車的門不會單獨顯示；其他車照開', () => {
  const player = { door: { visible: false } }, rival = { door: { visible: false } }, ghost = { door: { visible: false } };
  const vars = { kxLetterOn: false, playerCar: player, rivalCar: rival, ghostCar: ghost, bodyCar: player, bodyHidden: true, store: { set() {} }, syncKxUI() {} };
  expr(fn('setKx'), vars)('letter', true);
  assert.equal(player.door.visible, false); assert.equal(rival.door.visible, true); assert.equal(ghost.door.visible, true);
  vars.bodyHidden = false; expr(fn('setKx'), vars)('letter', true); assert.equal(player.door.visible, true);
  expr(fn('setKx'), vars)('letter', false); assert.equal(player.door.visible, false);
});

/* ---------- R3-2 resetRace 重設油門與煞車 ---------- */
test('R3-2：resetRace 把 car.gas、car.brakeOn 設為 false（上一場的踩油門不延續到倒數）', () => {
  const car = { gas: true, brakeOn: true };
  const vars = { car, rival: {}, pts: fakeRoad(), startLat: 0, startS: 0, locate: () => ({}), samplePos: () => ({}), tsHide() {} };
  expr(fn('resetRace'), vars)();
  assert.equal(car.gas, false); assert.equal(car.brakeOn, false);
});

/* ---------- R3-3／R4-2 同時衝線 ---------- */
const FC = () => new Function(`${block('finish-clock')}\nreturn { playerFirst };`)();
test('R3-3：playerFirst 以子步順序判斷；同一子步算平手，判玩家贏', () => {
  assert.equal(FC().playerFirst(100, null), true, 'AI 沒衝線');
  assert.equal(FC().playerFirst(100, 101), true);
  assert.equal(FC().playerFirst(100, 100), true, '同一子步');
  assert.equal(FC().playerFirst(101, 100), false);
});
test('R3-3：raceSteps 記下玩家第一次過線的子步編號，只在 race 狀態記一次', () => {
  const car = { loc: { s: 0 } };
  const vars = { acc: 5 / 120 + 0.001, FIX: 1 / 120, car, state: 'race', stepN: 0, playerCrossN: null, pvp: null, taRun: null, sakeRun: null, FINISH_S: 3, physics: () => { car.loc.s += 1; }, rivalUpdate: () => {} };
  const steps = expr(fn('raceSteps'), vars);
  steps();
  assert.equal(vars.stepN, 5); assert.equal(vars.playerCrossN, 3);
  vars.acc = 2 / 120 + 0.001; steps(); assert.equal(vars.playerCrossN, 3, '不會被覆寫');
  const v2 = { ...vars, acc: 2 / 120 + 0.001, state: 'done', playerCrossN: null, stepN: 0 };
  expr(fn('raceSteps'), v2)(); assert.equal(v2.playerCrossN, null, 'done 後不記');
});
test('R3-3：finishRace 的玩家時間仍是 raceT；勝負看子步順序（AI 同一幀較早過線仍會贏）', () => {
  const run = (pStep, rStep, rT) => {
    const vars = { raceT: 10.0167, stepN: pStep, playerCrossN: pStep, rivalCrossN: rStep, rivalFinishT: rT, playerFinishT: null, playerWon: null, state: 'race', finishTimer: 0, driftChain: 0, driftTotal: 0, pvp: null, taRun: null, sakeRun: null, showPop() {}, T: k => k, playerFirst: FC().playerFirst };
    expr(fn('finishRace'), vars)(); return vars;
  };
  let r = run(1200, 1200, 10.0167); assert.equal(r.playerFinishT, 10.0167); assert.equal(r.playerWon, true, '同一子步');
  r = run(1201, 1200, 10.0167); assert.equal(r.playerWon, false, 'AI 早一個子步');
  r = run(1200, null, null); assert.equal(r.playerWon, true);
  r = run(1200, 1100, 9); assert.equal(r.playerWon, false);
});
test('R3-3：AI 的完賽時間改在 raceT += dt 之後、finishRace 檢查之前蓋章；rivalUpdate 不再自己用 raceT', () => {
  assert.equal(/rivalFinishT = raceT;/.test(fn('rivalUpdate')), false);
  assert.ok(/rivalCrossN === null && r\.s >= FINISH_S\) rivalCrossN = stepN/.test(fn('rivalUpdate')));
  assert.ok(/rivalCrossN !== null && rivalFinishT === null\) rivalFinishT = raceT/.test(fn('frame')));
  const f = fn('frame'), a = f.indexOf('raceT += dt'), b = f.indexOf('rivalFinishT = raceT'), c = f.indexOf('finishRace()');
  assert.ok(a > 0 && b > a && c > b);
});
test('R3-3：resetRace 重設子步計數與兩邊的過線記錄', () => {
  const vars = { car: {}, rival: {}, pts: fakeRoad(), startLat: 0, startS: 0, locate: () => ({}), samplePos: () => ({}), tsHide() {}, stepN: 9, playerCrossN: 3, rivalCrossN: 4 };
  expr(fn('resetRace'), vars)();
  assert.equal(vars.stepN, 0); assert.equal(vars.playerCrossN, null); assert.equal(vars.rivalCrossN, null);
});

/* ---------- R4-1 幽靈車關閉時仍追蹤路面索引 ---------- */
test('R4-1：幽靈車關著時 placeGhost 仍更新 gpos 與索引，中途打開時就在路面上', () => {
  const N = 2000, pts = Array.from({ length: N }, (_, i) => ({ x: i * 2, z: 0, y: i * 0.1, h: 0, s: i * 2 }));
  const loc = new Function('pts', 'N', 'clamp', 'lerpAngle', `${fn('locate')}\nreturn locate;`)(pts, N, (v, a, b) => Math.min(b, Math.max(a, v)), a => a);
  const rr = { ghost: {}, gi: 0, gs: null, gpos: { x: pts[8].x, z: 0, idx: 8 } };
  const g = { visible: true, position: { x: 0, z: 0, set() {} }, rotation: { set() {} } };
  const vars = { ghostCar: { g, spin: [] }, taRun: rr, ghostOn: false, state: 'race', raceT: 0, taAt: (gh, tt) => ({ i: 0, s: tt * 20, x: tt * 20, z: 0, h: 0 }), locate: loc, wrap: x => x };
  const place = expr(fn('placeGhost'), vars);
  let t = 0;
  for (; t < 30; t += 1 / 60) { vars.raceT = t; place(1 / 60); }
  assert.equal(g.visible, false);
  assert.ok(Math.abs(rr.gpos.x - t * 20) < 1 && rr.gpos.idx > 100, `gpos idx ${rr.gpos.idx}`);
  vars.ghostOn = true; place(1 / 60);
  assert.ok(Math.abs(loc(rr.gpos).y - (rr.gpos.x / 2) * 0.1) < 0.5, 'locate 找得到路面');
});

/* ---------- R5-3 視窗失焦時重設手把的上次值 ---------- */
test('R5-3：blur 同時重設 gp.last（按住的扳機回來後仍會再生效）', () => {
  let h = null; const gp = { last: { gas: true } }, GP_IDLE = { gas: false, brake: false, hb: false, steer: null }, input = { gas: true, steerAxis: 0.4 };
  stmt(line("window.addEventListener('blur'"), { window: { addEventListener: (e, f) => { h = f; } }, input, gp, GP_IDLE, releaseTouch() {} });
  h();
  assert.deepEqual(gp.last, GP_IDLE); assert.notEqual(gp.last, GP_IDLE, '是複本，不是共用物件'); assert.equal(input.gas, false);
});

/* ---------- 更新紀錄 ---------- */
test('更新紀錄 2026-11-14：zh／en 數量一致，新增的修正都在（中文以「修正：」、英文以「Fix:」開頭）', () => {
  const C = new Function(`${block('changelog')}\nreturn CHANGELOG;`)()[0];
  assert.equal(C.date, '2026-11-14'); assert.equal(C.zh.length, C.en.length);
  for (const k of ['幽靈車', '自選音樂', 'Ctrl', '手把', '引擎聲', '衝線']) assert.ok(C.zh.some(s => s.startsWith('修正：') && s.includes(k)), k);
  assert.ok(C.en.slice(-7).every(s => s.startsWith('Fix:')));
});
