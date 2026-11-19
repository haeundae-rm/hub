// assign.js — 룸메이드 객실 자동 배정 엔진 (관리자 허브용, 2026-11-13 · 11/14 VIP 분산·신입 VIP 제외·단체 섞기 · 11/15 하우스맨 피드백: 로얄+테마 피하기·벽배딩 A6:B4·2인 1조 층 묶기)
// claude/assign/assign.mjs (11/6 확정 규칙 + 11/8 '미정비' 제외·덩어리 벌점) 를 브라우저에서 돌게 옮긴 것 — 같은 입력·같은 시드면 같은 결과
// v2 규칙 (11/8 사용자 확정, opts.v2 !== false 면 켜짐)
//   · 2901 × 로얄 = 우선순위(금지 아님): 로얄 0실 > 1실 > 2실, 전날 한 분·이번 달 횟수 많은 분 뒤로. 3명(당직·H/U 면 1명)은 항상 채움
//   · 신입(정량 8 미만)은 30·31층 중 로얄만 피함 (31층 일반 객실 가능)
// 입력: rooms = 정비보고서 초안 객실 [{room, floor, st, m1, m2, name, grp(단체명), gh(입실 시각 숫자)}] (engine.js buildFromXlsx 의 data.rooms), ho = {이름: 인계 유닛}
//       cfg = { aKey:{층:이름}, bKey:{층:이름}, royalOk:[], pltBlue:[], quota:{이름:정량} }, prev2901 = [이름], hist = {이름: 이번 달 2901 횟수}
// 출력: { owner:{객실:이름}, workers:{이름:{cap, load, rooms, floors, why}}, left:[객실], cost, stats }

export const DEF_CFG = {
  aKey: { 31: '이분남', 30: '김화동', 29: '한지수', 28: '전영신', 27: '유상미', 26: '임나경', 25: '곽미혜', 24: '노애영', 23: '박소연', 22: '박순자', 21: '이혜진', 20: '허슬기', 19: '이은경', 18: '강태금', 17: '김명희', 16: '문국희', 15: '박선영', 14: '오선녀', 13: '김송심', 12: '양윤복', 11: '박창숙', 10: '이미애', 9: '최태자', 8: '이경희', 7: '김시형', 6: '김현지', 5: '김태성', 4: '이분남' },
  bKey: { 26: '이서연', 25: '장은미', 24: '임남주', 23: '정미감', 22: '이지우', 21: '자야', 20: '엔주', 19: '김화경', 18: '하랑', 17: '김윤경', 16: '박예린', 15: '이하늘', 14: '나나경', 13: '김나라', 12: '김나라', 11: '이호라', 10: '성락욱', 9: '성락욱', 8: '박효정', 7: '정미감', 6: '조유경', 5: '조유경' },
  royalOk: ['이분남', '김화동', '박순자', '강태금', '최태자'],
  pltBlue: ['양윤복', '오선녀', '곽미혜', '김송심', '전영신'],
  wallBed: ['2301', '2302', '2303', '2304', '2306', '2401', '2402', '2403', '2404', '2406'],   // 23·24F 01~06 특화 벽배딩 (11/15)
  specOk: ['이분남', '최태자', '성락욱', '오선녀', '강태금', '박순자', '노애영', '박소연', '전영신', '김화동', '이하늘', '정미감', '임남주'],   // 11/19 23·24F 특화 정비 가능자 (소장 명단). 그 층 A·B키는 저절로 가능 · 비면 제한 없음
  quota: { 김현지: 8, 이혜진: 8, 문국희: 8, 김윤경: 8, 허슬기: 8, 박창숙: 8, 박선영: 8, 김화경: 7, 장은미: 7, 김득미: 4 }
};

