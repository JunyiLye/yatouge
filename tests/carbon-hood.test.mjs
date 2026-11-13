// KX-2 碳纖維引擎蓋：2 cm 厚的實體面板（純函式取自 @carbon-hood 區塊，並檢查外觀與車內都用同一個面板）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
const between = (a, b) => { const s = html.indexOf(a), e = html.indexOf(b, s); assert.ok(s >= 0 && e > s, a); return html.slice(s, e); };
const { CAB } = new Function(`${between('/* @cabin-shape:start */', '/* @cabin-shape:end */')}\nreturn { CAB };`)();
const { carbonHoodStations, CARBON_THICK, CARBON_INSET, CARBON_LINE } = new Function(`${between('/* @carbon-hood:start */', '/* @carbon-hood:end */')}\nreturn { carbonHoodStations, CARBON_THICK, CARBON_INSET, CARBON_LINE };`)();
const widthK = new Function(`const clamp = (v, a, b) => Math.min(b, Math.max(a, v));\n${between('const sstep', 'function profile')}\nreturn widthK;`)();
const K = CAB.hatch, st = carbonHoodStations(K, K.S, widthK);

test('碳纖維面板厚 2 cm，底部貼在車身引擎蓋線上', () => {
  assert.equal(CARBON_THICK, 0.02);
  const [a, b] = K.hood;
  for (const q of st) {
    assert.ok(Math.abs(q.yTop - q.yBase - 0.02) < 1e-9);
    assert.ok(Math.abs(q.yBase - (a[1] + (b[1] - a[1]) * (q.z - a[0]) / (b[0] - a[0]))) < 1e-9);
  }
});

test('面板與壁面、分模線都在車身半寬以內（不會穿出翼子板），且有留縫', () => {
  for (const q of st) {
    assert.ok(q.hw < q.hwLine && q.hwLine <= q.bodyHw + 1e-9, `z=${q.z}`);
    assert.ok(Math.abs(q.bodyHw - q.hwLine - (CARBON_INSET - CARBON_LINE) * (q.bodyHw / (K.bodyW / 2))) < 1e-9);
  }
});

test('面板位於擋風玻璃底部與車鼻之間：後緣在擋風玻璃底，前緣不超出車鼻，也不碰燈殼（z 2.09 以前）', () => {
  assert.equal(st[0].z, K.house[0][0]);
  assert.ok(st[st.length - 1].z < K.hood[1][0]);
  assert.ok(st[st.length - 1].z >= 2.09);
});

test('外觀與車內都用 carbonHood，中央凸起面板跟著抬高 2 cm，邊緣材質逐車建立不放進共用集合', () => {
  assert.ok(!html.includes('carbonStrip'));
  assert.equal((html.match(/carbonHood\(/g) || []).length, 3, '定義 + 外觀 + 車內');
  assert.equal((html.match(/kxHoodPanel\([^)]*CARBON_THICK/g) || []).length, 2);
  assert.ok(/new Set\(\[[^\]]*\bcarbonTex\b/.test(html));
  assert.ok(!/new Set\(\[[^\]]*carbonEdgeMat/.test(html));
});

test('makeInterior 的參數不能蓋掉頂層的 carbonHood 函式（曾造成 carbonHood is not a function）', () => {
  const m = html.match(/function makeInterior\(([^)]*)\)/);
  assert.ok(m);
  assert.ok(!m[1].split(',').map(s => s.trim().split('=')[0].trim()).includes('carbonHood'), m[1]);
});

test('沒有任何函式參數與頂層的 carbonHood / carbonEdgeMat / carbonMat 同名', () => {
  for (const [, params] of html.matchAll(/function\s+\w*\s*\(([^)]*)\)/g)) for (const n of ['carbonHood', 'carbonEdgeMat', 'carbonMat']) assert.ok(!new RegExp(`(^|[,\s])${n}\s*(=|,|$)`).test(params), `${n} in (${params})`);
});
