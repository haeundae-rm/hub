// hub/jbr/jbr.js — 📋 정비보고서 (2026-11-26, 12/1 실무 전환 1단계)
// 화면 = 시제품(index.html 안 스크립트, 확정본 11/26). 이 파일은 로그인 · 자료 받기만
//   jbr/{YYYY-MM-DD} = 정비보고서 연결(오더테이커 PC, rm/app/rsync.js)이 엑셀을 읽을 때마다 올리는 그날 사본
//     { date, src:'excel'|'app', file, rooms:[호실 순서], r:{호실:[상태, 정비자, 메모1, 메모2, 완료 1/0, 연박 1/0]},
//       xl:{정비수 · 로얄 · 인원 · 미정비 · 재실 · 간단 · 총유닛 = 엑셀 요약 칸}, cards:[{n,u,in}], groups:[{name,time,rooms:'101,102'}], roster:[설정 시트 명단] }
//   지난 날짜는 '엑셀로 채우기'(이 화면)로 한 번에 올림 — 이 브라우저에서 파일을 열어 날짜마다 저장 (src 'app' 인 날은 안 덮음)
// 규칙 v32: 읽기 · 쓰기 관리자(소장 · 부소장 · 봇 · 하우스키퍼)
// 💾 실제 저장 (11/27): 저장 켜진 날 = src 'app' 이거나 12/1 이후. 고칠 때마다
//   ① 바뀐 방 칸만 merge(r.{호실}) — 두 사람이 다른 방을 고쳐도 서로 안 덮음 ② jbr/{날}/log 에 전 · 후 기록 쌓기(지우기 없음)
//   ③ 저장 대기 n건 표시 (오프라인이면 브라우저에 보관했다가 연결되면 자동 전송 — store.js 오프라인 보관) ④ 대기 중엔 자동 새로고침 안 함
//   12/1 전엔 지난 날짜만 「실제 저장 연습 켜기」 가능 (켤 때 r0 · g0 = 켜기 전 자료 보관 → 「연습 끝내기」로 되돌림)
import * as S from '../../rm/app/store.js';

const VER = '2026.11.27-1';
const LIVE_FROM = '2026-12-01';   // 이날부터 앱이 원본 (저장 저절로 켜짐)
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

let me = '', sv = { pend: 0, fail: 0, lastOk: 0, err: '' }, role = null, login = { who: 0, err: '', busy: false }, unsub = [], docs = [], hb = null, meta = { fromCache: false, pending: 0 }, fill = '';

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
  let s = t ? (t.src === 'app' ? '앱 저장 ' + hm(t.at) : '엑셀 ' + hm(t.at) + ' 읽음') : '오늘 사본 없음';
  s += hbOk ? ' · 연결 켜짐' : ' · <b style="color:#ffb4b4">연결 꺼짐</b>';
  if (meta.fromCache) s += ' · 오프라인';
  el.innerHTML = s + ' · <b>' + (sv.pend ? '⏳ 저장 대기 ' + sv.pend + '건' : TODAY >= LIVE_FROM ? '💾 앱 원본' : '보기 · 연습') + '</b> <label class="fillb" style="cursor:pointer;text-decoration:underline;margin-left:6px">📥 엑셀로 채우기<input type="file" id="fillFile" accept=".xlsx" hidden></label>' + (fill ? ' <span>' + esc(fill) + '</span>' : '');
}

