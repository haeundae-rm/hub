// 🔍 인스펙션 카톡 공유 이미지 — 사진 + 지적 문구를 한 장으로 (폭 1080px 고정, 12장 넘으면 다음 장)
// 사진 모양대로 빈틈없이 줄 맞춤(정렬 배치): 한 줄 사진은 높이가 같고 폭을 꽉 채움 → 회색 여백 없음, 사진은 안 자름
// 세로 사진은 세로끼리, 가로 사진은 가로끼리 묶어 줄을 만들고, 번호는 사진 왼쪽 위 빨간 동그라미 + 줄 아래 문구
const W = 1080, P = 28, G = 14, IW = W - P * 2 - 32, PER = 12;
const T = 560, HMIN = 330, HMAX = 720;   // 한 줄 사진 높이: 목표·최소·최대
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
const ar = it => (it.img && it.img.width && it.img.height) ? it.img.width / it.img.height : 0.75;
// 순서대로 놓인 사진들을 줄로 나눔 (줄 높이가 목표 T 에 가깝도록, 동적계획법)
function split(list) {
  const n = list.length, best = [0], cut = [0];
  const hOf = (i, j) => { let a = 0; for (let k = i; k < j; k++) a += ar(list[k]); return (IW - G * (j - i - 1)) / a; };
  const cost = (i, j) => { const h = hOf(i, j); if (j - i > 5) return 1e12; if (h > HMAX) return Math.pow((h - HMAX) * 2.5, 2) + Math.pow(HMAX - T, 2); if (h < HMIN) return Math.pow((HMIN - h) * 4, 2) + Math.pow(T - HMIN, 2); return Math.pow(h - T, 2); };
  for (let j = 1; j <= n; j++) { best[j] = Infinity; for (let i = Math.max(0, j - 5); i < j; i++) { const v = best[i] + cost(i, j); if (v < best[j]) { best[j] = v; cut[j] = i; } } }
  const rows = []; for (let j = n; j > 0; j = cut[j]) rows.unshift(list.slice(cut[j], j));
  return rows.map(r => ({ its: r, h: Math.min(HMAX, (IW - G * (r.length - 1)) / r.reduce((s, it) => s + ar(it), 0)) }));
}
// 세로·가로 나눠 각각 줄을 만든 뒤, 줄 안 가장 작은 번호 순으로 다시 늘어놓음
function layout(its) {
  const tall = its.filter(it => ar(it) < 1), wide = its.filter(it => ar(it) >= 1);
  const rows = split(tall).concat(split(wide));
  if (tall.length && wide.length) {   // 섞어 놓는 게 더 나으면(한쪽이 1장뿐 등) 순서대로 한 번에
    const one = split(its), sc = rs => rs.reduce((s, r) => s + Math.abs(r.h - T), 0) / rs.length;
    if (sc(one) < sc(rows) * 0.8) return one;
  }
  return rows.sort((a, b) => a.its[0].no - b.its[0].no);
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
    const rows = layout(its).map(r => { const s = r.its.slice().sort((a, b) => a.no - b.no); return { h: Math.floor(r.h), its: s, lines: s.map(it => wrap(m, it.t || '(문구 없음)', IW - 70)) }; });
    const rowH = r => 16 + r.h + 14 + r.lines.reduce((s, l) => s + l.length * 46 + 8, 0) + 10;
    const extra = last ? (x.extra || []).filter(Boolean) : [];
    font(m, 34, 700);
    const exLines = extra.map(t => wrap(m, '• ' + t, W - P * 2 - 40));
    const top = 230;
    let H = top + rows.reduce((s, r) => s + rowH(r) + 20, 0);
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
    const badge = (bx, by, no, r) => {
      c.fillStyle = '#fff'; c.beginPath(); c.arc(bx, by, r + 4, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#B42318'; c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2); c.fill();
      c.textAlign = 'center'; font(c, Math.round(r * 1.15), 900); c.fillStyle = '#fff'; c.fillText(String(no), bx, by + r * 0.42); c.textAlign = 'left';
    };
    // 사진 줄 (흰 카드 한 장 = 사진 한 줄 + 그 줄 문구)
    let y = top;
    rows.forEach(r => {
      const h = rowH(r), ws = r.its.map(it => Math.round(r.h * ar(it))), tw = ws.reduce((s, w) => s + w, 0) + G * (ws.length - 1);
      c.fillStyle = '#fff'; rr(c, P, y, W - P * 2, h, 22); c.fill();
      let px = P + 16 + Math.round((IW - tw) / 2);   // 최대 높이에 걸린 줄만 가운데 (나머지는 폭이 꼭 맞음)
      r.its.forEach((it, i) => {
        c.save(); rr(c, px, y + 16, ws[i], r.h, 14); c.clip();
        c.fillStyle = '#E4E8EF'; c.fillRect(px, y + 16, ws[i], r.h);
        if (it.img) c.drawImage(it.img, px, y + 16, ws[i], r.h);
        c.restore();
        badge(px + 34, y + 50, it.no, 24);
        px += ws[i] + G;
      });
      let ty = y + 16 + r.h + 14;
      r.its.forEach((it, k) => {
        badge(P + 16 + 22, ty + 26, it.no, 20);
        font(c, 34, 700); c.fillStyle = '#14213D';
        r.lines[k].forEach((l, j) => c.fillText(l, P + 16 + 62, ty + 38 + j * 46));
        ty += r.lines[k].length * 46 + 8;
      });
      y += h + 20;
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
