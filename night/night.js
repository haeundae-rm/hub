// hub/night/night.js — 🌙 야간 업무 보고서 (2026-11-18)
// 옛 엑셀 양식(야간업무보고서.xlsx)을 그대로 옮김: ① 요약(자동) ② 소모품 재고 ③ 린넨 수거 ④ 린넨 부족·캐처스 ⑤ 창고·사무실 ⑥ 정비보조 출근 ⑦ 기타
// 쓰는 사람: 하우스키퍼 공용 계정(작성·제출) · 소장/부소장(확인·고치기·기준) · 파트장(점검자 공용 계정, 확인만)
// 저장: night/{근무일자} 한 문서 (근무일자 = 야간 근무를 시작한 날, 보고일자 = 다음 날)
//       meta/night = 재고 품목·단위·부족/여유 기준 (소장·부소장이 화면에서 고침)
// 규칙(v15): 하우스키퍼는 확인이 하나라도 붙기 전까지만 고침. 확인은 자기 이름 칸만. 파트장 계정은 읽기 + 파트장 확인만
import * as S from '../../rm/app/store.js';

const VER = '2026.11.18-2';
// 하우스키퍼 공용 계정 UID — 계정을 만든 뒤 채움 (비어 있으면 이메일로 알아봄)
const HK_UID = 'nBL2QYezEmRNRmBRMXN6LNPJO2s2';
const ROLES = [
  { k: 'hk', label: '하우스키퍼', email: 'unieshaeundae+hk@gmail.com', uid: HK_UID },
  { k: 'boss', label: '소장', email: 'unieshaeundae+admin@gmail.com', uid: 'iw2orXgIgPgTbLUQa0b41XJ9Dvd2' },
  { k: 'boss', label: '부소장', email: 'unieshaeundae+sub@gmail.com', uid: 'Fz4T5ZzIxShOdVkNpF9gzMmOLED2' },
  { k: 'insp', label: '파트장', email: 'unieshaeundae+insp@gmail.com', uid: '4sVIUKcXtYg28Lm7Qw41UqI6hRX2' }
];
const OKS = ['파트장', '부소장', '소장'];   // 결재 칸 순서 (엑셀과 같음)
const DEF_ITEMS = [
  { name: '롤휴지', unit: 'PACK', low: 20, high: 50 }, { name: '갑티슈', unit: 'BOX', low: 10, high: 30 },
  { name: '특화갑티슈', unit: 'BOX', low: 10, high: 30 }, { name: '샴푸', unit: 'EA', low: 20, high: 60 },
  { name: '바디워시', unit: 'EA', low: 20, high: 60 }, { name: '액상 커피', unit: 'BOX', low: 8, high: 20 },
  { name: '비누', unit: 'BOX', low: 5, high: 15 }, { name: '생수', unit: 'EA', low: 2000, high: 4000 }
];
const LINEN = [['dirty', '오염 린넨 회수 → 1F'], ['waste', '폐기 린넨 회수 → B4']];
const STEPS = ['수량 체크', '사진 촬영', '임시 적재', '이동 완료'];
const ZONES = ['고층', '저층'];
const NOTE_ST = ['', '확인요망', '인계', '조치완료'];   // 엑셀 양식과 같은 상태
const noteSt = v => ({ '조치 필요': '확인요망', '완료': '조치완료' }[v] || v || '');

const $ = s => document.querySelector(s);
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const seoul = (t = Date.now()) => new Date(t + 9 * 3600e3);
const ymd = (t = Date.now()) => seoul(t).toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5); return x.toISOString().slice(0, 10); };
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const md = d => Number(d.slice(5, 7)) + '/' + Number(d.slice(8)) + '(' + DAYS[new Date(d + 'T00:00:00Z').getUTCDay()] + ')';
const hmOf = t => { if (!t) return ''; const d = seoul(Number(t)); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2); };
const num = v => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
const clone = o => JSON.parse(JSON.stringify(o));

// 지금 기본 근무일자: 오후 3시 전이면 어젯밤, 그 뒤면 오늘 밤
const defDate = () => (seoul().getUTCHours() < 15 ? addDays(ymd(), -1) : ymd());

let user = null, role = null, login = { who: 0, err: '', busy: false };
let date = '', doc = null, form = null, cfg = null, recent = [], names = [], rmAuto = null, prevDoc = null;
let busy = false, dirty = false, msg = '', editCfg = null;

function roleOf(u) {
  if (!u || u.anon) return null;
  return ROLES.filter(r => (r.uid && r.uid === u.uid) || (!r.uid && r.email === u.email))[0] || null;
}
const canEdit = () => role && (role.k === 'boss' || (role.k === 'hk' && !okCount(doc)));
const okCount = d => (d && d.ok ? OKS.filter(k => d.ok[k]).length : 0);
function toast(t) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 2600); }

