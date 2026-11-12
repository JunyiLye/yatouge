// KX-2 車門字樣：依車漆亮度決定字色（純函式，抽自 @lettering 區塊）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function load() {
  const open = '/* @lettering:start */', s = html.indexOf(open), e = html.indexOf('/* @lettering:end */');
  assert.ok(s >= 0 && e > s, '找不到 @lettering 區塊');
  return new Function(`${html.slice(s + open.length, e)}\nreturn { doorInkLight };`)();
}

test('doorInkLight: 淺色車漆用黑字（false），深色用白字（true）', () => {
  const { doorInkLight } = load();
  assert.equal(doorInkLight(0xeceef2), false, '白');
  assert.equal(doorInkLight(0xb7bcc6), false, '銀');
  assert.equal(doorInkLight(0xf0b40a), false, '黃');
  assert.equal(doorInkLight(0xc41e28), true, '紅');
  assert.equal(doorInkLight(0x1e3c7a), true, '深藍');
  assert.equal(doorInkLight(0x17181c), true, '黑');
});