export function runAssign(rooms, ho, cfg0, prev2901, hist, opts) {
  opts = opts || {};
  const cfg = Object.assign({}, DEF_CFG, cfg0 || {});
  const HO = ho, HIST = hist || {}, PREV2901 = prev2901 || [], QUOTA = cfg.quota || {};
  const A_KEY = cfg.aKey, B_KEY = cfg.bKey;
  const ROYAL = ['3001', '3002', '3101', '3102'];
  const ROYAL_OK = cfg.royalOk, PLT_BLUE = cfg.pltBlue, PLT_OK = [...PLT_BLUE, ...ROYAL_OK];
  const V2 = opts.v2 !== false;
  const BASE_DEF = 9, LATE_MAX = 4, FLOOR_MAX = 3;
  const baseOf = n => (QUOTA[n] != null ? QUOTA[n] : Math.min(BASE_DEF, HO[n] != null ? HO[n] : BASE_DEF));
  const STAGE = Object.keys(QUOTA).filter(n => QUOTA[n] < 8);
  const FAK = ['1807', '1808', '1809', '1810', '1811'], FAK_OWNER_MAX = 3;
  const B_SUF = ['10', '11', '15', '16', '17'];
  const tick = opts.onProgress || (() => {});

  // 취사형(FOR) = 5~22·25·26층 12호 이상 (assignui typeOf 와 같음)
  const isCook = r => { const n = Number(r), f = Math.floor(n / 100), q = n % 100; return ((f >= 5 && f <= 22) || f === 25 || f === 26) && q >= 12; };
  const isTarget = x => (['1', '2', '3', '4'].includes(String(x.st == null ? '' : x.st).trim()) || /간단/.test(String(x.st == null ? '' : x.st))) && !/미정비/.test((x.m1 || '') + (x.m2 || ''));
  const T = rooms.filter(isTarget).map(x => Object.assign({}, x, { room: String(x.room), floor: Number(x.floor) || Math.floor(Number(x.room) / 100), suf: String(x.room).slice(-2),
    theme: !!x.theme, late: !!x.theme || /14시|VIP|르씨엘/i.test((x.m1 || '') + (x.m2 || '')), w: ROYAL.includes(String(x.room)) ? 2 : /간단/.test(String(x.st)) ? 0.5 : 1,
    vip: /VIP|르씨엘/i.test((x.m1 || '') + (x.m2 || '')), cook: isCook(x.room), early: !!x.grp && Number(x.gh) > 0 && Number(x.gh) <= 14, grp: x.grp ? (Number(x.gh) > 0 ? Number(x.gh) : 17) : 0 }));
  const TX = Object.fromEntries(T.map(x => [x.room, x]));
  const W = {}; Object.keys(HO).forEach(n => { W[n] = { cap: HO[n], load: 0, rooms: [], why: [] }; });
  // 11/15 특화 벽배딩 (23·24F 01~06): 노동 강도 때문에 그 층 A키 6 : B키 4 정도로 나눔 — 번호 뒤쪽 40% 를 B키 구역으로 봄 (B키가 출근했을 때만)
  const WB = new Set((cfg.wallBed || []).map(String)), WB_ON = opts.wallBed !== false && WB.size > 0, ZOVR = {};
  const WB_EXTRA = opts.wbPen != null ? opts.wbPen : 40;
  if (WB_ON) { const byF = {}; T.filter(x => WB.has(x.room)).forEach(x => (byF[x.floor] = byF[x.floor] || []).push(x));
    Object.keys(byF).forEach(f => { if (!W[B_KEY[f]] || B_KEY[f] === A_KEY[f]) return; const xs = byF[f].sort((p, q) => p.room - q.room), nA = Math.round(xs.length * 0.6);
      xs.slice(nA).forEach(x => { ZOVR[x.room] = 'B'; }); }); }
  const WB_CAP = {}; if (WB_ON) T.filter(x => WB.has(x.room)).forEach(x => { WB_CAP[x.floor] = (WB_CAP[x.floor] || 0) + 1; });
  const zone = x => (ZOVR[x.room] || (x.floor >= 27 || x.floor === 4 ? 'A' : B_SUF.includes(x.suf) ? 'B' : 'A'));
  // 11/15 2인 1조 (부부): 두 분 합친 층 수로 셈 — 2개 층 이내가 좋고, 어쩔 수 없으면 3개 층까지 (4개 층은 큰 벌점). 짝의 담당 방은 내 방처럼 봄
  const MATE = {}, LEAD = {}, TEAM3 = opts.team3 != null ? opts.team3 : 250; const TEAM_ROY = opts.teamRoy != null ? opts.teamRoy : 120;
  (opts.teams || []).forEach(p => { const [a, b] = (Array.isArray(p) ? p : String(p).split(',')).map(s => String(s).trim()); if (a && b && a !== b && W[a] && W[b]) { MATE[a] = b; MATE[b] = a; LEAD[a] = true; } });
  const owner = {};
  const floors = n => new Set(W[n].rooms.map(r => Math.floor(r / 100)));
  const rem = n => W[n].cap - W[n].load;
  const lateN = n => W[n].rooms.filter(r => TX[r] && TX[r].late).length;
  const fakN = n => W[n].rooms.filter(r => FAK.includes(r)).length;
  const royalN = n => W[n].rooms.filter(r => ROYAL.includes(r)).length;
  // 11/14 사용자 규칙 — VIP 분산 · 단체와 일반 섞기 (금지 아님, 비용으로 우선순위)
  //   VIP: 1명 1실이 좋음. 동선이 크게 나빠지면 2실까지 (2실째 벌점 VIP2), 3실부터는 큰 벌점 (VIP3)
  //   단체: 한 사람 단체 최대 8 : 일반 2 — 일반이 모자란 방 수 × GRP_SHORT (입실 15시 ×1.5, 16시 ×1.25)
  //         단체만 받는 것도 틀린 건 아님 → 금지 없이 층 하나 더 붙이는 비용과 견줌. opts.vip / opts.grpMix === false 면 끔
  const VIP_ON = opts.vip !== false, GRP_ON = opts.grpMix !== false;
  const VIP2 = opts.vip2 != null ? opts.vip2 : 30, VIP3 = opts.vip3 != null ? opts.vip3 : 90;
  const GRP_SHORT = opts.grpShort != null ? opts.grpShort : 24, GRP_RATIO = 0.2;
  //   신입(입사 3개월 미만 = opts.vipNo, 정량 8 미만 신입 포함)은 VIP 가급적 안 줌 — VIP 1실마다 VIP_NEW 벌점 (11/14 사용자)
  const VIP_NO = new Set([...(opts.vipNo || []), ...STAGE, ...Object.keys(opts.trainees || {})]), VIP_NEW = opts.vipNew != null ? opts.vipNew : 120;
  const KEEP_PRI = opts.keepPri != null ? opts.keepPri : 10;
  const KEY_B = opts.keyB != null ? opts.keyB : 25, KEY_COVER = opts.keyCover != null ? opts.keyCover : 12;
  const EARLY_ON = opts.early !== false, EARLY_MAX = opts.earlyMax != null ? opts.earlyMax : 4, EARLY_PEN = opts.earlyPen != null ? opts.earlyPen : 20;
  const FOR_ON = opts.cookSpread !== false, FOR_MAX = opts.cookMax != null ? opts.cookMax : 3, FOR_PEN = opts.cookPen != null ? opts.cookPen : 15;
  const ROY_ON = opts.royPri !== false, ROY_PRI = opts.royPriPen != null ? opts.royPriPen : 40;
  const vipN = n => W[n].rooms.filter(r => TX[r] && TX[r].vip).length;
  const grpOf = n => { let t = 0, g = 0, h = 99; W[n].rooms.forEach(r => { const x = TX[r]; if (!x || r === '2901') return; t++; if (x.grp) { g++; h = Math.min(h, x.grp); } }); return { t, g, h }; };
  const grpShort = n => { const o = grpOf(n); if (o.g < 3) return 0; return Math.max(0, Math.ceil(o.t * GRP_RATIO - 1e-9) - (o.t - o.g)); };
  // 11/19 (11/16 의견 1·2번) 교육생: opts.trainees = { 이름: { floors: [층…](빈 배열 = 아무 층), max: 최대 층 수 } } — 가능 층 · 최대 층 수 지킴, VIP · 우선정비는 피함
  const TR = opts.trainees || {}, isTr = n => !!TR[n];
  const trMax = n => (TR[n] && TR[n].max > 0 ? TR[n].max : FLOOR_MAX), trFloorOk = (n, f) => !TR[n] || !(TR[n].floors || []).length || TR[n].floors.map(Number).includes(f);
  //   특화(23·24F) 가능자: cfg.specOk 에 있는 분 + 그 층 A·B키만 (비면 제한 없음)
  const SPEC = new Set((cfg.specOk || []).map(String)), SPEC_ON = SPEC.size > 0, isSpecF = f => f === 23 || f === 24;
  const specOk = (n, f) => !SPEC_ON || !isSpecF(f) || SPEC.has(n) || A_KEY[f] === n || B_KEY[f] === n || (MATE[n] && (SPEC.has(MATE[n]) || A_KEY[f] === MATE[n] || B_KEY[f] === MATE[n]));
  function can(n, x) {
    if (!W[n] || rem(n) < x.w - 1e-9) return false;
    if (!trFloorOk(n, x.floor) || !specOk(n, x.floor)) return false;
    if (isTr(n)) { const f = floors(n); if (!f.has(x.floor) && f.size >= trMax(n)) return false; if (x.late || x.vip || x.early) return false; }
    if (x.late && lateN(n) >= LATE_MAX) return false;
    if (FAK.includes(x.room) && fakN(n) >= (n === A_KEY[18] ? FAK_OWNER_MAX : 1)) return false;
    const f = floors(n); if (!f.has(x.floor) && f.size >= FLOOR_MAX) return false;
    return true;
  }
  function give(n, x, why) { owner[x.room] = n; W[n].rooms.push(x.room); W[n].load += x.w; W[n].why.push(x.room + ' ' + why); }
  const free = () => T.filter(x => !owner[x.room] && x.room !== '2901');

  // 1 로얄
  for (const r of ROYAL) { const x = TX[r]; if (!x) continue;
    // 11/19 (11/16 의견 4번): 2인 1조는 로얄 가능자 중 맨 뒤로 — 로얄(30·31F)이 붙으면 부부 합계 층이 크게 늘어남
    const own = A_KEY[x.floor]; const c = [own, ...ROYAL_OK.filter(n => n !== own && !MATE[n]), ...ROYAL_OK.filter(n => n !== own && MATE[n])].filter(n => W[n] && can(n, x));
    if (c.length) give(c[0], x, c[0] === own ? '로얄 · ' + x.floor + 'F 담당' : '로얄 · 가능자'); }
  // 1-1 교육생 먼저 (11/19): 가능 층 중 방이 많은 층부터, 정한 객실 수만큼 (담당 키보다 먼저 — 나중엔 가능 층에 빈 방이 없어짐)
  for (const n of Object.keys(TR)) { if (!W[n]) continue;
    const fl = (TR[n].floors || []).length ? TR[n].floors.map(Number) : [...new Set(T.map(x => x.floor))];
    const ok = x => !owner[x.room] && x.room !== '2901' && !ROYAL.includes(x.room) && !x.late && !x.vip && !x.early && specOk(n, x.floor);
    const byF = fl.map(f => ({ f, xs: T.filter(x => x.floor === f && ok(x)).sort((p, q) => p.room - q.room) })).filter(o => o.xs.length).sort((p, q) => q.xs.length - p.xs.length || p.f - q.f);
    for (const o of byF) { if (rem(n) < 1 - 1e-9) break; if (floors(n).size >= trMax(n) && !floors(n).has(o.f)) continue; for (const x of o.xs) if (can(n, x)) give(n, x, o.f + 'F 교육생'); } }
  // 2 A키 담당 층
  for (const f of Object.keys(A_KEY).map(Number).sort((a, b) => b - a)) {
    const a = W[A_KEY[f]] ? A_KEY[f] : null, b = W[B_KEY[f]] ? B_KEY[f] : null;
    const fr = free().filter(x => x.floor === f).sort((p, q) => p.room - q.room);
    if (a) for (const x of fr) if ((zone(x) === 'A' || !b) && !owner[x.room] && can(a, x)) give(a, x, f + 'F A키 담당');
  }
  // 2-1 B키 옮기기 (11/8 사용자 확정 → 11/13 '2번 조금 완화'로 바꿈, v2 · opts.bMove !== false)
  //   조건: ② 그날 B키 구역 배정 객실 3실 이하 + 그 층 A키가 출근해 자기 층에만 있음
  //   ① A키가 남은 유닛만큼 B구역 방을 받음 — 다 못 받으면 나머지는 같은 층·옆 층 분들이 채움(6·7단계)
  //   ③ B키는 빈 층(두 키 다 없는 층) 덩어리가 있으면 통째로, 없으면 남은 방을 덩어리로 받음 (층 수 같거나 줄어들 때만 빈 층 지정)
  //   opts.bMoveMode = 'strict' 면 11/8 처음 조건(A키가 다 받고 남는 유닛 1 이하일 때만)
  const OVR = {}, OVR_WHY = {}, bMoves = [], MOVED = new Set(), FROM_B = {}, FORKS = [];
  const BM_MAX = opts.bMoveMax != null ? opts.bMoveMax : 3, BM_STRICT = opts.bMoveMode !== 'loose', BM_SHARE = opts.bShare != null ? opts.bShare : 0.5, BM_MIN_BLOCK = opts.bMoveMin != null ? opts.bMoveMin : 4;
  // 11/19 하우스맨 의견(11/18 배정): '층 B키 메이드 우선 배정' · '특화 객실은 A·B키 우선'
  //   → 중간안(기본): 특화 층(23·24F)은 B키 안 옮김, 일반 층은 A키가 B구역을 다 받고 남는 유닛 1 이하일 때만(strict). opts.bMove === false 면 끔, opts.bMoveMode = 'loose' 면 예전(11/13)
  if (V2 && opts.bMove !== false) {
    const orphan = () => { const m = {}; free().forEach(x => { if (MOVED.has(x.room) || W[A_KEY[x.floor]] || W[B_KEY[x.floor]]) return; (m[x.floor] = m[x.floor] || []).push(x); }); return m; };
    const BM_KEEP = new Set((opts.bMoveKeep || [23, 24]).map(Number));   // 11/19: 특화 층(23·24F)은 B키 옮기기 안 함
    // 11/19 갈림길 선택 (소장): opts.bChoice = { B키 이름: 'keep' 담당층 우선 | 'move' 층 이동 효율 우선 } — 없으면 기본(중간안)
    const CH = opts.bChoice || {};
    const keepDef = n => Object.keys(B_KEY).some(f => B_KEY[f] === n && BM_KEEP.has(Number(f)));
    const allB = [...new Set(Object.values(B_KEY))].filter(n => W[n] && W[n].load === 0 && !(opts.noBMove || []).includes(n));
    allB.forEach(b => { const fs = Object.keys(B_KEY).map(Number).filter(f => B_KEY[f] === b);
      const xs = free().filter(x => fs.includes(x.floor) && (zone(x) === 'B' || !W[A_KEY[x.floor]]));
      const fl = [...new Set(xs.map(x => x.floor))].sort((p, q) => q - p);
      if (xs.length > 0 && xs.length <= BM_MAX && fl.every(f => W[A_KEY[f]] && A_KEY[f] !== b)) FORKS.push({ b, floors: fl, n: xs.length, a: fl.map(f => A_KEY[f]), spec: fl.some(isSpecF), choice: CH[b] || '' }); });
    const bNames = allB.filter(n => CH[n] === 'move' || (CH[n] !== 'keep' && !keepDef(n)));
    const cands = bNames.map(b => { const fs = Object.keys(B_KEY).map(Number).filter(f => B_KEY[f] === b);
      const xs = free().filter(x => fs.includes(x.floor) && (zone(x) === 'B' || !W[A_KEY[x.floor]]));
      return { b, xs }; }).filter(c => c.xs.length > 0 && c.xs.length <= BM_MAX).sort((p, q) => p.xs.length - q.xs.length || (p.b < q.b ? -1 : 1));
    for (const { b, xs } of cands) {
      const byF = {}; xs.forEach(x => (byF[x.floor] = byF[x.floor] || []).push(x));
      const ok1 = Object.keys(byF).every(f => { const a = A_KEY[f]; if (!W[a] || a === b) return false; const fsA = floors(a);
        if (fsA.size !== 1 || !fsA.has(Number(f))) return false;
        if (!BM_STRICT || CH[b] === 'move') { const fit = byF[f].filter(x => x.w <= rem(a) + 1e-9).length; return Math.min(fit, Math.floor(rem(a) + 1e-9)) >= Math.max(1, Math.ceil(byF[f].length * BM_SHARE)); }
        const need = byF[f].reduce((s, x) => s + x.w, 0), r = rem(a);
        return need <= r + 1e-9 && r - need <= 1 + 1e-9 && byF[f].every(x => !(x.late && lateN(a) + byF[f].filter(y => y.late).length > LATE_MAX)); });
      if (!ok1) continue;
      const om = orphan(); let best = null;
      for (const f of Object.keys(om).map(Number)) { const xsF = om[f].filter(x => !ROYAL.includes(x.room) && !(STAGE.includes(b) && x.floor >= 30)); const size = xsF.reduce((s, x) => s + x.w, 0);
        if (size < BM_MIN_BLOCK) continue; if (!best || size > best.size || (size === best.size && f < best.f)) best = { f, xs: xsF, size }; }
      const before = new Set(xs.map(x => x.floor)).size + (xs.reduce((s, x) => s + x.w, 0) < W[b].cap ? 1 : 0);
      if (best && (best.size >= W[b].cap - 1e-9 ? 1 : 2) > before) best = null;
      if (!best && BM_STRICT && CH[b] !== 'move') continue;
      const toA = [], shared = [];
      Object.keys(byF).forEach(f => { const a = A_KEY[f]; toA.push(a);
        byF[f].sort((p, q) => p.room - q.room).forEach(x => { OVR[x.room] = a; FROM_B[x.room] = b; OVR_WHY[x.room] = 'B키 옮기기 (담당 ' + b + ')';
          if (can(a, x)) give(a, x, f + 'F B구역 · B키 옮기기 (담당 ' + b + ')'); else { MOVED.add(x.room); shared.push(x.room); } }); });
      let took = 0;
      if (best) for (const x of best.xs.sort((p, q) => p.room - q.room)) if (can(b, x)) { give(b, x, best.f + 'F 통째 · B키 옮기기'); OVR[x.room] = b; OVR_WHY[x.room] = 'B키 옮기기 → ' + best.f + 'F'; took++; }
      bMoves.push({ b, from: Object.keys(byF).map(Number).sort((p, q) => q - p), rooms: xs.map(x => x.room), shared, to: best ? best.f : null, took, a: toA });
    }
  }
  // 3 B키 담당 층
  for (const f of Object.keys(B_KEY).map(Number).sort((a, b) => b - a)) {
    const b = W[B_KEY[f]] ? B_KEY[f] : null; if (!b) continue; const a = W[A_KEY[f]] ? A_KEY[f] : null;
    for (const x of free().filter(x => x.floor === f && !MOVED.has(x.room)).sort((p, q) => p.room - q.room)) if ((zone(x) === 'B' || !a) && can(b, x)) give(b, x, f + 'F B키 담당');
  }
  // 4 2901 (PLT)
  const p = TX['2901'];
  if (p) { const n3 = /당직|H\/U|h\/u/.test((p.m1 || '') + (p.m2 || '')) ? 1 : 3;
    let c;
    if (!V2) {
      c = PLT_OK.filter(n => W[n] && !W[n].rooms.some(r => ROYAL.includes(r)) && (floors(n).has(29) || floors(n).size < FLOOR_MAX)).sort((a, b) => (PREV2901.includes(a) ? 1 : 0) - (PREV2901.includes(b) ? 1 : 0) || (PLT_BLUE.includes(a) ? 0 : 1) - (PLT_BLUE.includes(b) ? 0 : 1) || (HIST[a] || 0) - (HIST[b] || 0) || floors(a).size - floors(b).size).slice(0, n3);
    } else {
      // v2: 금지 없이 벌점 순서 — 로얄 2실 > 전날 > 파란 명단 아님 > 이번 달 횟수 > 로얄 1실 > 층 수. 가능자 명단이 모자라면 정량 없는 9 이상 분까지
      const pen = n => (royalN(n) >= 4 ? 60 : royalN(n) >= 2 ? 30 : 0) + (PREV2901.includes(n) ? 40 : 0) + (PLT_BLUE.includes(n) ? 0 : 6) + (HIST[n] || 0) * 3 + (royalN(n) > 0 && royalN(n) < 2 ? 2 : 0) + floors(n).size * 0.5 + (!floors(n).has(29) && floors(n).size >= FLOOR_MAX ? 100 : 0) + (MATE[n] ? 8 : 0);
      const pool = PLT_OK.filter(n => W[n]);
      c = pool.sort((a, b) => pen(a) - pen(b) || PLT_OK.indexOf(a) - PLT_OK.indexOf(b)).slice(0, n3);
      if (c.length < n3) {
        const more = Object.keys(W).filter(n => !c.includes(n) && !STAGE.includes(n) && !isTr(n) && QUOTA[n] == null && W[n].cap >= BASE_DEF).sort((a, b) => pen(a) - pen(b) || W[b].cap - W[a].cap);
        c = c.concat(more.slice(0, n3 - c.length));
      }
    }
    c.forEach(n => { if (rem(n) < 1) { const r = [...W[n].rooms].reverse().find(r => !ROYAL.includes(r) && !(TX[r] && TX[r].floor >= 30)); if (r) { const x = TX[r]; W[n].rooms.splice(W[n].rooms.indexOf(r), 1); W[n].load -= x.w; delete owner[r]; } }
      W[n].rooms.push('2901'); W[n].load += 1; W[n].why.push('2901 · PLT ' + n3 + '명' + (PREV2901.includes(n) ? ' (전날도 함)' : '') + (V2 && royalN(n) ? ' (로얄 ' + royalN(n) / 1 + '실도 맡음)' : '')); });
    owner['2901'] = c.join(', '); }
  // 5 유닛 다운 · +1
  const totalU = T.reduce((s, x) => s + (x.room === '2901' ? (owner['2901'] ? owner['2901'].split(', ').length : 0) : x.w), 0);
  let D = Object.values(W).reduce((s, w) => s + w.cap, 0) - totalU;
  const downs = [], DOWN_SMALL = opts.down !== 'big';
  while (D > 0) {
    const c = Object.keys(W).filter(n => W[n].cap > baseOf(n) && !downs.includes(n) && !isTr(n))
      .sort((a, b) => (QUOTA[a] != null ? 0 : 1) - (QUOTA[b] != null ? 0 : 1) || (DOWN_SMALL ? W[a].cap - W[b].cap : W[b].cap - W[a].cap));
    if (!c.length) {
      const c2 = Object.keys(W).filter(n => W[n].cap > 8 && !STAGE.includes(n) && !downs.includes(n)).sort((a, b) => rem(b) - rem(a) || W[b].cap - W[a].cap);
      if (!c2.length) break; c.push(c2[0]); }
    const n = c[0]; W[n].cap -= 1;
    if (rem(n) < -1e-9) { const r = [...W[n].rooms].reverse().find(r => r !== '2901' && !ROYAL.includes(r)); const x = TX[r];
      W[n].rooms.splice(W[n].rooms.indexOf(r), 1); W[n].load -= x.w; delete owner[r]; } downs.push(n); W[n].why.push('유닛 다운 ' + (W[n].cap + 1) + '→' + W[n].cap); D -= 1;
  }
  const ups = [];
  while (D < 0) {
    const pri = n => ROYAL_OK.includes(n) ? (W[n].rooms.some(r => ROYAL.includes(r)) ? 3 : 0) : PLT_BLUE.includes(n) ? 1 : 2;
    const c = Object.keys(W).filter(n => !ups.includes(n) && W[n].cap >= BASE_DEF && QUOTA[n] == null && !STAGE.includes(n) && !isTr(n))
      .sort((a, b) => pri(a) - pri(b) || ROYAL_OK.indexOf(a) - ROYAL_OK.indexOf(b) || W[b].cap - W[a].cap);
    if (!c.length) break;
    const n = c[0]; W[n].cap += 1; ups.push(n); D += 1;
  }
  // 6 남은 방 채우기 (층 덩어리)
  for (let guard = 0; guard < 800; guard++) {
    const ppl = Object.keys(W).filter(n => rem(n) >= 0.5 - 1e-9).sort((a, b) => rem(b) - rem(a));
    if (!ppl.length || !free().length) break;
    let best = null;
    for (const n of ppl) {
      const f0 = floors(n), byF = {};
      free().filter(x => can(n, x)).forEach(x => (byF[x.floor] = byF[x.floor] || []).push(x));
      for (const f of Object.keys(byF).map(Number)) {
        const size = byF[f].reduce((s, x) => s + x.w, 0), r = rem(n);
        const same = f0.has(f), dist = f0.size ? Math.min(...[...f0].map(g => Math.abs(g - f))) : 0;
        const score = (same ? -100 : 0) + Math.abs(Math.min(size, r) - r) * 3 + Math.max(0, size - r) * 0.3 + dist * 0.4 + (STAGE.includes(n) && !same && size < r ? 20 : 0) + f0.size * 4 + (!same && f0.size >= 2 ? 40 : 0);
        if (!best || score < best.score) best = { n, f, score, xs: byF[f] };
      }
      if (best && best.n === n) break;
    }
    if (!best) break;
    const f0 = floors(best.n);
    for (const x of best.xs.sort((p, q) => p.room - q.room)) if (can(best.n, x)) give(best.n, x, f0.has(best.f) ? '같은 층 보충' : best.f + 'F 보충');
  }
  // 7 다듬기 (비용 줄이기)
  const keyOf = x => { if (OVR[x.room]) return OVR[x.room]; const a = A_KEY[x.floor], b = B_KEY[x.floor]; const za = zone(x) === 'A';
    if (za && W[a]) return a; if (!za && W[b]) return b; return W[a] ? a : W[b] ? b : null; };
  const capO = Object.fromEntries(Object.keys(W).map(n => [n, HO[n]]));
  const capF = Object.fromEntries(Object.keys(W).map(n => [n, W[n].cap]));
  const stageBad = r => V2 ? ROYAL.includes(r) : (TX[r] && TX[r].floor >= 30);
  function costOf(n) {
    const w = W[n], m = MATE[n]; let c = 0;
    if (!m) { const fs = floors(n), k = fs.size;
      c += (k > 1 ? (k - 1) * 12 : 0) + (k >= 3 ? 150 : 0) + (k > FLOOR_MAX ? 1000 : 0) + (STAGE.includes(n) && k > 1 ? 30 * (k - 1) : 0);
      if (k > 1) { const a = [...fs].sort((p, q) => p - q); c += (a[a.length - 1] - a[0]) * 0.3; }
    } else if (LEAD[n]) { const fs = new Set([...floors(n), ...floors(m)]), k = fs.size;   // 조는 앞 분에게 한 번만
      c += (k > 1 ? (k - 1) * 12 : 0) + (k >= 3 ? TEAM3 : 0) + (k > FLOOR_MAX ? 1000 : 0);
      if (k > 1) { const a = [...fs].sort((p, q) => p - q); c += (a[a.length - 1] - a[0]) * 0.3; }
      const kn = floors(n).size, km = floors(m).size; c += (kn > FLOOR_MAX ? 1000 : 0) + (km > FLOOR_MAX ? 1000 : 0); }
    const def = capF[n] - w.load, over = w.load - capF[n];
    if (over > 1e-9) c += 500 * over;
    if (def > 1e-9) c += (isTr(n) ? 600 : 200) * def;   // 교육생 수량은 하우스맨이 정한 것 — 모자라면 다른 분이 먼저 줄어듦
    if (STAGE.includes(n)) c += w.rooms.filter(stageBad).length * 30;
    for (const r of w.rooms) { const x = TX[r]; if (!x || r === '2901') continue; const ko = keyOf(x); if (ko && ko !== n && ko !== MATE[n]) {
        // 11/19: B키도 A키처럼 자기 구역 우선(12→KEY_B) · A키가 없으면 그 층 B키가 A구역도 담당(테마·우선정비 포함, 11/18 의견 3번)
        const real = (zone(x) === 'A' ? A_KEY : B_KEY)[x.floor] === ko, cover = !real && zone(x) === 'A' && !W[A_KEY[x.floor]] && B_KEY[x.floor] === ko;
        c += real ? (zone(x) === 'A' ? 25 : KEY_B) : cover ? KEY_COVER : 1;
        if ((real || cover) && x.late) c += KEEP_PRI * (cover ? 2 : 1); } }
    // 11/19 취사(FOR) 분산 (11/18 의견 4번): 담당 아닌 취사 객실은 한 분 FOR_MAX 실까지, 넘으면 1실마다 FOR_PEN
    if (FOR_ON) { const k = w.rooms.filter(r => { const x = TX[r]; if (!x || !x.cook) return false; const ko = keyOf(x); return ko !== n && !(ko && ko === MATE[n]); }).length; if (k > FOR_MAX) c += (k - FOR_MAX) * FOR_PEN; }   // 11/15 담당이 출근했으면 그 층 우선정비·테마(FAW 1707·1708 등)는 담당이 갖고, 남는 일반 방을 남이 받음
    if (opts.chunk !== false) { const byF = {}; w.rooms.forEach(r => { const x = TX[r]; if (!x || r === '2901') return; const ko = keyOf(x); if (ko === n || (ko && ko === MATE[n])) return; byF[x.floor] = (byF[x.floor] || 0) + 1; });
      Object.values(byF).forEach(s => { c += s <= 2 ? 10 : s <= 4 ? 4 : 0; }); }
    c += w.rooms.filter(r => FROM_B[r] === n).length * 12;
    if (VIP_ON) { const v = vipN(n); if (v >= 2) c += VIP2; if (v >= 3) c += (v - 2) * VIP3; if (v && VIP_NO.has(n)) c += v * VIP_NEW; }
    if (GRP_ON) { const sh = grpShort(n); if (sh) { const h = grpOf(n).h; c += sh * GRP_SHORT * (h <= 15 ? 1.5 : h <= 16 ? 1.25 : 1); } }
    // 11/15 로얄(14시까지 우선) 맡은 분은 테마·VIP·14시 같은 다른 우선정비를 가급적 안 받음
    if (m && royalN(n)) c += TEAM_ROY;   // 11/19: 2인 1조가 로얄(30·31F)을 맡으면 부부 합계 층이 늘어남
    if (ROY_ON && royalN(n)) c += W[n].rooms.filter(r => !ROYAL.includes(r) && TX[r] && (TX[r].late || TX[r].early)).length * ROY_PRI;
    // 11/19 (11/16 의견 3번): 14시까지 끝낼 방(로얄 · 테마 · VIP · 14시 메모 · 단체 입실 14시 이전) 한 분 EARLY_MAX 실 넘으면 1실마다 EARLY_PEN
    if (EARLY_ON) { const k = W[n].rooms.filter(r => TX[r] && (ROYAL.includes(r) || TX[r].late || TX[r].early)).length; if (k > EARLY_MAX) c += (k - EARLY_MAX) * EARLY_PEN; }
    if (WB_ON) { const byF = {}; W[n].rooms.forEach(r => { if (WB.has(r) && TX[r]) byF[TX[r].floor] = (byF[TX[r].floor] || 0) + 1; });
      Object.keys(byF).forEach(f => { const cap = Math.max(1, Math.round((WB_CAP[f] || 0) * 0.6)); if (byF[f] > cap) c += (byF[f] - cap) * WB_EXTRA; }); }
    if (isTr(n)) { const fs = floors(n); if (fs.size > trMax(n)) c += 1000 * (fs.size - trMax(n)); c += W[n].rooms.filter(r => !trFloorOk(n, Math.floor(r / 100))).length * 1000;
      c += W[n].rooms.filter(r => TX[r] && (TX[r].late || TX[r].vip || TX[r].early)).length * 60; }
    if (SPEC_ON) c += W[n].rooms.filter(r => TX[r] && !specOk(n, TX[r].floor)).length * 300;
    if (lateN(n) > LATE_MAX) c += 100; if (fakN(n) > (n === A_KEY[18] ? FAK_OWNER_MAX : 1)) c += 300;
    return c;
  }
  const pc = (a, b) => { const set = new Set([a, b]); if (MATE[a]) set.add(MATE[a]); if (MATE[b]) set.add(MATE[b]); let c = 0; set.forEach(n => { c += costOf(n); }); return c; };
  const PIN = new Set(T.filter(x => x.floor >= 30 && W[A_KEY[x.floor]] && owner[x.room] === A_KEY[x.floor]).map(x => x.room));
  const movable = r => r !== '2901' && TX[r] && !PIN.has(r);
  const okRoyal = (n, r) => !ROYAL.includes(r) || ROYAL_OK.includes(n);
  function mv(r, a, b) { const x = TX[r]; W[a].rooms.splice(W[a].rooms.indexOf(r), 1); W[a].load -= x.w; W[b].rooms.push(r); W[b].load += x.w; owner[r] = b; }
  let improved = true, iter = 0;
  const names = Object.keys(W);
  while (improved && iter++ < 200) {
    improved = false;
    for (const x of free()) { let best = null;
      for (const n of names) { if (!okRoyal(n, x.room)) continue; const before = pc(n, n); W[n].rooms.push(x.room); W[n].load += x.w; const d = pc(n, n) - before; W[n].rooms.pop(); W[n].load -= x.w; if (!best || d < best.d) best = { n, d }; }
      if (best) { give(best.n, x, '남은 방'); improved = true; } }
    for (const a of names) for (const r of [...W[a].rooms]) { if (!movable(r)) continue;
      for (const b of names) { if (b === a || !okRoyal(b, r) || !W[a].rooms.includes(r)) continue;
        const c0 = pc(a, b); mv(r, a, b); const c1 = pc(a, b);
        if (c1 < c0 - 1e-9) { improved = true; continue; } mv(r, b, a);
        for (const s2 of [...W[b].rooms]) { if (!movable(s2) || !okRoyal(a, s2)) continue;
          const d0 = pc(a, b); mv(r, a, b); mv(s2, b, a); const d1 = pc(a, b);
          if (d1 < d0 - 1e-9) { improved = true; break; } mv(s2, a, b); mv(r, b, a); }
        if (!W[a].rooms.includes(r)) break; } }
  }
  const blocks = n => { const m = {}; W[n].rooms.filter(movable).forEach(r => { const f = TX[r].floor; (m[f] = m[f] || []).push(r); }); return m; };
  for (let it = 0, imp = true; imp && it < 30; it++) { imp = false;
    for (const a of names) for (const b of names) { if (a >= b) continue;
      const BA = blocks(a), BB = blocks(b);
      for (const fa of [null, ...Object.keys(BA)]) for (const fb of [null, ...Object.keys(BB)]) { if (!fa && !fb) continue;
        const ra = fa ? BA[fa] : [], rb = fb ? BB[fb] : [];
        if (ra.some(r => !okRoyal(b, r)) || rb.some(r => !okRoyal(a, r))) continue;
        if (!ra.every(r => W[a].rooms.includes(r)) || !rb.every(r => W[b].rooms.includes(r))) continue;
        const c0 = pc(a, b); ra.forEach(r => mv(r, a, b)); rb.forEach(r => mv(r, b, a));
        if (pc(a, b) < c0 - 1e-9) { imp = true; break; }
        ra.forEach(r => mv(r, b, a)); rb.forEach(r => mv(r, a, b)); }
    } }
  // 8 무작위 탐색 (담금질) — 시드 고정이면 같은 결과. opts.seeds = [시드, …] 면 같은 출발점에서 여러 번 돌려 가장 낮은 비용 채택
  let bestCost = Infinity, bestAll = null;
  const seeds = Array.isArray(opts.seeds) && opts.seeds.length ? opts.seeds : [opts.seed != null ? opts.seed : 12345];
  const snap0 = () => Object.fromEntries(names.map(n => [n, [...W[n].rooms]]));
  const load0 = sn => { names.forEach(n => { W[n].rooms = [...sn[n]]; W[n].load = W[n].rooms.reduce((s, r) => s + (r === '2901' ? 1 : TX[r].w), 0); W[n].rooms.forEach(r => { if (r !== '2901') owner[r] = n; }); }); };
  const start = snap0();
  for (let si = 0; si < seeds.length; si++) { load0(start);
  { let seed = Number(seeds[si]); const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const total = () => names.reduce((s, n) => s + costOf(n), 0);
    const snap = () => Object.fromEntries(names.map(n => [n, [...W[n].rooms]]));
    const load = sn => { names.forEach(n => { W[n].rooms = [...sn[n]]; W[n].load = W[n].rooms.reduce((s, r) => s + (r === '2901' ? 1 : TX[r].w), 0); W[n].rooms.forEach(r => { if (r !== '2901') owner[r] = n; }); }); };
    let cur = total(), best = cur, bestS = snap(); const N = Number(opts.iter != null ? opts.iter : 600000);
    for (let i = 0; i < N; i++) { const temp = 15 * Math.pow(0.002, i / N);
      if ((i & 32767) === 0) tick((si + i / N) / seeds.length);
      const a = names[Math.floor(rnd() * names.length)], b = names[Math.floor(rnd() * names.length)]; if (a === b) continue;
      const ra = W[a].rooms.filter(movable); if (!ra.length) continue;
      const kind = rnd(); let undo;
      const c0 = pc(a, b);
      if (kind < 0.4) { const r = ra[Math.floor(rnd() * ra.length)]; if (!okRoyal(b, r)) continue; mv(r, a, b); undo = () => mv(r, b, a); }
      else if (kind < 0.8) { const rb = W[b].rooms.filter(movable); if (!rb.length) continue; const r = ra[Math.floor(rnd() * ra.length)], q = rb[Math.floor(rnd() * rb.length)];
        if (!okRoyal(b, r) || !okRoyal(a, q)) continue; mv(r, a, b); mv(q, b, a); undo = () => { mv(q, a, b); mv(r, b, a); }; }
      else { const f = TX[ra[Math.floor(rnd() * ra.length)]].floor; const blk = ra.filter(r => TX[r].floor === f); if (blk.some(r => !okRoyal(b, r))) continue;
        const rb = W[b].rooms.filter(movable), g = rb.length && rnd() < 0.7 ? TX[rb[Math.floor(rnd() * rb.length)]].floor : null; const blk2 = g == null ? [] : rb.filter(r => TX[r].floor === g);
        if (blk2.some(r => !okRoyal(a, r))) continue; blk.forEach(r => mv(r, a, b)); blk2.forEach(r => mv(r, b, a)); undo = () => { blk2.forEach(r => mv(r, a, b)); blk.forEach(r => mv(r, b, a)); }; }
      const d = pc(a, b) - c0;
      if (d <= 0 || rnd() < Math.exp(-d / temp)) { cur += d; if (cur < best - 1e-9) { best = cur; bestS = snap(); } } else undo();
    }
    if (best < bestCost - 1e-9) { bestCost = best; bestAll = bestS; } }
  }
  load0(bestAll); tick(1);
  for (const n of names) { const w = W[n]; const keep = w.why.filter(t => /^2901|로얄/.test(t));
    w.why = keep.concat(w.rooms.filter(r => r !== '2901' && !ROYAL.includes(r)).map(r => { const x = TX[r], ko = keyOf(x); return r + (ko === n ? (OVR_WHY[r] ? ' ' + OVR_WHY[r] : ' 담당') : ' 보충'); }));
    if (w.load < capO[n] - 1e-9) w.why.unshift('유닛 다운 ' + capO[n] + '→' + w.load);
    if (w.load > capO[n] + 1e-9) w.why.unshift('+1 (베테랑 우선) ' + capO[n] + '→' + w.load); w.cap = w.load; }
  const left = free().map(x => x.room);
  for (const n of names) { const v = vipN(n), o = grpOf(n);
    const pr = royalN(n) ? W[n].rooms.filter(r => !ROYAL.includes(r) && TX[r] && TX[r].late) : [];
    if (pr.length) W[n].why.unshift('로얄 + 다른 우선정비 ' + pr.join('·') + ' (다른 분에게 줄 수 없었음)');
    const wb = W[n].rooms.filter(r => WB.has(r)); if (WB_ON && wb.length >= 3) W[n].why.unshift('벽배딩 ' + wb.length + '실 (' + wb.join('·') + ')');
    if (MATE[n]) { const u = new Set([...floors(n), ...floors(MATE[n])]); W[n].why.unshift('2인 1조 (' + MATE[n] + ') 합쳐 ' + u.size + '개 층'); }
    if (v && VIP_NO.has(n)) W[n].why.unshift('신입인데 VIP ' + v + '실 (다른 분에게 줄 수 없었음)');
    if (v >= 2) W[n].why.unshift('VIP ' + v + '실 (동선 때문에 2실' + (v > 2 ? ' 넘음' : '') + ')');
    if (o.g >= 3 && o.t - o.g < Math.ceil(o.t * GRP_RATIO - 1e-9)) W[n].why.unshift('단체 ' + o.g + ' / 일반 ' + (o.t - o.g) + (o.t === o.g ? ' — 단체만 (정비 지원 검토)' : ' — 일반이 적음')); }
  const workers = Object.fromEntries(Object.entries(W).map(([n, w]) => { const o = grpOf(n); return [n, { cap: w.cap, load: w.load, ho: capO[n], rooms: w.rooms, floors: [...floors(n)].sort((a, b) => b - a), why: w.why, vip: vipN(n), grp: o.g, gen: o.t - o.g }]; }));
  const fl = names.map(n => workers[n].floors.length).filter(k => k > 0);
  const stats = { target: T.length, units: T.reduce((s, x) => s + (x.room === '2901' ? (owner['2901'] ? owner['2901'].split(', ').length : 0) : x.w), 0),
    handover: Object.values(HO).reduce((a, b) => a + b, 0), left: left.length, avgFloors: fl.length ? fl.reduce((a, b) => a + b, 0) / fl.length : 0,
    three: names.filter(n => workers[n].floors.length >= 3), plt: owner['2901'] ? owner['2901'].split(', ') : [],
    vip2: names.filter(n => workers[n].vip >= 2), vipNew: names.filter(n => workers[n].vip && VIP_NO.has(n)), vipNo: names.filter(n => VIP_NO.has(n)), vipTotal: T.filter(x => x.vip).length, grpTotal: T.filter(x => x.grp).length,
    royPri: names.filter(n => royalN(n) && W[n].rooms.some(r => !ROYAL.includes(r) && TX[r] && TX[r].late)).map(n => n + ' ' + W[n].rooms.filter(r => !ROYAL.includes(r) && TX[r] && TX[r].late).join('·')),
    wallBed: WB_ON ? names.map(n => [n, W[n].rooms.filter(r => WB.has(r))]).filter(([, rs]) => rs.length).map(([n, rs]) => n + ' ' + rs.length) : [],
    forks: FORKS.map(k => Object.assign(k, { moved: bMoves.some(m => m.b === k.b) })),
    teams: Object.keys(LEAD).map(a => { const u = new Set([...floors(a), ...floors(MATE[a])]); return { a, b: MATE[a], floors: [...u].sort((p, q) => q - p) }; }),
    themeTotal: T.filter(x => x.theme).length,
    grpHeavy: names.filter(n => workers[n].grp >= 3 && workers[n].gen < Math.ceil((workers[n].grp + workers[n].gen) * GRP_RATIO - 1e-9)),
    down: names.filter(n => workers[n].load < capO[n] - 1e-9), up: names.filter(n => workers[n].load > capO[n] + 1e-9),
    bMove: bMoves.map(m => Object.assign({}, m, { kept: m.rooms.filter(r => owner[r] && m.a.includes(owner[r])).length, keptTo: W[m.b].rooms.filter(r => TX[r] && TX[r].floor === m.to).length, bFloors: [...floors(m.b)].sort((p, q) => q - p) })) };
  return { owner, workers, left, cost: Math.round(bestCost), stats };
}

