// 上坡玩法：抽出 yatouge.html 的純函式區塊（@course-geometry / @gutter / @turn-signs / @timeattack / @rival-hill），
// 驗證反向賽道的不變量、水溝對應、紀錄 key、AI 上坡項，以及主畫面切換與載入順序。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
function fn(name) {
  const s = html.indexOf(`function ${name}(`);
  assert.ok(s >= 0, `找不到 function ${name}`);
  const e = html.indexOf('\n}\n', s);
  return html.slice(s, e + 3);
}
const M = new Function(`const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
${block('course-geometry')}\n${block('gutter')}\n${block('turn-signs')}\n${block('timeattack')}\n${block('rival-hill')}
${block('finish-hit')}
return { rivalAdvance,  TRACKS, DS, HW, wrap, buildCourse, bestKey, taKey, gutterSections, GUTTER_ZONES, cornerList, upId, isUp, baseId, trackFrom, DIRS, dirFrom, courseId, gateLabel, aiHillTop, aiHillAcc, AI_HILL_GAIN };`)();
const { TRACKS, trackFrom, wrap, buildCourse, bestKey, taKey, gutterSections, cornerList, upId, isUp, baseId, dirFrom, courseId, gateLabel, aiHillTop, aiHillAcc, AI_HILL_GAIN, rivalAdvance } = M;
const IDS = ['kurosagi', 'seiran', 'hakuro'];
const sha = o => createHash('sha1').update(JSON.stringify(o)).digest('hex');

/* ---------- 反向賽道：同一條路，反方向走 ---------- */
test('id 工具：upId / isUp / baseId 互為反運算', () => {
  for (const id of IDS) {
    assert.equal(upId(id), id + '_up');
    assert.equal(isUp(id), false);
    assert.equal(isUp(upId(id)), true);
    assert.equal(baseId(upId(id)), id);
    assert.equal(baseId(id), id);
  }
});

test('下坡賽道逐位元不變（青嵐峠、白狼峠；黑鷺山見 track.test.mjs）', () => {
  assert.equal(sha(buildCourse('seiran').pts), 'f19e153b389163def2bb26b8ff58b7e533343e01');
  assert.equal(sha(buildCourse('hakuro').pts), '2d7b11c6f12a4d1d87dddfadf078360647cec96c');
});

test('buildCourse 不接受不存在的賽道，也不會把 _up 當成另一條不同的賽道', () => {
  assert.throws(() => buildCourse('nope_up'));
  for (const id of IDS) assert.equal(buildCourse(upId(id)).hw, buildCourse(id).hw, `${id} 路寬`);
});

