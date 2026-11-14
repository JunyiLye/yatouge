// 房間內選圖選車：抽出 yatouge.html 的 @netcode + @spectate + @roompick（純函式）— 投票驗證、抽籤（房主送出的 seed，雙方結果一致）、
// 房間階段（準備 → 結果 → AT/MT → 倒數）、改選擇取消準備、觀戰者跟著換賽道、舊版本隔離
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const M = new Function(`${block('netcode')}\n${block('spectate')}\n${block('roompick')}\n${block('cars')}
return { NET, RP, CARS, validatePeerState, lobbyRooms, chooseOpp, validVote, roomState, resolveVote, roomPhase, pickSig, cancelReady, specTrackSwitch };`)();
const { NET, RP, CARS, validatePeerState, lobbyRooms, chooseOpp, validVote, roomState, resolveVote, roomPhase, pickSig, cancelReady, specTrackSwitch } = M;

const BOUNDS = { x0: -100, x1: 100, z0: -500, z1: 100, s1: 4000 };
const VOTE = (o = {}) => ({ t: 'seiran', d: 'down', m: 'first', g: 50, ...o });
const R = (o = {}) => ({ v: RP.V, st: 'waiting', car: 'coupe', col: 2, trk: 'kurosagi', go: 0, nk: 'Bob', vote: VOTE(), gb: 0, ...o });

/* ---------- 常數 ---------- */
test('RP：模式、距離與預設值；顏色數與 CARS 一致', () => {
  assert.deepEqual(RP.MODES, ['first', 'cat']);
  assert.deepEqual(RP.GAPS, [30, 40, 50, 60, 70, 80, 90, 100]);
  assert.equal(RP.GAP, 50);
  assert.ok(RP.V !== NET.V, '房間狀態與大廳換了版本號，舊版本互相看不到');
  for (const k of NET.CARS) assert.equal(RP.COLS[k], CARS[k].colors.length, k);
  assert.deepEqual(RP.COLS, { hatch: 5, coupe: 4, gtr: 4, rally: 4 });
});

/* ---------- validVote ---------- */
test('validVote：只接受已知賽道、方向、模式與距離，回傳乾淨的副本', () => {
  assert.deepEqual(validVote({ t: 'hakuro', d: 'up', m: 'cat', g: 80, evil: '<b>' }), { t: 'hakuro', d: 'up', m: 'cat', g: 80 });
  for (const t of NET.TRACKS) for (const d of RP.DIRS) for (const m of RP.MODES) for (const g of RP.GAPS) assert.deepEqual(validVote({ t, d, m, g }), { t, d, m, g });
  for (const bad of [null, undefined, 1, 'x', [], [VOTE()], VOTE({ t: 'Seiran' }), VOTE({ t: '../x' }), VOTE({ t: undefined }), VOTE({ m: 'race' }), VOTE({ m: 'CAT' }),
    VOTE({ m: undefined }), VOTE({ g: 45 }), VOTE({ g: '50' }), VOTE({ g: 50.5 }), VOTE({ g: NaN }), VOTE({ g: 0 }), VOTE({ g: 110 }), VOTE({ g: undefined }), VOTE({ d: undefined }), VOTE({ d: 'sideways' }), VOTE({ d: 'UP' })])
    assert.equal(validVote(bad), null, JSON.stringify(bad));
});

/* ---------- roomState ---------- */
test('roomState：合法的房間狀態帶出投票、gb、sd', () => {
  const r = roomState(R({ st: 'ready', gb: 1, sd: 123456 }), BOUNDS);
  assert.ok(r);
  assert.deepEqual(r.vote, VOTE()); assert.equal(r.gb, 1); assert.equal(r.sd, 123456);
  assert.equal(r.car, 'coupe'); assert.equal(r.col, 2); assert.equal(r.st, 'ready');
  const w = roomState(R({ gb: undefined }), BOUNDS);
  assert.equal(w.gb, 0); assert.equal(w.sd, null, '沒有 seed = null');
});

test('roomState：舊版本（v 1、沒有投票）整筆拒絕', () => {
  assert.equal(roomState(R({ v: NET.V }), BOUNDS), null);
  const old = R({ v: NET.V }); delete old.vote; delete old.gb;
  assert.equal(roomState(old, BOUNDS), null);
  const noVote = R(); delete noVote.vote;
  assert.equal(roomState(noVote, BOUNDS), null);
});

test('roomState：投票、顏色、gb、sd 任一錯誤整筆丟棄', () => {
  for (const o of [{ vote: VOTE({ t: 'x' }) }, { vote: null }, { vote: 'seiran' }, { col: 4 }, { col: 7 }, { gb: 2 }, { gb: '1' }, { gb: true },
    { sd: -1 }, { sd: 2 ** 32 }, { sd: 1.5 }, { sd: '7' }, { sd: NaN }, { role: 'spectator' }, { st: 'hax' }, { car: 'tank' }])
    assert.equal(roomState(R(o), BOUNDS), null, JSON.stringify(o));
  assert.equal(roomState(R({ col: 3 }), BOUNDS).col, 3);
  assert.equal(roomState(R({ car: 'hatch', col: 4 }), BOUNDS).col, 4, 'KX-2 第 5 色（碳纖維引擎蓋）要接受');
  for (const car of ['hatch', 'coupe', 'gtr']) assert.equal(roomState(R({ car, col: car === 'hatch' ? 5 : 4 }), BOUNDS), null, car);
  assert.equal(roomState(R({ sd: 0 }), BOUNDS).sd, 0);
  assert.equal(roomState(R({ sd: 2 ** 32 - 1 }), BOUNDS).sd, 2 ** 32 - 1);
  assert.equal(roomState(R({ sd: null }), BOUNDS).sd, null);
});

