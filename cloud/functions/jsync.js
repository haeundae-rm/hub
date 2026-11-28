// 📋 정비보고서(앱) → 메이드 휴대폰 서버 반영 (2026-11-28) — 계산 부분 (Firebase 없이 시험할 수 있게 따로 둠)
//   지금은 오더테이커 PC 크롬의 「정비보고서 연결」(rm/app/rsync.js pollApp)이 켜져 있어야 반영됨 → 서버가 같은 계산을 1분마다
//   같은 부품: rm/app/engine.js makeRows · rm/app/rsync.js appData · planSync (rm/ 폴더에 사본 — test/jsync_test.js 가 원본과 같은지 확인)
//   메이드 앱 상태 = rm/app/app.js buildAll 과 같은 셈 (plans + changes(sortChg · steps) + info(applyInfo))
//   단계: 'shadow' = 계산만 하고 meta/rsync_cmp 에 기록 (PC 가 실제로 반영한 것과 비교) → 같으면 'live' (소장님 허브에서 전환)
'use strict';

const PICK = ['재실', '단체', '테마', '룸체', 'VIP', '연박·재입', '주의', '당직', '학단 복구'];   // rm/app/app.js PICK 과 같음
const STABLE_MS = 30000;   // rsync APP_STABLE_MS — 앱 정비보고서가 30초 그대로일 때만
const BIG = 20;            // 한 번에 20건 넘으면 보류 (서버엔 확인 누를 사람이 없음 → 허브에서)

const ms = v => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  const n = Date.parse(v); return isNaN(n) ? 0 : n;
};
const seoulDay = t => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);

// ---- rm/app/app.js 와 같은 셈
const tagKey = t => String(t).split(':')[0];
function infoTags(i) { return Array.isArray(i.tags) ? i.tags.filter(t => PICK.indexOf(t) >= 0) : (i.stay ? ['재실'] : []); }
function sortChg(list) {
  return list.slice().sort((a, b) => (ms(a.data.clientAt) || ms(a.data.at)) - (ms(b.data.clientAt) || ms(b.data.at)) || ms(a.data.at) - ms(b.data.at) || (a.id < b.id ? -1 : 1));
}
function steps(c) {
  const d = c.data, base = { at: ms(d.clientAt) || ms(d.at), by: d.by, id: c.id, uid: d.uid };
  if (d.kind !== '교환') return [Object.assign({}, base, { kind: d.kind, maid: d.maid, room: d.room })];
  return [Object.assign({}, base, { kind: '넘김', maid: d.maid, room: d.room, to: d.to }), Object.assign({}, base, { kind: '넘김', maid: d.to, room: d.toRoom, to: d.maid })];
}
function cloneRoom(x) { return { room: String(x.room), tags: (x.tags || []).slice(), note: x.note || '', due: x.due || '', after: x.after || '', memo: x.memo || '' }; }
/** dayMaids = days/{날}.maids 순서, plans = {메이드: rooms[]}, chg = [{id, data}], info = {객실: 문서} → { maids:[{name, rooms}] } (app.js buildAll) */
function buildAll(dayMaids, plans, chg, info) {
  const order = (dayMaids || []).slice(); Object.keys(plans).forEach(n => { if (order.indexOf(n) < 0) order.push(n); });
  const maids = [], byName = {};
  order.forEach(n => { if (!plans[n]) return; byName[n] = { name: n, rooms: plans[n].map(cloneRoom), removed: [] }; maids.push(byName[n]); });
  sortChg(chg).forEach(cd => steps(cd).forEach(c => {
    const m = byName[c.maid], room = c.room; if (!m || !room) return;
    const i = m.rooms.findIndex(x => x.room === room), j = m.removed.findIndex(x => x.room === room);
    if (c.kind === '넘김') {
      const to = byName[c.to]; if (!to || i < 0) return;
      const x = m.rooms.splice(i, 1)[0]; if (to.rooms.some(y => y.room === room)) return;
      if (!x.orig) x.orig = m.name; if (x.orig === to.name) { delete x.orig; delete x.from; } else x.from = m.name;
      to.rooms.push(x); return;
    }
    if (c.kind === '추가') {
      if (j >= 0) { const x = m.removed.splice(j, 1)[0]; delete x.removedBy; m.rooms.push(x); }
      else if (i < 0) m.rooms.push({ room, tags: ['추가'], note: '', due: '', after: '', memo: '', added: true, by: c.by });
    } else if (c.kind === '제외' && i >= 0) { const x = m.rooms.splice(i, 1)[0]; x.removedBy = c.by; m.removed.push(x); }
  }));
  const applyInfo = x => { const i = info[x.room]; if (!i) return x;
    const pick = infoTags(i), keep = x.tags.filter(t => PICK.indexOf(tagKey(t)) < 0 || pick.indexOf(tagKey(t)) >= 0);
    pick.forEach(k => { if (!keep.some(t => tagKey(t) === k)) keep.push(k); });
    x.tags = keep; x.after = i.after || ''; x.due = i.due || ''; x.note = i.note || ''; return x; };
  maids.forEach(m => { m.rooms.forEach(applyInfo); m.removed.forEach(applyInfo); });
  return { maids };
}

