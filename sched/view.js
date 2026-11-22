// hub/sched/view.js — 🗓️ 하우스맨 근무 스케줄 보기 (2026-11-22) — 하우스키퍼 · 파트장 · 관리자 모두 열람만
// 편성(자동 편성 · 수정 · 확정)은 소장 · 부소장 전용 sched/ (허브 첫 화면 '근무 스케줄 편성' 칸). 여기는 읽기만 하고 아무것도 쓰지 않음
// 보여 주는 것: 확정된 달의 스케줄표(관리자 줄 포함) · 그 달 휴무신청(확정 전에도) · 사람별 합계 · E조·C조 월별 · 국공휴 출근 현황
// 읽는 곳: hksched/cfg (누적 현황) · hksched/{YYYY-MM} (그 달)
import * as DB from '../../rm/app/store.js';
import { printSchedule } from './print.js?v=2026.11.22-8';

const $ = id => document.getElementById(id);
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const WORK = ['A', 'E', 'C', 'B', 'D'];
const ROLES = [
  { k: 'hk', label: '하우스키퍼', email: 'unieshaeundae+hk@gmail.com', uid: 'nBL2QYezEmRNRmBRMXN6LNPJO2s2' },
  { k: 'boss', label: '소장', email: 'unieshaeundae+admin@gmail.com', uid: 'iw2orXgIgPgTbLUQa0b41XJ9Dvd2' },
  { k: 'boss', label: '부소장', email: 'unieshaeundae+sub@gmail.com', uid: 'Fz4T5ZzIxShOdVkNpF9gzMmOLED2' },
  { k: 'insp', label: '파트장', email: 'unieshaeundae+insp@gmail.com', uid: '4sVIUKcXtYg28Lm7Qw41UqI6hRX2' }
];
const roleOf = u => (!u || u.anon) ? null : ROLES.filter(r => r.uid === u.uid || r.email === u.email)[0] || null;
const seoul = () => new Date(Date.now() + 9 * 3600e3);
const ymKey = (y, m) => y + '-' + String(m).padStart(2, '0');
const carryLbl = c => c && c.n ? ({ A: '주', C: '야', O: '휴' }[c.type] + c.n) : '';
const ls = { get: k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };

let role = null, login = { who: 0, err: '', busy: false };
let Y = 0, M = 0, doc = null, cfg = null, tab = 'sch', me = ls.get('hksv_me'), hView = 'ec';

function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => el.classList.remove('on'), 2400); }

// ---------- 불러오기
async function open() {
  const h = /^#(\d{4})-(\d{2})$/.exec(location.hash), t = seoul();
  if (h) { Y = +h[1]; M = +h[2]; } else { Y = t.getUTCFullYear(); M = t.getUTCMonth() + 1; }
  $('main').innerHTML = '<div class="card"><p class="note" style="margin:0">불러오는 중…</p></div>';
  try { [cfg, doc] = await Promise.all([DB.get('hksched/cfg'), DB.get('hksched/' + ymKey(Y, M))]); }
  catch (e) { $('main').innerHTML = '<div class="card"><p class="err">불러오지 못했어요 (' + esc(e.code || e.message) + '). 인터넷 연결을 확인해 주세요.</p></div>'; return; }
  try { if (cfg && cfg.lastConf && cfg.lastConf.at) localStorage.setItem('hksv_seen', String(cfg.lastConf.at)); } catch (e) {}   // 허브 NEW 표시 끄기
  draw();
}
function go(dm) { let y = Y, m = M + dm; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } location.hash = ymKey(y, m); }
window.addEventListener('hashchange', () => { if (role) open(); });