// ---------- 빈 보고서 (전날 것에서 이름·보관 위치·창고 정리·정비보조 명단을 이어받음)
function blank(items, prev) {
  const p = prev || {};
  const stock = {};
  items.forEach(it => { const o = (p.stock || {})[it.name] || {}; stock[it.name] = { qty: null, place: o.place || '', memo: '' }; });
  return {
    main: p.main || '', sub: p.sub || '', rm: null,
    items: clone(items), stock,
    linen: { dirty: { zone: [], s: [false, false, false, false], memo: '' }, waste: { zone: [], s: [false, false, false, false], memo: '' } },
    short: [],
    clean: (p.clean && p.clean.length ? p.clean.map(c => ({ kind: c.kind, where: c.where, who: c.who, what: c.what })) : [{ kind: '창고 정리', where: '', who: '', what: '' }, { kind: '사무실 청소', where: '사무실', who: '', what: '' }]),
    sup: { hk: null, dirty: null, etc: null, names: (p.sup && p.sup.names) || '' },
    notes: [{ t: '', st: '' }],
    state: '작성중'
  };
}
function fromDoc(d) {
  const f = clone(d);
  ['date', 'rdate', 'by', 'uid', 'at', 'ver', 'ok', 'subAt'].forEach(k => delete f[k]);
  f.items = f.items && f.items.length ? f.items : clone(cfg.items);
  f.notes = f.notes && f.notes.length ? f.notes : [{ t: '', st: '' }];
  return f;
}
function status(it, qty) { if (qty == null) return ''; return qty <= it.low ? '부족' : qty >= it.high ? '여유' : '보통'; }
function summary(f) {
  const c = { 부족: 0, 보통: 0, 여유: 0 }, need = [];
  f.items.forEach(it => { const s = status(it, num((f.stock[it.name] || {}).qty)); if (s) c[s]++; if (s === '부족') need.push(it.name); });
  const ln = LINEN.reduce((n, [k]) => n + f.linen[k].s.filter(Boolean).length, 0);
  const supT = ['hk', 'dirty', 'etc'].reduce((n, k) => n + (num(f.sup[k]) || 0), 0);
  return { c, need, ln, supT };
}

// ---------- 읽기
const DKEY = d => 'night_draft_' + d;
function saveDraft() { try { localStorage.setItem(DKEY(date), JSON.stringify({ t: Date.now(), f: form })); } catch (e) {} }
function dropDraft() { try { localStorage.removeItem(DKEY(date)); } catch (e) {} }
function readDraft() { try { return JSON.parse(localStorage.getItem(DKEY(date)) || 'null'); } catch (e) { return null; } }

async function load(d) {
  date = d; busy = true; doc = null; form = null; rmAuto = null; msg = ''; dirty = false; draw();
  try {
    if (!cfg) {
      const c = await S.get('meta/night').catch(() => null);
      cfg = { items: c && Array.isArray(c.items) && c.items.length ? c.items : DEF_ITEMS };
    }
    const [dd, rec, day] = await Promise.all([
      S.get('night/' + d),
      S.getQuery('night', [['date', '>=', addDays(d, -20)]]).catch(() => []),
      S.get('days/' + addDays(d, 1)).catch(() => null)
    ]);
    recent = rec.map(x => x.data).filter(x => x && x.date).sort((a, b) => b.date.localeCompare(a.date));
    prevDoc = recent.filter(x => x.date < d)[0] || null;   // 지난 보고서 — 수량 칸에 흐리게 보여 줌
    rmAuto = day && Array.isArray(day.maids) ? day.maids.length : null;
    doc = dd;
    if (doc) form = fromDoc(doc);
    else {
      const prev = recent.filter(x => x.date < d)[0] || null;
      form = blank(cfg.items, prev);
      if (rmAuto != null) form.rm = rmAuto;
    }
    // 휴대폰에만 남은 작성분(저장 전에 화면이 닫힘)이 더 새것이면 이어서
    const dr = readDraft();
    if (dr && dr.f && canEdit() && (!doc || dr.t > (doc.at || 0))) { form = dr.f; dirty = true; msg = '저장하지 않은 작성분을 이어서 보여 드려요.'; }
    if (!names.length && role.k !== 'insp') {
      const st = await S.getQuery('staff', [['job', 'in', ['하우스키퍼', '오더테이커']]]).catch(() => []);
      names = st.map(x => x.data).filter(x => x && x.name && (x.status || '재직') !== '퇴사').map(x => x.name);
    }
  } catch (e) { msg = '읽지 못했어요: ' + (e && (e.code || e.message) || e); }
  busy = false; draw();
}

// ---------- 저장 · 제출 · 확인
async function save(submit) {
  if (!form || !canEdit()) return;
  if (submit) {
    const miss = [];
    if (!String(form.main).trim()) miss.push('작성자(메인)');
    if (form.items.some(it => num((form.stock[it.name] || {}).qty) == null)) miss.push('재고 수량');
    if (miss.length) { toast('빠진 칸: ' + miss.join(', ')); return; }
  }
  // 처음이면 문서를 통째로 만들고, 그 뒤엔 ok(확인)를 빼고 내용만 덮음 (규칙: 내용 고칠 때 확인 칸은 못 건드림)
  const out = Object.assign(clone(form), {
    date, rdate: addDays(date, 1), state: submit || form.state === '제출' ? '제출' : '작성중',
    by: role.label, uid: user.uid, at: S.SERVER_TIME, ver: VER
  });
  if (!doc) { out.ok = {}; out.subAt = submit ? S.SERVER_TIME : null; }
  else if (submit) out.subAt = S.SERVER_TIME;
  out.rm = num(out.rm);
  ['hk', 'dirty', 'etc'].forEach(k => { out.sup[k] = num(out.sup[k]); });
  form.items.forEach(it => { out.stock[it.name].qty = num(out.stock[it.name].qty); });
  out.notes = out.notes.filter(n => String(n.t).trim());
  out.short = out.short.filter(s => String(s.item).trim() || String(s.memo).trim());
  busy = true; draw();
  const slow = setTimeout(() => { if (busy) { busy = false; dirty = false; msg = '인터넷이 느려서 휴대폰에 먼저 보관했어요. 연결되면 자동으로 보내져요.'; draw(); } }, 8000);
  try {
    await (doc ? S.merge('night/' + date, out) : S.set('night/' + date, out));
    clearTimeout(slow); dropDraft();
    doc = await S.get('night/' + date).catch(() => doc) || doc;
    form = fromDoc(doc); dirty = false; msg = '';
    toast(submit ? '제출했어요. 허브 첫 화면에 「확인 대기」로 떠요.' : '저장했어요.');
  } catch (e) {
    clearTimeout(slow);
    msg = /permission/i.test(String(e && (e.code || e.message))) ? '저장할 수 없어요. 이미 확인이 시작된 보고서는 소장 · 부소장만 고칠 수 있어요.' : '저장하지 못했어요: ' + (e && (e.code || e.message) || e);
  }
  busy = false; draw();
}
async function confirmOk(k, on) {
  if (!doc) return;
  busy = true; draw();
  try {
    // 확인 = 내 칸에 시각 · 이름, 확인 풀기 = 내 칸을 비움(null)
    await S.merge('night/' + date, { ok: { [k]: on ? { at: S.SERVER_TIME, by: role.label } : null } });
    doc = await S.get('night/' + date); form = fromDoc(doc);
    toast(on ? k + ' 확인했어요' : k + ' 확인을 풀었어요');
  } catch (e) { toast('하지 못했어요: ' + (e && (e.code || e.message) || e)); }
  busy = false; draw();
}

