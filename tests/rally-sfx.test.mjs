// RV-4 引擎聲的純函式（@rally-sfx）與接線：水平對臥四缸渦輪的低沉不規則「咚咚」聲＋渦輪哨聲＋洩壓聲。
// Web Audio 節點本身不在 node 跑；這裡測參數公式，並用原始碼檢查接線與「其他車的聲音逐字不變」。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const L = new Function(`const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
${block('turbo-sfx')}\n${block('rally-sfx')}
return { boostStep, bovTrigger, cooldownStep, rallySfx, RALLY_SPOOL };`)();
const { boostStep, rallySfx, RALLY_SPOOL } = L;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('rallySfx：半階次起伏頻率 = 點火頻率（rpm/30）的一半', () => {
  for (const rpm of [1000, 3000, 6000]) near(rallySfx(rpm, 0).wobbleHz, rpm / 60);
});
test('rallySfx：起伏深度低轉很大、高轉變小，且不增加', () => {
  assert.ok(rallySfx(1000, 0).wobbleDepth >= 0.3);
  assert.ok(rallySfx(7000, 0).wobbleDepth <= 0.12);
  let prev = Infinity;
  for (let rpm = 1000; rpm <= 8000; rpm += 250) { const d = rallySfx(rpm, 0).wobbleDepth; assert.ok(d <= prev + 1e-12 && d > 0, `rpm ${rpm}`); prev = d; }
});
test('rallySfx：低通截止頻率隨轉速增加', () => {
  assert.ok(rallySfx(2000, 0).lpHz < rallySfx(4000, 0).lpHz && rallySfx(4000, 0).lpHz < rallySfx(7000, 0).lpHz);
});
test('rallySfx：渦輪哨聲——沒增壓就無聲，頻率與音量隨增壓增加，音量不超過 GT-32 的 0.02', () => {
  const a = rallySfx(5000, 0), b = rallySfx(5000, 0.5), c = rallySfx(5000, 1);
  assert.equal(a.whineGain, 0); assert.equal(a.airGain, 0);
  assert.ok(a.whineHz < b.whineHz && b.whineHz < c.whineHz);
  assert.ok(b.whineGain > 0 && b.whineGain < c.whineGain && c.whineGain <= 0.02);
  assert.ok(c.airGain > b.airGain && b.airGain > 0);
  const gtrHz = (boost, rpm) => 2000 + boost * 3000 + rpm * 0.1; // GT-32 的公式（updateEngineAudio）
  assert.ok(c.whineHz < gtrHz(1, 5000), 'RV-4 的渦輪較小、音調比 GT-32 低');
});
test('rallySfx：增壓夾在 0–1（超出範圍不爆音量）', () => {
  assert.deepEqual(rallySfx(5000, 3), rallySfx(5000, 1));
  assert.deepEqual(rallySfx(5000, -1), rallySfx(5000, 0));
});

test('boostStep：沒傳 rate 時與舊公式完全相同（GT-32 / SR-7 不受影響）', () => {
  const old = (boost, gas, rpm, dt) => { const target = gas ? Math.min(1, Math.max(0, (rpm - 2500) / 5000)) : 0; return boost < target ? Math.min(target, boost + dt * 1.1) : Math.max(target, boost - dt * 3); };
  for (const boost of [0, 0.3, 0.9]) for (const gas of [true, false]) for (const rpm of [1000, 4000, 7500]) near(boostStep(boost, gas, rpm, 1 / 60), old(boost, gas, rpm, 1 / 60));
});
test('boostStep：RV-4 的渦輪遲滯——爬升比預設慢，放油門仍快速洩壓', () => {
  assert.ok(RALLY_SPOOL < 1.1 && RALLY_SPOOL > 0.3);
  assert.ok(boostStep(0, true, 7000, 0.1, RALLY_SPOOL) < boostStep(0, true, 7000, 0.1));
  assert.ok(boostStep(0, true, 7000, 0.1, RALLY_SPOOL) > 0);
  near(boostStep(0.8, false, 5000, 0.1, RALLY_SPOOL), boostStep(0.8, false, 5000, 0.1));
});

// ---- 接線（原始碼檢查）----
const fnBody = name => { const s = html.indexOf(`function ${name}(`); assert.ok(s >= 0, name); const e = html.indexOf('\n}\n', s); return html.slice(s, e); };
test('buildEngine：有 rally 分支（兩顆失諧鋸齒、半階次方波、起伏 LFO、哨聲與氣流）；initAudio 建立 rally 引擎', () => {
  const b = fnBody('buildEngine');
  assert.match(b, /type === 'rally'/);
  assert.match(b, /e\.whine\b/); assert.match(b, /e\.air\b/); assert.match(b, /e\.lfo\b/);
  assert.match(html, /engines = \{ hatch: buildEngine\('hatch'\), coupe: buildEngine\('coupe'\), gtr: buildEngine\('gtr'\), rally: buildEngine\('rally'\) \}/);
});
test('updateEngineAudio：rally 分支用 rallySfx / boostStep(…, RALLY_SPOOL) / bovTrigger / cooldownStep / sfxBov；非作用中的引擎靜音行不變', () => {
  const u = fnBody('updateEngineAudio');
  const s = u.indexOf("k === 'rally'"); assert.ok(s >= 0, '沒有 rally 分支');
  const r = u.slice(s, u.indexOf('} else {', s));
  for (const w of ['rallySfx(', 'RALLY_SPOOL', 'bovTrigger(', 'cooldownStep(', 'sfxBov(', 'e.whineG', 'e.airG', 'e.lfoG']) assert.ok(r.includes(w), `rally 分支缺 ${w}`);
  assert.ok(u.includes("for (const g of [e.twG, e.whineG, e.airG]) if (g) g.gain.setTargetAtTime(0, t, 0.05); continue; }"), '靜音行');
});
test('其他車的聲音逐字不變：hatch / gtr / coupe 的分支原文仍在', () => {
  const u = fnBody('updateEngineAudio'), b = fnBody('buildEngine');
  for (const line of [
    'e.lp.frequency.setTargetAtTime(500 + car.rpm * 0.45, t, 0.05);',
    'e.howl.frequency.setTargetAtTime(f * 2 + car.rpm * 0.12, t, 0.05);',
    'e.lp.frequency.setTargetAtTime(700 + car.rpm * 0.65, t, 0.05);',
    'e.bodyG.gain.setTargetAtTime(e.boost * 0.35, t, 0.1);',
    'const wf = 2000 + e.boost * 3000 + car.rpm * 0.1;',
    'e.whine.frequency.setTargetAtTime(wf, t, 0.05); e.whineG.gain.setTargetAtTime(e.boost * e.boost * 0.02, t, 0.05);',
    'e.air.frequency.setTargetAtTime(wf * 1.1, t, 0.05); e.airG.gain.setTargetAtTime(e.boost * 0.05, t, 0.05);',
    'e.gasWas = gas; e.boost = boostStep(e.boost, gas, car.rpm, dt);']) assert.ok(u.includes(line), line);
  for (const line of [
    "osc('sawtooth', 1, 0.5); osc('square', 0.5, 0.22); osc('sawtooth', 2, 0.25, 7);",
    "osc('sawtooth', 1.5, 0.42); osc('sawtooth', 1.5, 0.26, 6); osc('square', 3, 0.07);",
    "osc('square', 1, 0.38); osc('square', 1, 0.32, 16); osc('sawtooth', 0.5, 0.18);",
    // 波形整形與低通：只多一個 rally 條件，hatch / gtr / coupe 的值不變
    "type === 'hatch' ? 2.2 : type === 'gtr' ? 3 : type === 'rally' ? 3.6 : 4.5",
    "type === 'hatch' ? 4 : type === 'gtr' ? 2 : type === 'rally' ? 1.8 : 1.5"]) assert.ok(b.includes(line), line);
});
