// 🧩 자동 배정 (시험 · 대조) — 관리자 허브 (2026-11-13, 배정 자동화 앱 1단계)
// 정비보고서 초안 + 출근자·인계 유닛 → 엔진(assign.js, 백그라운드) → 배정안 보기 → 하우스키퍼 완성본과 대조
// 2단계 (11/13): 객실 옮기기(고치기) · 2901 바꾸기 → ✅ 확정 → 앱에 올리기 (초안일 때만: 이름 넣은 정비보고서로 engine makeRows → 허브 '정비보고서 올리기'와 같은 길 → 메이드 휴대폰·더티 배분)
// 정비보고서 xlsx(오더테이커용) 채우기는 다음 단계
// 저장: meta/assign { quota, lastHo, hist2901:[{date, names}], log:[{date, pct, ...}] } — 관리자만 씀 (규칙 meta: 읽기 로그인, 쓰기 관리자)
import { DEF_CFG, compare } from './assign.js?v=2026.11.25-1';
import { FLOORS, parseMsg, blockedOn, releasedPrio, newId, prune, COLORS } from './blocks.js?v=2026.11.18-1';

const VER = '2026.11.19-15';   // 11/19 엔진(assign.js)·worker 새로 받게
const ROYAL = ['3001', '3002', '3101', '3102'];
let H = null;   // 허브에서 받은 것 { S, esc, ymd, addDays, md, admin, user }
let A = null;   // 화면 상태

const DEF_TEAMS = ['최태자,성락욱', '김태성,조유경'];
function bmapUpd() { if (!A) return; A.bmap = blockedOn(A.blocks || [], A.date); A.bprio = releasedPrio(A.blocks || [], A.date); }
const isTarget = x => (['1', '2', '3', '4'].includes(String(x.st == null ? '' : x.st).trim()) || /간단/.test(String(x.st == null ? '' : x.st))) && !/미정비/.test((x.m1 || '') + (x.m2 || ''));
// 11/15 미정비 남기기 (하우스맨이 프런트와 타입별 수량 협의 → 수량 입력 → 저층부터 자동으로 고름). A.carry = 남길 객실
const live = x => isTarget(x) && !(A && A.carry && A.carry.has(String(x.room))) && !blk(x.room);
const blk = r => (A && A.bmap ? A.bmap[String(r)] : null);   // 그날 장기 미정비 블럭
// 객실 타입 (claude/객실타입_기준표.md, 417실)
export function typeOf(room) {
  const r = String(room), n = +r, f = Math.floor(n / 100), s = n % 100;
  if (r === '2901') return 'PLT'; if (r === '3001' || r === '3101') return 'RYH'; if (r === '3002' || r === '3102') return 'RYL';
  if (r === '2909' || r === '2910') return 'HTT'; if (f === 18 && s >= 7 && s <= 11) return 'FAK'; if (r === '1707' || r === '1708') return 'FAW';
  if (f === 23 || f === 24) { if (f === 24 && s <= 4) return 'FQJ'; if (s <= 6) return 'HTJ'; if (s <= 10) return 'HTP'; return 'FOB'; }
  if (f >= 4 && f <= 28 && s <= 4) return 'FAQ';
  if (((f >= 5 && f <= 22) || f === 25 || f === 26) && s >= 12) return 'FOR';
  return 'HTL';
}
const TYPE_NAME = { HTL: '호텔형', FAQ: '아쿠아', FOR: '취사형', FOB: '특화', HTP: '특화', HTJ: '특화', FQJ: '특화', FAK: '키즈', FAW: '워케이션', HTT: 'OTT', RYH: '로얄', RYL: '로얄', PLT: '2901' };
const TYPE_ORDER = ['HTL', 'FAQ', 'FOR', 'FOB', 'HTP', 'HTJ', 'FQJ', 'FAK', 'FAW', 'HTT', 'RYH', 'RYL'];
// 남기면 안 되는 객실: 로얄·2901·VIP·테마·단체·시간 지정·당직·재실(2)
function carryBlock(x) {
  const m = (x.m1 || '') + ' ' + (x.m2 || ''), r = String(x.room);
  if (ROYAL.includes(r) || r === '2901') return '로얄·2901';
  if (/VIP|르씨엘/i.test(m)) return 'VIP';
  if ((A.data.themes || []).some(t => String(t.room) === r)) return '테마';
  if ((A.data.groups || []).some(g => (g.rooms || []).map(String).includes(r))) return '단체';
  if (/\d{1,2}\s*시/.test(m)) return '시간 지정';
  if (/당직/.test(m)) return '당직';
  if (String(x.st).trim() === '2') return '재실';
  return '';
}
// 타입별 수량만큼 고르기 (11/15 사용자): 저층 먼저 (가급적), 담당(A·B키) 출근 층은 뒤로. 어제 이월(3)도 그대로 남겨도 됨
//   담당이 출근한 층의 방은 담당에게 배정하고 다른 층을 남기는 쪽
const B_SUF = ['10', '11', '15', '16', '17'];
function keyOn(x) {
  const c = cfg(), H0 = ho(), f = Number(x.floor), suf = String(x.room).slice(-2);
  const zoneB = !(f >= 27 || f === 4) && B_SUF.includes(suf);
  const k = zoneB ? (c.bKey[f] || c.aKey[f]) : c.aKey[f];
  return !!(k && H0[k]);
}
// 11/15 하우스키퍼 실제(68실)와 대조: '담당 쉬는 층 먼저'는 27/68 + 14개 층에 흩어짐, '저층 먼저'는 47/68.
//   → 저층 먼저, 담당이 출근한 층의 방은 3개 층 높은 것처럼 봄 (48/68)
const KEY_ON_FLOORS = 3;
function carryPick(qty) {
  const out = new Set(), short = [];
  Object.keys(qty).forEach(t => { const q = Number(qty[t]) || 0; if (q <= 0) return;
    const c = A.data.rooms.filter(x => isTarget(x) && !blk(x.room) && typeOf(x.room) === t && !carryBlock(x))
      .map(x => Object.assign({ sc: x.floor + (keyOn(x) ? KEY_ON_FLOORS : 0) }, x)).sort((p, q2) => p.sc - q2.sc || p.room - q2.room);
    c.slice(0, q).forEach(x => out.add(String(x.room)));
    if (c.length < q) short.push(t + ' ' + c.length + '실만'); });
  return { set: out, short };
}
const unitOf = x => (ROYAL.includes(String(x.room)) ? 2 : /간단/.test(String(x.st)) ? 0.5 : 1);
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

export async function openAssign(hub, o) {
  H = hub;
  const S = H.S;
  const h = Number(new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 13));
  A = { date: h >= 15 ? H.addDays(H.ymd(), 1) : H.ymd(), file: '', data: null, done: null, err: '', busy: '', cfgDoc: null, staff: [], rows: [], prev: '', res: null, prog: 0, cmp: null, showAll: false, open: {}, tr: [] };
  const box = document.createElement('div'); box.className = 'vp'; box.id = 'asp'; document.body.appendChild(box); document.body.classList.add('sb-lock');
  draw();
  try { const t = JSON.parse(lsGet('asg_tr') || 'null'); A.tr = t && t.date === A.date ? t.list : []; } catch (e) { A.tr = []; }
  if (o && o.view === 'blocks') { A.view = 'blocks'; A.back = 'close'; }
  const [cfgDoc, staff, teams, bdoc] = await Promise.all([S.get('meta/assign').catch(() => null), S.getQuery('staff', [['job', '==', '룸메이드']]).catch(() => []), S.get('meta/teams').catch(() => null), S.get('meta/blocks').catch(() => null)]);
  if (!A) return;
  A.blocks = (bdoc && bdoc.list) || []; A.bk = { draft: null, sel: new Set(), day: A.date, open: {}, msg: '' }; bmapUpd();
  // 2인 1조 (부부) — 정비 레포트 관리자 '2인 1조' 카드에 저장한 짝 (없으면 기본 두 조)
  A.teams = ((teams && teams.pairs) || DEF_TEAMS).map(p => String(p).split(',').map(s => s.trim())).filter(p => p.length === 2 && p[0] && p[1]);
  A.cfgDoc = cfgDoc || {};
  A.staff = staff.map(x => x.data).filter(x => (x.status || '재직') !== '퇴사').map(x => x.name);
  A.hired = {}; staff.forEach(x => { const d = x.data || {}; if (d.name && /^\d{4}-\d{2}-\d{2}$/.test(String(d.hired || ''))) A.hired[String(d.name).replace(/\s+/g, '')] = d.hired; });
  const hist = A.cfgDoc.hist2901 || [];
  const last = hist.filter(x => x.date < A.date).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  A.prev = last ? last.names.join(', ') : '';
  buildRows(); draw();
}
function close() { const b = document.getElementById('asp'); if (b) b.remove(); document.body.classList.remove('sb-lock'); if (A && A.worker) A.worker.terminate(); A = null; }
// 담당표·정량 (11/13 설정 화면): meta/assign.cfg 가 있으면 그것, 없으면 엔진 기본값(DEF_CFG). 예전 meta/assign.quota 도 이어받음
function cfg() {
  const c = (A.cfgDoc && A.cfgDoc.cfg) || {};
  return { aKey: c.aKey || DEF_CFG.aKey, bKey: c.bKey || DEF_CFG.bKey, royalOk: c.royalOk || DEF_CFG.royalOk, pltBlue: c.pltBlue || DEF_CFG.pltBlue, specOk: c.specOk || DEF_CFG.specOk || [],
    quota: c.quota || Object.assign({}, DEF_CFG.quota, (A.cfgDoc && A.cfgDoc.quota) || {}) };
}
function quota() { return cfg().quota; }

// 출근자 줄: 담당표 이름 + 정량 + 명단(룸메이드 재직) + 지난 인계 — 지난 인계 유닛을 먼저, 없으면 정량, 없으면 9
function buildRows(fromCards) {
  const q = quota(), last = (A.cfgDoc && A.cfgDoc.lastHo) || {}, names = [];
  const add = n => { n = String(n || '').replace(/\s+/g, ''); if (n && n !== '관리자' && names.indexOf(n) < 0) names.push(n); };
  Object.values(cfg().aKey).forEach(add); Object.values(cfg().bKey).forEach(add); Object.keys(q).forEach(add); A.staff.forEach(add); Object.keys(last).forEach(add);
  if (fromCards) Object.keys(fromCards).forEach(add);
  A.rows = names.map(n => {
    if (fromCards) return { name: n, on: n in fromCards, unit: fromCards[n] != null ? fromCards[n] : (q[n] != null ? q[n] : 9) };
    const u = last[n] != null ? last[n] : q[n] != null ? q[n] : 9;
    return { name: n, on: n in last || !Object.keys(last).length, unit: u };
  });
}
function ho() { const o = {}; A.rows.forEach(r => { if (r.on && r.unit > 0) o[r.name] = Number(r.unit); }); trList().forEach(t => { o[t.name] = t.n; }); return o; }
// 🎓 교육생 (11/19, 11/16 하우스맨 의견): 그날만 — 이름 · 객실 수 · 가능 층 · 최대 층 수. 이 휴대폰에 날짜별로 기억
const parseFloors = t => { const out = []; String(t || '').split(/[,·\s]+/).forEach(p => { const m = /^(\d{1,2})\s*[-~]\s*(\d{1,2})$/.exec(p); if (m) { for (let f = Math.min(+m[1], +m[2]); f <= Math.max(+m[1], +m[2]); f++) out.push(f); } else if (/^\d{1,2}$/.test(p)) out.push(+p); }); return [...new Set(out)].filter(f => f >= 2 && f <= 31); };
function trList() { return (A.tr || []).map(t => ({ name: String(t.name || '').replace(/\s+/g, ''), n: Math.max(0, Math.min(15, Number(t.n) || 0)), floors: parseFloors(t.fl), max: Math.max(1, Math.min(3, Number(t.max) || 1)) })).filter(t => t.name && t.n > 0); }
function trOpts() { const o = {}; trList().forEach(t => { o[t.name] = { floors: t.floors, max: t.max }; }); return o; }
function trRead() { document.querySelectorAll('#asp [data-tr]').forEach(el => { const [k, i] = el.getAttribute('data-tr').split(':'); const t = A.tr[Number(i)]; if (t) t[k] = el.value; }); lsSet('asg_tr', JSON.stringify({ date: A.date, list: A.tr })); }
function trHtml() {
  const esc = H.esc, L = A.tr || [];
  return '<div class="asg-tr"><b>🎓 교육생</b> <small style="color:var(--muted)">그날만 · 엔진이 가능 층 안에서 최대 층 수까지만 줘요 (VIP·우선정비 빼고)</small>' +
    L.map((t, i) => '<div class="cf-q" style="grid-template-columns:1.3fr .7fr 1fr .7fr auto;margin-top:6px"><input data-tr="name:' + i + '" value="' + esc(t.name || '') + '" placeholder="이름"><input data-tr="n:' + i + '" type="number" min="1" max="15" inputmode="numeric" value="' + esc(t.n || 3) + '" title="객실 수"><input data-tr="fl:' + i + '" value="' + esc(t.fl || '') + '" placeholder="가능 층 예: 12 또는 10-12"><input data-tr="max:' + i + '" type="number" min="1" max="3" inputmode="numeric" value="' + esc(t.max || 1) + '" title="최대 층 수"><button class="vp-x" data-as="trdel" data-v="' + i + '" aria-label="빼기">✕</button></div>').join('') +
    (L.length ? '<p class="note" style="margin:4px 0 0">칸: 이름 · 객실 수 · 가능 층(비우면 아무 층) · 최대 층 수</p>' : '') +
    '<button class="big-btn sec" style="margin-top:6px" data-as="tradd">+ 교육생 추가</button></div>';
}

// ---------- 파일
function pick() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx'; inp.style.display = 'none';
  inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
    A.busy = '정비보고서를 읽는 중…'; A.err = ''; A.file = f.name; A.res = null; A.cmp = null; draw();
    try {
      if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 엑셀 읽기를 지원하지 않아요. PC 크롬이나 최신 휴대폰에서 해 주세요.');
      const E = await import(new URL('../rm/app/engine.js?v=' + VER, import.meta.url).href);
      A.buf = await f.arrayBuffer();
      const r = await E.buildFromXlsx(A.buf, A.date);
      A.data = r.data; A.sheet = r.sheet; A.carry = new Set(); A.cq = null; A.bChoice = {};
      const named = A.data.rooms.filter(x => x.name && isTarget(x));
      A.done = named.length >= 20 ? A.data.rooms : null;   // 이름이 들어 있으면 하우스키퍼 완성본 → 대조용
      // 출근 카드 유닛 = 관리자 인계 유닛 (11/14 사용자 결정: 하우스키퍼가 초안 카드에 인계 유닛을 적어 둠 → 따로 입력 안 함)
      //   숫자 = 출근·유닛, '휴무'·'휴'·'공란'·빈칸 = 휴무. 카드에 숫자가 하나도 없으면 예전처럼 지난 인계·정량으로
      const cards = {}; (A.data.cards || []).forEach(c => { const u = parseFloat(String(c.unit == null ? '' : c.unit)); if (u > 0) cards[String(c.name).replace(/\s+/g, '')] = u; });
      A.fromCards = Object.keys(cards).length ? { n: Object.keys(cards).length, u: Object.values(cards).reduce((a, b) => a + b, 0) } : null;
      if (A.fromCards) buildRows(cards); else buildRows();
    } catch (e) { A.err = String(e && e.message || e); A.data = null; }
    A.busy = ''; draw();
  });
  document.body.appendChild(inp); inp.click();
}

