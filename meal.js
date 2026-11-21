// 🍚 주간 식단 (2026-11-21) — 직원 식당 주간 식단표 사진을 올리면 AI(Gemini, 인스펙션과 같은 Firebase AI Logic)가 표로 읽음
//   → 확인 · 고치기 화면 → 저장 (meta/meals 한 문서 · 규칙 변경 없음: meta 는 로그인한 누구나 읽고 관리자만 씀)
//   허브 첫 화면 '🍚 오늘 식단'(조·중·석식) · '#meal' 주간 식단표(A4 인쇄 · PDF 저장) · 정비 레포트 메이드 화면 '오늘 점심'(rm/app/app.js)
// 저장 모양: meta/meals = { days: { 'YYYY-MM-DD': { b: [...], l: [...], d: [...] } }, notes: [...], wk: { from, to, by }, at, uid }
//   메뉴 한 줄 = '쇠고기미역국 (쇠고기:국산,한우)' — 괄호 안 = 원산지 (화면에선 작은 글씨)
//   지난 날은 21일 지나면 지움 (문서가 커지지 않게, 메이드 휴대폰이 이 문서를 구독함)
// 시험: window.__fakeAI = async (base64, prompt) => ({ days: [...], notes: [...] })
const FB = 'https://www.gstatic.com/firebasejs/12.19.0/';
const MODELS = ['gemini-3.5-flash', 'gemini-2.5-flash'];
const SITE_KEY = '6LfI2yAuAAAAAEj0vYWJZS1XP7bhatqp7XudI08E';   // 인스펙션 AI 와 같은 App Check 키 (meta/insp_ai.siteKey 가 있으면 그걸 씀)
const HEIC_LIB = 'https://cdn.jsdelivr.net/npm/heic-to@1.6.7/dist/heic-to.js';
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
export const MEALS = [['b', '조식'], ['l', '중식'], ['d', '석식']];
const KEEP_DAYS = 21;

export function prompt(today) {
  return `직원 식당의 주간 식단표 사진입니다. 표를 빠짐없이 그대로 옮겨 적어 주세요. 오늘은 ${today} 입니다 (연도는 여기서 정하세요).

규칙:
- 날짜 칸마다 하나씩 days 에 넣기. date 는 YYYY-MM-DD.
- b = 조식, l = 중식, d = 석식. 칸 안의 메뉴를 위에서 아래 차례로 한 줄씩.
- 메뉴 바로 아래 괄호 줄(원산지 표시, 예: "(쇠고기:국산,한우)")은 따로 줄로 만들지 말고 바로 위 메뉴 뒤에 붙이기: "쇠고기미역국 (쇠고기:국산,한우)". 괄호가 두 줄에 걸치면 한 괄호로 합치기.
- 칸 아래쪽 띠나 빈 줄 뒤에 따로 적힌 것(예: "식빵+두유", "사과", "요구르트", "음료", "새우젓,다데기")도 그 끼니의 마지막 메뉴로 넣기. 색 띠 줄은 바로 위 끼니(조식) 것입니다.
- 글자는 사진에 보이는 그대로. 맞춤법을 고치거나 메뉴를 지어내지 말기. 안 보이면 빼기.
- 표 아래 안내 문구(원산지 · "변경될 수 있습니다" 등)는 notes 에 한 줄씩. 영양사 이름 · 인쇄 정보 · 파일 경로는 넣지 않기.

JSON 하나만 답하세요:
{"days":[{"date":"2026-11-16","b":["쇠고기미역국 (쇠고기:국산,한우)","계란후라이","식빵+두유"],"l":["돼지국밥 (돼지고기:미국산)"],"d":["시락국"]}],"notes":["상기 식단은 물품 사정에 따라 변경될 수 있습니다."]}`;
}

