// 📢 공지 올리기 (2026-11-18) — 허브 '📱 현장 관리' 안. 옛 구글 앱(공지목록.csv → 중계)을 거치지 않고 Firestore notices 에 바로 씀
// 정비 레포트 메이드 화면은 notices 를 그대로 읽으므로 앱은 안 고침 (같은 칸: id · title · body · from · to · target · targets · popup · daily · img · imgName)
// 중계(Relay.gs rlNotices_)와 안 부딪히게: 허브 공지는 id 를 'hub-' 로 시작 + src:'hub' — 중계는 자기가 올린 id(공지목록.csv)만 고치고 지움
//   (주의: 중계 위치표를 지우는 relayReset 을 실행하면 중계가 notices 전체를 자기 것으로 보고 허브 공지를 내릴 수 있음 → 그땐 여기서 다시 올림)
// 읽기 아끼기: 이 칸을 열 때 한 번만 읽음 (구독 안 함)
const MAX_IMG = 700 * 1024;   // 사진 한 장 data URL 글자 수
// 11/21: 사진 여러 장 — imgs[] (img·imgName 은 첫 장으로 계속 채움: 옛 앱·설치 안내 포스터가 img 를 봄)
//   Firestore 문서 1MB 한도라 모든 사진 합이 IMG_BUDGET 을 넘으면 큰 사진부터 다시 줄임
const MAX_PICS = 6, IMG_BUDGET = 880 * 1024;
const SIDES = [1600, 1280, 1000, 800, 640];
export function setupNotice(c) {
  const { S, esc, ymd, addDays, md } = c;
  let st = { list: null, err: '', at: 0, busy: false, names: null, form: null, msg: '' };
  const blank = () => ({ id: '', title: '', body: '', from: ymd(), to: addDays(ymd(), 6), all: true, targets: [], popup: true, daily: false, imgs: [], imgNames: [], imgBusy: false, err: '', saving: false });
  async function load(force) {
    if (st.busy || (!force && st.at && Date.now() - st.at < 120000)) return;
    st.busy = true; c.draw();
    try {
      const xs = await S.getQuery('notices', []);
      st.list = xs.map(x => Object.assign({ id: x.id }, x.data)).sort((a, b) => String(b.from || '').localeCompare(String(a.from || '')) || (a.id < b.id ? 1 : -1));
      st.err = ''; st.at = Date.now();
    } catch (e) { st.err = String(e && (e.code || e.message) || e); }
    st.busy = false; c.draw();
  }
  async function loadNames() {
    if (st.names) return;
    const out = {};
    try { const d = await S.get('days/' + ymd()); ((d && d.maids) || []).forEach(n => { out[n] = 1; }); } catch (e) {}
    try { (await S.getQuery('staff', [['job', '==', '룸메이드']])).forEach(x => { const p = x.data || {}; if (p.name && p.status !== '퇴사') out[String(p.name).replace(/\s+/g, '')] = 1; }); } catch (e) {}
    st.names = Object.keys(out).filter(n => n.indexOf('/') < 0).sort(); c.draw();
  }
  const state = n => { const t = ymd(); return n.to && n.to < t ? 'end' : n.from && n.from > t ? 'soon' : 'on'; };
  const picsOf = n => (n.imgs && n.imgs.length ? n.imgs : n.img ? [n.img] : []).slice();
  const isHub = n => n.src === 'hub' || String(n.id).indexOf('hub-') === 0;
  function listHtml() {
    if (!st.list) return '<p class="note" style="margin:0">' + (st.err ? '' : '읽는 중…') + '</p>';
    const L = st.list.filter(n => state(n) !== 'end' || isHub(n));
    if (!L.length) return '<p class="note" style="margin:0">지금 올라가 있는 공지가 없어요.</p>';
    return '<ul class="nt-list">' + L.map(n => {
      const s = state(n), lab = s === 'on' ? '<i class="nt-on">게시 중</i>' : s === 'soon' ? '<i class="nt-soon">예약</i>' : '<i class="nt-end">끝남</i>';
      const who = n.targets && n.targets.length ? n.targets.length + '명' : '전체';
      return '<li>' + lab + '<div><b>' + esc(n.title || '(제목 없음)') + '</b><span>' + esc(md(n.from || '') + ' ~ ' + md(n.to || '')) + ' · ' + who + (n.popup ? ' · 꼭 확인' : '') + (n.daily ? ' · 매일' : '') + (picsOf(n).length ? ' · 사진' + (picsOf(n).length > 1 ? ' ' + picsOf(n).length + '장' : '') : '') +
        (isHub(n) ? '' : ' · 기존 앱에서 올림') + '</span></div>' +
        (isHub(n) ? '<button class="ref" data-nt="edit" data-id="' + esc(n.id) + '">고치기</button>' : '') + '</li>';
    }).join('') + '</ul>';
  }
  function formHtml() {
    const f = st.form, names = st.names;
    let h = '<div class="nt-form"><h3>' + (f.id ? '공지 고치기' : '새 공지') + '</h3>' +
      '<label>제목<input data-ntf="title" maxlength="60" value="' + esc(f.title) + '" placeholder="예: 11월 객실 비품 위치 변경"></label>' +
      '<label>내용<textarea data-ntf="body" rows="5" maxlength="1500" placeholder="메이드 휴대폰에 그대로 보여요">' + esc(f.body) + '</textarea></label>' +
      '<div class="nt-row"><label>시작<input type="date" data-ntf="from" value="' + esc(f.from) + '"></label><label>끝<input type="date" data-ntf="to" value="' + esc(f.to) + '"></label></div>' +
      '<div class="seg2" style="margin-top:10px"><button data-nt="all" data-v="1" aria-pressed="' + f.all + '">전체 메이드</button><button data-nt="all" data-v="0" aria-pressed="' + !f.all + '">골라서</button></div>';
    if (!f.all) h += !names ? '<p class="note">이름을 읽는 중…</p>' : '<div class="nt-names">' + names.map(n => '<button data-nt="pick" data-n="' + esc(n) + '" aria-pressed="' + (f.targets.indexOf(n) >= 0) + '">' + esc(n) + '</button>').join('') + '</div><p class="note" style="margin-top:6px">' + f.targets.length + '명 골랐어요. 2인 1조는 한 분만 골라도 짝 휴대폰에 같이 나와요.</p>';
    h += '<label class="nt-ck"><input type="checkbox" data-ntf="popup"' + (f.popup ? ' checked' : '') + '> 앱을 열면 바로 띄우기 (꼭 확인)</label>' +
      '<label class="nt-ck"><input type="checkbox" data-ntf="daily"' + (f.daily ? ' checked' : '') + '> 매일 다시 확인받기</label>' +
      '<div class="nt-img">' + (f.imgs.length ? '<div class="nt-pics">' + f.imgs.map((u, i) => '<div class="nt-pic"><img src="' + u + '" alt=""><span>' + (i + 1) + '</span>' +
        (i ? '<button class="nt-mv" data-nt="mvimg" data-i="' + i + '" title="앞으로">◀</button>' : '') + '<button class="nt-x" data-nt="noimg" data-i="' + i + '" title="빼기">✕</button></div>').join('') + '</div>' : '') +
        (f.imgs.length < MAX_PICS ? '<button class="big-btn sec" data-nt="img"' + (f.imgBusy ? ' disabled' : '') + '>' + (f.imgBusy ? '사진 줄이는 중…' : f.imgs.length ? '🖼 사진 더 넣기 (' + f.imgs.length + '/' + MAX_PICS + ')' : '🖼 사진 넣기 (선택 · 여러 장 가능)') + '</button>' : '<p class="note" style="margin:0">사진은 ' + MAX_PICS + '장까지 넣을 수 있어요.</p>') +
        (f.imgs.length > 1 ? '<p class="note" style="margin-top:6px">메이드 휴대폰에는 1번부터 차례로 보여요. ◀ 를 누르면 앞으로 옮겨요.</p>' : '') + '</div>' +
      (f.err ? '<p class="err" style="margin-top:10px">' + esc(f.err) + '</p>' : '') +
      '<div class="btn2"><button class="big-btn sec" data-nt="cancel">취소</button><button class="big-btn" data-nt="save"' + (f.saving ? ' disabled' : '') + '>' + (f.saving ? '올리는 중…' : f.id ? '고친 내용 올리기' : '공지 올리기') + '</button></div>' +
      (f.id ? '<button class="big-btn sec nt-del" data-nt="del">이 공지 내리기 (지우기)</button>' : '') + '</div>';
    return h;
  }
  function html() {
    if (!st.busy && (!st.at || Date.now() - st.at > 120000) && !st.err) setTimeout(() => load(false), 0);
    let h = '<div class="card" id="ntcard"><h2>📢 공지 <button class="ref" data-nt="reload">' + (st.busy ? '읽는 중…' : '↻') + '</button></h2>';
    if (st.err) h += '<p class="err">공지를 못 읽었어요: ' + esc(st.err) + '</p>';
    if (st.msg) h += '<p class="okbox">' + esc(st.msg) + '</p>';
    if (st.form) return h + formHtml() + '</div>';
    return h + listHtml() + '<button class="big-btn" style="margin-top:12px" data-nt="new">＋ 새 공지 올리기</button>' +
      '<p class="note">올리면 1분 안에 메이드 휴대폰에 나와요. 누가 확인했는지는 아래 \'현장 관리 열기\' → 공지 확인에서 봐요. 기존 앱(공지목록)에서 올린 공지는 여기서 보기만 해요.</p></div>';
  }
  function readForm() {
    const f = st.form; if (!f) return;
    document.querySelectorAll('[data-ntf]').forEach(el => { const k = el.getAttribute('data-ntf'); f[k] = el.type === 'checkbox' ? el.checked : el.value; });
  }
  function loadImg(src) { return new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = src; }); }
  // 사진을 cap 글자 이하 JPEG data URL 로 (긴 변 줄여 가며)
  function shrink(im, cap, startBelow) {
    let out = '';
    for (const side of SIDES) {
      if (startBelow && side >= startBelow) continue;
      const k = Math.min(1, side / Math.max(im.width, im.height)), cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(im.width * k)); cv.height = Math.max(1, Math.round(im.height * k));
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0, cv.width, cv.height);
      out = cv.toDataURL('image/jpeg', side <= 800 ? 0.75 : 0.82);
      if (out.length <= cap) return { url: out, side: Math.max(cv.width, cv.height) };
    }
    return out ? { url: out, side: 640, over: true } : null;
  }
  const total = f => f.imgs.reduce((t, u) => t + u.length, 0);
  // 모든 사진 합이 한도를 넘으면 가장 큰 사진부터 한 단계씩 줄임
  async function fit(f) {
    for (let guard = 0; total(f) > IMG_BUDGET && guard < 40; guard++) {
      let bi = 0; f.imgs.forEach((u, i) => { if (u.length > f.imgs[bi].length) bi = i; });
      const im = await loadImg(f.imgs[bi]), side = Math.max(im.width, im.height);
      const r = shrink(im, Math.floor(f.imgs[bi].length * 0.75), side);
      if (!r || r.url.length >= f.imgs[bi].length) return false;
      f.imgs[bi] = r.url;
    }
    return total(f) <= IMG_BUDGET;
  }
  function pickImg() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true; inp.style.display = 'none';
    inp.addEventListener('change', async () => {
      const files = Array.from(inp.files || []); inp.remove(); if (!files.length || !st.form) return;
      const f = st.form; f.imgBusy = true; f.err = ''; c.draw();
      const room = MAX_PICS - f.imgs.length, use = files.slice(0, room); let bad = 0;
      for (const file of use) {
        const url = URL.createObjectURL(file);
        try {
          const im = await loadImg(url), r = shrink(im, MAX_IMG);
          if (!r || r.over) bad++; else { f.imgs.push(r.url); f.imgNames.push(String(file.name || 'photo.jpg').slice(0, 60)); }
        } catch (e) { bad++; }
        URL.revokeObjectURL(url);
        if (!(await fit(f))) { f.imgs.pop(); f.imgNames.pop(); f.err = '사진이 너무 많거나 커서 더 못 넣었어요.'; break; }
        c.draw();
      }
      f.imgBusy = false;
      if (!f.err) f.err = (bad ? bad + '장은 못 읽었어요. ' : '') + (files.length > room ? '사진은 ' + MAX_PICS + '장까지라 ' + (files.length - room) + '장은 뺐어요.' : '');
      c.draw();
    });
    document.body.appendChild(inp); inp.click();
  }
  async function save() {
    readForm(); const f = st.form;
    const title = String(f.title || '').trim(), body = String(f.body || '').trim();
    f.err = !title ? '제목을 적어 주세요.' : !/^\d{4}-\d{2}-\d{2}$/.test(f.from) || !/^\d{4}-\d{2}-\d{2}$/.test(f.to) ? '날짜를 골라 주세요.' : f.to < f.from ? '끝 날짜가 시작보다 빨라요.' : !f.all && !f.targets.length ? '받을 메이드를 골라 주세요.' : '';
    if (f.err) { c.draw(); return; }
    f.saving = true; c.draw();
    const id = f.id || 'hub-' + ymd().replace(/-/g, '').slice(2) + '-' + Date.now().toString(36).slice(-5);
    const targets = f.all ? [] : f.targets.slice();
    try {
      await S.set('notices/' + id, { id, src: 'hub', title, body, from: f.from, to: f.to, target: f.all ? '전체' : targets.join('/'), targets,
        popup: !!f.popup, daily: !!f.daily, img: f.imgs[0] || '', imgName: f.imgs.length ? f.imgNames[0] || 'photo.jpg' : '', imgs: f.imgs.slice(), imgNames: f.imgs.map((u, i) => f.imgNames[i] || 'photo.jpg'), by: c.who(), at: S.SERVER_TIME });
      st.form = null; st.msg = (f.id ? '고친 공지를 올렸어요: ' : '공지를 올렸어요: ') + title; load(true);
    } catch (e) { f.saving = false; f.err = '올리지 못했어요: ' + (e && (e.code || e.message) || e); c.draw(); }
  }
  async function del() {
    const f = st.form; if (!f || !f.id || !confirm('이 공지를 내릴까요?\n메이드 휴대폰에서 바로 사라져요.')) return;
    f.saving = true; c.draw();
    try { await S.del('notices/' + f.id); st.form = null; st.msg = '공지를 내렸어요.'; load(true); }
    catch (e) { f.saving = false; f.err = '내리지 못했어요: ' + (e && (e.code || e.message) || e); c.draw(); }
  }
  document.addEventListener('input', e => { if (e.target && e.target.closest && e.target.closest('#ntcard') && st.form) readForm(); });
  document.addEventListener('change', e => { if (e.target && e.target.closest && e.target.closest('#ntcard') && st.form) readForm(); });
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('[data-nt]'); if (!t || !t.closest('#ntcard')) return;
    const a = t.getAttribute('data-nt');
    if (st.form) readForm();
    if (a === 'reload') { st.msg = ''; load(true); }
    else if (a === 'new') { st.msg = ''; st.form = blank(); c.draw(); }
    else if (a === 'edit') { const n = (st.list || []).filter(x => x.id === t.getAttribute('data-id'))[0]; if (!n) return; st.msg = ''; st.form = Object.assign(blank(), { id: n.id, title: n.title || '', body: n.body || '', from: n.from || ymd(), to: n.to || ymd(), all: !(n.targets && n.targets.length), targets: (n.targets || []).slice(), popup: !!n.popup, daily: !!n.daily, imgs: picsOf(n), imgNames: picsOf(n).map((u, i) => (n.imgNames && n.imgNames[i]) || (i ? 'photo.jpg' : n.imgName || 'photo.jpg')) }); if (!st.form.all) loadNames(); c.draw(); }
    else if (a === 'cancel') { st.form = null; c.draw(); }
    else if (a === 'all') { st.form.all = t.getAttribute('data-v') === '1'; if (!st.form.all) loadNames(); c.draw(); }
    else if (a === 'pick') { const n = t.getAttribute('data-n'), L = st.form.targets, i = L.indexOf(n); if (i >= 0) L.splice(i, 1); else L.push(n); c.draw(); }
    else if (a === 'img') pickImg();
    else if (a === 'noimg') { const i = Number(t.getAttribute('data-i')) || 0; st.form.imgs.splice(i, 1); st.form.imgNames.splice(i, 1); st.form.err = ''; c.draw(); }
    else if (a === 'mvimg') { const i = Number(t.getAttribute('data-i')), F = st.form; if (i > 0) { [F.imgs[i - 1], F.imgs[i]] = [F.imgs[i], F.imgs[i - 1]]; [F.imgNames[i - 1], F.imgNames[i]] = [F.imgNames[i], F.imgNames[i - 1]]; } c.draw(); }
    else if (a === 'save') save();
    else if (a === 'del') del();
  });
  return { html, reset() { st = { list: null, err: '', at: 0, busy: false, names: null, form: null, msg: '' }; } };
}
