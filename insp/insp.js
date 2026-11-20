// 🔍 객실 인스펙션 (2026-11-15 ①) — 찍고 → 사진마다 지적 한 줄 → 수정완료/재정비 → 카톡에 한 장 이미지 + 글
// 인스펙션 대장(엑셀)용 입력이 아니라, 매일 하는 점검·카톡 공유를 빠르게 + 메이드별 지적이 쌓이게
// · 작성 중인 점검은 휴대폰(IndexedDB)에 사진째 바로 저장 → 화면이 잠기거나 브라우저가 새로 고쳐도 이어서
// · 저장: Firestore insp/{날짜_객실_시각} + 사진은 Cloud Storage insp/{날짜}/{id}/{n}.jpg (인터넷이 끊기면 휴대폰에 두었다가 다시 올림)
// · 로그인: 소장·부소장(관리자) 또는 점검자 공용 계정 → 점검자 이름은 버튼으로 (관리자 / 하우스맨)
// ② (11/15): 사진을 넣으면 AI(Gemini, ai.js)가 문구·분류를 먼저 채움 · 룸넘버 판을 읽어 객실·정비자 자동 · 흔들림·중복 표시 (사람 문구는 덮지 않음)
import * as S from '../../rm/app/store.js';
import { makeCards, makeText } from './card.js?v=2026.11.20-2';
import { readPhoto, hashOf, hamming, setCfg, aiErr, setLearn } from './ai.js?v=2026.11.20-2';
import { openCam, camOk } from './cam.js?v=2026.11.20-2';

const VER = '2026.11.20-2';
const ACCOUNTS = [
  { uid: 'iw2orXgIgPgTbLUQa0b41XJ9Dvd2', label: '소장', email: 'unieshaeundae+admin@gmail.com', admin: true },
  { uid: 'Fz4T5ZzIxShOdVkNpF9gzMmOLED2', label: '부소장', email: 'unieshaeundae+sub@gmail.com', admin: true },
  { uid: '', label: '점검자', email: 'unieshaeundae+insp@gmail.com', admin: false }
];
const DEF_NAMES = { '관리자': ['이원향', '한수영', '김현우'], '하우스맨': [] };
const CHIPS = ['세팅 미흡', '미비', '머리카락', '얼룩', '먼지', '물때', '정리 필요', '보충 필요'];
const MAX_EDGE = 2048, JPEG_Q = 0.85;

