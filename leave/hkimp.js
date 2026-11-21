// hub/leave/hkimp.js — 하우스키핑 연차관리대장(.xlsx) → 연차 명단(grp 'hk') · 연차기록 가져오기 (2026-11-21)
// 대장 모양: 첫 시트, '성  명' 줄(머리) 위 줄에 '2019년' 같은 해, 머리 줄에 1~12 월 · C 성명 · D 직무 · E 입사일자 · CY (예상)발생연차
//   숨긴 줄(환경 등)과 '사우나' 칸은 기본으로 빼고, 화면에서 고른 분만 가져옴
// 발생 연차는 대장 값을 쓰지 않고 앱이 입사일로 다시 계산 (leave.js gen — 룸메이드 선지급제와 같은 규칙) → 대장 발생 칸의 틀린 값은 자동으로 바로잡힘
// 사용은 달마다 대장 값과 지금 기록의 차이만 한 줄씩 더함 (leave_recs 는 쌓기만) → 다시 가져와도 두 번 들어가지 않음
// 파일은 이 PC 브라우저에서만 열고 바로 Firestore 로 씀 (다른 곳에 안 보냄)
import { _int as I } from './api.js?v=2026.11.21-1';
import { readSheets } from './import.js?v=2026.11.21-1';
const { S, L, cleanName } = I;

const isT = v => v && typeof v === 'object' && 't' in v;
const num = v => (typeof v === 'number' ? v : v === '' || v == null || isT(v) ? null : isNaN(Number(v)) ? null : Number(v));
const nospace = v => String(v == null ? '' : v).replace(/\s+/g, '');

/** 시트(2차원 배열 + r · hidden · f · merge) → { people:[{row, part, name, job, hire, months:{ym:days}, used, ledgerGen, ledgerF, minusHint, hidden, pick, warn:[]}], months:[ym…] } */
export function parseLedger(rows, asOf) {
  const at = rows.findIndex(r => r && r.some(v => nospace(v) === '성명'));
  if (at < 0) throw new Error("'성명' 칸이 있는 머리 줄을 찾지 못했어요. 하우스키핑 연차관리대장 파일이 맞는지 확인해 주세요.");
  const hd = rows[at], C = k => hd.findIndex(v => nospace(v).indexOf(k) === 0);
  const cName = C('성명'), cJob = C('직무'), cHire = C('입사'), cGen = hd.findIndex(v => /발생/.test(String(v || '')));
  if (cName < 0 || cHire < 0) throw new Error("머리 줄에 '성명'·'입사일자' 칸이 없어요.");
  // 해 줄: 머리 줄 바로 위에서 'yyyy년' (합친 칸이라 첫 칸에만 있음 → 오른쪽으로 이어 씀)
  const yr = rows[at - 1] || [], mcol = {};
  let y = 0;
  for (let c = 0; c < hd.length; c++) {
    const m = /^(\d{4})\s*년/.exec(String(yr[c] == null ? '' : yr[c]).trim()); if (m) y = Number(m[1]);
    const mo = num(hd[c]);
    if (y && mo && mo >= 1 && mo <= 12 && Number.isInteger(mo) && (cGen < 0 || c < cGen)) mcol[c] = y + '-' + ('0' + mo).slice(-2);
  }
  const cols = Object.keys(mcol).map(Number);
  if (!cols.length) throw new Error('월별 사용 칸(해 · 1~12월)을 찾지 못했어요.');
  // 파트(첫 칸, 합친 칸): 합친 범위 안의 줄은 그 파트
  const merge = rows.merge || [], partOf = (rn, v) => {
    if (v) return String(v);
    const g = merge.find(x => x.c1 === 0 && rn >= x.r1 && rn <= x.r2);
    if (!g) return '';
    const top = rows.find(r => r && r.r === g.r1); return top ? String(top[0] || '') : '';
  };
  const people = [];
  rows.slice(at + 1).forEach(r => {
    if (!r) return;
    const name = cleanName(r[cName]); if (!name || /합계|소계/.test(String(r[0] || '') + name)) return;
    const hv = r[cHire], hire = isT(hv) ? L.today(hv.t) : L.ymd(hv);
    const part = partOf(r.r, r[0]).replace(/\s+/g, '');
    const months = {}, warn = [];
    cols.forEach(c => { const v = num(r[c]); if (v != null && v !== 0) months[mcol[c]] = v; else if (v === 0) months[mcol[c]] = months[mcol[c]] || 0; });
    Object.keys(months).forEach(m => {
      if (hire && m < hire.slice(0, 7) && months[m]) warn.push(m + ' 사용 ' + months[m] + ' — 입사(' + hire + ') 전 달');
      if (months[m] && (months[m] < 0 || Math.round(months[m] * 2) !== months[m] * 2)) warn.push(m + ' 값 ' + months[m] + ' — 0.5 단위가 아님');
      else if (months[m] > 1) warn.push(m + ' 사용 ' + months[m] + '개 (다른 달은 보통 1개)');
    });
    const used = L.r1(Object.keys(months).reduce((s, m) => s + months[m], 0));
    const gf = cGen >= 0 ? r.f[cGen] || '' : '', gv = cGen >= 0 ? num(r[cGen]) : null;
    const mh = /^\(?\s*11\s*-\s*(\d+)\s*\)/.exec(gf.replace(/^=/, ''));   // 대장의 '(11-3)+15…' = 첫해 월차 빼기
    if (!hire) warn.push('입사일이 없어요');
    if (cGen >= 0 && gv == null) warn.push('대장 발생 칸이 비어 있어요');
    const pick = !r.hidden && !/사우나|환경/.test(part);
    people.push({ row: r.r, part, name, job: String(r[cJob] || '').trim(), hire, months, used, ledgerGen: gv, ledgerF: gf, minusHint: mh ? Number(mh[1]) : 0, hidden: !!r.hidden, pick, warn });
  });
  // 11/21 소장님: 첫해 빼기는 정책이 바뀌어 안 함 → 기본 0 (대장 수식에서 읽은 값은 참고로만 보여 줌)
  people.forEach(p => { p.minus = 0; p.base = p.hire; p.dropPre = false; p.calc = calc(p, asOf); });
  return { people, months: cols.map(c => mcol[c]) };
}
/** 가져올 달 (연차 기준일 전 달은 dropPre 일 때 뺌) */
export function monthsOf(p) {
  const b = (p.base || p.hire || '').slice(0, 7), o = {};
  Object.keys(p.months).forEach(m => { if (!(p.dropPre && m < b)) o[m] = p.months[m]; });
  return o;
}
/** 앱 계산 (연차 기준일 · 첫해 빼기 → 발생, 가져올 사용 합계 → 잔여) */
export function calc(p, asOf) {
  const g = L.gen(p.base || p.hire, asOf, p.minus), ms = monthsOf(p);
  const used = L.r1(Object.keys(ms).reduce((s, m) => s + ms[m], 0));
  const pre = L.r1(Object.keys(p.months).filter(m => m < (p.base || p.hire || '').slice(0, 7)).reduce((s, m) => s + p.months[m], 0));
  return { gen: L.r1(g.total), used, pre, remain: L.r1(g.total - used), next: g.next, years: g.years };
}
export async function read(u8, asOf) {
  const T = await readSheets(u8, null), name = Object.keys(T)[0];
  if (!name) throw new Error('시트를 읽지 못했어요.');
  return Object.assign({ sheet: name }, parseLedger(T[name], asOf));
}

