// node test/bday_test.js — 생일 고르기 · 공지 모양 (예시 이름만)
const assert = require('assert');
const B = require('../bday');
let ok = 0; const t = (n, f) => { f(); ok++; console.log('✓', n); };
const P = (name, birth, extra) => ({ id: name, data: Object.assign({ name, birth }, extra || {}) });
const people = [P('홍길순', '1970-11-22'), P('김영희', '1980-11-23'), P('박퇴사', '1975-11-22', { quit: '2026-10-31' }), P('이키퍼', '1977-11-22', { grp: 'hk' }),
  P('최윤년', '1972-02-29'), P('정 빈칸', '1990-11-22'), P('홍길순', '1970-11-22'), P('생일없음', '')];
t('서울 날짜 (UTC 21시 = 다음 날)', () => assert.strictEqual(B.seoulDay(Date.parse('2026-11-21T21:30:00Z')), '2026-11-22'));
t('오늘 생일: 재직 룸메이드만, 이름 공백 지움, 겹침 하나', () => assert.deepStrictEqual(B.todays(people, '2026-11-22').map(x => x.name), ['홍길순', '정빈칸']));
t('퇴사일이 오늘 이후면 포함', () => assert.deepStrictEqual(B.todays([P('박퇴사', '1975-11-22', { quit: '2026-11-30' })], '2026-11-22').map(x => x.name), ['박퇴사']));
t('2/29 생 → 평년 2/28', () => assert.deepStrictEqual(B.todays(people, '2027-02-28').map(x => x.name), ['최윤년']));
t('2/29 생 → 윤년엔 2/29', () => { assert.deepStrictEqual(B.todays(people, '2028-02-29').map(x => x.name), ['최윤년']); assert.deepStrictEqual(B.todays(people, '2028-02-28'), []); });
t('공지: 본인만 · 꼭 확인 · 그날 하루 · 허브 id', () => {
  const x = B.notice('홍길순', '2026-11-22');
  assert.ok(/^hub-bday-261122-[0-9a-f]{8}$/.test(x.id));
  assert.deepStrictEqual(x.doc.targets, ['홍길순']); assert.strictEqual(x.doc.popup, true); assert.strictEqual(x.doc.from, '2026-11-22'); assert.strictEqual(x.doc.to, '2026-11-22');
  assert.ok(!/1970|나이|\d+세/.test(x.doc.body), '생년·나이 없음');
  assert.strictEqual(B.notice('홍길순', '2026-11-22').id, x.id, '다시 돌아도 같은 id');
});
t('같은 사람(alias) 이름도 받는 사람에', () => {
  const w = B.todays([P('홍길순', '1970-11-22', { alias: ['홍길순A', '홍길순'] })], '2026-11-22')[0];
  assert.deepStrictEqual(B.notice(w, '2026-11-22').doc.targets, ['홍길순', '홍길순A']);
});
console.log(ok + '개 통과');
