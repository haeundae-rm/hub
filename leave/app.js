// hub/leave/app.js — 연차 관리 시작 · 휴대폰 승인 탭 · 옮기기 탭 (2026-11-18)
// 나머지 화면(현황 · 신청서 · 월 사용 입력 · 명단 · 대장 출력)은 index.html 안 옛 LeavePage 코드 그대로
import * as A from './api.js?v=2026.11.18-3';

const VER = '2026.11.18-3';
const EMAILS = ['unieshaeundae+admin@gmail.com', 'unieshaeundae+sub@gmail.com'];
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const P = () => window.LVP;
let imp = null;    // 옮기기 진행 상태
let pick = {};     // 휴대폰 승인 — 고른 휴대폰

window.LV = {
  call: (fn, args) => A.call(fn, args),
  signIn: (w, pw) => A.signIn(EMAILS[w] || EMAILS[0], pw)
};
window.__lv = { ver: VER };   // 시험·점검용

// ---------- 휴대폰 승인
function dt(t) { if (!t) return ''; const d = new Date(Number(t) + 9 * 36e5); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate(); }
function devHtml(D) {
  const L = D.devices || [], wait = L.filter(d => !d.ok), ok = L.filter(d => d.ok);
  const can = wait.filter(d => d.pid);
  const row = (d, isOk) => {
    const note = !d.pid ? '<span class="neg">연차 명단에 없는 이름</span>' : !d.target ? '연차 대상 아님 (근무 달력만 보여요)' : (d.person !== d.name ? '명단 ' + esc(d.person) + ' 님' : '') + (d.mate ? (d.person !== d.name ? ' · ' : '') + '2인 1조 짝 ' + esc(d.mate) + (d.matePid ? '' : ' (명단에 없음)') : '');
    return '<div class="dv">' + (isOk ? '<span></span>' : '<input type="checkbox" data-pick="' + esc(d.uid) + '"' + (pick[d.uid] ? ' checked' : '') + (d.pid ? '' : ' disabled') + ' aria-label="고르기">') +
      '<div class="who"><b>' + esc(d.name) + '</b><small>이름 고른 날 ' + esc(d.date || dt(d.at)) + ' · 휴대폰 ' + esc(d.uid.slice(0, 5)) + '</small></div>' +
      '<div class="muted">' + note + '</div>' +
      (isOk ? '<div class="row" style="gap:6px"><span class="st ok">승인 ' + dt(d.okAt) + '</span><button class="btn" data-revoke="' + esc(d.uid) + '">해제</button></div>'
        : '<button class="btn grn" data-approve="' + esc(d.uid) + '"' + (d.pid ? '' : ' disabled') + '>승인</button>') + '</div>';
  };
  const n = Object.keys(pick).filter(u => pick[u] && can.some(d => d.uid === u)).length;
  return '<div class="card"><h2>승인 기다리는 휴대폰 ' + wait.length + '대</h2>' +
    '<p class="muted" style="margin:0 0 8px">정비 레포트에서 이름을 고른 휴대폰이에요. 승인하면 그 휴대폰의 \'📅 내 근무\'에 그분 연차·신청서가 보여요 (비밀번호 없음). 본인 휴대폰이 맞는지 확인하고 승인해 주세요.<br>2인 1조로 묶인 분은 짝의 연차도 같이 보여요.</p>' +
    (wait.length ? '<div class="row" style="margin-bottom:6px"><button class="btn" id="pickall"' + (can.length ? '' : ' disabled') + '>' + (n === can.length && n ? '모두 풀기' : '승인할 수 있는 ' + can.length + '대 모두 고르기') + '</button><span class="grow"></span><button class="btn pri" id="approve-picked"' + (n ? '' : ' disabled') + '>고른 ' + n + '대 승인</button></div>' + wait.map(d => row(d, false)).join('') : '<div class="empty">기다리는 휴대폰이 없어요.</div>') +
    '</div><div class="card"><h2>승인된 휴대폰 ' + ok.length + '대</h2>' + (ok.length ? ok.map(d => row(d, true)).join('') : '<div class="empty">아직 없어요.</div>') +
    '<p class="muted" style="margin:8px 0 0">휴대폰을 바꾸거나 잃어버렸으면 \'해제\'를 눌러 주세요. 정비 레포트 쪽 이름 등록 해제는 레포트 관리자 화면에서 따로 해요.</p></div>';
}
document.addEventListener('click', e => {
  const t = e.target;
  if (!P() || P().busy()) return;
  const D = P().D();
  const pk = t.closest('[data-pick]');
  if (pk) { pick[pk.getAttribute('data-pick')] = pk.checked; P().render(); return; }
  if (t.id === 'pickall') {
    const can = (D.devices || []).filter(d => !d.ok && d.pid), all = can.every(d => pick[d.uid]);
    pick = {}; if (!all) can.forEach(d => { pick[d.uid] = true; }); P().render(); return;
  }
  const ap = t.closest('[data-approve]');
  if (ap || t.id === 'approve-picked') {
    const ids = ap ? [ap.getAttribute('data-approve')] : Object.keys(pick).filter(u => pick[u]);
    if (!ids.length) return;
    t.disabled = true;
    P().run('devApprove', [null, ids, D.asOf], d => { pick = {}; P().set(d); P().toast(ids.length + '대 승인했어요'); }, m => { P().toast(m); P().render(); });
    return;
  }
  const rv = t.closest('[data-revoke]');
  if (rv) {
    const u = rv.getAttribute('data-revoke'), d0 = (D.devices || []).filter(d => d.uid === u)[0];
    if (rv.getAttribute('data-ask') !== '1') { rv.setAttribute('data-ask', '1'); rv.textContent = '한 번 더 누르면 해제'; rv.classList.add('red'); return; }
    P().run('devRevoke', [null, u, D.asOf], d => { P().set(d); P().toast((d0 ? d0.name + ' 님 ' : '') + '휴대폰 승인을 해제했어요'); }, m => P().toast(m));
    return;
  }
  if (t.id === 'imp-file-btn') { $('#imp-file').click(); return; }
  if (t.id === 'imp-go') { runImport(); return; }
  if (t.id === 'imp-check') { runCheck(); return; }
});

