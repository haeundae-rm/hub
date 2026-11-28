// hub/jbr/jbr.js — 📋 정비보고서 (2026-11-26, 12/1 실무 전환 1단계)
// 화면 = 시제품(index.html 안 스크립트, 확정본 11/26). 이 파일은 로그인 · 자료 받기만
//   jbr/{YYYY-MM-DD} = 정비보고서 연결(오더테이커 PC, rm/app/rsync.js)이 엑셀을 읽을 때마다 올리는 그날 사본
//     { date, src:'excel'|'app', file, rooms:[호실 순서], r:{호실:[상태, 정비자, 메모1, 메모2, 완료 1/0, 연박 1/0]},
//       xl:{정비수 · 로얄 · 인원 · 미정비 · 재실 · 간단 · 총유닛 = 엑셀 요약 칸}, cards:[{n,u,in}], groups:[{name,time,rooms:'101,102'}], roster:[설정 시트 명단] }
//   지난 날짜는 '엑셀로 채우기'(이 화면)로 한 번에 올림 — 이 브라우저에서 파일을 열어 날짜마다 저장 (src 'app' 인 날은 안 덮음)
// 규칙 v32: 읽기 · 쓰기 관리자(소장 · 부소장 · 봇 · 하우스키퍼)
// 💾 실제 저장 (11/27): 저장 켜진 날 = src 'app' (🌙 초안 만들기로 시작한 날 · 연습 켠 날). 고칠 때마다
//   ① 바뀐 방 칸만 merge(r.{호실}) — 두 사람이 다른 방을 고쳐도 서로 안 덮음 ② jbr/{날}/log 에 전 · 후 기록 쌓기(지우기 없음)
//   ③ 저장 대기 n건 표시 (오프라인이면 브라우저에 보관했다가 연결되면 자동 전송 — store.js 오프라인 보관) ④ 대기 중엔 자동 새로고침 안 함
//   11/28(LIVE_FROM) 전엔 지난 날짜만 「실제 저장 연습 켜기」 가능 (켤 때 r0 · g0 = 켜기 전 자료 보관 → 「연습 끝내기」로 되돌림)
import * as S from '../../rm/app/store.js';

const VER = '2026.11.28-31';
const LIVE_FROM = '2026-11-28';   // 11/27 소장님: 11/28부터 앱이 원본 (확정 = 메이드 휴대폰). 그 전 날짜는 연습(연습 끝내기 가능)
const ROSTER_FROM = '2026-12';     // 스케줄표 명단은 12월부터 — 11월은 엑셀 설정 시트 명단 그대로 (11/27 소장님 '11월 명단 유지')
const ROLES = [
  { label: '하우스키퍼', email: 'unieshaeundae+hk@gmail.com', uid: 'nBL2QYezEmRNRmBRMXN6LNPJO2s2' },
  { label: '소장', email: 'unieshaeundae+admin@gmail.com', uid: 'iw2orXgIgPgTbLUQa0b41XJ9Dvd2' },
  { label: '부소장', email: 'unieshaeundae+sub@gmail.com', uid: 'Fz4T5ZzIxShOdVkNpF9gzMmOLED2' }
];
const $ = s => document.querySelector(s);
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const seoul = (t = Date.now()) => new Date(t + 9 * 3600e3);
const TODAY = seoul().toISOString().slice(0, 10);
const addD = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const ym = (d, n) => { const y = +d.slice(0, 4), m = +d.slice(5, 7) - 1 + n; return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7); };
const hm = t => { if (!t) return ''; const d = seoul(Number(t)); return ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2); };

let BLK = [], REC = [];   // 🚧 meta/blocks list · 📌 meta/recur list (정기 표기 11/28)
// 🏨 장기 투숙 (11/28 소장님: 1405 총지배인 객실 — 매일 투숙(연박) + 매주 화 재실 청소) — meta/recur { list:[{ id, room, dows:[0~6 일~토 = 재실 청소 요일], memo, from, to, by, at }], hist }
//   그 기간 매일: 재실 청소 요일이면 2(재실) + 연박, 아니면 연박(정비 없음). 끝 날짜가 비면 계속
let REC_HIST = [];
const recOn = ds => { const w = new Date(ds + 'T00:00:00Z').getUTCDay(), m = {}; REC.forEach(x => { if (x && x.room && (!x.from || x.from <= ds) && (!x.to || ds <= x.to)) m[String(x.room)] = Object.assign({}, x, { clean: (x.dows || []).includes(w) }); }); return m; };
// 그날 그 방이 장기 투숙 규칙과 맞는지: 재실 청소 날 = 2, 아닌 날 = 연박(1 · 3 · 4 · 공실이면 틀림)
const stayBad = (x, st, yl) => x.clean ? (st !== '2' ? '재실 청소(2)' : '') : ((st === '1' || st === '3' || st === '4' || (!st && !yl)) ? '연박' : '');
const blockOn = ds => { const m = {}; BLK.forEach(b => { if (b.from <= ds && ds <= b.to) b.rooms.forEach(r => { m[String(r)] = b; }); }); return m; };
let hks = [], me = '', sv = { pend: 0, fail: 0, lastOk: 0, err: '' }, role = null, login = { who: 0, err: '', busy: false }, unsub = [], docs = [], hb = null, meta = { fromCache: false, pending: 0 }, fill = '';

