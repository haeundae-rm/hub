// hub/rmsched/blockpick.js — 🗺 작업객실 도면으로 고르기 (2026-11-25, 소장님: "정비보조 객실 활동판 수준으로")
// 정비 지원 객실 활동판(dirty) 도면 고르기와 같은 손놀림: 칸 누르기 · 네모로 끌어 한꺼번에(⊕ 넣기 / ⊖ 빼기) · 층 번호 · 위 호수 번호로 한 줄씩
// 고른 결과는 자동 배정의 🚧 장기 미정비 블럭(meta/blocks)과 같은 모양 { name, rooms, from, to, prio } — 저장은 app.js 가 함
// openBlockPick({ name, rooms, from, to, prio, base }) → Promise<null | { name, rooms, from, to, prio }>
import { FLOORS, parseMsg } from '../blocks.js?v=2026.11.28-29';

const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = d => d ? Number(d.slice(5, 7)) + '/' + Number(d.slice(8)) : '';
const buzz = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };
const FS = Object.keys(FLOORS).map(Number).sort((a, b) => b - a);
const ALL = FS.flatMap(f => FLOORS[f].map(s => String(f * 100 + s)));

const CSS = `
#bpk{position:fixed;inset:0;z-index:80;background:rgba(16,24,40,.45);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:16px 8px}
#bpk .bp-in{background:#fff;color:#152033;border-radius:16px;width:min(760px,100%);padding:16px 16px 18px;box-shadow:0 18px 50px rgba(0,0,0,.25)}
#bpk h3{margin:0 0 10px;font-size:19px;display:flex;align-items:center;gap:8px}
#bpk h3 button{margin-left:auto;min-height:38px;min-width:38px;border-radius:10px;border:1.5px solid #D6DCE5;background:#fff;font-size:16px;cursor:pointer}
#bpk .bp-f{display:grid;grid-template-columns:1fr 1fr;gap:8px 10px}
#bpk .bp-f label{display:flex;flex-direction:column;gap:3px;font-size:12.5px;font-weight:700;color:#5B6475}
#bpk .bp-f label.w{grid-column:1/-1}
#bpk input[type=text],#bpk input[type=date],#bpk textarea{min-height:40px;border:1.5px solid #D6DCE5;border-radius:10px;padding:6px 10px;font-weight:600;font-size:15px;font-family:inherit;color:#152033;background:#fff;width:100%;box-sizing:border-box}
#bpk textarea{min-height:64px;resize:vertical;font-weight:500;font-size:14px}
#bpk .bp-f label.bp-ck{flex-direction:row;align-items:center;justify-content:flex-start;gap:8px;font-size:13.5px;font-weight:700;color:#152033;grid-column:1/-1;text-align:left}#bpk .bp-ck input{width:20px;height:20px;min-height:0;margin:0}
#bpk details{margin-top:8px;border:1.5px dashed #D6DCE5;border-radius:12px;padding:6px 10px}
#bpk details summary{cursor:pointer;font-weight:800;font-size:14px;color:#1D3A6E;padding:4px 0}
#bpk .bp-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}
#bpk .bp-bar .n{flex:1;min-width:150px;font-size:16px;font-weight:900}
#bpk .bp-bar .n b{color:#C2410C;font-size:20px}
#bpk button.s{min-height:40px;border-radius:10px;border:1.5px solid #D6DCE5;background:#fff;color:#152033;font-weight:800;font-size:13.5px;font-family:inherit;padding:0 12px;cursor:pointer}
#bpk .bp-mode{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:13px;font-weight:800;color:#5B6475;flex-wrap:wrap}
#bpk .bp-mode button[aria-pressed="true"]{border-color:#1D3A6E;box-shadow:0 0 0 2px #1D3A6E inset}
#bpk .bp-note{margin:6px 0 0;font-size:12.5px;color:#5B6475;line-height:1.5}
#bpk #bp-area{position:relative;padding:12px;margin:6px -12px 0;touch-action:none;user-select:none;-webkit-user-select:none;cursor:crosshair}
#bpk #bp-rect{position:absolute;display:none;border:2px dashed #C2410C;background:rgba(194,65,12,.08);border-radius:4px;pointer-events:none;z-index:2}
#bpk #bp-rect.out{border-color:#5B6475;background:rgba(91,100,117,.08)}
#bpk .bp{display:grid;grid-template-columns:34px repeat(17,minmax(0,1fr));gap:2px}
#bpk .bp button{min-height:26px;border:0;border-radius:4px;background:#EEF2F8;color:#152033;font-weight:800;font-size:11px;font-family:inherit;cursor:pointer;padding:0}
#bpk .bp .pc{font-style:normal;display:flex;align-items:center;justify-content:center;min-height:28px;border-radius:4px;background:#E9EEF5;color:#3B4659;font-weight:700;font-size:10px;font-family:inherit;cursor:pointer;position:relative}
#bpk .bp .pc.on{background:#F97316;color:#fff;box-shadow:inset 0 0 0 1px #C2410C}
#bpk .bp .pc.other{background-image:repeating-linear-gradient(45deg,rgba(29,58,110,.18) 0 3px,transparent 3px 6px)}
#bpk .bp .pc.sel{outline:3px solid #C2410C;outline-offset:-1px}
#bpk .bp .pc.sel.out{outline-color:#5B6475}
#bpk .bp .e{min-height:28px}
#bpk .bp-err{margin:10px 0 0;color:#B91C1C;font-weight:800;font-size:14px}
#bpk .bp-act{display:flex;gap:8px;margin-top:14px}
#bpk .bp-act button{flex:1;min-height:50px;border-radius:12px;font-weight:900;font-size:16px;font-family:inherit;cursor:pointer;border:1.5px solid #D6DCE5;background:#fff;color:#152033}
#bpk .bp-act button.go{flex:2;background:#1D3A6E;border-color:#1D3A6E;color:#fff}
#bpk .bp-lg{display:flex;gap:12px;flex-wrap:wrap;margin-top:6px;font-size:12px;color:#5B6475}
#bpk .bp-lg i{display:inline-block;width:14px;height:12px;border-radius:3px;vertical-align:-2px;margin-right:4px}
@media (max-width:560px){#bpk .bp-f{grid-template-columns:1fr}#bpk .bp .pc{font-size:9px;min-height:26px}}
`;

