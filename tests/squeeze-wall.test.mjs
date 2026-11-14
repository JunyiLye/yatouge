// 被夾在對手車與牆之間：車對車推開後，同一步內要把車拉回牆內，且不給撞牆懲罰
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const g = () => new Function(`${block('course-geometry')}\n${block('collision')}\n${block('netcode')}\nreturn { HW, CAR_BOX, COLL, wallContact, wallStep, wallSettle: typeof wallSettle === 'function' ? wallSettle : undefined, squeezeGate: typeof squeezeGate === 'function' ? squeezeGate : undefined, carStep, remoteAsRival, pushOut };`)();

// 直路：前進 +z、lat = -x；牆面在 HW + 0.3
const road = (x, z) => ({ lat: -x, rx: -1, rz: 0, h: 0 });
const WALL = () => g().HW + 0.3;

// 玩家平行貼牆（車身邊緣剛好碰到牆面），對手從內側重疊 0.5 m，線上做法：整段推給玩家
function squeezed(G) {
  const hw = G.CAR_BOX.hatch.hw, lat = WALL() - hw + 0.02;
  const me = { x: -lat, z: 0, h: 0, vx: 0, vz: 20, w: 0 };
  const opp = { x: -(lat - 2 * hw + 0.5), z: 0, h: 0, vx: 0, vz: 20, s: 0, lat: lat - 2 * hw + 0.5 };
  return { me, opp };
}

test('修正前的問題：車對車推完，玩家的車身在牆外（下一步 wallStep 會拉回並判撞牆）', () => {
  const G = g(), { me, opp } = squeezed(G);
  const cr = G.carStep(me, G.CAR_BOX.hatch, G.remoteAsRival(opp), G.CAR_BOX.coupe, 4, G.COLL);
  assert.ok(cr, '前提：兩車重疊');
  const pushed = { ...me, ...G.pushOut(me, cr), vx: cr.vx, vz: cr.vz, w: cr.w };
  assert.ok(G.wallContact(pushed, G.CAR_BOX.hatch, road, WALL()), '推完後車身越過牆面');
});

test('wallSettle：車對車推完後同一步內回到牆內，且再檢查一次不再接觸', () => {
  const G = g(), { me, opp } = squeezed(G);
  assert.equal(typeof G.wallSettle, 'function');
  const cr = G.carStep(me, G.CAR_BOX.hatch, G.remoteAsRival(opp), G.CAR_BOX.coupe, 4, G.COLL);
  const pushed = { ...me, ...G.pushOut(me, cr), vx: cr.vx, vz: cr.vz, w: cr.w };
  const fixed = G.wallSettle(pushed, G.CAR_BOX.hatch, road, WALL(), G.COLL);
  assert.ok(fixed, '有被修正');
  assert.deepEqual(Object.keys(fixed).sort(), ['vx', 'vz', 'w', 'x', 'z'], '只回傳位置與速度，沒有懲罰、提示、撞擊速度');
  assert.equal(G.wallContact({ ...pushed, ...fixed }, G.CAR_BOX.hatch, road, WALL()), null, '修正後在牆內');
});

test('wallSettle 不產生懲罰：即使被推得很快朝牆，也只修位置速度', () => {
  const G = g(), { me } = squeezed(G);
  const fast = { ...me, x: me.x - 0.3, vx: -8 }; // 往牆（-x）方向 8 m/s 且已越牆
  const ws = G.wallSettle(fast, G.CAR_BOX.hatch, road, WALL(), G.COLL);
  const own = G.wallStep(fast, G.CAR_BOX.hatch, road, WALL(), 0, G.COLL);
  assert.ok(own.penalty > 0, '前提：自己撞同樣的牆會有懲罰');
  assert.equal(ws.penalty, undefined);
  assert.equal(ws.x, own.x); assert.equal(ws.vx, own.vx); assert.equal(ws.w, own.w);
  assert.equal(G.wallSettle({ ...me, x: -3 }, G.CAR_BOX.hatch, road, WALL(), G.COLL), null, '沒碰牆則不動');
});

