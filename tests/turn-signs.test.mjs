// 彎道提示圖標：抽出 @course-geometry + @turn-signs（純函式），在三條真實賽道上跑彎道偵測與出現時機
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const M = new Function(`${block('course-geometry')}\n${block('turn-signs')}
return { buildCourse, DS, TS, tsKind, tsMerge, cornerList, nextSign, tsIcon, tsLabel };`)();
const { buildCourse, DS, TS, tsKind, tsMerge, cornerList, nextSign, tsIcon, tsLabel } = M;
const IDS = ['kurosagi', 'seiran', 'hakuro'];
const courses = Object.fromEntries(IDS.map(id => { const c = buildCourse(id); return [id, { c, list: cornerList(c.pts) }]; }));
const near = (list, s0, tol = 40) => list.filter(k => k.s0 <= s0 + tol && k.s1 >= s0 - tol);
const at = (list, s) => list.find(k => k.s0 <= s && s <= k.s1);

test('三條賽道都偵測得到彎，且依 s 遞增、不重疊', () => {
  for (const id of IDS) {
    const { list } = courses[id];
    assert.ok(list.length >= 8, `${id} 只有 ${list.length} 個彎`);
    for (let i = 0; i < list.length; i++) {
      assert.ok(list[i].s1 > list[i].s0, `${id} #${i}`);
      if (i) assert.ok(list[i].s0 > list[i - 1].s1, `${id} #${i} 與前一個重疊`);
    }
  }
});

test('分級規則：小／中／大／髮夾彎的邊界', () => {
  assert.equal(tsKind(30, 90), 'small');
  assert.equal(tsKind(44, 60), 'small');
  assert.equal(tsKind(46, 60), 'mid');
  assert.equal(tsKind(30, 44), 'mid');
  assert.equal(tsKind(91, 60), 'big');
  assert.equal(tsKind(60, 24), 'big');
  assert.equal(tsKind(140, 39), 'hairpin');
  assert.equal(tsKind(180, 25), 'hairpin');
  assert.equal(tsKind(160, 60), 'big', '又長又緩的大轉角不算髮夾彎');
  assert.equal(tsKind(139, 30), 'big');
  assert.equal(tsKind(10, 170), null, '又緩又小的彎不提示');
  assert.equal(tsKind(24, 101), null);
  assert.equal(tsKind(24, 99), 'small');
});

test('黑鷺山：6 個髮夾彎的方向照規劃（右左右左右左），90° 右彎為大彎，三連小彎不提示', () => {
  const { list } = courses.kurosagi;
  assert.deepEqual(list.filter(k => k.kind === 'hairpin').map(k => k.dir), ['R', 'L', 'R', 'L', 'R', 'L']);
  const k90 = at(list, 2050);
  assert.equal(k90.dir, 'R'); assert.equal(k90.kind, 'big');
  assert.equal(near(list, 150, 20).length, 0);
});

test('既有髮夾彎定義（原始曲率 |k|>0.01 同向連續 ≥150°）找到的每一個，都被判為髮夾彎', () => {
  let total = 0;
  for (const id of IDS) {
    const { c, list } = courses[id], p = c.pts;
    let run = 0, sign = 0, st = 0;
    for (let i = 1; i <= c.N; i++) {
      const k = i < c.N ? p[i].k : 0, sg = Math.abs(k) > 0.01 ? Math.sign(k) : 0;
      if (sg && sg === sign) run += Math.abs(k) * DS;
      else {
        if (run >= 150 * Math.PI / 180) {
          total++;
          const mid = (p[st].s + p[i - 1].s) / 2, k2 = at(list, mid);
          assert.ok(k2 && k2.kind === 'hairpin', `${id} s=${mid.toFixed(0)} 不是髮夾彎：${JSON.stringify(k2)}`);
        }
        run = sg ? Math.abs(k) * DS : 0; sign = sg; st = i;
      }
    }
  }
  assert.equal(total, 6 + 9, '黑鷺山 6 + 青嵐峠 9 + 白狼峠 0');
  assert.ok(courses.seiran.list.filter(k => k.kind === 'hairpin').length >= 9);
  assert.equal(courses.hakuro.list.filter(k => k.kind === 'hairpin').length, 0, '白狼峠沒有髮夾彎');
});

