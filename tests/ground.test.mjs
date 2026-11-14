// 路邊草地帶不能蓋到別段（沿路相距 > 60 m）的路面：groundWidths 依最近的別段距離收窄外側地面與懸崖裙邊。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
const block = n => { const o = `/* @${n}:start */`, s = html.indexOf(o), e = html.indexOf(`/* @${n}:end */`); assert.ok(s >= 0 && e > s, n); return html.slice(s + o.length, e); };
const M = new Function(`const clamp = (v, a, b) => Math.max(a, Math.min(b, v));\n${block('course-geometry')}\nreturn { buildCourse, TRACKS, groundWidths };`)();
const ids = Object.keys(M.TRACKS).flatMap(i => [i, i + '_up']);

test('groundWidths：每點每側回傳外側地面寬度，介於 hw+1 與 hw+13，裙邊（+1）不超過最近別段距離的一半', () => {
  for (const id of ids) {
    const c = M.buildCourse(id), W = M.groundWidths(c.pts, c.hw);
    assert.equal(W.length, 2); assert.equal(W[0].length, c.N);
    for (const w of W) for (let i = 0; i < c.N; i++) assert.ok(w[i] >= c.hw + 1 - 1e-6 && w[i] <= c.hw + 13 + 1e-6, `${id} ${i} ${w[i]}`);
  }
});

test('沒有近鄰的點維持原本的幾何（hw+13）：黑鷺山、白狼峠完全不變；青嵐峠只在少數點改變', () => {
  const changed = id => { const c = M.buildCourse(id), W = M.groundWidths(c.pts, c.hw); let n = 0; for (const w of W) for (let i = 0; i < c.N; i++) if (w[i] < c.hw + 13) n++; return n; };
  assert.equal(changed('kurosagi'), 0); assert.equal(changed('hakuro'), 0);
  assert.ok(changed('seiran') < 120, `seiran ${changed('seiran')}`);
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
