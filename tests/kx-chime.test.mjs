// KX-2 時速警示音的判斷（純函式，抽自 @kx-chime 區塊）：>105 km/h 開始，<100 km/h 停止，約每 1 秒一次
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function load() {
  const open = '/* @kx-chime:start */', s = html.indexOf(open), e = html.indexOf('/* @kx-chime:end */');
  assert.ok(s >= 0 && e > s, '找不到 @kx-chime 區塊');
  return new Function(`${html.slice(s + open.length, e)}\nreturn { KXCHIME, kxChime, kxOn };`)();
}
const base = { enabled: true, car: 'hatch', state: 'race', kmh: 110, over: false, t: 10, last: null };

test('kxChime: KX-2 開啟、比賽中、超過 105 km/h 立刻響一次', () => {
  const { kxChime } = load();
  assert.deepEqual(kxChime(base), { over: true, play: true });
});

test('kxChime: 剛好 105 km/h 不響（要超過），倒數與比賽狀態都可響', () => {
  const { kxChime } = load();
  assert.equal(kxChime({ ...base, kmh: 105 }).play, false);
  assert.equal(kxChime({ ...base, state: 'count' }).play, true);
});

test('kxChime: 遲滯 — 已超速時降到 100~105 之間仍維持、低於 100 才停', () => {
  const { kxChime } = load();
  assert.equal(kxChime({ ...base, kmh: 102, over: true, last: 10, t: 11.2 }).over, true);
  assert.deepEqual(kxChime({ ...base, kmh: 102, over: true, last: 10, t: 11.2 }), { over: true, play: true });
  assert.deepEqual(kxChime({ ...base, kmh: 99.9, over: true, last: 10, t: 11.2 }), { over: false, play: false });
  assert.equal(kxChime({ ...base, kmh: 102, over: false }).over, false, '未超速時 102 不啟動');
});

test('kxChime: 間隔不足 1 秒不重複響，滿 1 秒再響', () => {
  const { kxChime, KXCHIME } = load();
  assert.equal(kxChime({ ...base, over: true, last: 10, t: 10 + KXCHIME.GAP - 0.01 }).play, false);
  assert.equal(kxChime({ ...base, over: true, last: 10, t: 10 + KXCHIME.GAP }).play, true);
});

test('kxChime: 設定關閉、非 KX-2、結束 / 標題狀態一律不響且清掉超速旗標', () => {
  const { kxChime } = load();
  const off = { over: false, play: false };
  assert.deepEqual(kxChime({ ...base, enabled: false, over: true }), off);
  assert.deepEqual(kxChime({ ...base, car: 'coupe', over: true }), off);
  assert.deepEqual(kxChime({ ...base, car: 'gtr' }), off);
  for (const st of ['done', 'title']) assert.deepEqual(kxChime({ ...base, state: st, over: true }), off);
});

test('kxOn: 預設開，只有存成 "0" 才關', () => {
  const { kxOn } = load();
  assert.equal(kxOn(null), true);
  assert.equal(kxOn('1'), true);
  assert.equal(kxOn('0'), false);
});