// ---------- 사본들 → 화면 자료 (시제품 data.json 모양)
export function toP(list, sched) {
  const days = list.filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && x.r).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!days.length) return null;
  const last = days[days.length - 1], rooms = (last.rooms && last.rooms.length ? last.rooms : Object.keys(last.r)).map(String);
  const seen = new Set(rooms); days.forEach(d => Object.keys(d.r).forEach(r => { if (!seen.has(r)) { seen.add(r); rooms.push(r); } }));
  const months = {};
  for (const d of days) {
    const m = d.date.slice(0, 7), M = months[m] = months[m] || { days: {}, roster: [], xl: { has: false, room: { per: {}, '정비수': [], '인원': [] }, bill: { '정비수': [], '인원': [], '금액': [] }, ot: {}, otT: { d: [] }, unit: {} } };
    M.days[d.date] = {
      r: rooms.map(r => { const x = d.r[r]; return x ? [x[0] || '', x[1] || '', x[2] || '', x[3] || '', x[4] ? '1' : '', x[5] ? 1 : 0] : null; }),
      cards: (d.cards || []).map(c => [c.n, c.u, c.in ? 1 : 0, undefined, c.h == null || c.h === '' ? (hkU(sched, d.date)[c.n] != null ? hkU(sched, d.date)[c.n] : null) : c.h]),   // [4] 인계 유닛: 자동 배정 넣기 때 저장한 값 → 없으면 그날 HK 전파(룸메이드 스케줄) 유닛 (11/28 박순자 9 사례 — 엑셀 카드 칸보다 HK 인계가 기준)
      groups: (d.groups || []).map(g => [g.name, g.time, String(g.rooms || '').split(',').filter(Boolean)]),
      xl: d.xl || {}, at: d.at || 0, file: d.file || '', src: d.src || '', asg: d.asg || null
    };
    if (d.roster && d.roster.length) M.roster = d.roster;
  }
  // 👥 명단 (11/27 소장님): 12월(앱 원본)부터는 룸메이드 스케줄표의 근래 주간 명단 (HK 전파 사본 rmsched_hk 의 all). 11월까지는 엑셀 설정 시트 명단 그대로
  Object.keys(months).forEach(m => { const M = months[m]; if (m >= ROSTER_FROM) { const L = schedRoster(m, M.days, sched); if (L.length) { M.roster = L; M.rsrc = 'sched'; } } });
  // 🗓 앞날 미리 표기 (11/28 하우스키퍼 · 소장님 「엑셀처럼」): 내일 ~ 이번 달 말 (최소 14일 뒤까지) 아직 안 만든 날 = 빈 초안(전 객실 4)으로 보여 줌
  //   표기하는 순간 그날 초안이 만들어짐 (화면 · newDay(ds, r)) · virtual:true 는 저장소에 없는 날
  { const endM = (() => { const t = new Date(TODAY + 'T00:00:00Z'); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).toISOString().slice(0, 10); })(), end2 = addD(TODAY, 14), end = endM > end2 ? endM : end2;
    for (let ds = addD(TODAY, 1); ds <= end; ds = addD(ds, 1)) { const m = ds.slice(0, 7); if (months[m] && months[m].days[ds]) continue;
      const M = months[m] = months[m] || { days: {}, roster: [], xl: { has: false, room: { per: {}, '정비수': [], '인원': [] }, bill: { '정비수': [], '인원': [], '금액': [] }, ot: {}, otT: { d: [] }, unit: {} }, virt: true };
      M.days[ds] = { r: rooms.map(() => ['4', '', '', '', '', 0]), cards: [], groups: [], xl: {}, at: 0, file: '', src: '', asg: null, virtual: true }; }
    const ks = Object.keys(months).sort(); ks.forEach((m, i) => { const M = months[m]; if (M.virt && m >= ROSTER_FROM) { const L = schedRoster(m, M.days, sched); if (L.length) { M.roster = L; M.rsrc = 'sched'; } } if (!M.roster.length && i) M.roster = months[ks[i - 1]].roster.slice(); }); }
  // 명단이 없는 달은 그 달 카드 이름으로
  Object.values(months).forEach(M => { if (!M.roster.length) { const s = new Set(); Object.values(M.days).forEach(x => x.cards.forEach(c => c[0] && s.add(c[0]))); M.roster = [...s]; } });
  return { rooms, months };
}
// 그날 HK 전파(rmsched_hk) 유닛 {이름: 유닛} — 정비보고서 카드 '인계' 기준 (11/28)
export function hkU(sched, ds) { const o = {}; const x = (sched || []).find(y => y && y.date === ds); ((x && x.rm) || []).forEach(r => { const n = String(r.n || '').replace(/\s+/g, ''); if (n && r.u != null && r.u !== '' && isFinite(+r.u)) o[n] = +r.u; }); return o; }
// 그 달 명단 = 그 달 가장 최근 HK 전파 사본의 주간 명단(순번 = 줄 순서, 퇴사 표시 빼고)
//   + 그 달 정비 기록이 있는 분은 퇴사 · 명단에서 빠져도 남김 (근태 · 급여) — 예전 주의 순번 자리에 끼워 넣음
export function schedRoster(m, days, sched) {
  const S = (sched || []).filter(x => x && x.date && x.date.slice(0, 7) === m && Array.isArray(x.all) && x.all.length).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!S.length) return [];
  const worked = new Set();
  Object.values(days || {}).forEach(d => (d.r || []).forEach(x => { if (x && x[1]) String(x[1]).split(',').forEach(n => { n = n.trim(); if (n) worked.add(n); }); }));
  const last = S[S.length - 1].all, order = last.map(x => x.n), outNow = new Set(last.filter(x => x.out).map(x => x.n));
  for (let k = S.length - 2; k >= 0; k--) S[k].all.forEach((x, i) => { if (order.includes(x.n)) return; const at = Math.max(-1, ...S[k].all.slice(0, i).map(y => order.indexOf(y.n))); order.splice(at + 1, 0, x.n); });   // 예전 주에 앞에 있던 분들 중 지금 순번이 가장 뒤인 분 바로 뒤
  const nowIn = new Set(last.filter(x => !x.out).map(x => x.n));
  return order.filter(n => nowIn.has(n) || worked.has(n));
}

