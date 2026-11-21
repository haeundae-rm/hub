// 🧹 하우스키퍼 연차 현황 (2026-11-21) — 허브 첫 화면 '하우스키퍼' 카드 → 이름 고르기 → 본인 4자리 → 본인 연차만
// 하우스키퍼 공용 계정은 leave_* 를 못 읽음 (규칙 v15). 대신 소장이 연차 관리에서 정한 4자리로 만든 열쇠(SHA-256)가 문서 이름인
//   hk_leave/{열쇠} 한 장만 읽음 (규칙 v25: get 만, 목록 막힘) → 이름과 4자리를 모두 알아야 그 사람 것이 열림
// 발생은 여기서 오늘 날짜로 다시 셈 (룸메이드와 같은 leave.js gen: 첫해 매달 1 · 1년 15 · 2년 15 · 3년 16 …)
// 5번 틀리면 이 기기에서 5분 잠금 (pin.js 와 같은 방식)
import * as S from '../rm/app/store.js';
import * as L from '../rm/app/leave.js';

const FAIL_KEY = 'hk_lv_fail', LOCK = 5 * 60e3;
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n1 = v => String(Math.round(Number(v || 0) * 10) / 10);
const dot = d => (d ? Number(d.slice(0, 4)) + '. ' + Number(d.slice(5, 7)) + '. ' + Number(d.slice(8)) + '.' : '');
const ls = { get: k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

export async function hkKey(name, pin) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('hkleave|' + String(name || '').replace(/\s+/g, '') + '|' + String(pin)));
  return Array.from(new Uint8Array(b)).map(x => ('0' + x.toString(16)).slice(-2)).join('');
}
/** 한 사람 문서 → 화면에 쓸 값 (오늘 기준) */
export function summary(d, asOf) {
  const g = L.gen(d.hire, asOf, d.minus);
  const months = d.months || {}, unpaid = d.unpaid || {};
  const used = L.r1(Object.keys(months).reduce((s, m) => s + Number(months[m] || 0), 0));
  const paid = L.r1(Number(d.paid) || 0);
  const y = asOf.slice(0, 4), yr = [];
  for (let i = 1; i <= 12; i++) { const m = y + '-' + ('0' + i).slice(-2); yr.push({ m, used: months[m] || 0, unpaid: unpaid[m] || 0, fut: m > asOf.slice(0, 7) }); }
  return { gen: L.r1(g.total), used, paid, remain: L.r1(g.total - used - paid), next: g.next, years: g.years, monthly: g.monthly, yr,
    yUsed: L.r1(yr.reduce((s, x) => s + x.used, 0)), yUnpaid: L.r1(yr.reduce((s, x) => s + x.unpaid, 0)) };
}

