// hub/leave/api.js — 연차 관리(관리자) 서버 역할: 옛 Apps Script Leave.gs 의 관리자 함수들을 Firestore 로 옮김 (2026-11-18)
// 화면(index.html)은 옛 LeavePage.html 그대로 → run('leaveData', …) 같은 부름을 여기서 받아 같은 모양으로 돌려줌
// 저장 (컬렉션은 leave_ 로 시작, 다른 앱 것은 안 건드림)
//   leave_people/{pid}  사람 한 명 (이름·입사일·선지급·대상·퇴사일·같은사람·사번·생년월일·연락처·월차차감·메모)
//   leave_recs/{자동}   연차기록 한 줄 — 추가만 (고치면 차이만큼 한 줄 더, 규칙으로 수정·삭제 막음)
//   leave_apps/{신청번호} 신청서 지금 상태 + log(바뀐 이력). 지우기 = deleted:true (기록은 남음)
//   leave_dev/{uid}     휴대폰 승인 (내 근무 비밀번호 대신, 11/18 소장님 결정 '가') — pids = 이 휴대폰이 볼 수 있는 사람(본인 + 2인 1조 짝)
//   leave_work/{pid}_{yyyy-MM} 옛 '배정기록' 탭에서 옮긴 지난 달 근무 달력 (옮기기 때 한 번)
//   meta/leave_busy     날짜별 쉬는 사람 수 (이름 없음) — 메이드 '몰리는 날' 안내용. 이 화면을 열거나 처리할 때마다 다시 계산
//   meta/leave          옮기기 정보 (workUpto = 옛 달력을 옮긴 마지막 날)
//   (11/21) 하우스키핑: leave_people.grp = 'hk' (없으면 룸메이드) · hkPin = 연차 현황 4자리 (소장이 정함, 관리자만 읽음)
//   hk_leave/{SHA-256('hkleave|이름|4자리')} 하우스키퍼 연차 현황 한 사람 (입사일 · 첫해 빼기 · 달마다 사용) — 허브 '하우스키퍼 → 연차 현황'이 이름+4자리로 한 장만 읽음
//   meta/hk_leave       { names: 하우스키퍼 이름 목록, sig } — 고를 이름 목록. 관리자가 연차 관리를 열거나 저장할 때 바뀐 게 있으면 다시 씀
// 읽기 아끼기: 연차기록·신청서는 휴대폰(이 PC)에 보관해 두고 바뀐 것만 받음 (at · upd 시각 기준)
import * as S from '../../rm/app/store.js';
import * as L from '../../rm/app/leave.js';

const ADMINS = ['iw2orXgIgPgTbLUQa0b41XJ9Dvd2', 'Fz4T5ZzIxShOdVkNpF9gzMmOLED2', 'wytSL9o4vvN4U2G3z6R64hafC9t2'];
const LS = 'lv_cache_v1';
let me = null, people = [], recs = {}, apps = {}, devs = [], dev = {}, teams = {}, unknown = [], loadedAt = 0;

export function user() { return me; }
export function isAdmin() { return !!(me && ADMINS.indexOf(me.uid) >= 0); }
export function onUser(cb) { return S.onUser(u => { me = u; cb(u); }); }
export function signIn(email, pw) { return S.signInEmail(email, pw); }
export function signOut() { return S.signOut(); }

const cleanName = s => String(s == null ? '' : s).replace(/\s+/g, '').trim();
const newPid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function lsLoad() { try { const c = JSON.parse(localStorage.getItem(LS) || 'null'); if (c && c.uid === me.uid) { recs = c.recs || {}; apps = c.apps || {}; } } catch (e) {} }
function lsSave() { try { localStorage.setItem(LS, JSON.stringify({ uid: me.uid, recs, apps })); } catch (e) { console.warn('보관 실패(용량)', e); } }
const maxOf = (o, k) => Object.keys(o).reduce((m, id) => Math.max(m, Number(o[id][k]) || 0), 0);

