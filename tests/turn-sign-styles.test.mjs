// 彎道提示的顯示方式（side / big / preview / sound / off）：設定值解析、預告列取下兩個彎、嗶聲判斷、畫面更新行為與設定介面
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../yatouge.html', import.meta.url), 'utf8');
function block(name) {
  const open = `/* @${name}:start */`, s = html.indexOf(open), e = html.indexOf(`/* @${name}:end */`);
  assert.ok(s >= 0 && e > s, `找不到 @${name} 區塊`);
  return html.slice(s + open.length, e);
}
const M = new Function(`${block('course-geometry')}\n${block('turn-signs')}
return { buildCourse, TS, cornerList, nextSign, nextTwoSigns, tsIcon, tsLabel, tsAria, TS_STYLES, tsStyleFrom, tsDraws, tsBeeps, TS_PREVIEW_GAP, tsPopTop, tsPopPlace, tsGoGated };`)();
const { buildCourse, cornerList, nextSign, nextTwoSigns, tsIcon, tsLabel, tsAria, TS_STYLES, tsStyleFrom, tsDraws, tsBeeps, TS_PREVIEW_GAP, tsPopTop, tsPopPlace, tsGoGated } = M;

test('顯示方式清單：side（預設）、big、preview、sound、off', () => {
  assert.deepEqual(TS_STYLES, ['side', 'big', 'preview', 'sound', 'off']);
});

test('設定值解析：合法值照用；沒有新設定時，舊的 yatouge-turn-signs 只有 "0" 轉成 off，其他一律 side', () => {
  for (const st of TS_STYLES) assert.equal(tsStyleFrom(st, null), st);
  for (const st of TS_STYLES) assert.equal(tsStyleFrom(st, '0'), st, '新設定優先於舊設定');
  assert.equal(tsStyleFrom(null, '0'), 'off');
  assert.equal(tsStyleFrom(undefined, '0'), 'off');
  assert.equal(tsStyleFrom(null, '1'), 'side');
  assert.equal(tsStyleFrom(null, null), 'side');
  assert.equal(tsStyleFrom(undefined, undefined), 'side');
  assert.equal(tsStyleFrom('', ''), 'side');
  assert.equal(tsStyleFrom('huge', 'x'), 'side', '壞資料退回 side');
  assert.equal(tsStyleFrom('huge', '0'), 'off', '壞的新設定仍可用舊的關閉');
  assert.equal(tsStyleFrom('constructor', null), 'side', '不被原型屬性騙過');
  assert.equal(tsStyleFrom(['side'], null), 'side');
});

test('畫面與嗶聲判斷：side/big/preview 畫圖示，sound/off 不畫；off 以外都嗶', () => {
  assert.deepEqual(TS_STYLES.map(tsDraws), [true, true, true, false, false]);
  assert.deepEqual(TS_STYLES.map(tsBeeps), [true, true, true, true, false]);
});

const L = [
  { s0: 500, s1: 560, kind: 'mid', dir: 'R' },
  { s0: 700, s1: 760, kind: 'big', dir: 'L' },
  { s0: 2000, s1: 2060, kind: 'hairpin', dir: 'R' }
];

test('nextTwoSigns：第一個與 nextSign 完全相同，沒有下一個彎時回傳 null', () => {
  for (const [s, v] of [[0, 20], [441, 10], [500, 20], [520, 20], [650, 20], [2000, 20], [3000, 20]]) {
    const a = nextSign(L, s, v), b = nextTwoSigns(L, s, v);
    if (!a) assert.equal(b, null, `s=${s}`);
    else { assert.equal(b.i, a.i); assert.equal(b.k, a.k); }
  }
});