// ---------- 화면
function loginHtml() {
  return '<div class="card"><h2>로그인</h2><div class="seg">' + ROLES.map((r, i) => '<button data-who="' + i + '" aria-pressed="' + (login.who === i) + '">' + r.label + '</button>').join('') + '</div>' +
    '<input class="t" id="pw" type="password" autocomplete="current-password" placeholder="비밀번호" style="background:#fff">' +
    (login.err ? '<p class="err">' + esc(login.err) + '</p>' : '') +
    '<button class="big" data-login="1" style="margin-top:10px"' + (login.busy ? ' disabled' : '') + '>' + (login.busy ? '확인 중…' : '들어가기') + '</button>' +
    '<p class="note">하우스키퍼는 하우스키퍼 계정, 파트장은 인스펙션(점검자) 계정 비밀번호예요.</p></div>';
}
function dateBar() {
  const st = doc ? (okCount(doc) === 3 ? '<span class="state ok">결재 끝</span>' : okCount(doc) ? '<span class="state ok">확인 ' + okCount(doc) + '/3</span>' : doc.state === '제출' ? '<span class="state sub">제출됨</span>' : '<span class="state">작성 중</span>') : '<span class="state">새로 쓰기</span>';
  return '<div class="card"><div class="datebar"><button data-day="-1" aria-label="전날">‹</button><div class="d"><b>' + md(date) + ' 밤 근무 ' + st + '</b><small>보고일자 ' + md(addDays(date, 1)) + ' 아침</small></div>' +
    '<button data-day="1" aria-label="다음 날"' + (date >= defDate() ? ' disabled' : '') + '>›</button></div></div>';
}
const inp = (path, v, o = {}) => '<input class="t' + (o.n ? ' n' : '') + '" data-f="' + path + '" value="' + esc(v == null ? '' : v) + '"' + (o.n ? ' inputmode="decimal"' : '') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + (o.list ? ' list="' + o.list + '"' : '') + (canEdit() ? '' : ' readonly') + '>';
function formHtml() {
  const f = form, s = summary(f), ro = !canEdit();
  let h = '';
  if (doc && okCount(doc) && role.k === 'hk') h += '<div class="lock">🔒 확인이 시작된 보고서라 고칠 수 없어요. 고칠 곳이 있으면 소장 · 부소장께 말씀해 주세요.</div>';
  // 결재
  h += '<div class="card"><h2>결재 <small>' + (doc && doc.subAt ? '제출 ' + hmOf(doc.subAt) + ' · ' + esc(doc.by) : '') + '</small></h2><div class="okbar">' + OKS.map(k => {
    const o = doc && doc.ok && doc.ok[k];
    const mine = role.label === k && doc && doc.state === '제출';
    return '<div' + (o ? ' class="on"' : '') + '><b>' + k + '</b>' + (o ? '<span>확인</span><br><small>' + hmOf(o.at) + '</small>' : '<small class="note">-</small>') +
      (mine && !o ? '<button data-ok="' + k + '">확인</button>' : '') +
      (o && role.k === 'boss' && role.label === k ? '<button data-unok="' + k + '" style="background:var(--tile);color:var(--ink)">풀기</button>' : '') + '</div>';
  }).join('') + '</div>' + (!doc || doc.state !== '제출' ? '<p class="note">제출된 뒤에 확인할 수 있어요.</p>' : '') + '</div>';
  // 기본
  h += '<div class="card"><div class="g2"><label class="f"><span>작성자(메인)</span>' + inp('main', f.main, { list: 'nl' }) + '</label><label class="f"><span>작성자(서브)</span>' + inp('sub', f.sub, { list: 'nl' }) + '</label>' +
    '<label class="f"><span>R/M 출근' + (rmAuto != null ? ' <small>(배정 ' + rmAuto + '명)</small>' : '') + '</span>' + inp('rm', f.rm, { n: 1 }) + '</label><label class="f"><span>정비보조</span><input class="t n" value="' + s.supT + '" readonly></label></div>' +
    '<datalist id="nl">' + names.map(n => '<option value="' + esc(n) + '">').join('') + '</datalist></div>';
  // ① 요약
  h += '<div class="card"><h2>① 야간 현황 요약 <small>자동</small></h2><div class="sum"><div class="bad"><b>' + s.c.부족 + '</b><span>재고 부족</span></div><div><b>' + s.c.보통 + '</b><span>보통</span></div><div><b>' + s.c.여유 + '</b><span>여유</span></div><div><b>' + s.ln + '/8</b><span>린넨 수거</span></div></div>' +
    '<div class="order' + (s.need.length ? ' bad' : '') + '">' + (s.need.length ? '발주 필요: ' + esc(s.need.join(', ')) : '이상 없음 · 발주 필요 품목 없어요') + '</div></div>';
  // ② 재고
  h += '<div class="card"><h2>② 소모품 재고 <small>수량만 넣으면 상태 자동</small></h2><div class="stk">' + f.items.map((it, i) => {
    const o = f.stock[it.name] || {}, st = status(it, num(o.qty));
    const pq = prevDoc && prevDoc.stock && prevDoc.stock[it.name] ? num(prevDoc.stock[it.name].qty) : null, pl = prevDoc ? (prevDoc.date === addDays(date, -1) ? '어제' : md(prevDoc.date)) : '';
    return (i ? '<hr>' : '') + '<div class="nm"><b>' + esc(it.name) + '</b><small>' + esc(it.unit) + ' · 부족 ≤' + it.low + ' · 여유 ≥' + it.high + '</small></div>' +
      inp('stock.' + it.name + '.qty', o.qty, { n: 1, ph: pq != null ? pl + ' ' + pq : '수량' }) + '<span class="st ' + st + '">' + (st || '-') + '</span>' +
      (pq != null && num(o.qty) != null ? '<div class="pv">' + pl + ' ' + pq + ' → ' + (num(o.qty) - pq === 0 ? '변동 없음' : (num(o.qty) > pq ? '+' : '−') + Math.abs(Math.round((num(o.qty) - pq) * 10) / 10)) + '</div>' : '') +
      '<div class="pl">' + inp('stock.' + it.name + '.place', o.place, { ph: '보관 위치 / 비고' }) + inp('stock.' + it.name + '.memo', o.memo, { ph: '발주 메모' }) + '</div>';
  }).join('') + '</div>' + (role.k === 'boss' ? '<button class="big sec" data-cfg="1" style="margin-top:10px">품목 · 기준 고치기</button>' : '') + '</div>';
  // ③ 린넨 수거
  h += '<div class="card"><h2>③ 린넨 수거 <small>단계마다 누르기</small></h2>' + LINEN.map(([k, t]) => {
    const L = f.linen[k];
    return '<div class="ln"><b>' + t + ' <span class="state' + (L.s.every(Boolean) ? ' sub' : '') + '">' + L.s.filter(Boolean).length + '/4</span></b>' +
      '<div class="chips">' + ZONES.map(z => '<button class="chip" data-zone="' + k + ':' + z + '" aria-pressed="' + (L.zone.indexOf(z) >= 0) + '"' + (ro ? ' disabled' : '') + '>' + z + '</button>').join('') + '</div>' +
      '<div class="steps">' + STEPS.map((x, j) => '<button data-step="' + k + ':' + j + '" aria-pressed="' + !!L.s[j] + '"' + (ro ? ' disabled' : '') + '>' + x + '</button>').join('') + '</div>' +
      inp('linen.' + k + '.memo', L.memo, { ph: '비고' }) + '</div>';
  }).join('') + '</div>';
  // ④ 린넨 부족 · 캐처스
  h += '<div class="card"><h2>④ 린넨 부족 · 캐처스 입고</h2><div class="rows">' + f.short.map((r, i) =>
    '<div class="r">' + (ro ? '' : '<button class="x" data-del="short:' + i + '" aria-label="지우기">✕</button>') + '<div class="g3"><label class="f"><span>부족 품목</span>' + inp('short.' + i + '.item', r.item) + '</label><label class="f"><span>수량</span>' + inp('short.' + i + '.qty', r.qty) + '</label><label class="f"><span>캐처스 추가 입고</span>' + inp('short.' + i + '.catchers', r.catchers) + '</label></div>' +
    '<label class="f" style="margin-top:6px"><span>특이사항</span>' + inp('short.' + i + '.memo', r.memo) + '</label></div>').join('') +
    (f.short.length ? '' : '<p class="note" style="margin:0 0 8px">없음</p>') + (ro ? '' : '<button class="add" data-add="short">＋ 부족 품목 추가</button>') + '</div></div>';
  // ⑤ 창고 · 사무실
  h += '<div class="card"><h2>⑤ 창고 정리 · 사무실 청소 <small>창고정리 일정표 참고</small></h2><div class="rows">' + f.clean.map((r, i) =>
    '<div class="r">' + (ro ? '' : '<button class="x" data-del="clean:' + i + '" aria-label="지우기">✕</button>') + '<div class="g3"><label class="f"><span>구분</span>' + inp('clean.' + i + '.kind', r.kind) + '</label><label class="f"><span>구역 · 위치</span>' + inp('clean.' + i + '.where', r.where) + '</label><label class="f"><span>작업자</span>' + inp('clean.' + i + '.who', r.who) + '</label></div>' +
    '<label class="f" style="margin-top:6px"><span>작업 내용</span>' + (ro ? '<textarea class="t" readonly>' + esc(r.what) + '</textarea>' : '<textarea class="t" rows="2" data-f="clean.' + i + '.what">' + esc(r.what) + '</textarea>') + '</label></div>').join('') +
    (ro ? '' : '<button class="add" data-add="clean">＋ 줄 추가</button>') + '</div></div>';
  // ⑥ 정비보조
  h += '<div class="card"><h2>⑥ 정비보조 출근</h2><div class="g3"><label class="f"><span>H/K 지원</span>' + inp('sup.hk', f.sup.hk, { n: 1 }) + '</label><label class="f"><span>더티</span>' + inp('sup.dirty', f.sup.dirty, { n: 1 }) + '</label><label class="f"><span>기타</span>' + inp('sup.etc', f.sup.etc, { n: 1 }) + '</label></div>' +
    '<label class="f" style="margin-top:6px"><span>출근자 명단 (계 ' + s.supT + '명)</span>' + inp('sup.names', f.sup.names, { ph: '이름, 이름, …' }) + '</label></div>';
  // ⑦ 기타
  h += '<div class="card"><h2>⑦ 기타 업무 및 특이사항 <small>조치 필요 건은 상태 표기</small></h2>' + f.notes.map((n, i) =>
    '<div class="nt"><b>' + (i + 1) + '</b>' + inp('notes.' + i + '.t', n.t) + '<select class="t" data-f="notes.' + i + '.st"' + (ro ? ' disabled' : '') + '>' + NOTE_ST.map(x => '<option' + (noteSt(n.st) === x ? ' selected' : '') + ' value="' + x + '">' + (x || '상태') + '</option>').join('') + '</select></div>').join('') +
    (ro ? '' : '<button class="add" data-add="notes">＋ 한 줄 추가</button>') + '<p class="note">※ 관리자분들께 상세 보고 후 퇴근 바랍니다.</p></div>';
  // 소장 · 부소장: 시험으로 쓴 보고서 등 지우기
  if (doc && role.k === 'boss') h += '<div class="card"><button class="big sec" data-delrep="1" style="color:var(--warn)">이 날 보고서 지우기</button><p class="note">시험으로 쓴 것처럼 필요 없는 보고서를 지워요. 지우면 되돌릴 수 없어요.</p></div>';
  // 지난 보고서
  h += '<div class="card"><h2>지난 보고서</h2><div class="list">' + (recent.length ? recent.slice(0, 14).map(r =>
    '<a href="#' + r.date + '"><span>' + md(r.date) + ' 밤 · ' + esc(r.main || '') + '</span><span class="state' + (okCount(r) === 3 ? ' ok' : r.state === '제출' ? ' sub' : '') + '">' + (okCount(r) === 3 ? '결재 끝' : okCount(r) ? '확인 ' + okCount(r) + '/3' : r.state === '제출' ? '제출됨' : '작성 중') + '</span></a>').join('') : '<p class="note" style="margin:0">아직 없어요.</p>') + '</div></div>';
  return h;
}
function cfgHtml() {
  return '<div class="card"><h2>품목 · 재고 기준 고치기</h2><p class="note" style="margin:0 0 8px">부족 ≤ 이 수량이면 「부족」, 여유 ≥ 이 수량이면 「여유」. 바꾸면 <b>다음 보고서부터</b> 적용돼요.</p>' +
    '<div class="cfg"><b class="note">품목</b><b class="note">단위</b><b class="note">부족 ≤</b><b class="note">여유 ≥</b><span></span></div>' +
    editCfg.map((it, i) => '<div class="cfg"><input class="t" data-c="' + i + '.name" value="' + esc(it.name) + '"><input class="t" data-c="' + i + '.unit" value="' + esc(it.unit) + '"><input class="t n" inputmode="numeric" data-c="' + i + '.low" value="' + esc(it.low) + '"><input class="t n" inputmode="numeric" data-c="' + i + '.high" value="' + esc(it.high) + '"><button class="chip" data-cdel="' + i + '" aria-label="지우기">✕</button></div>').join('') +
    '<button class="add" data-cadd="1">＋ 품목 추가</button><div class="g2" style="margin-top:10px"><button class="big sec" data-cfgx="1">취소</button><button class="big" data-cfgs="1">저장</button></div></div>';
}
function barHtml() {
  if (!form) return '';
  const ed = canEdit();
  return '<div class="bar"><div class="in"><span class="msg">' + esc(busy ? '저장 중…' : msg || (dirty ? '저장하지 않은 내용이 있어요' : doc ? '저장됨 · ' + hmOf(doc.at) + ' ' + esc(doc.by || '') : '')) + '</span>' +
    '<button class="save" data-print="1">🖨 인쇄</button>' +
    (ed ? '<button class="save" data-save="1"' + (busy ? ' disabled' : '') + '>저장</button>' : '') +
    (ed && (!doc || doc.state !== '제출') ? '<button class="go" data-submit="1"' + (busy ? ' disabled' : '') + '>제출</button>' : '') + '</div></div>';
}
// ---------- 인쇄: 옛 엑셀 양식(B~N 13칸, 같은 색 · 글꼴 크기 · 줄 높이)을 그대로 따라 그림
const XC = { navy: '#1F3864', gold: '#C8A96A', head: '#2E5C8A', lab: '#FAF6EE', labT: '#1F3864', yel: '#FFF9DB', item: '#EEF2F7', ink: '#1A1A1A', unit: '#5A6472',
  bad: ['#F8D3D8', '#9C1F2E'], mid: ['#FFF2CC', '#7F6000'], good: ['#DFF0E4', '#1F6F43'], prog: ['#FFDB70', '#8A5A00'], order: '#FDECEE' };
