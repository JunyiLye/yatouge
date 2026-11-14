// 橋的繪製（buildBridges）：用假的 THREE 跑一次，確認不丟錯、座標沒有 NaN、橋段沒有草地、有橋墩與河，橋墩落在谷底之上、頂在梁下。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
const block = n => { const o = `/* @${n}:start */`, s = html.indexOf(o), e = html.indexOf(`/* @${n}:end */`); return html.slice(s + o.length, e); };
const cut = (a, b) => { const s = html.indexOf(a), e = html.indexOf(b, s); assert.ok(s >= 0 && e > s, a); return html.slice(s, e); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const geo = new Function(`const clamp = (v, a, b) => Math.max(a, Math.min(b, v));\n${block('course-geometry')}\nreturn { buildCourse, groundWidths, DS, lerpAngle };`)();
const cam = new Function(`${block('gallery')}\n${block('camera-modes')}\nreturn { GALLERY, galleryClampCam, nearChasePose };`)();

function run(id) {
  const set = new Set(), made = [];
  class Obj { constructor(g, m) { this.geometry = g; this.material = m; this.position = { set: (x, y, z) => { this.pos = [x, y, z]; } }; this.rotation = {}; made.push(this); } }
  class Geo { constructor(kind, ...a) { this.kind = kind; this.args = a; this.attributes = {}; } setAttribute(n, a) { this.attributes[n] = a; } setIndex(i) { this.index = i; } computeVertexNormals() {} }
  const THREE = {
    Mesh: Obj, InstancedMesh: class extends Obj { constructor(g, m, n) { super(g, m); this.n = n; this.inst = []; } setMatrixAt(i, m) { this.inst[i] = { p: m.p.slice(), h: m.h || 0 }; } },
    BufferGeometry: Geo, BufferAttribute: class { constructor(a) { this.array = a; } }, Float32BufferAttribute: class { constructor(a) { this.array = a; } },
    MeshLambertMaterial: class { constructor(o) { Object.assign(this, o); } }, MeshPhongMaterial: class { constructor(o) { Object.assign(this, o); } }, MeshBasicMaterial: class { constructor(o) { Object.assign(this, o); } },
    BoxGeometry: class extends Geo { constructor(...a) { super('box', ...a); } }, CylinderGeometry: class extends Geo { constructor(...a) { super('cyl', ...a); } },
    Matrix4: class { makeTranslation(x, y, z) { this.p = [x, y, z]; return this; } makeRotationY(h) { this.h = h; this.p = [0, 0, 0]; return this; } makeRotationX(a) { this.ax = a; return this; } multiply(o) { this.ax = o.ax; return this; } setPosition(x, y, z) { this.p = [x, y, z]; return this; } }
  };
  const c = geo.buildCourse(id), gw = geo.groundWidths(c.pts, c.hw), onBridge = new Uint8Array(c.N);
  for (const b of c.bridges) for (let i = 0; i < c.N; i++) if (c.pts[i].s >= b.s0 && c.pts[i].s <= b.s1) onBridge[i] = 1;
  const grassMat = { name: 'grass' }, railMat = { name: 'rail' }, trackGroup = { add: o => set.add(o) };
  const src = cut('function strip(', 'const aniso') + '\n' + cut('const BRIDGE = ', 'function buildTrack(');
  const f = new Function('THREE', 'clamp', 'lerpAngle', 'DS', 'pts', 'N', 'bridges', 'rocks', 'GALLERY', 'glow', 'glowTex', 'roadHW', 'trackGroup', 'grassMat', 'railMat', 'off', 'out',
    `${src.replace(/const aniso[\s\S]*$/, '')}\nreturn buildBridges;`);
  const off = (p, o, dy) => [p.x - Math.cos(p.h) * o, p.y + dy, p.z + Math.sin(p.h) * o];
  f(THREE, clamp, geo.lerpAngle, geo.DS, c.pts, c.N, c.bridges, c.rocks, cam.GALLERY, () => ({ position: { set() {} }, material: {} }), null, c.hw, trackGroup, grassMat, railMat, off)(onBridge, gw);
  return { made: [...new Set([...made, ...set])], c, grassMat, onBridge, pts: c.pts };
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
  assert.ok(/strip\(3,[\s\S]*?grassMat, grassSkip\(sg\)\)/.test(bt), '草地條帶略過橋段與山壁側');
  assert.ok(/railMat, offBridge\)/.test(bt), '一般護欄略過橋段');
  assert.ok(/onBridge\[idx\] \|\|/.test(bt), '樹略過橋段');
  assert.ok(/if \(bridges\.length\) buildBridges\(onBridge, gw\)/.test(bt));
  const bb = cut('function buildBridges(', 'function buildTrack(');
  assert.ok(!/SHARED\.add|new Set/.test(bb));
  assert.ok(/trackGroup\.add/.test(bb), '橋的物件都加進 trackGroup（disposeTrack 會清）');
});

