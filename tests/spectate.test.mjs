// 觀戰：抽出 yatouge.html 的 @netcode + @spectate（純函式）— 觀戰者角色判斷、參賽邏輯忽略觀戰者、觀戰人數、大廳列出比賽中的公開房間
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const M = new Function(`${block('netcode')}\n${block('spectate')}
return { NET, validatePeerState, chooseOpp, raceSync, lobbyRooms, intake, SPEC, isSpectator, validSpectator, watcherCount, spectatePair, specStandings, specViewKey };`)();
const { validatePeerState, chooseOpp, raceSync, lobbyRooms, intake, SPEC, isSpectator, validSpectator, watcherCount, spectatePair, specStandings, specViewKey } = M;

const BOUNDS = { x0: -100, x1: 100, z0: -500, z1: 100, s1: 4000 };
const C = (o = {}) => ({ x: 10, z: -20, h: 0.5, vx: 3, vz: 20, w: 0.2, s: 100, lat: 1.5, sr: 0.3, dr: 0, bk: 0, ...o });
const S = (o = {}) => ({ v: 1, st: 'racing', car: 'hatch', col: 1, trk: 'kurosagi', go: 1, n: 5, c: C(), ...o });
const SPECT = (o = {}) => ({ v: 1, role: 'spectator', nk: 'Watcher', ...o });
const PEER = (peer, o = {}) => ({ peer, by: null, isMe: false, kind: 'viewer', updatedAt: 1, presence: S(), ...o });
const valid = pres => validatePeerState(pres, BOUNDS);

/* ---------- 角色判斷 ---------- */
test('isSpectator / validSpectator：只有 role 為 spectator 的物件才是觀戰者；有效還要版本正確', () => {
  assert.equal(isSpectator(SPECT()), true);
  assert.equal(validSpectator(SPECT()), true);
  assert.equal(validSpectator(SPECT({ nk: undefined })), true, '沒有暱稱也算有效觀戰者');
  for (const bad of [null, undefined, 5, 'spectator', [], [SPECT()], S(), { role: 'Spectator', v: 1 }, { role: 'racer', v: 1 }])
    assert.equal(isSpectator(bad), false, JSON.stringify(bad));
  for (const bad of [SPECT({ v: 2 }), SPECT({ v: '1' }), { role: 'spectator' }]) {
    assert.equal(isSpectator(bad), true); assert.equal(validSpectator(bad), false, JSON.stringify(bad));
  }
});

/* ---------- 觀戰者送來的車子或比賽狀態一律忽略 ---------- */
test('validatePeerState：帶 role（觀戰者）的狀態整筆丟棄，即使車子與比賽欄位都合法', () => {
  assert.ok(valid(S()), '對照組：一般參賽者的狀態有效');
  assert.equal(valid({ ...S(), role: 'spectator' }), null);
  assert.equal(valid({ ...S({ st: 'finished', ft: 12.3 }), role: 'spectator' }), null);
  assert.equal(valid({ ...S(), role: 'racer' }), null, '未知的 role 也不接受');
});

test('intake：觀戰者的狀態驗證失敗，不會進到樣本緩衝', () => {
  const v = valid({ ...S(), role: 'spectator' });
  assert.equal(v, null);
  const buf = [{ at: 0, n: 1, ...C() }];
  // 執行端只在 validatePeerState 通過後才呼叫 intake；這裡確認合法狀態才會推進
  assert.equal(intake(buf, valid(S({ n: 9 })), 10).buf.length, 2);
});

/* ---------- chooseOpp / raceSync 忽略觀戰者、不計入 2 人上限 ---------- */
test('chooseOpp：房主等待時，觀戰者（peer 字典序最小）不會被選成對手', () => {
  const peers = [PEER('me', { isMe: true }), PEER('aaa', { presence: SPECT() }), PEER('zzz')];
  const base = { host: true, hostPeer: null, oppPeer: null, st: 'waiting', peers, valid };
  assert.equal(chooseOpp(base).peer, 'zzz');
  assert.equal(chooseOpp({ ...base, peers: [PEER('me', { isMe: true }), PEER('aaa', { presence: SPECT() })] }), null, '只有觀戰者 = 沒有對手');
  // 觀戰者把車子欄位也塞進來，仍然不是對手
  assert.equal(chooseOpp({ ...base, peers: [PEER('aaa', { presence: { ...S(), role: 'spectator' } })] }), null);
});

test('chooseOpp：已鎖定的對手若改報觀戰者就不再是對手；房客不會把觀戰者當房主', () => {
  const peers = [PEER('me', { isMe: true }), PEER('opp', { presence: SPECT() })];
  assert.equal(chooseOpp({ host: true, hostPeer: null, oppPeer: 'opp', st: 'racing', peers, valid }), null);
  assert.equal(chooseOpp({ host: false, hostPeer: 'opp', oppPeer: null, st: 'waiting', peers, valid }), null);
});