const $ = s => document.querySelector(s);
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const seoul = (t = Date.now()) => new Date(Number(t) + 9 * 3600e3);
const ymd = (t = Date.now()) => seoul(t).toISOString().slice(0, 10);
const hm = t => { if (!t) return ''; const d = seoul(t); return ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2); };
const addDays = (d, n) => ymd(Date.parse(d + 'T12:00:00+09:00') + n * 864e5);
const roomOk = r => { if (!/^\d{4}$/.test(r)) return false; const f = Math.floor(+r / 100), s = +r % 100; return f >= 4 && f <= 31 && s >= 1 && s <= 20; };
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---------- 휴대폰 저장소 (IndexedDB): drafts = 점검 한 건, blobs = 사진
const idb = (() => {
  let p = null;
  const open = () => p || (p = new Promise((res, rej) => {
    const r = indexedDB.open('insp', 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('drafts', { keyPath: 'id' }); d.createObjectStore('blobs'); };
    r.onsuccess = () => res(r.result); r.onerror = () => { p = null; rej(r.error); };
  }));
  const tx = (st, mode, fn) => open().then(d => new Promise((res, rej) => { const t = d.transaction(st, mode), q = fn(t.objectStore(st)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }));
  return { put: (st, v, k) => tx(st, 'readwrite', s => s.put(v, k)), get: (st, k) => tx(st, 'readonly', s => s.get(k)), all: st => tx(st, 'readonly', s => s.getAll()), del: (st, k) => tx(st, 'readwrite', s => s.delete(k)) };
})();

// ---------- 사진 저장소 (Cloud Storage) — 시험 때는 window.__fakeStorage
let storP = null;
function stor() {
  if (window.__fakeStorage) return Promise.resolve(window.__fakeStorage);
  if (!storP) storP = Promise.all([import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'), import('https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js')]).then(([A, F]) => {
    const st = F.getStorage(A.getApp());
    return { put: (path, blob) => F.uploadBytes(F.ref(st, path), blob, { contentType: 'image/jpeg' }), url: path => F.getDownloadURL(F.ref(st, path)) };
  }).catch(e => { storP = null; throw e; });
  return storP;
}

let user = null, acct = null, login = { who: 0, err: '', busy: false };
let V = { aicfg: {}, view: 'home', d: ymd(), list: null, err: '', drafts: [], cur: null, done: null, msg: '', plans: {} };
const urls = {};   // pid → 화면용 주소 (objectURL)

// ---------- 점검자
const byNow = () => lsGet('insp_by', null);
function names() { const n = lsGet('insp_names', null) || DEF_NAMES; return { '관리자': n['관리자'] || [], '하우스맨': n['하우스맨'] || [] }; }

// ---------- 읽기
async function loadList() {
  const d = V.d;
  try {
    const L = await S.getQuery('insp', [['date', '==', d]]);
    if (V.d !== d) return;
    V.list = L.map(x => Object.assign({ id: x.id }, x.data)); V.err = '';
  } catch (e) { V.err = '목록을 못 읽었어요: ' + (e && (e.code || e.message) || e); }
  draw();
}
async function loadDrafts() {
  try { V.drafts = (await idb.all('drafts')).sort((a, b) => (b.at || 0) - (a.at || 0)); }
  catch (e) { V.drafts = []; V.err = '이 휴대폰에 임시 저장을 못 해요 (사생활 보호 모드?) — 일반 창에서 열어 주세요.'; }
  // 올린 지 3일 지난 저장본은 휴대폰에서 지움 (사진은 서버에 있음)
  const old = V.drafts.filter(x => x.st === 'saved' && allUp(x) && Date.now() - (x.savedAt || 0) > 3 * 864e5);
  for (const x of old) await dropDraft(x);
  if (old.length) V.drafts = V.drafts.filter(x => old.indexOf(x) < 0);
}
const allUp = x => x.photos.every(p => x.up && x.up[p.pid]);
async function dropDraft(x) { try { for (const p of x.photos) await idb.del('blobs', p.pid); await idb.del('drafts', x.id); } catch (e) {} }

// ---------- AI 매주 배우기 (2026-11-20 사용자 요청: '디스펜서 내용물 부족'을 '얼룩'으로 읽는 등)
// · 매주(월요일 기준) 관리자가 처음 열 때 지난 4주 점검에서 'AI 문구 → 사람이 고친 문구'를 모아 meta/insp_learn 에 저장
// · 같은 식으로 2번 이상 고쳤고, 그 AI 문구를 그대로 둔 횟수보다 고친 횟수가 많을 때만 배움 (한 번 잘못 적은 건 안 배움)
// · 관리자는 ⚙ 아래 '🧠 AI가 배운 것' 에서 ✕ 로 뺄 수 있음 (off 목록은 다음 주에도 유지). 점검자 계정은 읽기만 (1건)
const LEARN_DAYS = 28, LEARN_MIN = 2, LEARN_MAX = 40;
const nrm = t => String(t || '').replace(/\s+/g, ' ').replace(/[.。]$/, '').trim();
const lkey = x => x.a + '→' + x.t;
function weekOf(d) { const t = Date.parse(d + 'T12:00:00+09:00'), wd = new Date(t).getUTCDay(); return addDays(d, -((wd + 6) % 7)); }   // 그 주 월요일
function applyLearn() { const L = V.learn || {}, off = L.off || []; setLearn((L.items || []).filter(x => off.indexOf(lkey(x)) < 0)); }
async function buildLearn() {
  const from = addDays(ymd(), -LEARN_DAYS);
  const docs = await S.getQuery('insp', [['date', '>=', from]]);
  const fix = {}, kept = {};
  docs.forEach(d => ((d.data && d.data.photos) || []).forEach(p => {
    if (!p || p.plate || !p.ai || p.ai.k !== 'fault') return;
    const a = nrm(p.ai.t), t = nrm(p.t); if (!a) return;
    if (!p.edit || !t || t === a) { kept[a] = (kept[a] || 0) + 1; return; }
    const k = a + '→' + t; fix[k] = fix[k] || { a, t, n: 0 }; fix[k].n++;
  }));
  const fixedBy = {}; Object.values(fix).forEach(x => { fixedBy[x.a] = (fixedBy[x.a] || 0) + x.n; });
  const items = Object.values(fix).filter(x => x.n >= LEARN_MIN && fixedBy[x.a] > (kept[x.a] || 0)).sort((a, b) => b.n - a.n).slice(0, LEARN_MAX);
  return { items, docs: docs.length, from };
}
async function loadLearn(force) {
  try { V.learn = (await S.get('meta/insp_learn')) || {}; } catch (e) { V.learn = {}; }
  const wk = weekOf(ymd());
  if (acct && acct.admin && (force || V.learn.week !== wk)) {
    try {
      const r = await buildLearn();
      const L = { week: wk, from: r.from, docs: r.docs, items: r.items, off: V.learn.off || [], at: S.SERVER_TIME, by: acct.label };
      await S.set('meta/insp_learn', L); V.learn = Object.assign({}, L, { at: Date.now() });
    } catch (e) { console.warn('AI 배우기', e); V.learnErr = '배운 것을 모으지 못했어요: ' + (e && (e.code || e.message) || e); }
  }
  applyLearn();
}
function learnHtml() {
  const L = V.learn || {}, off = L.off || [], it = L.items || [];
  let h = '<details class="aiset"><summary>🧠 AI가 배운 것 <small>' + it.filter(x => off.indexOf(lkey(x)) < 0).length + '개' + (L.week ? ' · ' + Number(L.week.slice(5, 7)) + '/' + Number(L.week.slice(8)) + ' 주' : '') + '</small></summary>' +
    '<p class="note">매주 월요일 관리자가 처음 열 때 지난 4주 점검에서 <b>AI 문구를 같은 식으로 2번 이상 고친 것</b>을 모아 판독 때 같이 알려 줘요. 이상한 건 ✕ 로 빼세요.<br>점검자분들이 틀린 AI 문구를 <b>지우고 맞게 고쳐 적어야</b> 배워요.</p>';
  if (V.learnErr) h += '<p class="err">' + esc(V.learnErr) + '</p>';
  if (!it.length) h += '<p class="note">아직 배운 게 없어요' + (L.docs != null ? ' (지난 4주 점검 ' + L.docs + '건)' : '') + '.</p>';
  h += it.map(x => { const k = lkey(x), o = off.indexOf(k) >= 0;
    return '<div class="lrn' + (o ? ' off' : '') + '"><span><s>' + esc(x.a) + '</s> → <b>' + esc(x.t) + '</b> <small>' + x.n + '번</small></span>' +
      '<button class="ref" data-a="lrn" data-v="' + esc(k) + '">' + (o ? '되살리기' : '✕ 빼기') + '</button></div>'; }).join('');
  return h + '<button class="ref" data-a="lrnnow">지금 다시 모으기</button></details>';
}

// ---------- 그리기
function draw() {
  const m = $('#main'); if (!m) return;
  if (user === null) { m.innerHTML = '<div class="card"><p class="note" style="margin:0">여는 중…</p></div>'; return; }
  if (!acct) { m.innerHTML = loginHtml(); return; }
  const y = window.scrollY, ae = document.activeElement;
  const fk = ae && ae.tagName === 'INPUT' && m.contains(ae) ? (ae.id ? '#' + ae.id : ae.hasAttribute('data-p') ? '.ptxt[data-p="' + ae.getAttribute('data-p') + '"]' : ae.hasAttribute('data-x') ? '[data-x="' + ae.getAttribute('data-x') + '"]' : '') : '';
  const fs = fk ? [ae.selectionStart, ae.selectionEnd] : null;
  document.body.classList.toggle('drafting', V.view === 'draft');
  m.innerHTML = V.view === 'draft' ? draftHtml() : V.view === 'done' ? doneHtml() : V.view === 'see' ? seeHtml() : homeHtml();
  if (V.keep === false) window.scrollTo(0, 0); else window.scrollTo(0, y);
  V.keep = true;
  if (fk) { const el = m.querySelector(fk); if (el && el.type !== 'password') { el.focus({ preventScroll: true }); try { el.setSelectionRange(fs[0], fs[1]); } catch (e) {} } }   // 다시 그려도 적던 칸 그대로
  if (V.view === 'done') showCards();
  if (V.view === 'see') loadSeeImgs();
  $('#who').textContent = acct.label + (byNow() ? ' · 점검 ' + byNow().name : '');
}
function go(v) { V.view = v; V.keep = false; draw(); }

function loginHtml() {
  return '<div class="card login"><h2>인스펙션 로그인</h2><div class="seg">' + ACCOUNTS.map((a, i) => '<button data-a="who" data-v="' + i + '" aria-pressed="' + (login.who === i) + '">' + a.label + '</button>').join('') + '</div>' +
    '<input id="pw" type="password" autocomplete="current-password" placeholder="비밀번호">' + (login.err ? '<p class="err">' + esc(login.err) + '</p>' : '') +
    '<button class="big-btn" data-a="login"' + (login.busy ? ' disabled' : '') + '>' + (login.busy ? '확인 중…' : '들어가기') + '</button>' +
    '<p class="note">파트장·하우스맨은 ‘점검자’ 공용 비밀번호로 들어와요. 한 번 들어가면 이 휴대폰에서는 계속 열려 있어요.</p></div>';
}
function byHtml() {
  const b = byNow(), N = names();
  return '<div class="card"><h2>점검자 <small>누가 점검하나요?</small></h2>' + ['관리자', '하우스맨'].map(g => '<div class="by-g"><b>' + g + '</b><div class="chips">' +
    N[g].map(n => '<button class="chip' + (b && b.name === n ? ' on' : '') + '" data-a="by" data-g="' + g + '" data-v="' + esc(n) + '">' + esc(n) + '</button>').join('') +
    '<button class="chip add" data-a="byadd" data-g="' + g + '">＋ 이름</button></div></div>').join('') +
    (b ? '' : '<p class="note">이름을 한 번 고르면 이 휴대폰이 기억해요.</p>') + '</div>';
}
function homeHtml() {
  const b = byNow();
  let h = '';
  if (!b || V.pickBy) return byHtml() + (b ? '<button class="big-btn sec" data-a="bydone">닫기</button>' : '');
  h += '<div class="bybar">점검 <b>' + esc(b.name) + '</b> <small>' + esc(b.g) + '</small><button class="ref" data-a="bychg">바꾸기</button></div>';
  const open = V.drafts.filter(x => x.st !== 'saved');
  h += '<div class="shoot"><button class="big-btn cam" data-a="cam">📷 새 객실 촬영</button><button class="big-btn sec" data-a="gal">🖼 갤러리에서</button></div><p class="note" style="margin:-6px 0 12px">📷 연속 촬영: 셔터만 계속 누르고 ‘완료’ · 🖼 갤러리: 사진을 길게 눌러 여러 장 선택' + galHint() + '</p>';
  if (open.length) h += '<div class="card"><h2>작성 중 <small>이어서 하기</small></h2>' + open.map(x => draftRow(x)).join('') + '</div>';
  const pend = V.drafts.filter(x => x.st === 'saved' && !allUp(x));
  if (pend.length) h += '<p class="waitbox">⏫ 사진 ' + pend.reduce((s, x) => s + x.photos.filter(p => !(x.up && x.up[p.pid])).length, 0) + '장을 아직 못 올렸어요. 인터넷이 되면 자동으로 올려요. <button class="ref" data-a="retry">지금 다시</button></p>';
  // 오늘 목록
  const d = V.d, today = ymd();
  h += '<div class="day"><button class="vp-x" data-a="day" data-v="-1">‹</button><b>' + Number(d.slice(5, 7)) + '월 ' + Number(d.slice(8)) + '일' + (d === today ? ' · 오늘' : '') + '</b><button class="vp-x" data-a="day" data-v="1"' + (d >= today ? ' disabled' : '') + '>›</button></div>';
  if (V.err) h += '<p class="err">' + esc(V.err) + ' <button class="ref" data-a="reload">다시 읽기</button></p>';
  const L = (V.list || []).slice().sort((a, b) => (a.state === '재정비 대기' ? 0 : 1) - (b.state === '재정비 대기' ? 0 : 1) || (b.clientAt || 0) - (a.clientAt || 0));
  const nF = L.reduce((s, x) => s + (x.n || 0), 0);
  h += '<div class="card"><h2>점검 ' + L.length + '실 <small>지적 ' + nF + '건 · 재정비 ' + L.filter(x => x.close === '재정비').length + '</small></h2>';
  if (!V.list) h += '<p class="note" style="margin:0">읽는 중…</p>';
  else if (!L.length) h += '<p class="note" style="margin:0">아직 없어요.</p>';
  h += L.map(x => '<button class="row' + (x.state === '재정비 대기' ? ' wait' : '') + '" data-a="open" data-v="' + esc(x.id) + '"><span class="rm">' + esc(x.room) + '</span><span class="rt"><b>' + esc(x.maid || '정비자 모름') + '</b><small>' + (x.n ? '지적 ' + x.n + '건' : '이상 없음') + ' · ' + esc(x.by || '') + ' · ' + hm(x.clientAt) + '</small></span><span class="st' + (x.state === '재정비 대기' ? ' w' : '') + '">' + esc(x.close === '재정비' ? x.state : x.n ? '수정완료' : '이상 없음') + '</span></button>').join('');
  h += '</div>';
  if (acct.admin) h += '<details class="aiset"><summary>⚙ AI 판독 설정 (관리자)</summary><div class="f"><label>모델</label><input id="aimodel" placeholder="비우면 자동 (gemini-3.5-flash → 2.5)" value="' + esc(V.aicfg.model || '') + '"></div>' +
    '<div class="f"><label>App Check 키</label><input id="aikey" placeholder="비우면 기본 키 (11/15 만든 것)" value="' + esc(V.aicfg.siteKey || '') + '"></div>' +
    '<div class="f"><label>키 종류</label><select id="aiac"><option value="ent"' + (V.aicfg.acType !== 'v3' ? ' selected' : '') + '>reCAPTCHA Enterprise</option><option value="v3"' + (V.aicfg.acType === 'v3' ? ' selected' : '') + '>reCAPTCHA v3</option></select></div>' +
    '<button class="big-btn sec" data-a="aisave">저장</button>' + (aiErr() ? '<p class="note warn">마지막 오류: ' + esc(aiErr()) + '</p>' : '') + '</details>';
  if (acct.admin) h += learnHtml();
  return h;
}
function galHint() {
  return lsGet('insp_gal', 'photo') === 'files'
    ? ' · 지금 <b>파일 방식</b> <button class="ref" data-a="gal1">기본으로</button>'
    : '<br>갤러리에서 한 장씩만 골라지면 → <button class="ref" data-a="gal2">📂 여러 장 고르기(파일 방식)</button>';
}
function draftRow(x) {
  const n = x.photos.length;
  return '<button class="row" data-a="resume" data-v="' + esc(x.id) + '"><span class="rm">' + esc(x.room || '----') + '</span><span class="rt"><b>' + esc(x.maid || '정비자 —') + '</b><small>사진 ' + n + '장 · ' + hm(x.at) + ' 마지막</small></span><span class="st w">이어 하기 ›</span></button>';
}
function aiLine(p, i) {
  if (p.aiBusy) return '<p class="ai busy">🤖 판독 중…</p>';
  if (p.aiFail && !p.ai) return '<p class="ai warn">🤖 판독 안 됨 <button class="ref" data-a="aire" data-v="' + i + '">다시 판독</button></p>';
  let h = '';
  if (p.dup || p.blur) h += '<p class="ai warn">' + (p.blur ? '흔들려서 잘 안 보여요' : '바로 앞 사진과 거의 같아요') + ' — <button class="ref" data-a="pdel" data-v="' + i + '">빼기</button> <button class="ref" data-a="keep" data-v="' + i + '">그대로 두기</button></p>';
  if (p.ai && p.ai.kind === 'ok' && !p.roomPlate) h += '<p class="ai">🤖 문제가 잘 안 보여요 — 직접 적어 주세요</p>';
  if (p.ai && p.ai.kind === 'fault' && p.tAI) h += '<p class="ai' + (p.ai.conf < 0.6 ? ' warn' : '') + '">🤖 AI 문구' + (p.ai.conf < 0.6 ? ' · 확인 필요' : '') + (p.ai.part ? ' · ' + esc(p.ai.zone + ' ' + p.ai.part + ' / ' + p.ai.type) : '') + '</p>';
  return h;
}
function draftHtml() {
  const x = V.cur; if (!x) return '';
  const nF = faults(x);
  let h = '<div class="card itop"><div class="f"><label for="room">객실</label><input id="room" class="roomin" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="예: 2217" value="' + esc(x.room) + '"></div>' +
    '<div class="f"><label for="maid">정비자</label><input id="maid" list="maids" autocomplete="off" placeholder="' + (x.maidBusy ? '찾는 중…' : '객실을 넣으면 자동') + '" value="' + esc(x.maid) + '"><datalist id="maids">' + Object.keys(V.plans).sort().map(m => '<option value="' + esc(m) + '">').join('') + '</datalist></div>' +
    (x.maidHow ? '<p class="note" style="margin:0 0 0 72px">' + (x.roomBy === 'AI' ? '🤖 룸넘버 판독 · ' : '') + esc(x.maidHow) + '</p>' : '') + (V.aiMsg ? '<p class="note warn">' + esc(V.aiMsg) + '</p>' : '') + (x.warn ? '<p class="note warn">' + esc(x.warn) + '</p>' : '') + '</div>';
  if (!x.photos.length) h += '<div class="card"><p class="note" style="margin:0">📷 를 누르면 연속 촬영 — 셔터만 계속 누르고 ‘완료’. 🖼 갤러리는 사진을 <b>길게 눌러 여러 장</b> 고를 수 있어요. 잘못 찍은 사진은 ✕ 로 빼요.' + galHint() + '</p></div>';
  h += x.photos.map((p, i) => '<div class="ph' + (p.roomPlate ? ' plate' : '') + '"><div class="pimg"><img src="' + (urls[p.pid] || '') + '" alt="사진 ' + (i + 1) + '"><span class="pno">' + (p.roomPlate ? '🚪' : no(x, i)) + '</span><button class="px" data-a="pdel" data-v="' + i + '" aria-label="사진 빼기">✕</button></div>' +
    aiLine(p, i) + (p.roomPlate ? '<p class="note" style="margin:6px 0 0">룸넘버 사진 — 공유 이미지에 안 들어가요 <button class="ref" data-a="plate" data-v="' + i + '">지적 사진으로</button></p>' :
      '<input class="ptxt" data-p="' + i + '" placeholder="지적 한 줄 (예: 각티슈 세팅 미흡)" value="' + esc(p.t) + '"><div class="chips sm">' + CHIPS.map(c => '<button class="chip" data-a="chip" data-v="' + i + '" data-c="' + esc(c) + '">' + esc(c) + '</button>').join('') +
      '<button class="chip ghost" data-a="plate" data-v="' + i + '">🚪 룸넘버</button></div>') + '</div>').join('');
  h += '<div class="card"><h2>사진 없는 지적 <small>예: 생수 하나 세팅</small></h2>' + (x.extra || []).map((t, i) => '<div class="ex"><input data-x="' + i + '" value="' + esc(t) + '"><button class="vp-x" data-a="xdel" data-v="' + i + '" aria-label="지우기">✕</button></div>').join('') +
    '<button class="ref" data-a="xadd">＋ 한 줄 더하기</button></div>';
  h += '<div class="ibar"><div class="bar1"><button class="big-btn cam" data-a="cam">📷 찍기</button><button class="big-btn sec" data-a="gal">🖼</button><span class="cnt">지적 <b>' + nF + '</b>건</span></div>' +
    (x.saving ? '<button class="big-btn" disabled>' + esc(x.saving) + '</button>' :
      nF ? '<div class="btn2"><button class="big-btn ok" data-a="save" data-v="수정완료">✅ 수정완료</button><button class="big-btn danger" data-a="save" data-v="재정비">🔧 재정비 요청</button></div>'
        : '<button class="big-btn ok" data-a="save" data-v=""' + (x.photos.length ? '' : ' disabled') + '>✅ 이상 없음으로 저장</button>') +
    '<div class="bar2"><button class="ref" data-a="home">← 목록 (작성 중으로 둠)</button><button class="ref" data-a="ddel" style="color:var(--warn)">이 점검 버리기</button></div></div>';
  return h;
}
const isF = p => !p.roomPlate;
function no(x, i) { return x.photos.slice(0, i + 1).filter(isF).length; }
function faults(x) { return x.photos.filter(isF).length + (x.extra || []).filter(t => String(t).trim()).length; }

function doneHtml() {
  const D = V.done;
  return '<p class="okbox">' + esc(D.msg) + '</p><div class="card"><h2>카톡 공유 <small>' + (D.cvs ? D.cvs.length + '장' : '만드는 중…') + '</small></h2><div id="cards"></div>' +
    '<div class="btn3"><button class="big-btn" data-a="share">카톡 공유</button><button class="big-btn sec" data-a="isave">이미지 저장</button><button class="big-btn sec" data-a="tcopy">글 복사</button></div>' +
    '<p class="note" id="imsg">' + esc(V.msg || '공유 → 카카오톡 → 관리자방. 글은 ‘글 복사’ 후 붙여넣기 해요.') + '</p></div>' +
    '<div class="btn2"><button class="big-btn sec" data-a="home">목록</button><button class="big-btn cam" data-a="cam">📷 다음 객실</button></div>' +
    (D.draftId ? '<button class="ref" data-a="reedit" style="margin-top:10px">문구 고치기</button>' : '');
}
function seeHtml() {
  const x = V.see, E = esc;
  let h = '<div class="card"><h2>' + E(x.room) + '호 <small>' + E(x.maid || '') + ' · ' + E(x.by || '') + ' ' + hm(x.clientAt) + '</small></h2>' +
    '<pre class="txt">' + E(makeText(textOf(x))) + '</pre>' +
    '<div class="thumbs">' + (x.photos || []).filter(p => !p.plate).map((p, i) => '<figure><img data-path="' + E(p.p) + '" alt=""><figcaption>' + (i + 1) + '. ' + E(p.t || '') + '</figcaption></figure>').join('') + '</div></div>';
  if (x.state === '재정비 대기') h += '<button class="big-btn danger" data-a="fixed" style="margin-bottom:10px">재정비 끝 (확인했어요)</button>';
  h += '<button class="ref" data-a="tcopy2">글 복사</button> ';
  if (V.drafts.some(d => d.docId === x.id)) h += '<button class="ref" data-a="reopen">이 휴대폰에서 다시 공유·고치기</button>';
  return h + '<button class="big-btn sec" data-a="home" style="margin-top:14px">목록</button>';
}
function textOf(x) { const ph = (x.photos || []).filter(p => !p.plate); return { room: x.room, maid: x.maid, close: x.close, items: ph.map(p => ({ t: p.t })), extra: x.extra || [] }; }
async function loadSeeImgs() {
  const im = document.querySelectorAll('.thumbs img[data-path]');
  if (!im.length) return;
  try { const s = await stor(); im.forEach(el => s.url(el.getAttribute('data-path')).then(u => { el.src = u; }, () => { el.alt = '아직 안 올라옴'; })); } catch (e) {}
}

// ---------- 촬영 · 고르기
// 갤러리 여러 장 (11/15): 일부 삼성·안드로이드 크롬은 accept=image/* 로 열면 '사진 선택기'가 한 장만 고르게 됨
//   → 'files' 방식(확장자로 열기 = 시스템 파일 선택기, 길게 눌러 여러 장)을 따로 두고, 한 번 쓰면 휴대폰이 기억
function pick(multi, how) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.style.display = 'none';
  const mode = how || lsGet('insp_gal', 'photo');
  inp.accept = multi && mode === 'files' ? '.jpg,.jpeg,.png,.webp,.heic,.heif' : 'image/*';
  if (multi) inp.multiple = true; else inp.setAttribute('capture', 'environment');
  inp.addEventListener('change', async () => { const fs = Array.from(inp.files || []); inp.remove(); if (fs.length) await addPhotos(fs); });
  document.body.appendChild(inp); inp.click();
}
// 사진 읽기 (11/20): 갤럭시 '고효율 사진(HEIF)' 이 켜진 휴대폰은 사진이 .heic → 크롬이 못 읽음('사진을 못 읽었어요')
//   → 읽기 실패 + HEIC 이면 그때만 변환기(heic-to, 약 3MB)를 받아 그림으로 바꿈. 한 번 받으면 브라우저가 기억
const HEIC_LIB = 'https://cdn.jsdelivr.net/npm/heic-to@1.6.7/dist/heic-to.js';
let heicP = null;
async function looksHeic(file) {
  if (/\.(heic|heif)$/i.test(file.name || '') || /hei[cf]/i.test(file.type || '')) return true;
  try { const b = new Uint8Array(await file.slice(4, 12).arrayBuffer()), t = String.fromCharCode.apply(null, b); return /^ftyp(heic|heix|hevc|heim|heis|hevm|hevs|mif1|msf1)/.test(t); } catch (e) { return false; }
}
function imgOf(file) {
  return new Promise((res, rej) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('x')); }; im.src = u; });
}
async function decode(file) {
  if (!file || !file.size) throw new Error('사진 파일이 비어 있어요 (휴대폰에 아직 안 내려받은 사진이면 갤러리에서 한 번 열어 본 뒤 다시 골라 주세요)');
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) {}
  try { return await imgOf(file); } catch (e) {}
  if (await looksHeic(file)) {
    try {
      if (!heicP) heicP = (window.__heicLib ? Promise.resolve(window.__heicLib) : import(HEIC_LIB)).catch(e => { heicP = null; throw e; });
      const L = await heicP;
      return await L.heicTo({ blob: file, type: 'bitmap' });
    } catch (e) { console.warn('HEIC', e); throw new Error('HEIC(고효율 사진)을 바꾸지 못했어요 — 카메라 설정에서 \'고효율 사진\'을 꺼 주세요'); }
  }
  throw new Error('사진을 못 읽었어요 (' + (file.type || (file.name || '').split('.').pop() || '형식 모름') + ', ' + Math.round(file.size / 1024) + 'KB)');
}
async function shrink(file) {
  const bmp = await decode(file);
  const s = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
  if (bmp.close) try { bmp.close(); } catch (e) {}
  const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', JPEG_Q));
  if (!blob) throw new Error('사진을 줄이지 못했어요 (휴대폰 메모리 부족일 수 있어요 — 다른 앱을 닫고 다시)');
  return { blob, w, h };
}
async function addPhotos(files, quiet) {
  if (!V.cur || V.view !== 'draft') await startDraft();
  const x = V.cur; x.saving = '사진 넣는 중…'; if (!quiet) draw();
  for (const f of files) {
    try {
      const r = await shrink(f), pid = 'p' + newId();
      await idb.put('blobs', r.blob, pid);
      urls[pid] = URL.createObjectURL(r.blob);
      const ph = { pid, w: r.w, h: r.h, t: '', at: Date.now() };
      try { ph.hash = await hashOf(r.blob); const prev = x.photos[x.photos.length - 1]; if (prev && hamming(prev.hash, ph.hash) <= 5) ph.dup = 1; } catch (e) {}
      x.photos.push(ph); aiQueue(x, ph);
      if (x.st === 'saved') x.dirty = true;
      await saveDraft();
    } catch (e) { alert('사진 하나를 못 넣었어요: ' + (e && e.message || e)); }
  }
  x.saving = ''; if (quiet) return; draw();
  setTimeout(() => { const els = document.querySelectorAll('.ptxt'); if (els.length) els[els.length - 1].scrollIntoView({ block: 'center' }); }, 60);
}
// ---------- AI 판독 대기열 (동시에 2장)
const AQ = []; let aRun = 0;
function aiQueue(x, p) { if (V.aiOff) return; p.aiBusy = 1; AQ.push([x, p]); aiNext(); }
async function aiNext() {
  if (aRun >= 4 || !AQ.length) return;   // 동시에 4장까지 판독 (11/15 '한세월' → 병렬)
  const [x, p] = AQ.shift(); aRun++;
  try {
    const blob = await idb.get('blobs', p.pid);
    const r = blob ? await readPhoto(blob) : null;
    p.aiBusy = 0;
    if (!x.photos.includes(p)) return;
    if (!r) { p.aiFail = 1; const er = aiErr(); V.aiMsg = 'AI 판독이 안 돼요 — 직접 적어 주세요' + (/prepay|credits/i.test(er) ? ' (Gemini 선불 크레딧 부족 — 관리자가 AI Studio 에서 충전)' : acct && acct.admin && er ? ' (' + er.replace(/^AI: Error fetching from \S+: /, '').slice(0, 140) + ')' : ''); }
    else {
      p.ai = r; V.aiMsg = '';
      if (r.kind === 'room') { p.roomPlate = true; if (!x.room && roomOk(r.room)) { x.room = r.room; x.roomBy = 'AI'; findMaid(x, r.room); } }
      else if (r.kind === 'blur') p.blur = 1;
      else if (r.kind === 'fault' && !String(p.t || '').trim() && r.text) { p.t = r.text; p.tAI = 1; }
    }
    if (V.cur === x) { await saveDraft(); draw(); } else await idb.put('drafts', Object.assign({}, x)).catch(() => {});
  } finally { aRun--; aiNext(); }
}
async function startDraft() {
  const b = byNow();
  V.cur = { id: 'd' + newId(), date: ymd(), room: '', maid: '', maidHow: '', maidHand: false, by: b ? b.name : '', grp: b ? b.g : '', photos: [], extra: [], up: {}, st: 'draft', at: Date.now() };
  V.done = null; V.view = 'draft'; V.keep = false;
  if (V.cur.date !== V.d || !Object.keys(V.plans).length) loadPlans(V.cur.date);
  await saveDraft();
}
let saveT = null;
function saveDraft() { const x = V.cur; if (!x) return Promise.resolve(); x.at = Date.now(); const c = Object.assign({}, x); delete c.saving; delete c.maidBusy; c.photos = x.photos.map(p => { const q = Object.assign({}, p); delete q.aiBusy; return q; }); return idb.put('drafts', c).catch(e => console.warn('임시 저장', e)); }
function saveSoon() { clearTimeout(saveT); saveT = setTimeout(saveDraft, 400); }
async function openDraft(id) {
  const x = await idb.get('drafts', id); if (!x) return;
  for (const p of x.photos) if (!urls[p.pid]) { const b = await idb.get('blobs', p.pid); if (b) urls[p.pid] = URL.createObjectURL(b); }
  V.cur = x; V.view = 'draft'; V.keep = false; V.done = null;
  x.photos.forEach(p => { p.aiBusy = 0; if (!p.ai && !p.aiFail) aiQueue(x, p); });
  loadPlans(x.date); draw();
}