// ---------- 📋 정비보고서 앱에서 불러오기 (11/27 야간 배정 흐름 — 소장님 결정 claude/정비보고서앱_야간배정흐름_결정_1126.md)
//   정비보고서 = jbr/{날} (하우스맨이 정비보고서 창에서 4 깔린 초안에 연박 · 공실 · 재실 표시), 출근자 · 유닛 = HK 전파 사본 rmsched_hk/{날}.rm
const LIVE_FROM = '2026-11-28';   // 이날부터 확정 = 메이드 휴대폰에 (그 전엔 연습: 정비보고서에만 저장) — 11/27 소장님: 12/1 → 11/28 로 당김
// 테마 객실 (11/27 소장님: 매일 같은 방) = 엑셀 정비보고서 상단 '테마 객실' 표 — 로얄(RYH·RYL) · OTT(HTT) · 키즈(FAK) · 워케이션(FAW)
//   엔진: 우선정비(14시까지)로 셈 → 한 분에게 몰리지 않게 · 로얄 맡은 분에겐 가급적 안 줌 · 교육생 제외 · 담당 우선 / 메이드 휴대폰: '테마' · 14시까지
export const THEME_ROOMS = ['3001', '3002', '3101', '3102', '2909', '2910', '1807', '1808', '1809', '1810', '1811', '1707', '1708'];
export function jbrToData(d) {
  const order = (d.rooms && d.rooms.length ? d.rooms : Object.keys(d.r || {})).map(String);
  const rooms = order.filter(r => d.r && d.r[r]).map(r => { const x = d.r[r];
    return { room: r, floor: Math.floor(Number(r) / 100), st: x[0] || '', st_fill: x[5] ? 'FFFFFF00' : '', name: x[1] || '', m1: x[2] || '', m2: x[3] || '', done: x[4] ? '1' : '', grp_fill: '', yl: !!x[5] }; });
  return { rooms, cards: (d.cards || []).map(c => ({ label: c.n, name: c.n, unit: c.u, actual: '' })),
    groups: (d.groups || []).map(g => ({ name: g.name || '', time: g.time || '', rooms: String(g.rooms || '').split(',').filter(Boolean) })),
    themes: THEME_ROOMS.filter(r => d.r && d.r[r]).map(r => ({ room: r, type: typeOf(r) })) };
}
async function pickApp() {
  A.busy = '정비보고서 앱에서 불러오는 중…'; A.err = ''; A.res = null; A.cmp = null; A.ask = false; draw();
  try {
    const [d, hk] = await Promise.all([H.S.get('jbr/' + A.date), H.S.get('rmsched_hk/' + A.date).catch(() => null)]);
    if (!d || !d.r) throw new Error(H.md(A.date) + ' 정비보고서가 앱에 아직 없어요 — 정비보고서 창에서 「🌙 ' + H.md(A.date) + ' 초안 만들기」를 먼저 눌러 주세요');
    if (!A) return;
    A.data = jbrToData(d); A.sheet = String(Number(A.date.slice(8))); A.file = '📋 정비보고서 앱'; A.src = 'app'; A.buf = null;
    A.carry = new Set(); A.cq = null; A.bChoice = {}; A.done = null; A.force = false;
    const cards = {}; ((hk && hk.rm) || []).forEach(x => { const u = Number(x.u); if (x.n && u > 0) cards[String(x.n).replace(/\s+/g, '')] = u; });
    A.fromHk = Object.keys(cards).length ? { n: Object.keys(cards).length, u: Object.values(cards).reduce((a, b) => a + b, 0) } : null;
    A.fromCards = null;
    if (A.fromHk) buildRows(cards); else buildRows();
    A.hk0 = Object.assign({}, cards);   // HK 전파 원래 유닛 (−/+ 로 바꾼 것 표시용)
    A.jdoc = d; A.asgd = d.asg || null;
    // 이번 달 오버 · 다운 횟수 (확정 때 asg.ov 에 쌓인 것) — 몰림 방지 · 근거 자료 (11/26 채택)
    A.od = {}; try { const ym = A.date.slice(0, 7), L = await H.S.getQuery('jbr', [['date', '>=', ym + '-01']]);
      L.map(x => x.data).filter(x => x && x.date && x.date.slice(0, 7) === ym && x.date !== A.date && x.asg && x.asg.ov).forEach(x => Object.keys(x.asg.ov).forEach(n => { const o = A.od[n] = A.od[n] || { o: 0, d: 0 }; if (x.asg.ov[n] > 0) o.o++; else if (x.asg.ov[n] < 0) o.d++; })); } catch (e) {}
  } catch (e) { A.err = String(e && e.message || e); A.data = null; }
  if (A) { A.busy = ''; draw(); }
}
// ✔ 초안 체크리스트 띠 (11/26 채택): ① 연박 · 공실 → ② 출근자 → ③ 차이 정리 → ④ 자동 배정 → ⑤ 확정. 앞 단계가 안 되면 다음 단계 잠김
function stepsHtml() {
  if (A.src !== 'app' || !A.data) return '';
  const c = draftCounts(), s5 = !!A.asgd, s1 = s5 || c.yl + c.gong > 0, s2 = s5 || c.ppl > 0, s3 = s5 || (s1 && s2 && (gapOk() || A.force)), s4 = s5 || (s3 && !!A.res);
  const st = [['연박 · 공실 입력', s1], ['출근자 불러오기', s2], ['차이 정리', s3], ['자동 배정', s4 || s5], ['넣기', s5]];
  let cur = st.findIndex(x => !x[1]); if (cur < 0) cur = st.length;
  return '<div style="display:flex;gap:4px;flex-wrap:wrap;margin:0 0 12px">' + st.map((x, i) => '<span style="flex:1;min-width:92px;text-align:center;padding:7px 4px;border-radius:8px;font-size:12.5px;font-weight:800;' +
    (x[1] ? 'background:#E3F4E8;color:#1F7A3A' : i === cur ? 'background:#FFF1DC;color:#9A3412;border:1.5px solid #F2B48A' : 'background:#F1F3F7;color:#9AA4B5') + '">' + (x[1] ? '✓ ' : (i + 1) + ' ') + x[0] + '</span>').join('') + '</div>';
}
// 📋 카톡용 요약 (11/26 채택 — 소장님 개인톡 인계 대체): 출근 · 정비 실수 · 오버/다운 이름 · 미정비 호실
function sumText(d) {
  const day = '일월화수목금토'[new Date(d.date + 'T00:00:00').getDay()], cards = d.cards || [], ov = (d.asg && d.asg.ov) || {};
  const named = Object.keys(d.r || {}).filter(k => d.r[k][1]), units = cards.reduce((a, c) => a + (Number(c.u) || 0), 0);
  const carry = Object.keys(d.r || {}).filter(k => /미정비/.test((d.r[k][2] || '') + (d.r[k][3] || '')) && !d.r[k][1]).sort((a, b) => a - b);
  const up = Object.keys(ov).filter(n => ov[n] > 0), dn = Object.keys(ov).filter(n => ov[n] < 0);
  return ['■ ' + H.md(d.date) + '(' + day + ') 방배정 확정', '출근 ' + cards.length + '명 · 정비 ' + named.length + '실 (' + units + '유닛)',
    '오버: ' + (up.length ? up.map(n => n + ' +' + ov[n]).join(', ') : '없음'), '다운: ' + (dn.length ? dn.map(n => n + ' ' + ov[n]).join(', ') : '없음'),
    '미정비 ' + carry.length + '실' + (carry.length ? ': ' + carry.join(', ') : ''), ((d.asg && d.asg.noshow) || []).length ? '노쇼: ' + d.asg.noshow.join(', ') : ''].filter(Boolean).join('\n');
}
async function copySum() {
  try { const d = await H.S.get('jbr/' + A.date); const t = sumText(d);
    try { await navigator.clipboard.writeText(t); A.saved = '📋 카톡용 요약을 복사했어요 — 카톡에 붙여 넣으세요'; } catch (e) { A.sumText = t; A.saved = '아래 글을 길게 눌러 복사하세요'; }
  } catch (e) { A.err = '요약을 만들지 못했어요: ' + (e && e.message || e); }
  draw();
}
// 업무 시작(08:30 배포)까지 남은 시간 — 확정 취소 경고창
function untilText(ds) {
  const m = Math.round((Date.parse(ds + 'T08:30:00+09:00') - Date.now()) / 60000);
  return m > 0 ? '업무 시작 ' + (m >= 60 ? Math.floor(m / 60) + '시간 ' : '') + (m % 60) + '분 전입니다 (08:30 배포).' : '⛔ 이미 배포됨 — 메이드 휴대폰에 이 배정이 올라가 있을 수 있어요.';
}
async function saveJ(data, log) {
  const S = H.S, path = 'jbr/' + A.date; log = Object.assign({ at: S.SERVER_TIME, uid: (H.user() && H.user().uid) || '', by: (H.admin() && H.admin().label) || '' }, log);
  if (S.batch) return S.batch([{ op: 'merge', path, data }, { op: 'add', path: path + '/log', data: log }]);
  await S.merge(path, data); return S.add(path + '/log', log).done;
}
// ↩ 확정 취소 (11/26 결정): 시간 제한 없음 · 경고창 · 기록. 이름 · 출근 카드 · 이 확정으로 넣은 '미정비' 메모를 지움 (연박 · 공실 · 재실 초안은 그대로)
async function unconfirm() {
  const d = await H.S.get('jbr/' + A.date); if (!d || !d.asg) { A.err = '확정된 배정이 없어요'; draw(); return; }
  if (!confirm('정말 확정을 취소하시겠습니까?\n\n' + untilText(A.date) + '\n취소하면 모든 배정이 초기화됩니다. (연박 · 공실 · 재실 초안은 그대로)')) return;
  const carry = new Set((d.asg.carryRooms || []).map(String)), r = {}, ch = {};
  Object.keys(d.r).forEach(k => { const b = d.r[k], a = b.slice(); a[1] = ''; a[4] = b[4];
    if (carry.has(k)) a[3] = String(b[3] || '').replace(/^미정비( · )?/, '');
    if (JSON.stringify(a) !== JSON.stringify(b)) { r[k] = a; ch[k] = { b, a }; } });
  try { await saveJ({ r, cards: [], asg: null, at: H.S.SERVER_TIME }, { k: 'unassign', n: Object.keys(ch).length, ch, why: untilText(A.date) });
    A.asgd = null; A.res = null; A.saved = '↩ ' + H.md(A.date) + ' 확정을 취소했어요 — 배정 ' + Object.keys(ch).length + '실을 지웠어요. 다시 자동 배정을 돌려 확정해 주세요.' + (A.date >= LIVE_FROM && d.asg.sentAt ? ' (메이드 휴대폰은 다시 넣고 「📱 보내기」를 해야 바뀌어요)' : '');
    await pickApp(); A.saved = A.saved || ''; }
  catch (e) { A.err = '확정을 취소하지 못했어요: ' + (e && e.message || e); draw(); }
}
// 🚫 노쇼 (11/26 채택): 그분 방만 비우고 → 남은 분들께 자동으로 (같은 층에 방이 많은 분 → 가까운 층 → 유닛 적은 분, 오버 유닛). 다른 분 배정은 그대로
async function noShow(name) {
  const d = await H.S.get('jbr/' + A.date); if (!d || !d.asg) return;
  const own = k => String(d.r[k][1] || '').split(',').map(x => x.trim()).filter(Boolean);
  const mine = Object.keys(d.r).filter(k => own(k).includes(name)).sort((a, b) => a - b);
  const others = (d.cards || []).map(c => c.n).filter(n => n !== name);
  if (!mine.length || !others.length) { A.err = name + ' 님 방이 없거나 받을 분이 없어요'; draw(); return; }
  if (!confirm(name + ' 님 노쇼 처리\n\n' + mine.length + '실(' + mine.join(' ') + ')을 남은 ' + others.length + '분께 나눌까요?\n유닛이 적은 분 먼저, 같은 층 · 가까운 층에 방이 있는 분을 앞으로 해서 나눠요. 다른 분 배정은 그대로예요.')) return;
  const U = k => (ROYAL.includes(k) ? 2 : /간단/.test(String(d.r[k][0])) ? 0.5 : 1);
  const load = {}, fl = {}; others.forEach(n => { load[n] = 0; fl[n] = []; });
  Object.keys(d.r).forEach(k => own(k).forEach(n => { if (n in load) { load[n] += U(k); fl[n].push(Math.floor(k / 100)); } }));
  const r = {}, ch = {}, got = {};
  mine.forEach(k => { const b = d.r[k], f = Math.floor(k / 100);
    if (k === '2901' || own(k).length > 1) { const a = b.slice(); a[1] = own(k).filter(n => n !== name).join(', '); r[k] = a; ch[k] = { b, a }; return; }
    // 유닛 적은 분 먼저 + 같은 층에 방이 있으면 2유닛만큼 · 가까운 층이면 조금 앞으로 (한 분에게 몰리지 않게)
    const sc = n => load[n] + (fl[n].includes(f) ? -2 : 0) + (fl[n].length ? Math.min(5, Math.min(...fl[n].map(x => Math.abs(x - f)))) * 0.3 : 1.5);
    const to = others.slice().sort((p, q) => sc(p) - sc(q))[0];
    const a = b.slice(); a[1] = to; r[k] = a; ch[k] = { b, a }; load[to] += U(k); fl[to].push(f); (got[to] = got[to] || []).push(k); });
  const ov = Object.assign({}, d.asg.ov || {}); Object.keys(got).forEach(n => { ov[n] = (ov[n] || 0) + got[n].reduce((s, k) => s + U(k), 0); }); delete ov[name];
  const cards = (d.cards || []).filter(c => c.n !== name).map(c => ({ n: c.n, u: load[c.n] != null ? load[c.n] : c.u, in: !!c.in }));
  try {
    await saveJ({ r, cards, asg: Object.assign({}, d.asg, { ov, noshow: (d.asg.noshow || []).concat([name]) }), at: H.S.SERVER_TIME }, { k: 'noshow', who: name, n: Object.keys(ch).length, ch, got: Object.keys(got).map(n => n + ' ' + got[n].join('·')).join(' / ') });
    const nd = await H.S.get('jbr/' + A.date);
    const resend = A.date >= LIVE_FROM && !!(d.asg && d.asg.sentAt);
    if (resend) await uploadDoc(nd, '노쇼 처리 · ' + name);
    A.saved = '🚫 ' + name + ' 님 노쇼 처리 — ' + Object.keys(got).map(n => n + ' ' + got[n].join('·')).join(' / ') + (resend ? ' · 메이드 휴대폰에 다시 보냈어요' : A.date >= LIVE_FROM ? ' · 아직 안 보낸 날이라 정비보고서에만 (보낼 때 같이 가요)' : ' (연습 — 메이드 휴대폰엔 안 감)');
    A.nsOpen = false; await pickApp();
  } catch (e) { A.err = '노쇼 처리를 못 했어요: ' + (e && e.message || e); draw(); }
}
// 📱 메이드 휴대폰 보내기 (11/28 A안): 지금 정비보고서(격자에서 고친 그대로) → 메이드 휴대폰 · 더티 배분. 올리기가 저장소에 들어가면 asg.sentAt · 기록
export async function sendJbr(hub, date) {
  H = hub || H; const S = H.S;
  const d = await S.get('jbr/' + date); if (!d || !d.r) throw new Error('정비보고서를 읽지 못했어요');
  const named = Object.keys(d.r).filter(k => d.r[k][1]).length; if (!named) throw new Error('정비자 이름이 들어간 방이 없어요 — 자동 배정 「정비보고서에 넣기」를 먼저 해 주세요');
  await uploadDoc(d, '📋 정비보고서 앱 · 📱 보내기', () => {
    const by = (H.admin() && H.admin().label) || '', again = !!(d.asg && d.asg.sentAt);
    const data = { asg: Object.assign({}, d.asg || {}, { sentAt: S.SERVER_TIME, sentBy: by, sent: ((d.asg && d.asg.sent) || 0) + 1 }) };
    const log = { at: S.SERVER_TIME, uid: (H.user() && H.user().uid) || '', by, k: 'send', n: named, again, cards: (d.cards || []).map(c => c.n + ' ' + c.u).join(', ') };
    (S.batch ? S.batch([{ op: 'merge', path: 'jbr/' + date, data }, { op: 'add', path: 'jbr/' + date + '/log', data: log }]) : S.merge('jbr/' + date, data).then(() => S.add('jbr/' + date + '/log', log).done))
      .catch(e => H.logErr && H.logErr('보내기 기록', e));
  });
}
// 정비보고서(앱) 한 날 → 메이드 휴대폰 · 더티 배분 (기존 '정비보고서 올리기' 길 그대로, 12/1부터)
async function uploadDoc(d, file, after) {
  const E = await import(new URL('../rm/app/engine.js?v=' + VER, import.meta.url).href);
  const d2 = jbrToData(d); d2.cards = (d.cards || []).map((c, i) => ({ label: (i + 1) + '] ' + c.n, name: c.n, unit: c.u, actual: '' }));
  const { rows } = E._test.makeRows(d2, d.date);
  const csv = E._test.toCsv(rows), units = rows.reduce((s, x) => s + (ROYAL.includes(x[2]) ? 2 : 1), 0);
  H.upload({ date: d.date, file: file || '📋 정비보고서 앱', res: { csv, rows, sheet: String(Number(d.date.slice(8))), summary: { ok: true, maids: new Set(rows.map(x => x[1])).size, rooms: rows.length, units, checks: [], tags: {}, groups: [], due: [] }, data: d2 } }, after);
}
function asgdHtml() {
  if (A.src !== 'app' || !A.asgd) return '';
  const esc = H.esc, d = A.jdoc || {}, t = A.asgd.at ? new Date(Number(A.asgd.at) + 9 * 3600e3).toISOString().slice(11, 16) : '';
  const st = A.asgd.sentAt ? new Date(Number(A.asgd.sentAt.toMillis ? A.asgd.sentAt.toMillis() : A.asgd.sentAt) + 9 * 3600e3).toISOString().slice(11, 16) : '', lv = A.date >= LIVE_FROM;
  let h = '<div class="okbox" style="margin-top:8px">✅ 이 날은 ' + (t ? t + ' 에 ' : '') + '정비보고서에 <b>넣었어요</b> · 출근 ' + (d.cards || []).length + '명' + ((A.asgd.noshow || []).length ? ' · 노쇼 ' + esc(A.asgd.noshow.join(', ')) : '') +
    (!lv ? '' : A.asgd.sentAt ? '<br>📱 ' + st + ' 메이드 휴대폰에 보냄 — 그 뒤 격자에서 고친 건 1분 안팎에 따라 들어가요' : '<br><span style="color:#9A3412">📱 아직 메이드 휴대폰엔 안 보냈어요 — 정비보고서 격자에서 고친 뒤 보내세요</span><button class="big-btn" style="margin-top:8px" data-as="sendnow">📱 메이드 휴대폰 보내기</button>') +
    '<div class="btn2" style="margin-top:8px"><button class="big-btn sec" data-as="sum">📋 카톡용 요약 복사</button><button class="big-btn sec" data-as="nsopen">🚫 노쇼 처리</button></div>' +
    '<button class="big-btn sec" style="margin-top:8px;color:var(--warn)" data-as="unconf">↩ 확정 취소</button></div>';
  if (A.nsOpen) h += '<div class="card" style="margin-top:8px"><h2>🚫 노쇼 처리 <small>안 오신 분을 누르세요</small></h2><div class="asg-chips">' + (d.cards || []).map(c => '<button class="asg-chip" data-as="ns" data-v="' + esc(c.n) + '">' + esc(c.n) + ' ' + c.u + '</button>').join(' ') + '</div><p class="note">그분 방만 비우고 남은 분들께 나눠요 (유닛 적은 분 먼저, 같은 층 · 가까운 층이면 앞으로). 다른 분 배정은 그대로예요.</p></div>';
  if (A.sumText) h += '<textarea style="width:100%;min-height:150px;margin-top:8px">' + esc(A.sumText) + '</textarea>';
  return h;
}
// 초안 숫자 (자동 배정 확인 창): 연박 · 공실 · 재입 · 재실 → 정비할 방 / 출근 · 유닛 합
function draftCounts() {
  const R = A.data.rooms, yl = x => !!x.yl || /FFFF00$/i.test(String(x.st_fill || ''));
  const re = R.filter(x => yl(x) && !String(x.st || '').trim() && x.m1 && !/[^가-힣,\s]/.test(String(x.m1))).length;   // 재입 = 정비자 이름이 한 칸 아래(메모1)로 내려간 연박
  const H0 = ho();
  return { yl: R.filter(x => yl(x) && !String(x.st || '').trim()).length - re, gong: R.filter(x => !yl(x) && !String(x.st || '').trim()).length, re, jae: R.filter(x => String(x.st).trim() === '2').length,
    tgt: R.filter(live).length, ppl: Object.keys(H0).length, units: Object.values(H0).reduce((a, b) => a + b, 0) };
}
function askHtml() {
  const esc = H.esc, c = draftCounts();
  return '<div class="card" id="asgask" style="border:2px solid var(--brand,#1E3A6E)"><h2>자동 배정을 시작할까요?</h2>' +
    '<p style="margin:0 0 8px">한화 전산과 맞춰 <b>연박 · 공실 · 재입</b>을 모두 표시하셨나요?<br>표시가 빠진 방은 정비할 방으로 잡혀 배정돼요.<br>초안이 다 됐다면 「자동 배정 시작」을 눌러 주세요.</p>' +
    '<p class="okbox" style="margin:0 0 8px">연박 <b>' + c.yl + '실</b> · 공실 <b>' + c.gong + '실</b> · 재입 <b>' + c.re + '실</b> · 재실 <b>' + c.jae + '실</b> → 정비할 방 <b>' + c.tgt + '실</b><br>출근 <b>' + c.ppl + '명</b> · 유닛 합 <b>' + c.units + '</b></p>' +
    (!c.yl && !c.gong ? '<p class="err" style="margin:0 0 8px">연박 · 공실이 하나도 없어요 — 정말 표시를 마치셨나요?</p>' : '') +
    '<div class="btn2"><button class="big-btn sec" data-as="askno">아직이에요, 초안으로</button><button class="big-btn" data-as="askyes">자동 배정 시작</button></div></div>';
}
// 차이 정리 (11/26 결정): 정비 대상 유닛 vs 출근자 유닛 합 — 0 이면 자동 배정 켜짐. 사람이 −/+ 또는 미정비 남기기로 맞춤
function diffHtml() {
  const g = gapInfo(); if (!g) return '';
  const d = Math.round(g.d * 10) / 10;
  if (Math.abs(d) < 1) return '<p class="okbox" style="margin-top:8px">✅ 정비할 방 <b>' + g.units + '유닛</b> = 출근자 유닛 합 <b>' + g.ho + '</b>' + (d ? ' (차이 ' + d + ')' : '') + ' — 자동 배정을 돌릴 수 있어요</p>';
  if (d > 0) return '<p class="err" style="margin-top:8px">방 <b>' + d + '유닛 남음</b> › 어느 분에게 더 넣을까요? 위 이름 옆 <b>+</b> 로 넣거나 (한 분에게 몰아도 돼요), 아래 <b>📦 미정비 남기기</b>로 남겨 주세요.<br><small>정비할 방 ' + g.units + '유닛 · 출근자 유닛 합 ' + g.ho + '</small></p>';
  return '<p class="err" style="margin-top:8px">방 <b>' + (-d) + '유닛 부족</b> › 어느 분 방을 뺄까요? 위 이름 옆 <b>−</b> 로 빼 주세요.<br><small>정비할 방 ' + g.units + '유닛 · 출근자 유닛 합 ' + g.ho + '</small></p>';
}
const gapOk = () => { const g = gapInfo(); return !g || Math.abs(g.d) < 1; };