test('nextTwoSigns：下一個彎夠近（入口距前一個彎出口 ≤ TS_PREVIEW_GAP）才帶第二個，太遠只有第一個', () => {
  assert.equal(TS_PREVIEW_GAP, 200);
  const a = nextTwoSigns(L, 450, 10);
  assert.equal(a.i, 0); assert.equal(a.second.i, 1); assert.equal(a.second.k, L[1]);
  const b = nextTwoSigns(L, 650, 10);
  assert.equal(b.i, 1); assert.equal(b.second, null, '760 → 2000 相隔 1240 m');
  const edge = [{ s0: 0, s1: 50, kind: 'mid', dir: 'L' }, { s0: 50 + TS_PREVIEW_GAP, s1: 300, kind: 'mid', dir: 'R' }, { s0: 50 + TS_PREVIEW_GAP + 1 + 250, s1: 600, kind: 'big', dir: 'L' }];
  assert.equal(nextTwoSigns(edge, -10, 10).second.i, 1, '剛好 200 m 算近');
  edge[1].s0 += 1;
  assert.equal(nextTwoSigns(edge, -10, 10).second, null, '201 m 算遠');
});

test('nextTwoSigns：最後一個彎沒有第二個；第一個消失後第二個變成第一個；不改動輸入', () => {
  const near2 = [{ s0: 500, s1: 520, kind: 'hairpin', dir: 'R' }, { s0: 530, s1: 550, kind: 'hairpin', dir: 'L' }, { s0: 600, s1: 640, kind: 'mid', dir: 'R' }];
  const copy = JSON.parse(JSON.stringify(near2));
  assert.equal(nextTwoSigns(near2, 480, 10).second.i, 1);
  const mid = nextTwoSigns(near2, 500 + 15 + 1, 10);
  assert.equal(mid.i, 1); assert.equal(mid.second.i, 2);
  assert.equal(nextTwoSigns(near2, 560, 10).second, null, '最後一個彎沒有下一個');
  assert.equal(nextTwoSigns([], 1, 1), null);
  assert.deepEqual(near2, copy);
});

test('真實賽道：預告列的第二個永遠是第一個的下一個彎；青嵐峠連續彎多，有第二個的比例明顯比白狼峠高', () => {
  const stat = {};
  for (const id of ['kurosagi', 'seiran', 'hakuro']) {
    const c = buildCourse(id), list = cornerList(c.pts);
    let withSecond = 0, total = 0;
    for (let s = 0; s < c.TOTAL; s += 3) {
      const r = nextTwoSigns(list, s, 25);
      if (!r) continue;
      total++;
      if (r.second) { withSecond++; assert.equal(r.second.i, r.i + 1); assert.ok(r.second.k.s0 - r.k.s1 <= TS_PREVIEW_GAP); }
    }
    stat[id] = withSecond / total;
    assert.ok(total > 0);
  }
  assert.ok(stat.seiran > 0.2, `青嵐峠 ${stat.seiran}`);
  for (const id of Object.keys(stat)) assert.ok(stat[id] < 1, `${id} 也有只顯示一個的位置（第二個太遠）`);
});

test('tsAria：只有第一個時等於 tsLabel；有第二個時兩段用「，」或「, 」串起來', () => {
  assert.equal(tsAria('zh', 'mid', 'R', null, null), tsLabel('zh', 'mid', 'R'));
  assert.equal(tsAria('en', 'mid', 'R', undefined, undefined), tsLabel('en', 'mid', 'R'));
  assert.equal(tsAria('zh', 'mid', 'R', 'hairpin', 'L'), tsLabel('zh', 'mid', 'R') + '，接著' + tsLabel('zh', 'hairpin', 'L'));
  assert.equal(tsAria('en', 'mid', 'R', 'hairpin', 'L'), tsLabel('en', 'mid', 'R') + ', then ' + tsLabel('en', 'hairpin', 'L'));
});

