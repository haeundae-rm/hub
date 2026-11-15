// 🔍 객실 인스펙션 — 관리자 허브 (2026-11-15, 인스펙션 앱 1단계)
// 지금 방식: 카톡 관리자방에 룸넘버·미흡 사진·지적 목록 → 월말 엑셀 36항목 그리드에 다시 입력 (결산 중 가장 오래 걸림)
// 1단계: 객실 번호 → 구역 탭 → 부위 → 유형(누를 때마다 1건) → 지적 수·등급 → 정비자 자동 → 마무리 A 수정완료 / B 재정비 요청
//        → 카톡 공유 이미지(복사·저장·공유) + 퀵점검(점검자별 하루 실수) + 오늘 목록(재정비 대기 위)
// 2단계(다음): 사진(Cloud Storage) · 메이드 재정비 화면(정비 레포트) · 점검자 계정 / 3단계: 메이드별 누계·취약점
// 저장: insp/{날짜_객실_시각} 한 건씩 · insp_quick/{날짜} 퀵점검 · insp_sum/{날짜} 그날 요약(저장할 때마다 그날 목록으로 다시 계산 → 3단계 분석은 요약만 읽음)
// 읽기: 열 때 · 날짜 바꿀 때만 (그날 insp + 퀵 + 배정 plans). 정비자 찾기는 객실마다 그날 완료 기록(recs) 1번
import { ZONES, ETC, TYPE_KEY, GRADE, gradeOf, CHECKERS } from './insp_items.js?v=2026.11.15-8';

let H = null, I = null;
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const seoul = t => new Date(Number(t) + 9 * 3600e3);
const hm = t => { if (!t) return ''; const d = seoul(t); return ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2); };
const wd = d => DAYS[new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8))).getUTCDay()];
const roomOk = r => { if (!/^\d{4}$/.test(r)) return false; const f = Math.floor(+r / 100), s = +r % 100; return f >= 4 && f <= 31 && s >= 1 && s <= 20; };
const keyOf = (z, p, t) => z + '|' + p + '|' + t;
const lsGet = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const withTimeout = (p, ms) => Promise.race([p.then(() => 'ok'), new Promise(res => setTimeout(() => res('slow'), ms))]);
const GCOL = { A: '#1E8E3E', B: '#B7791F', C: '#B42318' };
const STATE_ORDER = { '재정비 대기': 0, '메이드 완료': 1 };

export function openInsp(hub) {
  H = hub;
  if (document.getElementById('ipp')) return;
  I = { d: H.ymd(), view: 'list', list: null, quick: {}, plans: {}, busy: false, err: '', form: null, done: null, msg: '' };
  const p = document.createElement('div'); p.className = 'vp'; p.id = 'ipp';
  p.innerHTML = '<div class="vp-in"><div class="vp-head"><h2>🔍 객실 인스펙션</h2><button class="vp-x" data-ia="close" aria-label="닫기">✕</button></div><div id="ipin"></div></div>';
  document.body.appendChild(p); document.body.classList.add('sb-lock');
  p.addEventListener('click', onClick);
  p.addEventListener('input', onInput);
  p.addEventListener('change', onInput);
  load();
}
function close() {
  const p = document.getElementById('ipp'); if (p) p.remove();
  document.body.classList.remove('sb-lock'); clearTimeout(qTimer); I = null;
}

// ---------- 읽기 (그날 한 번)
async function load() {
  const d = I.d; I.busy = true; I.err = ''; draw();
  const safe = p => p.then(x => x, e => ({ __err: String(e && (e.code || e.message) || e) }));
  const [L, q, pl] = await Promise.all([safe(H.S.getQuery('insp', [['date', '==', d]])), safe(H.S.get('insp_quick/' + d)), safe(H.S.getQuery('days/' + d + '/plans', []))]);
  if (!I || I.d !== d) return;
  if (L.__err) { I.err = '점검 기록을 못 읽었어요: ' + L.__err; I.list = null; }
  else I.list = L.map(x => Object.assign({ id: x.id }, x.data));
  I.quick = q && !q.__err && q.c ? Object.assign({}, q.c) : {};
  I.plans = {};
  if (Array.isArray(pl)) pl.forEach(x => { I.plans[x.id] = ((x.data && x.data.rooms) || []).map(r => String(r.room)); });
  I.busy = false; draw();
}