// ---------- 📦 미정비 남기기 — 유닛 기준 (11/27 소장님): [본인이 대상 선택] 층 격자에서 클릭 · [엔진이 고릅니다]
const unitsOf = set => [...set].reduce((s, r) => s + unitOf(roomInfo()[r] || { room: r }), 0);
function c2Open() { const g = gapInfo(); A.c2 = { goal: Math.max(0, Math.round((g ? g.d : 0) + unitsOf(A.carry) * 1)), prev: new Set(A.carry), mode: '' }; A.view = 'carry2'; draw(); const b = document.getElementById('asp'); if (b) b.scrollTop = 0; }
const canCarry = x => isTarget(x) && !blk(x.room) && !carryBlock(x);
function c2Engine() {   // 남은 유닛만큼만 저층부터 (담당 출근 층은 3개 층 높은 것처럼) — 이미 고른 방은 그대로
  let rem = A.c2.goal - unitsOf(A.carry);
  const C = A.data.rooms.filter(x => canCarry(x) && !A.carry.has(String(x.room))).map(x => Object.assign({ sc: x.floor + (keyOn(x) ? KEY_ON_FLOORS : 0) }, x)).sort((p, q) => p.sc - q.sc || p.room - q.room);
  for (const x of C) { if (rem <= 0) break; const u = unitOf(x); if (u > rem + 1e-9) continue; A.carry.add(String(x.room)); rem -= u; }
}
function carry2Html() {
  const esc = H.esc, c = A.c2, got = unitsOf(A.carry), rem = Math.round((c.goal - got) * 10) / 10;
  let h = '<div class="card" style="position:sticky;top:0;z-index:3;background:var(--card,#fff)"><h2>📦 미정비 남기기 <small>유닛 기준 · 로얄은 2유닛</small></h2>' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><label>남길 유닛 <input type="number" min="0" inputmode="numeric" style="width:70px" id="c2goal" value="' + c.goal + '"></label>' +
    '<b style="font-size:17px;' + (rem < 0 ? 'color:var(--warn)' : '') + '">' + (got === 0 ? c.goal + '유닛만큼 미정비로 남길 객실을 선택해 주세요' : rem > 0 ? rem + '유닛 남았어요' : rem === 0 ? '다 골랐어요' : (-rem) + '유닛 넘었어요') + '</b></div>' +
    '<div class="btn2" style="margin-top:8px"><button class="big-btn sec" data-as="c2eng">🤖 엔진이 고릅니다' + (rem > 0 ? ' (' + rem + '유닛)' : '') + '</button><button class="big-btn" data-as="c2done"' + (rem === 0 ? '' : ' disabled') + '>✅ 완료</button></div>' +
    (A.carry.size ? '<p style="margin:8px 0 0">' + [...A.carry].sort((a, b) => a - b).map(r => '<button class="asg-chip" data-as="c2x" data-v="' + esc(r) + '">' + esc(r) + '</button>').join(' ') + '</p>' : '') +
    '<p class="note" style="margin:6px 0 0">방을 누르면 고르기 / 다시 누르면 풀기 · <b>층 번호</b>를 누르면 그 층 전체 · 회색은 남길 수 없는 방(연박 · 공실 · 로얄 · 2901 · VIP · 단체 · 시간 지정 · 당직 · 재실) · <button class="asg-chip" data-as="c2esc">↩ 들어오기 전으로</button></p></div>';
  const by = {}; A.data.rooms.forEach(x => { (by[x.floor] = by[x.floor] || []).push(x); });
  h += '<div class="card" style="overflow-x:auto"><table style="border-collapse:collapse;font-size:12px">' + Object.keys(by).map(Number).sort((a, b) => b - a).map(f =>
    '<tr><th><button class="asg-chip" data-as="c2fl" data-v="' + f + '" style="min-width:42px">' + f + 'F</button></th>' + by[f].sort((a, b) => a.room - b.room).map(x => { const r = String(x.room), ok = canCarry(x), on = A.carry.has(r);
      return '<td style="padding:1px"><button data-as="c2c" data-v="' + esc(r) + '"' + (ok ? '' : ' disabled') + ' style="width:46px;height:34px;border-radius:6px;border:1px solid ' + (on ? '#B26A00' : '#ccd') + ';background:' + (on ? '#FFD9A6' : ok ? '#fff' : '#eee') + ';color:' + (ok ? '#123' : '#aab') + ';font-weight:' + (on ? 800 : 500) + ';font-size:12px;padding:0">' + esc(r.slice(-2)) + (unitOf(x) > 1 ? '<sup>2</sup>' : '') + '</button></td>'; }).join('') + '</tr>').join('') + '</table></div>';
  return h;
}

