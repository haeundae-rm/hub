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
  await db().doc('meta/bday_fn').set({ at: admin.firestore.FieldValue.serverTimestamp(), day, n: names.length }).catch(() => {});
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
