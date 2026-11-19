// 📝 배정 의견 (2026-11-19) — 하우스맨 · 하우스키퍼가 자동 배정에서 '미묘하게 안 맞는 것'을 말로 적어 두는 칸
// 매일 오전 10시 점검(Claude)이 새 의견을 읽고 건마다 답(반영 · 보류 · 질문)을 달아요 → 고칠 것은 시험 후 소장 승인 받고 배포
// 저장: asg_notes/{id} = { d(배정 날짜) · text · by(적은 분) · kind(once 이번만 | rule 앞으로 계속) · re(이어 쓴 의견 id) · acct · uid · at
//                        · snap(그때 배정 결과: 엔진안 · 고친 뒤 · 고친 것 · 대조 · 입력) | null · st · reply · rAt · ver }
//   st: new 새 의견 · ask 질문 · plan 반영 준비(배포 승인 대기) · done 반영됨 · hold 보류 · keep 기록만(단발성)
//   쓰기는 관리자(하우스키퍼 포함), 답(st · reply · rAt · ver)은 점검 계정만 (규칙 v19)
// 읽기 아끼기: 열 때 한 번 (최근 60일)
const ST = { new: ['새 의견', 'wait', '다음 점검(매일 오전 10시) 때 읽어요'], ask: ['질문 있어요', 'bad', '아래 답을 보고 이어서 적어 주세요'], plan: ['반영 준비', 'wait', '고쳐서 시험했어요 · 소장님 배포 승인 기다림'],
  done: ['반영됨', 'ok', ''], hold: ['보류', '', ''], keep: ['기록만', '', '그날만의 일이라 계산은 안 바꿔요'] };
const KIND = { once: '이번만', rule: '앞으로 계속' };
const MAX = 2000;
const lsGet = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
let N = null;

export function roomsIn(t) { return [...new Set((String(t || '').match(/(?<!\d)\d{3,4}(?!\d)/g) || []).filter(r => { const f = Math.floor(+r / 100), s = +r % 100; return f >= 2 && f <= 31 && s >= 1 && s <= 30; }))]; }

