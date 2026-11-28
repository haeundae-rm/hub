// 🛟 복구 시험 (2026-11-28 11:31 사고) — node test/restore_run.js: 엑셀 → 앱 원본 → 고침 → 실수로 초안 처음으로 → 🛟 복구 (가짜 engine · 가명)
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
  ['jbr/' + TODAY]: { date: TODAY, src: 'app', rooms: ROOMS, r: Object.fromEntries(ROOMS.map(r => [r, ['4', '', '', '', 0, 0]])), xl: {}, cards: [], groups: [], roster: MAIDS, at: Date.now() },
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
  const ci = async r => p.evaluate(r => [...document.querySelectorAll('.c[data-i]')].find(e => e.querySelector('.no').textContent.trim().startsWith(r)).dataset.i, r);
  const d0 = async r => (await doc(p, 'jbr/' + TODAY)).r[r];
  await p.setInputFiles('#takeFile', { name: '11월 정비보고서.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') }); await sleep(1200);
  console.log('① 엑셀 → 앱 원본 뒤 오늘 고침 (완료 · 담당 바꿈 · 메모 · 단체)');
  await p.click('.c[data-i="' + await ci('401') + '"]'); await p.keyboard.press(' '); await sleep(250);
  await p.click('.c[data-i="' + await ci('402') + '"]'); await p.fill('#cmd', '다솜'); await p.press('#cmd', 'Enter'); await sleep(250);
  await p.click('.c[data-i="' + await ci('403') + '"]'); await p.fill('#fmemo', '고객 요청'); await p.press('#fmemo', 'Enter'); await sleep(250);
  const before = JSON.stringify((await doc(p, 'jbr/' + TODAY)).r);
  ok((await d0('401'))[4] === 1 && (await d0('402'))[1] === '다솜' && (await d0('403')).includes('고객 요청'), '고친 내용 저장됨');
  ok(await p.locator('[data-jreset]').count() === 0, '오늘은 「↺ 초안 처음으로」 안 보임 (사고 막음)');
  console.log('② 실수로 초안 처음으로 (예전 판처럼 직접)');
  await p.evaluate(T => window.JBR.sv.newDay(T), TODAY); await sleep(500);
  ok(Object.values((await doc(p, 'jbr/' + TODAY)).r).every(x => x[0] === '4' && !x[1]), '전 객실 4 (사고 상태)');
  console.log('③ 🛟 복구');
  ok(await p.locator('#restFile').count() === 1, '「🛟 복구」 단추');
  await p.setInputFiles('#restFile', { name: '11월 정비보고서.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') }); await sleep(1500);
  const after = (await doc(p, 'jbr/' + TODAY));
  ok(JSON.stringify(after.r) === before, '방 417실 모두 사고 전과 같음 (완료 · 담당 · 메모 포함)');
  ok(after.src === 'app' && after.cards.length === 4 && after.groups[0].rooms === '501,502', '앱 원본 · 출근 카드 · 단체 그대로');
  const lg = await p.evaluate(T => Object.keys(window.__seed).filter(k => k.startsWith('jbr/' + T + '/log/')).map(k => window.__seed[k]).find(x => x.k === 'restore'), TODAY);
  ok(lg && lg.n >= 2, '변경 기록 restore (' + (lg && lg.n) + '칸 다시 적용)');
  ok(!p.errs.length, '오류 없음' + (p.errs.length ? ': ' + p.errs.join(' | ') : ''));
  await b.close();
  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})();
