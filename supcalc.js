// 🛏 더티 진행 % — 정비 지원 앱(dirty) 상단 '전체 n / m실'과 같은 셈 (2026-11-21)
// 정비 지원은 아침 배분(sup/{날}.plan)에 그날 '변경' 줄(수량 수정 · 가져옴 · 되돌림 · 넘겨받음 · 자동 배정)과
// 레포트 앱 객실 변경(sup/{날}/rm)을 차례로 얹고, 메이드마다 min(체크한 객실, 지원 수량)을 더함.
// 허브는 예전에 아침 배분 수량 합 · 전체 체크 수만 세서 숫자가 달랐음 (정비 지원 70% ↔ 허브 100%)
// 원본: dirty/server.js state_() · checksFor_() · dirty/shim.js rebuild() · dirty/index.html overall()
const num = v => { const n = typeof v === 'number' ? v : v instanceof Date ? v.getTime() : Date.parse(v); return isNaN(n) ? 0 : n; };
const clean = v => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 20);
const roomsOf = v => String(v || '').split(/[,\s/]+/).map(s => s.replace(/^'/, '').replace(/\.0$/, '').replace(/호$/, '')).filter(s => /^\d{3,4}$/.test(s));
const unq = v => (typeof v === 'string' && v.charAt(0) === "'" ? v.slice(1) : v === null || v === undefined ? '' : v);

/** sp: sup/{날} 문서 · rows: sup/{날}/rows [{id,data}] · rmDocs: sup/{날}/rm [{id,data}] · SA: 정비 지원 autosup.js (없으면 레포트 변경은 뺌) */
export function supProgress(sp, rows, rmDocs, SA, day) {
  const plan = sp && Array.isArray(sp.plan) ? sp.plan : [];
  const maids = {}, list = [];
  plan.forEach(x => {
    if (!x || (x.d && day && String(x.d) !== day)) return;
    const name = String(x.m || '').trim(); if (!name || maids[name]) return;   // 메이드 칸이 빈 줄 = 기타 업무 인원
    const m = { name, dirty: Number(x.n) || 0, rooms: roomsOf(x.r), added: [], worker: clean(x.w), taken: false };
    maids[name] = m; list.push(m);
  });
  // 줄 모으기 (정비 지원과 같은 순서: 시각 → 기기 시각 → 문서 ID)
  let all = (Array.isArray(rows) ? rows : []).map(d => {
    const x = d && d.data; if (!x || ['체크', '변경'].indexOf(x.tab) < 0 || !Array.isArray(x.row)) return null;
    return { id: d.id, tab: x.tab, row: x.row.map(unq), at: num(x.at) || num(x.clientAt), c: num(x.clientAt) };
  }).filter(Boolean);
  const issued = sp && sp.src === 'app' ? num(sp.issued) : 0;   // 앱에서 다시 배분했으면 그 전 담당 변경은 버림
  if (issued) all = all.filter(x => x.tab !== '변경' || x.at >= issued);
  const sort = () => all.sort((a, b) => (a.at - b.at) || (a.c - b.c) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  sort();
  if (SA && Array.isArray(rmDocs) && rmDocs.length) {
    const ck = {};
    all.forEach(x => { if (x.tab === '체크') { const r0 = String(x.row[2] || ''); if (x.row[5] === '완료') ck[r0] = 1; else if (x.row[5] === '취소') delete ck[r0]; } });
    SA.rmRows(rmDocs, day, ck).rows.forEach(x => all.push({ id: 'rm:' + x.id, tab: '변경', row: x.row.map(unq), at: x.at, c: x.at }));
    sort();
  }
  const checks = {};
  all.forEach(x => {
    const r = x.row;
    if (x.tab === '체크') {
      if (day && String(r[1]).trim() !== day) return;
      const room = String(r[2]).replace(/\.0$/, '');
      if (r[5] === '완료') checks[room] = 1; else delete checks[room];
      return;
    }
    if (day && String(r[1]).trim() !== day) return;
    const kind = String(r[2]).trim(), wn = clean(r[4]), m = maids[String(r[3]).trim()];
    if (!m) return;   // 인원추가 · 근무종료 (메이드 칸 없음) — 수량엔 영향 없음
    const add = roomsOf(r[5]), dirty = r[6] === '' ? null : (Number(r[6]) || 0);
    roomsOf(r[7]).filter(x => m.rooms.indexOf(x) >= 0).forEach(x => { if (m.added.indexOf(x) >= 0) m.added.splice(m.added.indexOf(x), 1); m.rooms.splice(m.rooms.indexOf(x), 1); });
    add.forEach(x => { if (m.rooms.indexOf(x) < 0) { m.rooms.push(x); m.added.push(x); } });
    if (kind === '가져옴' && !m.worker) { m.worker = wn; m.taken = true; m.dirty = dirty || 0; }
    else if (kind === '수정') { if (m.worker && dirty !== null) m.dirty = dirty; }
    else if (kind === '되돌림' && m.taken && m.worker) { m.worker = ''; m.taken = false; m.dirty = 0; }
    else if (kind === '넘겨받음' && m.worker && wn && m.worker !== wn) m.worker = wn;
  });
  let done = 0, target = 0;
  const by = {};
  list.filter(m => m.worker).forEach(m => {
    const d = Math.min(m.rooms.filter(r => checks[r]).length, m.dirty);
    done += d; target += m.dirty;
    const w = by[m.worker] || (by[m.worker] = { name: m.worker, done: 0, target: 0 }); w.done += d; w.target += m.dirty;
  });
  return { done, target, checked: Object.keys(checks).length, workers: Object.keys(by).map(k => by[k]) };
}
