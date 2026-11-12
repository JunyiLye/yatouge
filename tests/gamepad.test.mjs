// 抽出 yatouge.html 內 @gamepad 區塊（手把的純函式：死區、邊緣偵測、按鍵對應、方向焦點選擇，不依賴 DOM）後在 Node 執行
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function load() {
  const open = '/* @gamepad:start */', s = html.indexOf(open), e = html.indexOf('/* @gamepad:end */');
  assert.ok(s >= 0 && e > s, '找不到 @gamepad 區塊');
  return new Function(`${html.slice(s + open.length, e)}\nreturn { GP, gpAxis, gpPick, gpButtons, gpRises, gpRepeat, gpDrive, gpContext, gpAction, gpNearest, gpCycle, shiftBuzz };`)();
}
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const pad = (pressed = [], extra = {}) => ({ connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })), ...extra });

test('標準配置的按鍵編號', () => {
  const { GP } = load();
  assert.deepEqual(GP.BTN, { A: 0, B: 1, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 });
  assert.equal(GP.REPEAT_DELAY, 400);
  assert.equal(GP.REPEAT_MS, 200);
});

test('gpAxis：死區內為 0，死區外重新縮放到 ±1，壞值為 0', () => {
  const { gpAxis, GP } = load();
  assert.equal(gpAxis(0), 0);
  assert.equal(gpAxis(GP.DEAD * 0.9), 0);
  assert.equal(gpAxis(-GP.DEAD * 0.9), 0);
  assert.equal(gpAxis(1), 1);
  assert.equal(gpAxis(-1), -1);
  assert.equal(gpAxis(1.4), 1);
  near(gpAxis((1 + GP.DEAD) / 2), 0.5);
  near(gpAxis(-(1 + GP.DEAD) / 2), -0.5);
  assert.ok(gpAxis(GP.DEAD + 0.01) > 0 && gpAxis(GP.DEAD + 0.01) < 0.05, '剛出死區時從 0 附近開始，不會跳');
  for (const bad of [NaN, undefined, null, 'x', Infinity]) assert.equal(gpAxis(bad), 0, String(bad));
});

test('gpPick：取第一個連著的手把，標準配置優先；沒有就 null', () => {
  const { gpPick } = load();
  const a = pad([], { mapping: '' }), b = pad();
  assert.equal(gpPick(null), null);
  assert.equal(gpPick([]), null);
  assert.equal(gpPick([null, null]), null);
  assert.equal(gpPick([{ ...b, connected: false }]), null);
  assert.equal(gpPick([null, a]), a);
  assert.equal(gpPick([a, b]), b);
});

test('gpButtons：pressed 或類比值超過門檻都算按下；扳機輕碰不算', () => {
  const { gpButtons, GP } = load();
  const p = pad([0, 12]);
  p.buttons[7] = { pressed: false, value: GP.TRIG + 0.05 };
  p.buttons[6] = { pressed: false, value: GP.TRIG - 0.05 };
  const b = gpButtons(p);
  assert.equal(b.length, 16);
  assert.equal(b[0], true); assert.equal(b[12], true); assert.equal(b[7], true);
  assert.equal(b[6], false); assert.equal(b[1], false);
  assert.deepEqual(gpButtons(null), Array(16).fill(false));
  assert.deepEqual(gpButtons({ buttons: [] }), Array(16).fill(false));
});

test('gpRises：只回報這一格剛按下的鍵', () => {
  const { gpRises } = load();
  const f = Array(16).fill(false), a = f.slice(), b = f.slice();
  a[0] = true; a[3] = true;
  b[0] = true; b[4] = true;
  assert.deepEqual(gpRises(f, a), [0, 3]);
  assert.deepEqual(gpRises(a, b), [4]);
  assert.deepEqual(gpRises(b, b), []);
});

test('gpRepeat：按下立刻觸發，400 ms 後開始每 200 ms 重複', () => {
  const { gpRepeat } = load();
  assert.equal(gpRepeat(-1, 0), true);
  assert.equal(gpRepeat(0, 16), false);
  assert.equal(gpRepeat(380, 399), false);
  assert.equal(gpRepeat(395, 405), true);
  assert.equal(gpRepeat(405, 590), false);
  assert.equal(gpRepeat(590, 601), true);
  assert.equal(gpRepeat(790, 810), true);
  assert.equal(gpRepeat(-1, -1), false);
});

