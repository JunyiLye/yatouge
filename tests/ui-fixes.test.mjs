// 第 2 批操作與顯示修正：抽出 @ui-fixes 純函式，並把真實原始碼行抽出來用假元素執行
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
function grab(re, what) { const m = html.match(re); assert.ok(m, `找不到原始碼：${what}`); return m[0]; }
const H = new Function(`${block('ui-fixes')}
return { validLang, fmtT, enterStartsRace, keepNativeKey, kbModHeld, kbSuppressAlt, FOV_BASE, stepFov, carPickNext, focusKeep };`)();

// 假元素：closest 只支援「標籤、#id、.class」的簡單選擇器
const el = (tag, { id = '', cls = [], up = null } = {}) => {
  const self = { tagName: tag.toUpperCase(), id, classList: { contains: c => cls.includes(c) }, parent: up };
  self.closest = sel => {
    const ss = sel.split(',').map(s => s.trim());
    for (let n = self; n; n = n.parent) {
      if (ss.some(s => s[0] === '#' ? n.id === s.slice(1) : s[0] === '.' ? n.classList.contains(s.slice(1)) : n.tagName === s.toUpperCase())) return n;
    }
    return null;
  };
  return self;
};

test('A6 語言存檔：只接受 I18N 自己的 key', () => {
  const tbl = { zh: {}, en: {} };
  assert.equal(H.validLang('zh', tbl), true);
  assert.equal(H.validLang('en', tbl), true);
  for (const bad of ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'fr', '', null, undefined, 5]) assert.equal(H.validLang(bad, tbl), false, String(bad));
});
test('A6 載入與遊戲內切換都使用 validLang', () => {
  assert.match(html, /if \(!validLang\(lang, I18N\)\) lang = 'zh';/);
  const line = grab(/\$\('#igLang'\)\.addEventListener\('change'.*/, '#igLang change');
  assert.match(line, /validLang\(/);
});

test('D2 fmtT：先進位到 0.01 秒再拆分', () => {
  const f = H.fmtT;
  assert.equal(f(59.996), '1:00.00');
  assert.equal(f(9.996), '0:10.00');
  assert.equal(f(119.999), '2:00.00');
  assert.equal(f(59.994), '0:59.99');
  assert.equal(f(0), '0:00.00');
  assert.equal(f(65.4), '1:05.40');
  assert.equal(f(9.5), '0:09.50');
});
test('D2 只有一份 fmtT 定義（在 ui-fixes 內）', () => {
  assert.equal((html.match(/const fmtT =|function fmtT/g) || []).length, 1);
});

test('A1 enterStartsRace：開始鈕與非互動元素才開始比賽', () => {
  const E = H.enterStartsRace;
  assert.equal(E(null), true);
  assert.equal(E(el('body')), true);
  const title = el('div', { id: 'title' });
  assert.equal(E(el('div', { up: title })), true);
  assert.equal(E(el('button', { id: 'btnStart', up: title })), true);
  for (const tag of ['button', 'select', 'input', 'textarea', 'a']) assert.equal(E(el(tag, { up: title })), false, tag);
  const row = el('div', { id: 'tLog' }); assert.equal(E(el('span', { up: row })), false, '既有排除 #tLog');
  const kx = el('div', { id: 'tKx' }); assert.equal(E(el('span', { up: kx })), false);
  assert.equal(E(el('span', { cls: ['music'] })), false);
});
test('A1 原始碼的 Enter 處理：在線上對戰鈕不開始、在開始鈕開始', () => {
  const line = grab(/  if \(e\.code === 'Enter'.*/, 'Enter handler');
  const run = (target, st = 'title', online = false) => {
    let started = 0, prevented = 0;
    const e = { code: 'Enter', repeat: false, target, preventDefault: () => prevented++ };
    new Function('e', 'state', 'onlineUI', 'enterStartsRace', 'askStart', 'startRace', 'tmOpen', 'dirOpen', line)(e, st, online, H.enterStartsRace, f => { if (f === 'S') started++; }, 'S', null, false);
    return { started, prevented };
  };
  const title = el('div', { id: 'title' });
  assert.deepEqual(run(el('button', { id: 'btnOnline', up: title })), { started: 0, prevented: 0 });
  assert.deepEqual(run(el('select', { id: 'tTurn', up: title })), { started: 0, prevented: 0 });
  assert.deepEqual(run(el('button', { id: 'btnStart', up: title })), { started: 1, prevented: 1 });
  assert.deepEqual(run(el('body')), { started: 1, prevented: 1 });
  assert.deepEqual(run(el('body'), 'race'), { started: 0, prevented: 0 });
  assert.deepEqual(run(el('body'), 'title', true), { started: 0, prevented: 0 });
});

test('E4 主畫面下拉選單與滑桿上的方向鍵不被攔截', () => {
  const K = H.keepNativeKey;
  assert.equal(K('title', 'ArrowDown', el('select')), true);
  assert.equal(K('title', 'ArrowLeft', el('input')), true);
  assert.equal(K('title', 'ArrowUp', el('body')), false);
  assert.equal(K('title', 'ArrowUp', el('button')), false);
  assert.equal(K('race', 'ArrowDown', el('select')), false);
  assert.equal(K('title', 'Space', el('body')), true, '原本的 Space 規則不變');
  assert.equal(K('race', 'Space', el('body')), false);
  assert.equal(K('title', 'KeyA', el('select')), false);
});
test('E4 原始碼：駕駛鍵的 preventDefault 使用 keepNativeKey', () => {
  const line = grab(/  if \(KB_DRIVE\.includes\(act\)\).*/, 'drive keydown');
  let prevented = 0; const inp = {};
  const e = { code: 'ArrowDown', target: el('select'), preventDefault: () => prevented++ };
  new Function('KB_DRIVE', 'act', 'input', 'e', 'state', 'keepNativeKey', line)(['brake'], 'brake', inp, e, 'title', H.keepNativeKey);
  assert.equal(prevented, 0); assert.equal(inp.brake, true);
  new Function('KB_DRIVE', 'act', 'input', 'e', 'state', 'keepNativeKey', line)(['brake'], 'brake', inp, { ...e, target: el('body') }, 'title', H.keepNativeKey);
  assert.equal(prevented, 1);
});

test('A2 kbModHeld：按鍵本身是修飾鍵時忽略對應旗標', () => {
  const M = H.kbModHeld;
  assert.equal(M('ControlLeft', { ctrlKey: true, altKey: false, metaKey: false }), false);
  assert.equal(M('ControlRight', { ctrlKey: true }), false);
  assert.equal(M('AltLeft', { altKey: true }), false);
  assert.equal(M('AltRight', { altKey: true }), false);
  assert.equal(M('KeyC', { ctrlKey: true }), true);
  assert.equal(M('ControlLeft', { ctrlKey: true, altKey: true }), true, '另外按著 Alt 仍算修飾');
  assert.equal(M('KeyT', {}), false);
  assert.equal(M('MetaLeft', { metaKey: true }), false);
  assert.equal(M('KeyT', { metaKey: true }), true);
  assert.equal(H.kbSuppressAlt('AltLeft', 'cam'), true);
  assert.equal(H.kbSuppressAlt('AltRight', 'shiftDown'), true);
  assert.equal(H.kbSuppressAlt('AltLeft', undefined), false);
  assert.equal(H.kbSuppressAlt('ControlLeft', 'shiftDown'), false);
});
test('A2 原始碼：Ctrl 綁降檔、Alt 綁鏡頭會觸發；Ctrl+C 不會', () => {
  const dn = grab(/  if \(!e\.repeat && act === 'shiftDown'.*/, 'shiftDown');
  const cam = grab(/  if \(act === 'cam'.*/, 'cam');
  const mod = grab(/const ck = chatKey\(\{.*/, 'chatKey');
  const runDn = e => { let n = 0; new Function('e', 'act', 'shiftGear', 'kbModHeld', dn)(e, 'shiftDown', () => n++, H.kbModHeld); return n; };
  assert.equal(runDn({ code: 'ControlLeft', ctrlKey: true, repeat: false }), 1);
  assert.equal(runDn({ code: 'KeyC', ctrlKey: true, repeat: false }), 0);
  const runCam = e => { let n = 0; new Function('e', 'act', 'hudEl', 'setCamMode', 'nextCam', 'camMode', 'kbModHeld', cam)(e, 'cam', { hidden: false }, () => n++, () => 'x', 'chase', H.kbModHeld); return n; };
  assert.equal(runCam({ code: 'AltLeft', altKey: true, repeat: false }), 1);
  assert.equal(runCam({ code: 'KeyV', altKey: true, repeat: false }), 0);
  assert.match(mod, /mod: kbModHeld\(e\.code, e\)/);
  assert.match(html, /kbSuppressAlt\(e\.code, act\)\) e\.preventDefault\(\)/);
});

test('D1 syncBody：車身顯示時車門字樣依 kxLetterOn', () => {
  const src = grab(/function syncBody\(hide\) \{[\s\S]*?\n\}\n/, 'syncBody');
  const run = letterOn => {
    const door = { visible: false }, body = { visible: false }, head = {}, headTarget = {};
    const playerCar = { door, g: { children: [door, body, head, headTarget], add() {} } };
    new Function('playerCar', 'head', 'headTarget', 'kxLetterOn', `let bodyCar = null, bodyHidden = false, playerInterior = null; ${src} syncBody(false);`)(playerCar, head, headTarget, letterOn);
    return { door: door.visible, body: body.visible };
  };
  assert.deepEqual(run(true), { door: true, body: true });
  assert.deepEqual(run(false), { door: false, body: true });
});

test('A5 focusKeep：重繪後把焦點放回同一位置', () => {
  let focused = null;
  const mk = n => ({ children: Array.from({ length: n }, (_, i) => ({ i, disabled: false, focus() { focused = this; } })) });
  const a = mk(3), b = mk(4), rows = [a, b];
  const restore = H.focusKeep(rows, b.children[2]);
  const old = b.children[2]; b.children = mk(4).children; // 重繪：換成全新的按鈕
  restore();
  assert.equal(focused, b.children[2]); assert.notEqual(focused, old);
  focused = null;
  H.focusKeep(rows, { other: true })(); // 焦點不在列內：不動
  assert.equal(focused, null);
  const r2 = H.focusKeep(rows, a.children[1]); a.children = mk(1).children; r2(); // 新列較短：不丟錯、不動
  assert.equal(focused, null);
  const r3 = H.focusKeep(rows, b.children[0]); b.children = mk(4).children; b.children[0].disabled = true; r3();
  assert.equal(focused, null, '被停用的新按鈕不聚焦');
});
test('A5 滑鼠或觸控點選不還原焦點（維持點卡片後按 Enter 開始）', () => {
  let focused = null;
  const rows = [{ children: [{ disabled: false, focus() { focused = this; } }] }];
  H.focusKeep(rows, rows[0].children[0], true)();
  assert.equal(focused, null);
  H.focusKeep(rows, rows[0].children[0], false)();
  assert.ok(focused);
  assert.ok(html.includes("addEventListener('pointerdown', () => { pickByPointer = true; }, true)"));
  assert.ok(html.includes("addEventListener('keydown', () => { pickByPointer = false; }, true)"));
  assert.ok(html.includes('document.activeElement, pickByPointer && !tmOpen)'));
});
test('A5 三個卡片重繪函式都保留焦點（方向卡片已改成開始時的視窗，不再是主畫面的重繪列）', () => {
  for (const fn of ['renderPicker', 'renderModePicker', 'renderTrackPicker']) {
    const m = html.match(new RegExp(`function ${fn}\\(\\) \\{[\\s\\S]*?\\n\\}\\n`));
    assert.ok(m, fn);
    assert.match(m[0], /keepPickFocus\(\)/, fn);
    assert.match(m[0], /keep\(\);/, fn);
  }
});

test('D3 stepFov 把視野角平滑地拉回', () => {
  assert.equal(H.FOV_BASE, 66);
  let f = 90; for (let i = 0; i < 300; i++) f = H.stepFov(f, H.FOV_BASE, 1 / 60);
  assert.ok(Math.abs(f - 66) < 0.06, String(f));
  const one = H.stepFov(90, 66, 1 / 60); assert.ok(one < 90 && one > 66);
  assert.equal(H.stepFov(66.01, 66, 1 / 60), 66.01, '已在 0.05 以內不動');
});
test('D3 主畫面環繞鏡頭呼叫 easeFov(dt, FOV_BASE)，鏡頭用 FOV_BASE 建立', () => {
  const m = html.match(/if \(state === 'title'\) \{\n    camOrbit[\s\S]*?return;\n  \}/);
  assert.ok(m); assert.match(m[0], /easeFov\(dt, FOV_BASE\)/);
  assert.match(html, /new THREE\.PerspectiveCamera\(FOV_BASE, 1/);
});

test('A3 送酒模式：選單鏡頭欄顯示實際視角', () => {
  const stmt = grab(/\$\('#igCam'\)\.value = [^;]+;/, 'igCam value');
  const sel = {};
  new Function('$', 'camNow', 'camMode', stmt)(() => sel, () => 'cockpit', 'chase');
  assert.equal(sel.value, 'cockpit');
});

test('A4 遊戲內切換語言後也重繪主畫面線上狀態', () => {
  const line = grab(/\$\('#igLang'\)\.addEventListener\('change'.*/, '#igLang change');
  let h; let calls = [];
  const $ = () => ({ addEventListener: (_, f) => { h = f; } });
  new Function('$', 'validLang', 'I18N', 'store', 'applyLang', 'renderOnline', `let lang = 'zh'; ${line}`)($, H.validLang, { zh: 1, en: 1 }, { set() {} }, () => calls.push('apply'), () => calls.push('online'));
  h({ target: { value: 'en' } });
  assert.deepEqual(calls, ['apply', 'online']);
  calls = []; h({ target: { value: 'toString' } }); assert.deepEqual(calls, []);
});

test('D4 再點已選的車不做任何事；點別台才換並重設顏色', () => {
  const P = H.carPickNext;
  assert.equal(P({ car: 'hatch', color: 2 }, 'hatch', 'race'), null);
  assert.deepEqual(P({ car: 'hatch', color: 2 }, 'gtr', 'race'), { car: 'gtr', color: 0 });
  assert.equal(P({ car: 'hatch', color: 2 }, 'gtr', 'sake'), null);
  assert.match(html, /const next = carPickNext\(choice, k, mode\); if \(!next\) return; choice = next; chosen\(\);/);
});