// ---------- 정비자: 그날 그 객실 '완료' 누른 사람(마지막) → 없으면 그날 배정
async function loadPlans(d) {
  try { const pl = await S.getQuery('days/' + d + '/plans', []); V.plans = {}; pl.forEach(p => { V.plans[p.id] = ((p.data && p.data.rooms) || []).map(r => String(r.room)); }); }
  catch (e) { V.plans = {}; }
}
async function findMaid(x, room) {
  x.maidBusy = true; draw();
  let o = { maid: '', how: '기록 없음 — 직접 적어 주세요' };
  try {
    const docs = await S.getQuery('days/' + x.date + '/recs', [['room', '==', room]]);
    const ok = docs.map(d => d.data).filter(d => d.status === '완료' || d.status === '이상').sort((a, b) => (b.clientAt || b.at || 0) - (a.clientAt || a.at || 0));
    if (ok.length) o = { maid: ok[0].maid, how: hm(ok[0].clientAt || ok[0].at) + ' 완료 기록' + (ok.length > 1 ? ' (같은 날 ' + Array.from(new Set(ok.slice(1).map(d => d.maid))).join(', ') + ')' : '') };
  } catch (e) { o.how = '완료 기록을 못 읽었어요 — 직접 적어 주세요'; }
  if (!o.maid) { const hit = Object.keys(V.plans).filter(n => V.plans[n].indexOf(room) >= 0); if (hit.length) o = { maid: hit[0], how: '배정 기준 (완료 기록 없음)' }; }
  x.maidBusy = false;
  if (V.cur === x && x.room === room && !x.maidHand) { x.maid = o.maid; x.maidHow = o.how; saveDraft(); }
  draw();
}