function css() {
  if (document.getElementById('hklcss')) return;
  const st = document.createElement('style'); st.id = 'hklcss';
  st.textContent = '.hkl-bg{position:fixed;inset:0;z-index:90;background:rgba(14,30,54,.55);display:flex;align-items:center;justify-content:center;padding:14px;font-family:inherit}' +
    '.hkl-box{width:100%;max-width:420px;max-height:92vh;overflow:auto;background:#fff;border-radius:20px;padding:18px 16px;box-shadow:0 12px 40px rgba(0,0,0,.25);color:#111827}' +
    '.hkl-box h3{margin:0 0 4px;font-size:19px}.hkl-box p{margin:0 0 12px;font-size:14px;color:#4B5563;line-height:1.5}' +
    '.hkl-names{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 12px}.hkl-names button{min-height:54px;border-radius:14px;border:2px solid #E5E8EE;background:#F7F9FC;font:inherit;font-size:17px;font-weight:800;cursor:pointer;color:#111827}' +
    '.hkl-names button:disabled{opacity:.45}' +
    '.hkl-in{display:block;width:100%;text-align:center;font-size:30px;letter-spacing:14px;padding:10px;border:2px solid #E5E8EE;border-radius:14px;font-family:inherit;margin:0 0 8px;box-sizing:border-box}' +
    '.hkl-err{color:#B23A48;font-weight:700;font-size:14px;min-height:20px;margin:0 0 8px}' +
    '.hkl-row{display:flex;gap:8px}.hkl-row button{flex:1;min-height:50px;border-radius:14px;border:0;font:inherit;font-weight:800;font-size:16px;cursor:pointer}' +
    '.hkl-go{background:#1D3A6E;color:#fff}.hkl-no{background:#F2F5FA;color:#111827}' +
    '.hkl-kv{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}.hkl-kv div{background:#F2F5FA;border-radius:14px;padding:10px 6px;text-align:center}' +
    '.hkl-kv b{display:block;font-size:26px;font-weight:900;font-variant-numeric:tabular-nums}.hkl-kv span{font-size:12.5px;color:#4B5563;font-weight:700}' +
    '.hkl-kv .rem{background:#1D3A6E;color:#fff}.hkl-kv .rem span{color:#D6E0F0}.hkl-kv .neg b{color:#B23A48}' +
    '.hkl-mo{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin:6px 0 10px}.hkl-mo div{border:1px solid #E5E8EE;border-radius:10px;padding:5px 2px;text-align:center;font-size:12px;color:#4B5563}' +
    '.hkl-mo b{display:block;font-size:16px;color:#111827;font-variant-numeric:tabular-nums}.hkl-mo .fut{background:#F7F9FC;color:#B0B7C3}.hkl-mo .fut b{color:#B0B7C3}' +
    '.hkl-note{font-size:12.5px!important;color:#6B7280!important}';
  document.head.appendChild(st);
}

