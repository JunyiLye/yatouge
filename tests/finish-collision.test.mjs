// 衝線後的車對車碰撞：AI 衝線後被釘在賽道末端時不再與玩家相撞、速度歸零；衝線前（比賽中）的碰撞完全不變。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const { carsMayCollide, rivalAdvance } = new Function(`${block('finish-hit')}\nreturn { carsMayCollide, rivalAdvance };`)();
const FS = 5000;

test('衝線前（雙方都沒過終點）一律照舊碰撞，不論狀態', () => {
  for (const st of ['count', 'race']) for (const rs of [0, 2500, FS - 1, FS]) for (const ps of [0, 2500, FS - 1, FS]) assert.equal(carsMayCollide(rs, ps, FS, st), true, `${st} ${rs} ${ps}`);
});

test('AI 已過終點：不再碰撞（玩家還在比賽中也一樣）', () => {
  assert.equal(carsMayCollide(FS + 0.1, 4990, FS, 'race'), false);
  assert.equal(carsMayCollide(FS + 20, FS + 5, FS, 'done'), false);
});

test('玩家已衝線（done）且過了終點：不再碰撞；done 但還沒過終點不受影響', () => {
  assert.equal(carsMayCollide(4900, FS + 3, FS, 'done'), false);
  assert.equal(carsMayCollide(4900, FS - 3, FS, 'done'), true);
});

test('rivalAdvance：未到末端與原本的 Math.min 完全相同；被末端擋住時位置夾在末端、速度歸零', () => {
  for (const [s, v, dt] of [[100, 40, 1 / 120], [4000, 43.3, 1 / 120], [0, 0, 1 / 120], [4990, 10, 0.5]]) {
    const o = rivalAdvance(s, v, dt, 5100);
    assert.equal(o.s, Math.min(5100, s + v * dt)); assert.equal(o.v, v);
  }
  assert.deepEqual(rivalAdvance(5099.9, 40, 1 / 120, 5100), { s: 5100, v: 0 });
  assert.deepEqual(rivalAdvance(5100, 33, 1 / 120, 5100), { s: 5100, v: 0 });
});

test('physics 與 rivalUpdate 都改用這兩個函式，衝線前的 carStep 呼叫文字與原本相同', () => {
  const ph = html.slice(html.indexOf('\nfunction physics('), html.indexOf('\nlet lastHit'));
  assert.ok(ph.includes("else if (!taRun && !sakeRun && carsMayCollide(rival.s, L.s, FINISH_S, state)) {"));
  assert.ok(ph.includes("const cr = carStep(c, CAR_BOX[choice.car], { x: rp.x, z: rp.z, h: rp.h, vis: rival.vis, s: rival.s, lat: rival.lat, v: rival.v, latV: rival.latV }, CAR_BOX[rivalFor(baseId(trackId), choice.car).car], roadHW - 1, COLL);"));
  assert.ok(html.includes('({ s: r.s, v: r.v } = rivalAdvance(r.s, r.v, dt, pts[N - 3].s));'));
});
