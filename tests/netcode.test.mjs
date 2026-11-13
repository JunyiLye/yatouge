// 抽出 yatouge.html 內 @netcode 區塊（純函式，不依賴 THREE / DOM）後在 Node 執行
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const NAMES = 'NET, validRoomName, validatePeerState, pushSample, interpRemote, lobbyRooms, raceSync, pvpResult, remoteAsRival, countdownLeft, validPeerId, intake, oppGrace, chooseOpp, lockedResult, pushOut, netAction, mockAllowed, emptyShown, cleanNick';
const load = () => new Function(`${block('netcode')}\nreturn { ${NAMES} };`)();
const loadWithCollision = () => new Function(`${block('collision')}\n${block('netcode')}\nreturn { ${NAMES}, carStep, COLL, CAR_BOX };`)();

const C = (o = {}) => ({ x: 10, z: -20, h: 0.5, vx: 3, vz: 20, w: 0.2, s: 100, lat: 1.5, sr: 0.3, dr: 0, bk: 0, ...o });
const S = (o = {}) => ({ v: 1, st: 'racing', car: 'hatch', col: 1, trk: 'kurosagi', go: 1, n: 5, c: C(), ...o });
// 車子欄位錯誤：只丟掉這一筆車子狀態，st / ft 等欄位保留
const dropC = r => !!r && r.c === null && r.badC === true;
const BOUNDS = { x0: -100, x1: 100, z0: -500, z1: 100, s1: 4000 };

/* ---------- validatePeerState ---------- */
test('合法狀態通過，只保留已知欄位', () => {
  const { validatePeerState } = load();
  const r = validatePeerState(S({ evil: '<img onerror=1>', ['__proto__']: { x: 1 } }), BOUNDS);
  assert.ok(r);
  assert.equal(r.st, 'racing'); assert.equal(r.car, 'hatch'); assert.equal(r.col, 1); assert.equal(r.trk, 'kurosagi');
  assert.deepEqual(r.c, C());
  assert.equal('evil' in r, false);
});

test('沒有車子狀態（waiting）也合法，c 為 null', () => {
  const { validatePeerState } = load();
  const r = validatePeerState({ v: 1, st: 'waiting', car: 'coupe', col: 0, trk: 'seiran' }, BOUNDS);
  assert.equal(r.c, null); assert.equal(r.go, 0); assert.equal(r.n, 0); assert.equal(r.ft, null);
});

test('非物件 / 陣列 / 版本不符一律丟棄', () => {
  const { validatePeerState } = load();
  for (const bad of [null, undefined, 5, 'x', [], [S()], S({ v: 2 }), S({ v: '1' }), (() => { const o = S(); delete o.v; return o; })()])
    assert.equal(validatePeerState(bad, BOUNDS), null);
});

test('st / car / trk 必須在白名單內', () => {
  const { validatePeerState } = load();
  for (const o of [{ st: 'hax' }, { st: 1 }, { st: undefined }, { car: 'tank' }, { car: ['hatch'] }, { trk: '../x' }, { trk: '<b>' }, { trk: 'Kurosagi' }])
    assert.equal(validatePeerState(S(o), BOUNDS), null, JSON.stringify(o));
});

test('col 必須是 0..7 的整數', () => {
  const { validatePeerState } = load();
  for (const col of [-1, 8, 1.5, NaN, '1', null, undefined]) assert.equal(validatePeerState(S({ col }), BOUNDS), null, String(col));
  assert.equal(validatePeerState(S({ col: 7 }), BOUNDS).col, 7);
});

test('車子數值：NaN、Infinity、字串、缺欄位都丟棄', () => {
  const { validatePeerState } = load();
  for (const k of ['x', 'z', 'h', 'vx', 'vz', 'w', 's', 'lat', 'sr']) {
    for (const bad of [NaN, Infinity, -Infinity, '1', null, undefined, {}, [1]])
      assert.ok(dropC(validatePeerState(S({ c: C({ [k]: bad }) }), BOUNDS)), `${k}=${String(bad)}`);
  }
});

test('位置超出賽道範圍（含邊界外 60 m）丟棄；邊界內保留', () => {
  const { validatePeerState } = load();
  assert.ok(validatePeerState(S({ c: C({ x: 100 + 59, z: -500 - 59 }) }), BOUNDS));
  assert.ok(dropC(validatePeerState(S({ c: C({ x: 100 + 61 }) }), BOUNDS)));
  assert.ok(dropC(validatePeerState(S({ c: C({ z: 1e9 }) }), BOUNDS)));
  assert.ok(dropC(validatePeerState(S({ c: C({ z: -500 - 61 }) }), BOUNDS)));
});