// 輔助：最近的路點（xz 平面）
const nearest = (c, x, z) => { let b = null, bd = Infinity; for (const p of c.pts) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; b = p; } } return { p: b, d: bd }; };
const verts = m => { const a = m.geometry.attributes.position.array, used = m.geometry.index ? new Set(m.geometry.index) : null, o = []; for (let i = 0; i < a.length; i += 3) if (!used || used.has(i / 3)) o.push([a[i], a[i + 1], a[i + 2]]); return o; };

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
  assert.ok(bt.includes('railMat, offBridge)') && bt.includes('grassMat, grassSkip(sg))'), '一般護欄與草地在橋段（含橋端那一段）略過');
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

test('河面材質：月光高光是柔和的藍白，不會亮成純白（高光色的每個分量 <= 0x60，且不是強反光）', () => {
  const { made } = run('chikuma'), r = made.find(m => m.material && m.material.shininess).material;
  for (const sh of [16, 8, 0]) assert.ok(((r.specular >> sh) & 255) <= 0x60, `specular 0x${r.specular.toString(16)}`);
  assert.ok(r.shininess <= 60, `shininess ${r.shininess}`);
});

const nearestIdx = (c, x, z) => { let b = 0, bd = Infinity; c.pts.forEach((p, i) => { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; b = i; } }); return b; };
const rel = (c, v) => { const i = nearestIdx(c, v[0], v[2]), p = c.pts[i], dx = v[0] - p.x, dz = v[2] - p.z; return { i, s: p.s, o: -dx * Math.cos(p.h) + dz * Math.sin(p.h), dy: v[1] - p.y }; };

test('頂棚橋：左牆與屋頂整段封閉，淨高高於所有鏡頭，右側是一根根的柱子（約 5–6 m 一根）加低護牆，有幾盞頂燈', () => {
  for (const id of ['chikuma', 'chikuma_up']) {
    const { made, c } = run(id), g = c.bridges.find(b => b.kind === 'gallery'), cs = g.side, CL = cam.GALLERY.CLEAR;
    const vs = made.filter(m => m.geometry?.attributes?.position).flatMap(m => verts(m).map(v => rel(c, v)));
    const inG = vs.filter(q => q.s >= g.s0 && q.s <= g.s1);
    // 左牆：靠近封閉側、高度到淨高的頂點，整段每 6 m 都有
    for (let s = g.s0 + 3; s < g.s1 - 3; s += 6) {
      assert.ok(inG.some(q => Math.abs(q.s - s) < 2 && Math.abs(q.o - cs * (c.hw + 0.4)) < 0.05 && Math.abs(q.dy - CL) < 0.05), `${id} 封閉牆在 s=${s.toFixed(0)} 缺`);
      assert.ok(inG.some(q => Math.abs(q.s - s) < 2 && Math.abs(q.dy - CL) < 0.05 && Math.abs(q.o + cs * (c.hw + 1.3)) < 0.05), `${id} 屋頂在 s=${s.toFixed(0)} 缺`);
    }
    assert.ok(CL >= 6 && CL <= 7, 'clear height ' + CL);
    // 鏡頭最高：追蹤 2.5 + 0.012 * 70、近距 2.0 + 0.006 * 70，再留 1.5 m 的餘裕
    assert.ok(CL >= 2.5 + 0.012 * 70 + 1.5, '淨高要高於追蹤鏡頭');
    const pil = made.filter(m => m.inst && m.geometry.kind === 'box' && m.geometry.args[1] === CL).flatMap(m => m.inst.filter(Boolean));
    assert.ok(pil.length >= 12, `${id} 柱子 ${pil.length}`);
    const ps = pil.map(p => rel(c, p.p)).sort((a, b) => a.s - b.s);
    for (const q of ps) assert.ok(Math.abs(q.o + cs * (c.hw + 0.8)) < 0.3, `柱子在開口側 ${q.o}`);
    for (let i = 1; i < ps.length; i++) assert.ok(ps[i].s - ps[i - 1].s >= 5 && ps[i].s - ps[i - 1].s <= 6.5, `柱距 ${ps[i].s - ps[i - 1].s}`);
    const lamps = made.filter(m => m.material && m.material.color === 0xffd9a0);
    assert.ok(lamps.length >= 3 && lamps.length <= 8, `頂燈 ${lamps.length}`);
  }
});

