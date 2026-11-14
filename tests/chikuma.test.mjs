// 第四條賽道「千曲坂」：路線取自 OpenStreetMap 的真實山路（ODbL），裁剪、放大、最小幅度推開後以路點（waypointPts）建成。驗證長度、髮夾彎數、路面不重疊、上坡版、對手車、線上白名單與 AI 跑得完。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
function fn(name) {
  const s = html.indexOf(`function ${name}(`);
  assert.ok(s >= 0, `找不到 function ${name}`);
  return html.slice(s, html.indexOf('\n}\n', s) + 3);
}
const M = new Function(`const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
${block('course-geometry')}\n${block('gutter')}\n${block('turn-signs')}\n${block('timeattack')}\n${block('rival-hill')}\n${block('finish-hit')}
return { rivalAdvance, TRACKS, DS, HW, wrap, lerpAngle, buildCourse, bestKey, taKey, gutterSections, trackFrom, upId, isUp, baseId, courseId, gateLabel, aiHillTop, aiHillAcc, cornerList };`)();
const { TRACKS, DS, HW, wrap, lerpAngle, buildCourse, bestKey, taKey, gutterSections, trackFrom, upId, isUp, baseId, courseId, gateLabel, aiHillTop, aiHillAcc, rivalAdvance, cornerList } = M;

const down = () => buildCourse('chikuma'), up = () => buildCourse('chikuma_up');
// 與 waypointPts 相同的數法：同方向、|k| > 0.01 的連續彎累積轉角 >= 150 度算一個髮夾彎（由路點算，和 plan 的 180 度圓弧數互相印證）
function hairpinAts(pts) {
  const N = pts.length, at = []; let run = 0, sign = 0;
  for (let i = 1; i <= N; i++) {
    const k = i < N ? wrap(pts[i].h - pts[i - 1].h) / DS : 0, sg = Math.abs(k) > 0.01 ? Math.sign(k) : 0;
    if (sg && sg === sign) run += Math.abs(k) * DS;
    else { if (run >= 150 * Math.PI / 180) at.push(pts[i - 1].s); run = sg ? Math.abs(k) * DS : 0; sign = sg; }
  }
  return at;
}
const minClearance = pts => {
  let best = Infinity;
  for (let i = 0; i < pts.length; i += 2) for (let j = i + 1; j < pts.length; j += 2) {
    if (pts[j].s - pts[i].s <= 60) continue;
    const d = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z);
    if (d < best) best = d;
  }
  return best;
};

test('千曲坂：存在，名字與起點門牌正確，路寬較窄（hw 不低於 4.2 m 且小於預設）', () => {
  const t = TRACKS.chikuma;
  assert.ok(t, 'TRACKS.chikuma');
  assert.deepEqual(t.name, { zh: '千曲坂', en: 'Chikuma Slope' });
  assert.equal(t.gate, '千曲坂 下坡起點 · START');
  assert.ok(t.hw >= 4.2 && t.hw < HW, `hw ${t.hw}`);
  assert.equal(down().hw, t.hw);
  assert.equal(gateLabel('chikuma_up'), '千曲坂 上坡起點 · START');
});

test('千曲坂：全長 5.0–6.5 km，髮夾彎至少 24 個（建賽道的數法與逐點數法一致）', () => {
  const c = down();
  assert.ok(c.TOTAL >= 5000 && c.TOTAL <= 6500, `全長 ${c.TOTAL}`);
  assert.ok(c.hairpins >= 24, `hairpins ${c.hairpins}`);
  const n = hairpinAts(c.pts).length;
  assert.ok(n >= 24, `由路點數到 ${n}`);
  assert.equal(n, c.hairpins, '兩種數法一致');
});

test('千曲坂：不自我重疊——沿路相距 > 60 m 的點，水平距離 >= 2*hw + 4 m（下坡與上坡）', () => {
  for (const c of [down(), up()]) assert.ok(minClearance(c.pts) >= 2 * c.hw + 4, `最小間距 ${minClearance(c.pts).toFixed(1)}`);
});

test('千曲坂：點距不超過 DS（段長取整後略短）、s 嚴格遞增、h 差 < DS/hw（內側不摺疊）、最小彎道半徑 > 2*hw 且幾何半徑 >= 8 m', () => {
  const c = down(), { pts, hw } = c;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    assert.ok(d <= DS + 0.05 && d > DS * 0.9, `點距 @${i}: ${d}`);
    assert.ok(pts[i].s > pts[i - 1].s);
    assert.ok(Math.abs(wrap(pts[i].h - pts[i - 1].h)) < DS / hw, `h 差 @${i}`);
  }
  let mx = 0; for (const p of pts) mx = Math.max(mx, Math.abs(p.ks));
  assert.ok(1 / mx > 2 * hw, `最小半徑 ${1 / mx}`);
  let rmin = Infinity;
  for (let i = 4; i < pts.length - 4; i++) {
    const a = pts[i - 4], b = pts[i], q = pts[i + 4], ab = Math.hypot(b.x - a.x, b.z - a.z), bq = Math.hypot(q.x - b.x, q.z - b.z), aq = Math.hypot(q.x - a.x, q.z - a.z);
    const A2 = Math.abs((b.x - a.x) * (q.z - a.z) - (b.z - a.z) * (q.x - a.x));
    if (A2 > 1e-9) rmin = Math.min(rmin, ab * bq * aq / (2 * A2));
  }
  assert.ok(rmin >= 8, `幾何最小半徑 ${rmin}`);
});