test('速度 >= 100 m/s 丟棄（合速度，不是單軸）；角速度、s、lat、steer 有上限', () => {
  const { validatePeerState } = load();
  assert.ok(validatePeerState(S({ c: C({ vx: 60, vz: 60 }) }), BOUNDS));          // 84.8
  assert.ok(dropC(validatePeerState(S({ c: C({ vx: 80, vz: 80 }) }), BOUNDS))); // 113
  assert.ok(dropC(validatePeerState(S({ c: C({ vz: 100 }) }), BOUNDS)));
  assert.ok(dropC(validatePeerState(S({ c: C({ w: 11 }) }), BOUNDS)));
  assert.ok(dropC(validatePeerState(S({ c: C({ s: 4001 + 50 }) }), BOUNDS)));
  assert.ok(dropC(validatePeerState(S({ c: C({ s: -51 }) }), BOUNDS)));
  assert.ok(dropC(validatePeerState(S({ c: C({ lat: 26 }) }), BOUNDS)));
  assert.ok(dropC(validatePeerState(S({ c: C({ sr: 1.5 }) }), BOUNDS)));
  assert.ok(dropC(validatePeerState(S({ c: C({ h: 50 }) }), BOUNDS)));
});

test('dr / bk 只接受 0 或 1', () => {
  const { validatePeerState } = load();
  assert.equal(validatePeerState(S({ c: C({ dr: 1, bk: 1 }) }), BOUNDS).c.dr, 1);
  for (const bad of [2, -1, true, '1', 0.5]) assert.ok(dropC(validatePeerState(S({ c: C({ dr: bad }) }), BOUNDS)), String(bad));
});

test('c 不是物件（字串、陣列、數字）丟棄', () => {
  const { validatePeerState } = load();
  for (const c of ['x', [1, 2], 5, true]) assert.ok(dropC(validatePeerState(S({ c }), BOUNDS)));
});

test('完賽時間：只在 finished 保留；範圍 (0, 3600]；NaN 丟棄', () => {
  const { validatePeerState } = load();
  assert.equal(validatePeerState(S({ st: 'finished', ft: 123.45 }), BOUNDS).ft, 123.45);
  assert.equal(validatePeerState(S({ st: 'racing', ft: 123.45 }), BOUNDS).ft, null);
  for (const ft of [0, -1, 3601, 1e12, NaN, Infinity, '12', {}]) assert.equal(validatePeerState(S({ st: 'finished', ft }), BOUNDS), null, String(ft));
});

test('go / n 必須是非負整數；opp 必須是安全的 peer id', () => {
  const { validatePeerState } = load();
  for (const o of [{ go: -1 }, { go: 1.5 }, { go: 1e9 }, { go: NaN }, { n: -1 }, { n: 2.5 }, { n: '3' }, { opp: 5 }, { opp: '' }, { opp: 'a'.repeat(129) }, { opp: 'ab\u0000c' }, { opp: 'a\u200bb' }])
    assert.equal(validatePeerState(S(o), BOUNDS), null, JSON.stringify(o));
  assert.equal(validatePeerState(S({ opp: 'k3v6q2rt7wacd4fn' }), BOUNDS).opp, 'k3v6q2rt7wacd4fn');
  assert.equal(validatePeerState(S(), BOUNDS).opp, null);
});

test('沒給 bounds 也不會爆，並套用預設寬鬆上限', () => {
  const { validatePeerState } = load();
  assert.ok(validatePeerState(S()));
  assert.ok(dropC(validatePeerState(S({ c: C({ x: 1e7 }) }))));
});

/* ---------- validRoomName ---------- */
test('房間名稱只接受 pvp-xxxxxx（小寫英數 6 碼）', () => {
  const { validRoomName } = load();
  assert.ok(validRoomName('pvp-a1b2c3'));
  for (const bad of ['pvp-A1B2C3', 'pvp-a1b2c', 'pvp-a1b2c3d', 'pvp-<b>xx', 'room-a1b2c3', '', null, 5, 'pvp-a1b2c3\n', 'pvp-a1b 2c'])
    assert.equal(validRoomName(bad), false, String(bad));
});

/* ---------- pushSample / interpRemote ---------- */
const smp = (at, o = {}) => ({ at, n: at, ...C(), ...o });

test('pushSample：序號必須遞增，亂序與重複丟棄；長度有上限', () => {
  const { pushSample } = load();
  let b = [];
  b = pushSample(b, smp(10)); b = pushSample(b, smp(20));
  assert.equal(b.length, 2);
  assert.equal(pushSample(b, smp(15, { n: 15 })), b);
  assert.equal(pushSample(b, smp(20, { n: 20 })), b);
  for (let i = 30; i < 30 + 100; i++) b = pushSample(b, smp(i));
  assert.ok(b.length <= 32);
  assert.equal(b[b.length - 1].n, 129);
});

