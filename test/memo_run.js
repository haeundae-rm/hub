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
  console.log('⑤-1a 📣 알림도 보내기');
  await cell('413').click(); await cell('414').click({ modifiers: ['Control'] }); await cell('801').click({ modifiers: ['Control'] }); await p.click('[data-memo="우선"]'); await sleep(150);
  ok(await p.locator('#mpnoti').count() === 1 && !(await p.isChecked('#mpnoti')), '「📣 메이드에게 알림도 보내기」 (처음엔 꺼짐)');
  await p.check('#mpnoti'); await p.fill('#mpin', '오후 3시'); await p.keyboard.press('Enter'); await sleep(500);
  const pr = await doc(p, 'meta/prio_' + TODAY);
  const e1 = pr && pr.list && pr.list.find(q => q.name === '우선');
  ok(e1 && e1.until === '15:00' && e1.rooms.join() === '413,414', '🟠 우선정비 등록 15:00 · 413,414 (연박 801 은 뺌)');
  ok((await doc0('413'))[2] === '우선 15시까지' && (await doc0('801')).slice(2, 4).includes('우선 15시까지'), '메모는 세 방 모두 (801 은 룸체 옆 칸)');
  await cell('413').click(); await p.click('[data-memo="우선"]'); await sleep(150); ok(await p.isChecked('#mpnoti'), '다음엔 체크가 기억됨');
  await p.click('#mpop [data-mpv="16시"]'); await sleep(500);
  const pr2 = await doc(p, 'meta/prio_' + TODAY), L2 = pr2.list.filter(q => q.rooms.includes('413'));
  ok(L2.length === 1 && L2[0].until === '16:00' && pr2.list.find(q => q.rooms.join() === '414'), '같은 방은 새 시각으로 옮김 (413 = 16:00 · 414 = 15:00 그대로)');
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
  const sp = await cell('407').locator('.mm span').evaluate(e => ({ sw: e.scrollWidth, cw: e.clientWidth, ws: getComputedStyle(e).whiteSpace }));
  ok(sp.ws === 'nowrap' && sp.sw > sp.cw, '긴 메모는 한 줄 · … (잘림)');
  ok(Math.max(...hs) - Math.min(...hs) < 1, '4층 칸 높이 모두 같음 (' + [...new Set(hs.map(Math.round))].join(',') + 'px)');
  ok(/고객이 오후 세시 이후에/.test(await cell('407').getAttribute('title')), '마우스를 올리면 전체 글');
  await p.screenshot({ path: '/tmp/memo_1.png', clip: { x: 0, y: 0, width: 1500, height: 700 } });
  await cell('401').scrollIntoViewIfNeeded(); await p.locator('.g').screenshot({ path: '/tmp/memo_3.png', clip: undefined }).catch(() => {}); { const bx = await cell('401').boundingBox(); await p.screenshot({ path: '/tmp/memo_3.png', clip: { x: 0, y: bx.y - 60, width: 1500, height: 140 } }); }
  await cell('402').click(); await p.click('[data-memo="룸체"]'); await sleep(150); await p.screenshot({ path: '/tmp/memo_2.png', clip: { x: 0, y: 150, width: 1000, height: 420 } }); await p.keyboard.press('Escape');
  ok(!p.errs.length, '오류 없음' + (p.errs.length ? ': ' + p.errs.join(' | ') : ''));
  await b.close();
  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})();