function push() {
  const P = toP(docs, hks);
  if (!P) { $('#main').innerHTML = '<div class="box" style="max-width:640px;margin:30px auto"><h3>아직 올라온 정비보고서가 없어요</h3><p class="hint">오더테이커 PC 정비 레포트 관리자 화면의 「정비보고서 연결」이 켜져 있으면 1분 안에 오늘 것이 올라와요. 지난 날짜는 위 「📥 엑셀로 채우기」로 한 번에 올릴 수 있어요.</p></div>'; tag(); return; }
  if (window.JBR) window.JBR.set(P); else window.__jbrQ = P;
  tag();
}
function tag() {
  const el = $('#liveTag'); if (!el) return;
  const t = docs.find(x => x.date === TODAY);
  const hbOk = hb && hb.on && Date.now() - (hb.at || 0) < 10 * 60e3;
  let s = t ? (t.src === 'app' ? '앱 저장 ' + hm(t.at) : '엑셀 ' + hm(t.at) + ' 읽음') : '오늘 사본 없음';
  s += hbOk ? ' · 연결 켜짐' : ' · <b style="color:#ffb4b4">연결 꺼짐</b>';
  if (meta.fromCache) s += ' · 오프라인';
  el.innerHTML = s + ' · <b>' + (sv.pend ? '⏳ 저장 대기 ' + sv.pend + '건' : (docOf(TODAY) && docOf(TODAY).src === 'app') ? '💾 앱 원본' : '엑셀 사본 · 보기') + '</b> <label class="fillb" style="cursor:pointer;text-decoration:underline;margin-left:6px">📥 엑셀로 채우기<input type="file" id="fillFile" accept=".xlsx" hidden></label>' + (fill ? ' <span>' + esc(fill) + '</span>' : '');
}

function watch() {
  unsub.forEach(f => { try { f(); } catch (e) {} }); unsub = []; Object.keys(ltSub).forEach(k => delete ltSub[k]); Object.keys(prSub).forEach(k => delete prSub[k]);
  const from = ym(TODAY, -1) + '-01';
  unsub.push(S.listenQuery('jbr', [['date', '>=', from]], (list, m) => { docs = list.map(x => x.data); meta.fromCache = !!(m && m.fromCache); push(); }, e => { $('#main').innerHTML = '<p style="padding:20px">자료를 읽지 못했어요: ' + esc(e && e.message || e) + ' (규칙 v32 게시 전이면 이렇게 보여요)</p>'; }));
  unsub.push(S.listenDoc('meta/rsync', x => { hb = x; tag(); }, () => {}));
  unsub.push(S.listenDoc('meta/recur', x => { REC = ((x && x.list) || []).filter(r => r && r.room); REC_HIST = (x && x.hist) || []; if (window.JBR && window.JBR.redraw) window.JBR.redraw(); }, () => {}));   // 📌 정기 표기 (11/28)
  unsub.push(S.listenDoc('meta/blocks', x => { BLK = ((x && x.list) || []).filter(b => b && b.from && b.to && Array.isArray(b.rooms)); if (window.JBR && window.JBR.redraw) window.JBR.redraw(); }, () => {}));   // 🚧 기간 작업 (11/28)
  // 👥 룸메이드 스케줄표 HK 전파 사본 (명단 · 앞으로 출근자 · 유닛) — 규칙 v30: 하우스키퍼 읽기 가능
  // 🏆 시상 (jbr/cfg-YYYY-MM.awards) — 이번 달 · 지난달 · 그 전 달 (이월 가져오기용)
  [ym(TODAY, 0), ym(TODAY, -1), ym(TODAY, -2)].forEach(m => unsub.push(S.listenDoc('jbr/cfg-' + m, x => { if (window.JBR && window.JBR.setCfg) window.JBR.setCfg(m, x); }, () => {})));
  unsub.push(S.listenQuery('rmsched_hk', [['date', '>=', from]], list => { hks = list.map(x => x.data); if (docs.length) push(); }, () => {}));
}

// ---------- 지난 날짜 채우기: 정비보고서 엑셀(한 달 파일)을 이 브라우저에서 열어 1일~오늘까지 날짜마다 저장
async function fillFrom(file) {
  const say = m => { fill = m; tag(); };
  try {
    const v = new URLSearchParams(location.search).get('v') || VER;
    const eng = await import('../../rm/app/engine.js?v=' + v), rs = await import('../../rm/app/rsync.js?v=' + v);
    const buf = new Uint8Array(await file.arrayBuffer()), roster = await eng.readRoster(buf);
    const mm = /(\d{1,2})\s*월/.exec(file.name), mon = mm ? ('0' + mm[1]).slice(-2) : TODAY.slice(5, 7);
    let y = +TODAY.slice(0, 4); if (+mon > +TODAY.slice(5, 7)) y--;
    const have = {}; docs.forEach(d => { have[d.date] = d; });
    let n = 0, skip = 0, bad = [];
    for (let k = 1; k <= 31; k++) {
      const ds = y + '-' + mon + '-' + ('0' + k).slice(-2); if (ds > TODAY) break;
      say(ds.slice(5) + ' 읽는 중…');
      let r; try { r = await eng.buildFromXlsx(buf, ds); } catch (e) { bad.push(k + '일'); continue; }
      if (!r.summary.ok) { bad.push(k + '일(양식)'); continue; }
      if (have[ds] && have[ds].src === 'app') { skip++; continue; }
      const snap = rs.snapOf(r, roster, ds, file.name);
      await S.set('jbr/' + ds, Object.assign(snap, { at: S.SERVER_TIME, by: (role && role.label) || '' }));
      n++;
    }
    say('✅ ' + n + '일 올림' + (skip ? ' · 앱 원본 ' + skip + '일은 그대로' : '') + (bad.length ? ' · 못 읽음: ' + bad.join(', ') : ''));
  } catch (e) { say('❌ ' + (e && e.message || e)); }
}

