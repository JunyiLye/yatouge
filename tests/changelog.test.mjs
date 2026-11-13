// 抽出 yatouge.html 內 @changelog 區塊（純函式與資料，不依賴 DOM）後在 Node 執行
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function load() {
  const open = '/* @changelog:start */', s = html.indexOf(open), e = html.indexOf('/* @changelog:end */');
  assert.ok(s >= 0 && e > s, '找不到 @changelog 區塊');
  return new Function(`${html.slice(s + open.length, e)}\nreturn { CHANGELOG, shouldShowLog, logEntries };`)();
}

test('版本依日期由新到舊，日期格式正確且不重複', () => {
  const { CHANGELOG } = load();
  assert.ok(CHANGELOG.length >= 1);
  const dates = CHANGELOG.map(v => v.date);
  for (const d of dates) assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new Set(dates).size, dates.length, '日期重複');
  assert.deepEqual(dates, [...dates].sort().reverse(), '沒有由新到舊');
});

test('每個版本都有非空的中英文重點，兩種語言條數相同，且不是空字串', () => {
  const { CHANGELOG } = load();
  for (const v of CHANGELOG) {
    for (const l of ['zh', 'en']) {
      assert.ok(Array.isArray(v[l]) && v[l].length > 0, `${v.date} 缺 ${l}`);
      for (const line of v[l]) assert.ok(typeof line === 'string' && line.trim() !== '', `${v.date} ${l} 有空白條目`);
    }
    assert.equal(v.zh.length, v.en.length, `${v.date} 中英文條數不同`);
  }
});

test('最多保留 12 個版本', () => {
  assert.ok(load().CHANGELOG.length <= 12);
});

test('shouldShowLog：沒看過、看過舊版、壞資料都要顯示；看過最新版不顯示', () => {
  const { shouldShowLog } = load();
  assert.equal(shouldShowLog(null, '2026-11-14'), true);
  assert.equal(shouldShowLog(undefined, '2026-11-14'), true);
  assert.equal(shouldShowLog('2026-11-13', '2026-11-14'), true);
  assert.equal(shouldShowLog('2026-11-14', '2026-11-14'), false);
  assert.equal(shouldShowLog('2099-01-01', '2026-11-14'), true, '比最新還新的壞值要顯示一次，關閉時會被改回最新版');
  for (const bad of ['', 'abc', '2026-1-4', 42, {}, []]) assert.equal(shouldShowLog(bad, '2026-11-14'), true, String(bad));
});

test('logEntries：新玩家或壞值只給最新一版；看過舊版給比它新的所有版本', () => {
  const { CHANGELOG, logEntries } = load();
  const latest = CHANGELOG[0];
  assert.deepEqual(logEntries(null), [latest]);
  assert.deepEqual(logEntries('garbage'), [latest]);
  assert.deepEqual(logEntries('2099-01-01'), [latest]);
  assert.deepEqual(logEntries(latest.date), [latest]);
  const oldest = CHANGELOG[CHANGELOG.length - 1].date;
  if (CHANGELOG.length > 1) assert.deepEqual(logEntries(oldest), CHANGELOG.slice(0, -1));
});

test('更新視窗的狀態變數必須在第一次 applyLang() 之前宣告（否則載入時 TDZ 當機）', () => {
  const call = html.indexOf('\napplyLang();\n');
  assert.ok(call > 0, '找不到頂層 applyLang();');
  for (const name of ['clOpen']) {
    const m = new RegExp(String.raw`\blet\b[^;\n]*\b${name}\s*=`).exec(html);
    assert.ok(m, `找不到 ${name} 的 let 宣告`);
    assert.ok(m.index < call, `${name} 宣告在第一次 applyLang() 之後`);
  }
});

test('標題畫面按 Enter 開賽必須忽略自動連發，避免按住 Enter 關掉更新視窗後直接開賽', () => {
  const line = html.split('\n').find(l => l.includes("e.code === 'Enter'") && l.includes("state === 'title'"));
  assert.ok(line, '找不到 Enter 開賽的條件');
  assert.match(line, /!e\.repeat/);
});

test('自動跳出的更新視窗關閉後，焦點回到「開始下坡」按鈕', () => {
  const m = /function clClose\(\) \{[\s\S]*?\n\}/.exec(html);
  assert.ok(m, '找不到 clClose');
  assert.match(m[0], /#btnStart/);
});
