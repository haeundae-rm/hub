// 📋 정비보고서 허브 화면 시험 (2026-11-26) — node test/jbr_run.js <seed.json> <11월.xlsx>
//   seed = test/jbr_seed.mjs 로 엑셀에서 만든 jbr/{날} 사본들 (실명이 있어 저장소에 넣지 않음)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = { hub: path.resolve(__dirname, '..'), rm: process.env.RM || path.resolve(__dirname, '../../rm') };
const BASE = 'https://haeundae-rm.github.io/';
const SEED = JSON.parse(fs.readFileSync(process.argv[2])), XLSX = process.argv[3];
const OUT = '/tmp/jbr_shots'; fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const ok = (c, l) => { c ? pass++ : fail++; console.log((c ? '  ✅ ' : '  ❌ ') + l); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function open(browser, seed) {
  const ctx = await browser.newContext({ locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport: { width: 1600, height: 950 } });
  await ctx.addInitScript(s => { window.__seed = s; window.__live = 1; }, seed);
  await ctx.route('**/*', async route => {
    const u = route.request().url();
    if (!u.startsWith(BASE)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    let rel = u.slice(BASE.length).split('?')[0].split('#')[0]; const [app, ...rest] = rel.split('/'); let f = rest.join('/') || 'index.html';
    if (f.endsWith('/')) f += 'index.html';
    const file = app === 'rm' && f === 'app/store.js' ? path.join(__dirname, 'fake_store.js') : path.join(ROOT[app] || '/nope', f);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
    const ct = /\.js$/.test(file) ? 'application/javascript' : /\.html$/.test(file) ? 'text/html' : 'application/json';
    return route.fulfill({ status: 200, contentType: ct + '; charset=utf-8', body: fs.readFileSync(file) });
  });
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', e => p.errs.push(String(e))); p.on('console', m => { if (m.type() === 'error' && !/Failed to load|404/.test(m.text())) p.errs.push(m.text()); });
  p.on('dialog', x => x.accept());
  await p.goto(BASE + 'hub/jbr/');
  await p.waitForSelector('[data-jlogin]'); await p.click('[data-jwho="0"]'); await p.fill('#jpw', 'pw'); await p.click('[data-jlogin]');
  return p;
}
(async () => {
  const b = await chromium.launch();
  console.log('① 하우스키퍼 로그인 → 오늘(11/26) 격자');
  let p = await open(b, Object.assign({ 'meta/rsync': { on: true, at: Date.now() - 60000 } }, SEED));
  await p.waitForSelector('.c[data-i]', { timeout: 8000 }).catch(() => {});
  ok((await p.$$('.c[data-i]')).length > 400, '방 ' + (await p.$$('.c[data-i]')).length + '칸');
  ok(/26일/.test(await p.innerText('#days .on')), '오늘 날짜 선택: ' + await p.innerText('#days .on'));
  ok(/연결 켜짐/.test(await p.innerText('#liveTag')), '상태: ' + await p.innerText('#liveTag'));
  await p.click('#days [data-d="2026-11-25"]'); await sleep(200);
  ok(/엑셀 계산값과 같음 6\/6/.test(await p.innerText('.check')), '11/25 엑셀 요약과 같음: ' + (await p.innerText('.check')).slice(0, 50));
  await p.screenshot({ path: OUT + '/1_grid.png' });
  console.log('② 연습: 고쳐도 저장 안 됨');
  const before = await p.evaluate(() => JSON.stringify(window.__seed['jbr/2026-11-25']));
  await p.click('.c[data-i]'); await p.keyboard.press('2'); await sleep(150);
  ok(/연습 중/.test(await p.innerText('.check')), '연습 중 안내');
  ok(before === await p.evaluate(() => JSON.stringify(window.__seed['jbr/2026-11-25'])), '저장소는 그대로');
  await p.click('[data-reset]'); await sleep(150);
  ok(!/연습 중/.test(await p.innerText('.check')), '되돌리기');
  console.log('③ 실시간: 엑셀 사본이 바뀌면 화면도');
  await p.evaluate(() => { const d = window.__seed['jbr/2026-11-26']; const k = Object.keys(d.r).find(r => d.r[r][0] === '4'); d.r[k] = ['1', '시험이', '', '', 1, 0]; window.__fakeKey = k; });
  await p.evaluate(async () => { const S = await import('../../rm/app/store.js'); await S.set('jbr/2026-11-26', window.__seed['jbr/2026-11-26']); });
  await p.click('#days [data-d="2026-11-26"]'); await sleep(300);
  ok(/시험이/.test(await p.innerText('.gridbox')), '바뀐 방 이름이 보임');
  console.log('④ 결산');
  await p.click('[data-t="close"]'); await sleep(400); if (p.errs.length) console.log(p.errs);
  const k = await p.innerText('.kpis'); console.log('   ' + k.replace(/\s+/g, ' ').slice(0, 220));
  ok(/앱 계산/.test(k) && /날마다 엑셀 요약/.test(k), '앱 계산 · 날마다 대조 표시');
  for (const t of ['room', 'bill', 'ot', 'unit']) { const bt = await p.$('[data-ctab="' + t + '"]'); if (bt) { await bt.click(); await sleep(150); } }
  await p.screenshot({ path: OUT + '/2_close.png', fullPage: false });
  ok(!p.errs.length, '화면 오류 없음 ' + p.errs.slice(0, 3).join(' | '));
  console.log('⑤ 빈 저장소 → 엑셀로 채우기');
  p = await open(b, {});
  await p.waitForSelector('#fillFile', { state: 'attached', timeout: 5000 });
  ok(/아직 올라온/.test(await p.innerText('#main')), '빈 화면 안내');
  await p.setInputFiles('#fillFile', { name: '11월 정비보고서.xlsx', mimeType: 'application/octet-stream', buffer: fs.readFileSync(XLSX) });
  await p.waitForFunction(() => /✅|❌/.test(document.querySelector('#liveTag').innerText), null, { timeout: 120000 });
  const t = await p.innerText('#liveTag'); console.log('   ' + t);
  const n = await p.evaluate(() => Object.keys(window.__seed).filter(k => k.startsWith('jbr/2026-11-')).length);
  ok(/✅ 26일 올림/.test(t) && n === 26, '26일 올림 (' + n + ')');
  await sleep(500); ok((await p.$$('.c[data-i]')).length > 400, '올린 뒤 격자');
  ok(!p.errs.length, '화면 오류 없음 ' + p.errs.slice(0, 3).join(' | '));
  await b.close();
  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})();
