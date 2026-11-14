// 主畫面設定改成彈出視窗、開始時選方向、線上上坡與房間聊天（docs/runs/2026-11-14-title-modals/plan.md）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
function fn(name) {
  const s = html.indexOf(`\nfunction ${name}(`);
  assert.ok(s >= 0, name);
  return html.slice(s + 1, html.indexOf('\n}\n', s) + 2);
}
function line(prefix) {
  const s = html.indexOf(`\n${prefix}`);
  assert.ok(s >= 0, prefix);
  return html.slice(s + 1, html.indexOf('\n', s + 1));
}
// 沒給的識別字是「什麼都不做」的替身；給了的變數（含賦值）落在 vars 上
const noop = new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : noop, apply: () => noop, set: () => true });
function scope(vars) {
  return new Proxy(vars, {
    has: (t, k) => typeof k === 'string' && k !== '__env' && (k in t || !(k in globalThis)),
    get: (t, k) => k === Symbol.unscopables ? undefined : k in t ? t[k] : noop,
    set: (t, k, v) => { t[k] = v; return true; },
  });
}
const load = (src, ret, vars) => new Function('__env', `with (__env) { ${src}\nreturn ${ret}; }`)(scope(vars));
// 假 DOM：$ 對同一個選擇器回傳同一個假元素；focus 記錄在 log
function dom() {
  const els = {}, log = [];
  const $ = q => els[q] ??= { q, hidden: q.startsWith('#m') || q === '#dirq', inert: false, textContent: '', focus() { log.push(q); }, classList: { toggle() {}, add() {}, remove() {} } };
  return { $, els, log };
}
const P = new Function(`${block('title-modals')}\nreturn { focusStep, carSummary, startAsksDir, rpReadyOk, rpMissing, backdropHit };`)();
const ROOM = new Function(`const NET = { TRACKS: ['kurosagi', 'seiran', 'hakuro'], CARS: ['hatch', 'coupe', 'gtr', 'rally'] };
${block('roompick')}\nreturn { RP, validVote, resolveVote, pickSig, roomPhase };`);

/* ---------- 純函式 ---------- */
test('focusStep：Tab 循環；沒有焦點時順向到第一個、反向到最後一個；沒有控制項回 -1', () => {
  const { focusStep } = P;
  assert.equal(focusStep(0, 3, false), 1);
  assert.equal(focusStep(2, 3, false), 0, '最後一個繞回第一個');
  assert.equal(focusStep(0, 3, true), 2, 'Shift+Tab 從第一個繞到最後一個');
  assert.equal(focusStep(1, 3, true), 0);
  assert.equal(focusStep(-1, 3, false), 0);
  assert.equal(focusStep(-1, 3, true), 2);
  assert.equal(focusStep(-1, 0, false), -1);
  assert.equal(focusStep(0, 1, false), 0);
});

test('carSummary：車名＋顏色名稱＋色塊；顏色索引壞掉時用第一個顏色', () => {
  const def = { name: { zh: '甲車', en: 'Car A' }, colors: [{ n: { zh: '紅', en: 'Red' }, top: 0xff0000 }, { n: { zh: '雙色', en: 'Two' }, top: 0x00ff00, low: 0x0000ff }] };
  const lz = o => o.zh;
  assert.deepEqual(P.carSummary(def, 0, lz), { name: '甲車', color: '紅', css: '#ff0000' });
  const two = P.carSummary(def, 1, lz);
  assert.equal(two.color, '雙色'); assert.equal(two.css, 'linear-gradient(180deg, #00ff00 50%, #0000ff 50%)');
  assert.equal(P.carSummary(def, 9, lz).color, '紅');
  assert.equal(P.carSummary(def, -1, lz).color, '紅');
  assert.equal(P.carSummary(def, 0.5, lz).color, '紅');
});

test('startAsksDir：一般開始要問方向；送酒模式（只有下坡）與再跑一次（沿用方向）不問', () => {
  const { startAsksDir } = P;
  assert.equal(startAsksDir('race', false), true);
  assert.equal(startAsksDir('ta', false), true);
  assert.equal(startAsksDir('sake', false), false);
  assert.equal(startAsksDir('race', true), false);
  assert.equal(startAsksDir('sake', true), false);
});

test('rpReadyOk / rpMissing：有對手、方向與變速箱都選了才能準備；已經準備的可以取消；缺什麼回報什麼', () => {
  const { rpReadyOk, rpMissing } = P;
  const ok = { opp: true, dirOk: true, gbOk: true, st: 'waiting' };
  assert.equal(rpReadyOk(ok), true);
  assert.equal(rpReadyOk({ ...ok, opp: false }), false, '沒有對手');
  assert.equal(rpReadyOk({ ...ok, dirOk: false }), false, '沒選方向');
  assert.equal(rpReadyOk({ ...ok, gbOk: false }), false, '沒選變速箱');
  assert.equal(rpReadyOk({ ...ok, dirOk: false, gbOk: false }), false);
  assert.equal(rpReadyOk({ opp: true, dirOk: false, gbOk: false, st: 'ready' }), true, '已準備：永遠可以取消準備');
  assert.equal(rpReadyOk({ opp: false, dirOk: true, gbOk: true, st: 'ready' }), false, '對手不在就不能按');
  assert.deepEqual(rpMissing({ dirOk: true, gbOk: true }), []);
  assert.deepEqual(rpMissing({ dirOk: false, gbOk: true }), ['dir']);
  assert.deepEqual(rpMissing({ dirOk: true, gbOk: false }), ['gb']);
  assert.deepEqual(rpMissing({ dirOk: false, gbOk: false }), ['dir', 'gb']);
});

