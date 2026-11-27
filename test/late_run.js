// 🟣 늦은 퇴실 시험 (2026-11-27) — node test/late_run.js  (가명 · 만든 자료)
//   정비보고서에서 방 고르기 → 늦은 퇴실(시각) → meta/late_{날} 저장 · 보라 빛 → 「퇴실」 → 방 1(퇴실) · out → 빼기
// (아래 준비는 jbr_save_run.js 와 같음)
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
SEED['jbr/' + TODAY].src = 'app';   // 오늘 = 앱 원본 (퇴실 누르면 방 상태가 저장됨)

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
  const b = await chromium.launch(); const p = await open(b, SEED);
  const D = TODAY, seedDoc = SEED['jbr/' + D];
  const r4 = ROOMS.find(r => seedDoc.r[r][0] === '4' && seedDoc.r[r][1] && !seedDoc.r[r][4]);
  const r0 = ROOMS.find(r => !seedDoc.r[r][0] && !seedDoc.r[r][5]);   // 공실
  console.log('① 고르기 → 늦은 퇴실 칸');
  await p.click('#days [data-d="' + D + '"]').catch(() => {}); await sleep(200);
  await pick(p, r0); await p.click('[data-drawer="prio"]'); await sleep(150);
  ok(await p.$eval('[data-mklate]', x => x.disabled), '공실(' + r0 + ')만 고르면 「늦은 퇴실」 꺼짐');
  await pick(p, r4); await sleep(100);
  ok(!(await p.$eval('[data-mklate]', x => x.disabled)), '퇴실 예정 · 배정(' + r4 + ' ' + seedDoc.r[r4][1] + ') → 「선택한 1실 늦은 퇴실」 켜짐');
  await p.fill('#ltime', '13:00'); await p.click('[data-mklate]'); await sleep(300);
  let m = await p.evaluate(d => window.__seed['meta/late_' + d], D);
  ok(m && m.rooms[r4] && m.rooms[r4].at === '13:00' && m.rooms[r4].out === false, 'meta/late_' + D + ' 저장: ' + r4 + ' 13:00');
  ok(await p.evaluate(i => document.querySelector('.c[data-i="' + i + '"]').classList.contains('lt'), await cellOf(p, r4)), '격자 ' + r4 + ' 보라 빛');
  ok(/🟣/.test(await p.innerText('[data-drawer="prio"]')), '우선정비 단추에 🟣 수');
  ok((await p.innerText('.ltl')).includes(seedDoc.r[r4][1]), '목록에 담당 메이드 이름');
  console.log('② 퇴실');
  await p.click('[data-lateout="' + r4 + '"]'); await sleep(400);
  m = await p.evaluate(d => window.__seed['meta/late_' + d], D);
  const jd = await doc(p, D);
  ok(m.rooms[r4].out === true && m.rooms[r4].outAt > 0 && /^\d\d:\d\d$/.test(m.rooms[r4].outHm), '퇴실 저장 (' + m.rooms[r4].outHm + ')');
  ok(jd.r[r4][0] === '1', '정비보고서 ' + r4 + ' = 1 퇴실');
  ok(!(await p.evaluate(i => document.querySelector('.c[data-i="' + i + '"]').classList.contains('lt'), await cellOf(p, r4))), '보라 빛 꺼짐');
  ok((await logs(p, D)).some(x => x.k === 'room'), '변경 기록에 방 상태');
  console.log('③ 되돌리기 · 빼기');
  await p.click('[data-lateun="' + r4 + '"]'); await sleep(200);
  m = await p.evaluate(d => window.__seed['meta/late_' + d], D); ok(m.rooms[r4].out === false, '퇴실 표시 되돌림');
  await p.click('[data-latedel="' + r4 + '"]'); await sleep(200);
  m = await p.evaluate(d => window.__seed['meta/late_' + d], D); ok(m.rooms[r4] === null && !(await p.$('.ltl')), '빼기 → 목록에서 사라짐');
  console.log('④ 🟠 우선정비 저장 · 시간 바꾸기 (퇴실 · 배정 1실)');
  const r1 = ROOMS.find(r => seedDoc.r[r][0] === '1' && seedDoc.r[r][1] && !seedDoc.r[r][4] && !seedDoc.r[r][5]);
  await p.evaluate(() => { document.querySelectorAll('.c.on,.c.sel').forEach(() => {}); });
  await pick(p, r1); await sleep(150);
  ok(!(await p.$eval('[data-mkprio]', x => x.disabled)), '퇴실(1) · 배정(' + r1 + ') 한 방만 골라도 「선택한 1실 지정」 켜짐');
  await p.fill('#pname', '시험 우선'); await p.fill('#ptime', '15'); await p.click('[data-mkprio]'); await sleep(300);
  let pr = await p.evaluate(d => window.__seed['meta/prio_' + d], D);
  ok(pr && pr.list.length === 1 && pr.list[0].rooms.includes(r1) && pr.list[0].until === '15:00' && pr.list[0].name === '시험 우선', 'meta/prio_' + D + ' 저장: ' + r1 + ' 15:00 (「15」 → 15:00)');
  ok(await p.evaluate(i => document.querySelector('.c[data-i="' + i + '"]').classList.contains('pr'), await cellOf(p, r1)), '격자 주황 빛');
  await p.fill('[data-ptime="0"]', '17'); await p.press('[data-ptime="0"]', 'Enter'); await sleep(300);
  pr = await p.evaluate(d => window.__seed['meta/prio_' + d], D);
  ok(pr.list[0].until === '17:00' && pr.list[0].upd > 0, '시간 칸 17 → Enter = 17:00 저장 (upd)');
  await p.fill('[data-ptime="0"]', '25:00'); await p.press('[data-ptime="0"]', 'Enter'); await sleep(200);
  pr = await p.evaluate(d => window.__seed['meta/prio_' + d], D);
  ok(pr.list[0].until === '17:00', '잘못된 시각(25:00)은 저장 안 함');
  const r2 = ROOMS.find(r => r !== r1 && seedDoc.r[r][0] === '4' && seedDoc.r[r][1]);
  await p.evaluate(async ([d, r]) => { const S = await import('/rm/app/store.js'); const cur = window.__seed['meta/prio_' + d]; await S.set('meta/prio_' + d, Object.assign({}, cur, { list: cur.list.concat([{ id: 'px', name: '다른 PC', rooms: [r], until: '13:00', rank: 1, at: Date.now() }]) })); }, [D, r2]); await sleep(300);
  ok(await p.evaluate(i => document.querySelector('.c[data-i="' + i + '"]').classList.contains('pr'), await cellOf(p, r2)), '다른 PC 가 지정한 ' + r2 + ' 도 바로 주황 (저장소에서 읽음)');
  await p.click('[data-delp="0"]'); await sleep(200);
  pr = await p.evaluate(d => window.__seed['meta/prio_' + d], D); ok(pr.list.length === 1 && pr.list[0].id === 'px', '빼기 → 그 줄만 지움 (메이드 휴대폰에서도 사라짐)');
  ok(!p.errs.length, '화면 오류 없음 ' + p.errs.slice(0, 3).join(' | '));
  await b.close(); console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})();
