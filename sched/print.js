// hub/sched/print.js — 🖨️ 근무 스케줄 인쇄 · PDF (2026-11-22)
// A4 가로 한 장: 옛 엑셀 근무스케줄 양식(관리자 → 하우스맨, 전월 라벨, 일자별 코드, 휴무신청 빨간 테두리, 개인 합계, 일자별 인원)을 그대로 살리고
// 글꼴 · 칸 · 색을 인쇄용으로 다시 맞춤. 브라우저 인쇄 창에서 'PDF로 저장'을 고르면 글자가 깨지지 않는 PDF(벡터)가 됨
// 쓰는 곳: sched/sched.js (편성) · sched/view.js (보기) — printSchedule({ year, month, staff, managers, codeOf, mgr, forced, notes, holidays, extra, state, leaveMode })
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const WORK = ['A', 'E', 'C', 'B', 'D'];
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lbl = c => c && c.n ? ({ A: '주', C: '야', O: '휴' }[c.type] || '') + c.n : '';

const CSS = `
#schPrint{display:none}
@media print{
  @page{size:A4 landscape;margin:7mm 7mm 6mm}
  html,body{background:#fff!important}
  body>*:not(#schPrint){display:none!important}
  #schPrint{display:block;color:#111;font-family:"Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
#schPrint .hd{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1.6pt solid #10233F;padding:0 0 2.2mm;margin:0 0 2.4mm}
#schPrint .hd h1{margin:0;font-size:17pt;font-weight:900;letter-spacing:-.3pt;color:#10233F}
#schPrint .hd h1 small{font-size:9pt;font-weight:700;color:#8a6d2f;margin-left:3mm;letter-spacing:0}
#schPrint .hd .meta{font-size:7.6pt;color:#5A6472;text-align:right;line-height:1.35}
#schPrint .hd .st{display:inline-block;padding:.4mm 2.4mm;border-radius:2mm;background:#10233F;color:#fff;font-weight:800;font-size:7.6pt;margin-left:1.5mm}
#schPrint .hd .st.d{background:#fff;color:#B23A48;border:.6pt solid #B23A48}
#schPrint table{width:100%;border-collapse:collapse;table-layout:fixed}
#schPrint td,#schPrint th{border:.5pt solid #B9C3D1;text-align:center;vertical-align:middle;padding:0;overflow:hidden;white-space:nowrap}
#schPrint thead th{background:#1F3864;color:#fff;font-size:7.8pt;font-weight:700;height:5.2mm;line-height:1.05}
#schPrint thead tr.w th{background:#F3F5F8;color:#333;font-weight:700;height:4mm}
#schPrint thead th.sat,#schPrint thead tr.w th.sat{background:#DCE7F5;color:#1F4E79}
#schPrint thead th.sun,#schPrint thead tr.w th.sun{background:#F7DDE1;color:#8B2E3F}
#schPrint thead th.hol{background:#8B2E3F;color:#fff}
#schPrint thead th.ext{background:#F6E7B8;color:#6b4e00}
#schPrint tbody td{height:8.4mm;font-size:10.2pt;font-weight:800}
#schPrint tbody td.nm{text-align:left;padding-left:1.8mm;font-size:9.6pt;font-weight:900}
#schPrint tbody td.cy{font-size:7pt;font-weight:600;color:#5A6472}
#schPrint tbody td.sm{font-size:8.4pt;font-weight:800;background:#FAFBFC}
#schPrint tbody td.sm.z{color:#B0B7C3;font-weight:500}
#schPrint tr.grp td{height:4.2mm;font-size:6.8pt;font-weight:800;color:#5A6472;background:#EEF1F5;text-align:left;padding-left:1.6mm;border-left:0;border-right:0}
#schPrint td.A{background:#DCE9FB;color:#1B4F91}#schPrint td.E{background:#FDEAD2;color:#B4650B}#schPrint td.C{background:#E7E1F6;color:#5B3E96}
#schPrint td.B{background:#FBE1E8;color:#B23A5C}#schPrint td.D{background:#DDF0EA;color:#1F7A5C}#schPrint td.O{background:#A6A6A6;color:#A6A6A6;font-weight:800}
#schPrint td.L{background:#ECECEC;color:#444;font-size:7pt}
#schPrint td.sat0{background-image:linear-gradient(#0000,#0000)}
#schPrint td.f{outline:1.8pt solid #E02020;outline-offset:-1.8pt}#schPrint td.f.O{color:#A6A6A6;font-weight:900}
#schPrint td .n{display:block;font-size:5pt;font-weight:700;line-height:1;margin-top:.2mm;color:#333;white-space:normal}
#schPrint tfoot td{height:5mm;font-size:7.2pt;font-weight:700;color:#333;background:#F7F8FA}
#schPrint tfoot td.k{text-align:left;padding-left:1.6mm;font-weight:900}
#schPrint tfoot td.x{color:#fff;background:#B23A48}
#schPrint .ft{display:flex;gap:6mm;justify-content:space-between;margin-top:2.2mm;font-size:7.2pt;color:#333;line-height:1.45}
#schPrint .lg span{display:inline-block;margin-right:3.2mm;white-space:nowrap}
#schPrint .lg i{display:inline-block;width:4.6mm;height:3.4mm;line-height:3.4mm;text-align:center;font-style:normal;font-weight:900;border-radius:.6mm;margin-right:1mm;font-size:6.8pt}
#schPrint .memo{max-width:46%;color:#5A6472}
#schPrint .foot{margin-top:1.4mm;font-size:6.4pt;color:#8C99A8;display:flex;justify-content:space-between;border-top:.5pt solid #DDE3EA;padding-top:1mm}
`;

