// hub/sched/sched.js — 📅 하우스맨 근무 스케줄 편성 (2026-11-22)
// 8인(오더테이커·주간전용·로테이터) 월 스케줄을 규칙 기반으로 자동 편성 → 손으로 다듬기 → 확정 → 엑셀
// 편성 엔진은 solver.js (window.HKSolver, 순수 계산·Firebase 모름). 규칙 명세는 claude 프로젝트 '하우스맨 스케줄 편성' 문서
// 저장: hksched/cfg = 명단(구분·방편성·이월·누적) · 관리자 · 필요인원 · 누적 현황(hist: E조·C조 월별, 국공휴 출근)
//       hksched/{YYYY-MM} = 그 달 휴무신청 · 직접 고정 · 관리자 칸 · 편성 결과 · 상태(작성중/확정)
// 쓰는 사람: 소장·부소장만 (허브 첫 화면 '근무 스케줄 편성' 칸). 하우스키퍼·파트장 계정이 열면 보기 화면(view.html)으로 보냄 (11/22 기능 분리)
import * as DB from '../../rm/app/store.js';
import { printSchedule } from './print.js?v=2026.11.22-12';
const $ = id => document.getElementById(id);
const HOL = {2026:{1:[1],2:[16,17,18],3:[1],5:[1,5,24],6:[3,6],7:[17],8:[15],9:[24,25,26],10:[3,9],12:[25]},
             2027:{1:[1],2:[6,7,8],3:[1],5:[1,5,13],6:[6],7:[17],8:[15],9:[14,15,16],10:[3,9],12:[25]}};