test('interpRemote：空緩衝回 null', () => {
  const { interpRemote } = load();
  assert.equal(interpRemote([], 1000), null);
  assert.equal(interpRemote(null, 1000), null);
});

test('interpRemote：以 now - 100 ms 為目標，在兩筆之間線性插值', () => {
  const { interpRemote } = load();
  const b = [smp(1000, { x: 0, z: 0, vx: 0, vz: 10 }), smp(1100, { x: 10, z: 20, vx: 0, vz: 30 })];
  const p = interpRemote(b, 1150);          // 目標 1050，剛好中間
  assert.equal(p.extrap, false); assert.equal(p.stale, false);
  assert.ok(Math.abs(p.x - 5) < 1e-9 && Math.abs(p.z - 10) < 1e-9);
  assert.ok(Math.abs(p.vz - 20) < 1e-9);
});

test('interpRemote：航向走最短弧（跨 ±π 不會繞一圈）', () => {
  const { interpRemote } = load();
  const b = [smp(1000, { h: 3.1 }), smp(1100, { h: -3.1 })];
  const p = interpRemote(b, 1150), d = Math.abs(Math.atan2(Math.sin(p.h - Math.PI), Math.cos(p.h - Math.PI)));
  assert.ok(d < 0.1, `h=${p.h}`);
});

test('interpRemote：目標早於第一筆時回第一筆，不外插到過去', () => {
  const { interpRemote } = load();
  const p = interpRemote([smp(1000, { x: 7 })], 1050);
  assert.equal(p.x, 7); assert.equal(p.extrap, false);
});

test('interpRemote：資料中斷時用速度外插；最多 0.5 秒，超過標記 stale', () => {
  const { interpRemote } = load();
  const b = [smp(1000, { x: 0, z: 0, h: 0, vx: 0, vz: 10, w: 0.4 })];
  const a = interpRemote(b, 1300);          // 目標 1200 → 外插 0.2 s
  assert.equal(a.extrap, true); assert.equal(a.stale, false);
  assert.ok(Math.abs(a.z - 2) < 1e-9 && Math.abs(a.h - 0.08) < 1e-9);
  const c = interpRemote(b, 1000 + 100 + 5000); // 5 s 沒資料
  assert.equal(c.extrap, true); assert.equal(c.stale, true);
  assert.ok(Math.abs(c.z - 5) < 1e-9, `外插被限制在 0.5 s：z=${c.z}`);
});

/* ---------- lobbyRooms ---------- */
const NOW = 100000;
const host = (room, o = {}, l = {}) => ({ peer: 'h-' + room, by: null, isMe: false, kind: 'viewer', updatedAt: NOW - 1000, presence: { lobby: { v: 1, room, track: 'kurosagi', open: 1, hb: 1, ...l } }, ...o });
const guest = (peer, room) => ({ peer, by: null, isMe: false, kind: 'viewer', updatedAt: NOW, presence: { lobby: { v: 1, in: room } } });

test('lobbyRooms：列出開放的房間（人數 1/2），依房名排序', () => {
  const { lobbyRooms } = load();
  const r = lobbyRooms([host('pvp-bbbbbb'), host('pvp-aaaaaa', { isMe: true })], NOW);
  assert.deepEqual(r.map(x => [x.room, x.count, x.track, x.mine]), [['pvp-aaaaaa', 1, 'kurosagi', true], ['pvp-bbbbbb', 1, 'kurosagi', false]]);
  assert.equal(r[1].peer, 'h-pvp-bbbbbb'); assert.equal('by' in r[1], false); // 帳號身分（by）不再外露，只有暱稱 nk
});

test('lobbyRooms：有人加入（in = 房名）的房間算已滿，不列出', () => {
  const { lobbyRooms } = load();
  assert.equal(lobbyRooms([host('pvp-aaaaaa'), guest('g1', 'pvp-aaaaaa')], NOW).length, 0);
  assert.equal(lobbyRooms([host('pvp-aaaaaa'), guest('g1', 'pvp-zzzzzz')], NOW).length, 1);
  // 同一個 peer 重複宣告只算一人
  assert.equal(lobbyRooms([host('pvp-aaaaaa'), guest('h-pvp-aaaaaa', 'pvp-aaaaaa')], NOW).length, 1);
});

