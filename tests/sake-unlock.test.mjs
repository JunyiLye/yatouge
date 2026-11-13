// 送酒通關獎勵：抽出 yatouge.html 的 @sake + @cars（純函式與資料）— 通關判定、KX-2 極速升級（物理與極速條）、第 5 色（白＋碳纖維引擎蓋）的鎖定與回退
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const M = new Function(`${block('sake')}\n${block('cars')}
return { sakeClearKey, sakeCleared, CARS, STAT, KX_UP, carPhys, carStats, colorOpen, safeChoice };`)();
const { sakeClearKey, sakeCleared, CARS, STAT, KX_UP, carPhys, carStats, colorOpen, safeChoice } = M;

test('通關紀錄 key 與判定：只有字串 "1" 算通關，壞資料一律未通關', () => {
  assert.equal(sakeClearKey, 'yatouge-sake-clear');
  assert.equal(sakeCleared('1'), true);
  for (const bad of [null, undefined, '', '0', 'true', ' 1', '11', 1, true, {}, [], '{"a":1}', NaN]) assert.equal(sakeCleared(bad), false, String(bad));
});

test('極速升級物理：開 57、關 54、其他數值不變；其他車不受影響；不改動 CARS 本身', () => {
  assert.equal(KX_UP.maxV, 57);
  const base = CARS.hatch.phys, up = carPhys('hatch', true), off = carPhys('hatch', false);
  assert.equal(base.maxV, 54);
  assert.equal(up.maxV, 57);
  assert.equal(off.maxV, 54);
  assert.deepEqual({ ...up, maxV: 0 }, { ...base, maxV: 0 });
  assert.equal(CARS.hatch.phys.maxV, 54, '呼叫後原資料仍是 54');
  for (const k of ['coupe', 'gtr']) assert.deepEqual(carPhys(k, true), CARS[k].phys, k);
});

test('極速條：KX-2 升級開 3、關 2，其他三條不變；其他車不受影響；不改動 CARS 本身', () => {
  assert.equal(KX_UP.top, 3);
  const topOf = s => s.find(([n]) => n === STAT.top)[1];
  assert.equal(topOf(carStats('hatch', true)), 3);
  assert.equal(topOf(carStats('hatch', false)), 2);
  assert.deepEqual(carStats('hatch', true).map(s => s[1]), [2, 3, 5, 4]);
  assert.deepEqual(carStats('hatch', false).map(s => s[1]), [2, 2, 5, 4]);
  assert.deepEqual(CARS.hatch.stats.map(s => s[1]), [2, 2, 5, 4]);
  for (const k of ['coupe', 'gtr']) assert.deepEqual(carStats(k, true).map(s => s[1]), CARS[k].stats.map(s => s[1]), k);
});

test('KX-2 有 5 種顏色；第 5 色是白車身＋碳纖維引擎蓋且需解鎖，其他顏色都不是', () => {
  const cs = CARS.hatch.colors;
  assert.equal(cs.length, 5);
  assert.equal(cs[4].hood, 'carbon');
  assert.equal(cs[4].locked, true);
  assert.equal(cs[4].top, cs[3].top, '車身白色與送酒的白色 KX-2 相同');
  assert.equal(cs[4].low, cs[3].low);
  assert.ok(cs[4].n.zh.includes('碳纖維') && /carbon/i.test(cs[4].n.en));
  for (const [k, d] of Object.entries(CARS)) d.colors.forEach((c, i) => { if (!(k === 'hatch' && i === 4)) assert.ok(!c.locked && !c.hood, `${k}:${i}`); });
});

test('colorOpen：鎖定的顏色未解鎖不能選，解鎖後可選；其他顏色一律可選', () => {
  assert.equal(colorOpen('hatch', 4, false), false);
  assert.equal(colorOpen('hatch', 4, true), true);
  for (let i = 0; i < 4; i++) assert.equal(colorOpen('hatch', i, false), true);
  for (const k of ['coupe', 'gtr']) for (let i = 0; i < 4; i++) assert.equal(colorOpen(k, i, false), true, `${k}:${i}`);
  for (const [car, i] of [['hatch', 5], ['hatch', -1], ['coupe', 4], ['hatch', 1.5], ['hatch', '4'], ['nope', 0]]) assert.equal(colorOpen(car, i, true), false, `${car}:${i}`);
});