// ---------- 돌리기 (백그라운드)
function run(again) {
  if (!A.data || A.worker) return;
  const H0 = ho(); if (!Object.keys(H0).length) { A.err = '출근자를 골라 주세요.'; draw(); return; }
  // 단체: 상단 '단체 현황' 표의 호실 (입실 시간 → 시각 숫자). 표가 없는 예전 파일은 객실 위 단체 행에 칠한 색
  const G = {}; (A.data.groups || []).forEach(g => { const m = /(\d{1,2})\s*[:시]/.exec(String(g.time || '')); (g.rooms || []).forEach(r => { G[String(r)] = { n: g.name, h: m ? Number(m[1]) : 17 }; }); });
  const noTbl = !(A.data.groups || []).length;
  // 테마 객실 (상단 '테마 객실' 표) = 우선정비 → 로얄 맡은 분은 가급적 안 받음 (11/15)
  const TH = new Set((A.data.themes || []).map(t => String(t.room)));
  // 미정비(이월) 확인 (11/15 하우스맨): 대상 유닛이 인계 유닛보다 많이 넘치면 먼저 물어봄
  const gap = gapInfo();
  if (!again && A.src !== 'app' && gap && gap.over > 0 && !confirm('정비 대상 ' + gap.units + '유닛이 인계 ' + gap.ho + '유닛보다 ' + gap.over + '유닛 많아요 (한 분당 약 +' + gap.per + ').\n\n미정비(이월) 표시를 먼저 하셨나요?\n· 이월할 객실이 있으면 [취소] → 정비보고서 메모에 \'미정비\' 적고 다시 넣기\n· 넘치는 만큼 모두 배정하려면 [확인]')) return;
  const rooms = A.data.rooms.map(x => { const g = G[String(x.room)] || (noTbl && ['', 'FFFFFFFF', 'THEME0'].indexOf(String(x.grp_fill || '').toUpperCase()) < 0 ? { n: '단체', h: 17 } : null);
    return { room: x.room, floor: x.floor, st: x.st, m1: A.bprio && A.bprio[String(x.room)] ? ((x.m1 || '') + ' 14시까지') : x.m1, m2: ((A.carry && A.carry.has(String(x.room))) || blk(x.room)) ? ((x.m2 || '') + ' 미정비') : x.m2, grp: g ? g.n : '', gh: g ? g.h : 0, theme: TH.has(String(x.room)) }; });
  // 신입 = 직원 명단 입사일이 배정 날짜 3개월 안 (11/14 사용자: 3개월 미만은 가급적 VIP 안 줌). 입사일 없는 분은 모름 → 정량 8 미만만 신입으로
  const [yy, mm, dd] = A.date.split('-').map(Number), c3 = new Date(yy, mm - 1 - 3, dd), cut = c3.getFullYear() + '-' + String(c3.getMonth() + 1).padStart(2, '0') + '-' + String(c3.getDate()).padStart(2, '0');
  A.vipNo = Object.keys(H0).filter(n => A.hired && A.hired[n] && A.hired[n] > cut);
  A.grpSet = new Set(rooms.filter(x => x.grp).map(x => String(x.room)));
  const hist = {}; const ym = A.date.slice(0, 7);
  ((A.cfgDoc && A.cfgDoc.hist2901) || []).filter(x => x.date.slice(0, 7) === ym && x.date < A.date).forEach(x => x.names.forEach(n => { hist[n] = (hist[n] || 0) + 1; }));
  const prev = A.prev.split(/[,·\s]+/).map(s => s.trim()).filter(Boolean);
  A.res = null; A.cmp = null; A.prog = 0; A.err = ''; A.running = true; draw();
  const w = new Worker(new URL('./assign_worker.js?v=' + VER, import.meta.url), { type: 'module' });
  A.worker = w;
  w.onmessage = e => {
    if (!A) return;
    if (e.data.p != null) { A.prog = e.data.p; const b = document.getElementById('asprog'); if (b) b.style.width = Math.round(A.prog * 100) + '%'; return; }
    w.terminate(); A.worker = null; A.running = false;
    if (e.data.err) { A.err = '배정 계산 오류: ' + e.data.err; draw(); return; }
    A.res = e.data.done; A.res0 = byName(A.res); A.edits = []; A.mv = null; A.open = {}; A.xmsg = '';
    if (A.done) A.cmp = compare(A.done, A.res);
    saveLast(H0);
    if (A.done) saveDay({ hk: hkByName(), cmp: cmpLite() });
    draw();
  };
  w.onerror = e => { if (!A) return; A.worker = null; A.running = false; A.err = '배정 계산을 못 했어요: ' + (e.message || e); draw(); };
  const input = { rooms, ho: H0, cfg: cfg(), prev2901: prev, hist, opts: { seeds: [11, 23, 37, 51], iter: 150000, vipNo: A.vipNo, teams: A.teams || [], trainees: trOpts(), bChoice: Object.assign({}, A.bChoice || {}) } };
  A.input = input;   // 📝 배정 의견 · asg_days 에 같이 남김 (나중에 같은 계산을 다시 돌려 보려고)
  w.postMessage(input);
}
// 대상 유닛 − 인계 유닛. +1 은 베테랑 몇 분이 받는 게 보통이라 출근자 1/4 까지는 괜찮게 봄
function gapInfo() {
  if (!A || !A.data) return null;
  const T = A.data.rooms.filter(live), H0 = ho(), n = Object.keys(H0).length; if (!n) return null;
  const units = T.reduce((s, x) => s + (String(x.room) === '2901' ? (/당직|H\/U/i.test((x.m1 || '') + (x.m2 || '')) ? 1 : 3) : unitOf(x)), 0);
  const hs = Object.values(H0).reduce((a, b) => a + b, 0), d = units - hs, ok = Math.ceil(n / 4);
  return { units, ho: hs, d, over: d > ok ? d : 0, per: Math.round(d / n * 10) / 10 };
}
// 📝 배정 의견 (2026-11-19): 그날 배정 결과 한 벌 — 엔진안(처음) · 지금(고친 뒤) · 고친 것 · 대조 · 계산 입력
function byName(R) { const o = {}; Object.keys((R && R.workers) || {}).forEach(n => { o[n] = R.workers[n].rooms.slice(); }); return o; }
function hkByName() { const o = {}; (A.done || []).forEach(x => { String(x.name || '').split(',').map(s => s.replace(/ /g, '')).filter(Boolean).forEach(n => { (o[n] = o[n] || []).push(String(x.room)); }); }); return o; }
function cmpLite() { const C = A.cmp; return C ? { pct: C.pct, same: C.same, total: C.total, hkAvg: Math.round(C.hkAvg * 100) / 100, hkThree: C.hkThree.length } : null; }
// 11/25: Firestore 는 '배열 안의 배열'과 undefined 를 못 받음(invalid-argument) — 2인 1조 teams [[a,b]] 때문에 의견 저장 · asg_days 가 실패했음
//   → 안쪽 배열은 'a,b' 글자로 (엔진 opts.teams 는 글자도 받음), undefined 는 빼고, NaN · Infinity 는 null
export function fsSafe(v, inArr) {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (Array.isArray(v)) {
    if (inArr) return v.every(x => x == null || typeof x !== 'object') ? v.map(x => x == null ? '' : String(x)).join(',') : JSON.stringify(v);
    return v.map(x => fsSafe(x, true)).map(x => x === undefined ? null : x);
  }
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const o = {}; Object.keys(v).forEach(k => { const x = fsSafe(v[k], false); if (x !== undefined) o[k] = x; }); return o;
  }
  return v;
}
export function snapshot() {
  const s0 = snapshotRaw(); return s0 ? fsSafe(s0) : null;
}
function snapshotRaw() {
  if (!A || !A.res) return null;
  const s = A.res.stats || {};
  return { date: A.date, file: A.file || '', kind: A.done ? '완성본 대조' : '초안', engine: A.res0 || byName(A.res), final: byName(A.res), edits: (A.edits || []).slice(), left: (A.res.left || []).slice(),
    stats: { avgFloors: Math.round((s.avgFloors || 0) * 100) / 100, three: (s.three || []).slice(), target: s.target || 0, units: s.units || 0, forks: (s.forks || []).map(k => ({ b: k.b, floors: k.floors, n: k.n, moved: !!k.moved, choice: k.choice || '' })) }, cmp: cmpLite(), input: A.input || null, ver: VER };
}
// asg_days/{날짜}: 매일 품질 기록 (확정해서 올릴 때 · 완성본 대조할 때). 관리자만 씀, 매일 점검 계정이 읽음 (규칙 v19)
function saveDay(extra) {
  const s = snapshot(); if (!s) return;
  const d = Object.assign({ date: A.date, at: H.S.SERVER_TIME, by: (H.admin() || {}).label || '' }, extra || {});
  if (!extra || !extra.hk) Object.assign(d, { engine: s.engine, final: s.final, edits: s.edits, nEdits: s.edits.length, stats: s.stats, input: s.input, ver: VER });
  else d.engineHk = s.engine;
  H.S.merge('asg_days/' + A.date, d).catch(e => H.logErr && H.logErr('자동배정 매일 기록', e));
}
function openNote() {
  import(new URL('./asgnote.js?v=' + (new URL(import.meta.url).searchParams.get('v') || VER), import.meta.url).href).then(m => m.openNotes(H, { snap: snapshot() })).catch(e => { A.err = '배정 의견 화면을 못 불러왔어요: ' + (e && e.message || e); draw(); });
}
function saveLast(H0) {
  lsSet('asg_ho', JSON.stringify(H0));
  const d = Object.assign({}, A.cfgDoc, { lastHo: H0, lastDate: A.date, at: H.S.SERVER_TIME, by: H.admin().label });
  if (A.cmp) {
    const log = (A.cfgDoc.log || []).filter(x => x.date !== A.date).concat([{ date: A.date, pct: A.cmp.pct, same: A.cmp.same, total: A.cmp.total, hkAvg: Math.round(A.cmp.hkAvg * 100) / 100, enAvg: Math.round(A.res.stats.avgFloors * 100) / 100, hkThree: A.cmp.hkThree.length, enThree: A.res.stats.three.length }]).slice(-60);
    d.log = log;
    const hkPlt = A.done.filter(x => String(x.room) === '2901' && x.name).map(x => String(x.name).replace(/ /g, '').split(',')).flat().filter(Boolean);
    if (hkPlt.length) d.hist2901 = ((A.cfgDoc.hist2901 || []).filter(x => x.date !== A.date)).concat([{ date: A.date, names: hkPlt }]).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-90);
  }
  A.cfgDoc = d;
  H.S.set('meta/assign', d).catch(e => H.logErr && H.logErr('자동배정 설정', e));
}

// ---------- 고치기 (객실 옮기기 · 2901 바꾸기) — 계산은 다시 안 돌리고 숫자만 다시 셈
function roomInfo() { const m = {}; A.data.rooms.forEach(x => { m[String(x.room)] = x; }); return m; }
function recount() {
  const R = A.res, info = roomInfo(), names = Object.keys(R.workers);
  names.forEach(n => { const w = R.workers[n];
    w.load = w.rooms.reduce((s, r) => s + (r === '2901' ? 1 : unitOf(info[r] || { room: r })), 0);
    w.floors = [...new Set(w.rooms.map(r => Math.floor(Number(r) / 100)))].sort((a, b) => b - a); });
  const fl = names.map(n => R.workers[n].floors.length).filter(k => k > 0);
  R.stats.avgFloors = fl.length ? fl.reduce((a, b) => a + b, 0) / fl.length : 0;
  R.stats.three = names.filter(n => R.workers[n].floors.length >= 3);
  R.stats.plt = names.filter(n => R.workers[n].rooms.includes('2901'));
  R.owner['2901'] = R.stats.plt.join(', ');
  R.stats.down = names.filter(n => R.workers[n].load < R.workers[n].ho - 1e-9);
  R.stats.up = names.filter(n => R.workers[n].load > R.workers[n].ho + 1e-9);
  R.stats.left = R.left.length;
  if (A.done) A.cmp = compare(A.done, R);
}
function moveRoom(room, from, to) {
  const R = A.res; if (!to || to === from) return;
  const a = R.workers[from], b = R.workers[to]; if (!a || !b) return;
  if (room === '2901' && b.rooms.includes('2901')) { A.err = to + ' 님은 이미 2901 을 맡았어요.'; return; }
  if (from === '(미배정)') { R.left = R.left.filter(r => r !== room); } else a.rooms.splice(a.rooms.indexOf(room), 1);
  b.rooms.push(room); if (room !== '2901') R.owner[room] = to;
  A.edits.push(room + ' ' + from + ' → ' + to); A.err = ''; recount();
}

// ---------- 📄 정비보고서 엑셀 (오더테이커용) — 넣은 원본에 이름·출근 카드를 채워 내려받기 (fillxlsx.js)
async function downXlsx(quiet) {
  if (!A.res || !A.buf || A.xbusy) return;
  A.xbusy = true; A.xmsg = ''; if (!quiet) draw();
  try {
    const F = await import(new URL('./fillxlsx.js?v=' + VER, import.meta.url).href);
    const W = {}; Object.keys(A.res.workers).forEach(n => { const w = A.res.workers[n]; if (w.rooms.length) W[n] = { rooms: w.rooms, load: w.load }; });
    const ct = {}; Object.keys(A.bmap || {}).forEach(r => { const b = A.bmap[r]; ct[r] = '미정비 ' + b.name + (b.to > A.date ? ' ~' + Number(b.to.slice(5, 7)) + '/' + Number(b.to.slice(8)) : ''); });
    const { bytes, info } = await F.fillReport(A.buf, A.date, W, { carry: [...(A.carry || []), ...Object.keys(ct)], carryText: ct });
    const name = 'report_' + A.date.slice(5).replace('-', '') + '_auto.xlsx';   // 한글 파일 이름은 일부 휴대폰·브라우저에서 'download' 로 바뀌어 영문으로
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    A.xmsg = '📄 ' + name + ' 내려받음 — ' + info.sheet + '일 시트 객실 ' + info.named + '실 · 출근 카드 ' + info.cards + '명' +
      (info.added.length ? ' · 카드 새로 추가: ' + info.added.join(', ') : '') + (info.noCard && info.noCard.length ? ' · ⚠️ 카드 칸이 없어 못 넣은 분: ' + info.noCard.join(', ') : '') + (info.carry ? ' · 미정비 메모 ' + info.carry + '실' : '') + (info.offs.length ? ' · 휴무 표시: ' + info.offs.join(', ') : '') + (info.missing.length ? ' · 칸 못 찾은 객실: ' + info.missing.join(' ') : '');
  } catch (e) { A.xmsg = '엑셀을 만들지 못했어요: ' + (e && e.message || e); }
  A.xbusy = false; if (!quiet) draw();
}

// ---------- ✅ 확정 → 앱에 올리기 (초안일 때만)
async function confirmUpload() {
  const R = A.res;
  if (A.done) return;
  if (A.src === 'app') return confirmApp();
  if (R.left.length && !confirm('미배정 객실이 ' + R.left.length + '실 있어요 (' + R.left.join(' ') + '). 그래도 올릴까요?')) return;
  if (!confirm(H.md(A.date) + ' 배정을 앱에 올릴까요?\n\n· 정비보고서 엑셀(이름·출근 카드 채움)이 내려받아져요\n· 1~2분 안에 메이드 휴대폰에 들어가요\n· 정비 지원 더티 배분도 이 배정으로 불러와요\n· 같은 날 이미 올린 배정이 있으면 바뀌어요 (완료 기록은 그대로)')) return;
  try {
    const E = await import(new URL('../rm/app/engine.js?v=' + VER, import.meta.url).href);
    const ownerOf = {}; Object.keys(R.workers).forEach(n => R.workers[n].rooms.forEach(r => { (ownerOf[r] = ownerOf[r] || []).push(n); }));
    const rooms = A.data.rooms.map(x => Object.assign({}, x, { name: ownerOf[String(x.room)] ? ownerOf[String(x.room)].join(', ') : '' }, (A.carry && A.carry.has(String(x.room))) || blk(x.room) ? { m2: (x.m2 || '') + ' 미정비' } : {}, A.bprio && A.bprio[String(x.room)] ? { m1: (x.m1 || '') + ' 14시까지' } : {}));
    const order = Object.keys(R.workers).filter(n => R.workers[n].rooms.length).sort((a, b) => (R.workers[b].floors[0] || 0) - (R.workers[a].floors[0] || 0));
    const cards = order.map((n, i) => ({ label: (i + 1) + '] ' + n, name: n, unit: R.workers[n].load, actual: '' }));
    const d2 = { rooms, cards, groups: A.data.groups || [], themes: A.data.themes || [] };
    const { rows } = E._test.makeRows(d2, A.date);
    const csv = E._test.toCsv(rows);
    const units = rows.reduce((s, r) => s + (ROYAL.includes(r[2]) ? 2 : 1), 0);
    const summary = { ok: !R.left.length, maids: new Set(rows.map(r => r[1])).size, rooms: rows.length, units, checks: [], tags: {}, groups: [], due: [] };
    await downXlsx(true);
    H.upload({ date: A.date, file: '자동 배정 · ' + A.file, res: { csv, rows, sheet: A.sheet, summary, data: d2 } });
    saveDay({ sentAt: Date.now() });
    const d = Object.assign({}, A.cfgDoc, { lastSent: { date: A.date, edits: A.edits.length, at: Date.now() } });
    H.S.set('meta/assign', d).catch(e => H.logErr && H.logErr('자동배정 설정', e));
    close();
  } catch (e) { A.err = '올리지 못했어요: ' + (e && e.message || e); draw(); }
}

