// 📷 연속 촬영 (2026-11-15) — 앱 안 카메라: 셔터만 계속 누르면 사진이 쌓이고, 찍는 동안 뒤에서 바로 판독 시작
// · 기본 카메라 앱처럼 한 장마다 앱을 오가지 않음
// · 가능하면 ImageCapture.takePhoto() (카메라 원래 해상도), 안 되면 화면(최대 1920) 캡처
// · 화면이 잠기면 카메라가 꺼지고, 다시 켜면 자동으로 다시 켜짐
// openCam({ onShot(blob) => Promise, onDone() }) — 안 되는 기기면 false 를 돌려줌 (그때는 기본 카메라 사용)
let st = null;

export function camOk() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }

async function start() {
  stop(true);
  const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 4032 }, height: { ideal: 3024 } } });
  st.stream = s;
  const v = st.el.querySelector('video'); v.srcObject = s; await v.play().catch(() => {});
  const tr = s.getVideoTracks()[0];
  st.ic = window.ImageCapture ? new ImageCapture(tr) : null;
  try { const c = tr.getCapabilities && tr.getCapabilities(); if (c && c.focusMode && c.focusMode.includes('continuous')) await tr.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (e) {}
}
function stop(keepUi) {
  if (st && st.stream) { st.stream.getTracks().forEach(t => t.stop()); st.stream = null; }
  if (!keepUi && st) { st.el.remove(); document.removeEventListener('visibilitychange', st.vis); document.body.classList.remove('camming'); st = null; }
}
async function grab() {
  if (st.ic) { try { const b = await st.ic.takePhoto(); if (b && b.size) return b; } catch (e) { st.ic = null; } }
  const v = st.el.querySelector('video'), w = v.videoWidth, h = v.videoHeight;
  const s = Math.min(1, 1920 / Math.max(w, h)), cv = document.createElement('canvas'); cv.width = Math.round(w * s); cv.height = Math.round(h * s);
  cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height);
  return new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9));
}
export async function openCam(o) {
  if (!camOk()) return false;
  const el = document.createElement('div'); el.className = 'camv';
  el.innerHTML = '<video playsinline muted autoplay></video><div class="cam-top"><span class="cam-n">0장</span><span class="cam-msg">계속 눌러 찍어요 · 판독은 뒤에서 바로 시작</span></div>' +
    '<div class="cam-strip"></div><div class="cam-bar"><button class="cam-x" data-c="done">완료</button><button class="cam-shot" data-c="shot" aria-label="찍기"></button><span class="cam-sp"></span></div><div class="cam-flash"></div>';
  document.body.appendChild(el); document.body.classList.add('camming');
  st = { el, n: 0, busy: 0, vis: () => { if (!st) return; if (document.visibilityState === 'hidden') stop(true); else start().catch(() => {}); } };
  document.addEventListener('visibilitychange', st.vis);
  try { await start(); }
  catch (e) { stop(); return false; }
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-c]'); if (!b || !st) return;
    if (b.getAttribute('data-c') === 'done') { const done = o.onDone; stop(); done && done(); return; }
    if (st.busy > 2) return;   // 너무 빨리 연속으로 누르면 잠깐 막음
    st.busy++;
    const f = el.querySelector('.cam-flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
    if (navigator.vibrate) try { navigator.vibrate(20); } catch (x) {}
    try {
      const blob = await grab();
      if (!st) return;
      st.n++; el.querySelector('.cam-n').textContent = st.n + '장';
      const u = URL.createObjectURL(blob), im = document.createElement('img'); im.src = u; el.querySelector('.cam-strip').prepend(im);
      await o.onShot(blob);
    } catch (x) { if (st) el.querySelector('.cam-msg').textContent = '사진을 못 찍었어요 — 다시 눌러 주세요'; }
    finally { if (st) st.busy--; }
  });
  return true;
}
