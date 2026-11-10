// 三台車的資料一致性：星等/物理排序、CAR_BOX、PvP 白名單、rivalOf 都要涵蓋 CARS 的每個 key
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const loadCars = () => new Function(`${block('cars')}\nreturn { CARS, rivalOf, TRACK_RIVAL, rivalFor };`)();
const loadBox = () => new Function(`${block('collision')}\nreturn { CAR_BOX };`)().CAR_BOX;
const loadNet = () => new Function(`${block('netcode')}\nreturn { NET, validatePeerState };`)();
const loadCam = () => new Function(`${block('camera-modes')}\nreturn { cockpitLocal };`)();
const stars = d => d.stats.map(s => s[1]);

test('cars: 星等 [加速, 極速, 過彎, 出彎]', () => {
  const { CARS } = loadCars();
  assert.deepEqual(stars(CARS.hatch), [2, 2, 5, 4]);
  assert.deepEqual(stars(CARS.coupe), [4, 4, 3, 3]);
  assert.deepEqual(stars(CARS.gtr), [5, 5, 1, 1]);
});

test('cars: 物理排序 gtr > coupe > hatch（直線）、反向（過彎）', () => {
  const { CARS } = loadCars();
  const [h, c, g] = [CARS.hatch.phys, CARS.coupe.phys, CARS.gtr.phys];
  for (const k of ['maxV', 'engine', 'slide']) assert.ok(g[k] > c[k] && c[k] > h[k], `${k}: ${g[k]} > ${c[k]} > ${h[k]}`);
  for (const k of ['gripLimit', 'drift']) assert.ok(g[k] < c[k] && c[k] < h[k], `${k}: ${g[k]} < ${c[k]} < ${h[k]}`);
  assert.equal(g.lag, 1);
});

test('cars: CAR_BOX 的 key 與 CARS 完全一致，尺寸為正', () => {
  const { CARS } = loadCars(), box = loadBox();
  assert.deepEqual(Object.keys(box).sort(), Object.keys(CARS).sort());
  for (const k in box) assert.ok(box[k].hl > 1 && box[k].hw > 0.5, k);
});

test('cars: cockpitLocal 對每台車都落在 CAR_BOX 內', () => {
  const box = loadBox(), { cockpitLocal } = loadCam();
  assert.ok(box.gtr);
  for (const k in box) { const { local } = cockpitLocal(box[k]); assert.ok(Math.abs(local.x) < box[k].hw && Math.abs(local.z) < box[k].hl, k); }
});

test('cars: PvP 白名單與 CARS 一致，接受 gtr、拒絕未知值', () => {
  const { CARS } = loadCars(), { NET, validatePeerState } = loadNet();
  assert.deepEqual([...NET.CARS].sort(), Object.keys(CARS).sort());
  const S = car => ({ v: 1, st: 'waiting', car, col: 0, trk: 'seiran' });
  for (const k of ['hatch', 'coupe', 'gtr', ...Object.keys(CARS)]) assert.equal(validatePeerState(S(k), null)?.car, k);
  for (const bad of ['GTR', 'skyline', '', '__proto__', 'constructor', null, undefined, 3]) assert.equal(validatePeerState(S(bad), null), null, String(bad));
});

test('cars: rivalOf 對每台車回傳另一台存在的車，且有 AI 參數', () => {
  const { CARS, rivalOf } = loadCars();
  for (const k in CARS) { const r = rivalOf(k); assert.ok(Object.hasOwn(CARS, r), k); assert.notEqual(r, k); assert.ok(CARS[r].ai.top > 0); }
  assert.equal(rivalOf('gtr'), 'coupe');
});

test('cars: 每台車至少 3 個顏色', () => {
  const { CARS } = loadCars();
  for (const k in CARS) assert.ok(CARS[k].colors.length >= 3, k);
});

test('rival: 賽道決定對手（kurosagi=黃色 SR-7、seiran=白色 KX-2），與玩家選車無關', () => {
  const { CARS, rivalFor } = loadCars();
  const col = r => CARS[r.car].colors[r.color];
  for (const mine of Object.keys(CARS)) {
    const k = rivalFor('kurosagi', mine), s = rivalFor('seiran', mine);
    assert.equal(k.car, 'coupe'); assert.equal(col(k).n.en, 'Competition yellow');
    assert.equal(s.car, 'hatch'); assert.equal(col(s).n.en, 'White');
  }
});

test('rival: 每個設定的對手顏色索引都存在；沒設定的賽道退回 rivalOf', () => {
  const { CARS, TRACK_RIVAL, rivalOf, rivalFor } = loadCars();
  for (const [t, r] of Object.entries(TRACK_RIVAL)) assert.ok(CARS[r.car]?.colors[r.color], t);
  for (const mine of Object.keys(CARS)) {
    const f = rivalFor('noSuchTrack', mine);
    assert.equal(f.car, rivalOf(mine)); assert.ok(CARS[f.car].colors[f.color]);
  }
});

test('rival: 每台可能當對手的車都有可用的 AI 參數（含預留給第三條賽道的 GT-32）', () => {
  const { CARS, TRACK_RIVAL } = loadCars();
  for (const k of new Set([...Object.values(TRACK_RIVAL).map(r => r.car), 'gtr'])) {
    const ai = CARS[k].ai; assert.ok(ai.top > 30 && ai.acc > 3 && ai.lat > 5, k);
  }
});