export async function openNotes(H, o) {
  o = o || {};
  N = { H, snap: o.snap || null, d: (o.snap && o.snap.date) || H.ymd(), text: '', by: lsGet('asg_by'), kind: 'rule', re: '', list: null, err: '', msg: '', saving: false, open: {} };
  const box = document.createElement('div'); box.className = 'vp'; box.id = 'anp'; box.style.zIndex = 60; document.body.appendChild(box); document.body.classList.add('sb-lock');
  draw(); load();
}
function close() { const b = document.getElementById('anp'); if (b) b.remove(); if (!document.getElementById('asp')) document.body.classList.remove('sb-lock'); N = null; }
async function load() {
  if (!N) return;
  try {
    const from = N.H.addDays(N.H.ymd(), -60);
    const xs = await N.H.S.getQuery('asg_notes', [['d', '>=', from]]);
    if (!N) return;
    N.list = xs.map(x => Object.assign({ id: x.id }, x.data)).filter(x => !x.hide).sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0)); N.err = '';
  } catch (e) { if (N) N.err = '의견을 못 읽었어요: ' + (e && (e.code || e.message) || e); }
  draw();
}
const t2 = t => { if (!t) return ''; const d = new Date(Number(t) + 9 * 3600e3); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2); };
function snapLine(s) {
  if (!s) return '';
  const ns = Object.keys(s.final || {}), nr = ns.reduce((a, n) => a + (s.final[n] || []).length, 0);
  return ns.length + '명 · ' + nr + '실' + ((s.edits || []).length ? ' · 고친 것 ' + s.edits.length + '건' : '') + (s.cmp ? ' · 하우스키퍼와 ' + s.cmp.pct + '% 같음' : '') + (s.kind ? ' (' + s.kind + ')' : '');
}
function draw() {
  const box = document.getElementById('anp'); if (!box || !N) return;
  const esc = N.H.esc, y = box.scrollTop;
  let h = '<div class="vp-in"><div class="vp-head"><h2>📝 배정 의견</h2><button class="vp-x" data-an="close" aria-label="닫기">✕</button></div>';
  h += '<div class="card"><h2>' + (N.re ? '이어서 답하기' : '의견 적기') + ' <small>' + esc(N.H.md(N.d)) + ' 배정</small></h2>' +
    '<p class="note" style="margin:0 0 8px">자동 배정이 사람 생각과 다른 점을 편하게 적어 주세요. 매일 오전 10시에 읽고 건마다 답을 달아요. 고칠 것은 시험해 본 뒤 소장님 승인을 받고 바꿔요.</p>' +
    (N.re ? '<p class="okbox">「' + esc(((N.list || []).find(x => x.id === N.re) || {}).text || '').slice(0, 60) + '」에 이어서 적어요 <button class="ref" data-an="nore">취소</button></p>' : '') +
    '<div class="seg2">' + Object.keys(KIND).map(k => '<button data-an="kind" data-v="' + k + '" aria-pressed="' + (N.kind === k) + '">' + KIND[k] + (k === 'once' ? ' (그날만 특이)' : ' (기준으로)') + '</button>').join('') + '</div>' +
    '<textarea id="antext" rows="5" maxlength="' + MAX + '" placeholder="예) 1203·1205는 같은 분이 가야 해요 / ○○ 님은 무릎 때문에 벽배딩 빼 주세요 / 단체 많은 날은 고층부터 나눠 주세요">' + esc(N.text) + '</textarea>' +
    '<label class="asg-prev" style="margin-top:8px"><span>적는 분</span><input id="anby" maxlength="20" value="' + esc(N.by) + '" placeholder="이름 (예: 하우스맨 홍길동)"></label>' +
    (N.snap ? '<p class="note">같이 저장돼요: 이 날 배정 결과 — ' + esc(snapLine(N.snap)) + '</p>' : '<p class="note">배정 결과도 같이 남기려면 자동 배정 화면의 <b>📝 배정 의견</b> 버튼으로 열어 주세요 (배정을 돌린 뒤).</p>') +
    (N.err ? '<p class="err">' + esc(N.err) + '</p>' : '') + (N.msg ? '<p class="okbox">' + esc(N.msg) + '</p>' : '') +
    '<button class="big-btn" style="margin-top:8px" data-an="save"' + (N.saving ? ' disabled' : '') + '>' + (N.saving ? '저장 중…' : '의견 저장') + '</button></div>';
  h += '<div class="card"><h2>지난 의견 · 답 <small>최근 60일</small></h2>';
  if (!N.list) h += '<p class="note" style="margin:0">' + (N.err ? '' : '읽는 중…') + '</p>';
  else if (!N.list.length) h += '<p class="note" style="margin:0">아직 적은 의견이 없어요.</p>';
  else h += '<ul class="an-list">' + N.list.map(x => {
    const s = ST[x.st] || ST.new, rs = roomsIn(x.text);
    return '<li class="an-' + esc(x.st || 'new') + '"><div class="an-top"><span class="pill ' + s[1] + '">' + s[0] + '</span><b>' + esc(N.H.md(x.d)) + ' 배정</b><small>' + esc((x.by || '') + ' · ' + t2(x.at) + ' · ' + (KIND[x.kind] || '')) + '</small></div>' +
      '<p class="an-t">' + esc(x.text) + '</p>' + (rs.length ? '<small class="an-r">객실 ' + esc(rs.join(' · ')) + '</small>' : '') +
      (x.reply ? '<div class="an-reply"><b>답 ' + esc(t2(x.rAt)) + (x.ver ? ' · ' + esc(x.ver) : '') + '</b><p>' + esc(x.reply) + '</p></div>' : '<small class="an-r">' + esc(s[2]) + '</small>') +
      (x.st === 'ask' || x.reply ? '<button class="ref" data-an="re" data-v="' + esc(x.id) + '">이어서 적기</button>' : '') + '</li>';
  }).join('') + '</ul>';
  h += '</div></div>';
  box.innerHTML = h + '<style>.an-list{list-style:none;margin:0;padding:0}.an-list li{border-top:1px solid var(--line);padding:12px 0}.an-list li:first-child{border-top:0}.an-top{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center}.an-top small{color:var(--muted)}' +
    '.an-t{margin:8px 0 4px;white-space:pre-wrap;line-height:1.5}.an-r{display:block;color:var(--muted)}.an-reply{background:var(--tile);border-radius:12px;padding:10px 12px;margin:8px 0}.an-reply p{margin:4px 0 0;white-space:pre-wrap;line-height:1.5}</style>';
  box.scrollTop = y;
}
function read() { const t = document.getElementById('antext'), b = document.getElementById('anby'); if (t) N.text = t.value; if (b) N.by = b.value.trim(); }
async function save() {
  read(); N.err = ''; N.msg = '';
  const text = N.text.trim();
  if (!text) { N.err = '내용을 적어 주세요.'; draw(); return; }
  if (!N.by) { N.err = '적는 분 이름을 적어 주세요.'; draw(); return; }
  lsSet('asg_by', N.by);
  const u = N.H.user ? N.H.user() : null, a = N.H.admin ? N.H.admin() : null;
  const d = { d: N.d, text: text.slice(0, MAX), by: N.by.slice(0, 20), kind: N.kind, re: N.re || '', acct: (a && a.label) || '', uid: (u && u.uid) || '', at: N.H.S.SERVER_TIME,
    snap: N.re ? null : (N.snap || null), st: 'new', reply: '', rAt: null, ver: '' };
  N.saving = true; draw();
  try { const r = N.H.S.add('asg_notes', d); await r.done; N.text = ''; N.re = ''; N.msg = '저장했어요. 오전 10시 점검 때 읽고 여기에 답을 달아요.'; N.list = null; N.saving = false; draw(); load(); }
  catch (e) { N.saving = false; N.err = '저장하지 못했어요: ' + (e && (e.code || e.message) || e); draw(); }
}
document.addEventListener('click', e => {
  if (!N) return;
  const t = e.target.closest && e.target.closest('#anp [data-an]'); if (!t) return;
  const a = t.getAttribute('data-an'), v = t.getAttribute('data-v');
  if (a === 'close') { close(); return; }
  read();
  if (a === 'kind') { N.kind = v; draw(); return; }
  if (a === 'save') { save(); return; }
  if (a === 'nore') { N.re = ''; draw(); return; }
  if (a === 're') { const x = (N.list || []).find(z => z.id === v); if (!x) return; N.re = v; N.d = x.d; N.kind = x.kind || 'rule'; N.msg = ''; draw(); const b = document.getElementById('anp'); if (b) b.scrollTop = 0; return; }
});
