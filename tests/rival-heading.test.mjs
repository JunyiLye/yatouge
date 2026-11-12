// Seiran/Hakuro 的路徑點 h 以 atan2 存放（-π..π），直線段朝 -z 時相鄰兩點會跨 ±π。
// samplePos / locate 內插 h 時若不處理跨越，該 1.5 m 區段內 h 會繞 ~360° 掃過一圈，
// AI 對手的車身與碰撞盒隨之旋轉並橫移（幻影碰撞）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
const block = n => { const a = '/* @' + n + ':start */', i = html.indexOf(a), j = html.indexOf('/* @' + n + ':end */'); return html.slice(i + a.length, j); };
const fn = name => { const i = html.indexOf('function ' + name + '('); let d = 0; for (let k = html.indexOf('{', i); ; k++) { if (html[k] === '{') d++; if (html[k] === '}' && --d === 0) return html.slice(i, k + 1); } };

// 在與 yatouge.html 相同的全域形狀下執行真正的 samplePos / locate 原文
const world = new Function(`
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
${block('course-geometry')}
let pts, N; const rival = { i: 0 };
${fn('samplePos')}
${fn('locate')}
return { buildCourse, load(id) { ({ pts, N } = buildCourse(id)); rival.i = 0; return pts; }, samplePos, locate, wrap, rival };`)();

for (const id of ['kurosagi', 'seiran', 'hakuro']) {
  test(`${id}: samplePos 的 h 沿路平滑（任何 5 cm 步進 < 0.02 rad），位置不橫跳`, () => {
    const pts = world.load(id), end = pts[pts.length - 3].s;
    let prev = world.samplePos(2, -2.4), worst = 0, worstS = 0;
    for (let s = 2.05; s < end; s += 0.05) {
      const q = world.samplePos(s, -2.4), d = Math.abs(world.wrap(q.h - prev.h)), jump = Math.hypot(q.x - prev.x, q.z - prev.z);
      if (d > worst) { worst = d; worstS = s; }
      assert.ok(jump < 0.2, `s=${s.toFixed(2)} 位置跳 ${jump.toFixed(2)} m`);
      prev = q;
    }
    assert.ok(worst < 0.02, `s=${worstS.toFixed(2)} h 一步變化 ${worst.toFixed(3)} rad`);
    // 內插出的 h 必須落在相鄰兩點之間的短弧上（不得繞遠路）
    for (let s = 2.1; s < end; s += 0.37) {
      const r = world.samplePos(s, 0), a = pts[r.i].h, b = pts[r.i + 1].h;
      assert.ok(Math.abs(world.wrap(r.h - a)) <= Math.abs(world.wrap(b - a)) + 1e-9, `s=${s.toFixed(2)} h 沒落在短弧上`);
    }
  });

  test(`${id}: locate 在中心線上 lat≈0，h 與 samplePos 一致且平滑`, () => {
    const pts = world.load(id), o = { x: pts[5].x, z: pts[5].z, idx: 5 };
    let prevH = null;
    for (let s = 8; s < pts[pts.length - 3].s; s += 0.25) {
      const r = world.samplePos(s, 0), L = world.locate(Object.assign(o, { x: r.x, z: r.z }));
      assert.ok(Math.abs(L.lat) < 0.05, `s=${s.toFixed(2)} lat=${L.lat.toFixed(3)}`);
      if (prevH !== null) assert.ok(Math.abs(world.wrap(L.h - prevH)) < 0.08, `s=${s.toFixed(2)} locate.h 跳 ${world.wrap(L.h - prevH).toFixed(3)}`);
      prevH = L.h;
    }
  });
}