// 하우스키퍼 완성본(이름 들어간 객실)과 엔진 결과 비교 — 같은 사람 비율 · 평균 층 수 · 3개 층 · 사람별
export function compare(roomsDone, res) {
  const norm = v => String(v || '').replace(/ /g, '').split(',').filter(Boolean).sort().join(',');
  const act = {}; roomsDone.forEach(x => { if (x.name) act[String(x.room)] = norm(x.name); });
  const mine = {}; Object.entries(res.owner).forEach(([r, n]) => { mine[r] = norm(n); });
  const rs = Object.keys(act); let same = 0; const diff = [];
  rs.forEach(r => { if (act[r] === mine[r]) same++; else diff.push({ room: r, hk: act[r], en: mine[r] || '' }); });
  const per = {}; roomsDone.forEach(x => { if (!x.name) return; String(x.name).replace(/ /g, '').split(',').filter(Boolean).forEach(n => { const p = per[n] = per[n] || { rooms: [], floors: new Set() }; p.rooms.push(String(x.room)); p.floors.add(Math.floor(Number(x.room) / 100)); }); });
  const names = Object.keys(res.workers);
  const hkF = names.map(n => (per[n] ? per[n].floors.size : 0)).filter(k => k > 0);
  const rows = names.map(n => { const hk = per[n] ? per[n].rooms : [], en = res.workers[n].rooms; return { name: n, hkFloors: per[n] ? [...per[n].floors].sort((a, b) => b - a) : [], enFloors: res.workers[n].floors, same: hk.filter(r => en.includes(r)).length, hk: hk.length, en: en.length }; });
  return { total: rs.length, same, pct: rs.length ? Math.round(same * 100 / rs.length) : 0, diff,
    hkAvg: hkF.length ? hkF.reduce((a, b) => a + b, 0) / hkF.length : 0, hkThree: names.filter(n => per[n] && per[n].floors.size >= 3), rows };
}