// ---------- 읽기 (한 번에)
async function fetchAll() {
  if (!isAdmin()) throw new Error('관리자 비밀번호가 필요해요.');
  lsLoad();
  const since = (o, k) => { const t = maxOf(o, k); return t ? [[k, '>', new Date(t - 5 * 60e3)]] : []; };
  const today = L.today();
  const days = []; for (let i = 0; i < 14; i++) days.push(L.addDays(today, -i));
  const [P, R, A, D, Dv, T, dayDocs] = await Promise.all([
    S.getQuery('leave_people', []),
    S.getQuery('leave_recs', since(recs, 'at')),
    S.getQuery('leave_apps', since(apps, 'upd')),
    S.getQuery('leave_dev', []),
    S.getQuery('devices', []),
    S.get('meta/teams'),
    Promise.all(days.map(d => S.get('days/' + d).catch(() => null)))
  ]);
  people = P.map(x => Object.assign({ pid: x.id }, x.data));
  R.forEach(x => { recs[x.id] = x.data; });
  A.forEach(x => { apps[x.id] = x.data; });
  dev = {}; D.forEach(x => { dev[x.id] = x.data; });
  devs = Dv.map(x => Object.assign({ uid: x.id }, x.data));
  teams = (T && T.mate) || {};
  const seen = {};
  dayDocs.forEach(d => ((d && d.maids) || []).forEach(n => { n = cleanName(n); if (n) seen[n] = 1; }));
  unknown = Object.keys(seen).filter(n => !personOf(n)).sort();
  lsSave(); loadedAt = Date.now();
}
function personOf(n) { n = cleanName(n); return people.filter(p => p.name === n || (p.alias || []).indexOf(n) >= 0)[0] || null; }
const byPid = pid => people.filter(p => p.pid === pid)[0] || null;
const appList = () => Object.keys(apps).map(id => apps[id]).filter(a => !a.deleted && a.start && a.name);
function curPeople() {   // 이름은 지금 명단 이름으로 (이름을 고쳐도 기록은 pid 로 따라감)
  const nm = {}; people.forEach(p => { nm[p.pid] = p.name; });
  return nm;
}

// 옛 leaveData 와 같은 모양
function data(asOf) {
  const day = L.ymd(asOf) || L.today(), nm = curPeople();
  const recBy = {};
  Object.keys(recs).forEach(id => { const x = recs[id]; (recBy[x.pid] = recBy[x.pid] || []).push(x); });
  const all = appList().map(a => Object.assign({}, a, { name: nm[a.pid] || a.name }));
  const apm = {};
  all.filter(a => a.status === '승인').forEach(a => {
    const o = apm[a.pid] = apm[a.pid] || {}, sp = L.split(a.start, a.end, a.days);
    Object.keys(sp).forEach(m => { const v = o[m] = o[m] || { used: 0, unpaid: 0 }; v[a.kind === '무급' ? 'unpaid' : 'used'] += sp[m]; });
  });
  const out = people.slice().sort((a, b) => (a.hire || '9') < (b.hire || '9') ? -1 : (a.hire || '9') > (b.hire || '9') ? 1 : a.name < b.name ? -1 : 1).map(p => {
    const rs = (recBy[p.pid] || []).slice().sort((a, b) => (a.at || 0) - (b.at || 0));
    const b = L.balance(p, rs, day);
    const notes = rs.filter(x => x.kind === '지급' || x.kind === '조정' || (x.memo && x.memo !== '월 입력' && x.memo !== '대장에서 가져옴')).slice(-30);
    const pd = Object.keys(dev).filter(u => (dev[u].pids || []).indexOf(p.pid) >= 0).map(u => ({ uid: u, name: dev[u].name, at: dev[u].at || 0, mate: dev[u].pids[0] !== p.pid }));
    return Object.assign({}, p, { alias: p.alias || [], emp: p.emp || '', birth: p.birth || '', phone: p.phone || '', quit: p.quit || '', memo: p.memo || '', minus: p.minus || 0,
      gen: b.gen, monthly: b.monthly, annual: b.annual, years: b.years, next: b.next, used: b.used, unpaid: b.unpaid, paid: b.paid, remain: b.remain,
      months: b.months, notes, appMonths: apm[p.pid] || {}, devs: pd });
  });
  const from = L.addDays(day, -400);
  const list = all.filter(a => a.status === '대기' || a.end >= from).sort((a, b) => (a.at || 0) - (b.at || 0)).map(pub);
  return { asOf: day, today: L.today(), people: out, unknown, empty: !people.length, apps: list, pending: list.filter(a => a.status === '대기').length,
    rank: L.RANK, busyMin: L.BUSY, devices: devList() };
}
function pub(a) {
  return { id: a.id, pid: a.pid, at: a.at, name: a.name, status: a.status, kind: a.kind, reason: a.reason, start: a.start, end: a.end,
    days: a.days, asked: a.asked, phone: a.phone, signed: !!a.sign, memo: a.memo || '', decided: a.decided || 0 };
}
// 휴대폰 목록 (정비 레포트에 이름을 고른 휴대폰) + 승인 상태
function devList() {
  return devs.map(d => {
    const p = personOf(d.name), mt = cleanName(teams[d.name] || ''), mp = mt ? personOf(mt) : null, ok = dev[d.uid];
    return { uid: d.uid, name: d.name, date: d.date || '', at: d.at || 0, pid: p ? p.pid : '', person: p ? p.name : '', target: !!(p && p.target),
      mate: mt, matePid: mp ? mp.pid : '', ok: !!ok, okAt: ok ? ok.at || 0 : 0, okPids: ok ? ok.pids || [] : [] };
  }).sort((a, b) => (a.ok - b.ok) || (a.name < b.name ? -1 : 1));
}
// 메이드 '몰리는 날' 안내용 — 날짜별 쉬는 수 (이름 없음)
async function saveBusy() {
  const today = L.today(), from = L.addDays(today, -L.BACK_DAYS), to = L.addDays(today, L.AHEAD_DAYS), d = {};
  appList().forEach(a => {
    if (a.status !== '대기' && a.status !== '승인') return;
    for (let x = a.start > from ? a.start : from; x <= a.end && x <= to; x = L.addDays(x, 1)) d[x] = (d[x] || []).concat([a.pid]);
  });
  // 수만 남김 (메이드 휴대폰이 자기 신청 날짜는 1명 빼고 봄)
  const out = {}; Object.keys(d).forEach(k => { out[k] = d[k].length; });
  try { await S.set('meta/leave_busy', { d: out, at: S.SERVER_TIME }); } catch (e) { console.warn('몰리는 날 저장 실패', e); }
}

