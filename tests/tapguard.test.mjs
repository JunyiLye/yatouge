// 抽出 yatouge.html 內 @tapguard 區塊（雙擊縮放防護的判斷，純函式）後在 Node 執行
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function load() {
  const open = '/* @tapguard:start */', s = html.indexOf(open), e = html.indexOf('/* @tapguard:end */');
  assert.ok(s >= 0 && e > s, '找不到 @tapguard 區塊');
  return new Function(`${html.slice(s + open.length, e)}\nreturn { TAPGUARD, blockDoubleTap };`)();
}

test('blockDoubleTap：快速第二下落在非互動區才擋', () => {
  const { blockDoubleTap, TAPGUARD } = load();
  assert.equal(blockDoubleTap(1000, 1000 + TAPGUARD.GAP_MS - 1, false), true);
});

test('blockDoubleTap：互動元素（按鈕、輸入）永遠不擋，否則會吃掉第二次 click', () => {
  const { blockDoubleTap } = load();
  assert.equal(blockDoubleTap(1000, 1100, true), false);
});

test('blockDoubleTap：間隔夠長或沒有前一次點擊就不擋', () => {
  const { blockDoubleTap, TAPGUARD } = load();
  assert.equal(blockDoubleTap(1000, 1000 + TAPGUARD.GAP_MS, false), false);
  assert.equal(blockDoubleTap(null, 5000, false), false);
});

test('blockDoubleTap：時間倒退（時鐘異常）不擋', () => {
  const { blockDoubleTap } = load();
  assert.equal(blockDoubleTap(2000, 1500, false), false);
});