function watch() {
  unsub.forEach(f => { try { f(); } catch (e) {} }); unsub = [];
  const from = ym(TODAY, -1) + '-01';
  unsub.push(S.listenQuery('jbr', [['date', '>=', from]], (list, m) => { docs = list.map(x => x.data); meta.fromCache = !!(m && m.fromCache); push(); }, e => { $('#main').innerHTML = '<p style="padding:20px">자료를 읽지 못했어요: ' + esc(e && e.message || e) + ' (규칙 v32 게시 전이면 이렇게 보여요)</p>'; }));
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

// ---------- 💾 실제 저장
const docOf = ds => docs.find(x => x.date === ds);
const FLD = ['상태', '정비자', '메모1', '메모2', '완료', '연박'];
const clip = a => a.map((v, i) => (i < 4 ? String(v == null ? '' : v).slice(0, 200) : v ? 1 : 0));
function svStatus() {
  const off = !navigator.onLine || meta.fromCache;
  if (sv.pend) return '<b style="color:#B26A00">⏳ 저장 대기 ' + sv.pend + '건</b>' + (off ? ' — 인터넷이 끊겨 있어요. 이 PC에 보관했다가 연결되면 자동으로 저장돼요 (창을 닫지 마세요)' : ' — 보내는 중');
  if (sv.fail) return '<b style="color:#B23A48">❌ 저장 실패 ' + sv.fail + '건</b> (' + esc(sv.err) + ') — 화면은 저장소 값으로 돌아가요. 다시 로그인 후 고쳐 주세요';
  return '<b class="good">✅ 모두 저장됨</b>' + (sv.lastOk ? ' ' + hm(sv.lastOk) : '') + (off ? ' · 오프라인' : '');
}
function svPaint() { const el = document.getElementById('svst'); if (el) el.innerHTML = svStatus(); tag(); }
function track(p) {
  sv.pend++; svPaint();
  return Promise.resolve(p).then(() => { sv.lastOk = Date.now(); }, e => {
    sv.fail++; sv.err = (e && (e.code || e.message)) || String(e); console.warn('정비보고서 저장 실패', e);
    if (window.JBR && window.JBR.toast) window.JBR.toast('❌ 저장 실패: ' + sv.err);
  }).finally(() => { sv.pend--; svPaint(); });
}
const logOf = o => Object.assign({ at: S.SERVER_TIME, uid: me, by: (role && role.label) || '' }, o);   // 규칙: at = 서버 시각, uid = 로그인한 계정
// 저장 + 기록을 한 묶음으로 (같이 되거나 같이 안 됨). store.batch 가 없는 옛 store 면 따로따로
function save(ds, op, data, log) {
  const path = 'jbr/' + ds;
  if (S.batch) return track(S.batch([{ op, path, data }, { op: 'add', path: path + '/log', data: logOf(log) }]));
  track(op === 'merge' ? S.merge(path, data) : S.set(path, data)); return track(S.add(path + '/log', logOf(log)).done);
}
const by = () => (role && role.label) || '';
const SV = {
  live: ds => ds >= LIVE_FROM || !!(docOf(ds) && docOf(ds).src === 'app'),
  canOn: ds => ds < LIVE_FROM && ds < TODAY && !!docOf(ds) && docOf(ds).src !== 'app',
  canOff: ds => ds < LIVE_FROM && !!docOf(ds) && docOf(ds).src === 'app' && !!docOf(ds).r0,
  status: svStatus,
  rooms(ds, ch) {
    const r = {}; Object.keys(ch).forEach(k => { r[k] = clip(ch[k].a); ch[k] = { b: clip(ch[k].b), a: r[k] }; });
    save(ds, 'merge', { date: ds, r, src: 'app', at: S.SERVER_TIME, by: by() }, { k: 'room', n: Object.keys(ch).length, ch });
  },
  groups(ds, gs) {
    const g = gs.map(x => ({ name: x.name || '', time: x.time || '', rooms: (x.rooms || []).join(',') }));
    save(ds, 'merge', { date: ds, groups: g, src: 'app', at: S.SERVER_TIME, by: by() }, { k: 'groups', g });
  },
  on(ds) {
    const d = docOf(ds); if (!d) return;
    save(ds, 'merge', { src: 'app', r0: d.r || {}, g0: d.groups || [], onAt: S.SERVER_TIME, onBy: by() }, { k: 'on' }); if (window.JBR) window.JBR.toast('💾 ' + ds + ' 실제 저장을 켰어요 — 이제 고치는 내용이 저장돼요');
  },
  async off(ds) {
    try {
      const d = await S.get('jbr/' + ds); if (!d || !d.r0) { window.JBR.toast('켜기 전 자료가 없어요'); return; }
      const n = Object.assign({}, d, { r: d.r0, groups: d.g0 || [], src: 'excel', at: S.SERVER_TIME, by: by() });
      ['r0', 'g0', 'onAt', 'onBy'].forEach(k => delete n[k]);
      save(ds, 'set', n, { k: 'off' });
      window.JBR.toast(ds + ' 저장 연습을 끝냈어요 — 켜기 전 자료로 되돌림');
    } catch (e) { window.JBR.toast('❌ ' + (e && e.message || e)); }
  },
  async showLog(ds) {
    let m = document.getElementById('jlogm');
    if (!m) { m = document.createElement('div'); m.id = 'jlogm'; m.style.cssText = 'position:fixed;inset:0;background:rgba(10,20,40,.35);z-index:90;display:flex;align-items:center;justify-content:center'; document.body.appendChild(m);
      m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-jlogx]')) m.remove(); }); }
    const box = h => { m.innerHTML = '<div style="background:#fff;border-radius:12px;width:min(760px,94vw);max-height:84vh;overflow:auto;padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,.25)"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b>📜 ' + ds + ' 변경 기록</b><button data-jlogx="1">닫기</button></div>' + h + '</div>'; };
    box('<p class="hint">불러오는 중…</p>');
    try {
      const L = (await S.getQuery('jbr/' + ds + '/log', [])).map(x => x.data).sort((a, b) => (b.at || 0) - (a.at || 0));
      const fmt = c => Object.keys(c).sort().map(k => { const b = c[k].b || [], a = c[k].a || [];
        const d = FLD.map((f, i) => (String(b[i] || '') === String(a[i] || '') ? '' : i >= 4 ? f + (a[i] ? ' ✓' : ' 풀림') : f + ' 「' + esc(b[i] || '') + '」→「' + esc(a[i] || '') + '」')).filter(Boolean);
        return '<b>' + k + '</b> ' + d.join(', '); }).join('<br>');
      const what = x => x.k === 'room' ? fmt(x.ch || {}) : x.k === 'groups' ? '단체 ' + (x.g || []).map(g => esc(g.name) + ' ' + String(g.rooms || '').split(',').filter(Boolean).length + '실').join(' · ') : x.k === 'on' ? '💾 실제 저장 켬' : x.k === 'off' ? '연습 끝냄 (켜기 전 자료로)' : esc(x.k);
      const t = x => { const d = seoul(Number(x.at || 0)); return hm(x.at) + ':' + ('0' + d.getUTCSeconds()).slice(-2); };
      box(L.length ? '<table style="width:100%;border-collapse:collapse;font-size:13px">' + L.slice(0, 300).map(x => '<tr style="border-top:1px solid #eee;text-align:left"><td style="padding:5px 8px;white-space:nowrap;vertical-align:top;text-align:left">' + t(x) + '</td><td style="padding:5px 8px;white-space:nowrap;vertical-align:top;text-align:left">' + esc(x.by) + '</td><td style="padding:5px 8px;text-align:left">' + what(x) + '</td></tr>').join('') + '</table>' + (L.length > 300 ? '<p class="hint">최근 300건만 보여요 (전체 ' + L.length + '건)</p>' : '') : '<p class="hint">아직 기록이 없어요</p>');
    } catch (e) { box('<p style="color:#B23A48">기록을 읽지 못했어요: ' + esc(e && e.message || e) + '</p>'); }
  }
};
if (window.JBR) window.JBR.sv = SV;
window.addEventListener('online', svPaint); window.addEventListener('offline', svPaint);
window.addEventListener('beforeunload', e => { if (sv.pend) { e.preventDefault(); e.returnValue = ''; } });

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
  const was = role; role = r || null; me = (u && u.uid) || '';
  if (role && !was) watch();
  if (!role) { unsub.forEach(f => { try { f(); } catch (e) {} }); unsub = []; drawLogin(); }
});
window.__jbr = { ver: VER, toP, SV, sv };
// 🪟 따로 창 (11/27): 허브에서 새 창으로 열렸으면 「‹ 허브」 대신 「✕ 창 닫기」 — 이 창에선 다른 메뉴로 못 넘어가게
if (window.name === 'jbr_window') {
  const hb = document.getElementById('hubBtn');
  if (hb) { hb.textContent = '✕ 창 닫기'; hb.title = '허브는 원래 창에 그대로 있어요'; hb.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); if (sv.pend && !confirm('저장 대기 ' + sv.pend + '건이 남았어요. 그래도 닫을까요?')) return; try { if (window.opener && !window.opener.closed) window.opener.focus(); } catch (er) {} window.close(); }, true); }
  document.title = '📋 정비보고서';
}
// 🔄 쉬는 순간 자동 새로고침 — 연습으로 고친 날이 있으면 안 바꿈
if (window.AutoReload) window.AutoReload.start({ key: 'jbr', url: '../version.json', safe: () => !sv.pend && !(window.JBR && window.JBR.edited()) && !/읽는 중/.test(fill) });
