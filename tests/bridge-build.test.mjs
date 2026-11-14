// 橋的繪製（buildBridges）：用假的 THREE 跑一次，確認不丟錯、座標沒有 NaN、橋段沒有草地、有橋墩與河，橋墩落在谷底之上、頂在梁下。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
const block = n => { const o = `/* @${n}:start */`, s = html.indexOf(o), e = html.indexOf(`/* @${n}:end */`); return html.slice(s + o.length, e); };
const cut = (a, b) => { const s = html.indexOf(a), e = html.indexOf(b, s); assert.ok(s >= 0 && e > s, a); return html.slice(s, e); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const geo = new Function(`const clamp = (v, a, b) => Math.max(a, Math.min(b, v));\n${block('course-geometry')}\nreturn { buildCourse, groundWidths, DS, lerpAngle };`)();

function run(id) {
  const set = new Set(), made = [];
  class Obj { constructor(g, m) { this.geometry = g; this.material = m; this.position = { set: (x, y, z) => { this.pos = [x, y, z]; } }; this.rotation = {}; made.push(this); } }
  class Geo { constructor(kind, ...a) { this.kind = kind; this.args = a; this.attributes = {}; } setAttribute(n, a) { this.attributes[n] = a; } setIndex(i) { this.index = i; } computeVertexNormals() {} }
  const THREE = {
    Mesh: Obj, InstancedMesh: class extends Obj { constructor(g, m, n) { super(g, m); this.n = n; } setMatrixAt() {} },
    BufferGeometry: Geo, BufferAttribute: class { constructor(a) { this.array = a; } }, Float32BufferAttribute: class { constructor(a) { this.array = a; } },
    MeshLambertMaterial: class { constructor(o) { Object.assign(this, o); } }, MeshPhongMaterial: class { constructor(o) { Object.assign(this, o); } },
    BoxGeometry: class extends Geo { constructor(...a) { super('box', ...a); } }, CylinderGeometry: class extends Geo { constructor(...a) { super('cyl', ...a); } },
    Matrix4: class { makeTranslation() {} }
  };
  const c = geo.buildCourse(id), gw = geo.groundWidths(c.pts, c.hw), onBridge = new Uint8Array(c.N);
  for (const b of c.bridges) for (let i = 0; i < c.N; i++) if (c.pts[i].s >= b.s0 && c.pts[i].s <= b.s1) onBridge[i] = 1;
  const grassMat = { name: 'grass' }, railMat = { name: 'rail' }, trackGroup = { add: o => set.add(o) };
  const src = cut('function strip(', 'const aniso') + '\n' + cut('const BRIDGE = ', 'function buildTrack(');
  const f = new Function('THREE', 'clamp', 'lerpAngle', 'DS', 'pts', 'N', 'bridges', 'roadHW', 'trackGroup', 'grassMat', 'railMat', 'off', 'out',
    `${src.replace(/const aniso[\s\S]*$/, '')}\nreturn buildBridges;`);
  const off = (p, o, dy) => [p.x - Math.cos(p.h) * o, p.y + dy, p.z + Math.sin(p.h) * o];
  f(THREE, clamp, geo.lerpAngle, geo.DS, c.pts, c.N, c.bridges, c.hw, trackGroup, grassMat, railMat, off)(onBridge, gw);
  return { made: [...new Set([...made, ...set])], c, grassMat, onBridge };
}

test('千曲坂（下坡、上坡）：buildBridges 不丟錯，頂點沒有 NaN，有橋墩圓柱、橫樑與河面', () => {
  for (const id of ['chikuma', 'chikuma_up']) {
    const { made, c } = run(id);
    assert.ok(made.length > 10, `${id} 物件數 ${made.length}`);
    for (const m of made) { const a = m.geometry?.attributes?.position?.array; if (a) for (const v of a) assert.ok(Number.isFinite(v), `${id} NaN`); }
    const cyl = made.filter(m => m.geometry?.kind === 'cyl'), beams = made.filter(m => m.geometry?.kind === 'box' && m.geometry.args[1] === 0.9);
    assert.ok(cyl.length >= 8 && cyl.length % 2 === 0, `${id} 橋墩圓柱 ${cyl.length}`);
    assert.equal(beams.length, cyl.length / 2);
    for (const m of cyl) assert.ok(m.geometry.args[2] >= 3 && m.geometry.args[2] <= 45, `墩高 ${m.geometry.args[2]}`);
    assert.equal(made.filter(m => m.material && m.material.shininess).length, c.bridges.length, '每座橋一條河');
  }
});

test('buildTrack：橋段不畫草地、護欄與樹，路燈站在護牆上；橋的網格隨賽道一起被 disposeTrack 清掉', () => {
  const bt = cut('function buildTrack(', '/* sky dome');
  assert.ok(/strip\(3,[\s\S]*?grassMat, offBridge\)/.test(bt), '草地條帶略過橋段');
  assert.ok(/railMat, offBridge\)/.test(bt), '一般護欄略過橋段');
  assert.ok(/onBridge\[idx\] \|\|/.test(bt), '樹略過橋段');
  assert.ok(/if \(bridges\.length\) buildBridges\(onBridge, gw\)/.test(bt));
  const bb = cut('function buildBridges(', 'function buildTrack(');
  assert.ok(!/SHARED\.add|new Set/.test(bb));
  assert.ok(/trackGroup\.add/.test(bb), '橋的物件都加進 trackGroup（disposeTrack 會清）');
});

