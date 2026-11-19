// hub/keys/keys.js — 🔑 플로어키 대장 (2026-11-19)
// 종이 「플로어 키 불출 대장」을 옮김. 메이드는 정비 레포트에서 층마다 A키/B키/안 가져가요를 누름 (rm/app/keys.js 셈을 같이 씀)
// 여기서: ① 미서명 · 미반납 한눈에 ② 하우스키퍼 오후 대조 (층 × A·B 실물 있음/없음) ③ 기록 고치기 (관리자 이름으로 줄 추가)
//         ④ 바꾼 기록 ⑤ 종이 대장과 같은 A4 인쇄 ⑥ (소장 · 부소장) 시작 날짜 · 끄기 스위치 · 반납 안내 문구
// 쓰는 사람: 하우스키퍼 공용 계정 · 소장 · 부소장 (규칙 v17: keys · keychk 는 쌓기만, 고치기 · 지우기 없음)
import * as S from '../../rm/app/store.js';
import * as K from '../../rm/app/keys.js';

const VER = '2026.11.19-2';
const ROLES = [
  { k: 'hk', label: '하우스키퍼', email: 'unieshaeundae+hk@gmail.com', uid: 'nBL2QYezEmRNRmBRMXN6LNPJO2s2' },
  { k: 'boss', label: '소장', email: 'unieshaeundae+admin@gmail.com', uid: 'iw2orXgIgPgTbLUQa0b41XJ9Dvd2' },
  { k: 'boss', label: '부소장', email: 'unieshaeundae+sub@gmail.com', uid: 'Fz4T5ZzIxShOdVkNpF9gzMmOLED2' }
];
const RET_KEY = '🔑 {키} 챙겨서 사무실에 반납해 주세요.', RET_LOST = '🧳 고객 유실물이 있으면 사무실에 같이 반납해 주세요.';

const $ = s => document.querySelector(s);
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const seoul = (t = Date.now()) => new Date(t + 9 * 3600e3);
const ymd = (t = Date.now()) => seoul(t).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const md = d => Number(d.slice(5, 7)) + '/' + Number(d.slice(8)) + '(' + DAYS[new Date(d + 'T00:00:00Z').getUTCDay()] + ')';
const longDate = d => d.slice(0, 4) + '년 ' + Number(d.slice(5, 7)) + '월 ' + Number(d.slice(8)) + '일 ' + DAYS[new Date(d + 'T00:00:00Z').getUTCDay()] + '요일';
const hm = t => { if (!t) return ''; const d = seoul(Number(t)); return ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2); };
const tOf = d => d.clientAt || d.at;
function toast(t) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 2600); }
const errOf = e => /permission/i.test(String(e && (e.code || e.message))) ? '권한이 없어요 (규칙 v17 게시 전이면 아직 저장이 안 돼요).' : String(e && (e.code || e.message) || e);

let user = null, role = null, login = { who: 0, err: '', busy: false };
let date = '', st = null, busy = false, msg = '', fix = null, cfgEdit = null, timer = 0;

function roleOf(u) { if (!u || u.anon) return null; return ROLES.filter(r => r.uid === u.uid || r.email === u.email)[0] || null; }

// ---------- 읽기 (한 번 읽기 + 1분마다 다시 · ↻)
async function load(d, quiet) {
  if (d) date = d;
  if (!quiet) { busy = true; draw(); }
  const D = 'days/' + date, safe = p => p.then(x => x, () => null);
  try {
    const [cfg, teams, day, plans, chg, keys, chk, ret] = await Promise.all([
      safe(S.get('meta/keys')), safe(S.get('meta/teams')), safe(S.get(D)),
      safe(S.getQuery(D + '/plans', [])), safe(S.getQuery(D + '/changes', [])),
      S.getQuery(D + '/keys', []), safe(S.getQuery(D + '/keychk', [])), safe(S.getQuery(D + '/keyret', []))
    ]);
    const pl = {}; (plans || []).forEach(x => { pl[x.id] = (x.data && x.data.rooms) || []; });
    const mf = K.maidFloors(pl, chg || []);
    const mate = (teams && teams.mate) || {};
    const sum = K.summary({ keys, chk: chk || [], ret: ret || [], mf, mate });
    st = { cfg: cfg || {}, mf, mate, keys, chk: chk || [], sum, maids: ((day && day.maids) || Object.keys(pl)).slice(), at: Date.now() };
    msg = '';
  } catch (e) { msg = '읽지 못했어요: ' + errOf(e); if (!st) st = null; }
  busy = false; draw();
}
function auto() { clearTimeout(timer); timer = setTimeout(() => { if (role && !fix && !cfgEdit && document.visibilityState === 'visible') load(null, true); auto(); }, 60000); }