/* ---------- Enter 與 modal ---------- */
test('enterStartsRace：任何 modal 開著時（blocked）Enter 一律不開始比賽，包含開始鈕上', () => {
  const E = new Function(`${block('ui-fixes')}\nreturn enterStartsRace;`)();
  const start = { id: 'btnStart', closest: () => null };
  assert.equal(E(start), true);
  assert.equal(E(start, false), true);
  assert.equal(E(start, true), false);
  assert.equal(E(null, true), false);
  assert.equal(E({ id: 'x', closest: () => null }, true), false);
});

test('Enter 的處理行：modal 或方向視窗開著不開始；開始走 askStart（方向 → AT／MT）', () => {
  const l = line("  if (e.code === 'Enter'");
  const run = (tm, dir) => {
    let asked = 0;
    const E = new Function(`${block('ui-fixes')}\nreturn enterStartsRace;`)();
    const e = { code: 'Enter', repeat: false, target: null, preventDefault() {} };
    new Function('e', 'state', 'onlineUI', 'enterStartsRace', 'askStart', 'startRace', 'tmOpen', 'dirOpen', l)(e, 'title', false, E, f => { if (f === 'S') asked++; }, 'S', tm, dir);
    return asked;
  };
  assert.equal(run(null, false), 1);
  assert.equal(run('#mCar', false), 0);
  assert.equal(run(null, true), 0);
});

