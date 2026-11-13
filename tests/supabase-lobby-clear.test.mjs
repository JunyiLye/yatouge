// Supabase 傳輸層：清掉大廳狀態（{ lobby: null }）必須廣播出去。用遊戲本身的 makeSupabaseRoom + 假的 SDK（同一個 hub 連多個用戶端），不連真正的 Supabase。
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
const SRC = `${block('netcode')}\n${block('supa')}\n${block('sign')}\n${cut('const SUPA = {', '\n};')}\n${cut('\nfunction makeSupabaseRoom(', '\n}\n')}\nreturn { makeSupabaseRoom, lobbyRooms, NET };`;

// 假 SDK：一個 hub 代表伺服器；每個 channel 以名稱分房，track / presenceState / broadcast 的行為照 supabase-js 的介面
function makeHub() {
  const chans = new Map(), stats = { track: 0, emptyLow: 0 }, flags = { offline: false }; // name -> Set<channel>
  const hub = {
    stats, flags,
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
              subscribe(cb) { if (!chans.has(name)) chans.set(name, new Set()); chans.get(name).add(ch); mine.add(ch); setTimeout(() => cb('SUBSCRIBED'), 0); return ch; },
              track(payload) { stats.track++; ch.tracked = payload; sync(name); return Promise.resolve('ok'); },
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

// 失敗時也要關掉所有用戶端（心跳計時器會讓 node 不結束）
async function withClients(n, fn, hub = makeHub()) {
  const cs = []; try { for (let i = 0; i < n; i++) cs.push(await boot(hub)); await fn(cs, cs[0].g.NET, hub); } finally { for (const c of cs) c.api.close(); }
}
test('客人清掉自己的大廳狀態後，旁觀者馬上又看得到主機的房間', () => withClients(3, async ([A, B, C], NET) => {
  await A.room.presence({ lobby: hostLobby(NET, 'pvp-abc123') });
  await wait(450);
  assert.equal(listed(C, NET).length, 1, '主機的房間先出現在列表');
  await B.room.presence({ lobby: { v: NET.V, in: 'pvp-abc123' } });
  await wait(450);
  assert.equal(listed(C, NET).length, 0, '客人進去後房間已滿');
  await B.room.presence({ lobby: null });
  await wait(450);
  const r = listed(C, NET);
  assert.equal(r.length, 1, '客人離開後房間要重新出現');
  assert.equal(r[0].count, 1);
}));
test('主機清掉房間廣告後，旁觀者的列表馬上沒有這個房間（不用等 15 秒逾時）', () => withClients(2, async ([A, C], NET) => {
  await A.room.presence({ lobby: hostLobby(NET, 'pvp-abc123') });
  await wait(450);
  assert.equal(listed(C, NET).length, 1);
  await A.room.presence({ lobby: null });
  await wait(450);
  assert.equal(listed(C, NET).length, 0);
}));
test('清除只多送幾次廣播（不增加 presence track）；清完後不會一直送空的 low', () => withClients(2, async ([A, C], NET, hub) => {
  const before = hub.stats.track;
  await A.room.presence({ lobby: hostLobby(NET, 'pvp-abc123') });
  await A.room.presence({ lobby: null });
  await wait(3500);
  assert.equal(hub.stats.track, before, '之後沒有任何 track 呼叫');
  assert.ok(hub.stats.emptyLow >= 1 && hub.stats.emptyLow <= 4, `空 low 廣播次數 ${hub.stats.emptyLow}`);
}));
test('離線時做的清除不會被吃掉：重新連線後旁觀者仍收到', () => withClients(2, async ([A, C], NET, hub) => {
  await A.room.presence({ lobby: hostLobby(NET, 'pvp-abc123') });
  await wait(450);
  assert.equal(listed(C, NET).length, 1);
  hub.flags.offline = true;
  await A.room.presence({ lobby: null });
  await wait(1600); // 離線期間心跳來過一次以上，次數不能被耗掉
  assert.equal(listed(C, NET).length, 1, '離線時送不出去');
  hub.flags.offline = false;
  await wait(1600);
  assert.equal(listed(C, NET).length, 0, '重新連線後清除要送出');
}));
