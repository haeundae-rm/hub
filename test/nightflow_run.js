// 🌙 야간 배정 흐름 시험 (2026-11-27) — node test/nightflow_run.js  (가명 · 만든 자료)
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
  ['rmsched_hk/' + T1]: { date: T1, rm: MAIDS.map(n => ({ n, u: 9, up: false })), all: MAIDS.map(n => ({ n, d: '', out: false })), mon: T1, sum: {}, note: '', helpers: [] }
};
async function open(browser) {
  const ctx = await browser.newContext({ locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript(s => { window.__seed = s; window.__live = 1; sessionStorage.setItem('fu', JSON.stringify({ uid: 'nBL2QYezEmRNRmBRMXN6LNPJO2s2', anon: false, email: 'unieshaeundae+hk@gmail.com' })); }, SEED);
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

(async () => {
  const b = await chromium.launch();
  const p = await open(b);
  console.log('① 정비보고서: 🌙 내일 초안 만들기');
  ok(!!(await p.$('[data-jnew="' + T1 + '"]')), '「🌙 ' + T1.slice(5) + ' 초안 만들기」 단추');
  await p.click('[data-jnew="' + T1 + '"]'); await sleep(400);
  let d = await doc(p, 'jbr/' + T1);
  ok(d && d.src === 'app' && Object.values(d.r).every(x => x[0] === '4' && !x[1] && !x[5]), '전 객실 4 · 이름 없음 · 연박 없음 (' + (d ? Object.keys(d.r).length : 0) + '실)');
  ok(/저장 켜짐/.test(await p.innerText('.svb')), '그날은 저장 켜짐');
  ok(!(await p.$('[data-jnew="' + T1 + '"]')), '만든 뒤엔 단추 없음');

  console.log('② 하우스맨이 연박 · 공실 표시 (31~8층은 연박/공실, 4~7층만 정비)');
  await p.evaluate(async ([T1, ROOMS]) => { const S = await import('../../rm/app/store.js'); const r = {};
    ROOMS.forEach(k => { const f = Math.floor(k / 100); if (f >= 8 && k !== '3001') r[k] = (k % 2) ? ['', '', '', '', 0, 1] : ['', '', '', '', 0, 0]; });
    ['401', '402'].forEach(k => { r[k] = ['2', '', '', '', 0, 1]; });   // 재실(연박 중 재실 청소)
    await S.merge('jbr/' + T1, { r }); }, [T1, ROOMS]);
  await sleep(300);

  console.log('③ 🧩 자동 배정: 정비보고서 앱에서 불러오기');
  await p.evaluate(async () => { const S = await import('../../rm/app/store.js'); const m = await import('../assignui.js');
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ymd = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
    m.openAssign({ S, esc, ymd, addDays, md: d => +d.slice(5, 7) + '/' + +d.slice(8), logErr: () => {}, admin: () => ({ label: '하우스키퍼' }), user: () => ({ uid: 'nBL2QYezEmRNRmBRMXN6LNPJO2s2' }), upload: o => { window.__up = o; } }); });
  await p.waitForSelector('#asp [data-as="app"]');
  await p.click('#asp [data-as="date"][data-v="' + T1 + '"]'); await sleep(100);
  await p.click('#asp [data-as="app"]'); await sleep(600);
  let t = await asp(p);
  ok(/HK 전파.*4명 · 36유닛/.test(t), '출근자 = HK 전파 4명 · 36유닛');
  const tgt = +((t.match(/정비 대상 (\d+)실/) || [])[1] || 0);
  ok(tgt > 36, '정비 대상 ' + tgt + '실 (4~7층 + 3001 + 재실 2)');
  ok(/유닛 남음 › 어느 분에게 더 넣을까요/.test(t), '차이 문구: ' + (t.match(/방 [\d.]+유닛 남음/) || [''])[0]);
  ok(await p.$eval('#asp [data-as="run"]', x => x.disabled), '차이가 있으면 자동 배정 꺼짐');

  console.log('④ −/+ : 가람 +2 → 표시');
  await p.click('#asp [data-as="u+"][data-v="가람"]'); await p.click('#asp [data-as="u+"][data-v="가람"]'); await sleep(100);
  ok(/가람[\s\S]{0,30}11[\s\S]{0,6}\+2/.test(await asp(p)), '가람 11 (+2 표시)');

  console.log('⑤ 📦 미정비 남기기 (유닛 기준)');
  await p.click('#asp [data-as="carry2"]'); await sleep(200);
  t = await asp(p); const goal = +((t.match(/(\d+)유닛만큼 미정비로 남길 객실을 선택해 주세요/) || [])[1] || -1);
  ok(goal > 0, '띠: 「' + goal + '유닛만큼 미정비로 남길 객실을 선택해 주세요」');
  ok(await p.$eval('#asp [data-as="c2c"][data-v="3001"]', x => x.disabled) && await p.$eval('#asp [data-as="c2c"][data-v="1001"]', x => x.disabled), '로얄 · 연박/공실 방은 못 고름');
  await p.click('#asp [data-as="c2c"][data-v="401"]').catch(() => {});
  await p.click('#asp [data-as="c2c"][data-v="405"]'); await sleep(100);
  ok(new RegExp((goal - 1) + '유닛 남았어요').test(await asp(p)), '하나 고르면 「' + (goal - 1) + '유닛 남았어요」 (재실 401 은 못 고름)');
  await p.click('#asp [data-as="c2eng"]'); await sleep(150);
  t = await asp(p);
  ok(/다 골랐어요/.test(t) && !(await p.$eval('#asp [data-as="c2done"]', x => x.disabled)), '🤖 엔진이 고릅니다 → 「다 골랐어요」 · 완료 켜짐');
  await p.click('#asp [data-as="c2done"]'); await sleep(150);
  t = await asp(p);
  ok(/✅ 정비할 방 \d+유닛 = 출근자 유닛 합 38/.test(t), '차이 0: ' + (t.match(/✅ 정비할 방[^—]*/) || [''])[0]);
  ok(!(await p.$eval('#asp [data-as="run"]', x => x.disabled)), '자동 배정 켜짐');

  console.log('⑥ 확인 창 → 엔진');
  await p.click('#asp [data-as="run"]'); await sleep(150);
  t = await asp(p);
  ok(/자동 배정을 시작할까요/.test(t) && /연박 \d+실 · 공실 \d+실 · 재입 0실 · 재실 2실 → 정비할 방 \d+실/.test(t) && /출근 4명 · 유닛 합 38/.test(t), '확인 창 + 초안 숫자: ' + (t.match(/연박 \d+실[^\n]*/) || [''])[0]);
  ok(!/하나도 없어요/.test(t), '연박 · 공실 있으면 빨간 줄 없음');
  await p.click('#asp [data-as="askyes"]');
  await p.waitForFunction(() => /배정안/.test(document.querySelector('#asp').innerText), null, { timeout: 120000 });
  t = await asp(p);
  ok(/✅ 확정 → 정비보고서 \(연습/.test(t), '결과 · 확정 단추 (연습 — 메이드 휴대폰엔 안 보냄)');
  await p.screenshot({ path: '/tmp/jbr_shots/5_nightflow.png' });

  console.log('⑦ ✅ 확정 → 정비보고서에 저장');
  await p.click('#asp [data-as="send"]'); await sleep(800);
  d = await doc(p, 'jbr/' + T1);
  const named = Object.keys(d.r).filter(k => d.r[k][1]), carry = Object.keys(d.r).filter(k => /미정비/.test(d.r[k][3]));
  ok(named.length > 30 && named.every(k => MAIDS.some(m => d.r[k][1].includes(m))), '이름 들어감 ' + named.length + '실');
  ok(carry.length > 0 && carry.every(k => !d.r[k][1]), '미정비 남긴 방 ' + carry.length + '실 = 메모2 「미정비」 · 이름 없음');
  ok(d.cards.length === 4 && d.cards.find(c => c.n === '가람'), '출근 카드 4명 (' + d.cards.map(c => c.n + ' ' + c.u).join(', ') + ')');
  ok(Object.keys(d.r).filter(k => Math.floor(k / 100) >= 8 && k !== '3001').every(k => !d.r[k][1]), '연박 · 공실 방엔 이름 없음');
  const logs = await p.evaluate(T1 => Object.keys(window.__seed).filter(k => k.startsWith('jbr/' + T1 + '/log/')).map(k => window.__seed[k]), T1);
  ok(logs.some(x => x.k === 'assign' && x.n === named.length + carry.length) && logs.some(x => x.k === 'new'), '변경 기록: 초안 · 자동 배정 확정');
  ok(!(await p.evaluate(() => window.__up)), '연습이라 메이드 휴대폰 올리기 안 함');
  ok(/연습 기간이라 메이드 휴대폰엔 안 보냈어요/.test(await asp(p)), '안내 문구');
  await p.click('#asp [data-as="close"]'); await sleep(300);
  await p.click('#days [data-d="' + T1 + '"]'); await sleep(300);
  ok(/가람|나래/.test(await p.innerText('.gridbox')), '정비보고서 화면에 배정 이름이 보임');
  ok(!p.errs.length, '오류 없음 ' + p.errs.slice(0, 3).join(' | '));
  await b.close();
  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})();