// ---------- 📥 이 날 엑셀 → 앱 원본 (11/28: 야간에 엑셀로 짜서 「정비보고서 올리기」로 메이드 휴대폰에 넣은 날 → 주간은 앱 정비보고서로)
//   지금 보는 날짜 한 날만. 엑셀 내용 그대로(이름 · 상태 · 메모 · 완료 · 연박 · 카드 · 단체) + src 'app' → 이제 그날은 앱에서 고치고 엑셀은 쉼
//   PC 정비보고서 연결 창이 앱 자료와 메이드 휴대폰을 비교 → 같으면 아무것도 안 바꿈, 그 뒤 고친 것만 휴대폰으로
async function takeFrom(file, ds) {
  const say = m => { fill = m; tag(); };
  try {
    const v = new URLSearchParams(location.search).get('v') || VER;
    const eng = await import('../../rm/app/engine.js?v=' + v), rs = await import('../../rm/app/rsync.js?v=' + v);
    const buf = new Uint8Array(await file.arrayBuffer()), roster = await eng.readRoster(buf);
    say(ds.slice(5) + ' 읽는 중…');
    const r = await eng.buildFromXlsx(buf, ds);
    if (!r.summary.ok && !confirm('엑셀 양식 검사에서 다른 점이 있어요:\n' + r.summary.checks.filter(x => !x.ok).map(x => '· ' + x.msg).join('\n') + '\n\n그래도 옮길까요?')) { say('취소했어요'); return; }
    const snap = rs.snapOf(r, roster, ds, file.name), named = Object.keys(snap.r).filter(k => snap.r[k][1]).length;
    if (!named) { say('❌ ' + ds.slice(5) + ' 시트에 정비자 이름이 없어요 — 파일 · 날짜를 확인해 주세요'); return; }
    const cur = docOf(ds), curNamed = cur && cur.r ? Object.keys(cur.r).filter(k => cur.r[k][1]).length : 0;
    if (!confirm(file.name + ' → ' + ds + '\n\n엑셀 ' + ds.slice(8) + '일 시트 그대로 앱 정비보고서로 옮길까요?\n· 정비자 ' + named + '실 · 출근 카드 ' + snap.cards.length + '명\n· 이제 이 날은 앱에서 고치고, 엑셀은 더 안 읽어요' +
      (cur && cur.src === 'app' && curNamed ? '\n\n⚠ 이 날 앱에 이미 이름이 ' + curNamed + '실 있어요 — 엑셀 내용으로 바뀌어요' : ''))) { say('취소했어요'); return; }
    const by2 = (role && role.label) || '';
    await save(ds, 'set', Object.assign(snap, { src: 'app', took: S.SERVER_TIME, at: S.SERVER_TIME, by: by2 }), { k: 'take', file: file.name.slice(0, 80), n: named });
    say('✅ ' + ds.slice(5) + ' 엑셀 → 앱 원본 (' + named + '실) — 이제 이 화면에서 고치세요');
  } catch (e) { say('❌ ' + (e && e.message || e)); }
}

// ---------- 🛟 복구 (11/28 11:31 사고: 작업 중이던 오늘 보고서를 「초안 처음으로」) — 엑셀 파일(아침 그대로) + 변경 기록을 순서대로 다시 적용
//   기준 = 이 엑셀 파일의 그날 시트 · 그 위에 마지막 「엑셀 → 앱 원본」(take) 뒤 ~ 마지막 「초안 만듦/처음으로」(new) 전 사이의 방 고침 · 단체 기록을 시간 순서대로
//   (take 기록이 없으면 처음 기록부터) · 결과 저장 = 통째로(set) + 기록 k:'restore'
async function restoreFrom(file, ds) {
  const say = m => { fill = m; tag(); };
  try {
    const v = new URLSearchParams(location.search).get('v') || VER;
    const eng = await import('../../rm/app/engine.js?v=' + v), rs = await import('../../rm/app/rsync.js?v=' + v);
    say('기록 읽는 중…');
    const L = (await S.getQuery('jbr/' + ds + '/log', [])).map(x => x.data).filter(x => x && x.at).sort((a, b) => Number(a.at) - Number(b.at));
    const news = L.filter(x => x.k === 'new'), tNew = news.length ? Number(news[news.length - 1].at) : Infinity;
    const takes = L.filter(x => x.k === 'take' && Number(x.at) < tNew), tTake = takes.length ? Number(takes[takes.length - 1].at) : 0;
    const win = L.filter(x => Number(x.at) > tTake && Number(x.at) < tNew);
    say(ds.slice(5) + ' 엑셀 읽는 중…');
    const buf = new Uint8Array(await file.arrayBuffer()), roster = await eng.readRoster(buf), r0 = await eng.buildFromXlsx(buf, ds);
    const snap = rs.snapOf(r0, roster, ds, file.name);
    let nRoom = 0, nG = 0;
    win.forEach(x => { if (x.k === 'room' && x.ch) Object.keys(x.ch).forEach(k => { const a = x.ch[k] && x.ch[k].a; if (Array.isArray(a)) { snap.r[k] = a.slice(0, 6); nRoom++; } });
      if (x.k === 'groups' && Array.isArray(x.g)) { snap.groups = x.g; nG++; } });
    const named = Object.keys(snap.r).filter(k => snap.r[k][1]).length, done = Object.keys(snap.r).filter(k => snap.r[k][4]).length;
    if (!confirm('🛟 ' + ds + ' 복구\n\n· 기준: ' + file.name + ' 의 ' + ds.slice(8) + '일 시트 (정비자 ' + Object.keys(snap.r).filter(k => r0.data.rooms.find(y => String(y.room) === k && y.name)).length + '실)\n· 그 위에 오늘 고친 기록 ' + win.filter(x => x.k === 'room').length + '번 (' + nRoom + '칸)' + (nG ? ' · 단체 ' + nG + '번' : '') + ' 을 순서대로\n· 결과: 정비자 ' + named + '실 · 완료 ' + done + '실\n\n이대로 복구할까요?')) { say('복구 취소'); return; }
    await save(ds, 'set', Object.assign(snap, { src: 'app', took: S.SERVER_TIME, at: S.SERVER_TIME, by: (role && role.label) || '', restored: S.SERVER_TIME }), { k: 'restore', file: file.name.slice(0, 80), n: nRoom, named, done });
    say('✅ 복구했어요 — 정비자 ' + named + '실 · 완료 ' + done + '실 (기록 ' + nRoom + '칸 다시 적용)');
  } catch (e) { say('❌ 복구 실패: ' + (e && e.message || e)); }
}
document.addEventListener('change', e => {
  if (e.target.id !== 'restFile' || !e.target.files[0]) return;
  const f = e.target.files[0], ds = window.JBR && window.JBR.day ? window.JBR.day() : TODAY; e.target.value = '';
  restoreFrom(f, ds);
});

