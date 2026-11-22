// hub/sched/print.js — 🖨️ 근무 스케줄 인쇄 · PDF (2026-11-22, 2판: 머리 · 요약 · 타일형 칸 — 결재란 없음, 소장이 직접 편성)
// A4 가로 한 장. 옛 엑셀 근무스케줄 내용(관리자 → 하우스맨, 전월, 일자별 코드, 신청 휴무 빨간 테두리, 개인 합계, 일자별 인원)을 그대로 담고
// 보고서처럼 보이게: 머리(제목 · 요약 · 확정 표시) → 표(주 단위 구분선, 둥근 칸) → 범례 · 메모 → 바닥글
// 인쇄 창에서 'PDF로 저장' → 글자가 깨지지 않는 벡터 PDF
// 쓰는 곳: sched/sched.js · sched/view.js — printSchedule({ year, month, staff, managers, codeOf, mgr, mgrDefault, forced, notes, holidays, extra, state, leaveMode, autoOff })
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const WORK = ['A', 'E', 'C', 'B', 'D'];
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lbl = c => c && c.n ? ({ A: '주', C: '야', O: '휴' }[c.type] || '') + c.n : '';
const KIND = { ot: '오더테이커', day: '주간 전담', rot: '로테이션' };
const stamp = () => { const t = new Date(Date.now() + 9 * 3600e3).toISOString(); return t.slice(0, 10).replace(/-/g, '.') + ' ' + t.slice(11, 16); };