// ✅ 확정 (앱 정비보고서): 배정 이름 · 미정비 · 출근 카드를 jbr/{날}에 저장 (+ 변경 기록) → 12/1부터는 메이드 휴대폰 · 더티 배분에도
async function confirmApp() {
  const R = A.res, S = H.S, live = A.date >= LIVE_FROM;
  if (R.left.length && !confirm('미배정 객실이 ' + R.left.length + '실 있어요 (' + R.left.join(' ') + '). 그래도 확정할까요?')) return;
  if (A.asgd) { A.err = '이미 확정된 날이에요 — 위 「↩ 확정 취소」를 먼저 눌러 주세요'; draw(); return; }
  if (!confirm(H.md(A.date) + ' 배정을 정비보고서에 넣을까요?\n\n· 정비보고서(앱) 격자에 이름 · 미정비 · 출근 카드가 들어가요\n· 메이드 휴대폰엔 아직 안 가요 — 격자에서 엑셀처럼 고친 뒤 「📱 메이드 휴대폰 보내기」를 누르면 그때 가요')) return;
  try {
    const ownerOf = {}; Object.keys(R.workers).forEach(n => R.workers[n].rooms.forEach(r => { (ownerOf[r] = ownerOf[r] || []).push(n); }));
    const cur = await S.get('jbr/' + A.date); if (!cur || !cur.r) throw new Error('정비보고서를 다시 읽지 못했어요');
    const r = {}, ch = {};
    Object.keys(cur.r).forEach(k => { const b = cur.r[k], a = b.slice();
      const isCarry = (A.carry && A.carry.has(k)) || blk(k);
      a[1] = ownerOf[k] ? ownerOf[k].join(', ') : (isTarget({ room: k, st: b[0], m1: b[2], m2: b[3] }) ? '' : b[1]);
      if (isCarry && !/미정비/.test((b[2] || '') + (b[3] || ''))) { if (!b[3]) a[3] = '미정비'; else a[3] = '미정비 · ' + b[3]; }
      if (JSON.stringify(a) !== JSON.stringify(b)) { r[k] = a; ch[k] = { b, a }; } });
    const order = Object.keys(R.workers).filter(n => R.workers[n].rooms.length).sort((a, b) => (R.workers[b].floors[0] || 0) - (R.workers[a].floors[0] || 0));
    const cards = order.map(n => ({ n, u: R.workers[n].load, in: false }));
    const ov = {}; order.forEach(n => { const base = A.hk0 && A.hk0[n] != null ? A.hk0[n] : null; if (base != null && Math.abs(R.workers[n].load - base) > 1e-9) ov[n] = Math.round((R.workers[n].load - base) * 10) / 10; });
    const data = { date: A.date, r, cards, src: 'app', at: S.SERVER_TIME, by: (H.admin() && H.admin().label) || '', asg: { at: S.SERVER_TIME, by: (H.admin() && H.admin().label) || '', edits: (A.edits || []).length, carry: [...(A.carry || [])].length, carryRooms: Object.keys(r).filter(k => /미정비/.test(r[k][3] || '') && !/미정비/.test(cur.r[k][3] || '')), live, ov, noshow: [], sentAt: null } };
    const log = { at: S.SERVER_TIME, uid: (H.user() && H.user().uid) || '', by: data.by, k: 'assign', n: Object.keys(ch).length, ch, cards: cards.map(c => c.n + ' ' + c.u).join(', ') };
    if (S.batch) await S.batch([{ op: 'merge', path: 'jbr/' + A.date, data }, { op: 'add', path: 'jbr/' + A.date + '/log', data: log }]);
    else { await S.merge('jbr/' + A.date, data); await S.add('jbr/' + A.date + '/log', log).done; }
    saveDay({ sentAt: Date.now(), src: 'app', live });
    // 11/28 A안 (첫 실전: 확정 = 바로 휴대폰이라 하우스키퍼가 확정을 못 누르고 엑셀로 감): 넣기만 하고 닫음 → 격자에서 고친 뒤 「📱 메이드 휴대폰 보내기」
    close();
  } catch (e) { A.err = '확정하지 못했어요: ' + (e && e.message || e); draw(); }
}

// ---------- ⚙️ 담당표·정량 설정
function cfgOpen() {
  const c = cfg();
  A.cf = { aKey: Object.assign({}, c.aKey), bKey: Object.assign({}, c.bKey), royal: c.royalOk.join(', '), blue: c.pltBlue.join(', '), spec: (c.specOk || []).join(', '),
    quota: Object.keys(c.quota).map(n => ({ name: n, v: c.quota[n] })), err: '', saving: false };
  A.view = 'cfg'; draw();
  const b = document.getElementById('asp'); if (b) b.scrollTop = 0;
}
function cfgRead() {
  const F = A.cf;
  document.querySelectorAll('#asp [data-ck]').forEach(el => {
    const [k, f] = el.getAttribute('data-ck').split(':'), v = el.value.replace(/\s+/g, '');
    if (k === 'a' || k === 'b') { const o = k === 'a' ? F.aKey : F.bKey; if (v) o[f] = v; else delete o[f]; }
    if (k === 'qn') F.quota[Number(f)].name = v;
    if (k === 'qv') F.quota[Number(f)].v = el.value;
  });
  const r = document.getElementById('cfroyal'), bl = document.getElementById('cfblue');
  if (r) F.royal = r.value; if (bl) F.blue = bl.value;
  const sp = document.getElementById('cfspec'); if (sp) F.spec = sp.value;
}
const splitNames = t => String(t || '').split(/[,·\s]+/).map(x => x.trim()).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i);
function cfgSave() {
  cfgRead();
  const F = A.cf, q = {};
  for (const x of F.quota) { if (!x.name) continue; const v = Number(x.v); if (!(v >= 1 && v <= 15)) { F.err = x.name + ' 님 정량을 1~15 사이로 적어 주세요.'; draw(); return; } q[x.name] = v; }
  const c = { aKey: F.aKey, bKey: F.bKey, royalOk: splitNames(F.royal), pltBlue: splitNames(F.blue), specOk: splitNames(F.spec), quota: q };
  if (!c.royalOk.length) { F.err = '로얄 가능자를 한 분 이상 적어 주세요.'; draw(); return; }
  F.saving = true; F.err = ''; draw();
  const d = Object.assign({}, A.cfgDoc, { cfg: c, cfgAt: H.S.SERVER_TIME, cfgBy: H.admin().label });
  H.S.set('meta/assign', d).then(() => { A.cfgDoc = d; A.view = ''; A.cf = null; A.saved = '담당표·정량을 저장했어요. 다음 배정부터 이대로 해요.'; buildRows(); draw(); },
    e => { F.saving = false; F.err = '저장하지 못했어요: ' + (e && (e.code || e.message) || e); draw(); });
}
function cfgHtml() {
  const esc = H.esc, F = A.cf, known = new Set(A.staff.concat(Object.values(F.aKey), Object.values(F.bKey)));
  const warn = n => n && A.staff.length && !A.staff.includes(n) ? ' <span class="cf-w" title="직원 명단(룸메이드 재직)에 없는 이름">명단에 없음</span>' : '';
  let h = '<div class="card"><h2>⚙️ 층별 담당표 <small>A키 = 층 대부분 · B키 = 호수 10·11·15·16·17 (27층 이상·4층은 A키만)</small></h2>' +
    '<datalist id="cfnames">' + [...known].sort((a, b) => a.localeCompare(b, 'ko')).map(n => '<option value="' + esc(n) + '">').join('') + '</datalist>' +
    '<div class="cf-grid"><b>층</b><b>A키</b><b>B키</b>';
  for (let f = 31; f >= 4; f--) {
    const a = F.aKey[f] || '', b = F.bKey[f] || '', hasB = f < 27 && f !== 4;
    h += '<span class="cf-f">' + f + 'F</span><span><input list="cfnames" data-ck="a:' + f + '" value="' + esc(a) + '" placeholder="-">' + warn(a) + '</span>' +
      '<span>' + (hasB ? '<input list="cfnames" data-ck="b:' + f + '" value="' + esc(b) + '" placeholder="-">' + warn(b) : '') + '</span>';
  }
  h += '</div><p class="note">비워 두면 그 층·구역은 담당 없이 남는 분이 맡아요. 같은 분이 두 층을 맡을 수 있어요 (예: 이분남 4·31층).</p></div>';
  h += '<div class="card"><h2>정량 <small>기본 정비수 — 없으면 9</small></h2><p class="note" style="margin:0 0 8px">정규A 전환자 8 · 신입 단계 유닛(주마다 1실 증량) · 8 미만 = 신입으로 보고 로얄·층 이동을 줄여요.</p>' +
    F.quota.map((x, i) => '<div class="cf-q"><input list="cfnames" data-ck="qn:' + i + '" value="' + esc(x.name) + '" placeholder="이름"><input type="number" min="1" max="15" inputmode="numeric" data-ck="qv:' + i + '" value="' + esc(x.v) + '"><button class="vp-x" data-as="cfqdel" data-v="' + i + '" aria-label="빼기">✕</button></div>').join('') +
    '<button class="big-btn sec" style="margin-top:8px" data-as="cfqadd">+ 정량 한 분 추가</button></div>';
  h += '<div class="card"><h2>로얄 · 2901</h2><label class="asg-prev" style="grid-template-columns:110px 1fr"><span>로얄 가능자</span><input id="cfroyal" value="' + esc(F.royal) + '"></label>' +
    '<label class="asg-prev" style="grid-template-columns:110px 1fr"><span>2901 파란 명단</span><input id="cfblue" value="' + esc(F.blue) + '"></label>' +
    '<p class="note">로얄 3001·3002·3101·3102 는 가능자만 맡아요. 2901 은 파란 명단 → 로얄 가능자 순으로 3명 (로얄 2실 맡은 분·전날 한 분은 뒤로). 이름은 쉼표로.</p>' +
    '<label class="asg-prev" style="grid-template-columns:110px 1fr"><span>특화 가능자</span><input id="cfspec" value="' + esc(F.spec || '') + '" placeholder="비우면 누구나"></label>' +
    '<p class="note">23·24층 특화 객실은 여기 적은 분과 그 층 A·B키만 맡아요. 비워 두면 제한 없어요.</p></div>';
  if (F.err) h += '<p class="err">' + esc(F.err) + '</p>';
  h += '<div class="btn2"><button class="big-btn sec" data-as="cfx">취소</button><button class="big-btn" data-as="cfsave"' + (F.saving ? ' disabled' : '') + '>' + (F.saving ? '저장 중…' : '저장') + '</button></div>' +
    '<p style="text-align:center"><button class="sb-link" style="border:0;background:none;color:var(--muted);text-decoration:underline;font:600 13px inherit;cursor:pointer" data-as="cfdef">기본값(26.10~27.3 담당표)으로 되돌리기</button></p>' +
    (A.cfgDoc && A.cfgDoc.cfgBy ? '<p class="note" style="text-align:center">마지막 저장: ' + esc(A.cfgDoc.cfgBy) + '</p>' : '');
  return h;
}

// ---------- 📦 미정비 남기기
function carryOpen() {
  const q = {}; TYPE_ORDER.forEach(t => { q[t] = 0; }); A.carry.forEach(r => { const t = typeOf(r); q[t] = (q[t] || 0) + 1; });
  A.cq = q; A.cshort = []; A.view = 'carry'; draw(); const b = document.getElementById('asp'); if (b) b.scrollTop = 0;
}
function carryRead() { document.querySelectorAll('#asp [data-cq]').forEach(el => { A.cq[el.getAttribute('data-cq')] = Math.max(0, Math.floor(Number(el.value) || 0)); }); }
function carryHtml() {
  const esc = H.esc, all = A.data.rooms.filter(x => isTarget(x) && !blk(x.room)), cnt = {}, ok = {};
  all.forEach(x => { const t = typeOf(x.room); cnt[t] = (cnt[t] || 0) + 1; if (!carryBlock(x)) ok[t] = (ok[t] || 0) + 1; });
  const g = gapInfo(), sumQ = Object.values(A.cq).reduce((a, b) => a + (Number(b) || 0), 0);
  let h = '<div class="card"><h2>📦 미정비 남기기 <small>프런트와 협의한 타입별 수량</small></h2>' +
    '<p class="note" style="margin:0 0 8px">수량을 적고 <b>고르기</b>를 누르면 <b>저층부터</b> 골라요. 담당이 출근한 층은 조금 뒤로 미뤄요 (그분께 배정). 로얄·2901·VIP·테마·단체·시간 지정·당직·재실은 남기지 않아요.' +
    (g ? '<br>지금: 대상 <b>' + g.units + '유닛</b> / 인계 <b>' + g.ho + '유닛</b> → ' + (g.d > 0 ? '<b style="color:var(--warn)">' + g.d + ' 넘침</b>' : '넘침 없음') : '') + '</p>' +
    '<div class="cf-grid" style="grid-template-columns:auto 1fr auto"><b>타입</b><b>대상 (남길 수 있는 방)</b><b>남길 수량</b>';
  TYPE_ORDER.filter(t => cnt[t]).forEach(t => { const can = ok[t] || 0;
    h += '<span class="cf-f">' + t + '</span><span>' + esc(TYPE_NAME[t]) + ' ' + cnt[t] + '실 <small style="color:var(--muted)">(' + can + ')</small></span>' +
      (can ? '<span><input type="number" min="0" max="' + can + '" inputmode="numeric" style="width:64px" data-cq="' + t + '" value="' + (A.cq[t] || 0) + '"></span>' : '<span style="color:var(--muted)">-</span>'); });
  h += '</div><p class="note">입력 합계 ' + sumQ + '실</p>';
  if (A.cshort && A.cshort.length) h += '<p class="err">남길 수 있는 방이 모자라요: ' + esc(A.cshort.join(', ')) + '</p>';
  h += '<div class="btn2"><button class="big-btn sec" data-as="cqclear">모두 0</button><button class="big-btn" data-as="cqpick">고르기</button></div></div>';
  if (A.carry.size) {
    const by = {}; [...A.carry].sort((a, b) => a - b).forEach(r => { (by[typeOf(r)] = by[typeOf(r)] || []).push(r); });
    const fl = {}; A.carry.forEach(r => { const f = Math.floor(r / 100); fl[f] = (fl[f] || 0) + 1; });
    h += '<div class="card"><h2>남길 객실 ' + A.carry.size + '실 <small>누르면 빼기</small></h2>' +
      Object.keys(by).map(t => '<p style="margin:6px 0"><b>' + t + '</b> ' + by[t].map(r => '<button class="asg-chip" data-as="cqx" data-v="' + esc(r) + '">' + esc(r) + '</button>').join(' ') + '</p>').join('') +
      '<p class="note">층별: ' + Object.keys(fl).sort((a, b) => a - b).map(f => f + 'F ' + fl[f]).join(' · ') + '</p>' +
      '<p class="note">이대로 배정을 돌리면 이 객실은 빼고 배정해요. 엑셀을 받으면 이 객실 메모2에 <b>미정비</b>가 들어가요.</p></div>';
  }
  h += '<button class="big-btn" data-as="cqdone">' + (A.carry.size ? '✅ ' + A.carry.size + '실 남기고 돌아가기' : '돌아가기') + '</button>';
  return h;
}