test('gpDrive：RT 油門、LT 煞車、Y 手煞、左搖桿轉向；回中為 null 讓鍵盤接手', () => {
  const { gpDrive, GP } = load();
  const f = Array(16).fill(false);
  assert.deepEqual(gpDrive(f, 0), { gas: false, brake: false, hb: false, steer: null });
  const b = f.slice(); b[7] = b[6] = b[3] = true;
  assert.deepEqual(gpDrive(b, -1), { gas: true, brake: true, hb: true, steer: -1 });
  assert.equal(gpDrive(f, GP.DEAD / 2).steer, null);
  assert.ok(gpDrive(f, 0.6).steer > 0);
});

test('gpContext：觀戰、對話框/選單、比賽畫面、其他畫面', () => {
  const { gpContext } = load();
  assert.equal(gpContext({ spec: true, overlay: false, hud: false }), 'spec');
  assert.equal(gpContext({ spec: false, overlay: true, hud: true }), 'ui');
  assert.equal(gpContext({ spec: false, overlay: false, hud: true }), 'drive');
  assert.equal(gpContext({ spec: false, overlay: false, hud: false }), 'ui');
});

test('gpAction：比賽中 十字上=鏡頭、LB/RB=換檔、Menu=選單、View=音樂，其餘不動作', () => {
  const { gpAction } = load();
  assert.equal(gpAction(12, 'drive'), 'cam');
  assert.equal(gpAction(4, 'drive'), 'shiftDown');
  assert.equal(gpAction(5, 'drive'), 'shiftUp');
  assert.equal(gpAction(9, 'drive'), 'menu');
  assert.equal(gpAction(8, 'drive'), 'music');
  for (const i of [0, 1, 2, 3, 6, 7, 10, 11, 13, 14, 15]) assert.equal(gpAction(i, 'drive'), null, String(i));
});

test('gpAction：畫面/對話框中 十字=移動焦點、A=確認、B=返回；不換鏡頭也不換檔', () => {
  const { gpAction } = load();
  assert.equal(gpAction(12, 'ui'), 'up');
  assert.equal(gpAction(13, 'ui'), 'down');
  assert.equal(gpAction(14, 'ui'), 'left');
  assert.equal(gpAction(15, 'ui'), 'right');
  assert.equal(gpAction(0, 'ui'), 'ok');
  assert.equal(gpAction(1, 'ui'), 'back');
  assert.equal(gpAction(9, 'ui'), 'menu');
  assert.equal(gpAction(8, 'ui'), 'music');
  for (const i of [3, 4, 5, 6, 7]) assert.equal(gpAction(i, 'ui'), null, String(i));
});

test('gpAction：觀戰中 十字左右切換視角、A 確認', () => {
  const { gpAction } = load();
  assert.equal(gpAction(14, 'spec'), 'viewPrev');
  assert.equal(gpAction(15, 'spec'), 'viewNext');
  assert.equal(gpAction(0, 'spec'), 'ok');
  for (const i of [4, 5, 9, 8, 12]) assert.equal(gpAction(i, 'spec'), null, String(i));
});

test('gpCycle：前後循環', () => {
  const { gpCycle } = load();
  assert.equal(gpCycle(0, 3, 1), 1);
  assert.equal(gpCycle(2, 3, 1), 0);
  assert.equal(gpCycle(0, 3, -1), 2);
  assert.equal(gpCycle(-1, 3, 1), 0);
});

const R = (left, top, w = 100, h = 40) => ({ left, top, right: left + w, bottom: top + h, width: w, height: h });

test('gpNearest：往指定方向取最近的元素，同一排/同一欄優先', () => {
  const { gpNearest } = load();
  // 一排三張卡片，下面一排兩個按鈕
  const rects = [R(0, 0), R(120, 0), R(240, 0), R(0, 100), R(130, 100)];
  assert.equal(gpNearest(rects[0], rects, 'right'), 1);
  assert.equal(gpNearest(rects[1], rects, 'right'), 2);
  assert.equal(gpNearest(rects[1], rects, 'left'), 0);
  assert.equal(gpNearest(rects[1], rects, 'down'), 4);
  assert.equal(gpNearest(rects[0], rects, 'down'), 3);
  assert.equal(gpNearest(rects[4], rects, 'up'), 1);
  assert.equal(gpNearest(rects[3], rects, 'right'), 4);
});