// ---------- 쓰기
function check() { if (!isAdmin()) throw new Error('관리자 비밀번호가 필요해요.'); }
const who = () => (me && me.uid === ADMINS[1] ? '부소장' : '소장');
async function after(asOf, extra) { await fetchAll(); await publishHk(); return Object.assign(data(asOf), extra || {}); }

// ---------- 🧹 하우스키퍼 연차 현황 (11/21): 하우스키퍼 공용 계정은 leave_* 를 못 읽음(규칙 v15) → 사람마다 '이름 + 4자리'로만 찾을 수 있는 한 장을 따로 씀
// 규칙 v25: hk_leave 는 문서 이름을 알 때 한 장만 읽기(get) · 목록(list)·쓰기는 소장 · 부소장 · 봇
export async function hkKey(name, pin) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('hkleave|' + cleanName(name) + '|' + String(pin)));
  return Array.from(new Uint8Array(b)).map(x => ('0' + x.toString(16)).slice(-2)).join('');
}
export function hkSnap(p, rs) {
  const months = {}, unpaid = {}; let paid = 0;
  rs.forEach(x => {
    if (x.kind === '연차' || x.kind === '조정') months[x.ym] = L.r1((months[x.ym] || 0) + x.days);
    else if (x.kind === '무급') unpaid[x.ym] = L.r1((unpaid[x.ym] || 0) + x.days);
    else if (x.kind === '지급') paid = L.r1(paid + x.days);
  });
  Object.keys(months).forEach(m => { if (!months[m]) delete months[m]; });
  return { name: p.name, hire: p.hire || '', minus: Number(p.minus) || 0, pre: !!p.pre, months, unpaid, paid };
}
async function publishHk() {
  const hk = people.filter(p => p.grp === 'hk' && p.target && (!p.quit || p.quit >= L.today()));
  const list = hk.filter(p => /^\d{4}$/.test(p.hkPin || ''));
  const by = {}; Object.keys(recs).forEach(id => { const x = recs[id]; (by[x.pid] = by[x.pid] || []).push(x); });
  const docs = {};
  for (const p of list) docs[await hkKey(p.name, p.hkPin)] = hkSnap(p, by[p.pid] || []);
  const names = hk.map(p => ({ name: p.name, pin: list.indexOf(p) >= 0 })).sort((a, b) => (a.name < b.name ? -1 : 1));
  const sig = await hkKey(JSON.stringify([docs, names]), 'sig');
  try {
    const m = await S.get('meta/hk_leave');
    if (m && m.sig === sig) return;
    if (!hk.length && !m) return;   // 하우스키핑 명단이 아직 없음
    const old = await S.getQuery('hk_leave', []);
    await Promise.all(Object.keys(docs).map(id => S.set('hk_leave/' + id, Object.assign({}, docs[id], { upd: S.SERVER_TIME }))));
    await Promise.all(old.filter(x => !docs[x.id]).map(x => S.del('hk_leave/' + x.id)));
    await S.set('meta/hk_leave', { names, sig, at: S.SERVER_TIME });
  } catch (e) { console.warn('하우스키퍼 연차 현황 저장 실패', e); }
}

