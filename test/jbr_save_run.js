// 📋 정비보고서 💾 실제 저장 시험 (2026-11-27) — node test/jbr_save_run.js
//   가명 · 만든 자료(실명 없음)라 저장소에 넣어도 됨. 가짜 store(test/fake_store.js) 위에서
//   켜기 → 칸 단위 저장 → 동시 수정 안 덮음 → 완료 · 되돌리기 저장 → 기록 → 저장 대기 · 실패 → 단체 → 끝내기(복원) → 연습 날 그대로
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = { hub: path.resolve(__dirname, '..'), rm: process.env.RM || path.resolve(__dirname, '../../rm') };
const BASE = 'https://haeundae-rm.github.io/';
const OUT = '/tmp/jbr_shots'; fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const ok = (c, l) => { c ? pass++ : fail++; console.log((c ? '  ✅ ' : '  ❌ ') + l); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 가짜 자료: 4~31층 × 01~17호, 가명 6명
const NAMES = ['가람', '나래', '다솜', '라온', '마루', '바다'];
const ROOMS = []; for (let f = 31; f >= 4; f--) for (let s = 1; s <= 17; s++) ROOMS.push(String(f * 100 + s));
function dayDoc(ds, k) {
  const r = {};
  ROOMS.forEach((rm, i) => { const v = (i + k) % 7; r[rm] = v === 0 ? ['', '', '', '', 0, 1] : v === 1 ? ['', '', '', '', 0, 0] : [String((v % 4) + 1), NAMES[i % 6], '', '', v === 6 ? 1 : 0, 0]; });
  return { date: ds, src: 'excel', file: '11월.xlsx', rooms: ROOMS, r, xl: {}, cards: NAMES.map(n => ({ n, u: '9', in: false })), groups: [{ name: '시험단체', time: '15:00', rooms: '1201,1202' }], roster: NAMES, at: Date.now() - 864e5, by: '시험' };
}
const TODAY = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const SEED = { 'meta/rsync': { on: true, at: Date.now() - 60000 } };
['2026-11-24', '2026-11-25', TODAY].forEach((d, k) => { SEED['jbr/' + d] = dayDoc(d, k); });

async function open(browser, seed) {
  const ctx = await browser.newContext({ locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport: { width: 1600, height: 950 } });
  await ctx.addInitScript(s => { window.__seed = s; window.__live = 1; }, seed);
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
  p.on('pageerror', e => p.errs.push(String(e))); p.on('console', m => { if (m.type() === 'error' && !/Failed to load|404/.test(m.text())) p.errs.push(m.text()); });
  p.on('dialog', x => x.accept());
  await p.goto(BASE + 'hub/jbr/');
  await p.waitForSelector('[data-jlogin]'); await p.click('[data-jwho="0"]'); await p.fill('#jpw', 'pw'); await p.click('[data-jlogin]');
  await p.waitForSelector('.c[data-i]', { timeout: 8000 });
  return p;
}
const doc = (p, ds) => p.evaluate(d => JSON.parse(JSON.stringify(window.__seed['jbr/' + d])), ds);
const logs = (p, ds) => p.evaluate(d => Object.keys(window.__seed).filter(k => k.startsWith('jbr/' + d + '/log/')).map(k => window.__seed[k]), ds);
const cellOf = (p, room) => p.evaluate(r => { const i = window.__jbr && document.querySelector('.c[data-i]') ? [...document.querySelectorAll('.c[data-i]')].find(c => c.innerText.includes(r)) : null; return i ? +i.dataset.i : -1; }, room);
async function pick(p, room) { const i = await cellOf(p, room); await p.click('.c[data-i="' + i + '"]'); await sleep(80); return i; }

(async () => {
  const b = await chromium.launch();
  const p = await open(b, SEED);
  const D = '2026-11-25';
  console.log('① 오늘은 켜기 단추 없음 · 지난 날짜엔 있음');
  ok(!(await p.$('[data-jon]')), '오늘(' + TODAY + ') 켜기 단추 없음');
  await p.click('#days [data-d="' + D + '"]'); await sleep(200);
  ok(!!(await p.$('[data-jon]')), '11/25 「실제 저장 연습 켜기」 보임');

  console.log('② 연습(꺼진 날)은 저장 안 됨');
  const before = JSON.stringify(await doc(p, D));
  await pick(p, '1203'); await p.keyboard.press('2'); await sleep(150);
  ok(before === JSON.stringify(await doc(p, D)), '저장소 그대로');
  await p.click('[data-reset]'); await sleep(150);

  console.log('③ 켜기');
  await p.click('[data-jon]'); await sleep(300);
  let d = await doc(p, D);
  ok(d.src === 'app' && d.r0 && d.r0['1203'] && Array.isArray(d.g0), 'src app · 켜기 전 자료(r0 · g0) 보관');
  ok(!!(await p.$('.svb')) && /저장 켜짐/.test(await p.innerText('.svb')), '저장 켜짐 띠');
  ok((await logs(p, D)).some(x => x.k === 'on' && x.uid && x.by === '하우스키퍼'), '기록: 켬 (uid · 하우스키퍼)');

  console.log('④ 칸 단위 저장');
  const r0 = JSON.stringify(d.r);
  const st0 = d.r['1203'][0], key = st0 === '1' ? '4' : '1';
  await pick(p, '1203'); await p.keyboard.press(key); await sleep(250);
  d = await doc(p, D);
  ok(d.r['1203'][0] === key, '1203 상태 ' + st0 + ' → ' + key + ' 저장 (' + JSON.stringify(d.r['1203']) + ')');
  const ch = Object.keys(d.r).filter(k => JSON.stringify(d.r[k]) !== JSON.stringify(JSON.parse(r0)[k]));
  ok(ch.length === 1 && ch[0] === '1203', '바뀐 방은 1203 하나뿐 (' + ch.join(',') + ')');
  let L = (await logs(p, D)).filter(x => x.k === 'room');
  ok(L.length === 1 && L[0].ch['1203'] && L[0].ch['1203'].a[0] === key && L[0].ch['1203'].b[0] === st0, '기록: 1203 전 ' + JSON.stringify(L[0] && L[0].ch['1203'] && L[0].ch['1203'].b) + ' → 후');

  console.log('⑤ 동시 수정: 다른 사람이 1501 고친 뒤 내가 1203 다시 → 1501 안 덮임');
  await p.evaluate(async () => { const S = await import('../../rm/app/store.js'); await S.merge('jbr/2026-11-25', { r: { 1501: ['1', '바다', '시험메모', '', 0, 0] } }); });
  await sleep(250);
  ok(/시험메모|바다/.test(await p.innerText('.gridbox')), '다른 사람 수정이 화면에 들어옴');
  await pick(p, '1203'); await p.keyboard.press(' '); await sleep(250);
  d = await doc(p, D);
  ok(d.r['1203'][4] === 1, '1203 완료 저장');
  ok(d.r['1501'][2] === '시험메모', '1501 다른 사람 수정 그대로');

  console.log('⑥ 되돌리기(Ctrl+Z)도 저장');
  await p.keyboard.press('Control+z'); await sleep(250);
  d = await doc(p, D);
  ok(d.r['1203'][4] === 0 && d.r['1203'][0] === key, '완료 풀림 저장 ' + JSON.stringify(d.r['1203']));

  console.log('⑦ 저장 대기 · 오프라인 흉내');
  await p.evaluate(() => { window.__hold = new Promise(r => { window.__release = r; }); });
  await pick(p, '1204'); await p.keyboard.press('3'); await sleep(250);
  ok(/저장 대기 1건/.test(await p.innerText('#svst')), '「저장 대기 1건」 (방 + 기록 한 묶음): ' + await p.innerText('#svst'));
  ok(/저장 대기/.test(await p.innerText('#liveTag')), '위 띠에도 대기 표시');
  ok((await doc(p, D)).r['1204'][0] === '3', '화면 · 보관엔 이미 반영');
  await p.evaluate(() => { window.__release(); window.__hold = null; }); await sleep(200);
  ok(/모두 저장됨/.test(await p.innerText('#svst')), '연결되면 「모두 저장됨」');

  console.log('⑧ 저장 실패(규칙 거부) 표시');
  await p.evaluate(() => { window.__deny = p => p === 'jbr/2026-11-25'; });
  await pick(p, '1205'); await p.keyboard.press('2'); await sleep(300);
  ok(/저장 실패 1건/.test(await p.innerText('#svst')), '「저장 실패 1건」: ' + (await p.innerText('#svst')).slice(0, 40));
  ok(!(await logs(p, D)).some(x => x.ch && x.ch['1205']), '거부된 수정은 기록에도 안 남음 (묶음)');
  await p.evaluate(() => { window.__deny = null; });

  console.log('⑨ 단체 저장');
  await p.evaluate(() => window.JBR.sv.groups('2026-11-25', [{ name: '시험단체', time: '15:00', rooms: ['1201', '1202', '1203'] }]));
  await sleep(200); d = await doc(p, D);
  ok(d.groups[0].rooms === '1201,1202,1203', '단체 호실 저장: ' + d.groups[0].rooms);

  console.log('⑩ 변경 기록 보기');
  await p.click('[data-jlog]'); await p.waitForFunction(() => { const m = document.getElementById('jlogm'); return m && !/불러오는/.test(m.innerText); });
  const lt = await p.innerText('#jlogm');
  ok(/1203/.test(lt) && /실제 저장 켬/.test(lt) && /하우스키퍼/.test(lt) && /단체/.test(lt), '기록 표: ' + lt.split('\n').slice(1, 4).join(' / '));
  await p.screenshot({ path: OUT + '/3_save_log.png' });
  await p.click('[data-jlogx]');

  console.log('⑪ 연습 끝내기 → 켜기 전 자료로');
  await p.click('[data-joff]'); await sleep(400);
  d = await doc(p, D);
  ok(d.src === 'excel' && !d.r0 && !d.g0 && JSON.stringify(d.r) === JSON.stringify(dayDoc(D, 1).r), '원래 자료 · src excel · r0 지움');
  ok(!!(await p.$('[data-jon]')), '다시 켜기 단추');
  ok((await logs(p, D)).some(x => x.k === 'off'), '기록: 끝냄 (기록은 안 지움, ' + (await logs(p, D)).length + '건)');

  console.log('⑬ 우선정비 끌어 지정: 퇴실 예정(4) · 미정비(3) 방만');
  await p.click('#days [data-d="2026-11-24"]'); await sleep(200);
  const i1 = await cellOf(p, '1201'), i2 = await cellOf(p, '1217');
  await p.click('.c[data-i="' + i1 + '"]'); await p.click('.c[data-i="' + i2 + '"]', { modifiers: ['Shift'] }); await sleep(150);
  await p.click('[data-drawer="prio"]'); await sleep(150);
  ok(/빠져요/.test(await p.innerText('.box')), '고른 방 중 빠지는 수 안내: ' + ((await p.innerText('.box')).match(/고른 방 중 \d+실/) || [''])[0]);
  await p.click('[data-mkprio]'); await sleep(200);
  const pr = await p.$$eval('.c.pr[data-i]', cs => cs.map(c => c.innerText.match(/\d{3,4}/)[0]));
  const d24 = await doc(p, '2026-11-24');
  ok(pr.length > 0 && pr.every(r => ['3', '4'].includes(d24.r[r][0]) && !d24.r[r][5]), '주황 빛 ' + pr.length + '실 모두 4 · 3 (' + pr.map(r => r + ':' + d24.r[r][0]).join(' ') + ')');
  ok(Object.keys(d24.r).filter(r => r.startsWith('12') && (d24.r[r][5] || !d24.r[r][0])).every(r => !pr.includes(r)), '연박 · 공실은 하나도 안 들어감');

  console.log('⑫ 저장은 앱 원본인 날만 · 오늘은 연습 못 켬');
  ok(await p.evaluate(() => !window.JBR.sv.live('2026-12-01') && !window.JBR.sv.live('2026-11-24') && !window.JBR.sv.canOn(new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10))), '앱 원본(src app)인 날만 저장 · 엑셀 사본 날은 키를 눌러도 안 바뀜 · 오늘 연습 켜기 없음');
  ok(!p.errs.length, '화면 오류 없음 ' + p.errs.slice(0, 3).join(' | '));
  await b.close();
  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})();
