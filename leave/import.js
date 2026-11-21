// hub/leave/import.js — 구글 시트(.xlsx 내려받기) → Firebase 옮기기 (처음 한 번, 2026-11-18)
// 읽는 탭: 연차명단 · 연차기록 · 연차신청 · 배정기록(근무 달력). 읽는 규칙은 옛 Leave.gs(lvPeople_ · lvRecs_ · laApps_ · myWork)와 같게
// 파일은 이 PC 브라우저에서만 열고, 바로 Firestore 로 씀 (다른 곳에 안 보냄)
import { _int as I } from './api.js?v=2026.11.21-1';
const { S, L, cleanName } = I;

// ---------- xlsx(zip) 읽기 (브라우저 내장 압축 풀기)
async function inflateRaw(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); }
function zipIndex(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let e = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('엑셀(xlsx) 파일이 아니에요');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const dec = new TextDecoder(), map = new Map();
  for (let k = 0; k < n; k++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const fl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true), name = dec.decode(u8.subarray(p + 46, p + 46 + fl));
    map.set(name, { method, csize, off }); p += 46 + fl + xl + cl;
  }
  return {
    has: nm => map.has(nm),
    async text(nm) {
      const f = map.get(nm); if (!f) return '';
      const s = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
      const raw = u8.subarray(s, s + f.csize);
      return new TextDecoder().decode(f.method === 0 ? raw : await inflateRaw(raw));
    }
  };
}
const ent = s => s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|lt|gt|amp|quot|apos);/g, (m, g) =>
  g[0] === '#' ? String.fromCodePoint(g[1] === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10)) : { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[g]);
