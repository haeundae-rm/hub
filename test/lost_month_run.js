// 🧳 습득물 달 단추 · 달력 · 엑셀 대장 옮기기 시험 (2026-11-28) — XLSX=엑셀 node test/lost_month_run.js
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = { hub: path.resolve(__dirname, '..'), rm: process.env.RM || path.resolve(__dirname, '../../rm') };
const BASE = 'https://haeundae-rm.github.io/';
const OUT = process.argv[2] || path.join(__dirname, 'shots'); fs.mkdirSync(OUT, { recursive: true });
const fmt = t => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
const now = Date.now(), DAY = fmt(now), d = k => fmt(now - k * 864e5);
let pass = 0, fail = 0; const ok = (c, l) => { c ? pass++ : fail++; console.log((c ? '  ✅ ' : '  ❌ ') + l); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const IMG = 'data:image/jpeg;base64,' + fs.readFileSync(process.env.IMG || '/tmp/rmdemo/item.jpg').toString('base64');
function seed() {
  const s = {}, L = (id, x) => { s['lost/' + id] = Object.assign({ v: 1, place: '', note: '', by: '', src: 'app', n: 0, chk: false, act: '', actDay: '', actBy: '', memo: '', clientAt: now - 3600e3 }, x); };
  L(DAY + '_1305_a', { date: DAY, no: DAY.slice(5).replace('-', '') + '-1305', room: '1305', item: '무선 이어폰 (흰색)', cat: '귀중품', police: true, by: '홍길순', n: 1, clientAt: now - 7200e3 });
  s['lost_img/' + DAY + '_1305_a'] = { p: [IMG] };
  L(DAY + '_2804_b', { date: DAY, no: '', room: '2804', item: '캔맥주 2개', cat: '음식', police: false, by: '김예시', chk: true });
  L(d(40) + '_1111_c', { date: d(40), room: '1111', item: '검정 바람막이', cat: '의류', police: false, by: '박예시' });
  L(d(35) + '_1203_d', { date: d(35), room: '1203', item: '우산', cat: '잡화', police: false, src: 'hub', by: '' });
  L(d(10) + '_614_e', { date: d(10), room: '614', item: '신용카드', cat: '귀중품', police: true, by: '최예시', chk: true, act: '귀중품 보관함' });
  L(d(5) + '_1408_f', { date: d(5), room: '1408', item: '지갑', cat: '귀중품', police: true, by: '정예시', chk: true, act: 'F/D', actDay: d(5) });
  s['meta/lost_sum'] = { day: DAY, police: 2, dispose: 2, food: 0, open: 4 };
  s['meta/relay'] = { ok: true, at: now - 60000 }; s['sup_meta/relay'] = { ok: true, at: now - 60000 };
  return s;
}
async function open(browser, url) {
  const ctx = await browser.newContext({ locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, acceptDownloads: true });
  await ctx.addInitScript(s => { window.__seed = s; window.__hubFast = 1; }, seed());
  await ctx.route('**/*', async route => {
    const u = route.request().url();
    if (!u.startsWith(BASE)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    let rel = u.slice(BASE.length).split('?')[0].split('#')[0]; const [app, ...rest] = rel.split('/'); let f = rest.join('/') || 'index.html';
    if (f.endsWith('/')) f += 'index.html';
    if (!ROOT[app]) return route.fulfill({ status: 404, body: 'nf' });
    const file = app === 'rm' && f === 'app/store.js' ? path.join(__dirname, 'fake_store.js') : path.join(ROOT[app], f);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
    const ct = /\.js$/.test(file) ? 'application/javascript' : /\.html$/.test(file) ? 'text/html' : /\.json$/.test(file) ? 'application/json' : 'application/octet-stream';
    return route.fulfill({ status: 200, contentType: ct + '; charset=utf-8', body: fs.readFileSync(file) });
  });
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', e => p.errs.push(String(e))); p.on('console', m => { if (m.type() === 'error' && !/Failed to load|404/.test(m.text())) p.errs.push(m.text()); });
  p.on('dialog', x => x.accept());
  await p.goto(BASE + url);
  return p;
}
(async () => {
  const b = await chromium.launch();
  const p = await open(b, 'hub/lost/');
  await p.waitForSelector('[data-login]'); await p.click('[data-who="0"]'); await p.fill('#pw', 'pw'); await p.click('[data-login]');
  await p.waitForSelector('.mons', { timeout: 5000 }).catch(() => {});
  console.log('① 달 단추 · 달력');
  ok(await p.locator('.mons [data-mon="' + DAY.slice(0, 7) + '"]').count() === 1, '이번 달 단추');
  await p.click('[data-cal]'); await sleep(200);
  ok(await p.locator('.cal [data-cd]').count() >= 28, '날짜 눌러 달력 펼침');
  const t5 = d(5); ok(/1/.test(await p.locator('.cal [data-cd="' + t5 + '"] i').innerText().catch(() => '')), '달력에 그날 건수 표시 (' + t5 + ')');
  await p.click('.cal [data-cd="' + t5 + '"]'); await sleep(300);
  ok(/지갑/.test(await p.innerText('#main')) && !(await p.locator('.cal').count()), '날 고르면 그날로 · 달력 닫힘');
  ok(await p.locator('[data-today]').count() === 1, '지난 날이면 「오늘」 단추'); await p.click('[data-today]'); await sleep(300);
  ok(/오늘/.test(await p.innerText('.datebar')), '「오늘」 → 오늘로');
  if (process.env.XLSX) {
    console.log('② 엑셀 대장 옮기기');
    await p.setInputFiles('#impf', process.env.XLSX); await p.waitForSelector('[data-imprun]', { timeout: 8000 });
    const tx = await p.innerText('.panel'); console.log('   ' + tx.split('\n').slice(1, 3).join(' | '));
    const n = +(/(\d+)건 옮기기/.exec(tx) || [])[1];
    ok(n > 200, n + '건 미리 보기');
    await p.click('[data-imprun]'); await p.waitForSelector('.panel', { state: 'detached', timeout: 15000 }).catch(() => {});
    const got = await p.evaluate(async () => { const S = await import('../../rm/app/store.js'); const xs = await S.getQuery('lost', [['date', '>=', '2026-11-01']]); return xs.filter(x => /_e[0-9a-z]+$/.test(x.id)).map(x => x.data); });
    ok(got.length === n, '저장 ' + got.length + '건');
    ok(got.every(x => x.src === 'hub' && x.date < DAY && x.room && x.item && ['의류', '잡화', '귀중품', '파손주의', '음식', '기타'].includes(x.cat)), '모든 줄: 수기 · 어제까지 · 분류 6가지');
    await p.click('.mons [data-mon="2026-11"]'); await sleep(200); await p.click('.cal [data-cd="2026-11-02"]'); await sleep(300);
    ok(/에어팟/.test(await p.innerText('#main')) && /F\/D/.test(await p.innerText('#main')), '11/2 에어팟 F/D 보임');
    await p.setInputFiles('#impf', process.env.XLSX); await p.waitForSelector('[data-imprun]', { timeout: 8000 });
    ok(/같은 자리에 덮어써요/.test(await p.innerText('.panel')), '두 번째 옮기기 = 덮어쓰기 안내 (중복 안 생김)');
    await p.click('.panel [data-impx]');
  }
  ok(!p.errs.length, '오류 없음 ' + p.errs.join(' | '));
  await b.close(); console.log('결과: ' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})();