async function savePerson(p, orig, asOf) {
  const name = cleanName(p.name), hire = L.ymd(p.hire), target = p.target !== false;
  if (!name) throw new Error('이름을 적어 주세요.');
  if (target && !hire) throw new Error('입사일을 적어 주세요. (예: 2026-04-21)');
  const o = cleanName(orig), cur = o ? people.filter(x => x.name === o)[0] : null;
  if (people.some(x => x.name === name && x !== cur)) throw new Error(name + ' 님은 이미 명단에 있어요.');
  const alias = (p.alias || []).map(cleanName).filter(a => a && a !== name);
  const clash = alias.filter(a => people.some(x => x !== cur && (x.name === a || (x.alias || []).indexOf(a) >= 0)));
  if (clash.length) throw new Error(clash.join(', ') + ' 은(는) 이미 다른 분의 이름(또는 같은 사람)으로 쓰이고 있어요.');
  const pid = cur ? cur.pid : newPid();
  const grp = p.grp === 'hk' ? 'hk' : '', hkPin = grp ? String(p.hkPin || '').trim() : '';
  if (hkPin && !/^\d{4}$/.test(hkPin)) throw new Error('연차 현황 비밀번호는 숫자 4자리로 적어 주세요.');
  if (hkPin && people.some(x => x !== cur && x.grp === 'hk' && x.hkPin === hkPin)) throw new Error('다른 하우스키퍼와 같은 비밀번호예요. 다른 4자리로 정해 주세요.');
  await S.set('leave_people/' + pid, { name, hire, pre: !!p.pre, target, quit: L.ymd(p.quit), alias, emp: String(p.emp || '').trim().slice(0, 30),
    birth: L.ymd(p.birth) || String(p.birth || '').trim().slice(0, 20), phone: String(p.phone || '').trim().slice(0, 20), minus: Number(p.minus) || 0,
    memo: String(p.memo || '').trim().slice(0, 200), grp, hkPin, upd: S.SERVER_TIME, by: who() });
  return after(asOf);
}
function addRec(pid, name, ym, days, kind, memo, by) {
  return S.add('leave_recs', { pid, name, ym, days, kind, memo: String(memo || '').slice(0, 100), by: by || '관리자', at: S.SERVER_TIME }).done;
}
async function setMonth(ym, list, asOf) {
  const m = L.ym(ym); if (!m) throw new Error('년월을 확인해 주세요.');
  const cur = {};
  Object.keys(recs).forEach(id => { const x = recs[id]; if (x.ym !== m) return; const c = cur[x.pid] = cur[x.pid] || { used: 0, unpaid: 0 }; if (x.kind === '연차') c.used += x.days; else if (x.kind === '무급') c.unpaid += x.days; });
  const rows = [];
  (list || []).forEach(e => {
    const p = people.filter(x => x.name === cleanName(e.name))[0]; if (!p) return;
    [['used', '연차'], ['unpaid', '무급']].forEach(k => {
      if (e[k[0]] === undefined || e[k[0]] === null || e[k[0]] === '') return;
      const v = Number(e[k[0]]);
      if (isNaN(v) || v < 0 || v > 31 || Math.round(v * 2) !== v * 2) throw new Error(p.name + ' 님 ' + k[1] + ' 값은 0.5 단위로 적어 주세요.');
      const d = L.r1(v - ((cur[p.pid] || {})[k[0]] || 0));
      if (d) rows.push([p.pid, p.name, m, d, k[1]]);
    });
  });
  await Promise.all(rows.map(r => addRec(r[0], r[1], r[2], r[3], r[4], '월 입력')));
  return after(asOf, { saved: rows.length });
}
async function addRow(x, asOf) {
  const p = people.filter(y => y.name === cleanName(x.name))[0], m = L.ym(x.ym), v = Number(x.days), kind = String(x.kind);
  if (['지급', '조정'].indexOf(kind) < 0) throw new Error('구분을 확인해 주세요.');
  if (!p) throw new Error(x.name + ' 님은 명단에 없어요.');
  if (!m || isNaN(v) || !v || Math.round(v * 2) !== v * 2) throw new Error('년월과 개수(0.5 단위)를 확인해 주세요.');
  await addRec(p.pid, p.name, m, v, kind, String(x.memo || '').trim());
  return after(asOf);
}
function appOf(id) { const a = apps[String(id)]; if (!a || a.deleted) throw new Error('신청서를 찾지 못했어요. 화면을 새로고침해 주세요.'); return a; }
async function saveApp(a, s, extra) {
  const log = (a.log || []).concat([Object.assign({ s, t: Date.now(), by: who() }, extra || {})]).slice(-30);
  const n = Object.assign({}, a, { log, touched: true, upd: S.SERVER_TIME, at: new Date(a.at || Date.now()) });
  await S.set('leave_apps/' + a.id, n);
}
async function decide(id, act, x, asOf) {
  await fetchAll();   // 메이드가 그새 취소했을 수 있음
  const a = appOf(id); x = x || {};
  const memo = String(x.memo || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 100);
  const n = Object.assign({}, a);
  if (act === '승인' || act === '반려') {
    if (a.status !== '대기') throw new Error('이미 ' + a.status + '된 신청이에요. 화면을 새로고침해 주세요.');
    if (act === '승인') {
      const cal = L.diff(a.start, a.end) + 1, days = x.days === undefined || x.days === null || x.days === '' ? a.asked : Number(x.days);
      if (isNaN(days) || days < 0.5 || days > cal || Math.round(days * 2) !== days * 2) throw new Error('일수를 확인해 주세요. (0.5 ~ ' + cal + '일)');
      n.days = days;
    }
    n.status = act; n.decided = Date.now(); n.memo = memo;
  } else if (act === '되돌림') {
    if (a.status !== '승인' && a.status !== '반려') throw new Error('승인·반려된 신청만 되돌릴 수 있어요.');
    n.status = '대기'; n.days = a.asked; n.decided = 0; n.memo = '';
  } else throw new Error('처리 방법을 확인해 주세요.');
  await saveApp(n, act, { days: n.days, memo });
  const d = await after(asOf); await saveBusy(); return d;
}
async function del(id, asOf) {
  const a = appOf(id);
  await saveApp(Object.assign({}, a, { deleted: true }), '삭제', { memo: a.status });
  const d = await after(asOf); await saveBusy(); return d;
}
function formPages(ids) {
  const want = {}; (ids || []).forEach(i => { want[String(i)] = 1; });
  const nm = curPeople();
  const pages = appList().filter(a => want[a.id]).sort((a, b) => (ids.indexOf(a.id) - ids.indexOf(b.id)))
    .map(a => L.formHtml(Object.assign({}, a, { name: nm[a.pid] || a.name }), byPid(a.pid) || {}));
  return { css: L.CSS, pages };
}
// 휴대폰 승인 · 해제
async function devApprove(uids, asOf) {
  const list = devList().filter(d => uids.indexOf(d.uid) >= 0);
  for (const d of list) {
    if (!d.pid) throw new Error(d.name + ' 님은 연차 명단에 없어요. 먼저 명단에 등록하거나 같은 사람으로 연결해 주세요.');
    const pids = [d.pid].concat(d.matePid && d.matePid !== d.pid ? [d.matePid] : []);
    await S.set('leave_dev/' + d.uid, { name: d.name, pids, at: S.SERVER_TIME, by: who() });
  }
  return after(asOf, { approved: list.length });
}
async function devRevoke(uid, asOf) { await S.del('leave_dev/' + uid); return after(asOf); }

// ---------- 화면에서 부르는 입구 (옛 google.script.run 자리)
export async function call(fn, args) {
  args = args || [];
  check();
  switch (fn) {
    case 'leaveData': await fetchAll(); await saveBusy(); await publishHk(); return data(args[1]);
    case 'leaveSavePerson': return savePerson(args[1], args[2], args[3]);
    case 'leaveSetMonth': return setMonth(args[1], args[2], args[3]);
    case 'leaveAddRow': return addRow(args[1], args[2]);
    case 'leaveDecide': return decide(args[1], args[2], args[3], args[4]);
    case 'leaveDelete': return del(args[1], args[2]);
    case 'leaveFormPages': return formPages(args[1]);
    case 'devApprove': return devApprove(args[1], args[2]);
    case 'devRevoke': return devRevoke(args[1], args[2]);
  }
  throw new Error('알 수 없는 요청이에요: ' + fn);
}
// 옮기기(import.js)에서 씀
export const _int = { S, L, cleanName, newPid, fetchAll, get people() { return people; }, get recs() { return recs; }, get apps() { return apps; }, data, lsClear() { try { localStorage.removeItem(LS); } catch (e) {} recs = {}; apps = {}; } };
