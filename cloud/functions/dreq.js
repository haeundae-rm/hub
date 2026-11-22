// 🔔 더티 요청 푸시 — 보낼지 · 누구에게 · 무슨 글을 정하는 부분 (Firebase 없이 시험할 수 있게 따로 둠)
// 2026-11-22. 요청 문서 = sup/{날짜}/req/{메이드} (rm/app/dreq.js 가 씀), 휴대폰 = push/{uid} {app:'dirty', name, token, at}

const DAY = 24 * 3600e3;
const FRESH = 30 * 60e3;   // 30분보다 오래된 요청은 보내지 않음 (함수가 늦게 돌거나 다시 돌 때)
const KEEP = 21 * DAY;     // 3주 넘게 앱을 안 연 휴대폰은 빼고 보냄

const ms = v => {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  const n = Date.parse(v); return isNaN(n) ? 0 : n;
};
const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * before/after = 요청 문서 (없으면 null), phones = [{id, data}] push 문서들, now = 밀리초
 * → null (안 보냄) 또는 { title, body, tag, url, targets: [{token, ids:[문서 id…]}], names }
 */
function plan(before, after, phones, now) {
  if (!after) return null;                                  // 지워짐
  const n = Number(after.n) || 0;
  if (before && (Number(before.n) || 0) >= n) return null;  // 새 요청이 아님 (다른 칸만 바뀜)
  const at = ms(after.at);
  if (at && now - at > FRESH) return null;
  const maid = clip(after.maid, 20);
  if (!maid) return null;
  const ws = (Array.isArray(after.ws) ? after.ws : []).map(w => clip(w, 20)).filter(Boolean);
  const byTok = {};
  (phones || []).forEach(p => {
    const d = p && p.data; if (!d || d.app !== 'dirty') return;
    const name = clip(d.name, 20), tok = String(d.token || '');
    if (!tok || ws.indexOf(name) < 0) return;
    if (now - ms(d.at) > KEEP) return;
    (byTok[tok] = byTok[tok] || []).push(p.id);   // 같은 휴대폰이 문서 두 개(관리자 모드 껐다 켬 등)여도 한 번만
  });
  const names = (Array.isArray(after.names) && after.names.length ? after.names : [maid]).map(x => clip(x, 20)).filter(Boolean);
  const rooms = (Array.isArray(after.rooms) ? after.rooms : []).map(r => clip(r, 6)).filter(Boolean).slice(0, 2);
  return {
    title: '🔔 ' + names.join('·') + ' 님 더티 요청',
    body: (rooms.length ? '먼저 할 방 ' + rooms.join(', ') : '먼저 할 방은 안 골랐어요') + (n > 1 ? ' · 오늘 ' + n + '번째' : '') + ' — 눌러서 정비 지원 열기',
    tag: 'dreq-' + maid,
    url: 'https://haeundae-rm.github.io/dirty/',
    names: ws,
    targets: Object.keys(byTok).map(token => ({ token, ids: byTok[token] }))
  };
}

// 이 오류면 그 휴대폰은 더 이상 받을 수 없음 → push 문서 지움
const DEAD = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'];
const dead = code => DEAD.indexOf(code) >= 0;

module.exports = { plan, dead, FRESH, KEEP };
