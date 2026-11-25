// hub/rmsched/app.js — 🗓️ 룸메이드 주간 스케줄 (2026-11-25, claude.ai 시제품에서 옮김)
// 엑셀 '룸메이드 스케줄표'(주간 스케줄 · 일일 스케줄 · HK 전파 · 공지용)를 그대로 옮긴 편성판. 계산은 core.js(RMCore — 화면·저장소 모름)
// 저장: rmsched/cfg = 기본값(월 만근 · 총 객실 · 기본유닛 · 기본휴무 · 정비보조 명단) · rmsched/{월요일 YYYY-MM-DD} = 그 주 (규칙 v28: 소장 · 부소장만)
// 로그인: 소장 · 부소장 (허브 · 재고조사와 같은 계정 — 이 기기에서 한 번 들어가면 계속 열림)
import * as DB from '../../rm/app/store.js';
{
const C = window.RMCore, $ = id => document.getElementById(id);
const { DAYS, STATUSES, OFF, isNum, num, addDays, md } = C;
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f1 = v => v == null ? '' : (Math.round(v * 10) / 10).toFixed(1);
const nv = v => isNum(v) ? v : '';
const today = () => { const t = new Date(Date.now() + 9 * 3600e3); return t.toISOString().slice(0, 10); };
const toast = m => { const t = $('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2600); };
const clone = o => o == null ? null : JSON.parse(JSON.stringify(o));

// ---------- 저장소: 아티팩트 db (없으면 이 브라우저에만)
const Store = {
  local: false,
  async init() {},
  async getCfg() { return clone(await DB.get('rmsched/cfg')); },
  async setCfg(c) { await DB.set('rmsched/cfg', c); },
  async listWeeks() { return (await DB.getQuery('rmsched', [])).map(d => d.id).filter(id => /^\d{4}-\d\d-\d\d$/.test(id)).sort(); },
  async getWeek(mon) { return clone(await DB.get('rmsched/' + mon)); },
  async setWeek(w) { await DB.set('rmsched/' + w.mon, w); },
  async getHol(y) { return clone(await DB.get('rmsched/hol-' + y)); },
  async setHol(h) { await DB.set('rmsched/hol-' + h.year, h); },
  async delWeek(mon) { await DB.del('rmsched/' + mon); }
};

// ---------- 상태
const S = { cfg: null, weeks: [], w: null, tab: 'week', di: 0, brush: 'edit', ordMode: false, undo: [], showChk: false };
const defCfg = () => ({ fullDays: 21, rooms: 417, roster: [], helpers: [] });

// 저장: 고친 뒤 0.8초 모아 한 번 · 문서마다 한 번에 하나씩
const q = { w: { t: 0, busy: false, again: false }, c: { t: 0, busy: false, again: false } };
function setSave(t) { $('saveSt').textContent = (Store.local ? '이 브라우저에만 · ' : '') + t; }
function saveW() { clearTimeout(q.w.t); setSave('저장 대기…'); q.w.t = setTimeout(() => flush('w'), 800); }
function saveC() { clearTimeout(q.c.t); q.c.t = setTimeout(() => flush('c'), 800); }
async function flush(k) {
  const Q = q[k]; if (Q.busy) { Q.again = true; return; }
  Q.busy = true; setSave('저장 중…');
  try {
    if (k === 'w' && S.w) { S.w.at = Date.now(); await Store.setWeek(clone(S.w)); if (!S.weeks.includes(S.w.mon)) { S.weeks.push(S.w.mon); S.weeks.sort(); drawBar(); } }
    if (k === 'c') await Store.setCfg(clone(S.cfg));
    const t = new Date(Date.now() + 9 * 3600e3); setSave('저장됨 ' + t.toISOString().slice(11, 16));
  } catch (e) { setSave('저장 실패'); toast('저장하지 못했어요: ' + (e && (e.code || e.message) || e)); }
  Q.busy = false; if (Q.again) { Q.again = false; flush(k); }
}
// 고치기: 되돌리기용으로 앞 상태를 남김
function change(fn, opt = {}) {
  if (!S.w) return;
  S.undo.push(JSON.stringify(S.w)); if (S.undo.length > 40) S.undo.shift();
  fn(S.w); saveW(); if (!opt.quiet) draw(); else drawUndo();
}
function undo() { if (!S.undo.length) return; S.w = JSON.parse(S.undo.pop()); saveW(); draw(); toast('되돌렸어요'); }
function drawUndo() { const b = $('undoBtn'); if (b) b.disabled = !S.undo.length; }

// ---------- 시작
async function start() {
  if (S.started) return; S.started = true;
  await Store.init();
  try {
    S.cfg = (await Store.getCfg()) || defCfg();
    S.weeks = await Store.listWeeks();
    const t = today(), mon = C.mondayOf(t);
    const pick = S.weeks.includes(mon) ? mon : S.weeks[S.weeks.length - 1];
    if (pick) await openWeek(pick); else { await loadHol(Number(t.slice(0, 4))); drawBar(); draw(); }
    setSave(Store.local ? '저장 준비됨' : '불러옴');
  } catch (e) { S.started = false; setSave('불러오기 실패'); $('view').innerHTML = '<div class="empty"><b>불러오지 못했어요</b>' + esc(/permission/i.test(String(e && (e.code || e.message))) ? '권한이 없어요 — Firestore 규칙 v28(rmsched)이 게시됐는지 확인해 주세요' : (e && (e.code || e.message) || e)) + '</div>'; }
}
async function openWeek(mon) {
  if (S.w) await flushNow();
  const w = await Store.getWeek(mon); if (!w) return toast('그 주차를 찾지 못했어요');
  S.w = w; S.undo = [];
  await loadHol(Number(mon.slice(0, 4)));
  const t = today(); S.di = (t >= mon && t <= addDays(mon, 6)) ? C.dowIdx(t) : 0;
  drawBar(); draw();
}
async function flushNow() { if (q.w.t) { clearTimeout(q.w.t); q.w.t = 0; await flush('w'); } }

// ---------- 위 띠: 주차 고르기 · 새 주차 · 엑셀
function drawBar() {
  const w = S.w, i = w ? S.weeks.indexOf(w.mon) : -1;
  $('weekBar').innerHTML = (w ? `<div class="wk"><button id="prevW" ${i <= 0 ? 'disabled' : ''} aria-label="지난 주차">◀</button>
      <select id="weekSel" aria-label="주차">${S.weeks.slice().reverse().map(m => `<option value="${m}" ${m === w.mon ? 'selected' : ''}>${md(m)} ~ ${md(addDays(m, 6))}</option>`).join('')}</select>
      <button id="nextW" ${i >= S.weeks.length - 1 ? 'disabled' : ''} aria-label="다음 주차">▶</button>
      <h2>${esc(C.weekTitle(w))}<span class="rng">${md(w.mon)} ~ ${md(addDays(w.mon, 6))}</span></h2></div>` : '<div class="wk"><h2>주차 없음</h2></div>') +
    `<span class="sp"></span>
    <button id="undoBtn" ${S.undo.length ? '' : 'disabled'}>↶ 되돌리기</button>
    <button id="newW" class="pri">＋ 새 주차 만들기</button>
    <button id="impX">엑셀 가져오기</button>
    ${w ? '<button id="expX">엑셀로 내려받기</button>' : ''}`;
}
$('weekBar').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const i = S.weeks.indexOf(S.w && S.w.mon);
  if (b.id === 'prevW') openWeek(S.weeks[i - 1]);
  else if (b.id === 'nextW') openWeek(S.weeks[i + 1]);
  else if (b.id === 'undoBtn') undo();
  else if (b.id === 'newW') newWeekDlg();
  else if (b.id === 'impX') $('fileIn').click();
  else if (b.id === 'expX') exportX();
});
$('weekBar').addEventListener('change', e => { if (e.target.id === 'weekSel') openWeek(e.target.value); });
$('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.tab = b.dataset.tab; closePop(); draw(); });

function draw() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  drawUndo();
  const v = $('view');
  if (S.tab === 'set') { v.innerHTML = setHtml(); return; }
  if (S.tab === 'hol') { v.innerHTML = holHtml(); return; }
  if (!S.w) { v.innerHTML = '<div class="empty"><b>아직 주차가 없어요</b>지금 쓰는 엑셀 스케줄표를 가져오거나 빈 주차를 만들어 시작하세요.<br><br><button class="pri" id="impX2">엑셀 가져오기</button> <button id="blankW">이번 주 빈 주차 만들기</button></div>'; return; }
  v.innerHTML = S.tab === 'week' ? weekView() : S.tab === 'day' ? dayHtml() : S.tab === 'hk' ? hkHtml() : noticeHtml();
  syncScroll();
}

// =============== 주간 스케줄 ===============
const ordCls = o => !isNum(o) ? '' : o <= 9 ? 'o1' : o <= 19 ? 'o2' : o <= 29 ? 'o3' : 'o4';
// 근무표와 일별 요약의 요일 칸을 같은 자리 · 같은 폭으로 (왼쪽 4칸 합 = 일별 요약 첫 칸)
const CW = { no: 44, gp: 44, ord: 66, nm: 110, day: 86, prev: 56, cnt: 56, tot: 56, memo: 280 };
const CL = CW.no + CW.gp + CW.ord + CW.nm;
const COLW = { grid: CL + CW.day * 7 + CW.prev + CW.cnt + CW.tot + CW.memo, sum: CL + CW.day * 8 };
const COLG = {
  grid: '<colgroup>' + [CW.no, CW.gp, CW.ord, CW.nm, ...Array(7).fill(CW.day), CW.prev, CW.cnt, CW.tot, CW.memo].map(x => `<col style="width:${x}px">`).join('') + '</colgroup>',
  sum: '<colgroup>' + [CL, ...Array(8).fill(CW.day)].map(x => `<col style="width:${x}px">`).join('') + '</colgroup>'
};
function weekHtml() {
  const w = S.w, iss = C.issues(w), t = today();
  const dupO = new Set(iss.ord.map(x => x.id)), dupN = new Set(iss.name.map(x => x.id));
  let h = `<button class="chk ${iss.total ? 'bad' : ''}" id="chkBtn">${iss.total ? '확인 필요 ' + iss.total + '건' : '점검 이상 없음'}<span>${iss.total ? '· 누르면 내용을 봐요' : '· 입력 규칙에 맞게 입력되었어요'}</span></button>`;
  h += weekHolNote();
  if (S.showChk && iss.total) h += `<div class="chklist">
    ${iss.unit.length ? `<div><b>유닛 미입력 ${iss.unit.length}</b> ${iss.unit.map(x => esc(x.name) + '(' + DAYS[x.d] + ')').join(', ')}</div>` : ''}
    ${iss.ord.length ? `<div><b>신청순 중복 ${iss.ord.length}</b> ${iss.ord.map(x => esc(x.name) + ' ' + x.ord).join(', ')}</div>` : ''}
    ${iss.name.length ? `<div><b>이름 중복 ${iss.name.length}</b> ${iss.name.map(x => esc(x.name)).join(', ')}</div>` : ''}
    ${iss.over.length ? `<div><b>만근 초과 ${iss.over.length}</b> ${iss.over.map(x => esc(x.name)).join(', ')} <span class="lbl">(합계 &gt; 월 만근 ${w.fullDays}일)</span></div>` : ''}</div>`;
  const B = [['edit', '칸 편집'], ['신청', '신청'], ['사유', '사유'], ['휴', '휴'], ['독립', '독립'], ['교육', '교육'], ['캔슬', '캔슬'], ['clear', '비우기']];
  const nextOrd = Math.max(0, ...w.rows.map(r => isNum(r.ord) ? r.ord : 0)) + 1;
  h += weekSubHtml();
  h += `<div class="tools"><span class="lbl">칸을 누르면</span><div class="seg" id="brush">${B.map(([k, l]) => `<button data-b="${k}" class="${S.brush === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <button id="ordBtn" class="${S.ordMode ? 'pri' : ''}">${S.ordMode ? '신청순 매기는 중 · 다음 ' + nextOrd + '번 (끝내기)' : '신청순 매기기'}</button>
    <button id="offImg">📷 카톡 사진으로 휴무 넣기</button>
    <button id="addRow">＋ 직원 추가</button><span class="sp"></span>
    <label class="lbl">월 만근 <input type="number" id="fullDays" value="${w.fullDays}" style="width:64px"></label>
    <label class="lbl">총 객실 <input type="number" id="rooms" value="${w.rooms}" style="width:78px"></label></div>`;
  if (S.ordMode) h += `<div class="ban w">카톡에 올라온 순서대로 이름을 누르세요 (9시 이전 신청은 뒤로). 번호가 있는 이름을 다시 누르면 번호가 빠져요. <button id="ordClear" style="margin-left:8px;min-height:30px;padding:2px 10px">신청순 모두 지우기</button></div>`;
  h += `<div class="scroll ${S.ordMode ? 'ordmode' : ''}" style="max-height:calc(100vh - 150px)" id="gridScroll"><table class="g wkt" style="width:${COLW.grid}px">${COLG.grid}<thead><tr><th>순번</th><th>그룹</th><th>신청순</th><th class="nm">직원성명</th>`;
  DAYS.forEach((d, i) => { const ds = addDays(w.mon, i), hd = S.hol && S.hol.days.find(x => x.date === ds); h += `<th class="${i === 5 ? 'sat' : i === 6 || hd ? 'sun' : ''} ${ds === t ? 'today' : ''}" title="${hd ? esc(hd.name) : ''}">${d}<br>${md(ds)}${hd ? '<br><small>' + esc(hd.name) + '</small>' : ''}</th>`; });
  h += `<th>지난주<br>누적</th><th>이번주</th><th>합계</th><th>특이사항 메모</th></tr></thead><tbody>`;
  let no = 0, lastG = null;
  w.rows.forEach(r => {
    const grp = r.group === '고정' ? '고정' : (r.group ? 'ABC' : '기타');
    if (grp !== lastG) { h += `<tr class="gs"><td colspan="15">${grp === 'ABC' ? 'A · B · C 그룹' : grp === '고정' ? '고정 근무 (기본휴무 유지)' : '그룹 없음'}</td></tr>`; lastG = grp; }
    const k = C.rowCalc(w, r); no++;
    h += `<tr class="${r.group === '고정' ? 'fx' : ''}" data-r="${r.id}"><td class="no">${no}</td><td class="gp">${esc(r.group)}</td><td class="ord ${ordCls(r.ord) || 'nord'} ${dupO.has(r.id) ? 'dup' : ''}">${isNum(r.ord) ? r.ord : '미신청'}</td>
      <td class="nm ${dupN.has(r.id) ? 'dup' : ''}" data-nm="1">${esc(r.name)}</td>`;
    for (let d = 0; d < 7; d++) {
      const st = r.st[d] || '', u = r.u[d], miss = C.WORK.includes(st) && !isNum(u);
      h += `<td class="c ${st ? 'st-' + st : ''} ${OFF.includes(st) ? 'off' : ''} ${miss ? 'miss' : ''}" data-d="${d}"><span class="s">${esc(st)}</span><span class="u">${nv(u)}</span></td>`;
    }
    h += `<td class="n">${nv(r.prev)}</td><td class="n ${k.cnt > 5 ? 'hot' : ''}">${k.cnt}</td><td class="n ${k.over ? 'over' : ''}">${isNum(r.prev) || k.cnt ? k.total : ''}</td><td class="memo" data-memo="1" title="${esc(r.memo)}">${esc(r.memo)}</td></tr>`;
  });
  const Cd = DAYS.map((_, d) => C.dayCalc(w, d));
  h += `</tbody><tfoot><tr><td colspan="4" class="nm">출근인원 · 정비수</td>${Cd.map(x => `<td class="ft">${x.ppl}명 · ${x.jb}</td>`).join('')}<td colspan="4"></td></tr></tfoot></table></div>
  <div class="legend"><span><i class="st-신청">신청</i>근무자 신청 휴무</span><span><i class="st-사유">사유</i>사유 있는 휴무</span><span><i class="st-휴">휴</i>관리자 지정 휴무</span><span><i class="st-독립">독립</i>독립 근무 (출근 인정)</span><span><i class="st-교육">교육</i>교육 (정비수·출근인원 제외)</span><span><i class="st-캔슬">캔슬</i>휴무 취소 (출근)</span><span><i style="background:#FFE066;color:#222">노란 칸</i>출근인데 유닛 없음</span><span>신청순 <i class="o1">1~9</i><i class="o2">10~19</i><i class="o3">20~29</i><i class="o4">30~</i></span></div>`;
  return h;
}
// 주간 스케줄 아래쪽 (일별 요약 · 정비보조 출근 · 작업객실): 한 번에 하나씩 — 스크롤 줄이기
function weekSubHtml() {
  const n = S.w.helpers.reduce((a, x) => a + x.d.filter(Boolean).length, 0), wk = S.w.work.length;
  const T = [['grid', '📋 근무표 · 일별 요약'], ['hp', '🧹 정비보조 출근' + (n ? ' ' + n : '')], ['work', '🔧 작업객실' + (wk ? ' ' + wk : '')]];
  return `<div class="seg wsub" id="wsub">${T.map(([k, l]) => `<button data-ws="${k}" class="${(S.wsub === k || (k === 'grid' && S.wsub === 'sum')) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
function weekView() {
  S.wsub = S.wsub || 'grid';
  if (S.wsub === 'grid' || S.wsub === 'sum') return weekHtml() + sumHtml();   // 근무표와 일별 요약은 늘 같이
  return weekHead() + (S.wsub === 'sum' ? sumHtml() : S.wsub === 'hp' ? helperHtml() : workHtml());
}
function weekHead() {
  return weekHolNote() + weekSubHtml();
}
function sumHtml() {
  const w = S.w, Cd = DAYS.map((_, d) => C.dayCalc(w, d)), nx = w.sum;
  const head = `<tr><th class="rh">일별 요약</th>${DAYS.map((d, i) => `<th class="${i === 5 ? 'sat' : i === 6 ? 'sun' : ''}">${d}<br>${md(addDays(w.mon, i))}</th>`).join('')}<th>다음<br>월</th></tr>`;
  const inRow = (k, l, n8) => `<tr><td class="rh">${l}</td>${Array.from({ length: n8 ? 8 : 7 }, (_, d) => `<td><input type="number" inputmode="numeric" data-sum="${k}" data-d="${d}" value="${nv(nx[k][d])}" aria-label="${l} ${d < 7 ? DAYS[d] : '다음 월'}"></td>`).join('')}${n8 ? '' : '<td></td>'}</tr>`;
  const calRow = (l, f, n8) => `<tr><td class="rh">${l}</td>${Cd.map((x, d) => f(x, d)).join('')}<td class="calc">${n8 ? n8() : ''}</td></tr>`;
  const avail = v => v == null ? '' : v < 0 ? '-' : v;
  const nAvail = () => isNum(nx.res[7]) ? avail(w.rooms - nx.res[7] - (isNum(nx.spare[7]) ? nx.spare[7] : 0)) : '';
  return `<h3 class="sumh">📊 일별 요약 <small>노란 칸에 입력 · 나머지는 자동 계산 · 요일 칸은 위 근무표와 같은 줄</small></h3><div class="scroll" id="sumScroll"><table class="sum wkt" style="width:${COLW.sum}px">${COLG.sum}${head}
    ${inRow('res', '예약', 1)}${inRow('co', '체크아웃', 1)}${inRow('inroom', '재실정비')}${inRow('stay', '유숙')}${inRow('carry', '미정비 이월')}${inRow('spare', '여유공실', 1)}
    ${calRow('미정비 가능수', x => `<td class="calc">${avail(x.avail)}</td>`, nAvail)}
    ${calRow('정비수', x => `<td class="calc">${x.jb}</td>`)}${calRow('출근인원', x => `<td class="calc">${x.ppl}</td>`)}
    ${calRow('C/O - 필요재입', x => `<td class="calc ${x.coRe < 0 ? 'neg' : ''}">${x.coRe == null ? '' : x.coRe < 0 ? '(' + -x.coRe + ')' : x.coRe}</td>`)}
    ${calRow('인당정비수', x => `<td class="calc">${f1(x.per)}</td>`)}
    ${calRow('작업객실 미정비', x => `<td class="calc">${x.work || ''}</td>`)}
    ${calRow('정비보조 출근', x => `<td class="calc">${x.helpers}</td>`)}
    <tr><td class="rh">오버부킹 정비수<br><small class="lbl">전일 예약 − 당일 유숙</small></td>${Cd.map(x => `<td class="calc">${nv(x.ob)}</td>`).join('')}<td></td></tr>
    </table></div><p class="lbl" style="margin:8px 2px 0">미정비 가능수 = 총 객실수(${w.rooms}) − 예약 − 여유공실 · 마이너스면 "-" · 오버부킹 월요일 계산용 지난주 일요일 예약
    <input type="number" data-sum="prevSunRes" value="${nv(nx.prevSunRes)}" style="width:80px;min-height:32px;padding:2px 6px" aria-label="지난주 일요일 예약"></p>`;
}
function workHtml() {
  const w = S.w;
  return `<div class="card"><h3>작업객실 미판매 현황 <small>시설작업 · 미정비 객실 수 · 빈칸 = 작업 없음</small></h3><div class="scroll"><table class="sum"><tr><th class="rh">작업 내용</th>${DAYS.map(d => `<th>${d}</th>`).join('')}<th>계</th><th>판매 재개</th><th></th></tr>
    ${w.work.map((x, i) => `<tr><td class="rh"><input type="text" data-wk="${i}" data-f="name" value="${esc(x.name)}" style="min-width:170px;text-align:left"></td>${x.d.map((v, d) => `<td><input type="number" data-wk="${i}" data-d="${d}" value="${nv(v)}"></td>`).join('')}
      <td class="calc">${x.d.reduce((a, v) => a + (isNum(v) ? v : 0), 0)}</td><td><input type="text" data-wk="${i}" data-f="resume" value="${esc(x.resume)}" style="min-width:90px"></td><td><button data-wkdel="${i}" class="dan" aria-label="지우기" style="min-height:32px;padding:2px 8px">✕</button></td></tr>`).join('')}
    </table></div><button id="addWork" style="margin-top:8px">＋ 작업 추가</button></div>`;
}
function helperHtml() {
  const w = S.w;
  return `<div class="card"><h3>정비보조 출근 <small>날짜 칸을 누르면 출근 ↔ 빈칸 · 이름 · 가능요일은 바로 고쳐요</small></h3><div class="scroll"><table class="sum hp"><tr><th class="rh">성명</th><th>가능요일</th>${DAYS.map((d, i) => `<th class="${i === 5 ? 'sat' : i === 6 ? 'sun' : ''}">${d}<br>${md(addDays(w.mon, i))}</th>`).join('')}<th>계</th><th></th></tr>
    ${w.helpers.map((x, i) => `<tr><td class="rh"><input type="text" data-hpn="${i}" data-f="name" value="${esc(x.name)}" placeholder="이름" style="min-width:96px;text-align:left" aria-label="정비보조 이름"></td>
      <td><input type="text" data-hpn="${i}" data-f="can" value="${esc(x.can)}" placeholder="예: 월화수" style="min-width:110px" aria-label="${esc(x.name)} 가능요일"></td>
      ${x.d.map((v, d) => `<td data-hp="${i}" data-d="${d}" style="cursor:pointer;min-width:58px;white-space:nowrap;${v ? 'background:#C6E7B4;color:#2E6B1E;font-weight:700' : x.can && !x.can.includes(DAYS[d]) ? 'background:#FCE4E4' : ''}">${v ? '출근' : ''}</td>`).join('')}
      <td class="calc">${x.d.filter(Boolean).length}</td><td><button class="dan" data-hpdel="${i}" style="min-height:32px;padding:2px 8px" aria-label="${esc(x.name)} 빼기">✕</button></td></tr>`).join('')}
    <tr><td class="rh">출근 인원수</td><td></td>${DAYS.map((_, d) => `<td class="calc">${w.helpers.filter(x => x.d[d]).length}</td>`).join('')}<td class="calc">${w.helpers.reduce((a, x) => a + x.d.filter(Boolean).length, 0)}</td><td></td></tr>
    </table></div><div class="tools" style="margin:8px 0 0"><button id="hpAdd">＋ 정비보조 추가</button><button id="hpAll">가능요일 모두 출근</button><button id="hpClr" class="dan">출근 모두 지우기</button><span class="lbl">분홍 칸 = 가능요일이 아닌 날 · 이름 · 가능요일은 다음 주차에도 이어져요</span></div></div>`;
}

// =============== 일일 스케줄 ===============
function dayChips() {
  const t = today();
  return `<div class="daychips" id="dayChips">${DAYS.map((d, i) => { const ds = addDays(S.w.mon, i); return `<button data-di="${i}" class="${S.di === i ? 'on' : ''}">${d}${ds === t ? ' · 오늘' : ''}<small>${md(ds)}</small></button>`; }).join('')}</div>`;
}
function dayHtml() {
  const V = C.dailyView(S.w, S.di), s = V.sum;
  let h = dayChips();
  h += `<div class="ban ${V.edits ? 'w' : ''}">${V.edits ? '유닛 수정 ' + V.edits + '건 적용 중 · 이 날짜에만 적용돼요' : '주간 스케줄에서 자동으로 불러와요 · 유닛은 \'유닛 수정\' 칸에 입력하면 바뀌어요 (날짜마다 따로 저장)'}</div>`;
  h += `<div class="dl"><div class="scroll" style="max-height:calc(100vh - 230px)"><table class="d g"><thead><tr><th>순번</th><th class="nm">직원성명</th><th>상태</th><th>유닛</th><th>배정순번</th><th>유닛 수정</th><th>더티수량</th></tr></thead><tbody>`;
  V.rows.forEach(x => {
    const st = x.st, off = OFF.includes(st);
    h += `<tr class="${x.r.group === '고정' ? 'fx' : ''}"><td class="no">${x.no}</td><td class="nm" style="cursor:default">${esc(x.r.name)}</td>
      <td class="${st ? 'st-' + st : ''}" style="font-weight:700">${esc(st)}</td>
      <td style="font-weight:700;${off ? 'color:#A9B0BB;font-weight:500' : ''}${C.WORK.includes(st) && !isNum(x.u) ? ';background:#FFE066' : ''}">${nv(x.u)}</td>
      <td>${x.order || ''}</td>
      <td class="${x.edit != null ? 'edit' : ''}"><input type="number" inputmode="numeric" data-edit="${x.r.id}" value="${nv(x.edit)}" aria-label="${esc(x.r.name)} 유닛 수정"></td>
      <td class="${x.dirty != null ? 'edit' : ''}"><input type="number" inputmode="numeric" data-dirty="${x.r.id}" value="${nv(x.dirty)}" aria-label="${esc(x.r.name)} 더티수량"></td></tr>`;
  });
  h += `<tr><td colspan="6" style="text-align:right;font-weight:700">더티수량 합계</td><td style="font-weight:800">${V.dirtyTot}</td></tr></tbody></table></div><div>`;
  h += `<div class="card"><h3>정비 예상 요약</h3><div class="kv">
    <b>예약</b><span>${nv(s.res)}</span><b>체크아웃</b><span>${nv(s.co)}</span><b>정비수</b><span>${s.jb}</span><b>출근인원</b><span>${s.ppl}</span>
    <b>C/O - 필요재입</b><span class="${s.coRe < 0 ? 'neg' : ''}">${nv(s.coRe)}</span><b>인당정비수</b><span>${f1(s.per)}</span>
    <b>미정비 이월</b><span>${nv(s.carry)}</span><b>유숙</b><span>${nv(s.stay)}</span><b>미정비 가능수</b><span>${s.avail == null ? '' : s.avail < 0 ? '-' : s.avail}</span></div>
    <p class="lbl" style="margin:8px 0 0">예약 · 체크아웃 · 이월 · 유숙은 주간 스케줄 '일별 요약'에서 입력해요</p></div>`;
  const D = V.D;
  h += `<div class="card"><h3>재입실 현황</h3><div class="scroll"><table class="sum"><tr><th>투숙합계</th><th>판매예상</th><th>재입실조회</th><th>재입 예상</th></tr>
    <tr><td><input type="number" data-dd="stayTot" value="${nv(D.stayTot)}"></td><td><input type="number" data-dd="sale" value="${nv(D.sale)}"></td><td><input type="number" data-dd="look" value="${nv(D.look)}"></td><td class="calc" style="font-size:17px">${f1(s.reent)}</td></tr></table></div>
    <p class="lbl" style="margin:8px 0 0">재입 예상 = 판매예상 × 재입실조회 ÷ 투숙합계</p></div>`;
  h += `<div class="card"><h3>야간조 인계사항</h3><textarea data-dd="note" placeholder="1. 미정비없이 전체 배정바랍니다.">${esc(D.note)}</textarea></div>`;
  h += `<div class="card"><h3>정비보조 출근자 명단 <small>주간 스케줄에서 '출근' 표시한 분</small></h3>${V.helpers.length ? `<div class="kv" style="grid-template-columns:auto 1fr auto">${V.helpers.map((x, i) => `<b>${i + 1}</b><span style="text-align:left;font-size:15px">${esc(x.name)}</span><span style="font-size:13px;color:var(--mut)">HK지원</span>`).join('')}</div>` : '<p class="lbl" style="margin:0">이 날 출근 표시가 없어요</p>'}</div>`;
  return h + '</div></div>';
}
function setDaily(fn) {
  change(w => { const date = addDays(w.mon, S.di); w.daily = w.daily || {}; const D = w.daily[date] || (w.daily[date] = { edit: {}, dirty: {}, stayTot: null, sale: null, look: null, note: '' }); fn(D); });
}

// =============== HK 전파 ===============
function hkHtml() {
  const V = C.dailyView(S.w, S.di), s = V.sum, t = md(V.date) + ' (' + DAYS[S.di] + ')';
  const n = Math.max(V.rm.length, 14);
  let h = dayChips() + `<div class="tools"><button class="pri" data-share="hkPaper" data-fn="HK전파_${V.date}" data-ttl="${t} HK 전파">카톡으로 공유</button><button id="saveImg" data-el="hkPaper" data-fn="HK전파_${V.date}">이미지로 저장</button><button id="copyHk">카톡용 글 복사</button><span class="lbl">빨간 숫자 = 일일 스케줄 '유닛 수정'으로 기본보다 늘어난 유닛</span></div>`;
  h += `<div class="scroll" style="border:0;background:none"><div class="paper hk" id="hkPaper">
    <div><div class="ttl">${t} RM 방배정표</div><table><tr><th>순번</th><th>성함</th><th>정비유닛</th></tr>
      ${Array.from({ length: n }, (_, i) => { const x = V.rm[i]; return `<tr><td>${x ? i + 1 : ''}</td><td class="nmc">${x ? esc(x.r.name) : ''}</td><td class="uc ${x && x.up ? 'up' : ''}">${x ? x.u : ''}</td></tr>`; }).join('')}
      <tr><td colspan="2" style="font-weight:700">출근 인원 · 정비유닛</td><td class="uc">${V.rm.length} · ${s.jb}</td></tr></table></div>
    <div><div class="ttl">정비 예상 요약</div><table style="width:100%">
      ${[['예약', nv(s.res)], ['체크아웃', nv(s.co)], ['정비수', s.jb], ['출근인원', s.ppl], ['C/O - 필요재입', nv(s.coRe)], ['인당정비수', f1(s.per)], ['재입 예상', f1(s.reent)]].map(([a, b]) => `<tr><td style="text-align:left;font-weight:700;background:#F2F5FA;min-width:120px">${a}</td><td style="font-weight:800;font-size:16px;min-width:80px">${b}</td></tr>`).join('')}</table>
      <div class="ttl" style="margin-top:16px;text-align:left;border-radius:4px">■ 야간조 인계사항</div><div class="note">${esc(V.D.note) || '<span style="color:#9aa6b8;font-weight:500">일일 스케줄에서 적어요</span>'}</div></div>
    <div><div class="ttl">${t} 정비보조 출근자 명단</div><table><tr><th>순번</th><th>성함</th><th>비고</th></tr>
      ${Array.from({ length: Math.max(V.helpers.length, 8) }, (_, i) => { const x = V.helpers[i]; return `<tr><td>${x ? i + 1 : ''}</td><td class="nmc">${x ? esc(x.name) : ''}</td><td>${x ? 'HK지원' : ''}</td></tr>`; }).join('')}</table></div>
  </div></div>`;
  return h;
}
function hkText() {
  const V = C.dailyView(S.w, S.di), s = V.sum;
  return [`■ ${md(V.date)} (${DAYS[S.di]}) RM 방배정표`, ...V.rm.map((x, i) => `${i + 1}. ${x.r.name} ${x.u}${x.up ? ' (+)' : ''}`), `출근 ${V.rm.length}명 · 정비 ${s.jb}`, '',
    '■ 정비 예상 요약', `예약 ${nv(s.res)} / 체크아웃 ${nv(s.co)} / 정비수 ${s.jb} / 출근인원 ${s.ppl}`, `C/O-필요재입 ${nv(s.coRe)} / 인당정비수 ${f1(s.per)} / 재입 예상 ${f1(s.reent)}`, '',
    '■ 정비보조 출근자', V.helpers.length ? V.helpers.map(x => x.name).join(', ') : '없음', '', '■ 야간조 인계사항', V.D.note || ''].join('\n');
}

// =============== 공지용 ===============
function noticeHtml() {
  const w = S.w;
  let h = `<div class="tools"><button class="pri" data-share="ntPaper" data-fn="휴무공지_${w.mon}" data-ttl="${esc(C.weekTitle(w))} 휴무 공지">카톡으로 공유</button><button id="saveImg" data-el="ntPaper" data-fn="휴무공지_${w.mon}">이미지로 저장</button><button id="copyNt">카톡용 글 복사</button><span class="lbl">메이드님들 카톡방에 올리는 주간 휴무 공지</span></div>`;
  h += `<div class="scroll" style="border:0;background:none"><div class="paper ntc" id="ntPaper"><h2>${esc(C.weekTitle(w))} 룸메이드 휴무 공지</h2><div class="sub">${md(w.mon)} ~ ${md(addDays(w.mon, 6))} · 신청 = 신청 휴무 · 사유 = 사유 있는 휴무 · 휴 = 지정 휴무 · 빨간 테두리 = 휴무 취소(출근)</div>
    <table class="g"><tr><th>신청순</th><th>직원성명</th>${DAYS.map((d, i) => `<th class="${i === 5 ? 'sat' : i === 6 ? 'sun' : ''}">${d}<br>${md(addDays(w.mon, i))}</th>`).join('')}<th>이번주</th></tr>
    ${w.rows.filter(r => r.name).map(r => `<tr class="${r.group === '고정' ? 'fx' : ''}"><td class="${ordCls(r.ord) || 'nord'}" style="font-weight:700">${isNum(r.ord) ? r.ord : '미신청'}</td><td class="nm">${esc(r.name)}</td>
      ${r.st.map(st => `<td class="${st ? 'st-' + st : ''}" style="font-weight:700;min-width:52px">${esc(st)}</td>`).join('')}<td style="font-weight:700">${C.rowCalc(w, r).cnt}</td></tr>`).join('')}
    </table><div style="margin-top:10px;font-size:12.5px;color:#5d6b80">문의 · 객실팀 사무실 051-749-5210 · 051-749-5211 · 카카오톡 '룸메이드 오더방'</div></div></div>`;
  h += `<div class="card" style="margin-top:14px"><h3>카톡용 글 <small>요일별 휴무 명단 (고정 근무자 제외)</small></h3><pre class="txt">${esc(C.noticeText(w))}</pre></div>`;
  return h;
}

// =============== 명단 · 기본값 ===============
function setHtml() {
  const c = S.cfg;
  let h = `<div class="card"><h3>기본값 <small>새 주차를 만들 때 이 값으로 시작해요</small></h3><div class="tools">
    <label class="lbl">월 만근일수 <input type="number" data-cfg="fullDays" value="${nv(c.fullDays)}" style="width:70px"></label>
    <label class="lbl">총 객실수 <input type="number" data-cfg="rooms" value="${nv(c.rooms)}" style="width:80px"></label>
    <span class="sp"></span>${S.w ? '<button id="syncRos">이번 주 명단으로 맞추기</button>' : ''}</div>
    <p class="lbl" style="margin:0">새 주차: 기준일 +7일 · 신청순 · 캔슬 · 신청휴무 지움 · <b>아래 기본유닛과 기본휴무</b>로 다시 채움 · 지난주 누적 = 지난 합계 · 메모에 '퇴사'가 있고 7일 모두 휴무면 명단에서 뺌</p></div>`;
  h += `<div class="card"><h3>룸메이드 기본유닛 · 기본휴무 <small>${c.roster.length}명 · 위 칸은 유닛, 아래 칸은 그 요일 기본 상태</small></h3><div class="scroll" style="max-height:66vh"><table class="ros g"><thead><tr><th class="nm">직원성명</th><th>그룹</th>${DAYS.map(d => `<th>${d}</th>`).join('')}<th></th></tr></thead><tbody>
    ${c.roster.map((b, i) => `<tr class="${b.group === '고정' ? 'fx' : ''}"><td class="nm" style="cursor:default"><input type="text" data-ros="${i}" data-f="name" value="${esc(b.name)}"></td>
      <td><select data-ros="${i}" data-f="group">${C.GROUPS.map(g => `<option ${b.group === g ? 'selected' : ''} value="${g}">${g || '-'}</option>`).join('')}</select></td>
      ${DAYS.map((_, d) => `<td style="padding:2px"><input type="number" data-ros="${i}" data-ub="${d}" value="${nv(b.base && b.base[d])}" aria-label="${esc(b.name)} ${DAYS[d]} 유닛"><br><select data-ros="${i}" data-ob="${d}" class="${b.off && b.off[d] ? 'st-' + b.off[d] : ''}" aria-label="${esc(b.name)} ${DAYS[d]} 기본 상태"><option value="">출근</option>${STATUSES.filter(x => x !== '캔슬').map(x => `<option ${b.off && b.off[d] === x ? 'selected' : ''}>${x}</option>`).join('')}</select></td>`).join('')}
      <td><button class="dan" data-rosdel="${i}" style="min-height:32px;padding:2px 8px" aria-label="명단에서 빼기">✕</button></td></tr>`).join('')}
    </tbody></table></div><button id="rosAdd" style="margin-top:8px">＋ 직원 추가</button></div>`;
  h += `<div class="card"><h3>정비보조 명단</h3><div class="scroll"><table class="sum"><tr><th class="rh">성명</th><th>가능요일 (예: 월화수)</th><th></th></tr>
    ${c.helpers.map((x, i) => `<tr><td class="rh"><input type="text" data-hl="${i}" data-f="name" value="${esc(x.name)}"></td><td><input type="text" data-hl="${i}" data-f="can" value="${esc(x.can)}"></td><td><button class="dan" data-hldel="${i}" style="min-height:32px;padding:2px 8px" aria-label="빼기">✕</button></td></tr>`).join('')}
    </table></div><button id="hlAdd" style="margin-top:8px">＋ 정비보조 추가</button><p class="lbl" style="margin:8px 0 0">정비보조 명단은 새 주차부터 반영돼요${S.w ? ' · <button id="hlToWeek" style="min-height:30px;padding:2px 10px">이번 주에도 반영</button>' : ''}</p></div>`;
  h += `<div class="card"><h3>백업</h3><div class="tools"><button id="bkOut">전체 백업 내려받기 (.json)</button><button id="bkIn">백업 불러오기</button>${S.w ? '<button id="delW" class="dan">이 주차 지우기</button>' : ''}</div>
    <p class="lbl" style="margin:0">${'저장은 객실 통합 관리(Firebase)에 돼요. 소장 · 부소장 계정이면 어느 기기에서 열어도 같은 내용이 보여요.'}</p></div>`;
  return h;
}

// ---------- 화면 누르기
$('view').addEventListener('click', e => {
  const t = e.target, b = t.closest('button');
  if (S.tab === 'hol' && holClick(t, b)) return;
  if (b) {
    if (b.id === 'chkBtn') { S.showChk = !S.showChk; draw(); return; }
    if (b.dataset.ws) { S.wsub = b.dataset.ws; draw(); return; }
    if (b.dataset.b) { S.brush = b.dataset.b; S.ordMode = false; draw(); return; }
    if (b.id === 'ordBtn') { S.ordMode = !S.ordMode; draw(); return; }
    if (b.id === 'ordClear') { ask('신청순 번호를 모두 지울까요?', '모두 지우기').then(ok => ok && change(w => w.rows.forEach(r => { r.ord = null; }))); return; }
    if (b.id === 'addRow') { rowDlg(null); return; }
    if (b.id === 'offImg') { offImgDlg(); return; }
    if (b.id === 'addWork') { change(w => w.work.push({ name: '', d: Array(7).fill(null), resume: '' })); return; }
    if (b.dataset.wkdel != null) { change(w => w.work.splice(+b.dataset.wkdel, 1)); return; }
    if (b.id === 'hpAdd') { change(w => w.helpers.push({ name: '', can: '', d: Array(7).fill(false) })); syncHelpers(); return; }
    if (b.dataset.hpdel != null) { const x = S.w.helpers[+b.dataset.hpdel]; ask(`${x.name || '이 줄'}을(를) 정비보조 명단에서 뺄까요?`, '빼기').then(ok => { if (ok) { change(w => w.helpers.splice(+b.dataset.hpdel, 1)); syncHelpers(); } }); return; }
    if (b.id === 'hpAll') { change(w => w.helpers.forEach(x => { if (x.can) x.d = DAYS.map(d => x.can.includes(d)); })); return; }
    if (b.id === 'hpClr') { ask('이번 주 정비보조 출근 표시를 모두 지울까요?', '모두 지우기').then(ok => ok && change(w => w.helpers.forEach(x => { x.d = Array(7).fill(false); }))); return; }
    if (b.dataset.di != null) { S.di = +b.dataset.di; draw(); return; }
    if (b.id === 'saveImg') { saveImg(b.dataset.el, b.dataset.fn); return; }
    if (b.dataset.share) { shareImg(b.dataset.share, b.dataset.fn, b.dataset.ttl); return; }
    if (b.id === 'copyHk') { copy(hkText()); return; }
    if (b.id === 'copyNt') { copy(C.noticeText(S.w)); return; }
    if (b.id === 'impX2') { $('fileIn').click(); return; }
    if (b.id === 'blankW') { const w = C.emptyWeek(C.mondayOf(today()), S.cfg); fillFromRoster(w); S.w = w; S.weeks.push(w.mon); S.weeks.sort(); S.undo = []; saveW(); drawBar(); draw(); return; }
    // 명단 · 기본값
    if (b.id === 'rosAdd') { S.cfg.roster.push({ name: '', group: '', base: Array(7).fill(8), off: Array(7).fill('') }); saveC(); draw(); return; }
    if (b.dataset.rosdel != null) { const i = +b.dataset.rosdel; ask(`${S.cfg.roster[i].name || '이 줄'}을(를) 기본 명단에서 뺄까요? (이번 주 표는 그대로예요)`, '빼기').then(ok => { if (ok) { S.cfg.roster.splice(i, 1); saveC(); draw(); } }); return; }
    if (b.id === 'hlAdd') { S.cfg.helpers.push({ name: '', can: '' }); saveC(); draw(); return; }
    if (b.dataset.hldel != null) { S.cfg.helpers.splice(+b.dataset.hldel, 1); saveC(); draw(); return; }
    if (b.id === 'hlToWeek') { change(w => { const old = {}; w.helpers.forEach(h => { old[h.name] = h.d; }); w.helpers = S.cfg.helpers.filter(h => h.name).map(h => ({ name: h.name, can: h.can, d: old[h.name] || Array(7).fill(false) })); }); toast('이번 주 정비보조 명단을 바꿨어요'); return; }
    if (b.id === 'syncRos') { syncRoster(); return; }
    if (b.id === 'bkOut') { backupOut(); return; }
    if (b.id === 'bkIn') { $('jsonIn').click(); return; }
    if (b.id === 'delW') { ask(`${C.weekTitle(S.w)} (${md(S.w.mon)}~) 주차를 지울까요? 되돌릴 수 없어요.`, '지우기').then(async ok => { if (!ok) return; const m = S.w.mon; clearTimeout(q.w.t); q.w.t = 0; await Store.delWeek(m); S.weeks = S.weeks.filter(x => x !== m); S.w = null; if (S.weeks.length) await openWeek(S.weeks[S.weeks.length - 1]); else { drawBar(); draw(); } toast('지웠어요'); }); return; }
    return;
  }
  const hp = t.closest('td[data-hp]');
  if (hp) { change(w => { const x = w.helpers[+hp.dataset.hp]; x.d[+hp.dataset.d] = !x.d[+hp.dataset.d]; }); return; }
  const td = t.closest('table.g:not(.d):not(.ros) td'); if (!td || S.tab !== 'week') return;
  const tr = td.closest('tr[data-r]'); if (!tr) return;
  const r = S.w.rows.find(x => x.id === tr.dataset.r); if (!r) return;
  if (td.dataset.nm || td.classList.contains('ord')) {
    if (S.ordMode) { change(w => { const x = w.rows.find(y => y.id === r.id); x.ord = isNum(x.ord) ? null : Math.max(0, ...w.rows.map(y => isNum(y.ord) ? y.ord : 0)) + 1; }); return; }
    rowDlg(r); return;
  }
  if (td.dataset.memo) { rowDlg(r, 'memo'); return; }
  if (td.dataset.d != null) {
    const d = +td.dataset.d;
    if (S.brush === 'edit') { openPop(td, r, d); return; }
    const v = S.brush === 'clear' ? '' : S.brush;
    change(w => { const x = w.rows.find(y => y.id === r.id); x.st[d] = x.st[d] === v ? '' : v; });
  }
});
// 입력 칸 (바뀐 뒤 한 번에)
$('view').addEventListener('change', e => {
  const t = e.target, ds = t.dataset, v = num(t.value);
  if (ds.sum) { change(w => { if (ds.sum === 'prevSunRes') w.sum.prevSunRes = v; else w.sum[ds.sum][+ds.d] = v; }); return; }
  if (t.id === 'fullDays') { change(w => { w.fullDays = v || 21; }); return; }
  if (t.id === 'rooms') { change(w => { w.rooms = v || 417; }); return; }
  if (ds.hpn != null) { change(w => { w.helpers[+ds.hpn][ds.f] = t.value.trim(); }); syncHelpers(); return; }
  if (ds.wk != null) { change(w => { const x = w.work[+ds.wk]; if (ds.f) x[ds.f] = t.value.trim(); else x.d[+ds.d] = v; }); return; }
  if (ds.edit) { setDaily(D => { if (v == null) delete D.edit[ds.edit]; else D.edit[ds.edit] = v; }); return; }
  if (ds.dirty) { setDaily(D => { if (v == null) delete D.dirty[ds.dirty]; else D.dirty[ds.dirty] = v; }); return; }
  if (ds.dd) { setDaily(D => { D[ds.dd] = ds.dd === 'note' ? t.value : v; }); return; }
  if (ds.cfg) { S.cfg[ds.cfg] = v; saveC(); return; }
  if (ds.ros != null) {
    const b = S.cfg.roster[+ds.ros];
    if (ds.f) b[ds.f] = t.value.trim(); else if (ds.ub != null) { b.base = b.base || Array(7).fill(null); b.base[+ds.ub] = v; } else if (ds.ob != null) { b.off = b.off || Array(7).fill(''); b.off[+ds.ob] = t.value; }
    saveC(); if (ds.ob != null || ds.f === 'group') draw(); return;
  }
  if (ds.hl != null) { S.cfg.helpers[+ds.hl][ds.f] = t.value.trim(); saveC(); return; }
});

// ---------- 칸 편집 창
let popAt = null;
function openPop(td, r, d) {
  popAt = { id: r.id, d };
  const p = $('pop'), st = r.st[d] || '';
  p.innerHTML = `<h4>${esc(r.name)} · ${DAYS[d]} ${md(addDays(S.w.mon, d))}</h4>
    <div class="sts">${['', ...STATUSES].map(x => `<button data-ps="${x}" class="${x ? 'st-' + x : ''} ${st === x ? 'on' : ''}">${x || '출근'}</button>`).join('')}<button data-ps="close">닫기</button></div>
    <div class="un"><span class="lbl">유닛</span><button data-pu="-1" aria-label="1 줄이기">−</button><input type="number" id="popU" value="${nv(r.u[d])}" inputmode="numeric"><button data-pu="1" aria-label="1 늘리기">＋</button>
    <button data-pu="all" title="이 직원 7일 모두 같은 유닛">7일 모두</button></div>`;
  p.hidden = false;
  const R = td.getBoundingClientRect(), W = 300;
  p.style.left = Math.max(8, Math.min(innerWidth - W - 8, R.left + R.width / 2 - W / 2)) + 'px';
  const top = R.bottom + 6; p.style.top = (top + 180 > innerHeight ? Math.max(8, R.top - 186) : top) + 'px';
}
function closePop() { $('pop').hidden = true; popAt = null; }
$('pop').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || !popAt) return;
  const { id, d } = popAt;
  if (b.dataset.ps === 'close') return closePop();
  if (b.dataset.ps != null) { change(w => { w.rows.find(x => x.id === id).st[d] = b.dataset.ps; }); closePop(); return; }
  const inp = $('popU');
  if (b.dataset.pu === 'all') { const v = num(inp.value); change(w => { w.rows.find(x => x.id === id).u = Array(7).fill(v); }); closePop(); return; }
  const v = Math.max(0, (num(inp.value) || 0) + Number(b.dataset.pu)); inp.value = v;
  change(w => { w.rows.find(x => x.id === id).u[d] = v; }, { quiet: true }); draw();
});
$('pop').addEventListener('change', e => { if (e.target.id === 'popU' && popAt) { const { id, d } = popAt, v = num(e.target.value); change(w => { w.rows.find(x => x.id === id).u[d] = v; }); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closePop(); closeDlg(); } if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); undo(); } });
document.addEventListener('pointerdown', e => { if (!$('pop').hidden && !e.target.closest('#pop') && !e.target.closest('td.c')) closePop(); });

// ---------- 대화창
function dlg(html) { const m = $('dlg'); m.innerHTML = `<div class="dlg" role="dialog" aria-modal="true">${html}</div>`; m.hidden = false; const f = m.querySelector('input,select,textarea,button'); if (f) f.focus(); return m; }
function closeDlg() { $('dlg').hidden = true; $('dlg').innerHTML = ''; }
$('dlg').addEventListener('click', e => { if (e.target.id === 'dlg') closeDlg(); });
function ask(msg, ok = '확인') {
  return new Promise(res => {
    const m = dlg(`<p>${esc(msg)}</p><div class="acts"><button data-a="0">취소</button><button class="pri" data-a="1">${esc(ok)}</button></div>`);
    m.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { closeDlg(); res(b.dataset.a === '1'); });
  });
}
function rowDlg(r, focus) {
  const isNew = !r; r = r || C.newRow({ u: Array(7).fill(8) });
  const m = dlg(`<h3>${isNew ? '직원 추가' : esc(r.name) + ' 정보'}</h3><div class="f">
    <label for="rN">직원성명</label><input type="text" id="rN" value="${esc(r.name)}">
    <label for="rG">그룹</label><select id="rG">${C.GROUPS.map(g => `<option value="${g}" ${r.group === g ? 'selected' : ''}>${g || '없음'}</option>`).join('')}</select>
    <label for="rJ">입사일</label><input type="date" id="rJ" value="${esc(r.joined)}">
    <label for="rO">신청순</label><input type="number" id="rO" value="${nv(r.ord)}">
    <label for="rP">지난주 누적</label><input type="number" id="rP" value="${nv(r.prev)}">
    <label for="rU">유닛 (7일 모두)</label><input type="number" id="rU" placeholder="바꿀 때만 입력" value="${isNew ? 8 : ''}">
    <label for="rM">특이사항 메모</label><textarea id="rM" style="min-height:80px">${esc(r.memo)}</textarea></div>
    ${isNew ? '<label class="lbl"><input type="checkbox" id="rRos" checked> 기본 명단에도 추가 (다음 주차부터 계속)</label>' : ''}
    <div class="acts">${isNew ? '' : '<button data-a="up">▲ 위로</button><button data-a="down">▼ 아래로</button><button data-a="del" class="dan">이 주차에서 빼기</button>'}<span style="flex:1"></span><button data-a="x">취소</button><button class="pri" data-a="ok">저장</button></div>`);
  if (focus === 'memo') m.querySelector('#rM').focus();
  m.querySelector('.acts').onclick = async e => {
    const a = e.target.dataset && e.target.dataset.a; if (!a) return;
    if (a === 'x') return closeDlg();
    if (a === 'up' || a === 'down') { change(w => { const i = w.rows.findIndex(x => x.id === r.id), j = a === 'up' ? i - 1 : i + 1; if (j < 0 || j >= w.rows.length) return; [w.rows[i], w.rows[j]] = [w.rows[j], w.rows[i]]; }); return; }
    if (a === 'del') { closeDlg(); if (await ask(`${r.name}을(를) 이 주차 표에서 뺄까요? (되돌리기로 다시 살릴 수 있어요)`, '빼기')) change(w => { w.rows = w.rows.filter(x => x.id !== r.id); }); return; }
    const name = m.querySelector('#rN').value.trim(); if (!name) { toast('이름을 적어 주세요'); return; }
    const vals = { name, group: m.querySelector('#rG').value, joined: m.querySelector('#rJ').value, ord: num(m.querySelector('#rO').value), prev: num(m.querySelector('#rP').value), memo: m.querySelector('#rM').value.trim() };
    const u = num(m.querySelector('#rU').value);
    const addRos = isNew && m.querySelector('#rRos').checked;
    closeDlg();
    change(w => {
      if (isNew) {
        const row = C.newRow(Object.assign(vals, { u: Array(7).fill(u) }));
        let at = -1; w.rows.forEach((x, i) => { if (x.group === row.group) at = i; });
        if (at < 0 && row.group !== '고정') at = w.rows.findIndex(x => x.group === '고정') - 1;
        w.rows.splice(at < 0 ? w.rows.length : at + 1, 0, row);
      } else { const x = w.rows.find(y => y.id === r.id); Object.assign(x, vals); if (u != null) x.u = Array(7).fill(u); }
    });
    if (addRos && !S.cfg.roster.some(b => b.name === name)) { S.cfg.roster.push({ name, group: vals.group, base: Array(7).fill(u), off: Array(7).fill('') }); saveC(); }
  };
}

// AI: 허브의 주간 식단 · 인스펙션과 같은 Firebase AI Logic (Gemini) — 설정은 meta/insp_ai (없으면 기본값)
const FB = 'https://www.gstatic.com/firebasejs/12.19.0/', AI_MODELS = ['gemini-3.5-flash', 'gemini-2.5-flash'], AI_KEY = '6LfI2yAuAAAAAEj0vYWJZS1XP7bhatqp7XudI08E';
let aiM = null;
async function aiModel(cfg, name) {
  const [A, G, AC] = await Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-ai.js'), import(FB + 'firebase-app-check.js')]);
  const app = A.getApp(), key = cfg.siteKey || AI_KEY;
  if (key && !window.__inspAppCheck) { const P = cfg.acType === 'v3' ? AC.ReCaptchaV3Provider : AC.ReCaptchaEnterpriseProvider; try { AC.initializeAppCheck(app, { provider: new P(key), isTokenAutoRefreshEnabled: true }); } catch (e) { console.warn('App Check', e); } window.__inspAppCheck = 1; }
  const ai = G.getAI(app, { backend: cfg.backend === 'dev' ? new G.GoogleAIBackend() : new G.VertexAIBackend(cfg.location || 'global') });
  return G.getGenerativeModel(ai, { model: name, generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } });
}
async function toJpegB64(file, edge = 2048) {
  let bmp; try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { throw new Error('사진을 못 읽었어요 (' + file.name + ')'); }
  const s = Math.min(1, edge / Math.max(bmp.width, bmp.height)), cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s); cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  const u = cv.toDataURL('image/jpeg', 0.85); return u.slice(u.indexOf(',') + 1);
}
const AI = {
  async read(files, text) {
    let cfg = {}; try { cfg = (await DB.get('meta/insp_ai')) || {}; } catch (e) {}
    const parts = [text]; for (const f of files) parts.push({ inlineData: { data: await toJpegB64(f), mimeType: 'image/jpeg' } });
    let err = null;
    for (const n of cfg.model ? [cfg.model] : AI_MODELS) {
      try {
        if (!aiM || aiM.name !== n) aiM = { name: n, m: aiModel(cfg, n) };
        const r = await (await aiM.m).generateContent(parts);
        return JSON.parse(String(r.response.text()).replace(/^```(json)?|```$/g, '').trim());
      } catch (e) { err = e; aiM = null; if (!/not found|404|unsupported|is not supported|requires the Firebase AI API/i.test(String(e && e.message))) break; }
    }
    throw err;
  }
};

// ---------- 📷 카톡 사진으로 휴무 넣기: 캡처 → AI 가 읽음 → 바로 적용 (되돌리기 가능) → 결과 보여 줌
function offImgDlg() {
  const m = dlg(`<h3>📷 카톡 사진으로 휴무 넣기</h3>
    <p>휴무 신청이 올라온 카톡방 화면을 캡처해서 올려 주세요. 여러 장이면 한꺼번에 골라도 돼요 (파일 이름 순서 = 대화 순서, 최대 10장).</p>
    <label style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><span class="pri" style="background:var(--navy);color:#fff;border-radius:8px;padding:9px 16px;font-weight:700;cursor:pointer">사진 고르기</span><span id="offN" class="lbl">아직 고른 사진이 없어요</span><input type="file" id="offF" accept="image/*" multiple hidden></label>
    <ul class="lbl" style="margin:0 0 6px;padding-left:18px;line-height:1.7">
      <li>${esc(C.weekTitle(S.w))} (${md(S.w.mon)} ~ ${md(addDays(S.w.mon, 6))}) 표에 넣어요 — 다른 주면 먼저 그 주차를 여세요</li>
      <li>올라온 순서대로 신청순을 매기고, <b>9시 이전</b>에 올린 분은 뒤 번호로 보내요</li>
      <li>빈 칸만 '신청'으로 칠해요 (이미 휴 · 사유 · 독립 · 교육인 칸은 그대로)</li></ul>
    <p id="offSt" class="lbl" style="margin:8px 0 0"></p>
    <div class="acts"><button data-a="x">닫기</button><button class="pri" data-a="go">읽고 적용</button></div>`);
  m.querySelector('#offF').onchange = ev => { const n = ev.target.files.length; m.querySelector('#offN').textContent = n ? '사진 ' + n + '장 골랐어요' + (n > 10 ? ' (앞 10장만 읽어요)' : '') : '아직 고른 사진이 없어요'; };
  m.querySelector('.acts').onclick = async e => {
    const a = e.target.dataset && e.target.dataset.a; if (!a) return;
    if (a === 'x') return closeDlg();
    const files = Array.from(m.querySelector('#offF').files || []).sort((x, y) => x.name.localeCompare(y.name, 'ko', { numeric: true })).slice(0, 10);
    if (!files.length) { toast('캡처 사진을 골라 주세요'); return; }
    e.target.disabled = true; m.querySelector('#offSt').textContent = `사진 ${files.length}장을 읽는 중이에요… (보통 30초 ~ 1분)`;
    let items;
    try { const j = await AI.read(files, C.offPrompt(S.w)); items = Array.isArray(j) ? j : (j && j.items) || []; }
    catch (err) { e.target.disabled = false; m.querySelector('#offSt').textContent = '읽지 못했어요: ' + (err && (err.message || err.code) || err); return; }
    if (!items.length) { e.target.disabled = false; m.querySelector('#offSt').textContent = '휴무 신청 메시지를 찾지 못했어요. 이름과 메시지가 보이게 다시 캡처해 주세요.'; return; }
    let res; change(w => { res = C.applyOff(w, items); });
    offResult(res);
  };
}
function offResult(res) {
  const dd = a => a.map(d => DAYS[d]).join('·');
  const m = dlg(`<h3>휴무 신청 ${res.done.length}건 적용했어요</h3>
    ${res.done.length ? `<div class="scroll" style="max-height:46vh"><table class="sum"><tr><th>신청순</th><th class="rh">이름</th><th>시각</th><th>요일</th><th>비고</th></tr>
    ${res.done.map(x => `<tr><td class="calc">${x.ord == null ? '' : x.ord}</td><td class="rh">${esc(x.who)}</td><td style="${x.early ? 'color:#B45309;font-weight:700' : ''}">${esc(x.time || '-')}${x.early ? ' · 9시 전' : ''}</td>
      <td style="font-weight:700">${x.cancel ? '취소 ' : ''}${dd(x.days)}</td><td style="text-align:left;font-size:13px">${[x.kept.length ? dd(x.kept) + ' 이미 다른 표시라 그대로' : '', x.reason ? '사유: ' + esc(x.reason) + ' (메모에 적음)' : ''].filter(Boolean).join(' · ')}</td></tr>`).join('')}</table></div>` : ''}
    ${res.skip.length ? `<p style="margin:12px 0 4px;color:var(--red);font-weight:700">못 넣은 것 ${res.skip.length}건 — 직접 확인해 주세요</p><ul style="margin:0;padding-left:18px;line-height:1.7">${res.skip.map(x => `<li><b>${esc(x.who)}</b> · ${esc(x.why)}${x.text ? ' — "' + esc(x.text) + '"' : ''}</li>`).join('')}</ul>` : ''}
    <p class="lbl" style="margin:10px 0 0">AI 가 읽은 결과라 틀릴 수 있어요. 표에서 한 번 확인해 주세요.</p>
    <div class="acts"><button data-a="undo">되돌리기</button><button class="pri" data-a="ok">확인</button></div>`);
  m.querySelector('.acts').onclick = e => { const a = e.target.dataset && e.target.dataset.a; if (!a) return; closeDlg(); if (a === 'undo') undo(); };
}

// 주간 스케줄에서 고친 정비보조 이름 · 가능요일은 기본 명단(cfg.helpers)에도 → 다음 주차부터 이어짐
function syncHelpers() { S.cfg.helpers = S.w.helpers.filter(h => h.name).map(h => ({ name: h.name, can: h.can || '' })); saveC(); }

// =============== 국공휴 출근 현황 ===============
// 엑셀 '26년 국공휴데이터'를 옮김. 칸 값 = 직접 고친 값, 없으면 그 주 주간 스케줄에서 자동 (점선 밑줄)
async function loadHol(y) {
  if (S.hol && S.hol.year === y) return;
  try { S.hol = (await Store.getHol(y)) || null; } catch (e) { S.hol = null; }
  if (S.hol) await holWeeks();
}
async function holWeeks() {   // 공휴일이 든 주의 주간 스케줄만 읽어 둠
  S.hwk = S.hwk || {};
  const mons = [...new Set((S.hol ? S.hol.days : []).map(d => C.mondayOf(d.date)))].filter(m => S.weeks.includes(m));
  for (const m of mons) { if (S.w && S.w.mon === m) continue; if (!S.hwk[m]) { try { S.hwk[m] = await Store.getWeek(m); } catch (e) {} } }
}
const holWeekMap = () => { const o = Object.assign({}, S.hwk || {}); if (S.w) o[S.w.mon] = S.w; return o; };
function saveH() { clearTimeout(saveH.t); setSave('저장 대기…'); saveH.t = setTimeout(async () => { try { await Store.setHol(clone(S.hol)); setSave('저장됨 ' + new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 16)); } catch (e) { setSave('저장 실패'); toast('저장하지 못했어요: ' + (e && (e.code || e.message) || e)); } }, 600); }
const HCLS = { 출근: 'h-ok', 휴무: 'h-off', 미입사: 'h-new', 개인사유: 'h-own', 수습: 'h-tr', 퇴사: 'h-out' };
const rankCls = k => k == null ? '' : k <= 10 ? 'r1' : k <= 20 ? 'r2' : 'r3';
function holHtml() {
  const H = S.hol;
  if (!H) return `<div class="empty"><b>국공휴 출근 현황이 아직 없어요</b>지금까지 쓰던 '국공휴데이터' 엑셀을 가져오면 그대로 이어서 써요.<br><br><button class="pri" id="holImp">국공휴 엑셀 가져오기</button> <button id="holNew">빈 표로 시작</button></div>`;
  const R = C.holCalc(H, C.holAuto(H, holWeekMap())), t = today();
  const rows = S.holSort ? R.slice().sort((a, b) => (a.rank == null) - (b.rank == null) || (a.rank || 0) - (b.rank || 0)) : R;
  const months = []; H.days.forEach(d => { const m = Number(d.date.slice(5, 7)); const L = months[months.length - 1]; if (L && L.m === m) L.n++; else months.push({ m, n: 1 }); });
  let h = `<div class="tools"><h3 style="margin:0;font-size:19px">'${String(H.year).slice(2)}년 R/M 국공휴 출근 현황</h3><span class="sp"></span>
    <div class="seg"><button data-hs="0" class="${S.holSort ? '' : 'on'}">명단 순서</button><button data-hs="1" class="${S.holSort ? 'on' : ''}">출근율 높은 순</button></div>
    <button id="holDay">＋ 공휴일 추가</button><button id="holAdd">＋ 직원 추가</button><button id="holImp">엑셀 가져오기</button><button id="holExp">엑셀로 내려받기</button></div>
    <p class="lbl" style="margin:0 0 8px">칸을 누르면 출근 → 휴무 → 개인사유 → 미입사 → 수습 → 퇴사 → 빈칸 · <u style="text-decoration-style:dotted">점선 밑줄</u> = 주간 스케줄에서 자동으로 채운 값 (누르면 직접 값으로 바뀜)</p>
    <div class="scroll" style="max-height:74vh"><table class="g hol"><thead><tr><th rowspan="3">번호</th><th rowspan="3" class="nm">R/M</th>${months.map(x => `<th colspan="${x.n}">${x.m}월</th>`).join('')}
    <th rowspan="3">국공휴<br>개수</th><th rowspan="3">미입사</th><th rowspan="3">휴무</th><th rowspan="3">개인<br>사유</th><th rowspan="3">출근<br>일수</th><th rowspan="3">대상일수<br><small>(출근+휴무)</small></th><th rowspan="3">수습</th><th rowspan="3">퇴사</th><th rowspan="3">출근율</th><th rowspan="3">순위</th></tr>
    <tr>${H.days.map((d, i) => `<th class="hd" data-hd="${i}" title="${esc(d.name)} · 누르면 지우기">${Number(d.date.slice(8))}일</th>`).join('')}</tr>
    <tr>${H.days.map(d => `<th class="hd2 ${d.date > t ? 'fut' : ''}">${['일', '월', '화', '수', '목', '금', '토'][new Date(d.date + 'T12:00:00Z').getUTCDay()]}</th>`).join('')}</tr></thead><tbody>`;
  rows.forEach(x => {
    const i = H.rows.indexOf(x.r);
    h += `<tr><td class="no">${i + 1}</td><td class="nm" data-hn="${i}">${esc(x.r.name)}</td>` +
      H.days.map(d => { const c = x.cell[d.date]; return `<td class="hc ${HCLS[c.v] || ''} ${c.auto ? 'auto' : ''}" data-hr="${i}" data-hdate="${d.date}">${esc(c.v)}</td>`; }).join('') +
      `<td class="n">${H.days.length}</td><td class="n">${x.c['미입사']}</td><td class="n">${x.c['휴무']}</td><td class="n">${x.c['개인사유']}</td><td class="n" style="font-weight:800">${x.c['출근']}</td><td class="n">${x.base}</td><td class="n">${x.c['수습']}</td><td class="n">${x.c['퇴사']}</td>
      <td class="n" style="color:#c0392b;font-weight:700">${x.rate == null ? '' : x.rate.toFixed(1)}</td><td class="n ${rankCls(x.rank)}" style="font-weight:800">${x.rank == null ? '' : x.rank}</td></tr>`;
  });
  h += `</tbody></table></div>
    <div class="legend"><span>표기 <i class="h-ok" style="border:1px solid #ccd">출근</i><i class="h-off">휴무</i><i class="h-new">미입사</i><i class="h-own">개인사유</i><i class="h-tr">수습</i><i class="h-out">퇴사</i></span><span>순위 <i class="r1">1~10위</i><i class="r2">11~20위</i><i class="r3">21위~</i></span>
    <span>출근율 = 출근 ÷ (출근 + 휴무) × 100 · 미입사 · 수습 · 퇴사 · 개인사유는 빼고 셈 · 빈칸(지나지 않은 공휴일)은 반영 안 됨</span></div>`;
  return h;
}
function holCycle(i, date) {
  const r = S.hol.rows[i], auto = (C.holAuto(S.hol, holWeekMap())[r.name] || {})[date] || '';
  const cur = (r.v && r.v[date]) || auto, L = ['', ...C.HOL_ST], nx = L[(L.indexOf(cur) + 1) % L.length];
  r.v = r.v || {}; if (nx) r.v[date] = nx; else delete r.v[date];
  saveH(); draw();
}
// 이번 주에 국공휴가 있으면: 주간 스케줄 위에 알림 + 출근율 높은 분부터 (휴무 배정 참고)
function weekHolNote() {
  if (!S.hol || !S.w) return '';
  const ds = S.hol.days.filter(d => d.date >= S.w.mon && d.date <= addDays(S.w.mon, 6));
  if (!ds.length) return '';
  const R = C.holCalc(S.hol, C.holAuto(S.hol, holWeekMap())).filter(x => x.rate != null && S.w.rows.some(r => r.name === x.r.name)).sort((a, b) => b.rate - a.rate).slice(0, 8);
  return `<div class="ban w" style="background:#9B2C2C">🇰🇷 이번 주 국공휴: ${ds.map(d => md(d.date) + '(' + DAYS[C.dowIdx(d.date)] + ') ' + esc(d.name)).join(', ')}
    <span style="font-weight:500;opacity:.92"> · 국공휴 출근율 높은 분: ${R.map(x => esc(x.r.name) + ' ' + x.rate.toFixed(0) + '%').join(', ')}</span></div>`;
}
$('holFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const X = await XL(), H = C.importHolXlsx(X, new Uint8Array(await f.arrayBuffer()));
    if (!await ask(`'${String(H.year).slice(2)}년 국공휴 ${H.days.length}일 · 직원 ${H.rows.length}명을 가져올까요?${S.hol && S.hol.year === H.year ? ' 지금 표를 덮어써요.' : ''}`, '가져오기')) return;
    S.hol = H; await Store.setHol(clone(H)); await holWeeks(); S.tab = 'hol'; draw(); toast('가져왔어요');
  } catch (err) { toast('가져오지 못했어요: ' + (err.message || err)); }
});
function holClick(t, b) {
  if (b) {
    if (b.id === 'holImp') { $('holFile').click(); return true; }
    if (b.id === 'holNew') { const y = Number((S.w ? S.w.mon : today()).slice(0, 4)); S.hol = { year: y, days: [], rows: S.cfg.roster.filter(r => r.name && r.group !== '고정').map(r => ({ name: r.name, v: {} })) }; saveH(); draw(); return true; }
    if (b.dataset.hs != null) { S.holSort = b.dataset.hs === '1'; draw(); return true; }
    if (b.id === 'holExp') { holExport(); return true; }
    if (b.id === 'holAdd') {
      const have = new Set(S.hol.rows.map(r => r.name)), cand = S.cfg.roster.filter(r => r.name && r.group !== '고정' && !have.has(r.name));
      const m = dlg(`<h3>국공휴 표에 직원 추가</h3><div class="f"><label for="hN">이름</label><input type="text" id="hN" list="hNL" placeholder="이름"><datalist id="hNL">${cand.map(r => `<option value="${esc(r.name)}">`).join('')}</datalist></div>
        ${cand.length ? `<p class="lbl">기본 명단에 있고 이 표에 없는 분: ${cand.map(r => esc(r.name)).join(', ')}</p>` : ''}<p class="lbl">고정 근무자는 이 표에 넣지 않아요. 입사 전 공휴일은 '미입사'로 채워요.</p>
        <div class="acts"><button data-a="x">취소</button><button class="pri" data-a="ok">추가</button></div>`);
      m.querySelector('.acts').onclick = e => { const a = e.target.dataset && e.target.dataset.a; if (!a) return; const n = m.querySelector('#hN').value.trim(); closeDlg(); if (a !== 'ok' || !n) return;
        const v = {}; S.hol.days.forEach(d => { if (d.date < today()) v[d.date] = '미입사'; }); S.hol.rows.push({ name: n, v }); saveH(); draw(); };
      return true;
    }
    if (b.id === 'holDay') {
      const m = dlg(`<h3>공휴일 추가</h3><div class="f"><label for="hD">날짜</label><input type="date" id="hD"><label for="hDN">이름</label><input type="text" id="hDN" placeholder="예: 대체공휴일"></div>
        <div class="acts"><button data-a="x">취소</button><button class="pri" data-a="ok">추가</button></div>`);
      m.querySelector('#hD').onchange = e => { m.querySelector('#hDN').value = C.holName(e.target.value); };
      m.querySelector('.acts').onclick = async e => { const a = e.target.dataset && e.target.dataset.a; if (!a) return; const d = m.querySelector('#hD').value, n = m.querySelector('#hDN').value.trim(); closeDlg();
        if (a !== 'ok' || !/^\d{4}-\d\d-\d\d$/.test(d)) return; if (S.hol.days.some(x => x.date === d)) { toast('이미 있는 날이에요'); return; }
        S.hol.days.push({ date: d, name: n || C.holName(d) }); S.hol.days.sort((x, y) => x.date.localeCompare(y.date)); saveH(); await holWeeks(); draw(); };
      return true;
    }
    return false;
  }
  const hd = t.closest('th[data-hd]');
  if (hd) { const d = S.hol.days[+hd.dataset.hd]; ask(`${md(d.date)} ${d.name}을(를) 표에서 지울까요? 그 날 표기도 같이 지워져요.`, '지우기').then(ok => { if (!ok) return; S.hol.days.splice(+hd.dataset.hd, 1); S.hol.rows.forEach(r => { if (r.v) delete r.v[d.date]; }); saveH(); draw(); }); return true; }
  const hn = t.closest('td[data-hn]');
  if (hn) {
    const i = +hn.dataset.hn, r = S.hol.rows[i];
    const m = dlg(`<h3>${esc(r.name)}</h3><div class="f"><label for="hR">이름</label><input type="text" id="hR" value="${esc(r.name)}"></div>
      <div class="acts"><button data-a="up">▲ 위로</button><button data-a="down">▼ 아래로</button><button data-a="del" class="dan">표에서 빼기</button><span style="flex:1"></span><button data-a="x">취소</button><button class="pri" data-a="ok">저장</button></div>`);
    m.querySelector('.acts').onclick = async e => {
      const a = e.target.dataset && e.target.dataset.a; if (!a) return; const L = S.hol.rows;
      if (a === 'up' || a === 'down') { const j = a === 'up' ? i - 1 : i + 1; if (j >= 0 && j < L.length) { [L[i], L[j]] = [L[j], L[i]]; saveH(); } closeDlg(); draw(); return; }
      closeDlg();
      if (a === 'del') { if (await ask(`${r.name}을(를) 국공휴 표에서 뺄까요? 지금까지 기록도 같이 지워져요.`, '빼기')) { L.splice(i, 1); saveH(); draw(); } return; }
      if (a === 'ok') { const n = m.querySelector('#hR').value.trim(); if (n) { r.name = n; saveH(); draw(); } }
    };
    return true;
  }
  const hc = t.closest('td[data-hr]');
  if (hc) { holCycle(+hc.dataset.hr, hc.dataset.hdate); return true; }
  return false;
}
async function holExport() {
  try {
    const X = await XL(), H = S.hol, R = C.holCalc(H, C.holAuto(H, holWeekMap()));
    const A = [[`R/M 국공휴 출근 현황 ('${String(H.year).slice(2)}년)`], [], ['번호', 'R/M', ...H.days.map(d => md(d.date) + ' ' + d.name), '국공휴 개수', '미입사', '휴무', '개인사유', '출근일수', '대상일수', '수습', '퇴사', '출근율', '순위']];
    R.forEach((x, i) => A.push([i + 1, x.r.name, ...H.days.map(d => x.cell[d.date].v), H.days.length, x.c['미입사'], x.c['휴무'], x.c['개인사유'], x.c['출근'], x.base, x.c['수습'], x.c['퇴사'], x.rate == null ? '' : Math.round(x.rate * 10) / 10, x.rank == null ? '' : x.rank]));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(A), String(H.year).slice(2) + '년');
    download(`국공휴_출근현황_${H.year}.xlsx`, new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })]));
  } catch (e) { toast('엑셀을 만들지 못했어요: ' + (e.message || e)); }
}