// ---------- 정비자 찾기: 그날 그 객실 '완료' 누른 사람(마지막) → 없으면 그날 배정(plans) (VOC 마지막 정비자와 같은 방식, 같은 날만)
async function findMaid(room) {
  const f = I.form; if (!f) return;
  f.maidBusy = true; draw();
  let out = { maid: '', how: '기록 없음 — 직접 적어 주세요', more: [] };
  try {
    const docs = await H.S.getQuery('days/' + I.d + '/recs', [['room', '==', room]]);
    const ok = docs.map(x => x.data).filter(x => x.status === '완료' || x.status === '이상').sort((a, b) => (b.clientAt || b.at || 0) - (a.clientAt || a.at || 0));
    if (ok.length) out = { maid: ok[0].maid, how: hm(ok[0].clientAt || ok[0].at) + ' 완료', more: Array.from(new Set(ok.slice(1).map(x => x.maid).filter(m => m !== ok[0].maid))) };
  } catch (e) { out.how = '완료 기록을 못 읽었어요 — 직접 적어 주세요'; }
  if (!out.maid) {
    const hit = Object.keys(I.plans).filter(n => I.plans[n].indexOf(room) >= 0);
    if (hit.length) out = { maid: hit[0], how: '배정 기준 (아직 완료 기록 없음)', more: hit.slice(1) };
  }
  if (!I || I.form !== f || f.room !== room) return;
  f.maidBusy = false;
  if (!f.maidHand) { f.maid = out.maid; f.maidHow = out.how; f.maidMore = out.more; }
  draw();
}

// ---------- 합계
const sumItems = it => Object.keys(it || {}).reduce((s, k) => s + (Number(it[k]) || 0), 0);
const zoneN = (it, z) => Object.keys(it || {}).filter(k => k.split('|')[0] === z).reduce((s, k) => s + (Number(it[k]) || 0), 0);
function daySum(list) {
  const s = { date: I.d, rooms: 0, n: 0, A: 0, B: 0, C: 0, redo: 0, maids: {}, zones: {}, types: {}, items: {}, by: {} };
  list.filter(x => x.kind !== '퀵').forEach(x => {
    s.rooms++; s.n += x.n || 0; s[x.grade] = (s[x.grade] || 0) + 1; if (x.close === '재정비') s.redo++;
    const m = x.maid || '(모름)', M = s.maids[m] = s.maids[m] || { c: 0, n: 0, A: 0, B: 0, C: 0, redo: 0 };
    M.c++; M.n += x.n || 0; M[x.grade]++; if (x.close === '재정비') M.redo++;
    if (x.by) s.by[x.by] = (s.by[x.by] || 0) + 1;
    Object.keys(x.items || {}).forEach(k => {
      const v = Number(x.items[k]) || 0, [z, , t] = k.split('|'), tk = TYPE_KEY[t] || t;
      s.items[k] = (s.items[k] || 0) + v; s.zones[z] = (s.zones[z] || 0) + v; s.types[tk] = (s.types[tk] || 0) + v;
    });
  });
  s.quick = Object.assign({}, I.quick);
  return s;
}
function saveSum() {
  if (!Array.isArray(I.list)) return Promise.resolve();
  const s = daySum(I.list); s.at = H.S.SERVER_TIME; s.who = H.admin() ? H.admin().label : '';
  return H.S.set('insp_sum/' + I.d, s).catch(e => console.warn('인스펙션 요약 저장', e));
}

// ---------- 그리기
function draw() {
  const box = document.getElementById('ipin'); if (!box || !I) return;
  const sc = document.getElementById('ipp'), y = sc ? sc.scrollTop : 0;
  box.innerHTML = I.view === 'form' ? formHtml() : I.view === 'done' ? doneHtml() : listHtml();
  if (sc) sc.scrollTop = I.keepScroll === false ? 0 : y;
  I.keepScroll = true;
  if (I.view === 'done' && I.done) { try { if (!I.done.cv) I.done.cv = cardCanvas(I.done.doc); const im = document.getElementById('ipimg'); if (im) im.src = I.done.cv.toDataURL('image/png'); } catch (e) { console.warn(e); } }
  if (I.focus) { const el = document.getElementById(I.focus); I.focus = null; if (el) el.focus(); }
}
function go(view) { I.view = view; I.keepScroll = false; draw(); }