test('galleryClampCam：鏡頭在棚內被限制在左牆與右側之內、屋頂之下；棚外不動的條件由呼叫端判斷', () => {
  const rp = { x: 100, y: 50, z: 200, h: 0.7 }, hw = 4.2, lim = hw + 0.2;
  const sx = Math.sin(rp.h), cx = Math.cos(rp.h);
  for (const o of [-9, -4.3, 0, 3, 9]) for (const y of [0, 2, 3.4, 9]) {
    const pos = { x: rp.x - cx * o + sx * (-8), y: rp.y + y, z: rp.z + sx * o + cx * (-8) };
    const q = cam.galleryClampCam(pos, rp, hw), dx = q.x - rp.x, dz = q.z - rp.z, oo = -dx * cx + dz * sx, lon = dx * sx + dz * cx;
    assert.ok(Math.abs(oo) <= lim + 1e-9, `o ${oo}`); assert.ok(Math.abs(lon + 8) < 1e-9, '前後位置不變');
    assert.ok(q.y <= rp.y + cam.GALLERY.CLEAR - 1.0 + 1e-9);
    if (Math.abs(o) <= lim && y <= 3.4) { assert.equal(q.x, pos.x); assert.equal(q.y, pos.y); }
  }
  // 近距與追蹤鏡頭的最高位置（高速）本來就在淨高以內
  const n = cam.nearChasePose({ x: 0, y: 0, z: 0 }, 0, 70);
  assert.ok(n.pos.y < cam.GALLERY.CLEAR - 1.0 && 2.5 + 0.012 * 70 < cam.GALLERY.CLEAR - 1.0);
  // 進棚前（ahead > 0）限制放寬、越靠近入口越緊，鏡頭從外面滑進來而不是瞬間被拉進去
  const far = { x: rp.x - cx * 12 + sx * -8, y: rp.y + 3, z: rp.z + sx * 12 + cx * -8 };
  let prev = Infinity;
  for (const ahead of [6, 4, 2, 0]) { const q = cam.galleryClampCam(far, rp, hw, ahead), oo = Math.abs(-(q.x - rp.x) * cx + (q.z - rp.z) * sx); assert.ok(oo <= prev + 1e-9 && oo <= hw + 0.2 + ahead * 1.5 + 1e-9); prev = oo; }
  assert.ok(cam.GALLERY.ENTRY >= 6);
  const uc = cut('function updateCamera(', '/* ---------- drift scoring');
  assert.ok(uc.includes('galleryClampCamera()'), 'updateCamera 在棚內做限制');
  assert.ok(cut('function specCamera(', 'specCamera(dt) {\n').length > 0 && cut('function specCamera(', '\n}\n').includes('galleryClampCamera()'), '旁觀鏡頭也在棚內做限制');
  const gc = cut('function galleryClampCamera(', 'function updateCamera(');
  assert.ok(gc.includes('galleryClampCam(') && gc.includes('GALLERY.ENTRY'), '共用的限制函式從入口前一段就開始');
});

