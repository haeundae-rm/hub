// fillxlsx.js — 자동 배정 결과를 원본 정비보고서 엑셀(그날 시트)에 그대로 채워 내려받기 (오더테이커 09시 업무용, 2026-11-13)
// claude/assign/fill.py 를 브라우저로 옮긴 것. 원본 서식·그림·다른 시트는 바이트 그대로 두고, 그날 시트 xml 과 workbook.xml 만 바꿈
//  · 객실 이름 칸: 매핑표(240~1199행) B=객실, D=수식(이름 칸 주소) → 그 칸에 이름 (2901 은 '가, 나, 다')
//  · 출근 카드(2·5·8·11행, B~AH 짝수 열 'n] 이름'): 아래 칸(유닛) = 배정 유닛, 그 아래 '실제' 수식은 저장 값만 맞춤
//    배정에 없는 카드 = '휴무' (이미 휴무·퇴사·공란이면 그대로) / 카드 없는 출근자 = 빈 카드 칸에 이름·유닛 추가
//  · 매핑표 D(이름) 수식 저장 값도 맞춤 (앱·파이썬 도구가 저장 값을 읽음) · 엑셀이 열 때 다시 계산(fullCalcOnLoad)
// fillReport(bytes, 'YYYY-MM-DD', workers{이름:{rooms, load}}) → { bytes: Uint8Array, info: { named, cards, added, offs, missing } }

const enc = new TextEncoder(), dec = new TextDecoder();
async function inflateRaw(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); }
async function deflateRaw(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); }
let CRC;
function crc32(u8) { if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

function readZip(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); let e = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('엑셀(xlsx) 파일이 아닙니다');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const list = [];
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('엑셀 파일이 깨졌습니다');
    const fl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    list.push({ cd: u8.subarray(p, p + 46 + fl + xl + cl), name: dec.decode(u8.subarray(p + 46, p + 46 + fl)), method: dv.getUint16(p + 10, true), csize: dv.getUint32(p + 20, true), off: dv.getUint32(p + 42, true) });
    p += 46 + fl + xl + cl;
  }
  const local = f => { const s = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true); return { head: u8.subarray(f.off, s), data: u8.subarray(s, s + f.csize) }; };
  return { list, local, async text(nm) { const f = list.find(x => x.name === nm); if (!f) throw new Error('엑셀 안에 ' + nm + ' 이(가) 없습니다'); const d = local(f).data; return dec.decode(f.method === 0 ? d : await inflateRaw(d)); } };
}
// 바뀐 파일만 새로 압축, 나머지는 원본 바이트 그대로 복사
async function writeZip(z, changed) {
  const parts = [], cds = []; let off = 0;
  for (const f of z.list) {
    const { head, data } = z.local(f);
    if (changed.has(f.name)) {
      const raw = enc.encode(changed.get(f.name)), comp = await deflateRaw(raw), crc = crc32(raw), nm = enc.encode(f.name);
      const h = new Uint8Array(30 + nm.length), hv = new DataView(h.buffer);
      hv.setUint32(0, 0x04034b50, true); hv.setUint16(4, 20, true); hv.setUint16(6, 0x0800, true); hv.setUint16(8, 8, true);
      hv.setUint16(10, new DataView(head.buffer, head.byteOffset).getUint16(10, true), true); hv.setUint16(12, new DataView(head.buffer, head.byteOffset).getUint16(12, true), true);
      hv.setUint32(14, crc, true); hv.setUint32(18, comp.length, true); hv.setUint32(22, raw.length, true); hv.setUint16(26, nm.length, true); h.set(nm, 30);
      const cd = new Uint8Array(f.cd), cv = new DataView(cd.buffer);
      cv.setUint16(8, 0x0800, true); cv.setUint16(10, 8, true); cv.setUint32(16, crc, true); cv.setUint32(20, comp.length, true); cv.setUint32(24, raw.length, true); cv.setUint32(42, off, true);
      parts.push(h, comp); cds.push(cd); off += h.length + comp.length;
    } else {
      const cd = new Uint8Array(f.cd); new DataView(cd.buffer).setUint32(42, off, true);
      // 데이터 서술자(bit 3)가 붙은 항목은 그 뒤 12~16바이트까지 복사
      let tail = new Uint8Array(0); const flag = new DataView(head.buffer, head.byteOffset).getUint16(6, true);
      if (flag & 8) { const all = z.local(f); const end = all.data.byteOffset + all.data.length; const src = new Uint8Array(all.data.buffer); const sig = new DataView(all.data.buffer).getUint32(end, true) === 0x08074b50; tail = src.subarray(end, end + (sig ? 16 : 12)); }
      parts.push(head, data, tail); cds.push(cd); off += head.length + data.length + tail.length;
    }
  }
  const cdStart = off; let cdLen = 0; cds.forEach(c => { parts.push(c); cdLen += c.length; });
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, z.list.length, true); ev.setUint16(10, z.list.length, true); ev.setUint32(12, cdLen, true); ev.setUint32(16, cdStart, true);
  parts.push(end);
  const total = parts.reduce((s, p) => s + p.length, 0), out = new Uint8Array(total); let q = 0; parts.forEach(p => { out.set(p, q); q += p.length; });
  return out;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = s => s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|lt|gt|amp|quot|apos);/g, (m, g) => g[0] === '#' ? String.fromCodePoint(g[1] === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10)) : { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[g]);