// ---------- 옮기기 (구글 시트 → Firebase, 처음 한 번) — 개인정보가 이 PC 브라우저에서 바로 Firebase 로 감 (다른 곳 안 거침)
function impHtml() {
  const D = P().D(), has = D && !D.empty;
  let h = '<div class="card imp-step"><h2>구글 시트 연차 대장 옮기기 (처음 한 번)</h2>' +
    '<p class="muted" style="margin:0">① 구글 시트(정비 레포트 옛 시트)를 열고 <b>파일 → 다운로드 → Microsoft Excel(.xlsx)</b> 을 눌러 파일을 받아요.<br>② 아래 <b>엑셀 파일 고르기</b>로 그 파일을 골라요. 이 PC 안에서만 읽어요.<br>③ 읽은 내용을 확인하고 <b>옮기기</b>를 눌러요. 끝나면 사람마다 잔여를 시트 계산과 나란히 보여 드려요.</p>' +
    (has ? '<p class="err" style="margin:0">이미 명단 ' + D.people.length + '명이 있어요. 다시 옮기면 명단은 시트 내용으로 덮어쓰고, 연차기록은 옮긴 적 있는 줄은 건너뛰고, 새 앱에서 처리한 신청서는 그대로 둬요.</p>' : '') +
    '<div class="row"><input type="file" id="imp-file" accept=".xlsx" hidden><button class="btn pri" id="imp-file-btn">엑셀 파일 고르기</button><span class="muted">' + esc(imp && imp.file || '') + '</span></div></div>';
  if (imp && imp.err) h += '<div class="card"><p class="err" style="margin:0">' + esc(imp.err) + '</p></div>';
  if (imp && imp.read) {
    const r = imp.read;
    h += '<div class="card imp-step"><h2>읽은 내용</h2><div class="kpis">' +
      '<div class="kpi"><b>' + r.people.length + '</b><span>연차명단 (대상 ' + r.people.filter(p => p.target).length + '명)</span></div>' +
      '<div class="kpi"><b>' + r.recs.length + '</b><span>연차기록 줄</span></div>' +
      '<div class="kpi"><b>' + r.apps.length + '</b><span>신청서 (삭제 ' + r.apps.filter(a => a.deleted).length + ')</span></div>' +
      '<div class="kpi"><b>' + r.workN + '</b><span>근무 달력 (사람·달)</span></div></div>' +
      (r.warn.length ? '<div class="warns" style="color:var(--red);font-size:13px;font-weight:700">' + r.warn.slice(0, 12).map(w => '<span>⚠ ' + esc(w) + '</span>').join('<br>') + (r.warn.length > 12 ? '<br>… 외 ' + (r.warn.length - 12) + '건' : '') + '</div>' : '') +
      '<div class="row"><span class="grow"></span><button class="btn pri" id="imp-go"' + (imp.busy || imp.done ? ' disabled' : '') + '>' + (imp.busy ? '옮기는 중… ' + esc(imp.prog || '') : imp.done ? '옮겼어요' : 'Firebase 로 옮기기') + '</button></div></div>';
  }
  if (imp && imp.check) h += checkHtml(imp.check);
  else if (has) h += '<div class="card"><div class="row"><b class="grow">시트 계산과 대조</b><button class="btn" id="imp-check"' + (imp && imp.read ? '' : ' disabled') + '>대조하기</button></div><p class="muted" style="margin:6px 0 0">엑셀 파일을 고른 뒤 누르면, 사람마다 발생·사용·지급·잔여를 시트 기준(같은 계산)과 지금 Firebase 값으로 나란히 보여 줘요.</p></div>';
  return h;
}
function checkHtml(c) {
  const bad = c.rows.filter(r => r.bad).length;
  return '<div class="card"><h2>대조 결과 · 기준일 ' + esc(c.asOf) + '</h2>' +
    (bad ? '<p class="err">차이 나는 분 ' + bad + '명 — 빨간 줄을 확인해 주세요.</p>' : '<p class="imp-ok">' + c.rows.length + '명 모두 차이 0 ✔</p>') +
    '<div class="tw"><table class="imp-tbl"><thead><tr><th>성함</th><th>발생 (시트/새)</th><th>사용</th><th>지급</th><th>잔여</th><th>대기 신청</th></tr></thead><tbody>' +
    c.rows.map(r => '<tr class="' + (r.bad ? 'bad' : '') + '"><td>' + esc(r.name) + '</td><td>' + r.a.gen + ' / ' + r.b.gen + '</td><td>' + r.a.used + ' / ' + r.b.used + '</td><td>' + r.a.paid + ' / ' + r.b.paid + '</td><td><b>' + r.a.remain + ' / ' + r.b.remain + '</b></td><td>' + r.a.wait + ' / ' + r.b.wait + '</td></tr>').join('') +
    '</tbody></table></div><p class="muted">옛 연차 관리 페이지의 현황 숫자와도 한 번 더 비교해 주세요. 차이가 0이면 다음 단계(휴대폰 승인)로 가요.</p></div>';
}
document.addEventListener('change', async e => {
  if (e.target.id !== 'imp-file') return;
  const f = e.target.files && e.target.files[0]; if (!f) return;
  imp = { file: f.name };
  P().render();
  try {
    const X = await import('./import.js?v=' + VER);
    imp.read = await X.readBook(new Uint8Array(await f.arrayBuffer()));
    imp.X = X;
  } catch (err) { console.warn(err); imp.err = '엑셀을 읽지 못했어요: ' + (err && err.message || err); }
  P().render();
});
async function runImport() {
  if (!imp || !imp.read || imp.busy) return;
  imp.busy = true; imp.prog = ''; P().render();
  try {
    const n = await imp.X.write(imp.read, s => { imp.prog = s; const b = $('#imp-go'); if (b) b.textContent = '옮기는 중… ' + s; });
    imp.done = true; imp.busy = false;
    P().toast('옮겼어요 · 명단 ' + n.people + '명, 기록 ' + n.recs + '줄, 신청서 ' + n.apps + '장');
    P().run('leaveData', [null, ''], d => { P().set(d); runCheck(); });
  } catch (err) { console.warn(err); imp.busy = false; imp.err = '옮기다가 멈췄어요: ' + (err && err.message || err) + ' — 다시 누르면 이어서 해요(같은 것은 덮어씀).'; P().render(); }
}
function runCheck() {
  if (!imp || !imp.read) return;
  imp.check = imp.X.compare(imp.read, P().D());
  P().render();
}

window.LVX = { devHtml, impHtml };

// ---------- 시작
A.onUser(u => {
  if (u && !u.anon && A.isAdmin()) P().load();
  else if (u && !u.anon) P().gate('이 계정은 연차 관리 권한이 없어요.');
  else P().gate('');
});
