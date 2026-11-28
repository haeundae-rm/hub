// 📋 jbrSync 함수 통째 시험 (2026-11-28) — 가짜 Firestore 로 1분씩 돌려 봄 (node test/jbrsync_run_test.js)
const Module = require('module');
let pass = 0, fail = 0; const ok = (c, l) => { c ? pass++ : fail++; console.log((c ? '  ✅ ' : '  ❌ ') + l); };
const DB = {}; let NOW = Date.parse('2026-11-28T10:00:00+09:00'), autoId = 0, reads = 0;
const TS = { __ts: 1 };
const clean = v => JSON.parse(JSON.stringify(v, (k, x) => (x && x.__ts ? NOW : x instanceof Date ? x.getTime() : x)));
const docApi = p => ({ id: p.split('/').pop(), get: async () => { reads++; return { exists: p in DB, id: p.split('/').pop(), data: () => clean(DB[p]) }; },
  set: async (d, o) => { DB[p] = o && o.merge ? Object.assign({}, DB[p] || {}, clean(d)) : clean(d); }, update: async d => { DB[p] = Object.assign({}, DB[p], clean(d)); }, delete: async () => { delete DB[p]; } });
const fakeAdmin = { initializeApp() {}, firestore: Object.assign(() => ({ doc: docApi, collection: c => ({ get: async () => { const ks = Object.keys(DB).filter(k => k.startsWith(c + '/') && k.split('/').length === c.split('/').length + 1); reads += ks.length || 1; return { docs: ks.map(k => ({ id: k.split('/').pop(), data: () => clean(DB[k]) })) }; },
  add: async d => { const id = 'a' + (++autoId); DB[c + '/' + id] = clean(d); return { id }; } }) }), { FieldValue: { serverTimestamp: () => TS } }), messaging: () => ({}) };
