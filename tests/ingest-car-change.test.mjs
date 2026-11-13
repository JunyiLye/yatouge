// 線上對戰：對手在倒數、比賽、完賽中換車或換色時，不重建他的車模；回到房間（等待／準備）才套用。用遊戲本身的 ingest 加上假的相依物件。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function fn(name) {
  const s = html.indexOf(`\nfunction ${name}(`);
  assert.ok(s >= 0, name);
  return html.slice(s, html.indexOf('\n}\n', s) + 2);
}
const pvpToRoomSrc = fn('pvpToRoom');

function setup(st) {
  const log = { made: [], disposed: 0 };
  const p = { host: true, st, track: 'kurosagi', buf: [], pose: null, oppKey: 'hatch:0', oppSig: 'x', note: '', lastPres: 'old', cat: null, oppFt: null };
  const cur = { v: null };
  const api = new Function('p', 'cur', 'log', `
    const pvp = p, state = 'race';
    const pvpCheck = () => cur.v, intake = (buf) => ({ buf, reset: false }), catOn = () => false, catResult = () => null, catDecided = () => {};
    const showPop = () => {}, fmtT = String, T = k => k, leaveToLobby = () => {}, pickSig = v => v.car + ':' + v.col, cancelReady = st => st;
    const scene = { remove() {} }, renderer = { compile() {} }, camera = {};
    let rivalCar = { g: { visible: true } };
    const disposeCar = () => { log.disposed++; };
    const makeCar = (c, col) => { log.made.push(c + ':' + col); return { g: { visible: true } }; };
    const pvpSetSt = () => {}, renderRoom = () => {};
    ${fn('ingest')}
    return ingest;
  `)(p, cur, log);
  const pres = (car, col) => { cur.v = { trk: 'kurosagi', car, col, c: null, st: 'racing', ft: null, opp: null, vote: { t: 0, m: 0, g: 0 } }; return api('presence', [], 0); };
  return { p, log, pres };
}

for (const st of ['countdown', 'racing', 'finished']) {
  test(`ingest：${st} 中對手換車或換色，不重建車模，也不記下新的 key`, () => {
    const { p, log, pres } = setup(st);
    assert.equal(pres('gtr', 2), 'ok');
    assert.deepEqual(log.made, []);
    assert.equal(log.disposed, 0);
    assert.equal(p.oppKey, 'hatch:0');
  });
}

for (const st of ['waiting', 'ready']) {
  test(`ingest：${st}（在房間）時對手換車會重建一次，同一款不重複重建`, () => {
    const { p, log, pres } = setup(st);
    pres('gtr', 2); pres('gtr', 2);
    assert.deepEqual(log.made, ['gtr:2']);
    assert.equal(p.oppKey, 'gtr:2');
  });
}

test('pvpToRoom 會清掉 lastPres，讓回到房間後的下一次輪詢重新套用對手的車', () => {
  assert.match(pvpToRoomSrc, /lastPres:\s*null/);
});
