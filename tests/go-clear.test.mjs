// 起跑 GO：GO 字樣的清除與大型／預覽彎道提示的等待用同一個 goUntil，同一幀不會一個已清、一個還擋（或反過來）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function fn(name) {
  const s = html.indexOf(`\nfunction ${name}(`);
  assert.ok(s >= 0, name);
  return html.slice(s, html.indexOf('\n}\n', s) + 2);
}
const tsFrame = fn('turnSignFrame'), frameSrc = fn('frame');

test('主迴圈沒有另外清除 GO 的 700 ms 計時器', () => {
  assert.equal(/setTimeout\([^\n]*'GO'/.test(frameSrc), false);
  assert.equal(/=== 'GO'\) \$\('#count'\)\.textContent = ''; \}, 700\)/.test(html), false);
});

test('turnSignFrame 只看 goUntil 是否還在（不再自己比時間），主迴圈在 hud 之前先呼叫 goTick', () => {
  assert.equal(/performance\.now\(\) < goUntil/.test(tsFrame), false);
  assert.ok(/goUntil > 0/.test(tsFrame));
  const i = frameSrc.indexOf('goTick(performance.now())'), j = frameSrc.indexOf('hud(dt)');
  assert.ok(i >= 0 && j > i, 'goTick 要在 hud 之前');
});

test('goTick：GO 顯示 700 ms，到期同一刻清字也清 goUntil；每一幀「有 GO 字」與「goUntil 在擋」永遠一致', () => {
  const els = { '#count': { textContent: '' } };
  const env = new Function('els', `
    const $ = q => els[q]; let goUntil = 0;
    ${fn('goTick')}
    return { tick: goTick, start: t => { els['#count'].textContent = 'GO'; goUntil = t + 700; }, gated: () => goUntil > 0 };
  `)(els);
  env.start(1000);
  const shown = [];
  for (let t = 1000; t <= 2000; t++) {
    env.tick(t);
    const text = els['#count'].textContent === 'GO';
    assert.equal(env.gated(), text, `t=${t}`);
    if (text) shown.push(t);
  }
  assert.equal(shown[0], 1000); assert.equal(shown.at(-1), 1699); assert.equal(shown.length, 700, '玩家看到 GO 的時間仍是 700 ms');
});

test('goTick：倒數的數字不會被清掉；goUntil 已為 0 時什麼都不做', () => {
  const els = { '#count': { textContent: '2' } };
  const t = new Function('els', `const $ = q => els[q]; let goUntil = 5; ${fn('goTick')} return goTick;`)(els);
  t(10); assert.equal(els['#count'].textContent, '2');
});
