// hub/hkho/hkho.js — 🛎️ 하우스키핑 인수인계 (2026-11-26, 엑셀 '하우스키핑 인수인계서'를 앱으로)
// 엑셀 11월 사용 분석: 객실·비고·근무자 칸은 거의 안 씀 → 없앰 / 상태는 완료·추후만 씀 → 진행·완료 두 가지
//   진행 중인 일은 다음 날 주간 맨 위 '이어받은 일'로 자동으로 올라감 (매일 같은 줄 복사하던 것 없앰)
//   난방 시간 · 당직 객실은 맨 위 고정 칸, 지시등은 숫자 + 호실 (미판매 · 정비 전은 안 써서 뺌 → 정비 전은 '기타'로)
//   특이사항 → 기간 공지 (기간이 끝나면 자동으로 안 보임)
// 저장: hkho/{YYYY-MM-DD} = { date, heat, duty, lights:{이름:{n,r}}, day:[항목], night:[항목] } · hkho/notes = { list:[{id,title,from,to,body}] }
//   항목 = { id, t, done, doneAt, at }   (규칙 v31: 읽기 관리자 · 하우스키퍼 · 파트장, 쓰기 관리자 · 하우스키퍼)
// 작성자 이름은 안 받음 (11/26 소장님: 전체가 같이 보는 내용)
import * as S from '../../rm/app/store.js';

const VER = '2026.11.26-1';
const ROLES = [
  { k: 'hk', label: '하우스키퍼', email: 'unieshaeundae+hk@gmail.com', uid: 'nBL2QYezEmRNRmBRMXN6LNPJO2s2' },
  { k: 'boss', label: '소장', email: 'unieshaeundae+admin@gmail.com', uid: 'iw2orXgIgPgTbLUQa0b41XJ9Dvd2' },
  { k: 'boss', label: '부소장', email: 'unieshaeundae+sub@gmail.com', uid: 'Fz4T5ZzIxShOdVkNpF9gzMmOLED2' },
  { k: 'insp', label: '파트장', email: 'unieshaeundae+insp@gmail.com', uid: '4sVIUKcXtYg28Lm7Qw41UqI6hRX2' }
];
const LIGHTS = ['미정비', '시설하자', 'H/U', '악취', '당직', '기타'];
const SHIFTS = [['day', '☀️ 주간', 'p-day'], ['night', '🌙 야간', 'p-night']];
const QUICK = { day: ['가입력', '무료 재실', '비품교체', '우선정비', '시설 신고', '습득물'], night: ['난방', '가입력', '무료 재실', '당직', '룸체인지 미정비', '지시'] };
const QTXT = { '난방': '금일 난방 ~ 익일 가동', '가입력': '호 가입력 — 익일 전산 퇴실 예정', '무료 재실': '익일 호 무료 재실 배정 부탁', '비품교체': '단체 비품교체 : 실', '우선정비': '시까지 우선정비 부탁', '시설 신고': '호 시설 신고 — ', '습득물': '습득물 : 호 ', '당직': '금일 당직 객실 : 호', '룸체인지 미정비': '호 룸체인지 미정비 — 익일 배정 부탁', '지시': '지시 : ' };
// 종류 표시: 글자를 보고 자동으로 (앞에 있는 것이 먼저)
const TAGS = [
  ['난방', 'g-heat', /난방/], ['지시', 'g-cmd', /지시|소장님|부소장님|파트장님|총지배인/], ['습득물', 'g-etc', /습득|분실/],
  ['시설', 'g-fac', /시설|고장|파손|수리|누수|작동\s*x|낙서|배관|온수/i], ['우선정비', 'g-pri', /우선\s*정비|\d{1,2}시까지/],
  ['단체·비품', 'g-grp', /단체|비품|학단|기물|생수|수건/], ['가입력', 'g-in', /가입력/], ['재실', 'g-in', /재실/],
  ['H/U', 'g-etc', /H\s*[\/.]\s*U|하우스\s*유즈/i], ['당직', 'g-etc', /당직/], ['룸체인지', 'g-etc', /룸\s*체인지|룸체|R\/C/i]
];