// ---------- 쓰기
async function check(floor, key, v) {
  const cur = st.sum.ledger.filter(r => r.floor === floor)[0][key].chk, now = cur && cur.st;
  const val = now === v ? '' : v;   // 같은 걸 다시 누르면 비움
  try {
    await S.add('days/' + date + '/keychk', { floor, key, st: val, by: role.label, at: S.SERVER_TIME, clientAt: new Date(), uid: user.uid }).done;
    await load(null, true);
  } catch (e) { toast('저장하지 못했어요: ' + errOf(e)); }
}
async function checkAllIn() {
  const todo = []; st.sum.ledger.forEach(r => ['A', 'B'].forEach(k => { if (!r[k].chk || !r[k].chk.st) todo.push([r.floor, k]); }));
  if (!todo.length) { toast('대조 안 한 칸이 없어요'); return; }
  if (!confirm('대조 안 한 ' + todo.length + '칸을 모두 「있음」으로 할까요?\n(없는 키는 먼저 「없음」으로 눌러 두세요)')) return;
  busy = true; draw();
  try { await Promise.all(todo.map(([f, k]) => S.add('days/' + date + '/keychk', { floor: f, key: k, st: 'in', by: role.label, at: S.SERVER_TIME, clientAt: new Date(), uid: user.uid }).done)); toast(todo.length + '칸 있음으로 했어요'); }
  catch (e) { toast('저장하지 못했어요: ' + errOf(e)); }
  await load(null, true);
}
async function saveFix() {
  const f = fix;
  if (!f.maid) { f.err = '메이드 이름을 골라 주세요.'; draw(); return; }
  if (!f.key) { f.err = 'A키 · B키 · 안 가져감 중에서 골라 주세요.'; draw(); return; }
  busy = true; draw();
  try {
    await S.add('days/' + date + '/keys', { floor: f.floor, maid: f.maid, key: f.key, reason: f.key === '없음' ? String(f.reason || '').slice(0, 40) : '', by: '관리자', who: role.label, at: S.SERVER_TIME, clientAt: new Date(), uid: user.uid }).done;
    fix = null; toast(f.floor + '층 ' + f.maid + ' 님 ' + K.KEY_LABEL[f.key] + ' 기록했어요');
  } catch (e) { f.err = '저장하지 못했어요: ' + errOf(e); }
  await load(null, true);
}
async function saveCfg() {
  const c = cfgEdit;
  if (c.on && !/^\d{4}-\d{2}-\d{2}$/.test(c.from || '')) { c.err = '시작 날짜를 골라 주세요.'; draw(); return; }
  busy = true; draw();
  try {
    await S.set('meta/keys', { from: c.from || '', on: !!c.on, retText: String(c.retText || '').trim().slice(0, 120), lostText: String(c.lostText == null ? RET_LOST : c.lostText).trim().slice(0, 120), by: role.label, at: S.SERVER_TIME });
    cfgEdit = null; toast('저장했어요. 메이드 휴대폰에 바로 반영돼요.');
  } catch (e) { c.err = '저장하지 못했어요: ' + errOf(e); }
  await load(null, true);
}
async function quickOff() {
  if (!confirm('키 서명을 지금 끌까요?\n메이드 휴대폰에서 키 띠가 바로 사라지고, 객실 완료가 키와 상관없이 돼요. (기록은 남아요)')) return;
  busy = true; draw();
  try { await S.merge('meta/keys', { on: false, by: role.label, at: S.SERVER_TIME }); toast('껐어요. 다시 켜려면 아래 설정에서 켜기.'); }
  catch (e) { toast('하지 못했어요: ' + errOf(e)); }
  await load(null, true);
}