test('lobbyRooms：過期（updatedAt 太舊）、未開放、格式錯誤、未知賽道、非 viewer 都排除', () => {
  const { lobbyRooms } = load();
  const bad = [
    host('pvp-aaaaaa', { updatedAt: NOW - 16000 }),
    host('pvp-bbbbbb', {}, { open: 0 }),
    host('pvp-cccccc', {}, { open: true }),
    host('pvp-<img>', {}),
    host('PVP-DDDDDD', {}),
    host('pvp-eeeeee', {}, { track: 'evil' }),
    host('pvp-ffffff', { kind: 'agent' }),
    host('pvp-gggggg', {}, { v: 2 }),
    host('pvp-hhhhhh', { updatedAt: NaN }),
    host('pvp-iiiiii', { updatedAt: undefined }),
    host('pvp-jjjjjj', { peer: 5 }),
    { peer: 'x', kind: 'viewer', presence: { lobby: 'pvp-kkkkkk' } },
    { peer: 'y', kind: 'viewer', presence: null },
    null, undefined, 7
  ];
  assert.deepEqual(lobbyRooms(bad, NOW), []);
  assert.deepEqual(lobbyRooms(null, NOW), []);
  assert.deepEqual(lobbyRooms(undefined, NOW), []);
});

test('lobbyRooms：同名房間有兩個宣告者時只留 peer 字典序較小的一個（結果穩定）', () => {
  const { lobbyRooms } = load();
  const a = host('pvp-aaaaaa', { peer: 'zzz' }), b = host('pvp-aaaaaa', { peer: 'aaa' });
  assert.equal(lobbyRooms([a, b], NOW)[0].peer, 'aaa');
  assert.equal(lobbyRooms([b, a], NOW)[0].peer, 'aaa');
});

test('lobbyRooms：自訂賽道白名單與 ttl', () => {
  const { lobbyRooms } = load();
  assert.equal(lobbyRooms([host('pvp-aaaaaa')], NOW, ['seiran']).length, 0);
  assert.equal(lobbyRooms([host('pvp-aaaaaa')], NOW, undefined, 500).length, 0);
});

/* ---------- raceSync ---------- */
const OT = (o = {}) => ({ st: 'waiting', go: 0, ...o });

test('raceSync：房主 ready，對方 ready → 房主開始倒數並把 go +1', () => {
  const { raceSync } = load();
  assert.deepEqual(raceSync({ st: 'ready', host: true, go: 0 }, OT({ st: 'ready' })), { st: 'countdown', go: 1, start: true, abort: false });
  assert.deepEqual(raceSync({ st: 'ready', host: true, go: 4 }, OT({ st: 'ready' })), { st: 'countdown', go: 5, start: true, abort: false });
});

test('raceSync：房主 ready，對方還在 waiting → 維持不動', () => {
  const { raceSync } = load();
  assert.deepEqual(raceSync({ st: 'ready', host: true, go: 0 }, OT()), { st: 'ready', go: 0, start: false, abort: false });
});

test('raceSync：房客只在房主 countdown 且 go 比自己新時才開始', () => {
  const { raceSync } = load();
  assert.deepEqual(raceSync({ st: 'ready', host: false, go: 0 }, OT({ st: 'countdown', go: 1 })), { st: 'countdown', go: 1, start: true, abort: false });
  // 舊的 go（上一場殘留）不會再開一次
  assert.equal(raceSync({ st: 'ready', host: false, go: 1 }, OT({ st: 'countdown', go: 1 })).start, false);
  // 房主也 ready 時房客等房主，自己不能開始
  assert.equal(raceSync({ st: 'ready', host: false, go: 0 }, OT({ st: 'ready', go: 0 })).start, false);
  // 房客還沒按準備不會被拉進倒數
  assert.equal(raceSync({ st: 'waiting', host: false, go: 0 }, OT({ st: 'countdown', go: 1 })).start, false);
});

test('raceSync：倒數中對方取消（waiting）或離開 → 中止並回到 waiting', () => {
  const { raceSync } = load();
  assert.deepEqual(raceSync({ st: 'countdown', host: true, go: 1 }, OT()), { st: 'waiting', go: 1, start: false, abort: true });
  assert.deepEqual(raceSync({ st: 'countdown', host: false, go: 1 }, null), { st: 'waiting', go: 1, start: false, abort: true });
  assert.deepEqual(raceSync({ st: 'countdown', host: false, go: 1 }, OT({ st: 'ready' })), { st: 'countdown', go: 1, start: false, abort: false });
  assert.deepEqual(raceSync({ st: 'countdown', host: false, go: 1 }, OT({ st: 'countdown', go: 1 })), { st: 'countdown', go: 1, start: false, abort: false });
});

test('raceSync：對方離開 → ready 退回 waiting（不是中止）；waiting / racing / finished 不變', () => {
  const { raceSync } = load();
  assert.deepEqual(raceSync({ st: 'ready', host: true, go: 0 }, null), { st: 'waiting', go: 0, start: false, abort: false });
  for (const st of ['waiting', 'racing', 'finished']) assert.deepEqual(raceSync({ st, host: true, go: 2 }, null), { st, go: 2, start: false, abort: false });
});

