// 🗓 앞날 미리 표기 · 🚧 기간 작업 시험 (2026-11-28) — node test/future_run.js (가명)
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
  ['jbr/' + TODAY]: { date: TODAY, src: 'app', rooms: ROOMS, r: Object.fromEntries(ROOMS.map(r => [r, ['1', '가람', '', '', 0, 0]])), xl: {}, cards: [], groups: [], roster: MAIDS, at: Date.now() },
  'meta/blocks': { list: [{ id: 'b1', name: '타일교체', rooms: ['1210', '1211'], from: new Date(Date.parse(TODAY + 'T00:00:00Z') + 2 * 864e5).toISOString().slice(0, 10), to: new Date(Date.parse(TODAY + 'T00:00:00Z') + 4 * 864e5).toISOString().slice(0, 10), prio: false }] },
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
  const T3 = new Date(Date.parse(TODAY + 'T00:00:00Z') + 3 * 864e5).toISOString().slice(0, 10), T20 = new Date(Date.parse(TODAY + 'T00:00:00Z') + 20 * 864e5).toISOString().slice(0, 10);
  console.log('① 앞날 날짜가 보임 (빈 초안)');
  const has = async ds => p.evaluate(ds => !!document.querySelector('#days [data-d="' + ds + '"]') || [...document.querySelectorAll('[data-mon]')].some(m => m.dataset.mon === ds.slice(0, 7)), ds);
  ok(await has(T3), T3 + ' 날짜 있음 (또는 그 달 단추)');
  await p.evaluate(ds => { const m = ds.slice(0, 7), mb = document.querySelector('[data-mon="' + m + '"]'); if (mb && !mb.classList.contains('on')) mb.click(); }, T3); await sleep(200);
  await p.click('#days [data-d="' + T3 + '"]'); await sleep(300);
  ok(await p.evaluate(ds => document.querySelector('#days [data-d="' + ds + '"]').classList.contains('fut'), T3), '아직 초안 전 = 흐리게');
  ok(/아직 초안 전인 날/.test(await p.innerText('.svb')), '「🗓 아직 초안 전인 날」 안내');
  ok(!(await doc(p, 'jbr/' + T3)), '저장소엔 아직 없음');
  const ci = async r => p.evaluate(r => [...document.querySelectorAll('.c[data-i]')].find(e => e.querySelector('.no').textContent.trim().startsWith(r)).dataset.i, r);
  const cell = async r => p.locator('.c[data-i="' + await ci(r) + '"]');
  ok(/🚧 타일교체/.test(await (await cell('1210')).innerText()) && await (await cell('1210')).evaluate(e => e.classList.contains('bk')), '🚧 기간 작업 방 표시 (1210 타일교체)');
  console.log('② 표기하면 그날 초안이 저절로');
  await (await cell('1201')).click(); await p.click('[data-memo="시설"]'); await sleep(150); await p.fill('#mpin', '에어컨 점검'); await p.keyboard.press('Enter'); await sleep(600);
  const d = await doc(p, 'jbr/' + T3);
  ok(d && d.src === 'app' && d.r['1201'][2] === '시설(에어컨 점검)' && d.r['1201'][0] === '4', T3 + ' 초안 생김 · 1201 시설(에어컨 점검)');
  ok(d.r['1210'][2] === '시설(타일교체)' && d.r['1211'][2] === '시설(타일교체)', '🚧 기간 작업 방엔 「시설(타일교체)」 자동');
  ok(Object.keys(d.r).filter(k => !['1201', '1210', '1211'].includes(k)).every(k => d.r[k][0] === '4' && !d.r[k][2]), '나머지는 전 객실 4 그대로');
  await (await cell('1202')).click(); await p.keyboard.press('5'); await sleep(400);
  ok((await doc(p, 'jbr/' + T3)).r['1202'][5] === 1, '다음 표기부터는 보통 저장 (1202 연박)');
  ok(/저장 켜짐/.test(await p.innerText('.svb')), '이제 💾 저장 켜짐');
  console.log('③ 🚧 기간 작업 단추');
  ok(/🚧 기간 작업 1/.test(await p.innerText('[data-blocks]')), '「🚧 기간 작업 1」');
  await p.click('[data-blocks]'); await sleep(300);
  ok((await p.$eval('#asgx iframe', x => x.getAttribute('src'))) === '../?embed=blocks', '누르면 기간 작업 창 (장기 미정비)');
  await p.evaluate(() => document.getElementById('asgx').remove());
  console.log('④ 결산엔 앞날 빈 날 안 들어감');
  await p.evaluate(ds => { document.querySelector('[data-mon="' + ds.slice(0, 7) + '"]').click(); }, TODAY); await sleep(200);
  await p.click('#days [data-d="' + TODAY + '"]'); await sleep(200);
  await p.click('#tabs [data-t="close"]'); await sleep(400);
  const heads = await p.$$eval('#main table thead th', ths => ths.map(t => t.textContent.trim()));
  const fut = (+TODAY.slice(8)) + 1;
  ok(!heads.some(h => h === String(fut) || h === fut + '일'), '결산 표에 내일(' + fut + '일) 칸 없음');
  ok(!p.errs.length, '오류 없음' + (p.errs.length ? ': ' + p.errs.join(' | ') : ''));
  await b.close();
  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})();
