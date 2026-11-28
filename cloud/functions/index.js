// 해운대 객실 앱 서버 함수 (Cloud Functions for Firebase, 2세대) — 2026-11-22 처음
// 배포: Google Cloud Shell 에서 소장님 로그인으로 (키 파일 없음). 방법은 cloud/README.md
// 서울(asia-northeast3) = Firestore 와 같은 곳. 동시에 2개까지만 떠서 요금이 튀지 않게
const { setGlobalOptions } = require('firebase-functions/v2');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { plan, dead } = require('./dreq');
const B = require('./bday');
const LO = require('./lost');

admin.initializeApp();
setGlobalOptions({ region: 'asia-northeast3', maxInstances: 2, memory: '256MiB', timeoutSeconds: 30 });

const db = () => admin.firestore();

// 🔔 메이드 더티 요청 → 담당 정비보조 휴대폰에 푸시 (앱이 꺼져 있어도)
//   요청 문서가 새로 생기거나 n(오늘 몇 번째)이 늘 때만. 휴대폰 목록은 push 에서 app=='dirty' 한 조건으로만 읽고 이름은 여기서 거름 (색인 필요 없음)
exports.dreqPush = onDocumentWritten({ document: 'sup/{date}/req/{maid}', retry: false }, async (ev) => {
  const before = ev.data && ev.data.before && ev.data.before.exists ? ev.data.before.data() : null;
  const after = ev.data && ev.data.after && ev.data.after.exists ? ev.data.after.data() : null;
  if (!after || (before && (Number(before.n) || 0) >= (Number(after.n) || 0))) return;   // 읽기 전에 먼저 걸러 읽기 비용 아낌
  const snap = await db().collection('push').where('app', '==', 'dirty').get();
  const p = plan(before, after, snap.docs.map(d => ({ id: d.id, data: d.data() })), Date.now());
  if (!p) return;
  let sent = 0, fail = 0;
  const gone = [];
  if (p.targets.length) {
    const res = await admin.messaging().sendEach(p.targets.map(t => ({
      token: t.token,
      data: { title: p.title, body: p.body, tag: p.tag, url: p.url },   // 데이터만 보냄 → 휴대폰 sw.js 가 알림을 띄움
      webpush: { headers: { Urgency: 'high', TTL: '1800' } }
    })));
    res.responses.forEach((r, i) => {
      if (r.success) { sent++; return; }
      fail++;
      const code = r.error && r.error.code;
      logger.warn('푸시 실패', { code, ids: p.targets[i].ids });
      if (dead(code)) gone.push(...p.targets[i].ids);
    });
  }
  await Promise.all(gone.map(id => db().doc('push/' + id).delete().catch(() => {})));
  // 허브가 '함수 마지막 실행'을 볼 수 있게 (메이드 이름 · 몇 대 보냄만)
  await db().doc('meta/push_fn').set({
    at: admin.firestore.FieldValue.serverTimestamp(), date: ev.params.date, maid: String(after.maid || ''),
    to: p.names, sent, fail, gone: gone.length, none: p.targets.length === 0
  }).catch(e => logger.error('meta/push_fn 저장 실패', e));
  logger.info('더티 요청 푸시', { maid: after.maid, to: p.names, sent, fail, gone: gone.length });
});

// 🎂 생일 축하 (2026-11-22) — 매일 아침 6시(서울) 오늘 생일인 룸메이드에게 본인만 보이는 '꼭 확인' 공지를 올림
//   레포트 앱이 공지를 열면 폭죽. 이름은 연차 명단(leave_people) 기준, 퇴사자 · 하우스키핑 제외, 생년(나이)은 안 씀
exports.bdayNotice = onSchedule({ schedule: '0 6 * * *', timeZone: 'Asia/Seoul', retryCount: 1 }, async () => {
  const day = B.seoulDay(Date.now());
  const snap = await db().collection('leave_people').get();
  const names = B.todays(snap.docs.map(d => ({ id: d.id, data: d.data() })), day);
  for (const n of names) {
    const x = B.notice(n, day);
    await db().doc('notices/' + x.id).set(Object.assign(x.doc, { at: admin.firestore.FieldValue.serverTimestamp() }));
  }
  await db().doc('meta/bday_fn').set({ at: admin.firestore.FieldValue.serverTimestamp(), day, n: names.length }).catch(e => logger.error('meta/bday_fn 저장 실패', e));
  logger.info('생일 공지', { day, n: names.length });
});

