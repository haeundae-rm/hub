// 실제 앱 화면에서 자동 새로고침 시험 (2026-11-26) — 정비 레포트(관리자) · 허브 첫 화면 · 인수인계
// 준비: hub · rm 저장소를 같은 폴더에 나란히 (예: /home/claude/hub, /home/claude/rm). 가짜 저장소(메모리)라 실제 Firebase 안 씀
// 실행: node test/autoreload_apps.js
// 시계는 가짜(2026-11-26 09:00)로 돌려 '2분 쉼'을 바로 넘김. version.json 은 시험이 정한 값으로 돌려줌
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..');
let pass = 0, fail = 0; const ok = (c, l) => { c ? pass++ : fail++; console.log((c ? '  ✅ ' : '  ❌ ') + l); };
const T = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const FAKE = `export const SERVER_TIME = { __server: 1 }; export const kind = 'fake';
const D = window.__SEED || {}; window.__DB = D;
const cp = x => x == null ? null : JSON.parse(JSON.stringify(x));
const val = v => v === SERVER_TIME ? Date.now() : Array.isArray(v) ? v.map(val) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) : v;
export function onUser(cb) { setTimeout(() => cb({ uid: 'iw2orXgIgPgTbLUQa0b41XJ9Dvd2', email: 'unieshaeundae+admin@gmail.com', anon: false }), 0); return () => {}; }
export async function signInAnon() {} export async function signInEmail() {} export async function signOut() {} export async function idToken() { return ''; }
export async function get(p) { return cp(D[p]); }
const slow = () => window.__slow ? new Promise(r => setTimeout(r, window.__slow)) : Promise.resolve();
export async function set(p, d) { await slow(); D[p] = val(cp(d)); }
export async function merge(p, d) { await slow(); D[p] = Object.assign(D[p] || {}, val(cp(d))); }
export async function del(p) { delete D[p]; }
export function add(c, d) { const id = 'a' + Math.random().toString(36).slice(2); D[c + '/' + id] = val(d); return { id, done: Promise.resolve() }; }
export async function getQuery(c) { return Object.keys(D).filter(k => k.startsWith(c + '/') && k.split('/').length === c.split('/').length + 1).map(k => ({ id: k.split('/').pop(), data: cp(D[k]) })); }
export async function count() { return 0; }
export function listenDoc(p, cb) { setTimeout(() => cb(cp(D[p]), {}), 0); return () => {}; }
export function listenQuery(c, w, cb) { getQuery(c).then(cb); return () => {}; }
`;

async function open(browser, url, ver) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', hasTouch: true });
  const st = { ver, navs: [] };
  await ctx.route('http://t.local/**', r => {
    const u = new URL(r.request().url()); let fp = path.join(ROOT, decodeURIComponent(u.pathname));
    if (/version\.json$/.test(u.pathname) && st.ver) return r.fulfill({ body: JSON.stringify({ v: st.ver }), contentType: 'application/json' });
    if (/\/rm\/app\/store\.js$/.test(u.pathname)) return r.fulfill({ body: FAKE, contentType: 'text/javascript' });
    if (/\/sw\.js$/.test(u.pathname)) return r.fulfill({ status: 404, body: '' });
    if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
    if (!fs.existsSync(fp)) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ body: fs.readFileSync(fp), contentType: T[path.extname(fp)] || 'application/octet-stream' });
  });
  await ctx.route(/fonts\.(googleapis|gstatic)|gstatic\.com\/firebasejs/, r => r.fulfill({ body: '', contentType: 'text/css' }));
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', e => p.errs.push(e.message)); p.on('dialog', d => d.accept());
  p.on('framenavigated', f => { if (f === p.mainFrame() && /[?&]r=/.test(f.url())) st.navs.push(f.url()); });
  await p.clock.install({ time: new Date('2026-11-26T09:00:00+09:00') });
  await p.goto('http://t.local' + url);
  await p.waitForTimeout(1500);
  return { p, ctx, st };
}
const ff = (p, s) => p.clock.fastForward(s);
const why = p => p.evaluate(() => window.AutoReload ? window.AutoReload.state().why : 'off');
async function settle(p) { for (let i = 0; i < 5; i++) { await p.waitForTimeout(200); await ff(p, 1000); } }

