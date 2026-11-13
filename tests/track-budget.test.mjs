// Supabase 傳輸層：presence track 每 30 秒最多 5 次（makeTrackBudget）。超量的排隊延後、不丟；非 ok 的結果重試一次。假 SDK，不連真正的 Supabase。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const cut = (from, to) => { const s = html.indexOf(from); assert.ok(s >= 0, from); const e = html.indexOf(to, s); return html.slice(s, e + to.length); };
const SRC = `${block('netcode')}\n${block('supa')}\n${cut('const SUPA = {', '\n};')}\n${cut('\nfunction makeSupabaseRoom(', '\n}\n')}\nreturn { makeSupabaseRoom, makeTrackBudget, NET };`;

// 假 SDK：一個 hub 代表伺服器；每個 channel 以名稱分房，track / presenceState / broadcast 的行為照 supabase-js 的介面
function makeHub() {
  const chans = new Map(), stats = { track: 0, emptyLow: 0 }, flags = { offline: false, results: [] }; // name -> Set<channel>
  const hub = {
    stats, flags, all: [],
    sdk: () => ({
      createClient() {
        const mine = new Set();
        const client = {
          realtime: { isConnected: () => !flags.offline },
          channel(name, cfg) {
            const key = cfg.config.presence.key, hs = { presence: [], broadcast: {} };
            const ch = {
              state: 'joined', tracked: null,
              on(type, filter, cb) { if (type === 'presence') hs.presence.push(cb); else hs.broadcast[filter.event] = cb; return ch; },
              subscribe(cb) { ch.cb = cb; hub.all.push(ch); if (!chans.has(name)) chans.set(name, new Set()); chans.get(name).add(ch); mine.add(ch); setTimeout(() => cb('SUBSCRIBED'), 0); return ch; },
              track(payload) { stats.track++; ch.tracked = payload; sync(name); return Promise.resolve(flags.results.length ? flags.results.shift() : 'ok'); },
              presenceState() { const o = {}; for (const c of chans.get(name) || []) if (c.tracked) o[c.key] = [c.tracked]; return o; },
              send(m) { if (m.event === 'p' && m.payload.low && !Object.keys(m.payload.low).length) stats.emptyLow++; for (const c of chans.get(name) || []) if (c !== ch && c.hs.broadcast[m.event]) setTimeout(() => c.hs.broadcast[m.event]({ payload: JSON.parse(JSON.stringify(m.payload)) }), 0); return Promise.resolve('ok'); },
              key, hs
            };
            return ch;
          },
          removeChannel(ch) { const set = chans.get([...chans].find(([, s]) => s.has(ch))?.[0]); if (set) { set.delete(ch); ch.tracked = null; } return Promise.resolve(); },
          removeAllChannels() { for (const ch of mine) client.removeChannel(ch); }
        };
        return client;
      }
    })
  };
  function sync(name) { for (const c of chans.get(name) || []) for (const f of c.hs.presence) setTimeout(f, 0); }
  return hub;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
async function boot(hub) {
  const g = new Function('window', 'navigator', SRC)({ crypto: webcrypto }, { onLine: true });
  const api = g.makeSupabaseRoom(async () => hub.sdk());
  const room = await api.start();
  return { room, api, g };
}
const hostLobby = (NET, name) => ({ v: NET.V, room: name, track: NET.TRACKS[0], open: 1, hb: 1, nk: 'A' });
const listed = (c, NET) => c.g.lobbyRooms(c.room.peers(), Date.now(), NET.TRACKS, NET.LOBBY_TTL, NET.V);

const mkG = () => new Function('window', 'navigator', SRC)({ crypto: webcrypto }, { onLine: true });
async function boot2(hub, onBusy, budget, retryMs) {
  const g = mkG();
  const api = g.makeSupabaseRoom(async () => hub.sdk(), onBusy, budget, retryMs);
  const room = await api.start();
  return { room, api, g };
}

test('makeTrackBudget.take：前 5 次立即（並記錄）；之後回傳要等的毫秒數，不記錄、不預約', () => {
  let t = 0; const b = mkG().makeTrackBudget(5, 30000, () => t);
  assert.deepEqual([1, 2, 3, 4, 5].map(() => b.take()), [0, 0, 0, 0, 0]);
  assert.equal(b.take(), 30000, '第 6 次要等到第 1 次滿 30 秒');
  t = 1000; assert.equal(b.take(), 29000); assert.equal(b.take(), 29000, '沒有預約：再問一次答案相同');
  t = 30000; assert.deepEqual([1, 2, 3, 4, 5].map(() => b.take()), [0, 0, 0, 0, 0]);
  assert.equal(b.take(), 30000, '第二個視窗也只放 5 次');
  t = 100000; assert.equal(b.take(), 0, '很久之後又是立即');
});

test('makeTrackBudget：計時器遲到、一次全部醒來，實際送出仍不超過每 30 秒 5 次', () => {
  let t = 0; const b = mkG().makeTrackBudget(5, 30000, () => t); const sent = []; let queue = 0;
  for (let step = 0; step < 400; step++) {
    t += (step * 7919) % 9000; // 有時一次跳過好幾個視窗（背景分頁的計時器被壓慢）
    if (step % 3 === 0) { if (b.take() === 0) sent.push(t); else queue++; }
    for (let i = queue; i > 0; i--) if (b.take() === 0) { sent.push(t); queue--; } // 排隊的在醒來時重新確認
  }
  assert.ok(sent.length > 20);
  for (const x of sent) assert.ok(sent.filter(y => y > x - 30000 && y <= x).length <= 5, 'at ' + x);
});

test('正常流程（大廳加一個房間）：track 立即送出，不顯示忙碌', async () => {
  const hub = makeHub(), busy = [];
  const c = await boot2(hub, v => busy.push(v)), r = await c.room.join('pvp-aaa');
  assert.equal(hub.stats.track, 2); assert.deepEqual(busy, []); c.api.close();
});

test('連續開 6 個頻道：視窗內只送 5 次 track，第 6 次延後送出並通知忙碌', async () => {
  const hub = makeHub(), busy = [], g = mkG(); let t = 0;
  const budget = g.makeTrackBudget(5, 2500, () => performance.now());
  const api = g.makeSupabaseRoom(async () => hub.sdk(), v => busy.push(v), budget, 20), room = await api.start();
  try {
    for (let i = 0; i < 5; i++) await room.join('pvp-r' + i); // 加上大廳共 6 次
    assert.equal(hub.stats.track, 5, '延後的那一次還沒送');
    assert.deepEqual(busy, [true]);
    await wait(2700);
    assert.equal(hub.stats.track, 6, '視窗過後補送，沒有丟掉');
    assert.deepEqual(busy, [true, false]);
  } finally { api.close(); }
});

test('track 結果不是 ok 時，約 retryMs 後重試一次（只一次）', async () => {
  const hub = makeHub(), g = mkG(); hub.flags.results = ['error', 'error', 'error'];
  const api = g.makeSupabaseRoom(async () => hub.sdk(), () => {}, g.makeTrackBudget(5, 30000, () => performance.now()), 50);
  try {
    await api.start();
    assert.equal(hub.stats.track, 1);
    await wait(200);
    assert.equal(hub.stats.track, 2, '重試一次');
    await wait(200);
    assert.equal(hub.stats.track, 2, '不會一直重試');
  } finally { api.close(); }
});

test('離開頻道後，排隊中的 track 不再送出', async () => {
  const hub = makeHub(), g = mkG();
  const api = g.makeSupabaseRoom(async () => hub.sdk(), () => {}, g.makeTrackBudget(1, 3000, () => performance.now()), 20), room = await api.start();
  try {
    const r = await room.join('pvp-x'); // 第 2 次：排隊
    await r.leave();
    await wait(2000);
    assert.equal(hub.stats.track, 1);
  } finally { api.close(); }
});

test('排隊中的 track 在計時器醒來時重新確認額度；時鐘還沒到就再排一次，不送', async () => {
  const hub = makeHub(), g = mkG(), clock = { t: 0 };
  const api = g.makeSupabaseRoom(async () => hub.sdk(), () => {}, g.makeTrackBudget(1, 400, () => clock.t), 20), room = await api.start();
  try {
    await room.join('pvp-late'); // 額度 1 次已被大廳用掉：排隊
    await wait(900); // 真實計時器早就醒來過，但額度時鐘沒動
    assert.equal(hub.stats.track, 1, '時鐘沒到就不送');
    clock.t = 400; await wait(500);
    assert.equal(hub.stats.track, 2, '時鐘到了才送');
  } finally { api.close(); }
});

test('頻道重複 SUBSCRIBED（斷線重連抖動）：每個頻道最多一個排隊中的 track，忙碌提示最後會清掉', async () => {
  const hub = makeHub(), g = mkG(), busy = [];
  const api = g.makeSupabaseRoom(async () => hub.sdk(), v => busy.push(v), g.makeTrackBudget(1, 3000, () => performance.now()), 20), room = await api.start();
  try {
    await room.join('pvp-flap');
    const ch = hub.all.at(-1);
    for (let i = 0; i < 5; i++) ch.cb('SUBSCRIBED');
    assert.equal(hub.stats.track, 1);
    await wait(1900);
    assert.equal(hub.stats.track, 2, '五次 SUBSCRIBED 只補一次');
    assert.deepEqual(busy, [true, false]);
  } finally { api.close(); }
});
