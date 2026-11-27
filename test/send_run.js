// 📱 넣기 · 보내기 나누기 시험 (2026-11-28 A안) — node test/send_run.js  (가명 · 만든 자료)
//   자동 배정 「정비보고서에 넣기」 = 휴대폰엔 안 감 → 격자에서 고침 → 「📱 메이드 휴대폰 보내기」 = 고친 그대로 올라감 · sentAt · 기록
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
  ['jbr/' + T1]: { date: T1, src: 'app', rooms: ROOMS, r: Object.fromEntries(ROOMS.map(r => [r, Math.floor(r / 100) <= 7 ? ['4', '', '', '', 0, 0] : ['', '', '', '', 0, 1]])), xl: {}, cards: [], groups: [], roster: MAIDS, at: Date.now() },
  ['rmsched_hk/' + T1]: { date: T1, rm: MAIDS.map(n => ({ n, u: 9, up: false })), all: MAIDS.map(n => ({ n, d: '', out: false })), mon: T1, sum: {}, note: '', helpers: [] }
};
async function open(browser) {
  const ctx = await browser.newContext({ locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript(s => { let ps = null; try { if (window.parent !== window) ps = window.parent.__seed; } catch (e) {} window.__seed = ps || s; window.__live = 1; sessionStorage.setItem('fu', JSON.stringify({ uid: 'nBL2QYezEmRNRmBRMXN6LNPJO2s2', anon: false, email: 'unieshaeundae+hk@gmail.com' })); }, SEED);
  await ctx.route('**/*', async route => {
    const u = route.request().url();
    if (!u.startsWith(BASE)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    const rel = u.slice(BASE.length).split('?')[0].split('#')[0]; const [app, ...rest] = rel.split('/'); let f = rest.join('/') || 'index.html';
    if (f.endsWith('/')) f += 'index.html';
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

const HUB = `(() => { const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ymd = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  return S => ({ S, esc, ymd, addDays, md: d => +d.slice(5, 7) + '/' + +d.slice(8), logErr: () => {}, admin: () => ({ label: '하우스키퍼' }), user: () => ({ uid: 'nBL2QYezEmRNRmBRMXN6LNPJO2s2' }), upload: (o, after) => { window.__up = o; window.__ups = (window.__ups || 0) + 1; if (after) after(); } }); })()`;
(async () => {
  const b = await chromium.launch();
  const p = await open(b);
  await p.evaluate(h => { window.__mkHub = eval(h); }, HUB);
  console.log('① 자동 배정 → 정비보고서에 넣기');
  await p.evaluate(async () => { const S = await import('../../rm/app/store.js'); const m = await import('../assignui.js'); m.openAssign(window.__mkHub(S)); });
  await p.waitForSelector('#asp [data-as="app"]');
  await p.click('#asp [data-as="date"][data-v="' + T1 + '"]'); await sleep(100);
  await p.click('#asp [data-as="app"]'); await sleep(600);
  if (await p.$('#asp [data-as="force"]')) { await p.click('#asp [data-as="force"]'); await sleep(100); }
  await p.click('#asp [data-as="run"]'); await sleep(150);
  if (await p.$('#asp [data-as="askyes"]')) await p.click('#asp [data-as="askyes"]');
  await p.waitForFunction(() => /배정안/.test(document.querySelector('#asp').innerText), null, { timeout: 120000 });
  const t = await asp(p);
  ok(/정비보고서에 넣기/.test(t) && /휴대폰엔 아직 안 감/.test(t) && !/메이드 휴대폰'?\)?\s*$/.test(t), '단추 = 「✅ 정비보고서에 넣기 (휴대폰엔 아직 안 감)」');
  await p.click('#asp [data-as="send"]'); await sleep(900);
  let d = await doc(p, 'jbr/' + T1);
  const named = Object.keys(d.r).filter(k => d.r[k][1]);
  ok(named.length > 20 && d.asg && !d.asg.sentAt, '정비보고서에 이름 ' + named.length + '실 · asg.sentAt 없음');
  ok(!(await p.evaluate(() => window.__up)), '메이드 휴대폰엔 안 올림');
  ok(!(await p.$('#asp')), '자동 배정 창 닫힘 → 정비보고서 격자');
  console.log('② 격자: 아직 안 보냄 띠');
  await p.click('[data-day="' + T1 + '"]').catch(() => {}); await sleep(300);
  await p.evaluate(T1 => { const b = [...document.querySelectorAll('button,[data-d]')].find(x => x.dataset && (x.dataset.d === T1 || x.dataset.day === T1)); if (b) b.click(); }, T1); await sleep(300);
  let bar = await p.$('.sndb.wait');
  if (!bar) console.log('   (날짜 단추 이름 확인) ' + (await p.$$eval('#days button', e => e.slice(0, 6).map(x => x.outerHTML.slice(0, 80)).join(' | '))));
  ok(!!bar && /아직 메이드 휴대폰엔 안 보냈어요/.test(await p.innerText('.sndb')), '주황 띠 「📱 아직 메이드 휴대폰엔 안 보냈어요」 + 보내기 단추');
  await p.screenshot({ path: '/tmp/jbr_shots/send_1.png' });
  console.log('③ 격자에서 고침 (하우스키퍼): 첫 방 담당 바꾸기');
  const r0 = named[0], who0 = d.r[r0][1], who1 = MAIDS.find(n => n !== who0);
  await p.evaluate(async ([T1, r0, who1]) => { const S = await import('../../rm/app/store.js'); const cur = await S.get('jbr/' + T1); const a = cur.r[r0].slice(); a[1] = who1; await S.merge('jbr/' + T1, { r: { [r0]: a } }); }, [T1, r0, who1]);
  await sleep(300);
  console.log('④ 📱 보내기 단추 → 보내기 창 (?embed=send&d=)');
  await p.click('[data-jsend]'); await sleep(300);
  const src = await p.$eval('#asgx iframe', x => x.getAttribute('src')).catch(() => '');
  ok(src === '../?embed=send&d=' + T1, '보내기 창 주소 ' + src);
  console.log('⑤ 보내기 창(허브) 안에서 실제로 올림');
  await p.waitForFunction(() => window.__seed['uploads/latest'] && window.__seed['uploads/latest'].state === 'wait', null, { timeout: 20000 }).catch(() => {});
  const lat = await doc(p, 'uploads/latest'), rep = await doc(p, 'uploads/rep_' + T1);
  ok(lat && lat.date === T1 && lat.state === 'wait' && lat.rooms === named.length && /📱 보내기/.test(lat.file), 'uploads/latest = ' + T1 + ' · ' + (lat && lat.rooms) + '실 · 중계 기다림');
  ok(rep && rep.rooms.some(x => x.room === r0 && x.name === who1), '더티 배분 자료(rep)에도 고친 이름');
  ok(/정비보고서 올리기|배정표를 올렸어요/.test(await p.frames()[1].evaluate(() => document.body.innerText)), '보내기 창에 올리기 진행 표시');
  await sleep(300); await p.click('[data-asgx]'); await sleep(200);
  ok(!(await p.$('#asgx')), '✕ 로 닫힘 (올리기 끝난 뒤)');
  // 아래는 같은 함수를 가짜 허브로 한 번 더 (올린 rows 확인용) — sent 2
  await p.evaluate(async T1 => { const S = await import('../../rm/app/store.js'); const m = await import('../assignui.js'); await m.sendJbr(window.__mkHub(S), T1); }, T1);
  await sleep(500);
  const up = await p.evaluate(() => window.__up);
  ok(up && up.date === T1 && up.res.rows.some(x => x[2] === r0 && x[1] === who1) && !up.res.rows.some(x => x[2] === r0 && x[1] === who0), '격자에서 고친 그대로 올라감 (' + r0 + ' → ' + who1 + ')');
  ok(up && up.res.rows.length === named.length, '보낸 방 수 = 이름 있는 방 ' + named.length);
  d = await doc(p, 'jbr/' + T1);
  ok(d.asg && d.asg.sentAt && d.asg.sent === 2 && d.asg.sentBy === '하우스키퍼', 'asg.sentAt · sent 2 (창 + 함수) · sentBy');
  const logs = await p.evaluate(T1 => Object.keys(window.__seed).filter(k => k.startsWith('jbr/' + T1 + '/log/')).map(k => window.__seed[k].k), T1);
  ok(logs.includes('assign') && logs.filter(x => x === 'send').length === 2, '기록: assign → send (' + logs.join(',') + ')');
  await sleep(400);
  ok(/메이드 휴대폰에 보냄/.test(await p.innerText('.sndb.ok').catch(() => '')), '초록 띠 「📱 HH:MM 메이드 휴대폰에 보냄」 + 다시 보내기');
  await p.screenshot({ path: '/tmp/jbr_shots/send_2.png' });
  console.log('⑥ 자동 배정 창 다시 열면: 보냄 표시 · 노쇼는 다시 보냄');
  await p.evaluate(async () => { const S = await import('../../rm/app/store.js'); const m = await import('../assignui.js'); m.openAssign(window.__mkHub(S)); });
  await p.waitForSelector('#asp [data-as="app"]'); await p.click('#asp [data-as="date"][data-v="' + T1 + '"]'); await p.click('#asp [data-as="app"]'); await sleep(600);
  ok(/메이드 휴대폰에 보냄/.test(await asp(p)) && !(await p.$('#asp [data-as="sendnow"]')), '자동 배정 창에도 「📱 보냄」');
  const n0 = await p.evaluate(() => window.__ups);
  await p.click('#asp [data-as="nsopen"]'); await sleep(100);
  await p.click('#asp [data-as="ns"][data-v="' + MAIDS[3] + '"]'); await sleep(800);
  ok((await p.evaluate(() => window.__ups)) === n0 + 1, '보낸 뒤 노쇼 = 메이드 휴대폰에 다시 보냄');
  ok(!p.errs.length, '오류 없음' + (p.errs.length ? ': ' + p.errs.join(' | ') : ''));
  await b.close();
  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})();
