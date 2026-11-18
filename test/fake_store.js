// 시험용 가짜 store.js — rm/app/store.js 와 같은 함수 이름. 데이터는 window.__seed (메모리), 읽기 수는 window.__reads 로 셈
// 허브 시험용 가짜 store (메모리). window.__seed = { 'path': data }
export const SERVER_TIME = { __server: 1 };
export const kind = 'fake';
const D = window.__seed || {}; window.__reads = 0; window.__counts = 0;
// 새로 열어도 남는 자료 (야간 보고서 시험): sessionStorage 'fx' = { path: data } — night/ 에 쓴 것도 여기 남김
const FX = JSON.parse(sessionStorage.getItem('fx') || '{}'); Object.assign(D, FX);
const keepFx = p => { if (!/^night\//.test(p)) return; if (D[p]) FX[p] = D[p]; else delete FX[p]; sessionStorage.setItem('fx', JSON.stringify(FX)); };
let user = JSON.parse(sessionStorage.getItem('fu') || 'null'), cbs = [];
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const val = v => (v === SERVER_TIME ? Date.now() : Array.isArray(v) ? v.map(val) : isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) : v);
// Firestore merge 처럼 안쪽 칸(map)까지 합침 (배열은 통째로 바꿈)
const deep = (a, b) => { const o = isObj(a) ? Object.assign({}, a) : {}; Object.keys(b).forEach(k => { o[k] = isObj(b[k]) && isObj(o[k]) ? deep(o[k], b[k]) : b[k]; }); return o; };
export function onUser(cb) { cbs.push(cb); setTimeout(() => cb(user), 0); return () => {}; }
export async function signInEmail(e, pw) { if (pw !== 'pw') throw Object.assign(new Error('x'), { code: 'auth/wrong-password' }); user = { uid: e.includes('+hk') ? 'nBL2QYezEmRNRmBRMXN6LNPJO2s2' : e.includes('+insp') ? '4sVIUKcXtYg28Lm7Qw41UqI6hRX2' : e.includes('sub') ? 'Fz4T5ZzIxShOdVkNpF9gzMmOLED2' : 'iw2orXgIgPgTbLUQa0b41XJ9Dvd2', anon: false, email: e }; sessionStorage.setItem('fu', JSON.stringify(user)); cbs.forEach(c => c(user)); }
export async function signOut() { user = null; sessionStorage.removeItem('fu'); cbs.forEach(c => c(null)); }
export async function signInAnon() {}
export async function idToken() { return 't'; }
const match = (d, w) => w.every(([k, op, v]) => { const x = d[k]; const n = y => (y instanceof Date ? y.getTime() : y);
  return op === '==' ? x === v : op === '>=' ? n(x) >= n(v) : op === '>' ? n(x) > n(v) : op === 'in' ? v.includes(x) : op === 'array-contains' ? (x || []).includes(v) : true; });
const kids = c => Object.keys(D).filter(p => p.startsWith(c + '/') && p.split('/').length === c.split('/').length + 1);
export async function get(p) { window.__reads++; return D[p] ? JSON.parse(JSON.stringify(D[p])) : null; }
export async function getQuery(c, w) { const r = kids(c).filter(p => match(D[p], w || [])).map(p => ({ id: p.split('/').pop(), data: JSON.parse(JSON.stringify(D[p])) })); window.__reads += Math.max(1, r.length); return r; }
export async function count(c, w) { window.__counts++; window.__reads++; return kids(c).filter(p => match(D[p], w || [])).length; }
export async function set(p, d) { D[p] = val(d); keepFx(p); }
export async function merge(p, d) { D[p] = deep(D[p], val(d)); keepFx(p); }
export function add(c, d) { const id = 'a' + Math.random().toString(36).slice(2); set(c + '/' + id, d); return { id, done: Promise.resolve() }; }
export async function del(p) { delete D[p]; keepFx(p); }
export function listenDoc(p, cb) { setTimeout(() => cb(D[p] || null, { fromCache: false }), 0); return () => {}; }
export function listenQuery(c, w, cb) { getQuery(c, w).then(r => cb(r, { fromCache: false, pending: 0 })); return () => {}; }