const $ = s => document.querySelector(s);
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const seoul = (t = Date.now()) => new Date(t + 9 * 3600e3);
const today = () => seoul().toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const DW = ['일', '월', '화', '수', '목', '금', '토'];
const dow = d => new Date(d + 'T00:00:00Z').getUTCDay();
const md = d => Number(d.slice(5, 7)) + '/' + Number(d.slice(8));
const hm = t => { if (!t) return ''; const d = seoul(Number(t)); return ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2); };
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const roomOk = (f, r) => f >= 3 && f <= 31 && r >= 1 && r <= 17;

let role = null, login = { who: 0, err: '', busy: false };
let D = today();                 // 보고 있는 날
let docs = {};                   // 날짜 → 문서 (D-14 ~)
let notes = [];                  // 기간 공지
let ui = { edit: null, lt: false, note: null, heat: null };
let unsub = [];

// ---------- 글자 꾸미기: 호실 번호를 칩으로 (1203 · 1203호 · 1701~1704)
function roomify(t) {
  return esc(t).replace(/(^|[^\d])(\d{3,4})(\s*[~\-]\s*(\d{1,4}))?(호)?(?=[^\d]|$)/g, (all, pre, a, rng, b, ho) => {
    const n = Number(a), f = Math.floor(n / 100), r = n % 100;
    if (!roomOk(f, r)) return all;
    if (rng) { const bn = Number(b), e = b.length <= 2 ? f * 100 + bn : bn; if (Math.floor(e / 100) === f && e > n && roomOk(f, e % 100)) return pre + '<span class="rm">' + a + '~' + e + (ho || '') + '</span>'; }
    return pre + '<span class="rm">' + a + (rng ? '' : ho || '') + '</span>' + (rng ? rng + (ho || '') : '');
  });
}
function tagOf(t) { for (const [n, c, re] of TAGS) if (re.test(t)) return [n, c]; return ['기타', 'g-etc']; }
function rooms(s) { return (String(s || '').match(/\d{3,4}/g) || []).filter(x => roomOk(Math.floor(x / 100), x % 100)); }

// ---------- 불러오기 (보고 있는 날 기준 14일 전부터 실시간)
function watch() {
  unsub.forEach(f => { try { f(); } catch (e) {} }); unsub = [];
  const from = addDays(D, -14);
  unsub.push(S.listenQuery('hkho', [['date', '>=', from]], list => {
    docs = {}; list.forEach(x => { if (x.data && x.data.date) docs[x.data.date] = x.data; });
    setSync('실시간 · ' + hm(Date.now())); draw();
  }, e => fail(e)));
  unsub.push(S.listenDoc('hkho/notes', x => { notes = (x && x.list) || []; draw(); }, () => {}));
}
function fail(e) {
  const m = String(e && (e.code || e.message) || e);
  $('#app').innerHTML = '<div class="card"><b>불러오지 못했어요</b><p class="empty">' + (/permission/i.test(m) ? '권한이 없어요 — Firestore 규칙 v31(인수인계 대장)이 게시됐는지 확인해 주세요.' : esc(m)) + '</p></div>';
}
function setSync(t) { const el = $('#sync'); if (el) el.textContent = t; }
const ro = () => !role || role.k === 'insp';
const cur = () => docs[D] || { date: D, heat: '', duty: '', lights: {}, day: [], night: [] };

// ---------- 저장 (화면 먼저 바꾸고 뒤에서 저장)
async function save(date, patch) {
  const base = docs[date] || { date, heat: '', duty: '', lights: {}, day: [], night: [] };
  docs[date] = Object.assign({}, base, patch); draw();
  try { await S.merge('hkho/' + date, Object.assign({ date }, patch, { at: S.SERVER_TIME, by: role ? role.label : '' })); setSync('저장됨 · ' + hm(Date.now())); }
  catch (e) { toast('저장하지 못했어요 — 인터넷을 확인해 주세요'); setSync('저장 실패'); try { S.logErr && S.logErr('hkho', e); } catch (x) {} }
}
function items(date, sh) { return ((docs[date] || {})[sh] || []).slice(); }
function setItem(date, sh, id, fn) {
  const L = items(date, sh), i = L.findIndex(x => x.id === id); if (i < 0) return;
  const v = fn(Object.assign({}, L[i])); if (v === null) L.splice(i, 1); else L[i] = v;
  save(date, { [sh]: L });
}
// 이어받은 일 = 보고 있는 날보다 앞선 날(14일 안)의 진행 중인 일
function carried() {
  const out = [];
  Object.keys(docs).filter(d => d < D).sort().forEach(d => SHIFTS.forEach(([sh]) => (docs[d][sh] || []).forEach(x => { if (!x.done) out.push({ d, sh, x }); })));
  return out;
}

