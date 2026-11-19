// 엑셀(.xlsx) 만들기 (2026-11-19) — 결산 문서용 작은 도구. 압축 없이 묶음 (엑셀 · 구글 시트 · 한셀 모두 열림)
// book([{ name, rows: [[{v, s}]], cols: [폭…], merge: ['A1:C1'], freeze: 머리줄 행 번호 }]) → Blob
// s(모양) = title · sub · head · cell · cellb · num · won · wrap · in · out · carry · done · kpil · kpiv · sec · subr · foot · tot
// heights: { 행번호(0부터): 높이 } — 합친 칸은 엑셀이 높이를 저절로 못 맞춰서 직접 줌
const ST = ['', 'title', 'sub', 'head', 'cell', 'cellb', 'num', 'won', 'wrap', 'in', 'out', 'carry', 'done', 'kpil', 'kpiv', 'sec', 'subr', 'foot', 'tot'];
let CRC = null;
function crc32(u8) {
  if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let x = n; for (let k = 0; k < 8; k++) x = x & 1 ? 0xEDB88320 ^ (x >>> 1) : x >>> 1; CRC[n] = x >>> 0; } }
  let x = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) x = CRC[(x ^ u8[i]) & 255] ^ (x >>> 8); return (x ^ 0xFFFFFFFF) >>> 0;
}
function zip(files) {
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
  files.forEach(([name, text]) => {
    const raw = enc.encode(text), nm = enc.encode(name), crc = crc32(raw);
    const h = new Uint8Array(30 + nm.length), hv = new DataView(h.buffer);
    hv.setUint32(0, 0x04034b50, true); hv.setUint16(4, 20, true); hv.setUint16(6, 0x0800, true);
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
const x = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
export function col(i) { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
const FONT = 'Malgun Gothic';
const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>' +
  '<fonts count="11"><font><sz val="10"/><name val="' + FONT + '"/></font><font><b/><sz val="16"/><color rgb="FF0E1E36"/><name val="' + FONT + '"/></font><font><sz val="9"/><color rgb="FF6B7280"/><name val="' + FONT + '"/></font>' +
  '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="' + FONT + '"/></font><font><b/><sz val="10"/><name val="' + FONT + '"/></font><font><b/><sz val="10"/><color rgb="FFB91C1C"/><name val="' + FONT + '"/></font><font><b/><sz val="10"/><color rgb="FF047857"/><name val="' + FONT + '"/></font>' +
  '<font><sz val="9"/><color rgb="FF4B5563"/><name val="' + FONT + '"/></font><font><b/><sz val="14"/><color rgb="FF111827"/><name val="' + FONT + '"/></font><font><b/><sz val="12"/><color rgb="FF0E1E36"/><name val="' + FONT + '"/></font><font><sz val="8.5"/><color rgb="FF6B7280"/><name val="' + FONT + '"/></font></fonts>' +
  '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0E1E36"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF7F9FC"/></patternFill></fill></fills>' +
  '<borders count="5"><border/><border><bottom style="thin"><color rgb="FFD6DCE5"/></bottom></border><border><bottom style="medium"><color rgb="FF0E1E36"/></bottom></border>' +
  '<border><left style="thick"><color rgb="FF0E1E36"/></left></border><border><left style="thin"><color rgb="FFD6DCE5"/></left><right style="thin"><color rgb="FFD6DCE5"/></right><top style="thin"><color rgb="FFD6DCE5"/></top><bottom style="thin"><color rgb="FFD6DCE5"/></bottom></border></borders>' +
  '<cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="19">' +
  '<xf/>' +
  '<xf fontId="1" borderId="2" applyFont="1" applyBorder="1"/>' +                                                                     // title
  '<xf fontId="2" applyFont="1"/>' +                                                                                                  // sub
  '<xf fontId="3" fillId="2" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' + // head
  '<xf borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>' +                                             // cell
  '<xf fontId="4" borderId="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>' +                    // cellb
  '<xf borderId="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>' +          // num
  '<xf numFmtId="164" borderId="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>' +        // won
  '<xf borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +                                // wrap
  '<xf fontId="6" borderId="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>' + // in
  '<xf fontId="5" borderId="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>' + // out
  '<xf fontId="5" borderId="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +       // carry
  '<xf fontId="6" borderId="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>' + // done
  '<xf fontId="7" fillId="3" borderId="4" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="bottom" indent="1"/></xf>' +   // kpil
  '<xf fontId="8" fillId="3" borderId="4" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>' +   // kpiv
  '<xf fontId="9" borderId="3" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>' +                        // sec
  '<xf fontId="2" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="bottom" wrapText="1"/></xf>' +                             // subr
  '<xf fontId="10" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +                                                   // foot
  '<xf fontId="4" numFmtId="164" borderId="2" applyFont="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>' + // tot
  '</cellXfs></styleSheet>';
function sheetXml(sh) {
  const rows = sh.rows.map((row, ri) => {
    const cells = (row || []).map((c, ci) => {
      if (c == null) return '';
      const v = c.v, s = ST.indexOf(c.s || 'cell'), ref = col(ci) + (ri + 1), sa = s > 0 ? ' s="' + s + '"' : '';
      if (v === '' || v == null) return sa ? '<c r="' + ref + '"' + sa + '/>' : '';
      if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + sa + '><v>' + v + '</v></c>';
      return '<c r="' + ref + '"' + sa + ' t="inlineStr"><is><t xml:space="preserve">' + x(v) + '</t></is></c>';
    }).join('');
    const hv = sh.heights && sh.heights[ri];
    const ht = hv ? ' ht="' + hv + '" customHeight="1"' : ri === 0 ? ' ht="26" customHeight="1"' : (row || []).some(c => c && c.s === 'head') ? ' ht="22" customHeight="1"' : '';
    return '<row r="' + (ri + 1) + '"' + ht + '>' + cells + '</row>';
  }).join('');
  const cols = sh.cols ? '<cols>' + sh.cols.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>' : '';
  const pane = sh.freeze ? '<pane ySplit="' + sh.freeze + '" topLeftCell="A' + (sh.freeze + 1) + '" activePane="bottomLeft" state="frozen"/>' : '';
  const merge = sh.merge && sh.merge.length ? '<mergeCells count="' + sh.merge.length + '">' + sh.merge.map(m => '<mergeCell ref="' + m + '"/>').join('') + '</mergeCells>' : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    '<sheetViews><sheetView workbookViewId="0" showGridLines="0">' + pane + '</sheetView></sheetViews>' + cols + '<sheetData>' + rows + '</sheetData>' + merge +
    '<pageMargins left="0.35" right="0.35" top="0.45" bottom="0.45" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';
}
export function book(sheets) {
  const n = sheets.length, safe = s => String(s).replace(/[\\\/?*\[\]:]/g, ' ').slice(0, 31);
  const files = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map((s, i) => '<sheet name="' + x(safe(s.name)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets>' +
      (sheets.some(s => s.freeze) ? '<definedNames>' + sheets.map((s, i) => s.freeze ? '<definedName name="_xlnm.Print_Titles" localSheetId="' + i + '">\'' + x(safe(s.name)) + '\'!$' + s.freeze + ':$' + s.freeze + '</definedName>' : '').join('') + '</definedNames>' : '') + '</workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
      '<Relationship Id="rId' + (n + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', STYLES]
  ].concat(sheets.map((s, i) => ['xl/worksheets/sheet' + (i + 1) + '.xml', sheetXml(s)]));
  return zip(files);
}