function listHtml() {
  const E = H.esc, d = I.d, today = H.ymd();
  let h = '<div class="ip-date"><button class="vp-x" data-ia="day" data-v="-1" aria-label="전날">‹</button><b>' + Number(d.slice(5, 7)) + '월 ' + Number(d.slice(8)) + '일 (' + wd(d) + ')' + (d === today ? ' · 오늘' : '') + '</b>' +
    '<button class="vp-x" data-ia="day" data-v="1" aria-label="다음날"' + (d >= today ? ' disabled' : '') + '>›</button></div>';
  h += '<button class="big-btn" data-ia="new" style="margin:0 0 14px">＋ 객실 점검하기</button>';
  if (I.err) h += '<p class="err">' + E(I.err) + ' <button class="ref" data-ia="reload">다시 읽기</button></p>';
  if (I.busy && !I.list) return h + '<div class="card"><p class="note" style="margin:0">읽는 중…</p></div>';
  const L = (I.list || []).filter(x => x.kind !== '퀵');
  // 요약
  const s = daySum(I.list || []), avg = s.rooms ? (s.n / s.rooms).toFixed(1) : '-';
  h += '<div class="card"><h2>오늘 점검 <small>' + (I.busy ? '읽는 중…' : '') + '</small></h2><div class="kv ip-kv"><div><b>' + s.rooms + '</b><span>점검 실</span></div><div><b>' + s.n + '</b><span>지적 건</span></div><div><b>' + avg + '</b><span>평균 지적</span></div></div>' +
    '<div class="ip-gr">' + ['A', 'B', 'C'].map(g => '<span style="color:' + GCOL[g] + '">' + g + ' <b>' + (s[g] || 0) + '</b></span>').join('') + '<span>재정비 <b>' + s.redo + '</b></span></div>' +
    (Object.keys(s.by).length ? '<p class="note" style="margin:6px 0 0">점검자: ' + Object.keys(s.by).map(k => E(k) + ' ' + s.by[k]).join(' · ') + '</p>' : '') + '</div>';
  // 목록 (재정비 대기 위)
  const rows = L.slice().sort((a, b) => (STATE_ORDER[a.state] ?? 9) - (STATE_ORDER[b.state] ?? 9) || (b.clientAt || b.at || 0) - (a.clientAt || a.at || 0));
  h += '<div class="card"><h2>점검 목록 <small>' + L.length + '실</small></h2>';
  if (!rows.length) h += '<p class="note" style="margin:0">아직 점검한 객실이 없어요. 위 ‘객실 점검하기’를 눌러 시작해요.</p>';
  h += rows.map(x => {
    const wait = x.state === '재정비 대기';
    return '<div class="ip-row' + (wait ? ' wait' : '') + '"><button class="ip-rowb" data-ia="edit" data-v="' + E(x.id) + '"><span class="ip-room">' + E(x.room) + '</span>' +
      '<span class="ip-g" style="background:' + GCOL[x.grade] + '">' + E(x.grade) + '</span>' +
      '<span class="ip-rt"><b>' + (x.n ? '지적 ' + x.n + '건' : '이상 없음') + '</b><small>' + E(x.maid || '정비자 모름') + ' · ' + E(x.by || '') + ' · ' + hm(x.clientAt || x.at) + '</small></span>' +
      '<span class="ip-st ' + (wait ? 'w' : '') + '">' + E(x.close === '재정비' ? (wait ? '재정비 대기' : '재정비 끝') : x.n ? '수정완료' : '') + '</span></button>' +
      (wait ? '<button class="ip-fix" data-ia="fixed" data-v="' + E(x.id) + '">재정비 끝</button>' : '') + '</div>';
  }).join('') + '</div>';
  // 퀵점검
  const names = CHECKERS.concat(Object.keys(I.quick).filter(n => CHECKERS.indexOf(n) < 0));
  const qt = names.reduce((t, n) => t + (Number(I.quick[n]) || 0), 0);
  h += '<div class="card"><h2>⚡ 퀵점검 <small>점검자별 오늘 실 수 · 합계 ' + qt + '실</small></h2>' +
    names.map(n => '<div class="ip-q"><b>' + E(n) + '</b><div class="asg-u"><button data-ia="q" data-v="' + E(n) + '" data-d="-1" aria-label="빼기">−</button>' +
      '<input type="number" inputmode="numeric" min="0" max="200" data-iq="' + E(n) + '" value="' + (Number(I.quick[n]) || 0) + '"><button data-ia="q" data-v="' + E(n) + '" data-d="1" aria-label="더하기">＋</button></div></div>').join('') +
    '<button class="ref" data-ia="qadd" style="margin-top:8px">＋ 다른 점검자</button>' +
    (I.qmsg ? '<p class="note">' + E(I.qmsg) + '</p>' : '') + '</div>';
  h += '<p class="note">1단계: 사진은 지금처럼 카톡방에 같이 올려 주세요(2단계에서 앱에 붙여요). 재정비 요청은 아직 메이드 휴대폰에 안 가요 — 메이드가 마무리하면 목록에서 ‘재정비 끝’을 눌러 주세요.</p>';
  return h;
}

