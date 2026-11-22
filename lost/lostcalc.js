// 🧳 습득물 관리대장 셈 (2026-11-22) — 화면 · 서버 함수 · 시험이 같이 씀 (Firebase 없음)
// 대장 한 줄 = lost/{id} { date, no, room, item, cat, police, place, note, by, src('app'|'hub'), chk, act, actDay, actBy, memo, clientAt, at }
// 규칙 (소장님 11/22): 귀중품 · 카드 · 신분증 → 찾아가지 않으면 경찰 인계 / 그 밖은 한 달 보관 뒤 폐기
export const CATS = ['의류', '잡화', '귀중품', '파손주의', '음식', '기타'];
export const DONE = ['F/D', '택배', '직접인계', '폐기', '경찰 인계'];            // 조치 완료 (엑셀 대장 '설정' 시트와 같은 뜻 + 경찰 인계)
export const KEEP = ['귀중품 보관함', '습득물 냉장고', '파손주의 보관함'];      // 보관 위치 (완료 아님)
export const ACTS = DONE.concat(KEEP);
export const DISPOSE_DAYS = 30;

const dayMs = d => Date.parse(d + 'T00:00:00Z');
export const ageDays = (x, today) => Math.round((dayMs(today) - dayMs(x.date)) / 864e5);
export const isDone = x => DONE.indexOf(x.act) >= 0;
export const isValuable = x => x.cat === '귀중품' || !!x.police;
const tOf = x => Number(x.clientAt) || Number(x.at) || 0;
export const byTime = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : tOf(a) - tOf(b));

/** 처리할 것: 폐기 대상(30일 지난 일반 물품) · 경찰 인계 대기(귀중품) · 확인 안 함(오늘 · 어제) */
export function todo(list, today) {
  const L = (list || []).filter(x => x && x.date && !isDone(x));
  return {
    dispose: L.filter(x => !isValuable(x) && x.cat !== '음식' && ageDays(x, today) >= DISPOSE_DAYS).sort(byTime),
    food: L.filter(x => x.cat === '음식' && ageDays(x, today) >= 3).sort(byTime),   // 음식은 오래 두지 않게 (3일)
    police: L.filter(x => isValuable(x)).sort(byTime),
    unchecked: (list || []).filter(x => x && !x.chk && ageDays(x, today) <= 1).sort(byTime)
  };
}
/** 귀중품 모아보기 (그 달) — 보관 중 먼저, 조치 완료 뒤 */
export function valuables(list, ym) {
  const L = (list || []).filter(x => x && x.date && x.date.slice(0, 7) === ym && isValuable(x));
  return L.filter(x => !isDone(x)).sort(byTime).concat(L.filter(isDone).sort(byTime));
}
/** 엑셀 (그 달): '대장' 한 장 + '귀중품 모아보기' — xlsxw.book 모양 */
export function excel(list, ym) {
  const L = (list || []).filter(x => x && x.date && x.date.slice(0, 7) === ym).sort(byTime);
  const H = ['발견일', '객실 번호', '습득물 내용', '분류', '확인', '조치 내용', '조치일', '특이사항', '접수'];
  const md = d => Number(d.slice(5, 7)) + '/' + Number(d.slice(8));
  const row = x => [md(x.date), x.room, x.item, x.cat, x.chk ? 1 : '', x.act, x.actDay ? md(x.actDay) : '', [x.note, x.memo].filter(Boolean).join(' / '), x.src === 'app' ? x.by + ' (앱)' : (x.by || '수기')]
    .map((v, i) => ({ v: v == null ? '' : v, s: i === 2 || i === 7 ? 'wrap' : 'cell' }));
  const title = Number(ym.slice(0, 4)) + '년 ' + Number(ym.slice(5)) + '월';
  const V = valuables(L, ym), open = V.filter(x => !isDone(x)).length;
  const sheet = (name, t, sub, rows) => ({
    name, cols: [8, 9, 26, 9, 6, 18, 8, 22, 12], merge: ['A1:I1', 'A2:I2'], freeze: 3,
    rows: [[{ v: t, s: 'title' }], [{ v: sub, s: 'sub' }], H.map(v => ({ v, s: 'head' }))].concat(rows.length ? rows.map(row) : [[{ v: '없음', s: 'cell' }]])
  });
  return [
    sheet('대장', '객실 습득물 관리 대장 · ' + title, '총 ' + L.length + '건 · 조치 완료 ' + L.filter(isDone).length + '건', L),
    sheet('귀중품 모아보기', '귀중품 모아보기 · ' + title, '보관 중 ' + open + '건 / 조치 완료 ' + (V.length - open) + '건', V)
  ];
}
/** 대장 한 줄 검사 (허브 수기 기재 · 고치기) — 틀리면 글, 맞으면 '' */
export function check(x) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date || '')) return '날짜를 골라 주세요.';
  if (!x.room || !(/^\d{3,4}$/.test(x.room) || x.room === '공용')) return '객실 번호(3~4자리) 또는 "공용"을 적어 주세요.';
  if (!String(x.item || '').trim()) return '습득물 내용을 적어 주세요.';
  if (CATS.indexOf(x.cat) < 0) return '분류를 골라 주세요.';
  if (x.act && ACTS.indexOf(x.act) < 0) return '조치를 골라 주세요.';
  return '';
}
