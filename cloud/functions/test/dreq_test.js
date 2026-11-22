// node test/dreq_test.js — 더티 요청 푸시 판단 시험 (예시 이름만)
const assert = require('assert');
const { plan, dead, KEEP } = require('../dreq');
const now = Date.parse('2026-11-22T05:00:00Z');
const ph = (id, name, token, ago, app) => ({ id, data: { app: app || 'dirty', name, token, at: now - (ago || 0) } });
const phones = [ph('u1', '김보조', 'T1'), ph('u2', '이보조', 'T2'), ph('u3', '김보조', 'T1'), ph('u4', '박보조', 'T4', KEEP + 1), ph('u5', '김보조', 'T5', 0, 'rm')];
const req = (n, extra) => Object.assign({ maid: '홍길순', names: ['홍길순'], ws: ['김보조'], rooms: ['1203', '1205'], n, at: now - 60e3 }, extra || {});
let ok = 0; const t = (name, fn) => { fn(); ok++; console.log('✓', name); };

t('처음 요청 → 김보조 휴대폰 한 번만 (같은 토큰 문서 2개 묶음, rm 앱 토큰 제외)', () => {
  const p = plan(null, req(1), phones, now);
  assert.deepStrictEqual(p.targets, [{ token: 'T1', ids: ['u1', 'u3'] }]);
  assert.strictEqual(p.title, '🔔 홍길순 님 더티 요청');
  assert.ok(p.body.startsWith('먼저 할 방 1203, 1205'));
  assert.strictEqual(p.tag, 'dreq-홍길순');
});
t('두 번째 요청(n 증가) → 보냄, 본문에 몇 번째', () => { const p = plan(req(1), req(2), phones, now); assert.ok(p.body.includes('오늘 2번째')); });
t('n 그대로(다른 칸만 바뀜) → 안 보냄', () => assert.strictEqual(plan(req(2), req(2, { rooms: [] }), phones, now), null));
t('지워짐 → 안 보냄', () => assert.strictEqual(plan(req(1), null, phones, now), null));
t('30분 넘은 요청 → 안 보냄', () => assert.strictEqual(plan(null, req(1, { at: now - 31 * 60e3 }), phones, now), null));
t('담당 2명(ws) → 두 휴대폰', () => assert.strictEqual(plan(null, req(1, { ws: ['김보조', '이보조'] }), phones, now).targets.length, 2));
t('3주 넘게 안 연 휴대폰 제외', () => assert.strictEqual(plan(null, req(1, { ws: ['박보조'] }), phones, now).targets.length, 0));
t('등록 휴대폰 없음 → 대상 0 (기록만)', () => assert.strictEqual(plan(null, req(1, { ws: ['최보조'] }), phones, now).targets.length, 0));
t('2인 1조 이름 · 방 안 고름', () => { const p = plan(null, req(1, { names: ['홍길순', '홍길동'], rooms: [] }), phones, now); assert.strictEqual(p.title, '🔔 홍길순·홍길동 님 더티 요청'); assert.ok(p.body.startsWith('먼저 할 방은 안 골랐어요')); });
t('Firestore Timestamp 모양 at', () => assert.ok(plan(null, req(1, { at: { toMillis: () => now } }), phones, now)));
t('죽은 토큰 판정', () => { assert.ok(dead('messaging/registration-token-not-registered')); assert.ok(!dead('messaging/internal-error')); assert.ok(!dead('messaging/invalid-argument')); });
console.log(ok + '개 통과');
