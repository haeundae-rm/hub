// hub/lost/lost.js — 🧳 습득물 관리대장 (2026-11-22, 오더테이커 엑셀 「객실 습득물 관리 대장」을 대신함)
// 메이드가 정비 레포트 '🧳 습득물'로 접수하면 여기에 저절로 한 줄. 앱을 안 쓰는 분 것은 [+ 수기 기재]
// 오더테이커(하우스키퍼 공용 계정) · 소장 · 부소장: 확인 · 조치(F/D · 택배 · 직접인계 · 폐기 · 경찰 인계 · 보관함) · 조치일 자동 · 특이사항
// 탭: 날짜별 대장 / 귀중품 모아보기 / 처리 대기(경찰 인계 대기 · 30일 폐기 대상 · 음식 3일 · 확인 안 함) · 이번 달 엑셀
// 읽기: 열 때 한 번 (최근 두 달 + 고른 달, 날짜 한 조건) · 사진은 줄을 눌렀을 때만 (lost_img)
import * as S from '../../rm/app/store.js';
import * as XW from '../xlsxw.js?v=2026.11.22-2';
import { CATS, DONE, KEEP, ACTS, isDone, isValuable, ageDays, todo, valuables, excel, check, byTime } from './lostcalc.js?v=2026.11.22-2';
import { readBook, parseLedger } from './lostxl.js?v=2026.11.28-1';

const VER = '2026.11.28-2';
const START_YM = '2026-11';   // 월 단추는 이 달부터 (앱 대장 시작 · 11월은 엑셀에서 옮김)
const ROLES = [
  { k: 'hk', label: '하우스키퍼', email: 'unieshaeundae+hk@gmail.com', uid: 'nBL2QYezEmRNRmBRMXN6LNPJO2s2' },
  { k: 'boss', label: '소장', email: 'unieshaeundae+admin@gmail.com', uid: 'iw2orXgIgPgTbLUQa0b41XJ9Dvd2' },
  { k: 'boss', label: '부소장', email: 'unieshaeundae+sub@gmail.com', uid: 'Fz4T5ZzIxShOdVkNpF9gzMmOLED2' }
];
const PLACE = { 귀중품: '귀중품 보관함', 음식: '습득물 냉장고', 파손주의: '파손주의 보관함' };
const $ = s => document.querySelector(s);
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const seoul = (t = Date.now()) => new Date(t + 9 * 3600e3);
const ymd = (t = Date.now()) => seoul(t).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const md = d => Number(d.slice(5, 7)) + '/' + Number(d.slice(8)) + '(' + DAYS[new Date(d + 'T00:00:00Z').getUTCDay()] + ')';
const hm = t => { if (!t) return ''; const d = seoul(Number(t)); return ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2); };
function toast(t) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 2600); }
const errOf = e => /permission/i.test(String(e && (e.code || e.message))) ? '권한이 없어요 (규칙 v27 게시 전이면 아직 저장이 안 돼요).' : String(e && (e.code || e.message) || e);

let user = null, role = null, login = { who: 0, err: '', busy: false };
let date = ymd(), tab = 'day', list = [], from = '', busy = false, msg = '', ed = null, pics = {}, loadedAt = 0, cal = false, imp = null;
// 📅 대장이 있는 달 목록 meta/lost_months { list:['2026-10', …] } (11/28 소장님: 10월을 옮겼는데 10월 단추가 안 보임) — 옮기기 · 저장 때 더하고, 처음엔 옛 달을 한 번 훑어 채움
let MONS = new Set(), monsLoaded = false;
async function loadMonths() {
  if (monsLoaded) return; monsLoaded = true;
  try { const m = await S.get('meta/lost_months'); if (m && Array.isArray(m.list)) { m.list.forEach(x => MONS.add(x)); return; }
    const old = await S.getQuery('lost', [['date', '<', START_YM + '-01']]); old.forEach(x => x.data && x.data.date && MONS.add(x.data.date.slice(0, 7)));
    list.forEach(x => x.date && MONS.add(x.date.slice(0, 7))); await S.set('meta/lost_months', { list: [...MONS].sort(), at: S.SERVER_TIME });
  } catch (e) {}
}
async function addMonths(ms) { const add = [...new Set(ms)].filter(m => /^\d{4}-\d{2}$/.test(m) && !MONS.has(m)); if (!add.length) return; add.forEach(m => MONS.add(m)); try { await S.set('meta/lost_months', { list: [...MONS].sort(), at: S.SERVER_TIME }); } catch (e) {} }