test('validatePeerState / lobbyRooms：版本參數（預設維持 NET.V）', () => {
  assert.ok(validatePeerState(R({ v: NET.V }), BOUNDS), '預設版本不變');
  assert.equal(validatePeerState(R(), BOUNDS), null);
  assert.ok(validatePeerState(R(), BOUNDS, RP.V));
  assert.equal(validatePeerState(R({ v: NET.V }), BOUNDS, RP.V), null);
  const host = (v, o = {}) => ({ peer: 'h' + v, kind: 'viewer', updatedAt: 1000, presence: { lobby: { v, room: 'pvp-aaaaa' + v, track: 'kurosagi', open: 1, hb: 1, nk: 'A' } }, ...o });
  assert.deepEqual(lobbyRooms([host(NET.V), host(RP.V)], 1000).map(r => r.room), ['pvp-aaaaa' + NET.V]);
  assert.deepEqual(lobbyRooms([host(NET.V), host(RP.V)], 1000, NET.TRACKS, NET.LOBBY_TTL, RP.V).map(r => r.room), ['pvp-aaaaa' + RP.V]);
  // joiners / watchers are counted only with the same version
  const join = (peer, v) => ({ peer, kind: 'viewer', updatedAt: 1000, presence: { lobby: { v, in: 'pvp-aaaaa' + RP.V } } });
  assert.equal(lobbyRooms([host(RP.V), join('g1', NET.V)], 1000, NET.TRACKS, NET.LOBBY_TTL, RP.V).length, 1, '舊版的加入者不算');
  assert.equal(lobbyRooms([host(RP.V), join('g1', RP.V)], 1000, NET.TRACKS, NET.LOBBY_TTL, RP.V).length, 0, '同版的加入者讓房間滿了');
});

test('chooseOpp + roomState：房主不會把舊版本的玩家當成對手', () => {
  const peer = (id, presence) => ({ peer: id, isMe: false, kind: 'viewer', presence });
  const valid = p => roomState(p, BOUNDS);
  const old = R({ v: NET.V }); delete old.vote;
  assert.equal(chooseOpp({ host: true, hostPeer: null, oppPeer: null, st: 'waiting', peers: [peer('a', old)], valid }), null);
  assert.equal(chooseOpp({ host: true, hostPeer: null, oppPeer: null, st: 'waiting', peers: [peer('a', old), peer('b', R())], valid }).peer, 'b');
});

/* ---------- resolveVote ---------- */
test('resolveVote：兩票相同直接採用，不是抽籤', () => {
  for (let seed = 0; seed < 50; seed++) {
    assert.deepEqual(resolveVote(VOTE(), VOTE(), seed), { t: 'seiran', d: 'down', m: 'first', g: null, dt: false, dm: false, dg: false });
    assert.deepEqual(resolveVote(VOTE({ m: 'cat', g: 70 }), VOTE({ m: 'cat', g: 70 }), seed), { t: 'seiran', d: 'down', m: 'cat', g: 70, dt: false, dm: false, dg: false });
  }
});

test('resolveVote：不同時依 seed 抽，同一個 seed 雙方結果一致；兩邊都抽得到', () => {
  const a = VOTE({ t: 'kurosagi' }), b = VOTE({ t: 'hakuro' });
  let ka = 0;
  for (let seed = 0; seed < 400; seed++) {
    const r = resolveVote(a, b, seed * 2654435761 >>> 0);
    assert.deepEqual(resolveVote(a, b, seed * 2654435761 >>> 0), r, '同 seed 同結果');
    assert.ok(r.t === 'kurosagi' || r.t === 'hakuro'); assert.equal(r.dt, true); assert.equal(r.dm, false);
    if (r.t === 'kurosagi') ka++;
  }
  assert.ok(ka > 140 && ka < 260, `兩票各約一半：${ka}/400`);
  // consecutive seeds too (a host may send small numbers)
  const small = new Set(); for (let s = 0; s < 20; s++) small.add(resolveVote(a, b, s).t);
  assert.equal(small.size, 2);
});