// 근무표 · 일별 요약 가로 스크롤 같이 움직이기 (휴대폰 · 좁은 화면)
function syncScroll() {
  const a = $('gridScroll'), b = $('sumScroll'); if (!a || !b) return;
  let lock = false; const tie = (x, y) => x.addEventListener('scroll', () => { if (lock) return; lock = true; y.scrollLeft = x.scrollLeft; requestAnimationFrame(() => { lock = false; }); });
  tie(a, b); tie(b, a);
}

// ---------- 새 주차
function fillFromRoster(w) { S.cfg.roster.filter(b => b.name).forEach(b => w.rows.push(C.newRow({ name: b.name, group: b.group, st: (b.off || Array(7).fill('')).slice(), u: (b.base || Array(7).fill(null)).map(num), prev: 0 }))); }
function newWeekDlg() {
  if (!S.w) { toast('먼저 엑셀을 가져오거나 빈 주차를 만들어 주세요'); return; }
  const last = S.weeks[S.weeks.length - 1];
  const go = async () => {
    const base = last === S.w.mon ? S.w : await Store.getWeek(last);
    const pre = C.newWeekFrom(base, S.cfg), nw = pre.week;
    const m = dlg(`<h3>새 주차 만들기</h3><p><b>${esc(C.weekTitle(nw))}</b> · ${md(nw.mon)} ~ ${md(addDays(nw.mon, 6))} (${esc(C.weekTitle(base))} 다음 주)</p>
      <ul style="margin:0 0 10px;padding-left:20px;line-height:1.8"><li>유닛은 기본유닛, 고정 그룹은 기본휴무로 다시 채워요</li><li>신청순 · 신청휴무 · 사유 · 휴 · 캔슬을 지워요</li><li>지난주 누적 = ${esc(C.weekTitle(base))} 합계</li>
      <li>예약 · 체크아웃 · 유숙 · 이월 · 정비보조 출근 · 작업객실을 비워요 (다음 월 예약 · 체크아웃은 월요일로)</li>
      ${pre.removed.length ? `<li><b>퇴사 처리로 빠지는 분:</b> ${pre.removed.map(esc).join(', ')}</li>` : ''}</ul>
      <div class="f" style="grid-template-columns:110px minmax(0,1fr)"><label for="nwNo">주차 번호</label><input type="number" id="nwNo" value="${nw.no}"></div>
      ${pre.monthChange ? '<label class="lbl" style="display:block;margin-bottom:6px"><input type="checkbox" id="nwReset"> 달이 바뀌는 주예요 — 지난주 누적을 0으로 시작</label>' : ''}
      ${S.weeks.includes(nw.mon) ? '<p class="neg"><b>이 주차가 이미 있어요. 만들면 덮어써요.</b></p>' : ''}
      <div class="acts"><button data-a="x">취소</button><button class="pri" data-a="ok">만들기</button></div>`);
    m.querySelector('.acts').onclick = async e => {
      const a = e.target.dataset && e.target.dataset.a; if (!a) return;
      if (a === 'x') return closeDlg();
      const reset = m.querySelector('#nwReset') && m.querySelector('#nwReset').checked;
      const w = reset ? C.newWeekFrom(base, S.cfg, { resetCum: true }).week : nw;
      w.no = num(m.querySelector('#nwNo').value) || w.no;
      closeDlg(); await flushNow();
      S.w = w; S.undo = []; S.di = 0; if (!S.weeks.includes(w.mon)) { S.weeks.push(w.mon); S.weeks.sort(); }
      S.tab = 'week'; saveW(); drawBar(); draw(); toast(C.weekTitle(w) + '를 만들었어요');
    };
  };
  go();
}
function syncRoster() {
  const have = new Set(S.cfg.roster.map(b => b.name)), byName = {};
  S.cfg.roster.forEach(b => { byName[b.name] = b; });
  const add = S.w.rows.filter(r => r.name && !have.has(r.name));
  // 이번 주 순서대로 다시 늘어놓고, 없던 분은 이번 주 유닛으로 추가
  S.cfg.roster = S.w.rows.filter(r => r.name).map(r => byName[r.name] || { name: r.name, group: r.group, base: r.u.slice(), off: r.group === '고정' ? r.st.map(s => s === '신청' ? '신청' : '') : Array(7).fill('') })
    .concat(S.cfg.roster.filter(b => !S.w.rows.some(r => r.name === b.name)));
  saveC(); draw(); toast(add.length ? add.length + '명 추가 · 순서를 이번 주에 맞췄어요' : '순서를 이번 주에 맞췄어요');
}