test('safeChoice：未解鎖時第 5 色回到第 0 色；解鎖後保留；壞值回第 0 色；不改動輸入', () => {
  assert.deepEqual(safeChoice({ car: 'hatch', color: 4 }, false), { car: 'hatch', color: 0 });
  assert.deepEqual(safeChoice({ car: 'hatch', color: 4 }, true), { car: 'hatch', color: 4 });
  assert.deepEqual(safeChoice({ car: 'hatch', color: 3 }, false), { car: 'hatch', color: 3 });
  assert.deepEqual(safeChoice({ car: 'coupe', color: 2 }, false), { car: 'coupe', color: 2 });
  for (const color of [9, -1, 1.5, '2', null, undefined]) assert.deepEqual(safeChoice({ car: 'gtr', color }, true), { car: 'gtr', color: 0 }, String(color));
  const c = { car: 'hatch', color: 4 }; safeChoice(c, false);
  assert.deepEqual(c, { car: 'hatch', color: 4 });
});

/* ---------- 載入順序：頂層 applyLang() / buildCars() 會讀這些變數，宣告在後面會 TDZ 當機（node 測試抓不到，所以靜態檢查） ---------- */
test('新的執行期狀態必須在第一次頂層 buildCars() / applyLang() 之前宣告', () => {
  const calls = ['\nbuildCars();\n', '\napplyLang();\n'].map(c => html.indexOf(c));
  assert.ok(calls.every(i => i > 0), '找不到頂層 buildCars(); / applyLang();');
  const first = Math.min(...calls);
  for (const name of ['sakeUnlocked', 'kxUpOn', 'carbonTex']) {
    const m = new RegExp(String.raw`\b(?:let|const)\b[^;\n]*\b${name}\s*=`).exec(html);
    assert.ok(m, `找不到 ${name} 的宣告`);
    assert.ok(m.index < first, `${name} 宣告在第一次 buildCars() / applyLang() 之後`);
  }
});

test('碳纖維貼圖是共用貼圖：disposeCar 的共用集合要包含它', () => {
  const m = /function disposeCar\(c\) \{[^\n]*\}/.exec(html);
  assert.ok(m);
  assert.ok(/new Set\(\[[^\]]*\bcarbonTex\b/.test(m[0]), 'disposeCar 的共用集合缺 carbonTex');
});

test('startRace 套用 carPhys（極速升級）而不是直接用 CARS 的 phys；升級只看已通關 && 開關', () => {
  assert.ok(/Object\.assign\(P, carPhys\(choice\.car, kxUpActive\(\)\)\)/.test(html));
  assert.ok(/const kxUpActive = \(\) => sakeUnlocked && kxUpOn;/.test(html));
});

test('時間挑戰的紀錄 key：所有讀寫處都帶 kxUpActive()，不會有一處漏掉', () => {
  const uses = html.match(/\btaKey\([^)]*\)/g) || [];
  const real = uses.filter(u => !u.includes('track, car'));
  assert.equal(real.length, 3, '預期 taBegin / 結算 / 標題最佳紀錄三處');
  for (const u of real) assert.ok(u.includes('kxUpActive()') && u.includes('choice.car'), u);
});

test('解鎖提示用 data-i18n，切換語言時會跟著換', () => {
  assert.ok(/<p id="resUnlock"[^>]*data-i18n="sakeUnlock"/.test(html));
});

test('碳纖維貼圖偏暗：色碼落在近黑到深灰（0x0e0f12 ... 0x2a2d33）', () => {
  const s = html.indexOf('const carbonTex = canvasTex'), b = html.slice(s, html.indexOf('carbonTex.wrapS', s));
  assert.ok(s > 0);
  const lum = h => { const n = parseInt(h.slice(1), 16); return ((n >> 16) + ((n >> 8) & 255) + (n & 255)) / 3; };
  const cols = b.match(/#[0-9a-f]{6}/g);
  assert.ok(cols.length >= 3);
  for (const c of cols) assert.ok(lum(c) <= lum('#2a2d33') + 1, c);
});