// ---------- 💾 실제 저장
const docOf = ds => docs.find(x => x.date === ds);
const FLD = ['상태', '정비자', '메모1', '메모2', '완료', '연박'];
const clip = a => a.map((v, i) => (i < 4 ? String(v == null ? '' : v).slice(0, 200) : v ? 1 : 0));
function svStatus() {
  const off = !navigator.onLine || meta.fromCache;
  if (sv.pend) return '<b style="color:#B26A00">⏳ 저장 대기 ' + sv.pend + '건</b>' + (off ? ' — 인터넷이 끊겨 있어요. 이 PC에 보관했다가 연결되면 자동으로 저장돼요 (창을 닫지 마세요)' : ' — 보내는 중');
  if (sv.fail) return '<b style="color:#B23A48">❌ 저장 실패 ' + sv.fail + '건</b> (' + esc(sv.err) + ') — 화면은 저장소 값으로 돌아가요. 다시 로그인 후 고쳐 주세요';
  return '<b class="good">✅ 모두 저장됨</b>' + (sv.lastOk ? ' ' + hm(sv.lastOk) : '') + (off ? ' · 오프라인' : '');
}
function svPaint() { const el = document.getElementById('svst'); if (el) el.innerHTML = svStatus(); tag(); }
function track(p) {
  sv.pend++; svPaint();
  return Promise.resolve(p).then(() => { sv.lastOk = Date.now(); }, e => {
    sv.fail++; sv.err = (e && (e.code || e.message)) || String(e); console.warn('정비보고서 저장 실패', e);
    if (window.JBR && window.JBR.toast) window.JBR.toast('❌ 저장 실패: ' + sv.err);
  }).finally(() => { sv.pend--; svPaint(); });
}
const logOf = o => Object.assign({ at: S.SERVER_TIME, uid: me, by: (role && role.label) || '' }, o);   // 규칙: at = 서버 시각, uid = 로그인한 계정
// 저장 + 기록을 한 묶음으로 (같이 되거나 같이 안 됨). store.batch 가 없는 옛 store 면 따로따로
function save(ds, op, data, log) {
  const path = 'jbr/' + ds;
  if (S.batch) return track(S.batch([{ op, path, data }, { op: 'add', path: path + '/log', data: logOf(log) }]));
  track(op === 'merge' ? S.merge(path, data) : S.set(path, data)); return track(S.add(path + '/log', logOf(log)).done);
}
const by = () => (role && role.label) || '';
const SV = {
  live: ds => !!(docOf(ds) && docOf(ds).src === 'app'),   // 11/27: 앱 원본인 날만 (엑셀 사본인 날은 키를 잘못 눌러도 원본이 안 바뀜 → 엑셀 연결이 계속)
  canOn: ds => ds < LIVE_FROM && ds < TODAY && !!docOf(ds) && docOf(ds).src !== 'app',
  canOff: ds => ds < LIVE_FROM && !!docOf(ds) && docOf(ds).src === 'app' && !!docOf(ds).r0,
  status: svStatus,
  pending: () => (sv.pend || 0) > 0,
  // 🌙 새 날짜 초안 (11/27 소장님): 기존 엑셀처럼 전 객실 '4 금일 퇴실 예정'만 — 전날 연박 · 미정비는 안 넘김. 연박 · 공실은 하우스맨이 전산 보고 표시
  //   오늘 · 내일 중 아직 없거나 엑셀 사본인 날. 11/28 전엔 연습(연습 끝내기로 되돌림), 메이드 휴대폰엔 안 감
  //   (11/27 15:00 소장님) 버튼은 한 날짜만 = 다음 근무일. 09시 전(새벽 · 아침)엔 오늘, 09시부터는 내일 — 키퍼가 새벽에 초안을 짜므로
  draftDay: () => { const h = new Date(Date.now() + 9 * 3600e3).getUTCHours(), t = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); return h < 9 ? t : addD(t, 1); },
  newOk: ds => { const d = docOf(ds); return ds === SV.draftDay() && (!d || d.src !== 'app'); },
  // ↺ 초안 처음으로 (11/28 소장님: 초안에서 눌러 보다가 처음으로 못 돌아감) — 앱 원본 · 오늘이나 앞날 · 자동 배정을 아직 안 넣은 날 (넣었으면 자동 배정 창 「확정 취소」 먼저)
  canReset: ds => { const d = docOf(ds); return !!d && d.src === 'app' && ds > TODAY && !d.asg && !d.r0; },   // 11/28 11:31 사고: 오늘(작업 중) 보고서를 되돌림 → 오늘은 아예 안 됨, 앞날만
  newDay(ds, pre, preG) {   // pre = 앞날 미리 표기로 만들 때 화면에서 고친 방들 {호실: [6칸]} (11/28)
    const base = docs.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).find(x => x.rooms && x.rooms.length);
    if (!base) { window.JBR.toast('호실 목록을 찾지 못했어요 — 엑셀 사본이 하루라도 있어야 해요'); return; }
    const r = {}; base.rooms.forEach(k => { r[k] = ['4', '', '', '', 0, 0]; });
    // 🚧 기간 작업(meta/blocks): 그날 걸린 방에 「시설(작업명)」 메모 (11/28 소장님 「둘 다」)
    const bon = blockOn(ds); Object.keys(bon).forEach(k => { if (r[k]) r[k][2] = '시설(' + String(bon[k].name || '작업').slice(0, 20) + ')'; });
    const ron = recOn(ds); Object.keys(ron).forEach(k => { const x = ron[k], a = r[k]; if (!a) return; a[0] = x.clean ? '2' : ''; a[5] = 1; const mm = '🏨 ' + String(x.memo || '장기 투숙').slice(0, 30); if (!a[2]) a[2] = mm; else a[3] = mm; });   // 🏨 장기 투숙
    if (pre) Object.keys(pre).forEach(k => { if (r[k]) r[k] = clip(pre[k]); });
    const d = { date: ds, src: 'app', file: '', rooms: base.rooms.slice(), r, xl: {}, cards: [], groups: preG || [], at: S.SERVER_TIME, by: by(), made: S.SERVER_TIME };
    if (ds < LIVE_FROM) Object.assign(d, { r0: r, g0: [], onAt: S.SERVER_TIME, onBy: by() });   // 연습: 「연습 끝내기」 가능
    save(ds, 'set', d, { k: 'new', pre: pre ? Object.keys(pre).length : 0, blk: Object.keys(bon).length, rec: Object.keys(ron).length });
    if (pre) { window.JBR.toast('🗓 ' + +ds.slice(5, 7) + '/' + +ds.slice(8) + ' 초안을 만들고 미리 표기를 저장했어요' + (Object.keys(bon).length ? ' · 🚧 기간 작업 ' + Object.keys(bon).length + '실 시설 메모' : '')); return; }
    window.JBR.toast((docOf(ds) && docOf(ds).src === 'app' ? '↺ ' : '🌙 ') + +ds.slice(5, 7) + '/' + +ds.slice(8) + ' 초안을 ' + (docOf(ds) && docOf(ds).src === 'app' ? '처음으로 되돌렸어요' : '만들었어요') + ' — 전 객실 4(퇴실 예정). 연박 · 공실 · 재실을 표시한 뒤 위 「🧩 자동 배정」에서 「📋 정비보고서 앱에서 불러오기」');
  },
  rooms(ds, ch) {
    const r = {}; Object.keys(ch).forEach(k => { r[k] = clip(ch[k].a); ch[k] = { b: clip(ch[k].b), a: r[k] }; });
    save(ds, 'merge', { date: ds, r, src: 'app', at: S.SERVER_TIME, by: by() }, { k: 'room', n: Object.keys(ch).length, ch });
  },
  groups(ds, gs) {
    const g = gs.map(x => ({ name: x.name || '', time: x.time || '', rooms: (x.rooms || []).join(',') }));
    save(ds, 'merge', { date: ds, groups: g, src: 'app', at: S.SERVER_TIME, by: by() }, { k: 'groups', g });
  },
  on(ds) {
    const d = docOf(ds); if (!d) return;
    save(ds, 'merge', { src: 'app', r0: d.r || {}, g0: d.groups || [], onAt: S.SERVER_TIME, onBy: by() }, { k: 'on' }); if (window.JBR) window.JBR.toast('💾 ' + ds + ' 실제 저장을 켰어요 — 이제 고치는 내용이 저장돼요');
  },
  // ⚠ 비상: 엑셀로 돌아가기 (11/27) — 앱 원본인 날을 엑셀 사본으로 되돌림 → 오더테이커 PC 정비보고서 연결이 그날 엑셀을 다시 읽어 메이드 휴대폰에 넘김. 앱 기록은 그대로 남음
  awards(m, list) { save('cfg-' + m, 'merge', { awards: list.map(a => ({ id: a.id, k: a.k || '', n: String(a.n || '').trim().slice(0, 20), why: String(a.why || '').slice(0, 80), c: Number(a.c) || 0, u: Number(a.u) || 0, x: Number(a.x) || 0, st: a.st || '당월 지급 대상', from: a.from || '', moved: a.moved || '' })), at: S.SERVER_TIME, by: by() }, { k: 'awards', n: list.length }); },
  canBack: ds => !!(docOf(ds) && docOf(ds).src === 'app') && !docOf(ds).r0,
  back(ds) { save(ds, 'merge', { src: 'excel', at: S.SERVER_TIME, by: by(), backAt: S.SERVER_TIME }, { k: 'back' }); window.JBR.toast('⚠ ' + ds + ' 엑셀로 돌아갔어요 — 정비보고서 연결 PC가 1~2분 안에 그날 엑셀을 다시 읽어요'); },
  async off(ds) {
    try {
      const d = await S.get('jbr/' + ds); if (!d || !d.r0) { window.JBR.toast('켜기 전 자료가 없어요'); return; }
      const n = Object.assign({}, d, { r: d.r0, groups: d.g0 || [], src: 'excel', at: S.SERVER_TIME, by: by() });
      ['r0', 'g0', 'onAt', 'onBy'].forEach(k => delete n[k]);
      save(ds, 'set', n, { k: 'off' });
      window.JBR.toast(ds + ' 저장 연습을 끝냈어요 — 켜기 전 자료로 되돌림');
    } catch (e) { window.JBR.toast('❌ ' + (e && e.message || e)); }
  },
  async showLog(ds) {
    let m = document.getElementById('jlogm');
    if (!m) { m = document.createElement('div'); m.id = 'jlogm'; m.style.cssText = 'position:fixed;inset:0;background:rgba(10,20,40,.35);z-index:90;display:flex;align-items:center;justify-content:center'; document.body.appendChild(m);
      m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-jlogx]')) m.remove(); }); }
    const box = h => { m.innerHTML = '<div style="background:#fff;border-radius:12px;width:min(760px,94vw);max-height:84vh;overflow:auto;padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,.25)"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b>📜 ' + ds + ' 변경 기록</b><button data-jlogx="1">닫기</button></div>' + h + '</div>'; };
    box('<p class="hint">불러오는 중…</p>');
    try {
      const L = (await S.getQuery('jbr/' + ds + '/log', [])).map(x => x.data).sort((a, b) => (b.at || 0) - (a.at || 0));
      const fmt = c => Object.keys(c).sort().map(k => { const b = c[k].b || [], a = c[k].a || [];
        const d = FLD.map((f, i) => (String(b[i] || '') === String(a[i] || '') ? '' : i >= 4 ? f + (a[i] ? ' ✓' : ' 풀림') : f + ' 「' + esc(b[i] || '') + '」→「' + esc(a[i] || '') + '」')).filter(Boolean);
        return '<b>' + k + '</b> ' + d.join(', '); }).join('<br>');
      const what = x => x.k === 'room' ? fmt(x.ch || {}) : x.k === 'groups' ? '단체 ' + (x.g || []).map(g => esc(g.name) + ' ' + String(g.rooms || '').split(',').filter(Boolean).length + '실').join(' · ') : x.k === 'new' ? '🌙 초안 만듦 (전 객실 4)' : x.k === 'awards' ? '🏆 시상 명단 저장 (' + (x.n || 0) + '줄)' : x.k === 'restore' ? '🛟 복구 (' + esc(x.file || '') + ' + 기록 ' + (x.n || 0) + '칸 · 정비자 ' + (x.named || 0) + '실)' : x.k === 'take' ? '📥 엑셀 → 앱 원본 (' + esc(x.file || '') + ' · ' + (x.n || 0) + '실)' : x.k === 'back' ? '⚠ 엑셀로 돌아감 (비상)' : x.k === 'unassign' ? '↩ 확정 취소 · ' + (x.n || 0) + '실 지움 · ' + esc(x.why || '') : x.k === 'noshow' ? '🚫 노쇼 ' + esc(x.who || '') + ' → ' + esc(x.got || '') : x.k === 'assign' ? '🧩 자동 배정 → 정비보고서에 넣음 · ' + (x.n || 0) + '실 · 카드 ' + esc(x.cards || '') + '<br>' + fmt(x.ch || {}) : x.k === 'send' ? '📱 메이드 휴대폰 ' + (x.again ? '다시 ' : '') + '보냄 · ' + (x.n || 0) + '실 · 카드 ' + esc(x.cards || '') : x.k === 'on' ? '💾 실제 저장 켬' : x.k === 'off' ? '연습 끝냄 (켜기 전 자료로)' : esc(x.k);
      const t = x => { const d = seoul(Number(x.at || 0)); return hm(x.at) + ':' + ('0' + d.getUTCSeconds()).slice(-2); };
      box(L.length ? '<table style="width:100%;border-collapse:collapse;font-size:13px">' + L.slice(0, 300).map(x => '<tr style="border-top:1px solid #eee;text-align:left"><td style="padding:5px 8px;white-space:nowrap;vertical-align:top;text-align:left">' + t(x) + '</td><td style="padding:5px 8px;white-space:nowrap;vertical-align:top;text-align:left">' + esc(x.by) + '</td><td style="padding:5px 8px;text-align:left">' + what(x) + '</td></tr>').join('') + '</table>' + (L.length > 300 ? '<p class="hint">최근 300건만 보여요 (전체 ' + L.length + '건)</p>' : '') : '<p class="hint">아직 기록이 없어요</p>');
    } catch (e) { box('<p style="color:#B23A48">기록을 읽지 못했어요: ' + esc(e && e.message || e) + '</p>'); }
  }
};
// 🟣 늦은 퇴실 (11/27): meta/late_{YYYY-MM-DD} = { rooms: { 호실: { at:'13:00', out:bool, outAt(ms), outHm, by } }, at, by }
//   meta 는 로그인한 누구나 읽기 · 관리자 쓰기(규칙 그대로) → 메이드 레포트 앱이 그날 문서를 들어 보라 빛 · 퇴실 알림
//   한 칸씩 merge (rooms.{호실}) — 두 사람이 다른 방을 고쳐도 안 덮음. 빼기는 그 방만 지움(deleteField 대신 null → 화면에서 null 은 없음으로)
const LT = {}, ltSub = {};
function ltWatch(ds) {
  if (ltSub[ds] || !role) return; ltSub[ds] = 1;
  unsub.push(S.listenDoc('meta/late_' + ds, x => { const r = (x && x.rooms) || {}; LT[ds] = {}; Object.keys(r).forEach(k => { if (r[k]) LT[ds][k] = r[k]; }); if (window.JBR && window.JBR.redraw) window.JBR.redraw(); }, () => {}));
}
const LATE = {
  map(ds) { ltWatch(ds); return LT[ds] || {}; },
  add(ds, rooms, at) { const r = {}; rooms.forEach(k => { r[k] = { at: at || '', out: false, outAt: 0, outHm: '', by: by(), set: Date.now() }; LT[ds] = LT[ds] || {}; LT[ds][k] = r[k]; });
    track(S.merge('meta/late_' + ds, { date: ds, rooms: r, at: S.SERVER_TIME, by: by() })); if (window.JBR) window.JBR.redraw(); },
  out(ds, k, on) { const l = Object.assign({}, (LT[ds] || {})[k] || {}, { out: !!on, outAt: on ? Date.now() : 0, outHm: on ? hm(Date.now()) : '', outBy: by() });
    (LT[ds] = LT[ds] || {})[k] = l; track(S.merge('meta/late_' + ds, { date: ds, rooms: { [k]: l }, at: S.SERVER_TIME, by: by() })); if (window.JBR) window.JBR.redraw(); },
  del(ds, k) { if (LT[ds]) delete LT[ds][k]; track(S.merge('meta/late_' + ds, { date: ds, rooms: { [k]: null }, at: S.SERVER_TIME, by: by() })); if (window.JBR) window.JBR.redraw(); }
};
// 🟠 우선정비 (11/27 15:34): meta/prio_{YYYY-MM-DD} = { date, list: [{ id, name, rooms[], until 'HH:MM', rank, note, at, upd }], at, by }
//   메이드 레포트 앱이 읽어 주황 표시 + 지정 · 시간 바뀜 알림. 목록을 통째로 씀 (몇 줄뿐)
const PRL = {}, prSub = {};
function prWatch(ds) {
  if (prSub[ds] || !role) return; prSub[ds] = 1; PRL[ds] = PRL[ds] || [];
  unsub.push(S.listenDoc('meta/prio_' + ds, x => { PRL[ds] = ((x && x.list) || []).map(p => Object.assign({}, p, { rooms: (p.rooms || []).slice() })); if (window.JBR && window.JBR.redraw) window.JBR.redraw(); }, () => {}));
}
const PRIOS = {
  save(ds, list) { const L = list.map(p => ({ id: p.id || 'p' + Math.random().toString(36).slice(2, 8), name: String(p.name || '우선정비').slice(0, 40), rooms: (p.rooms || []).map(String), until: p.until || '', rank: +p.rank || 1, note: String(p.note || '').slice(0, 60), at: p.at || Date.now(), upd: p.upd || 0 }));
    PRL[ds] = L.map(p => Object.assign({}, p, { rooms: p.rooms.slice() }));
    track(S.set('meta/prio_' + ds, { date: ds, list: L, at: S.SERVER_TIME, by: by() })); if (window.JBR) window.JBR.redraw(); }
};
if (window.JBR) { window.JBR.blocks = () => BLK; window.JBR.recOn = recOn; window.JBR.hkDay = ds => hkU(hks, ds);   // 📣 그날 HK 전파 출근 예정 {이름: 유닛} (초안 미리 보기 카드)
  window.JBR.stayBad = stayBad; window.JBR.recur = () => REC;
window.JBR.saveStay = async (list, what) => { const b = by(); await S.set('meta/recur', { list, hist: REC_HIST.concat([{ at: Date.now(), by: b, what: String(what).slice(0, 120) }]).slice(-50), at: S.SERVER_TIME, by: b }); REC = list; }; window.JBR.blockOn = blockOn; window.JBR.sv = SV; window.JBR.late = Object.assign(ds => (role ? LATE.map(ds) : null), LATE); window.JBR.prio = Object.assign(ds => { if (!role) return null; prWatch(ds); return PRL[ds]; }, PRIOS); }
window.addEventListener('online', svPaint); window.addEventListener('offline', svPaint);
window.addEventListener('beforeunload', e => { if (sv.pend) { e.preventDefault(); e.returnValue = ''; } });