// ---------- 화면
function loginHtml() {
  return '<div class="card"><h2>로그인</h2><div class="seg">' + ROLES.map((r, i) => '<button data-who="' + i + '" aria-pressed="' + (login.who === i) + '">' + r.label + '</button>').join('') + '</div>' +
    '<input class="t" id="pw" type="password" autocomplete="current-password" placeholder="비밀번호" style="background:#fff">' +
    (login.err ? '<p class="err">' + esc(login.err) + '</p>' : '') +
    '<button class="big" data-login="1" style="margin-top:10px"' + (login.busy ? ' disabled' : '') + '>' + (login.busy ? '확인 중…' : '들어가기') + '</button></div>';
}
function cfgState(c) {
  if (!c || !c.from) return { on: false, t: '아직 안 켬', s: '시작 날짜를 정하면 그날부터 메이드 화면에 키 띠가 나와요.' };
  if (c.on === false) return { on: false, t: '꺼짐', s: '메이드 화면에 키 띠가 안 나와요. (시작 날짜 ' + md(c.from) + ')' };
  if (c.from > ymd()) return { on: false, wait: true, t: md(c.from) + '부터 켜짐', s: '그 전까지 메이드 화면은 지금과 같아요.' };
  return { on: true, t: '켜짐 · ' + md(c.from) + '부터', s: '메이드는 층마다 키를 알려야 그 층 객실을 완료할 수 있어요.' };
}
function dateBar() {
  return '<div class="card"><div class="datebar"><button data-day="-1" aria-label="전날">‹</button><div class="d"><b>' + md(date) + (date === ymd() ? ' 오늘' : '') + '</b><small>' + (st ? '읽은 시각 ' + hm(st.at) : '') + '</small></div>' +
    '<button data-day="1" aria-label="다음 날"' + (date >= ymd() ? ' disabled' : '') + '>›</button><button class="ref" data-ref="1">' + (busy ? '…' : '↻') + '</button></div></div>';
}
const nm = list => list.map(d => esc(d.maid) + ' <small>' + hm(tOf(d)) + (d.by === '관리자' ? ' · ' + esc(d.who || '관리자') : '') + (d.ret ? ' · <b class="rt">반납 표시 ' + hm(d.ret) + '</b>' : '') + '</small>').join('<br>');
const CELL = { ret: ['rt', '메이드 반납 표시 · 대조 전'], in: ['ok', '반납 확인'], late: ['bad', '미반납'], nosign: ['bad', '서명 없이 없음'], out: ['wait', '가져감 · 대조 전'], '': ['', ''] };
function mainHtml() {
  const s = st.sum, c = cfgState(st.cfg), today = date === ymd();
  let h = '';
  // 상태 · 끄기
  h += '<div class="card cfgline ' + (c.on ? 'on' : c.wait ? 'wait' : 'off') + '"><div><b>🔑 키 서명 ' + esc(c.t) + '</b><small>' + esc(c.s) + '</small></div>' +
    (role.k === 'boss' && st.cfg.from && st.cfg.on !== false ? '<button class="off" data-quickoff="1">바로 끄기</button>' : '') + '</div>';
  // 요약
  const un = s.unanswered, late = s.late.concat(s.nosign);
  h += '<div class="card"><h2>한눈에</h2><div class="sum4"><div class="' + (un.length ? 'w' : '') + '"><b>' + un.length + '</b><span>키 미서명</span></div>' +
    '<div class="' + (late.length ? 'bad' : '') + '"><b>' + late.length + '</b><span>미반납 · 서명 없이 없음</span></div>' +
    '<div><b>' + s.checked + '/' + s.cells + '</b><span>오후 대조</span></div><div><b>' + s.changed.length + '</b><span>바꾼 기록</span></div></div>' +
    (un.length ? '<div class="alert w"><b>키를 아직 안 알린 분</b>' + un.map(u => esc(u.name) + ' (' + u.floors.map(f => f + '층').join('·') + ')').join(', ') + '<small>그 층 객실 완료를 못 누르고 있어요. 키를 가져갔는지 확인해 주세요.</small></div>' : '') +
    (late.length ? '<div class="alert bad"><b>대조 때 키가 없음</b>' + late.map(x => x.floor + '층 ' + x.key + '키' + (x.takers.length ? ' (' + x.takers.map(d => esc(d.maid)).join('·') + ')' : ' (서명한 분 없음)')).join(', ') + '</div>' : '') +
    '</div>';
  // 대장
  const ed = !!role;
  h += '<div class="card"><h2>키 대장 · 오후 대조 <small>칸의 [있음] [없음] = 실물 확인</small></h2>' +
    '<div class="led"><div class="lh"><span>층</span><span>A키</span><span>B키</span></div>' + s.ledger.map(r => {
      const cell = k => { const x = r[k], cs = CELL[x.st]; const v = x.chk && x.chk.st;
        return '<div class="lc ' + cs[0] + '"><div class="who">' + (x.takers.length ? nm(x.takers) : '<span class="none">—</span>') + '</div>' +
          (cs[1] ? '<i class="tag ' + cs[0] + '">' + cs[1] + (x.chk && x.chk.st ? ' · ' + hm(tOf(x.chk)) : '') + '</i>' : '') +
          (ed ? '<div class="ck"><button data-ck="' + r.floor + ':' + k + ':in" aria-pressed="' + (v === 'in') + '">있음</button><button class="no" data-ck="' + r.floor + ':' + k + ':out" aria-pressed="' + (v === 'out') + '">없음</button></div>' : '') + '</div>'; };
      const mine = Object.keys(st.mf).filter(n => st.mf[n].indexOf(r.floor) >= 0);
      return '<div class="lr"><div class="lf"><b>' + r.floor + '층</b>' + (mine.length ? '<small>' + mine.map(esc).join('<br>') + '</small>' : '') + (ed ? '<button class="fx" data-fix="' + r.floor + '">고치기</button>' : '') + '</div>' + cell('A') + cell('B') +
        (r.none.length ? '<div class="ln">안 가져감 · ' + r.none.map(d => esc(d.maid) + (d.reason ? ' (' + esc(d.reason) + ')' : '')).join(', ') + '</div>' : '') + '</div>';
    }).join('') + '</div>' +
    (ed && today ? '<button class="big sec" data-allin="1" style="margin-top:10px">대조 안 한 칸 모두 「있음」</button>' : '') +
    '<p class="note">대조는 하루 몇 번 해도 돼요. 마지막으로 누른 값이 남고, 누가 언제 눌렀는지 기록돼요. 같은 버튼을 다시 누르면 비워져요.</p></div>';
  // 바꾼 기록
  const hist = {}; (st.keys || []).map(x => Object.assign({ id: x.id }, x.data)).sort((a, b) => (tOf(a) || 0) - (tOf(b) || 0)).forEach(d => { const k = d.maid + '|' + d.floor; (hist[k] = hist[k] || []).push(d); });
  const ch = Object.keys(hist).filter(k => hist[k].length > 1 || hist[k].some(d => d.by === '관리자'));
  h += '<div class="card"><h2>바꾼 기록 <small>지우기 없음 · 처음 기록도 남음</small></h2>' + (ch.length ? '<div class="hist">' + ch.map(k => {
    const L = hist[k], f = L[0];
    return '<div><b>' + f.floor + '층 ' + esc(f.maid) + '</b>' + L.map(d => '<span>' + hm(tOf(d)) + ' ' + esc(K.KEY_LABEL[d.key] || d.key) + (d.reason ? ' (' + esc(d.reason) + ')' : '') + (d.by === '관리자' ? ' · ' + esc(d.who || '관리자') + ' 고침' : '') + '</span>').join(' → ') + '</div>';
  }).join('') + '</div>' : '<p class="note" style="margin:0">없어요.</p>') + '</div>';
  // 설정 (소장 · 부소장)
  if (role.k === 'boss') h += cfgEdit ? cfgHtml() : '<div class="card"><h2>설정 <small>소장 · 부소장</small></h2><p class="note" style="margin:0 0 10px">시작 날짜 · 켜기/끄기 · 마지막 객실 완료 때 나오는 안내 문구</p><button class="big sec" data-cfg="1">설정 열기</button></div>';
  h += '<div class="card" style="text-align:center"><button class="chip" data-print="1">🖨 A4 인쇄 (종이 대장 모양)</button> <button class="chip" data-logout="1">로그아웃</button></div>';
  return h;
}
function cfgHtml() {
  const c = cfgEdit;
  return '<div class="card"><h2>설정</h2>' +
    '<label class="f"><span>시작 날짜 — 이 날 아침부터 메이드 화면에 키 띠가 나와요</span><input class="t" type="date" id="cf-from" value="' + esc(c.from || '') + '"></label>' +
    '<div class="seg" style="margin-top:10px"><button data-cfon="1" aria-pressed="' + !!c.on + '">켜기</button><button data-cfon="0" aria-pressed="' + !c.on + '">끄기</button></div>' +
    '<label class="f"><span>반납 안내 문구 ({키} 자리에 「12층 A키」처럼 들어가요 · 비우면 기본 문구)</span><input class="t" id="cf-ret" maxlength="120" placeholder="' + esc(RET_KEY) + '" value="' + esc(c.retText || '') + '"></label>' +
    '<label class="f" style="margin-top:8px"><span>유실물 안내 문구 (비우면 안 나옴)</span><input class="t" id="cf-lost" maxlength="120" value="' + esc(c.lostText == null ? RET_LOST : c.lostText) + '"></label>' +
    '<div class="prev"><b>메이드 화면 미리 보기</b><p>' + esc(String(c.retText || RET_KEY).replace('{키}', '12층 A키')) + '</p>' + (String(c.lostText == null ? RET_LOST : c.lostText).trim() ? '<p>' + esc(c.lostText == null ? RET_LOST : c.lostText) + '</p>' : '') + '</div>' +
    (c.err ? '<p class="err">' + esc(c.err) + '</p>' : '') +
    '<div class="g2" style="margin-top:10px"><button class="big sec" data-cfgx="1">취소</button><button class="big" data-cfgs="1"' + (busy ? ' disabled' : '') + '>저장</button></div></div>';
}
function fixHtml() {
  const f = fix, cur = Object.keys(st.sum.lat).map(k => st.sum.lat[k]).filter(d => d.floor === f.floor);
  const names = st.maids.slice(); Object.keys(st.mf).forEach(n => { if (names.indexOf(n) < 0) names.push(n); });
  const sug = Object.keys(st.mf).filter(n => st.mf[n].indexOf(f.floor) >= 0);
  return '<div class="scrim"><div class="panel"><h2>' + f.floor + '층 기록 고치기</h2>' +
    '<p class="note" style="margin:0">지금: ' + (cur.length ? cur.map(d => esc(d.maid) + ' ' + esc(K.KEY_LABEL[d.key])).join(', ') : '기록 없음') + '<br>고치면 「' + esc(role.label) + ' 고침」으로 줄이 하나 더 쌓여요 (처음 기록은 남아요).</p>' +
    '<label class="f"><span>메이드</span><select class="t" id="fx-maid"><option value="">고르기</option>' +
    (sug.length ? '<optgroup label="이 층 배정">' + sug.map(n => '<option' + (f.maid === n ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</optgroup>' : '') +
    '<optgroup label="오늘 전체">' + names.filter(n => sug.indexOf(n) < 0).map(n => '<option' + (f.maid === n ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</optgroup></select></label>' +
    '<div class="seg">' + [['A', 'A키'], ['B', 'B키'], ['AB', 'A·B'], ['없음', '안 가져감']].map(o => '<button data-fk="' + o[0] + '" aria-pressed="' + (f.key === o[0]) + '">' + o[1] + '</button>').join('') + '</div>' +
    (f.key === '없음' ? '<div class="seg">' + K.REASONS.map(r => '<button data-fr="' + esc(r) + '" aria-pressed="' + (f.reason === r) + '">' + esc(r) + '</button>').join('') + '</div>' : '') +
    (f.err ? '<p class="err">' + esc(f.err) + '</p>' : '') +
    '<div class="g2"><button class="big sec" data-fixx="1">취소</button><button class="big" data-fixs="1"' + (busy ? ' disabled' : '') + '>저장</button></div></div></div>';
}
// ---------- 인쇄: 종이 「A키 플로어 키 불출 대장」과 같은 모양 (층 · 수령자 · 불출시간 · 반납시간) — A키 · B키 나란히, A4 한 장
function printHtml() {
  if (!st) return '';
  const s = st.sum;
  const who = x => x.takers.map(d => esc(d.maid)).join(', ');
  const out = x => x.takers.map(d => hm(tOf(d))).join(', ');
  const ret = x => x.st === 'in' ? (x.takers.length ? hm(tOf(x.chk)) : '') : x.st === 'ret' ? '(본인 ' + x.takers.map(d => hm(d.ret)).join(', ') + ')' : x.st === 'late' ? '<b class="r">미반납</b>' : x.st === 'nosign' ? '<b class="r">서명없이 없음</b>' : '';
  const none = []; s.ledger.forEach(r => r.none.forEach(d => none.push(r.floor + '층 ' + esc(d.maid) + (d.reason ? '(' + esc(d.reason) + ')' : ''))));
  const chkBy = {}; (st.chk || []).forEach(x => { const d = x.data || x; if (d.by) chkBy[d.by] = Math.max(chkBy[d.by] || 0, tOf(d) || 0); });
  return '<div class="pg"><h1>플로어 키 불출 대장 <small>A키 · B키</small></h1><div class="pd">' + longDate(date) + '</div>' +
    '<table><colgroup><col style="width:7%"><col style="width:15%"><col style="width:11%"><col style="width:12%"><col style="width:15%"><col style="width:11%"><col style="width:12%"><col style="width:17%"></colgroup>' +
    '<thead><tr><th rowspan="2">층</th><th colspan="3">A키</th><th colspan="3">B키</th><th rowspan="2">안 가져감</th></tr><tr><th>수령자</th><th>불출시간</th><th>반납확인</th><th>수령자</th><th>불출시간</th><th>반납확인</th></tr></thead><tbody>' +
    s.ledger.map(r => '<tr><th>' + r.floor + '층</th><td>' + who(r.A) + '</td><td>' + out(r.A) + '</td><td>' + ret(r.A) + '</td><td>' + who(r.B) + '</td><td>' + out(r.B) + '</td><td>' + ret(r.B) + '</td><td class="sm">' + r.none.map(d => esc(d.maid)).join(', ') + '</td></tr>').join('') +
    '</tbody></table><div class="pf">반납확인 = 하우스키퍼 오후 대조 시각' + (Object.keys(chkBy).length ? ' · 대조: ' + Object.keys(chkBy).map(k => esc(k) + ' ' + hm(chkBy[k])).join(', ') : '') +
    (none.length ? '<br>안 가져감: ' + none.join(', ') : '') + '<br>정비 레포트 앱 기록 · 출력 ' + hm(Date.now()) + '</div></div>';
}
function draw() {
  $('#who').textContent = role ? role.label + ' · ' + VER : VER;
  if (user === null) return;
  if (!role) { $('#main').innerHTML = loginHtml(); $('#print').innerHTML = ''; $('#sheet').innerHTML = ''; return; }
  const y = window.scrollY;
  $('#main').innerHTML = dateBar() + (st ? mainHtml() : '<div class="card"><p class="note" style="margin:0">' + esc(busy ? '읽는 중…' : msg) + '</p></div>') + (msg && st ? '<div class="card"><p class="err" style="margin:0">' + esc(msg) + '</p></div>' : '');
  $('#sheet').innerHTML = fix ? fixHtml() : '';
  $('#print').innerHTML = printHtml();
  window.scrollTo(0, y);
}

// ---------- 누르기
document.addEventListener('input', e => {
  const t = e.target;
  if (cfgEdit && t.id === 'cf-from') cfgEdit.from = t.value;
  if (cfgEdit && t.id === 'cf-ret') cfgEdit.retText = t.value;
  if (cfgEdit && t.id === 'cf-lost') cfgEdit.lostText = t.value;
  if (fix && t.id === 'fx-maid') fix.maid = t.value;
});
document.addEventListener('change', e => { if (fix && e.target.id === 'fx-maid') fix.maid = e.target.value; if (cfgEdit && e.target.id === 'cf-from') { cfgEdit.from = e.target.value; } });
document.addEventListener('click', e => {
  const t = e.target.closest('button,a'); if (!t) return;
  if (t.hasAttribute('data-who')) { login.who = Number(t.getAttribute('data-who')); login.err = ''; draw(); return; }
  if (t.hasAttribute('data-login')) { doLogin(); return; }
  if (t.hasAttribute('data-logout')) { S.signOut(); return; }
  if (t.hasAttribute('data-print')) { draw(); window.print(); return; }
  if (busy) return;
  if (t.hasAttribute('data-ref')) { load(); return; }
  if (t.hasAttribute('data-day')) { go(addDays(date, Number(t.getAttribute('data-day')))); return; }
  if (!st) return;
  if (t.hasAttribute('data-ck')) { const [f, k, v] = t.getAttribute('data-ck').split(':'); check(Number(f), k, v); return; }
  if (t.hasAttribute('data-allin')) { checkAllIn(); return; }
  if (t.hasAttribute('data-fix')) { fix = { floor: Number(t.getAttribute('data-fix')), maid: '', key: '', reason: '' }; draw(); return; }
  if (fix) {
    if (t.hasAttribute('data-fk')) { const m = $('#fx-maid'); if (m) fix.maid = m.value; fix.key = t.getAttribute('data-fk'); fix.err = ''; draw(); return; }
    if (t.hasAttribute('data-fr')) { const m = $('#fx-maid'); if (m) fix.maid = m.value; fix.reason = t.getAttribute('data-fr'); draw(); return; }
    if (t.hasAttribute('data-fixx')) { fix = null; draw(); return; }
    if (t.hasAttribute('data-fixs')) { const m = $('#fx-maid'); if (m) fix.maid = m.value; saveFix(); return; }
  }
  if (role.k !== 'boss') return;
  if (t.hasAttribute('data-quickoff')) { quickOff(); return; }
  if (t.hasAttribute('data-cfg')) { const c = st.cfg || {}; cfgEdit = { from: c.from || addDays(ymd(), 1), on: c.from ? c.on !== false : true, retText: c.retText || '', lostText: c.lostText == null ? RET_LOST : c.lostText }; draw(); return; }
  if (cfgEdit) {
    if (t.hasAttribute('data-cfon')) { cfgEdit.on = t.getAttribute('data-cfon') === '1'; draw(); return; }
    if (t.hasAttribute('data-cfgx')) { cfgEdit = null; draw(); return; }
    if (t.hasAttribute('data-cfgs')) { saveCfg(); return; }
  }
});
async function doLogin() {
  const pw = ($('#pw') || {}).value || '';
  if (!pw) { login.err = '비밀번호를 적어 주세요.'; draw(); return; }
  login.busy = true; login.err = ''; draw();
  try { await S.signInEmail(ROLES[login.who].email, pw); }
  catch (e) { login.err = /network|offline/i.test(String(e && (e.code || e.message))) ? '인터넷 연결을 확인해 주세요.' : '비밀번호가 맞지 않아요.'; }
  login.busy = false; draw();
}
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'pw') doLogin(); });
function hashDate() { const m = /^#(\d{4}-\d{2}-\d{2})$/.exec(location.hash); return m && m[1] <= ymd() ? m[1] : ymd(); }
function go(d) { if (location.hash !== '#' + d) location.hash = d; else load(d); }
window.addEventListener('hashchange', () => { if (role) { fix = null; load(hashDate()); } });
S.onUser(u => {
  user = u || false; role = roleOf(u);
  if (u && !u.anon && !role) login.err = '지금 로그인된 계정은 키 대장을 볼 수 없어요. 아래에서 다시 들어가 주세요.';
  if (role) { load(hashDate()); auto(); } else draw();
});
window.__keys = { ver: VER };