// ---------- 🚧 장기 미정비 (보수 블럭) — blocks.js
const md2 = d => Number(d.slice(5, 7)) + '/' + Number(d.slice(8));
const dlab = d => { if (!d) return '?'; const w = '일월화수목금토'[new Date(d + 'T00:00:00').getDay()]; return Number(d.slice(5, 7)) + '월 ' + Number(d.slice(8)) + '일(' + w + ')'; };
const bcolor = b => COLORS[Math.abs([...String(b.id)].reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 7)) % COLORS.length];
function bkRead() {
  const B = A.bk; const m = document.getElementById('bkmsg'); if (m) B.msg = m.value;
  const d = document.getElementById('bkday'); if (d && d.value) B.day = d.value;
  document.querySelectorAll('#asp [data-bk]').forEach(el => { const [k, i] = el.getAttribute('data-bk').split(':'); const g = B.draft && B.draft[+i]; if (!g) return;
    if (k === 'name') g.name = el.value.trim(); if (k === 'from') g.from = el.value; if (k === 'to') g.to = el.value; if (k === 'prio') g.prio = el.checked; });
  document.querySelectorAll('#asp [data-bke]').forEach(el => { const [k, id] = el.getAttribute('data-bke').split(':'); const b = A.blocks.find(x => x.id === id); if (!b) return;
    if (!B.ed) B.ed = {}; const e = B.ed[id] = B.ed[id] || {}; if (k === 'prio') e.prio = el.checked; else e[k] = el.value; });
}
async function bkSave(list, msg) {
  const d = { list: prune(list, H.ymd()), at: H.S.SERVER_TIME, by: H.admin().label };
  A.bk.saving = true; draw();
  try { await H.S.set('meta/blocks', d); A.blocks = d.list; A.bk.ok = msg; A.bk.err = ''; } catch (e) { A.bk.err = '저장하지 못했어요: ' + (e && (e.code || e.message) || e); }
  A.bk.saving = false; bmapUpd(); A.res = null; A.cmp = null; draw();
}
function blocksHtml() {
  const esc = H.esc, B = A.bk, today = H.ymd();
  let h = '';
  if (B.ok) h += '<p class="okbox">' + esc(B.ok) + '</p>';
  if (B.err) h += '<p class="err">' + esc(B.err) + '</p>';
  // 1 메시지
  h += '<div class="card"><h2>📋 메시지로 넣기 <small>카톡·텔레그램 그대로</small></h2>' +
    '<textarea id="bkmsg" rows="6" style="width:100%;box-sizing:border-box;border:1.5px solid var(--line);border-radius:10px;padding:8px;font:15px inherit" placeholder="예)\n타일교체(10실)\n403, 517, 1003 …\n매지하자(4실)\n709, 1009 …\n8일자 미정비 남겨주세요.">' + esc(B.msg || '') + '</textarea>' +
    '<p class="note">작업명 줄 아래 객실 번호, 날짜(8일 · 11/16~11/30 · 16일부터 20일까지)를 알아서 읽어요. 읽은 뒤 확인하고 저장해요.</p>' +
    '<button class="big-btn" data-as="bkparse">메시지 읽기</button></div>';
  // 확인
  if (B.draft) {
    h += '<div class="card" id="bkdraft"><h2>확인 후 저장 <small>객실을 누르면 빼기</small></h2>';
    B.draft.forEach((g, i) => { const chk = g.want ? (g.want === g.rooms.length ? '<span style="color:var(--ok,#2B8A3E)">메시지 ' + g.want + '실 = 읽은 ' + g.rooms.length + '실 ✓</span>' : '<span style="color:var(--warn)">메시지 ' + g.want + '실 ≠ 읽은 ' + g.rooms.length + '실 — 확인해 주세요</span>') : '읽은 ' + g.rooms.length + '실';
      const dup = g.rooms.filter(r => A.blocks.some(b => b.rooms.includes(r) && b.from <= g.to && g.from <= b.to));
      h += '<div style="border-top:1px solid var(--line);padding:8px 0">' +
        '<label class="asg-prev" style="margin-top:0;grid-template-columns:70px 1fr"><span>작업명</span><input data-bk="name:' + i + '" value="' + esc(g.name) + '" placeholder="예: 타일교체"></label>' +
        '<div class="asg-chips" style="margin-top:8px">' + g.rooms.map(r => '<button class="asg-chip" data-as="bkdr" data-v="' + i + ':' + esc(r) + '">' + esc(r) + '</button>').join('') + '</div>' +
        '<p class="note" style="margin:0">' + chk + (g.bad.length ? ' · <span style="color:var(--warn)">없는 객실 번호: ' + esc(g.bad.join(', ')) + '</span>' : '') + (dup.length ? ' · 이미 다른 블럭: ' + esc(dup.join(', ')) : '') + '</p>' +
        '<div style="display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap"><input type="date" data-bk="from:' + i + '" value="' + esc(g.from) + '" style="min-height:40px"> ~ <input type="date" data-bk="to:' + i + '" value="' + esc(g.to) + '" style="min-height:40px">' +
        '<label style="font-weight:700;font-size:14px"><input type="checkbox" data-bk="prio:' + i + '"' + (g.prio ? ' checked' : '') + '> 끝난 다음 날 우선정비</label></div>' +
        '<p class="note" style="margin:4px 0 0">기간: <b>' + dlab(g.from) + (g.to !== g.from ? ' ~ ' + dlab(g.to) : '') + '</b>' + (g.from.slice(0, 7) !== today.slice(0, 7) ? ' <span style="color:var(--warn)">— 이번 달이 아니에요. 맞는지 확인해 주세요</span>' : g.to < today ? ' <span style="color:var(--warn)">— 지난 날짜예요</span>' : '') + '</p></div>'; });
    h += '<div class="btn2"><button class="big-btn sec" data-as="bkcancel">취소</button><button class="big-btn" data-as="bksave"' + (B.saving ? ' disabled' : '') + '>' + (B.saving ? '저장 중…' : '저장') + '</button></div></div>';
  }
  // 2 도면
  const on = blockedOn(A.blocks, B.day), act = [...new Set(Object.values(on))];
  const drs = new Set(); (B.draft || []).forEach(g => { if (g.from <= B.day && B.day <= g.to) g.rooms.forEach(r => drs.add(r)); });
  h += '<div class="card"><h2>🗺 도면 <small>' + dlab(B.day) + ' · 막힌 방 · 눌러서 고르기</small></h2>' +
    '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px"><input type="date" id="bkday" value="' + esc(B.day) + '" style="min-height:40px"><button class="asg-chip" data-as="bkdd" data-v="-1">◀</button><button class="asg-chip" data-as="bkdd" data-v="1">▶</button>' +
    '<span class="note" style="margin:0">' + (drs.size ? '<b style="color:var(--brand)">▨ 저장 전 ' + drs.size + '실</b> · ' : '') + (act.length ? act.map(b => '<i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:' + bcolor(b) + '"></i> ' + esc(b.name) + ' ' + b.rooms.length).join(' · ') : '이날 막힌 방 없음') + '</span></div>' +
    '<div class="bk-map" id="bkmap">';
  for (let f = 31; f >= 4; f--) {
    h += '<button class="bk-f" data-as="bkfl" data-v="' + f + '">' + f + '</button>';
    for (let s2 = 1; s2 <= 17; s2++) { const r = String(f * 100 + s2);
      if (!FLOORS[f].includes(s2)) { h += '<i></i>'; continue; }
      const b = on[r], sel = B.sel.has(r), dr = drs.has(r);
      h += '<button class="bk-c' + (sel ? ' sel' : '') + (dr ? ' dr' : '') + '" data-as="bkcell" data-v="' + r + '" title="' + r + (b ? ' ' + esc(b.name) : '') + '"' + (b ? ' style="background:' + bcolor(b) + ';color:#fff;border-color:' + bcolor(b) + '"' : '') + '>' + s2 + '</button>'; }
  }
  h += '</div><p class="note">층 번호를 누르면 그 층 전체. PC는 마우스로 끌어서 여러 방을 한 번에 골라요.</p>' +
    '<div class="btn2"><button class="big-btn sec" data-as="bkclr"' + (B.sel.size ? '' : ' disabled') + '>선택 지우기</button><button class="big-btn" data-as="bknew"' + (B.sel.size ? '' : ' disabled') + '>선택 ' + B.sel.size + '실로 새 블럭</button></div></div>';
  // 3 목록
  const list = A.blocks.filter(b => b.to >= today).sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.name < b.name ? -1 : 1));
  h += '<div class="card"><h2>목록 <small>지금·앞으로 ' + list.length + '건</small></h2>' + (list.length ? '' : '<p class="note">없어요.</p>') + '<div class="asg-list">' +
    list.map(b => { const op = B.open[b.id], live2 = b.from <= today;
      return '<button class="asg-m" data-as="bkopen" data-v="' + b.id + '"><span class="n"><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:' + bcolor(b) + '"></i> <b>' + esc(b.name) + '</b> <small>' + b.rooms.length + '실' + (b.prio ? ' · 끝나면 우선' : '') + '</small></span><span class="f">' + md2(b.from) + (b.to !== b.from ? '~' + md2(b.to) : '') + (live2 ? '<small>진행 중</small>' : '') + '</span></button>' +
        (op ? '<div class="asg-why"><div class="asg-chips">' + b.rooms.slice().sort((p, q) => p - q).map(r => '<button class="asg-chip" data-as="bkrm" data-v="' + b.id + ':' + r + '">' + r + '</button>').join('') + '</div>' +
          '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><input type="date" data-bke="from:' + b.id + '" value="' + b.from + '"> ~ <input type="date" data-bke="to:' + b.id + '" value="' + b.to + '"><label style="font-weight:700"><input type="checkbox" data-bke="prio:' + b.id + '"' + (b.prio ? ' checked' : '') + '> 끝나면 우선정비</label></div>' +
          '<div class="btn2" style="margin-top:8px"><button class="big-btn sec" data-as="bkdel" data-v="' + b.id + '">해제(삭제)</button><button class="big-btn" data-as="bkupd" data-v="' + b.id + '">날짜 저장</button></div>' +
          '<small>객실을 누르면 그 방만 먼저 해제 · 입력: ' + esc(b.by || '') + '</small></div>' : ''); }).join('') + '</div></div>';
  if (A.back !== 'close') h += '<button class="big-btn sec" data-as="bkback">← 자동 배정으로</button>';
  return h;
}
// PC 마우스로 끌어서 고르기 (휴대폰은 탭)
let bkDrag = null;
document.addEventListener('pointerdown', e => { if (!A || A.view !== 'blocks' || e.pointerType !== 'mouse') return; const c = e.target.closest && e.target.closest('#bkmap [data-as="bkcell"]'); if (!c) return;
  e.preventDefault(); bkRead(); const r = c.getAttribute('data-v'); bkDrag = { add: !A.bk.sel.has(r), moved: false, first: r }; });
document.addEventListener('pointerover', e => { if (!bkDrag || !A) return; const c = e.target.closest && e.target.closest('#bkmap [data-as="bkcell"]'); if (!c) return;
  const r = c.getAttribute('data-v'); if (!bkDrag.moved) { bkDrag.moved = true; bkDrag.add ? A.bk.sel.add(bkDrag.first) : A.bk.sel.delete(bkDrag.first); const f = document.querySelector('#bkmap [data-v="' + bkDrag.first + '"]'); if (f) f.classList.toggle('sel', bkDrag.add); }
  bkDrag.add ? A.bk.sel.add(r) : A.bk.sel.delete(r); c.classList.toggle('sel', bkDrag.add); });
document.addEventListener('change', e => { if (!A || A.view !== 'blocks' || !e.target || e.target.id !== 'bkday') return; bkRead(); draw(); });
document.addEventListener('pointerup', () => { if (!bkDrag || !A) return; const m = bkDrag.moved; bkDrag = null; if (m) { A.bk.skipClick = true; draw(); } });

