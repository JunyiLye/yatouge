// 路邊草地帶不能蓋到別段（沿路相距 > 60 m）的路面：groundWidths 依最近的別段距離收窄外側地面與懸崖裙邊。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
const block = n => { const o = `/* @${n}:start */`, s = html.indexOf(o), e = html.indexOf(`/* @${n}:end */`); assert.ok(s >= 0 && e > s, n); return html.slice(s + o.length, e); };
const M = new Function(`const clamp = (v, a, b) => Math.max(a, Math.min(b, v));\n${block('course-geometry')}\nreturn { buildCourse, TRACKS, groundWidths, groundCaps };`)();
const ids = Object.keys(M.TRACKS).flatMap(i => [i, i + '_up']);

test('groundWidths：每點每側回傳外側地面寬度，介於 hw+1 與 hw+13，裙邊（+1）不超過最近別段距離的一半', () => {
  for (const id of ids) {
    const c = M.buildCourse(id), W = M.groundWidths(c.pts, c.hw);
    assert.equal(W.length, 2); assert.equal(W[0].length, c.N);
    for (const w of W) for (let i = 0; i < c.N; i++) assert.ok(w[i] >= c.hw + 1 - 1e-6 && w[i] <= c.hw + 13 + 1e-6, `${id} ${i} ${w[i]}`);
  }
});

test('沒有近鄰的點維持原本的幾何（hw+13）：黑鷺山、白狼峠完全不變；青嵐峠只在髮夾彎附近的點改變', () => {
  const changed = id => { const c = M.buildCourse(id), W = M.groundWidths(c.pts, c.hw); let n = 0; for (const w of W) for (let i = 0; i < c.N; i++) if (w[i] < c.hw + 13) n++; return n; };
  assert.equal(changed('kurosagi'), 0); assert.equal(changed('hakuro'), 0);
  assert.ok(changed('seiran') < 600, `seiran ${changed('seiran')}`);
  assert.ok(changed('chikuma') > 100, '千曲坂的折返段要被收窄');
});

test('每條賽道（下坡與上坡）：路中心線與兩側路緣都不在別段的地面（含懸崖裙邊）之下', () => {
  for (const id of ids) {
    const c = M.buildCourse(id), P = c.pts, hw = c.hw, W = M.groundWidths(P, hw);
    let hits = 0, ex = null;
    for (let j = 0; j < P.length; j += 2) {
      const q = P[j];
      for (const lat of [-hw, 0, hw]) {
        const x = q.x - Math.cos(q.h) * lat, z = q.z + Math.sin(q.h) * lat;
        for (let i = 0; i < P.length; i++) {
          const p = P[i]; if (Math.abs(p.s - q.s) < 60) continue;
          const dx = x - p.x, dz = z - p.z; if (dx * dx + dz * dz > (hw + 14.5) ** 2) continue;
          const lo = -(dx * Math.cos(p.h)) + dz * Math.sin(p.h), lg = dx * Math.sin(p.h) + dz * Math.cos(p.h);
          if (Math.abs(lg) > 1.2) continue;
          const o1 = W[lo > 0 ? 1 : 0][i], a = Math.abs(lo);
          const dy = a < hw + 0.35 ? null : a <= o1 ? -0.08 - (a - hw - 0.35) / 12.65 * 1.12 : a <= o1 + 1 ? -0.08 - (o1 - hw - 0.35) / 12.65 * 1.12 - (a - o1) * 54 : null;
          if (dy !== null && p.y + dy > q.y + 0.05) { hits++; ex ??= { roadS: q.s, grassS: p.s, lat, a }; }
        }
      }
    }
    assert.equal(hits, 0, `${id}: ${hits} 處 ${JSON.stringify(ex)}`);
  }
});

test('buildTrack 用 groundWidths 畫草地與裙邊，樹只種在收窄後的地面內', () => {
  assert.ok(/const gw = groundWidths\(pts, roadHW\)/.test(html));
  assert.ok(/gw\[sg > 0 \? 1 : 0\]\[i\]/.test(html), '草地條帶用 gw');
  assert.ok(/o > gw\[side > 0 \? 1 : 0\]\[idx\] - 0\.5/.test(html), '樹的位置受 gw 限制');
});