test('raceSync：racing / finished 時對方狀態不影響自己', () => {
  const { raceSync } = load();
  for (const st of ['racing', 'finished']) for (const o of ['waiting', 'ready', 'countdown', 'racing', 'finished'])
    assert.deepEqual(raceSync({ st, host: false, go: 1 }, OT({ st: o, go: 9 })), { st, go: 1, start: false, abort: false });
});

/* ---------- pvpResult ---------- */
test('pvpResult：時間短的人贏，差距為絕對值', () => {
  const { pvpResult } = load();
  const w = pvpResult(100, 101.5), l = pvpResult(101.5, 100), t = pvpResult(100, 100);
  assert.deepEqual([w.outcome, w.dnf], ['win', false]); assert.ok(Math.abs(w.gap - 1.5) < 1e-9);
  assert.deepEqual([l.outcome, l.dnf], ['lose', false]); assert.ok(Math.abs(l.gap - 1.5) < 1e-9);
  assert.deepEqual([t.outcome, t.gap], ['tie', 0]);
});

test('pvpResult：對手沒有（合法的）完賽時間 → 我贏且標記 dnf，沒有差距', () => {
  const { pvpResult } = load();
  for (const o of [null, undefined, NaN, Infinity, -5, 0, '90', 99999])
    assert.deepEqual(pvpResult(100, o), { outcome: 'win', gap: null, dnf: true }, String(o));
});

test('pvpResult：我自己沒有完賽時間 → 落敗、無差距', () => {
  const { pvpResult } = load();
  assert.deepEqual(pvpResult(null, 100), { outcome: 'lose', gap: null, dnf: false });
});

/* ---------- remoteAsRival + 既有 carStep ---------- */
test('remoteAsRival：把對手姿態轉成 carStep 吃的格式，速度向量原樣還原', () => {
  const { remoteAsRival } = load();
  for (const [h, vx, vz] of [[0.5, 3, 20], [-2.2, -7, -4], [3, 0, 0]]) {
    const rv = remoteAsRival({ x: 1, z: 2, h, vx, vz, s: 50, lat: -1 });
    assert.equal(rv.vis, 0); assert.equal(rv.h, h); assert.equal(rv.x, 1); assert.equal(rv.z, 2);
    const tx = Math.sin(rv.h), tz = Math.cos(rv.h), rx = -Math.cos(rv.h), rz = Math.sin(rv.h);
    assert.ok(Math.abs(tx * rv.v + rx * rv.latV - vx) < 1e-9 && Math.abs(tz * rv.v + rz * rv.latV - vz) < 1e-9);
  }
});

test('既有 carStep 以遠端姿態當障礙：自己的車被彈開，對手速度不被改寫', () => {
  const { remoteAsRival, carStep, COLL, CAR_BOX } = loadWithCollision();
  const pose = { x: 0, z: 3.5, h: 0, vx: 0, vz: 10, s: 50, lat: 0 };     // 前方、同向、較慢
  const me = { x: 0, z: 0, h: 0, vx: 0, vz: 25, w: 0 };                  // 從後方追撞
  const r = carStep(me, CAR_BOX.hatch, remoteAsRival(pose), CAR_BOX.coupe, 4, COLL);
  assert.ok(r, '應該重疊');
  assert.ok(r.vz < me.vz, `撞後車速應下降：${r.vz}`);
  assert.ok(r.z < me.z, '被往後推開');
  assert.ok(r.hitSpeed > 0);
  assert.equal(pose.vz, 10);
});

test('沒有重疊時 carStep 回 null', () => {
  const { remoteAsRival, carStep, COLL, CAR_BOX } = loadWithCollision();
  assert.equal(carStep({ x: 0, z: 0, h: 0, vx: 0, vz: 25, w: 0 }, CAR_BOX.hatch, remoteAsRival({ x: 5, z: 3.5, h: 0, vx: 0, vz: 10, s: 50, lat: 0 }), CAR_BOX.coupe, 4, COLL), null);
});

/* ---------- countdownLeft（倒數以牆上時間計，不受卡頓影響） ---------- */
test('countdownLeft：由 go 開始時刻起算，剛開始為 3.999 秒，3 秒後接近 1 秒', () => {
  const { countdownLeft } = load();
  assert.equal(countdownLeft(1000, 1000), 3.999);
  assert.ok(Math.abs(countdownLeft(1000, 4000) - 0.999) < 1e-9);
  assert.ok(countdownLeft(1000, 4999) <= 0);
});