test('方向：每個彎的 L/R 與路徑幾何（中心線座標的叉積；右彎為正，以黑鷺山規劃的右彎校準）一致', () => {
  for (const id of IDS) {
    const { c, list } = courses[id], p = c.pts;
    for (const k of list) {
      const parts = k.parts || [k];
      for (const q of parts) {
        const a = p[q.i0], b = p[Math.round((q.i0 + q.i1) / 2)], d = p[q.i1];
        const cross = (b.x - a.x) * (d.z - b.z) - (b.z - a.z) * (d.x - b.x);
        assert.equal(cross > 0 ? 'R' : 'L', q.dir, `${id} s=${q.s0.toFixed(0)}`);
      }
    }
  }
});

test('S 彎合併：相反方向、間距 < 40 m、都不是髮夾彎才合；有髮夾彎各自照舊', () => {
  const mk = (s0, s1, dir, kind) => ({ s0, s1, i0: 0, i1: 0, dir, kind, angle: 40, minR: 50 });
  const m = tsMerge([mk(0, 40, 'L', 'mid'), mk(60, 100, 'R', 'small')]);
  assert.equal(m.length, 1);
  assert.equal(m[0].kind, 's'); assert.equal(m[0].dir, 'L'); assert.equal(m[0].s0, 0); assert.equal(m[0].s1, 100);
  assert.equal(tsMerge([mk(0, 40, 'R', 'mid'), mk(60, 100, 'L', 'small')])[0].dir, 'R');
  for (const [x, y] of [['mid', 'big'], ['big', 'mid'], ['big', 'big'], ['small', 'big']]) assert.deepEqual(tsMerge([mk(0, 40, 'L', x), mk(60, 100, 'R', y)]).map(k => k.kind), [x, y], `${x}+${y} 不合併`);
  assert.equal(tsMerge([mk(0, 40, 'L', 'mid'), mk(79, 100, 'R', 'small')]).length, 1, '間距 39 m 要合');
  assert.equal(tsMerge([mk(0, 40, 'L', 'mid'), mk(81, 100, 'R', 'small')]).length, 2, '間距 41 m 不合');
  assert.equal(tsMerge([mk(0, 40, 'L', 'mid'), mk(60, 100, 'L', 'small')]).length, 2, '同方向不合');
  assert.deepEqual(tsMerge([mk(0, 40, 'L', 'hairpin'), mk(60, 100, 'R', 'small')]).map(k => k.kind), ['hairpin', 'small']);
  assert.deepEqual(tsMerge([mk(0, 40, 'L', 'small'), mk(60, 100, 'R', 'hairpin')]).map(k => k.kind), ['small', 'hairpin']);
  // 連續交錯 4 個彎：兩兩成對，不重複使用同一個彎
  const four = tsMerge([mk(0, 10, 'L', 'small'), mk(20, 30, 'R', 'small'), mk(40, 50, 'L', 'small'), mk(60, 70, 'R', 'small')]);
  assert.deepEqual(four.map(k => [k.kind, k.dir, k.s0, k.s1]), [['s', 'L', 0, 30], ['s', 'L', 40, 70]]);
  const orig = [mk(0, 40, 'L', 'mid'), mk(60, 100, 'R', 'small')]; tsMerge(orig);
  assert.equal(orig.length, 2); assert.equal(orig[0].kind, 'mid', '不改動輸入');
});

test('真實賽道上：每個 S 彎都由兩個相反方向的彎合成，且只含小彎與中彎；白狼峠左右兩種 S 彎都有', () => {
  for (const id of IDS) for (const k of courses[id].list) if (k.kind === 's') {
    assert.equal(k.parts.length, 2);
    assert.notEqual(k.parts[0].dir, k.parts[1].dir);
    assert.equal(k.dir, k.parts[0].dir);
    assert.ok(k.parts.every(q => q.kind === 'small' || q.kind === 'mid'), '大彎與髮夾彎不併入 S 彎');
    assert.ok(k.parts[1].s0 - k.parts[0].s1 < TS.S_GAP);
  }
  assert.ok(courses.hakuro.list.some(k => k.kind === 's' && k.dir === 'L'));
  assert.ok(courses.hakuro.list.some(k => k.kind === 's' && k.dir === 'R'));
});

