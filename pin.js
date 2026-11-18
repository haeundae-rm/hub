// 🔒 화면 비밀번호 (2026-11-18) — 허브 '인사' · '연차 · 근무'(hub/leave/) 들어갈 때 4자리
// 허브는 관리자뿐 아니라 하우스키퍼(야간 방배정 · 오더테이커)도 보므로, 개인정보가 있는 화면 앞에 한 번 더 묻기
// ※ '가리기' 수준: 같은 관리자 로그인이면 Firestore 권한은 그대로라 기술적으로 우회할 수 있음 → 진짜 잠금은 하우스키퍼 전용 계정 + 보안 규칙(다음 단계)
// 저장: uploads/hubpin { csv:'', salt, h = SHA-256(salt:pin) } — uploads 는 관리자만 읽는 곳 (규칙 v14 그대로, 코드·저장소엔 비밀번호 없음)
// 한 번 맞히면 이 탭에서 30분 동안 다시 안 물음 (sessionStorage). 5번 틀리면 이 기기에서 5분 잠금
import * as S from '../rm/app/store.js';

const DOC = 'uploads/hubpin', OK_KEY = 'hub_pin_ok', FAIL_KEY = 'hub_pin_fail', KEEP = 30 * 60e3, LOCK = 5 * 60e3;
const ss = { get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} } };
const ls = { get: k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
async function sha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(b)).map(x => ('0' + x.toString(16)).slice(-2)).join(''); }
export function passed() { return Number(ss.get(OK_KEY) || 0) > Date.now(); }
function mark() { ss.set(OK_KEY, String(Date.now() + KEEP)); }
export function forget() { ss.set(OK_KEY, '0'); }

function css() {
  if (document.getElementById('pncss')) return;
  const st = document.createElement('style'); st.id = 'pncss';
  st.textContent = '.pn-bg{position:fixed;inset:0;z-index:90;background:rgba(14,30,54,.55);display:flex;align-items:center;justify-content:center;padding:16px;font-family:"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif}' +
    '.pn-box{width:100%;max-width:340px;background:#fff;border-radius:20px;padding:20px 18px;box-shadow:0 12px 40px rgba(0,0,0,.25);color:#111827}' +
    '.pn-box h3{margin:0 0 4px;font-size:18px}.pn-box p{margin:0 0 12px;font-size:13.5px;color:#4B5563;line-height:1.5}' +
    '.pn-in{display:block;width:100%;text-align:center;font-size:28px;letter-spacing:14px;padding:10px;border:2px solid #E5E8EE;border-radius:14px;font-family:inherit;margin:0 0 10px}' +
    '.pn-in:focus{outline:none;border-color:#1D3A6E}.pn-err{color:#B23A48;font-weight:700;font-size:14px;min-height:20px;margin:0 0 8px}' +
    '.pn-row{display:flex;gap:8px}.pn-row button{flex:1;min-height:50px;border-radius:14px;border:0;font-family:inherit;font-weight:800;font-size:16px;cursor:pointer}' +
    '.pn-go{background:#1D3A6E;color:#fff}.pn-no{background:#F2F5FA;color:#111827}';
  document.head.appendChild(st);
}
// 상자 하나: steps = [{ title, text }] 를 차례로 묻고 값 배열을 돌려줌 (취소면 null)
function ask(steps, check) {
  css();
  return new Promise(res => {
    const bg = document.createElement('div'); bg.className = 'pn-bg';
    let i = 0, vals = [];
    const draw = err => {
      const s = steps[i];
      bg.innerHTML = '<div class="pn-box" role="dialog" aria-modal="true"><h3>🔒 ' + s.title + '</h3><p>' + s.text + '</p>' +
        '<input class="pn-in" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" aria-label="비밀번호 4자리">' +
        '<p class="pn-err">' + (err || '') + '</p><div class="pn-row"><button class="pn-no">취소</button><button class="pn-go">확인</button></div></div>';
      const inp = bg.querySelector('.pn-in');
      setTimeout(() => inp.focus(), 30);
      const go = async () => {
        const v = inp.value.trim();
        if (!/^\d{4}$/.test(v)) { draw('숫자 4자리를 넣어 주세요.'); return; }
        vals.push(v);
        if (i < steps.length - 1) { i++; draw(''); return; }
        const e = check ? await check(vals) : '';
        if (e) { i = 0; vals = []; draw(e); return; }
        bg.remove(); res(vals);
      };
      inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 4); if (inp.value.length === 4) go(); });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      bg.querySelector('.pn-go').onclick = go;
      bg.querySelector('.pn-no').onclick = () => { bg.remove(); res(null); };
    };
    document.body.appendChild(bg); draw('');
  });
}
async function readDoc() { const d = await S.get(DOC); return d && d.h && d.salt ? d : null; }
async function save(pin) {
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(12))).map(x => ('0' + x.toString(16)).slice(-2)).join('');
  await S.set(DOC, { csv: '', kind: 'hubpin', salt, h: await sha(salt + ':' + pin), at: S.SERVER_TIME });
}
function locked() { const f = ls.get(FAIL_KEY) || { n: 0, t: 0 }; return f.n >= 5 && Date.now() - f.t < LOCK ? Math.ceil((LOCK - (Date.now() - f.t)) / 60000) : 0; }
function fail() { const f = ls.get(FAIL_KEY) || { n: 0, t: 0 }; const n = Date.now() - f.t < LOCK ? f.n + 1 : 1; ls.set(FAIL_KEY, { n, t: Date.now() }); return n; }

