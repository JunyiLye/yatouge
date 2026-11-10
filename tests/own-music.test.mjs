// 抽出 yatouge.html 內 @own-music 區塊（純函式，不依賴 DOM / Audio）後在 Node 執行
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function load() {
  const open = '/* @own-music:start */', s = html.indexOf(open), e = html.indexOf('/* @own-music:end */');
  assert.ok(s >= 0 && e > s, '找不到 @own-music 區塊');
  return new Function(`${html.slice(s + open.length, e)}\nreturn { OWN_MAX, ownCheck, ownLabel, ownMode, ownFromRecord };`)();
}
const f = (name, type, size = 1000) => ({ name, type, size });

test('不含 goldenage / golden 字樣', () => assert.ok(!/golden/i.test(html)));

test('上限為 50 MB', () => assert.equal(load().OWN_MAX, 50 * 1024 * 1024));

test('audio/* MIME 通過，非音訊 MIME 拒絕', () => {
  const { ownCheck } = load();
  assert.equal(ownCheck(f('a.mp3', 'audio/mpeg')), 'ok');
  assert.equal(ownCheck(f('a.bin', 'audio/x-whatever')), 'ok');
  assert.equal(ownCheck(f('a.mp3', 'video/mp4')), 'type');
  assert.equal(ownCheck(f('a.mp3', 'text/plain')), 'type');
});

test('MIME 為空時只靠常見音訊副檔名（不分大小寫）', () => {
  const { ownCheck } = load();
  for (const n of ['x.mp3', 'x.WAV', 'x.ogg', 'x.m4a', 'x.flac', 'x.aac', 'x.opus']) assert.equal(ownCheck(f(n, '')), 'ok', n);
  for (const n of ['x.txt', 'x.exe', 'mp3', 'x.mp3.exe', '']) assert.equal(ownCheck(f(n, '')), 'type', n);
});

test('超過 50 MB 回 size，恰好 50 MB 通過，空檔拒絕', () => {
  const { ownCheck, OWN_MAX } = load();
  assert.equal(ownCheck(f('a.mp3', 'audio/mpeg', OWN_MAX + 1)), 'size');
  assert.equal(ownCheck(f('a.mp3', 'audio/mpeg', OWN_MAX)), 'ok');
  assert.equal(ownCheck(f('a.mp3', 'audio/mpeg', 0)), 'type');
  assert.equal(ownCheck(null), 'type');
});

test('ownLabel 截成最多 24 字元，短名原樣，不拆代理對', () => {
  const { ownLabel } = load();
  assert.equal(ownLabel('song.mp3'), 'song.mp3');
  const long = 'a'.repeat(40) + '.mp3';
  assert.equal(Array.from(ownLabel(long)).length, 24);
  assert.ok(ownLabel(long).endsWith('…'));
  assert.equal(ownLabel('a'.repeat(24)), 'a'.repeat(24));
  const emoji = '🎵'.repeat(30);
  assert.equal(Array.from(ownLabel(emoji)).length, 24);
  assert.equal(ownLabel(undefined), '');
});

test('ownMode：只有 "own" 是 own，舊值與壞值一律 synth', () => {
  const { ownMode } = load();
  assert.equal(ownMode('own'), 'own');
  for (const v of ['synth', 'golden', '', null, undefined, 'OWN']) assert.equal(ownMode(v), 'synth');
});

test('ownFromRecord 驗證 IndexedDB 取回的資料', () => {
  const { ownFromRecord } = load();
  const blob = new Blob([new Uint8Array(10)], { type: 'audio/wav' });
  const ok = ownFromRecord({ blob, name: 'x.wav' });
  assert.equal(ok.blob, blob); assert.equal(ok.name, 'x.wav');
  for (const bad of [null, undefined, {}, { blob }, { name: 'x' }, { blob: new Blob([]), name: 'x' }, { blob: 'str', name: 'x' }, 5])
    assert.equal(ownFromRecord(bad), null);
});
