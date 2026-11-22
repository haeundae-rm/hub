// 🧳 습득물 매일 정리 (2026-11-22) — hub/lost/lostcalc.js 와 같은 셈 (서버용 CommonJS 사본)
//   ① 처리 대기 수 → meta/lost_sum (허브 첫 화면이 문서 1건만 읽게)  ② 조치 끝나고 3개월(90일) 지난 사진 지우기 (lost_img)
const DONE = ['F/D', '택배', '직접인계', '폐기', '경찰 인계'];
const DISPOSE = 30, FOOD = 3, PHOTO_KEEP = 90;
const dayMs = d => Date.parse(d + 'T00:00:00Z');
const age = (x, today) => Math.round((dayMs(today) - dayMs(x.date)) / 864e5);
const done = x => DONE.indexOf(x.act) >= 0;
const val = x => x.cat === '귀중품' || !!x.police;
function addDays(d, n) { return new Date(dayMs(d) + n * 864e5).toISOString().slice(0, 10); }
/** list = 대장 줄들 → {police, dispose, food, open} */
function sum(list, today) {
  const L = (list || []).filter(x => x && x.date && !done(x));
  return {
    police: L.filter(val).length,
    dispose: L.filter(x => !val(x) && x.cat !== '음식' && age(x, today) >= DISPOSE).length,
    food: L.filter(x => x.cat === '음식' && age(x, today) >= FOOD).length,
    open: L.length
  };
}
/** 사진을 지울 줄: 조치 완료 + 조치일이 90일 넘게 지남 + 아직 안 지움 */
function photoGone(list, today) {
  const cut = addDays(today, -PHOTO_KEEP);
  return (list || []).filter(x => x && done(x) && x.actDay && x.actDay < cut && !x.imgGone && Number(x.n || 0) > 0);
}
module.exports = { sum, photoGone, addDays, PHOTO_KEEP };
