// 🧩 정비보고서 창 안 자동 배정 시험 (2026-11-27) — node test/asg_embed_run.js  (가명 · 만든 자료)
//   📑 정비보고서 → 🌙 초안 → 「🧩 자동 배정」(허브 ?embed=asg 겹창) → 불러오기 → 미정비 남기기 → 자동 배정 → 확정 → 닫기 → 정비보고서에 이름
// (아래 준비는 nightflow_run.js 와 같음)
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
  await ctx.addInitScript(s => { let ps = null; try { if (window.parent !== window) ps = window.parent.__seed; } catch (e) {} window.__seed = ps || (sessionStorage.getItem('__seedKeep') ? JSON.parse(sessionStorage.getItem('__seedKeep')) : s);   // 겹창(iframe)은 정비보고서 창과 같은 가짜 저장소
 window.__live = 1; sessionStorage.setItem('fu', JSON.stringify({ uid: 'nBL2QYezEmRNRmBRMXN6LNPJO2s2', anon: false, email: 'unieshaeundae+hk@gmail.com' })); }, SEED);
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
  if (new Date(Date.now() + 9 * 3600e3).getUTCHours() < 9) await ctx.clock.setFixedTime(Date.parse(TODAY + 'T10:00:00+09:00'));   // 09시 전엔 🌙 초안이 오늘 날짜라 시험 날짜(내일)에 맞춰 10시로
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', e => p.errs.push(String(e))); p.on('console', m => { if (m.type() === 'error' && !/Failed to load|404/.test(m.text())) p.errs.push(m.text()); });
  p.on('dialog', x => x.accept());
  await p.goto(BASE + 'hub/jbr/'); await p.waitForSelector('.c[data-i]', { timeout: 8000 });
  return p;
}
const doc = (p, k) => p.evaluate(k => JSON.parse(JSON.stringify(window.__seed[k] || null)), k);
(async () => {
  const b = await chromium.launch(); const p = await open(b);
  await p.click('[data-jnew="' + T1 + '"]'); await sleep(400);
  await p.evaluate(async ([T1, ROOMS]) => { const S = await import('../../rm/app/store.js'); const r = {};
    ROOMS.forEach(k => { const f = Math.floor(k / 100); if (f >= 8 && k !== '3001') r[k] = (k % 2) ? ['', '', '', '', 0, 1] : ['', '', '', '', 0, 0]; });
    await S.merge('jbr/' + T1, { r }); }, [T1, ROOMS]);
  await sleep(300);
  console.log('① 「🧩 자동 배정」 단추 → 겹창');
  ok(!!(await p.$('#tabs [data-asgo="asg"]')), '정비보고서 위에 「🧩 자동 배정」');
  await p.click('#tabs [data-asgo="asg"]');
  await p.waitForSelector('#asgx iframe'); const fr = p.frameLocator('#asgx iframe');
  await fr.locator('#asp [data-as="app"]').waitFor({ timeout: 10000 });
  ok(true, '겹창 안에 자동 배정 화면 (허브 머리 없이)');
  ok(await p.frames()[1].evaluate(() => document.body.classList.contains('embed')), 'embed 모드');
  console.log('② 불러오기 → 미정비 → 자동 배정 → 확정');
  await fr.locator('#asp [data-as="date"][data-v="' + T1 + '"]').click(); await fr.locator('#asp [data-as="app"]').click(); await sleep(600);
  ok(/HK 전파.*4명 · 36유닛/.test(await fr.locator('#asp').innerText()), '출근자 = HK 전파 4명 · 36유닛');
  await fr.locator('#asp [data-as="carry2"]').click(); await sleep(200); await fr.locator('#asp [data-as="c2eng"]').click(); await sleep(200); await fr.locator('#asp [data-as="c2done"]').click(); await sleep(200);
  await fr.locator('#asp [data-as="run"]').click(); await sleep(200); await fr.locator('#asp [data-as="askyes"]').click();
  await fr.locator('#asp [data-as="send"]').waitFor({ timeout: 120000 });
  await fr.locator('#asp [data-as="send"]').click(); await sleep(1500);
  const d = await doc(p, 'jbr/' + T1); const named = Object.keys(d.r).filter(k => d.r[k][1]);
  ok(named.length > 30 && d.asg, '확정 → 정비보고서에 이름 ' + named.length + '실 (같은 저장소)');
  ok(!d.asg.sentAt && !(await doc(p, 'uploads/latest')), '넣기만 — 메이드 휴대폰 올리기 안 함 (11/28 A안)');
  console.log('③ 닫기');
  ok(await p.locator('#asgx').count() === 0, '넣기 → 겹창 저절로 닫힘 → 정비보고서 격자 (📱 보내기 띠)');
  // 가짜 저장소는 겹창이 쓴 것을 정비보고서 창 구독에 안 알려 줌 (실제 Firestore 는 알려 줌) → 다시 읽기
  await p.evaluate(() => { const s = window.__seed; sessionStorage.setItem('__seedKeep', JSON.stringify(s)); }); await p.reload(); await p.waitForSelector('.c[data-i]', { timeout: 8000 }); await sleep(300); await p.locator('#days button', { hasText: (+T1.slice(8)) + '일' }).first().click(); await sleep(300);
  ok(await p.locator('.sndb.wait [data-jsend]').count() === 1, '「📱 메이드 휴대폰 보내기」 단추');
  ok((await doc(p, 'jbr/' + T1)).cards.some(c => c.n === '가람'), '정비보고서 자료에 출근 카드');
  console.log('④ 그냥 닫기(✕) → 자동으로 정비보고서로');
  await p.click('#tabs [data-asgo="asg"]'); await p.frameLocator('#asgx iframe').locator('#asp [data-as="close"]').click({ timeout: 10000 }); await sleep(600);
  ok(await p.locator('#asgx').count() === 0, '자동 배정 ✕ → 겹창도 닫힘');
  console.log('⑤ 📝 배정 의견');
  await p.click('#tabs [data-asgo="asg"]'); await sleep(300); await p.click('#asgx [data-asgo="notes"]');
  await p.frameLocator('#asgx iframe').locator('#anp').waitFor({ timeout: 10000 }).catch(() => {});
  ok(await p.frameLocator('#asgx iframe').locator('#anp').count() === 1, '📝 배정 의견 창');
  ok(!p.errs.length, '오류 없음 ' + p.errs.slice(0, 3).join(' | '));
  await b.close(); console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})();
