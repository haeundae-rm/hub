// 🎂 이번 주 생일 (2026-11-22) — 허브 첫 화면 한 줄. 소장 · 부소장만 (연차 명단 leave_people 은 isBoss 만 읽음)
// 읽기 아끼기: 하루 한 번만 명단을 읽고, 이름 · 월일만 이 PC 에 기억 (생년 · 나이는 안 남김)
// 메이드 본인 축하는 서버 함수 bdayNotice 가 아침 6시에 본인만 보이는 공지로 올림 (폭죽)
const KEY = 'hub_bday';
const leap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export function mdOf(birth) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birth || '').trim()); return m ? m[2] + '-' + m[3] : ''; }
/** list = [{n, md}] (월일만) → 오늘부터 7일 안 [{n, day, dd}] (dd = 며칠 뒤) */
export function week(list, today) {
  const out = [], t0 = Date.parse(today + 'T00:00:00Z');
  for (let i = 0; i < 7; i++) {
    const d = new Date(t0 + i * 864e5).toISOString().slice(0, 10), y = Number(d.slice(0, 4)), md = d.slice(5);
    list.forEach(p => { const pm = p.md === '02-29' && !leap(y) ? '02-28' : p.md; if (pm === md) out.push({ n: p.n, day: d, dd: i }); });
  }
  return out;
}
/** 명단 → 기억할 모양 (재직 · 룸메이드 쪽만) */
export function slim(people, today) {
  const seen = {}, out = [];
  (people || []).forEach(x => {
    const d = x && x.data; if (!d || !d.name || d.grp === 'hk' || (d.quit && String(d.quit) < today)) return;
    const md = mdOf(d.birth), n = String(d.name).replace(/\s+/g, ''); if (!md || seen[n]) return;
    seen[n] = 1; out.push({ n, md });
  });
  return out;
}
/** 하루 한 번만 읽음. 실패하면 null (첫 화면엔 안 보임) */
export async function load(S, today) {
  try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); if (c && c.day === today && Array.isArray(c.list)) return week(c.list, today); } catch (e) {}
  try {
    const list = slim(await S.getQuery('leave_people', []), today);
    try { localStorage.setItem(KEY, JSON.stringify({ day: today, list })); } catch (e) {}
    return week(list, today);
  } catch (e) { return null; }
}
const DOW = '일월화수목금토';
/** 첫 화면 한 줄 */
export function html(L, esc) {
  if (!Array.isArray(L) || !L.length) return '';
  return '<div class="card hm-bday"><b>🎂 이번 주 생일</b><span>' + L.map(x => {
    const d = new Date(x.day + 'T00:00:00Z');
    return esc(x.n) + ' ' + (x.dd === 0 ? '<i>오늘</i>' : (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '(' + DOW[d.getUTCDay()] + ')');
  }).join(' · ') + '</span>' + (L.some(x => x.dd === 0) ? '<small>오늘 생일인 분 휴대폰에는 아침 6시에 축하 공지가 떠요</small>' : '') + '</div>';
}