test('chooseOpp：比賽中有觀戰者加入，已鎖定的對手不變（第三人不能接管）', () => {
  const peers = [PEER('me', { isMe: true }), PEER('aaa', { presence: SPECT() }), PEER('bbb', { presence: S() }), PEER('opp')];
  assert.equal(chooseOpp({ host: true, hostPeer: null, oppPeer: 'opp', st: 'racing', peers, valid }).peer, 'opp');
});

test('raceSync：觀戰者的 ready / countdown / go 不會讓比賽開始', () => {
  const spec = valid({ ...S({ st: 'ready' }), role: 'spectator' });
  const r = raceSync({ st: 'ready', host: true, go: 0 }, spec);
  assert.equal(r.start, false); assert.equal(r.go, 0);
  const g = raceSync({ st: 'ready', host: false, go: 0 }, valid({ ...S({ st: 'countdown', go: 99 }), role: 'spectator' }));
  assert.equal(g.start, false); assert.equal(g.go, 0);
});

/* ---------- 觀戰人數：只算有效觀戰者，上限 99 ---------- */
test('watcherCount：只算有效的觀戰者 viewer；參賽者、agent、壞 peer、重複 peer、排除名單都不算', () => {
  const peers = [
    PEER('me', { isMe: true }), PEER('opp'),
    PEER('w1', { presence: SPECT() }), PEER('w2', { presence: SPECT({ nk: undefined }) }), PEER('w2', { presence: SPECT() }),
    PEER('bad1', { presence: SPECT({ v: 2 }) }), PEER('bad2', { kind: 'agent', presence: SPECT() }), PEER('', { presence: SPECT() }),
    PEER(5, { presence: SPECT() }), PEER('bad3', { presence: { role: 'spectator' } }), null, 7
  ];
  assert.equal(watcherCount(peers), 2);
  assert.equal(watcherCount(peers, ['w1']), 1);
  assert.equal(watcherCount(null), 0);
});

test('watcherCount：顯示上限 99', () => {
  assert.equal(SPEC.MAX_WATCH, 99);
  const many = Array.from({ length: 150 }, (_, i) => PEER('w' + i, { presence: SPECT() }));
  assert.equal(watcherCount(many), 99);
  assert.equal(watcherCount(many.slice(0, 99)), 99);
  assert.equal(watcherCount(many.slice(0, 98)), 98);
});

/* ---------- 觀戰者找出兩台車：A = 房主，B = 房主狀態裡的 opp ---------- */
test('spectatePair：A 是房主，B 是房主宣告的對手；其他人與觀戰者不會被當成車子', () => {
  const peers = [
    PEER('me', { isMe: true, presence: SPECT() }),
    PEER('host', { presence: S({ opp: 'guest' }) }),
    PEER('guest', { presence: S({ opp: 'host', car: 'gtr' }) }),
    PEER('intruder', { presence: S({ opp: 'host' }) }),
    PEER('w1', { presence: SPECT() })
  ];
  const r = spectatePair({ hostPeer: 'host', peers, valid });
  assert.equal(r.a.peer, 'host'); assert.equal(r.b.peer, 'guest'); assert.equal(r.b.v.car, 'gtr');
});

test('spectatePair：房主沒有對手、房主不在、房主狀態無效、房主報觀戰者 → 對應的車是 null', () => {
  const host = o => PEER('host', { presence: S(o) });
  assert.equal(spectatePair({ hostPeer: 'host', peers: [host({ opp: null })], valid }).b, null);
  assert.equal(spectatePair({ hostPeer: 'host', peers: [host({ opp: 'gone' })], valid }).b, null);
  assert.deepEqual(spectatePair({ hostPeer: 'host', peers: [], valid }), { a: null, b: null });
  assert.deepEqual(spectatePair({ hostPeer: 'host', peers: [host({ st: 'hax' })], valid }), { a: null, b: null });
  assert.deepEqual(spectatePair({ hostPeer: 'host', peers: [PEER('host', { presence: { ...S(), role: 'spectator' } })], valid }), { a: null, b: null });
  // 房主宣告的對手其實是觀戰者：不當成 B
  const r = spectatePair({ hostPeer: 'host', peers: [host({ opp: 'w1' }), PEER('w1', { presence: { ...S(), role: 'spectator' } })], valid });
  assert.equal(r.a.peer, 'host'); assert.equal(r.b, null);
  // 自己（isMe）不會被當成車子
  assert.deepEqual(spectatePair({ hostPeer: 'host', peers: [PEER('host', { isMe: true })], valid }), { a: null, b: null });
});

/* ---------- 名次與差距 ---------- */
test('specStandings：比賽中依距離排名次、差距取整數公尺；完賽的人排前面', () => {
  assert.deepEqual(specStandings({ s: 500, ft: null }, { s: 520.4, ft: null }), { lead: 'b', gap: 20 });
  assert.deepEqual(specStandings({ s: 800, ft: null }, { s: 120, ft: null }), { lead: 'a', gap: 680 });
  assert.deepEqual(specStandings({ s: 3000, ft: null }, { s: 4000, ft: 91.2 }), { lead: 'b', gap: null });
  assert.deepEqual(specStandings({ s: 4000, ft: 90.1 }, { s: 4000, ft: 91.2 }), { lead: 'a', gap: null });
  assert.deepEqual(specStandings({ s: 4000, ft: 92 }, { s: 4000, ft: 91.2 }), { lead: 'b', gap: null });
  assert.deepEqual(specStandings({ s: 10, ft: null }, null), { lead: 'a', gap: null });
  assert.deepEqual(specStandings(null, { s: 10, ft: null }), { lead: 'b', gap: null });
  assert.deepEqual(specStandings(null, null), { lead: null, gap: null });
});

