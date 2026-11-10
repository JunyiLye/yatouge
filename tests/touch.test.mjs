// 抽出 yatouge.html 內 @touch 區塊（手機類比轉向的純函式，不依賴 DOM）後在 Node 執行
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function load() {
  const open = '/* @touch:start */', s = html.indexOf(open), e = html.indexOf('/* @touch:end */');
  assert.ok(s >= 0 && e > s, '找不到 @touch 區塊');
  return new Function(`const clamp = (v, a, b) => Math.max(a, Math.min(b, v));\n${html.slice(s + open.length, e)}\nreturn { TOUCH, touchSteer, steerRange, trackCenter };`)();
}
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('touchSteer：死區內為 0，死區外從 0 連續爬升', () => {
  const { touchSteer, TOUCH } = load();
  const R = 100, d = TOUCH.DEAD * R;
  assert.equal(touchSteer(0, R), 0);
  assert.equal(touchSteer(d * 0.99, R), 0);
  assert.equal(touchSteer(-d * 0.99, R), 0);
  near(touchSteer(d + 1e-6, R), 0, 1e-4); // 死區邊緣不跳變
  assert.ok(touchSteer(d + 10, R) > 0 && touchSteer(d + 10, R) < 0.2);
});

test('touchSteer：右拖為正、左拖為負、對稱、單調', () => {
  const { touchSteer } = load();
  near(touchSteer(60, 100), -touchSteer(-60, 100));
  assert.ok(touchSteer(60, 100) > 0 && touchSteer(-60, 100) < 0);
  let prev = -2;
  for (let dx = -150; dx <= 150; dx += 5) { const v = touchSteer(dx, 100); assert.ok(v >= prev); prev = v; }
});

test('touchSteer：滿舵位置為 ±1，超出被夾住', () => {
  const { touchSteer } = load();
  near(touchSteer(100, 100), 1); near(touchSteer(-100, 100), -1);
  assert.equal(touchSteer(1e6, 100), 1); assert.equal(touchSteer(-1e6, 100), -1);
  assert.equal(touchSteer(Infinity, 100), 1);
});

test('touchSteer：壞輸入回 0，不產生 NaN', () => {
  const { touchSteer } = load();
  for (const dx of [NaN, undefined, null, 'a']) assert.equal(touchSteer(dx, 100), 0);
  for (const r of [0, -5, NaN, undefined]) assert.equal(touchSteer(50, r), 0);
});

test('steerRange：約為區塊寬的三成，夾在 64..120 px', () => {
  const { steerRange } = load();
  near(steerRange(338), 338 * 0.3); // 844 寬手機的 40% 區
  assert.equal(steerRange(100), 64); assert.equal(steerRange(2000), 120);
  assert.equal(steerRange(NaN), 64);
});

test('trackCenter：軌道中心夾在區塊內，整條軌道不會超出邊緣', () => {
  const { trackCenter } = load();
  assert.equal(trackCenter(169, 338, 100), 169);
  assert.equal(trackCenter(0, 338, 100), 100); assert.equal(trackCenter(338, 338, 100), 238);
  assert.equal(trackCenter(50, 150, 100), 75); // 區塊比軌道窄：置中
});