function newForm(x) {
  const by = lsGet('insp_by') || CHECKERS[0];
  if (x) return { id: x.id, room: x.room, maid: x.maid || '', maidHow: x.maidHow || '', maidMore: [], maidHand: true, by: x.by || by, items: Object.assign({}, x.items || {}), etc: Object.assign({}, x.etc || {}), zone: ZONES[0].z, orig: x };
  return { id: '', room: '', maid: '', maidHow: '', maidMore: [], maidHand: false, by, items: {}, etc: {}, zone: ZONES[0].z, orig: null };
}
function formHtml() {
  const E = H.esc, f = I.form, n = sumItems(f.items), g = gradeOf(n);
  const byList = CHECKERS.concat(f.by && CHECKERS.indexOf(f.by) < 0 ? [f.by] : []);
  let h = '<div class="card ip-top">' +
    '<div class="ip-f"><label for="iproom">객실</label><input id="iproom" class="ip-roomin" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="예: 1507" value="' + E(f.room) + '"' + (f.id ? ' disabled' : '') + '></div>' +
    '<div class="ip-f"><label>점검자</label><div class="ip-seg">' + byList.map(b => '<button data-ia="by" data-v="' + E(b) + '" aria-pressed="' + (f.by === b) + '">' + E(b) + '</button>').join('') + '<button data-ia="byadd" aria-label="다른 점검자">＋</button></div></div>' +
    '<div class="ip-f"><label for="ipmaid">정비자</label><input id="ipmaid" list="ipmaids" autocomplete="off" placeholder="' + (f.maidBusy ? '찾는 중…' : '객실 번호를 넣으면 자동') + '" value="' + E(f.maid) + '">' +
    '<datalist id="ipmaids">' + Object.keys(I.plans).sort().map(m => '<option value="' + E(m) + '">').join('') + '</datalist></div>' +
    (f.maidHow ? '<p class="note" style="margin:2px 0 0 76px">' + E(f.maidHow) + (f.maidMore && f.maidMore.length ? ' · 같은 날 ' + E(f.maidMore.join(', ')) : '') + '</p>' : '') +
    (f.dup ? '<p class="note" style="margin:6px 0 0;color:var(--wait);font-weight:700">' + E(f.dup) + '</p>' : '') + '</div>';
  // 구역 탭
  h += '<div class="ip-tabs">' + ZONES.map(Z => { const c = zoneN(f.items, Z.z); return '<button data-ia="zone" data-v="' + Z.z + '" aria-pressed="' + (f.zone === Z.z) + '">' + Z.z + (c ? '<i>' + c + '</i>' : '') + '</button>'; }).join('') + '</div>';
  const Z = ZONES.filter(z => z.z === f.zone)[0];
  h += '<div class="card ip-parts">' + Z.parts.map(([p, ts]) => '<div class="ip-part"><b>' + E(p) + '</b><div class="ip-chips">' + ts.map(t => chip(keyOf(Z.z, p, t), t)).join('') + '</div></div>').join('') +
    '<div class="ip-part"><b>' + ETC + '</b><div class="ip-chips">' + chip(keyOf(Z.z, ETC, ETC), ETC) + '<input class="ip-memo" data-ie="' + Z.z + '" placeholder="한 줄 메모 (기타 내용)" value="' + E(f.etc[Z.z] || '') + '"></div></div></div>';
  // 고른 것
  const picked = Object.keys(f.items).filter(k => f.items[k] > 0);
  if (picked.length) h += '<div class="card"><h2>지적 내용 <small>누르면 1건 빼요</small></h2><div class="ip-chips">' + picked.map(k => { const [z, p, t] = k.split('|'); return '<button class="ip-pk" data-ia="sub" data-k="' + E(k) + '">' + E(z + ' · ' + (p === ETC ? '기타' : p + ' ' + t)) + (f.items[k] > 1 ? ' ×' + f.items[k] : '') + ' <span>−</span></button>'; }).join('') + '</div></div>';
  // 아래 고정 줄
  h += '<div class="ip-bar"><div class="ip-sum"><span class="ip-g big" style="background:' + GCOL[g] + '">' + g + '</span><div><b>' + (n ? '지적 ' + n + '건' : '지적 없음') + '</b><small>' + (100 - n * GRADE.minus) + '점 · ' + (n <= GRADE.A ? '2건 이하 A' : n <= GRADE.B ? '4건 이하 B' : '5건 이상 C') + '</small></div></div>' +
    (f.saving ? '<button class="big-btn" disabled>저장 중…</button>' :
      n ? '<div class="btn2" style="margin-top:8px"><button class="big-btn ok" data-ia="save" data-v="수정완료">✅ 수정완료<small>점검자가 직접 보완</small></button><button class="big-btn danger" data-ia="save" data-v="재정비">🔧 재정비 요청<small>메이드가 마무리</small></button></div>'
        : '<button class="big-btn ok" data-ia="save" data-v="" style="margin-top:8px">✨ 이상 없음으로 저장</button>') +
    '<div class="ip-bar2"><button class="ref" data-ia="back">← 목록</button>' + (f.id ? '<button class="ref" data-ia="del" style="color:var(--warn)">이 점검 지우기</button>' : '') + '</div></div>';
  return h;
}
function chip(k, label) {
  const c = Number(I.form.items[k]) || 0;
  return '<button class="ip-chip' + (c ? ' on' : '') + '" data-ia="add" data-k="' + H.esc(k) + '">' + H.esc(label) + (c ? '<i>' + c + '</i>' : '') + '</button>';
}

