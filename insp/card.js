// 🔍 인스펙션 카톡 공유 이미지 — 사진 + 사진별 지적 문구를 한 장으로 (폭 1080px 고정, 사진이 많으면 세로로 길어지고 8장 넘으면 다음 장)
// 사진·글자 크기는 사진 수와 상관없이 늘 같음 → 지적이 많아도 작아지지 않음
const W = 1080, P = 28, G = 20, CW = (W - P * 2 - G) / 2, PH = Math.round(CW * 4 / 3), PER = 8;
const FF = "'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif";
const font = (c, sz, w) => { c.font = w + ' ' + sz + 'px ' + FF; };
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function wrap(c, text, maxW) {   // 띄어쓰기 단위로 줄바꿈, 한 낱말이 너무 길면 글자 단위
  const out = []; let cur = '';
  String(text || '').split(/(\s+)/).forEach(w => {
    if (!w) return;
    const t = cur + w;
    if (c.measureText(t).width <= maxW) { cur = t; return; }
    if (cur.trim()) out.push(cur.trim());
    cur = w.trim() ? w : '';
    while (c.measureText(cur).width > maxW) { let k = cur.length; while (k > 1 && c.measureText(cur.slice(0, k)).width > maxW) k--; out.push(cur.slice(0, k)); cur = cur.slice(k); }
  });
  if (cur.trim()) out.push(cur.trim());
  return out.length ? out : [''];
}
// x = { date, room, maid, by, time, close, items:[{img(ImageBitmap|HTMLImageElement), t, no}], extra:[글], roomImg }
// 돌려줌: canvas 배열 (한 장 또는 여러 장)
export function makeCards(x) {
  const items = x.items || [], pages = [];
  for (let i = 0; i < Math.max(1, items.length); i += PER) pages.push(items.slice(i, i + PER));
  const m = document.createElement('canvas').getContext('2d');
  return pages.map((its, pi) => {
    const last = pi === pages.length - 1;
    font(m, 34, 700);
    const cells = its.map(it => ({ it, lines: wrap(m, it.t || '(문구 없음)', CW - 76) }));
    const rows = [];
    for (let i = 0; i < cells.length; i += 2) rows.push(cells.slice(i, i + 2));
    const rowH = r => PH + 24 + Math.max(...r.map(c => c.lines.length)) * 46 + 24;
    const extra = last ? (x.extra || []).filter(Boolean) : [];
    font(m, 34, 700);
    const exLines = extra.map(t => wrap(m, '• ' + t, W - P * 2 - 40));
    const top = 230;
    let H = top + rows.reduce((s, r) => s + rowH(r) + G, 0);
    if (extra.length) H += 70 + exLines.reduce((s, l) => s + l.length * 48, 0) + 10;
    if (last) H += 120;
    H += P;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = Math.max(H, 400);
    const c = cv.getContext('2d'); c.textBaseline = 'alphabetic';
    c.fillStyle = '#F4F6F9'; c.fillRect(0, 0, W, cv.height);
    // 머리
    c.fillStyle = '#10233F'; c.fillRect(0, 0, W, 200); c.fillStyle = '#C9A961'; c.fillRect(0, 200, W, 8);
    const d = x.date, wd = DAYS[new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8))).getUTCDay()];
    font(c, 30, 700); c.fillStyle = '#C9A961'; c.fillText('한화리조트 해운대 · 객실 인스펙션' + (pages.length > 1 ? '  (' + (pi + 1) + '/' + pages.length + ')' : ''), P, 54);
    font(c, 76, 900); c.fillStyle = '#fff'; c.fillText(x.room + '호', P, 138);
    const rw = c.measureText(x.room + '호').width;
    font(c, 44, 800); c.fillStyle = '#fff'; c.fillText(x.maid ? x.maid + ' 메이드님' : '', P + rw + 26, 136);
    font(c, 30, 600); c.fillStyle = '#C9D3E3';
    c.fillText(Number(d.slice(5, 7)) + '/' + Number(d.slice(8)) + ' (' + wd + ') ' + (x.time || '') + ' · 점검 ' + (x.by || '') + ' · 지적 ' + (x.n || 0) + '건', P, 184);
    // 사진 칸
    let y = top;
    rows.forEach(r => {
      const h = rowH(r);
      r.forEach((cell, i) => {
        const cx = P + i * (CW + G), it = cell.it;
        c.fillStyle = '#fff'; rr(c, cx, y, CW, h, 22); c.fill();
        c.save(); rr(c, cx, y, CW, PH, 22); c.clip();
        c.fillStyle = '#E4E8EF'; c.fillRect(cx, y, CW, PH);
        if (it.img) {   // 잘리지 않게 칸 안에 맞춤 (세로 사진 3:4 는 꽉 참)
          const iw = it.img.width, ih = it.img.height, s = Math.min(CW / iw, PH / ih), dw = iw * s, dh = ih * s;
          c.drawImage(it.img, cx + (CW - dw) / 2, y + (PH - dh) / 2, dw, dh);
        }
        c.restore();
        c.fillStyle = '#B42318'; c.beginPath(); c.arc(cx + 40, y + PH + 50, 24, 0, Math.PI * 2); c.fill();
        c.textAlign = 'center'; font(c, 28, 900); c.fillStyle = '#fff'; c.fillText(String(it.no), cx + 40, y + PH + 60); c.textAlign = 'left';
        font(c, 34, 700); c.fillStyle = '#14213D';
        cell.lines.forEach((l, k) => c.fillText(l, cx + 76, y + PH + 62 + k * 46));
      });
      y += h + G;
    });
    if (extra.length) {
      font(c, 34, 900); c.fillStyle = '#10233F'; c.fillText('사진 없는 지적', P, y + 44); y += 70;
      font(c, 34, 700); c.fillStyle = '#14213D';
      exLines.forEach(ls => ls.forEach(l => { c.fillText(l, P + 10, y + 34); y += 48; }));
      y += 10;
    }
    if (last) {
      const redo = x.close === '재정비', none = !x.n;
      c.fillStyle = redo ? '#FDEDEF' : '#E8F5EC'; rr(c, P, y + 10, W - P * 2, 96, 20); c.fill();
      font(c, 40, 900); c.fillStyle = redo ? '#B42318' : '#1E8E3E';
      c.fillText(none ? '✅ 이상 없음' : redo ? '🔧 재정비 요청 드립니다' : '✅ 수정완료', P + 30, y + 72);
    }
    return cv;
  });
}
// 카톡에 그대로 붙여넣는 글 (지금 카톡방 형식)
export function makeText(x) {
  const L = (x.items || []).map(it => it.t).concat(x.extra || []).filter(Boolean);
  return x.room + '호' + (x.maid ? ' ' + x.maid + ' 메이드님' : '') + '\n\n' + (L.length ? L.map(t => '- ' + t).join('\n') + '\n\n' : '') +
    (!L.length ? '이상 없음' : x.close === '재정비' ? '재정비 요청 드립니다' : '수정완료');
}
