// 🎂 생일 축하 — 오늘 생일인 사람 고르기 · 공지 문서 만들기 (Firebase 없이 시험할 수 있게 따로 둠). 2026-11-22
// 사람 = leave_people {name, birth 'YYYY-MM-DD', quit, grp}. 하우스키핑(grp 'hk')은 레포트 앱을 안 써서 제외
const crypto = require('crypto');

/** 서울 날짜 'YYYY-MM-DD' */
function seoulDay(ms) { return new Date(ms + 9 * 3600e3).toISOString().slice(0, 10); }
const leap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
/** 생일 'MM-DD' (2/29 생은 평년엔 2/28 에 축하) */
function bdayMd(birth, year) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birth || '').trim()); if (!m) return '';
  const md = m[2] + '-' + m[3];
  return md === '02-29' && !leap(year) ? '02-28' : md;
}
/** people = [{id, data}] → 오늘 생일인 사람 [{name, alias}] (재직 · 룸메이드 쪽만, 이름 겹침 없이) */
function todays(people, day) {
  const y = Number(day.slice(0, 4)), md = day.slice(5), out = [];
  (people || []).forEach(p => {
    const d = p && p.data; if (!d || !d.name) return;
    if (d.grp === 'hk') return;
    if (d.quit && String(d.quit) < day) return;
    if (bdayMd(d.birth, y) !== md) return;
    const name = String(d.name).replace(/\s+/g, '').slice(0, 20);
    if (!name || out.some(o => o.name === name)) return;
    // 레포트 앱 이름이 명단과 다를 수 있어 '같은 사람'(alias) 이름도 받는 사람에 넣음
    const alias = (Array.isArray(d.alias) ? d.alias : []).map(a => String(a).replace(/\s+/g, '').slice(0, 20)).filter(a => a && a !== name);
    out.push({ name, alias });
  });
  return out;
}
/** 공지 문서 (허브 공지와 같은 칸 · id 는 날짜+이름으로 정해져서 다시 돌아도 하나만) */
function notice(who, day) {
  const name = who.name || who, targets = [name].concat(who.alias || []);
  const h = crypto.createHash('sha1').update(day + '|' + name).digest('hex').slice(0, 8);
  const id = 'hub-bday-' + day.replace(/-/g, '').slice(2) + '-' + h;
  return { id, doc: {
    id, src: 'hub', kind: 'bday', title: '🎂 ' + name + ' 님, 생일 축하해요!',
    body: name + ' 님, 오늘 생일을 진심으로 축하드려요.\n늘 객실을 깨끗하게 지켜 주셔서 고맙습니다.\n오늘 하루 행복하게 보내세요! 🎉\n\n— 해운대 객실팀 드림',
    from: day, to: day, target: targets.join('/'), targets, popup: true, daily: false,
    img: '', imgName: '', imgs: [], imgNames: [], by: '자동(생일)'
  } };
}
module.exports = { seoulDay, bdayMd, todays, notice };
