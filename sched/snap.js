// hub/sched/snap.js — 🖼️ 표를 이미지(PNG)로 만들어 카톡 등으로 공유 (2026-11-22)
// 화면의 표(가로로 넘치는 것 포함)를 통째로 복사해 흰 바탕 카드(제목 · 설명 · 날짜)에 넣고 2배 해상도로 찍음
// 휴대폰: 공유창(카톡 · 문자 등)이 바로 뜸 / PC · 공유가 안 되는 곳: PNG 파일로 내려받음
// 쓰는 곳: sched/sched.js (편성 화면 누적 현황) · sched/view.js (보기 화면 누적 현황)
const H2C = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
let loading = null;
const load = () => loading || (loading = new Promise((res, rej) => {
  if (window.html2canvas) return res(window.html2canvas);
  const s = document.createElement('script'); s.src = H2C; s.onload = () => res(window.html2canvas); s.onerror = () => { loading = null; rej(new Error('이미지 도구를 불러오지 못했어요 (인터넷 연결 확인)')); };
  document.head.appendChild(s);
}));
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = t => { const el = document.createElement('div'); el.textContent = t; el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#10233F;color:#fff;padding:10px 16px;border-radius:12px;font-weight:700;z-index:99;font-family:inherit'; document.body.appendChild(el); setTimeout(() => el.remove(), 2600); };

export async function snap(table, title, sub) {
  if (!table) return;
  toast('이미지 만드는 중…');
  let h2c;
  try { h2c = await load(); } catch (e) { toast(e.message); return; }
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:-10000px;top:0;background:#fff;padding:22px 24px 16px;width:max-content;font-family:"Noto Sans KR","Malgun Gothic",sans-serif;color:#141B2D';
  const t = new Date(Date.now() + 9 * 3600e3).toISOString();
  wrap.innerHTML = '<div style="font-size:12px;font-weight:700;color:#8A6D2F;margin:0 0 4px">한화리조트 해운대 · 객실 하우스키핑</div>' +
    '<div style="font-size:22px;font-weight:900;color:#10233F;margin:0 0 4px">' + esc(title) + '</div>' +
    (sub ? '<div style="font-size:12.5px;color:#5A6472;margin:0 0 12px">' + esc(sub) + '</div>' : '') +
    '<div class="snapT" style="border:1.5px solid #10233F;border-radius:10px;overflow:hidden"></div>' +
    '<div style="font-size:11px;color:#8C99A8;margin-top:8px;text-align:right">' + t.slice(0, 10).replace(/-/g, '.') + ' ' + t.slice(11, 16) + ' 기준 · 객실 통합 관리 시스템</div>';
  const cl = table.cloneNode(true);
  cl.style.width = 'max-content'; cl.style.minWidth = '0';
  cl.querySelectorAll('th,td').forEach(c => { c.style.position = 'static'; });   // 붙박이(sticky) 칸이 겹치지 않게
  wrap.querySelector('.snapT').appendChild(cl);
  document.body.appendChild(wrap);
  try {
    const canvas = await h2c(wrap, { scale: 2, backgroundColor: '#ffffff', logging: false });
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    const name = title.replace(/[\\/:*?"<>|\s]+/g, '_') + '.png';
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      try { await navigator.share({ files: [file], title }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('이미지를 내려받았어요 — 카톡에 끌어다 놓으면 돼요');
  } catch (e) { toast('이미지를 만들지 못했어요: ' + (e.message || e)); }
  finally { wrap.remove(); }
}