// ---------- 메뉴 한 줄 나누기: '이름 (원산지)'
export function split(s) {
  s = String(s || '').trim();
  const m = s.match(/^(.*?)\s*\((.*)\)\s*$/);
  return m && m[1] ? { n: m[1].trim(), o: m[2].trim() } : { n: s, o: '' };
}
const isDate = d => /^20\d{2}-\d{2}-\d{2}$/.test(String(d || ''));
const lines = v => (Array.isArray(v) ? v : String(v || '').split('\n')).map(x => String(x || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 20).map(x => x.slice(0, 80));
// AI 답 → 깨끗한 모양 (날짜 틀린 칸은 버림, 같은 날짜 두 번이면 뒤엣것)
export function clean(j) {
  j = j && typeof j === 'object' ? j : {};
  const days = {};
  (Array.isArray(j.days) ? j.days : []).forEach(x => {
    if (!x || !isDate(x.date)) return;
    days[x.date] = { b: lines(x.b), l: lines(x.l), d: lines(x.d) };
  });
  return { days, notes: lines(j.notes).slice(0, 8) };
}
export function dowOf(d) { return DOW[new Date(d + 'T12:00:00+09:00').getUTCDay()]; }

// ---------- AI
let modelP = null;
async function getModel(cfg, name) {
  const [A, AI, AC] = await Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-ai.js'), import(FB + 'firebase-app-check.js')]);
  const app = A.getApp();
  const key = cfg.siteKey || SITE_KEY;
  if (key && !window.__inspAppCheck) {
    const P = cfg.acType === 'v3' ? AC.ReCaptchaV3Provider : AC.ReCaptchaEnterpriseProvider;
    try { AC.initializeAppCheck(app, { provider: new P(key), isTokenAutoRefreshEnabled: true }); } catch (e) { console.warn('App Check', e); }
    window.__inspAppCheck = 1;
  }
  const ai = AI.getAI(app, { backend: cfg.backend === 'dev' ? new AI.GoogleAIBackend() : new AI.VertexAIBackend(cfg.location || 'global') });
  return AI.getGenerativeModel(ai, { model: name, generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } });
}
async function callAI(cfg, b64, text) {
  const names = cfg.model ? [cfg.model] : MODELS;
  let err = null;
  for (const n of names) {
    try {
      if (!modelP || modelP.name !== n) modelP = { name: n, m: getModel(cfg, n) };
      const m = await modelP.m;
      const r = await m.generateContent([text, { inlineData: { data: b64, mimeType: 'image/jpeg' } }]);
      return r.response.text();
    } catch (e) { err = e; modelP = null; if (!/not found|404|unsupported|is not supported|requires the Firebase AI API/i.test(String(e && e.message))) break; }
  }
  throw err;
}
// ---------- 사진 읽기 (갤럭시 HEIC 도 — 인스펙션과 같은 방법)
async function looksHeic(file) {
  if (/\.(heic|heif)$/i.test(file.name || '') || /hei[cf]/i.test(file.type || '')) return true;
  try { const b = new Uint8Array(await file.slice(4, 12).arrayBuffer()), t = String.fromCharCode.apply(null, b); return /^ftyp(heic|heix|hevc|heim|heis|hevm|hevs|mif1|msf1)/.test(t); } catch (e) { return false; }
}
const imgOf = file => new Promise((res, rej) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('x')); }; im.src = u; });
async function decode(file) {
  if (!file || !file.size) throw new Error('사진 파일이 비어 있어요');
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) {}
  try { return await imgOf(file); } catch (e) {}
  if (await looksHeic(file)) {
    try { const L = window.__heicLib || await import(HEIC_LIB); return await L.heicTo({ blob: file, type: 'bitmap' }); }
    catch (e) { throw new Error('HEIC(고효율 사진)을 바꾸지 못했어요 — 카메라 설정에서 \'고효율 사진\'을 꺼 주세요'); }
  }
  throw new Error('사진을 못 읽었어요');
}
// 글자가 작아서 긴 쪽 2048px 로 보냄 (인스펙션은 1280)
async function toJpeg(file, edge) {
  const bmp = await decode(file);
  const s = Math.min(1, edge / Math.max(bmp.width, bmp.height)), cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  if (bmp.close) try { bmp.close(); } catch (e) {}
  return cv.toDataURL('image/jpeg', 0.85);
}

