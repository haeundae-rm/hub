// 쉬는 순간 자동 새로고침(autoreload.js) 시험 (2026-11-26) — Playwright, 가짜 주소. 실제 새로 고침 대신 go() 로 '갈 주소'만 받음
// 실행: node test/autoreload_test.js [autoreload.js 경로]   (기본: 허브 저장소의 autoreload.js)
// 세 저장소(rm/app · dirty · hub) 파일이 같은지도 같이 봄 (나란히 받아 둔 경우)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const FILE = process.argv[2] || path.resolve(__dirname, '../autoreload.js');
const SRC = fs.readFileSync(FILE, 'utf8');
let pass = 0, fail = 0; const ok = (c, l) => { c ? pass++ : fail++; console.log((c ? '  ✅ ' : '  ❌ ') + l); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HTML = '<!doctype html><html><body><input id="t" value=""><textarea id="ta"></textarea><button id="b">버튼</button><script src="autoreload.js"></script></body></html>';

async function page(browser, opt) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  let ver = opt.server || 'v1';
  await p.route('https://t.test/**', r => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith('/version.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ v: ver }) });
    if (u.pathname.endsWith('/autoreload.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: SRC });
    return r.fulfill({ status: 200, contentType: 'text/html', body: HTML });
  });
  await p.goto('https://t.test/app/#work/now');
  if (opt.pre) await p.evaluate(opt.pre);
  await p.evaluate(o => {
    window.__safe = true; window.__went = '';
    window.AutoReload.start({ key: 'k', cur: o.cur, url: 'version.json', idleMin: 0.02, tickSec: 0.15, everyMin: 0.01,
      safe: () => window.__safe, onNew: v => { window.__new = v; }, go: u => { window.__went = u; } });
  }, { cur: opt.cur === undefined ? 'v1' : opt.cur });
  return { p, ctx, setVer: v => { ver = v; }, went: () => p.evaluate(() => window.__went), st: () => p.evaluate(() => window.AutoReload.state()) };
}
const hide = (p, h) => p.evaluate(h => { Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, h);

(async () => {
  const browser = await chromium.launch();
  try {
    console.log('① 버전 같음');
    { const t = await page(browser, { server: 'v1' }); await sleep(600); ok(!(await t.went()), '안 바뀜'); await t.ctx.close(); }

    console.log('② 열자마자 새 버전 (아직 안 만짐)');
    { const t = await page(browser, { server: 'v2' }); await sleep(400); const w = await t.went();
      ok(/[?&]r=v2/.test(w), '바로 새로 고침 · 주소에 r=v2'); ok(/#work\/now$/.test(w), '보던 쪽(#…) 그대로'); ok((await t.p.evaluate(() => window.__new)) === 'v2', '새 버전 알림(띠)도 부름'); await t.ctx.close(); }

    console.log('③ 쓰는 중에 새 버전 → 쉬면 바뀜');
    { const t = await page(browser, { server: 'v1' }); await t.p.click('#b'); t.setVer('v2');
      await t.p.click('#b'); await sleep(900); await t.p.click('#b'); ok(!(await t.went()), '만진 지 얼마 안 됨 → 안 바뀜'); ok((await t.st()).newV === 'v2', '새 버전은 알고 있음');
      for (let i = 0; i < 4; i++) { await t.p.mouse.move(10 + i, 10); await t.p.click('#b'); await sleep(250); }
      ok(!(await t.went()), '계속 누르는 동안 안 바뀜');
      await sleep(1700); ok(/r=v2/.test(await t.went()), '1.2초(시험용) 쉬니까 바뀜'); await t.ctx.close(); }

    console.log('④ 앱이 안 된다고 할 때 (창 열림 · 저장 대기)');
    { const t = await page(browser, { server: 'v1', pre: () => {} }); await t.p.evaluate(() => { window.__safe = false; }); t.setVer('v2');
      await sleep(1800); ok(!(await t.went()), '쉬어도 안 바뀜'); ok((await t.st()).why === 'busy', '이유 = busy');
      await t.p.evaluate(() => { window.__safe = true; }); await sleep(400); ok(/r=v2/.test(await t.went()), '창 닫히니까 바뀜'); await t.ctx.close(); }

    console.log('⑤ 글자 쓰는 중 / 쓰다 만 글');
    { const t = await page(browser, { server: 'v1' }); await t.p.focus('#t'); t.setVer('v2');
      await sleep(1800); ok(!(await t.went()), '칸에 커서 있으면 안 바뀜'); ok((await t.st()).why === 'editing', '이유 = editing');
      await t.p.type('#t', '1203'); await t.p.click('#b'); await sleep(1800); ok(!(await t.went()), '커서 빼도 쓰다 만 글 있으면 안 바뀜');
      await t.p.fill('#t', ''); await t.p.click('#b'); await sleep(1800); ok(/r=v2/.test(await t.went()), '글 지우고 쉬니까 바뀜'); await t.ctx.close(); }

    console.log('⑥ 인터넷 끊김');
    { const t = await page(browser, { server: 'v1' }); await t.p.click('#b'); t.setVer('v2'); await sleep(400);
      await t.ctx.setOffline(true); await sleep(1800); ok(!(await t.went()), '끊겼을 때 안 바뀜');
      await t.ctx.setOffline(false); await sleep(500); ok(/r=v2/.test(await t.went()), '다시 연결되니까 바뀜'); await t.ctx.close(); }

    console.log('⑦ 화면 안 볼 때 / 다시 켰을 때');
    { const t = await page(browser, { server: 'v1' }); await t.p.click('#b'); t.setVer('v2'); await sleep(400);
      ok(!(await t.went()), '보는 중 · 방금 만짐 → 안 바뀜'); await hide(t.p, true); await sleep(300); ok(/r=v2/.test(await t.went()), '다른 앱으로 가면(화면 끔) 바로 확인해서 바뀜'); await t.ctx.close(); }
    { const t = await page(browser, { server: 'v1' }); await t.p.click('#b'); await hide(t.p, true); t.setVer('v2'); await sleep(100);
      await hide(t.p, false); await sleep(400); ok(/r=v2/.test(await t.went()), '화면 다시 켜고 아무것도 안 만지면 바로 바뀜'); await t.ctx.close(); }

    console.log('⑧ 같은 버전 두 번까지만');
    { const t = await page(browser, { server: 'v2', pre: () => sessionStorage.setItem('ar:k:v2', '2') }); await sleep(800);
      ok(!(await t.went()), '이미 두 번 해 봤으면 안 바뀜(띠만)'); ok((await t.st()).why === 'tried', '이유 = tried'); ok((await t.p.evaluate(() => window.__new)) === 'v2', '띠는 보임'); await t.ctx.close(); }
    { const t = await page(browser, { server: 'v2', pre: () => sessionStorage.setItem('ar:k:v2', '1') }); await sleep(400);
      ok(/r=v2/.test(await t.went()), '한 번만 했으면 한 번 더'); ok((await t.p.evaluate(() => sessionStorage.getItem('ar:k:v2'))) === '2', '횟수 2'); await t.ctx.close(); }

    console.log('⑨ 버전 글자 없는 화면 (허브 하위 화면)');
    { const t = await page(browser, { server: 'v5', cur: '' }); await sleep(500); ok(!(await t.went()), '처음 값(v5)은 기준 — 안 바뀜'); ok((await t.st()).base === 'v5', '기준 v5');
      t.setVer('v6'); await sleep(1500); ok(/r=v6/.test(await t.went()), '올라가면(v6) 바뀜'); await t.ctx.close(); }
  } finally { await browser.close(); }

  // 세 저장소 같은 파일인지
  const sib = ['../../rm/app/autoreload.js', '../../dirty/autoreload.js', '../autoreload.js'].map(f => path.resolve(__dirname, f)).filter(f => fs.existsSync(f));
  if (sib.length > 1) ok(sib.every(f => fs.readFileSync(f, 'utf8') === SRC), '세 저장소 autoreload.js 같음 (' + sib.length + '곳)');
  console.log('\n통과 ' + pass + ' · 실패 ' + fail);
  process.exit(fail ? 1 : 0);
})();