function doneHtml() {
  const E = H.esc, x = I.done.doc;
  const msg = x.close === '재정비' ? '🔧 재정비 요청으로 저장했어요' : x.n ? '✅ 수정완료로 저장했어요' : '✨ 이상 없음으로 저장했어요';
  return '<p class="okbox">' + msg + (I.done.slow ? '<br><small style="font-weight:600">인터넷이 느려요 — 휴대폰에 먼저 저장했고, 연결되면 자동으로 올라가요.</small>' : '') + '</p>' +
    '<div class="card"><h2>카톡 공유 이미지 <small>관리자방에 사진과 같이</small></h2><img id="ipimg" alt="점검 결과 이미지" style="width:100%;max-width:360px;display:block;margin:0 auto;border-radius:12px;border:1px solid var(--line)">' +
    '<div class="ip-imgb"><button class="big-btn" data-ia="img" data-v="copy">이미지 복사</button><button class="big-btn sec" data-ia="img" data-v="save">저장</button>' + (canShareFiles() ? '<button class="big-btn sec" data-ia="img" data-v="share">공유</button>' : '') + '</div>' +
    '<button class="ref" data-ia="txt" style="margin-top:8px">글로 복사</button><p class="note" id="ipimgmsg">' + E(I.msg || '') + '</p></div>' +
    '<div class="btn2"><button class="big-btn sec" data-ia="back">목록</button><button class="big-btn" data-ia="new">＋ 다음 객실 점검</button></div>';
}

