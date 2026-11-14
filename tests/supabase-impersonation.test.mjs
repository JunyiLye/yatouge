// B2 冒充攻擊：用遊戲本身的 makeSupabaseRoom 加假 SDK（同一個 hub），第三個用戶端偽造別人的代號送出狀態。
// 修正前（房間協定 v2，代號由發送者自己寫）：偽造的完賽、偽造的「已進房」都會被採用；修正後（v3，簽章）一律被丟掉。不連真正的 Supabase。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name, optional) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  if (optional && s < 0) return '';
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const cut = (from, to) => { const s = html.indexOf(from); assert.ok(s >= 0, from); const e = html.indexOf(to, s); return html.slice(s, e + to.length); };
const SRC = `${block('netcode')}\n${block('supa')}\n${block('sign', true)}\n${block('roompick')}\n${cut('const SUPA = {', '\n};')}\n${cut('\nfunction makeSupabaseRoom(', '\n}\n')}\nreturn { makeSupabaseRoom, lobbyRooms, NET, RP };`;

function makeHub() {
  const chans = new Map(), stats = { track: 0 }, log = [];
  const hub = {
    stats, log,
    sdk: () => ({
      createClient() {
        const mine = new Set();
        const client = {
          realtime: { isConnected: () => true },
          channel(name, cfg) {
            const key = cfg.config.presence.key, hs = { presence: [], broadcast: {} };
            const ch = {
              state: 'joined', tracked: null,
              on(type, filter, cb) { if (type === 'presence') hs.presence.push(cb); else hs.broadcast[filter.event] = cb; return ch; },
              subscribe(cb) { if (!chans.has(name)) chans.set(name, new Set()); chans.get(name).add(ch); mine.add(ch); setTimeout(() => cb('SUBSCRIBED'), 0); return ch; },
              track(payload) { stats.track++; ch.tracked = payload; sync(name); return Promise.resolve('ok'); },
              presenceState() { const o = {}; for (const c of chans.get(name) || []) if (c.tracked) o[c.key] = [c.tracked]; return o; },
              send(m) { log.push({ name, event: m.event, payload: m.payload }); for (const c of chans.get(name) || []) if (c !== ch && c.hs.broadcast[m.event]) setTimeout(() => c.hs.broadcast[m.event]({ payload: JSON.parse(JSON.stringify(m.payload)) }), 0); return Promise.resolve('ok'); },
              key, hs
            };
            return ch;
          },
          removeChannel(ch) { const set = chans.get([...chans].find(([, s]) => s.has(ch))?.[0]); if (set) { set.delete(ch); ch.tracked = null; for (const [n, x] of chans) if (x === set) sync(n); } return Promise.resolve(); },
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
// 攻擊者：不用遊戲程式，直接用 SDK 加入頻道，把任意 payload 當成別人送出（等同惡意用戶端）
function attacker(hub, channelName) {
  const ch = hub.sdk().createClient().channel(channelName, { config: { presence: { key: 'attacker-key' } } });
  ch.subscribe(() => {});
  return { forge: (event, payload) => ch.send({ type: 'broadcast', event, payload }) };
}
const ROOM = 'pvp-abc123';
const st = (c, id) => (c.room.peers().find(p => p.peer === id) || {}).presence;
async function withClients(n, fn) {
  const hub = makeHub(), cs = [];
  try { for (let i = 0; i < n; i++) cs.push(await boot(hub)); await fn(cs, hub); } finally { for (const c of cs) c.api.close(); }
}
const lowOf = (RP, o) => ({ v: RP.V, st: 'waiting', car: 'hatch', col: 0, trk: 'kurosagi', go: 0, nk: 'H', ...o });

test('B2 冒充房間狀態：第三者用主機的代號送出完賽 ft:0.001，客人看到的主機仍是真實狀態', () => withClients(2, async ([host, guest], hub) => {
  const { RP } = host.g;
  const [hr, gr] = [await host.room.join(ROOM), await guest.room.join(ROOM)];
  await hr.presence(lowOf(RP, { st: 'waiting', nk: 'H' }));
  await wait(600);
  assert.equal(st({ room: gr }, host.api.peerId).st, 'waiting', '先確認正常流程：客人看得到主機的狀態');
  const evil = attacker(hub, 'yatouge-room-' + ROOM);
  evil.forge('p', { p: host.api.peerId, low: lowOf(RP, { st: 'finished', ft: 0.001, nk: 'H' }) });
  evil.forge('c', { p: host.api.peerId, n: 99999, c: { x: 1, z: 2, h: 0, vx: 0, vz: 0, w: 0, s: 0, lat: 0, sr: 0, dr: 0, bk: 0 } });
  await wait(300); // 比主機下一次心跳（1 秒）早：偽造的內容若被採用，現在就看得到
  const seen = st({ room: gr }, host.api.peerId);
  assert.equal(seen.st, 'waiting', '偽造的完賽被採用了');
  assert.equal(seen.ft, undefined);
  assert.notEqual(seen.n, 99999, '偽造的車輛位置被採用了');
}));
test('B2 冒充大廳：第三者以客人的代號廣告「已進房」，旁觀者的列表仍看得到主機的房間', () => withClients(3, async ([host, guest, watcher], hub) => {
  const { RP, NET } = host.g;
  await host.room.presence({ lobby: { v: RP.V, room: ROOM, track: NET.TRACKS[0], open: 1, hb: 1, nk: 'H' } });
  await wait(450);
  const rooms = () => watcher.g.lobbyRooms(watcher.room.peers(), Date.now(), NET.TRACKS, NET.LOBBY_TTL, RP.V);
  assert.equal(rooms().length, 1, '先確認房間出現在列表');
  attacker(hub, 'yatouge-lobby').forge('p', { p: guest.api.peerId, low: { lobby: { v: RP.V, in: ROOM } } });
  await wait(450);
  assert.equal(rooms().length, 1, '偽造的「已進房」讓房間被藏起來了');
}));
test('B2 正常流程在簽章後仍然可用：兩位玩家互相看到房間狀態、車輛位置、離開', () => withClients(2, async ([A, B]) => {
  const { RP } = A.g;
  const [ar, br] = [await A.room.join(ROOM), await B.room.join(ROOM)];
  await ar.presence(lowOf(RP, { nk: 'A' })); await br.presence(lowOf(RP, { nk: 'B', st: 'racing' }));
  await ar.presence({ n: 7, c: { x: 1.5, z: -2, h: 0.3, vx: 0, vz: 0, w: 0, s: 0, lat: 0, sr: 0, dr: 0, bk: 0 } });
  await wait(700);
  assert.equal(st({ room: br }, A.api.peerId).nk, 'A');
  assert.equal(st({ room: ar }, B.api.peerId).st, 'racing');
  assert.equal(st({ room: br }, A.api.peerId).n, 7);
  assert.equal(st({ room: br }, A.api.peerId).c.x, 1.5);
  await ar.leave(); await wait(200);
  assert.equal(br.peers().some(p => p.peer === A.api.peerId), false, '離開後對方的名單裡沒有他了');
}));