// ---------- 그리기
function dayChips() {
  const mon = addDays(D, -((dow(D) + 6) % 7)), t = today();
  let h = '<div class="daychips"><button class="nav" data-wk="-7" aria-label="지난주">‹</button>';
  for (let i = 0; i < 7; i++) {
    const d = addDays(mon, i), cls = [d === D ? 'on' : '', d === t ? 'today' : '', d < t ? 'past' : ''].join(' ').trim();
    h += '<button data-d="' + d + '" class="' + cls + '">' + DW[dow(d)] + '<small>' + md(d) + '</small></button>';
  }
  return h + '<button class="nav" data-wk="7" aria-label="다음 주">›</button></div>';
}
function glance(c) {
  const L = c.lights || {}, sum = LIGHTS.reduce((a, k) => a + (Number((L[k] || {}).n) || 0), 0);
  const fi = (f, v, ph) => ro() ? '<div class="big">' + (v ? esc(v) : '<span style="color:#B5BCC8">—</span>') + '</div>' : '<input class="fi" data-f="' + f + '" value="' + esc(v || '') + '" placeholder="' + ph + '">';
  let h = '<div class="glance' + (ro() ? ' ro' : '') + '">' +
    '<div class="card"><div class="k">🔥 객실 난방</div>' + fi('heat', c.heat, '예) 18:00 ~ 07:00') + '</div>' +
    '<div class="card"><div class="k">🌙 당직 객실</div>' + fi('duty', c.duty, '호실') + '</div>' +
    '<div class="card lights-card"><div class="k">🚨 지시등 현황' + (ro() ? '' : ' <span style="font-weight:500">· 누르면 숫자 · 호실을 적어요</span>') + '</div><div class="lights">';
  LIGHTS.forEach(k => { const o = L[k] || {}, n = Number(o.n) || 0; h += '<span class="lt' + (n ? '' : ' z') + '" data-lt="1">' + k + ' <b>' + n + '</b>' + (o.r ? '<i>' + esc(rooms(o.r).join(' · ') || o.r) + '</i>' : '') + '</span>'; });
  h += '<span class="lt sum" data-lt="1">합계 <b>' + sum + '</b></span></div>';
  if (ui.lt && !ro()) h += '<div class="lted">' + LIGHTS.map(k => { const o = L[k] || {}; return '<label>' + k + '<input data-ln="' + k + '" inputmode="numeric" value="' + esc(o.n == null ? '' : o.n) + '" placeholder="숫자"><input data-lr="' + k + '" value="' + esc(o.r || '') + '" placeholder="호실 (선택)"></label>'; }).join('') +
    '<div class="row"><button class="btn sm pri" data-ltok="1">다 됐어요</button><span class="empty" style="padding:0">호실만 적으면 숫자는 호실 개수로 채워져요</span></div></div>';
  return h + '</div></div>';
}
function noticeCard() {
  const act = notes.filter(n => n.from <= D && D <= (n.to || n.from)).sort((a, b) => (a.to || a.from) < (b.to || b.from) ? -1 : 1);
  let h = '<div class="card notice"><h3>📌 기간 공지 <span style="font-size:12px;color:var(--muted);font-weight:600">기간이 끝나면 자동으로 사라져요</span>' +
    (ro() ? '' : '<button class="btn sm noprint" data-nadd="1" style="margin-left:auto">+ 공지</button>') + '</h3>';
  h += act.length ? '<div class="nl">' + act.map(n => '<div class="ni">' + (ro() ? '' : '<button class="ed" data-ned="' + esc(n.id) + '">고치기</button>') +
    '<span class="t">' + esc(n.title) + '</span><span class="p">' + md(n.from) + (n.to && n.to !== n.from ? ' ~ ' + md(n.to) : '') + '</span>' +
    (n.body ? '<div class="d">' + roomify(n.body).replace(/\n/g, '<br>') + '</div>' : '') + '</div>').join('') + '</div>' : '<div class="empty">오늘 해당하는 공지가 없어요.</div>';
  if (ui.note) {
    const n = ui.note;
    h += '<div class="nform"><input data-nf="title" value="' + esc(n.title) + '" placeholder="제목 (예: 2911호 난방 수리)">' +
      '<div class="row"><input type="date" data-nf="from" value="' + esc(n.from) + '" style="width:auto"> ~ <input type="date" data-nf="to" value="' + esc(n.to) + '" style="width:auto"></div>' +
      '<textarea data-nf="body" placeholder="내용 · 호실 (예: 2910, 2911호 판매 금지)">' + esc(n.body) + '</textarea>' +
      '<div class="row"><button class="btn sm pri" data-nsave="1">저장</button><button class="btn sm" data-ncancel="1">취소</button>' + (n.id ? '<button class="btn sm red" data-ndel="1" style="margin-left:auto">지우기</button>' : '') + '</div></div>';
  }
  return h + '</div>';
}
function itemHtml(x, date, sh, carry) {
  const key = date + '|' + sh + '|' + x.id;
  if (ui.edit === key) return '<div class="it"><div class="ck"></div><div class="ited"><textarea data-et="1">' + esc(x.t) + '</textarea><div class="row"><button class="btn sm pri" data-esave="' + esc(key) + '">저장</button><button class="btn sm" data-ecancel="1">취소</button><button class="btn sm red" data-edel="' + esc(key) + '" style="margin-left:auto">지우기</button></div></div><span></span></div>';
  const [tn, tc] = tagOf(x.t), age = carry ? Math.round((Date.parse(D) - Date.parse(date)) / 864e5) : 0;
  const meta = carry ? md(date) + ' ' + (sh === 'day' ? '주간' : '야간') + '부터' + (age >= 2 ? ' · ' + (age + 1) + '일째' : '')
    : (x.at ? hm(x.at) : '') + (x.done && x.doneAt ? ' · 완료 ' + hm(x.doneAt) : '');
  return '<div class="it' + (x.done ? ' done' : '') + '"><div class="ck" data-ck="' + esc(key) + '" role="button" aria-label="완료">' + (x.done ? '✓' : '') + '</div>' +
    '<div><div class="tx" data-ed="' + esc(key) + '"><span class="tg ' + tc + '">' + tn + '</span>' + roomify(x.t) + '</div>' + (meta ? '<div class="mt">' + meta + '</div>' : '') + '</div>' +
    '<span class="st' + (carry ? ' cont' : '') + '">' + (x.done ? '완료' : carry ? '이어서' : '진행') + '</span></div>';
}
function shiftCard(sh, label, pill, c) {
  const L = c[sh] || [];
  let h = '<div class="card col' + (ro() ? ' ro' : '') + '"><h3><span class="pill ' + pill + '">' + label + '</span> 인계</h3>';
  if (sh === 'day') {
    const cr = carried();
    if (cr.length) h += '<div class="carry"><div class="k">↪ 이어받은 일 ' + cr.length + '</div>' + cr.map(o => itemHtml(o.x, o.d, o.sh, true)).join('') + '</div>';
  }
  h += '<div class="list">' + (L.length ? L.map(x => itemHtml(x, D, sh, false)).join('') : '<div class="empty">아직 적은 인계가 없어요.</div>') + '</div>';
  if (!ro()) h += '<div class="add"><input data-add="' + sh + '" placeholder="+ 인계 사항 적기 (Enter)' + (sh === 'day' ? ' · 호실 번호는 자동으로 표시돼요' : '') + '"></div>' +
    '<div class="quick">' + QUICK[sh].map(q => '<span data-q="' + sh + '" data-v="' + esc(q) + '">' + esc(q) + '</span>').join('') + '</div>';
  return h + '</div>';
}
function draw() {
  if (!role) { drawLogin(); return; }
  const c = cur(), all = SHIFTS.reduce((a, [sh]) => a.concat(c[sh] || []), []), done = all.filter(x => x.done).length, cr = carried().length;
  const keep = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.add;
  const kv = keep ? document.activeElement.value : '';
  $('#app').innerHTML = '<div class="ph">하우스키핑 인수인계 · ' + D.slice(0, 4) + '년 ' + md(D) + ' (' + DW[dow(D)] + ')</div>' + dayChips() + glance(c) + noticeCard() +
    '<div class="cols">' + SHIFTS.map(([sh, l, p]) => shiftCard(sh, l, p, c)).join('') + '</div>' +
    '<div class="foot"><span>' + md(D) + ' 등록 <b>' + all.length + '</b> · 완료 <b>' + done + '</b> · 진행 <b>' + (all.length - done) + '</b>' + (cr ? ' · 이어받은 일 <b>' + cr + '</b>' : '') + '</span><span class="sp"></span>' +
    '<span>진행 중인 일은 다음 날 주간 맨 위 \'이어받은 일\'로 자동으로 올라가요</span></div>' +
    (role.k === 'boss' ? '<div class="imp noprint">📥 예전 엑셀 대장 옮기기: <input type="file" id="impFile" accept=".xlsx"> <span id="impMsg"></span></div>' : '');
  if (keep) { const el = document.querySelector('[data-add="' + keep + '"]'); if (el) { el.value = kv; el.focus(); } }
  if (ui.edit) { const ta = document.querySelector('[data-et]'); if (ta && document.activeElement !== ta) { ta.focus(); ta.selectionStart = ta.value.length; } }
}
function drawLogin() {
  $('#app').innerHTML = '<div class="card login"><h3 style="margin:0">로그인</h3><div class="seg">' + ROLES.map((r, i) => '<button data-who="' + i + '" aria-pressed="' + (login.who === i) + '">' + r.label + '</button>').join('') + '</div>' +
    '<input id="pw" type="password" autocomplete="current-password" placeholder="비밀번호">' + (login.err ? '<p class="err">' + esc(login.err) + '</p>' : '') +
    '<button class="btn pri" data-login="1" style="margin-top:10px;width:100%"' + (login.busy ? ' disabled' : '') + '>' + (login.busy ? '확인 중…' : '들어가기') + '</button>' +
    '<p class="empty">허브에서 들어오면 같은 로그인으로 바로 열려요.</p></div>';
}
let tt = 0; function toast(m) { const el = $('#toast'); el.textContent = m; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 2200); }