test('gpNearest：該方向沒有東西時繞回另一端（同一排/同一欄）', () => {
  const { gpNearest } = load();
  const rects = [R(0, 0), R(120, 0), R(240, 0), R(0, 100), R(130, 100)];
  assert.equal(gpNearest(rects[2], rects, 'right'), 0);
  assert.equal(gpNearest(rects[0], rects, 'left'), 2);
  assert.equal(gpNearest(rects[3], rects, 'down'), 0);
  assert.equal(gpNearest(rects[1], rects, 'up'), 4);
});

test('gpNearest：沒有起點或只有自己時', () => {
  const { gpNearest } = load();
  const rects = [R(0, 0), R(120, 0)];
  assert.equal(gpNearest(null, rects, 'down'), 0);
  assert.equal(gpNearest(rects[0], [rects[0]], 'down'), -1);
  assert.equal(gpNearest(rects[0], [], 'down'), -1);
});

test('shiftBuzz：只有真的換了檔且震動開著才震；拒絕的換檔（頂檔/最低檔）不震', () => {
  const { shiftBuzz } = load();
  assert.equal(shiftBuzz({ on: false, ok: true, dir: 1, vf: 20, top: 40 }), null);
  assert.equal(shiftBuzz({ on: true, ok: false, dir: 1, vf: 20, top: 40 }), null);
  assert.equal(shiftBuzz({ on: true, ok: false, dir: -1, vf: 20, top: 40 }), null);
});

test('shiftBuzz：一般換檔 60–90 ms 中等強度；手機 30–40 ms', () => {
  const { shiftBuzz } = load();
  for (const b of [shiftBuzz({ on: true, ok: true, dir: 1, vf: 20, top: 40 }), shiftBuzz({ on: true, ok: true, dir: -1, vf: 20, top: 40 })]) {
    assert.ok(b.ms >= 60 && b.ms <= 90, String(b.ms));
    assert.ok(b.strong >= 0.3 && b.strong <= 0.6 && b.weak >= 0.3 && b.weak <= 0.6, JSON.stringify(b));
    assert.ok(b.phone >= 30 && b.phone <= 40, String(b.phone));
  }
});

test('shiftBuzz：降檔後超過新檔位極速（會引擎煞車）震得稍強', () => {
  const { shiftBuzz } = load();
  const plain = shiftBuzz({ on: true, ok: true, dir: -1, vf: 20, top: 40 }), eb = shiftBuzz({ on: true, ok: true, dir: -1, vf: 45, top: 40 });
  assert.ok(eb.strong > plain.strong && eb.weak >= plain.weak, JSON.stringify([plain, eb]));
  assert.ok(eb.ms >= plain.ms && eb.ms <= 90 && eb.phone <= 40 && eb.strong <= 1);
  assert.deepEqual(shiftBuzz({ on: true, ok: true, dir: 1, vf: 45, top: 40 }), shiftBuzz({ on: true, ok: true, dir: 1, vf: 20, top: 40 }), '升檔不會引擎煞車');
});

test('shiftBuzz：換檔畫面晃動很小（遠小於撞牆），引擎煞車降檔稍強；沒換成或關閉時沒有晃動', () => {
  const { shiftBuzz } = load();
  const up = shiftBuzz({ on: true, ok: true, dir: 1, vf: 20, top: 40 }), eb = shiftBuzz({ on: true, ok: true, dir: -1, vf: 45, top: 40 });
  assert.ok(up.shake >= 0.08 && up.shake <= 0.12, String(up.shake));
  assert.ok(eb.shake > up.shake && eb.shake <= 0.12, String(eb.shake));
  const wallHit = v => Math.min(0.6, v * 0.06); // wallHit() in the game; v > 4 is a hit that also buzzes a phone
  assert.ok(eb.shake < wallHit(4) / 2, '比會震手機的撞牆小一半以上');
  assert.equal(shiftBuzz({ on: false, ok: true, dir: -1, vf: 45, top: 40 }), null);
  assert.equal(shiftBuzz({ on: true, ok: false, dir: -1, vf: 45, top: 40 }), null);
});

test('gpNearest：下面一張橫跨兩欄的寬卡片不會搶走同一排左右移動', () => {
  const { gpNearest } = load();
  const rects = [R(66, 131, 255, 64), R(331, 131, 255, 64), R(66, 205, 520, 64)]; // 標題畫面的模式卡：比賽、計時賽、送酒（跨兩欄）
  assert.equal(gpNearest(rects[1], rects, 'left'), 0);
  assert.equal(gpNearest(rects[0], rects, 'right'), 1);
  assert.equal(gpNearest(rects[1], rects, 'down'), 2);
  assert.equal(gpNearest(rects[0], rects, 'down'), 2);
});