// buildTrack 的草地條帶與裙邊（和 buildTrack 的公式一致）逐三角形檢查：不得蓋住任何路面點（任何沿路距離、同一段也算）。
// 草地高度比路面高出 -0.1 以上才算蓋住（低於路面 0.1 m 以上的草被路面擋住，看不到）。
function grassOnRoad(id) {
  const c = M.buildCourse(id), P = c.pts, hw = c.hw, N = c.N, W = M.groundWidths(P, hw), CELL = 10, grid = new Map();
  const road = [];
  for (let j = 0; j < N; j++) for (const lat of [-hw, -hw / 2, 0, hw / 2, hw]) {
    const p = P[j], q = { x: p.x - Math.cos(p.h) * lat, z: p.z + Math.sin(p.h) * lat, y: p.y, s: p.s, j };
    road.push(q); const k = Math.floor(q.x / CELL) + ',' + Math.floor(q.z / CELL); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(q);
  }
  const hits = []; const bad = new Set();
  const testTri = (A, B, C, tag) => {
    const x0 = Math.min(A.x, B.x, C.x), x1 = Math.max(A.x, B.x, C.x), z0 = Math.min(A.z, B.z, C.z), z1 = Math.max(A.z, B.z, C.z);
    const den = (B.z - C.z) * (A.x - C.x) + (C.x - B.x) * (A.z - C.z); if (Math.abs(den) < 1e-9) return;
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
      for (const q of grid.get(gx + ',' + gz) || []) {
        const u = ((B.z - C.z) * (q.x - C.x) + (C.x - B.x) * (q.z - C.z)) / den, v = ((C.z - A.z) * (q.x - C.x) + (A.x - C.x) * (q.z - C.z)) / den, w = 1 - u - v;
        if (u < 0 || v < 0 || w < 0) continue;
        if (u * A.y + v * B.y + w * C.y > q.y - 0.1) { hits.push({ roadS: Math.round(q.s), tag }); bad.add(q.j); }
      }
    }
  };
  for (const q of M.groundCaps(P, hw, W)) { testTri(q[0], q[2], q[1], 'cap'); testTri(q[1], q[2], q[3], 'cap'); }
  for (const sg of [-1, 1]) {
    const vert = (i, j) => { const p = P[i], w = W[sg > 0 ? 1 : 0][i], o = [hw + 0.35, w, w + 1][j], dy = [-0.08, -0.08 - (w - hw - 0.35) / 12.65 * 1.12, -55][j]; return { x: p.x - Math.cos(p.h) * sg * o, z: p.z + Math.sin(p.h) * sg * o, y: p.y + dy }; };
    for (let i = 0; i < N - 1; i++) for (let j = 0; j < 2; j++) {
      const a = vert(i, j), b = vert(i, j + 1), cc = vert(i + 1, j), d = vert(i + 1, j + 1);
      for (const [A, B, C] of [[a, cc, b], [b, cc, d]]) {
        const x0 = Math.min(A.x, B.x, C.x), x1 = Math.max(A.x, B.x, C.x), z0 = Math.min(A.z, B.z, C.z), z1 = Math.max(A.z, B.z, C.z);
        const den = (B.z - C.z) * (A.x - C.x) + (C.x - B.x) * (A.z - C.z); if (Math.abs(den) < 1e-9) continue;
        for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
          for (const q of grid.get(gx + ',' + gz) || []) {
            const u = ((B.z - C.z) * (q.x - C.x) + (C.x - B.x) * (q.z - C.z)) / den, v = ((C.z - A.z) * (q.x - C.x) + (A.x - C.x) * (q.z - C.z)) / den, w = 1 - u - v;
            if (u < 0 || v < 0 || w < 0) continue;
            if (u * A.y + v * B.y + w * C.y > q.y - 0.1) { hits.push({ roadS: Math.round(q.s), grassS: Math.round(P[i].s), side: sg }); bad.add(q.j); }
          }
        }
      }
    }
  }
  return { n: bad.size, hits };
}
test('每條賽道（下坡與上坡）：草地條帶與裙邊的三角形不蓋住任何路面點（含同一段的彎內側）', () => {
  for (const id of ids) { const r = grassOnRoad(id); assert.equal(r.n, 0, `${id}: ${r.n} 個路點被草蓋住，例 ${JSON.stringify(r.hits.slice(0, 3))}`); }
});

test('路燈（貼著護欄外 1.3 m）與樹不會落在任何一段路面上', () => {
  for (const id of ids) {
    const c = M.buildCourse(id), P = c.pts, hw = c.hw;
    for (let i = 30, side = 1; i < c.N - 30; i += 60, side = -side) {
      const p = P[i], x = p.x - Math.cos(p.h) * side * (hw + 1.3), z = p.z + Math.sin(p.h) * side * (hw + 1.3);
      for (let j = 0; j < c.N; j++) if (Math.abs(P[j].y - p.y) < 30) assert.ok(Math.hypot(x - P[j].x, z - P[j].z) > hw + 0.3, `${id} 路燈 s=${p.s} 離 s=${P[j].s} 的路面太近`);
    }
  }
  assert.ok(/clearOfRoad\(w\[0\], w\[2\], w\[1\], roadHW \+ 3\)/.test(html), '樹與所有路段中心線至少相距 hw+3');
});

test('groundCaps：髮夾彎內側（兩側地面被收窄的地方）補一塊地面，蓋不到任何路面；沒有收窄的賽道一塊都沒有', () => {
  const n = id => { const c = M.buildCourse(id); return M.groundCaps(c.pts, c.hw, M.groundWidths(c.pts, c.hw)).length; };
  assert.equal(n('kurosagi'), 0); assert.equal(n('hakuro'), 0); assert.equal(n('kurosagi_up'), 0); assert.equal(n('hakuro_up'), 0);
  for (const id of ['seiran', 'seiran_up', 'chikuma', 'chikuma_up']) assert.ok(n(id) >= 20, `${id} 補地面 ${n(id)} 塊`);
  for (const id of ids) { const r = grassOnRoad(id); assert.equal(r.n, 0, `${id} 補地面後仍有 ${r.n} 個路點被蓋住`); }
  assert.ok(html.includes('groundCaps(pts, roadHW, gw)'), 'buildTrack 畫出補地面');
});