// 輔助：最近的路點（xz 平面）
const nearest = (c, x, z) => { let b = null, bd = Infinity; for (const p of c.pts) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; b = p; } } return { p: b, d: bd }; };
const verts = m => { const a = m.geometry.attributes.position.array, o = []; for (let i = 0; i < a.length; i += 3) o.push([a[i], a[i + 1], a[i + 2]]); return o; };

test('每一座橋（下坡與上坡）：橋墩都有、橋中間的谷底離橋面至少 20 m，河面不在路面上方或路面上', () => {
  for (const id of ['chikuma', 'chikuma_up']) {
    const { made, c, grassMat } = run(id);
    const cyl = made.filter(m => m.geometry?.kind === 'cyl');
    for (const [k, b] of c.bridges.entries()) {
      const inB = cyl.filter(m => { const q = nearest(c, m.pos[0], m.pos[2]).p; return q.s >= b.s0 && q.s <= b.s1; });
      assert.ok(inB.length >= 4, `${id} 橋 ${k} 橋墩圓柱 ${inB.length}`);
      // 橋中間：谷面（grassMat 的網格）在路中心線下方
      const mid = c.pts.find(p => p.s >= (b.s0 + b.s1) / 2);
      const low = Math.min(...made.filter(m => m.material === grassMat && m.geometry.attributes.position.array.length / 3 !== c.N * 3).flatMap(verts).filter(v => Math.hypot(v[0] - mid.x, v[2] - mid.z) < 4).map(v => v[1]));
      assert.ok(low < mid.y - 20, `${id} 橋 ${k} 谷底 ${(mid.y - low).toFixed(1)} m 深`);
    }
    const riv = made.filter(m => m.material && m.material.shininess);
    assert.equal(riv.length, c.bridges.length);
    for (const r of riv) for (const v of verts(r)) { const q = nearest(c, v[0], v[2]); if (q.d < c.hw + 3) assert.ok(v[1] < q.p.y - 8, `${id} 河面在路面上 ${v}`); }
  }
});

test('橋兩端：梁與護牆多畫橋端外各一段，和一般護欄、草地銜接沒有缺口', () => {
  for (const id of ['chikuma', 'chikuma_up']) {
    const { made, c, onBridge } = run(id), nB = onBridge.reduce((a, b) => a + b, 0);
    const deck = made.find(m => m.geometry?.attributes?.position && m.geometry.attributes.position.array.length / 3 === c.N * 8);
    assert.ok(deck, '找不到梁的網格');
    assert.equal(deck.geometry.index.length / 6 / 7, nB + c.bridges.length, `${id} 梁的段數（每座橋 = 橋面點數 + 1）`);
  }
  const bt = cut('function buildTrack(', '/* sky dome');
  assert.ok(bt.includes('railMat, offBridge)') && bt.includes('grassMat, offBridge)'), '一般護欄與草地在橋段（含橋端那一段）略過');
});