// ---------- 저장 → 공유
async function save(close) {
  const x = V.cur, a = acct;
  if (!roomOk(x.room)) { alert('객실 번호 4자리를 확인해 주세요.'); $('#room') && $('#room').focus(); return; }
  // 문구 빈 사진 (11/20): 흔들림·바닥·손 사진이 AI 에서 '흔들림/문제 안 보임' → 문구 없이 저장돼 공유에 번호만 남던 것
  //   → 몇 번인지 보여 주고, [확인] = 빈 사진 빼고 저장 / [취소] = 돌아가서 적기
  const emp = x.photos.filter(p => isF(p) && !String(p.t).trim());
  if (emp.length) {
    const nos = emp.map(p => no(x, x.photos.indexOf(p))).join('·');
    if (!confirm(nos + '번 사진에 지적 문구가 없어요.\n\n[확인] 문구 없는 사진 ' + emp.length + '장 빼고 저장\n[취소] 돌아가서 문구 적기')) {
      const i = x.photos.indexOf(emp[0]), el = document.querySelector('.ptxt[data-p="' + i + '"]'); if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); }
      return;
    }
    emp.forEach(p => { idb.del('blobs', p.pid).catch(() => {}); if (x.paths) delete x.paths[p.pid]; });
    x.photos = x.photos.filter(p => emp.indexOf(p) < 0);
    if (!x.photos.length && !faults(x)) { await saveDraft(); draw(); alert('남은 사진이 없어요. 사진을 다시 찍거나 \'이 점검 버리기\'를 눌러 주세요.'); return; }
    if (!faults(x)) close = '';
  }
  const nF = faults(x);
  if (!x.maid && !confirm('정비자를 모르는 채로 저장할까요? (메이드별 기록에서 빠져요)')) return;
  if (close === '재정비' && !x.maid) { alert('재정비 요청은 정비자가 있어야 해요.'); return; }
  const docId = x.docId || (x.date + '_' + x.room + '_' + newId());
  const photos = x.photos.map((p, i) => { const o = { p: 'insp/' + x.date + '/' + docId + '/' + p.pid + '.jpg', t: isF(p) ? String(p.t).trim().slice(0, 100) : '', w: p.w, h: p.h, plate: !!p.roomPlate };
    if (p.ai) { o.ai = { k: p.ai.kind, t: p.ai.text, z: p.ai.zone, pt: p.ai.part, ty: p.ai.type, c: p.ai.conf }; o.edit = isF(p) && String(p.t).trim() !== p.ai.text; }   // AI 문구를 사람이 고쳤는지 → 나중에 문구 사전·정확도
    return o; });
  const extra = (x.extra || []).map(t => String(t).trim().slice(0, 100)).filter(Boolean);
  const prev = x.docId ? (V.list || []).filter(y => y.id === docId)[0] : null;
  const doc = { v: 2, date: x.date, room: x.room, maid: String(x.maid || '').trim().slice(0, 20), maidHow: x.maidHand ? '직접' : String(x.maidHow || '').slice(0, 60), by: x.by, grp: x.grp,
    photos, extra, n: nF, close: nF ? close : '', state: nF && close === '재정비' ? '재정비 대기' : '완료',
    clientAt: new Date(x.firstAt || Date.now()), at: S.SERVER_TIME, acct: a.label, uid: user.uid };
  if (prev && prev.state === '확인' && doc.close === '재정비') { doc.state = '확인'; doc.fixBy = prev.fixBy || ''; }
  x.saving = '저장 중…'; draw();
  let r;
  try { r = await Promise.race([S.set('insp/' + docId, doc).then(() => 'ok'), new Promise(res => setTimeout(() => res('slow'), 12000))]); }
  catch (e) { x.saving = ''; draw(); alert('저장하지 못했어요: ' + (e && (e.code || e.message) || e)); return; }
  x.docId = docId; x.st = 'saved'; x.savedAt = Date.now(); x.firstAt = x.firstAt || Date.now(); x.close = doc.close; x.saving = ''; x.dirty = false;
  x.paths = {}; photos.forEach((p, i) => { x.paths[x.photos[i].pid] = p.p; });
  await saveDraft();
  const local = Object.assign({}, doc, { id: docId, clientAt: x.firstAt, at: Date.now() });
  if (V.d === x.date) V.list = (V.list || []).filter(y => y.id !== docId).concat([local]);
  V.done = { draftId: x.id, x: JSON.parse(JSON.stringify(x)), doc: local, cvs: null, msg: (doc.close === '재정비' ? '🔧 재정비 요청' : nF ? '✅ 수정완료' : '✅ 이상 없음') + '으로 저장했어요' + (r === 'slow' ? ' (인터넷이 느려서 휴대폰에 먼저 저장 — 연결되면 올라가요)' : '') };
  V.msg = ''; V.cur = null; await loadDrafts(); go('done');
  upload();
}
let upBusy = false;
async function upload() {
  if (upBusy) return; upBusy = true;
  try {
    const ds = (await idb.all('drafts')).filter(x => x.st === 'saved' && !allUp(x));
    if (!ds.length) return;
    const s = await stor();
    for (const x of ds) {
      for (const p of x.photos) {
        if (x.up && x.up[p.pid]) continue;
        const blob = await idb.get('blobs', p.pid); if (!blob || !x.paths) continue;
        await s.put(x.paths[p.pid], blob);
        x.up = x.up || {}; x.up[p.pid] = 1; await idb.put('drafts', x);
      }
    }
  } catch (e) { console.warn('사진 올리기', e); }
  finally { upBusy = false; await loadDrafts(); if (V.view === 'home') draw(); }
}
// 공유 이미지
async function showCards() {
  const D = V.done; if (!D || D.cvs) { putCards(); return; }
  const x = D.x, items = [];
  for (const p of x.photos) {
    if (!isF(p)) continue;
    let img = null; const b = await idb.get('blobs', p.pid).catch(() => null);
    if (b) { try { img = await createImageBitmap(b); } catch (e) { img = await new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = URL.createObjectURL(b); }); } }
    items.push({ img, t: String(p.t || '').trim(), no: items.length + 1 });
  }
  const c = { date: x.date, room: x.room, maid: x.maid, by: x.by, time: hm(x.firstAt), close: D.doc.close, n: D.doc.n, items, extra: D.doc.extra };
  D.card = c; D.cvs = makeCards(c); D.text = makeText(c);
  if (V.view === 'done') { const h = document.querySelector('.card h2 small'); if (h) h.textContent = D.cvs.length + '장'; putCards(); }
}
function putCards() { const box = $('#cards'); if (!box || !V.done || !V.done.cvs) return; box.innerHTML = ''; V.done.cvs.forEach(cv => { const im = new Image(); im.src = cv.toDataURL('image/jpeg', 0.6); im.className = 'cardimg'; box.appendChild(im); }); }
const toBlob = cv => new Promise(res => cv.toBlob(res, 'image/jpeg', 0.9));
const say = t => { V.msg = t; const e = $('#imsg'); if (e) e.textContent = t; };
async function shareImgs(kind) {
  const D = V.done; if (!D || !D.cvs) return;
  const blobs = await Promise.all(D.cvs.map(toBlob));
  const nm = i => 'insp_' + D.x.date.slice(5).replace('-', '') + '_' + D.x.room + (blobs.length > 1 ? '_' + (i + 1) : '') + '.jpg';
  const files = blobs.map((b, i) => new File([b], nm(i), { type: 'image/jpeg' }));
  if (kind === 'share') {
    if (navigator.canShare && navigator.canShare({ files })) {
      try { if (navigator.clipboard) await navigator.clipboard.writeText(D.text).catch(() => {}); } catch (e) {}
      navigator.share({ files }).then(() => say('공유했어요 ✓ 글은 복사해 뒀어요 — 카톡 입력칸에 붙여넣기만 하세요.'), () => {});
      return;
    }
    if (navigator.clipboard && window.ClipboardItem && blobs.length === 1) {   // PC: 이미지 복사
      const png = await new Promise(res => D.cvs[0].toBlob(res, 'image/png'));
      navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]).then(() => say('이미지를 복사했어요 ✓ 카톡 창에 Ctrl+V'), () => say('복사가 막혔어요. 이미지 저장을 써 주세요.'));
      return;
    }
    say('이 기기는 바로 공유가 안 돼요. 이미지 저장 후 카톡에서 사진으로 보내 주세요.'); return;
  }
  files.forEach((f, i) => { const u = URL.createObjectURL(f), a = document.createElement('a'); a.href = u; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); });
  say('이미지 ' + files.length + '장을 저장했어요 ✓');
}
function copyText(t) { if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => say('글을 복사했어요 ✓'), () => say('복사가 막혔어요.')); }