test('resolveVote：模式與距離各自投票；距離只看投貓捉老鼠的那一方', () => {
  const host = VOTE({ m: 'cat', g: 90 }), guest = VOTE({ m: 'first', g: 30 });
  const seen = new Set();
  for (let s = 0; s < 200; s++) {
    const r = resolveVote(host, guest, s);
    assert.equal(r.dm, true); assert.equal(r.dt, false);
    if (r.m === 'cat') { assert.equal(r.g, 90, '只有房主投貓捉老鼠：用房主的距離'); assert.equal(r.dg, false); } else { assert.equal(r.g, null); assert.equal(r.dg, false); }
    seen.add(r.m);
  }
  assert.equal(seen.size, 2);
  const gaps = new Set();
  for (let s = 0; s < 200; s++) { const r = resolveVote(VOTE({ m: 'cat', g: 30 }), VOTE({ m: 'cat', g: 100 }), s); assert.equal(r.dg, true); gaps.add(r.g); }
  assert.deepEqual([...gaps].sort((x, y) => x - y), [30, 100]);
});

test('resolveVote：不合法的票或 seed 回傳 null', () => {
  for (const [a, b, s] of [[null, VOTE(), 1], [VOTE(), VOTE({ t: 'x' }), 1], [VOTE(), VOTE(), -1], [VOTE(), VOTE(), 1.5], [VOTE(), VOTE(), '1'], [VOTE(), VOTE(), null]])
    assert.equal(resolveVote(a, b, s), null, JSON.stringify([a, b, s]));
});

/* ---------- roomPhase ---------- */
test('roomPhase：準備 → 房主產生 seed → 雙方問 AT/MT → 都選好才由房主開始倒數', () => {
  const me = (o = {}) => ({ st: 'ready', gb: 0, sd: null, ...o }), them = me;
  assert.equal(roomPhase({ host: true, me: me(), other: null }), 'pick');
  assert.equal(roomPhase({ host: true, me: me({ st: 'waiting' }), other: them() }), 'pick');
  assert.equal(roomPhase({ host: true, me: me(), other: them({ st: 'waiting' }) }), 'pick');
  assert.equal(roomPhase({ host: true, me: me(), other: them() }), 'seed');
  assert.equal(roomPhase({ host: false, me: me(), other: them() }), 'wait', '來賓等房主的 seed');
  assert.equal(roomPhase({ host: true, me: me({ sd: 5 }), other: them() }), 'trans');
  assert.equal(roomPhase({ host: false, me: me(), other: them({ sd: 5 }) }), 'trans');
  assert.equal(roomPhase({ host: false, me: me({ sd: 9 }), other: them() }), 'wait', '來賓自己的 sd 不算');
  assert.equal(roomPhase({ host: true, me: me({ sd: 5, gb: 1 }), other: them() }), 'wait');
  assert.equal(roomPhase({ host: true, me: me({ sd: 5, gb: 1 }), other: them({ gb: 1 }) }), 'go');
  assert.equal(roomPhase({ host: false, me: me({ gb: 1 }), other: them({ sd: 5, gb: 1 }) }), 'wait', '只有房主開始倒數');
  assert.equal(roomPhase({ host: false, me: me({ gb: 1 }), other: them({ st: 'countdown', sd: 5, gb: 1 }) }), 'wait', '房主已在倒數：來賓跟上，不是回到選擇');
  for (const st of ['countdown', 'racing', 'finished']) assert.equal(roomPhase({ host: true, me: me({ st }), other: them() }), 'race');
});

/* ---------- 改選擇取消準備 ---------- */
test('pickSig / cancelReady：車、顏色、任一票改變就取消準備；第一次收到不算改變', () => {
  const s = pickSig({ car: 'coupe', col: 2, vote: VOTE() });
  assert.equal(s, pickSig({ car: 'coupe', col: 2, vote: VOTE() }));
  for (const o of [{ car: 'gtr' }, { col: 1 }, { vote: VOTE({ t: 'hakuro' }) }, { vote: VOTE({ d: 'up' }) }, { vote: VOTE({ m: 'cat' }) }, { vote: VOTE({ g: 60 }) }])
    assert.notEqual(pickSig({ car: 'coupe', col: 2, vote: VOTE(), ...o }), s, JSON.stringify(o));
  assert.equal(cancelReady('ready', s, s), 'ready');
  assert.equal(cancelReady('ready', s, s + 'x'), 'waiting');
  assert.equal(cancelReady('ready', null, s), 'ready', '對手的第一筆狀態');
  assert.equal(cancelReady('waiting', s, s + 'x'), 'waiting');
  for (const st of ['countdown', 'racing', 'finished']) assert.equal(cancelReady(st, s, s + 'x'), st, '比賽中不受影響');
});

/* ---------- 觀戰者換賽道 ---------- */
test('specTrackSwitch：房主開始新一場（倒數／比賽中）且賽道不同時才換', () => {
  assert.equal(specTrackSwitch('kurosagi', { trk: 'seiran', st: 'countdown' }), 'seiran');
  assert.equal(specTrackSwitch('kurosagi', { trk: 'seiran', st: 'racing' }), 'seiran');
  assert.equal(specTrackSwitch('kurosagi', { trk: 'kurosagi', st: 'racing' }), null);
  for (const st of ['waiting', 'ready', 'finished']) assert.equal(specTrackSwitch('kurosagi', { trk: 'seiran', st }), null, st);
  assert.equal(specTrackSwitch('kurosagi', null), null);
});