const stamp = () => { const t = new Date(Date.now() + 9 * 3600e3).toISOString(); return t.slice(0, 10).replace(/-/g, '.') + ' ' + t.slice(11, 16); };

export function printSchedule(o) {
  if (!document.getElementById('schPrintCss')) { const st = document.createElement('style'); st.id = 'schPrintCss'; st.textContent = CSS; document.head.appendChild(st); }
  let box = document.getElementById('schPrint');
  if (!box) { box = document.createElement('div'); box.id = 'schPrint'; document.body.appendChild(box); }
  box.innerHTML = html(o);
  const t = document.title; document.title = o.year + '년 ' + o.month + '월 하우스맨 근무스케줄';
  setTimeout(() => { window.print(); setTimeout(() => { document.title = t; }, 500); }, 60);
}

function html(o) {
  const nd = new Date(o.year, o.month, 0).getDate(), dow = d => new Date(o.year, o.month - 1, d).getDay();
  const hol = o.holidays || [], ext = o.extra || [], forced = o.forced || {}, notes = o.notes || {}, mgr = o.mgr || {};
  const wkEnd = Array.from({ length: nd }, (_, i) => dow(i + 1)).filter(w => w === 0 || w === 6).length;
  const dayW = nd === 31 ? 6.15 : 6.35;
  let h = '<div class="hd"><h1>' + o.year + '년 ' + o.month + '월 근무스케줄<small>한화리조트 해운대 · 하우스키핑</small></h1><div class="meta">' +
    (o.state === '확정' ? '<span class="st">확정</span>' : '<span class="st d">편성 중 (미확정)</span>') + '<br>출력 ' + stamp() + '</div></div>';
  h += '<table><colgroup><col style="width:15mm"><col style="width:8mm">' + Array.from({ length: nd }, () => '<col style="width:' + dayW + 'mm">').join('') +
    '<col style="width:6.4mm"><col style="width:6.4mm"><col style="width:6.4mm"><col style="width:6.4mm"><col style="width:6.4mm"><col style="width:7.4mm"><col style="width:7.4mm"></colgroup>';
  h += '<thead><tr><th rowspan="2">성명</th><th rowspan="2">전월</th>';
  for (let d = 1; d <= nd; d++) { const w = dow(d); h += '<th class="' + (hol.includes(d) ? 'hol' : ext.includes(d) ? 'ext' : w === 6 ? 'sat' : w === 0 ? 'sun' : '') + '">' + d + '</th>'; }
  h += '<th rowspan="2">A</th><th rowspan="2">E</th><th rowspan="2">C</th><th rowspan="2">휴무</th><th rowspan="2">연차</th><th rowspan="2">근무<br>일수</th><th rowspan="2">특근</th></tr><tr class="w">';
  for (let d = 1; d <= nd; d++) { const w = dow(d); h += '<th class="' + (hol.includes(d) ? 'hol' : ext.includes(d) ? 'ext' : w === 6 ? 'sat' : w === 0 ? 'sun' : '') + '">' + (hol.includes(d) ? '공휴' : ext.includes(d) ? '+1' : WD[w]) + '</th>'; }
  h += '</tr></thead><tbody>';
  const row = (name, sub, r, isMgr) => {
    const c = k => r.filter(x => x === k).length, work = r.filter(x => WORK.includes(x)).length, any = r.some(x => x);
    let x = '<tr><td class="nm">' + esc(name) + '</td><td class="cy">' + esc(sub) + '</td>';
    r.forEach((v, i) => {
      const f = !isMgr && (forced[name] || []).includes(i + 1), nt = (notes[name] || {})[i + 1];
      x += '<td class="' + (v === '연' || v === '대' ? 'L' : v) + (f ? ' f' : '') + '">' + (v === '대' ? '대휴' : esc(v)) + (nt ? '<span class="n">' + esc(nt).slice(0, 4) + '</span>' : '') + '</td>';
    });
    const sm = n => '<td class="sm' + (n ? '' : ' z') + '">' + (any ? n : '') + '</td>';
    return x + sm(c('A') + c('B') + c('D')) + sm(c('E')) + sm(c('C')) + sm(c('O')) + sm(c('연')) + sm(work) + '<td class="sm">' + (any ? wkEnd - c('O') : '') + '</td></tr>';
  };
  if ((o.managers || []).length) {
    h += '<tr class="grp"><td colspan="' + (nd + 9) + '">관리자</td></tr>';
    o.managers.forEach(n => { h += row(n, '', Array.from({ length: nd }, (_, d) => (mgr[n] || {})[d + 1] || o.mgrDefault || ''), true); });
    h += '<tr class="grp"><td colspan="' + (nd + 9) + '">하우스맨</td></tr>';
  }
  const G = o.staff.map(s => Array.from({ length: nd }, (_, d) => o.codeOf(s.name, d) || ''));
  o.staff.forEach((s, p) => { h += row(s.name, lbl(s.carry), G[p], false); });
  h += '</tbody><tfoot>';
  [['A', '주간 A'], ['E', 'E조'], ['C', '야간 C'], ['O', '휴무']].forEach(([k, t]) => {
    h += '<tr><td class="k" colspan="2">' + t + ' 인원</td>';
    for (let d = 0; d < nd; d++) {
      let n = 0; G.forEach(r => { let v = r[d]; if (v === 'B' || v === 'D') v = 'E'; if (v === '연') v = o.leaveMode === 'reduceA' ? '' : 'O'; if (v === k) n++; });
      h += '<td>' + n + '</td>';
    }
    h += '<td colspan="7"></td></tr>';
  });
  h += '</tfoot></table>';
  const memo = [];
  o.staff.concat((o.managers || []).map(n => ({ name: n }))).forEach(s => Object.keys(notes[s.name] || {}).sort((a, b) => a - b).forEach(d => memo.push(o.month + '/' + d + ' ' + s.name + ' ' + notes[s.name][d])));
  h += '<div class="ft"><div class="lg">' +
    '<span><i style="background:#DCE9FB;color:#1B4F91">A</i>주간 09:00~18:00</span><span><i style="background:#FDEAD2;color:#B4650B">E</i>11:30~22:00</span>' +
    '<span><i style="background:#E7E1F6;color:#5B3E96">C</i>야간 22:00~09:00 (휴게 2시간)</span><span><i style="background:#FBE1E8;color:#B23A5C">B</i>09:00~22:00</span>' +
    '<span><i style="background:#DDF0EA;color:#1F7A5C">D</i>14:00~22:00</span><span><i style="background:#A6A6A6;color:#A6A6A6">O</i>휴무</span><span><i style="background:#ECECEC;color:#444">연</i>연차</span>' +
    '<span><i style="background:#A6A6A6;color:#A6A6A6;outline:1.4pt solid #E02020;outline-offset:-1.4pt">O</i>신청 휴무</span>' +
    (hol.length ? '<br><b>국공휴일</b> ' + hol.slice().sort((a, b) => a - b).map(d => o.month + '/' + d + '(' + WD[dow(d)] + ')').join(', ') : '') +
    (ext.length ? ' · <b>인원 추가일</b> ' + ext.slice().sort((a, b) => a - b).map(d => o.month + '/' + d).join(', ') : '') +
    '</div>' + (memo.length ? '<div class="memo"><b>메모</b> ' + esc(memo.join(' · ')) + '</div>' : '') + '</div>' +
    '<div class="foot"><span>특근 = 그 달 토·일 수(' + wkEnd + ') − 휴무 · 근무일수 = A·E·C·B·D</span><span>객실 통합 관리 시스템 · 하우스맨 근무 스케줄</span></div>';
  return h;
}