test('countdownLeft：模擬一幀卡 1 秒，兩邊在同一個牆上時間點跨過 0，與幀數無關', () => {
  const { countdownLeft } = load();
  const goT = (goAt, frameTimes) => frameTimes.find(t => countdownLeft(goAt, t) <= 0);
  const smooth = []; for (let t = 1000; t < 9000; t += 16) smooth.push(t);
  const stalled = smooth.filter(t => t < 2000 || t > 3100);   // 2.0~3.1 s 之間沒有幀（卡 1.1 秒）
  const a = goT(1000, smooth), b = goT(1000, stalled);
  assert.ok(Math.abs(a - 5000) <= 16 && Math.abs(b - 5000) <= 16, `${a} ${b}`);
  // 舊作法（每幀最多扣 0.05 秒）卡 1 秒後只少扣 0.05 秒，會晚約 1 秒；牆上時間不會
  let old = 3.999, prev = 1000, oldGo = null;
  for (const t of stalled) { old -= Math.min(0.05, (t - prev) / 1000); prev = t; if (old <= 0) { oldGo = t; break; } }
  assert.ok(oldGo - 5000 > 900);
});

test('countdownLeft：非有限數值回 0（不會永遠卡在倒數）', () => {
  const { countdownLeft } = load();
  assert.equal(countdownLeft(NaN, 5), 0); assert.equal(countdownLeft(1, undefined), 0);
});

/* ---------- 審查修正：車子欄位單獨驗證、peer id、對手選擇、寬限、賽道規則 ---------- */
test('車子欄位錯誤只丟掉該筆車子狀態，st / ft / car 保留', () => {
  const { validatePeerState } = load();
  const r = validatePeerState(S({ st: 'finished', ft: 50, c: C({ x: NaN }) }), BOUNDS);
  assert.ok(dropC(r)); assert.equal(r.st, 'finished'); assert.equal(r.ft, 50); assert.equal(r.car, 'hatch');
  assert.equal(validatePeerState(S(), BOUNDS).badC, false);
  assert.equal(validatePeerState({ v: 1, st: 'waiting', car: 'hatch', col: 0, trk: 'seiran' }, BOUNDS).badC, false);
});

test('validPeerId 只看長度（1..128）與控制 / 隱形字元，不假設字元集', () => {
  const { validPeerId } = load();
  for (const ok of ['k3v6q2rt7wacd4fn', 'Peer:ABC/12=', '玩家-1', 'a'.repeat(128), '<b>']) assert.equal(validPeerId(ok), true, ok);
  for (const bad of ['', 'a'.repeat(129), 'a\u0000b', 'a\nb', 'a​b', 'a‮b', 'a⁦b', 5, null, undefined, {}]) assert.equal(validPeerId(bad), false, String(bad));
});

test('intake：有效車子加入緩衝；badC 不動緩衝；沒有車子（回到房間）才清空', () => {
  const { intake } = load();
  const v = { n: 3, c: C() };
  const a = intake([], v, 500); assert.equal(a.buf.length, 1); assert.equal(a.buf[0].at, 500); assert.equal(a.reset, false);
  const keep = intake(a.buf, { n: 4, c: null, badC: true }, 520); assert.equal(keep.buf, a.buf); assert.equal(keep.reset, false);
  const clr = intake(a.buf, { n: 5, c: null, badC: false }, 540); assert.deepEqual(clr.buf, []); assert.equal(clr.reset, true);
  assert.equal(intake([], { n: 5, c: null, badC: false }, 540).reset, false);
});

test('oppGrace：對手要連續消失 2 秒才算離開；連線中斷期間不計時', () => {
  const { oppGrace } = load();
  let s = oppGrace(null, true, true, 0); assert.deepEqual(s, { missingSince: null, gone: false });
  s = oppGrace(s.missingSince, false, true, 1000); assert.deepEqual(s, { missingSince: 1000, gone: false });
  s = oppGrace(s.missingSince, false, true, 2900); assert.equal(s.gone, false);
  assert.equal(oppGrace(s.missingSince, false, true, 3000).gone, true);
  s = oppGrace(1000, true, true, 1500); assert.equal(s.missingSince, null);
  let t = oppGrace(1000, false, false, 5000); assert.deepEqual(t, { missingSince: 5000, gone: false });
  t = oppGrace(t.missingSince, false, false, 60000); assert.equal(t.gone, false);
  t = oppGrace(t.missingSince, false, true, 60500); assert.equal(t.gone, false);
  assert.equal(oppGrace(t.missingSince, false, true, 62500).gone, true);
});

const PEER = (peer, o = {}) => ({ peer, isMe: false, kind: 'viewer', by: null, presence: { ok: true }, ...o });
const okPres = p => !!(p && p.ok);