const CSS = `
#schPrint{display:none}
@media print{
  @page{size:A4 landscape;margin:7mm 8mm 6mm}
  html,body{background:#fff!important}
  body>*:not(#schPrint){display:none!important}
  #schPrint{display:block}
}
#schPrint{color:#141B2D;font-family:"Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
#schPrint .ptop{display:grid;grid-template-columns:1fr auto auto;gap:5mm;align-items:end;margin:0 0 3mm}
#schPrint .brand{font-size:7pt;font-weight:700;color:#8A6D2F;letter-spacing:.6pt;margin:0 0 .8mm}
#schPrint h1{margin:0;font-size:22pt;line-height:1;font-weight:900;color:#10233F;letter-spacing:-.6pt}
#schPrint h1 span{font-size:12pt;font-weight:700;color:#7A869A;margin-left:2mm;letter-spacing:0}
#schPrint .sub{margin:1.4mm 0 0;font-size:7.6pt;color:#5A6472}
#schPrint .kpi{display:flex;gap:1.6mm}
#schPrint .kpi div{border:.6pt solid #D5DCE6;border-radius:1.6mm;padding:1.2mm 2.4mm;min-width:17mm;background:#F8FAFC}
#schPrint .kpi b{display:block;font-size:11pt;font-weight:900;color:#10233F;line-height:1.1}
#schPrint .kpi span{font-size:6.2pt;color:#6B7688;font-weight:600}
#schPrint .kpi div.hl{background:#10233F;border-color:#10233F}#schPrint .kpi div.hl b{color:#fff}#schPrint .kpi div.hl span{color:#C8A96A}
#schPrint .meta{text-align:right;font-size:6.4pt;color:#7A869A;line-height:1.6}
#schPrint .meta i{font-style:normal;display:block;margin:0 0 .6mm auto;width:max-content;padding:.6mm 3mm;border-radius:1.2mm;font-weight:900;font-size:8pt}
#schPrint .meta i.ok{background:#10233F;color:#fff}#schPrint .meta i.no{background:#FDEDEF;color:#B23A48}
#schPrint .frame{border:.9pt solid #10233F;border-radius:2mm;overflow:hidden}
#schPrint table.pgt{width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed}
#schPrint .pgt th,#schPrint .pgt td{text-align:center;vertical-align:middle;padding:0;overflow:hidden;white-space:nowrap;border-right:.4pt solid #E1E6EE;border-bottom:.4pt solid #E1E6EE}
#schPrint .pgt thead th{background:#10233F;color:#fff;font-size:8pt;font-weight:800;height:5mm;border-color:#2A3E5E}
#schPrint .pgt thead tr.w th{background:#EEF2F7;color:#4B5568;font-size:6.6pt;font-weight:700;height:3.8mm;border-color:#E1E6EE}
#schPrint .pgt thead th.sat{color:#9CC3FF}#schPrint .pgt thead tr.w th.sat{background:#E3ECF9;color:#1F4E79}
#schPrint .pgt thead th.sun{color:#FFB3BE}#schPrint .pgt thead tr.w th.sun{background:#F9E3E7;color:#8B2E3F}
#schPrint .pgt thead th.hol{background:#8B2E3F;color:#fff}#schPrint .pgt thead tr.w th.hol{background:#8B2E3F;color:#fff}
#schPrint .pgt thead th.ext{background:#8A6D2F}#schPrint .pgt thead tr.w th.ext{background:#F6E7B8;color:#6B4E00}
#schPrint .pgt thead th.sm{background:#1F3864;font-size:7pt}
#schPrint .pgt .mon{border-left:1.1pt solid #9AA8BC}
#schPrint .pgt thead .mon{border-left-color:#5B7096}
#schPrint .pgt tbody td{height:9.1mm;font-size:9.6pt;font-weight:800;padding:.45mm .3mm;background:#fff}
#schPrint .pgt tbody td i{display:flex;align-items:center;justify-content:center;height:100%;border-radius:1mm;font-style:normal}
#schPrint .pgt tbody td.nm{text-align:left;padding:0 0 0 2mm;background:#fff}
#schPrint .pgt tbody td.nm b{display:block;font-size:9.4pt;font-weight:900;line-height:1.1}
#schPrint .pgt tbody td.nm small{display:block;font-size:5.8pt;font-weight:600;color:#7A869A;line-height:1.2}
#schPrint .pgt tbody td.cy{font-size:7pt;font-weight:700;color:#4B5568}
#schPrint .pgt tbody td.cy i{background:#F1F4F8;border-radius:.8mm;height:4.2mm;margin:0 .6mm}
#schPrint .pgt tbody td.sm{font-size:8.6pt;font-weight:900;background:#F8FAFC;color:#141B2D}
#schPrint .pgt tbody td.sm.z{color:#C2C9D4;font-weight:600}
#schPrint .pgt tbody td.sm.first{border-left:.9pt solid #10233F}
#schPrint .pgt tr.grp td{height:4.4mm;font-size:6.8pt;font-weight:900;color:#10233F;background:#F1F4F8;text-align:left;padding-left:2mm;letter-spacing:.3pt;border-right:0}
#schPrint .pgt tr.grp td em{font-style:normal;font-weight:600;color:#7A869A;margin-left:2mm}
#schPrint i.A{background:#DCE9FB;color:#1B4F91}#schPrint i.E{background:#FDEAD2;color:#B4650B}#schPrint i.C{background:#E7E1F6;color:#5B3E96}
#schPrint i.B{background:#FBE1E8;color:#B23A5C}#schPrint i.D{background:#DDF0EA;color:#1F7A5C}
#schPrint i.O{background:#A6A6A6;color:#A6A6A6}#schPrint i.L{background:#ECECEC;color:#444;font-size:6.8pt}
#schPrint i.f{box-shadow:inset 0 0 0 1.6pt #E02020}
#schPrint i.ho{box-shadow:inset 0 -1.4pt 0 #8B2E3F}
#schPrint .pgt tbody td.pc{position:relative}
#schPrint td .n{position:absolute;left:0;right:0;bottom:.2mm;font-size:4.6pt;font-weight:700;color:#333;line-height:1;white-space:nowrap;overflow:hidden}
#schPrint .pgt tfoot td{height:4.4mm;font-size:7pt;font-weight:700;color:#4B5568;background:#F8FAFC}
#schPrint .pgt tfoot td.k{text-align:left;padding-left:2mm;font-weight:900;color:#10233F}
#schPrint .pgt tfoot tr:first-child td{border-top:.9pt solid #10233F}
#schPrint .bt{display:grid;grid-template-columns:1fr auto;gap:2mm 6mm;margin-top:2.4mm;font-size:7pt;color:#333;line-height:1.5}
#schPrint .lg{display:flex;flex-wrap:wrap;gap:.8mm 3.2mm;align-items:center}
#schPrint .lg span{white-space:nowrap}
#schPrint .lg i{display:inline-block;width:5mm;height:3.6mm;border-radius:.8mm;vertical-align:-.9mm;margin-right:1mm;font-style:normal;font-weight:900;font-size:6.6pt;line-height:3.6mm;text-align:center}
#schPrint .info{grid-column:1/-1;color:#4B5568}
#schPrint .info b{color:#10233F;margin-right:1mm}
#schPrint .foot{margin-top:1.6mm;padding-top:1.2mm;border-top:.5pt solid #DDE3EA;display:flex;justify-content:space-between;font-size:6.2pt;color:#8C99A8}
`;

export function printSchedule(o) {
  let st = document.getElementById('schPrintCss');
  if (!st) { st = document.createElement('style'); st.id = 'schPrintCss'; document.head.appendChild(st); }
  st.textContent = CSS;
  let box = document.getElementById('schPrint');
  if (!box) { box = document.createElement('div'); box.id = 'schPrint'; document.body.appendChild(box); }
  box.innerHTML = html(o);
  const t = document.title; document.title = o.year + '년 ' + o.month + '월 하우스맨 근무스케줄';
  setTimeout(() => { window.print(); setTimeout(() => { document.title = t; }, 500); }, 80);
}