const colNum = c => { let n = 0; for (const ch of c) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
const colName = i => { let s = ''; while (i) { const r = (i - 1) % 26; i = Math.floor((i - 1) / 26); s = String.fromCharCode(65 + r) + s; } return s; };
const numStr = v => (Number.isInteger(+v) ? String(+v) : String(+v));

export async function fillReport(bytes, date, workers, opt) {
  opt = opt || {};
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const z = readZip(u8);
  const wb = await z.text('xl/workbook.xml'), rel = await z.text('xl/_rels/workbook.xml.rels');
  const rmap = {}; for (const m of rel.matchAll(/<Relationship [^>]*>/g)) { const at = {}; for (const a of m[0].matchAll(/(\w+)="([^"]*)"/g)) at[a[1]] = a[2]; rmap[at.Id] = at.Target; }
  const sheets = [...wb.matchAll(/<sheet name="([^"]+)" sheetId="\d+"(?: state="\w+")? r:id="(rId\d+)"/g)].map(m => [m[1], rmap[m[2]]]);
  const dd = String(parseInt(date.slice(8), 10));
  let pick = sheets.find(x => x[0] === dd); if (!pick && sheets.length === 1) pick = sheets[0];
  if (!pick) throw new Error('정비보고서에서 ' + dd + '일 시트를 찾지 못했어요');
  const path = 'xl/' + pick[1].replace(/^\/?xl\//, '').replace(/^\//, '');
  let xml = await z.text(path);
  const ssXml = z.list.some(f => f.name === 'xl/sharedStrings.xml') ? await z.text('xl/sharedStrings.xml') : '';
  const ss = []; { let m; const re = /<si(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/si>)/g; while ((m = re.exec(ssXml))) ss.push(unesc([...(m[1] || '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(''))); }
  const cellre = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  const cells = new Map(); for (const m of xml.matchAll(cellre)) cells.set(m[1] + m[2], m);
  const val = ref => { const m = cells.get(ref); if (!m || !m[4]) return null; if (/t="inlineStr"/.test(m[3])) return unesc([...m[4].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x => x[1]).join('')); const v = /<v>([\s\S]*?)<\/v>/.exec(m[4]); if (!v) return null; return /t="s"/.test(m[3]) ? ss[+v[1]] : unesc(v[1]); };
  const form = ref => { const m = cells.get(ref); if (!m || !m[4]) return null; const f = /<f[^>]*>([\s\S]*?)<\/f>/.exec(m[4]); return f ? unesc(f[1]) : null; };

  // 객실 → 이름 칸
  const target = {}, maprow = {};
  for (let row = 240; row < 1200; row++) { const room = val('B' + row), f = form('D' + row); if (!room || !f) continue;
    const r = String(room).trim().split('.')[0]; const mm = /^\$?([A-Z]+)\$?(\d+)/.exec(f); if (mm && !(r in target)) { target[r] = mm[1] + mm[2]; maprow[r] = row; } }
  const names = {}; Object.entries(workers).forEach(([n, w]) => (w.rooms || []).forEach(r => { (names[String(r)] = names[String(r)] || []).push(n); }));
  const edits = new Map(), missing = [];
  // 대상 객실 칸을 먼저 비우고(초안에 남은 이름 정리) 배정된 이름을 넣음
  Object.entries(names).forEach(([r, ns]) => { const ref = target[r]; if (!ref) { missing.push(r); return; } edits.set(ref, ['s', ns.join(', ')]); });
  Object.entries(target).forEach(([r, ref]) => { if (!names[r] && val(ref) != null && String(val(ref)).trim()) edits.set(ref, ['e', '']); });
  // 카드
  const actCache = new Map(), cardNames = new Set(), empties = []; let cardsSet = 0; const offs = [];
  for (const nr of [2, 5, 8, 11]) for (let ci = 2; ci <= 34; ci += 2) { const L = colName(ci), lab = val(L + nr);
    if (!lab || !String(lab).trim()) { empties.push([L, nr]); continue; }
    const mm = /^\s*(\d+)\]\s*(.+)$/.exec(String(lab)); const n = (mm ? mm[2] : String(lab)).replace(/\s+/g, ''); cardNames.add(n);
    if (workers[n]) { edits.set(L + (nr + 1), ['n', workers[n].load]); actCache.set(L + (nr + 2), workers[n].load); cardsSet++; }
    else { const cur = String(val(L + (nr + 1)) || ''); if (!/휴|퇴사|공란/.test(cur)) { edits.set(L + (nr + 1), ['s', '휴무']); offs.push(n); } } }
  const added = [];
  Object.keys(workers).filter(n => !cardNames.has(n)).forEach(n => { const e = empties.shift(); if (!e) return; edits.set(e[0] + e[1], ['s', n]); edits.set(e[0] + (e[1] + 1), ['n', workers[n].load]); added.push([n, e[0] + e[1]]); });
  // 미정비 남기기 (11/15): 그 객실 메모2 칸(이름 칸 두 줄 아래)에 '미정비' — 원래 글이 있으면 뒤에 붙임
  let carried = 0; const carryRefs = [];
  (opt.carry || []).forEach(r => { const ref = target[String(r)]; if (!ref) return; const [, L, n] = /([A-Z]+)(\d+)/.exec(ref), m2 = L + (+n + 2), cur = String(val(m2) == null ? '' : val(m2)).trim();
    if (/미정비/.test(cur)) return; edits.set(m2, ['s', cur ? cur + ' 미정비' : '미정비']); carryRefs.push(m2); });
  const dcache = new Map(); Object.entries(names).forEach(([r, ns]) => { if (maprow[r]) dcache.set('D' + maprow[r], ns.join(', ')); });

  const put = (ref, kind, v, a) => { a = a.replace(/\s*t="[^"]*"/, ''); if (kind === 'e') return '<c r="' + ref + '"' + a + '/>'; return kind === 's' ? '<c r="' + ref + '"' + a + ' t="inlineStr"><is><t>' + esc(v) + '</t></is></c>' : '<c r="' + ref + '"' + a + '><v>' + numStr(v) + '</v></c>'; };
  xml = xml.replace(cellre, (m0, c, r, a, inner) => { const ref = c + r;
    if (edits.has(ref)) { const [k, v] = edits.get(ref); edits.delete(ref); return put(ref, k, v, a); }
    if (actCache.has(ref) && inner && /<f/.test(inner)) { const v = actCache.get(ref); actCache.delete(ref); return '<c r="' + ref + '"' + a.replace(/\s*t="[^"]*"/, '') + '>' + inner.replace(/<v>[\s\S]*?<\/v>/, '') + '<v>' + numStr(v) + '</v></c>'; }
    if (dcache.has(ref) && inner && /<f/.test(inner)) { const v = dcache.get(ref); dcache.delete(ref); return '<c r="' + ref + '"' + a.replace(/\s*t="[^"]*"/, '') + ' t="str">' + inner.replace(/<v>[\s\S]*?<\/v>/, '') + '<v>' + esc(v) + '</v></c>'; }
    return m0; });
  // 원본에 칸 자체가 없는 경우 → 행에 끼워 넣기
  for (const [ref, [k, v]] of [...edits]) { if (k === 'e') { edits.delete(ref); continue; } const [, col, row] = /([A-Z]+)(\d+)/.exec(ref);
    const rre = new RegExp('<row r="' + row + '"([^>]*?)(/>|>([\\s\\S]*?)</row>)'); const rm = rre.exec(xml);
    if (!rm) { // 행 자체가 없으면 순서에 맞춰 새 행 (미정비 메모 칸 등)
      let at = xml.indexOf('</sheetData>'); for (const r2 of xml.matchAll(/<row r="(\d+)"/g)) if (+r2[1] > +row) { at = r2.index; break; }
      if (at < 0) continue; xml = xml.slice(0, at) + '<row r="' + row + '">' + put(ref, k, v, '') + '</row>' + xml.slice(at); edits.delete(ref); continue; }
    const nw = put(ref, k, v, '');
    if (rm[2] === '/>') { xml = xml.slice(0, rm.index) + '<row r="' + row + '"' + rm[1] + '>' + nw + '</row>' + xml.slice(rm.index + rm[0].length); edits.delete(ref); continue; }
    const inner = rm[3]; let pos = inner.length; for (const cm of inner.matchAll(cellre)) if (colNum(cm[1]) > colNum(col)) { pos = cm.index; break; }
    const seg = '<row r="' + row + '"' + rm[1] + '>' + inner.slice(0, pos) + nw + inner.slice(pos) + '</row>';
    xml = xml.slice(0, rm.index) + seg + xml.slice(rm.index + rm[0].length); edits.delete(ref); }
  carried = carryRefs.filter(r => !edits.has(r)).length;
  let wb2 = wb; if (!/fullCalcOnLoad/.test(wb2)) wb2 = /<calcPr/.test(wb2) ? wb2.replace(/<calcPr([^>]*?)\/>/, '<calcPr$1 fullCalcOnLoad="1"/>') : wb2.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
  const out = await writeZip(z, new Map([[path, xml], ['xl/workbook.xml', wb2]]));
  return { bytes: out, info: { carry: carried, sheet: pick[0], named: Object.keys(names).length - missing.length, cards: cardsSet + added.filter(x => !edits.has(x[1])).length, added: added.filter(x => !edits.has(x[1])).map(x => x[0]), noCard: added.filter(x => edits.has(x[1])).map(x => x[0]), offs, missing, left: [...edits.keys()] } };
}
