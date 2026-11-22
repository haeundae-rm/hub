// 🧳 습득물 관리대장 시험 (2026-11-22) — node test/lost_run.js  (예시 이름만)
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
  console.log('① 대장 열기 (하우스키퍼 = 오더테이커)');
  const p = await open(b, 'hub/lost/');
  await p.waitForSelector('[data-login]'); await p.click('[data-who="0"]'); await p.fill('#pw', 'pw'); await p.click('[data-login]');
  await p.waitForSelector('.row', { timeout: 5000 }).catch(() => {});
  const rows = await p.$$eval('.row', r => r.map(x => x.innerText.replace(/\s+/g, ' ')));
  ok(rows.length === 2 && /1305/.test(rows[0]) && /무선 이어폰/.test(rows[0]) && /앱 · 홍길순/.test(rows[0]), '오늘 2건 · 앱 접수 표시: ' + rows[0].slice(0, 60));
  ok(/처리 대기\s*4/.test(await p.innerText('.tabs')), '처리 대기 4 (경찰 1 · 폐기 2 · … )');
  await p.screenshot({ path: path.join(OUT, 'lost_1_대장.png') });
  console.log('② 확인 · 조치');
  await p.click('[data-chk="' + DAY + '_1305_a"]'); await sleep(300);
  ok(await p.evaluate(id => window.__seed['lost/' + id].chk === true && window.__seed['lost/' + id].chkBy === '하우스키퍼', DAY + '_1305_a'), '[확인] → chk · 누가');
  await p.click('[data-open="' + DAY + '_1305_a"]'); await p.waitForSelector('.pics img', { timeout: 4000 }).catch(() => {});
  ok(await p.$('.pics img') !== null, '줄 누르면 사진 보임')
  await p.screenshot({ path: path.join(OUT, 'lost_2_고치기.png') });
  await p.click('[data-act="택배"]'); ok(await p.inputValue('#le-actDay') === DAY, '완료 조치 → 조치일 오늘 자동');
  await p.fill('#le-memo', '송장 123'); await p.click('[data-eds]'); await sleep(400);
  const x = await p.evaluate(id => window.__seed['lost/' + id], DAY + '_1305_a');
  ok(x.act === '택배' && x.actDay === DAY && x.actBy === '하우스키퍼' && x.memo === '송장 123' && x.item === '무선 이어폰 (흰색)', '저장: 택배 · 조치일 · 특이사항');
  console.log('③ 수기 기재');
  await p.click('[data-add]'); await p.fill('#le-room', '709'); await p.fill('#le-item', '화장품 파우치'); await p.click('[data-cat="잡화"]'); await p.fill('#le-by', '오더테이커'); await p.click('[data-eds]'); await sleep(400);
  const man = await p.evaluate(() => Object.keys(window.__seed).filter(k => /^lost\/.*_709_h/.test(k)).map(k => window.__seed[k]));
  ok(man.length === 1 && man[0].src === 'hub' && man[0].cat === '잡화' && man[0].chk === true && man[0].by === '오더테이커', '수기 1건 · src hub · 확인됨');
  ok((await p.$$('.row')).length === 3, '오늘 목록 3건');
  await p.click('[data-add]'); await p.click('[data-eds]'); await sleep(200);
  ok(/객실 번호/.test(await p.innerText('.panel .err')), '빈칸이면 안내');
  await p.click('.panel [data-edx]');
  console.log('④ 귀중품 · 처리 대기 · 엑셀');
  await p.click('[data-tab="val"]'); await sleep(200);
  const v = await p.$$eval('.row', r => r.map(x => x.innerText.replace(/\s+/g, ' ')));
  ok(v.length === 3 && /신용카드/.test(v[0]) && /무선 이어폰|지갑/.test(v[2]), '귀중품: 보관 중 먼저 (' + v.map(s => s.split(' ')[1]).join(',') + ')');
  await p.click('[data-tab="todo"]'); await sleep(200);
  const td = await p.innerText('main');
  ok(/경찰 인계 대기 1건/.test(td) && /폐기 대상 2건/.test(td), '경찰 인계 대기 1 · 폐기 대상 2');
  await p.screenshot({ path: path.join(OUT, 'lost_3_처리대기.png'), fullPage: true });
  await p.click('[data-dispose]'); await sleep(600);
  ok(await p.evaluate(dd => window.__seed['lost/' + dd + '_1111_c'].act === '폐기', d(40)), '모두 폐기 처리');
  await p.click('[data-tab="day"]'); await sleep(200);
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 4000 }).catch(() => null), p.click('[data-xls]')]);
  ok(!!dl, '엑셀 내려받기');
  if (dl) { const fp = path.join(OUT, 'lost.xlsx'); await dl.saveAs(fp); ok(fs.statSync(fp).size > 2000, '엑셀 파일 크기 ' + fs.statSync(fp).size); }
  ok(!p.errs.length, '대장 화면 오류 없음 ' + p.errs.slice(0, 2).join(' | '));
  console.log('⑤ 허브 첫 화면');
  const h = await open(b, 'hub/');
  await h.waitForSelector('[data-login], .hm-grid', { timeout: 5000 });
  if (await h.$('[data-login]')) { await h.click('[data-who="0"]').catch(() => {}); await h.fill('#pw', 'pw').catch(() => {}); await h.click('[data-login]').catch(() => {}); }
  await h.waitForSelector('.hm-tile[href="./lost/"]', { timeout: 6000 }).catch(() => {});
  await sleep(1200);
  ok(/확인 1/.test(await h.innerText('.hm-tile[href="./lost/"]').catch(() => '')), '습득물 버튼에 "확인 1"');
  const todoT = await h.$$eval('.hm-todo li', l => l.map(x => x.innerText.replace(/\s+/g, ' '))).catch(() => []);
  ok(todoT.some(t => /습득물 확인 안 함 1건/.test(t)) && todoT.some(t => /습득물 폐기 대상 2건/.test(t)), '지금 확인할 것: 습득물 확인 안 함 · 폐기 대상');
  ok(!h.errs.length, '허브 오류 없음 ' + h.errs.slice(0, 2).join(' | '));
  await b.close(); console.log(`결과: ${pass} 통과 / ${fail} 실패`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
