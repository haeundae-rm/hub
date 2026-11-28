// blocks.js — 🚧 장기 미정비 (보수·시설 작업 블럭) — 2026-11-15
// 시설팀이 카톡·텔레그램으로 대강 보내는 메시지를 붙여넣거나, 도면에서 고르고 기간을 넣음 → 그 기간 자동 배정에서 자동 제외
// 저장: meta/blocks { list: [{ id, name, rooms:[], from:'YYYY-MM-DD', to:'YYYY-MM-DD', prio:bool, memo, by, at }] } — 주간·야간 모두 허브 로그인으로 입력
// prio = 끝난 다음 날 첫 정비를 우선정비(14시까지)로

// 417실 (객실타입 기준표 층 구성)
export const FLOORS = (() => { const fl = {}; fl[4] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let f = 5; f <= 22; f++) fl[f] = Array.from({ length: 17 }, (_, i) => i + 1);
  for (let f = 23; f <= 26; f++) fl[f] = Array.from({ length: 17 }, (_, i) => i + 1).filter(s => s !== 5 && s !== 11);
  for (const f of [27, 28]) fl[f] = [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12];
  fl[29] = [1, 7, 8, 9, 10, 11]; fl[30] = fl[31] = [1, 2, 7, 8, 9, 10, 11]; return fl; })();
export const ROOMS = Object.keys(FLOORS).map(Number).sort((a, b) => b - a).flatMap(f => FLOORS[f].map(s => String(f * 100 + s)));
const RSET = new Set(ROOMS);
const pad = n => String(n).padStart(2, '0');
const ymdOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

// 날짜: '8일', '11/16', '11월 16일', '16~30일' — 달이 없으면 기준 날짜 달 (이틀 넘게 지난 날이면 다음 달)
function toDate(m, d, base) {
  const [by, bm, bd] = base.split('-').map(Number);
  if (m) { let y = by; if (m < bm - 6) y++; return y + '-' + pad(m) + '-' + pad(d); }
  let y = by, mm = bm; if (d < bd - 2) { mm++; if (mm > 12) { mm = 1; y++; } }
  return y + '-' + pad(mm) + '-' + pad(d);
}
function datesIn(line, base) {
  const out = []; const re = /(\d{1,2})\s*[\/.월]\s*(\d{1,2})\s*일?|(\d{1,2})\s*일/g; let m;
  while ((m = re.exec(line))) out.push(m[1] ? toDate(+m[1], +m[2], base) : toDate(0, +m[3], base));
  // '16~30일' → 앞 숫자도 날짜
  const rg = /(\d{1,2})\s*[~\-]\s*(\d{1,2})\s*일/.exec(line); if (rg && out.length === 1) out.unshift(toDate(0, +rg[1], base));
  return out;
}
// 객실: 403, 1305-1311, 1305~11 (같은 층 범위)
function roomsIn(line) {
  const out = [], bad = [];
  const s = line.replace(/\(\s*\d+\s*실\s*\)/g, ' ').replace(/\d{1,2}\s*[\/.월]\s*\d{1,2}\s*일?|\d{1,2}\s*[~\-]\s*\d{1,2}\s*일|\d{1,2}\s*일/g, ' ');
  for (const m of s.matchAll(/(\d{3,4})(?:\s*[~\-]\s*(\d{1,4}))?/g)) {
    const a = +m[1];
    if (m[2]) { let b = +m[2]; b = b >= 100 ? b : Math.floor(a / 100) * 100 + b; if (b >= a && b - a <= 40) { for (let x = a; x <= b; x++) if (RSET.has(String(x))) out.push(String(x)); continue; } }
    if (RSET.has(String(a))) out.push(String(a)); else bad.push(String(a));
  }
  return { out, bad };
}
const FILLER = /일자|미정비로?|남겨\s*주세요|남겨|부탁\s*드립니다|부탁드려요|부탁|주세요|부터|까지|기간|진행|예정|입니다|합니다|요\b/g;
const nameOf = ln => ln.replace(/\(\s*\d+\s*실\s*\)/g, ' ').replace(/\d{1,2}\s*[\/.월]\s*\d{1,2}\s*일?|\d{1,2}\s*[~\-]\s*\d{1,2}\s*일|\d{1,2}\s*일\s*자?/g, ' ')
  .replace(/\d{3,4}(?:\s*[~\-]\s*\d{1,4})?\s*호?/g, ' ').replace(/\d+\s*(?:층|실|호)/g, ' ').replace(FILLER, ' ').replace(/[\d,./~\-:()·!?]+/g, ' ').replace(/\s+/g, ' ').trim();