// ---------- 화면
export function setupMeal(c) {
  const { S, esc, ymd, addDays, md } = c;
  let doc = undefined, at = 0, busy = false, err = '';
  let up = null;   // { pic, reading, err, days:{date:{b,l,d 글자}}, notes, saving }
  let wkFrom = '';  // 주간 표에서 보는 주의 월요일
  const mon = d => addDays(d, -((new Date(d + 'T12:00:00+09:00').getUTCDay() + 6) % 7));
  async function load(force) {
    if (busy || (!force && at && Date.now() - at < 600000)) return;
    busy = true;
    try { doc = (await S.get('meta/meals')) || null; err = ''; } catch (e) { err = String(e && (e.code || e.message) || e); if (doc === undefined) doc = null; }
    busy = false; at = Date.now(); c.draw();
  }
  const dayOf = d => (doc && doc.days && doc.days[d]) || null;
  const nowMeal = () => { const h = Number(new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 13)); return h < 10 ? 'b' : h < 14 ? 'l' : 'd'; };
  const itemHtml = s => { const x = split(s); return '<li><b>' + esc(x.n) + '</b>' + (x.o ? '<small>' + esc(x.o) + '</small>' : '') + '</li>'; };

  // 11/21 사용자: 첫 화면 카드는 자리를 많이 차지 → 위쪽 남색 띠의 작은 '🍚 오늘 식단' 버튼, 누르면 창
  function btnHtml() { if (doc === undefined) load(false); return '<button class="ml-top" data-ml="open">🍚 오늘 식단</button>'; }
  function dlgBody() {
    const d = ymd(), t = dayOf(d), lab = md(d) + ' (' + dowOf(d) + ')';
    let h = '<div class="ml-dh"><h2>🍚 오늘 식단 <small>' + lab + '</small></h2><button class="ref" data-ml="close" aria-label="닫기">✕</button></div>';
    if (doc === undefined) return h + '<p class="note">읽는 중…</p>';
    if (!t) return h + '<p class="note" style="margin:0 0 12px">이번 주 식단표가 아직 안 올라왔어요. 식당 식단표를 사진 찍어 올리면 메이드 휴대폰에도 점심 메뉴가 떠요.</p>' +
      '<button class="big-btn" data-ml="up">📷 식단표 사진 올리기</button><button class="ml-more" data-ml="week">주간 식단표 ›</button>';
    const cur = nowMeal();
    return h + '<div class="ml-cols">' +
      MEALS.map(([k, n]) => '<div class="ml-col' + (k === cur ? ' on' : '') + '"><h3>' + n + (k === cur ? '<i>지금</i>' : '') + '</h3><ul>' + ((t[k] || []).length ? t[k].map(itemHtml).join('') : '<li class="ml-x">없음</li>') + '</ul></div>').join('') +
      '</div><div class="ml-dacts"><button class="ml-more" data-ml="up">📷 새 식단표 올리기</button><button class="ml-more" data-ml="week">주간 식단표 · 인쇄 ›</button></div>';
  }
  let dlgOn = false;
  function drawDlg() {
    let el = document.getElementById('mldlg');
    if (!dlgOn) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'mldlg'; document.body.appendChild(el); }
    el.innerHTML = '<div class="ml-scrim" data-ml="close"></div><div class="ml-box" role="dialog" aria-label="오늘 식단">' + dlgBody() + '</div>';
  }
  function openDlg() { dlgOn = true; drawDlg(); load(false).then(drawDlg); }
  function closeDlg() { dlgOn = false; drawDlg(); }

  // 주간 식단표 화면 (#meal)
  function weekCells(from) { return Array.from({ length: 7 }, (_, i) => addDays(from, i)); }
  function tableHtml(from, forPrint) {
    const ds = weekCells(from), t = ymd();
    return '<table class="ml-tb"><thead><tr><th></th>' + ds.map(d => '<th class="' + (d === t && !forPrint ? 'td' : '') + (dowOf(d) === '일' ? ' sun' : dowOf(d) === '토' ? ' sat' : '') + '">' + dowOf(d) + '<small>' + md(d) + '</small></th>').join('') + '</tr></thead><tbody>' +
      MEALS.map(([k, n]) => '<tr><th>' + n + '</th>' + ds.map(d => { const x = dayOf(d); return '<td class="' + (d === t && !forPrint ? 'td' : '') + '"><ul>' + (x && x[k] ? x[k].map(itemHtml).join('') : '') + '</ul></td>'; }).join('') + '</tr>').join('') + '</tbody></table>';
  }
  function hasWeek(from) { return weekCells(from).some(d => dayOf(d)); }
  function secHtml() {
    if (doc === undefined) { load(false); return '<div class="card"><p class="note" style="margin:0">읽는 중…</p></div>'; }
    if (up) return upHtml();
    if (!wkFrom) wkFrom = mon(ymd());
    let h = '<div class="card"><h2>📷 식단표 올리기</h2><p class="note" style="margin:0 0 12px">식당 게시판 식단표를 휴대폰으로 찍어 올리면 AI가 표로 읽어요. 저장 전에 한 번 확인하고 고칠 수 있어요. 일주일에 한 번이면 돼요.</p>' +
      '<button class="big-btn" data-ml="up">📷 식단표 사진 올리기</button></div>';
    h += '<div class="card"><h2>🗓 주간 식단표 <span class="ml-nav"><button class="ref" data-ml="prev" aria-label="지난주">‹</button><button class="ref" data-ml="next" aria-label="다음 주">›</button></span></h2>' +
      '<p class="ml-range">' + md(wkFrom) + ' (월) ~ ' + md(addDays(wkFrom, 6)) + ' (일)' + (wkFrom === mon(ymd()) ? ' · 이번 주' : '') + '</p>';
    if (!hasWeek(wkFrom)) h += '<p class="note" style="margin:0">이 주 식단표는 아직 없어요.</p>';
    else h += '<div class="ml-scroll">' + tableHtml(wkFrom, false) + '</div>' + ((doc.notes || []).length ? '<ul class="ml-notes">' + doc.notes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul>' : '') +
      '<button class="big-btn sec" style="margin-top:12px" data-ml="print">🖨 A4 인쇄 · PDF 저장</button><p class="note" style="margin-top:6px">인쇄 창에서 프린터 대신 \'PDF로 저장\'을 고르면 파일로 받아요.</p>' +
      '<button class="big-btn sec" style="margin-top:8px" data-ml="edit">✏ 이 주 고치기</button>';
    if (doc && doc.wk && doc.wk.by) h += '<p class="note" style="margin-top:10px">마지막으로 올린 사람: ' + esc(doc.wk.by) + (doc.at ? ' · ' + md(ymd(Number(doc.at.seconds ? doc.at.seconds * 1000 : doc.at))) : '') + '</p>';
    return h + '</div>';
  }

  // 올리기 · 확인 화면
  function upHtml() {
    let h = '<div class="card"><h2>📷 식단표 확인 <button class="ref" data-ml="cancel">닫기</button></h2>';
    if (up.pic) h += '<details class="ml-pic"' + (up.days ? '' : ' open') + '><summary>올린 사진 보기</summary><img src="' + up.pic + '" alt="식단표 사진"></details>';
    if (up.reading) return h + '<p class="ml-busy">AI가 식단표를 읽는 중이에요… (20~40초)</p></div>';
    if (up.err) h += '<p class="ml-err">' + esc(up.err) + '</p>';
    if (!up.days) return h + '<button class="big-btn" data-ml="up">다른 사진 고르기</button>' + (up.pic ? '<button class="big-btn sec" style="margin-top:8px" data-ml="blank">손으로 적기</button>' : '') + '</div>';
    const ds = Object.keys(up.days).sort();
    h += '<p class="note" style="margin:0 0 10px">' + (up.fromAI ? 'AI가 읽은 내용이에요. <b>사진과 비교해서 틀린 글자를 고친 뒤</b> 저장해 주세요. ' : '') + '한 줄에 메뉴 하나, 원산지는 괄호 안에 적어요. 예: <code>쇠고기미역국 (쇠고기:국산,한우)</code></p><div class="ml-edit">';
    ds.forEach(d => {
      const x = up.days[d];
      h += '<div class="ml-ed"><div class="ml-edh"><input type="date" data-mld="' + d + '" value="' + d + '"><b>' + dowOf(d) + '요일</b><button class="ml-del" data-ml="delday" data-d="' + d + '" title="이 날 빼기">✕</button></div>' +
        MEALS.map(([k, n]) => '<label>' + n + '<textarea rows="' + Math.max(3, (x[k] || '').split('\n').length) + '" data-mlf="' + d + '|' + k + '">' + esc(x[k] || '') + '</textarea></label>').join('') + '</div>';
    });
    h += '</div><button class="big-btn sec" style="margin-top:10px" data-ml="addday">＋ 날짜 더하기</button>' +
      '<label class="ml-nl">표 아래 안내 (한 줄에 하나)<textarea rows="3" data-mln="1">' + esc(up.notes || '') + '</textarea></label>' +
      '<div class="btn2" style="margin-top:12px"><button class="big-btn sec" data-ml="cancel">취소</button><button class="big-btn" data-ml="save"' + (up.saving ? ' disabled' : '') + '>' + (up.saving ? '저장하는 중…' : ds.length + '일 저장') + '</button></div>' +
      '<p class="note" style="margin-top:8px">저장하면 같은 날짜 식단은 새 것으로 바뀌고, 메이드 휴대폰 \'오늘 점심\'에도 바로 나와요.</p></div>';
    return h;
  }
  const toText = x => ({ b: (x.b || []).join('\n'), l: (x.l || []).join('\n'), d: (x.d || []).join('\n') });
  function pick() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
    inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; inp.remove(); if (f) read(f); });
    document.body.appendChild(inp); inp.click();
  }
  async function read(file) {
    up = { pic: '', reading: true, err: '', days: null, notes: '' }; c.go('meal'); c.draw();
    try {
      up.pic = await toJpeg(file, 2048); c.draw();
      const b64 = up.pic.slice(up.pic.indexOf(',') + 1), text = prompt(ymd());
      let cfg = {}; try { cfg = (await S.get('meta/insp_ai')) || {}; } catch (e) {}
      const raw = window.__fakeAI ? JSON.stringify(await window.__fakeAI(b64, text)) : await callAI(cfg, b64, text);
      const j = clean(JSON.parse(String(raw).replace(/^```(json)?|```$/g, '').trim()));
      if (!Object.keys(j.days).length) throw new Error('표에서 날짜를 못 찾았어요. 식단표 전체가 나오게, 정면에서 다시 찍어 주세요.');
      up.days = {}; Object.keys(j.days).forEach(d => { up.days[d] = toText(j.days[d]); });
      up.notes = j.notes.join('\n'); up.fromAI = true;
    } catch (e) {
      console.warn('식단 AI', e);
      up.err = (e && e.message && /[가-힣]/.test(e.message) ? e.message : 'AI가 읽지 못했어요 (' + String(e && (e.code || e.message) || e).slice(0, 120) + '). 다시 찍어 올리거나 \'손으로 적기\'를 눌러 주세요.');
    }
    up.reading = false; c.draw();
  }
  function blankWeek(from) { up.days = {}; weekCells(from).forEach(d => { up.days[d] = toText(dayOf(d) || {}); }); up.notes = ((doc && doc.notes) || []).join('\n'); up.err = ''; }
  async function save() {
    const days = {}, ds = Object.keys(up.days);
    ds.forEach(d => { const x = up.days[d], o = { b: lines(x.b), l: lines(x.l), d: lines(x.d) }; if (o.b.length || o.l.length || o.d.length) days[d] = o; });
    if (!Object.keys(days).length) { up.err = '적힌 메뉴가 없어요.'; c.draw(); return; }
    up.saving = true; up.err = ''; c.draw();
    try {
      const old = (await S.get('meta/meals')) || {}, cut = addDays(ymd(), -KEEP_DAYS), all = {};
      Object.keys(old.days || {}).forEach(d => { if (d >= cut) all[d] = old.days[d]; });
      ds.forEach(d => { delete all[d]; });   // 확인 화면에서 비운 날은 지움
      Object.assign(all, days);
      const keys = Object.keys(days).sort();
      const out = { days: all, notes: lines(up.notes).slice(0, 8), wk: { from: keys[0], to: keys[keys.length - 1], by: c.who() || '' }, at: S.SERVER_TIME, uid: c.uid() || '' };
      await S.set('meta/meals', out);
      doc = Object.assign({}, out, { at: Date.now() }); at = Date.now();
      wkFrom = mon(keys[0]); up = null; c.draw(); window.scrollTo(0, 0);
    } catch (e) { up.saving = false; up.err = '저장하지 못했어요: ' + (e && (e.code || e.message) || e); c.draw(); }
  }
  function print() {
    const from = wkFrom, old = document.getElementById('mlprint'); if (old) old.remove();
    const el = document.createElement('div'); el.id = 'mlprint';
    el.innerHTML = '<div class="mlp-head"><div><small>한화리조트 해운대 · 직원 식당</small><h1>주간 식단표</h1></div><b>' + from.slice(0, 4) + '. ' + md(from) + ' (월) ~ ' + md(addDays(from, 6)) + ' (일)</b></div>' + tableHtml(from, true) +
      ((doc.notes || []).length ? '<ul class="ml-notes">' + doc.notes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul>' : '');
    document.body.appendChild(el); document.body.classList.add('ml-printing');
    const done = () => { document.body.classList.remove('ml-printing'); el.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); if (window.__noPrintCleanup) return; setTimeout(done, 1500); }, 50);
  }

  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('[data-ml]'); if (!t) return;
    const a = t.getAttribute('data-ml');
    if (a === 'open') { openDlg(); return; }
    if (a === 'close') { closeDlg(); return; }
    if (a === 'up' || a === 'week') closeDlg();
    if (a === 'up') pick();
    else if (a === 'week') c.go('meal');
    else if (a === 'cancel') { if (up && up.days && !confirm('고친 내용을 버리고 닫을까요?')) return; up = null; c.draw(); }
    else if (a === 'blank') { blankWeek(mon(ymd())); c.draw(); }
    else if (a === 'edit') { up = { pic: '', reading: false, err: '', days: null, notes: '' }; blankWeek(wkFrom); c.draw(); window.scrollTo(0, 0); }
    else if (a === 'prev' || a === 'next') { wkFrom = addDays(wkFrom, a === 'prev' ? -7 : 7); c.draw(); }
    else if (a === 'print') print();
    else if (a === 'save') save();
    else if (a === 'delday') { delete up.days[t.getAttribute('data-d')]; c.draw(); }
    else if (a === 'addday') { const ds = Object.keys(up.days).sort(), n = ds.length ? addDays(ds[ds.length - 1], 1) : ymd(); up.days[n] = { b: '', l: '', d: '' }; c.draw(); }
  });
  document.addEventListener('input', e => {
    if (!up || !up.days) return;
    const f = e.target.getAttribute && e.target.getAttribute('data-mlf');
    if (f) { const [d, k] = f.split('|'); if (up.days[d]) up.days[d][k] = e.target.value; return; }
    if (e.target.hasAttribute && e.target.hasAttribute('data-mln')) up.notes = e.target.value;
  });
  document.addEventListener('change', e => {
    const d0 = e.target.getAttribute && e.target.getAttribute('data-mld'); if (!d0 || !up || !up.days) return;
    const d1 = e.target.value;
    if (!isDate(d1) || d1 === d0) { e.target.value = d0; return; }
    if (up.days[d1] && !confirm(md(d1) + ' 칸이 이미 있어요. 덮어쓸까요?')) { e.target.value = d0; return; }
    up.days[d1] = up.days[d0]; delete up.days[d0]; c.draw();
  });
  return { btnHtml, secHtml, load, reset() { doc = undefined; at = 0; up = null; }, busy: () => !!(up && (up.reading || up.saving)) };
}