const KIND = {ot:'오더테이커(A만)', day:'주간전용(A·E)', rot:'로테이터(A·E·C)'};
const CODES = ['A','E','C','O','B','연'];
const HIST0 = {"ec": {"2026-02": {"박성현": [7, 9], "이진재": [8, 9], "김종민": [8, 9]}, "2026-03": {"박성현": [8, 8], "이진재": [6, 9], "김종민": [7, 8], "김요셉": [8, 7]}, "2026-04": {"박성현": [6, 10], "이진재": [7, 11], "김종민": [8, 10], "김요셉": [7, 10], "이교근": [7, 10], "박동욱": [8, 9]}, "2026-05": {"박성현": [8, 11], "이진재": [7, 11], "김종민": [6, 10], "김요셉": [8, 10], "이교근": [7, 10], "박동욱": [7, 10]}, "2026-06": {"박성현": [6, 10], "이진재": [5, 8], "김종민": [6, 12], "김요셉": [7, 10], "이교근": [7, 11], "박동욱": [7, 9]}, "2026-07": {"박성현": [7, 10], "이진재": [6, 10], "김종민": [8, 11], "김요셉": [7, 10], "이교근": [8, 11], "박동욱": [8, 10]}, "2026-08": {"박성현": [8, 11], "이진재": [8, 10], "김종민": [8, 10], "김요셉": [8, 10], "이교근": [9, 11], "박동욱": [7, 10], "황준호": [13, 0]}, "2026-09": {"박성현": [8, 11], "이진재": [8, 10], "김종민": [8, 10], "김요셉": [8, 10], "이교근": [7, 11], "박동욱": [7, 10], "황준호": [14, 0]}, "2026-10": {"박성현": [8, 12], "이진재": [8, 10], "김종민": [8, 10], "김요셉": [8, 10], "이교근": [7, 10], "박동욱": [7, 10], "황준호": [16, 0]}, "2026-11": {"박성현": [7, 10], "이진재": [9, 10], "김종민": [7, 10], "김요셉": [7, 10], "이교근": [7, 10], "박동욱": [8, 10], "황준호": [15, 0]}}, "hol": [{"date": "2026-01-01", "name": "신정", "att": {"박성현": "휴", "이진재": "출", "장혜지": "출", "한수영": "출", "김현우": "출", "이원향": "출"}}, {"date": "2026-02-16", "name": "설 날", "att": {"박성현": "출", "이진재": "휴", "김종민": "출", "장혜지": "출", "한수영": "휴", "김현우": "출", "이원향": "출"}}, {"date": "2026-02-17", "name": "설 날", "att": {"박성현": "출", "이진재": "출", "김종민": "출", "장혜지": "휴", "한수영": "출", "김현우": "휴", "이원향": "출"}}, {"date": "2026-02-18", "name": "설 날", "att": {"박성현": "출", "이진재": "출", "김종민": "휴", "장혜지": "출", "한수영": "출", "김현우": "출", "이원향": "휴"}}, {"date": "2026-03-01", "name": "삼일절", "att": {"박성현": "출", "이진재": "출", "김종민": "출", "김요셉": "휴", "장혜지": "휴", "한수영": "출", "김현우": "출", "이원향": "출"}}, {"date": "2026-05-01", "name": "근로자의날", "att": {"박성현": "출", "이진재": "출", "김종민": "출", "김요셉": "출", "이교근": "출", "박동욱": "휴", "장혜지": "출", "한수영": "출", "김현우": "출", "이원향": "휴"}}, {"date": "2026-05-05", "name": "어린이날", "att": {"박성현": "출", "이진재": "출", "김종민": "휴", "김요셉": "출", "이교근": "휴", "박동욱": "출", "장혜지": "출", "한수영": "휴", "김현우": "출", "이원향": "출"}}, {"date": "2026-05-24", "name": "부처님오신날", "att": {"박성현": "출", "이진재": "출", "김종민": "출", "김요셉": "휴", "이교근": "출", "박동욱": "출", "장혜지": "휴", "한수영": "출", "김현우": "휴", "이원향": "출"}}, {"date": "2026-06-03", "name": "지방선거", "att": {"박성현": "출", "이진재": "휴", "김종민": "출", "김요셉": "출", "이교근": "휴", "박동욱": "출", "장혜지": "휴", "한수영": "출", "김현우": "출", "이원향": "출"}}, {"date": "2026-06-06", "name": "현충일", "att": {"박성현": "출", "이진재": "출", "김종민": "휴", "김요셉": "출", "이교근": "출", "박동욱": "출", "장혜지": "휴", "한수영": "출", "김현우": "출", "이원향": "출"}}, {"date": "2026-07-17", "name": "제헌절", "att": {"박성현": "출", "이진재": "휴", "김종민": "출", "김요셉": "출", "이교근": "출", "박동욱": "출", "장혜지": "출", "한수영": "출", "김현우": "휴", "이원향": "출"}}, {"date": "2026-08-15", "name": "광복절", "att": {"박성현": "출", "이진재": "출", "김종민": "출", "김요셉": "출", "이교근": "출", "박동욱": "출", "장혜지": "출", "한수영": "출", "김현우": "출", "이원향": "출"}}, {"date": "2026-09-24", "name": "추석", "att": {"박성현": "휴", "이진재": "출", "김종민": "휴", "김요셉": "출", "이교근": "출", "박동욱": "출", "장혜지": "출", "황준호": "출", "한수영": "출", "김현우": "출", "이원향": "휴"}}, {"date": "2026-09-25", "name": "추석", "att": {"박성현": "휴", "이진재": "출", "김종민": "출", "김요셉": "출", "이교근": "휴", "박동욱": "출", "장혜지": "출", "황준호": "출", "한수영": "출", "김현우": "출", "이원향": "출"}}, {"date": "2026-09-26", "name": "추석", "att": {"박성현": "출", "이진재": "출", "김종민": "출", "김요셉": "휴", "이교근": "출", "박동욱": "출", "장혜지": "출", "황준호": "출", "한수영": "출", "김현우": "출", "이원향": "출"}}, {"date": "2026-10-03", "name": "개천절", "att": {"박성현": "휴", "이진재": "휴", "김종민": "출", "김요셉": "출", "이교근": "출", "박동욱": "출", "장혜지": "출", "황준호": "출", "한수영": "출", "김현우": "출", "이원향": "출"}}, {"date": "2026-10-09", "name": "한글날", "att": {"박성현": "출", "이진재": "휴", "김종민": "출", "김요셉": "휴", "이교근": "출", "박동욱": "출", "장혜지": "출", "황준호": "출", "한수영": "출", "김현우": "출", "이원향": "출"}}]};
const defaults = () => ({
  year:2026, month:12, need:{A:2,E:2,C:2,O:2}, eDay:15, leaveMode:'inO',
  staff:[
    {name:'장혜지',kind:'ot',nightKey:false,carry:{type:'O',n:1},cum:{m:4,C:0,E:0,work:.730,holW:12,holT:17}},
    {name:'박성현',kind:'rot',nightKey:true,carry:{type:'O',n:1},cum:{m:10,C:10.2,E:7.3,work:.787,holW:13,holT:17}},
    {name:'이진재',kind:'rot',nightKey:true,carry:{type:'C',n:4},cum:{m:10,C:9.8,E:7.2,work:.779,holW:12,holT:17}},
    {name:'김종민',kind:'rot',nightKey:true,carry:{type:'A',n:1},cum:{m:10,C:10.0,E:7.4,work:.762,holW:12,holT:16}},
    {name:'김요셉',kind:'rot',nightKey:true,carry:{type:'C',n:3},cum:{m:9,C:9.67,E:7.56,work:.770,holW:9,holT:13}},
    {name:'이교근',kind:'rot',nightKey:false,carry:{type:'A',n:5},cum:{m:8,C:10.5,E:7.38,work:.770,holW:9,holT:12}},
    {name:'박동욱',kind:'rot',nightKey:false,carry:{type:'A',n:3},cum:{m:8,C:9.75,E:7.38,work:.750,holW:11,holT:12}},
    {name:'황준호',kind:'day',nightKey:false,carry:{type:'A',n:1},cum:{m:4,C:0,E:14.5,work:.759,holW:5,holT:5}}],
  managers:['한수영','김현우','이원향'], mgr:{}, hist:JSON.parse(JSON.stringify(HIST0)),
  forced:{}, locks:{}, holidays:[25], extra:[], grid:null, seed:1
});
let S = defaults();
// ---------- 저장: Firestore hksched/cfg (명단·누적·관리자) + hksched/{YYYY-MM} (그 달 편성) — 고친 뒤 0.8초 모아서 한 번에
let user = null, role = null, login = { who: 1, err: '', busy: false }, latestKey = '', saveT = 0, saving = false, savedAt = 0, saveErr = '';
const ymKey = (y, m) => y + '-' + String(m).padStart(2, '0');
const canEdit = () => !!(role && role.k === 'boss');
const save = () => { if (!canEdit()) return; clearTimeout(saveT); setSave('저장 대기…'); saveT = setTimeout(saveNow, 800); };
function setSave(t){ const el = $('saveSt'); if (el) el.textContent = t; }
// 확정 버튼을 누른 달 → cfg.lastConf (허브 하우스키퍼 칸 '근무 스케줄' NEW 표시용). 한 번 보내면 지움
let confPending = '';
const newConf = key => { if (confPending !== key) return {}; confPending = ''; return { lastConf: { ym: key, at: DB.SERVER_TIME } }; };
async function saveNow(){
  clearTimeout(saveT); if (!canEdit()) return;
  const key = ymKey(S.year, S.month); saving = true; setSave('저장 중…');
  try {
    const month = { year:S.year, month:S.month, staff:S.staff, managers:S.managers, forced:S.forced, locks:S.locks, mgr:S.mgr, holidays:S.holidays, extra:S.extra, notes:S.notes || {}, autoOff:S.autoOff || {}, src:S.src || '',
      grid:S.grid || null, leaveMode:S.leaveMode, seed:S.seed, need:S.need, state:S.state || '작성중', by:role.label, at:DB.SERVER_TIME };
    await DB.set('hksched/' + key, month);
    if (key >= latestKey) {   // 지난 달을 고칠 때는 명단 원본(이월·누적)을 건드리지 않음
      latestKey = key;
      await DB.merge('hksched/cfg', Object.assign({ staff:S.staff, managers:S.managers, need:S.need, eDay:S.eDay, hist:S.hist, cur:key, by:role.label, at:DB.SERVER_TIME }, newConf(key)));
    } else await DB.merge('hksched/cfg', Object.assign({ managers:S.managers, eDay:S.eDay, hist:S.hist }, newConf(key)));
    savedAt = Date.now(); saveErr = ''; setSave('저장됨 ' + new Date().toTimeString().slice(0,5));
  } catch (e) { saveErr = String(e && (e.code || e.message) || e); setSave('저장 실패: ' + saveErr); toast('저장하지 못했어요 — 인터넷 연결이나 권한(규칙)을 확인해 주세요'); }
  saving = false;
}
async function loadMonth(y, m){
  let cfg = null, md = null;
  try { [cfg, md] = await Promise.all([DB.get('hksched/cfg'), DB.get('hksched/' + ymKey(y, m))]); }
  catch (e) { toast('불러오지 못했어요: ' + (e.code || e.message)); }
  const b = defaults(); b.year = y; b.month = m;
  b.holidays = ((HOL[y]||{})[m]||[]).slice(); b.extra = []; b.forced = {}; b.locks = {}; b.mgr = {}; b.grid = null; b.state = '작성중'; b.notes = {}; b.autoOff = {}; b.src = '';
  if (cfg) { ['staff','managers','need','eDay','hist'].forEach(k => { if (cfg[k] != null) b[k] = cfg[k]; }); latestKey = cfg.cur || ''; }
  if (md) ['staff','managers','forced','locks','mgr','holidays','extra','grid','leaveMode','seed','need','state','notes','autoOff','src'].forEach(k => { if (md[k] != null) b[k] = md[k]; });
  // 지난 달(엑셀에서 가져온 달)의 명단에는 누적값이 없음 → 지금 명단(cfg)의 값, 없으면 기본값
  const cfgCum = {}; ((cfg && cfg.staff) || defaults().staff).forEach(s => { cfgCum[s.name] = s.cum; });
  b.staff = b.staff.map(s => s.cum ? s : Object.assign({}, s, { cum: cfgCum[s.name] || { m:0, C:10, E:7.5, work:.77, holW:0, holT:0 } }));
  b.notes = b.notes || {}; b.autoOff = b.autoOff || {};
  b.hist = b.hist || JSON.parse(JSON.stringify(HIST0)); b.hist.ec = b.hist.ec || {}; b.hist.hol = b.hist.hol || [];
  S = b; S._exists = !!md; S._cfg = !!cfg; S._pastDone = !!(cfg && cfg.pastImported);
  if (!cfg && canEdit()) { latestKey = ymKey(y, m); saveNow(); }
}
let mode = 'off', issues = [];
const nd = () => new Date(S.year, S.month, 0).getDate();
const dow = d => new Date(S.year, S.month - 1, d).getDay();
const WD = ['일','월','화','수','목','금','토'];
const toast = m => { const t = $('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2400); };
const carryLbl = c => c && c.n ? ({A:'주',C:'야',O:'휴'}[c.type] + c.n) : '휴0';

function buildInput(){
  return { year:S.year, month:S.month, nd:nd(), need:S.need, eDayTarget:S.eDay, leaveMode:S.leaveMode,
    extraDays:S.extra.slice(), holidays:S.holidays.slice(),
    staff:S.staff.map(s => ({ name:s.name, kind:s.kind, nightKey:s.nightKey, carry:s.carry,
      forced:(S.forced[s.name]||[]).slice(), locks:Object.assign({}, S.locks[s.name]||{}),
      minO:s.minO != null ? s.minO : (s.kind==='ot' ? 8 : 0),
      cum:{ C:s.kind==='rot'?s.cum.C:null, E:s.kind!=='ot'?s.cum.E:null, workRate:s.cum.work, holRate:((s.cum.holW||0) + 1.5) / ((s.cum.holT||0) + 2), holW:s.cum.holW||0, holT:s.cum.holT||0 } })) };
}
function gridArr(){ if(!S.grid) return null; return S.staff.map(s => (S.grid[s.name] || []).slice(0, nd())); }
// 관리자 3인 (11/22): 휴무 등 적은 날 말고는 모두 A(일근)
const mgrCode = (m, d) => (S.mgr[m]||{})[d+1] || 'A';
function cellCode(p, d){
  const s = S.staff[p], L = (S.locks[s.name]||{})[d+1];
  if (L) return L;
  if ((S.forced[s.name]||[]).includes(d+1)) return 'O';
  return S.grid && S.grid[s.name] ? S.grid[s.name][d] : '';
}

function render(){
  $('ttl').textContent = `${S.year}년 ${S.month}월 근무 스케줄`;
  $('pastBox').hidden = !canEdit() || !!S._pastDone;
  $('conf').textContent = S.state === '확정' ? '확정 풀기' : '확정하기';
  $('stChip').textContent = S.state === '확정' ? '확정' : (S._exists ? '작성 중' : '새 달'); $('stChip').className = 'stc ' + (S.state === '확정' ? 'ok' : '');
  if (!canEdit() && S.state !== '확정') {
    $('grid').innerHTML = `<tr><td style="padding:24px;text-align:left">${S.month}월 스케줄은 아직 확정 전이에요. 소장님이 확정하면 여기에 보여요.</td></tr>`;
    $('chips').innerHTML = ''; $('iss').innerHTML = ''; $('fair').innerHTML = '<h2>형평성</h2>'; renderHist(); return;
  }
  const N = nd(), G = S.staff.map((s,p) => Array.from({length:N}, (_,d) => cellCode(p,d)));
  const full = G.every(r => r.every(c => c));
  const inp = buildInput();
  issues = full ? HKSolver.validate(inp, G) : [];
  const badCells = new Set(issues.filter(i => i.lv !== 'info' && i.p != null && i.d).map(i => i.p + '_' + i.d));
  const wkEnd = Array.from({length:N}, (_,d) => [0,6].includes(dow(d+1))).filter(Boolean).length;
  let h = '<thead><tr><th class="nm">이름<br><small style="font-weight:400">전월 마감</small></th>';
  for (let d = 1; d <= N; d++) {
    const w = dow(d), hol = S.holidays.includes(d), ex = S.extra.includes(d);
    h += `<th class="day ${w===6?'sat':''} ${w===0?'sun':''} ${hol?'hol':''} ${ex?'ext':''}" data-day="${d}" title="${hol?'국공휴일':''}${ex?' 인원추가':''}">${d}<br>${hol?'공':ex?'+1':WD[w]}</th>`;
  }
  h += '<th class="first">A</th><th>E</th><th>C</th><th>O</th><th>근무</th><th>특근</th><th>공휴<br>출근</th><th>이월</th></tr></thead><tbody>';
  const stats = [];
  const W = c => ['A','E','C','B'].includes(c);
  if (S.managers.length) {
    h += `<tr class="sep"><td class="nm" colspan="${N+9}">관리자 · 휴무만 표시 (나머지는 자동 A · 하우스맨 인원 집계 제외)</td></tr>`;
    S.managers.forEach((m,i) => {
      const r = Array.from({length:N}, (_,d) => mgrCode(m, d)), cnt = k => r.filter(c => c===k).length;
      h += `<tr class="mg"><td class="nm">${esc(m)}<small>관리자</small></td>` + r.map((c,d) => `<td class="c m ${c==='연'||c==='대'?'L':c}" data-m="${i}" data-d="${d}">${c==='대'?'대휴':c}</td>`).join('') +
        `<td class="s first"><b>${cnt('A')+cnt('B')}</b></td><td class="s"><b>${cnt('E')}</b></td><td class="s"><b>${cnt('C')}</b></td><td class="s"><b>${cnt('O')}</b></td><td class="s">${r.filter(W).length}</td><td class="s">${r.some(c=>c)?wkEnd-cnt('O'):''}</td><td class="s">${S.holidays.length&&r.some(c=>c)?S.holidays.filter(d=>W(r[d-1])).length+'/'+S.holidays.length:'–'}</td><td class="s"></td></tr>`;
    });
    h += `<tr class="sep"><td class="nm" colspan="${N+9}">하우스맨 · 자동 편성</td></tr>`;
  }
  S.staff.forEach((s,p) => {
    const r = G[p], cnt = k => r.filter(c => c === k).length;
    const work = r.filter(c => ['A','E','C','B'].includes(c)).length;
    const holW = S.holidays.filter(d => ['A','E','C','B'].includes(r[d-1])).length;
    const nc = full ? HKSolver.nextCarry(r) : null;
    stats.push({ s, A:cnt('A')+cnt('B'), E:cnt('E'), C:cnt('C'), O:cnt('O'), work, holW, nc });
    h += `<tr><td class="nm">${esc(s.name)}<small>${carryLbl(s.carry)}${s.nightKey?' · 방편성':''}</small></td>`;
    for (let d = 0; d < N; d++) {
      const c = r[d], f = (S.forced[s.name]||[]).includes(d+1), lk = !!(S.locks[s.name]||{})[d+1];
      const nt = ((S.notes||{})[s.name]||{})[d+1], ho = ((S.autoOff||{})[s.name]||[]).includes(d+1) && c === 'O';
      h += `<td class="c ${c==='연'?'L':c} ${f?'f':''} ${lk?'lk':''} ${ho?'ho':''} ${nt?'nt':''} ${badCells.has(p+'_'+(d+1))?'bad':''}" data-p="${p}" data-d="${d}"${nt||ho?` title="${esc((ho?'국공휴 휴무 (누적 출근율 순) ':'')+(nt||''))}"`:''}>${c||''}</td>`;
    }
    h += `<td class="s first"><b>${cnt('A')+cnt('B')}</b></td><td class="s"><b>${cnt('E')}</b></td><td class="s"><b>${cnt('C')}</b></td><td class="s"><b>${cnt('O')}</b></td><td class="s">${work}</td><td class="s">${wkEnd-cnt('O')}</td><td class="s">${S.holidays.length?holW+'/'+S.holidays.length:'–'}</td><td class="s">${nc?carryLbl(nc):''}</td></tr>`;
  });
  const X = HKSolver.prep(inp);
  ['A','E','C','O'].forEach(k => {
    h += `<tr class="cnt"><td class="nm">${k} 인원</td>`;
    for (let d = 0; d < N; d++) {
      let n = 0; G.forEach(r => { let c = r[d]; if (c==='B') c='E'; if (c==='연') { if (S.leaveMode==='reduceA') return; c='O'; } if (c===k) n++; });
      const t = X.need[d][k];
      h += `<td class="${full && n!==t?'x':''}" title="필요 ${t}">${G.some(r=>r[d])?n:''}</td>`;
    }
    h += '<td colspan="8"></td></tr>';
  });
  $('grid').innerHTML = h + '</tbody>';
  renderSide(stats, full, X);
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

let hView = 'ec';
function curGrid(){ if (!canEdit() && S.state !== '확정') return null; const N = nd(); const G = S.staff.map((s,p) => Array.from({length:N}, (_,d) => cellCode(p,d))); return G.every(r => r.every(c => c)) ? G : null; }
function renderHist(){
  const yrs = [...new Set(Object.keys(S.hist.ec).map(k => +k.slice(0,4)).concat(S.hist.hol.map(h => +h.date.slice(0,4)), [S.year]))].sort();
  const hy = +($('hY').value || S.year);
  $('hY').innerHTML = yrs.map(y => `<option ${y===hy?'selected':''}>${y}</option>`).join('');
  const G = curGrid(), curKey = `${S.year}-${String(S.month).padStart(2,'0')}`;
  const ext = (v,a,b) => { if (!v.length) return () => ''; const mx = Math.max(...v), mn = Math.min(...v); return x => mx-mn < .05 ? '' : x===mx ? a : x===mn ? b : ''; };
  let h = '';
  if (hView === 'ec') {
    const months = Object.keys(S.hist.ec).filter(k => +k.slice(0,4)===hy).sort();
    const pv = G && S.year===hy && !months.includes(curKey);
    const cols = months.concat(pv ? [curKey] : []);
    const people = S.staff.filter(s => s.kind!=='ot').map(s => s.name);
    const val = (k, n) => { if (k===curKey && pv) { const p = S.staff.findIndex(s => s.name===n); return [G[p].filter(c=>c==='E').length, G[p].filter(c=>c==='C').length]; } return (S.hist.ec[k]||{})[n]; };
    const rows = people.map(n => { const v = cols.map(k => val(k,n)).filter(Boolean); const sE = v.reduce((a,x)=>a+x[0],0), sC = v.reduce((a,x)=>a+x[1],0);
      return { n, v, sE, sC, aE: v.length ? sE/v.length : 0, aC: v.length ? sC/v.length : 0 }; });
    const rot = rows.filter(r => (S.staff.find(s=>s.name===r.n)||{}).kind==='rot');
    const fE = ext(rot.map(r => +r.aE.toFixed(2)), 'hi', 'lo'), fC = ext(rot.map(r => +r.aC.toFixed(2)), 'hi', 'lo');
    h = '<tr><th class="nm">이름</th>' + cols.map(k => `<th colspan="2" class="grp ${k===curKey&&pv?'pv':''}">${+k.slice(5)}월${k===curKey&&pv?'(안)':''}</th>`).join('') + '<th colspan="2" class="grp">합계</th><th colspan="2" class="grp">월평균</th></tr>';
    h += '<tr><th class="nm"></th>' + cols.map(k => `<th class="grp ${k===curKey&&pv?'pv':''}">E</th><th class="${k===curKey&&pv?'pv':''}">C</th>`).join('') + '<th class="grp">E</th><th>C</th><th class="grp">E</th><th>C</th></tr>';
    h += rows.map(r => { const isRot = rot.includes(r); return `<tr><td class="nm">${esc(r.n)}</td>` + cols.map(k => { const v = val(k, r.n), c = k===curKey&&pv?'pv':''; return v ? `<td class="grp E ${c}">${v[0]}</td><td class="C ${c}">${v[1]||(isRot?0:'–')}</td>` : `<td class="grp ${c}">–</td><td class="${c}">–</td>`; }).join('') +
      `<td class="grp">${r.sE}</td><td>${isRot?r.sC:'–'}</td><td class="grp ${isRot?fE(+r.aE.toFixed(2)):''}">${r.aE.toFixed(1)}</td><td class="${isRot?fC(+r.aC.toFixed(2)):''}">${isRot?r.aC.toFixed(1):'–'}</td></tr>`; }).join('');
    h += `<tr><td class="nm" colspan="${cols.length*2+5}" style="font-weight:400;color:var(--mut);font-size:12px">로테이터 월평균 중 가장 많은 사람은 붉게, 가장 적은 사람은 초록으로 표시 · 장혜지(오더테이커)는 E·C 대상이 아니라 제외</td></tr>`;
  } else {
    let hols = S.hist.hol.filter(x => +x.date.slice(0,4)===hy).slice();
    const pv = G && S.year===hy ? S.holidays.map(d => `${S.year}-${String(S.month).padStart(2,'0')}-${String(d).padStart(2,'0')}`).filter(dt => !hols.some(x => x.date===dt)) : [];
    const people = S.staff.map(s => s.name).concat(S.managers);
    const att = (dt, n) => { const rec = hols.find(x => x.date===dt); if (rec) return rec.att[n] || '';
      const d = +dt.slice(8), p = S.staff.findIndex(s => s.name===n); const c = p>=0 ? G[p][d-1] : mgrCode(n, d-1);
      return !c ? '' : ['A','E','C','B'].includes(c) ? '출' : '휴'; };
    const dates = hols.map(x => x.date).concat(pv);
    const nameOf = dt => (hols.find(x => x.date===dt)||{}).name || '공휴';
    const rows = people.map(n => { const v = dates.map(dt => att(dt,n)); const w = v.filter(x=>x==='출').length, t = v.filter(Boolean).length; return { n, v, w, t, r: t ? w/t : null }; });
    const hs = rows.filter(r => r.r!=null && S.staff.some(s=>s.name===r.n)), f = ext(hs.map(r => +r.r.toFixed(3)), 'hi', 'lo');
    h = '<tr><th class="nm">이름</th>' + dates.map(dt => `<th class="${pv.includes(dt)?'pv':''}">${+dt.slice(5,7)}/${+dt.slice(8)}<br>${esc(nameOf(dt).replace(/\s/g,''))}${pv.includes(dt)?'(안)':''}</th>`).join('') + '<th class="grp">출근</th><th>대상</th><th>출근율</th></tr>';
    h += rows.map((r,i) => `<tr ${i===S.staff.length?'style="border-top:2px solid var(--line)"':''}><td class="nm">${esc(r.n)}${i>=S.staff.length?' <small style="font-weight:400;color:var(--mut)">관리자</small>':''}</td>` +
      r.v.map((x,j) => `<td class="${x==='출'?'on':x==='휴'?'off':''} ${pv.includes(dates[j])?'pv':''}">${x||'–'}</td>`).join('') +
      `<td class="grp">${r.w}</td><td>${r.t}</td><td class="${i<S.staff.length&&r.r!=null?f(+r.r.toFixed(3)):''}"><b>${r.r==null?'–':Math.round(r.r*100)+'%'}</b></td></tr>`).join('');
    h += `<tr><td class="nm" colspan="${dates.length+4}" style="font-weight:400;color:var(--mut);font-size:12px">대체공휴일은 수당 대상이 아니라 집계하지 않음 · 하우스맨 중 출근율 최고는 붉게, 최저는 초록 · 자동 편성은 출근율이 높은 사람을 공휴일 휴무에 우선 배정</td></tr>`;
  }
  $('histT').innerHTML = h;
}
function renderSide(stats, full, X){
  renderHist();
  const hard = issues.filter(i => i.lv==='hard'), soft = issues.filter(i => i.lv==='soft'), info = issues.filter(i => i.lv==='info');
  const rot = stats.filter(x => x.s.kind==='rot'), rng = (a,k) => a.length ? `${Math.min(...a.map(x=>x[k]))}~${Math.max(...a.map(x=>x[k]))}` : '–';
  const spread = (a,k) => a.length ? Math.max(...a.map(x=>x[k])) - Math.min(...a.map(x=>x[k])) : 0;
  const chips = [];
  if (!full) chips.push(`<span class="chip">아직 편성 전 — 휴무신청을 표시한 뒤 <b>자동 편성</b>을 누르세요</span>`);
  else {
    chips.push(`<span class="chip ${hard.length?'bad':'ok'}">필수 규칙 위반 <b>${hard.length}</b></span>`);
    chips.push(`<span class="chip">권장 규칙 <b>${soft.length}</b></span>`);
    chips.push(`<span class="chip ${spread(stats,'O')>1?'bad':''}">휴무 <b>${rng(stats,'O')}</b>일</span>`);
    chips.push(`<span class="chip ${spread(rot,'C')>1?'bad':''}">야간(로테이터) <b>${rng(rot,'C')}</b>일</span>`);
    chips.push(`<span class="chip">E조 로테이터 <b>${rng(rot,'E')}</b> · 주간전용 <b>${stats.filter(x=>x.s.kind==='day').map(x=>x.E).join('/')||'–'}</b></span>`);
    if (S.src) chips.unshift(`<span class="chip">📂 ${esc(S.src)}에서 가져온 지난 기록 (그때 실제 근무 — 규칙 검사는 참고용)</span>`);
    if (S.leaveMode==='reduceA') chips.push(`<span class="chip">연차일은 근무 인원에서 차감해 편성</span>`);
    const ao = S.autoOff || {}, hd = {}; Object.keys(ao).forEach(n => ao[n].forEach(d => (hd[d] = hd[d] || []).push(n)));
    Object.keys(hd).sort((a,b)=>a-b).forEach(d => chips.push(`<span class="chip">${S.month}/${d} 국공휴 휴무 <b>${hd[d].map(esc).join('·')}</b> (누적 출근율 순)</span>`));
    const ot = stats.filter(x => x.s.kind==='ot'); if (ot.length) chips.push(`<span class="chip ${ot.some(x=>x.O<8)?'bad':''}">오더테이커 휴무 <b>${ot.map(x=>x.O).join('/')}</b>일 (최소 8)</span>`);
  }
  $('chips').innerHTML = chips.join('');
  $('issT').textContent = full ? `규칙 검사 — 필수 ${hard.length} · 권장 ${soft.length} · 참고 ${info.length}` : '규칙 검사';
  $('iss').innerHTML = full ? ([...hard, ...soft, ...info].map((i,k) => `<li class="${i.lv}" data-k="${k}">${esc(i.msg)}</li>`).join('') || '<li class="info">위반 없음</li>') : '<li class="info">편성 후 표시됩니다</li>';
  issues = [...hard, ...soft, ...info];
  // 형평성 막대
  const bar = (title, rows, k, tgt, max, col) => `<h3>${title}</h3>` + rows.map(x => `<div class="r"><span>${esc(x.s.name)}</span><div class="tr"><div class="fl" style="width:${Math.min(100, x[k]/max*100)}%;background:${col}"></div>${tgt!=null?`<div class="tg" style="left:${Math.min(100,tgt(x)/max*100)}%"></div>`:''}</div><b>${x[k]}</b></div>`).join('');
  const idx = x => S.staff.indexOf(x.s);
  $('fair').innerHTML = '<h2>형평성</h2>' + (full ?
    bar('휴무일수 (세로선 = 목표)', stats, 'O', x => X.tO[idx(x)], 12, 'var(--Of)') +
    bar('야간 일수', rot, 'C', x => X.tC[idx(x)], 14, 'var(--Cf)') +
    bar('E조 일수', stats.filter(x=>x.s.kind!=='ot'), 'E', x => X.tE[idx(x)], 18, 'var(--Ef)') +
    '<p class="note">목표에는 누적 야간·E조·출근율에 따른 1일 안팎의 조정이 들어가 있습니다.</p>' : '<p class="note">편성 후 표시됩니다</p>');
}

// ---- 상호작용
const pop = $('pop');
function openPop(x, y, html){ pop.innerHTML = html; pop.style.display = 'block'; const r = pop.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(innerWidth - r.width - 8, x - r.width/2)) + 'px'; pop.style.top = Math.min(innerHeight - r.height - 8, y + 12) + 'px'; }
const closePop = () => pop.style.display = 'none';
document.addEventListener('click', e => { if (!pop.contains(e.target) && !e.target.closest('td.c,th.day')) closePop(); });
$('grid').addEventListener('click', e => {
  if (!canEdit()) return;
  const td = e.target.closest('td.c'), th = e.target.closest('th.day');
  if (th) { const d = +th.dataset.day;
    openPop(e.clientX, e.clientY, `<div class="t">${S.month}월 ${d}일</div><div class="row"><button data-dt="n">일반</button><button data-dt="h">국공휴일</button><button data-dt="x">인원 추가(+1 주간)</button></div>`);
    pop.onclick = ev => { const b = ev.target.closest('[data-dt]'); if (!b) return; const t = b.dataset.dt;
      S.holidays = S.holidays.filter(x => x!==d); S.extra = S.extra.filter(x => x!==d);
      if (t==='h') S.holidays.push(d); if (t==='x') S.extra.push(d); closePop(); save(); render(); };
    return; }
  if (!td) return;
  if (td.classList.contains('m')) { const m = S.managers[+td.dataset.m], d = +td.dataset.d;
    if (mode === 'off') { const o = S.mgr[m] = S.mgr[m] || {}; if (o[d+1] === 'O') delete o[d+1]; else o[d+1] = 'O'; save(); render(); return; }   // 휴무신청 표시 상태: 누르면 휴무 ↔ A
    openPop(e.clientX, e.clientY, `<div class="t">${esc(m)} · ${d+1}일</div><div class="row">${['A','E','C','B','O','연','대'].map(c => `<button data-c="${c}">${c==='대'?'대휴':c}</button>`).join('')}<button data-c="">지우기(A)</button></div>`);
    pop.onclick = ev => { const b = ev.target.closest('[data-c]'); if (!b) return; const o = S.mgr[m] = S.mgr[m] || {};
      if (b.dataset.c) o[d+1] = b.dataset.c; else delete o[d+1]; closePop(); save(); render(); };
    return; }
  const p = +td.dataset.p, d = +td.dataset.d, s = S.staff[p];
  if (mode === 'off') {
    const a = S.forced[s.name] = S.forced[s.name] || [];
    const i = a.indexOf(d+1); if (i >= 0) a.splice(i,1); else { a.push(d+1); if (S.locks[s.name]) delete S.locks[s.name][d+1]; }
    save(); render(); return;
  }
  const al = HKSolver.allowedFor(s).concat(['B','연']);
  openPop(e.clientX, e.clientY, `<div class="t">${esc(s.name)} · ${d+1}일</div><div class="row">${al.map(c => `<button data-c="${c}" class="${c===td.textContent?'pri':''}">${c}</button>`).join('')}<button data-c="">고정 해제</button></div>`);
  pop.onclick = ev => { const b = ev.target.closest('[data-c]'); if (!b) return; const c = b.dataset.c;
    const L = S.locks[s.name] = S.locks[s.name] || {};
    if (c) { L[d+1] = c; S.forced[s.name] = (S.forced[s.name]||[]).filter(x => x!==d+1); } else delete L[d+1];
    if (c && S.grid && S.grid[s.name]) S.grid[s.name][d] = c;
    closePop(); save(); render(); };
});
$('iss').addEventListener('click', e => { const li = e.target.closest('li[data-k]'); if (!li) return; const i = issues[+li.dataset.k]; if (!i || !i.d) return;
  const sel = i.p != null ? `td.c[data-p="${i.p}"][data-d="${i.d-1}"]` : `td.c[data-d="${i.d-1}"]`;
  document.querySelectorAll(sel).forEach(td => { td.classList.remove('flash'); void td.offsetWidth; td.classList.add('flash'); td.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'}); }); });
const setMode = m => { mode = m; $('mOff').classList.toggle('on', m==='off'); $('mEdit').classList.toggle('on', m==='edit'); };
$('hEC').onclick = () => { hView='ec'; $('hEC').classList.add('on'); $('hHol').classList.remove('on'); renderHist(); };
$('hHol').onclick = () => { hView='hol'; $('hHol').classList.add('on'); $('hEC').classList.remove('on'); renderHist(); };
$('hY').onchange = renderHist;
$('mOff').onclick = () => setMode('off'); $('mEdit').onclick = () => setMode('edit');
$('unlock').onclick = () => { S.locks = {}; save(); render(); toast('직접 고정한 칸을 모두 풀었습니다 (휴무신청은 유지)'); };

// ---- 자동 편성 (화면이 멈추지 않도록 나눠서 실행)
const tick = () => new Promise(r => setTimeout(r, 0));
$('gen').onclick = async () => {
  if (!canEdit()) return;
  const btn = $('gen'); btn.disabled = true; btn.textContent = '편성 중…'; const pg = $('prog'); pg.style.width = '2%'; await tick();
  try {
    S.seed = (S.seed || 1) + 1;
    let inp = HKSolver.chooseMode(buildInput(), S.seed * 101);
    S.leaveMode = inp.leaveMode; S.autoOff = inp.autoOff || {};
    const RUNS = 3, IT = 220000; let best = null;
    for (let k = 0; k < RUNS; k++) {
      const run = HKSolver.createRun(inp, S.seed * 7919 + k * 104729, IT);
      while (!run.step(15000)) { pg.style.width = (5 + 80 * (k + run.progress) / RUNS) + '%'; await tick(); }
      if (!best || run.best < best.best) best = run;
    }
    let g = best.grid;
    for (let k = 0; k < 2; k++) { pg.style.width = (88 + k*5) + '%'; await tick(); g = HKSolver.pairLNS(inp, g, 9); g = HKSolver.polish(inp, g).grid; }
    S.grid = {}; S.staff.forEach((s,p) => S.grid[s.name] = g[p]);
    save(); render();
    const hard = issues.filter(i => i.lv==='hard').length;
    toast(hard ? `필수 규칙 ${hard}건을 못 맞췄습니다 — 휴무신청·이월값을 확인하거나 다시 눌러 보세요` : '편성 완료 — 다시 누르면 다른 안이 나옵니다');
  } catch (err) { console.error(err); toast('편성 중 오류가 났습니다: ' + err.message); }
  btn.disabled = false; btn.textContent = '자동 편성'; pg.style.width = '0';
};

// ---- 연·월
function fillYM(){
  $('yy').innerHTML = [2026,2027,2028].map(y => `<option ${y===S.year?'selected':''}>${y}</option>`).join('');
  $('mm').innerHTML = Array.from({length:12}, (_,i) => `<option value="${i+1}" ${i+1===S.month?'selected':''}>${i+1}월</option>`).join('');
}
function resetMonth(){ S.state = '작성중'; S.notes = {}; S.autoOff = {}; S.mgr = {}; S.forced = {}; S.locks = {}; S.grid = null; S.extra = []; S.leaveMode = 'inO'; S.holidays = ((HOL[S.year]||{})[S.month]||[]).slice(); }
$('yy').onchange = () => goMonth(+$('yy').value, S.month);
$('mm').onchange = () => goMonth(S.year, +$('mm').value);
async function goMonth(y, m){ await saveNow(); location.hash = ymKey(y, m); }
window.addEventListener('hashchange', () => { if (role) open(); });
async function open(){
  const h = /^#(\d{4})-(\d{2})$/.exec(location.hash);
  let y, m;
  if (h) { y = +h[1]; m = +h[2]; }
  else { let cfg = null; try { cfg = await DB.get('hksched/cfg'); } catch (e) {}
    if (cfg && cfg.cur) { y = +cfg.cur.slice(0,4); m = +cfg.cur.slice(5); }
    else { const t = new Date(Date.now() + 9*3600e3); y = t.getUTCFullYear(); m = t.getUTCMonth() + 2; if (m > 12) { m = 1; y++; } } }
  $('app').hidden = false; $('loginBox').hidden = true; $('grid').innerHTML = '<tr><td style="padding:20px">불러오는 중…</td></tr>';
  await loadMonth(y, m); fillYM(); renderSet(); render();
}
$('next').onclick = async () => {
  if (!canEdit()) return;
  const G = gridArr(); if (!G || !G.every(r => r.length === nd() && r.every(c => c))) { toast('먼저 이번 달 편성을 완성해 주세요'); return; }
  if (issues.some(i => i.lv === 'hard') && !confirm('필수 규칙 위반이 남아 있어요. 그래도 확정하고 다음 달로 넘길까요?')) return;
  if (!confirm(S.month + '월 스케줄을 확정하고, 이월값·누적 현황을 기록한 뒤 다음 달로 넘어갈까요?')) return;
  const N = nd();
  S.staff.forEach((s,p) => { // 누적 갱신
    const r = S.staff.map((_,q) => Array.from({length:N}, (_,d) => cellCode(q,d)))[p];
    const cnt = k => r.filter(c => c===k).length, m = s.cum.m || 0;
    s.cum.C = +((s.cum.C*m + cnt('C')) / (m+1)).toFixed(2); s.cum.E = +((s.cum.E*m + cnt('E')) / (m+1)).toFixed(2);
    s.cum.work = +((s.cum.work*m + (1 - cnt('O')/N)) / (m+1)).toFixed(3); s.cum.m = m + 1;
    S.holidays.forEach(d => { s.cum.holT++; if (['A','E','C','B'].includes(r[d-1])) s.cum.holW++; });
    s.carry = HKSolver.nextCarry(r);
  });
  const key = `${S.year}-${String(S.month).padStart(2,'0')}`, Gc = curGrid();
  S.hist.ec[key] = {}; S.staff.forEach((s,p) => { if (s.kind!=='ot') S.hist.ec[key][s.name] = [Gc[p].filter(c=>c==='E').length, Gc[p].filter(c=>c==='C').length]; });
  S.holidays.slice().sort((a,b)=>a-b).forEach(d => { const dt = `${key}-${String(d).padStart(2,'0')}`; const att = {};
    S.staff.forEach((s,p) => att[s.name] = ['A','E','C','B'].includes(Gc[p][d-1]) ? '출' : '휴');
    S.managers.forEach(m => { const c = mgrCode(m, d-1); att[m] = ['A','E','C','B','D'].includes(c) ? '출' : '휴'; });
    S.hist.hol = S.hist.hol.filter(x => x.date!==dt).concat([{date:dt, name:'공휴일', att}]).sort((a,b)=>a.date<b.date?-1:1); });
  S.state = '확정'; latestKey = ymKey(S.year, S.month); confPending = latestKey; await saveNow();
  const ny = S.month === 12 ? S.year + 1 : S.year, nm = S.month === 12 ? 1 : S.month + 1;
  latestKey = ymKey(ny, nm); S.year = ny; S.month = nm; resetMonth(); S.state = '작성중'; await saveNow();
  location.hash = ymKey(ny, nm); toast('확정했어요 — 이월값과 누적 현황을 기록하고 다음 달로 넘어왔어요');
};

// ---- 설정
function renderSet(){
  ['A','E','C','O'].forEach(k => $('n'+k).value = S.need[k]); $('eDay').value = S.eDay; $('mgrs').value = S.managers.join(', ');
  $('staffT').innerHTML = '<tr><th>이름</th><th>구분</th><th>야간 방편성</th><th>전월 마감</th><th>누적 야간/월</th><th>누적 E조/월</th><th>누적 출근율</th><th>국공휴 출근/대상</th><th></th></tr>' +
    S.staff.map((s,p) => `<tr data-p="${p}"><td><input type="text" data-k="name" value="${esc(s.name)}"></td>
    <td><select data-k="kind">${Object.entries(KIND).map(([k,v]) => `<option value="${k}" ${k===s.kind?'selected':''}>${v}</option>`).join('')}</select></td>
    <td><input type="checkbox" data-k="nightKey" ${s.nightKey?'checked':''}></td>
    <td style="white-space:nowrap"><select data-k="ct" style="width:64px">${[['A','주'],['C','야'],['O','휴']].map(([k,v]) => `<option value="${k}" ${s.carry.type===k?'selected':''}>${v}</option>`).join('')}</select> <input type="number" data-k="cn" min="0" max="6" value="${s.carry.n}"></td>
    <td><input type="number" step=".1" data-k="cC" value="${s.cum.C}"></td><td><input type="number" step=".1" data-k="cE" value="${s.cum.E}"></td>
    <td><input type="number" step=".01" data-k="cW" value="${s.cum.work}"></td>
    <td style="white-space:nowrap"><input type="number" data-k="hW" value="${s.cum.holW}"> / <input type="number" data-k="hT" value="${s.cum.holT}"></td>
    <td><button data-del="${p}" aria-label="삭제">삭제</button></td></tr>`).join('');
}
$('staffT').addEventListener('change', e => {
  const tr = e.target.closest('tr[data-p]'); if (!tr) return; const s = S.staff[+tr.dataset.p], k = e.target.dataset.k, v = e.target.value;
  if (k==='name') { const old = s.name; s.name = v.trim() || old; ['forced','locks','grid'].forEach(o => { if (S[o] && S[o][old]) { S[o][s.name] = S[o][old]; delete S[o][old]; } }); }
  if (k==='kind') s.kind = v; if (k==='nightKey') s.nightKey = e.target.checked;
  if (k==='ct') s.carry.type = v; if (k==='cn') s.carry.n = +v||0;
  if (k==='cC') s.cum.C = +v; if (k==='cE') s.cum.E = +v; if (k==='cW') s.cum.work = +v; if (k==='hW') s.cum.holW = +v; if (k==='hT') s.cum.holT = +v;
  save(); render();
});
$('staffT').addEventListener('click', e => { const b = e.target.closest('[data-del]'); if (!b) return; S.staff.splice(+b.dataset.del, 1); S.grid = null; save(); renderSet(); render(); });
$('addP').onclick = () => { S.staff.push({name:'새 인원'+(S.staff.length+1),kind:'rot',nightKey:false,carry:{type:'O',n:0},cum:{m:0,C:10,E:7.5,work:.77,holW:0,holT:0}}); S.grid = null; save(); renderSet(); render(); };
['A','E','C','O'].forEach(k => $('n'+k).onchange = () => { S.need[k] = +$('n'+k).value; save(); render(); });
$('eDay').onchange = () => { S.eDay = +$('eDay').value; save(); };
$('mgrs').onchange = () => { S.managers = $('mgrs').value.split(/[,，]/).map(x => x.trim()).filter(Boolean); save(); render(); };

// ---- 저장·내보내기
function offer(filename, data){
  const url = URL.createObjectURL(new Blob([data], { type: /\.xlsx$/.test(filename) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
$('bk').onclick = () => offer(`하우스맨스케줄_설정_${S.year}-${S.month}.json`, JSON.stringify(S, null, 1));
$('imp').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const o = JSON.parse(await f.text()); if (!o.staff) throw 0; if (!canEdit()) return; const keep = { year:S.year, month:S.month }; S = Object.assign(defaults(), o, keep); if (!S.hist) S.hist = JSON.parse(JSON.stringify(HIST0)); save(); fillYM(); renderSet(); render(); toast('불러왔어요 — 명단·누적·이번 달 편성을 백업 내용으로 바꿨어요'); } catch (_) { toast('올바른 백업 파일이 아닙니다'); } };
$('xls').onclick = () => {
  if (typeof XLSX === 'undefined') { toast('엑셀 모듈을 불러오지 못했습니다'); return; }
  const N = nd(), G = S.staff.map((s,p) => Array.from({length:N}, (_,d) => cellCode(p,d)));
  if (!G.every(r => r.every(c => c))) { toast('먼저 편성을 완성해 주세요'); return; }
  const FILL = {A:['DCE9FB','1B4F91'],E:['FDEAD2','B4650B'],C:['E7E1F6','5B3E96'],B:['FBE1E8','B23A5C'],O:['A6A6A6','A6A6A6'],'연':['ECECEC','555555']};
  const thin = {style:'thin',color:{rgb:'C5CEDB'}}, red = {style:'thick',color:{rgb:'E02020'}};
  const B = (b) => ({top:b,bottom:b,left:b,right:b});
  const ctr = {horizontal:'center',vertical:'center',wrapText:true};
  const font = (o) => Object.assign({name:'맑은 고딕',sz:10}, o||{});
  const rows = [], merges = [];
  const wkEnd = Array.from({length:N}, (_,d) => [0,6].includes(dow(d+1))).filter(Boolean).length;
  const cell = (v, s) => ({ v, t: typeof v === 'number' ? 'n' : 's', s });
  const head = {fill:{fgColor:{rgb:'1F3864'}},font:font({bold:true,color:{rgb:'FFFFFF'}}),alignment:ctr,border:B(thin)};
  rows.push([cell(`${S.year}년 ${S.month}월 근무스케줄`, {font:font({sz:16,bold:true,color:{rgb:'FFFFFF'}}),fill:{fgColor:{rgb:'10233F'}},alignment:{vertical:'center'},border:{bottom:{style:'medium',color:{rgb:'C8A96A'}}}})]);
  merges.push({s:{r:0,c:0},e:{r:0,c:N+9}});
  rows.push([]);
  const tail = ['A','E','C','O','근무','특근','공휴출근','이월'];
  rows.push([cell('이름',head), cell('전월',head), ...Array.from({length:N}, (_,d) => cell(d+1, Object.assign({}, head, S.holidays.includes(d+1)?{fill:{fgColor:{rgb:'8B2E3F'}}}:{}))), ...tail.map(t => cell(t, head))]);
  rows.push([cell('',head), cell('',head), ...Array.from({length:N}, (_,d) => { const w = dow(d+1), hol = S.holidays.includes(d+1), ex = S.extra.includes(d+1);
    return cell(hol ? '공휴' : ex ? '+1' : WD[w], {fill:{fgColor:{rgb: w===6 ? 'EAF1FA' : w===0 || hol ? 'FCEEEE' : 'F3F5F8'}},font:font({bold:true,color:{rgb: w===6 ? '1F4E79' : (w===0||hol) ? '8B2E3F' : '333333'}}),alignment:ctr,border:B(thin)}); }), ...tail.map(() => cell('',head))]);
  const FILLX = Object.assign({}, FILL, {'대':['ECECEC','555555']});
  S.managers.forEach(m => {
    const r = Array.from({length:N}, (_,d) => mgrCode(m, d)), cnt = k => r.filter(c => c===k).length;
    const base = {font:font({bold:true}),alignment:ctr,border:B(thin),fill:{fgColor:{rgb:'F3F5F8'}}};
    rows.push([cell(m, base), cell('관리자', {font:font({color:{rgb:'888888'}}),alignment:ctr,border:B(thin)}),
      ...r.map(c => { const [bg, fg] = FILLX[c] || ['FFFFFF','000000']; return cell(c==='대'?'대휴':c, {fill:{fgColor:{rgb:bg}},font:font({bold:c!=='O',sz:c==='대'?8:10,color:{rgb:fg}}),alignment:ctr,border:B(thin)}); }),
      ...[cnt('A')+cnt('B'), cnt('E'), cnt('C'), cnt('O'), r.filter(c => ['A','E','C','B'].includes(c)).length, r.some(c=>c)?wkEnd-cnt('O'):'', '', ''].map(v => cell(v, {font:font(),alignment:ctr,border:B(thin)}))]);
  });
  S.staff.forEach((s,p) => {
    const r = G[p], cnt = k => r.filter(c => c===k).length, work = r.filter(c => ['A','E','C','B'].includes(c)).length;
    const nc = HKSolver.nextCarry(r), holW = S.holidays.filter(d => ['A','E','C','B'].includes(r[d-1])).length;
    const base = {font:font({bold:true}),alignment:ctr,border:B(thin)};
    rows.push([cell(s.name, base), cell(carryLbl(s.carry), {font:font({color:{rgb:'666666'}}),alignment:ctr,border:B(thin)}),
      ...r.map((c,d) => { const f = (S.forced[s.name]||[]).includes(d+1); const [bg, fg] = FILL[c] || ['FFFFFF','000000'];
        return cell(c, {fill:{fgColor:{rgb:bg}},font:font({bold:true,color:{rgb: fg}}),alignment:ctr,border:B(f ? red : thin)}); }),
      ...[cnt('A')+cnt('B'), cnt('E'), cnt('C'), cnt('O'), work, wkEnd - cnt('O'), S.holidays.length ? `${holW}/${S.holidays.length}` : '-', carryLbl(nc)].map(v => cell(v, base))]);
  });
  rows.push([]);
  ['A','E','C','O'].forEach(k => {
    rows.push([cell(k+' 인원',{font:font({bold:true}),alignment:ctr,border:B(thin),fill:{fgColor:{rgb:'F3F5F8'}}}), cell('',{border:B(thin)}), ...Array.from({length:N}, (_,d) => {
      let n = 0; G.forEach(r => { let c = r[d]; if (c==='B') c='E'; if (c==='연') { if (S.leaveMode==='reduceA') return; c='O'; } if (c===k) n++; });
      return cell(n, {alignment:ctr,border:B(thin),font:font()}); })]);
  });
  rows.push([]);
  [['A','09:00 ~ 18:00'],['E','11:30 ~ 22:00'],['C','22:00 ~ 09:00 (휴게 2시간)'],['B','09:00 ~ 22:00'],['O','휴무 (회색)'],['연','연차'],['빨간 테두리','신청 휴무']].forEach(([a,b]) => rows.push([cell(a,{font:font({bold:true})}), cell(b,{font:font()})]));
  const ws = XLSX.utils.aoa_to_sheet(rows.map(r => r.map(c => c && c.v !== undefined ? c.v : (c && c.v === undefined ? '' : null))));
  rows.forEach((r,ri) => r.forEach((c,ci) => { if (!c) return; const a = XLSX.utils.encode_cell({r:ri,c:ci}); if (!ws[a]) ws[a] = {t:'s',v:''}; ws[a].s = c.s; }));
  ws['!merges'] = merges;
  ws['!cols'] = [{wch:9},{wch:6}, ...Array.from({length:N}, () => ({wch:3.6})), ...tail.map(() => ({wch:6}))];
  ws['!rows'] = [{hpt:30}];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, `${S.month}월`);
  const out = XLSX.write(wb, {bookType:'xlsx', type:'array'});
  offer(`${S.year}년 ${S.month}월 근무스케줄.xlsx`, new Uint8Array(out));
};

$('setBox').addEventListener('toggle', renderSet);
$('prt').onclick = () => {
  const N = nd(), G = S.staff.map((s,p) => Array.from({length:N}, (_,d) => cellCode(p,d)));
  if (!G.every(r => r.every(c => c))) { toast('먼저 편성을 완성해 주세요'); return; }
  printSchedule({ year:S.year, month:S.month, staff:S.staff, managers:S.managers, mgr:S.mgr, mgrDefault:'A', autoOff:S.autoOff, forced:S.forced, notes:S.notes, holidays:S.holidays, extra:S.extra, state:S.state, leaveMode:S.leaveMode,
    codeOf:(n,d) => G[S.staff.findIndex(s => s.name===n)][d] });
};
// ---------- 2026년 2~11월 지난 스케줄 넣기 (엑셀 '26년 근무스케줄'에서 옮긴 past2026.json) — 이미 있는 달은 건드리지 않음
async function importPast(){
  if (!canEdit()) return;
  const btn = $('pastBtn'); if (btn) { btn.disabled = true; btn.textContent = '넣는 중…'; }
  try {
    const P = await (await fetch('./past2026.json?v=2026.11.22-5')).json();
    let added = 0;
    for (const k of Object.keys(P).sort()) {
      const ex = await DB.get('hksched/' + k);
      if (!ex) { await DB.set('hksched/' + k, Object.assign({}, P[k], { by: role.label, at: DB.SERVER_TIME })); added++; }
      const ec = {}; P[k].staff.forEach(s => { if (s.kind !== 'ot') { const g = P[k].grid[s.name]; ec[s.name] = [g.filter(c=>c==='E').length, g.filter(c=>c==='C').length]; } });
      S.hist.ec[k] = ec;   // E조·C조 월별도 실제 스케줄 기준으로 맞춤
    }
    await DB.merge('hksched/cfg', { hist:S.hist, pastImported:'2026-02~11', by:role.label, at:DB.SERVER_TIME });
    S._pastDone = true; render(); toast(`지난 스케줄 ${added}달을 넣었어요 (이미 있던 달은 그대로) — 연·월을 바꿔 볼 수 있어요`);
  } catch (e) { toast('넣지 못했어요: ' + (e.code || e.message)); }
  if (btn) { btn.disabled = false; btn.textContent = '지난 스케줄 넣기'; }
}
$('pastBtn').onclick = importPast;
$('conf').onclick = () => { if (!canEdit()) return; S.state = S.state === '확정' ? '작성중' : '확정'; if (S.state === '확정') confPending = ymKey(S.year, S.month); save(); render(); toast(S.state === '확정' ? '확정했어요 — 하우스키퍼 계정에서도 보여요' : '작성 중으로 되돌렸어요'); };
// ---------- 로그인 (야간 보고서와 같은 계정)
const ROLES = [
  { k: 'hk', label: '하우스키퍼', email: 'unieshaeundae+hk@gmail.com', uid: 'nBL2QYezEmRNRmBRMXN6LNPJO2s2' },
  { k: 'boss', label: '소장', email: 'unieshaeundae+admin@gmail.com', uid: 'iw2orXgIgPgTbLUQa0b41XJ9Dvd2' },
  { k: 'boss', label: '부소장', email: 'unieshaeundae+sub@gmail.com', uid: 'Fz4T5ZzIxShOdVkNpF9gzMmOLED2' },
  { k: 'insp', label: '파트장', email: 'unieshaeundae+insp@gmail.com', uid: '4sVIUKcXtYg28Lm7Qw41UqI6hRX2' }
];
const roleOf = u => (!u || u.anon) ? null : ROLES.filter(r => r.uid === u.uid || r.email === u.email)[0] || null;
function drawLogin(){
  $('app').hidden = true; $('loginBox').hidden = false;
  $('loginBox').innerHTML = '<h2>로그인</h2><div class="seg" role="group">' + ROLES.map((r,i) => `<button data-who="${i}" class="${login.who===i?'on':''}">${r.label}</button>`).join('') + '</div>' +
    '<input type="password" id="pw" autocomplete="current-password" placeholder="비밀번호" style="display:block;width:100%;margin:10px 0">' +
    (login.err ? `<p style="color:var(--red);font-weight:700;margin:0 0 8px">${esc(login.err)}</p>` : '') +
    `<button class="pri" id="doLogin" style="width:100%" ${login.busy?'disabled':''}>${login.busy?'확인 중…':'들어가기'}</button>` +
    '<p class="note">소장·부소장 전용 편성 화면이에요. 하우스키퍼·파트장 계정은 스케줄 보기 화면으로 넘어가요.</p>';
}
$('loginBox').addEventListener('click', e => { const w = e.target.closest('[data-who]'); if (w) { login.who = +w.dataset.who; drawLogin(); } if (e.target.id === 'doLogin') doLogin(); });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'pw') doLogin(); });
async function doLogin(){
  const pw = ($('pw') || {}).value || ''; if (!pw) { login.err = '비밀번호를 적어 주세요.'; drawLogin(); return; }
  login.busy = true; login.err = ''; drawLogin();
  try { await DB.signInEmail(ROLES[login.who].email, pw); } catch (e) { login.err = /network|offline/i.test(String(e && (e.code || e.message))) ? '인터넷 연결을 확인해 주세요.' : '비밀번호가 맞지 않아요.'; }
  login.busy = false; if (!role) drawLogin();
}
$('logout').onclick = async () => { await saveNow(); await DB.signOut(); };
window.addEventListener('beforeunload', e => { if (saveT) { saveNow(); e.preventDefault(); e.returnValue = ''; } });
DB.onUser(u => {
  user = u || null; role = roleOf(u);
  document.body.classList.toggle('ro', !canEdit());
  $('who').textContent = role ? role.label + (canEdit() ? '' : ' · 보기 전용') : '';
  if (role && !canEdit()) { location.replace('./view.html' + location.hash); return; }   // 11/22: 편성은 소장 · 부소장만 — 하우스키퍼 · 파트장은 보기 화면으로
  if (u && !u.anon && !role) login.err = '지금 로그인된 계정은 이 화면을 쓸 수 없어요. 아래에서 다시 들어가 주세요.';
  if (role) open(); else drawLogin();
});
