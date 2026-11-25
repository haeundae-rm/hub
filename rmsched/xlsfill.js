// xlsfill.js — 지금 쓰는 엑셀 '룸메이드 스케줄표' 양식(template.xlsx) 그대로 내려받기 (2026-11-25)
// 양식 파일의 서식 · 수식 · 조건부 서식 · 입력 목록 · 그림 · 다른 시트는 그대로 두고, 입력 칸 값만 바꿔 넣음
// (허브 fillxlsx.js 와 같은 방법: zip 을 풀어 시트 xml 만 고치고 나머지는 원본 바이트 그대로)
//  · 주간 스케줄 · 변경금지: 기준일 · 만근 · 객실수 · 주차 · 직원 줄(9~59행) · 작업객실(63~67) · 일별 요약(72~77) · 정비보조(86~98)
//  · 일일 스케줄: 그 날짜 · 유닛 수정 · 더티수량 · 재입실 · 인계사항 / 공지용: 주차 · 입사일 / HK 전파: 수식이라 엑셀이 열 때 다시 계산
// fillSchedule(templateBytes, week, dayIndex) → Uint8Array (xlsx)
const enc = new TextEncoder(), dec = new TextDecoder();
async function inflateRaw(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); }
async function deflateRaw(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); }
let CRC;
function crc32(u8) { if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

// ---------- zip 읽기 · 쓰기
export async function readZip(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); let e = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('엑셀(xlsx) 양식 파일이 아니에요');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const files = [];
  for (let k = 0; k < n; k++) {
    const fl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + fl)), method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), off = dv.getUint32(p + 42, true);
    const s = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), raw = u8.subarray(s, s + csize);
    files.push({ name, data: method === 0 ? raw.slice() : await inflateRaw(raw) });
    p += 46 + fl + xl + cl;
  }
  return files;
}
export async function writeZip(files) {
  const parts = [], cds = []; let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), raw = f.data, comp = await deflateRaw(raw), crc = crc32(raw);
    const h = new Uint8Array(30 + name.length), hv = new DataView(h.buffer);
    hv.setUint32(0, 0x04034b50, true); hv.setUint16(4, 20, true); hv.setUint16(6, 0x0800, true); hv.setUint16(8, 8, true); hv.setUint16(10, 0, true); hv.setUint16(12, 0x21, true);
    hv.setUint32(14, crc, true); hv.setUint32(18, comp.length, true); hv.setUint32(22, raw.length, true); hv.setUint16(26, name.length, true); h.set(name, 30);
    const c = new Uint8Array(46 + name.length), cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 8, true); cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, comp.length, true); cv.setUint32(24, raw.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, off, true); c.set(name, 46);
    parts.push(h, comp); cds.push(c); off += h.length + comp.length;
  }
  const cdSize = cds.reduce((a, c) => a + c.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, off, true);
  const out = new Uint8Array(off + cdSize + 22); let p = 0;
  for (const a of parts.concat(cds, [end])) { out.set(a, p); p += a.length; }
  return out;
}

