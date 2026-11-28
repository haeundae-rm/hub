// 🖥 정비보고서 머리 화면 맞춤 시험 (2026-11-28) — node test/head_run.js : 31일 달 + 🌙 초안이 여러 모니터 폭에서 한 줄 · 좌우 스크롤 없음
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
  ...Object.fromEntries([].concat(Array.from({ length: 31 }, (_, i) => '2026-10-' + ('0' + (i + 1)).slice(-2)), Array.from({ length: +TODAY.slice(8) }, (_, i) => TODAY.slice(0, 8) + ('0' + (i + 1)).slice(-2))).map(ds => ['jbr/' + ds, { date: ds, src: 'excel', rooms: ROOMS, r: Object.fromEntries(ROOMS.map(r => [r, ['1', '가람', '', '', 1, 0]])), xl: {}, cards: [{ n: '가람', u: 9 }], groups: [], roster: MAIDS, at: Date.now() }])),
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
  await p.click('[data-mon="2026-10"]'); await sleep(300);
  ok(await p.locator('#days [data-d]').count() === 31, '10월 = 31일 단추');
  for (const w of [1280, 1366, 1440, 1536, 1600, 1920, 2560]) {
    await p.setViewportSize({ width: w, height: 900 }); await sleep(250);
    const r = await p.evaluate(() => { const D = document.getElementById('days'), H = document.querySelector('.hrow'), nb = document.querySelector('#days .jnewb'), last = [...D.querySelectorAll('[data-d]')].pop();
      const kids = [...H.children].map(e => e.getBoundingClientRect()), top0 = kids[0].top;
      return { page: document.documentElement.scrollWidth <= innerWidth, days: D.scrollWidth <= D.clientWidth + 1, nb: !!nb && nb.getBoundingClientRect().right <= innerWidth && nb.scrollWidth <= nb.clientWidth + 1, lastOk: last.scrollWidth <= last.clientWidth + 1, oneRow: kids.every(k => Math.abs(k.top - top0) < 8), right: Math.max(...kids.map(k => k.right)) <= innerWidth, dayW: Math.round(last.getBoundingClientRect().width), fs: getComputedStyle(last).fontSize, h: Math.round(document.querySelector('header').getBoundingClientRect().height) }; });
    ok(r.page && r.days && r.nb && r.lastOk && r.oneRow && r.right, w + 'px: 좌우 스크롤 없음 · 31일 + 🌙 초안 한 줄 · 위 줄 한 줄 (날짜 칸 ' + r.dayW + 'px · 글자 ' + r.fs + ' · 머리 높이 ' + r.h + 'px)' + (r.page && r.days && r.nb && r.lastOk && r.oneRow && r.right ? '' : ' ' + JSON.stringify(r)));
    if (w === 1366 || w === 1920) await p.screenshot({ path: '/tmp/head_' + w + '.png', clip: { x: 0, y: 0, width: w, height: r.h } });
  }
  ok(!p.errs.length, '오류 없음' + (p.errs.length ? ': ' + p.errs.join(' | ') : ''));
  await b.close();
  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})();