const ST_COL = { 부족: XC.bad, 보통: XC.mid, 여유: XC.good };
const NOTE_COL = { 확인요망: XC.bad, 인계: XC.mid, 조치완료: XC.good };
const K = 0.86;   // 엑셀 '한 페이지에 맞춤'과 같이 줄 높이 · 글자를 줄여 A4 한 장에
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const longDate = d => d.slice(0, 4) + '년 ' + Number(d.slice(5, 7)) + '월 ' + Number(d.slice(8)) + '일 (' + WD[new Date(d + 'T00:00:00Z').getUTCDay()] + ')';
const qtyFmt = v => { const n = num(v); return n == null ? '' : n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); };
function printHtml() {
  if (!form) return '';
  const f = form, s = summary(f), o = (doc && doc.ok) || {};
  // c(값, 칸 수, { bg, co, b(굵게), sz(pt), al, cls })
  const c = (v, n, x = {}) => '<td' + (n > 1 ? ' colspan="' + n + '"' : '') + ' style="' + (x.bg ? 'background:' + x.bg + ';' : '') + (x.co ? 'color:' + x.co + ';' : '') +
    'font-weight:' + (x.b === false ? 400 : 700) + ';font-size:' + (x.sz || 9.5) + 'pt;text-align:' + (x.al || 'center') + ';' + (x.st || '') + '">' + esc(v == null ? '' : v).replace(/\n/g, '<br>') + '</td>';
  const lab = (v, n) => c(v, n, { bg: XC.lab, co: XC.labT, sz: 9 });
  const hd = (v, n) => c(v, n, { bg: XC.head, co: '#fff', sz: 9 });
  const inp = (v, n, x = {}) => c(v, n, Object.assign({ bg: XC.yel, co: XC.ink, b: false }, x));
  const row = (h, cells) => '<tr style="height:' + (h * K).toFixed(2) + 'pt">' + cells + '</tr>';
  const gap = h => '<tr class="gap" style="height:' + (h * K).toFixed(2) + 'pt"><td colspan="13"></td></tr>';
  const sec = (t, sub) => '<tr class="sec" style="height:' + (18.75 * K).toFixed(2) + 'pt"><td colspan="13"><span style="font-size:' + (10.5 * K).toFixed(2) + 'pt">  ' + esc(t) + '</span><span class="sub" style="font-size:' + (8 * K).toFixed(2) + 'pt">' + esc(sub || '') + '</span></td></tr>';
  let h = '<div class="xl"><table><colgroup>' + Array.from({ length: 13 }, (_, i) => '<col style="width:' + (i === 12 ? 8.5 : 7.625) + '%">').join('') + '</colgroup>';
  // 머리: 로고 · 제목 · 결재
  h += '<tr class="gap" style="height:' + (31.5 * K).toFixed(2) + 'pt"><td colspan="13" style="text-align:left;vertical-align:bottom"><img src="./unies.png" alt="unies" style="height:' + (20 * K).toFixed(2) + 'pt"></td></tr>';
  const sign = k => { const x = o[k]; return x ? '확인<br><small>' + esc(hmOf(x.at)) + '</small>' : ''; };
  h += '<tr style="height:' + (16.5 * K).toFixed(2) + 'pt"><td colspan="7" rowspan="3" class="title">야간 업무 보고서</td>' + lab('파트장', 2) + lab('부소장', 2) + lab('현장소장', 2) + '</tr>';
  h += '<tr style="height:' + (16.5 * K).toFixed(2) + 'pt">' + ['파트장', '부소장', '소장'].map(k => '<td colspan="2" rowspan="2" class="sign">' + sign(k) + '</td>').join('') + '</tr><tr style="height:' + (16.5 * K).toFixed(2) + 'pt"></tr>';
  h += gap(4.5);
  h += row(19.5, lab('보고일자', 2) + c(longDate(addDays(date, 1)), 3, { co: XC.ink, sz: 10 }) + lab('근무일자(야간)', 2) + c(longDate(date), 3, { co: XC.ink, sz: 10 }) + lab('R/M 출근', 2) + inp(f.rm, 1, { b: true, sz: 10 }));
  h += row(19.5, lab('작성자(메인)', 2) + inp(f.main, 3, { b: true, sz: 10 }) + lab('작성자(서브)', 2) + inp(f.sub, 3, { b: true, sz: 10 }) + lab('정비보조', 2) + c(s.supT, 1, { co: XC.ink, sz: 10 }));
  h += gap(6.75);
  // ① 요약
  h += sec('① 야간 현황 요약', '자동 집계');
  h += row(21, c('재고 부족', 2, { bg: XC.bad[0], co: XC.bad[1], sz: 9 }) + c(s.c.부족, 1, { co: XC.bad[1], sz: 11 }) + c('보통', 2, { bg: XC.mid[0], co: XC.mid[1], sz: 9 }) + c(s.c.보통, 1, { co: XC.mid[1], sz: 11 }) +
    c('여유', 2, { bg: XC.good[0], co: XC.good[1], sz: 9 }) + c(s.c.여유, 1, { co: XC.good[1], sz: 11 }) + lab('린넨 수거', 2) + c(s.ln + ' / 8 단계', 2, { co: XC.labT, sz: 10 }));
  const ob = s.need.length ? XC.order : '';
  h += row(21, c('발주 필요', 2, ob ? { bg: XC.order, co: XC.bad[1], sz: 9 } : { bg: XC.lab, co: XC.labT, sz: 9 }) + c(s.need.length ? s.need.join('   ') : '이상 없음 — 발주 필요 품목 없습니다.', 11, { bg: ob, co: XC.bad[1], sz: 10, al: 'left' }));
  h += gap(6.75);
  // ② 재고
  h += sec('② 소모품 재고', '수량만 입력 → 상태 자동');
  h += row(19.5, hd('품목', 3) + hd('보유 수량', 2) + hd('단위', 1) + hd('보관 위치 / 비고', 4) + hd('상태', 1) + hd('발주 메모', 2));
  f.items.forEach(it => {
    const x = f.stock[it.name] || {}, st = status(it, num(x.qty)), low = st === '부족', sc = ST_COL[st];
    h += row(18.75, c(it.name, 3, low ? { bg: XC.bad[0], co: XC.bad[1] } : { bg: XC.item, co: XC.ink }) + inp(qtyFmt(x.qty), 2, low ? { bg: XC.bad[0], co: XC.bad[1], b: true, sz: 10 } : { b: true, sz: 10 }) +
      c(it.unit, 1, { co: XC.unit, b: false, sz: 8.5 }) + inp(x.place, 4, { al: 'left' }) + c(st, 1, sc ? { bg: sc[0], co: sc[1] } : {}) + inp(x.memo, 2, { al: 'left' }));
  });
  h += gap(6.75);
  // ③ 린넨
  h += sec('③ 린넨 수거', '각 단계 완료 시 선택');
  h += row(25.5, hd('구분', 3) + hd('구역', 2) + hd('수량\n체크', 1) + hd('사진\n촬영', 1) + hd('임시\n적재', 1) + hd('이동\n완료', 1) + hd('비고', 3) + hd('진행', 1));
  LINEN.map(([k, t]) => {
    const L = f.linen[k], n = L.s.filter(Boolean).length;
    h += row(19.5, c(t.replace('→', ' →  '), 3, { bg: XC.item, co: XC.ink, al: 'left' }) + inp(L.zone.length ? L.zone.join(' / ') : '고층 / 저층', 2) +
      L.s.map(b => (b ? c('완료', 1, { bg: XC.good[0], co: XC.good[1], sz: 9 }) : inp('', 1))).join('') + inp(L.memo, 3, { al: 'left' }) +
      c(n + '/4', 1, n < 4 ? { bg: XC.prog[0], co: XC.prog[1], sz: 9 } : { co: XC.labT, sz: 9 }));
  });
  h += gap(6.75);
  // ④ 린넨 부족 · 캐처스
  h += sec('④ 린넨 부족 · 캐처스 입고', '');
  h += row(19.5, hd('부족 품목', 4) + hd('수량', 2) + hd('캐처스 추가 입고', 3) + hd('특이사항', 4));
  (f.short.length ? f.short : [{ item: '', qty: '', catchers: '없음', memo: '' }]).forEach(r => {
    h += row(21.75, inp(r.item, 4, { al: 'left' }) + inp(r.qty, 2) + inp(r.catchers, 3, { b: true }) + inp(r.memo, 4, { al: 'left' }));
  });
  h += gap(6.75);
  // ⑤ 창고 · 사무실
  h += sec('⑤ 창고 정리 · 사무실 청소', '창고정리 일정표 참고');
  h += row(19.5, hd('구분', 2) + hd('구역 · 위치', 2) + hd('작업자', 2) + hd('작업 내용', 7));
  f.clean.forEach(r => { h += row(27, c(r.kind, 2, { bg: XC.item, co: XC.ink }) + inp(r.where, 2) + inp(r.who, 2) + inp(r.what, 7, { al: 'left' })); });
  h += gap(6.75);
  // ⑥ 정비보조
  h += sec('⑥ 정비보조 출근', '');
  h += row(19.5, hd('H/K 지원', 2) + hd('더티', 2) + hd('기타', 2) + hd('계', 2) + hd('출근자 명단', 5));
  h += row(24, inp(f.sup.hk, 2, { b: true, sz: 10 }) + inp(f.sup.dirty, 2, { b: true, sz: 10 }) + inp(f.sup.etc, 2, { b: true, sz: 10 }) + c(s.supT, 2, { bg: XC.item, co: XC.labT, sz: 11 }) + inp(f.sup.names, 5, { al: 'left' }));
  h += gap(6.75);
  // ⑦ 기타
  h += sec('⑦ 기타 업무 및 특이사항', '조치 필요 건은 상태 표기');
  h += row(19.5, hd('No', 1) + hd('내용', 10) + hd('상태', 1) + hd('확인', 1));
  const ns = f.notes.filter(n => String(n.t).trim());
  for (let i = 0; i < Math.max(8, ns.length); i++) {
    const n = ns[i] || { t: '', st: '' }, st = noteSt(n.st), nc = NOTE_COL[st];
    h += row(18.75, c(i + 1, 1, { bg: XC.item, co: XC.labT, sz: 9 }) + inp(n.t, 10, { al: 'left' }) + (nc ? c(st, 1, { bg: nc[0], co: nc[1], sz: 9 }) : inp(st, 1, { sz: 9 })) + inp('', 1));
  }
  h += '<tr style="height:' + (18 * K).toFixed(2) + 'pt"><td colspan="13" class="foot">※ 관리자분들께 상세 보고 후 퇴근 바랍니다.</td></tr>';
  return h + '</table></div>';
}
function draw() {
  $('#who').textContent = role ? role.label + ' · ' + VER : VER;
  if (user === null) return;
  if (!role) { $('#main').innerHTML = loginHtml(); $('#print').innerHTML = ''; old(); return; }
  if (editCfg) { $('#main').innerHTML = cfgHtml(); old(); return; }
  const y = window.scrollY;
  $('#main').innerHTML = dateBar() + (form ? formHtml() : '<div class="card"><p class="note" style="margin:0">' + esc(busy ? '읽는 중…' : msg) + '</p></div>') +
    '<div class="card" style="text-align:center"><button class="chip" data-logout="1" style="padding:0 16px">로그아웃</button></div>';
  old(); document.body.insertAdjacentHTML('beforeend', barHtml());
  $('#print').innerHTML = printHtml();
  window.scrollTo(0, y);
}
function old() { const b = document.querySelector('.bar'); if (b) b.remove(); }

