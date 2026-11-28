// hub/lost/lostxl.js — 🧳 옛 엑셀 「객실 습득물 관리 대장」(1일~31일 시트) → 앱 대장 줄 (2026-11-28 소장님: 11월 어제까지 옮기기)
// 파일은 이 브라우저에서만 열고 바로 Firestore 로 씀. 같은 파일을 두 번 가져와도 같은 문서에 덮어씀 (id 고정)
import { CATS, DONE, KEEP } from './lostcalc.js?v=2026.11.22-2';

async function inflateRaw(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); }
function zipIndex(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); let e = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('엑셀(xlsx) 파일이 아니에요');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const dec = new TextDecoder(), map = new Map();
  for (let k = 0; k < n; k++) { const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), fl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    map.set(dec.decode(u8.subarray(p + 46, p + 46 + fl)), { method, csize, off }); p += 46 + fl + xl + cl; }
  return { async text(nm) { const f = map.get(nm); if (!f) return ''; const s = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true), raw = u8.subarray(s, s + f.csize); return dec.decode(f.method === 0 ? raw : await inflateRaw(raw)); } };
}
const ent = s => s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|lt|gt|amp|quot|apos);/g, (m, g) => g[0] === '#' ? String.fromCodePoint(g[1] === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10)) : { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[g]);
const attr = (a, k) => { const m = new RegExp('(?:^|\\s)' + k + '="([^"]*)"').exec(a); return m ? ent(m[1]) : null; };
const tText = x => { let s = '', m; const re = /<t(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/t>)/g; while ((m = re.exec(x))) s += m[1] ? ent(m[1]) : ''; return s; };
const colNo = ref => { let n = 0; for (const ch of ref.replace(/[0-9]/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
async function dateStyles(z) {
  const x = await z.text('xl/styles.xml'), fmts = {}, out = []; let m;
  const fr = /<numFmt\s([^>]*?)\/?>/g; while ((m = fr.exec(x))) fmts[attr(m[1], 'numFmtId')] = attr(m[1], 'formatCode') || '';
  const cx = (/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(x) || [])[1] || '';
  const xr = /<xf\s([^>]*?)\/?>/g; while ((m = xr.exec(cx))) { const id = Number(attr(m[1], 'numFmtId') || 0), code = (fmts[id] || '').replace(/"[^"]*"|\[[^\]]*\]/g, ''); out.push((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || /[ymd]/i.test(code)); }
  return out;
}
// 시트들 → { 시트 이름: [[칸…]…] } (날짜 칸 = 'YYYY-MM-DD')
export async function readBook(u8) {
  const z = zipIndex(u8), wb = await z.text('xl/workbook.xml'), rels = await z.text('xl/_rels/workbook.xml.rels'), rid = {}; let m;
  const rr = /<Relationship\s([^>]*?)\/?>/g; while ((m = rr.exec(rels))) rid[attr(m[1], 'Id')] = attr(m[1], 'Target');
  const sst = [], ss = await z.text('xl/sharedStrings.xml'); const sr = /<si>([\s\S]*?)<\/si>/g; while ((m = sr.exec(ss))) sst.push(tText(m[1]));
  const ds = await dateStyles(z), out = {}, sh = /<sheet\s([^>]*?)\/?>/g;
  while ((m = sh.exec(wb))) {
    const name = attr(m[1], 'name'); if (!/^\d{1,2}일$|^설정$/.test(name)) continue;
    let path = (rid[attr(m[1], 'r:id')] || '').replace(/^\/?xl\//, '').replace(/^\//, ''); const x = await z.text('xl/' + path), rows = [];
    const rw = /<row\s([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g; let r;
    while ((r = rw.exec(x))) { const row = []; row.r = Number(attr(r[1], 'r') || 0);
      const cr = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let c;
      while ((c = cr.exec(r[2] || ''))) { const t = attr(c[1], 't'), st = Number(attr(c[1], 's') || 0), inner = c[2] || '', v = (/<v>([\s\S]*?)<\/v>/.exec(inner) || [])[1]; let val = '';
        if (t === 's') val = sst[Number(v)] || ''; else if (t === 'inlineStr') val = tText(inner); else if (t === 'str') val = v == null ? '' : ent(v); else if (t === 'e') val = '';
        else if (v != null) { const num = Number(v); val = ds[st] && num > 20000 ? new Date(Math.round((num - 25569) * 864e5)).toISOString().slice(0, 10) : num; }
        row[colNo(attr(c[1], 'r'))] = val; }
      rows.push(row); }
    out[name] = rows;
  }
  return out;
}
const pad = n => String(n).padStart(2, '0');
const s = v => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();
function hashId(t) { let h1 = 0x811c9dc5, h2 = 0; for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = (Math.imul(h2, 31) + c) >>> 0; } return (h1.toString(36) + h2.toString(36)).slice(0, 10); }
// 분류: 엑셀의 '식품' · '음식/잡화' · '기타/음식' 같은 것을 앱 6가지로
export function catOf(v) { const t = s(v); if (CATS.includes(t)) return t; if (/식품|음식/.test(t) && !/^기타/.test(t)) return '음식'; const f = CATS.find(c => t.startsWith(c)); return f || '기타'; }
// 조치: 앱 단추와 같은 말로. 못 맞추면 '' + 특이사항으로
export function actOf(v) { const t = s(v).replace(/[\s.·]/g, '').toUpperCase();
  if (!t) return ''; if (/^F\/?D$|^프런트|^프론트/.test(t)) return 'F/D'; if (/택배/.test(t)) return '택배'; if (/직접인계|직접전달|인계완료/.test(t)) return '직접인계'; if (/폐기/.test(t)) return '폐기'; if (/경찰/.test(t)) return '경찰 인계';
  if (/귀중품보관/.test(t)) return '귀중품 보관함'; if (/습냉|냉장/.test(t)) return '습득물 냉장고'; if (/파손(주의|위험)?보관/.test(t)) return '파손주의 보관함'; return ''; }
// 조치일: 날짜 칸 · '11월4일' · '11/4'
function dayOf(v, y, m) { const t = s(v); if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t; let q = /(\d{1,2})\s*[월\/.]\s*(\d{1,2})/.exec(t); if (q) return y + '-' + pad(+q[1]) + '-' + pad(+q[2]); return ''; }
const chkOf = v => { const t = s(v); return !!t && t !== '0' && !/^x$|^n$|아니|미확인/i.test(t); };

/** 시트들 → { rows: 앱 대장 줄 (id 고정), skip: [{date, room, why}], days: {날: 건수} }  · before = 이 날 전까지만 (오늘은 앱에서 접수) */
export function parseLedger(T, before) {
  const cfg = T['설정'] || [], val = k => { const r = cfg.find(r => s(r[0]) === k); return r ? r[1] : null; };
  const rows = [], skip = [], days = {};
  Object.keys(T).filter(n => /^\d{1,2}일$/.test(n)).forEach(name => {
    const R = T[name], head = s((R[1] || [])[0]), hm = /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/.exec(head);
    const y = hm ? +hm[1] : Number(val('기준 연도')), mo = hm ? +hm[2] : Number(val('기준 월')), d = hm ? +hm[3] : parseInt(name, 10);
    if (!hm || !y || !mo) return;   // '해당 월에는 없는 날짜'
    const date = y + '-' + pad(mo) + '-' + pad(d); if (before && date >= before) return;
    const hi = R.findIndex(r => /^객실\s*번\s*호/.test(s(r[0]))); if (hi < 0) return;
    let k = 0;
    R.slice(hi + 1).forEach(r => {
      const room = s(r[0]).replace(/호$/, ''), item0 = s(r[1]); if (!room && !item0) return;
      if (/^객실\s*번\s*호|습득물 관리 대장|^\d{4}년\s*\d{1,2}월/.test(s(r[0]))) return;   // 쪽마다 되풀이되는 제목 · 머리줄
      if (!room) { skip.push({ date, room: '', item: item0, why: '객실 번호 없음' }); return; }
      const cat = catOf(r[2]), act = actOf(r[4]), rawAct = s(r[4]), memo = [act ? '' : rawAct, s(r[6]), s(r[2]) && !CATS.includes(s(r[2])) ? '분류 「' + s(r[2]) + '」' : ''].filter(Boolean).join(' / ');
      const item = (item0 || '(내용 없음)').slice(0, 40); k++;
      const x = { id: date + '_' + (/^\d+$/.test(room) ? room : 'x') + '_e' + hashId(date + '|' + room + '|' + item + '|' + k), v: 1, date, no: date.slice(5).replace('-', '') + '-' + room, room: room.slice(0, 10), item, cat, police: cat === '귀중품',
        place: { 귀중품: '귀중품 보관함', 음식: '습득물 냉장고', 파손주의: '파손주의 보관함' }[cat] || '습득물 보관', note: '', by: '', src: 'hub', ai: null, n: 0,
        chk: chkOf(r[3]), act, actDay: act && DONE.includes(act) ? (dayOf(r[5], y, mo) || date) : '', actBy: act ? '엑셀' : '', memo: memo.slice(0, 60), k };
      rows.push(x); days[date] = (days[date] || 0) + 1;
    });
  });
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.k - b.k));
  return { rows, skip, days };
}