/* ---------- 鏡頭快捷鍵 ---------- */
test('specViewKey：1 / 2 / 3（主鍵盤與數字鍵盤）對應跟 A、跟 B、全景；其他鍵為 null', () => {
  assert.equal(specViewKey('Digit1'), 'a'); assert.equal(specViewKey('Numpad1'), 'a');
  assert.equal(specViewKey('Digit2'), 'b'); assert.equal(specViewKey('Numpad2'), 'b');
  assert.equal(specViewKey('Digit3'), 'top'); assert.equal(specViewKey('Numpad3'), 'top');
  for (const k of ['Digit4', 'KeyA', '', undefined, null]) assert.equal(specViewKey(k), null);
});

/* ---------- 大廳：比賽中的公開房間列出「觀戰」，私人房間不列出 ---------- */
const NOW = 100000;
const host = (room, o = {}, l = {}) => ({ peer: 'h-' + room, by: null, isMe: false, kind: 'viewer', updatedAt: NOW - 1000, presence: { lobby: { v: 1, room, track: 'kurosagi', open: 1, hb: 1, ...l } }, ...o });
const guest = (peer, room) => ({ peer, by: null, isMe: false, kind: 'viewer', updatedAt: NOW, presence: { lobby: { v: 1, in: room } } });
const watcher = (peer, room, o = {}) => ({ peer, by: null, isMe: false, kind: 'viewer', updatedAt: NOW, presence: { lobby: { v: 1, watch: room } }, ...o });
const LIVE = { open: 0, race: 1 };

test('lobbyRooms：比賽中（open 0 + race 1）的公開房間列出為 live，就算已有 2 人', () => {
  const r = lobbyRooms([host('pvp-aaaaaa', {}, LIVE), guest('g1', 'pvp-aaaaaa'), host('pvp-bbbbbb')], NOW);
  assert.deepEqual(r.map(x => [x.room, x.live, x.count]), [['pvp-aaaaaa', true, 2], ['pvp-bbbbbb', false, 1]]);
});

test('lobbyRooms：open 0 但沒有 race 1（舊版或已滿等待中）仍不列出；race 不是 1 也不算', () => {
  assert.equal(lobbyRooms([host('pvp-aaaaaa', {}, { open: 0 })], NOW).length, 0);
  for (const race of [true, '1', 2, 0]) assert.equal(lobbyRooms([host('pvp-aaaaaa', {}, { open: 0, race })], NOW).length, 0, String(race));
});

test('lobbyRooms：觀戰人數只算 watch 指向該房的不同 peer，排除房主與參賽者，上限 99', () => {
  const r = lobbyRooms([
    host('pvp-aaaaaa', {}, LIVE), guest('g1', 'pvp-aaaaaa'),
    watcher('w1', 'pvp-aaaaaa'), watcher('w1', 'pvp-aaaaaa'), watcher('w2', 'pvp-aaaaaa'), watcher('w3', 'pvp-zzzzzz'),
    watcher('h-pvp-aaaaaa', 'pvp-aaaaaa'), watcher('w4', 'pvp-aaaaaa', { kind: 'agent' }), watcher('w5', 'pvp-aaaaaa', { presence: { lobby: { v: 2, watch: 'pvp-aaaaaa' } } })
  ], NOW);
  assert.equal(r.length, 1); assert.equal(r[0].watchers, 2);
  const many = [host('pvp-aaaaaa', {}, LIVE), ...Array.from({ length: 140 }, (_, i) => watcher('w' + i, 'pvp-aaaaaa'))];
  assert.equal(lobbyRooms(many, NOW)[0].watchers, 99);
});

test('lobbyRooms：觀戰者不計入 2 人上限（開放中的房間有觀戰者仍可加入）', () => {
  const r = lobbyRooms([host('pvp-aaaaaa'), watcher('w1', 'pvp-aaaaaa'), watcher('w2', 'pvp-aaaaaa')], NOW);
  assert.equal(r.length, 1); assert.equal(r[0].live, false); assert.equal(r[0].count, 1);
});

test('lobbyRooms：私人房間（pvt-xxxx）就算宣告比賽中也不列出，watch 指向私人房間也不算', () => {
  assert.equal(lobbyRooms([host('pvt-abcd', {}, LIVE)], NOW).length, 0);
  assert.equal(lobbyRooms([host('pvt-abcd')], NOW).length, 0);
  const r = lobbyRooms([host('pvp-aaaaaa', {}, LIVE), watcher('w1', 'pvt-abcd')], NOW);
  assert.equal(r[0].watchers, 0);
});