export function openBlockPick(o) {
  o = o || {};
  if (!document.getElementById('bpk-css')) { const st = document.createElement('style'); st.id = 'bpk-css'; st.textContent = CSS; document.head.appendChild(st); }
  const P = { name: o.name || '', from: o.from || o.base || '', to: o.to || o.from || o.base || '', prio: !!o.prio, set: {}, orig: (o.rooms || []).slice(), mode: 'in', err: '', other: o.other || {} };
  P.orig.forEach(r => { P.set[r] = 1; });
  const box = document.createElement('div'); box.id = 'bpk'; document.body.appendChild(box);
  let done = null; const out = new Promise(res => { done = res; });
  const close = v => { document.removeEventListener('pointerdown', down); document.removeEventListener('pointermove', move); ['pointerup', 'pointercancel'].forEach(t => document.removeEventListener(t, up)); document.removeEventListener('keydown', key); box.remove(); done(v); };
  const n = () => Object.keys(P.set).length;
  const read = () => { const g = id => box.querySelector('#' + id); if (g('bpN')) P.name = g('bpN').value.trim(); if (g('bpF')) P.from = g('bpF').value; if (g('bpT')) P.to = g('bpT').value; if (g('bpP')) P.prio = g('bpP').checked; };
  function draw() {
    const fl = {}; ALL.forEach(r => { const f = Math.floor(+r / 100); (fl[f] = fl[f] || {})[+r % 100] = r; });
    let h = `<div class="bp-in"><h3>🗺 작업객실 고르기 <button data-bp="x" aria-label="닫기">✕</button></h3>
      <div class="bp-f"><label class="w">작업 내용<input type="text" id="bpN" maxlength="20" placeholder="예: 도배 · 욕실타일 매지 보수" value="${esc(P.name)}"></label>
      <label>시작<input type="date" id="bpF" value="${esc(P.from)}"></label><label>끝 (이 날까지 미판매 · 미정비)<input type="date" id="bpT" value="${esc(P.to)}"></label>
      <label class="bp-ck"><input type="checkbox" id="bpP" ${P.prio ? 'checked' : ''}> 끝난 다음 날 첫 정비는 우선정비(14시까지)</label></div>
      <details><summary>💬 시설팀 카톡 메시지로 넣기 (선택)</summary><textarea id="bpM" placeholder="예) 도배 1305-1311, 1403 (8실) 16~30일"></textarea><button class="s" data-bp="msg" style="margin-top:6px">읽어서 도면에 칠하기</button></details>
      <div class="bp-bar"><span class="n" id="bp-sum">선택 <b>${n()}</b>실</span><button class="s" data-bp="none">모두 지우기</button><button class="s" data-bp="reset">처음대로</button></div>
      <div class="bp-mode"><span>네모로 끌면</span><button class="s" data-bp="mode" data-v="in" aria-pressed="${P.mode === 'in'}">⊕ 넣기</button><button class="s" data-bp="mode" data-v="out" aria-pressed="${P.mode === 'out'}">⊖ 빼기</button></div>
      <p class="bp-note">칸 하나는 <b>누르면</b> 넣기 ↔ 빼기. 빈 곳(도면 바깥 여백 포함)부터 <b>네모를 그리듯 끌면</b> 그 안의 객실이 한꺼번에 들어가요(⊕)·빠져요(⊖). <b>층 번호</b>·<b>위 호수 번호(1~17)</b>를 누르면 그 층 · 그 호수 줄 전체.</p>
      <div class="bp-lg"><span><i style="background:#F97316"></i>이 작업</span>${Object.keys(P.other).length ? '<span><i style="background-image:repeating-linear-gradient(45deg,rgba(29,58,110,.35) 0 3px,#E9EEF5 3px 6px)"></i>다른 작업 중</span>' : ''}</div>
      <div id="bp-area"><div id="bp-rect"></div><div class="bp" id="bp"><span></span>`;
    for (let l = 1; l <= 17; l++) h += `<button data-bp="line" data-v="${l}" aria-label="모든 층 ${l}호">${l}</button>`;
    FS.forEach(f => {
      h += `<button data-bp="floor" data-v="${f}">${f}F</button>`;
      for (let l = 1; l <= 17; l++) { const r = fl[f][l]; h += r ? `<i class="pc${P.set[r] ? ' on' : ''}${P.other[r] ? ' other' : ''}" data-r="${r}" title="${r}${P.other[r] ? ' · ' + esc(P.other[r]) : ''}">${String(l).padStart(2, '0')}</i>` : '<span class="e"></span>'; }
    });
    h += `</div></div>${P.err ? `<p class="bp-err">${esc(P.err)}</p>` : ''}
      <div class="bp-act"><button data-bp="x">취소</button><button class="go" data-bp="save">✅ ${n()}실 저장${P.from && P.to ? ' · ' + md(P.from) + '~' + md(P.to) : ''}</button></div></div>`;
    const y = box.scrollTop; box.innerHTML = h; box.scrollTop = y;
  }
  const sum = () => { const e = box.querySelector('#bp-sum'); if (e) e.innerHTML = `선택 <b>${n()}</b>실`; const g = box.querySelector('[data-bp="save"]'); if (g) g.textContent = `✅ ${n()}실 저장${P.from && P.to ? ' · ' + md(P.from) + '~' + md(P.to) : ''}`; };
  const paint = (el, on) => { const r = el.getAttribute('data-r'); if (!r) return; if (on) P.set[r] = 1; else delete P.set[r]; el.classList.toggle('on', !!on); };
  const group = test => { const els = [...box.querySelectorAll('#bp .pc')].filter(e => test(e.getAttribute('data-r'))); const all = els.length && els.every(e => P.set[e.getAttribute('data-r')]); els.forEach(e => paint(e, !all)); buzz(15); sum(); };
  box.addEventListener('click', e => {
    if (e.target === box) { read(); close(null); return; }
    const b = e.target.closest('[data-bp]'); if (!b) return;
    const a = b.dataset.bp, v = b.dataset.v;
    if (a === 'x') { close(null); return; }
    read();
    if (a === 'mode') { P.mode = v; draw(); return; }
    if (a === 'none') { P.set = {}; draw(); return; }
    if (a === 'reset') { P.set = {}; P.orig.forEach(r => { P.set[r] = 1; }); draw(); return; }
    if (a === 'floor') { group(r => Math.floor(+r / 100) === +v); return; }
    if (a === 'line') { group(r => +r % 100 === +v); return; }
    if (a === 'msg') {
      const t = (box.querySelector('#bpM') || {}).value || '', G = parseMsg(t, P.from || o.base || '');
      if (!G.length) { P.err = '메시지에서 객실 번호를 못 찾았어요. 예) 1305-1311, 1403'; draw(); return; }
      G.forEach(g => g.rooms.forEach(r => { P.set[r] = 1; }));
      if (!P.name) P.name = G[0].name || '';
      if (G[0].from) { P.from = G[0].from; P.to = G.reduce((m, g) => (g.to > m ? g.to : m), G[0].to || G[0].from); }
      const bad = G.flatMap(g => g.bad);
      P.err = bad.length ? '없는 객실 번호는 뺐어요: ' + bad.slice(0, 6).join(', ') : ''; draw(); return;
    }
    if (a === 'save') {
      const rooms = ALL.filter(r => P.set[r]);
      if (!rooms.length) { P.err = '객실을 하나 이상 골라 주세요.'; draw(); return; }
      if (!P.from || !P.to) { P.err = '시작 · 끝 날짜를 넣어 주세요.'; draw(); return; }
      if (P.to < P.from) { P.err = '끝 날짜가 시작보다 빨라요.'; draw(); return; }
      close({ name: (P.name || '시설 작업').slice(0, 20), rooms, from: P.from, to: P.to, prio: P.prio });
    }
  });
  box.addEventListener('change', e => { if (e.target.id === 'bpF' || e.target.id === 'bpT') { read(); if (P.from && (!P.to || P.to < P.from)) { P.to = P.from; const t = box.querySelector('#bpT'); if (t) t.value = P.to; } sum(); } });
  // 네모 끌기 · 칸 누르기 (활동판과 같은 방식)
  let drag = null;
  const hit = d => { const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1); return d.cells.filter(c => c.r.right > x0 && c.r.left < x1 && c.r.bottom > y0 && c.r.top < y1); };
  const show = d => {
    const area = box.querySelector('#bp-area'), rc = box.querySelector('#bp-rect'); if (!area || !rc) return;
    const a = area.getBoundingClientRect(); rc.style.display = 'block'; rc.className = P.mode === 'out' ? 'out' : '';
    rc.style.left = (Math.min(d.x0, d.x1) - a.left) + 'px'; rc.style.top = (Math.min(d.y0, d.y1) - a.top) + 'px';
    rc.style.width = Math.abs(d.x1 - d.x0) + 'px'; rc.style.height = Math.abs(d.y1 - d.y0) + 'px';
    const H = {}; hit(d).forEach(c => { H[c.id] = 1; });
    d.cells.forEach(c => { c.el.classList.toggle('sel', !!H[c.id]); c.el.classList.toggle('out', !!H[c.id] && P.mode === 'out'); });
  };
  function down(e) {
    if (e.button > 0) return;
    const area = e.target.closest && e.target.closest('#bpk #bp-area'); if (!area || e.target.closest('[data-bp]')) return;
    e.preventDefault(); read();
    drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, cell: e.target.closest('#bp .pc'), moved: false,
      cells: [...box.querySelectorAll('#bp .pc')].map(el => ({ el, id: el.getAttribute('data-r'), r: el.getBoundingClientRect() })) };
    try { area.setPointerCapture(e.pointerId); } catch (x) {}
  }
  function move(e) {
    if (!drag) return; drag.x1 = e.clientX; drag.y1 = e.clientY;
    if (!drag.moved && Math.abs(drag.x1 - drag.x0) + Math.abs(drag.y1 - drag.y0) < 6) return;
    drag.moved = true; if (!drag.raf) drag.raf = requestAnimationFrame(() => { if (drag) { drag.raf = 0; show(drag); } });
  }
  function up() {
    const d = drag; drag = null; if (!d) return;
    const rc = box.querySelector('#bp-rect'); if (rc) rc.style.display = 'none';
    d.cells.forEach(c => c.el.classList.remove('sel', 'out'));
    if (!d.moved) { if (d.cell) { paint(d.cell, !P.set[d.cell.getAttribute('data-r')]); buzz(15); sum(); } return; }
    const on = P.mode !== 'out', H = hit(d); H.forEach(c => paint(c.el, on)); if (H.length) buzz(20); sum();
  }
  const key = e => { if (e.key === 'Escape') close(null); };
  document.addEventListener('pointerdown', down); document.addEventListener('pointermove', move);
  ['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, up)); document.addEventListener('keydown', key);
  draw();
  return out;
}