test('千曲坂：髮夾彎密集——1.5 km 的路段內連續 9 個以上的髮夾彎（一層一層往下折返）', () => {
  const at = hairpinAts(down().pts);
  let best = 0;
  for (let a = 0; a < at.length; a++) { let b = a; while (b + 1 < at.length && at[b + 1] - at[a] <= 1500) b++; best = Math.max(best, b - a + 1); }
  assert.ok(best >= 9, `1.5 km 內最多 ${best} 個髮夾彎`);
});

test('千曲坂_up：長度、點數、髮夾彎與下坡相同；trackFrom／courseId／紀錄 key 照既有規則', () => {
  const d = down(), u = up();
  assert.equal(u.N, d.N); assert.equal(u.TOTAL, d.TOTAL); assert.equal(u.hairpins, d.hairpins);
  assert.equal(upId('chikuma'), 'chikuma_up'); assert.ok(isUp('chikuma_up')); assert.equal(baseId('chikuma_up'), 'chikuma');
  assert.equal(trackFrom('chikuma'), 'chikuma'); assert.equal(trackFrom('chikuma_up'), 'chikuma');
  assert.equal(courseId('chikuma', 'up'), 'chikuma_up'); assert.equal(courseId('chikuma', 'down'), 'chikuma');
  assert.equal(bestKey('chikuma'), 'yatouge-best-chikuma');
  assert.equal(taKey('chikuma', 'rally'), 'yatouge-ta-best-chikuma-rally');
  assert.equal(taKey('chikuma', 'hatch', true), 'yatouge-ta-best-chikuma-hatch-up');
});

test('千曲坂沒有水溝（不設 GUTTER_ZONES）', () => {
  for (const id of ['chikuma', 'chikuma_up']) assert.deepEqual(gutterSections(id, buildCourse(id).pts), []);
  assert.ok(!/GUTTER_ZONES = \{[^}]*chikuma/.test(html));
});

test('千曲坂的彎道提示：髮夾彎種類的提示數量和髮夾彎數相當', () => {
  const list = cornerList(down().pts), hp = list.filter(k => k.kind === 'hairpin').length;
  assert.ok(hp >= 20, `hairpin 提示 ${hp}`);
});