// ---------- 화면
function draw() {
  const nd = new Date(Y, M, 0).getDate(), dow = d => new Date(Y, M - 1, d).getDay();
  const ok = doc && doc.state === '확정';
  const staff = (doc && doc.staff) || (cfg && cfg.staff) || [];
  const mgrs = (doc && doc.managers) || (cfg && cfg.managers) || [];
  const hol = (doc && doc.holidays) || [], extra = (doc && doc.extra) || [];
  const forced = (doc && doc.forced) || {}, locks = (doc && doc.locks) || {}, mgr = (doc && doc.mgr) || {}, grid = (doc && doc.grid) || {}, notes = (doc && doc.notes) || {}, autoOff = (doc && doc.autoOff) || {};
  const code = (n, d) => (locks[n] || {})[d + 1] || ((forced[n] || []).includes(d + 1) ? 'O' : (grid[n] || [])[d] || '');
  const t = seoul(), today = t.getUTCFullYear() === Y && t.getUTCMonth() + 1 === M ? t.getUTCDate() : 0;
  let h = '<div class="card"><div class="mbar"><button data-m="-1" aria-label="이전 달">‹</button><div class="d"><b>' + Y + '년 ' + M + '월</b>' +
    '<span class="stc ' + (ok ? 'ok' : '') + '">' + (ok ? '확정' : doc ? '편성 중' : '아직 없음') + '</span></div><button data-m="1" aria-label="다음 달">›</button></div>' +
    '<div class="seg">' + [['sch', '스케줄표'], ['off', '휴무신청'], ['hist', '누적 현황']].map(([k, v]) => '<button data-tab="' + k + '" aria-pressed="' + (tab === k) + '">' + v + '</button>').join('') + '</div></div>';

  if (tab === 'sch') {
    if (!ok) h += '<div class="card"><p class="note" style="margin:0">' + M + '월 스케줄은 아직 확정 전이에요. 소장님이 확정하면 여기에 보여요.<br>휴무신청이 잘 들어갔는지는 <b>휴무신청</b> 탭에서 볼 수 있어요.</p></div>';
    else {
      const names = staff.map(s => s.name);
      h += '<div class="card"><div class="prow"><button class="big sec" id="prt">🖨️ 인쇄 · PDF 저장</button></div><div class="mine"><span>내 줄 강조</span>' + ['', ...names].map(n => '<button data-me="' + esc(n) + '" aria-pressed="' + (me === n) + '">' + (n ? esc(n) : '없음') + '</button>').join('') + '</div>';
      h += '<div class="board"><table class="g"><thead><tr><th class="nm">이름</th>';
      for (let d = 1; d <= nd; d++) { const w = dow(d), ho = hol.includes(d);
        h += '<th class="' + (w === 6 ? 'sat ' : '') + (w === 0 || ho ? 'sun ' : '') + (d === today ? 'today ' : '') + '">' + d + '<br>' + (ho ? '공' : extra.includes(d) ? '+1' : WD[w]) + '</th>'; }
      h += '<th class="s">A</th><th class="s">E</th><th class="s">C</th><th class="s">휴</th><th class="s">근무</th></tr></thead><tbody>';
      const row = (n, sub, r, cls) => {
        const c = k => r.filter(x => x === k).length;
        let x = '<tr class="' + cls + (me && me === n ? ' me' : '') + '"><td class="nm">' + esc(n) + '<small>' + esc(sub) + '</small></td>';
        r.forEach((v, d) => { const f = (forced[n] || []).includes(d + 1), nt = (notes[n] || {})[d + 1], ho = (autoOff[n] || []).includes(d + 1) && v === 'O';
          x += '<td class="c ' + (v === '연' || v === '대' ? 'L' : v) + (f ? ' f' : '') + (ho ? ' ho' : '') + (nt ? ' nt' : '') + (d + 1 === today ? ' today' : '') + '"' + (nt || ho ? ' title="' + esc((ho ? '국공휴 휴무 ' : '') + (nt || '')) + '"' : '') + '>' + (v === '대' ? '대휴' : v) + '</td>'; });
        return x + '<td class="s"><b>' + (c('A') + c('B')) + '</b></td><td class="s"><b>' + c('E') + '</b></td><td class="s"><b>' + c('C') + '</b></td><td class="s"><b>' + c('O') + '</b></td><td class="s">' + r.filter(v => WORK.includes(v)).length + '</td></tr>';
      };
      if (mgrs.length) { h += '<tr class="sep"><td colspan="' + (nd + 6) + '">관리자</td></tr>'; mgrs.forEach(n => { h += row(n, '관리자', Array.from({ length: nd }, (_, d) => (mgr[n] || {})[d + 1] || ''), 'mg'); }); h += '<tr class="sep"><td colspan="' + (nd + 6) + '">하우스맨</td></tr>'; }
      staff.forEach(s => { h += row(s.name, carryLbl(s.carry) ? '전월 ' + carryLbl(s.carry) : '', Array.from({ length: nd }, (_, d) => code(s.name, d)), ''); });
      h += '</tbody></table></div>' +
        '<div class="legend"><span><i class="A">A</i>주간 09:00~18:00</span><span><i class="E">E</i>11:30~22:00</span><span><i class="C">C</i>야간 22:00~09:00</span><span><i class="B">B</i>09:00~22:00</span><span><i class="O">O</i>휴무</span><span><i class="L">연</i>연차</span><span><i class="O f">O</i>신청 휴무(빨간 테두리)</span></div>' +
        memoHtml(staff, mgrs, notes, autoOff, dow) +
        (hol.length ? '<p class="note">국공휴일: ' + hol.slice().sort((a, b) => a - b).map(d => M + '/' + d).join(', ') + '</p>' : '') +
        (extra.length ? '<p class="note">인원 추가일(재고조사·행사 등): ' + extra.slice().sort((a, b) => a - b).map(d => M + '/' + d).join(', ') + '</p>' : '') + '</div>';
    }
  }

  if (tab === 'off') {
    const rows = staff.map(s => ({ n: s.name, d: (forced[s.name] || []).slice().sort((a, b) => a - b), l: Object.keys(locks[s.name] || {}).filter(k => locks[s.name][k] === '연').map(Number).sort((a, b) => a - b) }));
    const any = rows.some(r => r.d.length || r.l.length);
    h += '<div class="card"><h2>' + M + '월 휴무신청</h2>' + (!doc ? '<p class="note" style="margin:0">아직 ' + M + '월 편성이 시작되지 않았어요.</p>' :
      '<ul class="offl">' + rows.map(r => '<li><b>' + esc(r.n) + '</b><span>' + (r.d.length ? r.d.map(d => '<i>' + d + '일(' + WD[dow(d)] + ')</i>').join('') : '<em>신청 없음</em>') +
        (r.l.length ? r.l.map(d => '<i class="lv">' + d + '일 연차</i>').join('') : '') + '</span></li>').join('') + '</ul>' +
      '<p class="note">' + (any ? '빨간 칸으로 표시된 날은 반드시 휴무로 편성돼요. ' : '') + '빠졌거나 틀린 날이 있으면 소장님께 말씀해 주세요.</p>') + '</div>';
  }

  if (tab === 'hist') h += histHtml(staff, mgrs);
  $('main').innerHTML = h;
}

