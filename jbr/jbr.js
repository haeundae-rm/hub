// hub/jbr/jbr.js — 📋 정비보고서 (2026-11-26, 12/1 실무 전환 1단계)
// 화면 = 시제품(index.html 안 스크립트, 확정본 11/26). 이 파일은 로그인 · 자료 받기만
//   jbr/{YYYY-MM-DD} = 정비보고서 연결(오더테이커 PC, rm/app/rsync.js)이 엑셀을 읽을 때마다 올리는 그날 사본
//     { date, src:'excel'|'app', file, rooms:[호실 순서], r:{호실:[상태, 정비자, 메모1, 메모2, 완료 1/0, 연박 1/0]},
//       xl:{정비수 · 로얄 · 인원 · 미정비 · 재실 · 간단 · 총유닛 = 엑셀 요약 칸}, cards:[{n,u,in}], groups:[{name,time,rooms:'101,102'}], roster:[설정 시트 명단] }
//   지난 날짜는 '엑셀로 채우기'(이 화면)로 한 번에 올림 — 이 브라우저에서 파일을 열어 날짜마다 저장 (src 'app' 인 날은 안 덮음)
// 규칙 v32: 읽기 · 쓰기 관리자(소장 · 부소장 · 봇 · 하우스키퍼)
import * as S from '../../rm/app/store.js';

const VER = '2026.11.26-1';
const ROLES = [
  { label: '하우스키퍼', email: 'unieshaeundae+hk@gmail.com', uid: 'nBL2QYezEmRNRmBRMXN6LNPJO2s2' },
  { label: '소장', email: 'unieshaeundae+admin@gmail.com', uid: 'iw2orXgIgPgTbLUQa0b41XJ9Dvd2' },
  { label: '부소장', email: 'unieshaeundae+sub@gmail.com', uid: 'Fz4T5ZzIxShOdVkNpF9gzMmOLED2' }
];
const $ = s => document.querySelector(s);
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const seoul = (t = Date.now()) => new Date(t + 9 * 3600e3);
const TODAY = seoul().toISOString().slice(0, 10);
const ym = (d, n) => { const y = +d.slice(0, 4), m = +d.slice(5, 7) - 1 + n; return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7); };
const hm = t => { if (!t) return ''; const d = seoul(Number(t)); return ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2); };

let role = null, login = { who: 0, err: '', busy: false }, unsub = [], docs = [], hb = null, meta = { fromCache: false, pending: 0 }, fill = '';

// ---------- 사본들 → 화면 자료 (시제품 data.json 모양)
export function toP(list) {
  const days = list.filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && x.r).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!days.length) return null;
  const last = days[days.length - 1], rooms = (last.rooms && last.rooms.length ? last.rooms : Object.keys(last.r)).map(String);
  const seen = new Set(rooms); days.forEach(d => Object.keys(d.r).forEach(r => { if (!seen.has(r)) { seen.add(r); rooms.push(r); } }));
  const months = {};
  for (const d of days) {
    const m = d.date.slice(0, 7), M = months[m] = months[m] || { days: {}, roster: [], xl: { has: false, room: { per: {}, '정비수': [], '인원': [] }, bill: { '정비수': [], '인원': [], '금액': [] }, ot: {}, otT: { d: [] }, unit: {} } };
    M.days[d.date] = {
      r: rooms.map(r => { const x = d.r[r]; return x ? [x[0] || '', x[1] || '', x[2] || '', x[3] || '', x[4] ? '1' : '', x[5] ? 1 : 0] : null; }),
      cards: (d.cards || []).map(c => [c.n, c.u, c.in ? 1 : 0]),
      groups: (d.groups || []).map(g => [g.name, g.time, String(g.rooms || '').split(',').filter(Boolean)]),
      xl: d.xl || {}, at: d.at || 0, file: d.file || '', src: d.src || ''
    };
    if (d.roster && d.roster.length) M.roster = d.roster;
  }
  // 명단이 없는 달은 그 달 카드 이름으로
  Object.values(months).forEach(M => { if (!M.roster.length) { const s = new Set(); Object.values(M.days).forEach(x => x.cards.forEach(c => c[0] && s.add(c[0]))); M.roster = [...s]; } });
  return { rooms, months };
}

function push() {
  const P = toP(docs);
  if (!P) { $('#main').innerHTML = '<div class="box" style="max-width:640px;margin:30px auto"><h3>아직 올라온 정비보고서가 없어요</h3><p class="hint">오더테이커 PC 정비 레포트 관리자 화면의 「정비보고서 연결」이 켜져 있으면 1분 안에 오늘 것이 올라와요. 지난 날짜는 위 「📥 엑셀로 채우기」로 한 번에 올릴 수 있어요.</p></div>'; tag(); return; }
  if (window.JBR) window.JBR.set(P); else window.__jbrQ = P;
  tag();
}
function tag() {
  const el = $('#liveTag'); if (!el) return;
  const t = docs.find(x => x.date === TODAY);
  const hbOk = hb && hb.on && Date.now() - (hb.at || 0) < 10 * 60e3;
  let s = t ? '엑셀 ' + hm(t.at) + ' 읽음' : '오늘 사본 없음';
  s += hbOk ? ' · 연결 켜짐' : ' · <b style="color:#ffb4b4">연결 꺼짐</b>';
  if (meta.fromCache) s += ' · 오프라인';
  el.innerHTML = s + ' · <b>보기 · 연습</b> <label class="fillb" style="cursor:pointer;text-decoration:underline;margin-left:6px">📥 엑셀로 채우기<input type="file" id="fillFile" accept=".xlsx" hidden></label>' + (fill ? ' <span>' + esc(fill) + '</span>' : '');
}