for (const id of IDS) {
  const fw = buildCourse(id), up = buildCourse(upId(id)), N = fw.N;

  test(`${id}_up：點數、總長、髮夾彎數與下坡相同`, () => {
    assert.equal(up.N, N);
    assert.equal(up.pts.length, N);
    assert.equal(up.TOTAL, fw.TOTAL, '總長');
    assert.equal(up.hairpins, fw.hairpins, '髮夾彎數');
    assert.equal(up.FINISH_I, N - 20);
    assert.equal(up.FINISH_S, up.pts[up.FINISH_I].s);
  });

  test(`${id}_up：每個點的位置與高度，正好是下坡對應點（不依新的 s 重算）`, () => {
    for (let j = 0; j < N; j++) {
      const o = fw.pts[N - 1 - j], p = up.pts[j];
      assert.equal(p.y, o.y, `y @${j}`);
      assert.equal(p.x, o.x, `x @${j}`);
      assert.equal(p.z, o.z, `z @${j}`);
      assert.ok(Math.abs(p.s - (fw.TOTAL - o.s)) < 1e-9, `s @${j}`);
      assert.ok(Math.abs(wrap(p.h - o.h - Math.PI)) < 1e-9, `h @${j} 應為對應點轉 180°`);
    }
    assert.equal(up.pts[0].s, 0);
  });

  test(`${id}_up：s 嚴格遞增；每一段的前進方向與該點朝向一致`, () => {
    for (let j = 1; j < N; j++) {
      const a = up.pts[j - 1], b = up.pts[j];
      assert.ok(b.s > a.s, `s @${j}`);
      const dir = Math.atan2(b.x - a.x, b.z - a.z);
      assert.ok(Math.abs(wrap(dir - b.h)) < 0.2, `朝向 @${j}: ${dir} vs ${b.h}`);
    }
  });

  test(`${id}_up：起點在山腳（比終點低很多），坡度沿行進方向幾乎全是正的`, () => {
    assert.ok(up.pts[14].y < up.pts[up.FINISH_I].y - 50, `起點 ${up.pts[14].y} 終點 ${up.pts[up.FINISH_I].y}`);
    let pos = 0;
    for (let j = 1; j < N; j++) if (up.pts[j].y > up.pts[j - 1].y) pos++;
    assert.ok(pos / (N - 1) > 0.95, `上坡段比例 ${pos / (N - 1)}`);
    let neg = 0;
    for (let j = 1; j < N; j++) if (fw.pts[j].y < fw.pts[j - 1].y) neg++;
    assert.ok(neg / (N - 1) > 0.95, '下坡版的對照：幾乎全是下坡');
  });

  test(`${id}_up：每點曲率 k 正負號相反（轉彎方向反過來），平滑後 ks 也是`, () => {
    for (let j = 1; j < N; j++) assert.equal(up.pts[j].k, -fw.pts[N - j].k, `k @${j}`);
    assert.equal(up.pts[0].k, 0);
    let strong = 0, flipped = 0;
    for (let i = 0; i < N; i++) {
      if (Math.abs(fw.pts[i].ks) < 0.02) continue;
      strong++;
      if (Math.sign(up.pts[N - 1 - i].ks) === -Math.sign(fw.pts[i].ks)) flipped++;
    }
    assert.ok(strong > 0);
    assert.ok(flipped / strong > 0.97, `ks 反號比例 ${flipped / strong}`);
  });

  test(`${id}_up：以反向的 k 獨立數髮夾彎，與下坡相同`, () => {
    const count = pts => {
      let n = 0, run = 0, sign = 0;
      for (let i = 1; i <= pts.length; i++) {
        const k = i < pts.length ? pts[i].k : 0, sg = Math.abs(k) > 0.01 ? Math.sign(k) : 0;
        if (sg && sg === sign) run += Math.abs(k) * M.DS;
        else { if (run >= 150 * Math.PI / 180) n++; run = sg ? Math.abs(k) * M.DS : 0; sign = sg; }
      }
      return n;
    };
    if (id !== 'kurosagi') assert.equal(count(up.pts), count(fw.pts)); // 黑鷺山的 k 以實際步長計，髮夾彎數由計畫表決定
    assert.equal(up.hairpins, fw.hairpins);
  });

  test(`${id}_up：彎道提示的每個彎都對得上，方向相反、種類相同（S 彎的合併可能不同，所以比合併前的彎）`, () => {
    const flat = l => l.flatMap(k => k.parts || [k]);
    const a = flat(cornerList(fw.pts)), b = flat(cornerList(up.pts)), full = cornerList(up.pts);
    assert.equal(b.length, a.length, '合併前的彎數');
    for (const k of a) {
      const mid = (k.s0 + k.s1) / 2, m = b.find(q => Math.abs((q.s0 + q.s1) / 2 - (fw.TOTAL - mid)) < 15);
      assert.ok(m, `s=${mid} 找不到對應的彎`);
      assert.equal(m.dir, k.dir === 'L' ? 'R' : 'L', `s=${mid} 方向`);
      assert.equal(m.kind, k.kind, `s=${mid} 種類`);
    }
    for (let i = 1; i < full.length; i++) assert.ok(full[i].s0 > full[i - 1].s1, '依 s 遞增、不重疊');
  });
}

