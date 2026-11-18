// 📊 결산 (2026-11-19) — 허브 첫 화면 '결산' 버튼 안. 월말에 내려받는 자료를 한곳에
//   ① 정비보조 월 출역표: 정비 지원 앱이 쓰는 출퇴근 기록(sup/{날짜}/rows, tab '근태')을 바로 읽어 표로 → 엑셀(.xlsx) 받기 · 인쇄
//      계산은 정비 지원 Apps Script monthSheet / attReduce_ 와 같음: 날짜·사람마다 아래 줄이 위 줄을 덮음,
//      칸 = "출근~퇴근" (퇴근 비면 미기록), * = 관리자가 입력·고친 날, 마지막 열 = 출근일수
//      (예전처럼 구글 시트에 '출역 YYYY-MM' 탭을 만들지 않음 — 정비 지원 앱의 '월 출역표 만들기'는 그대로 둠)
//   ② 연차 대장 출력 → 연차 · 근무 화면으로 가는 길만
// 읽기 아끼기: 버튼을 누를 때만, 그 달 날짜마다 '근태' 줄만 골라 읽음 (한 달 수백 건 = 몇 원)
export function setupClose(c) {
  const { S, esc, ymd } = c;
  const thisYm = () => ymd().slice(0, 7);
  const st = { ym: thisYm(), busy: false, err: '', res: null };
  const shiftYm = (ym, n) => { const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
  const nDays = ym => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
  const hmSeoul = t => { const d = new Date(Number(t) + 9 * 3600e3); return d.toISOString().slice(11, 16); };
  const clean = v => String(v == null ? '' : v).replace(/^'/, '').replace(/\s+/g, ' ').trim().slice(0, 20);
  const num = v => (typeof v === 'number' ? v : v instanceof Date ? v.getTime() : Date.parse(v) || 0);

  // 정비 지원 attReduce_ 와 같은 규칙 (출근 · 퇴근 · 퇴근취소 · 출근취소)
  function reduce(rows) {
    const out = {};
    rows.forEach(r => {
      const nm = clean(r[2]), kind = String(r[3] || '').trim(), by = String(r[6] || '').trim();
      if (!nm) return;
      const at = String(r[7] || '').replace(/^'/, '').trim() || r.__hm;
      const a = out[nm] = out[nm] || { in: '', out: '', fixed: 0 };
      if (by === '관리자') a.fixed++;
      if (kind === '출근') a.in = at;
      else if (kind === '퇴근') a.out = at;
      else if (kind === '퇴근취소') a.out = '';
      else if (kind === '출근취소') { a.in = ''; a.out = ''; }
    });
    return out;
  }
  async function make() {
    if (st.busy) return;
    const ym = st.ym, nd = nDays(ym), last = ym === thisYm() ? +ymd().slice(8, 10) : nd;
    if (ym > thisYm()) { st.err = '아직 오지 않은 달이에요.'; c.draw(); return; }
    st.busy = true; st.err = ''; st.res = null; c.draw();
    try {
      const days = Array.from({ length: last }, (_, i) => ym + '-' + String(i + 1).padStart(2, '0'));
      const got = await Promise.all(days.map(d => S.getQuery('sup/' + d + '/rows', [['tab', '==', '근태']])));
      const table = {}; let rowsN = 0;
      got.forEach((docs, i) => {
        const rows = docs.map(x => x.data || {}).filter(x => Array.isArray(x.row))
          .map(x => { const r = x.row.slice(); r.__t = num(x.at) || num(x.clientAt); r.__c = num(x.clientAt); r.__hm = r.__t ? hmSeoul(r.__t) : ''; return r; })
          .sort((a, b) => (a.__t - b.__t) || (a.__c - b.__c));
        rowsN += rows.length;
        const a = reduce(rows);
        Object.keys(a).forEach(n => { if (a[n].in) (table[n] = table[n] || {})[i + 1] = a[n].in + '~' + (a[n].out || '') + (a[n].fixed ? '*' : ''); });
      });
      const names = Object.keys(table).sort((x, y) => x.localeCompare(y, 'ko'));
      st.res = { ym, nd, names, table, rowsN, at: Date.now() };
    } catch (e) { st.err = '기록을 못 읽었어요: ' + (e && (e.code || e.message) || e); }
    st.busy = false; c.draw();
  }
  function grid(r) {
    const head = ['이름'].concat(Array.from({ length: r.nd }, (_, i) => (i + 1) + '일')).concat(['출근일수']);
    const body = r.names.map(n => [n].concat(Array.from({ length: r.nd }, (_, i) => r.table[n][i + 1] || '')).concat([Object.keys(r.table[n]).length]));
    return [head].concat(body);
  }
  const NOTE = '칸 = 출근~퇴근 시각 (퇴근 칸이 비면 퇴근 미기록) · * = 관리자가 입력·수정한 날';

  // ---------- 엑셀(.xlsx) 만들기 — 압축 없이 묶음 (엑셀·구글 시트·한셀 모두 열림)
  let CRC = null;
  function crc32(u8) { if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let x = n; for (let k = 0; k < 8; k++) x = x & 1 ? 0xEDB88320 ^ (x >>> 1) : x >>> 1; CRC[n] = x >>> 0; } }
    let x = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) x = CRC[(x ^ u8[i]) & 255] ^ (x >>> 8); return (x ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {
    const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
    files.forEach(([name, text]) => {
      const raw = enc.encode(text), nm = enc.encode(name), crc = crc32(raw);
      const h = new Uint8Array(30 + nm.length), hv = new DataView(h.buffer);
      hv.setUint32(0, 0x04034b50, true); hv.setUint16(4, 20, true); hv.setUint16(6, 0x0800, true); hv.setUint16(8, 0, true);
      hv.setUint32(14, crc, true); hv.setUint32(18, raw.length, true); hv.setUint32(22, raw.length, true); hv.setUint16(26, nm.length, true); h.set(nm, 30);
      const cd = new Uint8Array(46 + nm.length), cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, raw.length, true); cv.setUint32(24, raw.length, true); cv.setUint16(28, nm.length, true); cv.setUint32(42, off, true); cd.set(nm, 46);
      parts.push(h, raw); cen.push(cd); off += h.length + raw.length;
    });
    const cenLen = cen.reduce((s, x) => s + x.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, cenLen, true); ev.setUint32(16, off, true);
    return new Blob(parts.concat(cen, [end]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  const x = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function col(i) { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function xlsx(r) {
    const g = grid(r), title = '정비보조 월 출역표 ' + r.ym.replace('-', '년 ') + '월';
    const rows = [[title]].concat([[]], g, [[]], [[NOTE]]);
    const sheetRows = rows.map((row, ri) => '<row r="' + (ri + 1) + '">' + row.map((v, ci) => {
      const ref = col(ci) + (ri + 1), s = ri === 0 ? ' s="1"' : ri === 2 ? ' s="2"' : ri > 2 && ri < 3 + r.names.length ? ' s="3"' : '';
      return typeof v === 'number' ? '<c r="' + ref + '"' + s + '><v>' + v + '</v></c>' : v === '' && !s ? '' : '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t>' + x(v) + '</t></is></c>';
    }).join('') + '</row>').join('');
    const cols = '<cols><col min="1" max="1" width="10" customWidth="1"/><col min="2" max="' + (r.nd + 1) + '" width="11.5" customWidth="1"/><col min="' + (r.nd + 2) + '" max="' + (r.nd + 2) + '" width="8" customWidth="1"/></cols>';
    const ws = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="3" topLeftCell="B4" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>' + cols + '<sheetData>' + sheetRows + '</sheetData>' +
      '<pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';
    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="3"><font><sz val="10"/><name val="맑은 고딕"/></font><font><b/><sz val="14"/><name val="맑은 고딕"/></font><font><b/><sz val="10"/><name val="맑은 고딕"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF6"/></patternFill></fill></fills>' +
      '<borders count="2"><border/><border><left style="thin"><color rgb="FFB0B8C4"/></left><right style="thin"><color rgb="FFB0B8C4"/></right><top style="thin"><color rgb="FFB0B8C4"/></top><bottom style="thin"><color rgb="FFB0B8C4"/></bottom></border></borders>' +
      '<cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf/><xf fontId="1" applyFont="1"/><xf fontId="2" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
      '<xf borderId="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf></cellXfs></styleSheet>';
    return zip([
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="출역 ' + r.ym + '" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">\'출역 ' + r.ym + '\'!$A:$A,\'출역 ' + r.ym + '\'!$3:$3</definedName></definedNames></workbook>'],
      ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ['xl/worksheets/sheet1.xml', ws.replace('<sheetViews>', '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews>')],
      ['xl/styles.xml', styles]
    ]);
  }
  function download(r) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(xlsx(r)); a.download = '정비보조_출역_' + r.ym + '.xlsx';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function printIt(r) {
    const g = grid(r), w = window.open('', '_blank');
    if (!w) { alert('새 창이 막혔어요. 주소창 오른쪽에서 팝업을 허용해 주세요.'); return; }
    w.document.write('<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>정비보조 출역 ' + esc(r.ym) + '</title><style>@page{size:A4 landscape;margin:8mm}body{font-family:system-ui,"맑은 고딕",sans-serif;margin:0}h1{font-size:15px;margin:0 0 6px}' +
      'table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:7.5px}th,td{border:1px solid #9AA4B2;padding:2px 1px;text-align:center;white-space:nowrap;overflow:hidden}th{background:#E8EEF6}td:first-child,th:first-child{width:52px;font-size:9px;font-weight:700}td:last-child,th:last-child{width:34px;font-size:9px;font-weight:700}p{font-size:9px;color:#555;margin:6px 0 0}</style></head><body>' +
      '<h1>정비보조 월 출역표 · ' + esc(r.ym.replace('-', '년 ')) + '월</h1><table><thead><tr>' + g[0].map(h => '<th>' + esc(String(h).replace('일', '')) + '</th>').join('') + '</tr></thead><tbody>' +
      g.slice(1).map(row => '<tr>' + row.map(v => '<td>' + esc(String(v).replace('~', '\n~')).replace('\n', '<br>') + '</td>').join('') + '</tr>').join('') + '</tbody></table><p>' + esc(NOTE) + '</p>' +
      '<script>onload=function(){setTimeout(function(){print()},200)}<\/script></body></html>');
    w.document.close();
  }

  function html() {
    const r = st.res && st.res.ym === st.ym ? st.res : null;
    let h = '<div class="card"><h2>🧾 정비보조 월 출역표</h2><p class="note" style="margin:0 0 12px">정비 지원 앱 출퇴근 기록으로 한 달 표를 만들어요. 엑셀로 받거나 바로 인쇄할 수 있어요.</p>' +
      '<div class="cl-ym"><button class="ref" data-cl="prev" aria-label="이전 달">‹</button><b>' + esc(st.ym.replace('-', '년 ')) + '월</b><button class="ref" data-cl="next" aria-label="다음 달"' + (st.ym >= thisYm() ? ' disabled' : '') + '>›</button></div>' +
      '<button class="big-btn" style="margin-top:12px" data-cl="make"' + (st.busy ? ' disabled' : '') + '>' + (st.busy ? '읽는 중…' : r ? '↻ 다시 만들기' : '출역표 만들기') + '</button>';
    if (st.err) h += '<p class="err">' + esc(st.err) + '</p>';
    if (r) {
      if (!r.names.length) h += '<p class="note" style="margin:12px 0 0">이 달에는 앱 출근 기록이 없어요. 앱으로 옮기기 전 달이면 정비 지원 앱 관리자 화면의 「월 출역표 만들기」(구글 시트)를 써 주세요.</p>';
      else {
        h += '<p class="note" style="margin:12px 0 6px">' + r.names.length + '명 · 기록 ' + r.rowsN + '줄' + (r.ym === thisYm() ? ' · 오늘까지' : '') + '</p><div class="cl-wrap"><table class="cl-t"><thead><tr><th>이름</th><th>출근일수</th></tr></thead><tbody>' +
          r.names.map(n => '<tr><td>' + esc(n) + '</td><td>' + Object.keys(r.table[n]).length + '일</td></tr>').join('') + '</tbody></table></div>' +
          '<div class="cl-acts"><button class="big-btn" data-cl="xlsx">⬇ 엑셀로 받기</button><button class="big-btn sec" data-cl="print">🖨 인쇄 (A4 가로)</button></div>' +
          '<p class="note" style="margin:8px 0 0">' + esc(NOTE) + '</p>';
      }
    }
    h += '</div><div class="card"><h2>📋 연차 대장</h2><p class="note" style="margin:0 0 12px">룸메이드 연차 대장(A4 가로)과 월별 잔여 안내는 연차 · 근무 화면의 「대장 출력」에서 뽑아요.</p><a class="big-btn sec linkbtn" href="./leave/">연차 · 근무 열기</a></div>';
    return h;
  }
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('[data-cl]'); if (!t) return;
    const k = t.getAttribute('data-cl');
    if (k === 'prev') { st.ym = shiftYm(st.ym, -1); st.err = ''; c.draw(); }
    else if (k === 'next') { if (st.ym < thisYm()) st.ym = shiftYm(st.ym, 1); st.err = ''; c.draw(); }
    else if (k === 'make') make();
    else if (k === 'xlsx' && st.res) download(st.res);
    else if (k === 'print' && st.res) printIt(st.res);
  });
  return { html, _reduce: reduce, _xlsx: xlsx };
}