// ---------- 공유 이미지 (정비 지원 더티 카드와 같은 방식: 캔버스 → 복사·저장·공유)
function lines(x) {
  const out = [];
  ZONES.map(z => z.z).forEach(z => {
    const ks = Object.keys(x.items || {}).filter(k => k.split('|')[0] === z && x.items[k] > 0);
    if (!ks.length && !(x.etc && x.etc[z])) return;
    out.push({ z, t: ks.map(k => { const [, p, t] = k.split('|'); return (p === ETC ? '기타' + (x.etc && x.etc[z] ? '(' + x.etc[z] + ')' : '') : p + ' ' + t) + (x.items[k] > 1 ? ' ×' + x.items[k] : ''); }) });
  });
  return out;
}
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function cardCanvas(x) {
  const S = 2, W = 360, P = 16, FF = "'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif";
  const font = (c, sz, w) => { c.font = w + ' ' + sz + 'px ' + FF; };
  const m0 = document.createElement('canvas').getContext('2d'); font(m0, 15, 600);
  const wrap = (items, maxW) => { const o = []; let cur = ''; items.forEach(s => { const t = cur ? cur + ' · ' + s : s; if (cur && m0.measureText(t).width > maxW) { o.push(cur); cur = s; } else cur = t; }); if (cur) o.push(cur); return o; };
  const L = lines(x).map(l => ({ z: l.z, w: wrap(l.t, W - 2 * P - 64) }));
  const top = 128, bodyH = L.length ? L.reduce((s, l) => s + l.w.length * 22 + 10, 0) + 34 : 46;
  const Hh = top + bodyH + 64;
  const cv = document.createElement('canvas'); cv.width = W * S; cv.height = Hh * S;
  const c = cv.getContext('2d'); c.scale(S, S); c.textBaseline = 'alphabetic';
  c.fillStyle = '#fff'; c.fillRect(0, 0, W, Hh);
  c.fillStyle = '#10233F'; c.fillRect(0, 0, W, 112); c.fillStyle = '#C9A961'; c.fillRect(0, 112, W, 4);
  const d = x.date;
  font(c, 13, 700); c.fillStyle = '#C9A961'; c.fillText('한화리조트 해운대 · 객실 인스펙션', P + 2, 26);
  font(c, 30, 800); c.fillStyle = '#fff'; c.fillText(x.room + '호', P + 2, 64);
  font(c, 14, 600); c.fillStyle = '#C9D3E3';
  c.fillText(Number(d.slice(5, 7)) + '/' + Number(d.slice(8)) + ' (' + wd(d) + ') ' + hm(x.clientAt || Date.now()) + ' · 점검 ' + (x.by || ''), P + 2, 86);
  c.fillText('정비 ' + (x.maid || '-'), P + 2, 104);
  // 등급 동그라미
  c.fillStyle = GCOL[x.grade]; c.beginPath(); c.arc(W - P - 30, 52, 30, 0, Math.PI * 2); c.fill();
  c.textAlign = 'center'; font(c, 30, 800); c.fillStyle = '#fff'; c.fillText(x.grade, W - P - 30, 63);
  font(c, 12, 700); c.fillStyle = '#C9D3E3'; c.fillText(x.n ? '지적 ' + x.n + '건' : '이상 없음', W - P - 30, 100);
  c.textAlign = 'left';
  let y = top + 20;
  if (!L.length) { font(c, 17, 800); c.fillStyle = '#1E8E3E'; c.fillText('✨ 지적 사항 없음', P, y + 6); y += 26; }
  else {
    font(c, 16, 800); c.fillStyle = '#10233F'; c.fillText('지적 사항 ' + x.n + '건', P, y); y += 14;
    L.forEach(l => {
      y += 12;
      c.fillStyle = '#EEF2F8'; rr(c, P, y - 4, 50, 24, 6); c.fill();
      c.textAlign = 'center'; font(c, 13, 800); c.fillStyle = '#24406B'; c.fillText(l.z, P + 25, y + 13); c.textAlign = 'left';
      font(c, 15, 600); c.fillStyle = '#14213D';
      l.w.forEach((t, i) => c.fillText(t, P + 62, y + 13 + i * 22));
      y += l.w.length * 22 - 2;
    });
    y += 10;
  }
  // 마무리 줄
  const redo = x.close === '재정비', col = redo ? '#B42318' : '#1E8E3E';
  y += 6; c.fillStyle = redo ? '#FDEDEF' : '#E8F5EC'; rr(c, P, y, W - 2 * P, 40, 10); c.fill();
  font(c, 15, 800); c.fillStyle = col;
  c.fillText(redo ? '🔧 재정비 요청 — ' + (x.maid || '정비자') + ' 님 마무리 부탁드려요' : x.n ? '✅ 점검자 수정 완료' : '✅ 점검 완료', P + 12, y + 26);
  return cv;
}
function shareText(x) {
  const L = lines(x);
  return '[' + x.room + '호] ' + x.grade + '등급 · ' + (x.n ? '지적 ' + x.n + '건' : '이상 없음') + '\n정비 ' + (x.maid || '-') + ' / 점검 ' + (x.by || '') + ' ' + hm(x.clientAt || Date.now()) +
    (L.length ? '\n' + L.map(l => '- ' + l.z + ': ' + l.t.join(', ')).join('\n') : '') +
    '\n' + (x.close === '재정비' ? '🔧 재정비 요청' : x.n ? '✅ 수정완료' : '✅ 이상 없음');
}
function canShareFiles() { try { return !!(navigator.canShare && navigator.canShare({ files: [new File([new Blob(['x'])], 'x.png', { type: 'image/png' })] })); } catch (e) { return false; } }
function say(t) { I.msg = t; const e = document.getElementById('ipimgmsg'); if (e) e.textContent = t; }
function imgAct(kind) {
  const cv = I.done && I.done.cv; if (!cv) return;
  const name = 'insp_' + I.done.doc.date.slice(5).replace('-', '') + '_' + I.done.doc.room + '.png';
  cv.toBlob(b => {
    if (!b) { say('이미지를 만들지 못했어요.'); return; }
    if (kind === 'copy') {
      if (!(navigator.clipboard && window.ClipboardItem)) { say('이 브라우저는 이미지 복사가 안 돼요. 저장이나 공유를 써 주세요.'); return; }
      navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(() => say('이미지를 복사했어요 ✓ 카톡 창에 붙여넣기 하세요.'), () => say('복사가 막혔어요. 저장이나 공유를 써 주세요.'));
    } else if (kind === 'save') {
      const u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000);
      say('이미지를 저장했어요 ✓ (' + name + ')');
    } else {
      const f = new File([b], name, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f], title: I.done.doc.room + '호 인스펙션' }).then(() => say('공유했어요 ✓'), () => {});
      else say('이 기기는 바로 공유가 안 돼요. 저장한 뒤 카톡에서 사진으로 보내 주세요.');
    }
  }, 'image/png');
}