const attr = (a, k) => { const m = new RegExp('(?:^|\\s)' + k + '="([^"]*)"').exec(a); return m ? ent(m[1]) : null; };
const tText = x => { let s = '', m; const re = /<t(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/t>)/g; while ((m = re.exec(x))) s += m[1] ? ent(m[1]) : ''; return s; };
const colNo = ref => { let n = 0; for (const ch of ref.replace(/[0-9]/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
// 날짜 서식 번호 (엑셀 기본 + 사용자 서식에 y·m·d·h 가 있으면 날짜)
async function dateStyles(z) {
  const x = await z.text('xl/styles.xml'), fmts = {}, out = [];
  let m; const fr = /<numFmt\s([^>]*?)\/?>/g; while ((m = fr.exec(x))) fmts[attr(m[1], 'numFmtId')] = attr(m[1], 'formatCode') || '';
  const cx = (/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(x) || [])[1] || '';
  const xr = /<xf\s([^>]*?)\/?>/g; while ((m = xr.exec(cx))) {
    const id = Number(attr(m[1], 'numFmtId') || 0), code = (fmts[id] || '').replace(/"[^"]*"|\[[^\]]*\]/g, '');
    out.push((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || /[ymdh]/i.test(code));
  }
  return out;
}
// 시트 하나 → 2차원 배열. 날짜 칸은 { t: 서울 시각 밀리초 } 로
export async function readSheets(u8, want) {
  const z = zipIndex(u8);
  const wb = await z.text('xl/workbook.xml'), rels = await z.text('xl/_rels/workbook.xml.rels');
  const rid = {}; let m;
  const rr = /<Relationship\s([^>]*?)\/?>/g; while ((m = rr.exec(rels))) rid[attr(m[1], 'Id')] = attr(m[1], 'Target');
  const sst = []; const ss = await z.text('xl/sharedStrings.xml');
  const sr = /<si>([\s\S]*?)<\/si>/g; while ((m = sr.exec(ss))) sst.push(tText(m[1]));
  const ds = await dateStyles(z);
  const out = {};
  const sh = /<sheet\s([^>]*?)\/?>/g;
  const sheets = []; while ((m = sh.exec(wb))) sheets.push({ name: attr(m[1], 'name'), id: attr(m[1], 'r:id') });
  for (const s of sheets) {
    if (want ? want.indexOf(s.name) < 0 : s !== sheets[0]) continue;   // want 없음 = 첫 시트만 (하우스키핑 대장, 11/21)
    let path = rid[s.id] || ''; path = path.replace(/^\/?xl\//, ''); path = 'xl/' + path.replace(/^\//, '');
    const x = await z.text(path), rows = [];
    rows.merge = []; { const mr = /<mergeCell\s+ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g; let q; while ((q = mr.exec(x))) rows.merge.push({ c1: colNo(q[1]), r1: +q[2], c2: colNo(q[3]), r2: +q[4] }); }
    const rw = /<row\s([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g; let r;
    while ((r = rw.exec(x))) {
      const row = [];
      row.r = Number(attr(r[1], 'r') || 0); row.hidden = attr(r[1], 'hidden') === '1' || attr(r[1], 'hidden') === 'true'; row.f = {};   // 행 번호 · 숨김 · 수식 (11/21)
      const cr = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let c;
      while ((c = cr.exec(r[2] || ''))) {
        const ref = attr(c[1], 'r'), t = attr(c[1], 't'), st = Number(attr(c[1], 's') || 0), inner = c[2] || '';
        const v = (/<v>([\s\S]*?)<\/v>/.exec(inner) || [])[1];
        let val = '';
        if (t === 's') val = sst[Number(v)] || '';
        else if (t === 'inlineStr') val = tText(inner);
        else if (t === 'str') val = v == null ? '' : ent(v);
        else if (t === 'b') val = v === '1';
        else if (v != null) { const num = Number(v); val = ds[st] ? { t: Math.round((num - 25569) * 864e5) - 9 * 36e5 } : num; }
        row[colNo(ref)] = val;
        const fm = /<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/.exec(inner); if (fm) row.f[colNo(ref)] = ent(fm[1]);
      }
      rows.push(row);
    }
    out[s.name] = rows;
  }
  return out;
}

// ---------- 옛 Leave.gs 와 같은 읽기
const isT = v => v && typeof v === 'object' && 't' in v;
const ymd = v => (isT(v) ? L.today(v.t) : L.ymd(v));
const ym = v => (isT(v) ? L.today(v.t).slice(0, 7) : L.ym(v));
const ms = v => (isT(v) ? v.t : (Date.parse(String(v || '')) || 0));
const str = v => (v == null ? '' : isT(v) ? L.today(v.t) : String(v));
function hashId(s) { let h1 = 0x811c9dc5, h2 = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = (Math.imul(h2, 31) + c) >>> 0; } return h1.toString(36) + h2.toString(36); }
const TABS = ['연차명단', '연차기록', '연차신청', '배정기록'];

export async function readBook(u8) {
  const T = await readSheets(u8, TABS), warn = [];
  if (!T['연차명단']) throw new Error("'연차명단' 탭이 없어요. 정비 레포트 옛 구글 시트를 .xlsx 로 받았는지 확인해 주세요.");
  // 연차명단 (lvPeople_)
  const cur = I.people;   // 이미 옮긴 사람이 있으면 같은 문서(pid)에 덮어씀
  const people = T['연차명단'].slice(1).map(r => ({
    name: cleanName(r[0]), hire: ymd(r[1]), pre: /^(y|o|예|ㅇ|적용)/i.test(str(r[2]).trim()), target: !/^(n|x|아니|제외)/i.test(str(r[3]).trim()), quit: ymd(r[4]),
    alias: str(r[5]).split(/[\/,]/).map(cleanName).filter(Boolean), emp: str(r[6]).trim(), birth: ymd(r[7]) || str(r[7]).trim(), phone: str(r[8]).trim(),
    minus: Number(r[9]) || 0, memo: str(r[10]).trim()
  })).filter(p => p.name);
  const seen = {};
  people.forEach(p => {
    if (seen[p.name]) warn.push('연차명단에 ' + p.name + ' 님이 두 줄 있어요 (아래 줄을 씀)');
    seen[p.name] = 1;
    const c = cur.filter(x => x.name === p.name)[0];
    p.pid = c ? c.pid : 'p' + hashId('lv:' + p.name);
    if (p.target && !p.hire) warn.push(p.name + ' 님 입사일이 비어 있어요');
  });
  const pidOf = {}; people.forEach(p => { pidOf[p.name] = p.pid; });
  const pidAny = n => { n = cleanName(n); if (pidOf[n]) return pidOf[n]; const p = people.filter(x => x.alias.indexOf(n) >= 0)[0]; return p ? p.pid : ''; };
  // 연차기록 (lvRecs_) — 옛 계산은 이름이 명단 이름과 같을 때만 셈
  const recs = [];
  (T['연차기록'] || []).slice(1).forEach((r, i) => {
    const name = cleanName(r[1]), m = ym(r[2]), kind = str(r[4]).trim(), days = Number(r[3]) || 0;
    if (!name || !m || L.KINDS.indexOf(kind) < 0) return;
    if (!pidOf[name]) { warn.push('연차기록 ' + (i + 2) + '행: ' + name + ' 님은 명단에 없어 옛 계산에서도 빠져 있어요 (옮기지 않음)'); return; }
    recs.push({ id: 'imp' + hashId((i + 2) + '|' + name + '|' + m + '|' + days + '|' + kind + '|' + ms(r[0])), pid: pidOf[name], name, ym: m, days, kind,
      memo: str(r[5]).slice(0, 100), by: str(r[6]).slice(0, 20) || '관리자', at: new Date(ms(r[0]) || Date.now()) });
  });
  // 연차신청 (laApps_) — 신청번호마다 줄을 처음부터 다시 따라감
  const by = {}, order = [];
  (T['연차신청'] || []).slice(1).forEach(r => {
    const id = str(r[1]).trim(), st = str(r[3]).trim(); if (!id) return;
    const t = ms(r[0]);
    if (st === '신청') {
      if (by[id]) return;
      const n = Number(r[8]) || 0, name = cleanName(r[2]);
      by[id] = { id, pid: pidOf[name] || '', name, status: '대기', kind: str(r[4]).trim(), reason: str(r[5]), start: ymd(r[6]), end: ymd(r[7]) || ymd(r[6]),
        days: n, asked: n, phone: str(r[9]), sign: str(r[10]), memo: '', decided: 0, by: str(r[12]) || '본인', at: new Date(t || Date.now()), deleted: false,
        log: [{ s: '신청', t, by: str(r[12]) || '본인' }] };
      order.push(id); return;
    }
    const a = by[id]; if (!a) return;
    a.log.push({ s: st, t, by: str(r[12]), memo: str(r[11]), days: Number(r[8]) || 0 });
    a.decided = t; a.memo = str(r[11]);
    if (st === '승인') { a.status = '승인'; if (Number(r[8])) a.days = Number(r[8]); }
    else if (st === '반려') a.status = '반려';
    else if (st === '취소') a.status = '취소';
    else if (st === '되돌림') { a.status = '대기'; a.days = a.asked; a.decided = 0; a.memo = ''; }
    else if (st === '삭제') a.deleted = true;
  });
  const apps = order.map(id => by[id]).filter(a => a.name && a.start);
  apps.forEach(a => { if (!a.pid) warn.push('신청서 ' + a.id + ': ' + a.name + ' 님이 명단에 없어요 (옮기지 않음)'); a.log = a.log.slice(-30); });
  // 배정기록 → 근무 달력 (myWork 와 같게: 날짜 | 이름 | ? | 유닛 | 완료(O) | 제외…) — 사람·달마다 한 문서
  const work = {}; let upto = '';
  const today = L.today();
  (T['배정기록'] || []).slice(1).forEach(r => {
    const d = ymd(r[0]); if (!d || d >= today || /^제외/.test(str(r[5]))) return;
    const pid = pidAny(r[1]); if (!pid) return;
    const k = pid + '_' + d.slice(0, 7), w = work[k] = work[k] || { pid, ym: d.slice(0, 7), days: {} };
    const u = Number(r[3]) || 0, o = w.days[d] = w.days[d] || { a: 0, d: 0 };
    o.a += u; if (str(r[4]) === 'O') o.d += u;
    if (d > upto) upto = d;
  });
  if (!T['배정기록']) warn.push("'배정기록' 탭이 없어 지난 근무 달력은 옮기지 않아요");
  return { people, recs, apps: apps.filter(a => a.pid), work, workN: Object.keys(work).length, upto, warn };
}

// ---------- 쓰기
async function chunks(list, n, fn, prog, label) {
  for (let i = 0; i < list.length; i += n) { await Promise.all(list.slice(i, i + n).map(fn)); prog(label + ' ' + Math.min(list.length, i + n) + '/' + list.length); }
}
export async function write(R, prog) {
  prog = prog || (() => {});
  await I.fetchAll();
  const have = I.recs;
  await chunks(R.people, 20, p => S.set('leave_people/' + p.pid, { name: p.name, hire: p.hire, pre: p.pre, target: p.target, quit: p.quit, alias: p.alias, emp: p.emp,
    birth: p.birth, phone: p.phone, minus: p.minus, memo: p.memo, upd: S.SERVER_TIME, by: '옮기기' }), prog, '명단');
  const nr = R.recs.filter(x => !have[x.id]);
  await chunks(nr, 40, x => S.set('leave_recs/' + x.id, { pid: x.pid, name: x.name, ym: x.ym, days: x.days, kind: x.kind, memo: x.memo, by: x.by, at: x.at }), prog, '기록');
  // 신청서: 새 앱에서 한 번이라도 처리(승인·취소 등)한 것은 덮어쓰지 않음 (touched)
  const ha = I.apps, na = R.apps.filter(a => !(ha[a.id] && (ha[a.id].touched || ha[a.id].src !== 'sheet')));
  await chunks(na, 20, a => S.set('leave_apps/' + a.id, Object.assign({}, a, { src: 'sheet', upd: S.SERVER_TIME })), prog, '신청서');
  const W = Object.keys(R.work).map(k => Object.assign({ id: k }, R.work[k]));
  await chunks(W, 40, w => S.set('leave_work/' + w.id, { pid: w.pid, ym: w.ym, days: w.days }), prog, '달력');
  await S.set('meta/leave', { workUpto: R.upto || '', importedAt: S.SERVER_TIME });   // 휴대폰들은 importedAt 이 바뀌면 보관해 둔 기록을 버리고 새로 받음
  I.lsClear();
  return { people: R.people.length, recs: nr.length, apps: na.length };
}

// ---------- 대조: 시트로 계산한 값 ↔ 지금 Firebase 값 (같은 계산식 leave.js)
export function compare(R, D) {
  const asOf = D.asOf, rows = [];
  R.people.filter(p => p.target).forEach(p => {
    const b0 = L.balance(p, R.recs.filter(x => x.pid === p.pid), asOf);
    const w0 = R.apps.filter(a => a.pid === p.pid && !a.deleted && a.status === '대기').length;
    const q = D.people.filter(x => x.pid === p.pid)[0];
    const w1 = D.apps.filter(a => a.pid === p.pid && a.status === '대기').length;
    const a = { gen: b0.gen, used: b0.used, paid: b0.paid, remain: b0.remain, wait: w0 };
    const b = q ? { gen: q.gen, used: q.used, paid: q.paid, remain: q.remain, wait: w1 } : { gen: '-', used: '-', paid: '-', remain: '-', wait: '-' };
    rows.push({ name: p.name, a, b, bad: ['gen', 'used', 'paid', 'remain', 'wait'].some(k => a[k] !== b[k]) });
  });
  return { asOf, rows };
}