const rowsHash = rows => JSON.stringify(rows.map(x => x.slice(1, 7)));

/**
 * 한 번 돌기. eng = engine 모듈, rs = rsync 모듈
 * in: { now, day, jd(jbr 문서), srv(meta/rsync_srv 이전 값) }
 * → { step: 'excel'|'wait'|'same'|'plan', hash, rows? }  (plan 이면 다음에 앱 상태를 읽어 planOps)
 */
function check(inp, eng, rs) {
  const { now, day, jd } = inp, srv = inp.srv || {};
  if (!jd || jd.src !== 'app' || !jd.r) return { step: 'excel' };
  const { rows } = eng._test.makeRows(rs.appData(jd), day);
  const hash = rowsHash(rows);
  const was = srv.day === day ? srv : {};
  if (hash !== was.hash) return { step: 'wait', hash, since: now, rows };
  if (now - (Number(was.since) || 0) < STABLE_MS) return { step: 'wait', hash, since: was.since, rows };
  if (was.planned === hash) return { step: 'same', hash, since: was.since, rows };
  return { step: 'plan', hash, since: was.since, rows };
}

/**
 * 앱 상태 → planSync. st 재료: dayMaids, plans{}, chg[{id,data}], recs[{room,maid,status}], info{}, log(uploads/rsync_{날})
 */
function planOps(rows, s, rs) {
  const app = buildAll(s.dayMaids, s.plans, s.chg, s.info);
  if (!app.maids.length) return { noplan: true };
  const done = {}; (s.recs || []).filter(r => r.status === '완료' || r.status === '이상').forEach(r => { (done[r.room] = done[r.room] || []).push(r.maid); });
  const L = s.log || {}, mine = {}; (L.ids || []).forEach(id => { mine[id] = 1; });
  const p = rs.planSync(rows, { maids: app.maids, info: s.info, chg: s.chg, mine, done, pick: PICK, ign: L.ign || {} });
  return { ops: p.ops, diff: p.diff, warn: p.warn, held: p.held, lines: rs.opLines(p.ops), big: p.ops.length > BIG };
}

/**
 * 그림자 비교: 서버가 계산한 기록(list) ↔ PC 가 실제 반영한 기록(PC log = uploads/rsync_{날}.log)
 * 같은 키(k|maid|room)가 PC 기록에 서버 계산 3분 전 ~ 30분 뒤 사이에 있으면 '같음'
 */
function compare(list, pcLog, now) {
  const pc = (pcLog || []).filter(x => !x.undo && x.how !== '서버').map(x => ({ at: ms(x.at), keys: (x.ops || []).map(o => (o.k === '표시' ? '표시|' + o.room : o.k + '|' + (o.maid || '') + '|' + o.room)) }));
  let same = 0, miss = 0, wait = 0;
  const out = list.map(e => {
    if (!e.keys.length) return Object.assign({}, e, { pc: 'none' });
    const win = pc.filter(x => x.at >= e.at - 3 * 60e3 && x.at <= e.at + 30 * 60e3), got = new Set([].concat(...win.map(x => x.keys)));
    const all = e.keys.every(k => got.has(k));
    const st = all ? 'same' : now - e.at < 30 * 60e3 ? 'wait' : 'miss';
    if (st === 'same') same++; else if (st === 'miss') miss++; else wait++;
    return Object.assign({}, e, { pc: st, pcMissing: all ? [] : e.keys.filter(k => !got.has(k)).slice(0, 20) });
  });
  return { list: out, same, miss, wait };
}
const keyOf = o => (o.k === '표시' ? '표시|' + o.room : o.k + '|' + (o.maid || '') + '|' + o.room);

module.exports = { PICK, STABLE_MS, BIG, ms, seoulDay, buildAll, sortChg, steps, check, planOps, compare, keyOf, rowsHash };