// ---------- 저장
async function save(close) {
  const f = I.form, n = sumItems(f.items), adm = H.admin(), usr = H.user();
  if (!roomOk(f.room)) { alert('객실 번호 4자리를 확인해 주세요.'); I.focus = 'iproom'; draw(); return; }
  if (!adm || !usr) { alert('관리자 로그인이 풀렸어요. 닫고 다시 로그인해 주세요.'); return; }
  if (!f.maid && !confirm('정비자를 모르는 채로 저장할까요?\n(메이드별 누계에서 빠져요)')) { I.focus = 'ipmaid'; draw(); return; }
  if (close === '재정비' && !f.maid) { alert('재정비 요청은 정비자가 있어야 해요.'); I.focus = 'ipmaid'; draw(); return; }
  const items = {}; Object.keys(f.items).forEach(k => { if (f.items[k] > 0) items[k] = f.items[k]; });
  const etc = {}; Object.keys(f.etc).forEach(z => { const t = String(f.etc[z] || '').trim().slice(0, 120); if (t) etc[z] = t; });
  const o = f.orig, now = Date.now();
  const id = f.id || (I.d + '_' + f.room + '_' + now.toString(36));
  const g = gradeOf(n);
  const doc = { date: I.d, room: f.room, kind: '일반', by: f.by, maid: String(f.maid || '').trim(), maidHow: f.maidHand ? '직접' : f.maidHow, items, etc, n, grade: g, score: 100 - n * GRADE.minus,
    close: n ? close : '', state: n && close === '재정비' ? '재정비 대기' : '완료', photos: (o && o.photos) || [],
    at: o ? new Date(o.at || now) : H.S.SERVER_TIME, clientAt: o ? new Date(o.clientAt || now) : new Date(now), upAt: H.S.SERVER_TIME, who: adm.label, uid: usr.uid };
  if (o && o.state === '확인' && doc.close === '재정비') { doc.state = '확인'; doc.fixAt = o.fixAt ? new Date(o.fixAt) : null; doc.fixBy = o.fixBy || ''; }
  f.saving = true; draw();
  lsSet('insp_by', f.by);
  const r = await withTimeout(H.S.set('insp/' + id, doc), 15000).catch(e => 'err:' + (e && (e.code || e.message) || e));
  if (String(r).indexOf('err:') === 0) { f.saving = false; draw(); alert('저장하지 못했어요: ' + String(r).slice(4) + '\n인터넷을 확인하고 다시 눌러 주세요.'); return; }
  const local = Object.assign({}, doc, { id, at: o ? o.at || now : now, clientAt: o ? o.clientAt || now : now });
  I.list = (I.list || []).filter(x => x.id !== id).concat([local]);
  saveSum();
  I.done = { doc: local, cv: null, slow: r === 'slow' }; I.msg = ''; I.form = null;
  go('done');
}
async function delInsp() {
  const f = I.form; if (!f || !f.id || !confirm(f.room + '호 점검 기록을 지울까요?')) return;
  try { await H.S.del('insp/' + f.id); } catch (e) { alert('지우지 못했어요: ' + (e && (e.code || e.message) || e)); return; }
  I.list = (I.list || []).filter(x => x.id !== f.id); saveSum(); I.form = null; go('list');
}
async function fixed(id) {
  const x = (I.list || []).filter(y => y.id === id)[0]; if (!x) return;
  if (!confirm(x.room + '호 재정비가 끝났나요?')) return;
  const adm = H.admin(), doc = Object.assign({}, x, { state: '확인', fixAt: new Date(), fixBy: adm ? adm.label : '', at: new Date(x.at || Date.now()), clientAt: new Date(x.clientAt || Date.now()), upAt: H.S.SERVER_TIME });
  delete doc.id;
  const r = await withTimeout(H.S.set('insp/' + id, doc), 15000).catch(e => 'err:' + (e && (e.code || e.message) || e));
  if (String(r).indexOf('err:') === 0) { alert('저장하지 못했어요: ' + String(r).slice(4)); return; }
  Object.assign(x, { state: '확인', fixAt: Date.now(), fixBy: doc.fixBy }); saveSum(); draw();
}
// 퀵점검: 누를 때마다 화면 먼저, 1초 뒤 한 번에 저장
let qTimer = null;
function qSave() {
  clearTimeout(qTimer); I.qmsg = '저장 대기…';
  const d = I.d;
  qTimer = setTimeout(() => {
    if (!I || I.d !== d) return;
    const c = {}; Object.keys(I.quick).forEach(n => { const v = Math.max(0, Math.min(500, Number(I.quick[n]) || 0)); if (v) c[n] = v; });
    H.S.set('insp_quick/' + d, { date: d, c, at: H.S.SERVER_TIME, who: H.admin() ? H.admin().label : '' })
      .then(() => { if (I) { I.qmsg = '저장했어요 ✓'; const ae = document.activeElement; if (!(ae && ae.hasAttribute && ae.hasAttribute('data-iq'))) draw(); } saveSum(); }, e => { if (I) { I.qmsg = '저장 못 했어요: ' + (e && (e.code || e.message) || e); draw(); } });
  }, 1000);
}