test('寬谷：谷面（grassMat 的網格）橋中央兩側各延伸至少 60 m，谷面不蓋住路面，面數不多，河沿谷全長並收尖', () => {
  for (const id of ['chikuma', 'chikuma_up']) {
    const { made, c, grassMat } = run(id);
    const valleys = made.filter(m => m.material === grassMat && m.geometry.attributes.position.array.length / 3 !== c.N * 3);
    assert.ok(valleys.length >= 1);
    let tris = 0;
    for (const m of valleys) {
      tris += m.geometry.index.length / 3;
      for (const v of verts(m)) { assert.ok(Number.isFinite(v[1])); const q = nearest(c, v[0], v[2]); if (q.d < c.hw) assert.ok(v[1] < q.p.y - 0.04, `${id} 谷面頂點在路面上 ${q.d.toFixed(1)} m`); }
    }
    assert.ok(tris <= 4000, `三角形 ${tris}`);
    for (const b of c.bridges) {
      const mid = c.pts.find(p => p.s >= (b.s0 + b.s1) / 2); let far = 0;
      for (const m of valleys) for (const v of verts(m)) {
        const dx = v[0] - mid.x, dz = v[2] - mid.z, lat = Math.abs(Math.cos(mid.h) * dx - Math.sin(mid.h) * dz), lon = Math.abs(Math.sin(mid.h) * dx + Math.cos(mid.h) * dz);
        if (lon < 6 && lat > far) far = lat;
      }
      assert.ok(far >= 60, `${id} 橋中央谷面側向延伸 ${far.toFixed(1)} m`);
    }
    for (const r of made.filter(m => m.material && m.material.shininess)) {
      const vs = verts(r), xs = vs.map(v => v[0]), zs = vs.map(v => v[2]);
      assert.ok(Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) >= 80, '河要沿谷的全長（至少 80 m）');
      assert.ok(Math.hypot(vs[0][0] - vs[1][0], vs[0][2] - vs[1][2]) < 1 && Math.hypot(vs[vs.length - 2][0] - vs[vs.length - 1][0], vs[vs.length - 2][2] - vs[vs.length - 1][2]) < 1, '河的兩端收成一點');
    }
  }
});

test('谷面的兩端列正好落在橋端外最近的一般路點（和草地條帶銜接，沒有縫）', () => {
  for (const id of ['chikuma', 'chikuma_up']) {
    const { made, c, grassMat } = run(id), vs = made.filter(m => m.material === grassMat).flatMap(verts);
    for (const b of c.bridges) {
      const ia = c.pts.findIndex(q => q.s >= b.s0), ib = c.pts.findLastIndex(q => q.s <= b.s1);
      for (const i of [ia - 1, ib + 1]) assert.ok(vs.some(v => Math.hypot(v[0] - c.pts[i].x, v[2] - c.pts[i].z) < 0.5 && Math.abs(v[1] - (c.pts[i].y - 0.38)) < 0.01), `${id} 谷面沒有銜接點 ${i}`);
    }
  }
});

test('河面的每個頂點都在它正下方的谷面（用實際的三角形內插）之上', () => {
  for (const id of ['chikuma', 'chikuma_up']) {
    const { made, grassMat } = run(id), tris = [];
    for (const m of made.filter(q => q.material === grassMat && q.geometry.index)) { const v = verts(m), ix = m.geometry.index; for (let i = 0; i < ix.length; i += 3) tris.push([v[ix[i]], v[ix[i + 1]], v[ix[i + 2]]]); }
    let checked = 0, worst = Infinity;
    for (const r of made.filter(m => m.material && m.material.shininess)) for (const q of verts(r)) {
      for (const [A, B, C] of tris) {
        const den = (B[2] - C[2]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[2] - C[2]); if (Math.abs(den) < 1e-9) continue;
        const u = ((B[2] - C[2]) * (q[0] - C[0]) + (C[0] - B[0]) * (q[2] - C[2])) / den, v = ((C[2] - A[2]) * (q[0] - C[0]) + (A[0] - C[0]) * (q[2] - C[2])) / den, w = 1 - u - v;
        if (u < 0 || v < 0 || w < 0) continue;
        checked++; worst = Math.min(worst, q[1] - (u * A[1] + v * B[1] + w * C[1]));
      }
    }
    assert.ok(checked > 80, `${id} 檢查了 ${checked} 個頂點`);
    assert.ok(worst > 0.05, `${id} 河面最低只高出谷面 ${worst.toFixed(3)} m`);
  }
});