// ---------- 누르기
function parseKey(k) { const [d, sh, id] = k.split('|'); return { d, sh, id }; }
document.addEventListener('click', e => {
  const t = e.target, at = s => t.closest(s);
  if (at('#printBtn')) { e.preventDefault(); window.print(); return; }
  const w = at('[data-who]'); if (w) { login.who = Number(w.dataset.who); login.err = ''; drawLogin(); return; }
  if (at('[data-login]')) { doLogin(); return; }
  if (!role) return;
  const dd = at('[data-d]'); if (dd) { go(dd.dataset.d); return; }
  const wk = at('[data-wk]'); if (wk) { go(addDays(D, Number(wk.dataset.wk))); return; }
  if (ro()) return;
  if (at('[data-ltok]')) { ui.lt = false; draw(); return; }
  if (at('[data-lt]')) { ui.lt = !ui.lt; draw(); return; }
  const ck = at('[data-ck]'); if (ck) { const k = parseKey(ck.dataset.ck); setItem(k.d, k.sh, k.id, x => Object.assign(x, x.done ? { done: false, doneAt: 0 } : { done: true, doneAt: Date.now() })); return; }
  const ed = at('[data-ed]'); if (ed && !window.getSelection().toString()) { ui.edit = ed.dataset.ed; draw(); return; }
  const es = at('[data-esave]'); if (es) { const k = parseKey(es.dataset.esave), v = (document.querySelector('[data-et]').value || '').trim(); ui.edit = null; if (!v) { draw(); return; } setItem(k.d, k.sh, k.id, x => Object.assign(x, { t: v })); return; }
  if (at('[data-ecancel]')) { ui.edit = null; draw(); return; }
  const el = at('[data-edel]'); if (el) {
    if (el.dataset.ask !== '1') { el.dataset.ask = '1'; el.textContent = '한 번 더 누르면 지워져요'; return; }
    const k = parseKey(el.dataset.edel); ui.edit = null; setItem(k.d, k.sh, k.id, () => null); toast('지웠어요'); return;
  }
  const q = at('[data-q]'); if (q) { const inp = document.querySelector('[data-add="' + q.dataset.q + '"]'); if (inp) { inp.value = QTXT[q.dataset.v] || q.dataset.v; inp.focus(); } return; }
  if (at('[data-nadd]')) { ui.note = { id: '', title: '', from: D, to: D, body: '' }; draw(); return; }
  const ne = at('[data-ned]'); if (ne) { const n = notes.find(x => x.id === ne.dataset.ned); if (n) { ui.note = Object.assign({}, n); draw(); } return; }
  if (at('[data-ncancel]')) { ui.note = null; draw(); return; }
  if (at('[data-nsave]')) { saveNote(false); return; }
  const nd = at('[data-ndel]'); if (nd) { if (nd.dataset.ask !== '1') { nd.dataset.ask = '1'; nd.textContent = '한 번 더 누르면 지워져요'; return; } saveNote(true); return; }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.nf && ui.note) ui.note[t.dataset.nf] = t.value;
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'impFile' && t.files && t.files[0]) { importXlsx(t.files[0]); return; }
  if (!role || ro()) return;
  if (t.dataset.f) { const v = t.value.trim(); if (v !== (cur()[t.dataset.f] || '')) save(D, { [t.dataset.f]: v }); return; }
  if (t.dataset.ln || t.dataset.lr) {
    const k = t.dataset.ln || t.dataset.lr, L = Object.assign({}, cur().lights || {}), o = Object.assign({ n: null, r: '' }, L[k] || {});
    if (t.dataset.ln) o.n = t.value.trim() === '' ? null : Number(t.value) || 0;
    else { o.r = t.value.trim(); const rn = rooms(o.r).length; if (rn && (o.n == null || o.n < rn)) o.n = rn; }
    L[k] = o; save(D, { lights: L }); return;
  }
});
document.addEventListener('keydown', e => {
  const t = e.target;
  if (e.key === 'Enter' && t.id === 'pw') { doLogin(); return; }
  if (e.key === 'Enter' && t.dataset && t.dataset.add && !e.isComposing) {
    e.preventDefault(); const v = t.value.trim(); if (!v) return;
    const sh = t.dataset.add, L = items(D, sh); L.push({ id: newId(), t: v, done: false, doneAt: 0, at: Date.now() });
    t.value = ''; save(D, { [sh]: L }); return;
  }
  if (e.key === 'Enter' && t.classList && t.classList.contains('fi')) { t.blur(); return; }
  if (e.key === 'Escape' && (ui.edit || ui.note)) { ui.edit = null; ui.note = null; draw(); }
});
async function saveNote(del) {
  const n = ui.note; if (!n) return;
  let list = notes.slice();
  if (del) list = list.filter(x => x.id !== n.id);
  else {
    const o = { id: n.id || newId(), title: String(n.title || '').trim(), from: n.from || D, to: n.to || n.from || D, body: String(n.body || '').trim() };
    if (!o.title) { toast('제목을 적어 주세요'); return; }
    if (o.to < o.from) { const x = o.to; o.to = o.from; o.from = x; }
    const i = list.findIndex(x => x.id === o.id); if (i >= 0) list[i] = o; else list.push(o);
  }
  list = list.filter(x => (x.to || x.from) >= addDays(today(), -120));   // 넉 달 지난 공지는 정리
  ui.note = null; notes = list; draw();
  try { await S.set('hkho/notes', { list, at: S.SERVER_TIME, by: role.label }); toast(del ? '공지를 지웠어요' : '공지를 저장했어요'); }
  catch (e) { toast('저장하지 못했어요'); }
}
function go(d) { ui = { edit: null, lt: false, note: null }; D = d; if (location.hash !== '#' + d) history.replaceState(null, '', '#' + d); watch(); draw(); }
async function doLogin() {
  const pw = ($('#pw') || {}).value || '';
  if (!pw) { login.err = '비밀번호를 적어 주세요.'; drawLogin(); return; }
  login.busy = true; login.err = ''; drawLogin();
  try { await S.signInEmail(ROLES[login.who].email, pw); } catch (e) { login.err = '비밀번호가 맞지 않아요.'; }
  login.busy = false; if (!role) drawLogin();
}