/* ---------- turnSignFrame 的行為（用假的 DOM 跑真的函式）---------- */
function harness(style, extra = {}) {
  const hide = /function tsHide\(\) \{[^\n]*\}/.exec(html)[0];
  const clr = /function tsPopClear\(pop\) \{[^\n]*\}/.exec(html)[0];
  const fr = /function turnSignFrame\(\) \{[\s\S]*?\n\}/.exec(html)[0];
  const els = {};
  const st = {}, calls = { rect: 0, top: 0, pop: 0 };
  const el = { st, dataset: {}, attrs: {}, className: '', innerHTML: '',
    classList: { contains: c => el.className.split(' ').includes(c), remove: (...c) => { el.className = el.className.split(' ').filter(x => x && !c.includes(x)).join(' '); } },
    setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
    style: { setProperty(k, v) { st[k] = v; calls.top++; }, removeProperty(k) { delete st[k]; } } };
  els['#turnSign'] = el;
  const pcls = new Set(), pst = {};
  els['#pop'] = { cls: pcls, st: pst, classList: { add: c => pcls.add(c), remove: (...c) => c.forEach(x => pcls.delete(x)), contains: c => pcls.has(c) }, style: { setProperty(k, v) { pst[k] = v; calls.pop++; }, removeProperty(k) { delete pst[k]; } } };
  el.getBoundingClientRect = () => { calls.rect++; return { bottom: env.bottom ?? 200, top: (env.bottom ?? 200) - 100, left: env.left ?? 600 }; };
  let beeps = [];
  const env = { tsStyle: style, state: 'race', sakeRun: false, tsList: L, tsCur: '', pts: [], car: { loc: { s: 450 }, vx: 0, vz: 10 }, lang: 'zh', mirror: 0, cam: 'chase', goUntil: 0, now: 1000, ...extra };
  const fn = new Function('M', 'env', 'els', 'beeps', `
    const { nextTwoSigns, cornerList, tsIcon, tsLabel, tsAria, tsDraws, tsBeeps, tsPopTop, tsPopPlace, tsGoGated } = M;
    const $ = q => els[q]; let { tsStyle, state, sakeRun, tsList, tsCur, pts, car, lang, goUntil } = env; let tsKey = '';
    const performance = { now: () => env.now };
    const getComputedStyle = () => ({ fontSize: '40px' });
    const window = { innerWidth: env.w ?? 1280, innerHeight: env.h ?? 720 };
    const camNow = () => env.cam; let tsMirrorBottom = env.mirror;
    const sfxTurnSign = d => beeps.push(d ? 2 : 1);
    ${clr}
    ${hide}
    ${fr}
    return { frame: turnSignFrame, hide: tsHide, set: (k, v) => { ({ tsStyle: () => tsStyle = v, state: () => state = v, tsList: () => tsList = v, sakeRun: () => sakeRun = v, mirror: () => tsMirrorBottom = v, cam: () => env.cam = v, go: () => goUntil = v, now: () => env.now = v, w: () => window.innerWidth = v, bottom: () => env.bottom = v, h: () => window.innerHeight = v })[k](); }, car, cur: () => tsCur };
  `)(M, env, els, beeps);
  return { ...fn, el, beeps, pop: els['#pop'], calls };
}

test('turnSignFrame side：和以前完全一樣的 class、一個圖示、一聲；同一個彎不重複嗶', () => {
  const h = harness('side');
  h.frame(); h.frame(); h.frame();
  assert.equal(h.el.className, 'tsign r show');
  assert.equal(h.el.innerHTML, tsIcon('mid', 'R'));
  assert.deepEqual(h.beeps, [1]);
  assert.equal(h.el.attrs['aria-hidden'], undefined);
  assert.equal(h.el.attrs['aria-label'], tsLabel('zh', 'mid', 'R'));
  assert.deepEqual(h.el.st, {}, 'side 不碰 --ts-top');
});

test('turnSignFrame side：髮夾彎有 flash 並嗶兩聲', () => {
  const h = harness('side', { tsList: [{ s0: 500, s1: 520, kind: 'hairpin', dir: 'L' }] });
  h.frame();
  assert.equal(h.el.className, 'tsign l show flash');
  assert.deepEqual(h.beeps, [2]);
});