function roleOf(u) { if (!u || u.anon) return null; return ROLES.filter(r => r.uid === u.uid || r.email === u.email)[0] || null; }

// ---------- 읽기
async function load(force) {
  const need = [addDays(ymd(), -62), date.slice(0, 7) + '-01'].sort()[0];
  if (!force && from && from <= need) { draw(); return; }
  busy = true; draw();
  try {
    const xs = await S.getQuery('lost', [['date', '>=', need]]);
    list = xs.map(x => Object.assign({ id: x.id }, x.data)); from = need; msg = ''; loadedAt = Date.now();
    await loadMonths(); list.forEach(x => x.date && MONS.add(x.date.slice(0, 7)));
  } catch (e) { msg = '읽지 못했어요: ' + errOf(e); }
  busy = false; draw();
}

// ---------- 쓰기
const clean = x => { const o = {}; Object.keys(x).forEach(k => { if (k === 'id' || x[k] === undefined) return; o[k] = ['clientAt', 'at', 'chkAt'].indexOf(k) >= 0 && typeof x[k] === 'number' ? new Date(x[k]) : x[k]; }); return o; };   // 시각은 다시 Timestamp 로
async function put(x, note) {
  const doc = Object.assign(clean(x), { upd: S.SERVER_TIME, updBy: role.label });
  await S.set('lost/' + x.id, doc);
  const i = list.findIndex(y => y.id === x.id); const keep = Object.assign({}, x, { upd: Date.now(), updBy: role.label });
  if (i >= 0) list[i] = keep; else { list.push(keep); addMonths([x.date.slice(0, 7)]); }
  if (note) toast(note);
}
async function toggleChk(id) {
  const x = list.filter(y => y.id === id)[0]; if (!x) return;
  const y = Object.assign({}, x, { chk: !x.chk, chkBy: !x.chk ? role.label : '', chkAt: !x.chk ? Date.now() : 0 });
  try { await put(y); } catch (e) { toast('저장 못 했어요: ' + errOf(e)); }
  draw();
}
function openEdit(id) {
  const x = id ? list.filter(y => y.id === id)[0] : null;
  ed = x ? Object.assign({}, x) : { id: '', date, room: '', item: '', cat: '', police: false, note: '', by: '', src: 'hub', chk: true, act: '', actDay: '', actBy: '', memo: '', err: '' };
  ed.err = ''; ed.busy = false; draw();
  if (x && x.src === 'app' && !pics[x.id]) S.get('lost_img/' + x.id).then(d => { pics[x.id] = (d && d.p) || []; draw(); }, () => { pics[x.id] = []; draw(); });
}
function readEd() {
  const v = id => { const el = $('#' + id); return el ? el.value : undefined; };
  ['room', 'item', 'note', 'memo', 'by', 'date', 'actDay'].forEach(k => { const x = v('le-' + k); if (x !== undefined) ed[k] = x.trim ? x.trim() : x; });
  const p = $('#le-police'); if (p) ed.police = p.checked;
  const c = $('#le-chk'); if (c) ed.chk = c.checked;
}
async function saveEd() {
  readEd();
  ed.room = ed.room === '복도' ? '공용' : ed.room;
  const err = check(ed); if (err) { ed.err = err; draw(); return; }
  if (ed.act && DONE.indexOf(ed.act) >= 0 && !ed.actDay) ed.actDay = ymd();
  if (!ed.act) ed.actDay = '';
  const isNew = !ed.id;
  if (isNew) {
    ed.id = ed.date + '_' + (/^\d+$/.test(ed.room) ? ed.room : 'x') + '_h' + Date.now().toString(36).slice(-6);
    ed.no = ed.date.slice(5).replace('-', '') + '-' + ed.room; ed.v = 1; ed.src = 'hub'; ed.n = 0; ed.place = PLACE[ed.cat] || '습득물 보관';
    ed.by = ed.by || ''; ed.clientAt = new Date(); ed.at = S.SERVER_TIME; ed.uid = user.uid; ed.ai = null;
    if (ed.chk) { ed.chkBy = role.label; ed.chkAt = Date.now(); }
  }
  if (ed.act && (!list.filter(y => y.id === ed.id)[0] || list.filter(y => y.id === ed.id)[0].act !== ed.act)) ed.actBy = role.label;
  ed.busy = true; draw();
  const x = Object.assign({}, ed); delete x.err; delete x.busy;
  if (x.clientAt instanceof Date === false && typeof x.clientAt === 'number') x.clientAt = new Date(x.clientAt);
  try { await put(x, isNew ? '대장에 적었어요: ' + x.room + ' ' + x.item : '고쳤어요'); ed = null; if (isNew && x.date !== date) { date = x.date; } }
  catch (e) { ed.busy = false; ed.err = '저장 못 했어요: ' + errOf(e); }
  draw();
}
async function delEd() {
  if (!ed || !ed.id || !confirm('이 줄을 대장에서 지울까요? 되돌릴 수 없어요.')) return;
  try { await S.del('lost/' + ed.id); S.del('lost_img/' + ed.id).catch(() => {}); list = list.filter(y => y.id !== ed.id); ed = null; toast('지웠어요'); }
  catch (e) { ed.err = '지우지 못했어요: ' + errOf(e); }
  draw();
}
async function disposeAll() {
  const T = todo(list, ymd()).dispose; if (!T.length || !confirm('30일 지난 일반 물품 ' + T.length + '건을 모두 "폐기"로 처리할까요?')) return;
  busy = true; draw(); let n = 0;
  for (const x of T) { try { await put(Object.assign({}, x, { act: '폐기', actDay: ymd(), actBy: role.label })); n++; } catch (e) {} }
  busy = false; toast(n + '건 폐기 처리했어요'); draw();
}
function downloadExcel() {
  const ym = date.slice(0, 7);
  const blob = XW.book(excel(list, ym));
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '객실 습득물 관리대장_' + ym + '.xlsx'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------- 📥 옛 엑셀 대장 가져오기 (11/28): 1일~31일 시트 → 어제까지. 같은 날 · 같은 객실이 이미 있으면 건너뜀(앱 접수와 겹침 방지)
async function impFile(f) {
  imp = { busy: true, name: f.name }; draw();
  try {
    const R = parseLedger(await readBook(new Uint8Array(await f.arrayBuffer())), ymd());
    if (!R.rows.length) { imp = { err: '가져올 줄을 못 찾았어요. 「객실 습득물 관리 대장」 엑셀(1일~31일 시트)인지 확인해 주세요.' }; draw(); return; }
    const first = R.rows[0].date, last = R.rows[R.rows.length - 1].date;
    if (from > first) { date = first; await load(true); }   // 옛 달이면 그 달까지 읽고 겹침 확인
    const have = new Set(list.filter(x => !/_e[0-9a-z]+$/.test(x.id)).map(x => x.date + '|' + x.room));
    const mine = new Set(list.map(x => x.id));
    const dup = R.rows.filter(x => have.has(x.date + '|' + x.room)), go = R.rows.filter(x => !have.has(x.date + '|' + x.room));
    imp = { name: f.name, first, last, go, dup, again: go.filter(x => mine.has(x.id)).length, skip: R.skip };
  } catch (e) { imp = { err: '읽지 못했어요: ' + (e && e.message || e) }; }
  draw();
}
async function impRun() {
  const L = imp.go.slice(); imp.busy = true; imp.done = 0; draw();
  const doc = x => { const o = Object.assign({}, x); delete o.id; delete o.k;
    const [y, m, d] = x.date.split('-').map(Number); o.clientAt = new Date(Date.UTC(y, m - 1, d, 0, 0) + x.k * 60e3); o.at = S.SERVER_TIME; o.uid = user.uid;
    if (o.chk) { o.chkBy = '엑셀'; o.chkAt = o.clientAt; } o.upd = S.SERVER_TIME; o.updBy = role.label + ' (엑셀 옮김)'; return o; };
  try {
    for (let i = 0; i < L.length; i += 100) { const part = L.slice(i, i + 100); await S.batch(part.map(x => ({ op: 'set', path: 'lost/' + x.id, data: doc(x) }))); imp.done = i + part.length; draw(); }
    const n = L.length; await addMonths(L.map(x => x.date.slice(0, 7))); imp = null; toast('엑셀 대장 ' + n + '건을 옮겼어요'); await load(true);
  } catch (e) { imp.busy = false; imp.err = '옮기다 멈췄어요 (' + imp.done + '건까지 저장): ' + errOf(e) + ' — 다시 누르면 이어서 덮어써요'; draw(); }
}
function impHtml() {
  const I = imp;
  return '<div class="scrim" data-impx="1"><div class="panel" data-panel="1"><h2>📤 엑셀 대장 옮기기</h2>' +
    (I.busy && !I.go ? '<p class="note">읽는 중…</p>' : '') +
    (I.go ? '<p><b>' + esc(I.name) + '</b><br>' + md(I.first) + ' ~ ' + md(I.last) + ' · <b>' + I.go.length + '건</b> 옮김 (오늘 것은 빼요 — 앱에서 접수)</p>' +
      '<div class="sumline">' + Object.entries(I.go.reduce((a, x) => (a[x.cat] = (a[x.cat] || 0) + 1, a), {})).map(([k, v]) => '<span>' + esc(k) + ' <b>' + v + '</b></span>').join('') + '<span>· 조치 완료 <b>' + I.go.filter(isDone).length + '</b></span><span>· 확인 안 됨 <b>' + I.go.filter(x => !x.chk).length + '</b></span></div>' +
      (I.dup.length ? '<p class="note">⚠ 같은 날 · 같은 객실이 앱에 이미 있어 건너뜀 ' + I.dup.length + '건: ' + esc(I.dup.slice(0, 8).map(x => md(x.date) + ' ' + x.room + ' ' + x.item).join(', ')) + (I.dup.length > 8 ? ' …' : '') + '</p>' : '') +
      (I.again ? '<p class="note">이미 옮긴 줄 ' + I.again + '건은 같은 자리에 덮어써요 (두 번 생기지 않아요).</p>' : '') +
      '<p class="note">엑셀의 「확인」 표시(1 · ㅇ 등)는 확인으로, 조치는 앱 단추 말로 맞춰요 (습냉 → 습득물 냉장고 · 파손위험 보관함 → 파손주의 보관함). 못 맞춘 조치 · 특이사항은 특이사항 칸에 그대로 남겨요. 접수자는 「수기」로 보여요.</p>' : '') +
    (I.busy && I.go ? '<p class="note">저장 중… ' + (I.done || 0) + ' / ' + I.go.length + '</p>' : '') +
    (I.err ? '<p class="err">' + esc(I.err) + '</p>' : '') +
    '<div class="g2"><button class="big sec" data-impx="1"' + (I.busy ? ' disabled' : '') + '>닫기</button>' + (I.go && I.go.length ? '<button class="big" data-imprun="1"' + (I.busy ? ' disabled' : '') + '>' + I.go.length + '건 옮기기</button>' : '') + '</div></div></div>';
}

// ---------- 📅 달 · 날 고르기 (11/28 소장님: 좌우로만 넘기면 달이 쌓일수록 오래 걸림)
const monthsList = () => { const out = [], end = ymd().slice(0, 7); let m = [START_YM, date.slice(0, 7)].concat([...MONS]).sort()[0]; while (m <= end) { out.push(m); const [y, mo] = m.split('-').map(Number); m = mo === 12 ? (y + 1) + '-01' : y + '-' + String(mo + 1).padStart(2, '0'); } return out; };
const lastDay = ym => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).toISOString().slice(0, 10);
function goDate(d) { const t = ymd(); date = d > t ? t : d; history.replaceState(null, '', '#' + date); load(); }
function calHtml() {
  const ym = date.slice(0, 7), t = ymd(), n = +lastDay(ym).slice(8), w0 = new Date(ym + '-01T00:00:00Z').getUTCDay(), cnt = {};
  list.forEach(x => { if (x.date && x.date.slice(0, 7) === ym) cnt[x.date] = (cnt[x.date] || 0) + 1; });
  let h = '<div class="cal">' + DAYS.map(d => '<b>' + d + '</b>').join('') + '<span></span>'.repeat(w0);
  for (let i = 1; i <= n; i++) { const d = ym + '-' + String(i).padStart(2, '0'); h += '<button data-cd="' + d + '"' + (d > t ? ' disabled' : '') + (d === date ? ' class="on"' : '') + '>' + i + (cnt[d] ? '<i>' + cnt[d] + '</i>' : '') + '</button>'; }
  return h + '</div>';
}