/* ---------- 水溝（只有青嵐峠）：s 範圍跟著反向 ---------- */
test('水溝：青嵐峠上坡版的區段與下坡版是同幾個彎（s 反向、內側換邊）；其他賽道沒有', () => {
  const fw = buildCourse('seiran'), up = buildCourse('seiran_up');
  const a = gutterSections('seiran', fw.pts), b = gutterSections('seiran_up', up.pts);
  assert.deepEqual(a, [{ s0: 3562, s1: 3617, side: 1 }, { s0: 3611.5, s1: 3680, side: -1 }, { s0: 3776.5, s1: 3842, side: 1 }, { s0: 3836.5, s1: 3906.5, side: -1 }], '下坡版不變');
  assert.equal(b.length, a.length, '區段數');
  const rev = [...a].reverse().map(q => ({ s0: fw.TOTAL - q.s1, s1: fw.TOTAL - q.s0, side: -q.side }));
  b.forEach((q, i) => {
    assert.ok(Math.abs(q.s0 - rev[i].s0) < 4 && Math.abs(q.s1 - rev[i].s1) < 4, `區段 ${i}: ${q.s0}-${q.s1} vs ${rev[i].s0}-${rev[i].s1}`);
    assert.equal(q.side, rev[i].side, `區段 ${i} 內側`);
  });
  for (const id of ['kurosagi', 'hakuro']) assert.deepEqual(gutterSections(upId(id), buildCourse(upId(id)).pts), [], id);
});

/* ---------- 紀錄 key ---------- */
test('紀錄 key：下坡逐字不變，上坡各自獨立，所有組合互不相同', () => {
  assert.equal(bestKey('kurosagi'), 'yatouge-best');
  assert.equal(bestKey('seiran'), 'yatouge-best-seiran');
  assert.equal(bestKey('seiran_up'), 'yatouge-best-seiran_up');
  assert.equal(taKey('seiran', 'hatch'), 'yatouge-ta-best-seiran-hatch');
  assert.equal(taKey('seiran', 'hatch', true), 'yatouge-ta-best-seiran-hatch-up');
  assert.equal(taKey('seiran_up', 'hatch'), 'yatouge-ta-best-seiran_up-hatch');
  assert.equal(taKey('seiran_up', 'hatch', true), 'yatouge-ta-best-seiran_up-hatch-up');
  const keys = [];
  for (const t of IDS) for (const d of [t, upId(t)]) {
    keys.push(bestKey(d));
    for (const c of ['hatch', 'coupe', 'gtr']) for (const u of [false, true]) keys.push(taKey(d, c, u));
  }
  const uniq = new Set(keys);
  // 比賽 3×2 個；計時賽 3×2×(hatch 2 種 + 其他車各 1 種，up 對其他車無效) = 3×2×4
  assert.equal(uniq.size, 3 * 2 + 3 * 2 * 4, '有 key 撞在一起');
  for (const k of keys) assert.ok(k.startsWith('yatouge-'));
});

/* ---------- 主畫面方向切換 ---------- */
test('dirFrom / courseId：預設下坡，壞資料與舊資料都是下坡，只有 "up" 是上坡', () => {
  assert.deepEqual(M.DIRS, ['down', 'up']);
  for (const v of [null, undefined, '', 'down', 'UP', 'Up', 'seiran_up', '1', 42, {}]) assert.equal(dirFrom(v), 'down', String(v));
  assert.equal(dirFrom('up'), 'up');
  assert.equal(courseId('seiran', 'down'), 'seiran');
  assert.equal(courseId('seiran', 'up'), 'seiran_up');
  assert.equal(courseId('seiran', 'junk'), 'seiran');
  assert.equal(courseId('seiran_up', 'up'), 'seiran_up', '不會變成 seiran_up_up');
  assert.equal(courseId('seiran_up', 'down'), 'seiran', '存檔裡誤存了上坡 id 時，方向以切換為準');
});

test('trackFrom：存檔裡的賽道壞掉、被誤存成上坡 id 或指到原型屬性時，一律回到有效的賽道 id', () => {
  for (const id of IDS) { assert.equal(trackFrom(id), id); assert.equal(trackFrom(upId(id)), id); }
  for (const v of [null, undefined, '', 'nope', 'toString', 'constructor', 'nope_up', 42, {}, []]) assert.equal(trackFrom(v), 'kurosagi', String(v));
});