// ---------- 로그인
function drawLogin() {
  $('#main').innerHTML = '<div class="box" style="max-width:380px;margin:40px auto"><h3 style="margin:0 0 10px">로그인</h3><div class="btns">' +
    ROLES.map((r, i) => '<button data-jwho="' + i + '"' + (login.who === i ? ' class="pri"' : '') + '>' + r.label + '</button>').join('') + '</div>' +
    '<input id="jpw" class="inp" type="password" autocomplete="current-password" placeholder="비밀번호" style="width:100%;margin-top:10px">' +
    (login.err ? '<p style="color:#B23A48">' + esc(login.err) + '</p>' : '') +
    '<button class="pri" data-jlogin="1" style="margin-top:10px;width:100%"' + (login.busy ? ' disabled' : '') + '>' + (login.busy ? '확인 중…' : '들어가기') + '</button>' +
    '<p class="hint">허브에서 들어오면 같은 로그인으로 바로 열려요.</p></div>';
}
async function doLogin() {
  const pw = ($('#jpw') || {}).value || ''; if (!pw) { login.err = '비밀번호를 적어 주세요.'; drawLogin(); return; }
  login.busy = true; login.err = ''; drawLogin();
  try { await S.signInEmail(ROLES[login.who].email, pw); } catch (e) { login.err = '비밀번호가 맞지 않아요.'; }
  login.busy = false; if (!role) drawLogin();
}
document.addEventListener('click', e => {
  const w = e.target.closest('[data-jwho]'); if (w) { e.stopPropagation(); login.who = +w.dataset.jwho; login.err = ''; drawLogin(); return; }
  if (e.target.closest('[data-jlogin]')) { e.stopPropagation(); doLogin(); return; }
  if (e.target.closest('.fillb')) e.stopPropagation();
}, true);
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'jpw') { e.stopPropagation(); doLogin(); } }, true);
document.addEventListener('change', e => {
  if (e.target.id !== 'fillFile' || !e.target.files[0]) return;
  const f = e.target.files[0];
  if (!confirm(f.name + '\n\n이 파일의 1일~오늘까지를 앱에 올릴까요? (같은 날짜 엑셀 사본은 새로 덮고, 앱에서 쓴 날은 그대로 둬요)')) return;
  fillFrom(f);
});
document.addEventListener('change', e => {
  if (e.target.id !== 'takeFile' || !e.target.files[0]) return;
  const f = e.target.files[0], ds = window.JBR && window.JBR.day ? window.JBR.day() : TODAY; e.target.value = '';
  if (ds < LIVE_FROM) { window.JBR.toast('11/28 부터 날짜만 옮길 수 있어요 — 위에서 날짜를 고르세요'); return; }
  takeFrom(f, ds);
});