// ---------- 엑셀 · 이미지 · 복사 · 백업
const libs = {};
function lib(name, src) { return libs[name] || (libs[name] = new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = () => ok(window[name]); s.onerror = () => { libs[name] = null; no(new Error('파일을 불러오지 못했어요')); }; document.head.appendChild(s); })); }
const XL = () => lib('XLSX', 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
$('fileIn').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const X = await XL(), { week: w, info } = C.importXlsx(X, new Uint8Array(await f.arrayBuffer()));
    const exists = S.weeks.includes(w.mon);
    const m = dlg(`<h3>엑셀 가져오기</h3><p><b>${esc(C.weekTitle(w))}</b> · ${md(w.mon)} ~ ${md(addDays(w.mon, 6))}</p>
      <ul style="margin:0 0 10px;padding-left:20px;line-height:1.8"><li>직원 ${info.rows}명 · 정비보조 ${info.helpers}명 · 작업객실 ${info.work}건</li><li>일일 스케줄: ${info.day ? md(info.day) + ' 유닛 수정 · 더티 · 인계사항' : '이번 주 날짜가 아니라 건너뜀'}</li></ul>
      ${exists ? '<p class="neg"><b>이 주차가 이미 있어요. 가져오면 덮어써요.</b></p>' : ''}
      ${S.cfg.roster.length ? '' : '<p class="lbl">기본 명단이 비어 있어서, 이 주차 명단과 유닛으로 기본 명단도 만들어요.</p>'}
      <div class="acts"><button data-a="x">취소</button><button class="pri" data-a="ok">가져오기</button></div>`);
    m.querySelector('.acts').onclick = async ev => {
      const a = ev.target.dataset && ev.target.dataset.a; if (!a) return; closeDlg(); if (a === 'x') return;
      await flushNow();
      if (!S.cfg.roster.length) { S.cfg.fullDays = w.fullDays; S.cfg.rooms = w.rooms; S.cfg.helpers = w.helpers.map(h => ({ name: h.name, can: h.can })); S.w = w; syncRoster(); }
      S.w = w; S.undo = []; if (!S.weeks.includes(w.mon)) { S.weeks.push(w.mon); S.weeks.sort(); }
      S.di = info.day ? C.dowIdx(info.day) : 0; S.tab = 'week'; saveW(); drawBar(); draw(); toast('가져왔어요');
    };
  } catch (err) { toast('가져오지 못했어요: ' + (err.message || err)); }
});
async function download(filename, data) {
  let dl = null; try { dl = window.claude && await window.claude.use('downloads'); } catch (e) {}
  if (dl) { try { await dl.save({ filename, data }); toast('내려받았어요'); return true; } catch (e) { if (e && e.code !== 'declined') toast('내려받지 못했어요 (' + (e.code || e.message) + ')'); return false; } }
  try { const a = document.createElement('a'); a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data])); a.download = filename; a.click(); return true; } catch (e) { toast('이 화면에서는 내려받을 수 없어요'); return false; }
}
async function exportX() {
  try { const X = await XL(); const buf = C.exportXlsx(X, S.w, S.di); download(`룸메이드_스케줄_${S.w.mon.slice(2, 4)}년${Number(S.w.mon.slice(5, 7))}월${S.w.no}주차.xlsx`, new Blob([buf])); }
  catch (e) { toast('엑셀을 만들지 못했어요: ' + (e.message || e)); }
}
async function makePng(id) {
  const h2c = await lib('html2canvas', 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  const el = $(id), cv = await h2c(el, { scale: 2, backgroundColor: '#ffffff', width: el.scrollWidth, windowWidth: el.scrollWidth + 40 });
  return new Promise(r => cv.toBlob(r, 'image/png'));
}
async function saveImg(id, fn) {
  try { download(fn + '.png', await makePng(id)); } catch (e) { toast('이미지를 만들지 못했어요: ' + (e.message || e)); }
}
// 카톡으로 공유: 휴대폰 공유 창(카카오톡 고르기)으로 이미지 파일을 보냄. 공유 창이 없는 곳(PC 등)은 이미지로 저장 → 카톡에 사진으로 보내기
async function shareImg(id, fn, title) {
  toast('이미지 만드는 중…');
  let blob; try { blob = await makePng(id); } catch (e) { toast('이미지를 만들지 못했어요: ' + (e.message || e)); return; }
  const file = new File([blob], fn + '.png', { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  if (await download(fn + '.png', blob)) toast('이미지를 저장했어요 · 카톡 채팅방에서 사진으로 보내 주세요');
}
async function copy(txt) { try { await navigator.clipboard.writeText(txt); toast('복사했어요 · 카톡에 붙여 넣으세요'); } catch (e) { dlg(`<h3>아래 글을 길게 눌러 복사하세요</h3><textarea style="min-height:300px">${esc(txt)}</textarea><div class="acts"><button onclick="document.getElementById('dlg').hidden=true">닫기</button></div>`); } }
async function backupOut() {
  await flushNow(); const weeks = {};
  for (const m of S.weeks) weeks[m] = await Store.getWeek(m);
  download(`룸메이드_스케줄_백업_${today()}.json`, JSON.stringify({ app: 'rmsched', v: 1, at: today(), cfg: S.cfg, weeks, hol: S.hol || null }, null, 1));
}
$('jsonIn').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const B = JSON.parse(await f.text()); if (B.app !== 'rmsched') throw new Error('이 앱의 백업 파일이 아니에요');
    if (!await ask(`백업(${B.at})의 기본값과 주차 ${Object.keys(B.weeks).length}개${B.hol ? ', 국공휴 출근 현황' : ''}를 불러올까요? 같은 주차는 덮어써요.`, '불러오기')) return;
    S.cfg = B.cfg; await Store.setCfg(S.cfg);
    for (const m of Object.keys(B.weeks)) { await Store.setWeek(B.weeks[m]); if (!S.weeks.includes(m)) S.weeks.push(m); }
    if (B.hol && B.hol.year) { await Store.setHol(B.hol); S.hol = null; }
    S.weeks.sort(); await openWeek(S.weeks[S.weeks.length - 1]); toast('불러왔어요');
  } catch (err) { toast('불러오지 못했어요: ' + (err.message || err)); }
});