// ---------- 입력 (다시 그리지 않고 값만 넣음 → 글자 칠 때 커서가 안 튐)
function setPath(path, v) {
  const ks = path.split('.'); let o = form;
  for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
  o[ks[ks.length - 1]] = v;
}
document.addEventListener('input', e => {
  const t = e.target;
  if (t.hasAttribute('data-c') && editCfg) { const [i, k] = t.getAttribute('data-c').split('.'); editCfg[i][k] = k === 'low' || k === 'high' ? num(t.value) : t.value; return; }
  if (t.id === 'pw') return;
  const p = t.getAttribute('data-f'); if (!p || !form || !canEdit()) return;
  setPath(p, t.value); dirty = true; msg = ''; saveDraft();
  // 숫자 칸이면 자동 칸만 고쳐 그림 (요약 · 상태 · 계)
  if (t.classList.contains('n') || t.tagName === 'SELECT') { clearTimeout(window.__nd); window.__nd = setTimeout(() => { const a = document.activeElement, ap = a && a.getAttribute('data-f'), pos = a && a.selectionStart; draw(); if (ap) { const n = document.querySelector('[data-f="' + ap + '"]'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (er) {} } } }, 400); }
  else { const m = document.querySelector('.bar .msg'); if (m) m.textContent = '저장하지 않은 내용이 있어요'; }
});
document.addEventListener('change', e => { if (e.target.tagName === 'SELECT' && e.target.getAttribute('data-f')) draw(); });
document.addEventListener('click', e => {
  const t = e.target.closest('button,a'); if (!t) return;
  if (t.hasAttribute('data-who')) { login.who = Number(t.getAttribute('data-who')); login.err = ''; draw(); return; }
  if (t.hasAttribute('data-login')) { doLogin(); return; }
  if (t.hasAttribute('data-logout')) { if (dirty && !confirm('저장하지 않은 내용이 있어요. 그래도 로그아웃할까요?')) return; S.signOut(); return; }
  if (t.hasAttribute('data-print')) { draw(); window.print(); return; }
  if (busy) return;
  if (t.hasAttribute('data-day')) { go(addDays(date, Number(t.getAttribute('data-day')))); return; }
  if (t.hasAttribute('data-save')) { save(false); return; }
  if (t.hasAttribute('data-submit')) { save(true); return; }
  if (t.hasAttribute('data-ok')) { if (dirty) { toast('먼저 저장해 주세요'); return; } confirmOk(t.getAttribute('data-ok'), true); return; }
  if (t.hasAttribute('data-unok')) { if (t.getAttribute('data-ask') !== '1') { t.setAttribute('data-ask', '1'); t.textContent = '한 번 더'; return; } confirmOk(t.getAttribute('data-unok'), false); return; }
  if (t.hasAttribute('data-delrep') && role && role.k === 'boss') {
    if (t.getAttribute('data-ask') !== '1') { t.setAttribute('data-ask', '1'); t.textContent = '한 번 더 누르면 지워요'; return; }
    busy = true; draw();
    S.del('night/' + date).then(() => { dropDraft(); toast(md(date) + ' 밤 보고서를 지웠어요'); busy = false; load(date); }, er => { busy = false; toast('지우지 못했어요: ' + (er && (er.code || er.message) || er)); draw(); });
    return;
  }
  if (!form) return;
  if (canEdit()) {
    if (t.hasAttribute('data-zone')) { const [k, z] = t.getAttribute('data-zone').split(':'), L = form.linen[k]; L.zone = L.zone.indexOf(z) >= 0 ? L.zone.filter(x => x !== z) : ZONES.filter(x => x === z || L.zone.indexOf(x) >= 0); dirty = true; saveDraft(); draw(); return; }
    if (t.hasAttribute('data-step')) { const [k, j] = t.getAttribute('data-step').split(':'); form.linen[k].s[j] = !form.linen[k].s[j]; dirty = true; saveDraft(); draw(); return; }
    if (t.hasAttribute('data-add')) { const k = t.getAttribute('data-add'); form[k].push(k === 'short' ? { item: '', qty: '', catchers: '', memo: '' } : k === 'clean' ? { kind: '', where: '', who: '', what: '' } : { t: '', st: '' }); dirty = true; saveDraft(); draw(); return; }
    if (t.hasAttribute('data-del')) { const [k, i] = t.getAttribute('data-del').split(':'); form[k].splice(Number(i), 1); dirty = true; saveDraft(); draw(); return; }
  }
  if (t.hasAttribute('data-cfg')) { editCfg = clone(cfg.items); draw(); window.scrollTo(0, 0); return; }
  if (t.hasAttribute('data-cfgx')) { editCfg = null; draw(); return; }
  if (t.hasAttribute('data-cadd')) { editCfg.push({ name: '', unit: 'EA', low: 0, high: 0 }); draw(); return; }
  if (t.hasAttribute('data-cdel')) { editCfg.splice(Number(t.getAttribute('data-cdel')), 1); draw(); return; }
  if (t.hasAttribute('data-cfgs')) { saveCfg(); return; }
});
async function saveCfg() {
  const items = editCfg.filter(it => String(it.name).trim()).map(it => ({ name: String(it.name).replace(/\./g, '').trim().slice(0, 30), unit: String(it.unit || '').trim().slice(0, 8), low: num(it.low) || 0, high: num(it.high) || 0 }));
  if (!items.length) { toast('품목이 하나는 있어야 해요'); return; }
  try {
    await S.set('meta/night', { items, by: role.label, at: S.SERVER_TIME });
    cfg = { items }; editCfg = null;
    // 아직 확인 전인 이 보고서에도 새 기준을 씀 (수량은 그대로)
    if (form && !okCount(doc)) { const st = form.stock; form.items = clone(items); items.forEach(it => { if (!st[it.name]) st[it.name] = { qty: null, place: '', memo: '' }; }); dirty = true; saveDraft(); }
    toast('기준을 저장했어요'); draw();
  } catch (e) { toast('저장하지 못했어요: ' + (e && (e.code || e.message) || e)); }
}
async function doLogin() {
  const pw = ($('#pw') || {}).value || '';
  if (!pw) { login.err = '비밀번호를 적어 주세요.'; draw(); return; }
  login.busy = true; login.err = ''; draw();
  try { await S.signInEmail(ROLES[login.who].email, pw); }
  catch (e) { login.err = /network|offline/i.test(String(e && (e.code || e.message))) ? '인터넷 연결을 확인해 주세요.' : '비밀번호가 맞지 않아요.'; }
  login.busy = false; draw();
}
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'pw') doLogin(); });
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

// 주소 #2026-11-17 = 그 날 밤 보고서
function hashDate() { const m = /^#(\d{4}-\d{2}-\d{2})$/.exec(location.hash); return m && m[1] <= defDate() ? m[1] : defDate(); }
function go(d) { if (dirty && !confirm('저장하지 않은 내용이 있어요. 다른 날로 갈까요? (휴대폰에는 남아 있어요)')) return; if (location.hash !== '#' + d) location.hash = d; else load(d); }
window.addEventListener('hashchange', () => { if (role) load(hashDate()); });

S.onUser(u => {
  user = u || false;
  role = roleOf(u);
  if (u && !u.anon && !role) login.err = '지금 로그인된 계정은 야간 보고서를 쓸 수 없어요. 아래에서 다시 들어가 주세요.';
  if (role) load(hashDate()); else draw();
});
window.__night = { ver: VER };
