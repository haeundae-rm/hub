// 시험용 가짜 store.js — rm/app/store.js 와 같은 함수 이름. 데이터는 window.__seed (메모리), 읽기 수는 window.__reads 로 셈
// 허브 시험용 가짜 store (메모리). window.__seed = { 'path': data }
export const SERVER_TIME = { __server: 1 };
export const kind = 'fake';
const D = window.__seed || {}; window.__reads = 0; window.__counts = 0;
// 새로 열어도 남는 자료 (야간 보고서 시험): sessionStorage 'fx' = { path: data } — night/ 에 쓴 것도 여기 남김
const FX = JSON.parse(sessionStorage.getItem('fx') || '{}'); Object.assign(D, FX);
const keepFx = p => { if (!/^(night\/|hksched\/|days\/[^/]+\/(key|recs)|meta\/keys)/.test(p)) return; if (D[p]) FX[p] = D[p]; else delete FX[p]; sessionStorage.setItem('fx', JSON.stringify(FX)); };
let user = JSON.parse(sessionStorage.getItem('fu') || 'null') || (window.__anonUid ? { uid: window.__anonUid, anon: true, email: '' } : null), cbs = [];
// 실시간 흉내 (window.__live, 키 서명 시험): 쓰면 듣고 있던 화면에 다시 알려 줌
const LS = [];
const fire = () => { if (window.__live) setTimeout(() => LS.forEach(f => f()), 0); };
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const val = v => (v === SERVER_TIME ? Date.now() : v instanceof Date ? v.getTime() : Array.isArray(v) ? v.map(val) : isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) : v);
// Firestore merge 처럼 안쪽 칸(map)까지 합침 (배열은 통째로 바꿈)
const deep = (a, b) => { const o = isObj(a) ? Object.assign({}, a) : {}; Object.keys(b).forEach(k => { o[k] = isObj(b[k]) && isObj(o[k]) ? deep(o[k], b[k]) : b[k]; }); return o; };
export function onUser(cb) { cbs.push(cb); setTimeout(() => cb(user), 0); return () => {}; }
export async function signInEmail(e, pw) { if (pw !== 'pw') throw Object.assign(new Error('x'), { code: 'auth/wrong-password' }); user = { uid: e.includes('+hk') ? 'nBL2QYezEmRNRmBRMXN6LNPJO2s2' : e.includes('+insp') ? '4sVIUKcXtYg28Lm7Qw41UqI6hRX2' : e.includes('sub') ? 'Fz4T5ZzIxShOdVkNpF9gzMmOLED2' : 'iw2orXgIgPgTbLUQa0b41XJ9Dvd2', anon: false, email: e }; sessionStorage.setItem('fu', JSON.stringify(user)); cbs.forEach(c => c(user)); }
export async function signOut() { user = null; sessionStorage.removeItem('fu'); cbs.forEach(c => c(null)); }
export async function signInAnon() {}
export async function idToken() { return 't'; }
const match = (d, w) => w.every(([k, op, v]) => { const x = d[k]; const n = y => (y instanceof Date ? y.getTime() : y);
  return op === '==' ? x === v : op === '>=' ? n(x) >= n(v) : op === '>' ? n(x) > n(v) : op === '<' ? n(x) < n(v) : op === '<=' ? n(x) <= n(v) : op === 'in' ? v.includes(x) : op === 'array-contains' ? (x || []).includes(v) : true; });
const kids = c => Object.keys(D).filter(p => p.startsWith(c + '/') && p.split('/').length === c.split('/').length + 1);
export async function get(p) { window.__reads++; return D[p] ? JSON.parse(JSON.stringify(D[p])) : null; }
export async function getQuery(c, w) { const r = kids(c).filter(p => match(D[p], w || [])).map(p => ({ id: p.split('/').pop(), data: JSON.parse(JSON.stringify(D[p])) })); window.__reads += Math.max(1, r.length); return r; }
export async function count(c, w) { window.__counts++; window.__reads++; return kids(c).filter(p => match(D[p], w || [])).length; }
// window.__hold (Promise): 화면엔 바로 반영되지만 서버 확인은 늦게 — 오프라인 · 저장 대기 흉내 (정비보고서 11/27)
// window.__deny (함수 p => true): 규칙 거부 흉내 — 저장 안 되고 약속이 실패
const ack = p => { if (window.__deny && window.__deny(p)) return Promise.reject(Object.assign(new Error('permission-denied'), { code: 'permission-denied' })); return window.__hold || Promise.resolve(); };
export function set(p, d) { if (window.__deny && window.__deny(p)) return ack(p); D[p] = val(d); keepFx(p); fire(); return ack(p); }
export function merge(p, d) { if (window.__deny && window.__deny(p)) return ack(p); D[p] = deep(D[p], val(d)); keepFx(p); fire(); return ack(p); }
export function add(c, d) { const id = 'a' + Math.random().toString(36).slice(2); return { id, done: set(c + '/' + id, d) }; }
export function batch(ops) {   // 묶음: 하나라도 거부면 아무것도 안 씀
  if (window.__deny && ops.some(o => window.__deny(o.path))) return Promise.reject(Object.assign(new Error('permission-denied'), { code: 'permission-denied' }));
  ops.forEach(o => { const p = o.op === 'add' ? o.path + '/a' + Math.random().toString(36).slice(2) : o.path; D[p] = o.op === 'merge' ? deep(D[p], val(o.data)) : val(o.data); keepFx(p); });
  fire(); return window.__hold || Promise.resolve();
}
export async function del(p) { delete D[p]; keepFx(p); }
export function listenDoc(p, cb) { const f = () => cb(D[p] ? JSON.parse(JSON.stringify(D[p])) : null, { fromCache: false }); setTimeout(f, 0); if (window.__live) LS.push(f); return () => { const i = LS.indexOf(f); if (i >= 0) LS.splice(i, 1); }; }
export function listenQuery(c, w, cb) { const f = () => getQuery(c, w).then(r => cb(r, { fromCache: false, pending: 0 })); f(); if (window.__live) LS.push(f); return () => { const i = LS.indexOf(f); if (i >= 0) LS.splice(i, 1); }; }
