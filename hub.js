// 객실 통합 관리 — 관리자 허브 (2026-11-12, 1단계 '대문')
// 각 앱(정비 레포트 · 정비 지원 · 입퇴사 서류 · 재고)은 그대로 두고, 관리자 입구 하나 + 오늘 한눈에 + 바로가기 + 전 파트 직원 명단
// 같은 주소(haeundae-rm.github.io) 아래라 여기서 로그인하면 정비 레포트·정비 지원도 관리자로 열림 (Firebase 로그인 공유)
// 읽기: 열 때 · '새로 고침' · 화면으로 돌아올 때(2분 지난 경우)만 한 번씩 (실시간 구독 안 함 — Firestore 읽기 아끼기)
// 2단계 (2026-11-13): 📥 정비보고서 올리기 — 정비 레포트 관리자와 같은 계산(engine.js)·같은 저장(uploads/latest + uploads/rep_{날짜})
//   → 중계가 시트 '배정' 탭·메이드 휴대폰으로, 정비 지원 '더티 배분 만들기'는 파일 없이 불러옴. 정비 레포트 쪽 버튼도 그대로 둠(1~2주 같이 씀)
// 2단계 ② (2026-11-13): 🛏 더티 배분 만들기 — 정비 지원의 화면 파일(dist.js · distcalc.js)을 그대로 불러와 허브에서 엶 (같은 계산·같은 저장 sup/{날짜})
//   정비 지원 앱 쪽 버튼도 그대로 둠
// 2단계 ④ (2026-11-13): 🗺 객실 활동판 — 정비 지원 화면을 허브 안 전체 창(iframe /dirty/?hub=act)으로 열어 활동판을 바로 띄움.
//   같은 주소라 로그인 공유, 활동판을 닫으면 정비 지원이 알려 와서(postMessage) 창을 닫고 오늘 한눈에 다시 읽음. 열려 있는 동안만 정비 지원 구독
// 배정 자동화 1단계 (2026-11-13): 🧩 자동 배정 (시험·대조) — assignui.js · assign.js(엔진) · assign_worker.js. 보기·대조만, 앱에 안 올림
// 인스펙션 (2026-11-15 ① 새 구조): 🔍 hub/insp/ 따로 쪽 — 사진·사진별 지적·카톡 이미지 (insp · Storage insp/). 처음 만든 체크 버튼 방식(inspui.js)은 사용자 요청으로 중단·삭제
// 입퇴사 부분 연결 (2026-11-18): 🧾 바로가기는 새 창 + '오늘 한눈에' 입퇴사 진행 카드 — staff 에서 '입사 진행'·퇴사일 있는 분만 골라 읽음 (서류·개인정보는 입퇴사 앱에 그대로)
// 룸메이드 연차 Firebase 전환 (2026-11-18): 📋 바로가기 → hub/leave/ 따로 쪽 (옛 Apps Script 연차 관리 페이지를 옮김, leave_* 컬렉션)
// 첫 화면 개편 (2026-11-18-4): 칸 11개를 위아래로 늘어놓던 것을 '지금 확인할 것' + 업무 버튼 7개로. 버튼을 누르면 안쪽 화면(#work · #quality · #people · #assign · #apps)
//   주소 끝 # 로 나눠서 휴대폰 '뒤로'로 첫 화면에 돌아옴. 더티·활동 자료는 그 탭을 열 때만 읽음 (읽기 아끼기). 안쪽 카드(자동 배정 · 인스펙션 · VOC …)는 그대로 옮기기만
// 정비 레포트 관리자 기능 허브로 (2026-11-18-5): 오늘 정비 → '메이드별 현황' · '배정 변경 · 대조', 📱 현장 관리(공지 확인 · 2인 1조 · 휴대폰 등록 · 휴대폰 오류)
//   = 정비 레포트 관리자 화면을 허브 안 전체 창(iframe ../rm/?hub=today|assign|set)으로 엶 (같은 화면 파일 · 같은 계산). 열려 있는 동안만 구독. 자동 배정은 오늘 정비 탭으로 옮김
// 🔒 화면 비밀번호 (2026-11-18-7): 인사 · 연차·근무 들어갈 때 4자리 (pin.js) — 하우스키퍼도 허브를 보므로. 진짜 잠금은 전용 계정 + 규칙(다음 단계)
// 📢 공지 올리기 (2026-11-18-6): 현장 관리 안 — notice.js. 옛 구글 앱 공지목록.csv 대신 허브에서 바로 notices 에 씀 (id 'hub-…')
// 2단계 ③ (2026-11-13): 📣 고객만족도 VOC — 정비 레포트 voc.js 를 그대로 불러와 허브 전체 화면에서 씀 (같은 voc/{id} 문서). 열려 있는 동안만 voc 구독
import * as S from '../rm/app/store.js';
import * as K from '../rm/app/keys.js?v=2026.11.27-13';   // 🔑 플로어키 셈 (정비 레포트와 같은 부품, 2026-11-19)
import { setupNotice } from './notice.js?v=2026.11.27-13';
import * as PIN from './pin.js?v=2026.11.27-13';
import { setupClose } from './close.js?v=2026.11.27-13';
import { setupClosing } from './closing.js?v=2026.11.27-13';
import { supProgress } from './supcalc.js?v=2026.11.27-13';   // 더티 % = 정비 지원 앱과 같은 셈 (2026-11-21)
import * as XW from './xlsxw.js?v=2026.11.27-13';
import { setupMeal } from './meal.js?v=2026.11.27-13';
import * as BD from './bday.js?v=2026.11.27-13';   // 🎂 이번 주 생일 (2026-11-22)
// 🧹 하우스키퍼 카드 (2026-11-21): 첫 화면 '야간 보고서' 칸 → '하우스키퍼' 카드 (야간 업무 보고서 + 📅 연차 현황 · 본인 4자리). hkleave.js 는 누를 때만 불러옴   // 🍚 주간 식단 (2026-11-21): 식단표 사진 → AI 표 → meta/meals · 첫 화면 오늘 식단 · 메이드 오늘 점심

const VER = '2026.11.27-13';
const HK_UID = 'nBL2QYezEmRNRmBRMXN6LNPJO2s2';
const isHk = () => !!(admin && admin.hk);
const ADMINS = [
  { uid: 'iw2orXgIgPgTbLUQa0b41XJ9Dvd2', label: '소장', email: 'unieshaeundae+admin@gmail.com' },
  { uid: 'Fz4T5ZzIxShOdVkNpF9gzMmOLED2', label: '부소장', email: 'unieshaeundae+sub@gmail.com' },
  // 하우스키퍼 공용 계정 (2026-11-18): 야간 방배정 · 오더테이커. 인사 · 연차는 안 보임 (규칙 v15 로도 막힘). uid = 11/18 만든 공용 계정
  { uid: HK_UID, label: '하우스키퍼', email: 'unieshaeundae+hk@gmail.com', hk: true }
];
const ROYAL = { '3001': 1, '3002': 1, '3101': 1, '3102': 1 };   // 로얄 = 2실 (레포트 앱과 같음)
const JOBS = ['관리', '룸메이드', '정비보조', '하우스키퍼', '하우스맨', '오더테이커', '미화', '사우나', '기타'];
// 🧹 이모지는 윈도우에서 솔 끝이 잘린 것처럼 보여서 직접 그린 빗자루 (11/19)
const BROOM = '<svg class="svgic" viewBox="0 0 60 60" width="1.1em" height="1.1em" aria-hidden="true" style="vertical-align:-.12em;overflow:visible"><g transform="translate(3 -3) rotate(40 32 34)"><rect x="29" y="0" width="6" height="32" rx="3" fill="#9a5b2e"/><path d="M22 36 L42 36 L54 61 Q32 67 10 61 Z" fill="#f4b93a"/><path d="M26.5 40 L18 60 M32 40 L32 63 M37.5 40 L46 60" stroke="#d8941c" stroke-width="2" stroke-linecap="round"/><path d="M17.6 46.5 Q32 50 46.4 46.5" stroke="#d9502f" stroke-width="3.4" fill="none"/><rect x="21" y="29.5" width="22" height="8" rx="3.5" fill="#d9502f"/></g></svg>';
const LINKS = [
  { ic: BROOM, t: '정비 레포트', s: '메이드별 현황 · 룸메이드 명단 · 메이드 화면', href: '../rm/' },
  { ic: '🛏', t: '정비 지원', s: '정비보조 명단 · 정비보조 화면', href: '../dirty/' },
  { ic: '🧾', t: '입퇴사 서류', s: '근로계약서 · 입사서류 · 사직서 (별도 비밀번호 · 새 창)', href: '../unies-contract/', tab: 1 },
  { ic: '📋', t: '연차 관리', s: '룸메이드 연차 · 휴가신청서 승인 · 내 근무 휴대폰 승인', href: './leave/' },
  { ic: '📦', t: '재고조사', s: '객실 · 사우나 재고 (부소장)', href: '../inventory/' }
];

const $ = s => document.querySelector(s);
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const seoul = (t = Date.now()) => new Date(t + 9 * 3600e3);
const ymd = (t = Date.now()) => seoul(t).toISOString().slice(0, 10);
const hm = t => { if (!t) return ''; const d = seoul(Number(t)); return ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2); };
const md = d => (d ? Number(d.slice(5, 7)) + '/' + Number(d.slice(8)) : '');
const ago = t => { const m = Math.max(0, Math.round((Date.now() - Number(t)) / 60000)); return m < 1 ? '방금' : m < 60 ? m + '분 전' : Math.floor(m / 60) + '시간 ' + (m % 60) + '분 전'; };
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

let user = null, admin = null, view = { st: null, busy: false, err: '', at: 0 }, login = { who: 0, err: '', busy: false };
// 11/25 안정화: 화면 뒤에서 하는 저장이 실패하면 '휴대폰 오류 기록'(errors)에 한 줄 — 허브 첫 화면 오류 칸에 보임 (asg_days 6일 동안 모르고 실패한 일 재발 방지)
const errSent = {}; let errN = 0;
function logErr(where, e) {
  try {
    const msg = String((e && (e.code ? e.code + ' ' : '') + (e.message || '')) || e || '').slice(0, 500), k = where + '|' + msg;
    console.warn('[허브 저장 실패]', where, e);
    if (!user || errSent[k] || errN >= 5) return;
    errSent[k] = 1; errN++;
    S.add('errors', { at: S.SERVER_TIME, day: ymd(), uid: user.uid, name: String((admin && admin.label) || '허브').slice(0, 20), ver: VER, where: ('허브 ' + where).slice(0, 40), msg, ua: navigator.userAgent.slice(0, 200) }).done.catch(() => {});
  } catch (x) {}
}

function head() {
  const t = seoul(), d = ymd();
  $('#calm').textContent = Number(d.slice(5, 7)) + '월 · ' + DAYS[t.getUTCDay()];
  $('#cald').textContent = Number(d.slice(8));
  $('#today').textContent = '한화리조트 해운대' + (admin ? ' · ' + admin.label : '');
  const v = admin && view.st, ring = $('#ring'), line = $('#hline');
  const mb = admin ? meal().btnHtml() : '';   // 🍚 오늘 식단 버튼 (11/21: 첫 화면 카드 대신 띠에)
  if (!v) { ring.hidden = true; line.innerHTML = mb; return; }
  const p = progress(v), L = statusItems(v), nb = L.filter(x => x.lv === 'bad').length, nw = L.filter(x => x.lv === 'wait').length;
  ring.hidden = false;
  const C = 150.8, off = p.total ? C * (1 - p.pct / 100) : C;
  ring.innerHTML = '<svg width="56" height="56" viewBox="0 0 58 58"><circle cx="29" cy="29" r="24" stroke="rgba(255,255,255,.14)" stroke-width="6" fill="none"/>' +
    (p.total ? '<circle cx="29" cy="29" r="24" stroke="#E8C77A" stroke-width="6" fill="none" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 29 29)"/>' : '') +
    '</svg><b>' + (p.total ? p.pct + '%' : '-') + '</b>';
  ring.title = '오늘 정비 진행';
  line.innerHTML = '<span><i class="dot' + (nb ? ' bad' : nw ? ' wait' : '') + '"></i>' + (nb ? '확인 필요 ' + nb + '건' : nw ? '주의 ' + nw + '건' : '모두 정상') + '</span>' +
    (p.maids ? '<span>메이드<b>' + p.maids + '</b></span>' : '') +
    (p.total ? '<span>남은 실<b>' + Math.max(0, p.total - p.doneU) + '</b></span>' : '') +
    (p.issue ? '<span>이상<b style="color:#F3B1B9">' + p.issue + '</b></span>' : '') + mb;
}

