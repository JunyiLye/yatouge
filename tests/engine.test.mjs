// 抽出 yatouge.html 內 @engine 區塊（純函式，不依賴 THREE / DOM）後在 Node 執行
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');

function loadEngine() {
  const m = html.match(/\/\* @engine:start \*\/([\s\S]*?)\/\* @engine:end \*\//);
  assert.ok(m, '找不到 @engine 區塊');
  return new Function(`${m[1]}\nreturn { engineForce };`)();
}

// 改動前的公式（逐字）
const oldDrive = (engine, lagF, vf, maxV, pen) =>
  (engine * lagF * (1 - Math.max(0, vf) / maxV) + (vf < 6 ? 2 : 0)) * pen;

test('兩台車的驅動力皆為改動前的 2/3', () => {
  const { engineForce } = loadEngine();
  for (const [engine, maxV] of [[11.5, 54], [16.5, 66]])
    for (const vf of [0, 3, 10, 30, 50])
      for (const pen of [1, 0.1])
        for (const lagF of [1, 0.42]) {
          const got = engineForce(engine, lagF, vf, maxV, pen);
          const want = (2 / 3) * oldDrive(engine, lagF, vf, maxV, pen);
          assert.ok(Math.abs(got - want) < 1e-9, `engine=${engine} vf=${vf} pen=${pen} lagF=${lagF}: ${got} vs ${want}`);
        }
});