// ---------- 그리기
function draw() {
  const box = document.getElementById('asp'); if (!box || !A) return;
  const esc = H.esc, y = box.scrollTop;
  let h = '<div class="vp-in"><div class="vp-head"><h2>🧩 자동 배정 <small style="font-size:13px;color:var(--muted);font-weight:600">' + (A.view === 'cfg' ? '담당표·정량' : A.view === 'blocks' ? '장기 미정비' : '시험 · 대조') + '</small></h2><button class="vp-x" data-as="' + (A.view === 'cfg' ? 'cfx' : 'close') + '" aria-label="닫기">✕</button></div>';
  if (A.view === 'cfg') { box.innerHTML = h + cfgHtml() + '</div>'; box.scrollTop = y; return; }
  if (A.view === 'carry') { box.innerHTML = h + carryHtml() + '</div>'; box.scrollTop = y; return; }
  if (A.view === 'carry2') { box.innerHTML = h + carry2Html() + '</div>'; box.scrollTop = y; return; }
  if (A.view === 'blocks') { box.innerHTML = h.replace('data-as="close"', 'data-as="' + (A.back === 'close' ? 'close' : 'bkback') + '"') + blocksHtml() + '</div>'; box.scrollTop = y; return; }
  if (A.saved) h += '<p class="okbox">' + esc(A.saved) + '</p>';
  h += '<div class="btn2" style="margin:0 0 12px"><button class="big-btn sec" data-as="cfg">⚙️ 담당표·정량</button><button class="big-btn sec" data-as="blocks">🚧 장기 미정비</button></div>';
  h += stepsHtml();
  // 1 날짜·파일
  const t0 = H.ymd(), t1 = H.addDays(t0, 1);
  h += '<div class="card"><h2>1 · 정비보고서</h2><div class="seg2">' + [[t0, '오늘'], [t1, '내일']].map(([d, l]) => '<button data-as="date" data-v="' + d + '" aria-pressed="' + (A.date === d) + '">' + l + ' ' + H.md(d) + '</button>').join('') + '</div>' +
    '<button class="big-btn' + (A.data && A.src === 'app' ? ' sec' : '') + '" style="margin-top:10px" data-as="app">📋 정비보고서 앱에서 불러오기' + (A.data && A.src === 'app' ? ' — 다시' : '') + '</button>' +
    '<button class="big-btn sec" style="margin-top:8px" data-as="pick">' + (A.data && A.src !== 'app' ? '📄 ' + esc(A.file) + ' — 다른 파일' : '엑셀 파일로 (예전 방식 · 비상용)') + '</button>';
  if (!A.data && !A.busy) h += '<p class="note">파일을 넣으면 아래에 <b>📦 미정비 남기기</b>(타입별 수량) 버튼이 생겨요. 장기 미정비(시설 작업)는 위 <b>🚧 장기 미정비</b>에서.</p>';
  if (A.busy) h += '<p class="note">' + esc(A.busy) + '</p>';
  if (A.err) h += '<p class="err" style="margin-top:10px">' + esc(A.err) + '</p>';
  if (A.data) {
    const T = A.data.rooms.filter(live), skip = A.data.rooms.filter(x => /미정비/.test((x.m1 || '') + (x.m2 || ''))).length, nc = A.carry ? A.carry.size : 0;
    const u = T.reduce((s, x) => s + (String(x.room) === '2901' ? 0 : unitOf(x)), 0), has2901 = T.some(x => String(x.room) === '2901');
    h += '<p class="note">' + esc(A.sheet) + '일 시트 · 정비 대상 <b>' + T.length + '실</b> = ' + u + '유닛' + (has2901 ? ' + 2901' : '') + (skip ? ' · 미정비(이월) ' + skip + '실 제외' : '') + (nc ? ' · <b>미정비 남기기 ' + nc + '실</b> 제외' : '') + '</p>';
    const bl = {}; A.data.rooms.filter(isTarget).forEach(x => { const b = blk(x.room); if (b) bl[b.name] = (bl[b.name] || 0) + 1; });
    const bn = Object.values(bl).reduce((a, b) => a + b, 0), pr = A.data.rooms.filter(x => isTarget(x) && A.bprio && A.bprio[String(x.room)]).length;
    if (bn) h += '<p class="note">🚧 장기 미정비 <b>' + bn + '실</b> 자동 제외 (' + esc(Object.keys(bl).map(k => k + ' ' + bl[k]).join(' · ')) + ')</p>';
    if (pr) h += '<p class="note">🔔 보수 끝 우선정비 <b>' + pr + '실</b> (14시까지)</p>';
    if (A.src === 'app') h += '<button class="big-btn sec" style="margin-top:8px" data-as="carry2">📦 미정비 남기기 (유닛 기준)' + (nc ? ' — ' + nc + '실 · ' + unitsOf(A.carry) + '유닛' : '') + '</button>';
    else if (!A.done) h += '<button class="big-btn sec" style="margin-top:8px" data-as="carry">📦 미정비 남기기 (타입별 수량)' + (nc ? ' — ' + nc + '실' : '') + '</button>';
    else h += '<button class="big-btn sec" style="margin-top:8px" disabled>📦 미정비 남기기 — 초안(이름 없는 파일)에서만</button>';
    if (A.src === 'app') h += asgdHtml();
    if (A.src === 'app') h += A.fromHk ? '<p class="okbox" style="margin-top:8px">출근자 · 유닛은 <b>HK 전파</b>(룸메이드 스케줄)에서 불러왔어요 → <b>' + A.fromHk.n + '명 · ' + A.fromHk.u + '유닛</b>. 아래 2번에서 −/+ 로 더하거나 빼요.</p>' : '<p class="err" style="margin-top:8px">' + esc(H.md(A.date)) + ' HK 전파가 아직 없어요 (소장 · 부소장님이 룸메이드 스케줄을 저장하면 들어와요) → 아래 2번 출근자 · 유닛을 인계표대로 맞춰 주세요.</p>';
    else if (A.done) h += '<p class="okbox" style="margin-top:8px">이름이 들어 있는 <b>완성본</b>이에요 → 이름은 빼고 엔진이 새로 배정한 뒤 <b>하우스키퍼 배정과 대조</b>해요. 출근자·유닛은 완성본 카드대로 채웠어요.</p>';
    else if (A.fromCards) h += '<p class="okbox" style="margin-top:8px">정비보고서 <b>출근 카드</b>의 유닛을 인계 유닛으로 읽었어요 → <b>' + A.fromCards.n + '명 · ' + A.fromCards.u + '유닛</b>. 아래 2번은 따로 고칠 필요 없어요 (바꿀 때만 −/+).</p>';
    else h += '<p class="err" style="margin-top:8px">출근 카드에 유닛이 없어요 → 아래 2번 출근자·유닛을 인계표대로 맞춰 주세요 (지난번 값으로 채워 둠).</p>';
  }
  h += '</div>';
  // 2 출근자
  if (A.data) {
    const on = A.rows.filter(r => r.on), sum = on.reduce((s, r) => s + Number(r.unit || 0), 0), q = quota();
    const list = A.showAll ? A.rows : A.rows.filter(r => r.on);
    h += '<div class="card"><h2>2 · 출근자 · 인계 유닛 <small>' + on.length + '명 · ' + sum + '유닛</small></h2>' +
      '<p class="note" style="margin:0 0 8px">관리자 인계표(RM 방배정표)대로 맞춰 주세요. 이름을 누르면 출근/휴무, 숫자는 인계 유닛이에요. 정량: 8 = 정규A 전환자, 7·4 = 신입.</p>' +
      '<div class="asg-rows">' + list.map(r => '<div class="asg-r' + (r.on ? '' : ' off') + '"><button data-as="tog" data-v="' + esc(r.name) + '">' + (r.on ? '✅ ' : '휴 ') + esc(r.name) + (q[r.name] != null ? '<small>정량 ' + q[r.name] + '</small>' : '') + (A.src === 'app' && A.od && A.od[r.name] && (A.od[r.name].o || A.od[r.name].d) ? '<small style="color:#6B7A90">이번 달 오버 ' + A.od[r.name].o + ' · 다운 ' + A.od[r.name].d + '</small>' : '') + '</button>' +
        (r.on ? '<span class="asg-u"><button data-as="u-" data-v="' + esc(r.name) + '">−</button><b>' + r.unit + '</b><button data-as="u+" data-v="' + esc(r.name) + '">+</button>' + (A.src === 'app' && A.hk0 && A.hk0[r.name] != null && A.hk0[r.name] !== Number(r.unit) ? '<small style="color:' + (Number(r.unit) > A.hk0[r.name] ? 'var(--warn)' : '#1E6FB8') + ';font-weight:800;margin-left:4px">' + (Number(r.unit) > A.hk0[r.name] ? '+' : '') + (Number(r.unit) - A.hk0[r.name]) + '</small>' : '') + '</span>' : '') + '</div>').join('') + '</div>' +
      '<div class="btn2"><button class="big-btn sec" data-as="all">' + (A.showAll ? '출근자만 보기' : '휴무자도 보기 (' + (A.rows.length - on.length) + ')') + '</button></div>' +
      (A.src === 'app' ? diffHtml() : '') +
      (() => { const g = gapInfo(); return A.src !== 'app' && g && g.over ? '<p class="err" style="margin-top:8px">⚠️ 정비 대상 <b>' + g.units + '유닛</b> / 인계 <b>' + g.ho + '유닛</b> → <b>' + g.over + '유닛 넘침</b> (한 분당 약 +' + g.per + '). 이월할 객실은 정비보고서 메모에 <b>미정비</b>를 적고 파일을 다시 넣어 주세요.</p>' : ''; })() +
      trHtml() +
      '<label class="asg-prev"><span>전날 2901</span><input id="asprev" value="' + esc(A.prev) + '" placeholder="예: 이분남, 강태금, 박순자"></label>' +
      '<p class="note" style="margin-top:0">전날 2901 한 분은 연속 배정을 피해요. 대조 기록을 저장하면 다음 날 자동으로 채워져요.</p>' +
      (A.ask ? askHtml() : '<button class="big-btn" style="margin-top:6px" data-as="run"' + (A.running || (A.src === 'app' && !gapOk() && !A.force) ? ' disabled' : '') + '>' + (A.running ? '배정 계산 중…' : '🧩 자동 배정') + '</button>' +
        (A.src === 'app' && !gapOk() && !A.force && !A.running ? '<p class="note" style="margin:4px 0 0">차이를 0 으로 맞추면 켜져요 · <button class="asg-chip" data-as="force">그래도 엔진이 나누게 하기</button></p>' : '')) +
      (A.running ? '<div class="bar" style="margin-top:10px"><i id="asprog" style="width:' + Math.round(A.prog * 100) + '%"></i></div><p class="note">휴대폰에선 30초~1분 걸릴 수 있어요. 화면을 켜 두세요.</p>' : '') + '</div>';
  }
  // 3 결과
  if (A.res) h += resultHtml();
  box.innerHTML = h + '</div>';
  box.scrollTop = y;
}
// VIP 2실 이상 · 단체가 8:2 넘는 분 — 손으로 옮긴 뒤에도 다시 셈 (11/14 규칙)
function mixNote() {
  const esc = H.esc, R = A.res, info = roomInfo(), gs = A.grpSet || new Set(), v2 = [], gh = [];
  Object.keys(R.workers).forEach(n => { const rs = R.workers[n].rooms.filter(r => r !== '2901');
    const v = rs.filter(r => info[r] && /VIP|르씨엘/i.test((info[r].m1 || '') + (info[r].m2 || ''))).length, g = rs.filter(r => gs.has(String(r))).length;
    if (v >= 2) v2.push(n + ' ' + v + '실');
    if (g >= 3 && rs.length - g < Math.ceil(rs.length * 0.2 - 1e-9)) gh.push(n + ' ' + g + ':' + (rs.length - g)); });
  const TH = new Set((A.data.themes || []).map(t => String(t.room))), pri = r => info[r] && (TH.has(String(r)) || /14시|VIP|르씨엘/i.test((info[r].m1 || '') + (info[r].m2 || '')));
  const rp = [], wb = [], WB = new Set(cfg().wallBed || DEF_CFG.wallBed || []);
  Object.keys(R.workers).forEach(n => { const rs = R.workers[n].rooms;
    if (rs.some(r => ROYAL.includes(r))) { const o = rs.filter(r => !ROYAL.includes(r) && pri(r)); if (o.length) rp.push(n + ' ' + o.join('·')); }
    const b = rs.filter(r => WB.has(String(r))); if (b.length >= 3) wb.push(n + ' ' + b.length + '실'); });
  const tm = (A.teams || []).filter(([a, b]) => R.workers[a] && R.workers[b]).map(([a, b]) => { const u = new Set([...R.workers[a].floors, ...R.workers[b].floors]); return { t: a + '·' + b + ' ' + [...u].sort((p, q) => q - p).join('·') + 'F', k: u.size }; });
  const extra = (rp.length ? '<br><span style="color:var(--warn)">로얄 + 다른 우선정비: ' + esc(rp.join(', ')) + '</span>' : '') +
    (wb.length ? '<br>벽배딩(23·24F 01~06) 3실 이상: ' + esc(wb.join(', ')) : '') +
    (tm.length ? '<br>2인 1조: ' + tm.map(x => x.k >= 3 ? '<span style="color:var(--warn)">' + esc(x.t) + '</span>' : esc(x.t)).join(', ') : '');
  const nw = (R.stats.vipNo || []).filter(n => R.workers[n] && R.workers[n].rooms.some(r => info[r] && /VIP|르씨엘/i.test((info[r].m1 || '') + (info[r].m2 || ''))));
  return (nw.length ? '<br><span style="color:var(--warn)">신입(3개월 미만)인데 VIP: ' + esc(nw.join(', ')) + '</span>' : '') +
    ((R.stats.vipNo || []).length ? '<br>VIP 빼는 신입: ' + esc(R.stats.vipNo.join(', ')) : '') +
    (v2.length ? '<br>VIP 2실 이상: ' + esc(v2.join(', ')) : '') + (gh.length ? '<br>단체 많음 (단체:일반): ' + esc(gh.join(', ')) + ' — 정비 지원 검토' : '') + extra;
}
function resultHtml() {
  const esc = H.esc, R = A.res, s = R.stats, C = A.cmp;
  let h = '<div class="card"><h2>3 · 배정안 <small>앱에는 아직 안 올라가요</small></h2>' +
    '<div class="kv"><div><b>' + s.left + '</b><span>미배정</span></div><div><b>' + s.avgFloors.toFixed(2) + '</b><span>평균 층 수</span></div><div><b>' + s.three.length + '</b><span>3개 층</span></div></div>' +
    '<p class="note">대상 ' + s.target + '실 = ' + s.units + '유닛 / 인계 ' + s.handover + '유닛 · 2901: <b>' + esc(s.plt.join(', ') || '없음') + '</b>' +
    (s.down.length ? '<br>유닛 다운: ' + esc(s.down.map(n => n + ' ' + R.workers[n].ho + '→' + R.workers[n].load).join(', ')) : '') +
    (s.up.length ? '<br>+1: ' + esc(s.up.map(n => n + ' ' + R.workers[n].ho + '→' + R.workers[n].load).join(', ')) : '') +
    (s.bMove && s.bMove.length ? '<br>B키 옮기기: ' + esc(s.bMove.map(m => m.b + ' ' + m.from.join('·') + 'F B ' + m.rooms.length + '실 → ' + m.a.join('·') + ((m.shared || []).length ? '(옆 분 ' + m.shared.length + '실)' : '') + ' / ' + m.b + ' 님은 ' + ((m.bFloors || []).length ? m.bFloors.join('·') + 'F' : m.to + 'F')).join(', ')) : '') +
    (s.three.length ? '<br>3개 층: ' + esc(s.three.join(', ')) : '') + mixNote() + (R.left.length ? '<br><span style="color:var(--warn)">미배정: ' + R.left.map(r => '<button class="asg-chip bad" data-as="room" data-v="' + esc(r) + '" data-f="(미배정)">' + esc(r) + '</button>').join(' ') + '</span>' : '') + '</p>' +
    (A.edits && A.edits.length ? '<p class="note">✏️ 고친 것 ' + A.edits.length + '건: ' + esc(A.edits.slice(-5).join(' / ')) + (A.edits.length > 5 ? ' …' : '') + '</p>' : '') +
    '<button class="big-btn sec" style="margin-top:8px" data-as="note">📝 배정 의견 남기기 (이 결과와 같이 저장)</button>' +
    (A.done ? '<p class="note">완성본으로 대조하는 중이라 앱에는 올리지 않아요. 초안을 넣으면 확정 버튼이 생겨요.</p>'
      : A.src === 'app' ? '<button class="big-btn" style="margin-top:10px" data-as="send">✅ 정비보고서에 넣기 <small style="font-weight:600">(휴대폰엔 아직 안 감)</small></button><p class="note">넣은 뒤 <b>정비보고서 격자에서 엑셀처럼</b> 고치세요 (담당 바꾸기 · 미정비 · 연박 · 방 빼기/더하기). 다 되면 위 「📱 메이드 휴대폰 보내기」.</p>'
      : '<button class="big-btn" style="margin-top:10px" data-as="send">✅ 확정 → 앱에 올리기 + 엑셀 받기</button>' +
        '<button class="big-btn sec" style="margin-top:8px" data-as="xlsx"' + (A.xbusy ? ' disabled' : '') + '>' + (A.xbusy ? '엑셀 만드는 중…' : '📄 정비보고서 엑셀만 받기 (오더테이커용)') + '</button>' +
        (A.xmsg ? '<p class="note">' + esc(A.xmsg) + '</p>' : '') +
        '<p class="note">메이드별 줄을 눌러 객실을 다른 분에게 옮길 수 있어요. 확정하면 메이드 휴대폰·더티 배분에 들어가고, 넣은 정비보고서 원본에 이름·출근 카드를 채운 엑셀이 내려받아져요 (서식·그림 그대로).</p>') + '</div>';
  h += forkHtml();
  if (C) {
    h += '<div class="card"><h2>하우스키퍼와 대조 <small>' + esc(H.md(A.date)) + '</small></h2>' +
      '<div class="kv"><div><b>' + C.pct + '%</b><span>같은 사람 (' + C.same + '/' + C.total + ')</span></div><div><b>' + C.hkAvg.toFixed(2) + ' / ' + s.avgFloors.toFixed(2) + '</b><span>평균 층 HK / 엔진</span></div><div><b>' + C.hkThree.length + ' / ' + s.three.length + '</b><span>3개 층 HK / 엔진</span></div></div>' +
      '<p class="note">기록이 저장됐어요 (2901 하우스키퍼 실제 → 다음 날 \'전날 2901\'). 지난 대조: ' + esc(((A.cfgDoc.log || []).slice(-6).map(x => H.md(x.date) + ' ' + x.pct + '%')).join(' · ')) + '</p></div>';
  }
  const names = Object.keys(R.workers).sort((a, b) => (R.workers[b].floors[0] || 0) - (R.workers[a].floors[0] || 0));
  h += '<div class="card"><h2>메이드별 <small>누르면 객실·이유</small></h2><div class="asg-list">' + names.map(n => {
    const w = R.workers[n], row = C ? C.rows.find(x => x.name === n) : null, op = A.open[n];
    const fl = w.floors.map(f => f + 'F').join('·');
    return '<button class="asg-m' + (w.floors.length >= 3 ? ' hot' : '') + '" data-as="open" data-v="' + esc(n) + '"><span class="n"><b>' + esc(n) + '</b> <small>' + w.ho + (w.load !== w.ho ? '→' + w.load : '') + '유닛</small></span>' +
      '<span class="f">' + esc(fl) + (row ? '<small>HK ' + esc(row.hkFloors.map(f => f + 'F').join('·') || '-') + ' · 같은 방 ' + row.same + '/' + row.hk + '</small>' : '') + '</span></button>' +
      (op ? '<div class="asg-why"><div class="asg-chips">' + w.rooms.slice().sort().map(r => '<button class="asg-chip' + (A.mv && A.mv.room === r && A.mv.from === n ? ' on' : '') + '" data-as="room" data-v="' + esc(r) + '" data-f="' + esc(n) + '">' + esc(r) + '</button>').join('') + '</div>' +
        (A.mv && A.mv.from === n ? moveHtml() : '') + '<small>' + esc(w.why.join(' / ')) + '</small></div>' : '');
  }).join('') + '</div></div>';
  if (A.mv && A.mv.from === '(미배정)') h = h.replace('<div class="card"><h2>메이드별', '<div class="card">' + moveHtml() + '</div><div class="card"><h2>메이드별');
  return h;
}
// 🔀 갈림길 (11/19 소장): B키 구역에 방이 1~3실만 남은 층 — 담당층 우선(B키가 자기 층) / 층 이동 효율 우선(A키가 다 받고 B키는 다른 층). 누르면 다시 계산
function forkHtml() {
  const esc = H.esc, F = (A.res.stats.forks || []); if (!F.length) return '';
  const fl = n => (A.res.workers[n] ? A.res.workers[n].floors.map(f => f + 'F').join('·') || '-' : '-');
  return '<div class="card"><h2>🔀 갈림길 ' + F.length + '곳 <small>사람이 골라 주세요</small></h2><p class="note" style="margin:0 0 8px">B키 구역에 방이 조금만 남은 층이에요. 고르면 그 기준으로 다시 계산해요 (30초~1분). 안 고르면 기본값(특화는 담당층, 일반 층은 A키가 다 받을 수 있을 때만 옮김).</p>' +
    F.map(k => { const cur = k.moved ? 'move' : 'keep';
      return '<div class="asg-fork" style="border-top:1px solid var(--line);padding:10px 0"><b>' + esc(k.floors.map(f => f + 'F').join('·')) + (k.spec ? ' 특화' : '') + '</b> · B구역 ' + k.n + '실 · B키 ' + esc(k.b) + ' / A키 ' + esc([...new Set(k.a)].join('·')) +
        '<br><small>지금 안: ' + (cur === 'keep' ? '담당층 우선' : '층 이동 효율 우선') + (k.choice ? ' (고름)' : ' (기본값)') + (k.choice === 'move' && !k.moved ? ' — 이 날은 A키에게 자리가 없어 못 옮겼어요' : '') + ' — ' + esc(k.b) + ' ' + esc(fl(k.b)) + ' / ' + esc([...new Set(k.a)].map(n => n + ' ' + fl(n)).join(' / ')) + '</small>' +
        '<div class="seg2" style="margin-top:6px"><button data-as="fork" data-v="' + esc(k.b) + '|keep" aria-pressed="' + (cur === 'keep') + '">담당층 우선</button><button data-as="fork" data-v="' + esc(k.b) + '|move" aria-pressed="' + (cur === 'move') + '">층 이동 효율 우선</button></div></div>'; }).join('') + '</div>';
}
function moveHtml() {
  const esc = H.esc, R = A.res, m = A.mv;
  const opts = Object.keys(R.workers).filter(n => n !== m.from).sort((a, b) => a.localeCompare(b, 'ko'));
  return '<div class="asg-mv"><b>' + esc(m.room) + '호</b>를 <select id="asto">' + opts.map(n => '<option value="' + esc(n) + '">' + esc(n) + ' (' + R.workers[n].load + '유닛 · ' + esc(R.workers[n].floors.map(f => f + 'F').join('·') || '-') + ')</option>').join('') + '</select>' +
    '<button class="big-btn" data-as="mvok">옮기기</button><button class="big-btn sec" data-as="mvx">취소</button></div>';
}

