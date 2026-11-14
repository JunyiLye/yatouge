// 離開頂棚橋之後鏡頭不能再被限制：最近點搜尋範圍只到橋尾後一點，出橋後會一直抓到橋尾那一點，鏡頭被釘在橋的中心線延長上（上坡出橋後是 70 度左彎，鏡頭會飛遠）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
const block = name => { const o = `/* @${name}:start */`, s = html.indexOf(o), e = html.indexOf(`/* @${name}:end */`); assert.ok(s >= 0 && e > s, name); return html.slice(s + o.length, e); };
const fnSrc = name => { const s = html.indexOf(`\nfunction ${name}(`); assert.ok(s >= 0, name); return html.slice(s + 1, html.indexOf('\n}\n', s) + 2); };

// 直線 60 m（頂棚橋在 s 15..45）後接半徑 30 m 的 90 度左彎
function road() {
  const pts = []; let x = 0, z = 0, h = 0, s = 0; const DS = 1.5;
  const push = () => pts.push({ x, y: 0, z, h, s });
  push();
  for (let i = 0; i < 40; i++) { x += Math.sin(h) * DS; z += Math.cos(h) * DS; s += DS; push(); }
  const n = Math.round((Math.PI / 2 * 30) / DS), dh = (Math.PI / 2) / n;
  for (let i = 0; i < n; i++) { h += dh; x += Math.sin(h) * DS; z += Math.cos(h) * DS; s += DS; push(); }
  for (let i = 0; i < 20; i++) { x += Math.sin(h) * DS; z += Math.cos(h) * DS; s += DS; push(); }
  return { pts, DS };
}
function run(cam) {
  const { pts, DS } = road(), g = { s0: 15, s1: 45 };
  const galleryIdx = [{ g, ia: pts.findIndex(q => q.s >= g.s0), ib: pts.findLastIndex(q => q.s <= g.s1) }];
  const camera = { position: { ...cam, set(x, y, z) { this.x = x; this.y = y; this.z = z; } } };
  const f = new Function('pts', 'N', 'DS', 'galleryIdx', 'camera', 'roadHW', `${block('gallery')}\n${fnSrc('galleryClampCamera')}\nreturn galleryClampCamera;`)(pts, pts.length, DS, galleryIdx, camera, 4.2);
  f();
  return { p: camera.position, pts };
}

test('出橋後在彎道上的鏡頭不被限制（位置不變）', () => {
  const { pts } = road();
  for (const k of [45, 52, 60]) for (const off of [-2, 2]) { // 出橋後 22–45 m、彎道內外兩側的鏡頭（離橋尾都在 40 m 內）
    const b = pts[k], cam = { x: b.x - Math.cos(b.h) * off, y: 3, z: b.z + Math.sin(b.h) * off };
    const { p } = run(cam);
    assert.ok(Math.hypot(p.x - cam.x, p.z - cam.z) < 1e-9 && p.y === 3, `點 ${k} 側 ${off}：鏡頭被移動 ${Math.hypot(p.x - cam.x, p.z - cam.z).toFixed(2)} m`);
  }
});
test('橋內的鏡頭仍然被限制在牆內', () => {
  const { pts } = road(), r = pts[20];
  const cam = { x: r.x - Math.cos(r.h) * 9, y: 3, z: r.z + Math.sin(r.h) * 9 }; // 側向 9 m，超出牆
  const { p } = run(cam);
  const lat = -(p.x - r.x) * Math.cos(r.h) + (p.z - r.z) * Math.sin(r.h);
  assert.ok(Math.abs(lat) <= 4.2 + 0.2 + 1e-9, `側向 ${lat}`);
});