// ---------- 쓰기: 고른 분만. 같은 이름의 하우스키핑 분이 있으면 그 문서(pid)에, 룸메이드 쪽에 같은 이름이 있으면 멈춤
export function plan(R, people, recs) {
  const pick = R.people.filter(p => p.pick);
  const out = { add: [], upd: [], recs: [], stop: [] };
  pick.forEach(p => {
    const same = people.filter(x => x.name === p.name || (x.alias || []).indexOf(p.name) >= 0);
    const hk = same.filter(x => x.grp === 'hk')[0];
    if (!hk && same.length) { out.stop.push(p.name + ' 님은 룸메이드 연차 명단에 이미 있어요. 이름을 다르게 하거나 그쪽 명단을 먼저 정리해 주세요.'); return; }
    const base = L.ymd(p.base) || p.hire;
    if (!base) { out.stop.push(p.name + ' 님 입사일이 없어요.'); return; }
    const pid = hk ? hk.pid : I.newPid();
    const o = hk || {};
    // 연차 기준일이 대장 입사일과 다르면 (일용 → 하우스키퍼 전향) 앱 입사일 칸 = 연차 기준일, 실제 입사일은 메모에
    const memo = base !== p.hire ? '대장 입사 ' + p.hire + ' · 연차 기준 ' + base + (p.job ? ' · ' + p.job : '') : o.memo || (p.job ? '직무 ' + p.job : '');
    const doc = { name: p.name, hire: base, pre: true, target: true, quit: o.quit || '', alias: o.alias || [], emp: o.emp || '', birth: o.birth || '', phone: o.phone || '',
      minus: Number(p.minus) || 0, memo, grp: 'hk', hkPin: o.hkPin || '' };
    (hk ? out.upd : out.add).push({ pid, doc });
    // 달마다 차이만 (지금 기록의 '연차' 합 → 대장 값)
    const cur = {};
    Object.keys(recs).forEach(id => { const x = recs[id]; if (x.pid === pid && x.kind === '연차') cur[x.ym] = L.r1((cur[x.ym] || 0) + x.days); });
    const want = monthsOf(p), ms = Object.keys(Object.assign({}, cur, want)).sort();
    ms.forEach(m => { const d = L.r1((want[m] || 0) - (cur[m] || 0)); if (d) out.recs.push({ pid, name: p.name, ym: m, days: d }); });
  });
  return out;
}
export async function write(R, prog) {
  prog = prog || (() => {});
  await I.fetchAll();
  const P = plan(R, I.people, I.recs);
  if (P.stop.length) throw new Error(P.stop.join('\n'));
  const all = P.add.concat(P.upd);
  for (const x of all) await S.set('leave_people/' + x.pid, Object.assign({}, x.doc, { upd: S.SERVER_TIME, by: '대장 가져오기' }));
  prog('명단 ' + all.length + '명');
  for (let i = 0; i < P.recs.length; i += 40) {
    await Promise.all(P.recs.slice(i, i + 40).map(x => S.add('leave_recs', { pid: x.pid, name: x.name, ym: x.ym, days: x.days, kind: '연차', memo: '대장에서 가져옴', by: '관리자', at: S.SERVER_TIME }).done));
    prog('기록 ' + Math.min(P.recs.length, i + 40) + '/' + P.recs.length);
  }
  await I.fetchAll();
  return { people: all.length, added: P.add.length, recs: P.recs.length };
}
