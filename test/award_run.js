// 🏆 시상 시험 (2026-11-27) — node test/award_run.js  (가명)
//   교육생 유닛 = 예산 · 지난달 이월 가져오기 · 추가/건수 → OT 수량 · 연장근로 '시상' 칸 · 지급 금액 · 예산 넘음 · 월 전체 엑셀 「시상 명단」
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = { hub: path.resolve(__dirname, '..'), rm: process.env.RM || path.resolve(__dirname, '../../rm') }, BASE = 'https://haeundae-rm.github.io/';
let pass = 0, fail = 0; const ok = (c, l) => { c ? pass++ : fail++; console.log((c ? '  ✅ ' : '  ❌ ') + l); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const NAMES = ['가람', '나래', '다솜', '라온'];
const ROOMS = []; for (let f = 10; f >= 4; f--) for (let s = 1; s <= 17; s++) ROOMS.push(String(f * 100 + s));
function day(ds, k) { const r = {}; ROOMS.forEach((rm, i) => { r[rm] = i < 40 ? ['1', i < 10 ? '교육생' : NAMES[i % 4], '', '', 1, 0] : ['', '', '', '', 0, 1]; });   // 교육생 10실/일
  return { date: ds, src: 'excel', rooms: ROOMS, r, xl: {}, cards: NAMES.map(n => ({ n, u: '9', in: false })), groups: [], roster: NAMES, at: Date.now() }; }
const SEED = { 'meta/rsync': { on: true, at: Date.now() }, 'jbr/2026-11-25': day('2026-11-25'), 'jbr/2026-11-26': day('2026-11-26'),
  'jbr/cfg-2026-10': { awards: [{ id: 'o1', k: '우수사원 시상', n: '다솜', why: '칭찬 VOC', c: 1, u: 7, x: 0, st: '이월' }] } };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1600, height: 950 }, timezoneId: 'Asia/Seoul', locale: 'ko-KR' });
  await ctx.addInitScript(s => { window.__seed = s; window.__live = 1; }, SEED);
  await ctx.route('**/*', r => { const u = r.request().url(); if (!u.startsWith(BASE)) return r.fulfill({ status: 200, body: '' });
    const [app, ...rest] = u.slice(BASE.length).split('?')[0].split('#')[0].split('/'); let f = rest.join('/') || 'index.html'; if (f.endsWith('/')) f += 'index.html';
    const file = app === 'rm' && f === 'app/store.js' ? path.join(__dirname, 'fake_store.js') : path.join(ROOT[app] || '/nope', f);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return r.fulfill({ status: 404, body: 'nf' });
    r.fulfill({ status: 200, contentType: (/\.js$/.test(file) ? 'application/javascript' : /\.html$/.test(file) ? 'text/html' : 'application/json') + '; charset=utf-8', body: fs.readFileSync(file) }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('dialog', d => d.accept());
  await p.goto(BASE + 'hub/jbr/'); await p.click('[data-jwho="0"]'); await p.fill('#jpw', 'pw'); await p.click('[data-jlogin]');
  await p.waitForSelector('.c[data-i]'); await p.click('#days [data-d="2026-11-26"]'); await p.click('[data-t="close"]'); await sleep(300);
  await p.click('[data-ctab="award"]'); await sleep(200);
  let t = await p.innerText('#main');
  console.log('① 예산 · 이월');
  ok(/11월 시상 예산 = 교육생 정비 유닛\s*20유닛/.test(t), '예산 = 교육생 20유닛 (10실 × 2일)');
  ok(/지난달\(10월\) 이월 1명: 다솜/.test(t), '지난달 이월 1명 안내');
  await p.click('[data-awcarry]'); await sleep(300);
  let c11 = await p.evaluate(() => window.__seed['jbr/cfg-2026-11']), c10 = await p.evaluate(() => window.__seed['jbr/cfg-2026-10']);
  ok(c11.awards[0].n === '다솜' && c11.awards[0].st === '당월 지급 대상' && c11.awards[0].from === '2026-10' && c10.awards[0].moved === '2026-11', '다솜 이번 달 맨 위 · 10월엔 옮김 표시');
  ok(!/지난달\(10월\) 이월/.test(await p.innerText('#main')), '이월 안내 사라짐 (두 번 안 가져옴)');
  console.log('② 추가 · 건수 → OT 수량');
  await p.click('[data-awadd]'); await sleep(200);
  await p.fill('[data-aw="1:n"]', '가람'); await p.dispatchEvent('[data-aw="1:n"]', 'change'); await sleep(150);
  await p.fill('[data-aw="1:c"]', '2'); await p.dispatchEvent('[data-aw="1:c"]', 'change'); await sleep(150);
  await p.fill('[data-aw="1:x"]', '200000'); await p.dispatchEvent('[data-aw="1:x"]', 'change'); await sleep(200);
  c11 = await p.evaluate(() => window.__seed['jbr/cfg-2026-11']);
  ok(c11.awards[1].n === '가람' && c11.awards[1].c === 2 && c11.awards[1].u === 14 && c11.awards[1].x === 200000, '가람 2건 → OT 14 · 추가 20만원');
  t = await p.innerText('#main');
  ok(/지급 \(당월 지급 대상 · 시상 완료\)\s*21유닛 · 355,400원/.test(t), '지급 21유닛 · 355,400원 (7+14)×7,400 + 200,000');
  ok(/예산 넘음\s*-1유닛/.test(t) && /1유닛만큼 「이월」로/.test(t), '예산 20 넘음 → 「이월로 바꿔 주세요」');
  await p.selectOption('[data-aw="0:st"]', '이월'); await sleep(200);
  ok(/남음 → 도급 수익 \(교육생 그대로\)\s*6유닛/.test(await p.innerText('#main')), '다솜 이월 → 남음 6유닛 (도급 수익)');
  await p.selectOption('[data-aw="0:st"]', '당월 지급 대상'); await sleep(200);
  console.log('③ 연장근로 시상 칸');
  await p.click('[data-ctab="ot"]'); await sleep(200);
  const row = n => p.$$eval('.box table tr', (trs, n) => { const r = trs.find(tr => tr.cells[0] && tr.cells[0].innerText.trim().startsWith(n)); return r ? [...r.cells].map(c => c.innerText.trim()) : null; }, n);
  const g = await row('가람'), d = await row('다솜');
  ok(g && g[g.length - 2].startsWith('14') && /\+200,000원/.test(g[g.length - 2]), '가람 시상 14 +200,000원');
  const gOT = +g[g.length - 4] || 0;
  ok(+g[g.length - 1].replace(/,/g, '') === (gOT + 14) * 7400 + 200000, '가람 지급 금액 = (연장 ' + gOT + ' + 14) × 7,400 + 200,000 = ' + g[g.length - 1]);
  ok(d && d[d.length - 2] === '7' && +d[d.length - 1].replace(/,/g, '') === ((+d[d.length - 4] || 0) + 7) * 7400, '다솜 9실 미만이어도 정확히 7실 (' + d[d.length - 1] + ')');
  console.log('④ 정비보고서 방 기록은 그대로');
  ok(await p.evaluate(() => Object.values(window.__seed['jbr/2026-11-26'].r).filter(x => x[1] === '교육생').length === 10), '교육생 방 10실 그대로');
  console.log('⑤ 월 전체 엑셀 「시상 명단」');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-xlm]')]); await dl.saveAs('/tmp/aw_month.xlsx');
  const o = JSON.parse(execFileSync('python3', ['-c', "import openpyxl,json,sys\nwb=openpyxl.load_workbook(sys.argv[1])\nws=wb['시상 명단']\nprint(json.dumps({'s':wb.sheetnames,'r':[[c.value for c in r][:8] for r in ws.iter_rows(min_row=1,max_row=ws.max_row)]},default=str))", '/tmp/aw_month.xlsx'], { stdio: ['pipe', 'pipe', 'ignore'] }).toString());
  ok(o.s.includes('시상 명단'), '시트: ' + o.s.slice(0, 7).join(', '));
  const flat = JSON.stringify(o.r);
  ok(/2026년 11월  룸메이드 시상 명단/.test(flat) && /"다솜","칭찬 VOC \(10월 이월\)",1,7,51800,"당월 지급 대상"/.test(flat) && /"가람","칭찬 VOC \+ 200,000원",2,14,303600/.test(flat), '명단 줄 (다솜 51,800 · 가람 303,600)');
  ok(/당월 배정 예산 \(교육생 정비 유닛\)","20유닛"/.test(flat) && /잔  액 \(도급 수익\)","-1유닛"/.test(flat), '내부 관리용: 예산 20 · 잔액 -1');
  ok(!errs.length, '오류 없음 ' + errs.join(' | '));
  await b.close(); console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})();