// ---------- 누르기
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-a]'); if (!t) return;
  const a = t.getAttribute('data-a'), v = t.getAttribute('data-v'), x = V.cur;
  if (a === 'who') { login.who = Number(v); const pw = ($('#pw') || {}).value; draw(); if ($('#pw')) { $('#pw').value = pw || ''; $('#pw').focus(); } return; }
  if (a === 'login') return doLogin();
  if (a === 'by') { lsSet('insp_by', { name: v, g: t.getAttribute('data-g') }); V.pickBy = false; draw(); return; }
  if (a === 'byadd') { const nm = (prompt(t.getAttribute('data-g') + ' 이름') || '').trim().slice(0, 20); if (!nm) return; const N = names(), g = t.getAttribute('data-g'); if (N[g].indexOf(nm) < 0) N[g].push(nm); lsSet('insp_names', N); lsSet('insp_by', { name: nm, g }); V.pickBy = false; draw(); return; }
  if (a === 'bychg') { V.pickBy = true; draw(); return; }
  if (a === 'bydone') { V.pickBy = false; draw(); return; }
  if (a === 'cam' || a === 'gal' || a === 'cam1') {
    if (!byNow()) { V.pickBy = true; go('home'); return; }
    if (V.view === 'done' || (V.view !== 'draft' && a !== 'gal')) { V.cur = null; await startDraft(); draw(); }
    if (a === 'cam' && camOk()) {   // 앱 안 연속 촬영 — 셔터만 계속, 판독은 뒤에서 바로
      const ok = await openCam({ onShot: b => addPhotos([b], true), onDone: () => { draw(); setTimeout(() => window.scrollTo(0, 0), 50); } });
      if (ok) return;
    }
    pick(a === 'gal'); return;
  }
  if (a === 'gal2') { lsSet('insp_gal', 'files'); if (!byNow()) { V.pickBy = true; go('home'); return; } if (V.view !== 'draft') { V.cur = null; await startDraft(); draw(); } pick(true, 'files'); return; }
  if (a === 'gal1') { lsSet('insp_gal', 'photo'); draw(); return; }
  if (a === 'resume') return openDraft(v);
  if (a === 'home') { await saveDraft(); V.cur = null; await loadDrafts(); go('home'); return; }
  if (a === 'reload') return loadList();
  if (a === 'retry') return upload();
  if (a === 'day') { if (v === '1' && V.d >= ymd()) return; V.d = addDays(V.d, Number(v)); V.list = null; draw(); return loadList(); }
  if (a === 'open') {
    const d = V.drafts.filter(y => y.docId === v && y.st === 'saved')[0];
    V.see = (V.list || []).filter(y => y.id === v)[0]; if (!V.see) return;
    go('see'); return;
  }
  if (a === 'reopen') { const d = V.drafts.filter(y => y.docId === V.see.id)[0]; if (d) return openDraft(d.id); return; }
  if (a === 'reedit') { if (V.done && V.done.draftId) return openDraft(V.done.draftId); return; }
  if (a === 'fixed') {
    const s = V.see; if (!confirm(s.room + '호 재정비가 끝났나요?')) return;
    const doc = Object.assign({}, s, { state: '확인', fixBy: byNow() ? byNow().name : acct.label, fixAt: new Date(), uid: user.uid, clientAt: new Date(s.clientAt || Date.now()), at: new Date(s.at || Date.now()) }); delete doc.id;
    try { await S.set('insp/' + s.id, doc); s.state = '확인'; go('home'); } catch (err) { alert('저장하지 못했어요: ' + (err && (err.code || err.message) || err)); }
    return;
  }
  if (a === 'lrn') {
    const L = V.learn || {}, off = (L.off || []).slice(), i = off.indexOf(v);
    if (i >= 0) off.splice(i, 1); else off.push(v);
    try { await S.merge('meta/insp_learn', { off }); L.off = off; V.learn = L; applyLearn(); draw(); } catch (err) { alert('저장하지 못했어요: ' + (err && (err.code || err.message) || err)); }
    return;
  }
  if (a === 'lrnnow') { t.disabled = true; t.textContent = '모으는 중…'; V.learnErr = ''; await loadLearn(true); draw(); return; }
  if (a === 'aisave') {
    const c = { model: ($('#aimodel') || {}).value.trim(), siteKey: ($('#aikey') || {}).value.trim(), acType: ($('#aiac') || {}).value, at: S.SERVER_TIME };
    try { await S.set('meta/insp_ai', c); V.aicfg = c; setCfg(c); alert('저장했어요. 새로 고침하면 새 설정으로 판독해요.'); } catch (err) { alert('저장하지 못했어요: ' + (err && (err.code || err.message) || err)); }
    return;
  }
  if (a === 'share' || a === 'isave') return shareImgs(a);
  if (a === 'tcopy') { if (V.done && V.done.text) copyText(V.done.text); return; }
  if (a === 'tcopy2') { copyText(makeText(textOf(V.see))); return; }
  if (!x) return;
  if (a === 'pdel') { const i = Number(v), p = x.photos[i]; if (!p) return; if (p.t && !confirm('이 사진과 문구를 뺄까요?')) return; x.photos.splice(i, 1); idb.del('blobs', p.pid).catch(() => {}); if (x.paths) delete x.paths[p.pid]; await saveDraft(); draw(); return; }
  if (a === 'aire') { const p = x.photos[Number(v)]; p.aiFail = 0; V.aiMsg = ''; aiQueue(x, p); draw(); return; }
  if (a === 'keep') { const p = x.photos[Number(v)]; p.dup = 0; p.blur = 0; await saveDraft(); draw(); return; }
  if (a === 'plate') { const p = x.photos[Number(v)]; p.roomPlate = !p.roomPlate; await saveDraft(); draw(); return; }
  if (a === 'chip') { const p = x.photos[Number(v)], c = t.getAttribute('data-c'); p.t = (String(p.t || '').trim() + ' ' + c).trim(); await saveDraft(); draw(); const el = document.querySelector('.ptxt[data-p="' + v + '"]'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } return; }
  if (a === 'xadd') { x.extra = (x.extra || []).concat(['']); await saveDraft(); draw(); const els = document.querySelectorAll('[data-x]'); if (els.length) els[els.length - 1].focus(); return; }
  if (a === 'xdel') { x.extra.splice(Number(v), 1); await saveDraft(); draw(); return; }
  if (a === 'save') return save(v);
  if (a === 'ddel') { if (!confirm(x.docId ? '휴대폰의 작성본만 지워요 (이미 저장한 기록은 남아요). 지울까요?' : '이 점검(사진 ' + x.photos.length + '장)을 버릴까요?')) return; await dropDraft(x); V.cur = null; await loadDrafts(); go('home'); return; }
});
document.addEventListener('input', e => {
  const el = e.target, x = V.cur; if (!x) return;
  if (el.id === 'room') {
    const r = el.value.replace(/\D/g, '').slice(0, 4); if (r !== el.value) el.value = r;
    if (r === x.room) return; x.room = r; x.warn = ''; saveSoon();
    if (r.length === 4) {
      if (!roomOk(r)) { x.warn = '없는 객실 번호예요'; draw(); return; }
      const prev = (V.list || []).filter(y => y.room === r && y.id !== x.docId);
      if (prev.length) x.warn = '오늘 이미 점검한 객실이에요 (' + prev.map(y => hm(y.clientAt) + ' ' + (y.by || '')).join(', ') + ') — 새로 한 건 더 남겨요';
      el.blur(); findMaid(x, r);
    }
    return;
  }
  if (el.id === 'maid') { x.maid = el.value.trim(); x.maidHand = true; x.maidHow = ''; saveSoon(); return; }
  if (el.classList.contains('ptxt')) { const p = x.photos[Number(el.getAttribute('data-p'))]; if (p) { p.t = el.value; p.tAI = 0; saveSoon(); const c = document.querySelector('.cnt b'); if (c) c.textContent = faults(x); } return; }
  if (el.hasAttribute('data-x')) { x.extra[Number(el.getAttribute('data-x'))] = el.value; saveSoon(); const c = document.querySelector('.cnt b'); if (c) c.textContent = faults(x); return; }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target && e.target.id === 'pw') doLogin(); });
