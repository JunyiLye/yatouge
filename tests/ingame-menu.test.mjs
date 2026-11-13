// 抽出 yatouge.html 內 @ingame-menu 區塊（純函式，不依賴 DOM / Audio）後在 Node 執行
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function load() {
  const open = '/* @ingame-menu:start */', s = html.indexOf(open), e = html.indexOf('/* @ingame-menu:end */');
  assert.ok(s >= 0 && e > s, '找不到 @ingame-menu 區塊');
  return new Function(`${html.slice(s + open.length, e)}\nreturn { MUSIC_BASE, clampVol, volPct, volFromPct, musicLevel, menuCanOpen, menuEscAction, forfeitPlan, menuItems, confirmKeys };`)();
}

test('選單只在倒數與比賽中可開，標題、結果、暱稱對話框開著時不可開', () => {
  const { menuCanOpen } = load();
  assert.equal(menuCanOpen('count', false), true);
  assert.equal(menuCanOpen('race', false), true);
  assert.equal(menuCanOpen('title', false), false);
  assert.equal(menuCanOpen('done', false), false);
  assert.equal(menuCanOpen('race', true), false);
  assert.equal(menuCanOpen('count', true), false);
});

test('Esc：沒開且可開 → open；沒開且不可開 → none；子面板 → back；主面板 → close', () => {
  const { menuEscAction } = load();
  assert.equal(menuEscAction(false, 'main', 'race', false), 'open');
  assert.equal(menuEscAction(false, 'main', 'title', false), 'none');
  assert.equal(menuEscAction(false, 'main', 'done', false), 'none');
  assert.equal(menuEscAction(false, 'main', 'race', true), 'none');
  assert.equal(menuEscAction(true, 'main', 'race', false), 'close');
  assert.equal(menuEscAction(true, 'settings', 'race', false), 'back');
  assert.equal(menuEscAction(true, 'confirm', 'count', false), 'back');
});

test('音量夾在 0–1，壞值回預設 1', () => {
  const { clampVol } = load();
  assert.equal(clampVol(0.4), 0.4);
  assert.equal(clampVol('0.25'), 0.25);
  assert.equal(clampVol(-3), 0);
  assert.equal(clampVol(7), 1);
  for (const bad of [null, undefined, '', 'abc', NaN, {}, [], true]) assert.equal(clampVol(bad), 1, String(bad));
  assert.equal(clampVol('x', 0.5), 0.5);
});

test('百分比與 0–1 互轉並夾住、取整', () => {
  const { volPct, volFromPct } = load();
  assert.equal(volPct(0.456), 46);
  assert.equal(volPct(2), 100);
  assert.equal(volPct(-1), 0);
  assert.equal(volFromPct(50), 0.5);
  assert.equal(volFromPct('80'), 0.8);
  assert.equal(volFromPct(150), 1);
  assert.equal(volFromPct(-5), 0);
  assert.equal(volFromPct('zz'), 1);
});

test('音樂增益：關閉為 0；開啟 = 基準 0.32 × 音量；100% 等於原本音量', () => {
  const { musicLevel, MUSIC_BASE } = load();
  assert.equal(MUSIC_BASE, 0.32);
  assert.equal(musicLevel(false, 1), 0);
  assert.equal(musicLevel(true, 1), 0.32);
  assert.ok(Math.abs(musicLevel(true, 0.5) - 0.16) < 1e-12);
  assert.equal(musicLevel(true, 0), 0);
  assert.equal(musicLevel(true, 9), 0.32);
});

test('認輸：單人回標題、連線離開對戰；都不存最佳成績', () => {
  const { forfeitPlan } = load();
  assert.deepEqual(forfeitPlan(false), { action: 'title', saveBest: false });
  assert.deepEqual(forfeitPlan(true), { action: 'leave', saveBest: false });
});

test('選單按鈕：單機只顯示重新開始，連線只顯示回到大廳', () => {
  const { menuItems } = load();
  assert.deepEqual(menuItems(false), { restart: true, lobby: false });
  assert.deepEqual(menuItems(true), { restart: false, lobby: true });
});

test('選單確認畫面的狀態變數必須在第一次 applyLang() 之前宣告（否則載入時 TDZ 當機）', () => {
  const call = html.indexOf('\napplyLang();\n');
  assert.ok(call > 0, '找不到頂層 applyLang();');
  for (const name of ['confirmFor', 'confirmFrom']) {
    const m = new RegExp(String.raw`\blet\b[^;\n]*\b${name}\s*=`).exec(html);
    assert.ok(m, `找不到 ${name} 的 let 宣告`);
    assert.ok(m.index < call, `${name} 宣告在第一次 applyLang() 之後`);
  }
});

test('確認畫面文字：認輸依計時賽／送酒切換，回到大廳與重新開始各有自己的字串', () => {
  const { confirmKeys } = load();
  assert.deepEqual(confirmKeys('forfeit', false, false), { q: 'igConfirm', yes: 'igYes' });
  assert.deepEqual(confirmKeys('forfeit', true, false), { q: 'taQuitAsk', yes: 'taQuitYes' });
  assert.deepEqual(confirmKeys('forfeit', false, true), { q: 'sakeQuitAsk', yes: 'taQuitYes' });
  for (const [ta, sake] of [[false, false], [true, false], [false, true]]) {
    assert.deepEqual(confirmKeys('lobby', ta, sake), { q: 'igLobbyAsk', yes: 'igLobbyYes' });
    assert.deepEqual(confirmKeys('restart', ta, sake), { q: 'igRestartAsk', yes: 'igRestartYes' });
  }
});