// ---------- 그리기
function badges(x) {
  return '<i class="badge' + (isValuable(x) ? ' v' : '') + '">' + esc(x.cat) + '</i>' + (x.police ? '<i class="badge v">🚨 경찰</i>' : '') +
    (x.src === 'app' ? '<i class="badge app">앱 · ' + esc(x.by) + '</i>' : '<i class="badge">수기' + (x.by ? ' · ' + esc(x.by) : '') + '</i>');
}
function rowHtml(x, showDate) {
  const age = ageDays(x, ymd());
  return '<div class="row" data-open="' + esc(x.id) + '"><div class="rm">' + esc(x.room) + '<small>' + (showDate ? md(x.date) : hm(x.clientAt || x.at)) + '</small></div>' +
    '<div class="it"><b>' + esc(x.item) + (x.n ? ' 📷' : '') + '</b><span>' + badges(x) + (x.note ? ' · ' + esc(x.note) : '') + (x.memo ? ' · ' + esc(x.memo) : '') + '</span></div>' +
    '<div class="ac"><button class="chk" data-chk="' + esc(x.id) + '" aria-pressed="' + !!x.chk + '">' + (x.chk ? '확인 ✓' : '확인') + '</button>' +
    (x.act ? '<span class="act' + (isDone(x) ? ' done' : '') + '">' + esc(x.act) + (x.actDay ? ' ' + md(x.actDay).replace(/\(.\)/, '') : '') + '</span>' : !isDone(x) && showDate ? '<span class="act">' + age + '일째</span>' : '') + '</div></div>';
}
function loginHtml() {
  return '<div class="card"><h2>로그인</h2><div class="seg">' + ROLES.map((r, i) => '<button data-who="' + i + '" aria-pressed="' + (login.who === i) + '">' + r.label + '</button>').join('') + '</div>' +
    '<input class="t" id="pw" type="password" autocomplete="current-password" placeholder="비밀번호" style="background:#fff">' +
    (login.err ? '<p class="err">' + esc(login.err) + '</p>' : '') +
    '<button class="big" data-login="1" style="margin-top:10px"' + (login.busy ? ' disabled' : '') + '>' + (login.busy ? '확인 중…' : '들어가기') + '</button></div>';
}
function editHtml() {
  const x = ed, P = x.id ? pics[x.id] : null;
  return '<div class="scrim" data-edx="1"><div class="panel" data-panel="1"><h2>' + (x.id ? (x.room + ' · ' + esc(x.no || '')) : '+ 수기 기재 (앱을 안 쓴 접수)') + '</h2>' +
    (x.id && x.src === 'app' ? (P ? (P.length ? '<div class="pics">' + P.map(u => '<img src="' + u + '" alt="사진">').join('') + '</div>' : '<p class="note">사진이 없어요 (3개월 지나 정리됐거나 저장 실패).</p>') : '<p class="note">사진 여는 중…</p>') : '') +
    (x.id && x.ai ? '<p class="note">🤖 AI: ' + esc(x.ai.item) + ' · ' + esc(x.ai.cat) + '</p>' : '') +
    '<div class="g2"><label class="f"><span>발견일</span><input class="t" id="le-date" type="date" value="' + esc(x.date) + '"' + (x.id ? ' readonly' : '') + '></label>' +
    '<label class="f"><span>객실 번호 (복도는 "공용")</span><input class="t" id="le-room" inputmode="numeric" value="' + esc(x.room) + '"' + (x.id && x.src === 'app' ? ' readonly' : '') + '></label></div>' +
    '<label class="f"><span>습득물 내용</span><input class="t" id="le-item" maxlength="40" value="' + esc(x.item) + '"></label>' +
    '<div class="cats">' + CATS.map(c => '<button data-cat="' + c + '" aria-pressed="' + (x.cat === c) + '">' + c + '</button>').join('') + '</div>' +
    '<label class="ck2"><input type="checkbox" id="le-police"' + (x.police ? ' checked' : '') + '> 🚨 경찰 인계 대상 (카드 · 신분증 · 현금 · 고가품)</label>' +
    '<label class="ck2"><input type="checkbox" id="le-chk"' + (x.chk ? ' checked' : '') + '> 확인 (사무실에 실물 받음)</label>' +
    '<p class="sec2">조치</p><div class="acts8">' + ACTS.map(a => '<button class="' + (DONE.indexOf(a) >= 0 ? 'd' : '') + '" data-act="' + a + '" aria-pressed="' + (x.act === a) + '">' + a + '</button>').join('') + '</div>' +
    '<div class="g2"><label class="f"><span>조치일 (완료 조치면 오늘로 자동)</span><input class="t" id="le-actDay" type="date" value="' + esc(x.actDay || '') + '"></label>' +
    (x.src === 'app' && x.id ? '<label class="f"><span>접수</span><input class="t" readonly value="' + esc(x.by) + ' (앱)"></label>' : '<label class="f"><span>접수자 (선택)</span><input class="t" id="le-by" maxlength="20" value="' + esc(x.by) + '"></label>') + '</div>' +
    '<label class="f"><span>특이사항</span><input class="t" id="le-memo" maxlength="60" value="' + esc(x.memo) + '" placeholder="예: 고객 연락함, 택배 송장 번호"></label>' +
    (x.note ? '<p class="note">메이드 메모: ' + esc(x.note) + '</p>' : '') +
    (x.err ? '<p class="err">' + esc(x.err) + '</p>' : '') +
    '<div class="g2"><button class="big sec" data-edx="1">닫기</button><button class="big" data-eds="1"' + (x.busy ? ' disabled' : '') + '>' + (x.busy ? '저장 중…' : '저장') + '</button></div>' +
    (x.id ? '<button class="chip" data-edd="1" style="color:var(--warn)">이 줄 지우기</button>' : '') + '</div></div>';
}
function draw() {
  $('#who').textContent = role ? role.label + ' · ' + VER : '';
  if (user === null) return;
  if (!role) { $('#main').innerHTML = loginHtml(); $('#sheet').innerHTML = ''; return; }
  const today = ymd(), T = todo(list, today), V = valuables(list, date.slice(0, 7));
  const nTodo = T.police.length + T.dispose.length + T.food.length;
  let h = '<div class="tabs"><button data-tab="day" aria-pressed="' + (tab === 'day') + '">날짜별 대장</button><button data-tab="val" aria-pressed="' + (tab === 'val') + '">귀중품</button>' +
    '<button data-tab="todo" aria-pressed="' + (tab === 'todo') + '">처리 대기' + (nTodo ? '<i>' + nTodo + '</i>' : '') + '</button></div>';
  if (msg) h += '<div class="card"><p class="err" style="margin:0">' + esc(msg) + '</p></div>';
  if (tab === 'day') {
    const L = list.filter(x => x.date === date).sort(byTime);
    const ML = monthsList();
    h += '<div class="card"><div class="mons">' + ML.map(m => '<button data-mon="' + m + '" aria-pressed="' + (m === date.slice(0, 7)) + '">' + (m.slice(0, 4) !== today.slice(0, 4) || ML[0].slice(0, 4) !== today.slice(0, 4) ? m.slice(2, 4) + '년 ' : '') + Number(m.slice(5)) + '월</button>').join('') + (date !== today ? '<button data-today="1">오늘</button>' : '') + '</div>' +
      '<div class="datebar"><button data-d="-1" aria-label="전날">‹</button><button class="d" data-cal="1" title="눌러서 날짜 고르기"><b>' + md(date) + (date === today ? ' 오늘' : '') + ' <span class="cv">📅' + (cal ? '▲' : '▼') + '</span></b><small>' + L.length + '건 · 확인 ' + L.filter(x => x.chk).length + ' · 조치 완료 ' + L.filter(isDone).length + '</small></button>' +
      '<button data-d="1" aria-label="다음 날"' + (date >= today ? ' disabled' : '') + '>›</button></div>' + (cal ? calHtml() : '') + '</div>' +
      '<div class="card"><h2>습득물 ' + L.length + '건 <small><button class="add" data-add="1">+ 수기 기재</button></small></h2>' +
      (busy ? '<p class="note">읽는 중…</p>' : L.length ? L.map(x => rowHtml(x, false)).join('') : '<p class="note">이날 접수된 습득물이 없어요. 앱을 안 쓴 접수는 [+ 수기 기재]로 적어 주세요.</p>') + '</div>' +
      '<div class="card"><div class="g3 tools"><button class="big sec" data-xls="1">📥 ' + Number(date.slice(5, 7)) + '월 엑셀</button><label class="big sec">📤 대장 옮기기<input type="file" id="impf" accept=".xlsx" hidden></label><button class="big sec" data-ref="1">↻ 새로</button></div>' +
      '<p class="note">메이드가 정비 레포트 🧳 습득물로 접수하면 여기에 저절로 들어와요. 실물을 받으면 [확인], 처리하면 줄을 눌러 조치를 골라 주세요 (조치일은 자동).</p></div>';
  } else if (tab === 'val') {
    const open = V.filter(x => !isDone(x)).length;
    h += '<div class="card"><h2>귀중품 모아보기 · ' + Number(date.slice(5, 7)) + '월 <small>보관 중 ' + open + ' · 조치 완료 ' + (V.length - open) + '</small></h2>' +
      (V.length ? V.map(x => rowHtml(x, true)).join('') : '<p class="note">이 달 귀중품이 없어요.</p>') + '</div>';
  } else {
    const sec = (t, sub, L, extra) => '<div class="card"><h2>' + t + ' ' + L.length + '건<small>' + sub + '</small></h2>' + (L.length ? L.map(x => rowHtml(x, true)).join('') + (extra || '') : '<p class="note">없어요 ✓</p>') + '</div>';
    h += sec('🚨 경찰 인계 대기', '귀중품 · 카드 · 신분증 — 찾아가지 않으면 경찰 인계', T.police) +
      sec('🗑 폐기 대상', '일반 물품 30일 지남', T.dispose, '<button class="big" data-dispose="1" style="margin-top:10px"' + (busy ? ' disabled' : '') + '>모두 폐기 처리</button>') +
      sec('🍱 음식 3일 지남', '습득물 냉장고', T.food) +
      sec('✋ 확인 안 한 접수', '오늘 · 어제 — 실물을 받았으면 [확인]', T.unchecked);
  }
  $('#main').innerHTML = h;
  $('#sheet').innerHTML = imp ? impHtml() : ed ? editHtml() : '';
  { const mb = document.querySelector('.mons [aria-pressed="true"]'); if (mb && mb.parentNode.scrollWidth > mb.parentNode.clientWidth) mb.parentNode.scrollLeft = mb.offsetLeft - mb.parentNode.clientWidth / 2; }   // 달이 많아지면 고른 달이 보이게
}

