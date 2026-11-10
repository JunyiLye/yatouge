// 換車/換賽道時 disposeCar 要釋放車子自己的 geometry / material，但不能動共用貼圖
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const { disposeTree } = new Function(`${block('dispose')}\nreturn { disposeTree };`)();

const res = () => ({ n: 0, dispose() { this.n++; } });
const node = (o, ...kids) => ({ ...o, children: kids, traverse(f) { f(this); kids.forEach(k => k.traverse(f)); } });

test('disposeTree: 釋放 geometry 與 material，共用貼圖與 sprite geometry 不動', () => {
  const shared = res(), own = res(), geo = res(), mat = res(), sprGeo = res(), sprMat = res(), ownMap = res();
  mat.map = shared; sprMat.map = shared;
  const mat2 = res(); mat2.map = ownMap;
  const root = node({}, node({ geometry: geo, material: mat }), node({ isSprite: true, geometry: sprGeo, material: sprMat }), node({ geometry: own, material: [mat2] }));
  disposeTree(root, new Set([shared]));
  assert.equal(geo.n, 1); assert.equal(own.n, 1); assert.equal(mat.n, 1); assert.equal(sprMat.n, 1); assert.equal(mat2.n, 1);
  assert.equal(ownMap.n, 1, '車子自己的貼圖要釋放');
  assert.equal(shared.n, 0, '共用貼圖不可釋放');
  assert.equal(sprGeo.n, 0, 'Sprite 的 geometry 是 three.js 內部共用的');
});

test('disposeTree: 共用 material 不釋放；buildCars 先釋放座艙再釋放車身，且換車時會釋放舊車', () => {
  const m = res(), g = res();
  disposeTree(node({}, node({ geometry: g, material: m })), new Set([m]));
  assert.equal(m.n, 0); assert.equal(g.n, 1);
  const bc = html.slice(html.indexOf('function buildCars()'), html.indexOf('buildCars();\n'));
  assert.match(bc, /\[playerCar, rivalCar\][^\n]*disposeCar\(c\)/);
  assert.ok(bc.indexOf('disposeInterior') < bc.indexOf('disposeCar(c)'), '座艙先自行釋放並卸下，避免重複釋放');
});
