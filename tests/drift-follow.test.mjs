// 抽出 yatouge.html 內 @drift-follow 區塊（純函式，不依賴 THREE / DOM）後在 Node 執行
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function load() {
  const open = '/* @drift-follow:start */', s = html.indexOf(open), e = html.indexOf('/* @drift-follow:end */');
  assert.ok(s >= 0 && e > s, '找不到 @drift-follow 區塊');
  return new Function(`${html.slice(s + open.length, e)}\nreturn { DRIFT_FOLLOW, driftFollow };`)();
}
// 舊公式（逐字）
const oldBase = (s, Pd) => Math.min(1.6, 15 / Math.max(s, 1)) * Pd;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} vs ${b}`);

test('DRIFT_FOLLOW 為 0.85', () => assert.equal(load().DRIFT_FOLLOW, 0.85));

test('基礎跟隨項恰為舊公式的 0.85 倍（含 gas 加成）', () => {
  const { driftFollow } = load();
  for (const s of [8, 15, 25, 35]) for (const Pd of [0.88, 1.12]) for (const gas of [false, true]) {
    near(driftFollow(0.5, s, gas, 0, Pd), 0.85 * oldBase(s, Pd) + (gas ? 0.15 : 0));
  }
});

test('countersteer 項原樣通過', () => {
  const { driftFollow } = load();
  for (const c of [0, 0.45, 0.9]) near(driftFollow(0.5, 25, true, c, 1), 0.85 * oldBase(25, 1) + 0.15 + c);
});

test('|diff| > 1.15 仍回傳 3.2', () => {
  const { driftFollow } = load();
  assert.equal(driftFollow(1.2, 25, true, 0.9, 1), 3.2);
  assert.equal(driftFollow(-1.2, 8, false, 0, 0.88), 3.2);
});