// ---------- 로그인 (소장 · 부소장 — 레포트 앱과 같은 계정)
function loginHtml() {
  return '<div class="card login"><h2>관리자 로그인</h2>' +
    '<div class="seg">' + ADMINS.map((a, i) => '<button data-who="' + i + '" aria-pressed="' + (login.who === i) + '">' + a.label + '</button>').join('') + '</div>' +
    '<input id="pw" type="password" autocomplete="current-password" placeholder="비밀번호">' +
    (login.err ? '<p class="err">' + esc(login.err) + '</p>' : '') +
    '<button class="big-btn" data-login="1"' + (login.busy ? ' disabled' : '') + '>' + (login.busy ? '확인 중…' : '들어가기') + '</button>' +
    '<p class="note">' + (ADMINS[login.who].hk ? '하우스키퍼 공용 계정 비밀번호예요. 인사 · 연차 화면은 안 보여요.' : '정비 레포트 관리자와 같은 비밀번호예요. 한 번 들어가면 정비 레포트 · 정비 지원도 관리자로 열려요.') + '</p></div>';
}
async function doLogin() {
  const pw = ($('#pw') || {}).value || '';
  if (!pw) { login.err = '비밀번호를 적어 주세요.'; draw(); return; }
  login.busy = true; login.err = ''; draw();
  try { await S.signInEmail(ADMINS[login.who].email, pw); }
  catch (e) { login.err = /network|offline/i.test(String(e && (e.code || e.message))) ? '인터넷 연결을 확인해 주세요.' : '비밀번호가 맞지 않아요.'; }
  login.busy = false; draw();
}