test('起點門文字：上坡版是「上坡起點」，下坡版逐字不變', () => {
  for (const id of IDS) {
    assert.equal(gateLabel(id), TRACKS[id].gate);
    assert.ok(gateLabel(upId(id)).includes('上坡起點') && !gateLabel(upId(id)).includes('下坡'), gateLabel(upId(id)));
    assert.ok(gateLabel(upId(id)).startsWith(TRACKS[id].name.zh));
  }
});

test('下坡／上坡改在按「開始」後的方向視窗（#dirq）選，文字有中英文，方向存在 yatouge-dir（主畫面不再有 #dirPick）', () => {
  assert.ok(!html.includes('id="dirPick"') && !/function renderDirPicker\(/.test(html), '主畫面的方向切換已移除');
  assert.match(html, /<div id="dirq"[^>]*role="dialog"/);
  for (const k of ['dirDown', 'dirUp', 'dirDownD', 'dirUpD']) assert.equal((html.match(new RegExp(`\\b${k}:`, 'g')) || []).length, 2, `${k} 中英文各一`);
  assert.match(html, /dirDown: '下坡'/); assert.match(html, /dirUp: '上坡'/);
  assert.match(html, /dirDown: 'Downhill'/); assert.match(html, /dirUp: 'Uphill'/);
  assert.ok(html.includes("store.get('yatouge-dir')") && html.includes("store.set('yatouge-dir'"));
  const setDir = fn('setDir');
  assert.ok(/mode === 'sake'/.test(setDir), '送酒模式不能切換方向');
  assert.ok(!html.includes("store.set('yatouge-track', courseId"), 'yatouge-track 只存賽道，不存方向');
  assert.ok(/startAsksDir\(mode, again\)/.test(fn('askStart')), '送酒模式不問方向（startAsksDir）');
});

test('線上對戰：進房間前先換成平常的（下坡）id，抽籤後才依方向換課程；離開再回到原本的方向', () => {
  const sm = fn('startMatch');
  assert.ok(/baseId\(trackId\)/.test(sm), 'startMatch 要用 baseId(trackId)');
  assert.ok(/prevTrack: trackId/.test(sm), '離開時要回到原本的（可能是上坡）賽道');
  assert.ok(!/NET\.TRACKS\.push|TRACKS\[[^\]]*_up/.test(html), 'NET.TRACKS 不加上坡');
  assert.deepEqual(readNetTracks(), ['kurosagi', 'seiran', 'hakuro']);
});
function readNetTracks() {
  const m = /TRACKS: (\[[^\]]*\]), CARS/.exec(html);
  return JSON.parse(m[1].replace(/'/g, '"'));
}

test('送酒模式永遠是下坡青嵐峠；方向不影響它', () => {
  assert.ok(/SAKE_TRACK = 'seiran'/.test(html));
  assert.ok(/store\.get\('yatouge-mode'\) === 'sake' \? SAKE_TRACK : courseId\(/.test(html), '啟動時送酒模式不套方向');
  assert.ok(fn('sakeForce').includes("tr = on ? SAKE_TRACK : courseId(trackFrom(store.get('yatouge-track')), trackDir)"), '離開送酒模式時套回方向');
});

test('文字：中文用「上坡」「山頂」，不出現不道地用語；上坡的標題與引言不再寫「下坡」「山腳」', () => {
  assert.ok(/course: \(name, km, n, up\) => `\$\{name\} · \$\{up \? '上坡' : '下坡'\}/.test(html));
  assert.ok(/course: \(name, km, n, up\) => `\$\{name\} · \$\{up \? 'Uphill' : 'Downhill'\}/.test(html));
  assert.ok(/lead: \(name, up\) => /.test(html));
});

/* ---------- 載入順序（node 測試抓不到 TDZ，靜態檢查） ---------- */
test('載入順序：方向狀態必須在第一次頂層 buildTrack() / resetRace() / buildCars() / applyLang() 之前宣告', () => {
  const calls = ['\nbuildTrack(trackId);\n', '\nresetRace();\n', '\nbuildCars();\n', '\napplyLang();\n'].map(c => html.indexOf(c));
  assert.ok(calls.every(i => i > 0), '找不到頂層呼叫');
  const first = Math.min(...calls);
  for (const name of ['trackDir', 'trackId']) {
    const m = new RegExp(String.raw`\blet\b[^;\n]*\b${name}\s*=`).exec(html);
    assert.ok(m, `找不到 ${name} 的 let 宣告`);
    assert.ok(m.index < first, `${name} 宣告在第一次頂層呼叫之後`);
  }
  assert.ok(html.indexOf('let trackDir') < html.indexOf('let trackId'), 'trackDir 要先於 trackId（trackId 的初值讀它）');
  const cs = html.indexOf('const COURSES = {};'), loop = html.indexOf('for (const id in TRACKS) {', cs);
  assert.ok(cs > 0 && loop > cs, '找不到 COURSES 建立迴圈');
  const loopSrc = html.slice(loop, html.indexOf('\n', loop));
  assert.ok(/upId\(id\)/.test(loopSrc), 'COURSES 要同時建好上坡版');
});

/* ---------- AI 對手 ---------- */
const AI = { hatch: { top: 44, acc: 6, lat: 11.5, hill: 33 }, coupe: { top: 50, acc: 8.5, lat: 9.5, hill: 27 }, gtr: { top: 52, acc: 9, lat: 8.5, hill: 23 } };
test('AI 數值：下坡的最高速與加速度與舊版同一個值，上坡才套坡度', () => {
  for (const [k, ai] of Object.entries(AI)) for (const g of [-0.09, -0.062, 0, 0.03, 0.098]) {
    assert.equal(aiHillTop(ai, false, g), ai.top, `${k} 下坡 top`);
    assert.equal(aiHillAcc(ai, false, g), ai.acc, `${k} 下坡 acc`);
  }
  for (const [k, ai] of Object.entries(AI)) {
    assert.ok(aiHillAcc(ai, true, 0.062) < ai.acc, `${k} 上坡加速變小`);
    assert.ok(Math.abs(aiHillAcc(ai, true, 0.062) - (ai.acc - 9.8 * 0.7 * 0.062 * AI_HILL_GAIN)) < 1e-12, `${k} 上坡項 = −9.8×坡度×0.7×增益`);
    assert.ok(aiHillTop(ai, true, 0.062) < ai.top, `${k} 上坡最高速變低`);
    assert.ok(aiHillTop(ai, true, 0.098) < aiHillTop(ai, true, 0.026), `${k} 越陡越慢`);
  }
});

test('遊戲裡的 CARS.*.ai 都有 hill，且與測試用的表一致', () => {
  for (const [k, ai] of Object.entries(AI)) {
    const m = new RegExp(`${k}: \\{[\\s\\S]*?ai: \\{ top: ${ai.top}, acc: ${ai.acc}, lat: ${ai.lat}, hill: ${ai.hill} \\}`).exec(html);
    assert.ok(m, `${k} 的 ai 要含 hill: ${ai.hill}`);
  }
});

// 舊版 rivalUpdate 的完整拷貝（改動前的行為基準）
function legacyRival(dt, env) {
  const { rival: r, car, CARS, rivalFor, trackId, choice, samplePos, pts, N, roadHW, clamp, FINISH_S, raceT } = env;
  const here = samplePos(r.s, r.lat); r.i = here.i;
  const ai = CARS[rivalFor(trackId, choice.car).car].ai;
  let target = ai.top;
  for (let j = r.i; j < Math.min(N - 1, r.i + 64); j += 3) {
    const k = Math.abs(pts[j].ks);
    if (k > 1e-4) { const va = Math.sqrt(ai.lat / k), dist = Math.max(0, pts[j].s - r.s), allow = Math.sqrt(va * va + 2 * 14 * dist); if (allow < target) target = allow; }
  }
  const gap = r.s - car.loc.s;
  if (gap > 140) target *= 0.85; else if (gap > 70) target *= 0.94; else if (gap < -30) target *= 1.08;
  if (env.rivalFinishT !== null) target = 0;
  if (r.v < target) r.v = Math.min(target, r.v + ai.acc * dt); else r.v = Math.max(target, r.v - 16 * dt);
  r.s = Math.min(pts[N - 3].s, r.s + r.v * dt);
  const latT = Math.abs(here.k) > 0.008 ? -Math.sign(here.k) * 2.4 : 0;
  r.lat += clamp(latT - r.lat, -1.3 * dt, 1.3 * dt) + r.latV * dt;
  r.latV *= Math.exp(-4 * dt);
  if (Math.abs(r.lat) > roadHW - 1) { r.lat = Math.sign(r.lat) * (roadHW - 1); r.latV = 0; }
  const visT = Math.abs(here.k) > 0.015 ? clamp(here.k * r.v * 0.6, -0.55, 0.55) : 0;
  r.vis += (visT - r.vis) * Math.min(1, 3 * dt);
  if (env.rivalFinishT === null && r.s >= FINISH_S) env.rivalFinishT = raceT;
}
// 在指定賽道上讓真正的 rivalUpdate（從 yatouge.html 抽出）自己跑完；玩家停在起點（gap 越來越大）
function simRival(id, carKey, useLegacy) {
  const c = buildCourse(id), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const CARS = Object.fromEntries(Object.entries(AI).map(([k, ai]) => [k, { ai }]));
  const lerpAngle = (a, b, t) => a + wrap(b - a) * t;
  const rival = { s: c.pts[24].s, v: 0, lat: -2.2, latV: 0, i: 0, vis: 0 }, car = { loc: { s: 0 } };
  const rivalFor = () => ({ car: carKey, color: 0 }), choice = { car: 'hatch' };
  const mk = new Function('rival', 'car', 'CARS', 'rivalFor', 'trackId', 'choice', 'pts', 'N', 'roadHW', 'clamp', 'lerpAngle', 'FINISH_S', 'isUp', 'baseId', 'aiHillTop', 'aiHillAcc', 'rivalAdvance',
    `let rivalFinishT = null, rivalCrossN = null, stepN = 0, raceT = 0; // 第 5 批：rivalUpdate 只記過線的步數，時間戳由主迴圈蓋；這裡照舊用跨越當幀的 raceT 當基準
${fn('samplePos')}
${fn('rivalUpdate')}
return { samplePos, rivalUpdate, setT(t) { if (rivalCrossN !== null && rivalFinishT === null) rivalFinishT = raceT; raceT = t; stepN++; }, get fin() { return rivalFinishT; } };`);
  const g = mk(rival, car, CARS, rivalFor, id, choice, c.pts, c.N, c.hw, clamp, lerpAngle, c.FINISH_S, isUp, baseId, aiHillTop, aiHillAcc, rivalAdvance);
  const env = { rival, car, CARS, rivalFor, trackId: id, choice, samplePos: g.samplePos, pts: c.pts, N: c.N, roadHW: c.hw, clamp, FINISH_S: c.FINISH_S, raceT: 0, rivalFinishT: null };
  const dt = 1 / 60, trace = [];
  let t = 0;
  while ((useLegacy ? env.rivalFinishT : g.fin) === null && t < 600) {
    if (useLegacy) legacyRival(dt, env); else g.rivalUpdate(dt);
    t += dt; g.setT(t); env.raceT = t;
    if (Math.round(t * 60) % 30 === 0) trace.push([rival.s, rival.v, rival.lat, rival.vis]);
  }
  return { t: useLegacy ? env.rivalFinishT : g.fin, trace };
}

test('AI 下坡：真正的 rivalUpdate 與舊版逐位元相同（三條賽道、三台車）', () => {
  for (const id of IDS) for (const k of ['hatch', 'coupe', 'gtr']) {
    const a = simRival(id, k, false), b = simRival(id, k, true);
    assert.ok(a.t > 60, `${id}/${k} 有跑完 ${a.t}`);
    assert.equal(a.t, b.t, `${id}/${k} 完賽時間`);
    assert.deepEqual(a.trace, b.trace, `${id}/${k} 軌跡`);
  }
});

test('AI 上坡：每台車、每條賽道都比下坡慢，而且仍然跑得完（不卡住）', () => {
  for (const id of IDS) for (const k of ['hatch', 'coupe', 'gtr']) {
    const d = simRival(id, k, false).t, u = simRival(upId(id), k, false).t;
    assert.ok(u > d, `${id}/${k} 上坡 ${u.toFixed(1)} 應慢於下坡 ${d.toFixed(1)}`);
    assert.ok(u < d * 1.25, `${id}/${k} 上坡 ${u.toFixed(1)} 不應慢過下坡的 1.25 倍 (${d.toFixed(1)})`);
  }
});

test('更新內容：2026-11-14 那一版有上坡玩法的玩家向說明（中英文各一條）', () => {
  const open = '/* @changelog:start */', s = html.indexOf(open), e = html.indexOf('/* @changelog:end */');
  const { CHANGELOG } = new Function(`${html.slice(s + open.length, e)}\nreturn { CHANGELOG };`)();
  const v = CHANGELOG.find(x => x.date === '2026-11-14');
  assert.ok(v.zh.some(l => l.includes('上坡') && l.includes('下坡')), '中文缺上坡說明');
  assert.ok(v.en.some(l => /uphill/i.test(l)), '英文缺上坡說明');
  assert.ok(!v.zh.some(l => l.includes('圖標') || l.includes('倒後鏡')), '不道地用語');
});

test('結果畫面與換語言用同一個 relabelI18n：上坡時「山頂終點」等方向相關文字不會被下坡文字蓋掉（中英文）', () => {
  const i0 = html.indexOf('const I18N = {'), i1 = html.indexOf('\nlet lang = ');
  assert.ok(i0 > 0 && i1 > i0);
  const src = html.slice(i0, i1) + '\n' + html.slice(html.indexOf('const T = (k, ...a)'), html.indexOf('\n', html.indexOf('const Lz = '))) + '\n' + fn('relabelI18n');
  const run = (lang, trackId) => {
    const els = ['resEyebrow', 'start', 'lead', 'win'].map(k => ({ dataset: { i18n: k }, textContent: '' }));
    new Function('TRACKS', 'baseId', 'isUp', 'trackId', 'lang', 'els', `${src.replace('const T = ', 'var T = ').replace('const Lz = ', 'var Lz = ')}\nrelabelI18n({ querySelectorAll: () => els });`)
      (TRACKS, baseId, isUp, trackId, lang, els);
    return Object.fromEntries(els.map(e => [e.dataset.i18n, e.textContent]));
  };
  const zhUp = run('zh', 'seiran_up'), zhDown = run('zh', 'seiran'), enUp = run('en', 'seiran_up'), enDown = run('en', 'seiran');
  assert.equal(zhUp.resEyebrow, '山頂終點'); assert.equal(zhDown.resEyebrow, '山腳終點');
  assert.equal(enUp.resEyebrow, 'Finish at the summit'); assert.equal(enDown.resEyebrow, 'Finish at the foot of the mountain');
  assert.equal(zhUp.start, '開始'); assert.equal(zhDown.start, '開始'); // the direction is chosen after Start now, so the button no longer names it
  assert.equal(enUp.start, 'Start'); assert.equal(enDown.start, 'Start');
  assert.ok(zhUp.lead.includes('山頂') && zhUp.lead.includes('青嵐峠') && !zhUp.lead.includes('山腳'));
  assert.ok(enUp.lead.includes('top') && enUp.lead.includes('Seiran Pass'));
  assert.ok(zhDown.lead.includes('山腳'));
});

test('沒有任何地方再用不帶方向參數的 querySelectorAll(data-i18n) 重寫文字；showResult 與 applyLang 都走 relabelI18n', () => {
  assert.equal((html.match(/querySelectorAll\('\[data-i18n\]'\)/g) || []).length, 1, '只剩 relabelI18n 內一處');
  assert.ok(fn('showResult').includes("relabelI18n($('#result'))"));
  assert.ok(fn('applyLang').includes('relabelI18n(document)'));
});