test('桁架橋（第二座）：兩側各一排白色鋼桁架（上弦桿高 1.6–1.8 m、直桿與斜桿），取代低護牆；碰撞牆不變', () => {
  for (const id of ['chikuma', 'chikuma_up']) {
    const { made, c } = run(id), t = c.bridges.find(b => b.kind === 'truss');
    const white = made.filter(m => m.material && m.material.color === 0xf2f2ef);
    assert.ok(white.length >= 3, 'white meshes ' + white.length);
    const top = white.filter(m => !m.inst && m.geometry?.attributes?.position).flatMap(m => verts(m).map(v => rel(c, v))).filter(q => q.s >= t.s0 && q.s <= t.s1 && q.dy > 1.4);
    assert.ok(top.length > 10, '上弦桿頂點');
    const hmax = Math.max(...top.map(q => q.dy)); assert.ok(hmax >= 1.6 && hmax <= 1.8, `桁架高 ${hmax}`);
    for (const sg of [-1, 1]) assert.ok(top.some(q => Math.sign(q.o) === sg && Math.abs(Math.abs(q.o) - (c.hw + 0.5)) < 0.1), '兩側都有');
    const inst = white.filter(m => m.inst).flatMap(m => m.inst.filter(Boolean).map(p => ({ k: m.geometry.args, ...rel(c, p.p), ax: p.ax })));
    const vert = inst.filter(q => q.k[1] > 1.2 && q.k[0] < 0.2), diag = inst.filter(q => q.k[2] > 2.5);
    assert.ok(vert.length >= 30, `直桿 ${vert.length}`); assert.ok(diag.length >= 30, `斜桿 ${diag.length}`);
    for (const q of [...vert, ...diag]) assert.ok(q.s >= t.s0 - 1 && q.s <= t.s1 + 1, '桁架只在橋段');
    // 這座橋沒有低水泥護牆（0.85 m）：橋段內 hw+0.3..0.75 之間沒有高 0.85 的混凝土頂點
    const conc = made.filter(m => m.material && m.material.color === 0x8b8f99 && m.geometry?.attributes?.position).flatMap(m => verts(m).map(v => rel(c, v)));
    const bad = conc.filter(q => q.s > t.s0 + 3 && q.s < t.s1 - 3 && Math.abs(q.dy - 0.85) < 0.01 && Math.abs(q.o) > c.hw && Math.abs(q.o) < c.hw + 1); assert.equal(bad.length, 0, JSON.stringify(bad.slice(0, 3)));
  }
});