test('每個等級在三條賽道合計都有出現（小、中、大、髮夾、S）', () => {
  const kinds = new Set(IDS.flatMap(id => courses[id].list.map(k => k.kind)));
  for (const k of ['small', 'mid', 'big', 'hairpin', 's']) assert.ok(kinds.has(k), k);
});

test('nextSign：入口前 max(60 m, 3 秒車程) 出現，入口後 HOLD 公尺消失，同時只有一個', () => {
  const list = [{ s0: 500, s1: 560, kind: 'mid', dir: 'R' }, { s0: 700, s1: 760, kind: 'big', dir: 'L' }];
  assert.equal(nextSign(list, 0, 20), null);
  assert.equal(nextSign(list, 439, 10), null, '慢速只提前 60 m');
  assert.equal(nextSign(list, 441, 10).i, 0);
  assert.equal(nextSign(list, 339, 50), null, '50 m/s → 提前 150 m');
  assert.equal(nextSign(list, 351, 50).i, 0);
  assert.equal(nextSign(list, 500, 20).i, 0, '進入彎道當下還在');
  assert.equal(nextSign(list, 500 + TS.HOLD - 1, 20).i, 0);
  assert.equal(nextSign(list, 500 + TS.HOLD + 1, 20), null, '進彎後消失');
  assert.equal(nextSign(list, 560, 20), null);
  assert.equal(nextSign(list, 650, 20).i, 1, '下一個彎接著出現');
  assert.equal(nextSign(list, 760, 20), null);
  assert.equal(nextSign([], 10, 10), null);
  assert.equal(nextSign(list, 450, NaN).i, 0, '壞車速退回最少 60 m');
  assert.equal(nextSign(list, 450, -5).i, 0);
});

test('nextSign：兩個彎很近時，前一個消失後才換下一個（不同時顯示）', () => {
  const list = [{ s0: 500, s1: 520, kind: 'hairpin', dir: 'R' }, { s0: 530, s1: 550, kind: 'hairpin', dir: 'L' }];
  assert.equal(nextSign(list, 480, 10).i, 0);
  assert.equal(nextSign(list, 510, 10).i, 0);
  assert.equal(nextSign(list, 500 + TS.HOLD + 1, 10).i, 1);
});

test('真實賽道：沿路每 1.5 m 走一遍，圖標只在入口前後的視窗內出現，且每個彎都至少出現一次', () => {
  for (const id of IDS) {
    const { c, list } = courses[id];
    const seen = new Set();
    for (let s = 0; s < c.TOTAL; s += DS) {
      const sg = nextSign(list, s, 25);
      if (sg) { seen.add(sg.i); assert.ok(list[sg.i].s0 - s <= 75 + 1e-6 && s <= list[sg.i].s0 + TS.HOLD, `${id} s=${s}`); }
    }
    for (let i = 0; i < list.length; i++) assert.ok(seen.has(i), `${id} 第 ${i} 個彎（s=${list[i].s0.toFixed(0)}）從來沒出現`);
  }
});