// ---------- 누르기 · 적기
function onClick(e) {
  const t = e.target.closest('[data-ia]'); if (!t || !I) return;
  const a = t.getAttribute('data-ia'), v = t.getAttribute('data-v');
  if (a === 'close') { if (I.view === 'form' && I.form && sumItems(I.form.items) && !confirm('저장하지 않은 점검이 있어요. 닫을까요?')) return; close(); H.onClose && H.onClose(); return; }
  if (a === 'reload') { load(); return; }
  if (a === 'day') { if (I.d >= H.ymd() && v === '1') return; I.d = H.addDays(I.d, Number(v)); I.list = null; load(); return; }
  if (a === 'new') { if (!Array.isArray(I.list)) { alert('목록을 아직 못 읽었어요. 다시 읽기를 눌러 주세요.'); return; } I.form = newForm(null); I.focus = 'iproom'; go('form'); return; }
  if (a === 'edit') { const x = (I.list || []).filter(y => y.id === v)[0]; if (!x) return; I.form = newForm(x); go('form'); return; }
  if (a === 'back') { if (I.view === 'form' && I.form && !I.form.id && sumItems(I.form.items) && !confirm('저장하지 않은 점검이 있어요. 목록으로 갈까요?')) return; I.form = null; go('list'); return; }
  if (a === 'fixed') { fixed(v); return; }
  if (a === 'q' || a === 'qadd') {
    let nm = v;
    if (a === 'qadd') { nm = (prompt('점검자 이름') || '').trim(); if (!nm) return; I.quick[nm] = I.quick[nm] || 0; qSave(); draw(); return; }
    I.quick[nm] = Math.max(0, (Number(I.quick[nm]) || 0) + Number(t.getAttribute('data-d'))); qSave(); draw(); return;
  }
  const f = I.form;
  if (a === 'img') { imgAct(v); return; }
  if (a === 'txt') { const s = shareText(I.done.doc); if (navigator.clipboard) navigator.clipboard.writeText(s).then(() => say('글을 복사했어요 ✓'), () => say('복사가 막혔어요.')); return; }
  if (!f) return;
  if (a === 'zone') { f.zone = v; draw(); return; }
  if (a === 'by') { f.by = v; draw(); return; }
  if (a === 'byadd') { const nm = (prompt('점검자 이름') || '').trim(); if (nm) { f.by = nm; draw(); } return; }
  if (a === 'add') { const k = t.getAttribute('data-k'); f.items[k] = (Number(f.items[k]) || 0) + 1; if (navigator.vibrate) try { navigator.vibrate(15); } catch (x) {} draw(); return; }
  if (a === 'sub') { const k = t.getAttribute('data-k'); f.items[k] = Math.max(0, (Number(f.items[k]) || 0) - 1); if (!f.items[k]) delete f.items[k]; draw(); return; }
  if (a === 'save') { save(v); return; }
  if (a === 'del') { delInsp(); return; }
}
function onInput(e) {
  const el = e.target; if (!I) return;
  if (el.hasAttribute('data-iq')) { if (e.type !== 'change') return; I.quick[el.getAttribute('data-iq')] = Math.max(0, Number(el.value) || 0); qSave(); draw(); return; }
  const f = I.form; if (!f) return;
  if (el.id === 'iproom') {
    const r = el.value.replace(/\D/g, '').slice(0, 4); if (r !== el.value) el.value = r;
    if (r === f.room) return;
    f.room = r; f.dup = '';
    if (r.length === 4) {
      if (!roomOk(r)) { f.dup = '없는 객실 번호예요 (4~31층)'; draw(); return; }
      const prev = (I.list || []).filter(x => x.room === r && x.kind !== '퀵');
      if (prev.length) f.dup = '오늘 이미 ' + prev.length + '번 점검한 객실이에요 (' + prev.map(x => hm(x.clientAt || x.at) + ' ' + x.grade).join(', ') + ') — 새로 한 건 더 남겨요';
      if (!f.maidHand) { f.maid = ''; f.maidHow = ''; }
      el.blur(); findMaid(r);
    }
    return;
  }
  if (el.id === 'ipmaid') { f.maid = el.value; f.maidHand = true; f.maidHow = el.value ? '직접' : ''; return; }
  if (el.hasAttribute('data-ie')) { f.etc[el.getAttribute('data-ie')] = el.value; return; }
}

// 시험용
export const _t = { daySum: l => { const s = I; I = I || { d: 'x', quick: {} }; const r = daySum(l); I = s; return r; }, shareText, gradeOf, state: () => I };