/** 들어가기 전에 부름 → true 면 통과. what = '인사' 같은 화면 이름 */
export async function gate(what) {
  if (passed()) return true;
  let d;
  try { d = await readDoc(); } catch (e) { alert('비밀번호 확인을 못 했어요. 인터넷을 확인하고 다시 눌러 주세요.'); return false; }
  if (!d) {   // 처음: 소장님이 정함
    const v = await ask([{ title: '화면 비밀번호 정하기', text: '인사 · 연차 화면에 들어갈 때 물어볼 숫자 4자리를 정해 주세요. 하우스키퍼 등 다른 분께는 알려 주지 마세요.' },
      { title: '한 번 더', text: '같은 숫자 4자리를 다시 넣어 주세요.' }], v => (v[0] !== v[1] ? '두 번 넣은 숫자가 달라요. 처음부터 다시 넣어 주세요.' : ''));
    if (!v) return false;
    try { await save(v[0]); } catch (e) { alert('저장하지 못했어요: ' + (e && (e.code || e.message) || e)); return false; }
    mark(); return true;
  }
  const lk = locked();
  if (lk) { alert('비밀번호를 여러 번 틀렸어요. ' + lk + '분 뒤에 다시 해 주세요.'); return false; }
  const v = await ask([{ title: what + ' 화면 비밀번호', text: '개인정보가 있는 화면이에요. 숫자 4자리를 넣어 주세요.' }], async v => {
    if (await sha(d.salt + ':' + v[0]) === d.h) return '';
    const n = fail();
    if (n >= 5) return '5번 틀렸어요. 5분 뒤에 다시 해 주세요.';
    return '비밀번호가 맞지 않아요. (' + n + '/5)';
  });
  if (!v || locked()) return false;
  ls.set(FAIL_KEY, { n: 0, t: 0 }); mark(); return true;
}
/** 비밀번호 바꾸기 (지금 비밀번호 확인 → 새로 두 번) */
export async function change() {
  let d;
  try { d = await readDoc(); } catch (e) { alert('인터넷을 확인해 주세요.'); return false; }
  const steps = (d ? [{ title: '지금 비밀번호', text: '바꾸기 전에 지금 비밀번호를 넣어 주세요.' }] : [])
    .concat([{ title: '새 비밀번호', text: '새 숫자 4자리를 넣어 주세요.' }, { title: '한 번 더', text: '새 숫자 4자리를 다시 넣어 주세요.' }]);
  const v = await ask(steps, async v => {
    if (d && await sha(d.salt + ':' + v[0]) !== d.h) return '지금 비밀번호가 맞지 않아요.';
    const a = v[v.length - 2], b = v[v.length - 1];
    return a !== b ? '새로 넣은 두 숫자가 달라요.' : '';
  });
  if (!v) return false;
  try { await save(v[v.length - 1]); } catch (e) { alert('저장하지 못했어요: ' + (e && (e.code || e.message) || e)); return false; }
  mark(); alert('화면 비밀번호를 바꿨어요.'); return true;
}