function watch() {
  unsub.forEach(f => { try { f(); } catch (e) {} }); unsub = [];
  const from = ym(TODAY, -1) + '-01';
  unsub.push(S.listenQuery('jbr', [['date', '>=', from]], list => { docs = list.map(x => x.data); push(); }, e => { $('#main').innerHTML = '<p style="padding:20px">자료를 읽지 못했어요: ' + esc(e && e.message || e) + ' (규칙 v32 게시 전이면 이렇게 보여요)</p>'; }));
  unsub.push(S.listenDoc('meta/rsync', x => { hb = x; tag(); }, () => {}));
}

// ---------- 지난 날짜 채우기: 정비보고서 엑셀(한 달 파일)을 이 브라우저에서 열어 1일~오늘까지 날짜마다 저장
async function fillFrom(file) {
  const say = m => { fill = m; tag(); };
  try {
    const v = new URLSearchParams(location.search).get('v') || VER;
    const eng = await import('../../rm/app/engine.js?v=' + v), rs = await import('../../rm/app/rsync.js?v=' + v);
    const buf = new Uint8Array(await file.arrayBuffer()), roster = await eng.readRoster(buf);
    const mm = /(\d{1,2})\s*월/.exec(file.name), mon = mm ? ('0' + mm[1]).slice(-2) : TODAY.slice(5, 7);
    let y = +TODAY.slice(0, 4); if (+mon > +TODAY.slice(5, 7)) y--;
    const have = {}; docs.forEach(d => { have[d.date] = d; });
    let n = 0, skip = 0, bad = [];
    for (let k = 1; k <= 31; k++) {
      const ds = y + '-' + mon + '-' + ('0' + k).slice(-2); if (ds > TODAY) break;
      say(ds.slice(5) + ' 읽는 중…');
      let r; try { r = await eng.buildFromXlsx(buf, ds); } catch (e) { bad.push(k + '일'); continue; }
      if (!r.summary.ok) { bad.push(k + '일(양식)'); continue; }
      if (have[ds] && have[ds].src === 'app') { skip++; continue; }
      const snap = rs.snapOf(r, roster, ds, file.name);
      await S.set('jbr/' + ds, Object.assign(snap, { at: S.SERVER_TIME, by: (role && role.label) || '' }));
      n++;
    }
    say('✅ ' + n + '일 올림' + (skip ? ' · 앱 원본 ' + skip + '일은 그대로' : '') + (bad.length ? ' · 못 읽음: ' + bad.join(', ') : ''));
  } catch (e) { say('❌ ' + (e && e.message || e)); }
}

// ---------- 로그인
function drawLogin() {
  $('#main').innerHTML = '<div class="box" style="max-width:380px;margin:40px auto"><h3 style="margin:0 0 10px">로그인</h3><div class="btns">' +
    ROLES.map((r, i) => '<button data-jwho="' + i + '"' + (login.who === i ? ' class="pri"' : '') + '>' + r.label + '</button>').join('') + '</div>' +
    '<input id="jpw" class="inp" type="password" autocomplete="current-password" placeholder="비밀번호" style="width:100%;margin-top:10px">' +
    (login.err ? '<p style="color:#B23A48">' + esc(login.err) + '</p>' : '') +
    '<button class="pri" data-jlogin="1" style="margin-top:10px;width:100%"' + (login.busy ? ' disabled' : '') + '>' + (login.busy ? '확인 중…' : '들어가기') + '</button>' +
    '<p class="hint">허브에서 들어오면 같은 로그인으로 바로 열려요.</p></div>';
}
async function doLogin() {
  const pw = ($('#jpw') || {}).value || ''; if (!pw) { login.err = '비밀번호를 적어 주세요.'; drawLogin(); return; }
  login.busy = true; login.err = ''; drawLogin();
  try { await S.signInEmail(ROLES[login.who].email, pw); } catch (e) { login.err = '비밀번호가 맞지 않아요.'; }
  login.busy = false; if (!role) drawLogin();
}
document.addEventListener('click', e => {
  const w = e.target.closest('[data-jwho]'); if (w) { e.stopPropagation(); login.who = +w.dataset.jwho; login.err = ''; drawLogin(); return; }
  if (e.target.closest('[data-jlogin]')) { e.stopPropagation(); doLogin(); return; }
  if (e.target.closest('.fillb')) e.stopPropagation();
}, true);
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'jpw') { e.stopPropagation(); doLogin(); } }, true);
document.addEventListener('change', e => {
  if (e.target.id !== 'fillFile' || !e.target.files[0]) return;
  const f = e.target.files[0];
  if (!confirm(f.name + '\n\n이 파일의 1일~오늘까지를 앱에 올릴까요? (같은 날짜 엑셀 사본은 새로 덮고, 앱에서 쓴 날은 그대로 둬요)')) return;
  fillFrom(f);
});

S.onUser(u => {
  const r = u && !u.anon ? ROLES.find(x => x.uid === u.uid || x.email === u.email) : null;
  if (u && !u.anon && !r) login.err = '지금 로그인된 계정은 정비보고서를 열 수 없어요. 아래에서 다시 들어가 주세요.';
  const was = role; role = r || null;
  if (role && !was) watch();
  if (!role) { unsub.forEach(f => { try { f(); } catch (e) {} }); unsub = []; drawLogin(); }
});
window.__jbr = { ver: VER, toP };
// 🔄 쉬는 순간 자동 새로고침 — 연습으로 고친 날이 있으면 안 바꿈
if (window.AutoReload) window.AutoReload.start({ key: 'jbr', url: '../version.json', safe: () => !(window.JBR && window.JBR.edited()) && !/읽는 중/.test(fill) });
