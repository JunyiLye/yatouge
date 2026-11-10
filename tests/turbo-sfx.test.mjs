// 抽出 yatouge.html 內 @turbo-sfx 區塊（純函式，不依賴 Web Audio / DOM）後在 Node 執行
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function load() {
  const open = '/* @turbo-sfx:start */', s = html.indexOf(open), e = html.indexOf('/* @turbo-sfx:end */');
  assert.ok(s >= 0 && e > s, '找不到 @turbo-sfx 區塊');
  return new Function(`const clamp = (v, a, b) => Math.max(a, Math.min(b, v));\n${html.slice(s + open.length, e)}\nreturn { BOV_MIN_BOOST, BOV_COOLDOWN, bovTrigger, shiftEvent, boostStep, cooldownStep };`)();
}

test('bovTrigger：增壓足夠時，鬆油門觸發', () => {
  const { bovTrigger } = load();
  assert.equal(bovTrigger(true, false, false, 0.8, 0), true);
});
test('bovTrigger：增壓足夠時，踩煞車觸發（即使油門本來就沒踩）', () => {
  const { bovTrigger } = load();
  assert.equal(bovTrigger(false, false, true, 0.8, 0), true);
});
test('bovTrigger：增壓低於門檻不觸發', () => {
  const { bovTrigger, BOV_MIN_BOOST } = load();
  assert.equal(bovTrigger(true, false, false, BOV_MIN_BOOST - 0.01, 0), false);
  assert.equal(bovTrigger(false, false, true, 0, 0), false);
});
test('bovTrigger：冷卻中不觸發', () => {
  const { bovTrigger } = load();
  assert.equal(bovTrigger(true, false, true, 1, 0.3), false);
});
test('bovTrigger：持續踩油門、未煞車不觸發；沒有鬆油門的邊緣也不觸發', () => {
  const { bovTrigger } = load();
  assert.equal(bovTrigger(true, true, false, 1, 0), false);
  assert.equal(bovTrigger(false, false, false, 1, 0), false);
});

test('bovTrigger：煞車只在上升邊緣觸發（prevBrake 為 true 時不觸發）', () => {
  const { bovTrigger } = load();
  assert.equal(bovTrigger(false, false, true, 0.8, 0, false), true);
  assert.equal(bovTrigger(false, false, true, 0.8, 0, true), false);
  assert.equal(bovTrigger(true, false, true, 0.8, 0, true), true); // 鬆油門路徑不受影響
});
test('左腳煞車：煞車 + 油門同時按住 3 秒只觸發一次；放開後重新踩煞車再觸發', () => {
  const { bovTrigger, boostStep, cooldownStep, BOV_COOLDOWN } = load();
  let boost = 1, cd = 0, prevGas = true, prevBrake = false, shots = 0;
  const frame = (gas, brake) => {
    if (bovTrigger(prevGas, gas, brake, boost, cd, prevBrake)) { shots++; cd = BOV_COOLDOWN; boost *= 0.2; }
    prevGas = gas; prevBrake = brake; cd = cooldownStep(cd, 1 / 60); boost = boostStep(boost, gas, 7000, 1 / 60);
  };
  for (let i = 0; i < 180; i++) frame(true, true);
  assert.equal(shots, 1);
  for (let i = 0; i < 120; i++) frame(true, false); // 放開煞車、油門持續，增壓重建、冷卻結束
  frame(true, true);
  assert.equal(shots, 2);
});

test('shiftEvent：前進中檔位增加為 up、減少為 down', () => {
  const { shiftEvent } = load();
  assert.equal(shiftEvent(2, 3, 20), 'up');
  assert.equal(shiftEvent(4, 3, 20), 'down');
});
test('shiftEvent：檔位不變、空檔（0）、倒車、vf 為負都回傳 null', () => {
  const { shiftEvent } = load();
  assert.equal(shiftEvent(3, 3, 20), null);
  assert.equal(shiftEvent(0, 1, 5), null);
  assert.equal(shiftEvent(1, 0, 0.2), null);
  assert.equal(shiftEvent(2, 3, -5), null);
});

test('boostStep：低轉速目標低，高轉速目標高，且有渦輪遲滯（逐步爬升）', () => {
  const { boostStep } = load();
  let lo = 0; for (let i = 0; i < 600; i++) lo = boostStep(lo, true, 2000, 1 / 60);
  assert.ok(lo < 0.05, `低轉速增壓應很小：${lo}`);
  let b = 0; const first = boostStep(b, true, 8000, 1 / 60);
  assert.ok(first > 0 && first < 0.05, `一幀只能小幅上升：${first}`);
  for (let i = 0; i < 600; i++) b = boostStep(b, true, 8000, 1 / 60);
  assert.ok(b > 0.95 && b <= 1, `全油門高轉速應接近 1：${b}`);
});
test('boostStep：鬆油門後快速掉到 0，且不會小於 0', () => {
  const { boostStep } = load();
  let b = 1; for (let i = 0; i < 40; i++) b = boostStep(b, false, 8000, 1 / 60);
  assert.equal(b, 0);
});
test('boostStep：增壓夠高時才會高於 BOV 門檻（約 1 秒以上的 spool）', () => {
  const { boostStep, BOV_MIN_BOOST } = load();
  let b = 0, t = 0; while (b < BOV_MIN_BOOST && t < 5) { b = boostStep(b, true, 7000, 1 / 60); t += 1 / 60; }
  assert.ok(t > 0.25 && t < 2, `spool 時間 ${t}`);
});

test('cooldownStep：遞減並鎖在 0；BOV_COOLDOWN 約 0.6 秒', () => {
  const { cooldownStep, BOV_COOLDOWN } = load();
  assert.equal(BOV_COOLDOWN, 0.6);
  assert.ok(Math.abs(cooldownStep(0.6, 0.1) - 0.5) < 1e-12);
  assert.equal(cooldownStep(0.05, 0.1), 0);
  assert.equal(cooldownStep(0, 0.1), 0);
});
test('冷卻整合：同一次鬆油門 0.6 秒內只觸發一次', () => {
  const { bovTrigger, cooldownStep, BOV_COOLDOWN } = load();
  let cd = 0, shots = 0;
  for (let i = 0; i < 30; i++) { // 0.5 秒，每幀都是煞車 + 高增壓
    if (bovTrigger(false, false, true, 1, cd)) { shots++; cd = BOV_COOLDOWN; }
    cd = cooldownStep(cd, 1 / 60);
  }
  assert.equal(shots, 1);
});
