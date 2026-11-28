// 📌 정기 표기 시험 (2026-11-28 1405 총지배인 객실 매주 화) — node test/recur_run.js (가명)
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
  const T3 = new Date(Date.parse(TODAY + 'T00:00:00Z') + 3 * 864e5).toISOString().slice(0, 10);
  const ci = async r => p.evaluate(r => [...document.querySelectorAll('.c[data-i]')].find(e => e.querySelector('.no').textContent.trim().startsWith(r)).dataset.i, r);
  const cell = async r => p.locator('.c[data-i="' + await ci(r) + '"]');
  console.log('① 오늘: 1405 가 재실이 아니면 빨간 확인 줄');
  await p.locator('#days button', { hasText: (+TODAY.slice(8)) + '일' }).first().click().catch(() => {}); await sleep(300);
  ok(/📌 정기 표기 확인: 1405 총지배인 객실 — 재실\(2\)이어야 하는데 지금 퇴실/.test(await p.innerText('#main')), '「📌 정기 표기 확인 … 지금 퇴실」');
  ok(/📌 총지배인 객실/.test(await (await cell('1405')).innerText()) && await (await cell('1405')).evaluate(e => e.classList.contains('rc')), '격자 1405 📌 표시');
  await (await cell('1405')).click(); await p.keyboard.press('2'); await sleep(400);
  ok(!/📌 정기 표기 확인/.test(await p.innerText('#main')), '재실(2)로 고치면 빨간 줄 사라짐');
  console.log('② 앞날(같은 요일): 초안 만들 때 저절로 재실 + 📌 메모');
  await p.evaluate(ds => { const mb = document.querySelector('[data-mon="' + ds.slice(0, 7) + '"]'); if (mb && !mb.classList.contains('on')) mb.click(); }, T3); await sleep(200);
  await p.click('#days [data-d="' + T3 + '"]'); await sleep(300);
  ok(/📌 총지배인 객실/.test(await (await cell('1405')).innerText()), '흐린 앞날에도 1405 📌');
  await (await cell('1201')).click(); await p.click('[data-memo="시설"]'); await p.fill('#mpin', '점검'); await p.keyboard.press('Enter'); await sleep(600);
  const d = await doc(p, 'jbr/' + T3);
  ok(d && d.r['1405'][0] === '2' && d.r['1405'][5] === 1 && d.r['1405'][2] === '📌 총지배인 객실', '초안: 1405 = 재실(2) · 연박 · 메모 「📌 총지배인 객실」');
  console.log('③ 정기 표기 고치기 (🚧 기간 작업 창 안 📌)');
  await p.evaluate(async () => { const S = await import('../../rm/app/store.js'); const m = await import('../assignui.js');
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ymd = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
    m.openAssign({ S, esc, ymd, addDays, md: d => +d.slice(5, 7) + '/' + +d.slice(8), logErr: () => {}, admin: () => ({ label: '하우스키퍼' }), user: () => ({ uid: 'x' }), upload: () => {} }, { view: 'blocks' }); });
  await p.waitForSelector('#asp [data-as="rcedit"]'); await sleep(200);
  ok(/📌 1405 · 매주 .* · 재실 청소 · 「총지배인 객실」/.test(await p.innerText('#asp')), '목록: 📌 1405 · 매주 … 재실 청소');
  await p.click('#asp [data-as="rcedit"]'); await sleep(150); await p.fill('#asp [data-rc="room"]', '2203'); await p.click('#asp [data-as="rcsave"]'); await sleep(400);
  let rd = await doc(p, 'meta/recur'); ok(rd.list.length === 1 && rd.list[0].room === '2203' && /고침: 1405/.test(rd.hist[rd.hist.length - 1].what), '방 바뀜 → 호실만 고침 (기록 남음)');
  await p.click('#asp [data-as="rcnew"]'); await p.fill('#asp [data-rc="room"]', '9999'); await p.click('#asp [data-as="rcsave"]'); await sleep(200);
  ok(/없는 호실/.test(await p.innerText('#asp')), '없는 호실은 저장 안 함');
  await p.fill('#asp [data-rc="room"]', '2901'); await p.click('#asp [data-as="rcsave"]'); await sleep(200); ok(/요일을/.test(await p.innerText('#asp')), '요일 안 고르면 저장 안 함');
  await p.click('#asp [data-as="rcdow"][data-v="5"]'); await p.click('#asp [data-as="rcst"][data-v=""]'); await p.fill('#asp [data-rc="memo"]', '우선 14시까지'); await p.click('#asp [data-as="rcsave"]'); await sleep(400);
  rd = await doc(p, 'meta/recur'); ok(rd.list.length === 2 && rd.list.find(x => x.room === '2901' && x.dows.join() === '5' && x.st === ''), '새 줄: 2901 · 매주 금 · 메모만');
  await p.click('#asp [data-as="rcedit"][data-v="' + rd.list.find(x => x.room === '2901').id + '"]'); await sleep(100); await p.fill('#asp [data-rc="to"]', TODAY); await p.click('#asp [data-as="rcsave"]'); await sleep(400);
  rd = await doc(p, 'meta/recur'); ok(rd.list.find(x => x.room === '2901').to === TODAY, '임기 끝 = 끝 날짜만');
  ok(!p.errs.length, '오류 없음' + (p.errs.length ? ': ' + p.errs.join(' | ') : ''));
  await b.close();
  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})();
