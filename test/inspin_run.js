// 🔒 인스펙션 비밀번호 시험 (2026-11-28) — node test/inspin_run.js
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
  
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', e => p.errs.push(String(e))); p.on('dialog', x => x.accept());
  await p.goto(BASE + url);
  return p;
}
(async () => {
  const b = await chromium.launch(); const T = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const p = await open(b, T, 'hub/#quality'); await sleep(1500);
  await p.waitForSelector('a[href="./insp/"]', { timeout: 8000 });
  await p.click('a[href="./insp/"]'); await sleep(300);
  ok(await p.locator('.pn-bg').count() === 1 && /인스펙션 화면 비밀번호/.test(await p.innerText('.pn-bg')), '인스펙션 열기 → 4자리 창');
  await p.fill('.pn-in', '1234'); await sleep(300);
  ok(/맞지 않아요/.test(await p.innerText('.pn-bg')) && /hub\/#quality|hub\/$/.test(p.url()), '틀리면 안 들어감');
  await p.fill('.pn-in', '1901'); await sleep(800);
  ok(/\/insp\//.test(p.url()), '1901 → 인스펙션으로');
  await p.goBack(); await sleep(1200); await p.waitForSelector('a[href="./insp/"]').catch(() => {});
  await p.click('a[href="./insp/"]'); await sleep(600);
  ok(/\/insp\//.test(p.url()), '30분 안엔 다시 안 물음');
  await p.goBack(); await sleep(1200);
  const pm = await p.evaluate(async () => { const m = await import('/hub/pin.js'); return [m.passed('insp'), m.passed()]; });
  ok(pm[0] === true && pm[1] === false, '인사 비밀번호와 따로 (인스펙션 통과해도 인사는 다시 물음)');
  ok(!p.errs.length, '오류 없음 ' + p.errs.join(' | '));
  await b.close(); console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})();