// 11/28: '17호 라인 전체(23,24층 제외)' · '17라인 5~10층' → 그 라인이 있는 층 전부 (제외 층 빼고, 층 범위가 있으면 그 안만)
function floorNums(t) { const out = []; for (const m of String(t).matchAll(/(\d{1,2})\s*(?:[~\-]\s*(\d{1,2}))?/g)) { const a = +m[1], b = m[2] ? +m[2] : a; for (let f = a; f <= b && f - a <= 40; f++) out.push(f); } return out; }
function lineRooms(ln) {
  const m = /(\d{1,2})\s*호?\s*라인/.exec(ln); if (!m) return null;
  const slot = +m[1], ex = new Set(), only = new Set();
  const xm = /((?:\d{1,2}\s*[,·~\-]?\s*)+)층\s*(?:은|는)?\s*(?:제외|빼고|빼)/.exec(ln); if (xm) floorNums(xm[1]).forEach(f => ex.add(f));
  const om = /((?:\d{1,2}\s*[,·~\-]?\s*)+)층(?!\s*(?:은|는)?\s*(?:제외|빼))/.exec(ln.replace(xm ? xm[0] : '\u0000', ' ')); if (om) floorNums(om[1]).forEach(f => only.add(f));
  return Object.keys(FLOORS).map(Number).sort((a, b) => a - b).filter(f => FLOORS[f].includes(slot) && !ex.has(f) && (!only.size || only.has(f))).map(f => String(f * 100 + slot));
}
// '-일자: …' · '-호실: …' 처럼 머리말로 시작하는 줄은 새 작업이 아니라 바로 위 작업에 붙임
const LABEL = /^[-•*·▶>\s]*(일자|날짜|기간|일정|호실|객실|대상|위치|범위)\s*[:：]/;
// '12/18(금)부터 판매가능' 같은 판매 · 오픈 날짜는 작업 날짜가 아님
const SALE = /\d{1,2}\s*[\/.월]\s*\d{1,2}\s*일?\s*(?:\([^)]*\))?\s*(?:부터|이후)?\s*(?:판매|오픈|입실|사용)\s*가?능?|\d{1,2}\s*일\s*(?:\([^)]*\))?\s*(?:부터|이후)?\s*(?:판매|오픈|입실|사용)\s*가?능?/g;
// 메시지 → [{ name, rooms, want(메시지에 적힌 실 수), bad, from, to }]
export function parseMsg(text, base) {
  // 날짜: 작업명과 같은 줄이면 그 작업만, 따로 있는 줄이면 날짜가 없는 모든 작업에 (예: 맨 끝 '8일자 미정비 남겨주세요')
  const groups = []; let cur = null, from = '', to = '';
  const mk = (ln, word, ds) => { const w = /\(\s*(\d+)\s*실\s*\)/.exec(ln); cur = { name: word.slice(0, 20), rooms: [], want: w ? +w[1] : 0, bad: [], from: ds.length ? ds[0] : '', to: ds.length ? ds[ds.length - 1] : '' }; groups.push(cur); };
  const lines = String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  for (const ln0 of lines) {
    const ln = ln0.replace(SALE, ' '), lab = LABEL.exec(ln), lr = lineRooms(ln);
    const ds = datesIn(ln, base), { out, bad } = roomsIn(ln), word = nameOf(ln.replace(/\d{1,2}\s*호?\s*라인/g, ' ')), named = !lab && word && !/^[A-Za-z]{0,3}$/.test(word);
    if (named) mk(ln, word, ds);
    else if (ds.length) { if (lab && cur) { cur.from = ds[0]; cur.to = ds[ds.length - 1]; } else { from = from || ds[0]; to = ds[ds.length - 1]; } }
    if (lr) { if (!cur) mk(ln, '보수', []); if (lab || !cur.lr) cur.lr = lr; }   // 호실 줄의 라인(제외 층 반영)이 작업명 줄의 라인보다 먼저
    if (out.length || bad.length) { if (!cur) mk(ln, '보수', []);
      out.forEach(r => { if (!cur.rooms.includes(r)) cur.rooms.push(r); }); cur.bad.push(...bad); }
  }
  groups.forEach(g => { if (g.lr) g.lr.forEach(r => { if (!g.rooms.includes(r)) g.rooms.push(r); }); delete g.lr; });
  const f0 = from || base;
  return groups.filter(g => g.rooms.length || g.bad.length).map(g => { const f = g.from || f0, t = g.to || (g.from ? g.from : to || f0); return Object.assign(g, { from: f, to: t >= f ? t : f, prio: false }); });
}
// 그날 걸린 블럭: { 객실: 블럭 }
export function blockedOn(list, date) { const m = {}; (list || []).forEach(b => { if (b.from <= date && date <= b.to) b.rooms.forEach(r => { m[r] = b; }); }); return m; }
// 그날이 '끝난 다음 날'인 우선정비 블럭 객실
export function releasedPrio(list, date) { const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() - 1); const y = ymdOf(d), m = {};
  (list || []).forEach(b => { if (b.prio && b.to === y) b.rooms.forEach(r => { m[r] = b; }); }); return m; }
export function newId() { return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
// 끝난 지 30일 넘은 블럭은 지움 (문서 크기)
export function prune(list, today) { const d = new Date(today + 'T00:00:00'); d.setDate(d.getDate() - 30); const cut = ymdOf(d); return (list || []).filter(b => b.to >= cut); }
export const COLORS = ['#E8590C', '#7048E8', '#1C7ED6', '#2B8A3E', '#C2255C', '#E67700', '#0B7285', '#5F3DC4'];