// ---------- 예전 엑셀 대장 옮기기 (소장 · 부소장, 한 번) — 파일은 이 브라우저에서만 열고 바로 저장
//   시트 1~31 · 설정(B3 연도, B4 월). 주간 C7:C18 / 야간 C22:C33, 상태 Q열. 특이사항 S7. 지시등 X21·X23·X25·X27 · AE21·AE23·AE25·AE27
//   상태: 완료 → 완료 / 추후·진행 → 진행 / 빈칸 → 지난날은 완료(엑셀에서 정리 안 한 것), 오늘은 진행
//   손님 전화번호는 가운데를 가림
async function importXlsx(file) {
  const msg = t => { const el = $('#impMsg'); if (el) el.textContent = t; };
  try {
    msg('읽는 중…');
    const { readSheets } = await import('../leave/import.js?v=2026.11.21-1');
    const want = ['설정'].concat(Array.from({ length: 31 }, (_, i) => String(i + 1)));
    const book = await readSheets(new Uint8Array(await file.arrayBuffer()), want);
    const cell = (rows, r, c) => { const row = (rows || []).find(x => x.r === r); const v = row ? row[c] : ''; return v == null ? '' : String(v).trim(); };
    const set = book['설정'], Y = Number(cell(set, 3, 1)), M = Number(cell(set, 4, 1));
    if (!Y || !M) throw new Error('설정 시트에서 연도 · 월을 못 찾았어요');
    const mask = s => s.replace(/(01[016789])[-\s.]?(\d{3,4})[-\s.]?(\d{4})/g, '$1-****-$3');
    const t0 = today(), out = [], spc = [];
    for (let d = 1; d <= 31; d++) {
      const rows = book[String(d)]; if (!rows) continue;
      const date = Y + '-' + ('0' + M).slice(-2) + '-' + ('0' + d).slice(-2);
      if (new Date(date + 'T00:00:00Z').getUTCMonth() + 1 !== M || date > t0) continue;
      const doc = { date, heat: '', duty: '', lights: {}, day: [], night: [] };
      const take = (sh, a, b) => { for (let r = a; r <= b; r++) {
        let t = mask(cell(rows, r, 2)); if (!t) continue; const st = cell(rows, r, 16);
        const done = st === '완료' || (!st && date < t0);
        const at = Date.parse(date + 'T' + (sh === 'day' ? '09' : '18') + ':00:00+09:00') + r * 60e3;
        doc[sh].push({ id: 'x' + d + sh[0] + r, t, done, doneAt: done ? at : 0, at, src: 'xl' });
        if (!doc.heat && /난방/.test(t)) { const m = /(\d{1,2})\s*[:시]\s*(\d{2})?\s*분?\s*[~\-]\s*(?:익일\s*)?(\d{1,2})\s*[:시]?\s*(\d{2})?/.exec(t); if (m) doc.heat = ('0' + m[1]).slice(-2) + ':' + (m[2] || '00') + ' ~ ' + ('0' + m[3]).slice(-2) + ':' + (m[4] || '00'); }
        if (!doc.duty) { const m = /당직\s*객실\s*[:：]?\s*(\d{3,4})/.exec(t) || /(\d{3,4})\s*호?\s*당직/.exec(t); if (m) doc.duty = m[1]; }
      } };
      take('day', 7, 18); take('night', 22, 33);
      const num = (r, c) => { const v = cell(rows, r, c); return v === '' || isNaN(Number(v)) ? null : Number(v); };
      [[23, 21, '미정비'], [23, 23, '시설하자'], [23, 25, 'H/U'], [23, 27, '기타'], [30, 21, '당직'], [30, 23, '악취'], [30, 27, '기타']].forEach(([c, r, k]) => {
        const n = num(r, c); if (n == null || (n === 0 && !doc.lights[k])) return;
        const o = doc.lights[k] || { n: 0, r: '' }; o.n = (o.n || 0) + n; doc.lights[k] = o;
      });
      const sp = mask(cell(rows, 7, 18)); if (sp) spc.push({ date, body: sp });
      if (doc.day.length || doc.night.length || doc.heat || Object.keys(doc.lights).length) out.push(doc);
    }
    // 엑셀에서 '추후 진행'을 다음 날 다시 복사해 적던 줄 → 마지막 날 것만 남기고, 나흘 넘게 지난 '추후'는 끝난 것으로 (이어받은 일이 쌓이지 않게)
    const norm = t => t.replace(/\s+/g, '').replace(/^(금일|익일)/, '');
    const last = {}; out.forEach(o => ['day', 'night'].forEach(sh => o[sh].forEach(x => { last[norm(x.t)] = o.date; })));
    out.forEach(o => ['day', 'night'].forEach(sh => o[sh].forEach(x => { if (!x.done && (last[norm(x.t)] > o.date || o.date < addDays(t0, -3))) { x.done = true; x.doneAt = x.at; } })));
    // 특이사항: 같은 글이 이어진 날은 한 공지로 (기간 = 처음 ~ 마지막 날)
    const nl = [];
    spc.forEach(s => { const p = nl.find(n => n.body === s.body && addDays(n.to, 1) === s.date); if (p) p.to = s.date; else nl.push({ id: 'x' + s.date, title: (s.body.split('\n').find(l => l.trim()) || '').replace(/[<>]/g, '').trim().slice(0, 40), from: s.date, to: s.date, body: s.body }); });
    const exist = out.filter(o => docs[o.date] && ((docs[o.date].day || []).some(x => x.src !== 'xl') || (docs[o.date].night || []).some(x => x.src !== 'xl')));
    if (!confirm(M + '월 ' + out.length + '일 치 (인계 ' + out.reduce((a, o) => a + o.day.length + o.night.length, 0) + '줄 · 특이사항 ' + nl.length + '건)을 옮길까요?' +
      (exist.length ? '\n\n※ 앱에 이미 적은 날 ' + exist.length + '일은 엑셀 내용을 앞에 붙이고 앱 내용은 그대로 둬요.' : ''))) { msg(''); return; }
    let k = 0;
    for (const o of out) {
      const old = docs[o.date] || {};
      const keep = sh => (old[sh] || []).filter(x => x.src !== 'xl');
      await S.set('hkho/' + o.date, Object.assign({}, o, { heat: old.heat || o.heat, duty: old.duty || o.duty, lights: Object.keys(old.lights || {}).length ? old.lights : o.lights,
        day: o.day.concat(keep('day')), night: o.night.concat(keep('night')), at: S.SERVER_TIME, by: role.label + ' (엑셀 옮김)' }));
      msg('저장 중… ' + (++k) + '/' + out.length);
    }
    const nn = notes.filter(n => !String(n.id).startsWith('x' + Y + '-' + ('0' + M).slice(-2))).concat(nl);
    await S.set('hkho/notes', { list: nn, at: S.SERVER_TIME, by: role.label });
    msg('✅ ' + out.length + '일 치를 옮겼어요'); toast('옮겼어요');
  } catch (e) { msg('❌ ' + (e && e.message || e)); }
}

// ---------- 시작
const hd = /^#(\d{4}-\d{2}-\d{2})$/.exec(location.hash); if (hd) D = hd[1];
S.onUser(u => {
  const r = u && !u.anon ? ROLES.find(x => x.uid === u.uid || x.email === u.email) : null;
  if (u && !u.anon && !r) login.err = '지금 로그인된 계정은 인수인계 대장을 열 수 없어요. 아래에서 다시 들어가 주세요.';
  const was = role; role = r || null;
  if (role && !was) watch();
  draw();
});
window.__hkho = { ver: VER };