// 🧳 습득물 매일 정리 (2026-11-22) — 아침 6시 10분(서울): 처리 대기 수 → meta/lost_sum, 조치 끝나고 3개월 지난 사진 지움 (소장님 결정)
//   읽기: 보관 중인 줄은 최근 1년 날짜 한 조건 / 사진 정리는 조치일 한 조건 (복합 색인 없음)
exports.lostDaily = onSchedule({ schedule: '10 6 * * *', timeZone: 'Asia/Seoul', retryCount: 1 }, async () => {
  // 11/25 소장님: 허브 첫 화면 연동(처리 대기 수 meta/lost_sum)은 보류 — 조치 끝나고 90일 지난 사진 지우기만 함
  //   (처리 대기는 습득물 대장 화면의 '처리 대기' 탭이 직접 셈)
  const day = B.seoulDay(Date.now());
  const old = await db().collection('lost').where('actDay', '>=', '2000-01-01').where('actDay', '<', LO.addDays(day, -LO.PHOTO_KEEP)).get();   // 같은 칸 범위 두 개 = 색인 필요 없음, 빈 조치일은 안 읽음
  const gone = LO.photoGone(old.docs.map(d => Object.assign({ id: d.id }, d.data())), day);
  let fail = 0;
  for (const x of gone) {
    try { await db().doc('lost_img/' + x.id).delete(); await db().doc('lost/' + x.id).update({ imgGone: true }); }
    catch (e) { fail++; logger.error('습득물 사진 지우기 실패', { id: x.id, err: String(e && e.message || e) }); }
  }
  // 실행 기록 (화면에 안 띄움 · 나중에 아침 점검이 '돌았는지' 확인용)
  await db().doc('meta/lost_fn').set({ day, at: admin.firestore.FieldValue.serverTimestamp(), photosGone: gone.length - fail, fail });
  logger.info('습득물 사진 정리', { day, photosGone: gone.length - fail, fail });
});