S.onUser(u => {
  const r = u && !u.anon ? ROLES.find(x => x.uid === u.uid || x.email === u.email) : null;
  if (u && !u.anon && !r) login.err = '지금 로그인된 계정은 정비보고서를 열 수 없어요. 아래에서 다시 들어가 주세요.';
  const was = role; role = r || null; me = (u && u.uid) || '';
  if (role && !was) watch();
  if (!role) { unsub.forEach(f => { try { f(); } catch (e) {} }); unsub = []; drawLogin(); }
});
window.__jbr = { ver: VER, toP, SV, sv, schedRoster };
// 🪟 따로 창 (11/27): 허브에서 새 창으로 열렸으면 「‹ 허브」 대신 「✕ 창 닫기」 — 이 창에선 다른 메뉴로 못 넘어가게
if (window.name === 'jbr_window') {
  const hb = document.getElementById('hubBtn');
  if (hb) { hb.textContent = '✕ 창 닫기'; hb.title = '허브는 원래 창에 그대로 있어요'; hb.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); if (sv.pend && !confirm('저장 대기 ' + sv.pend + '건이 남았어요. 그래도 닫을까요?')) return; try { if (window.opener && !window.opener.closed) window.opener.focus(); } catch (er) {} window.close(); }, true); }
  document.title = '📋 정비보고서';
}
// 🔄 쉬는 순간 자동 새로고침 — 연습으로 고친 날이 있으면 안 바꿈
if (window.AutoReload) window.AutoReload.start({ key: 'jbr', url: '../version.json', safe: () => !sv.pend && !(window.JBR && window.JBR.edited()) && !/읽는 중/.test(fill) });