// ---------- 시트 xml 칸 바꾸기 (스타일 s 는 그대로)
const xesc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colNum = c => c.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
const splitRef = r => { const m = /^([A-Z]+)(\d+)$/.exec(r); return [m[1], Number(m[2])]; };
function cellXml(ref, s, v) {
  const sa = s ? ` s="${s}"` : '';
  if (v == null || v === '') return `<c r="${ref}"${sa}/>`;
  if (typeof v === 'object' && v.f) return `<c r="${ref}"${sa}><f>${xesc(v.f)}</f></c>`;
  if (typeof v === 'number') return `<c r="${ref}"${sa}><v>${v}</v></c>`;
  return `<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${xesc(v)}</t></is></c>`;
}
// map: { 'E9': '이분남', 'H9': 9, 'G9': null, ... }
export function setCells(xml, map) {
  const byRow = {};
  Object.keys(map).forEach(ref => { const [, r] = splitRef(ref); (byRow[r] = byRow[r] || []).push(ref); });
  Object.keys(byRow).map(Number).sort((a, b) => a - b).forEach(r => {
    const reRow = new RegExp(`<row r="${r}"([^>]*?)(/>|>([\\s\\S]*?)</row>)`);
    let m = reRow.exec(xml), body, attrs;
    if (!m) {   // 줄이 없으면 알맞은 자리에 새로 만듦
      const rows = [...xml.matchAll(/<row r="(\d+)"/g)], next = rows.find(x => Number(x[1]) > r);
      const nr = `<row r="${r}"></row>`;
      if (next) xml = xml.slice(0, next.index) + nr + xml.slice(next.index); else xml = xml.replace('</sheetData>', nr + '</sheetData>');
      m = reRow.exec(xml);
    }
    attrs = m[1]; body = m[3] || '';
    byRow[r].forEach(ref => {
      const reC = new RegExp(`<c r="${ref}"([^>]*?)(/>|>[\\s\\S]*?</c>)`), cm = reC.exec(body);
      const s = cm ? ((/ s="(\d+)"/.exec(cm[1]) || [])[1] || '') : '';
      const nx = cellXml(ref, s, map[ref]);
      if (cm) body = body.slice(0, cm.index) + nx + body.slice(cm.index + cm[0].length);
      else {   // 칸이 없으면 열 순서에 맞춰 끼움
        const cn = colNum(splitRef(ref)[0]), cells = [...body.matchAll(/<c r="([A-Z]+)\d+"/g)], after = cells.find(x => colNum(x[1]) > cn);
        body = after ? body.slice(0, after.index) + nx + body.slice(after.index) : body + nx;
      }
    });
    xml = xml.slice(0, m.index) + `<row r="${r}"${attrs}>${body}</row>` + xml.slice(m.index + m[0].length);
  });
  return xml;
}
// 수식 칸의 저장된 값은 지움 → 엑셀이 열 때 새로 계산 (예전 값이 잠깐이라도 보이지 않게)
export function dropCachedValues(xml) {
  return xml.replace(/<c ([^>]*?)>(<f[\s\S]*?<\/f>|<f[^>]*\/>)<v>[\s\S]*?<\/v><\/c>/g, (all, a, f) => `<c ${a.replace(/ t="(str|e|b|n)"/, '')}>${f}</c>`);
}
// 공유 문자열(sharedStrings)을 칸 안 글자로 옮김 — 양식 파일에 지난 이름이 남지 않게
export function inlineShared(xml, sst) {
  return xml.replace(/<c ([^>]*?)t="s"([^>]*?)><v>(\d+)<\/v><\/c>/g, (all, a, b, i) => `<c ${a}t="inlineStr"${b}><is><t xml:space="preserve">${xesc(sst[Number(i)] || '')}</t></is></c>`);
}
export function parseSst(xml) {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
}

