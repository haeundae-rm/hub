// 📋 결산마감 특이사항 (2026-11-19) — 허브 '📊 결산' 안. 예전 엑셀 「OO월 해운대 결산마감 특이사항」(입퇴사현황 · 특이사항 · 설정)을 앱으로
//   · 특이사항 한 건 = close_items/{id}. 현장에서 생기는 대로 한 건씩 넣으면 월말 문서가 저절로 만들어짐
//     kind: once(한 번) · monthly(매월, 끝나는 달까지) · times(n회차, 소개비 3회 같은 것). 상태는 달마다 st['YYYY-MM'] = 요청 / 본사 전달 / 완료 / 보류
//     완료 안 된 달은 다음 달 목록에 '이월'로 따라옴 (최근 12개월까지) → 누락 방지
//   · 그 달 메모 = close_month/{YYYY-MM}: locked(마감) · hr{직원id:{reason,memo}}(퇴사사유·비고) · hrx[](명단에 없는 분 직접 추가)
//   · 입퇴사 현황 = 직원 명단 staff 에서 그 달 입사일 · 퇴사일인 분만 골라 읽음 (서류는 입퇴사 앱에 그대로)
//   · 보기 · 쓰기는 소장 · 부소장만 (규칙 v16 isBoss) + 화면 비밀번호. 하우스키퍼는 결산 버튼 자체가 안 보임
//   · 내려받기 = 엑셀(요약 · 입퇴사 현황 · 특이사항 3장) · PDF(A4 가로 인쇄 → 'PDF로 저장')
// 읽기 아끼기: 결산 화면을 열 때 한 번 (특이사항 전체 + 그 달 메모 + 그 달 입퇴사자), 저장하면 화면만 고침
export const TYPES = ['임금인상', '인센티브', '경조', '소개비', '프로모션', '특근', 'OT', '대체공휴일', '근태정정', '조퇴', '연차', '공상 처리', '서류', '안내', '기타'];
export const DEPTS = ['룸메이드', '정비보조', '미화', '하우스키퍼', '오더테이커', '하우스맨', '사우나', '유아이티(보조)', '전체', '기타'];
export const STATES = ['요청', '본사 전달', '완료', '보류'];
const TCOL = { 임금인상: '#1D4ED8', 인센티브: '#047857', 경조: '#7C3AED', 소개비: '#0E7490', 프로모션: '#B45309', 특근: '#9A3412', OT: '#9A3412', 대체공휴일: '#BE185D', 근태정정: '#4B5563', 조퇴: '#4B5563', 연차: '#0F766E', '공상 처리': '#B91C1C', 서류: '#4B5563', 안내: '#4B5563', 기타: '#4B5563' };
const SCOL = { 요청: '#B45309', '본사 전달': '#1D4ED8', 완료: '#047857', 보류: '#6B7280' };

// ---------- 계산 (화면 · 엑셀 · 시험에서 같이 씀)
export const ymAdd = (ym, n) => { const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
export const ymDiff = (a, b) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
export const ymLabel = ym => +ym.slice(5, 7) + '월';
/** 그 달에 이 항목이 있는가 (이월 빼고) */
export function activeIn(it, ym) {
  if (!it || it.del || !it.start || ym < it.start) return false;
  if (it.kind === 'monthly') return !it.end || ym <= it.end;
  if (it.kind === 'times') return ymDiff(it.start, ym) < Math.max(1, +it.n || 1);
  return ym === it.start;
}
export const stOf = (it, ym) => (it.st && it.st[ym]) || '요청';
/** 그 달 목록 = 그 달 몫 + 지난 12개월 중 완료 안 된 몫(이월). 줄 = { it, ym(어느 달 몫), carry, round('2/3') } */
export function rowsFor(items, M) {
  const out = [];
  items.forEach(it => {
    if (!it || it.del) return;
    for (let k = 12; k >= 1; k--) { const y = ymAdd(M, -k); if (activeIn(it, y) && stOf(it, y) !== '완료') out.push(row(it, y, true)); }
    if (activeIn(it, M)) out.push(row(it, M, false));
  });
  out.sort((a, b) => (a.carry === b.carry ? 0 : a.carry ? -1 : 1) || (a.ym < b.ym ? -1 : a.ym > b.ym ? 1 : 0) || String(a.it.at || '').localeCompare(String(b.it.at || '')) || (a.it.id < b.it.id ? -1 : 1));
  return out;
}
function row(it, ym, carry) {
  const round = it.kind === 'times' ? (ymDiff(it.start, ym) + 1) + '/' + Math.max(1, +it.n || 1) + '회차' : it.kind === 'monthly' ? '매월' : '';
  return { it, ym, carry, round, st: stOf(it, ym) };
}
export function summary(rows, hr) {
  const s = { n: rows.length, open: 0, carry: 0, amount: 0, ot: 0, days: 0, byType: {}, hin: 0, hout: 0, hrun: 0, dmiss: 0 };
  rows.forEach(r => {
    if (r.st !== '완료') s.open++;
    if (r.carry) s.carry++;
    s.amount += +r.it.amount || 0; s.ot += +r.it.ot || 0; s.days += +r.it.days || 0;
    const t = s.byType[r.it.type || '기타'] = s.byType[r.it.type || '기타'] || { n: 0, amount: 0 };
    t.n++; t.amount += +r.it.amount || 0;
  });
  (hr || []).forEach(p => { if (p.isIn) s.hin++; if (p.isOut) s.hout++; if (p.state === '입사 진행') s.hrun++; if (/^미비/.test(docCheck(p.docs))) s.dmiss++; });
  return s;
}
/** 직원 명단 → 그 달 입퇴사 줄 */
export function hrRows(staff, M, note, today) {
  const a = M + '-01', b = M + '-31', td = today || b, notes = (note && note.hr) || {}, out = [];
  staff.forEach(p => {
    const isIn = !!p.hired && p.hired >= a && p.hired <= b, isOut = !!p.left && p.left >= a && p.left <= b;
    if (!isIn && !isOut) return;
    const n = notes[p.id] || {};
    out.push({ id: p.id, dept: p.job || '', name: p.name || '', hired: p.hired || '', left: p.left || '', state: p.status === '퇴사' || (p.left && p.left < td) ? '퇴사' : (p.status || '재직'), isIn, isOut, reason: n.reason || '', memo: n.memo || '', docs: docsNorm(n.docs) || docsNorm(p.docs), docsSrc: n.docs ? '허브' : p.docs ? '입퇴사 앱' : '' });
  });
  ((note && note.hrx) || []).forEach((x, i) => {
    out.push(Object.assign({ id: 'x' + i, manual: true, docsSrc: x.docs ? '허브' : '', isIn: !!x.hired && x.hired >= a && x.hired <= b, isOut: !!x.left && x.left >= a && x.left <= b }, x, { docs: docsNorm(x.docs) }));
  });
  out.sort((x, y) => (x.dept || '').localeCompare(y.dept || '', 'ko') || (x.hired || x.left || '').localeCompare(y.hired || y.left || '') || (x.name || '').localeCompare(y.name || '', 'ko'));
  return out;
}
// ---------- 근속 도래 (3단계, 2026-11-19): 입사일로부터 1년 · 10년 되는 분 → 급여 인상 특이사항 (예전엔 손으로 적다 누락 · 미지급이 생김)
export const TENURE_YEARS = [1, 10];
/** 입사일 + n년 (2월 29일 입사는 평년엔 2월 28일) */
export function annivOf(hired, n) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hired || '')) return '';
  const y = +hired.slice(0, 4) + n, m = hired.slice(5, 7); let d = hired.slice(8, 10);
  if (m === '02' && d === '29' && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) d = '28';
  return y + '-' + m + '-' + d;
}
export const tenId = (staffId, n) => ('ten-' + staffId + '-' + n).slice(0, 40);
/** 그 달(M) 과 다음 달에 근속 n년이 되는 분 + 지난 3개월 중 특이사항에 안 넣은 분(놓침). done = 이미 넣었거나 '안 함' 한 특이사항 id 모음 */
export function tenureDue(staff, M, done) {
  const out = [], from = ymAdd(M, -3), next = ymAdd(M, 1), has = id => !!(done && (done.has ? done.has(id) : done[id]));
  (staff || []).forEach(p => {
    if (!p || !p.hired || p.status === '퇴사') return;
    TENURE_YEARS.forEach(n => {
      const day = annivOf(p.hired, n), ym = day.slice(0, 7);
      if (!day || ym < from || ym > next) return;
      if (p.left && p.left < day) return;                                    // 그날 전에 그만둠
      const id = tenId(p.id, n), added = has(id), skip = !!(done && !done.has && done[id] === 'skip');
      if (ym < M && added) return;                                          // 지난달 몫은 넣었으면 안 보임 (특이사항 쪽에서 이월로 챙김)
      out.push({ id, staffId: p.id, name: p.name || '', dept: p.job || '', hired: p.hired, n, day, ym, when: ym < M ? 'miss' : ym === M ? 'now' : 'next', added, skip });
    });
  });
  const ord = { miss: 0, now: 1, next: 2 };
  out.sort((a, b) => ord[a.when] - ord[b.when] || a.day.localeCompare(b.day) || a.name.localeCompare(b.name, 'ko'));
  return out;
}
// 서류 4종 (2단계, 2026-11-19): 입퇴사 앱 HrStaff 가 staff/{id}.docs = {c,a,i,b} (1 = 있음) 로 보냄. 허브에서 고치면 그 달 메모 hr[id].docs 가 우선
export const DOCS = [['c', '근로계약서'], ['a', '입사지원서'], ['i', '신분증 사본'], ['b', '통장 사본']];
// 값: 1 = 있음 · 0 = 없음 · 2 = 해당 없음(하도급 일용은 지원서·신분증·통장을 안 받음 — 미비로 안 셈)
const dv = v => (+v === 2 ? 2 : v ? 1 : 0);
const docsNorm = d => (d && typeof d === 'object' ? { c: dv(d.c), a: dv(d.a), i: dv(d.i), b: dv(d.b) } : null);
/** 표·파일에 쓰는 표시: ○ 있음 · - 해당 없음 · 빈칸 없음 */
export const docMark = v => (+v === 2 ? '-' : v ? '○' : '');
/** 서류 확인 글 (원래 엑셀 수식과 같게): 모름 '-' · 4종 다 '완비' · 아니면 '미비 : 빠진 것' */
export function docCheck(d) {
  if (!d) return '-';
  const miss = DOCS.filter(x => !d[x[0]]).map(x => x[1]);
  return miss.length ? '미비 : ' + miss.join(' ') : '완비';
}
const won = n => (+n ? (+n).toLocaleString('ko-KR') : '');
const md = d => (d ? +d.slice(5, 7) + '/' + +d.slice(8, 10) : '');