function memoHtml(staff, mgrs, notes, autoOff, dow) {
  const L = [];
  staff.map(s => s.name).concat(mgrs).forEach(n => Object.keys(notes[n] || {}).forEach(d => L.push([+d, n, notes[n][d]])));
  const hd = {}; Object.keys(autoOff).forEach(n => autoOff[n].forEach(d => (hd[d] = hd[d] || []).push(n)));
  Object.keys(hd).forEach(d => L.push([+d, hd[d].join('·'), '국공휴 휴무 (누적 출근율 순)']));
  if (!L.length) return '';
  return '<div class="memo"><b>메모 · 일정</b><ul>' + L.sort((a, b) => a[0] - b[0]).map(x => '<li><span>' + M + '/' + x[0] + '(' + WD[dow(x[0])] + ')</span><b>' + esc(x[1]) + '</b> ' + esc(x[2]) + '</li>').join('') + '</ul></div>';
}
function doPrint() {
  const nd = new Date(Y, M, 0).getDate(), staff = doc.staff || [], forced = doc.forced || {}, locks = doc.locks || {}, grid = doc.grid || {};
  printSchedule({ year: Y, month: M, staff, managers: doc.managers || [], mgr: doc.mgr || {}, forced, notes: doc.notes || {}, holidays: doc.holidays || [], extra: doc.extra || [], state: doc.state, leaveMode: doc.leaveMode,
    codeOf: (n, d) => (locks[n] || {})[d + 1] || ((forced[n] || []).includes(d + 1) ? 'O' : (grid[n] || [])[d] || '') });
}

