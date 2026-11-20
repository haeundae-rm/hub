// 🔑 플로어키 서명 시험 (2026-11-19) — 메이드 휴대폰(rm) + 허브 키 대장(hub/keys/). 가짜 store, 실제 Firebase 안 씀
// 실행: node test/keys_test.js [사진 폴더]   (hub · rm 나란히)
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
  if (o.cfg !== null) s['meta/keys'] = o.cfg || { from: DAY, on: true };
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
const keysOf = p => p.evaluate(d => Object.keys(window.__seed).filter(k => k.startsWith('days/' + d + '/keys/')).map(k => window.__seed[k]), DAY);

(async () => {
  const browser = await chromium.launch();
  // ---------- 1. 메이드 휴대폰
  console.log('메이드 휴대폰');
  let p = await ctxOf(browser, seed(), null, 'dvA');
  await p.goto(BASE + 'rm/app/');
  await p.waitForSelector('.keyband');
  const band = await p.textContent('.keyband');
  ok(/12층/.test(band) && /13층/.test(band) && !/14층/.test(band), '배정 층(12 · 13층)만 줄로 나옴');
  ok(await p.locator('.keyband.need').count() === 1, '안 누른 층이 있으면 빨간 띠');
  await p.screenshot({ path: path.join(OUT, 'k1_메이드_키띠.png') });
  // 잠금: 1201 누르면 키 창
  await p.click('[data-room="1201"]');
  await p.waitForSelector('.panel');
  ok(/12층 키를 먼저/.test(await p.textContent('.panel')), '키 안 알린 층 객실을 누르면 "키를 먼저 알려 주세요" 창');
  await p.screenshot({ path: path.join(OUT, 'k2_객실잠금.png') });
  await p.click('.panel [data-key="12:A"]');
  await p.waitForSelector('.panel .chk');
  ok(true, 'A키 누르면 바로 객실 확인 창으로 넘어감');
  await p.click('.panel [data-act="allok"]'); await sleep(300);
  let ks = await keysOf(p);
  ok(ks.length === 1 && ks[0].floor === 12 && ks[0].key === 'A' && ks[0].maid === '김하나' && ks[0].by === '본인', '기록 1줄: 12층 A키 · 김하나 · 본인');
  // 13층은 아직 잠김
  await p.click('[data-room="1301"]'); await p.waitForSelector('.panel');
  ok(/13층 키를 먼저/.test(await p.textContent('.panel')), '다른 층(13층)은 여전히 잠김');
  await p.click('.panel [data-keynone="13"]');
  await p.waitForSelector('.panel .chk');
  ks = await keysOf(p);
  ok(ks.some(k => k.floor === 13 && k.key === '없음' && !k.reason), '13층 안 가져가요: 이유 안 묻고 바로 저장 → 객실 창으로');
  await p.click('.panel [data-x]'); await sleep(200);
  ok(await p.locator('.keyband.done').count() === 1, '모든 층 답하면 한 줄 띠로 줄어듦 (계속 보임)');
  await p.screenshot({ path: path.join(OUT, 'k3_답한뒤.png') });
  // 바꾸기
  await p.click('[data-keychg="12"]'); await p.waitForSelector('.k4');
  ok(await p.locator('[data-kpick="A"][disabled]').count() === 1, '바꾸기: 지금 값(A키)은 못 고름');
  await p.click('[data-kpick="B"]'); await p.screenshot({ path: path.join(OUT, 'k4_바꾸기.png') });
  await p.click('.panel [data-kdo]'); await sleep(300);
  ks = await keysOf(p);
  ok(ks.filter(k => k.floor === 12).length === 2, '바꾸기: 처음 줄은 남고 새 줄이 쌓임 (지우기 없음)');
  ok(/B키/.test(await p.textContent('.kchip[data-keychg="12"]')), '한 줄 띠의 12층 칸에 바꾼 값(B키) 보임');
  // 마지막 객실 → 반납 안내
  await p.click('[data-room="1202"]'); await p.waitForSelector('.panel .chk'); await p.click('.panel [data-act="allok"]'); await sleep(200);
  await p.click('[data-room="1301"]'); await p.waitForSelector('.panel .chk'); await p.click('.panel [data-act="allok"]');
  await p.waitForSelector('.fincard'); await sleep(300);
  ok(await p.locator('#keygate').count() === 0, '정비 끝 카드가 떠 있는 동안엔 블라인드 안 뜸');
  const t0 = Date.now(); await p.click('.fincard');
  await p.waitForSelector('#keygate [data-gateone]', { timeout: 3000 });
  ok(Date.now() - t0 < 2000, '정비 끝 카드 닫으면 2초 안에 반납 창 (' + (Date.now() - t0) + 'ms)');
  const ret = await p.textContent('#keygate');
  ok(/12층 B키/.test(ret) && !/13층/.test(ret), '반납 블라인드: 받은 키(12층 B키)만, 안 가져간 13층은 빠짐');
  ok(/유실물/.test(ret), '고객 유실물 안내도 같이');
  ok(await p.evaluate(() => document.body.classList.contains('gated')), '뒤 레포트는 흐리게 가려짐');
  await sleep(1600); await p.screenshot({ path: path.join(OUT, 'k5_반납블라인드.png') });
  await p.click('[data-gatepeek]'); await sleep(300);
  ok(await p.locator('#keygate').count() === 0 && await p.locator('[data-room="1201"]').isVisible(), '[아직 일이 남았어요] → 블라인드 걷히고 레포트 보임');
  // 레포트로 돌아가 완료 취소 → 다시 완료하면 블라인드 다시 (30분 안 기다림)
  await p.click('[data-room="1301"]'); await p.waitForSelector('.panel [data-act="undo"]'); await p.click('.panel [data-act="undo"]'); await sleep(300);
  ok(await p.locator('#keygate').count() === 0, '완료 취소 → 남은 객실 있으면 블라인드 없음');
  await p.click('[data-room="1301"]'); await p.waitForSelector('.panel .chk'); await p.click('.panel [data-act="allok"]');
  await p.waitForSelector('.fincard', { timeout: 3000 }).then(() => ok(true, '취소했다 다시 완료 → 폭죽 · 오늘 정비 끝 카드 다시'), () => ok(false, '다시 완료 → 폭죽 다시'));
  await p.waitForSelector('#keygate [data-gateone]', { timeout: 9000 }).then(() => ok(true, '다시 완료 → 카드 뒤 반납 블라인드 다시 뜸'), () => ok(false, '다시 완료 → 블라인드 다시'));
  await p.reload(); await p.waitForSelector('#keygate [data-gateone]', { timeout: 8000 });
  ok(true, '앱을 다시 열면 블라인드 다시 뜸 (기다림 없이)');
  await p.click('[data-gateone="12"]'); await sleep(400);
  let rt = await p.evaluate(d => Object.keys(window.__seed).filter(k => k.startsWith('days/' + d + '/keyret/')).map(k => window.__seed[k]), DAY);
  ok(rt.length === 1 && rt[0].on === true && rt[0].maid === '김하나' && rt[0].floor === 12, '키마다 [반납 완료] (12층) → 반납 표시 줄 저장 (keyret)');
  ok(await p.locator('#keygate').count() === 0 && !(await p.evaluate(() => document.body.classList.contains('gated'))), '블라인드 사라지고 레포트 다시 보임');
  ok(/✔ 반납/.test(await p.textContent('[data-keyret="12"]')), '한 줄 띠에 「12층 B키 ✔ 반납 시각」');
  await p.screenshot({ path: path.join(OUT, 'k5b_반납완료.png') });
  await p.click('[data-keyret="12"]'); await sleep(400);
  rt = await p.evaluate(d => Object.keys(window.__seed).filter(k => k.startsWith('days/' + d + '/keyret/')).map(k => window.__seed[k]), DAY);
  ok(rt.length === 2 && await p.locator('#keygate').count() === 1, '띠의 반납 칸을 다시 누르면 취소 (줄은 쌓임) → 블라인드 다시');
  ok(!p.errs.length, '오류 없음 ' + p.errs.join(' | '));
  await p.context().close();

  // 같은 층 같은 키 겹침 경고 (이두리 = 12층, 김하나가 이미 A키)
  p = await ctxOf(browser, seed({ keys: { ['days/' + DAY + '/keys/x1']: { floor: 12, maid: '김하나', key: 'A', reason: '', by: '본인', who: '', at: now - 3600e3, clientAt: now - 3600e3, uid: 'dvA' } } }), null, 'dvB');
  await p.goto(BASE + 'rm/app/'); await p.waitForSelector('.keyband');
  ok(/김하나 님이 가져감/.test(await p.textContent('.keyband [data-key="12:A"].ktaken')), '이미 가져간 키는 버튼 안에 「김하나 님이 가져감」');
  ok(!(await p.locator('.keyband [data-key="12:B"].ktaken').count()), '안 가져간 B키 버튼은 그대로');
  await p.click('[data-key="12:A"]'); await p.waitForSelector('.warnbox');
  ok(/김하나/.test(await p.textContent('.warnbox')), '같은 키를 또 누르면 "이미 가져갔다고 했어요" 경고');
  await p.screenshot({ path: path.join(OUT, 'k6_겹침경고.png') });
  await p.click('.panel [data-x]'); await sleep(100);
  ok((await keysOf(p)).length === 1, '"다시 고르기"면 저장 안 됨');
  await p.click('[data-key="12:B"]'); await sleep(300);
  ok((await keysOf(p)).some(k => k.maid === '이두리' && k.key === 'B'), 'B키는 바로 저장');
  await p.context().close();

  // 시작 날짜 전 · 꺼짐 → 아무것도 안 보임
  for (const [cfg, lb] of [[{ from: TMR, on: true }, '시작 날짜(내일) 전'], [{ from: DAY, on: false }, '끄기 스위치'], [null, '설정 없음']]) {
    p = await ctxOf(browser, seed({ cfg }), null, 'dvA');
    await p.goto(BASE + 'rm/app/'); await p.waitForSelector('[data-room="1201"]'); await sleep(300);
    const n = await p.locator('.keyband').count();
    await p.click('[data-room="1201"]'); await p.waitForSelector('.panel');
    ok(!n && await p.locator('.panel .chk').count() === 1, lb + ': 키 띠 없음 · 객실 바로 열림 (지금과 같음)');
    await p.context().close();
  }

  // 다음 근무 날: 지난번 [키 반납 완료] 안 눌렀으면 맨 위 안내 (대조로 사무실에 있었으면 부드러운 문구)
  for (const [chk, lb] of [[false, '대조 기록 없음'], [true, '대조로 사무실에 있음']]) {
    const YD = fmt(Date.now() - 864e5), ex = { ['days/' + YD + '/keys/y1']: { floor: 12, maid: '김하나', key: 'A', reason: '', by: '본인', who: '', at: now - 864e5, clientAt: now - 864e5, uid: 'dvA' } };
    if (chk) ex['days/' + YD + '/keychk/y2'] = { floor: 12, key: 'A', st: 'in', by: '하우스키퍼', at: now - 80000e3, clientAt: now - 80000e3 };
    p = await ctxOf(browser, seed({ cfg: { from: YD, on: true }, keys: ex }), null, 'dvA');
    await p.goto(BASE + 'rm/app/'); await p.waitForSelector('.band.keypast', { timeout: 8000 }).catch(() => {});
    const t = await p.locator('.band.keypast').count() ? await p.textContent('.band.keypast') : '';
    ok(/지난번.*키 반납 확인이 되지 않았어요/.test(t) && (chk ? /사무실에 잘 들어왔는데/.test(t) : /꼭 반납하고/.test(t)), '다음 날 안내 (' + lb + ')');
    if (!chk) await p.screenshot({ path: path.join(OUT, 'k9_지난번안내.png') });
    await p.click('[data-keypastx]'); await sleep(200);
    ok(await p.locator('.band.keypast').count() === 0, '[확인했어요] 누르면 사라짐');
    await p.context().close();
  }
  p = await ctxOf(browser, seed({ cfg: { from: fmt(Date.now() - 864e5), on: true }, keys: { ['days/' + fmt(Date.now() - 864e5) + '/keys/y1']: { floor: 12, maid: '김하나', key: 'A', at: now - 864e5, clientAt: now - 864e5, by: '본인' }, ['days/' + fmt(Date.now() - 864e5) + '/keyret/y3']: { floor: 12, maid: '김하나', on: true, at: now - 80000e3, clientAt: now - 80000e3 } } }), null, 'dvA');
  await p.goto(BASE + 'rm/app/'); await p.waitForSelector('.keyband'); await sleep(800);
  ok(await p.locator('.band.keypast').count() === 0, '지난번 반납 완료 눌렀으면 안내 없음');
  await p.context().close();

  // 전체 키 현황 · 다른 분 키 (이두리 휴대폰, 김하나 12층 A키 · 하우스키퍼 대조 25층 A 있음)
  p = await ctxOf(browser, seed({ keys: { ['days/' + DAY + '/keys/x1']: { floor: 12, maid: '김하나', key: 'A', reason: '', by: '본인', who: '', at: now - 3600e3, clientAt: now - 3600e3, uid: 'dvA' },
    ['days/' + DAY + '/keychk/c1']: { floor: 25, key: 'A', st: 'in', by: '하우스키퍼', at: now - 600e3, clientAt: now - 600e3 } } }), null, 'dvB');
  await p.goto(BASE + 'rm/app/'); await p.waitForSelector('.keyband');
  await p.click('[data-keylist]'); await p.waitForSelector('.klist');
  const kl = await p.textContent('.klist');
  ok(/12층A키\s*\S*김하나/.test(kl.replace(/\s+/g, '')) || /김하나/.test(kl), '전체 키 현황: 12층 A키 김하나');
  ok(/사무실에 있음/.test(kl), '전체 키 현황: 대조로 반납 확인된 키는 「사무실에 있음」');
  ok(await p.locator('.kl.me').count() === 1, '내 층(12층)은 노란색');
  await p.screenshot({ path: path.join(OUT, 'k7_전체키현황.png') });
  const sc = await p.evaluate(() => { const pn = document.querySelector('.panel'), kl = document.querySelector('.klist'); pn.scrollTop = 99999; const r = kl.lastElementChild.getBoundingClientRect(); return { cut: kl.scrollHeight - kl.clientHeight, top: pn.scrollTop, vis: r.bottom <= window.innerHeight + 1 }; });
  ok(sc.cut <= 1 && sc.top > 0 && sc.vis, '현황 창: 목록이 잘리지 않고 끝(31층)까지 내려감 ' + JSON.stringify(sc));
  await p.click('.panel [data-x]'); await sleep(100);
  await p.context().close();

  // ---------- 2. 허브 키 대장
  console.log('허브 키 대장');
  const K = (id, f, m, k, min, x) => [['days/' + DAY + '/keys/' + id], Object.assign({ floor: f, maid: m, key: k, reason: '', by: '본인', who: '', at: now - min * 60000, clientAt: now - min * 60000, uid: 'u' }, x || {})];
  const KS = Object.fromEntries([K('a1', 12, '김하나', 'A', 300), K('a2', 13, '김하나', '없음', 299, { reason: '짝이 열어 줌' }), K('a3', 12, '이두리', 'A', 290), K('a4', 12, '이두리', 'B', 280), K('a5', 14, '박세나', 'AB', 270)]);
  KS['days/' + DAY + '/keyret/r1'] = { floor: 12, maid: '이두리', on: true, at: now - 30 * 60000, clientAt: now - 30 * 60000, uid: 'u' };
  KS['days/' + DAY + '/recs/최넷_2501'] = { maid: '최넷', room: '2501', status: '완료', at: now - 20 * 60000 };   // 25층은 시작함 → 누락
  KS['days/' + DAY + '/plans/박세나'] = { rooms: [room(1401), room(1601)] };   // 16층은 시작 전 → 대기 (알림 아님)
  KS['days/' + DAY + '/keychk/c1'] = { floor: 14, key: 'A', st: 'out', by: '하우스키퍼', at: now - 60000, clientAt: now - 60000 };
  p = await ctxOf(browser, seed({ keys: KS }), { viewport: { width: 430, height: 932 } });
  await p.goto(BASE + 'hub/keys/'); await p.waitForSelector('#pw'); await p.click('[data-who="0"]'); await p.fill('#pw', 'pw'); await p.click('[data-login]');
  await p.waitForSelector('.led');
  const sumT = await p.textContent('.sum4');
  ok(/1\s*키 서명 누락/.test(sumT), '누락 1명 (최넷 25층 · 객실 시작함) ' + sumT);
  ok(/아직 시작 전 층[\s\S]*박세나 16층/.test(await p.textContent('body')), '시작 전 층(박세나 16층)은 「대기」로 따로, 누락 수에 안 셈');
  ok(/1\s*미반납/.test(sumT), '대조 때 14층 A키 없음 → 미반납 1');
  ok(/1\s*바꾼 기록/.test(sumT), '바꾼 기록 1 (이두리 12층 A→B)');
  ok(await p.locator('.lc.bad').count() === 1, '미반납 칸 빨강');
  ok(await p.locator('.lc.rt').count() === 1 && /메이드 반납 표시/.test(await p.textContent('.lc.rt')), '메이드가 [반납했어요] 누른 칸(12층 B키)은 「메이드 반납 표시 · 대조 전」');
  ok(await p.locator('[data-quickoff]').count() === 0 && await p.locator('[data-cfg]').count() === 0, '하우스키퍼: 설정 · 끄기 버튼 없음');
  await p.screenshot({ path: path.join(OUT, 'h1_키대장_하우스키퍼.png'), fullPage: true });
  await p.click('[data-ck="12:A:in"]'); await sleep(300);
  ok(await p.locator('[data-ck="12:A:in"][aria-pressed="true"]').count() === 1, '대조 [있음] 누르면 표시 · 기록');
  await p.click('[data-ck="12:A:in"]'); await sleep(300);
  ok(await p.locator('[data-ck="12:A:in"][aria-pressed="true"]').count() === 0, '같은 버튼 다시 누르면 비움');
  const nChk = await p.evaluate(d => Object.keys(window.__seed).filter(k => k.startsWith('days/' + d + '/keychk/')).length, DAY);
  ok(nChk === 3, '대조 줄은 쌓기만 (1 + 2줄)');
  await p.click('[data-fix="25"]'); await p.waitForSelector('#fx-maid');
  await p.selectOption('#fx-maid', '최넷'); await p.click('[data-fk="A"]'); await p.click('[data-fixs]'); await sleep(400);
  const fx = (await keysOf(p)).filter(k => k.floor === 25)[0];
  ok(fx && fx.by === '관리자' && fx.who === '하우스키퍼' && fx.maid === '최넷', '고치기: 「관리자 · 하우스키퍼」 이름으로 줄 추가');
  ok(/0\s*키 서명 누락/.test(await p.textContent('.sum4')), '고친 뒤 미서명 0');
  await p.click('[data-allin]'); await sleep(500);
  ok(/56\/56/.test(await p.textContent('.sum4')), '대조 안 한 칸 모두 있음 → 56/56');
  await p.emulateMedia({ media: 'print' }); await p.screenshot({ path: path.join(OUT, 'h2_인쇄.png'), fullPage: true }); await p.emulateMedia({ media: 'screen' });
  await p.click('[data-ckreset]'); await sleep(500);
  ok(/0\/56/.test(await p.textContent('.sum4')), '대조 전체 초기화 → 0/56 ' + (await p.textContent('.sum4')));
  const nChk2 = await p.evaluate(d => Object.keys(window.__seed).filter(k => k.startsWith('days/' + d + '/keychk/')).length, DAY);
  ok(nChk2 > 56, '초기화도 줄 추가 (지우기 없음) ' + nChk2);
  await p.click('[data-allin]'); await sleep(500);
  ok(!p.errs.length, '오류 없음 ' + p.errs.join(' | '));
  await p.evaluate(() => sessionStorage.clear());
  await p.context().close();

  // 소장: 설정 · 바로 끄기
  p = await ctxOf(browser, seed({ cfg: null }), { viewport: { width: 430, height: 932 } });
  await p.goto(BASE + 'hub/keys/'); await p.waitForSelector('#pw'); await p.click('[data-who="1"]'); await p.fill('#pw', 'pw'); await p.click('[data-login]');
  await p.waitForSelector('.cfgline');
  ok(/아직 안 켬/.test(await p.textContent('.cfgline')), '처음엔 「아직 안 켬」');
  await p.click('[data-cfg]'); await p.waitForSelector('#cf-from');
  ok(await p.inputValue('#cf-from') === TMR, '시작 날짜 기본값 = 내일');
  await p.screenshot({ path: path.join(OUT, 'h3_설정.png'), fullPage: true });
  await p.click('[data-cfgs]'); await sleep(400);
  let cfg = await p.evaluate(() => window.__seed['meta/keys']);
  ok(cfg && cfg.from === TMR && cfg.on === true && /유실물/.test(cfg.lostText), '저장: 내일부터 켜짐 · 유실물 문구');
  ok(/부터 켜짐/.test(await p.textContent('.cfgline')), '상태 줄: 「11/xx부터 켜짐」');
  await p.click('[data-quickoff]'); await sleep(400);
  cfg = await p.evaluate(() => window.__seed['meta/keys']);
  ok(cfg.on === false && cfg.from === TMR, '바로 끄기 → on:false (시작 날짜는 남음)');
  ok(/꺼짐/.test(await p.textContent('.cfgline')), '상태 줄: 꺼짐');
  await p.evaluate(() => sessionStorage.clear());
  await p.context().close();

  // 허브 첫 화면 🔑 버튼 · 확인할 것
  p = await ctxOf(browser, seed({ keys: KS }), { viewport: { width: 430, height: 932 } });
  await p.goto(BASE + 'hub/'); await p.waitForSelector('#pw'); await p.click('[data-who="0"]'); await p.fill('#pw', 'pw'); await p.click('[data-login]');
  await p.waitForSelector('.hm-tile'); await p.waitForFunction(() => /미반납/.test(document.body.textContent), null, { timeout: 8000 }).catch(() => {});
  const home = await p.textContent('main');
  ok(/플로어 키 미반납 1개/.test(home), '첫 화면 「지금 확인할 것」에 미반납');
  ok(/미반납 1/.test(await p.textContent('a.hm-tile[href="./keys/"]')), '🔑 버튼에 「미반납 1」 표시');
  await p.screenshot({ path: path.join(OUT, 'h4_허브첫화면.png'), fullPage: true });
  ok(!p.errs.length, '오류 없음 ' + p.errs.join(' | '));
  await p.evaluate(() => sessionStorage.clear());
  await p.context().close();

  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
