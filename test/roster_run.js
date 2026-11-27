// 👥 룸메이드 명단 시험 (2026-11-27) — node test/roster_run.js
//   스케줄표(소장)가 HK 전파 사본에 주간 명단(all)을 같이 쓰는지 · 👥 명단 탭(소장 · 하우스키퍼) · 정비보고서 12월 명단 규칙(schedRoster)
//   이름은 모두 가명
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const C = require('../rmsched/core.js');
const ROOT = { hub: path.resolve(__dirname, '..'), rm: process.env.RM || path.resolve(__dirname, '../../rm') };
const BASE = 'https://haeundae-rm.github.io/';
let pass = 0, fail = 0; const ok = (c, l) => { c ? pass++ : fail++; console.log((c ? '  ✅ ' : '  ❌ ') + l); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const UID = { boss: 'iw2orXgIgPgTbLUQa0b41XJ9Dvd2', hk: 'nBL2QYezEmRNRmBRMXN6LNPJO2s2' };
const EMAIL = { boss: 'unieshaeundae+admin@gmail.com', hk: 'unieshaeundae+hk@gmail.com' };

const TODAY = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), MON = C.mondayOf(C.addDays(TODAY, 3));
function week() {
  const w = C.emptyWeek(MON);
  [['가람', ''], ['나래', ''], ['다솜', '11/29 퇴사'], ['라온', ''], ['마루', '']].forEach(([n, memo], i) => w.rows.push(C.newRow({ name: n, memo, st: i === 1 ? ['휴', '', '', '', '', '', ''] : Array(7).fill(''), u: Array(7).fill(9) })));
  w.at = Date.now(); return w;
}
async function open(browser, seed, who, url) {
  const ctx = await browser.newContext({ locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport: { width: 1300, height: 900 } });
  await ctx.addInitScript(([s, u]) => { window.__seed = s; window.__live = 1; if (u) sessionStorage.setItem('fu', JSON.stringify(u)); }, [seed, who ? { uid: UID[who], anon: false, email: EMAIL[who] } : null]);
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
  await p.goto(BASE + url); return p;
}

(async () => {
  const b = await chromium.launch();
  console.log('① 소장: 주차를 열면 HK 전파 사본에 주간 명단(all)도 같이');
  let p = await open(b, { 'rmsched/cfg': { roster: [], helpers: [] }, ['rmsched/' + MON]: week() }, 'boss', 'hub/rmsched/');
  await sleep(2500);
  const hk = await p.evaluate(() => Object.keys(window.__seed).filter(k => k.startsWith('rmsched_hk/')).sort().map(k => window.__seed[k]));
  ok(hk.length === 7, 'HK 전파 사본 7일 (' + hk.length + ')');
  const a0 = hk[0] && hk[0].all;
  ok(Array.isArray(a0) && a0.map(x => x.n).join(',') === '가람,나래,다솜,라온,마루', '명단 순서 = 주간 스케줄 줄 순서: ' + (a0 || []).map(x => x.n).join(','));
  ok(a0 && a0[2].out === true && a0[0].out === false, "메모 '퇴사' → out 표시 (다솜)");
  ok(a0 && a0[1].d === '휴' && hk[0].mon === MON, '그날 상태 · 주차 월요일');
  ok(!JSON.stringify(hk[0]).includes('11/29 퇴사'), '메모 글은 안 보냄');
  await p.click('#tabs [data-tab="ros"]'); await sleep(300);
  let t = await p.innerText('#view');
  ok(/룸메이드 명단 · 4명 \(\+ 퇴사 1\)/.test(t) && /휴무/.test(t), '소장 👥 명단 탭: ' + t.split('\n').find(l => /룸메이드 명단/.test(l)));
  ok(!p.errs.length, '오류 없음 ' + p.errs.slice(0, 2).join(' | '));

  console.log('② 하우스키퍼: HK 전파 · 👥 명단 두 탭만');
  const seed2 = {}; hk.forEach(x => { seed2['rmsched_hk/' + x.date] = x; });
  p = await open(b, seed2, 'hk', 'hub/rmsched/#hk'); await sleep(1500);
  const vis = await p.$$eval('#tabs button', bs => bs.filter(x => !x.hidden && x.offsetParent !== null).map(x => x.dataset.tab));
  ok(vis.join(',') === 'hk,ros', '보이는 탭: ' + vis.join(','));
  await p.click('#tabs [data-tab="ros"]'); await sleep(300);
  t = await p.innerText('#view');
  ok(/가람/.test(t) && /퇴사/.test(t) && /룸메이드 명단 · 4명/.test(t), '하우스키퍼 명단 보임');
  await p.screenshot({ path: '/tmp/jbr_shots/4_roster_hk.png' });
  await p.click('#tabs [data-tab="hk"]'); await sleep(200);
  ok(/RM 방배정표/.test(await p.innerText('#view')), 'HK 전파 탭으로 돌아감');
  ok(!p.errs.length, '오류 없음 ' + p.errs.slice(0, 2).join(' | '));

  console.log('③ 정비보고서 12월 명단 규칙 (schedRoster)');
  p = await open(b, {}, 'hk', 'hub/jbr/'); await p.waitForFunction(() => window.__jbr && window.__jbr.schedRoster);
  const R = await p.evaluate(() => {
    const A = (ns, out = []) => ns.map(n => ({ n, d: '', out: out.includes(n) }));
    const hks = [{ date: '2026-12-01', all: A(['가람', '나래', '다솜', '라온', '마루']) },
                 { date: '2026-12-08', all: A(['나래', '가람', '라온', '바다', '마루', '다솜'], ['다솜']) }];   // 순번 바뀜 · 라온 다음에 바다 새로 · 다솜 퇴사 · 마루 그대로
    const day = rs => ({ r: rs.map(n => ['1', n, '', '', 0, 0]) });
    const r1 = window.__jbr.schedRoster('2026-12', { '2026-12-02': day(['가람', '다솜']) }, hks);
    const r2 = window.__jbr.schedRoster('2026-12', { '2026-12-02': day(['가람']) }, hks);
    const hks3 = [hks[0], { date: '2026-12-08', all: A(['나래', '가람', '바다', '마루']) }];   // 라온이 명단에서 아예 빠짐 (기록 있음)
    const r3 = window.__jbr.schedRoster('2026-12', { '2026-12-03': day(['라온']) }, hks3);
    const P = window.__jbr.toP([{ date: '2026-11-30', r: { 101: ['1', 'X', '', '', 0, 0] }, roster: ['엑셀명단'] }, { date: '2026-12-02', r: { 101: ['1', '가람', '', '', 0, 0] }, roster: ['엑셀명단'] }], hks);
    return { r1, r2, r3, nov: P.months['2026-11'].roster, dec: P.months['2026-12'].roster };
  });
  ok(R.r1.join(',') === '나래,가람,라온,바다,마루,다솜', '최근 주 순번 + 기록 있는 퇴사자(다솜) 남음: ' + R.r1.join(','));
  ok(R.r2.join(',') === '나래,가람,라온,바다,마루', '기록 없는 퇴사자는 빠짐: ' + R.r2.join(','));
  ok(R.r3.join(',') === '나래,가람,라온,바다,마루', '명단에서 빠진 분(라온)도 기록 있으면 예전 순번 자리에: ' + R.r3.join(','));
  ok(R.nov.join() === '엑셀명단' && R.dec[0] === '나래', '11월 = 엑셀 명단 그대로 · 12월 = 스케줄표 명단');
  ok(!p.errs.length, '오류 없음 ' + p.errs.slice(0, 2).join(' | '));
  await b.close();
  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})();