function html(o) {
  const nd = new Date(o.year, o.month, 0).getDate(), dow = d => new Date(o.year, o.month - 1, d).getDay();
  const hol = o.holidays || [], ext = o.extra || [], forced = o.forced || {}, notes = o.notes || {}, mgr = o.mgr || {}, auto = o.autoOff || {};
  const wkEnd = Array.from({ length: nd }, (_, i) => dow(i + 1)).filter(w => w === 0 || w === 6).length;
  const G = o.staff.map(s => Array.from({ length: nd }, (_, d) => o.codeOf(s.name, d) || ''));
  const MG = (o.managers || []).map(n => Array.from({ length: nd }, (_, d) => (mgr[n] || {})[d + 1] || o.mgrDefault || ''));
  const cnt = (r, k) => r.filter(x => x === k).length;
  const rng = a => a.length ? (Math.min(...a) === Math.max(...a) ? '' + a[0] : Math.min(...a) + '~' + Math.max(...a)) : '–';
  const offs = G.map(r => cnt(r, 'O')), rotC = o.staff.map((s, p) => s.kind === 'rot' ? cnt(G[p], 'C') : null).filter(x => x != null);
  const holOff = hol.slice().sort((a, b) => a - b).map(d => o.staff.filter((s, p) => G[p][d - 1] === 'O').map(s => s.name).join('·')).filter(Boolean);
  const dcls = d => { const w = dow(d); return (hol.includes(d) ? 'hol' : ext.includes(d) ? 'ext' : w === 6 ? 'sat' : w === 0 ? 'sun' : '') + (w === 1 && d > 1 ? ' mon' : ''); };

  // ---- 머리: 제목 · 요약 · 확정 여부
  let h = '<div class="ptop"><div><p class="brand">한화리조트 해운대 · 객실 하우스키핑</p><h1>' + o.month + '월 근무 스케줄<span>' + o.year + '</span></h1>' +
    '<p class="sub">하우스맨 ' + o.staff.length + '명' + (o.managers && o.managers.length ? ' · 관리자 ' + o.managers.length + '명' : '') +
    ' · 토·일 ' + wkEnd + '일' + (hol.length ? ' · 국공휴 ' + hol.slice().sort((a, b) => a - b).map(d => o.month + '/' + d + '(' + WD[dow(d)] + ')').join(', ') : '') + '</p></div>';
  h += '<div class="kpi"><div class="hl"><b>' + rng(offs) + '일</b><span>1인 휴무</span></div><div><b>' + rng(rotC) + '일</b><span>야간(로테이션)</span></div>' +
    (holOff.length ? '<div><b style="font-size:8.4pt">' + esc(holOff.join(' / ')) + '</b><span>국공휴 휴무</span></div>' : '') + '</div>';
  h += '<div class="meta"><i class="' + (o.state === '확정' ? 'ok">확정' : 'no">미확정') + '</i><span>출력 ' + stamp() + '</span></div></div>';

  // ---- 표
  const dayW = nd === 31 ? 6.2 : 6.45;
  h += '<div class="frame"><table class="pgt"><colgroup><col style="width:19mm"><col style="width:8.5mm">' + Array.from({ length: nd }, () => '<col style="width:' + dayW + 'mm">').join('') +
    '<col style="width:6.6mm"><col style="width:6.6mm"><col style="width:6.6mm"><col style="width:6.6mm"><col style="width:6.6mm"><col style="width:7.6mm"><col style="width:7.6mm"></colgroup>';
  h += '<thead><tr><th rowspan="2">성명</th><th rowspan="2">전월</th>';
  for (let d = 1; d <= nd; d++) h += '<th class="' + dcls(d) + '">' + d + '</th>';
  h += '<th rowspan="2" class="sm">A</th><th rowspan="2" class="sm">E</th><th rowspan="2" class="sm">C</th><th rowspan="2" class="sm">휴무</th><th rowspan="2" class="sm">연차</th><th rowspan="2" class="sm">근무</th><th rowspan="2" class="sm">특근</th></tr><tr class="w">';
  for (let d = 1; d <= nd; d++) h += '<th class="' + dcls(d) + '">' + (hol.includes(d) ? '공휴' : ext.includes(d) ? '+1' : WD[dow(d)]) + '</th>';
  h += '</tr></thead><tbody>';
  const row = (name, role, carry, r, isMgr) => {
    let x = '<tr class="p"><td class="nm"><b>' + esc(name) + '</b><small>' + esc(role) + '</small></td><td class="cy">' + (carry ? '<i>' + esc(carry) + '</i>' : '') + '</td>';
    r.forEach((v, i) => {
      const d = i + 1, f = !isMgr && (forced[name] || []).includes(d), ho = !isMgr && (auto[name] || []).includes(d) && v === 'O', nt = (notes[name] || {})[d];
      const cls = (v === '연' || v === '대' ? 'L' : v) + (f ? ' f' : '') + (ho ? ' ho' : '');
      x += '<td class="pc' + (dow(d) === 1 && d > 1 ? ' mon' : '') + '">' + (v ? '<i class="' + cls + '">' + (v === '대' ? '대휴' : esc(v)) + '</i>' : '') + (nt ? '<span class="n">' + esc(nt) + '</span>' : '') + '</td>';
    });
    const any = r.some(v => v), sm = (n, first) => '<td class="sm' + (n ? '' : ' z') + (first ? ' first' : '') + '">' + (any ? n : '') + '</td>';
    return x + sm(cnt(r, 'A') + cnt(r, 'B') + cnt(r, 'D'), 1) + sm(cnt(r, 'E')) + sm(cnt(r, 'C')) + sm(cnt(r, 'O')) + sm(cnt(r, '연')) + sm(r.filter(v => WORK.includes(v)).length) + '<td class="sm">' + (any ? wkEnd - cnt(r, 'O') : '') + '</td></tr>';
  };
  if (MG.length) {
    h += '<tr class="grp"><td colspan="' + (nd + 9) + '">관리자</td></tr>';
    o.managers.forEach((n, i) => { h += row(n, '관리자', '', MG[i], true); });
  }
  h += '<tr class="grp"><td colspan="' + (nd + 9) + '">하우스맨<em>회색 = 휴무 · 빨간 테두리 = 신청 휴무</em></td></tr>';
  o.staff.forEach((s, p) => { h += row(s.name, (KIND[s.kind] || '') + (s.nightKey ? ' · 방편성' : ''), lbl(s.carry), G[p], false); });
  h += '</tbody><tfoot>';
  [['A', '주간 A'], ['E', 'E조'], ['C', '야간 C'], ['O', '휴무']].forEach(([k, t]) => {
    h += '<tr><td class="k" colspan="2">' + t + ' 인원</td>';
    for (let d = 0; d < nd; d++) {
      let n = 0; G.forEach(r => { let v = r[d]; if (v === 'B' || v === 'D') v = 'E'; if (v === '연') v = o.leaveMode === 'reduceA' ? '' : 'O'; if (v === k) n++; });
      h += '<td' + (dow(d + 1) === 1 && d > 0 ? ' class="mon"' : '') + '>' + n + '</td>';
    }
    h += '<td colspan="7"></td></tr>';
  });
  h += '</tfoot></table></div>';

  // ---- 범례 · 메모
  const memo = [];
  o.staff.map(s => s.name).concat(o.managers || []).forEach(n => Object.keys(notes[n] || {}).sort((a, b) => a - b).forEach(d => memo.push(o.month + '/' + d + ' ' + n + ' ' + notes[n][d])));
  h += '<div class="bt"><div class="lg">' +
    '<span><i style="background:#DCE9FB;color:#1B4F91">A</i>주간 09:00~18:00</span><span><i style="background:#FDEAD2;color:#B4650B">E</i>11:30~22:00</span>' +
    '<span><i style="background:#E7E1F6;color:#5B3E96">C</i>야간 22:00~09:00 (휴게 2시간)</span><span><i style="background:#FBE1E8;color:#B23A5C">B</i>09:00~22:00</span>' +
    '<span><i style="background:#DDF0EA;color:#1F7A5C">D</i>14:00~22:00</span><span><i style="background:#A6A6A6"></i>휴무</span>' +
    '<span><i style="background:#A6A6A6;box-shadow:inset 0 0 0 1.4pt #E02020"></i>신청 휴무</span><span><i style="background:#ECECEC;color:#444">연</i>연차</span>' +
    (holOff.length ? '<span><i style="background:#A6A6A6;box-shadow:inset 0 -1.4pt 0 #8B2E3F"></i>국공휴 휴무(누적 출근율 순)</span>' : '') + '</div>' +
    '<div style="text-align:right;color:#4B5568">전월 = 지난달 마지막 연속 근무 (주·야·휴 + 일수)<br>특근 = 토·일 수 − 휴무 · 근무 = A·E·C·B·D</div>' +
    (memo.length || ext.length ? '<div class="info">' + (ext.length ? '<b>인원 추가일</b>' + ext.slice().sort((a, b) => a - b).map(d => o.month + '/' + d).join(', ') + '　' : '') + (memo.length ? '<b>메모</b>' + esc(memo.join(' · ')) : '') + '</div>' : '') + '</div>';
  h += '<div class="foot"><span>객실 통합 관리 시스템 · 하우스맨 근무 스케줄</span><span>' + o.year + '.' + String(o.month).padStart(2, '0') + '</span></div>';
  return h;
}