// 화면이 다시 보이면: 작성 중 저장 + 목록·올리기 다시
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveDraft(); else if (acct) { upload(); if (V.view === 'home') loadList(); checkVer(); } });
window.addEventListener('online', () => upload());

async function doLogin() {
  const pw = ($('#pw') || {}).value || '';
  if (!pw) { login.err = '비밀번호를 적어 주세요.'; draw(); return; }
  login.busy = true; login.err = ''; draw();
  try { await S.signInEmail(ACCOUNTS[login.who].email, pw); }
  catch (e) { login.err = /network|offline/i.test(String(e && (e.code || e.message))) ? '인터넷 연결을 확인해 주세요.' : '비밀번호가 맞지 않아요.'; }
  login.busy = false; draw();
}
function checkVer() {
  fetch('../version.json?t=' + Date.now(), { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(j => {
    if (!j || !j.v || j.v === VER || window.__hubFast) return;
    let done = ''; try { done = sessionStorage.getItem('insp_reload') || ''; } catch (e) {}
    if (done === j.v) return; try { sessionStorage.setItem('insp_reload', j.v); } catch (e) {}
    saveDraft().then(() => location.reload());
  }).catch(() => {});
}
S.onUser(async u => {
  user = u || false;
  acct = u && !u.anon ? ACCOUNTS.filter(a => (a.uid && a.uid === u.uid) || (a.email && a.email === u.email))[0] || null : null;
  if (u && !u.anon && !acct) login.err = '인스펙션 계정이 아니에요. 로그아웃 후 다시 들어와 주세요.';
  draw();
  if (!acct) return;
  try { const c = await S.get('meta/insp_ai'); V.aicfg = c || {}; } catch (e) { V.aicfg = {}; }
  setCfg(V.aicfg);
  loadLearn().then(() => { if (V.view === 'home') draw(); });
  await loadDrafts();
  // 작성 중이 하나뿐이고 방금(10분 안) 하던 것이면 바로 그 화면으로 (화면 잠김 뒤 이어서)
  const open = V.drafts.filter(x => x.st !== 'saved');
  if (open.length === 1 && Date.now() - (open[0].at || 0) < 10 * 60000 && V.view === 'home') return openDraft(open[0].id).then(() => { loadList(); upload(); });
  draw(); loadList(); upload(); loadPlans(ymd());
});
$('#out') && $('#out').addEventListener('click', () => { if (confirm('로그아웃할까요?')) S.signOut(); });
checkVer();
draw();