// ---------- 오늘 한눈에 (한 번 읽기)
const safe = p => p.then(x => x, e => ({ __err: String(e && (e.code || e.message) || e) }));
async function load(force) {
  if (!admin || view.busy) return;
  if (!force && view.at && Date.now() - view.at < 120000) return;
  view.busy = true; draw();
  const d = ymd(), tm = ymd(Date.now() + 864e5);
  const hrP = isHk() ? Promise.resolve(null) : hrLoad(d);
  const [up, rl, srl, cmp, sup, day, recs, errs, auto, rs] = await Promise.all([
    safe(S.get('uploads/latest')), safe(S.get('meta/relay')), safe(S.get('sup_meta/relay')), safe(S.get('meta/compare')),
    safe(S.get('sup/' + d)), safe(S.get('days/' + d)),
    safe(S.getQuery('days/' + d + '/recs', [])), safe(S.getQuery('errors', [['day', '==', d]])),
    safe(S.getQuery('sup/' + d + '/auto', [])),   // 2026-11-21: 레포트 방 변경 → 더티 자동 배정 알림 (정비 지원 휴대폰이 씀, 규칙 v22)
    safe(S.get('meta/rsync'))   // 2026-11-21: 📄 정비보고서 연결 상태 (오더테이커 PC 연결 창이 5분마다 남김)
  ]);
  // 오늘 배정 실 수: 그날 정비보고서 저장본(rep_) → 없으면 올림 문서(오늘 것) → 없으면 메이드별 배정(plans)
  let base = await safe(S.get('uploads/rep_' + d));
  if (bad(base) || !Array.isArray(base.rooms)) {
    base = null;
    if (!(up && !up.__err && up.date === d && Number(up.units || up.rooms))) {
      const pl = await safe(S.getQuery('days/' + d + '/plans', []));
      if (Array.isArray(pl) && pl.length) base = { rooms: [].concat(...pl.map(x => (x.data && x.data.rooms) || []).map(rs => rs.map(r => ({ room: r.room, name: 'x' })))) };
    }
  }
  // 연차 신청서 승인 대기 수 (count — 문서를 받지 않음, 1천 건까지 읽기 1건)
  const [hr, lvq, ng, hs] = await Promise.all([hrP, isHk() ? null : safe(S.count('leave_apps', [['status', '==', '대기'], ['deleted', '==', false]])),
    Promise.all([addDays(d, -1), d].map(x => safe(S.get('night/' + x)))), safe(S.get('hksched/cfg'))]);   // hs: 근무 스케줄 새 확정 알림 (11/22)
  // 🔑 플로어키 (2026-11-19): 켜져 있을 때만 오늘 배정 · 변경 · 키 줄 · 대조를 읽음 (꺼져 있으면 meta/keys 1건)
  const kc = await safe(S.get('meta/keys'));
  let ks = null;
  if (kc && !kc.__err && K.enabled(kc, d)) {
    const [pl, ch, kk, kx, tmz, kr] = await Promise.all([safe(S.getQuery('days/' + d + '/plans', [])), safe(S.getQuery('days/' + d + '/changes', [])),
      safe(S.getQuery('days/' + d + '/keys', [])), safe(S.getQuery('days/' + d + '/keychk', [])), safe(S.get('meta/teams')), safe(S.getQuery('days/' + d + '/keyret', []))]);
    if (Array.isArray(kk)) {
      const P = {}; (Array.isArray(pl) ? pl : []).forEach(x => { P[x.id] = (x.data && x.data.rooms) || []; });
      const C = Array.isArray(ch) ? ch : [];
      ks = K.summary({ keys: kk, chk: Array.isArray(kx) ? kx : [], ret: Array.isArray(kr) ? kr : [], mf: K.maidFloors(P, C), mr: K.maidRooms ? K.maidRooms(P, C) : null, recs: Array.isArray(recs) ? recs : null, mate: (tmz && !tmz.__err && tmz.mate) || {} });
    }
  }
  const ls = null, [lt, fb, fl] = await Promise.all([safe(S.getQuery('lost', [['date', '==', d]])), safe(S.get('meta/bday_fn')), safe(S.get('meta/lost_fn'))]);   // + 11/25 서버 함수 실행 기록 (문제일 때만 표시)   // 🧳 습득물: 오늘 접수 (11/25: 서버 처리 대기 수는 허브에 안 띄움 — 대장 '처리 대기' 탭에서)
  const bd = isHk() ? null : await BD.load(S, d);   // 🎂 하루 한 번만 연차 명단을 읽음 (소장 · 부소장)
  view.st = { d, tm, up, rl, srl, cmp, sup, day, recs, errs, base, hr, lvq, ng, kc, ks, auto, rs, bd, ls, lt, hs, fb, fl };
  view.busy = false; view.at = Date.now(); draw();
}
// 더티·정비보조 / 진행 중 활동 — '오늘 정비 → 더티 · 활동' 탭을 열 때만 읽음 (첫 화면에선 안 읽음)
let ex = { rows: null, rm: null, sa: null, req: null, acts: null, at: 0, busy: false, d: '' };
async function loadEx(force) {
  if (!admin || ex.busy) return;
  const d = ymd();
  if (!force && ex.d === d && ex.at && Date.now() - ex.at < 120000) return;
  ex.busy = true; draw();
  // 더티·정비보조: 오늘 기록 줄(체크·근태) / 진행 중 활동: 개수만 세기(count — 체크 문서를 받지 않음)
  const [rows, acts, rm, sa, req] = await Promise.all([safe(S.getQuery('sup/' + d + '/rows', [])), safe(S.getQuery('acts', [['status', '==', '진행']])),
    safe(S.getQuery('sup/' + d + '/rm', [])), supAuto(), safe(S.getQuery('sup/' + d + '/req', []))]);   // 🔔 메이드 더티 요청 (2026-11-21, 규칙 v23)   // 레포트 앱 객실 변경 · 정비 지원 autosup.js (더티 % 를 정비 지원과 같게)
  let actList = acts;
  if (Array.isArray(acts) && acts.length) {
    const ex = await actExcl();
    const t0 = new Date(Date.parse(d + 'T00:00:00+09:00'));
    actList = await Promise.all(acts.filter(a => String(a.id).indexOf('CHECK-') !== 0).map(async a => {
      const x = a.data || {}, c = 'acts/' + a.id + '/marks';
      const [proc, td] = await Promise.all([safe(S.count(c, [['s', 'in', ['완료', '이상']]])), safe(S.count(c, [['s', 'in', ['완료', '이상']], ['at', '>=', t0]]))]);
      const target = ex ? ex.rooms.length - ex.parse(x.exclText || '').length : 0;
      return { id: a.id, name: x.name || a.id, color: x.color || '', due: x.due || '', doneName: x.doneName || '', proc: typeof proc === 'number' ? proc : null, today: typeof td === 'number' ? td : null, target };
    }));
  }
  ex = { rows, rm, sa, req, acts: actList, at: Date.now(), busy: false, d }; draw();
}
function reload(force) { load(force); if (ML && !ML.busy()) ML.load(force); if (route.sec === 'work' && route.tab === 'dirty') loadEx(force); }
function bad(x) { return !x || x.__err; }
function statusItems(v) {
  const L = [], now = Date.now(), H = Number(seoul().toISOString().slice(11, 13));
  const add = (lv, title, sub) => L.push({ lv, title, sub });
  // 정비보고서 올림
  const u = v.up;
  if (u && u.__err) add('bad', '정비보고서 상태를 못 읽었어요', u.__err);
  else if (u && u.date === v.d) {
    if (u.state === 'done') add('ok', '오늘 배정표 반영 완료', hm(u.doneAt) + (u.who ? ' · ' + u.who : '') + (u.rooms ? ' · 객실 ' + u.rooms + '개' : ''));
    else if (u.state === 'wait') add(now - Number(u.at) > 4 * 60000 ? 'bad' : 'wait', now - Number(u.at) > 4 * 60000 ? '배정표 반영이 늦어요' : '배정표 시트에 넣는 중', hm(u.at) + ' 올림 · 중계 상태를 같이 보세요');
    else add('bad', '오늘 배정표 반영 실패', String(u.msg || '') + ' — 정비 레포트에서 다시 올려 주세요');
  } else if (u && u.date === v.tm) add('ok', '내일(' + md(v.tm) + ') 배정표까지 올림', hm(u.doneAt || u.at) + (u.who ? ' · ' + u.who : ''));
  else add(H >= 7 ? 'bad' : 'wait', '오늘 정비보고서가 아직 안 올라왔어요', '정비 레포트 → 배정 → 정비보고서 올리기');
  // 더티 배분
  const sp = v.sup;
  if (sp && sp.__err) add('wait', '더티 배분 상태를 못 읽었어요', sp.__err);
  else if (sp && Array.isArray(sp.plan) && sp.plan.length) {
    const ws = Array.from(new Set(sp.plan.map(x => x && x.w).filter(Boolean)));
    add('ok', '더티 배분 확정', '정비보조 ' + ws.length + '명' + (sp.src === 'app' ? ' · 앱에서 확정' : ''));
  } else add(H >= 9 ? 'bad' : 'wait', '오늘 더티 배분이 아직이에요', '정비 지원 → 📋 더티 배분 만들기');
  // 레포트 방 변경 → 더티 자동 배정 (2026-11-21)
  if (Array.isArray(v.auto) && v.auto.length) {
    const A = v.auto.map(x => x.data || {}), by = k => A.filter(x => x.st === k);
    const line = L2 => L2.map(x => x.maid + ' ' + x.unit + '유닛·' + x.n + '실' + (x.w ? '(' + x.w + ')' : '')).join(', ').slice(0, 200);
    if (by('need').length) add('bad', '더티 지원 필요 ' + by('need').length + '명', line(by('need')) + ' — 근무 중인 정비보조 없음. 출근하면 자동 배정');
    if (by('under').length) add('wait', '방이 줄었는데 더티 지원 중 ' + by('under').length + '명', line(by('under')) + ' — 정비 지원에서 확인');
    if (by('auto').length) add('ok', '방 변경 자동 배정 ' + by('auto').length + '건', by('auto').map(x => x.maid + ' ' + x.msg).join(' / ').slice(0, 300));
  }
  rsItems(v, now, H).forEach(x => L.push(x));
  // 중계 두 개
  [['정비 레포트 시트 중계', v.rl], ['정비 지원 시트 중계', v.srl]].forEach(([nm, r]) => {
    if (bad(r) || !r.at) { add('bad', nm + ' 기록 없음', r && r.__err ? r.__err : '중계가 한 번도 안 돌았어요'); return; }
    const old = now - Number(r.at) > 12 * 60000;
    if (!r.ok) add('bad', nm + ' 오류', String(r.err || '').slice(0, 120));
    else if (old) add('bad', nm + ' 멈춤', '마지막 ' + ago(r.at) + ' — 시트에 기록이 안 옮겨지고 있어요');
    else add('ok', nm + ' 정상', ago(r.at));
  });
  // 대조
  const c = v.cmp;
  if (c && !c.__err && c.day === v.d) {
    if (c.ok) add('ok', '오늘 대조 차이 0건', (c.slot === '수동' ? hm(c.at) + ' 수동' : c.slot + '시') + ' · 앱 ' + c.app + ' = 시트 ' + c.sheet);
    else add('bad', '오늘 대조 차이 ' + c.n + '건', '정비 레포트 → 배정 탭에서 보기');
  }
  // 휴대폰 오류
  const e = v.errs;
  if (Array.isArray(e) && e.length) {
    const who = Array.from(new Set(e.map(x => x.data && x.data.name).filter(Boolean)));
    add('wait', '휴대폰 오류 오늘 ' + e.length + '건', (who.length ? who.slice(0, 4).join(', ') + (who.length > 4 ? ' 외' : '') + ' · ' : '') + '정비 레포트 → 설정에서 보기');
  } else if (Array.isArray(e)) add('ok', '휴대폰 오류 없음', '');
  // 11/25 안정화: 매일 아침 서버 함수(생일 06:00 · 습득물 사진 정리 06:10)가 돌았는지 — 문제일 때만 한 줄 (정상이면 안 보임)
  if (!isHk() && H * 60 + Number(seoul().toISOString().slice(14, 16)) >= 6 * 60 + 40) {
    [['생일 알림', v.fb], ['습득물 사진 정리', v.fl]].forEach(([nm, f]) => {
      if (f && f.__err) return;
      if (!f) return;   // 11/25 소장님 화면: 기록이 아직 없는 건(새로 배포한 날 · 아직 한 번도 안 돈 날) 띄우지 않음 — 한 번이라도 돈 뒤에 멈추면 알림
      if (f.day !== v.d) add('bad', '서버 함수 ' + nm + '이 오늘 안 돌았어요', '마지막 ' + md(f.day) + ' · Firebase 콘솔 → Functions 에서 확인');
      else if (f.fail) add('wait', '서버 함수 ' + nm + ' 일부 실패 ' + f.fail + '건', 'Firebase 콘솔 → Functions → 로그');
    });
  }
  return L;
}
function progress(v) {
  const r = Array.isArray(v.recs) ? v.recs : [], done = {}, issue = {};
  let last = 0;
  r.forEach(x => { const d = x.data || {}; if (d.status === '완료' || d.status === '이상') { done[d.room] = 1; if (d.status === '이상') issue[d.room] = 1; if (Number(d.at) > last) last = Number(d.at); } });
  const u = v.up && !v.up.__err && v.up.date === v.d ? v.up : null;
  let total = 0;
  if (v.base && Array.isArray(v.base.rooms)) { const seen = {}; v.base.rooms.forEach(x => { if (x && x.name && !seen[x.room]) { seen[x.room] = 1; total += ROYAL[x.room] ? 2 : 1; } }); }
  if (!total && u) total = Number(u.units || u.rooms || 0);
  const doneU = Object.keys(done).reduce((s, k) => s + (ROYAL[k] ? 2 : 1), 0);
  const maids = v.day && !v.day.__err && Array.isArray(v.day.maids) ? v.day.maids.length : (u ? u.maids : 0);
  return { total, doneU, pct: total ? Math.min(100, Math.round(doneU * 100 / total)) : 0, issue: Object.keys(issue).length, last, maids, err: v.recs && v.recs.__err };
}
// 활동판 제외 객실 글 → 객실 (정비 지원 act.js 와 같은 규칙을 그대로 씀)
let exP = null;
function actExcl() {
  if (window.actExcl) return Promise.resolve(window.actExcl);
  if (!exP) exP = new Promise(res => { const sc = document.createElement('script'); sc.src = new URL('../dirty/act.js', import.meta.url).href; sc.onload = () => res(window.actExcl || null); sc.onerror = () => { exP = null; res(null); }; document.head.appendChild(sc); });
  return exP;
}
let saP = null;
function supAuto() {
  if (window.SupAuto) return Promise.resolve(window.SupAuto);
  if (!saP) saP = new Promise(res => { const sc = document.createElement('script'); sc.src = new URL('../dirty/autosup.js?v=' + VER, import.meta.url).href; sc.onload = () => res(window.SupAuto || null); sc.onerror = () => { saP = null; res(null); }; document.head.appendChild(sc); });
  return saP;
}
const COLORS = { '하늘색': '#3BA7E0', '민트': '#1FB59A', '연두': '#7CB518', '주황': '#F08C00', '보라': '#8E5CD9', '분홍': '#E0559A' };
function dirtyHtml(v) {
  const sp = v.sup && !v.sup.__err ? v.sup : null, plan = sp && Array.isArray(sp.plan) ? sp.plan : [];
  let h = '<div class="card"><h2>더티 · 정비보조</h2>';
  if (v.rows && v.rows.__err) return h + '<p class="err">정비 지원 기록을 못 읽었어요: ' + esc(v.rows.__err) + '</p></div>';
  const rows = (Array.isArray(v.rows) ? v.rows : []).map(x => x.data || {}).sort((a, b) => Number(a.at || 0) - Number(b.at || 0));
  const att = {};
  rows.forEach(x => {
    const r = Array.isArray(x.row) ? x.row : [];
    if (x.tab === '근태' && r[2] && ['출근', '퇴근', '퇴근취소'].indexOf(r[3]) >= 0) att[r[2]] = r[3];
  });
  const inNow = Object.keys(att).filter(n => att[n] !== '퇴근'), outN = Object.keys(att).filter(n => att[n] === '퇴근');
  // 2026-11-21: 정비 지원 앱 상단 '전체'와 같은 셈 — 아침 배분 + 그날 수량 수정 · 가져옴 · 자동 배정 · 레포트 방 변경, 메이드마다 지원 수량까지만
  const pg = supProgress(sp, v.rows, Array.isArray(v.rm) ? v.rm : [], v.sa, v.d || ymd());
  const total = pg.target, done = pg.done;
  const ws = pg.workers.filter(w => w.target > 0 || w.done > 0).map(w => w.name);
  const pct = total ? Math.min(100, Math.round(done * 100 / total)) : 0;
  if (total) h += '<div class="prog"><div class="big">' + pct + '%<small>더티 ' + done + ' / ' + total + '실</small></div><div class="bar"><i style="width:' + pct + '%;background:linear-gradient(90deg,#9A4708,#D27A2C)"></i></div></div>';
  else h += '<p class="note" style="margin:0 0 10px">' + (plan.length ? '오늘은 더티 지원 객실이 없어요.' : '오늘 더티 배분이 아직이에요.') + (done ? ' 지금까지 더티 완료 ' + done + '실.' : '') + '</p>';
  h += '<div class="kv"><div><b>' + inNow.length + '</b><span>출근 중</span></div><div><b>' + ws.length + '</b><span>더티 담당</span></div><div><b>' + outN.length + '</b><span>퇴근</span></div></div>';
  if (pg.workers.length && total) h += '<p class="note">' + pg.workers.filter(w => w.target > 0).map(w => esc(w.name) + ' ' + w.done + '/' + w.target).join(' · ') + '</p>';
  if (inNow.length) h += '<p class="note">출근: ' + esc(inNow.join(', ')) + '</p>';
  return h + '<button class="big-btn" style="margin-top:12px" data-sup="1">🛏 정비보조별 진행 보기 · 수정 <small style="display:block;font-weight:600;font-size:12.5px;opacity:.8;margin-top:2px">남은 더티 · 대신 체크 · 수량 · 추가 · 근무 종료</small></button>' +
    '<button class="big-btn sec" style="margin-top:10px" data-hdist="1">📋 더티 배분 ' + (plan.length ? '다시 만들기' : '만들기') + '</button></div>';
}
// 🔔 메이드 더티 요청 (2026-11-21): 레포트 앱 sup/{날}/req/{메이드} (오늘 몇 번 · 지난 시각 hist) + 정비 지원 체크 줄로 '몇 분 만에 왔는지'
function dreqStats(req, rows) {
  const ck = (Array.isArray(rows) ? rows : []).map(x => x.data || {}).filter(x => x.tab === '체크' && Array.isArray(x.row) && x.row[5] === '완료')
    .map(x => ({ maid: String(x.row[3] || '').trim(), at: Number(x.at && x.at.toMillis ? x.at.toMillis() : x.at instanceof Date ? x.at.getTime() : x.at) || Date.parse(x.at) || 0 }));
  return (Array.isArray(req) ? req : []).map(d => {
    const x = d.data || {}, names = Array.isArray(x.names) && x.names.length ? x.names : [x.maid];
    const tsOf = v => Number(v && v.toMillis ? v.toMillis() : v instanceof Date ? v.getTime() : v) || 0;
    const ats = (Array.isArray(x.hist) ? x.hist : []).map(tsOf).concat([tsOf(x.at)]).filter(Boolean).sort((a, b) => a - b);
    const waits = ats.map(t => { const c = ck.filter(k => names.indexOf(k.maid) >= 0 && k.at > t).sort((a, b) => a.at - b.at)[0]; return c ? Math.round((c.at - t) / 60000) : null; });
    return { maid: x.maid || d.id, ws: x.ws || [], rooms: x.rooms || [], n: ats.length, last: ats[ats.length - 1] || 0, open: waits[waits.length - 1] === null, waits: waits.filter(w => w !== null) };
  }).filter(r => r.n).sort((a, b) => (b.open - a.open) || (b.last - a.last));
}
function dreqHtml(req, rows) {
  let h = '<div class="card"><h2>🔔 오늘 더티 요청 <small>메이드 → 정비보조</small></h2>';
  if (req && req.__err) return h + '<p class="note" style="margin:0">아직 읽을 수 없어요 (규칙 v23 게시 전).</p></div>';
  const L = dreqStats(req, rows);
  if (!L.length) return h + '<p class="note" style="margin:0">오늘은 아직 요청이 없어요.</p></div>';
  const allW = [].concat(...L.map(r => r.waits)), avg = allW.length ? Math.round(allW.reduce((s, w) => s + w, 0) / allW.length) : null;
  const now = Date.now(), openN = L.filter(r => r.open).length;
  h += '<div class="kv"><div><b>' + L.reduce((s, r) => s + r.n, 0) + '</b><span>요청 수</span></div><div><b>' + L.length + '</b><span>요청한 메이드</span></div><div><b>' + (avg === null ? '-' : avg + '분') + '</b><span>평균 기다림</span></div></div>';
  h += '<div style="margin-top:8px">' + L.map(r => '<div style="display:flex;justify-content:space-between;gap:8px;padding:7px 0;border-top:1px solid var(--line);font-size:14px">' +
    '<span><b>' + esc(r.maid) + '</b> → ' + esc(r.ws.join(', ') || '-') + (r.n > 1 ? ' · <b>' + r.n + '번</b>' : '') + (r.rooms.length ? ' <small class="note">먼저 ' + esc(r.rooms.join(', ')) + '</small>' : '') + '</span>' +
    '<span style="white-space:nowrap;font-weight:800;' + (r.open ? 'color:#C25A00' : 'color:var(--muted)') + '">' + (r.open ? '기다리는 중 ' + Math.max(0, Math.floor((now - r.last) / 60000)) + '분' : hm(r.last) + ' · ' + r.waits[r.waits.length - 1] + '분 만에 옴') + '</span></div>').join('') + '</div>';
  return h + (openN ? '<p class="note">' + openN + '명이 아직 기다리고 있어요. 정비보조가 그 메이드 방을 체크하면 저절로 꺼져요.</p>' : '') + '</div>';
}
function actsHtml(v) {
  let h = '<div class="card"><h2>진행 중 활동 <small>객실 활동판</small></h2>';
  if (v.acts && v.acts.__err) return h + '<p class="err">활동을 못 읽었어요: ' + esc(v.acts.__err) + '</p></div>';
  const L = Array.isArray(v.acts) ? v.acts : [];
  const btn = '<button class="big-btn sec" style="margin-top:12px" data-act="1">🗺 객실 활동판 열기 <small style="font-weight:600;color:var(--muted)">만들기 · 고치기 · 도면 · 출력</small></button>';
  if (!L.length) return h + '<p class="note" style="margin:0">지금 진행 중인 활동이 없어요.</p>' + btn + '</div>';
  h += L.map(a => {
    const pct = a.target && a.proc !== null ? Math.min(100, Math.round(a.proc * 1000 / a.target) / 10) : 0, col = COLORS[a.color] || '#1FB59A';
    return '<div style="padding:8px 0;border-top:1px solid var(--line)"><div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><b style="font-size:15px"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:' + col + ';margin-right:6px"></span>' + esc(a.name) + '</b>' +
      '<span style="font-weight:900;font-variant-numeric:tabular-nums">' + (a.proc === null ? '-' : pct + '%') + '</span></div>' +
      '<div class="bar" style="height:10px;margin:6px 0"><i style="width:' + pct + '%;background:' + col + '"></i></div>' +
      '<span class="note" style="margin:0">' + (a.proc === null ? '개수를 못 셌어요' : a.proc + ' / ' + a.target + '실' + (a.today ? ' · 오늘 +' + a.today : '')) + (a.due ? ' · 목표 ' + esc(md(a.due)) : '') + '</span></div>';
  }).join('');
  return h + btn + '</div>';
}
// ---------- 📥 정비보고서 올리기 (2단계, 2026-11-13)
let up = null, engine = null, upPoll = null;
const FAST = window.__hubFast ? 0.02 : 1;   // 시험에서만 기다림을 짧게
const addDays = (d, n) => ymd(Date.parse(d + 'T12:00:00+09:00') + n * 864e5);
const W = r => (ROYAL[r] ? 2 : 1);
const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
function upDefaultDate() { return seoul().toISOString().slice(11, 16) >= '15:00' ? addDays(ymd(), 1) : ymd(); }
function pickXlsx() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; inp.style.display = 'none';
  inp.addEventListener('change', () => {
    const f = inp.files && inp.files[0]; inp.remove();
    if (!f) return;
    up = { file: f.name, date: upDefaultDate(), res: null, err: '', busy: true, buf: null };
    draw(); scrollUp();
    f.arrayBuffer().then(buf => { if (up && up.file === f.name) { up.buf = buf; return upBuild(); } })
      .catch(e => { if (up) { up.busy = false; up.err = '파일을 읽지 못했어요: ' + (e && e.message || e); draw(); } });
  });
  document.body.appendChild(inp); inp.click();
}
async function upBuild() {
  const u0 = up; u0.busy = true; u0.res = null; u0.err = ''; draw();
  try {
    if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 엑셀 읽기를 지원하지 않아요. PC 크롬이나 최신 휴대폰에서 해 주세요.');
    if (!engine) engine = await import(new URL('../rm/app/engine.js?v=' + VER, import.meta.url).href);
    const res = await engine.buildFromXlsx(u0.buf, u0.date);
    if (up === u0) u0.res = res;
  } catch (e) { if (up === u0) u0.err = String(e && e.message || e); }
  u0.busy = false; if (up === u0) draw();
}
function repDoc(u0, r) {
  const v = x => (x === null || x === undefined ? '' : x);
  return { date: u0.date, csv: '', kind: 'report', sheet: r.sheet, file: String(u0.file).slice(0, 80), at: S.SERVER_TIME, by: user.uid, who: admin.label,
    cards: (r.data.cards || []).map(c => ({ label: String(v(c.label)), name: String(v(c.name)), unit: v(c.unit), actual: v(c.actual) })),
    rooms: (r.data.rooms || []).map(x => { const o = { room: String(x.room), st: v(x.st) }; if (x.name) o.name = String(x.name); return o; }) };
}
function upSend(skipAsk) {
  const u0 = up, r = u0 && u0.res, s = r && r.summary;
  if (!s || u0.sending) return;
  if (!s.ok && !skipAsk && !confirm('검증에서 다른 점이 있어요. 그래도 올릴까요?')) return;
  u0.sending = true; u0.err = ''; draw();
  if (r.data) S.set('uploads/rep_' + u0.date, repDoc(u0, r)).catch(e => logErr('더티배분용 보고서', e));   // 정비 지원 더티 배분용 (실패해도 배정 올리기는 그대로)
  withTimeout(S.set('uploads/latest', { date: u0.date, csv: r.csv, state: 'wait', at: S.SERVER_TIME, by: user.uid, who: admin.label, file: String(u0.file).slice(0, 80),
    sheet: r.sheet, maids: s.maids, rooms: s.rooms, units: s.units, ok: s.ok }), 20000, '인터넷 연결을 확인하고 다시 눌러 주세요.')
    .then(() => { up = { sent: { date: u0.date, at: Date.now() } }; draw(); watchUp(); },
      e => { if (up === u0) { u0.sending = false; u0.err = '올리지 못했어요: ' + (e && (e.code || e.message) || e); draw(); } });
}
// 올린 뒤: 중계가 끝날 때까지 uploads/latest 문서 하나만 20초마다 다시 읽음 (최대 5분)
function watchUp() {
  clearTimeout(upPoll);
  const t0 = Date.now();
  const tick = async () => {
    if (!up || !up.sent) return;
    const u = await safe(S.get('uploads/latest'));
    if (u && !u.__err && view.st) view.st.up = u;
    if (u && !u.__err && u.date === up.sent.date && u.state && u.state !== 'wait') { up.sent.done = u.state; up.sent.msg = u.msg || ''; draw(); load(true); return; }
    draw();
    if (Date.now() - t0 < 5 * 60000 * FAST) upPoll = setTimeout(tick, 20000 * FAST); else { up.sent.slow = true; draw(); }
  };
  upPoll = setTimeout(tick, 15000 * FAST);
}
function scrollUp() { setTimeout(() => { const el = document.getElementById('upcard'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50); }
function upPerMaid(rows) {
  const c = {}, o = []; rows.forEach(r => { if (!(r[1] in c)) { c[r[1]] = 0; o.push(r[1]); } c[r[1]] += W(r[2]); });
  return o.map(n => esc(n) + ' ' + c[n]).join(' · ');
}
function upHtml() {
  let h = '<div class="card" id="upcard"><h2>📥 정비보고서 올리기 <small>메이드 배정 · 더티 배분 자료 한 번에</small></h2>';
  if (!up) {
    return h + '<button class="big-btn" data-up="pick">정비보고서 파일 고르기</button>' +
      '<p class="note">엑셀(.xlsx)을 고르면 이 기기에서 배정표를 만들어 확인 화면을 보여 줘요. 올리면 1~2분 안에 메이드 휴대폰에 들어가고, 정비 지원 더티 배분은 파일 없이 불러와요.</p></div>';
  }
  if (up.sent) {
    const x = up.sent, d = md(x.date);
    if (x.done === 'done') h += '<p class="okbox">✅ ' + esc(d) + ' 배정표 반영 완료' + (x.msg ? ' · ' + esc(x.msg) : '') + '</p>' +
      '<button class="big-btn" data-hdist="1">🛏 다음: 더티 배분 만들기</button>';
    else if (x.done) h += '<p class="err">❌ ' + esc(d) + ' 배정표 반영 실패 · ' + esc(x.msg) + ' — 파일을 확인하고 다시 올려 주세요.</p>';
    else h += '<p class="waitbox">⏳ ' + esc(d) + ' 배정표를 올렸어요. 시트에 넣는 중 (1~2분)…' + (x.slow ? '<br><b>5분 넘게 걸려요 — 위 중계 상태를 확인해 주세요.</b>' : '') + '</p>';
    return h + '<button class="big-btn sec" style="margin-top:10px" data-up="reset">' + (x.done === 'done' ? '다른 파일 올리기' : '닫기') + '</button></div>';
  }
  const r = up.res, s = r && r.summary, t0 = ymd(), t1 = addDays(t0, 1), v = view.st || {};
  h += '<p class="note" style="margin:0 0 8px">📄 ' + esc(up.file) + '</p><div class="seg2">' +
    [[t0, '오늘'], [t1, '내일']].map(([d, l]) => '<button data-upd="' + d + '" aria-pressed="' + (up.date === d) + '">' + l + ' ' + md(d) + '</button>').join('') + '</div>';
  if (up.busy) h += '<p class="note">엑셀을 읽는 중…</p>';
  if (up.err) h += '<p class="err" style="margin-top:10px">' + esc(up.err) + '</p>';
  if (s) {
    h += '<div class="upsum"><p><b>' + esc(r.sheet) + '일 시트</b> · 메이드 <b>' + s.maids + '명</b> · 객실 <b>' + s.rooms + '개</b> = ' + s.units + '실 (로얄 2실)</p>' +
      '<ul class="upchk">' + s.checks.map(c => '<li class="' + (c.ok ? 'ok' : 'no') + '">' + (c.ok ? '✅ ' : '❌ ') + esc(c.msg) + '</li>').join('') + '</ul>' +
      '<p class="note">' + Object.keys(s.tags).sort((a, b) => s.tags[b] - s.tags[a]).map(k => esc(k) + ' ' + s.tags[k]).join(' · ') + '</p>' +
      (s.groups.length ? '<p class="note">단체: ' + s.groups.map(g => esc(g.name) + '(' + g.rooms + '실' + (g.time ? ', 입실 ' + esc(g.time) : '') + ')').join(' / ') + '</p>' : '') +
      (s.due.length ? '<p class="note">시간 지정: ' + s.due.map(x => esc(x.room) + '(' + esc(x.maid) + ') ' + esc(x.due)).join(', ') + '</p>' : '') +
      '<details><summary>메이드별 객실 수</summary><p class="note">' + upPerMaid(r.rows) + '</p></details></div>';
    if (!s.ok) h += '<div class="warnbox"><b>검증에서 다른 점이 있어요.</b> 정비보고서를 확인하고 고친 뒤 다시 올리는 게 좋아요.</div>';
    const nrec = Array.isArray(v.recs) ? v.recs.filter(x => x.data && (x.data.status === '완료' || x.data.status === '이상')).length : 0;
    if (up.date === t0 && nrec) h += '<div class="warnbox">오늘 이미 완료 기록이 ' + nrec + '건 있어요. 배정이 바뀌어도 <b>완료 기록은 그대로</b> 남아요.</div>';
    const u = v.up && !v.up.__err ? v.up : null;
    if (u && u.date === up.date && u.state === 'done') h += '<p class="note">' + esc(md(up.date)) + ' 배정표는 ' + esc(hm(u.doneAt)) + '에 이미 올렸어요' + (u.who ? ' (' + esc(u.who) + ')' : '') + '. 올리면 새 파일로 바뀌어요.</p>';
  }
  h += '<div class="btn2"><button class="big-btn sec" data-up="reset">취소</button><button class="big-btn' + (s && !s.ok ? ' danger' : '') + '" data-up="send"' + (!s || up.sending ? ' disabled' : '') + '>' +
    (up.sending ? '올리는 중…' : s && !s.ok ? '그래도 올리기' : '앱에 올리기') + '</button></div>';
  return h + '</div>';
}
// ---------- 🛏 더티 배분 만들기 (2단계 ②) — 정비 지원 dist.js 가 쓰는 SupShim.dist · window.plan 을 허브에서 채워 줌
const distOther = {};
let distP = null, distWatch = null;
function loadScript(src) { return new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = src; sc.onload = res; sc.onerror = () => rej(new Error('화면 파일을 못 불러왔어요: ' + src.split('/').pop())); document.head.appendChild(sc); }); }
// 근태 줄 → { 이름: {in, out, task} } (정비 지원 server.js attReduce_ 와 같은 규칙: 아래 줄이 위 줄을 덮음)
function attOf(rows) {
  const out = {};
  rows.map(x => x.data || {}).filter(x => x.tab === '근태' && Array.isArray(x.row)).sort((a, b) => Number(a.at || 0) - Number(b.at || 0)).forEach(x => {
    const r = x.row, nm = String(r[2] || '').replace(/\s+/g, ' ').trim(), kind = String(r[3] || '').trim();
    if (!nm) return;
    const at = String(r[7] || '').replace(/^'/, '').trim() || hm(x.at);
    const a = out[nm] = out[nm] || { name: nm, in: '', out: '', task: '', memo: '' };
    if (kind === '출근') { a.in = at; if (r[4]) { a.task = String(r[4]); a.memo = String(r[5] || ''); } }
    else if (kind === '퇴근') a.out = at;
    else if (kind === '퇴근취소') a.out = '';
    else if (kind === '출근취소') { a.in = ''; a.out = ''; a.task = ''; a.memo = ''; }
    else if (kind === '업무' && r[4]) { a.task = String(r[4]); a.memo = String(r[5] || ''); }
  });
  return out;
}
async function openDist() {
  if (!admin) return;
  const btns = document.querySelectorAll('[data-hdist]'); btns.forEach(b => { b.disabled = true; b.textContent = '여는 중…'; });
  try {
    const d = ymd();
    const [names, roster, sup, rows] = await Promise.all([safe(S.get('sup_meta/names')), safe(S.get('sup_meta/roster')), safe(S.get('sup/' + d)),
      ex.d === d && Array.isArray(ex.rows) ? Promise.resolve(ex.rows) : safe(S.getQuery('sup/' + d + '/rows', []))]);
    if (sup && !sup.__err) distOther[d] = sup;
    const known = () => {
      const r = roster && !roster.__err ? roster : {}, hide = {}, out = {};
      (Array.isArray(r.hide) ? r.hide : []).forEach(n => { hide[n] = 1; });
      ((names && !names.__err && names.names) || []).concat(Array.isArray(r.add) ? r.add : []).forEach(n => { n = String(n || '').trim(); if (n && !hide[n] && n !== '관리자') out[n] = 1; });
      return Object.keys(out).sort();
    };
    const pd = x => (x && Array.isArray(x.plan) && x.plan.length ? x : null);
    window.plan = { att: attOf(Array.isArray(rows) ? rows : []), workers: [], known: known(), noPlan: !pd(distOther[d]) };
    window.SupShim = window.SupShim || {};
    window.SupShim.ver = VER;
    window.SupShim.dist = {
      isAdmin: () => !!admin,
      today: () => ymd(),
      shift: (x, n) => addDays(x, n),
      planDoc: x => pd(distOther[x]),
      fetchPlan: x => S.get('sup/' + x).then(v => { distOther[x] = v; return v; }),
      fetchReport: x => S.get('uploads/rep_' + x),
      knownNames: known,
      getCfg: () => S.get('sup_meta/distcfg'),
      setCfg: c => S.set('sup_meta/distcfg', { rule: c.rule, at: S.SERVER_TIME, uid: user.uid }),
      savePlan: (x, plan, meta) => {
        if (!admin) return Promise.reject(new Error('관리자 로그인이 필요해요'));
        const sig = 'app:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        distOther[x] = { date: x, plan, sig, src: 'app', meta };
        return S.set('sup/' + x, { date: x, plan, sig, src: 'app', meta, by: admin.label, uid: user.uid, issued: S.SERVER_TIME, at: S.SERVER_TIME });
      }
    };
    if (typeof window.render !== 'function') window.render = function () {};
    if (!distP) distP = loadScript(new URL('../dirty/distcalc.js?v=' + VER, import.meta.url).href).then(() => loadScript(new URL('../dirty/dist.js?v=' + VER, import.meta.url).href));
    await distP;
    window.SupDist.open();
    clearInterval(distWatch);
    distWatch = setInterval(() => { if (!document.getElementById('dz')) { clearInterval(distWatch); reload(true); } }, 700);   // 닫으면 오늘 한눈에 다시 읽기
  } catch (e) {
    distP = null;
    alert('더티 배분 화면을 못 열었어요: ' + (e && e.message || e) + '\n인터넷을 확인하고 다시 눌러 주세요.');
  }
  draw();
}
// ---------- 🗺 객실 활동판 (2단계 ④) · 🛏 정비보조별 진행 보기·수정 (2026-11-21: 같은 창에 정비 지원 관리자 탭 ?hub=sup)
const ACT_T = { act: '🗺 객실 활동판', sup: '🛏 정비보조별 진행' };
function openAct(kind) {
  kind = ACT_T[kind] ? kind : 'act';
  if (!admin || document.getElementById('actp')) return;
  const p = document.createElement('div'); p.className = 'vp'; p.id = 'actp'; p.style.overflow = 'hidden';
  p.innerHTML = '<div class="act-bar"><b>' + ACT_T[kind] + '</b><span id="actmsg">여는 중…</span><button class="vp-x" data-actclose="1" aria-label="닫기">✕</button></div>' +
    '<iframe id="actf" title="' + ACT_T[kind] + '" src="' + new URL('../dirty/?hub=' + kind, import.meta.url).href + '"></iframe>';
  document.body.appendChild(p); document.body.classList.add('sb-lock');
  const f = p.querySelector('iframe'); f.addEventListener('load', () => { const m = document.getElementById('actmsg'); if (m) m.textContent = ''; });
}
function actLogin() {
  const f = document.getElementById('actf'), w = f && f.contentWindow;
  try {
    if (!w || typeof w.openDlg !== 'function') throw new Error('no');
    w.openDlg('pin', { pin: '', who: admin && admin.hk ? '하우스키퍼' : admin && /부소장/.test(admin.label) ? '부소장' : '소장' });
    const m = document.getElementById('actmsg'); if (m) m.textContent = '아래 창에 비밀번호를 넣어 주세요';
    const t0 = Date.now(), iv = setInterval(() => {
      let ok = false; try { ok = !!(f.contentWindow && f.contentWindow.adminTok); } catch (e) {}
      if (ok) { clearInterval(iv); const mm = document.getElementById('actmsg'); if (mm) mm.textContent = '여는 중…'; f.src = f.src; }   // 로그인되면 다시 열어서 활동판으로
      else if (Date.now() - t0 > 180000 || !document.getElementById('actf')) clearInterval(iv);
    }, 500);
  } catch (e) { window.open(new URL('../dirty/', import.meta.url).href, '_blank'); const m = document.getElementById('actmsg'); if (m) m.textContent = '새 창의 정비 지원에서 「관리자로 보기」로 로그인한 뒤, 이 창을 닫고 다시 열어 주세요'; }
}
function closeAct() { const p = document.getElementById('actp'); if (!p) return; p.remove(); document.body.classList.remove('sb-lock'); reload(true); }
window.addEventListener('message', e => {
  if (e.origin !== location.origin || !e.data || !e.data.hub) return;
  if (e.data.hub === 'close') closeAct();
  if (e.data.hub === 'supok') { const m = document.getElementById('actmsg'); if (m) m.textContent = '정비보조 이름 탭을 누르면 대신 체크해요'; }
  if (e.data.hub === 'noadmin') {
    // 정비 지원은 로그인을 따로 보관(Firebase 앱 'sup') → 비밀번호를 바꾸면 거기 로그인만 풀려 있음 (2026-11-19). 이 창 안에서 바로 다시 로그인
    const m = document.getElementById('actmsg');
    if (m) m.innerHTML = '정비 지원 관리자 로그인이 풀려 있어요 <button class="act-login" data-actlogin="1">관리자 로그인</button>';
    const r = document.getElementById('rmmsg'); if (r) r.textContent = '정비 레포트 관리자 확인이 안 돼요 — 닫고 다시 열어 주세요';
  }
});
// ---------- 정비 레포트 관리자 화면을 허브 안에서 (2026-11-18-5)
const RM_T = { today: '👩 메이드별 현황', assign: '🔁 배정 변경 · 대조', set: '📱 현장 관리' };
function rmCardHtml() {
  return '<div class="card"><h2>메이드별 · 배정 변경 <small>정비 레포트 관리자와 같은 화면</small></h2>' +
    '<p class="note" style="margin:0 0 12px">메이드별 진행 · 시간 정해진 객실 · 단체 · 객실 메모를 보고, 메이드 화면으로 들어가 대신 처리해요. 배정 변경에서는 추가 · 제외 · 교환 내역과 시트 대조를 봐요.</p>' +
    '<div class="btn2"><button class="big-btn" data-rm="today">👩 메이드별 현황</button><button class="big-btn sec" data-rm="assign">🔁 배정 변경 · 대조</button></div></div>';
}
let NT = null;
function fieldHtml() {
  if (!NT) NT = setupNotice({ S, esc, ymd, addDays, md, draw: () => draw(), who: () => (admin ? admin.label : '') });
  return NT.html() + fieldRmHtml();
}
function fieldRmHtml() {
  const e = view.st && Array.isArray(view.st.errs) ? view.st.errs.length : 0;
  return '<div class="card"><h2>📱 현장 관리 <small>정비 레포트 관리자와 같은 화면</small></h2>' +
    '<ul class="st" style="margin:0 0 12px">' + [['📢', '공지 확인', '공지별로 누가 아직 확인 안 했는지'], ['👫', '2인 1조', '부부 메이드 짝 정하기'], ['📲', '휴대폰 등록', '메이드 휴대폰 등록 보기 · 잘못 등록한 것 해제'],
      ['📵', '휴대폰 오류', e ? '오늘 ' + e + '건 있어요' : '오늘 없음']].map(x => '<li class="' + (x[1] === '휴대폰 오류' && e ? 'wait' : '') + '"><span style="font-size:17px">' + x[0] + '</span><div><b>' + x[1] + '</b><span>' + esc(x[2]) + '</span></div></li>').join('') + '</ul>' +
    '<button class="big-btn" data-rm="set">현장 관리 열기</button>' +
    '<p class="note">연차 · 휴대폰 승인은 📋 연차 관리에서 해요.</p></div>';
}
function openRm(tab) {
  if (!admin || document.getElementById('rmp') || !RM_T[tab]) return;
  const p = document.createElement('div'); p.className = 'vp'; p.id = 'rmp'; p.style.overflow = 'hidden';
  p.innerHTML = '<div class="act-bar"><b>' + RM_T[tab] + '</b><span id="rmmsg">여는 중…</span><button class="vp-x" data-rmclose="1" aria-label="닫기">✕</button></div>' +
    '<iframe id="rmf" title="' + RM_T[tab] + '" src="' + new URL('../rm/?hub=' + tab, import.meta.url).href + '"></iframe>';
  document.body.appendChild(p); document.body.classList.add('sb-lock');
  try { history.pushState({ rmp: 1 }, ''); } catch (e) {}   // 휴대폰 '뒤로' = 이 창 닫기
  p.querySelector('iframe').addEventListener('load', () => { const m = document.getElementById('rmmsg'); if (m) m.textContent = ''; });
}
function closeRm() { if (history.state && history.state.rmp) { history.back(); return; } closeRmNow(); }   // ✕ = 뒤로와 같게 (기록 한 칸 정리)
window.addEventListener('popstate', () => { if (document.getElementById('rmp') && !(history.state && history.state.rmp)) closeRmNow(); });
function closeRmNow() { const p = document.getElementById('rmp'); if (!p) return; p.remove(); document.body.classList.remove('sb-lock'); reload(true); }   // 닫으면 정비 레포트 구독도 같이 끊김
// ---------- 📣 고객만족도 VOC (2단계 ③)
let VOC = null, vocOpen = false, vocToast = null;
function vocSay(msg) {
  let t = document.getElementById('vptoast');
  if (!t) { t = document.createElement('div'); t.id = 'vptoast'; t.className = 'vp-toast'; document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false; clearTimeout(vocToast); vocToast = setTimeout(() => { t.hidden = true; }, 3500);
}
function vocDraw() {
  const box = document.getElementById('vocin'); if (!box || !vocOpen || !VOC) return;
  const sc = document.getElementById('vp'), y = sc ? sc.scrollTop : 0;
  const ae = document.activeElement, keep = ae && ae.id === 'voctxt' ? { a: ae.selectionStart, b: ae.selectionEnd, st: ae.scrollTop } : null;   // 글 붙여넣는 중에 다시 그려져도 커서 유지
  box.innerHTML = VOC.html();
  if (sc) sc.scrollTop = y;
  if (keep) { const el = document.getElementById('voctxt'); if (el) { el.focus(); try { el.setSelectionRange(keep.a, keep.b); } catch (e) {} el.scrollTop = keep.st; } }
}
async function openVoc() {
  if (!admin) return;
  try {
    if (!VOC) {
      const m = await import(new URL('../rm/app/voc.js?v=' + VER, import.meta.url).href);
      VOC = m.setupVoc({ S, esc, say: vocSay, today: () => ymd(), update: vocDraw, render: vocDraw, isAdm: () => !!admin && vocOpen, who: () => (admin ? admin.label : '') });
    }
  } catch (e) { alert('VOC 화면을 못 불러왔어요: ' + (e && e.message || e)); return; }
  vocOpen = true;
  const p = document.createElement('div'); p.className = 'vp'; p.id = 'vp';
  p.innerHTML = '<div class="vp-in"><div class="vp-head"><h2>📣 고객만족도 VOC</h2><button class="vp-x" data-vclose="1" aria-label="닫기">✕</button></div><div id="vocin"></div></div>';
  document.body.appendChild(p); document.body.classList.add('sb-lock');
  vocDraw();
}
function closeVoc() {
  vocOpen = false;
  try { VOC && VOC.stop(); } catch (e) {}   // 닫으면 voc 구독도 끊음 (읽기 아끼기)
  const p = document.getElementById('vp'); if (p) p.remove(); document.body.classList.remove('sb-lock');
}
async function openAssignUI(view) {
  try { const m = await import(new URL('./assignui.js?v=' + VER, import.meta.url).href); m.openAssign({ S, esc, ymd, addDays, md, logErr, admin: () => admin, user: () => user, upload: o => { up = { file: o.file, date: o.date, res: o.res, buf: null }; goSec('work', 'up'); draw(); upSend(true); scrollUp(); } }, { view }); }
  catch (e) { alert('자동 배정 화면을 못 불러왔어요: ' + (e && e.message || e)); }
}
// 📝 배정 의견 (2026-11-19): 하우스맨 의견 → 매일 오전 10시 점검이 답 (asgnote.js · asg_notes)
async function openAsgNotes() {
  try { const m = await import(new URL('./asgnote.js?v=' + VER, import.meta.url).href); m.openNotes({ S, esc, ymd, addDays, md, admin: () => admin, user: () => user }); }
  catch (e) { alert('배정 의견 화면을 못 불러왔어요: ' + (e && e.message || e)); }
}
function assignCardHtml() {
  return '<div class="card"><h2>🧩 자동 배정 <small>시험 · 하우스키퍼와 대조</small></h2><p class="note" style="margin:0 0 12px">정비보고서 초안(또는 하우스키퍼 완성본)을 넣고 출근자·인계 유닛을 맞추면 엔진이 배정안을 만들어요. 완성본을 넣으면 하우스키퍼 배정과 바로 비교해요. 아직 메이드 휴대폰에는 안 올라가요.</p>' +
    '<div class="btn2"><button class="big-btn" data-asg="1">자동 배정 열기</button><button class="big-btn sec" data-asg="blocks">🚧 장기 미정비</button></div>' +
    '<button class="big-btn sec" style="margin-top:8px" data-asg="notes">📝 배정 의견 · 답 보기</button></div>';
}
// 🔍 객실 인스펙션 (2026-11-15 ① 새 구조) — 따로 쪽(insp/): 찍고 → 사진마다 지적 → 카톡 한 장 이미지. 점검자 공용 계정도 들어옴
function inspCardHtml() {
  return '<div class="card"><h2>🔍 객실 인스펙션</h2><p class="note" style="margin:0 0 12px">사진을 찍고 사진마다 지적 한 줄 → 수정완료/재정비 → 카톡에 사진+글 한 장 이미지로 공유. 메이드별 지적이 쌓여요. 파트장·하우스맨은 점검자 공용 비밀번호로 같은 주소에 들어와요.</p>' +
    '<a class="big-btn linkbtn" href="./insp/">인스펙션 열기</a></div>';
}
function vocCardHtml() {
  return '<div class="card"><h2>📣 고객만족도 VOC</h2><p class="note" style="margin:0 0 12px">카톡으로 받은 고객만족도 공유 글을 붙여넣으면 건별로 나누고 마지막 정비자를 찾아 메이드별 칭찬·불만 누계를 내요. 정비 레포트 VOC 메뉴와 같은 자료예요.</p>' +
    '<button class="big-btn" data-voc="1">VOC 열기</button></div>';
}
function statusHtml() {
  const v = view.st;
  let h = '<div class="card"><h2>오늘 한눈에 <button class="ref" data-ref="1">' + (view.busy ? '읽는 중…' : '↻ 새로 고침') + '</button></h2>';
  if (!v) return h + '<p class="note" style="margin:0">읽는 중…</p></div>';
  const L = statusItems(v), nb = L.filter(x => x.lv === 'bad').length, nw = L.filter(x => x.lv === 'wait').length;
  h += '<div class="sum">' + (nb ? '<span class="pill bad">확인 필요 ' + nb + '</span>' : '') + (nw ? '<span class="pill wait">주의 ' + nw + '</span>' : '') +
    (!nb && !nw ? '<span class="pill ok">모두 정상</span>' : '') + '<span class="pill" style="background:var(--tile);color:var(--muted)">' + hm(view.at) + ' 기준</span></div>';
  h += '<ul class="st">' + L.sort((a, b) => ({ bad: 0, wait: 1, ok: 2 }[a.lv] - { bad: 0, wait: 1, ok: 2 }[b.lv])).map(x =>
    '<li class="' + x.lv + '"><span style="font-size:17px;color:inherit">' + (x.lv === 'bad' ? '❗' : x.lv === 'wait' ? '⏳' : '✅') + '</span><div><b>' + esc(x.title) + '</b>' + (x.sub ? '<span>' + esc(x.sub) + '</span>' : '') + '</div></li>').join('') + '</ul></div>';
  return h;
}
function progHtml() {
  const v = view.st;
  if (!v) return '';
  const p = progress(v);
  let h = '<div class="card"><h2>오늘 정비 진행 <small>' + (p.last ? '마지막 완료 ' + hm(p.last) : '') + '</small></h2>';
  if (p.err) h += '<p class="err">완료 기록을 못 읽었어요: ' + esc(p.err) + '</p>';
  if (!p.total) return h + '<p class="note" style="margin:0">오늘 정비보고서가 올라오면 진행률이 나와요. 지금까지 완료 ' + p.doneU + '실.</p></div>';
  return h + '<div class="prog"><div class="big">' + p.pct + '%<small>' + p.doneU + ' / ' + p.total + '실</small></div><div class="bar"><i style="width:' + p.pct + '%"></i></div></div>' +
    '<div class="kv"><div><b>' + (p.total - p.doneU > 0 ? p.total - p.doneU : 0) + '</b><span>남은 실</span></div><div><b>' + (p.maids || '-') + '</b><span>근무 메이드</span></div><div><b>' + p.issue + '</b><span>이상 보고</span></div></div>' +
    '<p class="note">정비보고서 올린 배정 기준이에요 (근무 중 추가·제외는 빠짐). 메이드별로는 정비 레포트 → 오늘 현황에서 봐요.</p></div>';
}
function exHtml() {
  const v = view.st;
  if (!ex.at || ex.d !== ymd()) return '<div class="card"><h2>더티 · 정비보조</h2><p class="note" style="margin:0">읽는 중…</p></div>';
  return dirtyHtml(Object.assign({}, v || {}, { rows: ex.rows, rm: ex.rm, sa: ex.sa })) + dreqHtml(ex.req, ex.rows) + actsHtml({ acts: ex.acts });
}
// ---------- 🧾 입퇴사 진행 (2026-11-18, 입퇴사 서류 부분 연결)
// 입퇴사 앱(HrStaff.gs)이 1시간마다 staff/{id} 로 보내는 기본 정보만 씀. 서류·주민번호·사진은 입퇴사 앱에만 있음
// 읽기 아끼기: 명단 전체를 받지 않고 '입사 진행'인 분 + 퇴사일이 최근 30일 이후인 분만 골라 읽음
const HR_URL = '../unies-contract/';
// 🙈 입퇴사 서류 버튼 잠시 숨김 (11/27 소장님: 모두 비노출, 소장님도) — 다시 보이게 할 땐 false 로
const HR_HIDE = true;
function hrLoad(d) {
  return Promise.all([
    safe(S.getQuery('staff', [['status', '==', '입사 진행']])),
    safe(S.getQuery('staff', [['left', '>=', addDays(d, -30)]]))
  ]).then(([a, b]) => {
    if (a && a.__err) return a;
    if (b && b.__err) return b;
    const one = x => Object.assign({ id: x.id }, x.data || {});
    const join = a.map(one).sort((x, y) => String(x.hired || '9').localeCompare(String(y.hired || '9')));
    const lv = b.map(one).filter(p => p.status !== '퇴사' && p.left);
    return {
      join,
      soon: lv.filter(p => p.left >= d).sort((x, y) => x.left.localeCompare(y.left)),
      past: lv.filter(p => p.left < d).sort((x, y) => x.left.localeCompare(y.left))
    };
  });
}
function hrHtml(v) {
  const open = HR_HIDE ? '' : '<a class="big-btn sec linkbtn" style="margin-top:12px" href="' + HR_URL + '" target="_blank" rel="noopener">🧾 입퇴사 서류 열기 <small style="font-weight:600;color:var(--muted);margin-left:6px">새 창</small></a>' +
    '<p class="note">안 열리고 「현재 파일을 열 수 없습니다」가 나오면, 크롬 <b>시크릿 창</b>이나 <b>「해운대객실」 프로필</b>에서 열어 주세요. (크롬에 구글 계정이 여러 개 로그인돼 있으면 생기는 문제예요)</p>';
  let h = '<div class="card"><h2>🧾 입퇴사 진행 <small>1시간마다 갱신</small></h2>';
  const r = v.hr;
  if (!r) return h + '<p class="note" style="margin:0">읽는 중…</p>' + open + '</div>';
  if (r.__err) return h + '<p class="err">직원 명단을 못 읽었어요: ' + esc(r.__err) + '</p>' + open + '</div>';
  const d = v.d, dd = x => { const n = Math.round((Date.parse(x + 'T00:00:00Z') - Date.parse(d + 'T00:00:00Z')) / 864e5); return n === 0 ? '오늘' : n > 0 ? n + '일 남음' : -n + '일 지남'; };
  const row = (p, sub) => '<li><b>' + esc(p.name || '(이름 없음)') + '</b><span>' + esc([p.job, sub].filter(Boolean).join(' · ')) + '</span></li>';
  h += '<div class="kv"><div><b>' + r.join.length + '</b><span>입사 진행</span></div><div><b>' + r.soon.length + '</b><span>퇴사 예정</span></div>' +
    '<div' + (r.past.length ? ' style="background:var(--wait-soft)"' : '') + '><b' + (r.past.length ? ' style="color:var(--wait)"' : '') + '>' + r.past.length + '</b><span>퇴사일 지남</span></div></div>';
  if (!r.join.length && !r.soon.length && !r.past.length) h += '<p class="note">입사 진행 중이거나 퇴사 예정인 분이 없어요. 입퇴사 서류 앱의 바뀐 내용은 1시간 안에 여기 나와요.</p>';
  if (r.join.length) h += '<h3 class="hrh">입사 진행 <small>서류 링크를 보냈고 아직 제출 전</small></h3><ul class="hrl">' + r.join.map(p => row(p, p.hired ? '입사 ' + md(p.hired) : '')).join('') + '</ul>';
  if (r.soon.length) h += '<h3 class="hrh">퇴사 예정</h3><ul class="hrl">' + r.soon.map(p => row(p, '퇴사 ' + md(p.left) + ' (' + dd(p.left) + ')')).join('') + '</ul>';
  if (r.past.length) h += '<h3 class="hrh" style="color:var(--wait)">퇴사일 지남 <small>아직 재직으로 남아 있어요</small></h3><ul class="hrl">' + r.past.map(p => row(p, '퇴사 ' + md(p.left) + ' (' + dd(p.left) + ')')).join('') + '</ul><p class="note" style="margin-top:6px">입퇴사 서류 앱에서 퇴사 처리를 마치면 다음 갱신 때 빠져요.</p>';
  return h + open + '</div>';
}
// 🛎️ 하우스키퍼 (11/21): 첫 화면 칸 → 안쪽에서 야간 업무 보고서 · 근무 스케줄 보기(11/22, sched/view.html) · 근무 스케줄 편성(sched/, 소장·부소장에게만 보임) · 연차 현황 고르기 (다른 칸과 같은 방식)
// 🗓️ 근무 스케줄이 새로 확정됐는데 이 휴대폰에서 아직 안 열어 봤으면 NEW (보기 화면 sched/view.html 이 열 때 hksv_seen 을 적음)
function schedNew(v) {
  const lc = v && v.hs && !v.hs.__err && v.hs.lastConf;
  let seen = 0; try { seen = Number(localStorage.getItem('hksv_seen') || 0); } catch (e) {}
  return lc && Number(lc.at) > seen ? lc : null;
}
function hkSecHtml() {
  const n = view.st ? nightWait(view.st).length : 0, sn = schedNew(view.st);
  return '<div class="card"><h2>무엇을 열까요?</h2><div class="go-grid">' +
    // 📣 HK 배정 · 인계사항 (11/25): 첫 화면 칸 대신 하우스키퍼 칸 안에만 (하우스키퍼 계정은 보기 전용 · rmsched_hk 규칙 v30)
    '<a class="go" href="./rmsched/#hk"><span class="ic">📣</span><b>HK 배정 · 인계사항</b><span>방배정 · 정비 예상 · 정비보조 명단 · 야간조 인계 (실시간' + (isHk() ? ', 보기 전용)' : ')') + '</span></a>' +
    '<a class="go" href="./hkho/"><span class="ic">📝</span><b>하우스키핑 인수인계</b><span>주간 · 야간 인계 · 이어받은 일 · 난방 · 지시등 · 기간 공지</span></a>' +   // 11/26 엑셀 인수인계서 → 앱
    '<a class="go" href="./jbr/" data-jbrwin="1"><span class="ic">📋</span><b>정비보고서</b><span>객실 현황 · 입력 · 결산 4종 — 노트북은 따로 새 창</span></a>' +   // 11/26 정비보고서 앱 1단계 · 11/27 노트북은 새 창(오더테이커가 다른 메뉴 안 건드리게)
    '<a class="go" href="./night/"><span class="ic">🌙</span><b>야간 업무 보고서' + (n ? ' <i class="hm-bd wait" style="position:static;margin-left:4px">확인 ' + n + '</i>' : '') + '</b><span>야간 근무 보고 · 확인 · 인쇄</span></a>' +
    (admin && !isHk() ? '<a class="go" href="./sched/"><span class="ic">✏️</span><b>근무 스케줄 편성</b><span>편성 · 수정 · 확정 · 엑셀 · 인쇄</span></a>' : '') +
    '<a class="go" href="./sched/view.html' + (sn ? '#' + sn.ym : '') + '" style="position:relative"><span class="ic">🗓️</span><b>근무 스케줄</b><span>스케줄 확인 · 휴무신청 · 누적 현황</span>' +
      (sn ? '<i class="hm-bd new" title="' + esc(Number(sn.ym.slice(5)) + '월 스케줄이 새로 확정됐어요') + '">NEW</i>' : '') + '</a>' +
    '<button class="go" data-hkleave="1"><span class="ic">📅</span><b>연차 현황</b><span>이름 고르고 본인 비밀번호 4자리 → 내 연차</span></button></div></div>';
}
function linksHtml() {
  return '<div class="card"><h2>현장 앱 <small>같은 로그인으로 열려요</small></h2><div class="go-grid">' +
    LINKS.filter(l => FIELD.indexOf(l.href) >= 0 && !((isHk() || HR_HIDE) && l.href === '../unies-contract/')).map(l => '<a class="go" href="' + l.href + '"' + (l.tab ? ' target="_blank" rel="noopener"' : '') + '><span class="ic">' + l.ic + '</span><b>' + esc(l.t) + '</b><span>' + esc(l.s) + '</span></a>').join('') + '</div></div>';
}
function staffHtml() {
  return '<div class="card"><h2>👥 전 파트 직원 명단</h2><p class="note" style="margin:0 0 12px">룸메이드 · 정비보조 · 미화 · 사우나 · 하우스맨 · 오더테이커를 한곳에서 봐요. 입사일 · 근속 · 재직/퇴사.<br>파트별 관리는 각 앱에서 해도 되고, 여기서 고쳐도 같은 명단이에요.</p>' +
    '<button class="big-btn" data-staff="1">명단 열기</button></div>';
}
// ---------- 📊 결산 (2026-11-19): close.js — 정비보조 월 출역표(엑셀·인쇄) · 연차 대장 길. 하우스키퍼에겐 안 보임 (출퇴근 기록)
let CL = null, CLG = null;   // CLG = 결산마감 특이사항 (closing.js · 2026-11-19)
// ---------- 첫 화면 · 안쪽 화면 (2026-11-18-4)
// 주소 끝 # 로 어느 화면인지 나눔: '' 첫 화면 · #work(/now|up|dirty) · #quality · #people · #assign · #apps
const SECS = {
  work: { ic: BROOM, t: '오늘 정비', tabs: [['now', '상황'], ['up', '보고서 올리기'], ['dirty', '더티 · 활동'], ['asg', '자동 배정']] },
  quality: { ic: '🔍', t: '품질 관리' },
  people: { ic: '👥', t: '인사' },
  field: { ic: '📱', t: '현장 관리' },
  close: { ic: '📊', t: '결산' },
  meal: { ic: '🍚', t: '주간 식단' },
  hk: { ic: '🛎️', t: '하우스키퍼' },
  apps: { ic: '🔗', t: '현장 앱 열기' }
};
const TILES = [
  { go: 'work', ic: BROOM, t: '오늘 정비', s: '메이드별 현황 · 보고서 올리기 · 더티 배분 · 활동판 · 자동 배정' },
  { href: './jbr/', win: 1, ic: '📑', t: '정비보고서', s: '객실 현황 · 입력 · 결산 · 시상 · 엑셀 (노트북은 새 창)' },   // 11/27 소장님: 하우스키퍼 안 → 메인 큰 버튼 (중요 · 자주 들어감)
  { go: 'quality', ic: '🔍', t: '품질 관리', s: '인스펙션 · 고객만족도 VOC' },
  { href: './leave/', ic: '📋', t: '룸메이드 연차 · 근무', s: '연차 현황 · 신청서 승인 · 휴대폰 승인' },
  { href: './rmsched/', ic: '🗓️', t: '룸메이드 스케줄', s: '주간 편성 · 기본유닛 · 휴무 · 국공휴 출근' },   // 11/25 부소장 Claude 제작 (rmsched/{cfg | 월요일 | hol-연도}, 규칙 v29 isBoss)
  { go: 'people', ic: '👥', t: '인사', s: '입퇴사 진행 · 전 파트 직원 명단' },
  { go: 'hk', ic: '🛎️', t: '하우스키퍼', s: '야간 업무 보고서 · 근무 스케줄 · 연차 현황' },
  { href: './keys/', ic: '🔑', t: '플로어 키', s: '키 서명 현황 · 오후 대조 · 미반납 · 대장 인쇄' },
  { href: './lost/', ic: '🧳', t: '습득물', s: '습득물 관리대장 · 확인 · 조치 · 귀중품 · 엑셀' },
  { href: '../inventory/', ic: '📦', t: '재고조사', s: '객실 · 사우나 재고 (부소장)' },
  { go: 'field', ic: '📱', t: '현장 관리', s: '공지 올리기 · 공지 확인 · 2인 1조 · 휴대폰 등록' },
  { go: 'close', ic: '📊', t: '결산', s: '결산 특이사항 · 입퇴사 현황 · 출역표 · 연차 대장' },
  { go: 'apps', ic: '🔗', t: '현장 앱 열기', s: '정비 레포트 · 정비 지원' + (HR_HIDE ? '' : ' · 입퇴사 서류'), wide: 1 }
];
const FIELD = ['../rm/', '../dirty/', '../unies-contract/'];
let route = { sec: '', tab: '' }, fromHome = false;
function parseRoute() {
  const m = location.hash.replace(/^#/, '').split('/');
  if (m[0] === 'assign') { m[0] = 'work'; m[1] = 'asg'; }   // 11/18-4 주소 (자동 배정 따로 쪽) 그대로 열리게
  const sec = SECS[m[0]] && !((m[0] === 'people' || m[0] === 'close') && isHk()) ? m[0] : '';
  const tabs = sec && SECS[sec].tabs;
  let tab = tabs && tabs.some(t => t[0] === m[1]) ? m[1] : '';
  if (tabs && !tab) tab = up ? 'up' : tabs[0][0];
  return { sec, tab };
}
function goSec(sec, tab) {
  const h = '#' + sec + (tab ? '/' + tab : '');
  if (location.hash === h) return;
  if (!route.sec) { fromHome = true; location.hash = h; } else location.replace(h);
}
function goHome() {
  if (fromHome) { history.back(); return; }
  history.replaceState(null, '', location.pathname + location.search);
  route = parseRoute(); draw(); window.scrollTo(0, 0);
}
// 📄 정비보고서 연결 (2026-11-21): 오늘 켜져 있을 때만. 조용히 멈추는 게 제일 위험 → 근무 시간(7~18시)에 15분 넘게 소식 없으면 끊김 경고
const RS_URL = '../rm/?link=1';
function rsItems(v, now, H) {
  const r = v.rs; if (!r || r.__err || !r.on || r.day !== v.d) return [];
  const it = (lv, title, sub) => ({ lv, title, sub, href: RS_URL, rs: 1 });
  const gap = Math.round((now - Number(r.at || 0)) / 60000);
  if (gap > 15 && H >= 7 && H < 18) return [it('bad', '정비보고서 연결이 ' + gap + '분째 끊겼어요', '오더테이커 PC에서 연결 창이 닫혔거나 PC가 꺼졌어요 · 그동안은 손으로 해 주세요')];
  if (r.state === 'perm') return [it('bad', '정비보고서 폴더를 다시 허락해 주세요', '오더테이커 PC 연결 창에서 "다시 허락하기"')];
  if (r.state === 'stop') return [it('bad', '정비보고서 연결 멈춤', String(r.msg || '').slice(0, 150))];
  if (r.pend) return [it('wait', '정비보고서 변경 ' + r.pend + '건 확인 대기', '연결 창에서 "이대로 반영"을 눌러야 메이드·더티에 들어가요')];
  return [it('ok', '정비보고서 연결됨', hm(r.at) + ' 확인' + (r.fileAt ? ' · 엑셀 저장 ' + hm(r.fileAt) : '') + (r.mode === 'auto' ? ' · 자동 반영' : ' · 확인 후 반영') + (r.diff ? ' · 엑셀과 다름 ' + r.diff : ''))];
}
function rsCardHtml() {
  const v = view.st || {}, r = v.rs && !v.rs.__err ? v.rs : null, x = v.d ? rsItems(v, Date.now(), Number(seoul().toISOString().slice(11, 13)))[0] : null;
  return '<div class="card"><h2>📄 정비보고서 연결 <small>엑셀 → 앱 자동 반영</small></h2>' +
    (x ? '<p class="' + (x.lv === 'bad' ? 'err' : x.lv === 'wait' ? 'waitbox' : 'okbox') + '">' + (x.lv === 'ok' ? '✅ ' : x.lv === 'bad' ? '❗ ' : '⏳ ') + esc(x.title) + '<br><small>' + esc(x.sub) + '</small></p>'
      : '<p class="note" style="margin:0 0 10px">' + (r && r.on ? '오늘은 아직 연결 소식이 없어요.' : '아직 연결 안 됨.') + ' 오더테이커 PC(크롬)에서 연결 창을 열고 정비보고서 폴더를 한 번 골라 두면, 엑셀에서 바꾼 방(추가·빠짐·재실·시간)이 메이드 화면과 정비보조 더티에 들어가요.</p>') +
    '<a class="big-btn sec" style="display:block;text-align:center;text-decoration:none;margin-top:10px" href="' + RS_URL + '" target="_blank" rel="noopener">연결 창 열기 (새 탭 · 켜 두기)</a></div>';
}
// 첫 화면 '지금 확인할 것': 오늘 한눈에에서 문제·주의만 + 이상 보고 · 연차 승인 대기 · 퇴사일 지남
function todoItems(v) {
  const L = statusItems(v).filter(x => x.lv !== 'ok').map(x => Object.assign({ go: /휴대폰 오류/.test(x.title) ? 'field' : 'work/now' }, x));
  const p = progress(v);
  if (p.issue) L.push({ lv: 'wait', title: '이상 보고 ' + p.issue + '실', sub: '메이드가 이상으로 표시한 객실 · 정비 레포트에서 보기', go: 'work/now' });
  if (typeof v.lvq === 'number' && v.lvq) L.push({ lv: 'bad', title: '휴가신청서 승인 대기 ' + v.lvq + '건', sub: '연차 관리에서 승인 · 반려', href: './leave/' });
  keyTodo(v).forEach(x => L.push(x));
  lostTodo(v).forEach(x => L.push(x));
  nightWait(v).forEach(n => L.push({ lv: 'wait', title: '야간 보고서 ' + md(n.date) + ' 밤 확인 대기', sub: n.need, href: './night/#' + n.date }));
  const r = v.hr;
  if (r && !r.__err && r.past.length) L.push({ lv: 'wait', title: '퇴사일 지난 분 ' + r.past.length + '명', sub: '아직 재직으로 남아 있어요 · 입퇴사 서류에서 퇴사 처리', go: 'people' });
  return L.sort((a, b) => (a.lv === 'bad' ? 0 : 1) - (b.lv === 'bad' ? 0 : 1));
}
// 🧳 습득물 (2026-11-22): 오늘 접수 중 확인 안 한 것 · 경찰 인계 대기 · 30일 폐기 대상 (meta/lost_sum = 서버 함수 lostDaily 가 매일 아침 셈)
function lostTodo(v) {
  const L = [], lt = Array.isArray(v.lt) ? v.lt.map(x => x.data || {}) : [], s = v.ls && !v.ls.__err ? v.ls : null;
  const un = lt.filter(x => !x.chk).length;
  if (un) L.push({ lv: 'wait', title: '습득물 확인 안 함 ' + un + '건', sub: '오늘 접수 ' + lt.length + '건 · 실물을 받으면 [확인]', href: './lost/' });
  if (s && s.dispose) L.push({ lv: 'wait', title: '습득물 폐기 대상 ' + s.dispose + '건', sub: '일반 물품 30일 지남 · ' + md(s.day) + ' 아침 기준', href: './lost/#todo' });
  if (s && s.food) L.push({ lv: 'wait', title: '습득물 음식 3일 지남 ' + s.food + '건', sub: '습득물 냉장고 정리', href: './lost/#todo' });
  return L;
}
// 🔑 플로어키: 키 서명 누락(시작한 층만) · 대조 때 키 없음(미반납 · 서명 없이 없음)
function keyTodo(v) {
  const k = v.ks; if (!k) return [];
  const L = [], late = k.late.concat(k.nosign);
  if (late.length) L.push({ lv: 'bad', title: '플로어 키 미반납 ' + late.length + '개', sub: late.map(x => x.floor + '층 ' + x.key + '키' + (x.takers.length ? ' ' + x.takers.map(d => d.maid).join('·') : ' 서명 없음')).join(', '), href: './keys/' });
  // 11/20: 그 층 객실을 시작했는데 키 답이 없는 경우만 (시작 전 층은 앱이 첫 객실 때 물어봄 → 알림 아님)
  if (k.unanswered.length) L.push({ lv: 'bad', title: '키 서명 누락 ' + k.unanswered.length + '명', sub: k.unanswered.map(u => u.name + ' ' + u.floors.join('·') + '층 (객실 시작함)').join(', '), href: './keys/' });
  return L;
}
// 🌙 야간 보고서: 제출됐고 내(소장 · 부소장) 확인이 아직인 것 — 어젯밤 · 오늘 밤 두 문서만 읽음
function nightWait(v) {
  if (isHk() || !Array.isArray(v.ng)) return [];
  return v.ng.filter(n => n && !n.__err && n.state === '제출' && !(n.ok && n.ok[admin.label])).map(n => {
    const need = (n.items || []).filter(it => { const q = n.stock && n.stock[it.name] && n.stock[it.name].qty; return typeof q === 'number' && q <= it.low; }).map(it => it.name);
    return { date: n.date, need: (n.main ? n.main + ' 작성 · ' : '') + (need.length ? '발주 필요: ' + need.join(', ') : '발주 필요 없음') };
  });
}
function badgeOf(t, v) {
  if (!v) return '';
  const B = (lv, x) => '<i class="hm-bd ' + lv + '">' + esc(x) + '</i>';
  if (t.go === 'work') {
    const p = progress(v), nb = statusItems(v).filter(x => x.lv === 'bad').length;
    if (nb) return B('bad', '확인 ' + nb);
    return p.total ? B('ok', p.pct + '%') : '';
  }
  if (t.go === 'field') return Array.isArray(v.errs) && v.errs.length ? B('wait', '오류 ' + v.errs.length) : '';
  if (t.href === './night/' || t.go === 'hk') { const n = nightWait(v).length; return n ? B('wait', '확인 ' + n) : schedNew(v) ? B('new', 'NEW') : ''; }
  if (t.href === './keys/') {
    const k = v.ks; if (!k) return v.kc && v.kc.from && v.kc.on !== false && v.kc.from > v.d ? B('wait', md(v.kc.from) + ' 시작') : '';
    const bad = k.late.length + k.nosign.length; if (bad) return B('bad', '미반납 ' + bad);
    if (k.unanswered.length) return B('bad', '누락 ' + k.unanswered.length);
    return B('ok', '대조 ' + k.checked + '/' + k.cells);
  }
  if (t.href === './lost/') { const lt = Array.isArray(v.lt) ? v.lt : [], s = v.ls && !v.ls.__err ? v.ls : null; const un = lt.filter(x => !(x.data || {}).chk).length; if (un) return B('wait', '확인 ' + un); if (s && s.police) return B('bad', '귀중품 ' + s.police); return lt.length ? B('ok', '오늘 ' + lt.length) : ''; }
  if (t.href === './leave/') return typeof v.lvq === 'number' && v.lvq ? B('bad', '승인 ' + v.lvq) : '';
  if (t.go === 'people') {
    const r = v.hr; if (!r || r.__err) return '';
    if (r.past.length) return B('wait', '퇴사일 ' + r.past.length);
    if (r.join.length) return B('wait', '입사 ' + r.join.length);
    if (r.soon.length) return B('wait', '퇴사 ' + r.soon.length);
  }
  return '';
}
let ML = null;
function meal() { if (!ML) ML = setupMeal({ S, esc, ymd, addDays, md, draw: () => draw(), go: s => goSec(s, ''), who: () => (admin ? admin.label : ''), uid: () => (user ? user.uid : '') }); return ML; }
function homeHtml() {
  const v = view.st;
  let h = '';
  if (!v) h += '<div class="card hm-ok"><span>오늘 상황을 읽는 중…</span></div>';
  else {
    const T = todoItems(v), nb = T.filter(x => x.lv === 'bad').length;
    if (T.length) {
      h += '<div class="card hm-todo' + (nb ? '' : ' w') + '"><h2>' + (nb ? '❗' : '⏳') + ' 지금 확인할 것 ' + T.length + ' <button class="ref" data-ref="1">' + (view.busy ? '읽는 중…' : '↻ ' + hm(view.at)) + '</button></h2><ul>' +
        T.map(x => {
          const inner = '<span class="hm-i">' + (x.lv === 'bad' ? '❗' : '⏳') + '</span><span class="hm-t"><b>' + esc(x.title) + '</b>' + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + '</span><span class="hm-c">›</span>';
          return '<li class="' + x.lv + '">' + (x.href ? '<a href="' + x.href + '"' + (x.rs ? ' target="_blank" rel="noopener"' : '') + '>' + inner + '</a>' : '<button data-go="' + x.go + '">' + inner + '</button>') + '</li>';
        }).join('') + '</ul></div>';
    } else h += '<div class="card hm-ok"><b>✅ 모두 정상</b><span>' + hm(view.at) + ' 기준</span><button class="ref" data-ref="1">' + (view.busy ? '읽는 중…' : '↻ 새로 고침') + '</button></div>';
  }
  if (v && v.bd) h += BD.html(v.bd, esc);
  h += '<div class="hm-grid">' + TILES.filter(t => !(isHk() && (t.go === 'people' || t.go === 'close' || t.href === './leave/' || t.href === './rmsched/'))).map(t => {
    const inner = badgeOf(t, v) + '<span class="hm-ic">' + t.ic + '</span><span class="hm-tx"><b>' + esc(t.t) + '</b><small>' + esc(t.s) + '</small></span>';
    return t.href ? '<a class="hm-tile' + (t.wide ? ' wide' : '') + '" href="' + t.href + '"' + (t.win ? ' data-jbrwin="1"' : '') + '>' + inner + '</a>'
      : '<button class="hm-tile' + (t.wide ? ' wide' : '') + '" data-go="' + t.go + '">' + inner + '</button>';
  }).join('') + '</div>';
  return h;
}
function secHtml() {
  const S0 = SECS[route.sec], sec = route.sec;
  let h = '<div class="hm-sec"><button class="hm-back" data-home="1" aria-label="첫 화면으로">‹</button><b>' + S0.ic + ' ' + esc(S0.t) + '</b>' +
    (sec === 'work' || sec === 'people' ? '<button class="ref" data-ref="1">' + (view.busy || ex.busy ? '읽는 중…' : '↻ 새로 고침') + '</button>' : '') + '</div>';
  if (S0.tabs) h += '<div class="hm-tabs" role="tablist">' + S0.tabs.map(t => '<button role="tab" data-tab="' + t[0] + '" aria-pressed="' + (route.tab === t[0]) + '">' + esc(t[1]) + (t[0] === 'up' && up && !up.sent ? ' •' : '') + '</button>').join('') + '</div>';
  if (sec === 'work') {
    if (route.tab === 'up') h += upHtml() + rsCardHtml();
    else if (route.tab === 'dirty') h += exHtml();
    else if (route.tab === 'asg') h += assignCardHtml();
    else h += statusHtml() + progHtml() + rmCardHtml();
  } else if (sec === 'quality') h += inspCardHtml() + vocCardHtml();
  else if (sec === 'people' && !PIN.passed()) h += '<div class="card"><h2>🔒 비밀번호가 필요해요</h2><p class="note" style="margin:0 0 12px">직원 명단 · 입퇴사 정보가 있는 화면이에요.</p><button class="big-btn" data-unlock="people">비밀번호 넣고 보기</button></div>';
  else if (sec === 'people') h += (view.st ? hrHtml(view.st) : '<div class="card"><p class="note" style="margin:0">읽는 중…</p></div>') + staffHtml() +
    '<div class="card"><h2>🔒 화면 비밀번호</h2><p class="note" style="margin:0 0 12px">인사 · 연차·근무 화면에 들어갈 때 묻는 숫자 4자리예요. 한 번 넣으면 이 창에서 30분 동안 다시 안 물어요.</p><button class="big-btn sec" data-pinchg="1">비밀번호 바꾸기</button></div>';
  else if (sec === 'field') h += fieldHtml();
  else if (sec === 'close') { if (!CL) CL = setupClose({ S, esc, ymd, draw: () => draw() }); if (!CLG) CLG = setupClosing({ S, esc, ymd, PIN, xlsx: XW, draw: () => draw(), who: () => (admin ? admin.label : ''), uid: () => (user ? user.uid : '') }); h += CLG.html() + CL.html(); }
  else if (sec === 'apps') h += linksHtml();
  else if (sec === 'meal') h += meal().secHtml();
  else if (sec === 'hk') h += hkSecHtml();
  return h;
}
function draw() {
  head();
  if (user === null) { $('#main').innerHTML = '<div class="card"><p class="note" style="margin:0">여는 중…</p></div>'; return; }
  if (!admin) { $('#main').innerHTML = loginHtml(); return; }
  $('#main').innerHTML = (route.sec ? secHtml() : homeHtml()) +
    '<div class="foot">객실 통합 관리 시스템 ' + VER + ' · <button data-logout="1">로그아웃</button></div>';
}
window.addEventListener('hashchange', () => {
  route = parseRoute();
  if (!route.sec) fromHome = false;
  draw(); window.scrollTo(0, 0);
  if (route.sec === 'work' && route.tab === 'dirty') loadEx(false);
});
route = parseRoute();

// ---------- 직원 명단 (정비 레포트 · 정비 지원과 같은 화면 파일 — 여기선 전 파트)
// 정비보조 이름 고르기 목록 맞추기 (2026-11-19): 정비 지원 앱 명단(dirty index.html '정비보조 명단' sync)과 같은 규칙
//   직종 '정비보조' 재직·입사 진행 = sup_meta/roster.add 에 넣음, 퇴사 = hide 로 뺌, 이름 고침 = 예전 이름 뺌, 명단에서 지움 = add 에서 뺌
//   예전엔 허브에서 정비보조를 넣어도 정비 지원 이름 고르기에 안 나왔음. 바뀐 게 있을 때만 한 번 씀
async function supRosterSync(list, info) {
  try {
    info = info || {};
    const nm = x => String(x || '').trim(), sup = list.filter(p => p.job === '정비보조');
    const active = [], gone = [], rm = nm(info.removed);
    sup.forEach(p => { const n = nm(p.name); if (!n) return; if ((p.status || '재직') === '퇴사') gone.push(n); else active.push(n); });
    if (info.renamedFrom) gone.push(nm(info.renamedFrom));
    const g0 = await S.get('sup_meta/roster') || {}, g = { add: (g0.add || []).slice(), hide: (g0.hide || []).slice() };
    const goneF = gone.filter(n => active.indexOf(n) < 0), uniq = (n, i, a) => a.indexOf(n) === i;
    const add = g.add.concat(active).filter((n, i, a) => uniq(n, i, a) && goneF.indexOf(n) < 0 && (n !== rm || active.indexOf(n) >= 0));
    const hide = g.hide.filter(n => active.indexOf(n) < 0).concat(goneF).filter(uniq);
    if (JSON.stringify(add) === JSON.stringify(g.add) && JSON.stringify(hide) === JSON.stringify(g.hide)) return;
    await S.set('sup_meta/roster', { add, hide, at: S.SERVER_TIME, uid: user.uid });
  } catch (e) { alert('정비 지원 이름 고르기 목록을 못 맞췄어요: ' + (e && (e.code || e.message) || e) + '\n정비 지원 앱 관리자 화면의 「👥 정비보조 명단」을 한 번 열면 다시 맞춰져요.'); }
}
function openStaff() {
  const go = () => window.StaffBook.open({ jobs: JOBS, title: '👥 전 파트 직원 명단',
    api: { list: () => S.getQuery('staff', []).then(xs => xs.map(x => Object.assign({}, x.data, { id: x.id }))),
      save: (id, d) => { const o = {}; Object.keys(d).forEach(k => { if (k !== 'id' && d[k] !== undefined) o[k] = d[k]; }); o.at = S.SERVER_TIME; o.uid = user.uid; return S.set('staff/' + id, o); },
      del: id => S.del('staff/' + id),
      newId: () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }, onChange: supRosterSync });
  if (window.StaffBook) { go(); return; }
  const sc = document.createElement('script');
  sc.src = new URL('../rm/app/staff.js?v=' + VER, import.meta.url).href;
  sc.onload = go; sc.onerror = () => alert('명단 화면을 못 불러왔어요. 인터넷을 확인하고 다시 눌러 주세요.');
  document.head.appendChild(sc);
}

// ---------- 누르기
document.addEventListener('click', e => {
  // 📋 정비보고서 (11/27 소장님): 노트북 · PC 는 주소창 · 탭 없는 따로 창으로 (이미 열려 있으면 그 창을 앞으로). 휴대폰 · 창이 막히면 그냥 이동
  { const jw = e.target.closest && e.target.closest('[data-jbrwin]');
    if (jw && !(window.matchMedia && matchMedia('(pointer:coarse)').matches)) {
      e.preventDefault();
      const w = window.open(jw.href, 'jbr_window', 'popup,left=0,top=0,width=' + (screen.availWidth || 1600) + ',height=' + (screen.availHeight || 900));
      if (w) { try { w.focus(); } catch (er) {} } else location.href = jw.href;
      return;
    } }
  if (e.target.closest && e.target.closest('[data-hkleave]')) { import('./hkleave.js?v=' + VER).then(m => m.open()).catch(err => { console.warn(err); alert('연차 현황을 열지 못했어요. 새로 고침 후 다시 해 주세요.'); }); return; }
  const t = e.target.closest && e.target.closest('[data-who],[data-login],[data-ref],[data-staff],[data-logout],[data-up],[data-upd],[data-hdist],[data-voc],[data-vclose],[data-act],[data-sup],[data-actclose],[data-actlogin],[data-asg],[data-go],[data-tab],[data-home],[data-rm],[data-rmclose],[data-unlock],[data-pinchg],a[href="./leave/"]');
  if (!t || (t.closest && t.closest('#dz'))) return;
  if (t.matches('a[href="./leave/"]') && !PIN.passed()) { e.preventDefault(); PIN.gate('룸메이드 연차 · 근무').then(ok => { if (ok) location.href = './leave/'; }); return; }
  if (t.matches('a[href="./leave/"]')) return;
  if (t.hasAttribute('data-unlock')) { PIN.gate('인사').then(ok => { if (ok) draw(); }); return; }
  if (t.hasAttribute('data-pinchg')) { PIN.change(); return; }
  if (t.hasAttribute('data-go') && t.getAttribute('data-go').split('/')[0] === 'people' && !PIN.passed()) { PIN.gate('인사').then(ok => { if (ok) goSec('people', ''); }); return; }
  if (t.hasAttribute('data-rm')) { openRm(t.getAttribute('data-rm')); return; }
  if (t.hasAttribute('data-rmclose')) { closeRm(); return; }
  if (t.hasAttribute('data-go')) { const g = t.getAttribute('data-go').split('/'); goSec(g[0], g[1] || ''); return; }
  if (t.hasAttribute('data-tab')) { goSec(route.sec, t.getAttribute('data-tab')); return; }
  if (t.hasAttribute('data-home')) { goHome(); return; }
  if (t.hasAttribute('data-voc')) { openVoc(); return; }
  if (t.hasAttribute('data-act')) { openAct('act'); return; }
  if (t.hasAttribute('data-sup')) { openAct('sup'); return; }
  if (t.hasAttribute('data-actlogin')) { actLogin(); return; }
  if (t.hasAttribute('data-asg')) { if (t.getAttribute('data-asg') === 'notes') { openAsgNotes(); return; } openAssignUI(t.getAttribute('data-asg') === 'blocks' ? 'blocks' : ''); return; }
  if (t.hasAttribute('data-actclose')) { closeAct(); return; }
  if (t.hasAttribute('data-vclose')) { closeVoc(); load(false); return; }
  if (t.hasAttribute('data-hdist')) { openDist(); return; }
  if (t.hasAttribute('data-up')) {
    const a = t.getAttribute('data-up');
    if (a === 'pick') pickXlsx();
    else if (a === 'send') upSend(false);
    else if (a === 'reset') { clearTimeout(upPoll); up = null; draw(); }
    return;
  }
  if (t.hasAttribute('data-upd')) { if (up && !up.sent && !up.sending) { up.date = t.getAttribute('data-upd'); if (up.buf) upBuild(); else draw(); } return; }
  if (t.hasAttribute('data-who')) { const pw = ($('#pw') || {}).value || ''; login.who = Number(t.getAttribute('data-who')); draw(); const el = $('#pw'); if (el) { el.value = pw; el.focus(); } return; }
  if (t.hasAttribute('data-login')) { doLogin(); return; }
  if (t.hasAttribute('data-ref')) { reload(true); return; }
  if (t.hasAttribute('data-staff')) { openStaff(); return; }
  if (t.hasAttribute('data-logout')) {
    if (!confirm('로그아웃할까요?\n이 기기의 정비 레포트 · 정비 지원 관리자도 같이 로그아웃돼요.')) return;
    PIN.forget(); S.signOut(); return;
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target && e.target.id === 'pw') doLogin(); });
// 새 버전 (11/13 → 11/26): 예전엔 버전이 다르면 바로 새로 고침 → 이제 쉬는 순간에만 (autoreload.js)
// 안 바꾸는 때: 창(정비 레포트 · 정비 지원 · 자동 배정 · 배정 의견 등 .vp) 열림 · 정비보고서 올리는 중 · VOC 창 · 시험 중
if (!window.__hubFast && window.AutoReload) window.AutoReload.start({
  key: 'hub', cur: VER, url: 'version.json',
  safe: () => !document.querySelector('.vp') && !/-lock\b/.test(document.body.className) && !(up && !up.sent) && !vocOpen
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reload(false); });

S.onUser(u => {
  if (vocOpen && !(u && !u.anon)) closeVoc();
  user = u || false;
  admin = u && !u.anon ? ADMINS.filter(a => (a.uid && a.uid === u.uid) || (!a.uid && a.email === u.email))[0] || null : null;
  view = { st: null, busy: false, err: '', at: 0 };
  ex = { rows: null, acts: null, at: 0, busy: false, d: '' };
  if (NT) NT.reset();
  if (ML) ML.reset();
  draw();
  if (admin) reload(true);
});
setInterval(() => { if (admin && document.visibilityState === 'visible') { head(); } }, 60000);
draw();