/** 연차 현황 창 열기 */
export async function open() {
  css();
  const bg = document.createElement('div'); bg.className = 'hkl-bg';
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('.hkl-no')) close(); });
  bg.innerHTML = '<div class="hkl-box"><p>불러오는 중…</p></div>';
  let meta = null;
  try { meta = await S.get('meta/hk_leave'); } catch (e) { console.warn(e); }
  const names = (meta && meta.names) || [];
  if (!names.length) { bg.innerHTML = '<div class="hkl-box"><h3>📅 연차 현황</h3><p>아직 하우스키퍼 연차 명단이 없어요. 소장님께 말씀해 주세요.</p><div class="hkl-row"><button class="hkl-no">닫기</button></div></div>'; return; }
  const pickName = () => {
    bg.innerHTML = '<div class="hkl-box" role="dialog" aria-modal="true"><h3>📅 연차 현황</h3><p>본인 이름을 눌러 주세요.</p><div class="hkl-names">' +
      names.map((x, i) => '<button data-i="' + i + '"' + (x.pin ? '' : ' disabled title="비밀번호를 아직 안 정했어요"') + '>' + esc(x.name) + '</button>').join('') + '</div>' +
      (names.some(x => !x.pin) ? '<p class="hkl-note">흐린 이름은 아직 비밀번호가 없어요. 소장님께 4자리를 받아 주세요.</p>' : '') +
      '<div class="hkl-row"><button class="hkl-no">닫기</button></div></div>';
    bg.querySelectorAll('[data-i]').forEach(b => { b.onclick = () => askPin(names[Number(b.dataset.i)].name, ''); });
  };
  const askPin = (name, err) => {
    const f = ls.get(FAIL_KEY) || { n: 0, until: 0 };
    const locked = f.until > Date.now();
    bg.innerHTML = '<div class="hkl-box" role="dialog" aria-modal="true"><h3>🔒 ' + esc(name) + ' 님</h3><p>본인 비밀번호 4자리를 넣어 주세요.</p>' +
      '<input class="hkl-in" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" aria-label="비밀번호 4자리"' + (locked ? ' disabled' : '') + '>' +
      '<p class="hkl-err">' + esc(locked ? '여러 번 틀려서 ' + Math.ceil((f.until - Date.now()) / 60000) + '분 뒤에 다시 할 수 있어요.' : err) + '</p>' +
      '<div class="hkl-row"><button class="hkl-back" style="background:#F2F5FA">← 이름</button><button class="hkl-go"' + (locked ? ' disabled' : '') + '>확인</button></div></div>';
    const inp = bg.querySelector('.hkl-in');
    bg.querySelector('.hkl-back').onclick = pickName;
    if (locked) return;
    setTimeout(() => inp.focus(), 30);
    let busy = false;
    const go = async () => {
      const v = inp.value.trim();
      if (busy) return;
      if (!/^\d{4}$/.test(v)) { askPin(name, '숫자 4자리를 넣어 주세요.'); return; }
      busy = true;
      let d = null;
      try { d = await S.get('hk_leave/' + await hkKey(name, v)); }
      catch (e) { console.warn(e); d = /permission/i.test(String(e && (e.code || e.message))) ? null : undefined; }
      if (d === undefined) { askPin(name, '인터넷 연결을 확인해 주세요.'); return; }
      if (!d) {
        const n = (f.n || 0) + 1;
        ls.set(FAIL_KEY, n >= 5 ? { n: 0, until: Date.now() + LOCK } : { n, until: 0 });
        askPin(name, '비밀번호가 맞지 않아요.' + (n >= 5 ? '' : ' (' + n + '/5)')); return;
      }
      ls.set(FAIL_KEY, { n: 0, until: 0 });
      show(d);
    };
    inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 4); if (inp.value.length === 4) go(); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    bg.querySelector('.hkl-go').onclick = go;
  };
  const show = d => {
    const asOf = L.today(), s = summary(d, asOf);
    bg.innerHTML = '<div class="hkl-box" role="dialog" aria-modal="true"><h3>📅 ' + esc(d.name) + ' 님 연차</h3><p>' + dot(asOf) + ' 기준 · 입사 ' + dot(d.hire) + (s.years ? ' · 근속 ' + s.years + '년' : ' · 1년 미만') + (d.pre ? ' · 선지급제' : '') + '</p>' +
      '<div class="hkl-kv"><div><b>' + n1(s.gen) + '</b><span>발생</span></div><div><b>' + n1(s.used + s.paid) + '</b><span>사용' + (s.paid ? '·지급' : '') + '</span></div><div class="rem' + (s.remain < 0 ? ' neg' : '') + '"><b>' + n1(s.remain) + '</b><span>남은 연차</span></div></div>' +
      (s.next ? '<p>다음 발생: <b>' + dot(s.next.date) + '</b> · ' + esc(s.next.kind) + ' <b>+' + s.next.n + '</b></p>' : '') +
      '<p style="margin:0;font-weight:800;color:#111827">' + asOf.slice(0, 4) + '년 달마다 사용 <small style="font-weight:600;color:#6B7280">(올해 ' + n1(s.yUsed) + (s.yUnpaid ? ' · 무급 ' + n1(s.yUnpaid) : '') + ')</small></p>' +
      '<div class="hkl-mo">' + s.yr.map((x, i) => '<div class="' + (x.fut ? 'fut' : '') + '">' + (i + 1) + '월<b>' + (x.used ? n1(x.used) : x.fut ? '' : '0') + '</b>' + (x.unpaid ? '<small>무급 ' + n1(x.unpaid) + '</small>' : '') + '</div>').join('') + '</div>' +
      '<p class="hkl-note">발생 = 입사일 기준 (첫해 매달 1일 · 1년 15일 · 2년 15일 · 3년 16일, 2년마다 1일씩 늘어남)' + (d.minus ? ' · 첫해 ' + d.minus + '일 빠짐' : '') + '. 남은 연차 = 발생 − 사용' + (s.paid ? ' − 회사 지급' : '') + '. 숫자가 다르면 소장님께 말씀해 주세요.</p>' +
      '<div class="hkl-row"><button class="hkl-no">닫기</button></div></div>';
  };
  pickName();
}
