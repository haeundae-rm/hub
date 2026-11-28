// 🎍 2027년 넘어가기 시험 (2026-11-28) — node test/y2027_run.js (가명 · 만든 자료)
//   12/31 밤 · 1/2 밤으로 시계를 맞추고: 정비보고서 달 · 날짜 · 🌙 초안(다음 해 1/1) · 앞날 미리 표기 · 자동 배정 날짜 · 기간 작업 메시지 · 습득물 달 단추
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = { hub: path.resolve(__dirname, '..'), rm: process.env.RM || path.resolve(__dirname, '../../rm') };
const BASE = 'https://haeundae-rm.github.io/';
let pass = 0, fail = 0; const ok = (c, l) => { c ? pass++ : fail++; console.log((c ? '  ✅ ' : '  ❌ ') + l); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const add = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const ROOMS = []; for (let f = 31; f >= 4; f--) for (let s = 1; s <= 17; s++) ROOMS.push(String(f * 100 + s));
const MAIDS = ['가람', '나래', '다솜', '라온'];
function seed(TODAY) {
  const s = { 'meta/rsync': { on: true, at: 0 } };
  [-2, -1].forEach(k => { const d = add(TODAY, k); s['jbr/' + d] = { date: d, src: 'app', rooms: ROOMS, r: Object.fromEntries(ROOMS.map(r => [r, ['1', '가람', '', '', 1, 0]])), xl: {}, cards: [], groups: [], roster: MAIDS, at: 0 }; });
  s['jbr/' + TODAY] = { date: TODAY, src: 'app', rooms: ROOMS, r: Object.fromEntries(ROOMS.map(r => [r, ['1', '나래', '', '', 0, 0]])), xl: {}, cards: [], groups: [], roster: MAIDS, at: 0 };
  s['rmsched_hk/' + add(TODAY, 1)] = { date: add(TODAY, 1), rm: MAIDS.map(n => ({ n, u: 9 })), all: MAIDS.map(n => ({ n, d: '', out: false })), mon: add(TODAY, 1), sum: {}, note: '', helpers: [] };
  const L = (date, room, item) => { s['lost/' + date + '_' + room + '_t'] = { v: 1, date, no: '', room, item, cat: '기타', police: false, place: '', note: '', by: '', src: 'hub', n: 0, chk: true, act: '', actDay: '', actBy: '', memo: '', clientAt: Date.parse(date + 'T10:00:00+09:00') }; };
  L('2026-10-05', '1201', '우산'); L('2026-11-20', '1305', '충전기'); L('2026-12-31', '2201', '모자'); if (TODAY >= '2027-01-01') L('2027-01-01', '803', '장갑');
  return s;
}
async function open(browser, TODAY, url) {
  const ctx = await browser.newContext({ locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript(s => { window.__seed = s; window.__live = 1; sessionStorage.setItem('fu', JSON.stringify({ uid: 'nBL2QYezEmRNRmBRMXN6LNPJO2s2', anon: false, email: 'unieshaeundae+hk@gmail.com' })); }, seed(TODAY));
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
  await ctx.clock.setFixedTime(Date.parse(TODAY + 'T22:00:00+09:00'));
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', e => p.errs.push(String(e))); p.on('dialog', x => x.accept());
  await p.goto(BASE + url);
  return p;
}
(async () => {
  const b = await chromium.launch();
  for (const TODAY of ['2026-12-31', '2027-01-02']) {
    const T1 = add(TODAY, 1);
    console.log('■ ' + TODAY + ' 밤 10시');
    const p = await open(b, TODAY, 'hub/jbr/'); await p.waitForSelector('.c[data-i]', { timeout: 8000 }); await sleep(300);
    const mons = await p.$$eval('#mons [data-mon]', x => x.map(e => e.dataset.mon + ':' + e.textContent));
    ok(mons.join() === (TODAY === '2026-12-31' ? '2026-12:12월,2027-01:1월' : '2026-12:12월,2027-01:1월'), '달 단추 순서: ' + mons.join(' '));
    ok(!!(await p.$('[data-jnew="' + T1 + '"]')), '🌙 초안 단추 = ' + T1);
    await p.click('[data-jnew="' + T1 + '"]'); await sleep(500);
    const d = await p.evaluate(k => window.__seed[k], 'jbr/' + T1);
    ok(d && d.src === 'app' && Object.values(d.r).every(x => x[0] === '4'), T1 + ' 초안 생김 (전 객실 4)');
    await p.click('#days [data-d="' + T1 + '"]').catch(() => {}); await sleep(300);
    { const tx = await p.evaluate(() => (document.querySelector('.cards.pre') || {}).innerText || 'none'); ok(/HK 전파 출근 예정\s*4명/.test(tx), '해 넘어간 날도 📣 출근 예정: ' + tx.replace(/\s+/g, ' ').slice(0, 60)); }
    const days = await p.$$eval('#days [data-d]', x => x.map(e => e.dataset.d));
    ok(days.every(x => x.slice(0, 7) === days[0].slice(0, 7)) && days.includes(T1), '그 달 날짜 줄: ' + days[0] + ' ~ ' + days[days.length - 1]);
    const V = add(TODAY, 9);
    await p.evaluate(ds => { const mb = document.querySelector('[data-mon="' + ds.slice(0, 7) + '"]'); if (mb && !mb.classList.contains('on')) mb.click(); }, V); await sleep(200);
    ok(!!(await p.$('#days [data-d="' + V + '"]')), '앞날(흐린 날) ' + V + ' 보임');
    console.log('  자동 배정 날짜');
    await p.evaluate(async () => { const S = await import('../../rm/app/store.js'); const m = await import('../assignui.js');
      const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      const ymd = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
      m.openAssign({ S, esc, ymd, addDays, md: d => +d.slice(5, 7) + '/' + +d.slice(8), logErr: () => {}, admin: () => ({ label: '하우스키퍼' }), user: () => ({ uid: 'x' }), upload: () => {} }); });
    await p.waitForSelector('#asp [data-as="app"]'); 
    ok(!!(await p.$('#asp [data-as="date"][data-v="' + T1 + '"]')), '자동 배정 「내일」 = ' + T1);
    await p.click('#asp [data-as="date"][data-v="' + T1 + '"]'); await p.click('#asp [data-as="app"]'); await sleep(700);
    ok(/HK 전파.*4명 · 36유닛/.test(await p.innerText('#asp')), '불러오기 → 출근 4명 · 36유닛');
    const bk = await p.evaluate(async T => { const m = await import('../blocks.js'); return m.parseMsg('1/5~1/7 도배 1201\n12/30 카펫 1305', T).map(g => g.from + '~' + g.to).join(','); }, TODAY);
    ok(bk === '2027-01-05~2027-01-07,2026-12-30~2026-12-30', '🚧 메시지 날짜(해 넘김): ' + bk);
    ok(!p.errs.length, '오류 없음 ' + p.errs.join(' | '));
    await p.close();
    console.log('  습득물');
    const q = await open(b, TODAY, 'hub/lost/');
    await q.waitForSelector('[data-login], .mons', { timeout: 8000 }); if (await q.$('[data-login]')) { await q.click('[data-who="0"]'); await q.fill('#pw', 'pw'); await q.click('[data-login]'); }
    await q.waitForSelector('.mons'); await sleep(400);
    const lm = await q.$$eval('.mons [data-mon]', x => x.map(e => e.textContent.trim()));
    ok(lm[0].includes('10월') && lm[lm.length - 1].includes(+TODAY.slice(5, 7) + '월') && lm.length === (TODAY === '2026-12-31' ? 3 : 4), '달 단추: ' + lm.join(' '));
    ok(TODAY < '2027-01-01' || lm.every(x => /^\d\d년 /.test(x)), '해가 섞이면 「26년 · 27년」 붙음');
    ok((await q.evaluate(() => window.__seed['meta/lost_months'] || null)) && (await q.evaluate(() => window.__seed['meta/lost_months'].list.join())).includes('2026-10'), '처음 열 때 옛 달(10월)도 찾아 meta/lost_months 에 적음');
    if (TODAY === '2027-01-02') { await q.click('[data-d="-1"]'); await sleep(200); await q.click('[data-d="-1"]'); await sleep(400);
      ok(/12\/31/.test(await q.innerText('.datebar')) && /모자/.test(await q.innerText('#main')), '‹ 로 1/1 → 12/31 (작년) · 그날 습득물'); }
    await q.click('.mons [data-mon="2026-10"]'); await sleep(400);
    ok(/우산/.test(await q.innerText('#main')) || await q.locator('.cal [data-cd="2026-10-05"] i').count() === 1, '10월 단추 → 달력에 10/5 건수');
    await q.click('.mons [data-mon="2026-11"]'); await sleep(300);
    ok(await q.locator('.mons [data-mon="2026-10"]').count() === 1, '11월로 돌아와도 10월 단추 그대로');
    ok(!q.errs.length, '오류 없음 ' + q.errs.join(' | '));
    await q.close();
  }
  await b.close(); console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})();