test('對手車：TRACK_RIVAL.chikuma 是 RV-4 (rally)，顏色索引存在；每條賽道都有固定對手', () => {
  const m = /const TRACK_RIVAL = (\{.*\});/.exec(html);
  assert.ok(m);
  const R = new Function(`return ${m[1]}`)();
  assert.equal(R.chikuma.car, 'rally');
  const i0 = html.indexOf('\n  rally: {', html.indexOf('const CARS = {')), colors = (html.slice(i0, html.indexOf('\n  }', i0)).match(/\{ n: \{ zh:/g) || []).length;
  assert.ok(Number.isInteger(R.chikuma.color) && R.chikuma.color >= 0 && R.chikuma.color < colors, `color ${R.chikuma.color}/${colors}`);
  for (const id of Object.keys(TRACKS)) assert.ok(R[id], `${id} 有固定對手`);
});

test('線上：NET.TRACKS 含 chikuma（不含 _up），RP.V 是 5，投票 chikuma 合法（下坡、上坡）', () => {
  const N = new Function(`${block('netcode')}\nreturn { NET, validatePeerState };`)();
  assert.deepEqual(N.NET.TRACKS, ['kurosagi', 'seiran', 'hakuro', 'chikuma']);
  const R = new Function(`const NET = { TRACKS: ['kurosagi', 'seiran', 'hakuro', 'chikuma'], CARS: ['hatch', 'coupe', 'gtr', 'rally'] };\n${block('roompick')}\nreturn { RP, validVote };`)();
  assert.equal(R.RP.V, 5);
  assert.deepEqual(R.validVote({ t: 'chikuma', d: 'up', m: 'cat', g: 80 }), { t: 'chikuma', d: 'up', m: 'cat', g: 80 });
  assert.ok(R.validVote({ t: 'chikuma', d: 'down', m: 'first', g: 50 }));
  const base = { v: 1, st: 'waiting', car: 'rally', col: 0 };
  assert.equal(N.validatePeerState({ ...base, trk: 'chikuma' }, null, 1).trk, 'chikuma');
  assert.equal(N.validatePeerState({ ...base, trk: 'chikuma_up' }, null, 1).trk, 'chikuma_up');
});

/* ---------- AI（用真正的 rivalUpdate，AI 數值不動） ---------- */
function simRival(id) {
  const c = buildCourse(id), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  assert.ok(html.includes('ai: { top: 47, acc: 8.5, lat: 9, hill: 29 }'), 'RV-4 的 AI 數值沒被改');
  const CARS = { rally: { ai: { top: 47, acc: 8.5, lat: 9, hill: 29 } } };
  const rival = { s: c.pts[24].s, v: 0, lat: -2.2, latV: 0, i: 0, vis: 0 }, car = { loc: { s: 0 } };
  const mk = new Function('rival', 'car', 'CARS', 'rivalFor', 'trackId', 'choice', 'pts', 'N', 'roadHW', 'clamp', 'lerpAngle', 'FINISH_S', 'isUp', 'baseId', 'aiHillTop', 'aiHillAcc', 'rivalAdvance',
    `let rivalFinishT = null, rivalCrossN = null, stepN = 0, raceT = 0;
${fn('samplePos')}
${fn('rivalUpdate')}
return { rivalUpdate, tick(t) { if (rivalCrossN !== null && rivalFinishT === null) rivalFinishT = raceT; raceT = t; stepN++; }, get fin() { return rivalFinishT; } };`);
  const g = mk(rival, car, CARS, () => ({ car: 'rally', color: 0 }), id, { car: 'hatch' }, c.pts, c.N, c.hw, clamp, lerpAngle, c.FINISH_S, isUp, baseId, aiHillTop, aiHillAcc, rivalAdvance);
  const dt = 1 / 60; let t = 0, maxLat = 0;
  while (g.fin === null && t < 600) { g.rivalUpdate(dt); t += dt; g.tick(t); maxLat = Math.max(maxLat, Math.abs(rival.lat)); }
  return { t: g.fin, maxLat, hw: c.hw };
}
test('AI：RV-4 在千曲坂下坡、上坡都跑得完（不卡住），上坡比下坡慢但不超過 1.25 倍，車道偏移不出路面', () => {
  const d = simRival('chikuma'), u = simRival('chikuma_up');
  assert.ok(d.t !== null && d.t > 90 && d.t < 400, `下坡 ${d.t}`);
  assert.ok(u.t !== null && u.t > d.t && u.t < d.t * 1.25, `上坡 ${u.t} / 下坡 ${d.t}`);
  assert.ok(d.maxLat <= d.hw && u.maxLat <= u.hw);
});

/* ---------- 介面與文件 ---------- */
test('主畫面賽道卡：4 張排成 2×2（#trackPick 固定兩欄，橫向矮螢幕也是）', () => {
  assert.ok((html.match(/#trackPick \{ grid-template-columns: 1fr 1fr; \}/g) || []).length >= 2, '一般與矮橫向螢幕各一條');
});

test('更新紀錄：2026-11-14 有千曲坂一條（中英文位置與條數相同，不以「Fix:」／「修正」開頭）', () => {
  const open = '/* @changelog:start */', s = html.indexOf(open), e = html.indexOf('/* @changelog:end */');
  const { CHANGELOG } = new Function(`${html.slice(s + open.length, e)}\nreturn { CHANGELOG };`)();
  const v = CHANGELOG.find(x => x.date === '2026-11-14');
  const zi = v.zh.findIndex(l => l.includes('千曲坂')), ei = v.en.findIndex(l => l.includes('Chikuma'));
  assert.ok(zi >= 0 && ei >= 0, '中英文都要提到千曲坂');
  assert.equal(zi, ei, '同一個位置');
  assert.equal(v.zh.length, v.en.length);
  assert.ok(!v.zh[zi].startsWith('修正') && !v.en[ei].startsWith('Fix'));
});

test('README 與 CLAUDE.md 的賽道清單含千曲坂（4 條）', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8'), claude = readFileSync(new URL('../CLAUDE.md', import.meta.url), 'utf8');
  assert.ok(readme.includes('4 條賽道') && readme.includes('千曲坂'));
  assert.ok(claude.includes('四條賽道') && claude.includes('千曲坂') && claude.includes('RP.V = 5'));
});

test('授權：README 與遊戲內都註明路線取自 OpenStreetMap（© OpenStreetMap contributors，ODbL）', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.ok(readme.includes('© OpenStreetMap contributors') && readme.includes('ODbL') && readme.includes('千曲坂'));
  assert.ok(html.includes('© OpenStreetMap contributors'), '遊戲內的標示');
  const cm = html.slice(html.indexOf('/* Chikuma Slope'), html.indexOf('const TRACKS = {'));
  assert.ok(cm.includes('OpenStreetMap') && cm.includes('ODbL'), '路點旁的來源註解');
});