export function setupClosing(c) {
  const { S, esc, ymd, PIN } = c;
  const thisYm = () => ymd().slice(0, 7);
  const st = { ym: thisYm(), tenDone: {}, items: null, staff: null, notes: {}, err: '', busy: false, form: null, hrForm: null, msg: '', filter: 'all', loadedAt: 0 };
  const say = m => { st.msg = m; c.draw(); clearTimeout(say.t); say.t = setTimeout(() => { st.msg = ''; c.draw(); }, 3000); };
  const errTxt = e => String(e && (e.code || e.message) || e);

  async function load(force) {
    if (st.busy || (!force && st.items && Date.now() - st.loadedAt < 10 * 60000)) return;
    st.busy = true; st.err = ''; c.draw();
    try {
      const [xs, staff] = await Promise.all([S.getQuery('close_items', []), st.staff ? Promise.resolve(null) : S.getQuery('staff', [])]);
      st.tenDone = {}; xs.forEach(x => { if (/^ten-/.test(x.id)) st.tenDone[x.id] = x.data && x.data.del ? 'skip' : 1; });   // 근속: 넣었거나 '안 함'(del) 한 것
      st.items = xs.map(x => Object.assign({}, x.data, { id: x.id })).filter(x => !x.del);
      if (staff) st.staff = staff.map(x => Object.assign({}, x.data, { id: x.id }));
      st.loadedAt = Date.now();
      await loadNote(st.ym);
    } catch (e) { st.err = '결산 자료를 못 읽었어요: ' + errTxt(e); }
    st.busy = false; c.draw();
  }
  async function loadNote(ym) { if (st.notes[ym] !== undefined) return; try { st.notes[ym] = (await S.get('close_month/' + ym)) || {}; } catch (e) { st.notes[ym] = {}; st.err = '그 달 메모를 못 읽었어요: ' + errTxt(e); } }
  const note = () => st.notes[st.ym] || {};
  const locked = () => !!note().locked;
  const newId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // ---------- 화면
  function html() {
    if (!PIN.passed()) return '<div class="card"><h2>📋 결산마감 특이사항</h2><p class="note" style="margin:0 0 12px">금액 · 인사 내용이 있어 화면 비밀번호를 물어요.</p><button class="big-btn" data-cs="unlock">🔒 비밀번호 넣고 열기</button></div>';
    if (!st.items && !st.busy && !st.err) setTimeout(() => load(false), 0);
    const M = st.ym;
    let h = '<div class="card cs"><h2>📋 결산마감 특이사항 <button class="ref" data-cs="reload">' + (st.busy ? '읽는 중…' : '↻') + '</button></h2>' +
      '<div class="cl-ym"><button class="ref" data-cs="prev" aria-label="이전 달">‹</button><b>' + esc(M.replace('-', '년 ')) + '월' + (locked() ? ' 🔒' : '') + '</b><button class="ref" data-cs="next" aria-label="다음 달">›</button></div>';
    if (st.err) h += '<p class="err">' + esc(st.err) + '</p>';
    if (st.msg) h += '<p class="cs-msg">' + esc(st.msg) + '</p>';
    if (!st.items) return h + '<p class="note">읽는 중…</p></div>';
    const rows = rowsFor(st.items, M), hr = hrRows(st.staff || [], M, note(), ymd()), sm = summary(rows, hr);
    h += '<div class="cs-kpi"><div><b>' + sm.hin + '</b><span>당월 입사</span></div><div><b>' + sm.hout + '</b><span>당월 퇴사</span></div><div><b>' + sm.n + '</b><span>특이사항</span></div><div class="' + (sm.open ? 'hot' : '') + '"><b>' + sm.open + '</b><span>미완료' + (sm.carry ? '<br>이월 ' + sm.carry : '') + '</span></div><div class="wide"><b>' + (sm.amount ? won(sm.amount) + '원' : '-') + '</b><span>금액 합계' + (sm.dmiss ? ' · <b style="display:inline;font-size:inherit;color:#B91C1C">서류 미비 ' + sm.dmiss + '명</b>' : '') + (sm.ot ? ' · OT ' + sm.ot + '시간' : '') + (sm.days ? ' · 특근 ' + sm.days + '일' : '') + '</span></div></div>';
    h += '<div class="cl-acts"><button class="big-btn" data-cs="xlsx">⬇ 엑셀 받기</button><button class="big-btn sec" data-cs="pdf">📄 PDF · 인쇄</button></div>';
    if (st.form) return h + formHtml() + '</div>';
    if (st.hrForm) return h + hrFormHtml() + '</div>';
    // 특이사항
    const F = st.filter, shown = rows.filter(r => F === 'all' || (F === 'open' ? r.st !== '완료' : r.st === '완료'));
    h += '<div class="cs-head"><h3>특이사항 ' + rows.length + '건</h3><div class="cs-fil">' + [['all', '전체'], ['open', '미완료'], ['done', '완료']].map(o => '<button data-cs="filter" data-v="' + o[0] + '" aria-pressed="' + (F === o[0]) + '">' + o[1] + '</button>').join('') + '</div></div>';
    if (!locked()) h += '<button class="big-btn" data-cs="add">＋ 특이사항 추가</button>';
    h += shown.length ? '<ul class="cs-list">' + shown.map(rowHtml).join('') + '</ul>' : '<p class="note">' + (rows.length ? '해당하는 건이 없어요.' : '이 달 특이사항이 아직 없어요. 생길 때마다 한 건씩 넣어 두면 월말에 그대로 문서가 돼요.') + '</p>';
    // 근속 도래
    const ten = tenureDue(st.staff || [], M, st.tenDone);
    if (ten.length) {
      const lab = { miss: '놓침', now: ymLabel(M), next: '다음 달' };
      h += '<div class="cs-head"><h3>근속 도래 ' + ten.length + '명' + (ten.some(t => !t.added) ? ' · 남은 ' + ten.filter(t => !t.added).length : ' · 다 챙김') + '</h3></div><p class="note" style="margin:0 0 8px">입사일로부터 ' + TENURE_YEARS.join('년 · ') + '년이 되는 분이에요. 「특이사항에 넣기」를 누르면 임금인상 건으로 들어가요.</p><ul class="cs-list">' +
        ten.map(t => '<li class="cs-ten ' + t.when + (t.added ? ' added' : '') + '"><div><span class="cs-tag" style="--tc:' + (t.when === 'miss' ? '#B91C1C' : t.when === 'now' ? '#1D4ED8' : '#6B7280') + '">' + esc(lab[t.when]) + '</span><b>' + esc(t.name) + '</b> <small>' + esc(t.dept) + '</small>' +
          '<div class="cs-sub">근속 ' + t.n + '년 · ' + esc(md(t.day)) + ' (입사 ' + esc(t.hired) + ')</div></div>' +
          (t.added ? '<span class="cs-tdone' + (t.skip ? ' skip' : '') + '">' + (t.skip ? '안 함' : '넣음 ✓') + '</span>' : locked() && t.ym <= M ? '' : '<div class="cs-tbtn"><button class="ref" data-cs="tenadd" data-id="' + esc(t.id) + '">특이사항에 넣기</button><button class="ref" data-cs="tenskip" data-id="' + esc(t.id) + '">안 함</button></div>') + '</li>').join('') + '</ul>';
    }
    // 입퇴사
    h += '<div class="cs-head"><h3>입퇴사 현황 ' + hr.length + '명</h3></div><p class="note" style="margin:0 0 8px">직원 명단에서 이 달 입사일 · 퇴사일인 분을 자동으로 넣어요. 누르면 서류 4종 체크 · 퇴사사유 · 비고를 적을 수 있어요.</p>';
    h += hr.length ? '<ul class="cs-list">' + hr.map(p => '<li class="cs-hr"><button data-cs="hr" data-id="' + esc(p.id) + '"' + (locked() ? ' disabled' : '') + '><span class="cs-tag" style="--tc:' + (p.isOut ? '#B91C1C' : '#047857') + '">' + (p.isIn && p.isOut ? '입·퇴사' : p.isOut ? '퇴사' : '입사') + '</span><b>' + esc(p.name) + '</b> <small>' + esc(p.dept) + (p.manual ? ' · 직접 추가' : '') + '</small>' +
      '<div class="cs-sub">' + [p.hired ? '입사 ' + esc(md(p.hired)) : '', p.left ? '마지막 근로 ' + esc(md(p.left)) : '', esc(p.state), p.reason ? '사유: ' + esc(p.reason) : ''].filter(Boolean).join(' · ') + (p.memo ? '<br>' + esc(p.memo) : '') + '</div>' + docsLine(p) + '</button></li>').join('') + '</ul>' : '<p class="note">이 달 입사 · 퇴사한 분이 직원 명단에 없어요.</p>';
    if (!locked()) h += '<button class="big-btn sec" data-cs="hradd">＋ 명단에 없는 분 직접 추가</button>';
    // 마감
    h += '<div class="cs-lock">' + (locked() ? '<p class="note" style="margin:0 0 8px">🔒 ' + esc(ymLabel(M)) + ' 마감됨 · 내용은 고정, 처리 상태(본사 전달 · 완료)만 바꿀 수 있어요. 새로 생긴 건은 다음 달로 넣어 주세요.</p><button class="ref" data-cs="unlockm">마감 풀기</button>'
      : '<button class="big-btn sec" data-cs="lockm">🔒 ' + esc(ymLabel(M)) + ' 마감하기</button><p class="note">마감하면 이 달 내용이 고정돼요. 완료 안 된 건은 다음 달에 이월로 계속 보여요.</p>') + '</div>';
    return h + '</div>';
  }
  function rowHtml(r) {
    const it = r.it, tc = TCOL[it.type] || '#4B5563', nums = [it.ot ? 'OT ' + it.ot + '시간' : '', it.days ? '특근 ' + it.days + '일' : '', it.amount ? won(it.amount) + '원' : ''].filter(Boolean).join(' · ');
    return '<li class="cs-it' + (r.st === '완료' ? ' done' : '') + '"><div class="cs-top"><span class="cs-tag" style="--tc:' + tc + '">' + esc(it.type || '기타') + '</span>' + (r.carry ? '<span class="cs-carry">' + esc(ymLabel(r.ym)) + ' 이월</span>' : '') + (r.round ? '<span class="cs-round">' + esc(r.round) + '</span>' : '') +
      '<select class="cs-st" data-cs="st" data-id="' + esc(it.id) + '" data-ym="' + esc(r.ym) + '" style="--sc:' + SCOL[r.st] + '">' + STATES.map(s => '<option' + (s === r.st ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div>' +
      '<button class="cs-body" data-cs="edit" data-id="' + esc(it.id) + '"><b>' + esc(it.name || '') + '</b> <small>' + esc(it.dept || '') + '</small><div>' + esc(it.text || '') + '</div>' +
      (nums || it.memo || (it.docs && it.docs.length) ? '<div class="cs-sub">' + esc(nums) + (it.docs && it.docs.length ? (nums ? ' · ' : '') + '📎 ' + esc(it.docs.join(', ')) : '') + (it.memo ? (nums || (it.docs && it.docs.length) ? ' · ' : '') + esc(it.memo) : '') + '</div>' : '') + '</button></li>';
  }
  function formHtml() {
    const f = st.form, names = (st.staff || []).filter(p => p.status !== '퇴사' || (p.left && p.left >= ymAdd(st.ym, -3) + '-01')).map(p => p.name).filter(Boolean);
    const sel = (k, list) => '<select data-csf="' + k + '">' + list.map(x => '<option' + (x === f[k] ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select>';
    return '<div class="cs-form"><h3>' + (f.id ? '특이사항 고치기' : '특이사항 추가') + '</h3>' +
      '<label>대상자<input data-csf="name" list="cs-names" maxlength="40" value="' + esc(f.name) + '" placeholder="이름 (여러 명은 / 로) · 전 근무자"><datalist id="cs-names">' + Array.from(new Set(names)).sort().map(n => '<option value="' + esc(n) + '">').join('') + '</datalist></label>' +
      '<div class="cs-2"><label>부서' + sel('dept', DEPTS) + '</label><label>유형' + sel('type', TYPES) + '</label></div>' +
      '<label>내용<textarea data-csf="text" rows="3" maxlength="400" placeholder="예: 10년 도래 임금 인상 적용 필요 (8월 누락분 지급 요망)">' + esc(f.text) + '</textarea></label>' +
      '<div class="cs-3"><label>OT(시간)<input data-csf="ot" inputmode="decimal" value="' + esc(f.ot) + '"></label><label>특근(일)<input data-csf="days" inputmode="decimal" value="' + esc(f.days) + '"></label><label>금액(원)<input data-csf="amount" inputmode="numeric" value="' + esc(f.amount) + '"></label></div>' +
      '<div class="cs-seg">' + [['once', '이번 한 번'], ['times', '회차 (나눠서)'], ['monthly', '매월 반복']].map(o => '<button data-cs="kind" data-v="' + o[0] + '" aria-pressed="' + (f.kind === o[0]) + '">' + o[1] + '</button>').join('') + '</div>' +
      '<div class="cs-2"><label>' + (f.kind === 'once' ? '적용 월' : '시작 월') + '<input type="month" data-csf="start" value="' + esc(f.start) + '"></label>' +
      (f.kind === 'times' ? '<label>몇 회<input data-csf="n" inputmode="numeric" value="' + esc(f.n) + '"></label>' : f.kind === 'monthly' ? '<label>끝나는 월 (비우면 계속)<input type="month" data-csf="end" value="' + esc(f.end) + '"></label>' : '') + '</div>' +
      '<label>동봉 서류 <small>(쉼표로)</small><input data-csf="docs" maxlength="120" value="' + esc(f.docs) + '" placeholder="예: 가족관계증명서, 청첩장"></label>' +
      '<label>비고<input data-csf="memo" maxlength="120" value="' + esc(f.memo) + '" placeholder="예: 상시 적용 · 2015년 8월 1일 입사"></label>' +
      (f.err ? '<p class="err">' + esc(f.err) + '</p>' : '') +
      '<div class="cl-acts"><button class="big-btn" data-cs="save"' + (f.saving ? ' disabled' : '') + '>' + (f.saving ? '저장 중…' : '저장') + '</button><button class="big-btn sec" data-cs="cancel">취소</button></div>' +
      (f.id ? '<p style="text-align:center;margin:12px 0 0">' + (f.kind === 'monthly' && !f.end0 ? '<button class="ref" data-cs="stop">이번 달까지만 (반복 끝내기)</button> ' : '') + '<button class="ref cs-del" data-cs="del">지우기</button></p>' : '') + '</div>';
  }
  function docsLine(p) {
    const ck = docCheck(p.docs);
    return '<div class="cs-docs">' + DOCS.map(x => '<i class="' + (p.docs && p.docs[x[0]] ? 'on' : '') + '"' + (p.docs && p.docs[x[0]] === 2 ? ' title="해당 없음"' : '') + '>' + (p.docs ? (p.docs[x[0]] === 2 ? '- ' : p.docs[x[0]] ? '○ ' : '× ') : '') + esc(x[1].replace(' 사본', '')) + '</i>').join('') +
      '<b class="' + (ck === '완비' ? 'ok' : ck === '-' ? 'unk' : 'bad') + '">' + (ck === '-' ? '서류 정보 없음' : esc(ck.replace(' : ', ': '))) + '</b></div>';
  }
  function hrFormHtml() {
    const f = st.hrForm;
    return '<div class="cs-form"><h3>' + (f.manual ? (f.idx >= 0 ? '직접 추가한 분 고치기' : '명단에 없는 분 직접 추가') : esc(f.name) + ' 님') + '</h3>' +
      (f.manual ? '<label>성명<input data-csh="name" maxlength="20" value="' + esc(f.name) + '"></label><div class="cs-2"><label>부서<select data-csh="dept">' + DEPTS.map(x => '<option' + (x === f.dept ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select></label><label>근로 여부<select data-csh="state">' + ['재직', '퇴사', '입사 진행'].map(x => '<option' + (x === f.state ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label></div>' +
        '<div class="cs-2"><label>입사일<input type="date" data-csh="hired" value="' + esc(f.hired) + '"></label><label>마지막 근로일<input type="date" data-csh="left" value="' + esc(f.left) + '"></label></div>'
        : '<p class="note" style="margin:0 0 8px">' + esc(f.dept) + ' · 입사 ' + esc(f.hired || '-') + (f.left ? ' · 마지막 근로 ' + esc(f.left) : '') + '<br>이름 · 날짜는 입퇴사 앱 · 직원 명단에서 고쳐요.</p>') +
      '<div class="cs-dform"><span>서류 확인' + (f.docsSrc && !f.docsTouched ? ' <small>(' + esc(f.docsSrc) + ' 기준)</small>' : '') + ' <small>누를 때마다 ○ 있음 → - 해당 없음 → 없음</small></span><div>' + DOCS.map(x => '<button data-cs="doc" data-v="' + x[0] + '" aria-pressed="' + !!(f.docs && f.docs[x[0]]) + '">' + (f.docs && f.docs[x[0]] === 2 ? '- ' : f.docs && f.docs[x[0]] ? '○ ' : '') + esc(x[1]) + (f.docs && f.docs[x[0]] === 2 ? ' <small>해당 없음</small>' : '') + '</button>').join('') + '</div></div>' +
      '<label>퇴사사유<input data-csh="reason" maxlength="60" value="' + esc(f.reason) + '" placeholder="예: 개인사유"></label>' +
      '<label>비고<input data-csh="memo" maxlength="120" value="' + esc(f.memo) + '" placeholder="예: 경력수당 적용 · 지난달 누락분 지급 필요"></label>' +
      (f.err ? '<p class="err">' + esc(f.err) + '</p>' : '') +
      '<div class="cl-acts"><button class="big-btn" data-cs="hrsave"' + (f.saving ? ' disabled' : '') + '>' + (f.saving ? '저장 중…' : '저장') + '</button><button class="big-btn sec" data-cs="cancel">취소</button></div>' +
      (f.manual && f.idx >= 0 ? '<p style="text-align:center;margin:12px 0 0"><button class="ref cs-del" data-cs="hrdel">지우기</button></p>' : '') + '</div>';
  }

  // ---------- 저장
  function openForm(it) {
    st.form = it ? { id: it.id, name: it.name || '', dept: it.dept || DEPTS[0], type: it.type || TYPES[0], text: it.text || '', ot: it.ot || '', days: it.days || '', amount: it.amount || '', kind: it.kind || 'once', start: it.start || st.ym, end: it.end || '', end0: it.end || '', n: it.n || 3, docs: (it.docs || []).join(', '), memo: it.memo || '', err: '' }
      : { id: '', name: '', dept: DEPTS[0], type: TYPES[0], text: '', ot: '', days: '', amount: '', kind: 'once', start: st.ym, end: '', n: 3, docs: '', memo: '', err: '' };
    c.draw(); window.scrollTo(0, 0);
  }
  const numOr0 = v => { const n = Number(String(v || '').replace(/[,\s원]/g, '')); return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0; };
  async function saveForm() {
    const f = st.form; if (!f || f.saving) return;
    const name = String(f.name || '').trim(), text = String(f.text || '').trim();
    if (!name) { f.err = '대상자를 넣어 주세요. (여러 명은 / 로, 전체면 "전 근무자")'; c.draw(); return; }
    if (!text) { f.err = '내용을 넣어 주세요.'; c.draw(); return; }
    if (!/^\d{4}-\d{2}$/.test(f.start)) { f.err = '월을 골라 주세요.'; c.draw(); return; }
    if (f.kind === 'monthly' && f.end && f.end < f.start) { f.err = '끝나는 월이 시작 월보다 빨라요.'; c.draw(); return; }
    const n = Math.round(numOr0(f.n));
    if (f.kind === 'times' && (n < 2 || n > 24)) { f.err = '회차는 2~24 사이로 넣어 주세요.'; c.draw(); return; }
    if ((st.notes[f.start] || {}).locked && !f.id) { f.err = ymLabel(f.start) + '은 마감됐어요. 다음 달로 넣어 주세요.'; c.draw(); return; }
    const old = f.id ? st.items.find(x => x.id === f.id) : null;
    const staff = (st.staff || []).find(p => p.name === name);
    const d = { name: name.slice(0, 40), staffId: staff ? staff.id : '', dept: f.dept, type: f.type, text: text.slice(0, 400), ot: numOr0(f.ot), days: numOr0(f.days), amount: Math.round(numOr0(f.amount)),
      kind: f.kind, start: f.start, end: f.kind === 'monthly' ? (f.end || '') : '', n: f.kind === 'times' ? n : 0,
      docs: String(f.docs || '').split(/[,·]/).map(x => x.trim()).filter(Boolean).slice(0, 8), memo: String(f.memo || '').trim().slice(0, 120),
      st: old ? (old.st || {}) : {}, del: false, at: old ? old.at : Date.now(), by: c.who(), upd: S.SERVER_TIME, uid: c.uid() };
    const id = f.id || newId();
    f.saving = true; f.err = ''; c.draw();
    try { await S.set('close_items/' + id, d); } catch (e) { f.saving = false; f.err = '저장하지 못했어요: ' + errTxt(e); c.draw(); return; }
    const loc = Object.assign({}, d, { id, upd: Date.now() });
    st.items = st.items.filter(x => x.id !== id).concat([loc]);
    st.form = null; say(name + ' · ' + d.type + ' 저장했어요.');
  }
  async function patchItem(id, fn, okMsg) {
    const it = st.items.find(x => x.id === id); if (!it) return;
    const nx = JSON.parse(JSON.stringify(it)); fn(nx); delete nx.id;
    nx.upd = S.SERVER_TIME; nx.uid = c.uid();
    try { await S.set('close_items/' + id, nx); } catch (e) { say('저장하지 못했어요: ' + errTxt(e)); return false; }
    Object.assign(it, nx, { upd: Date.now() }); if (nx.del) st.items = st.items.filter(x => x.id !== id);
    if (okMsg) say(okMsg); else c.draw();
    return true;
  }
  async function saveNote(ym, fn, okMsg) {
    const nt = JSON.parse(JSON.stringify(st.notes[ym] || {})); fn(nt);
    nt.at = S.SERVER_TIME; nt.uid = c.uid(); nt.by = c.who();
    try { await S.set('close_month/' + ym, nt); } catch (e) { say('저장하지 못했어요: ' + errTxt(e)); return false; }
    st.notes[ym] = Object.assign(nt, { at: Date.now() }); if (okMsg) say(okMsg); else c.draw();
    return true;
  }
  function openHr(id) {
    const hr = hrRows(st.staff || [], st.ym, note(), ymd()), p = hr.find(x => x.id === id); if (!p) return;
    st.hrForm = Object.assign({ err: '', idx: p.manual ? +String(p.id).slice(1) : -1 }, p); c.draw(); window.scrollTo(0, 0);
  }
  async function saveHr() {
    const f = st.hrForm; if (!f || f.saving) return;
    const clean = v => String(v || '').trim();
    if (f.manual && !clean(f.name)) { f.err = '성명을 넣어 주세요.'; c.draw(); return; }
    if (f.manual && !f.hired && !f.left) { f.err = '입사일이나 마지막 근로일 중 하나는 넣어 주세요.'; c.draw(); return; }
    f.saving = true; c.draw();
    const ok = await saveNote(st.ym, nt => {
      if (f.manual) {
        nt.hrx = nt.hrx || [];
        const x = { name: clean(f.name).slice(0, 20), dept: f.dept || '', state: f.state || '재직', hired: f.hired || '', left: f.left || '', reason: clean(f.reason).slice(0, 60), memo: clean(f.memo).slice(0, 120) };
        if (f.docsTouched || f.docs) x.docs = docsNorm(f.docs);
        if (f.idx >= 0) nt.hrx[f.idx] = x; else nt.hrx.push(x);
      } else { nt.hr = nt.hr || {}; const prev = nt.hr[f.id] || {}; nt.hr[f.id] = { reason: clean(f.reason).slice(0, 60), memo: clean(f.memo).slice(0, 120) }; if (f.docsTouched) nt.hr[f.id].docs = docsNorm(f.docs); else if (prev.docs) nt.hr[f.id].docs = prev.docs; }
    }, '저장했어요.');
    if (ok) st.hrForm = null; else f.saving = false;
    c.draw();
  }

  // ---------- 내려받기
  function pack() {
    const M = st.ym, rows = rowsFor(st.items || [], M), hr = hrRows(st.staff || [], M, note(), ymd());
    return { M, rows, hr, sm: summary(rows, hr), site: '한화리조트 해운대', made: ymd(), by: c.who() };
  }
  function xlsxOut() {
    const P = pack(), W = c.xlsx;
    const title = (t) => [{ v: t + '  ·  ' + P.M.replace('-', '년 ') + '월', s: 'title' }];
    const sub = [{ v: P.site + ' 객실과  ·  작성 ' + P.made + (P.by ? ' ' + P.by : ''), s: 'sub' }];
    // 1장 요약
    const s1 = [title('결산마감 특이사항'), sub, [],
      [{ v: '구분', s: 'head' }, { v: '값', s: 'head' }],
      [{ v: '당월 입사', s: 'cell' }, { v: P.sm.hin, s: 'num' }], [{ v: '당월 퇴사', s: 'cell' }, { v: P.sm.hout, s: 'num' }], [{ v: '서류 미비', s: 'cell' }, { v: P.sm.dmiss, s: 'num' }],
      [{ v: '특이사항', s: 'cell' }, { v: P.sm.n, s: 'num' }], [{ v: '미완료 (이월 포함)', s: 'cell' }, { v: P.sm.open, s: 'num' }],
      [{ v: 'OT 합계 (시간)', s: 'cell' }, { v: P.sm.ot, s: 'num' }], [{ v: '특근 합계 (일)', s: 'cell' }, { v: P.sm.days, s: 'num' }], [{ v: '금액 합계 (원)', s: 'cell' }, { v: P.sm.amount, s: 'won' }],
      [], [{ v: '유형', s: 'head' }, { v: '건수', s: 'head' }, { v: '금액 (원)', s: 'head' }]]
      .concat(Object.keys(P.sm.byType).sort((a, b) => TYPES.indexOf(a) - TYPES.indexOf(b)).map(t => [{ v: t, s: 'cell' }, { v: P.sm.byType[t].n, s: 'num' }, { v: P.sm.byType[t].amount, s: 'won' }]));
    // 2장 입퇴사
    const H2 = ['순번', '부서', '성명', '구분', '입사일자', '근로여부', '마지막 근로일', '근로\n계약서', '입사\n지원서', '신분증\n사본', '통장\n사본', '서류 확인', '퇴사사유', '비고'];
    const s2 = [title('입 / 퇴사자 현황'), sub, [], H2.map(v => ({ v, s: 'head' }))].concat(P.hr.length ? P.hr.map((p, i) => [{ v: i + 1, s: 'num' }, { v: p.dept, s: 'cell' }, { v: p.name, s: 'cellb' }, { v: p.isIn && p.isOut ? '입·퇴사' : p.isOut ? '퇴사' : '입사', s: p.isOut ? 'out' : 'in' },
      { v: p.hired, s: 'cell' }, { v: p.state, s: 'cell' }, { v: p.left, s: 'cell' }].concat(DOCS.map(x => ({ v: p.docs ? docMark(p.docs[x[0]]) : '', s: 'num' })), [{ v: docCheck(p.docs), s: /^미비/.test(docCheck(p.docs)) ? 'carry' : docCheck(p.docs) === '완비' ? 'done' : 'num' }, { v: p.reason, s: 'wrap' }, { v: p.memo, s: 'wrap' }])) : [[{ v: '이 달 입사 · 퇴사자 없음', s: 'cell' }]]);
    // 3장 특이사항
    const H3 = ['번호', '부서', '대상자', '유형', '내용', 'OT', '특근', '금액 (원)', '적용 월', '조치', '비고'];
    const s3 = [title('특 이 사 항'), sub, [], H3.map(v => ({ v, s: 'head' }))].concat(P.rows.length ? P.rows.map((r, i) => [{ v: i + 1, s: 'num' }, { v: r.it.dept, s: 'cell' }, { v: r.it.name, s: 'cellb' }, { v: r.it.type, s: 'cell' },
      { v: r.it.text + (r.it.docs && r.it.docs.length ? '\n(동봉: ' + r.it.docs.join(', ') + ')' : ''), s: 'wrap' }, { v: r.it.ot || '', s: 'num' }, { v: r.it.days || '', s: 'num' }, { v: r.it.amount || '', s: 'won' },
      { v: (r.carry ? ymLabel(r.ym) + ' 이월' : ymLabel(r.ym)) + (r.round ? ' · ' + r.round : ''), s: r.carry ? 'carry' : 'cell' }, { v: r.st, s: r.st === '완료' ? 'done' : 'cell' }, { v: r.it.memo || '', s: 'wrap' }]) : [[{ v: '이 달 특이사항 없음', s: 'cell' }]]);
    const blob = W.book([
      { name: '요약', rows: s1, cols: [22, 14, 16], merge: ['A1:C1', 'A2:C2'] },
      { name: '입퇴사 현황', rows: s2, cols: [6, 13, 11, 8, 12, 10, 13, 7, 7, 7, 7, 22, 14, 28], merge: ['A1:N1', 'A2:N2'], freeze: 4 },
      { name: '특이사항', rows: s3, cols: [6, 11, 12, 11, 52, 6, 6, 12, 14, 9, 22], merge: ['A1:K1', 'A2:K2'], freeze: 4 }
    ]);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = P.M.slice(2, 4) + '년 ' + +P.M.slice(5, 7) + '월 해운대 결산마감 특이사항.xlsx';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function pdfHtml() {
    const P = pack(), e = esc;
    const kpi = [['당월 입사', P.sm.hin + '명'], ['당월 퇴사', P.sm.hout + '명' + (P.sm.dmiss ? ' · 서류 미비 ' + P.sm.dmiss : '')], ['특이사항', P.sm.n + '건'], ['미완료', P.sm.open + '건' + (P.sm.carry ? ' (이월 ' + P.sm.carry + ')' : '')], ['금액 합계', P.sm.amount ? won(P.sm.amount) + '원' : '-']];
    const types = Object.keys(P.sm.byType).sort((a, b) => TYPES.indexOf(a) - TYPES.indexOf(b));
    return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>' + e(P.M.slice(2, 4) + '년 ' + +P.M.slice(5, 7) + '월 해운대 결산마감 특이사항') + '</title><style>' +
      '@page{size:A4 landscape;margin:11mm 10mm}*{box-sizing:border-box}body{font-family:"Pretendard","Apple SD Gothic Neo","맑은 고딕",system-ui,sans-serif;color:#111827;margin:0;font-size:10.5px;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '.hd{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:2.5px solid #0E1E36;padding-bottom:7px;margin-bottom:10px}.hd h1{font-size:20px;margin:0;letter-spacing:-.3px}.hd h1 span{color:#B08A2E}.hd p{margin:0;color:#4B5563;font-size:10.5px;text-align:right;line-height:1.5}' +
      '.kpi{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:10px}.kpi div{border:1px solid #D6DCE5;border-radius:8px;padding:7px 10px;background:#F7F9FC}.kpi b{display:block;font-size:16px}.kpi span{color:#4B5563;font-size:9.5px}' +
      '.types{display:flex;flex-wrap:wrap;gap:5px;margin:-2px 0 12px}.types i{font-style:normal;border-radius:99px;padding:2px 8px;font-size:9.5px;font-weight:700;color:#fff}' +
      'h2{font-size:13px;margin:12px 0 6px;padding-left:7px;border-left:4px solid #0E1E36}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#0E1E36;color:#fff;font-weight:700;font-size:9.5px;padding:5px 4px}' +
      'td{border-bottom:1px solid #E1E6ED;padding:5px 4px;vertical-align:top;line-height:1.45;word-break:keep-all;overflow-wrap:anywhere}tr:nth-child(even) td{background:#F8FAFC}td.c{text-align:center}td.r{text-align:right;font-variant-numeric:tabular-nums}' +
      '.tg{display:inline-block;border-radius:4px;padding:1px 5px;font-size:9px;font-weight:700;color:#fff}.st{display:inline-block;border:1.3px solid;border-radius:99px;padding:0 6px;font-size:9px;font-weight:700}.cy{color:#B91C1C;font-weight:700}.sm{color:#6B7280;font-size:9px}' +
      'thead{display:table-header-group}tr{break-inside:avoid}.pb{break-before:page}.ft{margin-top:8px;color:#6B7280;font-size:9px}</style></head><body>' +
      '<div class="hd"><h1>결산마감 특이사항 <span>' + e(P.M.replace('-', '년 ')) + '월</span></h1><p>' + e(P.site) + ' 객실과<br>작성 ' + e(P.made) + (P.by ? ' · ' + e(P.by) : '') + '</p></div>' +
      '<div class="kpi">' + kpi.map(k => '<div><b>' + e(k[1]) + '</b><span>' + e(k[0]) + '</span></div>').join('') + '</div>' +
      (types.length ? '<div class="types">' + types.map(t => '<i style="background:' + (TCOL[t] || '#4B5563') + '">' + e(t) + ' ' + P.sm.byType[t].n + (P.sm.byType[t].amount ? ' · ' + won(P.sm.byType[t].amount) + '원' : '') + '</i>').join('') + '</div>' : '') +
      '<h2>입 / 퇴사자 현황 (' + P.hr.length + '명)</h2><table><colgroup><col style="width:3.5%"><col style="width:8%"><col style="width:7%"><col style="width:5.5%"><col style="width:7.5%"><col style="width:6%"><col style="width:7.5%"><col style="width:4.5%"><col style="width:4.5%"><col style="width:4.5%"><col style="width:4.5%"><col style="width:13%"><col style="width:9%"><col></colgroup>' +
      '<thead><tr><th>순번</th><th>부서</th><th>성명</th><th>구분</th><th>입사일자</th><th>근로여부</th><th>마지막<br>근로일</th><th>근로<br>계약서</th><th>입사<br>지원서</th><th>신분증<br>사본</th><th>통장<br>사본</th><th>서류 확인</th><th>퇴사사유</th><th>비고</th></tr></thead><tbody>' +
      (P.hr.length ? P.hr.map((p, i) => '<tr><td class="c">' + (i + 1) + '</td><td>' + e(p.dept) + '</td><td><b>' + e(p.name) + '</b></td><td class="c"><span class="tg" style="background:' + (p.isOut ? '#B91C1C' : '#047857') + '">' + (p.isIn && p.isOut ? '입·퇴사' : p.isOut ? '퇴사' : '입사') + '</span></td><td class="c">' + e(p.hired) + '</td><td class="c">' + e(p.state) + '</td><td class="c">' + e(p.left) + '</td>' + DOCS.map(x => '<td class="c">' + (p.docs ? docMark(p.docs[x[0]]) : '') + '</td>').join('') + '<td class="' + (/^미비/.test(docCheck(p.docs)) ? 'cy' : 'c') + '">' + e(docCheck(p.docs)) + '</td><td>' + e(p.reason) + '</td><td>' + e(p.memo) + '</td></tr>').join('')
        : '<tr><td colspan="14" class="c sm">이 달 입사 · 퇴사자 없음</td></tr>') + '</tbody></table>' +
      '<h2' + (P.hr.length > 6 ? ' class="pb"' : '') + '>특이사항 (' + P.rows.length + '건)</h2><table><colgroup><col style="width:4%"><col style="width:8%"><col style="width:9%"><col style="width:8%"><col><col style="width:5%"><col style="width:5%"><col style="width:8%"><col style="width:9%"><col style="width:7%"><col style="width:12%"></colgroup>' +
      '<thead><tr><th>번호</th><th>부서</th><th>대상자</th><th>유형</th><th>내용</th><th>OT</th><th>특근</th><th>금액(원)</th><th>적용 월</th><th>조치</th><th>비고</th></tr></thead><tbody>' +
      (P.rows.length ? P.rows.map((r, i) => '<tr><td class="c">' + (i + 1) + '</td><td>' + e(r.it.dept) + '</td><td><b>' + e(r.it.name) + '</b></td><td class="c"><span class="tg" style="background:' + (TCOL[r.it.type] || '#4B5563') + '">' + e(r.it.type) + '</span></td>' +
        '<td>' + e(r.it.text) + (r.it.docs && r.it.docs.length ? '<br><span class="sm">📎 동봉: ' + e(r.it.docs.join(', ')) + '</span>' : '') + '</td><td class="r">' + (r.it.ot || '') + '</td><td class="r">' + (r.it.days || '') + '</td><td class="r">' + won(r.it.amount) + '</td>' +
        '<td class="c">' + (r.carry ? '<span class="cy">' + e(ymLabel(r.ym)) + ' 이월</span>' : e(ymLabel(r.ym))) + (r.round ? '<br><span class="sm">' + e(r.round) + '</span>' : '') + '</td><td class="c"><span class="st" style="color:' + SCOL[r.st] + ';border-color:' + SCOL[r.st] + '">' + e(r.st) + '</span></td><td>' + e(r.it.memo || '') + '</td></tr>').join('')
        : '<tr><td colspan="11" class="c sm">이 달 특이사항 없음</td></tr>') + '</tbody>' +
      (P.sm.amount || P.sm.ot || P.sm.days ? '<tfoot><tr><td colspan="5" class="r"><b>합계</b></td><td class="r"><b>' + (P.sm.ot || '') + '</b></td><td class="r"><b>' + (P.sm.days || '') + '</b></td><td class="r"><b>' + won(P.sm.amount) + '</b></td><td colspan="3"></td></tr></tfoot>' : '') + '</table>' +
      '<p class="ft">이월 = 지난달까지 완료되지 않아 이번 달에 다시 올린 건 · 회차 = 나눠서 지급하는 건의 이번 순서</p></body></html>';
  }
  function pdfOut() {
    const w = window.open('', '_blank');
    if (!w) { alert('새 창이 막혔어요. 주소창 오른쪽에서 팝업을 허용해 주세요.'); return; }
    w.document.write(pdfHtml().replace('</body>', '<script>onload=function(){setTimeout(function(){print()},300)}<\/script></body>')); w.document.close();
  }

  // ---------- 누르기 · 입력
  document.addEventListener('click', async e => {
    const t = e.target.closest && e.target.closest('[data-cs]'); if (!t || t.tagName === 'SELECT') return;
    const k = t.getAttribute('data-cs'), id = t.getAttribute('data-id');
    if (k === 'unlock') { if (await PIN.gate('결산')) c.draw(); return; }
    if (!PIN.passed()) { c.draw(); return; }
    if (k === 'reload') { st.notes = {}; st.staff = null; load(true); }
    else if (k === 'prev' || k === 'next') { st.ym = ymAdd(st.ym, k === 'prev' ? -1 : 1); st.form = st.hrForm = null; c.draw(); await loadNote(st.ym); c.draw(); }
    else if (k === 'filter') { st.filter = t.getAttribute('data-v'); c.draw(); }
    else if (k === 'add') openForm(null);
    else if (k === 'edit') { const it = st.items.find(x => x.id === id); if (!it) return; if (locked() && it.start === st.ym) { say('마감된 달이에요. 처리 상태만 바꿀 수 있어요.'); return; } openForm(it); }
    else if (k === 'kind' && st.form) { st.form.kind = t.getAttribute('data-v'); c.draw(); }
    else if (k === 'save') saveForm();
    else if (k === 'cancel') { st.form = st.hrForm = null; c.draw(); }
    else if (k === 'del' && st.form) { if (!confirm('이 특이사항을 지울까요? 지난달 기록에서도 빠져요.\n끝난 건은 지우지 말고 「완료」로 두는 게 좋아요.')) return; const fid = st.form.id; if (await patchItem(fid, x => { x.del = true; }, '지웠어요.')) st.form = null; c.draw(); }
    else if (k === 'stop' && st.form) { const fid = st.form.id, ym = st.ym; if (await patchItem(fid, x => { x.end = ym; }, ymLabel(ym) + '까지만 나오게 했어요.')) st.form = null; c.draw(); }
    else if (k === 'tenadd' || k === 'tenskip') {
      const t = tenureDue(st.staff || [], st.ym, st.tenDone).find(x => x.id === id); if (!t || t.added) return;
      const sm = t.ym < st.ym ? st.ym : t.ym;                                // 놓친 건은 이번 달에 넣음
      if (k === 'tenskip' && !confirm(t.name + ' 근속 ' + t.n + '년 인상을 「안 함」으로 둘까요?\n(대상이 아닌 분 · 이미 처리한 분) 다시 안 보여요.')) return;
      if ((st.notes[sm] || {}).locked) { say(ymLabel(sm) + '은 마감됐어요.'); return; }
      const d = { name: t.name, staffId: t.staffId, dept: DEPTS.indexOf(t.dept) >= 0 ? t.dept : '기타', type: '임금인상',
        text: '근속 ' + t.n + '년 도래 (' + md(t.day) + ') 급여 인상 적용' + (t.ym < st.ym ? ' — ' + ymLabel(t.ym) + ' 누락분 포함 확인' : ''), ot: 0, days: 0, amount: 0,
        kind: 'once', start: sm, end: '', n: 0, docs: [], memo: '', tag: 'tenure', tenure: { n: t.n, day: t.day }, st: {}, del: k === 'tenskip', at: Date.now(), by: c.who(), upd: S.SERVER_TIME, uid: c.uid() };
      try { await S.set('close_items/' + id, d); } catch (x) { say('저장하지 못했어요: ' + errTxt(x)); return; }
      st.tenDone[id] = d.del ? 'skip' : 1; if (!d.del) st.items = st.items.filter(x => x.id !== id).concat([Object.assign({}, d, { id, upd: Date.now() })]);
      say(k === 'tenskip' ? t.name + ' · 안 함으로 뒀어요.' : t.name + ' · 근속 ' + t.n + '년 인상을 ' + ymLabel(sm) + ' 특이사항에 넣었어요.');
    }
    else if (k === 'hr') openHr(id);
    else if (k === 'hradd') { st.hrForm = { manual: true, idx: -1, name: '', dept: DEPTS[0], state: '재직', hired: st.ym + '-01', left: '', reason: '', memo: '', err: '' }; c.draw(); window.scrollTo(0, 0); }
    else if (k === 'doc' && st.hrForm) { const f = st.hrForm, v = t.getAttribute('data-v'); f.docs = Object.assign({ c: 0, a: 0, i: 0, b: 0 }, f.docs || {}); f.docs[v] = (f.docs[v] + 1) % 3; f.docsTouched = true; c.draw(); }
    else if (k === 'hrsave') saveHr();
    else if (k === 'hrdel' && st.hrForm) { if (!confirm('이 분을 이 달 입퇴사 현황에서 뺄까요?')) return; const i = st.hrForm.idx; if (await saveNote(st.ym, nt => { nt.hrx = (nt.hrx || []).filter((_, j) => j !== i); }, '뺐어요.')) st.hrForm = null; c.draw(); }
    else if (k === 'lockm') { if (!confirm(ymLabel(st.ym) + ' 결산을 마감할까요?\n내용이 고정되고, 처리 상태만 바꿀 수 있어요. (나중에 풀 수 있어요)')) return; saveNote(st.ym, nt => { nt.locked = true; nt.lockedAt = Date.now(); }, ymLabel(st.ym) + ' 마감했어요.'); }
    else if (k === 'unlockm') { if (!confirm('마감을 풀까요?')) return; saveNote(st.ym, nt => { nt.locked = false; }, '마감을 풀었어요.'); }
    else if (k === 'xlsx') { try { xlsxOut(); } catch (x) { alert('엑셀을 만들지 못했어요: ' + errTxt(x)); } }
    else if (k === 'pdf') pdfOut();
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.matches && t.matches('select[data-cs="st"]')) {
      const id = t.getAttribute('data-id'), ym = t.getAttribute('data-ym'), v = t.value;
      patchItem(id, x => { x.st = Object.assign({}, x.st || {}); if (v === '요청') delete x.st[ym]; else x.st[ym] = v; }, ymLabel(ym) + ' 몫 → ' + v);
      return;
    }
    if (t.matches && t.matches('[data-csf]') && st.form) {
      const k = t.getAttribute('data-csf'); st.form[k] = t.value;
      if (k === 'name') { const p = (st.staff || []).find(x => x.name === t.value.trim()); if (p && p.job && DEPTS.indexOf(p.job) >= 0) { st.form.dept = p.job; c.draw(); } }
      if (k === 'type' || k === 'start') c.draw();
    }
    if (t.matches && t.matches('[data-csh]') && st.hrForm) st.hrForm[t.getAttribute('data-csh')] = t.value;
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.matches && t.matches('[data-csf]') && st.form) st.form[t.getAttribute('data-csf')] = t.value;
    if (t.matches && t.matches('[data-csh]') && st.hrForm) st.hrForm[t.getAttribute('data-csh')] = t.value;
  });
  return { html, pdfHtml, st };
}