// 📋 정비보고서(앱) → 메이드 휴대폰 서버 반영 (2026-11-28, 소장님 "반드시 진행") — 1분마다
//   오더테이커 PC 크롬 「정비보고서 연결」이 하던 계산(앱 정비보고서 ↔ 메이드 앱)을 서버가. 계산 부분은 jsync.js
//   meta/rsync_srv.mode: 'shadow'(기본) = 계산만 하고 meta/rsync_cmp 에 남겨 PC 가 실제로 반영한 것과 비교 / 'live' = 서버가 반영 (PC 연결 창은 쉼) / 'off'
//   읽기 아끼기: 매분 jbr/{오늘} · meta/rsync_srv 두 문서만. 앱 정비보고서가 바뀌고 30초 그대로일 때만 메이드 앱 상태(plans · changes · recs · info)를 읽음
//   안전장치(PC 와 같음): 손으로 바꾼 방 · 완료 방 · 관리자 표시 보호(planSync) · 20건 넘으면 보류(허브에서 meta/rsync_srv.go = hash 로 반영) · 기록 uploads/rsync_{날}
const J = require('./jsync');
let RM = null;
const rmMods = async () => { if (!RM) RM = { eng: await import('./rm/engine.mjs'), rs: await import('./rm/rsync.mjs') }; return RM; };
const toMs = o => { const x = Object.assign({}, o); Object.keys(x).forEach(k => { if (x[k] && typeof x[k].toMillis === 'function') x[k] = x[k].toMillis(); }); return x; };
exports.jbrSync = onSchedule({ schedule: 'every 1 minutes', timeZone: 'Asia/Seoul', retryCount: 0, memory: '512MiB', timeoutSeconds: 50 }, async () => {
  const now = Date.now(), day = J.seoulDay(now), F = admin.firestore.FieldValue;
  const [jSnap, sSnap] = await Promise.all([db().doc('jbr/' + day).get(), db().doc('meta/rsync_srv').get()]);
  const srv = sSnap.exists ? sSnap.data() : {}, mode = srv.mode === 'live' ? 'live' : srv.mode === 'off' ? 'off' : 'shadow';
  const hb = x => db().doc('meta/rsync_srv').set(Object.assign({ day, at: F.serverTimestamp(), runMode: mode }, x), { merge: true });
  if (mode === 'off') return hb({ state: 'off' });
  const { eng, rs } = await rmMods();
  const c = J.check({ now, day, jd: jSnap.exists ? jSnap.data() : null, srv }, eng, rs);
  if (c.step === 'excel') return hb({ state: 'excel', hash: '', planned: '' });
  if (c.step === 'wait') return hb({ state: 'wait', hash: c.hash, since: c.since });
  if (c.step === 'same' && !(srv.go && srv.go === c.hash && srv.hold)) return hb({ state: 'ok' });
  // 메이드 앱 상태 읽기 (바뀐 뒤 한 번)
  const D = 'days/' + day;
  const [dSnap, pl, ch, rc, inf, lg, pcSnap] = await Promise.all([db().doc(D).get(), db().collection(D + '/plans').get(), db().collection(D + '/changes').get(),
    db().collection(D + '/recs').get(), db().collection(D + '/info').get(), db().doc('uploads/rsync_' + day).get(), db().doc('meta/rsync').get()]);
  const plans = {}; pl.docs.forEach(x => { plans[x.id] = (x.data().rooms || []); });
  const info = {}; inf.docs.forEach(x => { info[x.id] = x.data(); });
  const log = lg.exists ? lg.data() : { ids: [], log: [], ign: {} };
  const p = J.planOps(c.rows, { dayMaids: (dSnap.exists && dSnap.data().maids) || [], plans, chg: ch.docs.map(x => ({ id: x.id, data: toMs(x.data()) })), recs: rc.docs.map(x => x.data()), info, log }, rs);
  if (p.noplan) return hb({ state: 'noplan', hash: c.hash, planned: c.hash });
  const keys = p.ops.map(J.keyOf), entry = { at: now, h: c.hash.length + ':' + keys.length, n: p.lines.length, keys: keys.slice(0, 60), lines: p.lines.slice(0, 30).map(l => l.room + ' ' + l.t + ' ' + l.s), diff: p.diff.length, held: p.held.length, big: p.big };
  // 그림자 비교 기록 (오늘 것만, 최근 60건)
  const cSnap = await db().doc('meta/rsync_cmp').get(), cd = cSnap.exists && cSnap.data().day === day ? cSnap.data() : { day, list: [] };
  const list = (p.ops.length ? cd.list.concat([entry]) : cd.list).slice(-60), cmp = J.compare(list, log.log, now);
  const pc = pcSnap.exists ? pcSnap.data() : {};
  await db().doc('meta/rsync_cmp').set({ day, at: F.serverTimestamp(), list: cmp.list, same: cmp.same, miss: cmp.miss, wait: cmp.wait, pcPend: Number(pc.pend) || 0, pcAt: J.ms(pc.at), last: { n: p.lines.length, diff: p.diff.length, at: now } });
  if (mode !== 'live' || !p.ops.length) return hb({ state: 'ok', planned: c.hash, n: p.lines.length, hold: null });
  if (p.big && srv.go !== c.hash) return hb({ state: 'hold', planned: c.hash, n: p.lines.length, hold: { hash: c.hash, n: p.lines.length, lines: entry.lines, at: now } });
  // 반영 (PC 연결 창과 같은 길: 담당 = days/{날}/changes + sup/{날}/rm, 표시 = days/{날}/info/{객실} by '보고서')
  const done = [];
  for (const o of p.ops) {
    if (o.k === '표시') {
      await db().doc(D + '/info/' + o.room).set({ tags: o.to.tags, after: o.to.after, due: o.to.due, note: o.note || '', by: '보고서', at: F.serverTimestamp() });
      done.push({ k: '표시', room: o.room, from: o.from, to: o.to, prev: o.prev ? { tags: o.prev.tags || [], after: o.prev.after || '', due: o.prev.due || '', note: o.prev.note || '', by: o.prev.by || '' } : null });
    } else {
      const d = { kind: o.k, maid: o.maid, room: o.room, by: '관리자', at: F.serverTimestamp(), clientAt: new Date(), uid: 'server-jbrSync', parties: [o.maid] };
      const ref = await db().collection(D + '/changes').add(d);
      await db().doc('sup/' + day + '/rm/' + ref.id).set(d).catch(e => logger.warn('정비 지원 반영 실패', String(e && e.message || e)));
      done.push({ k: o.k, maid: o.maid, room: o.room, id: ref.id });
    }
  }
  await db().doc('uploads/rsync_' + day).set({ csv: '', kind: 'rsync', date: day, ids: (log.ids || []).concat(done.filter(x => x.id).map(x => x.id)).slice(-2000),
    log: (log.log || []).concat([{ at: now, how: '서버', file: '📋 정비보고서 앱', ops: done, undo: false }]).slice(-100), ign: log.ign || {}, at: F.serverTimestamp() });
  logger.info('정비보고서 서버 반영', { day, n: done.length });
  return hb({ state: 'ok', planned: c.hash, n: 0, hold: null, go: null, lastApply: now, lastN: done.length });
});
