// hub/sched/solver.js — 하우스맨 근무 스케줄 자동 편성 엔진 (2026-11-22). 화면 없이 계산만: HKSolver.solve/createRun/validate/nextCarry
// 시험: node 에서 require 가능 (module.exports)
// 하우스맨 근무 스케줄 자동 편성 엔진 (규칙 기반 + 담금질 탐색)
// 코드: A 주간, E 주간(11:30~22:00), C 야간, O 휴무, B 09~22, 연 연차(휴무 취급, O 집계 제외)
(function (root) {
  const WORK = { A: 1, E: 1, C: 1, B: 1 };
  const HARD = 1000;

  function allowedFor(s) {
    if (s.kind === 'ot') return ['A', 'O'];
    if (s.kind === 'day') return ['A', 'E', 'O'];
    return ['A', 'E', 'C', 'O'];
  }
  function isWork(c) { return !!WORK[c]; }
  function dow(y, m, d) { return new Date(y, m - 1, d).getDay(); } // 0=일

  function prep(inp) {
    const P = inp.staff.length, nd = inp.nd;
    const need = [];
    for (let d = 1; d <= nd; d++) {
      let t = { A: inp.need.A, E: inp.need.E, C: inp.need.C, O: inp.need.O };
      if (inp.extraDays.includes(d)) { t.A += 1; t.O -= 1; }
      let forcedCnt = 0;
      inp.staff.forEach(s => { const L = s.locks && s.locks[d]; if (L === '연' && inp.leaveMode === 'reduceA') { if (t.A > 0) t.A--; else if (t.E > 0) t.E--; } else if (L === '연') forcedCnt++; else if (s.forced.includes(d) || L === 'O') forcedCnt++; });
      if (forcedCnt > t.O) { let over = forcedCnt - t.O; t.O = forcedCnt; while (over > 0 && t.A > 1) { t.A--; over--; } while (over > 0 && t.E > 0) { t.E--; over--; } }
      need.push(t);
    }
    const lock = inp.staff.map(s => {
      const a = new Array(nd).fill(null);
      s.forced.forEach(d => { if (d >= 1 && d <= nd) a[d - 1] = 'O'; });
      if (s.locks) for (const k in s.locks) a[k - 1] = s.locks[k];
      return a;
    });
    const forced = inp.staff.map(s => { const a = new Array(nd + 1).fill(false); s.forced.forEach(d => a[d - 1] = true); return a; });
    const allowed = inp.staff.map(allowedFor);
    const rot = inp.staff.map(s => s.kind === 'rot');
    // 주 단위(월~일) 완전한 주
    const weeks = [];
    for (let d = 1; d + 6 <= nd; d++) if (dow(inp.year, inp.month, d) === 1) weeks.push(d - 1);
    // 목표치
    let totC = 0, totE = 0, totO = 0;
    need.forEach(t => { totC += t.C; totE += t.E; totO += t.O; });
    const nRot = rot.filter(Boolean).length;
    const lockedO = inp.staff.map((s, i) => lock[i].filter(c => c === 'O').length);
    const adj = (key, sign) => { // 누적 형평성 미세 조정 (최대 ±0.5)
      const ids = inp.staff.map((s, i) => i).filter(i => inp.staff[i].cum && inp.staff[i].cum[key] != null && (key !== 'C' || rot[i]) && (key !== 'E' || rot[i]));
      const out = new Array(P).fill(0);
      if (ids.length < 2) return out;
      const v = ids.map(i => inp.staff[i].cum[key]);
      const mu = v.reduce((a, b) => a + b, 0) / v.length;
      const sd = Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / v.length) || 1;
      ids.forEach((i, k) => { out[i] = Math.max(-0.5, Math.min(0.5, sign * 0.35 * (v[k] - mu) / sd)); });
      return out;
    };
    const w = inp.weights || {};
    const fair = w.fair == null ? 1 : w.fair;
    const aC = adj('C', -1), aE = adj('E', -1), aO = adj('workRate', +1);
    const tC = inp.staff.map((s, i) => rot[i] ? totC / nRot + fair * aC[i] : 0);
    const dayIdx = inp.staff.map((s, i) => i).filter(i => inp.staff[i].kind === 'day');
    const tEday = inp.eDayTarget || 15;
    const restE = totE - dayIdx.length * tEday;
    const tE = inp.staff.map((s, i) => s.kind === 'day' ? tEday : rot[i] ? restE / nRot + fair * aE[i] : 0);
    let tO = inp.staff.map((s, i) => totO / P + fair * aO[i] + (s.kind === 'ot' ? 0.35 : -0.35 / (P - 1)));
    // 강제휴무가 목표를 넘는 사람은 목표를 올리고 나머지를 깎음
    let excess = 0, under = [];
    tO = tO.map((t, i) => { if (lockedO[i] > t) { excess += lockedO[i] - t; return lockedO[i]; } under.push(i); return t; });
    under.forEach(i => tO[i] -= excess / under.length);
    return { P, nd, need, lock, forced, allowed, rot, weeks, tC, tE, tO, hol: new Set(inp.holidays || []), w, hw: HARD };
  }

  function rowCost(inp, X, p, r) {
    const s = inp.staff[p], nd = X.nd, fr = X.forced[p];
    let cost = 0;
    const cn = Math.min(s.carry ? s.carry.n || 0 : 0, 7);
    const ct = s.carry ? s.carry.type : 'O';
    const prev = i => i < 0 ? (cn > 0 ? ct : 'O') : r[i];
    // 전환 규칙
    for (let i = 0; i < nd; i++) {
      const c = r[i], b = prev(i - 1);
      if (c === 'C' && (b === 'A' || b === 'E' || b === 'B')) cost += X.hw;
      if (b === 'C' && (c === 'A' || c === 'E' || c === 'B')) cost += X.hw;
      if (c === 'C' && i + 1 < nd && fr[i + 1]) cost += X.hw;
      if (isWork(c) && X.hol.has(i + 1)) cost += 40 * (s.cum && s.cum.holRate != null ? s.cum.holRate : 0.75);
    }
    // 근무 연속 구간
    let i = 0;
    let cBlocks = 0;
    while (i < nd) {
      if (!isWork(r[i])) { i++; continue; }
      let j = i; while (j < nd && isWork(r[j])) j++;
      let L = j - i; const atStart = i === 0 && cn > 0 && isWork(ct); const atEnd = j === nd;
      const full = L + (atStart ? cn : 0);
      if (full > 6) cost += X.hw * (full - 6);
      if (!atStart && !atEnd) {
        if (L === 1) cost += 14; else if (L === 2) cost += 4;
        cost += 1.5 * (L - 5) * (L - 5);
      }
      // A/E 잦은 전환
      for (let k = i + 1; k < j; k++) { const a = r[k - 1], b = r[k]; if ((a === 'A' && b === 'E') || (a === 'E' && b === 'A')) cost += 5; }
      // E조 연속: 4일 초과 금지, 4일은 가급적 피함
      for (let k = i; k < j;) { if (r[k] !== 'E') { k++; continue; } let m = k; while (m < j && r[m] === 'E') m++; const eL = m - k; if (eL > 4) cost += X.hw * (eL - 4); else if (eL === 4) cost += 6; k = m; }
      i = j;
    }
    // 야간 블록
    i = 0;
    while (i < nd) {
      if (r[i] !== 'C') { i++; continue; }
      let j = i; while (j < nd && r[j] === 'C') j++;
      const L = j - i; const cont = i === 0 && ct === 'C' && cn > 0; const atEnd = j === nd;
      if (!cont) cBlocks++;
      if (!cont && !atEnd && L < 4) cost += 160 * (4 - L);
      if (cont && L + cn < 4 && !atEnd) cost += 60 * (4 - L - cn);
      i = j;
    }
    if (cBlocks > 2) cost += 300 * (cBlocks - 2);
    // 휴무 구간
    i = 0;
    while (i < nd) {
      if (r[i] === 'C' || isWork(r[i])) { i++; continue; }
      let j = i; while (j < nd && !isWork(r[j])) j++;
      const L = j - i; let anyForced = false; for (let k = i; k < j; k++) if (fr[k]) anyForced = true;
      const nearC = (i > 0 && r[i - 1] === 'C') || (j < nd && r[j] === 'C') || (i === 0 && ct === 'C' && cn > 0);
      const edge = i === 0 || j === nd;
      if (L === 1 && !nearC && !anyForced && !edge) cost += 12;
      if (L >= 3 && !anyForced) cost += 18 * (L - 2);
      if (L <= 3 && i > 0 && r[i - 1] === 'C' && j < nd && r[j] === 'C') cost += 400; // 야간-짧은휴무-야간 연속 방지
      i = j;
    }
    // 주 5일
    for (const ws of X.weeks) { let wk = 0; for (let k = ws; k < ws + 7; k++) if (isWork(r[k])) wk++; if (wk > 5) cost += 10 * (wk - 5); }
    return cost;
  }

  function colCost(inp, X, G, d) {
    const cnt = { A: 0, E: 0, C: 0, O: 0 }; let key = false;
    for (let p = 0; p < X.P; p++) {
      let c = G[p][d]; if (c === '연') { if (inp.leaveMode === 'reduceA') continue; c = 'O'; } if (c === 'B') c = 'E';
      cnt[c]++; if (c === 'C' && inp.staff[p].nightKey) key = true;
    }
    const t = X.need[d];
    let cost = X.hw * (Math.abs(cnt.A - t.A) + Math.abs(cnt.E - t.E) + Math.abs(cnt.C - t.C) + Math.abs(cnt.O - t.O));
    if (cnt.C > 0 && !key) cost += X.hw;
    return cost;
  }

  function counts(r) { const c = { A: 0, E: 0, C: 0, O: 0, B: 0, '연': 0 }; r.forEach(x => c[x]++); return c; }
  function globalCost(X, cnts) {
    let cost = 0;
    for (let p = 0; p < X.P; p++) {
      const c = cnts[p];
      if (X.rot[p]) cost += 90 * (c.C - X.tC[p]) ** 2;
      cost += 30 * (c.O - X.tO[p]) ** 2;
      if (X.tE[p]) cost += 18 * (c.E - X.tE[p]) ** 2;
    }
    return cost;
  }

  // 야간(C) 블록을 먼저 그리디로 배치한 뒤 나머지를 채우는 초기해
  function planNights(inp, X, rnd) {
    const P = X.P, nd = X.nd;
    const C = inp.staff.map(() => new Array(nd).fill(false));
    const resO = inp.staff.map(() => new Array(nd).fill(false));
    const st = inp.staff.map(s => ({ prev: s.carry && s.carry.n ? s.carry.type : 'O', run: s.carry && s.carry.type === 'C' ? s.carry.n : 0, blocks: 0, tot: 0, len: 4 + ((rnd() * 3) | 0) }));
    const lockedWork = (p, d) => { const L = X.lock[p][d]; return L && L !== 'C' && L !== 'O' && L !== '연'; };
    const blocked = (p, d) => X.forced[p][d] || (X.lock[p][d] && X.lock[p][d] !== 'C');
    let fails = 0;
    for (let d = 0; d < nd; d++) {
      const need = X.need[d].C;
      const oUsed = () => { let c = 0; for (let p = 0; p < P; p++) if (resO[p][d] || X.forced[p][d] || X.lock[p][d] === 'O' || X.lock[p][d] === '연') c++; return c; };
      const on = [];
      // 이어가기
      const cont = []; for (let p = 0; p < P; p++) if (X.rot[p] && st[p].prev === 'C' && st[p].run > 0) cont.push(p);
      cont.sort((a, b) => st[a].run - st[b].run);
      for (const p of cont) {
        const okDay = !blocked(p, d) && st[p].run < 6 && !(d + 1 < nd && X.forced[p][d + 1]);
        if (okDay && on.length < need && st[p].run < st[p].len) on.push(p);
      }
      // 블록이 짧게 끝나는 경우라도 필요하면 이어가기
      for (const p of cont) if (on.length < need && !on.includes(p) && !blocked(p, d) && st[p].run < 6 && !(d + 1 < nd && X.forced[p][d + 1])) on.push(p);
      // 새 블록 시작
      if (on.length < need) {
        let cand = [];
        for (let p = 0; p < P; p++) {
          if (!X.rot[p] || on.includes(p) || st[p].prev === 'C' || st[p].blocks >= 2) continue;
          if (blocked(p, d)) continue;
          let room = true; for (let k = d; k < Math.min(nd, d + 4); k++) if (blocked(p, k) || (k + 1 < nd && X.forced[p][k + 1])) room = false;
          if (!room) continue;
          if (st[p].prev !== 'O' && d > 0) { if (lockedWork(p, d - 1) || X.lock[p][d - 1] === 'C') continue; if (oUsed.call(null, d - 1) >= X.need[d - 1].O && !resO[p][d - 1]) { /* 전날 휴무 여유 없음 */ const c = (() => { let c = 0; for (let q = 0; q < P; q++) if (resO[q][d - 1] || X.forced[q][d - 1]) c++; return c; })(); if (c >= X.need[d - 1].O) continue; } }
          if (st[p].prev !== 'O' && d === 0) continue;
          cand.push(p);
        }
        const hasKey = on.some(p => inp.staff[p].nightKey);
        cand.sort((a, b) => (st[a].tot - st[b].tot) + (rnd() - 0.5) * 3);
        if (!hasKey) cand.sort((a, b) => (inp.staff[b].nightKey ? 1 : 0) - (inp.staff[a].nightKey ? 1 : 0));
        while (on.length < need && cand.length) {
          const p = cand.shift(); on.push(p);
          if (st[p].prev !== 'O' && d > 0) resO[p][d - 1] = true;
          st[p].blocks++; st[p].run = 0; st[p].len = 4 + ((rnd() * 3) | 0);
        }
      }
      if (on.length < need) fails += need - on.length;
      for (let p = 0; p < P; p++) {
        if (on.includes(p)) { C[p][d] = true; st[p].run++; st[p].tot++; st[p].prev = 'C'; }
        else {
          if (st[p].prev === 'C') { resO[p][d] = true; }
          st[p].prev = resO[p][d] || X.forced[p][d] ? 'O' : 'X'; if (st[p].prev !== 'C') st[p].run = 0;
        }
      }
      // 다음날 휴무 예약된 사람은 prev O로 간주하지 않음(당일 근무 가능) - 단순화
    }
    return { C, resO, fails };
  }


  // 하드 규칙을 모두 지키는 해를 날짜 순서 깊이우선탐색으로 찾기
  function dfsInit(inp, X, rnd, nodeLimit) {
    const P = X.P, nd = X.nd;
    const G = inp.staff.map(() => new Array(nd).fill(null));
    const st0 = inp.staff.map(s => {
      const n = s.carry ? s.carry.n || 0 : 0, t = s.carry ? s.carry.type : 'O';
      return { erun: 0, cend: t === 'C' && n ? 0 : -99, last: n ? (t === 'A' ? 'A' : t) : 'O', wrun: t !== 'O' ? n : 0, crun: t === 'C' ? n : 0, orun: t === 'O' ? n : 0, blocks: 0, cont: t === 'C' && n > 0, tC: 0, tE: 0, tO: 0, blen: 4 + ((rnd() * 3) | 0) };
    });
    let nodes = 0;
    const roomForC = (p, d) => { for (let k = d; k < Math.min(nd, d + 4); k++) { if (X.forced[p][k] || (X.lock[p][k] && X.lock[p][k] !== 'C')) return false; if (k + 1 < nd && X.forced[p][k + 1]) return false; } return true; };
    function options(p, d, s) {
      const L = X.lock[p][d];
      if (L) return [L];
      if (X.forced[p][d]) return ['O'];
      const al = X.allowed[p]; const out = [];
      const fTomorrow = d + 1 < nd && X.forced[p][d + 1];
      if (s.last === 'C') {
        const canC = s.crun < 6 && !fTomorrow && al.includes('C');
        if (canC) out.push('C');
        if (!(canC && s.crun < 4 && !s.cont) || d === 0) out.push('O');
        if (!canC && !out.includes('O')) out.push('O');
        return out;
      }
      const isW = s.last === 'A' || s.last === 'E' || s.last === 'B';
      if (isW && s.wrun >= 6) return ['O'];
      for (const c of al) {
        if (c === 'E' && s.last === 'E' && s.erun >= 4) continue;
        if (c === 'C') { if (isW || s.blocks >= 2 || fTomorrow || !roomForC(p, d) || d - s.cend < 5) continue; }
        out.push(c);
      }
      return out;
    }
    function score(p, c, s, d) {
      let v = 0; const tgtO = X.tO[p] * (d + 1) / nd, tgtC = X.tC[p] * (d + 1) / nd, tgtE = X.tE[p] * (d + 1) / nd;
      if (c === 'C') { if (s.last === 'C') v += s.crun < s.blen ? 6 : -2; else v += 2 * (tgtC - s.tC) - 1; }
      if (c === 'O') { v += 1.5 * (tgtO - s.tO); if (s.last === 'O') v += s.orun === 1 ? 2 : -4; else if (s.wrun >= 5) v += 3; else if (s.wrun <= 2 && s.last !== 'C') v -= 2; if (s.last === 'C') v += 2; }
      if (c === 'E') { v += 1.2 * (tgtE - s.tE); if (s.last === 'E') v += s.erun >= 3 ? -2 : 1.5; }
      if (c === 'A' && s.last === 'A') v += 1.5;
      if ((c === 'A' || c === 'E') && s.last === 'O' && s.orun === 1 && !(d > 1 && G[p][d - 2] === 'C')) v -= 1.5;
      return v;
    }
    function combos(d, S) {
      const opts = []; for (let p = 0; p < P; p++) opts.push(options(p, d, S[p]));
      const need = X.need[d]; const res = []; const cur = new Array(P);
      const cnt = { A: 0, E: 0, C: 0, O: 0 };
      const keyOf = c => c === 'B' ? 'E' : c === '연' ? 'O' : c;
      (function rec(p) {
        if (res.length > 4000) return;
        if (p === P) {
          if (cnt.A !== need.A || cnt.E !== need.E || cnt.C !== need.C || cnt.O !== need.O) return;
          let key = false; for (let q = 0; q < P; q++) if (cur[q] === 'C' && inp.staff[q].nightKey) key = true;
          if (need.C > 0 && !key) return;
          let sc = 0; for (let q = 0; q < P; q++) sc += score(q, cur[q], S[q], d);
          res.push({ col: cur.slice(), sc: sc + rnd() * 3 });
          return;
        }
        for (const c of opts[p]) { if (c === '연' && inp.leaveMode === 'reduceA') { cur[p] = c; rec(p + 1); continue; } const k = keyOf(c); if (cnt[k] >= need[k]) continue; cnt[k]++; cur[p] = c; rec(p + 1); cnt[k]--; }
      })(0);
      res.sort((a, b) => b.sc - a.sc);
      return res;
    }
    function adv(s, c, d0Now) {
      const n = Object.assign({}, s);
      const w = c === 'A' || c === 'E' || c === 'C' || c === 'B';
      if (c === 'C') { if (s.last !== 'C') { n.blocks++; n.crun = 0; n.cont = false; n.blen = 4 + ((rnd() * 3) | 0); } n.crun++; n.tC++; }
      else { n.crun = 0; if (s.last === 'C') { n.cont = false; n.cend = d0Now; } }
      n.wrun = w ? (s.last === 'O' || s.last === '연' ? 1 : s.wrun + 1) : 0;
      n.orun = w ? 0 : (s.last === 'O' || s.last === '연' ? s.orun + 1 : 1);
      if (c === 'E') n.tE++; if (c === 'O') n.tO++;
      n.erun = c === 'E' ? (s.last === 'E' ? s.erun + 1 : 1) : 0;
      n.last = c === '연' ? 'O' : c; return n;
    }
    function rec(d, S) {
      if (d === nd) return true;
      if (++nodes > nodeLimit) return false;
      const cs = combos(d, S);
      const lim = Math.min(cs.length, d < 3 ? 40 : 6);
      for (let i = 0; i < lim; i++) {
        const col = cs[i].col;
        for (let p = 0; p < P; p++) G[p][d] = col[p];
        const S2 = S.map((s, p) => adv(s, col[p], d - 1));
        if (rec(d + 1, S2)) return true;
        if (nodes > nodeLimit) return false;
      }
      return false;
    }
    return rec(0, st0) ? G : null;
  }

  function initGrid(inp, X, rnd) {
    let plan = null;
    for (let t = 0; t < 40; t++) { const pl = planNights(inp, X, rnd); if (!plan || pl.fails < plan.fails) plan = pl; if (!pl.fails) break; }
    const G = inp.staff.map(() => new Array(X.nd).fill('O'));
    for (let d = 0; d < X.nd; d++) {
      let best = null, bestDev = 1e9;
      for (let t = 0; t < 60; t++) {
        const col = new Array(X.P).fill(null); const need = Object.assign({}, X.need[d]);
        for (let p = 0; p < X.P; p++) {
          const L = X.lock[p][d];
          if (L) { col[p] = L; const k = L === '연' ? 'O' : L === 'B' ? 'E' : L; need[k]--; }
          else if (plan.C[p][d]) { col[p] = 'C'; need.C--; }
          else if (plan.resO[p][d]) { col[p] = 'O'; need.O--; }
        }
        const free = []; for (let p = 0; p < X.P; p++) if (!col[p]) free.push(p);
        free.sort(() => rnd() - 0.5);
        if (d > 0) free.sort((a, b) => (G[a][d - 1] === 'O') - (G[b][d - 1] === 'O'));
        for (const code of ['E', 'A', 'O', 'C']) {
          for (const p of free) { if (col[p] || need[code] <= 0) continue; if (!X.allowed[p].includes(code)) continue; col[p] = code; need[code]--; }
        }
        free.forEach(p => { if (!col[p]) col[p] = 'O'; });
        const dev = Math.abs(need.A) + Math.abs(need.E) + Math.abs(need.C) + Math.abs(need.O);
        if (dev < bestDev) { bestDev = dev; best = col; if (!dev) break; }
      }
      for (let p = 0; p < X.P; p++) G[p][d] = best[p];
    }
    return G;
  }

  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function totalCost(inp, X, G) {
    let c = 0; const cn = G.map(counts);
    for (let p = 0; p < X.P; p++) c += rowCost(inp, X, p, G[p]);
    for (let d = 0; d < X.nd; d++) c += colCost(inp, X, G, d);
    return c + globalCost(X, cn);
  }

  // 한 번의 탐색 실행기 (청크 단위로 돌릴 수 있게 상태 객체 반환)
  function createRun(inp, seed, iters, startGrid) {
    const X = prep(inp); const rnd = mulberry(seed);
    let feasibleStart = false, G = null;
    if (startGrid) G = startGrid.map(r => r.slice());
    else { for (let k = 0; k < 6 && !G; k++) G = dfsInit(inp, X, rnd, 3000); feasibleStart = !!G; if (!G) G = initGrid(inp, X, rnd); }
    // 잠긴 칸 강제
    for (let p = 0; p < X.P; p++) for (let d = 0; d < X.nd; d++) if (X.lock[p][d]) G[p][d] = X.lock[p][d];
    const rc = G.map((r, p) => rowCost(inp, X, p, r));
    const cc = []; for (let d = 0; d < X.nd; d++) cc.push(colCost(inp, X, G, d));
    const cn = G.map(counts);
    let gc = globalCost(X, cn);
    let cur = rc.reduce((a, b) => a + b, 0) + cc.reduce((a, b) => a + b, 0) + gc;
    let best = cur, bestG = G.map(r => r.slice()), bestCur = Infinity;
    let it = 0; const T0 = feasibleStart ? 25 : 40, T1 = 0.05;
    const recompute = () => {
      for (let p = 0; p < X.P; p++) rc[p] = rowCost(inp, X, p, G[p]);
      for (let d = 0; d < X.nd; d++) cc[d] = colCost(inp, X, G, d);
      gc = globalCost(X, cn);
      cur = rc.reduce((a, b) => a + b, 0) + cc.reduce((a, b) => a + b, 0) + gc;
    };
    const hw0 = feasibleStart ? 120 : 25; const hwAt = i => { const f = Math.min(1, i / (iters * 0.7)); return hw0 * Math.pow(HARD * 1.5 / hw0, f); };
    const evalTrue = () => { const keep = X.hw; X.hw = HARD; const v = totalCost(inp, X, G); X.hw = keep; return v; };
    best = evalTrue(); X.hw = hwAt(0); recompute();
    const every = Math.max(1000, (iters / 200) | 0);
    const free = (p, d) => !X.lock[p][d];
    function step(n) {
      const end = Math.min(iters, it + n);
      for (; it < end; it++) {
        if (it % every === 0) { X.hw = hwAt(it); recompute(); }
        const T = T0 * Math.pow(T1 / T0, it / iters);
        const mv = rnd();
        let p1 = (rnd() * X.P) | 0, p2 = (rnd() * X.P) | 0;
        let d0 = (rnd() * X.nd) | 0, len = 1;
        let single = false, newCode = null;
        if (mv < 0.06) { single = true; } else if (mv < 0.3) { len = 2 + ((rnd() * 7) | 0); }
        else if (mv < 0.45) { // 야간 블록 단위 교환 (앞뒤 1일 포함)
          if (!X.rot[p1] || !X.rot[p2]) continue;
          let d = (rnd() * X.nd) | 0; let tries = 0; while (G[p1][d] !== 'C' && tries++ < X.nd) d = (d + 1) % X.nd;
          if (G[p1][d] !== 'C') continue;
          let a = d, b = d; while (a > 0 && G[p1][a - 1] === 'C') a--; while (b < X.nd - 1 && G[p1][b + 1] === 'C') b++;
          a = Math.max(0, a - ((rnd() * 2) | 0)); b = Math.min(X.nd - 1, b + ((rnd() * 2) | 0));
          d0 = a; len = b - a + 1;
        }
        if (single) {
          if (!free(p1, d0)) continue;
          const al = X.allowed[p1]; newCode = al[(rnd() * al.length) | 0];
          if (newCode === G[p1][d0]) continue;
          const old = G[p1][d0]; G[p1][d0] = newCode;
          const nr = rowCost(inp, X, p1, G[p1]); const ncc = colCost(inp, X, G, d0);
          cn[p1][old]--; cn[p1][newCode]++; const ng = globalCost(X, cn);
          const delta = (nr - rc[p1]) + (ncc - cc[d0]) + (ng - gc);
          if (delta <= 0 || rnd() < Math.exp(-delta / T)) { rc[p1] = nr; cc[d0] = ncc; gc = ng; cur += delta; }
          else { G[p1][d0] = old; cn[p1][newCode]--; cn[p1][old]++; }
        } else {
          if (p1 === p2) continue;
          if (d0 + len > X.nd) len = X.nd - d0;
          let ok = true, diff = false;
          for (let d = d0; d < d0 + len; d++) {
            if (!free(p1, d) || !free(p2, d)) { ok = false; break; }
            if (!X.allowed[p2].includes(G[p1][d]) || !X.allowed[p1].includes(G[p2][d])) { ok = false; break; }
            if (G[p1][d] !== G[p2][d]) diff = true;
          }
          if (!ok || !diff) continue;
          const sw = () => { for (let d = d0; d < d0 + len; d++) { const a = G[p1][d], b = G[p2][d]; G[p1][d] = b; G[p2][d] = a; cn[p1][a]--; cn[p1][b]++; cn[p2][b]--; cn[p2][a]++; } };
          sw();
          const n1 = rowCost(inp, X, p1, G[p1]), n2 = rowCost(inp, X, p2, G[p2]);
          let dc = 0; const ncs = [];
          for (let d = d0; d < d0 + len; d++) { const v = colCost(inp, X, G, d); ncs.push(v); dc += v - cc[d]; }
          const ng = globalCost(X, cn);
          const delta = (n1 - rc[p1]) + (n2 - rc[p2]) + dc + (ng - gc);
          if (delta <= 0 || rnd() < Math.exp(-delta / T)) {
            rc[p1] = n1; rc[p2] = n2; ncs.forEach((v, k) => cc[d0 + k] = v); gc = ng; cur += delta;
          } else sw();
        }
        if (X.hw >= HARD && cur < bestCur - 1e-9) { const tv = evalTrue(); if (tv < best) { best = tv; bestG = G.map(r => r.slice()); } bestCur = cur; }
      }
      return it >= iters;
    }
    return { step, feasibleStart, get best() { return best; }, get grid() { return bestG; }, get progress() { return it / iters; }, X };
  }

  // 마무리: 모든 교환·구간교환·단일변경을 전수 검사하는 언덕오르기
  function polish(inp, G) {
    const X = prep(inp); G = G.map(r => r.slice());
    const free = (p, d) => !X.lock[p][d];
    let cur = totalCost(inp, X, G), improved = true, rounds = 0;
    while (improved && rounds++ < 30) {
      improved = false;
      for (let len = 1; len <= 8; len++) for (let p1 = 0; p1 < X.P; p1++) for (let p2 = p1 + 1; p2 < X.P; p2++) for (let d0 = 0; d0 + len <= X.nd; d0++) {
        let ok = true, diff = false;
        for (let d = d0; d < d0 + len; d++) { if (!free(p1, d) || !free(p2, d) || !X.allowed[p2].includes(G[p1][d]) || !X.allowed[p1].includes(G[p2][d])) { ok = false; break; } if (G[p1][d] !== G[p2][d]) diff = true; }
        if (!ok || !diff) continue;
        const sw = () => { for (let d = d0; d < d0 + len; d++) { const a = G[p1][d]; G[p1][d] = G[p2][d]; G[p2][d] = a; } };
        sw(); const v = totalCost(inp, X, G);
        if (v < cur - 1e-9) { cur = v; improved = true; } else sw();
      }
      for (let p = 0; p < X.P; p++) for (let d = 0; d < X.nd; d++) {
        if (!free(p, d)) continue; const old = G[p][d];
        for (const c of X.allowed[p]) { if (c === old) continue; G[p][d] = c; const v = totalCost(inp, X, G); if (v < cur - 1e-9) { cur = v; improved = true; break; } G[p][d] = old; }
      }
    }
    return { grid: G, cost: cur };
  }

  // 두 사람·10일 창 안에서 '그날 맞바꿀지 말지' 조합을 전수 탐색 (일자별 인원 유지)
  function pairLNS(inp, G, W) {
    const X = prep(inp); G = G.map(r => r.slice()); W = W || 10;
    const cn = G.map(counts);
    const rc = G.map((r, p) => rowCost(inp, X, p, r));
    const cc = []; for (let d = 0; d < X.nd; d++) cc.push(colCost(inp, X, G, d));
    let improved = true, rounds = 0;
    while (improved && rounds++ < 12) {
      improved = false;
      for (let p = 0; p < X.P; p++) for (let q = p + 1; q < X.P; q++) for (let d0 = 0; d0 < X.nd; d0 += 3) {
        const days = [];
        for (let d = d0; d < Math.min(X.nd, d0 + W); d++) {
          if (X.lock[p][d] || X.lock[q][d] || G[p][d] === G[q][d]) continue;
          if (!X.allowed[q].includes(G[p][d]) || !X.allowed[p].includes(G[q][d])) continue;
          days.push(d);
        }
        if (!days.length) continue;
        const base = rc[p] + rc[q] + days.reduce((a, d) => a + cc[d], 0) + globalCost(X, cn);
        let bestV = base, bestM = 0; const n = days.length, lim = 1 << n;
        const apply = m => { for (let k = 0; k < n; k++) if (m >> k & 1) { const d = days[k]; const a = G[p][d], b = G[q][d]; G[p][d] = b; G[q][d] = a; cn[p][a]--; cn[p][b]++; cn[q][b]--; cn[q][a]++; } };
        for (let m = 1; m < lim; m++) {
          apply(m);
          const v = rowCost(inp, X, p, G[p]) + rowCost(inp, X, q, G[q]) + days.reduce((a, d) => a + colCost(inp, X, G, d), 0) + globalCost(X, cn);
          if (v < bestV - 1e-9) { bestV = v; bestM = m; }
          apply(m);
        }
        if (bestM) {
          apply(bestM); improved = true;
          rc[p] = rowCost(inp, X, p, G[p]); rc[q] = rowCost(inp, X, q, G[q]); days.forEach(d => cc[d] = colCost(inp, X, G, d));
        }
      }
    }
    return G;
  }

  // 연차일 처리 방식 결정: 기본은 연차를 휴무 인원에 포함, 불가능하면 근무 인원에서 차감
  function chooseMode(inp, seed) {
    const rnd = mulberry(seed || 99);
    for (const mode of ['inO', 'reduceA']) {
      const I = Object.assign({}, inp, { leaveMode: mode }); const X = prep(I);
      for (let k = 0; k < 6; k++) if (dfsInit(I, X, rnd, 3000)) return I;
      if (!inp.staff.some(s => s.locks && Object.values(s.locks).includes('연'))) break;
    }
    return Object.assign({}, inp, { leaveMode: 'inO' });
  }

  function solve(inp, opts) {
    opts = opts || {};
    inp = chooseMode(inp, opts.seed);
    const restarts = opts.restarts || 4, iters = opts.iters || 300000;
    let bestRun = null;
    for (let k = 0; k < restarts; k++) {
      const run = createRun(inp, (opts.seed || 12345) + k * 7919, iters);
      run.step(iters);
      if (!bestRun || run.best < bestRun.best) bestRun = run;
    }
    let g = bestRun.grid;
    for (let k = 0; k < 3; k++) { g = pairLNS(inp, g, 10); g = polish(inp, g).grid; }
    const X = prep(inp);
    return { grid: g, cost: totalCost(inp, X, g) };
  }

  // 사람이 읽는 규칙 검사
  function validate(inp, G) {
    const X = prep(inp); const out = [];
    const nm = p => inp.staff[p].name;
    for (let d = 0; d < X.nd; d++) {
      const cnt = { A: 0, E: 0, C: 0, O: 0 }; let key = false;
      for (let p = 0; p < X.P; p++) { let c = G[p][d] || 'O'; if (c === '연') { if (inp.leaveMode === 'reduceA') continue; c = 'O'; } if (c === 'B') c = 'E'; cnt[c]++; if (c === 'C' && inp.staff[p].nightKey) key = true; }
      const t = X.need[d];
      const bad = ['A', 'E', 'C', 'O'].filter(k => cnt[k] !== t[k]);
      if (bad.length) out.push({ lv: 'hard', d: d + 1, msg: `${d + 1}일 인원 불일치: ` + bad.map(k => `${k} ${cnt[k]}/${t[k]}`).join(', ') });
      if (cnt.C > 0 && !key) out.push({ lv: 'hard', d: d + 1, msg: `${d + 1}일 야간에 방 편성 가능 인원 없음` });
    }
    for (let p = 0; p < X.P; p++) {
      const s = inp.staff[p], r = G[p], cn = Math.min(s.carry ? s.carry.n || 0 : 0, 7), ct = s.carry ? s.carry.type : 'O';
      const prev = i => i < 0 ? (cn > 0 ? ct : 'O') : r[i];
      for (let i = 0; i < X.nd; i++) {
        const c = r[i], b = prev(i - 1);
        if (X.forced[p][i] && c !== 'O' && c !== '연') out.push({ lv: 'hard', p, d: i + 1, msg: `${nm(p)} ${i + 1}일 휴무신청일인데 근무 배정` });
        if (c === 'C' && (b === 'A' || b === 'E' || b === 'B')) out.push({ lv: 'hard', p, d: i + 1, msg: `${nm(p)} ${i + 1}일 야간 시작 전 휴무 없음` });
        if (b === 'C' && (c === 'A' || c === 'E' || c === 'B')) out.push({ lv: 'hard', p, d: i + 1, msg: `${nm(p)} ${i + 1}일 야간 직후 휴무 없이 주간` });
        if (c === 'C' && i + 1 < X.nd && X.forced[p][i + 1]) out.push({ lv: 'hard', p, d: i + 1, msg: `${nm(p)} ${i + 1}일 휴무신청 전날 야간` });
        if (c && !X.allowed[p].includes(c) && !['B', '연'].includes(c) && !(X.lock[p][i])) out.push({ lv: 'hard', p, d: i + 1, msg: `${nm(p)} ${i + 1}일 ${c} 배정 불가 인원` });
      }
      let i = 0, cBlocks = 0;
      while (i < X.nd) {
        if (!isWork(r[i])) { i++; continue; }
        let j = i; while (j < X.nd && isWork(r[j])) j++;
        const full = (j - i) + (i === 0 && cn > 0 && isWork(ct) ? cn : 0);
        if (full > 6) out.push({ lv: 'hard', p, d: i + 1, msg: `${nm(p)} ${i + 1}일부터 연속근무 ${full}일 (최대 6일)` });
        for (let k = i; k < j;) { if (r[k] !== 'E') { k++; continue; } let m = k; while (m < j && r[m] === 'E') m++; if (m - k > 4) out.push({ lv: 'hard', p, d: k + 1, msg: `${nm(p)} ${k + 1}일부터 E조 ${m - k}일 연속 (최대 4일)` }); k = m; }
        i = j;
      }
      i = 0;
      while (i < X.nd) {
        if (r[i] !== 'C') { i++; continue; }
        let j = i; while (j < X.nd && r[j] === 'C') j++;
        const cont = i === 0 && ct === 'C' && cn > 0;
        if (!cont) cBlocks++;
        if (!cont && j < X.nd && j - i < 4) out.push({ lv: 'soft', p, d: i + 1, msg: `${nm(p)} ${i + 1}일 야간 블록 ${j - i}일 (권장 4~6일)` });
        i = j;
      }
      if (cBlocks > 2) out.push({ lv: 'soft', p, msg: `${nm(p)} 야간 블록 ${cBlocks}회 (기준 2회)` });
      for (const ws of X.weeks) { let wk = 0; for (let k = ws; k < ws + 7; k++) if (isWork(r[k])) wk++; if (wk > 5) out.push({ lv: 'info', p, d: ws + 1, msg: `${nm(p)} ${ws + 1}일 주간(월~일) ${wk}일 근무` }); }
    }
    return out;
  }

  function nextCarry(row) {
    const nd = row.length; const last = row[nd - 1];
    const cls = c => c === 'C' ? 'C' : isWork(c) ? 'A' : 'O';
    const t = cls(last); let n = 0;
    for (let i = nd - 1; i >= 0 && cls(row[i]) === t; i--) n++;
    return { type: t, n };
  }

  const api = { chooseMode, dfsInit, solve, polish, pairLNS, validate, createRun, prep, totalCost, nextCarry, allowedFor };
  if (typeof module !== 'undefined') module.exports = api; else root.HKSolver = api;
})(this);
