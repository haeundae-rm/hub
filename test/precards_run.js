// 📣 초안 날 HK 전파 출근 예정 카드 시험 (2026-11-28) — node test/precards_run.js (가명)
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
  const b = await chromium.launch(); const p = await open(b);
  const T3 = new Date(Date.parse(TODAY + 'T00:00:00Z') + 3 * 864e5).toISOString().slice(0, 10);
  const goDay = async ds => { await p.evaluate(ds => { const mb = document.querySelector('[data-mon="' + ds.slice(0, 7) + '"]'); if (mb && !mb.classList.contains('on')) mb.click(); }, ds); await sleep(200); await p.click('#days [data-d="' + ds + '"]'); await sleep(300); };
  const ci = async r => p.evaluate(r => [...document.querySelectorAll('.c[data-i]')].find(e => e.querySelector('.no').textContent.trim().startsWith(r)).dataset.i, r);
  await goDay(T1);
  const n = await p.locator('.cards.pre .card.pre').count(), s1 = (await p.innerText('.cards.pre .presum')).replace(/\s+/g, ' ');
  ok(n === MAIDS.length, '앞날(흐린 날): HK 전파 출근 예정 카드 ' + n + '장');
  ok(/HK 전파 출근 예정 \d+명 · \d+/.test(s1) && /정비할 방 \d+실/.test(s1), '요약: ' + s1.replace(/\s+/g, ' '));
  const t1 = +(/정비할 방 (\d+)실/.exec(s1) || [])[1];
  await p.click('.c[data-i="' + await ci('1201') + '"]'); await p.keyboard.press('5'); await sleep(600);
  const s2 = (await p.innerText('.cards.pre .presum')).replace(/\s+/g, ' '); const t2 = +(/정비할 방 (\d+)실/.exec(s2) || [])[1];
  ok(t2 === t1 - 1 && await p.locator('.cards.pre .card.pre').count() === MAIDS.length, '연박 표시하면 정비할 방 하나 줄어듦 (' + t1 + ' → ' + t2 + ') · 카드 그대로');
  await goDay(T3);
  ok(/HK 전파가 아직 없어요/.test(await p.innerText('.cards.pre')), 'HK 전파 없는 날 안내');
  await goDay(TODAY); const hasCards = await p.evaluate(() => !!document.querySelector('.cards:not(.pre) .card'));
  ok(hasCards ? !(await p.locator('.cards.pre').count()) : true, '넣은 날(카드 있음)은 미리 보기 안 나옴' + (hasCards ? '' : ' (오늘 시험 자료에 카드 없음 — 건너뜀)'));
  ok(!p.errs.length, '오류 없음 ' + p.errs.join(' | '));
  await b.close(); console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})();