// ---------- 일정 → 칸
const serial = ymd => { if (!ymd) return null; const [y, m, d] = ymd.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5); };
const N = v => (typeof v === 'number' && isFinite(v)) ? v : null;
const SC = ['G', 'I', 'K', 'M', 'O', 'Q', 'S'], UC = ['H', 'J', 'L', 'N', 'P', 'R', 'T'];
// 시트마다 줄 위치: 주간 스케줄(직원 9~59 · 작업 63 · 요약 72 · 정비보조 86), 변경금지(옛 양식: 직원 9~55 · 작업 59 · 요약 68 · 정비보조 82)
const LAYOUT = { main: { nRows: 51, work: 63, sum: 72, help: 86 }, old: { nRows: 47, work: 59, sum: 68, help: 82 } };
function weeklyMap(w, L = LAYOUT.main) {
  const M = { C4: serial(w.mon), I4: N(w.fullDays), M4: N(w.rooms) };
  const rows = w.rows.filter(r => r.name);
  for (let i = 0; i < L.nRows; i++) {
    const r = rows[i], R = 9 + i;
    M['A' + R] = r ? r.group || null : null; M['B' + R] = r ? serial(r.joined) : null; M['D' + R] = r ? N(r.ord) : null; M['E' + R] = r ? r.name : null;
    for (let d = 0; d < 7; d++) { M[SC[d] + R] = r ? r.st[d] || null : null; M[UC[d] + R] = r ? N(r.u[d]) : null; }
    M['X' + R] = r ? N(r.prev) : null; M['AA' + R] = r ? r.memo || null : null;
  }
  for (let i = 0; i < 5; i++) {
    const x = (w.work || [])[i], R = L.work + i;
    M['B' + R] = x ? x.name || null : null; for (let d = 0; d < 7; d++) M[SC[d] + R] = x ? N(x.d[d]) : null; M['X' + R] = x ? x.resume || null : null;
  }
  const SV = SC.concat('V');
  [['res', 0], ['co', 1], ['inroom', 2], ['stay', 3], ['carry', 4], ['spare', 5]].map(([k, o]) => [k, L.sum + o]).forEach(([k, R]) => SV.forEach((c, d) => { M[c + R] = N(((w.sum || {})[k] || [])[d]); }));
  for (let i = 0; i < 13; i++) {
    const h = (w.helpers || [])[i], R = L.help + i;
    M['B' + R] = h ? h.name : null; M['D' + R] = h ? (h.can || 'x') : null; for (let d = 0; d < 7; d++) M[SC[d] + R] = h && h.d[d] ? '출근' : null;
  }
  return M;
}
function dailyMap(w, di) {
  const date = addDays(w.mon, di), D = (w.daily || {})[date] || {}, rows = w.rows.filter(r => r.name), M = { D4: serial(date) };
  for (let i = 0; i < 50; i++) { const r = rows[i], R = 7 + i; M['G' + R] = r && D.edit ? N(D.edit[r.id]) : null; M['H' + R] = r && D.dirty ? N(D.dirty[r.id]) : null; }
  M.I19 = N(D.stayTot); M.J19 = N(D.sale); M.K19 = N(D.look); M.I22 = D.note || null;
  return M;
}
function addDays(s, n) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d) + n * 864e5).toISOString().slice(0, 10); }
const fixWeekNo = (xml, no) => xml.replace(/(<c r="C2"[^>]*><f>[^<]*?&amp;)\d+(&amp;&quot;주차)/, `$1${no}$2`);

export async function fillSchedule(tplBytes, w, di) {
  const over = w.rows.filter(r => r.name).length;
  if (over > 51) throw new Error('엑셀 양식에는 직원이 51명까지만 들어가요 (지금 ' + over + '명)');
  const files = await readZip(tplBytes), get = n => files.find(f => f.name === n);
  // 시트 이름 → 파일
  const wb = dec.decode(get('xl/workbook.xml').data), rels = dec.decode(get('xl/_rels/workbook.xml.rels').data);
  const sheetFile = name => { const m = new RegExp(`<sheet name="${name}"[^>]*r:id="(rId\\d+)"`).exec(wb); if (!m) return null; const t = new RegExp(`Id="${m[1]}"[^>]*Target="([^"]+)"`).exec(rels) || new RegExp(`Target="([^"]+)"[^>]*Id="${m[1]}"`).exec(rels); return t ? 'xl/' + t[1].replace(/^\/?xl\//, '') : null; };
  const edit = (name, fn) => { const p = sheetFile(name); if (!p) return; const f = get(p); f.data = enc.encode(dropCachedValues(fn(dec.decode(f.data)))); };
  const W = weeklyMap(w);
  edit('주간 스케줄', x => fixWeekNo(setCells(x, W), w.no));
  edit('변경금지', x => fixWeekNo(setCells(x, weeklyMap(w, LAYOUT.old)), w.no));
  edit('일일 스케줄', x => setCells(x, dailyMap(w, di)));
  const rows = w.rows.filter(r => r.name), B = {};
  for (let i = 0; i < 48; i++) B['B' + (9 + i)] = rows[i] ? serial(rows[i].joined) : null;
  edit('공지용', x => fixWeekNo(setCells(x, B), w.no));
  edit('HK 전파', x => x);
  // 열 때 전부 다시 계산
  const wf = get('xl/workbook.xml'); wf.data = enc.encode(dec.decode(wf.data).replace(/<calcPr([^>]*?)\/>/, (a, b) => `<calcPr${b.replace(/ fullCalcOnLoad="\d"/, '')} fullCalcOnLoad="1"/>`));
  return writeZip(files);
}
