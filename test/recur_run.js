// 🏨 장기 투숙 시험 (2026-11-28 1405 총지배인 객실 매주 화) — node test/recur_run.js (가명)
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
  'meta/recur': { list: [{ id: 'r1', room: '1405', dows: [new Date(Date.parse(TODAY + 'T00:00:00Z') + 3 * 864e5).getUTCDay(), new Date(TODAY + 'T00:00:00Z').getUTCDay()], st: '2', memo: '총지배인 객실', from: TODAY, to: '' }], hist: [] },
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
  const T1 = new Date(Date.parse(TODAY + 'T00:00:00Z') + 1 * 864e5).toISOString().slice(0, 10), T3 = new Date(Date.parse(TODAY + 'T00:00:00Z') + 3 * 864e5).toISOString().slice(0, 10);
  const ci = async r => p.evaluate(r => [...document.querySelectorAll('.c[data-i]')].find(e => e.querySelector('.no').textContent.trim().startsWith(r)).dataset.i, r);
  const cell = async r => p.locator('.c[data-i="' + await ci(r) + '"]');
  const goDay = async ds => { await p.evaluate(ds => { const mb = document.querySelector('[data-mon="' + ds.slice(0, 7) + '"]'); if (mb && !mb.classList.contains('on')) mb.click(); }, ds); await sleep(200); await p.click('#days [data-d="' + ds + '"]'); await sleep(300); };
  console.log('① 오늘(재실 청소 요일): 1405 가 퇴실이면 빨간 줄 → 「바로 맞추기」');
  ok(/🏨 장기 투숙 확인: 1405 총지배인 객실 — 재실 청소\(2\)이어야 하는데 지금 퇴실/.test(await p.innerText('#main')), '빨간 줄 「🏨 장기 투숙 확인 … 지금 퇴실」');
  ok(/🏨 총지배인 객실 · 재실/.test(await (await cell('1405')).innerText()), '격자 1405 🏨 · 재실');
  ok(/🏨 장기 투숙 1/.test(await p.innerText('#main')), '표 위 단추 「🏨 장기 투숙 1」');
  await p.click('[data-stayfix]'); await sleep(500);
  let d = await doc(p, 'jbr/' + TODAY);
  ok(d.r['1405'][0] === '2' && d.r['1405'][5] === 1 && /🏨 총지배인 객실/.test(d.r['1405'][2] + d.r['1405'][3]) && !/장기 투숙 확인/.test(await p.innerText('#main')), '바로 맞추기 → 1405 재실(2) · 연박 · 🏨 메모 · 빨간 줄 사라짐');
  console.log('② 앞날: 청소 요일이 아니면 연박만, 청소 요일이면 재실');
  for (const [ds, cl] of [[T1, false], [T3, true]]) { await goDay(ds); await (await cell('1201')).click(); await p.click('[data-memo="시설"]'); await p.fill('#mpin', '점검'); await p.keyboard.press('Enter'); await sleep(600);
    d = await doc(p, 'jbr/' + ds); ok(d && d.r['1405'][0] === (cl ? '2' : '') && d.r['1405'][5] === 1 && /^🏨 총지배인 객실/.test(d.r['1405'][2]), ds.slice(5) + (cl ? ' 재실(2) + 연박' : ' 연박만') + ' + 🏨 메모'); }
  console.log('③ 방을 고르고 「🏨 장기 투숙」 → 지정');
  await goDay(TODAY); await (await cell('1205')).click(); await p.click('[data-stay]'); await sleep(200);
  ok(await p.locator('#spop').isVisible() && /1205/.test(await p.innerText('#spop')), '창: 🏨 장기 투숙 — 1205');
  await p.keyboard.press('2'); await sleep(100); ok((await doc(p, 'jbr/' + TODAY)).r['1205'][0] !== '2', '창 열린 동안 격자 단축키 안 먹음');
  await p.fill('#smemo', 'VIP 장기'); await p.click('#spop [data-sdow="' + new Date(TODAY + 'T00:00:00Z').getUTCDay() + '"]'); await p.click('#spop [data-ssave]'); await sleep(700);
  let rd = await doc(p, 'meta/recur'); ok(rd.list.some(x => x.room === '1205' && x.memo === 'VIP 장기' && !x.to) && /넣음: 1205/.test(rd.hist[rd.hist.length - 1].what), 'meta/recur 에 1205 · 기록');
  d = await doc(p, 'jbr/' + TODAY); ok(d.r['1205'][0] === '2' && d.r['1205'][5] === 1, '오늘 이미 만든 날도 바로 재실(2) · 연박');
  console.log('④ 방 안 고르고 누르면 목록 → 고치기 → 퇴실 처리');
  await goDay(T1); await goDay(TODAY);   // 날을 바꾸면 고른 방이 풀림
  await p.click('[data-stay]'); await sleep(200);
  const txt = await p.innerText('#spop'); ok(/1205/.test(txt) && /1405/.test(txt), '목록에 1205 · 1405' + (/1205/.test(txt) && /1405/.test(txt) ? '' : ': ' + txt.slice(0, 80)));
  await p.click('#spop [data-sed="r1"]').catch(() => {}); await sleep(150);
  if (await p.locator('#spop [data-sout]').count()) { await p.click('#spop [data-sout]'); await sleep(600); }
  rd = await doc(p, 'meta/recur'); ok(rd.list.find(x => x.id === 'r1').to === TODAY, '퇴실 처리 → 1405 끝 날짜 = 오늘');
  console.log('⑤ 기간 작업 창에 📌 정기 카드 없음');
  await p.evaluate(async () => { const S = await import('../../rm/app/store.js'); const m = await import('../assignui.js');
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ymd = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
    m.openAssign({ S, esc, ymd, addDays, md: d => +d.slice(5, 7) + '/' + +d.slice(8), logErr: () => {}, admin: () => ({ label: '하우스키퍼' }), user: () => ({ uid: 'x' }), upload: () => {} }, { view: 'blocks' }); });
  await p.waitForSelector('#asp'); await sleep(400); ok(!/정기 표기/.test(await p.innerText('#asp')), '🚧 창에 정기 표기 카드 없음');
  ok(!p.errs.length, '오류 없음' + (p.errs.length ? ': ' + p.errs.join(' | ') : ''));
  await b.close();
  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})();