test('turnSignFrame big：置中大圖示（class big），同一個圖示，嗶一聲；車內視角把後照鏡下緣寫進 --ts-top', () => {
  const h = harness('big');
  h.frame(); h.frame();
  assert.equal(h.el.className, 'tsign big show');
  assert.equal(h.el.innerHTML, tsIcon('mid', 'R'));
  assert.deepEqual(h.beeps, [1]);
  assert.equal(h.el.st['--ts-top'], undefined, '追車視角沒有後照鏡，用 CSS 預設');
  const c = harness('big', { cam: 'cockpit', mirror: 171.5 });
  c.frame();
  assert.equal(c.el.st['--ts-top'], '171.5px');
  c.set('mirror', 190); c.frame();
  assert.equal(c.el.st['--ts-top'], '190px', '每個 frame 更新（HUD 換行時跟著動）');
});

test('turnSignFrame preview：兩個圖示（第二個 p2），第二個很遠時只有一個；一次嗶聲以第一個為準', () => {
  const h = harness('preview');
  h.frame();
  assert.equal(h.el.className, 'tsign pre show');
  assert.ok(h.el.innerHTML.includes('class="p1"') && h.el.innerHTML.includes('class="p2"'));
  assert.ok(h.el.innerHTML.includes(tsIcon('mid', 'R')) && h.el.innerHTML.includes(tsIcon('big', 'L')));
  assert.equal(h.el.attrs['aria-label'], tsAria('zh', 'mid', 'R', 'big', 'L'));
  assert.equal(h.el.dataset.k2, 'big');
  assert.deepEqual(h.beeps, [1]);
  h.car.loc.s = 650; h.frame();
  assert.ok(h.el.innerHTML.includes('class="p1"') && !h.el.innerHTML.includes('class="p2"'), '第二個太遠只顯示第一個');
  assert.equal(h.el.dataset.k2, undefined);
  assert.deepEqual(h.beeps, [1, 1]);
});

test('turnSignFrame preview：車內視角把後照鏡下緣寫進 --ts-top，追車視角不設（切回追車時清掉）', () => {
  const c = harness('preview', { cam: 'cockpit', mirror: 150 });
  c.frame();
  assert.equal(c.el.st['--ts-top'], '150px');
  c.set('cam', 'chase'); c.frame();
  assert.equal(c.el.st['--ts-top'], undefined);
  const h = harness('preview'); h.frame();
  assert.equal(h.el.st['--ts-top'], undefined);
  const s = harness('side', { cam: 'cockpit', mirror: 150 }); s.frame();
  assert.equal(s.el.st['--ts-top'], undefined, 'side 不碰');
});

test('turnSignFrame preview：第一個是髮夾彎時 flash 在第一個圖示上、嗶兩聲', () => {
  const h = harness('preview', { tsList: [{ s0: 500, s1: 520, kind: 'hairpin', dir: 'L' }, { s0: 560, s1: 580, kind: 'mid', dir: 'R' }] });
  h.frame();
  assert.ok(/class="p1 flash"/.test(h.el.innerHTML) && !/class="p2 flash"/.test(h.el.innerHTML));
  assert.equal(h.el.className, 'tsign pre show');
  assert.deepEqual(h.beeps, [2]);
});

test('turnSignFrame sound：嗶聲照舊但畫面不顯示；同一個彎只嗶一次，下一個彎再嗶', () => {
  const h = harness('sound');
  h.frame(); h.frame();
  assert.deepEqual(h.beeps, [1]);
  assert.equal(h.el.className, '', '不碰 DOM');
  assert.equal(h.el.innerHTML, '');
  h.car.loc.s = 650; h.frame();
  assert.deepEqual(h.beeps, [1, 1]);
  h.car.loc.s = 0; h.frame();
  assert.equal(h.cur(), '', '沒有彎時重置');
});

test('turnSignFrame off：沒有畫面也沒有聲音', () => {
  const h = harness('off');
  h.frame(); h.frame();
  assert.deepEqual(h.beeps, []);
  assert.equal(h.el.className, '');
});