test('山壁：貼著頂棚橋的那端低於棚牆（<= 7 m）、遠離後升到 8–13 m、往桁架橋那端收進地形（上坡下坡一致）；不碰路面、不重疊棚牆、沒有縫', () => {
  for (const id of ['chikuma', 'chikuma_up']) {
    const { made, c } = run(id), r = c.rocks[0], g = c.bridges.find(b => b.kind === 'gallery'), t = c.bridges.find(b => b.kind === 'truss');
    const galAtStart = Math.abs(g.s1 - r.s0) < Math.abs(g.s0 - r.s1);
    const rock = made.filter(m => m.material && m.material.color === 0x4a4d55 && m.geometry?.attributes?.position);
    assert.equal(rock.length, 1);
    const vs = verts(rock[0]).map(v => rel(c, v)).filter(q => q.dy > -20);
    assert.ok(vs.length > 20);
    for (const q of vs) { assert.equal(Math.sign(q.o), r.side, '山壁在指定的一側'); assert.ok(Math.abs(q.o) >= c.hw + 0.3, `不碰路面 ${q.o}`); }
    const sGal = galAtStart ? r.s0 : r.s1, sTru = galAtStart ? r.s1 : r.s0;
    const at = (sx, pick) => vs.filter(q => Math.abs(q.s - sx) < 1.6).map(q => q.dy);
    const gEnd = Math.max(...at(sGal)), tEnd = Math.max(...at(sTru));
    assert.ok(gEnd <= 7.0, `${id} 貼著棚牆那端高 ${gEnd.toFixed(1)} m，要不高於棚牆 7 m`);
    assert.ok(tEnd < 2.5, `${id} 桁架橋那端收進地形 ${tEnd.toFixed(1)}`);
    const mid = vs.filter(q => Math.abs(q.s - sGal) > 11 && Math.abs(q.s - sTru) > 9).map(q => q.dy);
    assert.ok(Math.max(...mid) >= 8 && Math.max(...mid) <= 13, `岩壁高 ${Math.max(...mid)}`);
    // 背面緩降：外側 25 m 以外的頂點離地不高於 2 m，不是一片 10 m 的薄牆
    const back = vs.filter(q => Math.abs(q.o) > c.hw + 25 && Math.abs(q.s - sTru) > 9).map(q => q.dy);
    assert.ok(Math.max(...back) < 3, `背面 ${Math.max(...back)}`);
    // 沒有縫、沒有重疊：岩壁的第一列／最後一列正好是棚（或桁架橋）最後畫到的那個點
    const gS = galAtStart ? g.s1 : g.s0, ss = vs.map(q => q.s);
    const ib = c.pts.findLastIndex(q => q.s <= r.s0) + 1, ia = c.pts.findIndex(q => q.s >= r.s1) - 1;
    assert.ok(Math.abs(Math.min(...ss) - c.pts[ib].s) < 0.05 && Math.abs(Math.max(...ss) - c.pts[ia].s) < 0.05, '岩壁涵蓋第一個到最後一個橋外點');
    assert.ok(galAtStart ? Math.min(...ss) > g.s1 : Math.max(...ss) < g.s0, '岩壁不伸進棚內');
    void t; void gS;
  }
  const bt = cut('function buildTrack(', '/* sky dome');
  assert.ok(bt.includes('onRock'), '樹與草地略過山壁');
});

test('宣布前不使用：橋與地面的程式讀到的頂層常數／變數，全部在第一個 buildTrack(trackId) 呼叫之前宣告', () => {
  const first = html.indexOf('\nbuildTrack(trackId);'); assert.ok(first > 0);
  const names = new Map();
  for (const m of html.matchAll(/^(?:const|let) ([^=;\n]+?)(?: =|;|$)/gm)) for (const n of m[1].split(',').map(x => x.trim()).filter(x => /^[A-Za-z_$][\w$]*$/.test(x))) if (!names.has(n)) names.set(n, m.index);
  const fns = ['function buildTrack(', 'function buildBridges(', 'function groundCaps(', 'function groundWidths(', 'function strip(', 'function buildCourse('];
  for (const f of fns) {
    const a = html.indexOf(f), body = html.slice(a, html.indexOf('\n}\n', a)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/'[^'\n]*'/g, "''");
    const declaredHere = n => new RegExp('(?:const|let|\\(|,)\\s*' + n + '(?![\\w$])\\s*(?:=|,|\\)|of |in )').test(body); // a local of the same name hides the top-level one
    for (const [n, at] of names) if (at > first && !declaredHere(n) && new RegExp('(^|[^\\w$.])' + n.replace(/\$/g, '\\$') + '(?![\\w$])').test(body)) assert.fail(f + ' 用到 ' + n + '，但它在第一個 buildTrack 呼叫之後才宣告');
  }
  assert.ok(html.indexOf('const GALLERY') < first && html.indexOf('const GALLERY') > 0);
});

test('橋的所有新網格（頂棚、桁架、山壁、柱、燈、路面光斑；不含谷面、河、橋墩）三角形合計 <= 6000（實測約 5.5 k，頂棚橋與桁架橋各佔約 2 k）', () => {
  const { made, grassMat } = run('chikuma');
  let tris = 0;
  for (const m of made) {
    if (m.material === grassMat || (m.material && m.material.shininess) || m.geometry?.kind === 'cyl') continue;
    if (m.inst) tris += m.inst.filter(Boolean).length * 12;
    else if (m.geometry?.kind === 'box') tris += 12;
    else if (m.geometry?.index) tris += m.geometry.index.length / 3;
  }
  assert.ok(tris <= 6000, 'tris ' + tris);
});