// ---------- 누르기
document.addEventListener('click', e => {
  const t = e.target.closest && e.target.closest('button, .row, .scrim'); if (!t) return;
  if (!role) {
    if (t.hasAttribute('data-who')) { login.who = Number(t.getAttribute('data-who')); draw(); return; }
    if (t.hasAttribute('data-login')) { doLogin(); return; }
    return;
  }
  if (imp) { if (t.classList.contains('scrim') && e.target !== t) return; if (t.hasAttribute('data-impx') && !imp.busy) { imp = null; draw(); return; } if (t.hasAttribute('data-imprun') && !imp.busy) { impRun(); return; } return; }
  if (ed) {
    if (t.classList.contains('scrim') && e.target !== t) return;
    if (t.hasAttribute('data-edx')) { ed = null; draw(); return; }
    if (t.hasAttribute('data-cat')) { readEd(); ed.cat = t.getAttribute('data-cat'); if (ed.cat === '귀중품') ed.police = true; draw(); return; }
    if (t.hasAttribute('data-act')) { readEd(); const a = t.getAttribute('data-act'); ed.act = ed.act === a ? '' : a; if (DONE.indexOf(ed.act) >= 0 && !ed.actDay) ed.actDay = ymd(); if (!ed.act) ed.actDay = ''; draw(); return; }
    if (t.hasAttribute('data-eds')) { saveEd(); return; }
    if (t.hasAttribute('data-edd')) { delEd(); return; }
    return;
  }
  if (t.hasAttribute('data-chk')) { e.stopPropagation(); toggleChk(t.getAttribute('data-chk')); return; }
  if (t.hasAttribute('data-open')) { openEdit(t.getAttribute('data-open')); return; }
  if (t.hasAttribute('data-tab')) { tab = t.getAttribute('data-tab'); draw(); return; }
  if (t.hasAttribute('data-d')) { const n = addDays(date, Number(t.getAttribute('data-d'))); if (n <= ymd()) { date = n; history.replaceState(null, '', '#' + date); load(); } return; }
  if (t.hasAttribute('data-mon')) { const m = t.getAttribute('data-mon'); cal = true; goDate(m === ymd().slice(0, 7) ? ymd() : lastDay(m)); return; }   // 달 → 그 달 끝날(이번 달은 오늘) + 달력 펼침
  if (t.hasAttribute('data-today')) { cal = false; goDate(ymd()); return; }
  if (t.hasAttribute('data-cal')) { cal = !cal; draw(); return; }
  if (t.hasAttribute('data-cd')) { cal = false; goDate(t.getAttribute('data-cd')); return; }
  if (t.hasAttribute('data-add')) { openEdit(''); return; }
  if (t.hasAttribute('data-ref')) { load(true); return; }
  if (t.hasAttribute('data-xls')) { downloadExcel(); return; }
  if (t.hasAttribute('data-dispose')) { disposeAll(); return; }
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
document.addEventListener('change', e => { if (e.target.id === 'impf' && e.target.files[0]) { impFile(e.target.files[0]); e.target.value = ''; } });
const h0 = /^#(\d{4}-\d{2}-\d{2})$/.exec(location.hash); if (h0 && h0[1] <= ymd()) date = h0[1];
if (/^#todo$/.test(location.hash)) tab = 'todo';
S.onUser(u => {
  user = u || false; role = roleOf(u);
  if (u && !u.anon && !role) login.err = '지금 로그인된 계정은 습득물 대장을 볼 수 없어요. 아래에서 다시 들어가 주세요.';
  if (role) load(true); else draw();
});
document.addEventListener('visibilitychange', () => { if (role && !ed && !imp && document.visibilityState === 'visible' && Date.now() - loadedAt > 120000) load(true); });   // 2분 넘게 지나 다시 볼 때만 (읽기 아끼기)
window.__lost = { ver: VER };