test('自己撞牆的懲罰與手感不變：wallStep 仍給懲罰、提示與撞擊速度', () => {
  const G = g(), { me } = squeezed(G);
  const r = G.wallStep({ ...me, x: me.x - 0.2, vx: -8 }, G.CAR_BOX.hatch, road, WALL(), 0, G.COLL);
  assert.ok(r.penalty > 0 && r.pop > 0 && r.hitSpeed > 0);
});

test('physics 與 pvpBump 在車對車推開之後都呼叫 pushedWallFix（內用 wallSettle）', () => {
  const ph = html.slice(html.indexOf('\nfunction physics('), html.indexOf('\nlet lastHit'));
  assert.ok(/Object\.assign\(rival, \{ s: cr\.s[^\n]*\n[^\n]*impactFx\(cr\.hitSpeed\);\n\s*pushedWallFix\(c\);/.test(ph));
  const pb = html.slice(html.indexOf('\nfunction pvpBump('), html.indexOf('\nfunction placeOpp('));
  assert.ok(/pushOut\(c, cr\)[^\n]*\n[^\n]*impactFx\(cr\.hitSpeed\);\n\s*pushedWallFix\(c\);/.test(pb));
  assert.ok(/function pushedWallFix\(c\) \{[\s\S]*?wallSettle\(c, CAR_BOX\[choice\.car\][\s\S]*?WALL_LAT/.test(html));
});

test('車對車只給回饋（impactFx），不重置連續甩尾也不跳撞牆提示；撞牆仍用 wallHit', () => {
  const fx = html.slice(html.indexOf('function impactFx('), html.indexOf('function wallHit('));
  assert.ok(fx.includes('shake') && fx.includes('sfxHit') && fx.includes('gpRumble'));
  assert.ok(!/driftChain|showPop/.test(fx), 'impactFx 不碰連續甩尾與提示');
  const wh = html.slice(html.indexOf('function wallHit('), html.indexOf('/* ---------- rival AI'));
  assert.ok(wh.includes('impactFx(v)') && wh.includes('driftChain = 0') && wh.includes("showPop(T('wall')"));
  const ph = html.slice(html.indexOf('\nfunction physics('), html.indexOf('\nlet lastHit'));
  assert.ok(ph.includes('if (wr.hitSpeed) wallHit(wr.hitSpeed);'), '自己撞牆不變');
  assert.ok(!/cr\.hitSpeed\) wallHit/.test(html), '車對車不再呼叫 wallHit');
});

// 與 physics 同順序的一步：自己的牆（含 squeeze 寬限）→ 車對車（線上：整段推給玩家）→ 推開後的牆修正
function sim(G, frameAt, me, oppAt, steps, wallLat, squeezeT = 0, dt = 1 / 120) {
  let penalty = 0, pops = 0, hits = 0, hitSteps = 0;
  const box = G.CAR_BOX.hatch;
  for (let n = 0; n < steps; n++) {
    me.x += me.vx * dt; me.z += me.vz * dt; me.h += me.w * dt;
    const wr = G.squeezeGate(G.wallStep(me, box, frameAt, wallLat, penalty, G.COLL), squeezeT, penalty);
    if (wr) { Object.assign(me, { x: wr.x, z: wr.z, vx: wr.vx, vz: wr.vz, w: wr.w }); penalty = wr.penalty; if (wr.pop) pops++; if (wr.hitSpeed) hits++; }
    const cr = G.carStep(me, box, G.remoteAsRival(oppAt(n)), G.CAR_BOX.coupe, 4, G.COLL);
    if (cr) {
      Object.assign(me, G.pushOut(me, cr), { vx: cr.vx, vz: cr.vz, w: cr.w });
      const ws = G.wallSettle(me, box, frameAt, wallLat, G.COLL);
      if (ws) { Object.assign(me, ws); squeezeT = 0.5; }
    }
    if (penalty > 0) penalty -= dt;
    if (squeezeT > 0) squeezeT -= dt;
  }
  return { me, pops, hits, penalty };
}
const pressed = (G, press, frameAt, mkPose) => {
  const hw = G.CAR_BOX.hatch.hw, lat = WALL() - hw + 0.02, ol = lat - 2 * hw + 0.3;
  const me = { x: -lat, z: 0, h: 0.12, vx: 0, vz: 20, w: 0 };
  return sim(G, frameAt, me, n => mkPose(ol, press, n), 240, WALL());
};
const straightPose = (ol, press, n) => ({ x: -(ol - press * n / 120), z: 20 * n / 120, h: 0, vx: -press, vz: 20, s: 0, lat: 0 });

test('持續被擠（對手以 12 m/s 往牆壓）240 步：不吃懲罰、不跳提示、不算撞擊，車始終在牆內', () => {
  const G = g(), r = pressed(G, 12, road, straightPose);
  assert.equal(r.pops, 0); assert.equal(r.hits, 0); assert.equal(r.penalty, 0);
  assert.equal(G.wallContact(r.me, G.CAR_BOX.hatch, road, WALL() + 0.001), null);
  assert.ok(Math.abs(r.me.w) < 3.5, '偏航角速度沒有頂到上限');
});

test('持續被擠：彎道上同樣不吃懲罰（道路座標有旋轉）', () => {
  const G = g(), a = 0.3, ca = Math.cos(a), sa = Math.sin(a);
  // 道路前進 (sin a, cos a)，右 (-cos a, sin a)；lat = 世界座標在右向量上的投影
  const curved = (x, z) => ({ lat: -x * ca + z * sa, rx: -ca, rz: sa, h: a });
  const hw = G.CAR_BOX.hatch.hw, lat = WALL() - hw + 0.02, ol = lat - 2 * hw + 0.3;
  const place = (l, s) => ({ x: -ca * l + sa * s, z: sa * l + ca * s });
  const p0 = place(lat, 0);
  const me = { ...p0, h: a + 0.12, vx: 20 * sa, vz: 20 * ca, w: 0 };
  const pose = n => { const q = place(ol - 12 * n / 120, 20 * n / 120); return { ...q, h: a, vx: 20 * sa - 12 * ca, vz: 20 * ca + 12 * sa, s: 0, lat: 0 }; };
  const r = sim(G, curved, me, pose, 240, WALL());
  assert.equal(r.pops, 0); assert.equal(r.hits, 0); assert.equal(r.penalty, 0);
});

test('squeezeGate：寬限內只剩位置速度修正；寬限過了自己撞牆照樣懲罰', () => {
  const G = g(), { me } = squeezed(G), c = { ...me, x: me.x - 0.2, vx: -8 };
  const raw = G.wallStep(c, G.CAR_BOX.hatch, road, WALL(), 0, G.COLL);
  const g1 = G.squeezeGate(raw, 0.3, 0);
  assert.deepEqual([g1.penalty, g1.pop, g1.hitSpeed], [0, 0, 0]);
  assert.equal(g1.x, raw.x); assert.equal(g1.vx, raw.vx);
  assert.deepEqual(G.squeezeGate(raw, 0, 0), raw);
  assert.equal(G.squeezeGate(null, 0.3, 0), null);
  assert.ok(G.wallStep(c, G.CAR_BOX.hatch, road, WALL(), 0, G.COLL).penalty > 0);
});

test('physics 接線：squeezeGate、squeezeT 遞減、重置、settle 後 railAgo = 0', () => {
  assert.ok(html.includes('squeezeGate(wallStep(c, CAR_BOX[choice.car]'));
  assert.ok(html.includes('if (c.squeezeT > 0) c.squeezeT -= dt;'));
  assert.ok(html.includes('Object.assign(c, ws, { railAgo: 0, squeezeT: 0.5 })'));
  assert.equal(html.split('squeezeT: 0,').length - 1, 2, 'resetRace 與 resetCar 都歸零');
});

test('自己撞牆：寬限內不懲罰，寬限過後（squeezeT 歸零）照樣懲罰', () => {
  const G = g(), { me } = squeezed(G), far = () => ({ x: 50, z: 0, h: 0, vx: 0, vz: 0, s: 0, lat: 0 });
  const hit = () => ({ ...me, x: me.x - 0.2, vx: -8 });
  assert.equal(sim(G, road, hit(), far, 1, WALL(), 0.3).penalty, 0);
  const r = sim(G, road, hit(), far, 1, WALL(), 0);
  assert.ok(r.penalty > 0 && r.pops > 0 && r.hits > 0);
});