// ---------- 로그인 (소장 · 부소장 — 허브와 같은 계정)
const ROLES = [
  { label: '소장', email: 'unieshaeundae+admin@gmail.com', uid: 'iw2orXgIgPgTbLUQa0b41XJ9Dvd2' },
  { label: '부소장', email: 'unieshaeundae+sub@gmail.com', uid: 'Fz4T5ZzIxShOdVkNpF9gzMmOLED2' }
];
const login = { who: 0, err: '', busy: false };
const roleOf = u => (!u || u.anon) ? null : ROLES.filter(r => r.uid === u.uid || r.email === u.email)[0] || null;
function drawLogin() {
  $('appBox').hidden = true; $('loginBox').hidden = false; $('logout').hidden = true; setSave('');
  $('loginBox').innerHTML = '<h3>관리자 로그인</h3><div class="seg" role="group">' + ROLES.map((r, i) => `<button data-who="${i}" class="${login.who === i ? 'on' : ''}">${r.label}</button>`).join('') + '</div>' +
    '<input type="password" id="pw" autocomplete="current-password" placeholder="비밀번호">' + (login.err ? `<p class="err">${esc(login.err)}</p>` : '') +
    `<button class="pri" id="doLogin" style="width:100%" ${login.busy ? 'disabled' : ''}>${login.busy ? '확인 중…' : '들어가기'}</button>` +
    '<p class="lbl" style="margin:10px 0 0">허브(객실 통합 관리)와 같은 비밀번호예요. 이 기기에서 한 번 들어가면 다음부터는 바로 열려요.</p>';
}
$('loginBox').addEventListener('click', e => { const w = e.target.closest('[data-who]'); if (w) { login.who = +w.dataset.who; drawLogin(); } if (e.target.id === 'doLogin') doLogin(); });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'pw') doLogin(); });
async function doLogin() {
  const pw = ($('pw') || {}).value || ''; if (!pw) { login.err = '비밀번호를 적어 주세요.'; drawLogin(); return; }
  login.busy = true; login.err = ''; drawLogin();
  try { await DB.signInEmail(ROLES[login.who].email, pw); } catch (e) { login.err = /network|offline/i.test(String(e && (e.code || e.message))) ? '인터넷 연결을 확인해 주세요.' : '비밀번호가 맞지 않아요.'; login.busy = false; drawLogin(); return; }
  login.busy = false;
}
$('logout').onclick = async () => { await flushNow(); await DB.signOut(); location.reload(); };
window.addEventListener('beforeunload', e => { if (q.w.t || q.c.t) { e.preventDefault(); e.returnValue = ''; } });
DB.onUser(u => {
  const role = roleOf(u);
  if (u && !u.anon && !role) login.err = '지금 로그인된 계정은 이 화면을 쓸 수 없어요 (소장 · 부소장 전용).';
  if (!role) { drawLogin(); return; }
  $('loginBox').hidden = true; $('appBox').hidden = false; $('logout').hidden = false;
  start();
});
}
