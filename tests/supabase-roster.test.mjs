// 第 6 批：名單在場判斷（R2-1）、重新加入的舊車輛資料（R5-1）、結果畫面的對手名字（R5-2）。
// 真正的 makeSupabaseRoom 加假 SDK（同 supabase-impersonation 的 hub）；resNames 用 new Function 載入真正的原始碼。
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
const SRC = `${block('netcode')}\n${block('supa')}\n${block('sign', true)}\n${block('roompick')}\n${cut('const SUPA = {', '\n};')}\n${cut('\nfunction makeSupabaseRoom(', '\n}\n')}\nreturn { makeSupabaseRoom, RP, SUPA };`;

function makeHub() {
  const chans = new Map(), log = [];
  const hub = {
    log,
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
              track(payload) { ch.tracked = payload; sync(name); return Promise.resolve('ok'); },
              presenceState() { const o = {}; for (const c of chans.get(name) || []) if (c.tracked) o[c.key] = [c.tracked]; return o; },
              send(m) { log.push({ key, event: m.event, payload: JSON.parse(JSON.stringify(m.payload)) }); for (const c of chans.get(name) || []) if (c !== ch && c.hs.broadcast[m.event]) setTimeout(() => c.hs.broadcast[m.event]({ payload: JSON.parse(JSON.stringify(m.payload)) }), 0); return Promise.resolve('ok'); },
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
async function boot(hub, liveMs) {
  const g = new Function('window', 'navigator', SRC)({ crypto: webcrypto }, { onLine: true });
  if (liveMs) g.SUPA.LIVE_MS = liveMs;
  const api = g.makeSupabaseRoom(async () => hub.sdk());
  return { room: await api.start(), api, g };
}
// 第三者：不簽章，只用別人的代號當 presence key 登記（只有名單，沒有任何簽章訊息）
function squatter(hub, channelName, id) {
  const client = hub.sdk().createClient(), ch = client.channel(channelName, { config: { presence: { key: id } } });
  ch.subscribe(() => {});
  ch.track({ v: 1, k: 'x' });
  return { ch, stop: () => client.removeChannel(ch) };
}
async function withClients(n, liveMs, fn) {
  const hub = makeHub(), cs = [];
  try { for (let i = 0; i < n; i++) cs.push(await boot(hub, liveMs)); await fn(cs, hub); } finally { for (const c of cs) c.api.close(); }
}
const ROOM = 'pvp-roster1', TOPIC = 'yatouge-room-' + ROOM;
const has = (room, id) => room.peers().some(p => p.peer === id);
const lowOf = (RP, o) => ({ v: RP.V, st: 'waiting', car: 'hatch', col: 0, trk: 'kurosagi', go: 0, nk: 'H', ...o });
async function until(fn, ms) { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await wait(50); } return fn(); }

test('R2-1 第三者用離開玩家的代號登記 presence，主機在離開訊息後看到對方離開', () => withClients(2, 0, async ([host, guest], hub) => {
  const { RP } = host.g;
  const [hr, gr] = [await host.room.join(ROOM), await guest.room.join(ROOM)];
  await hr.presence(lowOf(RP)); await gr.presence(lowOf(RP, { nk: 'G' }));
  await wait(500);
  assert.equal(has(hr, guest.api.peerId), true, '先確認客人在場');
  squatter(hub, TOPIC, guest.api.peerId);
  await wait(100);
  await gr.leave();
  await wait(800);
  assert.equal(has(hr, guest.api.peerId), false, '客人已離開，卻被名單中的假登記留住');
}));

test('R2-1 名單代號超過 LIVE_MS 沒有驗證過的訊息就不在場；剛進名單的有寬限；正常心跳的成員一直在場', () => withClients(3, 1500, async ([host, member, silent], hub) => {
  const { RP } = host.g;
  assert.equal(host.g.SUPA.LIVE_MS, 1500);
  const [hr, mr] = [await host.room.join(ROOM), await member.room.join(ROOM)];
  await hr.presence(lowOf(RP)); await mr.presence(lowOf(RP, { nk: 'M' }));
  squatter(hub, TOPIC, silent.api.peerId); // 從來沒有送過任何訊息
  await wait(400);
  assert.equal(has(hr, silent.api.peerId), true, '寬限內應該照常顯示');
  assert.equal(await until(() => !has(hr, silent.api.peerId), 3500), true, '沒有任何驗證訊息的代號應該在 LIVE_MS 後消失');
  assert.equal(has(hr, member.api.peerId), true, '有心跳的成員必須一直在場');
}));

test('R5-1 客人離開後同一分頁再加入，主機不會再看到上一場的車輛樣本', () => withClients(2, 0, async ([host, guest]) => {
  const { RP } = host.g;
  const hr = await host.room.join(ROOM); await hr.presence(lowOf(RP));
  let gr = await guest.room.join(ROOM);
  await gr.presence(lowOf(RP, { nk: 'G' }));
  await gr.presence({ n: 500, c: { x: 1, z: 2, h: 0, vx: 0, vz: 0, w: 0, s: 0, lat: 0, sr: 0, dr: 0, bk: 0 } });
  await wait(500);
  const seen = () => (hr.peers().find(p => p.peer === guest.api.peerId) || {}).presence;
  assert.equal(seen().n, 500, '先確認舊樣本有送到');
  await gr.leave(); await wait(300);
  gr = await guest.room.join(ROOM);
  await gr.presence(lowOf(RP, { nk: 'G' }));
  await wait(700);
  const now = seen();
  assert.ok(now, '客人再加入後主機看得到他');
  assert.notEqual(now.n, 500, '主機仍保留上一場的車輛樣本');
  assert.ok(!now.c, '舊的車輛位置不該還在');
}));

// R5-2：真正的 resNames
const resSrc = `${cut('const nickOf = ', ';')}\n${cut('function resNames()', '\n}\n')}\nreturn { resNames, set: (p, n) => { pvp = p; nick = n; } };`;
function resNamesEnv() {
  const els = {}, el = s => els[s] || (els[s] = { textContent: '' });
  const T = (k, a) => k === 'pvpPlayer' ? '玩家' : k === 'pvpTimeOf' ? '時間・' + a : k === 'pvpYouTag' ? a + '（你）' : k;
  const g = new Function('$', 'T', 'let pvp = null, nick = "ME";\n' + resSrc)(el, T);
  return { g, els };
}
test('R5-2 對手離開後結果畫面仍顯示對手的暱稱', () => {
  const { g, els } = resNamesEnv();
  g.set({ opp: { nk: 'RIVAL' }, oppNk: 'RIVAL' }, 'ME'); g.resNames();
  assert.match(els['#resOppLbl'].textContent, /RIVAL/);
  g.set({ opp: null, oppNk: 'RIVAL' }, 'ME'); g.resNames();
  assert.match(els['#resOppLbl'].textContent, /RIVAL/, '對手離開後名字變成預設值');
  g.set({ opp: null, oppNk: null }, 'ME'); g.resNames();
  assert.match(els['#resOppLbl'].textContent, /玩家/, '從沒見過對手時用預設名字');
});

test('R2-1 追加：沒有離開訊息的玩家，第三者離開名單再重新登記，不會拿到新的寬限', () => withClients(2, 1500, async ([host, silent], hub) => {
  const hr = await host.room.join(ROOM); await hr.presence(lowOf(host.g.RP));
  const s1 = squatter(hub, TOPIC, silent.api.peerId);
  await wait(300);
  assert.equal(has(hr, silent.api.peerId), true, '寬限內可見');
  assert.equal(await until(() => !has(hr, silent.api.peerId), 3500), true, '寬限過了就隱藏');
  s1.stop(); await wait(300);
  squatter(hub, TOPIC, silent.api.peerId); // 重新登記
  await wait(500);
  assert.equal(has(hr, silent.api.peerId), false, '重新登記不該換到新的寬限');
}));

test('R2-1 追加：已驗證離開訊息之後，更新的訊息讓同一個代號重新可見；舊的重送訊息不行', () => withClients(2, 0, async ([host, guest], hub) => {
  const { RP } = host.g;
  const hr = await host.room.join(ROOM); await hr.presence(lowOf(RP));
  let gr = await guest.room.join(ROOM); await gr.presence(lowOf(RP, { nk: 'G' }));
  await wait(500);
  assert.equal(has(hr, guest.api.peerId), true);
  const old = hub.log.filter(l => l.key === guest.api.peerId && l.event === 'p').pop();
  assert.ok(old, '有抓到客人簽章過的舊訊息');
  const sq = squatter(hub, TOPIC, guest.api.peerId);
  await gr.leave(); await wait(500);
  assert.equal(has(hr, guest.api.peerId), false, '離開後隱藏');
  sq.ch.send({ type: 'broadcast', event: 'p', payload: old.payload }); // 重送舊的簽章訊息
  await wait(500);
  assert.equal(has(hr, guest.api.peerId), false, '重送的舊訊息不該讓他回來');
  gr = await guest.room.join(ROOM); await gr.presence(lowOf(RP, { nk: 'G' }));
  await wait(700);
  assert.equal(has(hr, guest.api.peerId), true, '更新的訊息讓他重新可見');
}));