function bkClick(a, v) {
  const B = A.bk; bkRead(); B.ok = ''; B.err = '';
  if (a === 'bkback') { A.view = ''; draw(); return; }
  if (a === 'bkparse') { const g = parseMsg(B.msg, H.ymd()); if (!g.length) { B.err = '객실 번호를 찾지 못했어요.'; draw(); return; } B.draft = g; B.day = g[0].from; draw(); const d = document.getElementById('bkdraft'); if (d) d.scrollIntoView({ block: 'start' }); return; }
  if (a === 'bkdr') { const [i, r] = v.split(':'); const g = B.draft[+i]; g.rooms = g.rooms.filter(x => x !== r); draw(); return; }
  if (a === 'bkcancel') { B.draft = null; draw(); return; }
  if (a === 'bksave') { const gs = (B.draft || []).filter(g => g.rooms.length);
    for (const g of gs) { if (!g.name) { B.err = '작업명을 적어 주세요.'; draw(); return; } if (!g.from || !g.to || g.to < g.from) { B.err = g.name + ' 날짜를 확인해 주세요.'; draw(); return; } }
    const add = gs.map(g => ({ id: newId(), name: g.name, rooms: g.rooms.slice(), from: g.from, to: g.to, prio: !!g.prio, memo: '', by: H.admin().label }));
    B.draft = null; B.msg = ''; B.sel = new Set(); if (add.length) B.day = add[0].from; bkSave(A.blocks.concat(add), add.map(b => b.name + ' ' + b.rooms.length + '실 (' + md2(b.from) + (b.to !== b.from ? '~' + md2(b.to) : '') + ')').join(', ') + ' 저장했어요. 그 날짜 자동 배정에서 빠져요.'); return; }
  if (a === 'bkdd') { const d = new Date(B.day + 'T00:00:00'); d.setDate(d.getDate() + Number(v)); B.day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); draw(); return; }
  if (a === 'bkcell') { if (B.skipClick) { B.skipClick = false; return; } B.sel.has(v) ? B.sel.delete(v) : B.sel.add(v); draw(); return; }
  if (a === 'bkfl') { const rs = FLOORS[v].map(s2 => String(v * 100 + s2)); const all = rs.every(r => B.sel.has(r)); rs.forEach(r => (all ? B.sel.delete(r) : B.sel.add(r))); draw(); return; }
  if (a === 'bkclr') { B.sel = new Set(); draw(); return; }
  if (a === 'bknew') { B.draft = [{ name: '', rooms: [...B.sel].sort((p, q) => p - q), want: 0, bad: [], from: B.day, to: B.day, prio: false }]; draw(); const d = document.getElementById('bkdraft'); if (d) d.scrollIntoView({ block: 'start' }); return; }
  if (a === 'bkopen') { B.open[v] = !B.open[v]; draw(); return; }
  if (a === 'bkupd') { const b = A.blocks.find(x => x.id === v), e = (B.ed || {})[v] || {}; if (!b) return; const nb = Object.assign({}, b, e.from ? { from: e.from } : {}, e.to ? { to: e.to } : {}, 'prio' in e ? { prio: e.prio } : {});
    if (nb.to < nb.from) { B.err = '끝나는 날이 시작보다 빨라요.'; draw(); return; } delete B.ed[v];
    bkSave(A.blocks.map(x => (x.id === v ? nb : x)), nb.name + ' 날짜를 ' + md2(nb.from) + '~' + md2(nb.to) + '로 바꿨어요.'); return; }
  if (a === 'bkdel') { const b = A.blocks.find(x => x.id === v); if (!b || !confirm(b.name + ' ' + b.rooms.length + '실 블럭을 해제할까요? (자동 배정에 다시 들어가요)')) return; bkSave(A.blocks.filter(x => x.id !== v), b.name + ' 블럭을 해제했어요.'); return; }
  if (a === 'bkrm') { const [id, r] = v.split(':'); const b = A.blocks.find(x => x.id === id); if (!b || !confirm(r + '호만 먼저 해제할까요?')) return;
    const nb = Object.assign({}, b, { rooms: b.rooms.filter(x => x !== r) }); bkSave(nb.rooms.length ? A.blocks.map(x => (x.id === id ? nb : x)) : A.blocks.filter(x => x.id !== id), r + '호를 ' + b.name + '에서 뺐어요.'); return; }
}
document.addEventListener('click', e => {
  if (!A) return;
  const t = e.target.closest && e.target.closest('#asp [data-as]'); if (!t) return;
  const a = t.getAttribute('data-as'), v = t.getAttribute('data-v');
  const pv = document.getElementById('asprev'); if (pv) A.prev = pv.value;
  if (document.querySelector('#asp [data-tr]')) trRead();
  if (a === 'close') { close(); return; }
  A.saved = '';
  if (a === 'cfg') { cfgOpen(); return; }
  if (a === 'cfx') { A.view = ''; A.cf = null; draw(); return; }
  if (a === 'cfsave') { cfgSave(); return; }
  if (a === 'cfqadd') { cfgRead(); A.cf.quota.push({ name: '', v: 8 }); draw(); return; }
  if (a === 'cfqdel') { cfgRead(); A.cf.quota.splice(Number(v), 1); draw(); return; }
  if (a === 'cfdef') { if (!confirm('담당표·정량·로얄/2901 을 기본값(26.10~27.3 담당표)으로 되돌릴까요? 저장을 눌러야 바뀌어요.')) return;
    A.cf = { aKey: Object.assign({}, DEF_CFG.aKey), bKey: Object.assign({}, DEF_CFG.bKey), royal: DEF_CFG.royalOk.join(', '), blue: DEF_CFG.pltBlue.join(', '), spec: (DEF_CFG.specOk || []).join(', '), quota: Object.keys(DEF_CFG.quota).map(n => ({ name: n, v: DEF_CFG.quota[n] })), err: '', saving: false }; draw(); return; }
  if (a === 'pick') { A.src = ''; pick(); return; }
  if (a === 'app') { pickApp(); return; }
  if (a === 'force') { A.force = true; draw(); return; }
  if (a === 'sum') { copySum(); return; }
  if (a === 'unconf') { unconfirm(); return; }
  if (a === 'nsopen') { A.nsOpen = !A.nsOpen; draw(); return; }
  if (a === 'ns') { noShow(v); return; }
  if (a === 'askno') { A.ask = false; draw(); return; }
  if (a === 'askyes') { A.ask = false; run(true); return; }
  if (a === 'carry2') { c2Open(); return; }
  if (a && a.startsWith('c2')) { const gi = document.getElementById('c2goal'); if (gi) A.c2.goal = Math.max(0, Number(gi.value) || 0);
    if (a === 'c2c') { A.carry.has(v) ? A.carry.delete(v) : A.carry.add(v); }
    if (a === 'c2x') A.carry.delete(v);
    if (a === 'c2fl') { const rs = A.data.rooms.filter(x => x.floor === Number(v) && canCarry(x)).map(x => String(x.room)); const all = rs.length && rs.every(r => A.carry.has(r)); rs.forEach(r => (all ? A.carry.delete(r) : A.carry.add(r))); }
    if (a === 'c2eng') c2Engine();
    if (a === 'c2esc') { A.carry = new Set(A.c2.prev); A.view = ''; }
    if (a === 'c2done') A.view = '';
    A.res = null; A.cmp = null; draw(); return; }
  if (a === 'blocks') { A.view = 'blocks'; A.back = ''; A.bk.ok = ''; A.bk.day = A.date; draw(); const bx = document.getElementById('asp'); if (bx) bx.scrollTop = 0; return; }
  if (a && a.startsWith('bk')) { bkClick(a, v, t); return; }
  if (a === 'carry') { carryOpen(); return; }
  if (a === 'cqclear') { Object.keys(A.cq).forEach(t => { A.cq[t] = 0; }); A.carry = new Set(); A.cshort = []; A.res = null; A.cmp = null; draw(); return; }
  if (a === 'cqpick') { carryRead(); const r = carryPick(A.cq); A.carry = r.set; A.cshort = r.short; A.res = null; A.cmp = null; draw(); return; }
  if (a === 'cqx') { A.carry.delete(v); const t = typeOf(v); if (A.cq[t]) A.cq[t]--; A.res = null; A.cmp = null; draw(); return; }
  if (a === 'cqdone') { carryRead(); A.view = ''; draw(); return; }
  if (a === 'date') { if (A.date === v) return; A.date = v; A.tr = []; A.bChoice = {}; bmapUpd(); A.data = null; A.done = null; A.res = null; A.cmp = null; A.file = ''; draw(); return; }
  if (a === 'tog') { const r = A.rows.find(x => x.name === v); if (r) { r.on = !r.on; A.res = null; A.cmp = null; } draw(); return; }
  if (a === 'u-' || a === 'u+') { const r = A.rows.find(x => x.name === v); if (r) { r.unit = Math.max(1, Math.min(15, Number(r.unit) + (a === 'u+' ? 1 : -1))); A.res = null; A.cmp = null; } draw(); return; }
  if (a === 'all') { A.showAll = !A.showAll; draw(); return; }
  if (a === 'tradd') { A.tr.push({ name: '', n: 3, fl: '', max: 1 }); A.res = null; A.cmp = null; trRead(); draw(); return; }
  if (a === 'trdel') { A.tr.splice(Number(v), 1); A.res = null; A.cmp = null; trRead(); draw(); return; }
  if (a === 'run') { if (A.src === 'app') { A.ask = true; draw(); const el = document.getElementById('asgask'); if (el) el.scrollIntoView({ block: 'center' }); return; } run(); return; }
  if (a === 'open') { A.open[v] = !A.open[v]; draw(); return; }
  if (a === 'room') { const f = t.getAttribute('data-f'); A.mv = A.mv && A.mv.room === v && A.mv.from === f ? null : { room: v, from: f }; draw(); return; }
  if (a === 'mvx') { A.mv = null; draw(); return; }
  if (a === 'mvok') { const to = (document.getElementById('asto') || {}).value; if (A.mv) moveRoom(A.mv.room, A.mv.from, to); A.mv = null; draw(); return; }
  if (a === 'note') { openNote(); return; }
  if (a === 'fork') { const [b, ch] = String(v).split('|'); const k = ((A.res && A.res.stats.forks) || []).find(x => x.b === b); if (!k) return;
    if ((k.moved ? 'move' : 'keep') === ch) return;
    if (A.edits && A.edits.length && !confirm('손으로 고친 ' + A.edits.length + '건은 다시 계산하면 사라져요. 계속할까요?')) return;
    A.bChoice = Object.assign({}, A.bChoice || {}, { [b]: ch }); A.forkLog = (A.forkLog || []).concat([{ b, ch, floors: k.floors }]); run(true); return; }
  if (a === 'send') { confirmUpload(); return; }
  if (a === 'sendnow') { if (!confirm(H.md(A.date) + ' 배정을 메이드 휴대폰에 보낼까요?\n\n· 지금 정비보고서 격자 그대로 보내요\n· 정비 지원 더티 배분도 이 배정으로 불러와요')) return; sendJbr(H, A.date).then(() => close(), e => { A.err = '보내지 못했어요: ' + (e && e.message || e); draw(); }); return; }
  if (a === 'xlsx') { downXlsx(); return; }
});