test('chooseOpp：房主只在 waiting / ready 時鎖定新對手；三個加入者只鎖最小 peer', () => {
  const { chooseOpp } = load();
  const peers = [PEER('me', { isMe: true }), PEER('zzz'), PEER('mmm'), PEER('aaa')];
  const base = { host: true, hostPeer: null, oppPeer: null, st: 'waiting', peers, valid: okPres };
  assert.equal(chooseOpp(base).peer, 'aaa');
  assert.equal(chooseOpp({ ...base, st: 'ready' }).peer, 'aaa');
  for (const st of ['countdown', 'racing', 'finished']) assert.equal(chooseOpp({ ...base, st }), null, st);
  assert.equal(chooseOpp({ ...base, oppPeer: 'mmm' }).peer, 'mmm');
  assert.equal(chooseOpp({ ...base, oppPeer: 'gone' }), null);
  const noisy = [PEER('aaa', { presence: { ok: false } }), PEER('bbb', { kind: 'agent' }), PEER('ccc')];
  assert.equal(chooseOpp({ ...base, peers: noisy }).peer, 'ccc');
});

test('chooseOpp：房客只認房主，不是自己，且不看有效性', () => {
  const { chooseOpp } = load();
  const peers = [PEER('host1', { presence: { ok: false } }), PEER('other')];
  const g = { host: false, hostPeer: 'host1', oppPeer: null, st: 'racing', peers, valid: okPres };
  assert.equal(chooseOpp(g).peer, 'host1');
  assert.equal(chooseOpp({ ...g, hostPeer: 'nope' }), null);
  assert.equal(chooseOpp({ ...g, peers: [PEER('host1', { isMe: true })] }), null);
  assert.equal(chooseOpp({ ...g, peers: null }), null);
});

test('lockedResult：判定對手未完賽後維持勝利，之後對手完賽只更新時間與差距', () => {
  const { lockedResult, pvpResult } = load();
  assert.deepEqual(lockedResult(100, null), { outcome: 'win', gap: null, dnf: true });
  const late = lockedResult(100, 90);
  assert.equal(late.outcome, 'win'); assert.equal(late.dnf, false); assert.ok(Math.abs(late.gap - 10) < 1e-9);
  assert.equal(pvpResult(100, 90).outcome, 'lose');
});

test('pushOut：把 carStep 對半的推開量補成完整推開，推完不再重疊', () => {
  const { remoteAsRival, carStep, pushOut, COLL, CAR_BOX } = loadWithCollision();
  const me = { x: 0, z: 0, h: 0, vx: 0, vz: 25, w: 0 }, pose = { x: 0.3, z: 3.0, h: 0, vx: 0, vz: 10, s: 50, lat: 0 };
  const cr = carStep(me, CAR_BOX.hatch, remoteAsRival(pose), CAR_BOX.coupe, 4, COLL);
  const p = pushOut(me, cr);
  assert.ok(Math.abs((p.x - me.x) - 2 * (cr.x - me.x)) < 1e-12 && Math.abs((p.z - me.z) - 2 * (cr.z - me.z)) < 1e-12);
  const after = carStep({ ...me, x: p.x, z: p.z }, CAR_BOX.hatch, remoteAsRival(pose), CAR_BOX.coupe, 4, COLL);
  assert.equal(after, null, '完整推開後兩車不再重疊');
});

test('netAction：永久性錯誤 → fallback；named room 斷掉 → lobby；join 被拒 → unavailable', () => {
  const { netAction } = load();
  for (const c of ['revoked', 'not_granted', 'capability_disabled', 'capability_removed', 'transform_error'])
    for (const sc of ['lobby', 'room', 'join']) assert.equal(netAction(c, sc), 'fallback', c + sc);
  for (const c of ['upstream_error', 'limit_reached', 'not_permitted']) assert.equal(netAction(c, 'room'), 'lobby', c);
  assert.equal(netAction('not_permitted', 'join'), 'unavailable');
  assert.equal(netAction('upstream_error', 'join'), 'ignore');
  for (const c of ['invalid_argument', 'rate_limited', undefined, 'whatever']) assert.equal(netAction(c, 'room'), 'ignore', String(c));
  assert.equal(netAction('upstream_error', 'lobby'), 'ignore');
});

