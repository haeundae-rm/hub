// 🟣 늦은 퇴실 → 메이드 휴대폰 시험 (2026-11-27) — node test/late_maid_run.js [사진 폴더]   (hub · rm 나란히, rm 브랜치 late-out)
//   meta/late_{오늘} 에 늦은 퇴실 → 내 방 보라 · 띠 → 허브가 퇴실 표시 → 소리 · 진동 · 알림 · 보라 띠 → 확인 → 남의 방은 안 울림. 가짜 store
// 이름은 모두 예시 (실제 개인정보 없음)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = { hub: path.resolve(__dirname, '..'), rm: process.env.RM || path.resolve(__dirname, '../../rm') };
const BASE = 'https://haeundae-rm.github.io/';
const OUT = process.argv[2] || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const fmt = t => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
const DAY = fmt(Date.now()), TMR = fmt(Date.now() + 864e5), now = Date.now();
let pass = 0, fail = 0; const ok = (c, l) => { c ? pass++ : fail++; console.log((c ? '  ✅ ' : '  ❌ ') + l); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const room = (r, x) => Object.assign({ room: String(r), tags: [], note: '', due: '', after: '', memo: '' }, x || {});
function seed(o = {}) {
  const s = {};
  s['days/' + DAY] = { maids: ['김하나', '이두리', '박세나', '최넷'] };
  s['days/' + DAY + '/plans/김하나'] = { rooms: [room(1201), room(1202), room(1301)] };
  s['days/' + DAY + '/plans/이두리'] = { rooms: [room(1203), room(1204)] };
  s['days/' + DAY + '/plans/박세나'] = { rooms: [room(1401), room(1402)] };
  s['days/' + DAY + '/plans/최넷'] = { rooms: [room(2501)] };
  s['devices/dvA'] = { name: '김하나', date: DAY };
  s['devices/dvB'] = { name: '이두리', date: DAY };
  if (o.cfg) s['meta/keys'] = o.cfg;
  if (o.keys) Object.assign(s, o.keys);
  return s;
}
async function ctxOf(browser, s, vp, anon) {
  const ctx = await browser.newContext(Object.assign({ locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }, vp || {}));
  await ctx.addInitScript(([s, a]) => { window.__seed = s; window.__live = 1; window.__hubFast = 1; if (a) window.__anonUid = a; }, [s, anon || '']);
  await ctx.route('**/*', async route => {
    const u = route.request().url();
    if (!u.startsWith(BASE)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    const rel = u.slice(BASE.length).split('?')[0].split('#')[0]; const [app, ...rest] = rel.split('/'); let f = rest.join('/') || 'index.html';
    if (f.endsWith('/')) f += 'index.html';
    if (!ROOT[app]) return route.fulfill({ status: 404, body: 'nf' });
    const file = app === 'rm' && f === 'app/store.js' ? path.join(__dirname, 'fake_store.js') : path.join(ROOT[app], f);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
    const ct = /\.js$/.test(file) ? 'application/javascript' : /\.html$/.test(file) ? 'text/html' : /\.json$/.test(file) ? 'application/json' : /\.css$/.test(file) ? 'text/css' : 'application/octet-stream';
    return route.fulfill({ status: 200, contentType: ct + '; charset=utf-8', body: fs.readFileSync(file) });
  });
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', e => p.errs.push(String(e))); p.on('console', m => { if (m.type() === 'error' && !/Failed to load|404/.test(m.text())) p.errs.push(m.text()); });
  p.on('dialog', d => d.accept());
  return p;
}

(async () => {
  const browser = await chromium.launch();
  const s = seed({ cfg: null });
  s['meta/late_' + DAY] = { date: DAY, rooms: { '1202': { at: '13:00', out: false, outAt: 0, outHm: '' }, '1203': { at: '12:00', out: false, outAt: 0, outHm: '' } } };
  const p = await ctxOf(browser, s, null, 'dvA');
  await p.addInitScript(() => { window.__vib = []; navigator.vibrate = x => { window.__vib.push(x); return true; };
    window.__notes = []; window.Notification = function () {}; window.Notification.permission = 'granted'; window.Notification.requestPermission = async () => 'granted'; });
  await p.goto(BASE + 'rm/app/'); await p.waitForSelector('[data-room="1202"]'); await sleep(300);
  await p.evaluate(() => { if (navigator.serviceWorker) Object.defineProperty(navigator.serviceWorker, 'ready', { get: () => Promise.resolve({ showNotification: (t, o) => { window.__notes.push([t, o.body]); return Promise.resolve(); } }) }); });
  console.log('① 손님 계심 (보라)');
  ok(await p.locator('.room.late[data-room="1202"]').count() === 1, '내 방 1202 보라 테두리');
  ok(/13:00 퇴실 예정 · 손님 계세요/.test(await p.textContent('[data-room="1202"]')), '1202 "13:00 퇴실 예정 · 손님 계세요"');
  ok(/늦은 퇴실 1실/.test(await p.textContent('.lateb')), '위 띠: 늦은 퇴실 1실 (남의 방 1203 은 안 셈)');
  ok(await p.locator('[data-room="1203"]').count() === 0, '남의 방 1203 은 안 보임');
  await p.screenshot({ path: path.join(OUT, 'lt1_손님계심.png') });
  console.log('② 프런트 퇴실 → 허브가 표시');
  await p.evaluate(async d => { const S = await import('./store.js'); await S.merge('meta/late_' + d, { rooms: { '1202': { at: '13:00', out: true, outAt: Date.now(), outHm: '12:41' } } }); }, DAY);
  await sleep(500);
  ok(await p.locator('.room.lateout[data-room="1202"]').count() === 1, '1202 보라 채움 · 깜빡임');
  ok(/12:41 퇴실 · 정비 가능/.test(await p.textContent('[data-room="1202"]')), '1202 "12:41 퇴실 · 정비 가능"');
  ok(/1202호 늦은 퇴실 손님이 퇴실하셨어요/.test(await p.textContent('.lateb.go')) && /정비 가능해요/.test(await p.textContent('.lateb.go')), '위 보라 띠 "1202호 늦은 퇴실 손님이 퇴실하셨어요 · 정비 가능해요"');
  const v = await p.evaluate(() => window.__vib), n = await p.evaluate(() => window.__notes);
  ok(v.length === 1 && Array.isArray(v[0]) && v[0].length === 5, '진동 한 번 (길게 3번)');
  ok(n.length === 1 && /1202호 퇴실/.test(n[0][0]), '휴대폰 알림 1건: ' + (n[0] || []).join(' / '));
  await p.screenshot({ path: path.join(OUT, 'lt2_퇴실알림.png') });
  console.log('③ 다시 그려도 한 번만 · 확인');
  await p.evaluate(async d => { const S = await import('./store.js'); await S.merge('meta/late_' + d, { at: Date.now() }); }, DAY); await sleep(400);
  ok((await p.evaluate(() => window.__vib)).length === 1, '같은 퇴실로 또 울리지 않음');
  await p.click('[data-lateok]'); await sleep(200);
  ok(await p.locator('.lateb.go').count() === 0 && await p.locator('.room.lateout[data-room="1202"]').count() === 1, '확인 → 띠 사라짐 (방 표시는 남음)');
  console.log('④ 남의 방 퇴실은 안 울림');
  await p.evaluate(async d => { const S = await import('./store.js'); await S.merge('meta/late_' + d, { rooms: { '1203': { at: '12:00', out: true, outAt: Date.now(), outHm: '12:45' } } }); }, DAY); await sleep(400);
  ok((await p.evaluate(() => window.__vib)).length === 1, '1203(이두리 님 방) 퇴실 → 김하나 휴대폰은 안 울림');
  ok(!p.errs.length, '오류 없음 ' + p.errs.slice(0, 3).join(' | '));
  await browser.close(); console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})();