test('圖標：每個等級與方向都有 svg、顏色與 aria 文字；左右互為鏡像；無文字節點', () => {
  const COLORS = { small: '#3ddc84', mid: '#ffd23f', big: '#ff4d4d', hairpin: '#ff4d4d', s: '#4da3ff' };
  const seen = new Set();
  for (const kind of Object.keys(COLORS)) for (const dir of ['L', 'R']) {
    const ic = tsIcon(kind, dir);
    assert.ok(ic.startsWith('<svg') && ic.endsWith('</svg>'), `${kind}${dir}`);
    assert.ok(ic.includes(COLORS[kind]), `${kind}${dir} 顏色`);
    assert.ok(!/<text|<tspan/.test(ic), '不放文字');
    assert.equal(/scale\(-1/.test(ic), dir === 'L', `${kind}${dir} 鏡像`);
    seen.add(ic);
    for (const lang of ['zh', 'en']) assert.ok(tsLabel(lang, kind, dir).length > 1, `${kind}${dir}${lang}`);
  }
  assert.equal(seen.size, 10, '10 種圖標互不相同');
  assert.notEqual(tsLabel('zh', 's', 'L'), tsLabel('zh', 's', 'R'));
  assert.notEqual(tsLabel('en', 'hairpin', 'L'), tsLabel('en', 'hairpin', 'R'));
  assert.equal(tsLabel('zh', 'xx', 'L'), '');
});

/* ---------- HUD 與設定（靜態檢查）---------- */
// 設定 key、選擇器與宣告順序改由 turn-sign-styles.test.mjs 檢查（開關已改成顯示方式選擇器）

test('送酒模式與觀戰不顯示；關閉時不顯示；只在 race 狀態；重置與換賽道會清掉', () => {
  const m = /function turnSignFrame\(\) \{[\s\S]*?\n\}/.exec(html);
  assert.ok(m, '找不到 turnSignFrame');
  assert.ok(/tsStyle !== 'off' && state === 'race' && !sakeRun/.test(m[0]));
  assert.ok(/if \(spec\) \{[^}]*tsHide\(\)/.test(html), '觀戰分支要隱藏');
  assert.ok(/function resetRace\(\) \{[\s\S]{0,1200}?tsHide\(\)/.test(html), 'resetRace 要清掉');
  assert.ok(/tsList = null/.test(html), '換賽道要清掉快取');
});

test('tsHide 以 DOM 為準：tsCur 已被清掉、圖標還顯示時，仍然要把圖標藏起來（線上離開後殘留圖標的 bug）', () => {
  const src = /function tsHide\(\) \{[^\n]*\}/.exec(html);
  assert.ok(src, '找不到 tsHide');
  const mkEl = cls => { const s = new Set(cls); return { s, attrs: { 'aria-hidden': null }, classList: { contains: c => s.has(c), remove: (...c) => c.forEach(x => s.delete(x)) }, setAttribute(k, v) { this.attrs[k] = v; } }; };
  const run = (el, cur) => new Function('$', `let tsCur = ${JSON.stringify(cur)}, tsKey = 'x';\n${src[0]}\ntsHide(); return tsCur;`)(() => el);
  const el = mkEl(['tsign', 'l', 'show', 'flash']);
  assert.equal(run(el, ''), '', 'tsCur 先被清掉（buildTrack 的舊行為）');
  assert.equal(el.s.has('show'), false); assert.equal(el.s.has('flash'), false);
  assert.equal(el.attrs['aria-hidden'], 'true');
  const el2 = mkEl(['tsign', 'r', 'show']);
  assert.equal(run(el2, '3'), ''); assert.equal(el2.s.has('show'), false);
  const el3 = mkEl(['tsign']); run(el3, ''); assert.equal(el3.attrs['aria-hidden'], null, '本來就藏著就不重複寫 DOM');
  // 沒有任何地方只清 tsCur 而不藏圖標
  const clears = html.match(/tsCur = ''/g) || [];
  assert.equal(clears.length, 2, "只有宣告與 tsHide 可以寫 tsCur = ''");
  assert.ok(/WALL_LAT = roadHW \+ 0\.3; tsList = null; tsHide\(\);/.test(html), 'buildTrack 要走 tsHide');
});

test('嗶聲走音效匯流排（master），髮夾彎兩聲', () => {
  const m = /function sfxTurnSign\(double\) \{[^\n]*\}/.exec(html);
  assert.ok(m, '找不到 sfxTurnSign');
  assert.ok(m[0].includes('master') && m[0].includes('tone('));
});

test('script 可以被解析；沒有 CR、沒有 __lc、沒有隱形字元', () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  new Function(scripts[scripts.length - 1][1]);
  assert.equal(html.includes('\r'), false);
  assert.equal(html.includes('__lc'), false);
  const bad = [0x2028, 0x2029, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2060, 0xfeff];
  for (const cp of bad) assert.equal(html.includes(String.fromCharCode(cp)), false, cp.toString(16));
});