test('mockAllowed：只有 localhost / 127.0.0.1 / file: 且帶 mockroom=1 才啟用', () => {
  const { mockAllowed } = load();
  assert.equal(mockAllowed('?mockroom=1', 'localhost', 'http:'), true);
  assert.equal(mockAllowed('?a=1&mockroom=1', '127.0.0.1', 'http:'), true);
  assert.equal(mockAllowed('?mockroom=1', '', 'file:'), true);
  assert.equal(mockAllowed('?mockroom=1', 'abc.claudeusercontent.com', 'https:'), false);
  assert.equal(mockAllowed('?mockroom=1', 'localhost.evil.com', 'https:'), false);
  assert.equal(mockAllowed('', 'localhost', 'http:'), false);
  assert.equal(mockAllowed('?mockroom=0', 'localhost', 'http:'), false);
});

test('emptyShown：大廳沒有房間要滿 1.5 秒才顯示「沒有房間」', () => {
  const { emptyShown } = load();
  assert.equal(emptyShown(null, 5000), false); assert.equal(emptyShown(1000, 2400), false); assert.equal(emptyShown(1000, 2500), true);
});

test('lobbyRooms：MAX_ROOMS 上限 30，仍依房名排序', () => {
  const { lobbyRooms, NET } = load();
  const many = Array.from({ length: 45 }, (_, i) => host('pvp-' + String(i).padStart(6, '0')));
  const r = lobbyRooms(many.reverse(), NOW);
  assert.equal(r.length, NET.MAX_ROOMS); assert.equal(r[0].room, 'pvp-000000'); assert.equal(r[29].room, 'pvp-000029');
});

/* ---------- 暱稱（nickname）：不使用帳號，身分只有玩家自己輸入的暱稱 ---------- */
test('cleanNick：trim 後 1–16 字元才有效，否則 null', () => {
  const { cleanNick } = load();
  assert.equal(cleanNick('Drifter'), 'Drifter');
  assert.equal(cleanNick('  Rival  '), 'Rival');
  assert.equal(cleanNick('藤原拓海'), '藤原拓海');
  assert.equal(cleanNick('a'.repeat(16)), 'a'.repeat(16));
  assert.equal(cleanNick('a'.repeat(17)), null);
  assert.equal(cleanNick('😀'.repeat(16)), '😀'.repeat(16), '以 code point 計算，不是 UTF-16 單位');
  for (const bad of ['', '   ', '\u200b', '\n\t', null, undefined, 5, {}, ['a'], true]) assert.equal(cleanNick(bad), null, String(bad));
});

test('cleanNick：移除控制、不可見、雙向字元（不是整串拒絕）', () => {
  const { cleanNick } = load();
  assert.equal(cleanNick('a\u0000b\u001fc\u007fd\u0085e'), 'abcde');
  assert.equal(cleanNick('A\u200bB\u200eC\u200fD\ufeffE\u2060F\u00adG'), 'ABCDEFG');
  assert.equal(cleanNick('x\u202ey\u202az\u2066w\u2069'), 'xyzw');
  assert.equal(cleanNick('a\u2028b\u2029c'), 'abc');
  assert.equal(cleanNick('\u202e\u200b'), null, '清完變空字串 = 無效');
  assert.equal(cleanNick('<b onclick=1>'), '<b onclick=1>', 'HTML 不處理：UI 只用 textContent 顯示');
});

test('validatePeerState：nk 通過時帶出清理後的暱稱', () => {
  const { validatePeerState } = load();
  assert.equal(validatePeerState(S({ nk: 'Drifter' }), BOUNDS).nk, 'Drifter');
  assert.equal(validatePeerState(S({ nk: ' Rival\u202e ' }), BOUNDS).nk, 'Rival');
});

test('validatePeerState：nk 太長、非字串、清完為空 → nk 為 null（整筆狀態仍有效，UI 用「玩家」）', () => {
  const { validatePeerState } = load();
  for (const nk of ['a'.repeat(17), 5, {}, ['x'], true, '', '   ', '\u200b\u202e', null, undefined]) {
    const r = validatePeerState(S({ nk }), BOUNDS);
    assert.ok(r, String(nk)); assert.equal(r.nk, null, String(nk)); assert.equal(r.st, 'racing');
  }
  assert.equal(validatePeerState(S(), BOUNDS).nk, null);
});

test('lobbyRooms：大廳廣告的 nk 清理後放在房間上；無效 nk 為 null；不再有 by', () => {
  const { lobbyRooms } = load();
  const r = lobbyRooms([
    host('pvp-aaaaaa', {}, { nk: ' Drifter\u202e' }), host('pvp-bbbbbb', {}, { nk: 'a'.repeat(17) }), host('pvp-cccccc', {}, { nk: 42 }),
    host('pvp-dddddd', { by: 'real-account-id' }, { nk: '\u200b' }), host('pvp-eeeeee')
  ], NOW);
  assert.deepEqual(r.map(x => x.nk), ['Drifter', null, null, null, null]);
  for (const x of r) assert.equal('by' in x, false);
});