function histHtml(staff, mgrs) {
  const H = (cfg && cfg.hist) || { ec: {}, hol: [] };
  const years = [...new Set(Object.keys(H.ec || {}).map(k => +k.slice(0, 4)).concat((H.hol || []).map(x => +x.date.slice(0, 4)), [Y]))].sort();
  const hy = years.includes(Y) ? Y : years[years.length - 1];
  let h = '<div class="card"><div class="seg">' + [['ec', 'E조 · C조 월별'], ['hol', '국공휴 출근']].map(([k, v]) => '<button data-hv="' + k + '" aria-pressed="' + (hView === k) + '">' + v + '</button>').join('') + '</div>' +
    '<p class="note" style="margin:0 0 8px">' + hy + '년 확정된 달까지 · 형평성 참고용</p><div class="board"><table class="ht">';
  if (hView === 'ec') {
    const months = Object.keys(H.ec || {}).filter(k => +k.slice(0, 4) === hy).sort();
    const people = staff.filter(s => s.kind !== 'ot').map(s => s.name);
    h += '<tr><th class="nm">이름</th>' + months.map(k => '<th colspan="2">' + (+k.slice(5)) + '월</th>').join('') + '<th colspan="2">월평균</th></tr>' +
      '<tr><th class="nm"></th>' + months.map(() => '<th>E</th><th>C</th>').join('') + '<th>E</th><th>C</th></tr>';
    people.forEach(n => {
      const v = months.map(k => (H.ec[k] || {})[n]).filter(Boolean), isRot = (staff.find(s => s.name === n) || {}).kind === 'rot';
      const aE = v.length ? v.reduce((a, x) => a + x[0], 0) / v.length : 0, aC = v.length ? v.reduce((a, x) => a + x[1], 0) / v.length : 0;
      h += '<tr><td class="nm">' + esc(n) + '</td>' + months.map(k => { const x = (H.ec[k] || {})[n]; return x ? '<td class="E">' + x[0] + '</td><td class="C">' + (isRot ? x[1] : '–') + '</td>' : '<td>–</td><td>–</td>'; }).join('') +
        '<td><b>' + aE.toFixed(1) + '</b></td><td><b>' + (isRot ? aC.toFixed(1) : '–') + '</b></td></tr>';
    });
    if (!months.length) h += '<tr><td class="nm" colspan="3">아직 기록이 없어요</td></tr>';
  } else {
    const hols = (H.hol || []).filter(x => +x.date.slice(0, 4) === hy);
    const people = staff.map(s => s.name).concat(mgrs);
    h += '<tr><th class="nm">이름</th>' + hols.map(x => '<th>' + (+x.date.slice(5, 7)) + '/' + (+x.date.slice(8)) + '<br>' + esc(String(x.name || '').replace(/\s/g, '')) + '</th>').join('') + '<th>출근</th><th>대상</th><th>출근율</th></tr>';
    people.forEach((n, i) => {
      const v = hols.map(x => (x.att || {})[n] || ''), w = v.filter(x => x === '출').length, tt = v.filter(Boolean).length;
      h += '<tr' + (i === staff.length ? ' class="top2"' : '') + '><td class="nm">' + esc(n) + (i >= staff.length ? ' <small>관리자</small>' : '') + '</td>' +
        v.map(x => '<td class="' + (x === '출' ? 'on' : x === '휴' ? 'off' : '') + '">' + (x || '–') + '</td>').join('') +
        '<td>' + w + '</td><td>' + tt + '</td><td><b>' + (tt ? Math.round(w / tt * 100) + '%' : '–') + '</b></td></tr>';
    });
    if (!hols.length) h += '<tr><td class="nm" colspan="3">아직 기록이 없어요</td></tr>';
  }
  return h + '</table></div></div>';
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-m],[data-tab],[data-me],[data-hv],[data-who],#doLogin,#prt');
  if (!b) return;
  if (b.id === 'prt') { doPrint(); return; }
  if (b.dataset.m) go(+b.dataset.m);
  else if (b.dataset.tab) { tab = b.dataset.tab; draw(); }
  else if (b.dataset.me != null) { me = b.dataset.me; ls.set('hksv_me', me); draw(); }
  else if (b.dataset.hv) { hView = b.dataset.hv; draw(); }
  else if (b.dataset.who) { login.who = +b.dataset.who; drawLogin(); }
  else if (b.id === 'doLogin') doLogin();
});

// ---------- 로그인 (야간 보고서와 같은 계정)
function drawLogin() {
  $('main').innerHTML = '<div class="card"><h2>로그인</h2><div class="seg">' + ROLES.map((r, i) => '<button data-who="' + i + '" aria-pressed="' + (login.who === i) + '">' + r.label + '</button>').join('') + '</div>' +
    '<input class="t" id="pw" type="password" autocomplete="current-password" placeholder="비밀번호">' +
    (login.err ? '<p class="err">' + esc(login.err) + '</p>' : '') +
    '<button class="big" id="doLogin"' + (login.busy ? ' disabled' : '') + '>' + (login.busy ? '확인 중…' : '들어가기') + '</button></div>';
}
async function doLogin() {
  const pw = ($('pw') || {}).value || '';
  if (!pw) { login.err = '비밀번호를 적어 주세요.'; drawLogin(); return; }
  login.busy = true; login.err = ''; drawLogin();
  try { await DB.signInEmail(ROLES[login.who].email, pw); } catch (e) { login.err = /network|offline/i.test(String(e && (e.code || e.message))) ? '인터넷 연결을 확인해 주세요.' : '비밀번호가 맞지 않아요.'; }
  login.busy = false; if (!role) drawLogin();
}
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'pw') doLogin(); });
DB.onUser(u => {
  role = roleOf(u);
  $('who').textContent = role ? role.label + ' · 보기' : '';
  if (u && !u.anon && !role) login.err = '지금 로그인된 계정은 이 화면을 볼 수 없어요. 아래에서 다시 들어가 주세요.';
  if (role) open(); else drawLogin();
});
