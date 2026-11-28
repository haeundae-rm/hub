// 🗨 룸체 · 악취 자세히 · 메모 한 줄 시험 (2026-11-28) — node test/memo_run.js (가명)
//   정비보고서 「🌙 초안 만들기」(전 객실 4) → 연박 · 공실 표시 → 🧩 자동 배정 「📋 정비보고서 앱에서 불러오기」(출근자 = HK 전파)
//   → 차이 표시 · 자동 배정 꺼짐 → 📦 미정비 남기기(유닛 기준, 엔진이 고릅니다 / 층 누르기) → 차이 0 → 확인 창(초안 숫자) → 엔진 → ✅ 확정 → 정비보고서에 이름 · 미정비 · 카드 · 기록
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = { hub: path.resolve(__dirname, '..'), rm: process.env.RM || path.resolve(__dirname, '../../rm') };
const BASE = 'https://haeundae-rm.github.io/';
let pass = 0, fail = 0; const ok = (c, l) => { c ? pass++ : fail++; console.log((c ? '  ✅ ' : '  ❌ ') + l); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TODAY = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const T1 = new Date(Date.parse(TODAY + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
const Y1 = new Date(Date.parse(TODAY + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);
const ROOMS = []; for (let f = 31; f >= 4; f--) for (let s = 1; s <= 17; s++) ROOMS.push(String(f * 100 + s));
const MAIDS = ['가람', '나래', '다솜', '라온'];
const SEED = {
  'meta/rsync': { on: true, at: Date.now() },
  ['jbr/' + Y1]: { date: Y1, src: 'excel', rooms: ROOMS, r: Object.fromEntries(ROOMS.map(r => [r, ['1', '가람', '', '', 1, 0]])), xl: {}, cards: [], groups: [], roster: MAIDS, at: Date.now() },
  ['jbr/' + TODAY]: { date: TODAY, src: 'app', rooms: ROOMS, r: Object.fromEntries(ROOMS.map(r => { const n = +r; const who = n >= 401 && n <= 410 ? '가람' : (n >= 411 && n <= 417) || (n >= 501 && n <= 503) ? '나래' : n >= 504 && n <= 513 ? '다솜' : n >= 514 && n <= 517 ? '마루' : ''; return [r, who ? ['1', who, '', '', 0, 0] : ['', '', '', '', 0, 1]]; })), xl: {}, cards: [{ n: '가람', u: '10' }, { n: '나래', u: '9' }, { n: '다솜', u: '11' }, { n: '라온', u: '휴' }, { n: '마루', u: 4, h: 3 }], groups: [], roster: MAIDS.concat(['마루']), at: Date.now() },
  ['rmsched_hk/' + T1]: { date: T1, rm: MAIDS.map(n => ({ n, u: 9, up: false })), all: MAIDS.map(n => ({ n, d: '', out: false })), mon: T1, sum: {}, note: '', helpers: [] }
};
const ENGINE_STUB = `export async function readRoster() { return ['가람', '나래', '다솜', '라온']; }
export async function buildFromXlsx(buf, ds) { const rooms = []; for (let f = 31; f >= 4; f--) for (let s = 1; s <= 17; s++) { const k = String(f * 100 + s); rooms.push({ room: k, st: f <= 7 ? '4' : '', name: f <= 7 ? ['가람', '나래', '다솜', '라온'][s % 4] : '', m1: '', m2: k === '401' ? '미정비' : '', done: '', st_fill: f >= 8 && s % 2 ? 'FFFFFF00' : '' }); }
  return { summary: { ok: true, checks: [] }, data: { rooms, cards: ['가람', '나래', '다솜', '라온'].map(n => ({ name: n, unit: 17, in: '' })), groups: [{ name: '시험단체', time: '15:00', rooms: ['501', '502'] }], xl: { '정비수': 68 } }, sheet: ds.slice(8) }; }
export const _test = {};`;
async function open(browser) {
  const ctx = await browser.newContext({ locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript(s => { window.__seed = s; window.__live = 1; sessionStorage.setItem('fu', JSON.stringify({ uid: 'nBL2QYezEmRNRmBRMXN6LNPJO2s2', anon: false, email: 'unieshaeundae+hk@gmail.com' })); }, SEED);
  await ctx.route('**/*', async route => {
    const u = route.request().url();
    if (!u.startsWith(BASE)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    const rel = u.slice(BASE.length).split('?')[0].split('#')[0]; const [app, ...rest] = rel.split('/'); let f = rest.join('/') || 'index.html';
    if (f.endsWith('/')) f += 'index.html';
    if (app === 'rm' && f === 'app/engine.js') return route.fulfill({ status: 200, contentType: 'application/javascript', body: ENGINE_STUB });
    const file = app === 'rm' && f === 'app/store.js' ? path.join(__dirname, 'fake_store.js') : path.join(ROOT[app] || '/nope', f);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
    const ct = /\.js$/.test(file) ? 'application/javascript' : /\.html$/.test(file) ? 'text/html' : 'application/json';
    return route.fulfill({ status: 200, contentType: ct + '; charset=utf-8', body: fs.readFileSync(file) });
  });
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', e => p.errs.push(String(e))); p.on('console', m => { if (m.type() === 'error' && !/Failed to load|404/.test(m.text())) p.errs.push(m.text()); });
  p.on('dialog', x => x.accept());
  await p.goto(BASE + 'hub/jbr/'); await p.waitForSelector('.c[data-i]', { timeout: 8000 });
  return p;
}
const doc = (p, k) => p.evaluate(k => JSON.parse(JSON.stringify(window.__seed[k] || null)), k);
const asp = p => p.innerText('#asp');

(async () => {
  const b = await chromium.launch();
  const p = await open(b);
  await p.locator('#days button', { hasText: (+TODAY.slice(8)) + '일' }).first().click().catch(() => {}); await sleep(300);
  const cell = r => p.locator('.c[data-i]').filter({ has: p.locator('.no', { hasText: new RegExp('^' + r) }) }).first();
  const doc0 = async r => { const d = await doc(p, 'jbr/' + TODAY); return d.r[r]; };
  console.log('① 룸체 → 호실');
  await cell('402').click(); await sleep(100);
  await p.click('[data-memo="룸체"]'); await sleep(150);
  ok(await p.locator('#mpop').isVisible() && /어디로 룸체인지/.test(await p.innerText('#mpop')), '「어디로 룸체인지하나요?」 창');
  await p.keyboard.type('9999'); await sleep(100); ok(/없는 호실/.test(await p.innerText('#mpst')), '없는 호실 알림');
  await p.fill('#mpin', '801'); await sleep(100); ok(/801 · 연박/.test(await p.innerText('#mpst')), '상대 방 상태: ' + await p.innerText('#mpst'));
  await p.keyboard.press('Enter'); await sleep(300);
  let x = await doc0('402'); ok(x[2] === '룸체→801' && x[0] === '1', '저장 「룸체→801」 (숫자 칸에서 1~7 단축키 안 먹음 · 상태 그대로 1)');
  ok(await p.locator('#mpop').count() === 0, 'Enter 로 닫힘');
  ok((await doc0('801'))[2] === '402에서 옴', '상대 방 801 에 「402에서 옴」 (룸체 글자 없음)');
  console.log('② 다시 누르면 지금 값 · 고치기 · 지우기');
  await cell('402').click(); await p.click('[data-memo="룸체"]'); await sleep(150);
  ok(await p.inputValue('#mpin') === '801', '지금 값 801');
  await p.fill('#mpin', '802'); await p.keyboard.press('Enter'); await sleep(300); x = await doc0('402'); ok(x[2] === '룸체→802' && !x[3], '고침 → 룸체→802 (한 칸만)');
  ok(!(await doc0('801'))[2] && (await doc0('802'))[2] === '402에서 옴', '상대 방 표시도 801 → 802 로 옮김');
  await cell('402').click(); await p.click('[data-memo="룸체"]'); await sleep(150); await p.click('#mpop [data-mpx="del"]'); await sleep(300);
  x = await doc0('402'); ok(!x[2] && !x[3] && !(await doc0('802'))[2], '지우기 (상대 방 표시도)');
  console.log('③ 악취 → 버튼 · 여러 방');
  await cell('403').click(); await cell('404').click({ modifiers: ['Control'] }); await sleep(100);
  await p.click('[data-memo="악취"]'); await sleep(150);
  ok(await p.locator('#mpop .mpc button').count() >= 6, '냄새 버튼 ' + await p.locator('#mpop .mpc button').count() + '개');
  await p.click('#mpop [data-mpv="생선"]'); await sleep(300);
  ok((await doc0('403'))[2] === '악취(생선)' && (await doc0('404'))[2] === '악취(생선)', '403 · 404 → 악취(생선)');
  await cell('405').click(); await p.click('[data-memo="악취"]'); await p.fill('#mpin', '페인트'); await p.keyboard.press('Enter'); await sleep(300);
  ok((await doc0('405'))[2] === '악취(페인트)', '직접 → 악취(페인트)');
  await cell('406').click(); await p.click('[data-memo="악취"]'); await sleep(150);
  ok(await p.locator('#mpop [data-mpv="페인트"]').count() === 1, '직접 쓴 냄새가 다음부터 버튼');
  await p.keyboard.press('Enter'); await sleep(300); ok((await doc0('406'))[2] === '악취', '비우고 Enter = 「악취」만 (빠른 길)');
  console.log('④ 연박 방 룸체 → 퇴실(1)');
  await cell('801').click(); await p.click('[data-memo="룸체"]'); await p.fill('#mpin', '1203'); await p.keyboard.press('Enter'); await sleep(300);
  x = await doc0('801'); ok(x[2] === '룸체→1203' && x[0] === '1', '연박 801 룸체 → 상태 1');
  console.log('⑤ 직접 쓴 메모는 버튼 메모(자세히)를 안 지움');
  await cell('403').click(); await p.fill('#fmemo', '고객 요청 수건 추가'); await p.press('#fmemo', 'Enter'); await sleep(300);
  x = await doc0('403'); ok(x[2] === '악취(생선)' && x[3] === '고객 요청 수건 추가', '악취(생선) + 직접 메모');
  console.log('⑤-1 시설 · 우선');
  await cell('408').click(); await p.click('[data-memo="시설"]'); await sleep(150);
  ok(/어떤 시설 문제인가요/.test(await p.innerText('#mpop')), '「어떤 시설 문제인가요?」');
  await p.fill('#mpin', '에어컨 고장'); await p.keyboard.press('Enter'); await sleep(300); ok((await doc0('408'))[2] === '시설(에어컨 고장)', '시설(에어컨 고장)');
  const P2 = await p.evaluate(() => ['8시', '오후 8시', '20:00', '20시', '2시', '3시 반', '오전 10시', '10시', '15시30분', '1530', '오후3:30', '12시', '25시', 'abc', '오전 5시'].map(v => { const o = parseHM(v); return v + '=' + (o ? o.h + ':' + o.mi : 'x'); }).join(' '));
  ok(P2 === '8시=20:0 오후 8시=20:0 20:00=20:0 20시=20:0 2시=14:0 3시 반=15:30 오전 10시=10:0 10시=10:0 15시30분=15:30 1530=15:30 오후3:30=15:30 12시=12:0 25시=x abc=x 오전 5시=x', '시간 읽기: ' + P2);
  await cell('409').click(); await p.click('[data-memo="우선"]'); await sleep(150);
  ok(/몇 시까지 정비할까요/.test(await p.innerText('#mpop')) && await p.locator('#mpop [data-mpv="14시"]').count() === 1, '「몇 시까지 정비할까요?」 + 빠른 버튼');
  await p.fill('#mpin', '8시'); await sleep(100); ok(/오후 8시 \(20:00\)까지/.test(await p.innerText('#mpst')), '입력하면 바로 → ' + await p.innerText('#mpst'));
  await p.keyboard.press('Enter'); await sleep(300); ok((await doc0('409'))[2] === '우선 20시까지', '저장 「우선 20시까지」 (메이드 휴대폰 = 20시까지 우선 정비)');
  await cell('410').click(); await p.click('[data-memo="우선"]'); await p.click('#mpop [data-mpv="14시"]'); await sleep(300); ok((await doc0('410'))[2] === '우선 14시까지', '빠른 버튼 14시');
  await cell('411').click(); await p.click('[data-memo="우선"]'); await p.fill('#mpin', '3시 반'); await p.keyboard.press('Enter'); await sleep(300); ok((await doc0('411'))[2] === '우선 15시 30분까지', '3시 반 → 우선 15시 30분까지');
  await cell('412').click(); await p.click('[data-memo="우선"]'); await p.fill('#mpin', '아무거나'); await p.keyboard.press('Enter'); await sleep(200);
  ok(await p.locator('#mpop').count() === 1 && !(await doc0('412'))[2], '못 읽으면 저장 안 함 · 창 그대로'); await p.keyboard.press('Escape');
  ok(await cell('409').evaluate(e => e.classList.contains('pr')), '우선 방은 주황 빛 그대로');
  console.log('⑤-1a 🟠 우선정비 단추 하나 (늘 우선정비 등록)');
  await cell('413').click(); await cell('414').click({ modifiers: ['Control'] }); await cell('801').click({ modifiers: ['Control'] }); await p.click('[data-memo="우선"]'); await sleep(150);
  ok(await p.locator('#mpnoti').count() === 0 && await p.locator('#mpname').count() === 1, '체크 칸 없음 · 이름(선택) · 순위');
  await p.fill('#mpin', '오후 3시'); await p.keyboard.press('Enter'); await sleep(500);
  let pr = await doc(p, 'meta/prio_' + TODAY), e1 = pr && pr.list && pr.list.find(q => q.name === '우선' && q.until === '15:00');
  ok(e1 && e1.until === '15:00' && e1.rooms.join() === '413,414', '🟠 우선정비 15:00 · 413,414 (연박 801 은 뺌)');
  ok((await doc0('413'))[2] === '우선 15시까지' && !(await doc0('801')).slice(2, 4).some(m => /우선/.test(m)), '메모 = 413 · 414 만 (연박 801 은 우선 안 붙음 · 발광 없음)');
  await cell('410').click(); await p.click('[data-memo="우선"]'); await p.fill('#mpname', '카이스트 HTL'); await p.selectOption('#mprank', '2'); await p.fill('#mpin', '16시'); await p.keyboard.press('Enter'); await sleep(400);
  await cell('411').click(); await p.click('[data-memo="우선"]'); await p.fill('#mpname', '카이스트 HTL'); await p.selectOption('#mprank', '2'); await p.fill('#mpin', '16'); await p.keyboard.press('Enter'); await sleep(400);
  pr = await doc(p, 'meta/prio_' + TODAY); const kai = pr.list.filter(q => q.name === '카이스트 HTL');
  ok(kai.length === 1 && kai[0].rooms.join() === '410,411' && kai[0].rank === 2 && kai[0].until === '16:00', '같은 이름 · 시각 · 순위 = 한 묶음 「카이스트 HTL」 410,411');
  await cell('413').click(); await p.click('[data-memo="우선"]'); await sleep(150);
  { const bb = await p.locator('#mpop').boundingBox(), eb = await p.locator('.eb2').boundingBox(); await p.screenshot({ path: '/tmp/prio_pop.png', clip: { x: 0, y: Math.max(0, eb.y - 60), width: 1500, height: bb.y + bb.height - eb.y + 80 } }); }
  ok(/지금: 15:00까지/.test(await p.innerText('#mpop')) && await p.inputValue('#mpin') === '15시', '다시 열면 지금 우선정비 · 시각');
  await p.click('#mpop [data-mpv="16시"]'); await sleep(500);
  const pr2 = await doc(p, 'meta/prio_' + TODAY), L2 = pr2.list.filter(q => q.rooms.includes('413'));
  ok(L2.length === 1 && L2[0].until === '16:00' && pr2.list.find(q => q.rooms.join() === '414'), '같은 방은 새 시각으로 옮김 (413 = 16:00 · 414 = 15:00 그대로)');
  console.log('⑤-1a2 해제 = 메모 · 우선정비 · 발광 모두 (메모 없이 우선정비만 있던 방도)');
  await cell('414').click(); await p.click('[data-memo="우선"]'); await sleep(150); await p.click('#mpop [data-mpx="del"]'); await sleep(500);
  let pr3 = await doc(p, 'meta/prio_' + TODAY);
  ok(!(await doc0('414'))[2] && !pr3.list.some(q => q.rooms.includes('414')) && !(await cell('414').evaluate(e => e.classList.contains('pr'))), '414 해제 → 메모 · 우선정비 · 발광 꺼짐');
  ok(pr3.list.some(q => q.rooms.includes('413')), '다른 방(413) 그대로');
  await p.evaluate(async d => { const S = await import('/rm/app/store.js'); const cur = window.__seed['meta/prio_' + d]; await S.set('meta/prio_' + d, Object.assign({}, cur, { list: cur.list.concat([{ id: 'px', name: '예전 우선정비', rooms: ['415'], until: '13:00', rank: 1, at: Date.now() }]) })); }, TODAY); await sleep(300);
  ok(await cell('415').evaluate(e => e.classList.contains('pr')), '(1211 같은 경우) 메모 없이 우선정비만 있는 415 = 발광');
  await cell('415').click(); await p.click('[data-memo="우선"]'); await sleep(150);
  ok(await p.locator('#mpop [data-mpx="del"]').count() === 1, '메모가 없어도 「해제」 단추');
  await p.click('#mpop [data-mpx="del"]'); await sleep(500);
  ok(!(await doc(p, 'meta/prio_' + TODAY)).list.some(q => q.rooms.includes('415')) && !(await cell('415').evaluate(e => e.classList.contains('pr'))), '해제 → 발광 꺼짐');
  console.log('⑤-1a3 🟣 늦은퇴실 단추');
  await cell('803').click(); await p.click('[data-memo="늦은퇴실"]'); await sleep(150); await p.click('#mpop [data-mpv="13시"]'); await sleep(400);
  let lt = await doc(p, 'meta/late_' + TODAY); ok(lt && lt.rooms['803'] && lt.rooms['803'].at === '13:00', '803(연박) 늦은 퇴실 13:00');
  ok(await cell('803').evaluate(e => e.classList.contains('lt')), '보라 빛');
  await cell('803').click(); await p.click('[data-memo="늦은퇴실"]'); await sleep(150);
  ok(/지금: 803 13:00 예정/.test(await p.innerText('#mpop')), '다시 열면 지금 상태 + 🔔 퇴실했어요');
  await p.click('#mpop [data-mpx="lout"]'); await sleep(400);
  lt = await doc(p, 'meta/late_' + TODAY); ok(lt.rooms['803'].out === true && (await doc0('803'))[0] === '1', '🔔 퇴실했어요 → 퇴실 · 방 1');
  await cell('803').click(); await p.click('[data-memo="늦은퇴실"]'); await sleep(150); await p.click('#mpop [data-mpx="del"]'); await sleep(400);
  lt = await doc(p, 'meta/late_' + TODAY); ok(lt.rooms['803'] === null, '해제');
  ok(/🟠 우선정비 \d/.test(await p.innerText('[data-memo="우선"]')) && /🟣 늦은퇴실 0/.test(await p.innerText('[data-memo="늦은퇴실"]')), '메모 줄 🟠 우선정비 · 🟣 늦은퇴실 단추에 수');
  ok(await p.locator('[data-drawer="prio"],[data-drawer="late"]').count() === 0, '오른쪽 위 우선정비 · 늦은퇴실 단추 없음 (전부 합쳐 단추 2개)');
  { const eb = await p.locator('.ebar').boundingBox(); for (const w of [1366, 1920]) { await p.setViewportSize({ width: w, height: 900 }); await sleep(250); const e2 = await p.locator('.ebar').boundingBox(); await p.screenshot({ path: '/tmp/ebar_' + w + '.png', clip: { x: 0, y: e2.y, width: w, height: e2.height + 4 } }); } await p.setViewportSize({ width: 1500, height: 950 }); await sleep(200); }
  await p.click('[data-memo="우선"]'); await sleep(150); if (await p.$('#mpop [data-mpx="list"]')) await p.click('#mpop [data-mpx="list"]'); await sleep(200); ok(!(await p.$('#pname')) && /카이스트 HTL/.test(await p.innerText('.side')), '우선정비 목록 (지정 칸 없음 · 메모 줄 단추로)');
  await p.click('[data-memo="우선"]'); await sleep(150); if (await p.$('#mpop [data-mpx="list"]')) await p.click('#mpop [data-mpx="list"]'); await sleep(150);
  console.log('⑤-1b 끝난 일 단추');
  await cell('404').click(); await p.click('[data-memo="악취"]'); await sleep(150);
  ok(await p.locator('#mpop [data-mpraw]').count() === 2, '악취 창: ✓ 해제 · ✓ 탈취완료');
  await p.click('#mpop [data-mpraw="악취탈취완료"]'); await sleep(300); ok((await doc0('404'))[2] === '악취탈취완료', '404 → 악취탈취완료 (같은 칸 바꿈)');
  await cell('406').click(); await p.click('[data-memo="악취"]'); await p.click('#mpop [data-mpraw="악취해제"]'); await sleep(300); ok((await doc0('406'))[2] === '악취해제', '406 → 악취해제');
  await cell('408').click(); await p.click('[data-memo="시설"]'); await sleep(150); ok(await p.locator('#mpop [data-mpraw="시설작업완료"]').count() === 1, '시설 창: ✓ 완료');
  await p.click('#mpop [data-mpraw="시설작업완료"]'); await sleep(300); ok((await doc0('408'))[2] === '시설작업완료', '408 시설(에어컨 고장) → 시설작업완료');
  await cell('404').click(); await p.click('[data-memo="악취"]'); await sleep(150); ok(await p.inputValue('#mpin') === '' && await p.locator('#mpop [data-mpraw="악취탈취완료"].on').count() === 1, '다시 열면 탈취완료 단추가 켜져 있음'); await p.keyboard.press('Escape');
  console.log('⑤-2 결산 🫧 악취 탭');
  await p.click('#tabs [data-t="close"]'); await sleep(300); await p.click('[data-ctab="smell"]'); await sleep(300);
  const sm = (await p.innerText('#main')).replace(/\s+/g, ' ');
  ok(/악취 객실 4건/.test(sm) && /가람 4/.test(sm) && /403 생선/.test(sm) && /405 페인트/.test(sm), '가람 4건 · 403 생선 · 405 향수');
  await p.click('[data-awsmell="가람"]'); await sleep(300);
  const aw = (await doc(p, 'jbr/cfg-' + TODAY.slice(0, 7))) || {};
  ok((aw.awards || []).some(a => a.n === '가람' && a.why === '악취 시상'), '🏆 시상에 넣기 → 시상 명단 「악취 시상」');
  ok(/시상 명단에 있음/.test(await p.innerText('#main')), '넣은 뒤 「시상 명단에 있음」');
  await p.click('#tabs [data-t="grid"]'); await sleep(300);
  console.log('⑥ 긴 메모 = 한 줄 … · 칸 높이 고르게');
  await cell('407').click(); await p.fill('#fmemo', '고객이 오후 세시 이후에 짐을 빼신다고 하셨으니 꼭 확인 후 들어가 주세요'); await p.press('#fmemo', 'Enter'); await sleep(300);
  const hs = await p.$$eval('.c[data-i]', els => els.filter(e => /^\s*40[1-9]/.test(e.querySelector('.no').textContent)).map(e => e.getBoundingClientRect().height));
  await p.setViewportSize({ width: 1366, height: 768 }); await sleep(300);   // 노트북 화면
  const fit = async r => cell(r).locator('.mm span').first().evaluate(e => ({ h: e.scrollHeight <= e.clientHeight + 1 && e.scrollWidth <= e.clientWidth + 1, lines: Math.round(e.clientHeight / parseFloat(getComputedStyle(e).lineHeight)) }));
  const f404 = await fit('404'), f407 = await cell('407').locator('.mm span').evaluate(e => ({ cut: e.scrollHeight > e.clientHeight + 1, lines: Math.round(e.clientHeight / parseFloat(getComputedStyle(e).lineHeight)) }));
  { await cell('401').evaluate(e => e.scrollIntoView({ block: 'center' })); await sleep(200); const bx = await cell('401').boundingBox(); await p.screenshot({ path: '/tmp/memo_wrap.png', clip: { x: 0, y: Math.max(0, bx.y - 80), width: 1366, height: 170 } }); }
  ok(f404.h, '「악취탈취완료」 다 보임 (' + f404.lines + '줄)');
  ok(f407.cut && f407.lines === 3, '아주 긴 메모 = 3줄까지 쓰고 … (' + f407.lines + '줄)');
  const hs2 = await p.$$eval('.c[data-i]', els => els.filter(e => /^\s*40[1-9]/.test(e.querySelector('.no').textContent)).map(e => e.getBoundingClientRect().height));
  ok(Math.max(...hs2) - Math.min(...hs2) < 1, '같은 층 칸 높이 모두 같음 (' + [...new Set(hs2.map(Math.round))].join(',') + 'px)');
  ok(/고객이 오후 세시 이후에/.test(await cell('407').getAttribute('title')), '마우스를 올리면 전체 글');
  await p.screenshot({ path: '/tmp/memo_1.png', clip: { x: 0, y: 0, width: 1500, height: 700 } });
  await cell('401').scrollIntoViewIfNeeded(); await p.locator('.g').screenshot({ path: '/tmp/memo_3.png', clip: undefined }).catch(() => {}); { const bx = await cell('401').boundingBox(); await p.screenshot({ path: '/tmp/memo_3.png', clip: { x: 0, y: bx.y - 60, width: 1500, height: 140 } }); }
  await cell('402').click(); await p.click('[data-memo="룸체"]'); await sleep(150); await p.screenshot({ path: '/tmp/memo_2.png', clip: { x: 0, y: 150, width: 1000, height: 420 } }); await p.keyboard.press('Escape');
  console.log('⑦ 창이 화면 밖으로 안 잘림 (낮은 노트북 화면 · 맨 위)');
  for (const [w, h] of [[1366, 620], [1280, 560], [1920, 900]]) {
    await p.setViewportSize({ width: w, height: h }); await sleep(250); await p.evaluate(() => { window.scrollTo(0, 0); const L = document.getElementById('left'); if (L) L.scrollTop = 0; }); await sleep(150);
    await cell('1601').click(); await p.click('[data-memo="우선"]'); await sleep(200);
    const bx = await p.locator('#mpop').boundingBox(); ok(bx.y >= 0 && bx.y + bx.height <= h + 1, w + '×' + h + ': 🟠 창이 화면 안 (위 ' + Math.round(bx.y) + ' · 아래 ' + Math.round(bx.y + bx.height) + ')');
    if (w === 1366) await p.screenshot({ path: '/tmp/pop_fit.png' });
    await p.keyboard.press('Escape'); await sleep(100); }
  ok(!p.errs.length, '오류 없음' + (p.errs.length ? ': ' + p.errs.join(' | ') : ''));
  await b.close();
  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})();
