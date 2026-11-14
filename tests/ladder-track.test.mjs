// 千曲坂折返段：相鄰兩層只隔 ~12.8 m。車被甩向外側、撞牆、重置時，locate（idx 提示）與 wallStep 都不能跳到相鄰那一層。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
const block = n => { const o = `/* @${n}:start */`, s = html.indexOf(o), e = html.indexOf(`/* @${n}:end */`); assert.ok(s >= 0 && e > s, n); return html.slice(s + o.length, e); };
const fn = name => { const s = html.indexOf(`function ${name}(`); assert.ok(s >= 0, name); return html.slice(s, html.indexOf('\n}\n', s) + 3); };
const G = new Function(`const clamp = (v, a, b) => Math.max(a, Math.min(b, v));\n${block('course-geometry')}\nreturn { buildCourse, lerpAngle };`)();
const C = new Function(`${block('collision')}\nreturn { wallStep, CAR_BOX, COLL };`)();

function world(id) {
  const c = G.buildCourse(id), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const locate = new Function('pts', 'N', 'clamp', 'lerpAngle', `${fn('locate')}\nreturn locate;`)(c.pts, c.N, clamp, G.lerpAngle);
  return { c, locate };
}

test('千曲坂髮夾彎處：車被甩向兩側高速撞牆，位置追蹤不跳層、牆擋得住', () => {
  const { c, locate } = world('chikuma'), { pts, hw } = c, WALL = hw + 0.3, dt = 1 / 60;
  const heads = []; for (let i = 20; i < c.N - 20; i++) if (Math.abs(pts[i].ks) > 0.07 && (!heads.length || i - heads.at(-1) > 120)) heads.push(i);
  assert.ok(heads.length >= 20, `髮夾彎頭 ${heads.length}`);
  for (const i0 of heads) for (const side of [-1, 1]) for (const out of [25, 60]) {
    const p = pts[i0], car = { x: p.x, z: p.z, h: p.h, vx: Math.sin(p.h) * 12 - Math.cos(p.h) * side * out, vz: Math.cos(p.h) * 12 + Math.sin(p.h) * side * out, w: 0, idx: i0, penalty: 0 };
    let L = car.loc = locate(car), prev = L;
    for (let f = 0; f < 240; f++) {
      car.x += car.vx * dt; car.z += car.vz * dt;
      L = car.loc = locate(car);
      assert.ok(Math.abs(L.s - prev.s) < 4, `s 跳動 @${i0} ${side} ${out} f${f}: ${prev.s} -> ${L.s}`);
      const wr = C.wallStep(car, C.CAR_BOX.rally, (x, z) => locate({ x, z, idx: L.i }), WALL, car.penalty, C.COLL);
      if (wr) Object.assign(car, { x: wr.x, z: wr.z, vx: wr.vx, vz: wr.vz, w: wr.w, penalty: wr.penalty });
      assert.ok(Math.abs(L.lat) < WALL + 1.5, `衝出牆外 @${i0} ${side} ${out} f${f}: lat ${L.lat}`);
      prev = L;
    }
    assert.ok(Math.abs(prev.s - p.s) < 120, `最後離起點太遠 @${i0}`);
  }
});

test('千曲坂重置（resetCar 的做法）：回到原本那一層的路中心，s 連續', () => {
  const { c, locate } = world('chikuma');
  for (let i = 40; i < c.N - 40; i += 97) {
    const p = c.pts[i], car = { x: p.x + 3, z: p.z, idx: i }, L = locate(car);
    Object.assign(car, { x: c.pts[L.i].x, z: c.pts[L.i].z, idx: L.i });
    const L2 = locate(car);
    assert.ok(Math.abs(L2.s - L.s) < 2 && Math.abs(L2.lat) < 0.5, `@${i}`);
  }
});