const fakeFn = { setGlobalOptions() {} }, sched = { onSchedule: (o, f) => f }, fs2 = { onDocumentWritten: (o, f) => f }, lg = { info() {}, warn() {}, error() {} };
const orig = Module._load; Module._load = function (req, ...a) { if (req === 'firebase-admin') return fakeAdmin; if (req === 'firebase-functions/v2') return fakeFn; if (req === 'firebase-functions/v2/scheduler') return sched; if (req === 'firebase-functions/v2/firestore') return fs2; if (req === 'firebase-functions/logger') return lg; return orig.call(this, req, ...a); };
const realNow = Date.now; Date.now = () => NOW;
const F = require('../index.js');
const tick = async (sec) => { NOW += sec * 1000; await F.jbrSync(); };
(async () => {
  const day = '2026-11-28', R = (st, nm) => [st, nm, '', '', 0, 0];
  DB['jbr/' + day] = { date: day, src: 'app', rooms: ['401', '402', '403'], r: { '401': R('1', '가람'), '402': R('1', '가람'), '403': R('1', '나래') }, cards: [], groups: [] };
  DB['days/' + day] = { maids: ['가람', '나래'] };
  DB['days/' + day + '/plans/가람'] = { rooms: [{ room: '401', tags: [] }, { room: '402', tags: [] }] };
  DB['days/' + day + '/plans/나래'] = { rooms: [{ room: '403', tags: [] }] };
  console.log('① 그림자 모드 (기본)');
  await tick(0); ok(DB['meta/rsync_srv'].state === 'wait' && DB['meta/rsync_srv'].runMode === 'shadow', '처음: 기다림 · 그림자');
  await tick(60); ok(DB['meta/rsync_srv'].state === 'ok' && DB['meta/rsync_cmp'] && DB['meta/rsync_cmp'].list.length === 0, '같으면 할 것 없음 (비교 기록 0)');
  let r0 = reads; await tick(60); ok(reads - r0 === 2, '그대로면 매분 2문서만 읽음 (' + (reads - r0) + ')');
  DB['jbr/' + day].r['402'] = R('1', '나래');   // 오더테이커가 402 를 나래로
  await tick(60); ok(DB['meta/rsync_srv'].state === 'wait', '바뀐 뒤 30초 기다림');
  await tick(60); const cmp = DB['meta/rsync_cmp'];
  ok(cmp.list.length === 1 && cmp.list[0].keys.sort().join() === '제외|가람|402,추가|나래|402', '계산: 402 가람 → 나래 · 비교 기록 1건');
  ok(!Object.keys(DB).some(k => k.startsWith('days/' + day + '/changes/')), '그림자라 메이드 앱엔 안 씀');
  // PC 가 반영 (기록)
  DB['uploads/rsync_' + day] = { ids: ['p1', 'p2'], log: [{ at: NOW + 20e3, how: '자동', ops: [{ k: '제외', maid: '가람', room: '402', id: 'p1' }, { k: '추가', maid: '나래', room: '402', id: 'p2' }] }], ign: {} };
  DB['days/' + day + '/changes/p1'] = { kind: '제외', maid: '가람', room: '402', by: '관리자', at: NOW, clientAt: NOW };
  DB['days/' + day + '/changes/p2'] = { kind: '추가', maid: '나래', room: '402', by: '관리자', at: NOW, clientAt: NOW };
  DB['jbr/' + day].r['403'] = R('1', '가람');   // 또 바뀜 → 다시 계산하면서 앞의 것 비교
  await tick(60); await tick(60);
  ok(DB['meta/rsync_cmp'].same === 1, 'PC 가 같은 걸 반영 → 「같음」 1');
  console.log('② live 모드 (전환 뒤)');
  DB['meta/rsync_srv'].mode = 'live'; DB['jbr/' + day].r['401'] = R('1', '나래');
  await tick(60); await tick(60);
  const chg = Object.keys(DB).filter(k => k.startsWith('days/' + day + '/changes/a'));
  ok(chg.length === 4 && chg.every(k => DB[k].uid === 'server-jbrSync'), '서버가 반영 (403 은 PC 가 아직이던 것 · 401 새로): 변경 ' + chg.length + '건 (' + chg.map(k => DB[k].kind + ' ' + DB[k].maid + ' ' + DB[k].room).join(', ') + ')');
  ok(chg.every(k => DB['sup/' + day + '/rm/' + k.split('/').pop()]), '정비 지원(sup/{날}/rm)에도');
  const lg2 = DB['uploads/rsync_' + day]; ok(lg2.log[lg2.log.length - 1].how === '서버' && lg2.ids.length === 6, '기록 uploads/rsync_{날}: how 서버 · ids 2+4');
  await tick(60); ok(Object.keys(DB).filter(k => k.startsWith('days/' + day + '/changes/a')).length === 4, '다음 분: 두 번 넣지 않음');
  console.log('③ 20건 넘으면 보류 → 허브 go');
  for (let i = 0; i < 25; i++) { const k = String(1001 + i); DB['jbr/' + day].rooms.push(k); DB['jbr/' + day].r[k] = R('1', '가람'); }
  await tick(60); await tick(60);
  ok(DB['meta/rsync_srv'].state === 'hold' && DB['meta/rsync_srv'].hold.n === 25, '25건 → 보류 (hold)');
  ok(Object.keys(DB).filter(k => k.startsWith('days/' + day + '/changes/a')).length === 4, '보류 중엔 안 씀');
  DB['meta/rsync_srv'].go = DB['meta/rsync_srv'].hold.hash; await tick(60);
  ok(Object.keys(DB).filter(k => k.startsWith('days/' + day + '/changes/a')).length === 29 && !DB['meta/rsync_srv'].hold, '허브에서 「반영」(go) → 25건 들어감 · 보류 풀림');
  console.log('④ 엑셀 날 · off');
  DB['jbr/' + day].src = 'excel'; await tick(60); ok(DB['meta/rsync_srv'].state === 'excel', '엑셀 사본인 날은 쉼');
  DB['meta/rsync_srv'].mode = 'off'; await tick(60); ok(DB['meta/rsync_srv'].state === 'off', 'off');
  Date.now = realNow;
  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