test('turnSignFrame：送酒模式、非 race 狀態都不顯示也不嗶（所有方式）', () => {
  for (const st of TS_STYLES) {
    const a = harness(st, { sakeRun: { x: 1 } }); a.frame();
    const b = harness(st, { state: 'count' }); b.frame();
    const c = harness(st, { state: 'done' }); c.frame();
    for (const h of [a, b, c]) { assert.deepEqual(h.beeps, [], st); assert.equal(h.el.className, '', st); }
  }
});

test('切換顯示方式：tsHide 之後同一個彎用新方式重畫（side → big）', () => {
  const h = harness('side');
  h.frame(); assert.equal(h.el.className, 'tsign r show');
  h.set('tsStyle', 'big'); h.hide(); h.frame();
  assert.equal(h.el.className, 'tsign big show');
});

/* ---------- 設定與介面（靜態檢查）---------- */
test('設定 key：yatouge-turn-style，舊 yatouge-turn-signs 只用來轉換', () => {
  assert.ok(/tsStyle = tsStyleFrom\(store\.get\('yatouge-turn-style'\), store\.get\('yatouge-turn-signs'\)\)/.test(html));
  assert.ok(/store\.set\('yatouge-turn-style', tsStyle\)/.test(html));
  assert.equal((html.match(/store\.set\('yatouge-turn-signs'/g) || []).length, 0, '不再寫舊 key');
});

test('主畫面與遊戲內選單：彎道提示是 <select>（label for），不再是開關', () => {
  assert.ok(/<label for="tTurn" data-i18n="turnSigns">彎道提示<\/label><select id="tTurn"><\/select>/.test(html));
  assert.ok(/<label for="igTurn" data-i18n="turnSigns">彎道提示<\/label><select id="igTurn"><\/select>/.test(html));
  assert.equal(/id="tTurn"[^>]*role="switch"/.test(html) || /id="igTurn"[^>]*role="switch"/.test(html), false);
  assert.ok(/turnSigns: 'Turn signs'/.test(html));
});

test('選項標籤有中英文，且選項由 menuRelabel 填入、syncKxUI 兩邊同步', () => {
  for (const st of TS_STYLES) {
    assert.ok(new RegExp(`tsM_${st}: '[^']+'`).test(html.slice(html.indexOf('turnSigns: \'彎道提示\''), html.indexOf('turnSigns: \'Turn signs\''))), `zh ${st}`);
    assert.ok(new RegExp(`tsM_${st}: '[^']+'`).test(html.slice(html.indexOf('turnSigns: \'Turn signs\'', html.indexOf('turnSigns: \'彎道提示\'') + 10))), `en ${st}`);
  }
  const mr = /function menuRelabel\(\) \{[\s\S]*?\n\}/.exec(html)[0];
  assert.ok(/for \(const id of \['#tTurn', '#igTurn'\]\)/.test(mr) && /T\('tsM_' \+ m\)/.test(mr), 'menuRelabel 填兩個選擇器');
  const sk = /function syncKxUI\(\) \{[\s\S]*?\n\}/.exec(html)[0];
  assert.ok(/\$\(id\)\.value = tsStyle/.test(sk), 'syncKxUI 同步兩個選擇器');
  assert.equal(/\['#tTurn', '#igTurn'\], tsOn/.test(sk), false);
  assert.ok(/for \(const id of \['#tTurn', '#igTurn'\]\) \$\(id\)\.addEventListener\('change'/.test(html));
});

test('中文用詞：沒有「圖標」「倒後鏡」', () => {
  const zh = html.slice(html.indexOf('turnSigns: \'彎道提示\'') - 200, html.indexOf('turnSigns: \'彎道提示\'') + 400);
  assert.equal(/圖標|倒後鏡/.test(zh), false);
  assert.equal(/tsM_[a-z]+: '[^']*(圖標|倒後鏡)/.test(html), false);
});

test('CSS：big 與 preview 置中、避開 HUD；手機橫向縮小；後照鏡下緣用 --ts-top', () => {
  assert.ok(/\.tsign\.big, \.tsign\.pre \{[^}]*left: 50%/.test(html));
  assert.ok(/\.tsign\.pre \.p2 \{[^}]*opacity: \.6/.test(html), '第二個較淡');
  assert.ok(/\.tsign\.pre \.p2 \{[^}]*calc\(var\(--p1\) \* \.6\)/.test(html), '第二個約 60%');
  assert.ok(/var\(--ts-top, 0px\)/.test(html));
  const land = /@media \(orientation: landscape\) and \(max-height: 500px\) \{[^\n]*\.tsign\.big[^\n]*\}/.exec(html);
  assert.ok(land, '手機橫向有 big 的縮小規則');
  assert.ok(/\.tsign \{ top: calc\(80px \+ env\(safe-area-inset-top, 0px\)\); width: 60px; \}/.test(html), 'side 的手機規則不變');
});

test('layoutMirror 記下後照鏡下緣（tsMirrorBottom），且宣告在第一次 resize()/layoutMirror 之前', () => {
  const lm = /function layoutMirror\(w, h\) \{[\s\S]*?\n\}/.exec(html)[0];
  assert.ok(/tsMirrorBottom = top \+ mh \+ 16/.test(lm));
  const decl = /\blet tsMirrorBottom = 0/.exec(html);
  assert.ok(decl && decl.index < html.indexOf('function layoutMirror'), '宣告順序');
  assert.ok(decl.index < html.indexOf('\nresize()') || decl.index < html.indexOf('window.addEventListener(\'resize\', resize); resize();'));
});

test('載入順序：tsStyle 與 tsMirrorBottom 必須在第一次頂層 buildTrack() / resetRace() / buildCars() / applyLang() 之前宣告', () => {
  const calls = ['\nbuildTrack(trackId);\n', '\nresetRace();\n', '\nbuildCars();\n', '\napplyLang();\n'].map(c => html.indexOf(c));
  assert.ok(calls.every(i => i > 0), '找不到頂層呼叫');
  const first = Math.min(...calls);
  for (const name of ['tsStyle', 'tsList', 'tsCur', 'tsKey', 'goUntil']) {
    const m = new RegExp(String.raw`\blet\b[^;\n]*\b${name}\b\s*(?:=|[,;])`).exec(html);
    assert.ok(m, `找不到 ${name} 的 let 宣告`);
    assert.ok(m.index < first, `${name} 宣告在第一次頂層呼叫之後`);
  }
  const mb = /\blet tsMirrorBottom\b/.exec(html);
  assert.ok(mb, '找不到 tsMirrorBottom');
  // layoutMirror 只在 resize() 與 frame 裡被呼叫（都在宣告之後）
  assert.ok(mb.index < html.indexOf('window.addEventListener(\'resize\', resize); resize();'));
});

test('更新內容：2026-11-14 那筆有中英文的彎道提示說明', () => {
  const ent = /\{ date: '2026-11-14',[\s\S]*?\},\n  \{ date: '2026-11-13'/.exec(html)[0];
  assert.ok(/彎道提示/.test(ent) && /[Tt]urn signs/.test(ent));
});

test('GO 文字還在時（goUntil 之前）只有 big / preview 等它消失；side / sound 與以前一樣第一個 race frame 就顯示或嗶', () => {
  assert.deepEqual(TS_STYLES.map(st => tsGoGated(st, true)), [false, true, true, false, false]);
  assert.deepEqual(TS_STYLES.map(st => tsGoGated(st, false)), [false, false, false, false, false]);
  for (const st of TS_STYLES) {
    const h = harness(st, { goUntil: 1700 });
    h.frame(); h.frame();
    const gated = st === 'big' || st === 'preview';
    assert.deepEqual(h.beeps, gated || st === 'off' ? [] : [1], st + ' GO 期間');
    assert.equal(h.el.className !== '', !gated && tsDraws(st), st + ' GO 期間的畫面');
    h.set('go', 0); h.frame(); h.frame(); h.frame(); // 700 ms later the main loop's goTick has cleared goUntil
    assert.deepEqual(h.beeps, st === 'off' ? [] : [1], st + ' 整段只嗶一次');
    assert.equal(h.el.className !== '', tsDraws(st), st);
  }
});

test('每幀成本：版面（getBoundingClientRect、setProperty）只在提示、方式、視角、後照鏡下緣或視窗大小改變時重算', () => {
  const h = harness('big', { cam: 'cockpit', mirror: 150, bottom: 300 });
  for (let i = 0; i < 20; i++) h.frame();
  assert.equal(h.calls.rect, 1); assert.equal(h.calls.top, 1); assert.equal(h.calls.pop, 1);
  h.set('mirror', 160); h.frame(); h.frame();
  assert.deepEqual([h.calls.rect, h.calls.top, h.calls.pop], [2, 2, 2], '後照鏡下緣變了才重算');
  h.set('cam', 'chase'); h.frame(); h.frame();
  assert.equal(h.calls.rect, 3, '視角變了重算');
  h.set('w', 844); h.frame(); h.frame();
  assert.equal(h.calls.rect, 4, '視窗大小變了重算');
  h.car.loc.s = 650; h.frame(); h.frame();
  assert.equal(h.calls.rect, 5, '換下一個彎重算');
  const sd = harness('side'); for (let i = 0; i < 20; i++) sd.frame();
  assert.deepEqual([sd.calls.rect, sd.calls.top, sd.calls.pop], [0, 0, 0], 'side 不做版面工作');
  const rm = harness('big'); rm.frame(); rm.set('tsStyle', 'side'); rm.hide(); rm.frame();
  assert.equal(rm.pop.cls.has('ts-below'), false);
});

test('tsPopTop：提示下緣 + 8 px', () => {
  assert.equal(tsPopTop(300), 308); assert.equal(tsPopTop(128.4), 136);
});

test('置中提示（#pop）：big / preview 顯示時被推到提示下方，side / sound 不動，提示消失就還原', () => {
  for (const st of ['big', 'preview']) {
    const h = harness(st, { bottom: 333 });
    h.frame();
    assert.ok(h.pop.cls.has('ts-below'), st); assert.equal(h.pop.st['--ts-pop'], '341px', st);
    h.set('bottom', 350); h.set('w', 900); h.frame();
    assert.equal(h.pop.st['--ts-pop'], '358px', st + ' 每個 frame 更新');
    h.set('state', 'done'); h.frame();
    assert.equal(h.pop.cls.has('ts-below'), false, st + ' 提示消失就還原');
  }
  for (const st of ['side', 'sound', 'off']) { const h = harness(st); h.frame(); assert.equal(h.pop.cls.size, 0, st); assert.deepEqual(h.pop.st, {}, st); }
  const sw = harness('big'); sw.frame(); sw.set('tsStyle', 'side'); sw.hide(); sw.frame();
  assert.equal(sw.pop.cls.has('ts-below'), false, '換成 side 就還原');
  assert.ok(/#pop\.ts-below \{ top: max\(26%, var\(--ts-pop\)\); \}/.test(html) && /#pop\.ts-below \{ top: max\(20%, var\(--ts-pop\)\); \}/.test(html), '兩種 pop 位置都有對應規則');
});

test('後照鏡版面在 hud() 之前算好（turnSignFrame 讀到的 tsMirrorBottom 是這一幀的），且只算一次', () => {
  const call = 'layoutMirror(window.innerWidth, window.innerHeight)';
  assert.equal(html.split(call).length - 1, 1);
  assert.ok(html.indexOf(call) < html.indexOf("if (state !== 'title') hud(dt)"));
  assert.ok(html.indexOf('const mirrorOn') < html.indexOf(call));
});

test('goUntil：GO 寫入時設為 now + 700 ms，由主迴圈的 goTick 到期清除（不再有計時器）；倒數開始、結束、回標題、重置時清掉；turnSignFrame 不讀 DOM 文字', () => {
  assert.ok(/textContent = 'GO'; goUntil = performance\.now\(\) \+ 700;/.test(html));
  assert.ok(html.includes('goTick(performance.now());'), '主迴圈清除 GO');
  assert.ok(/textContent = '3'; goUntil = 0;/.test(html));
  assert.ok((html.match(/textContent = ''; goUntil = 0;/g) || []).length >= 4, '重置、回標題、結束、離開線上等處');
  const m = /function turnSignFrame\(\) \{[\s\S]*?\n\}/.exec(html)[0];
  assert.equal(m.includes('#count'), false);
});

test('turnSignFrame 只看 goUntil 是否大於 0：有值就擋 big / preview，清成 0 就顯示（過期由主迴圈的 goTick 負責，見 go-clear.test.mjs）', () => {
  for (const st of ['big', 'preview']) {
    const h = harness(st, { goUntil: 1700, now: 1000 });
    h.frame(); assert.equal(h.el.className, '', st + ' goUntil 有值就擋');
    h.set('go', 0); h.frame(); assert.notEqual(h.el.className, '', st + ' goUntil 清掉就顯示');
    assert.deepEqual(h.beeps, [1]);
  }
});

test('tsPopPlace：桌機放在提示下方；手機橫向車內（下方會超過 62% 高度）改放提示左側', () => {
  const desk = tsPopPlace({ left: 565, top: 72, bottom: 222 }, 100, 1280, 720);
  assert.deepEqual(desk, { mode: 'below', top: 230 });
  const phone = tsPopPlace({ left: 384, top: 131, bottom: 197 }, 70, 844, 390);
  assert.equal(phone.mode, 'beside');
  assert.equal(phone.top, 164, '垂直置中於提示');
  assert.equal(phone.right, 844 - 384 + 12, '右緣 = 提示左緣 - 12');
  assert.equal(phone.maxWidth, 384 - 24);
});

test('tsPopPlace：邊界，下緣剛好 62% 仍在下方，多 1 px 就改放旁邊', () => {
  const at = tsPopPlace({ left: 400, top: 0, bottom: 92 }, 100, 1000, 500); // top 100 + 100 = 200... 
  assert.equal(at.mode, 'below');
  const edge = tsPopPlace({ left: 400, top: 0, bottom: 202 }, 100, 1000, 500); // 210 + 100 = 310 = 62% of 500
  assert.equal(edge.mode, 'below');
  assert.equal(tsPopPlace({ left: 400, top: 0, bottom: 203 }, 100, 1000, 500).mode, 'beside');
});

test('置中提示：手機橫向 big 改放旁邊（ts-beside，不加 ts-below），提示消失與換樣式都清掉', () => {
  const h = harness('big', { bottom: 197, left: 384, w: 844, h: 390, cam: 'cockpit', mirror: 100 });
  h.frame();
  assert.ok(h.pop.cls.has('ts-beside')); assert.equal(h.pop.cls.has('ts-below'), false);
  assert.equal(h.pop.st['--ts-pop-r'], '472px'); assert.equal(h.pop.st['--ts-pop-w'], '360px'); assert.equal(h.pop.st['--ts-pop-y'], '147px');
  h.set('w', 1280); h.set('h', 720); h.set('bottom', 222); h.frame();
  assert.ok(h.pop.cls.has('ts-below')); assert.equal(h.pop.cls.has('ts-beside'), false, '回到桌機尺寸就換回下方');
  assert.equal(h.pop.st['--ts-pop-r'], undefined);
  h.set('w', 844); h.set('h', 390); h.set('bottom', 197); h.frame();
  assert.ok(h.pop.cls.has('ts-beside'));
  h.set('state', 'done'); h.frame();
  assert.equal(h.pop.cls.size, 0, '消失時全部清掉');
  assert.deepEqual(h.pop.st, {}, '變數也清掉');
  assert.ok(/#pop\.ts-beside \{[^}]*right: var\(--ts-pop-r\)[^}]*max-width: var\(--ts-pop-w\)/.test(html), 'CSS 有 ts-beside 規則');
});
