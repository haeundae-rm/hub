// core.js — 룸메이드 주간 스케줄: 계산 · 새 주차 · 엑셀 가져오기/내보내기 (화면·저장소를 모름)
// 엑셀 '룸메이드 스케줄표' 수식과 같은 셈. 허브(hub/rmsched/)로 옮길 때 이 파일은 그대로 씀
(function (G) {
  const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
  const STATUSES = ['신청', '사유', '휴', '독립', '교육', '캔슬'];
  const OFF = ['휴', '신청', '사유'];          // 출근일수에서 빠지는 상태
  const WORK = ['', '독립', '캔슬'];           // 정비수 · 출근인원에 드는 상태 (교육 제외)
  const GROUPS = ['A', 'B', 'C', '고정', ''];
  const isNum = v => typeof v === 'number' && isFinite(v);
  const num = v => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
  const rid = () => 'r' + Math.random().toString(36).slice(2, 9);

  // ---------- 날짜 (문자열 'YYYY-MM-DD', 시간대 영향 없게 UTC 로만 셈)
  const toD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const ymd = d => d.toISOString().slice(0, 10);
  const addDays = (s, n) => ymd(new Date(toD(s).getTime() + n * 864e5));
  const dowIdx = s => (toD(s).getUTCDay() + 6) % 7;            // 월=0 … 일=6
  const mondayOf = s => addDays(s, -dowIdx(s));
  const md = s => Number(s.slice(5, 7)) + '/' + Number(s.slice(8));
  const weekNoOf = mon => Math.ceil(Number(mon.slice(8)) / 7);   // 11/23(월) → 4주차 (엑셀과 같음)
  const serialToYmd = n => ymd(new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5));
  const weekTitle = w => `'${w.mon.slice(2, 4)}년 ${Number(w.mon.slice(5, 7))}월 ${w.no}주차`;

  function emptyWeek(mon, cfg) {
    cfg = cfg || {};
    return {
      mon, no: weekNoOf(mon), fullDays: cfg.fullDays || 21, rooms: cfg.rooms || 417,
      rows: [], work: [],
      sum: { res: Array(8).fill(null), co: Array(8).fill(null), inroom: Array(8).fill(null), stay: Array(8).fill(null),
             carry: Array(8).fill(null), spare: Array(8).fill(null), prevSunRes: null },
      helpers: (cfg.helpers || []).map(h => ({ name: h.name, can: h.can || '', d: Array(7).fill(false) })),
      daily: {}
    };
  }
  const newRow = (o = {}) => Object.assign({ id: rid(), name: '', group: '', joined: '', ord: null, st: Array(7).fill(''), u: Array(7).fill(null), prev: null, memo: '' }, o);

  // ---------- 주간 계산 (엑셀 Y·Z열, 일별 요약 78~82행, 점검 항목 AD열)
  function rowCalc(w, r) {
    let cnt = 0;
    for (let d = 0; d < 7; d++) if (!OFF.includes(r.st[d] || '') && isNum(r.u[d])) cnt++;
    const total = (isNum(r.prev) ? r.prev : 0) + cnt;
    return { cnt, total, over: total > w.fullDays };
  }
  function dayCalc(w, d) {
    let jb = 0, ppl = 0;
    w.rows.forEach(r => { if (r.name && WORK.includes(r.st[d] || '') && isNum(r.u[d])) { jb += r.u[d]; ppl++; } });
    const S = w.sum, res = S.res[d], co = S.co[d], spare = S.spare[d];
    const avail = isNum(res) ? w.rooms - res - (isNum(spare) ? spare : 0) : null;
    const prevRes = d === 0 ? S.prevSunRes : S.res[d - 1];
    return {
      jb, ppl, avail,
      coRe: isNum(co) ? co - jb : null,
      per: ppl ? jb / ppl : null,
      ob: isNum(prevRes) && isNum(S.stay[d]) ? prevRes - S.stay[d] : null,   // 오버부킹 정비수 = 전일 예약 − 당일 유숙
      work: w.work.reduce((a, x) => a + (isNum(x.d[d]) ? x.d[d] : 0), 0),
      helpers: w.helpers.filter(h => h.d[d]).length
    };
  }
  function issues(w) {
    const out = { unit: [], ord: [], name: [], over: [] };
    const named = w.rows.filter(r => r.name);
    named.forEach(r => { for (let d = 0; d < 7; d++) if (WORK.includes(r.st[d] || '') && !isNum(r.u[d])) out.unit.push({ id: r.id, name: r.name, d }); });
    const oc = {}, nc = {};
    named.forEach(r => { if (isNum(r.ord)) oc[r.ord] = (oc[r.ord] || 0) + 1; nc[r.name] = (nc[r.name] || 0) + 1; });
    named.forEach(r => { if (isNum(r.ord) && oc[r.ord] > 1) out.ord.push({ id: r.id, name: r.name, ord: r.ord }); if (nc[r.name] > 1) out.name.push({ id: r.id, name: r.name }); if (rowCalc(w, r).over) out.over.push({ id: r.id, name: r.name }); });
    out.total = out.unit.length + out.ord.length + out.name.length + out.over.length;
    return out;
  }

  // ---------- 일일 스케줄 (그 날 하루: 유닛 수정 · 더티수량 · 배정순번)
  function dayData(w, date) { return (w.daily && w.daily[date]) || { edit: {}, dirty: {}, stayTot: null, sale: null, look: null, note: '' }; }
  function dailyView(w, di) {
    const date = addDays(w.mon, di), D = dayData(w, date);
    let k = 0;
    const rows = w.rows.filter(r => r.name).map((r, i) => {
      const st = r.st[di] || '', base = r.u[di], edit = D.edit && isNum(D.edit[r.id]) ? D.edit[r.id] : null;
      const u = edit != null ? edit : base;
      const working = WORK.includes(st) && isNum(u);
      return { r, no: i + 1, st, base, edit, u, working, order: working && u > 0 ? ++k : null, dirty: D.dirty && isNum(D.dirty[r.id]) ? D.dirty[r.id] : null, up: edit != null && isNum(base) ? edit > base : edit != null };
    });
    const work = rows.filter(x => x.working);
    const jb = work.reduce((a, x) => a + x.u, 0), ppl = work.length;
    const S = w.sum, co = S.co[di], res = S.res[di];
    const spare = S.spare[di];
    return {
      date, D, rows,
      rm: rows.filter(x => x.order).sort((a, b) => a.order - b.order),
      helpers: w.helpers.filter(h => h.d[di]),
      sum: { res, co, jb, ppl, coRe: isNum(co) ? co - jb : null, per: ppl ? jb / ppl : null, carry: S.carry[di], stay: S.stay[di],
             avail: isNum(res) ? w.rooms - res - (isNum(spare) ? spare : 0) : null,
             reent: isNum(D.stayTot) && D.stayTot && isNum(D.sale) && isNum(D.look) ? D.sale * D.look / D.stayTot : null },
      dirtyTot: rows.reduce((a, x) => a + (isNum(x.dirty) ? x.dirty : 0), 0),
      edits: rows.filter(x => x.edit != null).length
    };
  }

  // ---------- 새 주차 (사용방법 '새 주차 시작 순서' + 정한 규칙)
  //  · 기준일 +7일, 신청순 · 캔슬 · 신청휴무 등 지움 (고정 그룹은 기본휴무 그대로)
  //  · 유닛은 기본유닛으로, 지난주 누적 = 지난 합계, 메모에 '퇴사' + 7일 모두 휴무인 직원은 뺌
  //  · 예약 · 체크아웃 · 유숙 · 재실 · 이월 · 정비보조 출근 · 작업객실은 비움 (다음 월 예약 · 체크아웃은 이번 주 월요일로)
  function newWeekFrom(prev, cfg, opt = {}) {
    cfg = cfg || {};
    const mon = addDays(prev.mon, 7), w = emptyWeek(mon, { fullDays: prev.fullDays, rooms: prev.rooms, helpers: cfg.helpers && cfg.helpers.length ? cfg.helpers : prev.helpers });
    const roster = {}; (cfg.roster || []).forEach(b => { roster[b.name] = b; });
    const removed = [];
    prev.rows.forEach(r => {
      if (r.name && /퇴사/.test(r.memo || '') && r.st.every(s => OFF.includes(s))) { removed.push(r.name); return; }
      const b = roster[r.name];
      const st = b && Array.isArray(b.off) ? b.off.map(s => s || '') : (r.group === '고정' ? r.st.map(s => s === '신청' ? '신청' : '') : r.st.map(s => s === '독립' ? '독립' : ''));
      const u = b && Array.isArray(b.base) ? b.base.map(num) : r.u.slice();
      w.rows.push(newRow({ name: r.name, group: b && b.group != null ? b.group : r.group, joined: r.joined, ord: null, st, u,
        prev: r.name ? (opt.resetCum ? 0 : rowCalc(prev, r).total) : null, memo: r.memo }));
    });
    const S = prev.sum;
    w.sum.res[0] = S.res[7]; w.sum.co[0] = S.co[7]; w.sum.spare[0] = S.spare[7];
    for (let d = 1; d < 8; d++) w.sum.spare[d] = S.spare[d];
    w.sum.prevSunRes = S.res[6];
    return { week: w, removed, monthChange: mon.slice(0, 7) !== prev.mon.slice(0, 7) || addDays(mon, 6).slice(0, 7) !== mon.slice(0, 7) };
  }

  // ---------- 엑셀 가져오기 (지금 쓰는 '룸메이드 스케줄표' 파일 그대로)
  function importXlsx(XLSX, buf) {
    const wb = XLSX.read(buf, { type: 'array', cellFormula: true });
    const ws = wb.Sheets['주간 스케줄'];
    if (!ws) throw new Error("'주간 스케줄' 시트를 찾지 못했어요");
    const c = a => ws[a] ? ws[a].v : null;
    const s = a => { const v = c(a); return v == null ? '' : String(v).trim(); };
    const n = a => { const v = c(a); return typeof v === 'number' ? v : num(typeof v === 'string' ? v.trim() : v); };
    const dv = a => { const v = c(a); return typeof v === 'number' ? serialToYmd(v) : (typeof v === 'string' && /^\d{4}-\d\d-\d\d/.test(v) ? v.slice(0, 10) : ''); };
    const mon0 = dv('C4'); if (!mon0) throw new Error('기준일(C4)을 읽지 못했어요');
    const mon = mondayOf(mon0);
    const w = emptyWeek(mon, { fullDays: n('I4') || 21, rooms: n('M4') || 417 });
    const f = ws.C2 && (ws.C2.f || ''), m1 = /&\s*(\d+)\s*&\s*"주차/.exec(f) || /(\d+)\s*주차/.exec(s('C2'));
    if (m1) w.no = Number(m1[1]);
    const SC = ['G', 'I', 'K', 'M', 'O', 'Q', 'S'], UC = ['H', 'J', 'L', 'N', 'P', 'R', 'T'];
    for (let r = 9; r <= 59; r++) {
      const name = s('E' + r); if (!name) continue;
      w.rows.push(newRow({ name, group: s('A' + r), joined: dv('B' + r), ord: n('D' + r),
        st: SC.map(x => { const v = s(x + r); return STATUSES.includes(v) ? v : ''; }), u: UC.map(x => n(x + r)), prev: n('X' + r), memo: s('AA' + r) }));
    }
    // 작업객실 미판매 현황 (63~67행) — 항목 이름은 B, 판매 재개는 X
    for (let r = 63; r <= 67; r++) { const name = s('B' + r); if (name) w.work.push({ name, d: SC.map(x => n(x + r)), resume: s('X' + r) }); }
    // 일별 요약 72~77행 (V열 = 다음 월)
    const SV = SC.concat('V');
    [['res', 72], ['co', 73], ['inroom', 74], ['stay', 75], ['carry', 76], ['spare', 77]].forEach(([k, r]) => { w.sum[k] = SV.map(x => n(x + r)); });
    // 정비보조 출근 86~98행
    w.helpers = [];
    for (let r = 86; r <= 98; r++) { const name = s('B' + r); if (name) w.helpers.push({ name, can: s('D' + r) === 'x' ? '' : s('D' + r), d: SC.map(x => s(x + r) === '출근') }); }
    // 일일 스케줄 시트: 그 날 유닛 수정 · 더티 · 재입실 · 인계사항
    const ds = wb.Sheets['일일 스케줄'], info = { day: null };
    if (ds) {
      const g = a => ds[a] ? ds[a].v : null;
      const dd = typeof g('D4') === 'number' ? serialToYmd(g('D4')) : '';
      if (dd && dd >= mon && dd <= addDays(mon, 6)) {
        const D = { edit: {}, dirty: {}, stayTot: num(g('I19')), sale: num(g('J19')), look: num(g('K19')), note: g('I22') == null ? '' : String(g('I22')) };
        const byName = {}; w.rows.forEach(x => { byName[x.name] = x.id; });
        for (let r = 7; r <= 56; r++) {
          const nm = g('C' + r); if (!nm || !byName[nm]) continue;
          const e = num(g('G' + r)), di = num(g('H' + r));
          if (e != null) D.edit[byName[nm]] = e; if (di != null) D.dirty[byName[nm]] = di;
        }
        w.daily[dd] = D; info.day = dd;
      }
    }
    info.rows = w.rows.length; info.helpers = w.helpers.length; info.work = w.work.length;
    return { week: w, info };
  }

  // ---------- 엑셀 내보내기 (값만 — 주간 스케줄 · 일일 · HK 전파 · 공지용)
  function exportXlsx(XLSX, w, di) {
    const wb = XLSX.utils.book_new(), dates = DAYS.map((_, d) => addDays(w.mon, d));
    const head = ['그룹', '입사일', '순번', '신청순', '직원성명'];
    DAYS.forEach((x, d) => head.push(x + ' ' + md(dates[d]) + ' 상태', '유닛'));
    head.push('지난주 누적', '이번주', '합계', '특이사항 메모');
    const A = [[weekTitle(w) + '  룸메이드 스케줄'], ['기준일', w.mon, '월 만근일수', w.fullDays, '총 객실수', w.rooms], [], head];
    w.rows.filter(r => r.name).forEach((r, i) => {
      const k = rowCalc(w, r), line = [r.group, r.joined, i + 1, r.ord == null ? '' : r.ord, r.name];
      for (let d = 0; d < 7; d++) line.push(r.st[d] || '', isNum(r.u[d]) ? r.u[d] : '');
      line.push(isNum(r.prev) ? r.prev : '', k.cnt, k.total, r.memo || ''); A.push(line);
    });
    A.push([], ['일별 요약'].concat(DAYS.map((x, d) => x + ' ' + md(dates[d])), ['다음 월']));
    const L = { res: '예약', co: '체크아웃', inroom: '재실정비', stay: '유숙', carry: '미정비 이월', spare: '여유공실' };
    Object.keys(L).forEach(k => A.push([L[k]].concat(w.sum[k].map(v => isNum(v) ? v : ''))));
    const C = DAYS.map((_, d) => dayCalc(w, d));
    A.push(['미정비 가능수'].concat(C.map(x => x.avail == null ? '' : x.avail)), ['정비수'].concat(C.map(x => x.jb)), ['출근인원'].concat(C.map(x => x.ppl)),
      ['C/O - 필요재입'].concat(C.map(x => x.coRe == null ? '' : x.coRe)), ['인당정비수'].concat(C.map(x => x.per == null ? '' : Math.round(x.per * 10) / 10)));
    if (w.work.length) { A.push([], ['작업객실 미판매 현황'].concat(DAYS, ['계', '판매 재개'])); w.work.forEach(x => A.push([x.name].concat(x.d.map(v => isNum(v) ? v : ''), [x.d.reduce((a, v) => a + (isNum(v) ? v : 0), 0), x.resume || '']))); }
    A.push([], ['정비보조 출근', '가능요일'].concat(DAYS)); w.helpers.forEach(h => A.push([h.name, h.can].concat(h.d.map(v => v ? '출근' : ''))));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(A), '주간 스케줄');
    // 일일 · HK 전파 (고른 날)
    const V = dailyView(w, di), t = md(V.date) + ' (' + DAYS[di] + ')';
    const B = [[t + ' 일일 스케줄'], [], ['순번', '직원성명', '상태', '유닛', '배정순번', '유닛 수정', '더티수량']];
    V.rows.forEach(x => B.push([x.no, x.r.name, x.st, isNum(x.u) ? x.u : '', x.order || '', x.edit == null ? '' : x.edit, x.dirty == null ? '' : x.dirty]));
    B.push(['', '더티 합계', '', '', '', '', V.dirtyTot]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(B), '일일 스케줄');
    const S = V.sum, H = [[t + ' RM 방배정표', '', '', '', '정비 예상 요약', '', '', t + ' 정비보조 출근자 명단'], ['순번', '성함', '정비유닛', '', '항목', '값', '', '순번', '성함', '비고']];
    const sumL = [['예약', S.res], ['체크아웃', S.co], ['정비수', S.jb], ['출근인원', S.ppl], ['C/O - 필요재입', S.coRe], ['인당정비수', S.per == null ? null : Math.round(S.per * 10) / 10], ['재입 예상', S.reent == null ? null : Math.round(S.reent * 10) / 10]];
    const n2 = Math.max(V.rm.length, sumL.length, V.helpers.length);
    for (let i = 0; i < n2; i++) {
      const a = V.rm[i], b = sumL[i], h = V.helpers[i];
      H.push([a ? i + 1 : '', a ? a.r.name : '', a ? a.u : '', '', b ? b[0] : '', b && b[1] != null ? b[1] : '', '', h ? i + 1 : '', h ? h.name : '', h ? 'HK지원' : '']);
    }
    H.push([], ['■ 야간조 인계사항'], [V.D.note || '']);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(H), 'HK 전파');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(noticeText(w).split('\n').map(x => [x])), '공지용');
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  }

  // ---------- 카톡 공지 글 (요일별 휴무 명단)
  function noticeText(w) {
    const L = [`📢 ${weekTitle(w)} 룸메이드 휴무 공지 (${md(w.mon)} ~ ${md(addDays(w.mon, 6))})`, ''];
    for (let d = 0; d < 7; d++) {
      const off = w.rows.filter(r => r.name && OFF.includes(r.st[d] || '') && r.group !== '고정').map(r => r.name + (r.st[d] === '휴' ? '' : '(' + r.st[d] + ')'));
      const back = w.rows.filter(r => r.name && r.st[d] === '캔슬').map(r => r.name);
      L.push(`▪ ${DAYS[d]} ${md(addDays(w.mon, d))} — 휴무 ${off.length}명`);
      L.push(off.length ? '   ' + off.join(', ') : '   없음');
      if (back.length) L.push('   ↩ 휴무 취소(출근): ' + back.join(', '));
    }
    L.push('', '※ 고정 근무자(주말 등)는 표에서 확인해 주세요.', '문의 · 객실팀 사무실 051-749-5210');
    return L.join('\n');
  }

  // ---------- 카톡 사진으로 휴무 넣기 (사진 → AI 가 읽은 목록 → 주간 스케줄에 '신청' · 신청순)
  // AI 에게 보낼 글: 이번 주 날짜 · 직원 명단 · 돌려줄 모양(JSON)
  function offPrompt(w) {
    const names = w.rows.filter(r => r.name).map(r => r.name).join(', ');
    const days = DAYS.map((d, i) => d + ' ' + addDays(w.mon, i)).join(', ');
    return [
      '이 사진들은 리조트 룸메이드 카카오톡 단체방에서 휴무 신청 메시지를 캡처한 것입니다. 사진은 보낸 순서대로 이어지는 대화이고, 각 사진은 위에서 아래로 읽습니다.',
      `스케줄을 짜는 주: ${addDays(w.mon, 0)}(월) ~ ${addDays(w.mon, 6)}(일). 요일별 날짜: ${days}.`,
      `직원 명단: ${names}`,
      '할 일: 휴무를 신청(또는 신청 취소)한 메시지를 대화에 나온 순서 그대로 뽑으세요. 인사 · 공지 · 관리자 답장 · 잡담은 빼세요.',
      '항목마다: name = 보낸 사람을 직원 명단의 이름으로 (카톡 이름에 호칭·이모티콘·숫자가 붙어 있거나 성이 빠져도 가장 가까운 명단 이름, 못 찾으면 보이는 그대로), raw = 카톡에 보이는 이름,',
      ' time = 메시지 옆 시각을 24시간 "HH:MM" 으로 (오전/오후 바꾸기, 안 보이면 null), dates = 쉬고 싶다고 한 날짜들 "YYYY-MM-DD" (요일·"25일"·"다음주 화요일" 같은 말은 위 주의 날짜로 바꾸기, 이번 주 밖이면 그 날짜 그대로),',
      ' reason = 사유가 적혀 있으면 10자 안쪽으로 (없으면 ""), cancel = 이미 신청한 휴무를 취소하는 메시지면 true, text = 메시지 내용 30자 안쪽.',
      '한 사람이 여러 번 보냈으면 메시지마다 따로 적으세요. 같은 메시지가 두 사진에 겹쳐 보이면 한 번만 적으세요.',
      '다른 말 없이 JSON 만: {"items":[{"name":"","raw":"","time":"08:55","dates":["2026-11-24"],"reason":"","cancel":false,"text":""}]}'
    ].join('\n');
  }
  // 명단 이름 찾기: 같은 이름 → 공백·기호 뺀 이름 → 이름이 들어 있거나 끝 두 글자가 같은 사람이 한 명뿐일 때
  function findRow(w, nm) {
    const R = w.rows.filter(r => r.name), k = x => String(x || '').replace(/[^가-힣A-Za-z]/g, '');
    if (!nm) return null;
    let r = R.find(x => x.name === nm) || R.find(x => k(x.name) === k(nm)); if (r) return r;
    const c = R.filter(x => k(nm).includes(k(x.name)) || (k(nm).length >= 2 && k(x.name).endsWith(k(nm).slice(-2))));
    return c.length === 1 ? c[0] : null;
  }
  // 적용: 처음 나온 순서대로 신청순 (9시 이전 메시지만 있는 사람은 뒤로), 빈 칸 · 캔슬 칸만 '신청'으로 (휴 · 사유 · 독립 · 교육은 그대로)
  function applyOff(w, items) {
    const out = { done: [], skip: [] }, seen = {}, order = [];
    const end = addDays(w.mon, 6);
    (items || []).forEach(it => {
      const r = findRow(w, String(it.name || '').trim()) || findRow(w, String(it.raw || '').trim());
      const dates = (Array.isArray(it.dates) ? it.dates : []).map(String);
      const inWk = dates.filter(d => d >= w.mon && d <= end).map(d => dowIdx(d));
      const time = /^\d{1,2}:\d\d$/.test(String(it.time || '')) ? String(it.time).padStart(5, '0') : '';
      if (!r) { out.skip.push({ who: it.raw || it.name || '?', why: '명단에서 이름을 못 찾음', text: it.text || '' }); return; }
      if (!inWk.length) { out.skip.push({ who: r.name, why: dates.length ? '이번 주 날짜가 아님 (' + dates.map(md).join(', ') + ')' : '날짜를 못 읽음', text: it.text || '' }); return; }
      const ch = [], kept = [];
      inWk.forEach(d => {
        const s0 = r.st[d] || '';
        if (it.cancel) { if (s0 === '신청') { r.st[d] = ''; ch.push(d); } else kept.push(d); return; }
        if (s0 === '' || s0 === '캔슬') { r.st[d] = '신청'; ch.push(d); } else if (s0 !== '신청') kept.push(d); else ch.push(d);
      });
      const rs = String(it.reason || '').trim();
      if (rs && !it.cancel) { const note = inWk.map(d => md(addDays(w.mon, d))).join(',') + ' ' + rs; if (!(r.memo || '').includes(rs)) r.memo = (r.memo ? r.memo + ' / ' : '') + note; }
      if (!it.cancel && !seen[r.id]) { seen[r.id] = 1; order.push({ r, early: !!time && time < '09:00' }); }
      out.done.push({ id: r.id, who: r.name, raw: it.raw || '', time, early: !!time && time < '09:00', cancel: !!it.cancel, days: ch, kept, reason: rs });
    });
    // 신청순: 9시 이전은 뒤로, 이미 번호가 있는 사람은 그대로
    let n = Math.max(0, ...w.rows.map(r => isNum(r.ord) ? r.ord : 0));
    order.filter(x => !x.early).concat(order.filter(x => x.early)).forEach(x => { if (!isNum(x.r.ord)) x.r.ord = ++n; });
    out.done.forEach(d => { const r = w.rows.find(x => x.id === d.id); d.ord = r && isNum(r.ord) ? r.ord : null; });
    return out;
  }

  // ---------- 국공휴 출근 현황 (엑셀 '26년 국공휴데이터'와 같은 셈)
  // hol = { year, days: [{ date:'YYYY-MM-DD', name }], rows: [{ name, v: { 'YYYY-MM-DD': '출근'|'휴무'|… } }] }
  const HOL_ST = ['출근', '휴무', '개인사유', '미입사', '수습', '퇴사'];
  const HOL_NAMES = { '01-01': '신정', '03-01': '삼일절', '05-01': '근로자의날', '05-05': '어린이날', '06-06': '현충일', '07-17': '제헌절', '08-15': '광복절', '10-03': '개천절', '10-09': '한글날', '12-25': '성탄절',
    '2026-02-16': '설날', '2026-02-17': '설날', '2026-02-18': '설날', '2026-05-24': '부처님오신날', '2026-06-03': '지방선거', '2026-09-24': '추석', '2026-09-25': '추석', '2026-09-26': '추석', '2026-10-05': '대체공휴일' };
  const holName = d => HOL_NAMES[d] || HOL_NAMES[d.slice(5)] || '공휴일';
  function importHolXlsx(XLSX, buf, year0) {
    const wb = XLSX.read(buf, { type: 'array' }), ws = wb.Sheets[wb.SheetNames[0]];
    const year = Number((/(\d{2,4})\s*년/.exec(wb.SheetNames[0]) || [])[1]) || year0 || 2026, Y = year < 100 ? 2000 + year : year;
    const cv = (c, r) => { const x = ws[XLSX.utils.encode_cell({ c, r: r - 1 })]; return x ? x.v : null; };
    const days = [], cols = []; let mon = 0;
    for (let c = 2; c < 60; c++) {
      const h = cv(c, 3), dd = cv(c, 4);
      if (typeof h === 'string' && /^(\d{1,2})월/.test(h)) mon = Number(/^(\d{1,2})월/.exec(h)[1]);
      if (typeof h === 'string' && !/월/.test(h) && h.trim()) break;   // '국공휴 개수' 부터는 통계 칸
      const m = /(\d{1,2})\s*일/.exec(String(dd == null ? '' : dd));
      if (mon && m) { const date = Y + '-' + String(mon).padStart(2, '0') + '-' + m[1].padStart(2, '0'); days.push({ date, name: holName(date) }); cols.push([c, date]); }
    }
    if (!days.length) throw new Error('공휴일 날짜(3~4행)를 찾지 못했어요');
    const rows = [];
    for (let r = 6; r <= 200; r++) {
      const name = String(cv(1, r) == null ? '' : cv(1, r)).trim();
      if (!name) { if (rows.length && !cv(0, r)) break; continue; }
      if (/범례|순위 색상|계산 기준/.test(name)) break;
      const v = {}; cols.forEach(([c, d]) => { const x = String(cv(c, r) == null ? '' : cv(c, r)).trim(); if (HOL_ST.includes(x)) v[d] = x; });
      rows.push({ name, v });
    }
    return { year: Y, days, rows };
  }
  // 주간 스케줄에서 그 날 상태 → 국공휴 표기 (휴 · 신청 · 사유 = 휴무, 유닛 있는 출근 = 출근, 교육 = 수습)
  function holAuto(hol, weeks) {
    const out = {};
    hol.days.forEach(({ date }) => {
      const w = weeks[mondayOf(date)]; if (!w) return;
      const di = dowIdx(date);
      w.rows.forEach(r => {
        if (!r.name) return;
        const st = r.st[di] || '';
        const v = OFF.includes(st) ? '휴무' : st === '교육' ? '수습' : (WORK.includes(st) && isNum(r.u[di]) ? '출근' : '');
        if (v) (out[r.name] = out[r.name] || {})[date] = v;
      });
    });
    return out;
  }
  // 줄마다 셈 + 순위 (출근율 = 출근 ÷ (출근 + 휴무) × 100, 같은 율은 같은 순위)
  function holCalc(hol, auto) {
    auto = auto || {};
    const rows = hol.rows.map(r => {
      const cell = {}, c = {}; HOL_ST.forEach(k => { c[k] = 0; });
      hol.days.forEach(({ date }) => { const m = r.v && r.v[date], a = (auto[r.name] || {})[date], v = m || a || ''; cell[date] = { v, auto: !m && !!a }; if (v) c[v]++; });
      const base = c['출근'] + c['휴무'];
      return { r, cell, c, base, rate: base ? c['출근'] / base * 100 : null };
    });
    const rates = rows.filter(x => x.rate != null).map(x => x.rate);
    rows.forEach(x => { x.rank = x.rate == null ? null : 1 + rates.filter(v => v > x.rate + 1e-9).length; });
    return rows;
  }

  const API = { DAYS, STATUSES, OFF, WORK, GROUPS, isNum, num, rid, addDays, dowIdx, mondayOf, md, weekNoOf, weekTitle, emptyWeek, newRow, rowCalc, dayCalc, issues, dayData, dailyView, newWeekFrom, importXlsx, exportXlsx, noticeText, offPrompt, findRow, applyOff, HOL_ST, holName, importHolXlsx, holAuto, holCalc };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.RMCore = API;
})(typeof window !== 'undefined' ? window : globalThis);