test('頂棚橋：兩端各有粗的入口框（橫樑加兩側粗柱），棚內每盞燈下的路面有光斑', () => {
  for (const id of ['chikuma', 'chikuma_up']) {
    const { made, c } = run(id), g = c.bridges.find(b => b.kind === 'gallery'), CL = cam.GALLERY.CLEAR;
    const lintels = made.filter(m => m.geometry?.kind === 'box' && Math.abs(m.geometry.args[0] - (2 * c.hw + 2.6)) < 1e-9 && m.geometry.args[1] === 1.5);
    assert.equal(lintels.length, 2, '兩端各一根橫樑');
    const sOf = m => nearestIdx(c, m.pos[0], m.pos[2]);
    assert.ok(lintels.some(m => Math.abs(c.pts[sOf(m)].s - g.s0) < 3) && lintels.some(m => Math.abs(c.pts[sOf(m)].s - g.s1) < 3), '橫樑在棚的兩端');
    for (const m of lintels) assert.ok(m.pos[1] - c.pts[sOf(m)].y > CL - 0.8, '橫樑在屋頂高度');
    assert.equal(made.filter(m => m.geometry?.kind === 'box' && m.geometry.args[0] === 1.4 && m.geometry.args[1] === CL + 0.8).length, 2, '封閉側粗柱');
    assert.equal(made.filter(m => m.geometry?.kind === 'box' && m.geometry.args[0] === 1.2 && m.geometry.args[1] === CL).length, 2, '開口側粗柱');
    const patch = made.filter(m => m.material && m.material.polygonOffset && m.material.transparent && m.geometry?.attributes?.position);
    assert.equal(patch.length, 1, '路面光斑');
    const vs = verts(patch[0]).map(v => rel(c, v));
    assert.ok(vs.length >= 12 && vs.every(q => q.s >= g.s0 && q.s <= g.s1 && q.dy > 0.01 && q.dy < 0.1), '光斑貼在棚內路面上方一點點');
  }
});

test('桁架橋：白色（亮、不偏藍）、桿件至少 0.10 m 粗、兩端各有往內斜的端柱；橋上沒有路燈桿穿過桁架', () => {
  for (const id of ['chikuma', 'chikuma_up']) {
    const { made, c } = run(id), t = c.bridges.find(b => b.kind === 'truss');
    const white = made.filter(m => m.material && m.material.color === 0xf2f2ef);
    assert.ok(white.length >= 5);
    const mat = white[0].material, ch = x => [(x >> 16) & 255, (x >> 8) & 255, x & 255];
    const [r, g, b] = ch(mat.color); assert.ok(r >= 0xe8 && g >= 0xe8 && b - r <= 8, '亮而不偏藍');
    const inst = white.filter(m => m.inst);
    assert.ok(inst.some(m => m.geometry.args[0] >= 0.1 && m.geometry.args[1] > 1.2), '直桿 >= 0.10 m');
    assert.ok(inst.some(m => m.geometry.args[0] >= 0.1 && m.geometry.args[2] > 2.5), '斜桿 >= 0.10 m');
    const posts = white.filter(m => !m.inst && m.geometry?.kind === 'box' && m.geometry.args[0] === 0.16);
    assert.equal(posts.length, 4, '兩側各兩端共 4 根端柱');
    for (const m of posts) { assert.ok(Math.abs(m.rotation.x) > 0.5 && Math.abs(m.rotation.x) < 1.3, `端柱傾斜 ${m.rotation.x}`); const q = c.pts[nearestIdx(c, m.pos[0], m.pos[2])]; assert.ok(q.s >= t.s0 - 1 && q.s <= t.s1 + 1, '端柱在橋上'); }
    const half = posts.map(m => c.pts[nearestIdx(c, m.pos[0], m.pos[2])].s);
    assert.ok(half.some(x => x < (t.s0 + t.s1) / 2) && half.some(x => x > (t.s0 + t.s1) / 2), '兩端都有');
  }
  const bt = cut('function buildTrack(', '/* sky dome');
  assert.ok(bt.includes('if (b.kind)') && bt.includes('if (onGallery[i]) continue'), '頂棚橋與桁架橋不放路燈');
});
