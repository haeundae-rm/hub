// node test/lost_test.js — 🧳 습득물 매일 정리 셈 (예시만)
const assert = require('assert');
const LO = require('../lost');
let ok = 0; const t = (n, f) => { f(); ok++; console.log('✓', n); };
const today = '2026-11-22';
const L = [
  { id: 'a', date: '2026-10-20', cat: '의류', act: '' },                 // 33일 → 폐기 대상
  { id: 'b', date: '2026-11-01', cat: '의류', act: '' },                 // 21일 → 아직
  { id: 'c', date: '2026-10-01', cat: '귀중품', police: true, act: '' }, // 경찰 인계 대기 (폐기 아님)
  { id: 'd', date: '2026-11-18', cat: '음식', act: '습득물 냉장고' },     // 4일 → 음식
  { id: 'e', date: '2026-09-01', cat: '기타', act: '폐기', actDay: '2026-08-01', n: 1 },
  { id: 'f', date: '2026-10-01', cat: '잡화', act: '택배', actDay: '2026-10-02', n: 2 },
  { id: 'g', date: '2026-07-01', cat: '잡화', act: 'F/D', actDay: '2026-07-02', n: 1, imgGone: true },
  { id: 'h', date: '2026-11-21', cat: '기타', police: true, act: '귀중품 보관함' }
];
t('처리 대기 셈', () => assert.deepStrictEqual(LO.sum(L, today), { police: 2, dispose: 1, food: 1, open: 5 }));
t('사진 정리: 조치 90일 지난 것만 · 이미 지운 것 제외', () => assert.deepStrictEqual(LO.photoGone(L, today).map(x => x.id), ['e']));
console.log(ok + '개 통과');
