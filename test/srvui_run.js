// ☁ 서버 연동 허브 화면 시험 (2026-11-28) — node test/srvui_run.js (보류 반영 · 멈춤 경고 · 모드 단추 소장만)
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
async function open(browser, SEED, url, who) {
  const ctx = await browser.newContext({ locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript(([s, who]) => { window.__seed = s; window.__live = 1; sessionStorage.setItem('fu', JSON.stringify(who === 'boss' ? { uid: 'iw2orXgIgPgTbLUQa0b41XJ9Dvd2', anon: false, email: 'unieshaeundae+admin@gmail.com' } : { uid: 'nBL2QYezEmRNRmBRMXN6LNPJO2s2', anon: false, email: 'unieshaeundae+hk@gmail.com' })); }, [SEED, who]);
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
const D = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), now = Date.now();
const CMP = { day: D, at: now, same: 12, miss: 1, wait: 2, pcPend: 0, list: [{ at: now - 3600e3, keys: ['추가|가람|1201'], pc: 'miss', pcMissing: ['추가|가람|1201'] }, { at: now - 600e3, keys: ['표시|1305'], pc: 'same', pcMissing: [] }] };
(async () => {
  const b = await chromium.launch();
  console.log('① 비교만 · 정상 (소장)');
  let p = await open(b, { 'meta/rsync_srv': { day: D, mode: 'shadow', runMode: 'shadow', state: 'ok', at: now - 30e3 }, 'meta/rsync_cmp': CMP }, 'hub/#work/up', 'boss');
  await p.waitForSelector('[data-srvmode]', { timeout: 10000 }); let t = await p.innerText('#main').catch(() => p.innerText('body'));
  ok(/☁ 서버 연동 · 비교만/.test(t) && /같음 12 · 다름 1 · 확인 중 2/.test(t.replace(/\s+/g, ' ')) && /추가\|가람\|1201/.test(t), '카드: 모드 · 오늘 비교 · 다른 것');
  ok(!(await p.$eval('[data-srvmode="live"]', x => x.disabled)), '소장: 모드 단추 켜짐');
  await p.click('[data-srvmode="live"]'); await sleep(500);
  ok((await p.evaluate(() => window.__seed['meta/rsync_srv'])).mode === 'live', '「실제 반영」 → meta/rsync_srv.mode = live');
  await p.close();
  console.log('② 하우스키퍼는 모드 못 바꿈');
  p = await open(b, { 'meta/rsync_srv': { day: D, mode: 'shadow', state: 'ok', at: now - 30e3 }, 'meta/rsync_cmp': CMP }, 'hub/#work/up', 'hk');
  await p.waitForSelector('[data-srvmode]', { timeout: 10000 });
  ok(await p.$eval('[data-srvmode="live"]', x => x.disabled), '하우스키퍼: 모드 단추 꺼짐');
  await p.close();
  console.log('③ 20건 넘어 보류 → 첫 화면 경고 · [반영]');
  p = await open(b, { 'meta/rsync_srv': { day: D, mode: 'live', runMode: 'live', state: 'hold', at: now - 20e3, hold: { hash: 'H123', n: 34, lines: ['1201 가람 → 나래', '1202 가람 → 나래'], at: now - 60e3 } }, 'meta/rsync_cmp': CMP }, 'hub/', 'hk');
  await sleep(2000); t = await p.innerText('body');
  ok(/서버 반영 보류 — 34건/.test(t), '첫 화면 「지금 확인할 것」에 보류 34건');
  await p.goto('https://haeundae-rm.github.io/hub/#work/up'); await p.waitForSelector('[data-srvgo]', { timeout: 10000 });
  ok(/1201 가람 → 나래/.test(await p.innerText('body')), '보류 내용 줄 보임');
  await p.click('[data-srvgo]'); await sleep(500);
  ok((await p.evaluate(() => window.__seed['meta/rsync_srv'])).go === 'H123', '[반영] → go = hash');
  await p.close();
  console.log('④ 서버 멈춤');
  p = await open(b, { 'meta/rsync_srv': { day: D, mode: 'live', runMode: 'live', state: 'ok', at: now - 9 * 60e3 } }, 'hub/', 'hk');
  await sleep(2000); t = await p.innerText('body');
  ok(/서버 연동이 9분째 멈췄어요/.test(t) && /PC 연결 창이/.test(t), '실제 반영 중 9분 멈춤 → 빨간 경고');
  ok(!p.errs.length, '오류 없음 ' + p.errs.join(' | '));
  await b.close(); console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})();