(async () => {
  const browser = await chromium.launch();
  try {
    console.log('① 정비 레포트 (관리자 화면)');
    { const { p, ctx, st } = await open(browser, '/rm/app/', '');
      ok((await why(p)) === 'none', '같은 버전: 그대로 (새 버전 없음)');
      await p.locator('body').click({ position: { x: 5, y: 300 } });
      st.ver = '2099.01.01-1'; await ff(p, '05:30'); await p.waitForTimeout(800);
      ok(/[?&]r=2099/.test(st.navs[0] || ''), '5분 확인 후 · 2분 쉼 → 자동으로 새 버전 주소로 다시 열림');
      ok(!p.errs.length, '화면 오류 없음 ' + p.errs.slice(0, 1)); await ctx.close(); }
    { const { p, ctx, st } = await open(browser, '/rm/app/', '');
      for (const tb of ['set', 'staff', 'today']) { await p.evaluate(t => { const b = document.querySelector('[data-atab="' + t + '"]'); if (b) b.click(); }, tb); await p.waitForTimeout(300);
        const hit = await p.evaluate(() => { const b = document.querySelector('[data-teams], [data-release-all], [data-release], [data-nlist], [data-lunch]'); if (b) { b.click(); return b.outerHTML.slice(0, 60); } return ''; });
        if (hit) { await p.waitForTimeout(300); break; } }
      const hasDlg = await p.evaluate(() => (document.querySelector('#sheet') || {}).innerHTML.length > 0);
      await p.locator('#date').click().catch(() => {});
      st.ver = '2099.01.01-1'; await ff(p, '05:30'); await settle(p); await ff(p, '03:00'); await p.waitForTimeout(800);
      ok(hasDlg && !st.navs.length, '창이 열려 있으면 쉬어도 안 바뀜 (창 열림 ' + hasDlg + ')');
      ok((await why(p)) === 'busy', '이유 = busy · 위에 "새 버전" 띠: ' + (await p.locator('.band.ver').count()));
      await ctx.close(); }
    { const { p, ctx, st } = await open(browser, '/rm/app/?link=1', '');
      st.ver = '2099.01.01-1'; await ff(p, '05:30'); await settle(p); await ff(p, '03:00'); await p.waitForTimeout(800);
      ok(!st.navs.length, '정비보고서 연결 창(?link)은 자동으로 안 바뀜 (폴더 허락 유지)'); await ctx.close(); }
    { const { p, ctx, st } = await open(browser, '/rm/app/', '2099.01.01-1');
      await p.waitForTimeout(500);
      ok(st.navs.length >= 1, '열자마자 옛 화면이면 바로 새로 고침');
      await p.waitForTimeout(1500); await ff(p, '10:00'); await p.waitForTimeout(500);
      ok(st.navs.length <= 2, '여전히 옛 화면이어도 두 번까지만 (' + st.navs.length + '번)'); await ctx.close(); }

    console.log('② 허브 첫 화면');
    { const { p, ctx, st } = await open(browser, '/hub/#work/now', '');
      await p.locator('body').click({ position: { x: 5, y: 300 } });
      st.ver = '2099.01.01-1'; await p.evaluate(() => { const d = document.createElement('div'); d.className = 'vp'; d.id = 'rmp'; document.body.appendChild(d); });
      await ff(p, '05:30'); await settle(p); await ff(p, '03:00'); await p.waitForTimeout(800);
      ok(!st.navs.length && (await why(p)) === 'busy', '정비 레포트 창(.vp) 열려 있으면 안 바뀜');
      await p.evaluate(() => document.getElementById('rmp').remove()); await ff(p, '01:00'); await p.waitForTimeout(800);
      ok(/[?&]r=2099.*#work\/now$/.test(st.navs[0] || ''), '창 닫고 쉬니까 바뀜 · 보던 탭(#work/now) 그대로');
      ok(!p.errs.length, '화면 오류 없음 ' + p.errs.slice(0, 1)); await ctx.close(); }

    console.log('③ 하우스키핑 인수인계 (허브 하위 화면, 처음 값 기준)');
    { const { p, ctx, st } = await open(browser, '/hub/hkho/', '2026.11.26-9');
      ok(!st.navs.length, '처음 연 버전은 기준 — 안 바뀜');
      await p.locator('body').click({ position: { x: 5, y: 300 } });
      const add = p.locator('[data-add="day"]').first();
      const canAdd = await add.count();
      if (canAdd) await add.fill('1203호 확인');
      st.ver = '2026.11.26-10'; await ff(p, '05:30'); await settle(p); await ff(p, '03:00'); await p.waitForTimeout(800);
      ok(canAdd && !st.navs.length && (await why(p)) === 'editing', '쓰다 만 인계 글 있으면 안 바뀜');
      if (canAdd) { await add.press('Enter'); await p.waitForTimeout(300); await p.locator('body').click({ position: { x: 5, y: 300 } }); }
      ok((await p.evaluate(() => (window.__DB['hkho/2026-11-26'] || {}).day || [])).length === 1, '적은 인계는 저장됨 (새로 고치기 전)');
      await ff(p, '03:00'); await p.waitForTimeout(800);
      ok(/[?&]r=2026\.11\.26-10/.test(st.navs[0] || ''), '저장하고 쉬니까 바뀜');
      ok(!p.errs.length, '화면 오류 없음 ' + p.errs.slice(0, 1)); await ctx.close(); }
  } finally { await browser.close(); }
  console.log('\n통과 ' + pass + ' · 실패 ' + fail);
  process.exit(fail ? 1 : 0);
})();