/* ---------- modal 開關 ---------- */
const TM = () => {
  const { $, els, log } = dom(), pad = [{ focus: () => log.push('first') }, { focus: () => log.push('second') }];
  const env = { $, tmOpen: null, tmOpener: null, dirOpen: false, transOpen: false, nickOpen: false, kbOpen: false, clOpen: false, input: { gas: true, steerAxis: 0.3 }, releaseTouch() {}, gpFocusables: () => pad, focusStep: P.focusStep, document: { activeElement: pad[0] }, pad };
  const run = new Function('__env', `with (__env) { ${fn('tmOpenModal')}\n${fn('tmClose')}\n${fn('tmKeydown')}\nreturn { tmOpenModal, tmClose, tmKeydown }; }`)(scope(env));
  return { env, els, log, ...run };
};
test('tmOpenModal：主畫面 inert、modal 顯示、焦點到第一個控制項、放開按住的操作；已有視窗開著不重複開', () => {
  const t = TM();
  t.tmOpenModal('#mCar', '#btnCarSet');
  assert.equal(t.env.tmOpen, '#mCar'); assert.equal(t.env.tmOpener, '#btnCarSet');
  assert.equal(t.els['#title'].inert, true); assert.equal(t.els['#mCar'].hidden, false);
  assert.deepEqual(t.log, ['first']);
  assert.equal(t.env.input.gas, false); assert.equal(t.env.input.steerAxis, null);
  t.tmOpenModal('#mSnd', '#btnSndSet');
  assert.equal(t.env.tmOpen, '#mCar', '一次只開一個');
  const u = TM(); u.env.dirOpen = true; u.tmOpenModal('#mCar', '#btnCarSet'); assert.equal(u.env.tmOpen, null, '方向視窗開著不開 modal');
});
test('tmClose：關閉後主畫面恢復、焦點回到打開它的按鈕', () => {
  const t = TM();
  t.tmOpenModal('#mGame', '#btnGameSet'); t.log.length = 0;
  t.tmClose();
  assert.equal(t.env.tmOpen, null); assert.equal(t.els['#mGame'].hidden, true); assert.equal(t.els['#title'].inert, false);
  assert.deepEqual(t.log, ['#btnGameSet']);
  t.tmClose(); assert.deepEqual(t.log, ['#btnGameSet'], '沒開著時什麼都不做');
});
test('tmKeydown：Esc 關閉；Tab 在 modal 內循環（Shift+Tab 反向）', () => {
  const t = TM(); t.tmOpenModal('#mSnd', '#btnSndSet'); t.log.length = 0;
  let prevented = 0; const ev = (key, shiftKey = false) => ({ key, shiftKey, repeat: false, preventDefault: () => prevented++ });
  t.tmKeydown(ev('Tab')); assert.deepEqual(t.log, ['second']); assert.equal(prevented, 1);
  t.env.document.activeElement = t.env.pad[1]; t.log.length = 0;
  t.tmKeydown(ev('Tab')); assert.deepEqual(t.log, ['first'], '最後一個繞回第一個');
  t.log.length = 0; t.env.document.activeElement = t.env.pad[0];
  t.tmKeydown(ev('Tab', true)); assert.deepEqual(t.log, ['second'], 'Shift+Tab 從第一個到最後一個');
  t.log.length = 0; t.tmKeydown(ev('Escape'));
  assert.equal(t.env.tmOpen, null); assert.deepEqual(t.log, ['#btnSndSet']);
});
test('手把 B（gpBack）關閉 modal 與方向視窗；鍵盤全域處理在 modal 開著時交給 tmKeydown', () => {
  const run = vars => { const c = { tm: 0, dir: 0 }; new Function('__env', `with (__env) { ${fn('gpBack')}\ngpBack(); }`)(scope({ clOpen: false, kbOpen: false, transOpen: false, nickOpen: false, menuOpen: false, tmClose: () => c.tm++, dirCancel: () => c.dir++, ...vars })); return c; };
  assert.deepEqual(run({ tmOpen: '#mCar', dirOpen: false }), { tm: 1, dir: 0 });
  assert.deepEqual(run({ tmOpen: null, dirOpen: true }), { tm: 0, dir: 1 });
  assert.match(html, /if \(tmOpen\) \{ tmKeydown\(e\); return; \}/);
  assert.match(html, /if \(nickOpen \|\| transOpen \|\| dirOpen \|\|/);
  assert.match(fn('gpScope'), /dirOpen[^;]*\$\('#dirq'\)/); assert.match(fn('gpScope'), /tmOpen[^;]*\$\(tmOpen\)/);
  assert.match(line('const gpCtx'), /dirOpen \|\| !!tmOpen/);
});
test('按鍵設定與更新內容從遊戲設定 modal 打開：關閉後 modal 還在、主畫面仍 inert', () => {
  for (const f of ['kbOpenPage', 'kbClose', 'clShow', 'clClose']) assert.match(fn(f), /tmOpen/, f);
  const { $, els, log } = dom(); els['#mGame'] = { hidden: false, inert: false, focus() {} };
  const env = { $, tmOpen: '#mGame', kbOpen: true, kbCap: null, kbFrom: 'title', menuOpen: false, nickOpen: false, transOpen: false, clOpen: false, kbSwallow: null, store: { set() {} }, CHANGELOG: [{ date: 'd' }], clFocus: true };
  els['#title'] = { hidden: false, inert: true, focus() {} };
  new Function('__env', `with (__env) { ${fn('kbClose')}\nkbClose(); }`)(scope(env));
  assert.equal(els['#title'].inert, true, '還在遊戲設定 modal：主畫面維持 inert');
  assert.equal(els['#mGame'].inert, false, 'modal 自己恢復可操作');
  const e2 = { ...env, tmOpen: null, clOpen: true, kbOpen: false };
  els['#title'].inert = true;
  new Function('__env', `with (__env) { ${fn('clClose')}\nclClose(); }`)(scope(e2));
  assert.equal(els['#title'].inert, false, '沒有 modal：主畫面恢復');
  void log;
});

/* ---------- 音樂開關 ---------- */
test('音樂開關（聲音 modal）與 setMusic 同一個狀態：M 鍵、手把、遊戲內選單呼叫 setMusic 都會更新它', () => {
  const { $, els } = dom(); const env = { $, T: k => k, musicGain: null, musicOn: true, musicVol: 1, musicLevel: () => 1 };
  els['#tMusic'] = { attrs: {}, textContent: '', setAttribute(k, v) { this.attrs[k] = v; } };
  const run = new Function('__env', `with (__env) { ${fn('syncMusicSw')}\n${fn('setMusic')}\nreturn { syncMusicSw, setMusic }; }`)(scope(env));
  run.setMusic(false);
  assert.equal(els['#tMusic'].attrs['aria-checked'], 'false'); assert.equal(els['#tMusic'].textContent, 'igOff');
  run.setMusic(true);
  assert.equal(els['#tMusic'].attrs['aria-checked'], 'true'); assert.equal(els['#tMusic'].textContent, 'igOn');
  assert.match(html, /\$\('#tMusic'\)\.addEventListener\('click', \(\) => setMusic\(!musicOn\)\)/);
  assert.match(fn('ownRelabel'), /syncMusicSw\(\)/, '第一次 applyLang 就要顯示正確狀態');
  assert.match(fn('syncMenuUI'), /syncMusicSw|igMusic/);
});

/* ---------- 開始流程 ---------- */
function startEnv(mode) {
  const c = { dir: [], trans: [], set: [] };
  const env = { mode, startAsksDir: P.startAsksDir, askDir: (cb, back) => { c.dir.push(back); c.dirCb = cb; }, askTrans: (cb, back) => { c.trans.push([cb, back]); }, setDir: d => c.set.push(d) };
  const askStart = new Function('__env', `with (__env) { ${fn('askStart')}\nreturn askStart; }`)(scope(env));
  return { c, askStart };
}
test('askStart：一般模式先問方向，選完才問 AT／MT；方向用 setDir 存起來並重建賽道', () => {
  const { c, askStart } = startEnv('race'); const go = () => { c.ran = (c.ran || 0) + 1; };
  askStart(go);
  assert.deepEqual(c.dir, ['#btnStart']); assert.equal(c.trans.length, 0, '還沒問變速箱');
  c.dirCb('up');
  assert.deepEqual(c.set, [], '方向還沒生效（要等 AT／MT 選好）'); assert.equal(c.trans.length, 1);
  c.trans[0][0]();
  assert.deepEqual(c.set, ['up']); assert.equal(c.ran, 1, '選好 AT／MT 才開始比賽');
});
test('askStart：送酒模式與再跑一次不問方向，直接問 AT／MT', () => {
  const s = startEnv('sake'); s.askStart(() => {}); assert.equal(s.c.dir.length, 0); assert.equal(s.c.trans.length, 1);
  const a = startEnv('race'); a.askStart(() => {}, '#btnAgain', true); assert.equal(a.c.dir.length, 0); assert.equal(a.c.trans[0][1], '#btnAgain');
});
test('開始鈕、Enter、結果畫面「同一台再跑」都走 askStart；再跑一次不問方向', () => {
  assert.match(html, /\$\('#btnStart'\)\.addEventListener\('click', \(\) => askStart\(startRace\)\)/);
  assert.match(html, /askStart\(startRace, '#btnAgain', true\)/);
  assert.ok(!/askTrans\(startRace/.test(html), '不再直接 askTrans(startRace…)');
});
function dirEnv() {
  const { $, els, log } = dom();
  const env = { $, dirOpen: false, transOpen: false, trackDir: 'down', TRANS_SCREENS: ['#title', '#result', '#room'], document: { querySelectorAll: () => [] }, dirCb: null, dirBack: null, dirNo: null };
  const run = new Function('__env', `with (__env) { ${fn('askDir')}\n${fn('closeDir')}\n${fn('dirPick')}\n${fn('dirCancel')}\nreturn { askDir, closeDir, dirPick, dirCancel }; }`)(scope(env));
  return { env, els, log, ...run };
}
test('askDir：背景 inert、預設焦點在目前方向；選了呼叫 callback 並還原；取消回到原按鈕並呼叫 no', () => {
  const d = dirEnv(); let got = null, no = 0;
  d.askDir(x => { got = x; }, '#btnStart', () => no++, 'up');
  assert.equal(d.env.dirOpen, true); assert.equal(d.els['#title'].inert, true); assert.equal(d.els['#dirq'].hidden, false);
  assert.deepEqual(d.log, ['#dirUp'], '預設焦點在上次的方向');
  d.dirPick('down'); assert.equal(got, 'down'); assert.equal(d.env.dirOpen, false); assert.equal(d.els['#title'].inert, false); assert.equal(d.els['#dirq'].hidden, true);
  d.log.length = 0; d.askDir(() => { got = 'bad'; }, '#btnStart', () => no++, 'down');
  assert.deepEqual(d.log, ['#dirDown']); d.log.length = 0;
  d.dirCancel(); assert.equal(got, 'down', '取消不呼叫 callback'); assert.equal(no, 1); assert.deepEqual(d.log, ['#btnStart']);
  d.askDir(() => {}); d.askDir(() => { got = 'second'; }); assert.equal(d.env.dirOpen, true, '已開著不重複開');
});

/* ---------- 線上：投票與抽籤帶方向 ---------- */
test('RP.V 升到 6（千曲坂延長）；validVote 要有 d（down／up），乾淨副本', () => {
  const { RP, validVote } = ROOM();
  assert.equal(RP.V, 6);
  assert.deepEqual(validVote({ t: 'hakuro', m: 'cat', g: 80, d: 'up', evil: 1 }), { t: 'hakuro', m: 'cat', g: 80, d: 'up' });
  assert.deepEqual(validVote({ t: 'seiran', m: 'first', g: 50, d: 'down' }), { t: 'seiran', m: 'first', g: 50, d: 'down' });
  for (const bad of [{ t: 'seiran', m: 'first', g: 50 }, { t: 'seiran', m: 'first', g: 50, d: 'sideways' }, { t: 'seiran', m: 'first', g: 50, d: 'seiran_up' }, { t: 'seiran', m: 'first', g: 50, d: 1 }, { t: 'seiran_up', m: 'first', g: 50, d: 'up' }])
    assert.equal(validVote(bad), null, JSON.stringify(bad));
});
test('pickSig 含方向：只改方向也算一次改票（會取消準備）', () => {
  const { pickSig } = ROOM(); const v = d => ({ car: 'hatch', col: 0, vote: { t: 'seiran', m: 'first', g: 50, d } });
  assert.notEqual(pickSig(v('down')), pickSig(v('up')));
  assert.equal(pickSig(v('up')), pickSig(v('up')));
});
test('resolveVote：賽道與方向是同一張票——相同直接用，不同就整張抽，結果帶方向', () => {
  const { resolveVote } = ROOM(); const V = (o = {}) => ({ t: 'seiran', m: 'first', g: 50, d: 'down', ...o });
  assert.deepEqual(resolveVote(V({ d: 'up' }), V({ d: 'up' }), 7), { t: 'seiran', d: 'up', m: 'first', g: null, dt: false, dm: false, dg: false });
  const seen = new Set();
  for (let s = 0; s < 60; s++) {
    const r = resolveVote(V({ t: 'kurosagi', d: 'down' }), V({ t: 'hakuro', d: 'up' }), s);
    assert.equal(r.dt, true); assert.ok(r.t === 'kurosagi' && r.d === 'down' || r.t === 'hakuro' && r.d === 'up', '賽道與方向不能拆開抽：' + r.t + r.d);
    seen.add(r.t + r.d);
    assert.deepEqual(r, resolveVote(V({ t: 'kurosagi', d: 'down' }), V({ t: 'hakuro', d: 'up' }), s), '同 seed 同結果');
  }
  assert.equal(seen.size, 2, '兩票都抽得到');
  const same = resolveVote(V({ d: 'down' }), V({ d: 'up' }), 3); assert.equal(same.dt, true, '同賽道不同方向也要抽'); assert.equal(same.t, 'seiran');
  assert.equal(resolveVote(V(), { t: 'seiran', m: 'first', g: 50 }, 1), null, '舊格式（沒有 d）的票不合法');
});
test('catNextGap 的內部票也帶 d，貓捉老鼠下一回合距離仍能抽', () => {
  const c = new Function(`const NET = { TRACKS: ['kurosagi', 'seiran', 'hakuro'], CARS: ['hatch'], STATES: [] };\n${block('roompick')}\n${block('catmouse')}\nreturn { catNextGap };`)();
  assert.deepEqual(c.catNextGap(60, 60, 5), { g: 60, dg: false });
  assert.notEqual(c.catNextGap(30, 100, 5), null);
});
test('validatePeerState：trk 可以是上坡的課程 id（seiran_up），其他寫法仍拒絕；NET.TRACKS 是四條下坡 id', () => {
  const N = new Function(`${block('netcode')}\nreturn { NET, validatePeerState };`)();
  const base = { v: 1, st: 'waiting', car: 'hatch', col: 0, trk: 'seiran' };
  assert.equal(N.validatePeerState(base, null, 1).trk, 'seiran');
  assert.equal(N.validatePeerState({ ...base, trk: 'seiran_up' }, null, 1).trk, 'seiran_up');
  for (const t of ['seiran_down', 'evil_up', '_up', 'seiran_up_up', 'seiran_UP', 5, null]) assert.equal(N.validatePeerState({ ...base, trk: t }, null, 1), null, String(t));
  assert.deepEqual(N.NET.TRACKS, ['kurosagi', 'seiran', 'hakuro', 'chikuma']);
});
test('pvpCheck 與大廳廣告：邊界框用實際課程 id；大廳列表只廣告下坡的賽道 id', () => {
  assert.match(line('const pvpCheck'), /netTrack\(pres\.trk\)/);
  assert.match(fn('advertise'), /track: baseId\(p\.track\)/);
});
test('rpMatchText 顯示方向（上坡／下坡），抽籤的賽道方向標（抽籤）', () => {
  const t = k => ({ dirUp: '上坡', dirDown: '下坡', rpDraw: '（抽籤）', modeFirst: '先到者勝', modeCat: '貓捉老鼠', rpGapV: g => g }[k]);
  const env = { Lz: o => o.zh, TRACKS: { kurosagi: { name: { zh: '黑鷺山' } } }, T: (k, ...a) => typeof t(k) === 'function' ? t(k)(...a) : t(k), rpModeName: m => t(m === 'cat' ? 'modeCat' : 'modeFirst') };
  const f = load([line('const rpDirName'), line('const rpMatchText')].join(String.fromCharCode(10)), 'rpMatchText', env);
  assert.equal(f({ t: 'kurosagi', d: 'up', m: 'first', dt: false, dm: false }), '黑鷺山・上坡・先到者勝');
  assert.equal(f({ t: 'kurosagi', d: 'down', m: 'first', dt: true, dm: true }), '黑鷺山・下坡（抽籤）・先到者勝（抽籤）');
  const v = load([line('const rpDirName'), line('const rpVoteText')].join(String.fromCharCode(10)), 'rpVoteText', env);
  assert.equal(v({ t: 'kurosagi', d: 'up', m: 'first' }), '黑鷺山・上坡・先到者勝');
});
test('rpResolve：抽到的方向決定實際課程（_up），並寫進 p.track 與廣播', () => {
  const sets = []; let pub = 0;
  const p = { host: true, pick: { vote: { t: 'kurosagi', m: 'first', g: 50, d: 'up' } }, opp: { vote: { t: 'kurosagi', m: 'first', g: 50, d: 'up' }, sd: null }, sd: 9, track: 'kurosagi', match: null };
  const env = { pvp: p, resolveVote: ROOM().resolveVote, pvpSetTrack: id => sets.push(id), pvpPublish: () => pub++, renderRoom() {} };
  const defs = [line('const UP_SUFFIX'), line('const upId'), line('const dirFrom'), line('const courseId')].join('\n');
  load(`${defs}\n${fn('rpResolve')}\nrpResolve();`, 'null', env);
  assert.equal(p.match.d, 'up'); assert.deepEqual(sets, ['kurosagi_up']); assert.equal(p.track, 'kurosagi_up'); assert.equal(pub, 1);
});
test('beginCountdown 的保底 match 也帶方向', () => {
  assert.match(fn('beginCountdown'), /d: isUp\(p\.track\) \? 'up' : 'down'/);
});

/* ---------- 線上：點賽道問方向、點車問 AT／MT、準備按鈕 ---------- */
const mkP = (o = {}) => ({ st: 'waiting', dirOk: false, gbOk: false, pick: { car: 'hatch', col: 0, vote: { t: 'kurosagi', m: 'first', g: 50, d: 'down' } }, ...o });
test('rpPickTrack：點賽道跳出方向視窗；選了方向才成立（賽道＋方向一起投票）；取消不改投票', () => {
  const p = mkP(), c = { dir: null, set: [] };
  const env = { pvp: p, dirOpen: false, transOpen: false, askDir: (cb, back, no, cur) => { c.dir = { cb, back, cur }; }, rpSet: o => c.set.push(o), renderRoom() {}, $: () => ({ focus() {} }) };
  load(`${fn('rpPickTrack')}\nrpPickTrack('seiran');`, 'null', env);
  assert.equal(c.dir.cur, 'down', '預設焦點在目前投的方向'); assert.equal(p.dirOk, false); assert.deepEqual(c.set, [], '還沒選方向不改票');
  c.dir.cb('up');
  assert.equal(p.dirOk, true); assert.deepEqual(c.set, [{ vote: { t: 'seiran', d: 'up' } }]);
  const q = mkP({ st: 'racing' }), c2 = { n: 0 };
  load(`${fn('rpPickTrack')}\nrpPickTrack('seiran');`, 'null', { ...env, pvp: q, askDir: () => c2.n++ });
  assert.equal(c2.n, 0, '不是選擇階段不問');
});
test('rpPickCar：點車跳出 AT／MT；選了才算選好車（gbOk）並換車；取消不換', () => {
  const p = mkP(), c = { tr: null, set: [] };
  const env = { pvp: p, dirOpen: false, transOpen: false, askTrans: (cb, back) => { c.tr = { cb, back }; }, rpSet: o => c.set.push(o), renderRoom() {}, $: () => ({ focus() {} }) };
  load(`${fn('rpPickCar')}\nrpPickCar('gtr');`, 'null', env);
  assert.equal(p.gbOk, false); assert.deepEqual(c.set, []); assert.equal(c.tr.back, '#rpCar [data-v="gtr"]');
  c.tr.cb();
  assert.equal(p.gbOk, true); assert.deepEqual(c.set, [{ car: 'gtr' }]);
});
test('房間的買單處：賽道按鈕走 rpPickTrack、車按鈕走 rpPickCar；顏色仍直接換', () => {
  const b = fn('rpBuild');
  assert.match(b, /go: \(\) => rpPickTrack\(t\)/); assert.match(b, /go: \(\) => rpPickCar\(k\)/); assert.match(b, /go: \(\) => rpSet\(\{ col: i \}\)/);
});
test('renderRoom：準備鈕用 rpReadyOk，缺什麼在 #rpNeed 提示', () => {
  const r = fn('renderRoom');
  assert.match(r, /b\.disabled = !rpReadyOk\(/); assert.match(r, /rpMissing\(/); assert.match(r, /#rpNeed/);
  assert.match(html, /id="rpNeed"/);
  assert.match(html, /\$\('#btnReady'\)\.addEventListener\('click', \(\) => \{\n  const p = pvp; if \(!p \|\| !p\.opp \|\| !p\.oppPeer \|\| \(p\.st !== 'waiting' && p\.st !== 'ready'\) \|\| !rpReadyOk\(/);
});
test('startMatch：進房間時方向與變速箱都要重選（dirOk／gbOk 為 false），預設票帶方向', () => {
  const s = fn('startMatch');
  assert.match(s, /dirOk: false, gbOk: false/); assert.match(s, /d: dirFrom\(trackDir\)/);
});
test('rpStep：抽籤後不再跳 AT／MT 視窗，直接用選好的變速箱送出 gb', () => {
  const p = { host: false, st: 'ready', gb: 0, sd: null, match: null, phase: 'pick', gbOk: true }; let asked = 0, pub = 0, resolved = 0;
  const env = { pvp: p, roomPhase: ROOM().roomPhase, askTrans: () => asked++, pvpPublish: () => pub++, renderRoom() {}, rpResolve: () => { resolved++; p.match = { t: 'kurosagi', d: 'up', m: 'first' }; }, rpReset() {}, rand4: () => [0, 0, 0, 0], transOpen: false };
  load(`${fn('rpStep')}\nrpStep({ st: 'ready', sd: 123, gb: 0 });`, 'null', env);
  assert.equal(resolved, 1); assert.equal(asked, 0, '不再問 AT／MT'); assert.equal(p.gb, 1); assert.ok(pub >= 1);
  assert.ok(!/askTrans/.test(fn('rpStep')) && !/transMatch/.test(html), '抽籤流程裡沒有變速箱視窗，也沒有殘留的 #transMatch');
});

/* ---------- 版面與文字 ---------- */
const slice = (id) => { const s = html.indexOf(`<div id="${id}"`); assert.ok(s >= 0, id); return html.slice(s, html.indexOf('\n</div>\n', s)); };
test('主畫面只留模式、賽道、三個設定按鈕與開始／線上；設定控制項搬進對應 modal（id 不變）', () => {
  const title = slice('title');
  for (const id of ['dirPick', 'pick', 'swatches', 'btnBgm', 'btnPick', 'ownMsg', 'tKx', 'tVibe', 'tTurn', 'tKeys', 'tLog', 'tCtl']) assert.ok(!title.includes(`id="${id}"`), `主畫面不該再有 #${id}`);
  for (const id of ['modePick', 'trackPick', 'btnCarSet', 'btnSndSet', 'btnGameSet', 'btnStart', 'btnOnline', 'tGhost', 'tSake']) assert.ok(title.includes(`id="${id}"`), `主畫面要有 #${id}`);
  const car = slice('mCar'), snd = slice('mSnd'), game = slice('mGame');
  for (const id of ['pick', 'swatches', 'tKx', 'tKxChime', 'tKxLetter', 'tKxUp']) assert.ok(car.includes(`id="${id}"`), `車輛 modal 要有 #${id}`);
  for (const id of ['btnBgm', 'btnPick', 'btnOwnClear', 'ownFile', 'ownMsg', 'tMusic']) assert.ok(snd.includes(`id="${id}"`), `聲音 modal 要有 #${id}`);
  for (const id of ['tVibe', 'tTurn', 'tKeys', 'tLog', 'tCtl', 'tSteerRow', 'tTiltSens']) assert.ok(game.includes(`id="${id}"`), `遊戲設定 modal 要有 #${id}`);
  for (const [id, t] of [['mCar', 'mCarT'], ['mSnd', 'mSndT'], ['mGame', 'mGameT']]) assert.match(html, new RegExp(`<div id="${id}"[^>]*role="dialog" aria-modal="true" aria-labelledby="${t}" hidden`));
});
test('方向視窗 #dirq：兩個大按鈕＋取消，樣式與 AT／MT 視窗相同，放在 #trans 之前的對話框區', () => {
  const d = slice('dirq');
  assert.match(html, /<div id="dirq"[^>]*role="dialog" aria-modal="true" aria-labelledby="dirqTitle" hidden/);
  for (const id of ['dirDown', 'dirUp', 'dirCancel']) assert.ok(d.includes(`id="${id}"`), id);
  assert.match(d, /class="transbtn" id="dirDown"[^>]*data-d="down"/); assert.match(d, /class="transbtn" id="dirUp"[^>]*data-d="up"/);
  assert.match(html, /#trans, #dirq \{/);
});
test('新文字都有中英文（各一份）', () => {
  for (const k of ['carSet', 'sndSet', 'gameSet', 'tmDone', 'dirQTitle', 'rpNeed', 'rpNeedDir', 'rpNeedGb', 'sndMusic'])
    assert.equal((html.match(new RegExp(`\\b${k}:`, 'g')) || []).length, 2, `${k} 中英文各一`);
  assert.match(html, /start: '開始'/); assert.match(html, /start: 'Start'/);
});
test('房間聊天框是 .roomsheet 的直接子元素（寬螢幕放右欄），不再埋在 .rside 裡', () => {
  const room = slice('room');
  const rs = room.indexOf('<div class="rside">'), ch = room.indexOf('<div class="chatbox" id="roomChat">');
  assert.ok(rs >= 0 && ch > rs);
  const rsideEnd = room.indexOf('\n    </div>\n', rs);
  assert.ok(ch > rsideEnd, '#roomChat 在 .rside 結束之後');
  assert.match(html, /@media \(min-width: 900px\) and \(min-height: 501px\) \{[^}]*\.sheet\.roomsheet/);
});
test('更新紀錄 2026-11-14 有三個設定視窗、開始時選方向、線上上坡、聊天放右邊的白話說明；中英條數相同，新功能不寫 Fix:', () => {
  const { CHANGELOG } = new Function(`${block('changelog')}\nreturn { CHANGELOG };`)();
  const e = CHANGELOG.find(v => v.date === '2026-11-14');
  assert.equal(e.zh.length, e.en.length);
  const i = e.zh.findIndex(l => l.includes('聲音設定') && l.includes('車輛設定') && l.includes('遊戲設定'));
  assert.ok(i >= 0 && !e.en[i].startsWith('Fix:'), '設定視窗');
  const j = e.zh.findIndex(l => l.includes('按下「開始」') && l.includes('方向'));
  assert.ok(j >= 0 && !e.en[j].startsWith('Fix:'), '開始時選方向');
  const k = e.zh.findIndex(l => l.includes('線上對戰') && l.includes('上坡') && l.includes('準備'));
  assert.ok(k >= 0 && !e.en[k].startsWith('Fix:'), '線上上坡');
  const m = e.zh.findIndex(l => l.includes('聊天') && l.includes('右'));
  assert.ok(m >= 0 && !e.en[m].startsWith('Fix:'), '聊天放右邊');
  for (const l of e.zh.slice(0, 40)) assert.ok(!/(RP\.V|inert|presence)/.test(l), '不寫技術細節');
});
test('宣告順序：新狀態變數在第一次頂層 applyLang() 之前（避免 TDZ）', () => {
  const call = html.indexOf('\napplyLang();\n');
  assert.ok(call > 0);
  for (const v of ['tmOpen', 'tmOpener', 'dirOpen']) {
    const m = new RegExp(`^let [^\\n]*\\b${v}\\b`, 'm').exec(html);
    assert.ok(m && m.index < call, `${v} 要在第一次 applyLang() 之前宣告`);
  }
});


/* ---------- 審查與驗證後的追加 ---------- */
test('追加 1：closeRoomDialogs 關掉開著的方向／變速箱視窗（不執行 callback）；倒數、回房間、對手離開、離開選擇階段都會呼叫', () => {
  const c = { dir: 0, tr: 0 };
  const f = load(fn('closeRoomDialogs'), 'closeRoomDialogs', { dirOpen: true, transOpen: false, closeDir: () => c.dir++, closeTrans: () => c.tr++ });
  f(); assert.deepEqual(c, { dir: 1, tr: 0 });
  const g = load(fn('closeRoomDialogs'), 'closeRoomDialogs', { dirOpen: false, transOpen: true, closeDir: () => c.dir++, closeTrans: () => c.tr++ });
  g(); assert.deepEqual(c, { dir: 1, tr: 1 });
  for (const n of ['beginCountdown', 'pvpToRoom', 'oppGone']) assert.match(fn(n), /closeRoomDialogs\(\)/, n);
  // 回到選擇階段（waiting／ready）時不關：選票本來就允許在已準備時改
  const run = st => { let n = 0; load(fn('pvpSetSt') + '\npvpSetSt(st);', 'null', { pvp: { st: 'ready' }, st, closeRoomDialogs: () => n++, rpReset() {}, pvpPublish() {}, advertise() {}, renderRoom() {} }); return n; };
  assert.equal(run('waiting'), 0); assert.equal(run('ready'), 0); assert.equal(run('countdown'), 1);
});
test('追加 2：點背景只在按下與放開都在背景上才關閉（拖曳放開不算）', () => {
  const el = {}, other = {};
  assert.equal(P.backdropHit(el, el, el), true);
  assert.equal(P.backdropHit(other, el, el), false, '在控制項按下、拖到背景放開');
  assert.equal(P.backdropHit(el, other, el), false);
  assert.equal(P.backdropHit(null, el, el), false);
  assert.match(html, /\$\(id\)\.addEventListener\('pointerdown'/); assert.match(html, /backdropHit\(d, e\.target, e\.currentTarget\)/);
});
test('追加 3：#dirq 與 #trans 的 keydown 忽略按住重複的按鍵', () => {
  for (const name of ['dirKeydown', 'transKeydown']) {
    let prevented = 0, cancelled = 0;
    const f = load(fn(name), name, { dirCancel: () => cancelled++, transCancel: () => cancelled++, $: () => ({ querySelectorAll: () => [] }), document: {}, focusStep: P.focusStep });
    f({ repeat: true, key: 'Escape', preventDefault: () => prevented++, stopPropagation() {} });
    assert.equal(prevented, 1, name); assert.equal(cancelled, 0, name + ' 重複的 Esc 不取消');
    f({ repeat: false, key: 'Escape', preventDefault() {}, stopPropagation() {} });
    assert.equal(cancelled, 1, name);
  }
  assert.match(html, /addEventListener\('keydown', transKeydown\)/); assert.match(html, /addEventListener\('keydown', dirKeydown\)/);
});
test('追加 4：rpWaitTrans 不再說「選擇變速箱」（變速箱選車時就選好了）', () => {
  assert.match(html, /rpWaitTrans: '等待對手…'/); assert.match(html, /rpWaitTrans: 'Waiting for your opponent…'/);
});
test('追加 6：設定視窗開著時，滑鼠點選後焦點留在選到的控制項', () => {
  const l = line('const keepPickFocus');
  const run = tm => { let got; const f = load(l, 'keepPickFocus', { focusKeep: (r, a, by) => { got = by; return () => {}; }, $: () => null, document: { activeElement: null }, pickByPointer: true, tmOpen: tm }); f(); return got; };
  assert.equal(run(null), true, '主畫面：維持點擊後 Enter 仍可開始比賽的規則');
  assert.equal(run('#mCar'), false, '視窗內：保留焦點');
});
