// 자동 배정 엔진 전후 비교 (2026-11-19) — 예시 하루(무작위, 실제 이름은 담당표 기본값)를 여러 날 만들어 옛 엔진(old_assign.mjs)과 새 엔진(new_assign.mjs)을 같은 입력으로 돌려 점수 비교
// 준비: git show main:assign.js > old_assign.mjs · cp assign.js new_assign.mjs (같은 폴더) → node assign_cmp.mjs [날 수]   NO='{"cookPen":30}' 로 새 엔진 옵션 바꿔 보기
import * as O from './old_assign.mjs'; import * as N from './new_assign.mjs';
const C = O.DEF_CFG;
const cook = r => { const f = Math.floor(r / 100), s = r % 100; return ((f >= 5 && f <= 22) || f === 25 || f === 26) && s >= 12; };
const B_SUF = ['10', '11', '15', '16', '17'];
function day(seed) {
  const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(seed);
  const rooms = [];
  for (let f = 5; f <= 28; f++) { const n = f >= 27 ? 10 : f >= 23 && f <= 24 ? 16 : 18; for (let s = 1; s <= n; s++) if (rnd() < 0.45) rooms.push({ room: String(f * 100 + s), floor: f, st: '1', m1: '', m2: '', theme: rnd() < 0.03, grp: '', gh: 0 }); }
  const names = [...new Set([...Object.values(C.aKey), ...Object.values(C.bKey)])].sort(() => rnd() - 0.5);
  const ho = {}; names.slice(0, Math.round(rooms.length / 9)).forEach(n => { ho[n] = 9; });
  return { rooms, ho };
}
function score(res, d) {
  let bOn = 0, bAll = 0, keyLost = 0, themeB = 0, themeBAll = 0;
  for (let f = 5; f <= 26; f++) { const b = C.bKey[f]; if (!b || !d.ho[b] || b === C.aKey[f]) continue;
    const bz = d.rooms.filter(x => x.floor === f && B_SUF.includes(String(x.room).slice(-2))); if (!bz.length) continue;
    bAll++; if (res.workers[b].floors.includes(f)) bOn++;
    keyLost += bz.filter(x => res.owner[x.room] !== b).length;
    if (!d.ho[C.aKey[f]]) d.rooms.filter(x => x.floor === f && x.theme).forEach(x => { themeBAll++; if (res.owner[x.room] === b) themeB++; }); }
  let both = 0, pairs = 0; for (let f = 5; f <= 26; f++) { const a = C.aKey[f], b = C.bKey[f]; if (!b || a === b || !d.ho[a] || !d.ho[b]) continue; if (!d.rooms.some(x => x.floor === f)) continue; pairs++; const fa = res.workers[a].floors, fb = res.workers[b].floors; if (fa.length > 1 && fb.length > 1) both++; }
  const ws = Object.values(res.workers).filter(w => w.rooms.length);
  const keyOwn = (n, r) => { const f = Math.floor(r / 100), z = B_SUF.includes(String(r).slice(-2)) && !(f >= 27) ? 'B' : 'A'; return (z === 'B' ? C.bKey[f] : C.aKey[f]) === n; };
  const cookMax = Math.max(...Object.entries(res.workers).map(([n, w]) => w.rooms.filter(r => r !== '2901' && cook(+r) && !keyOwn(n, +r)).length));
  return { both, pairs, bOn, bAll, keyLost, themeB, themeBAll, avgF: ws.reduce((s, w) => s + w.floors.length, 0) / ws.length, three: ws.filter(w => w.floors.length >= 3).length, cookMax, left: res.left.length };
}
const tot = { O: {}, N: {} }; const add = (t, s) => Object.keys(s).forEach(k => { t[k] = (t[k] || 0) + s[k]; });
const K = Number(process.argv[2] || 12);
for (let i = 1; i <= K; i++) { const d = day(i * 97 + 1); const o = { seeds: [11, 23], iter: 60000 };
  add(tot.O, score(O.runAssign(d.rooms, d.ho, C, [], {}, o), d)); add(tot.N, score(N.runAssign(d.rooms, d.ho, C, [], {}, Object.assign({}, o, JSON.parse(process.env.NO || '{}'))), d)); }
for (const k of ['O', 'N']) { const t = tot[k]; console.log(k === 'O' ? '지금' : '고친 뒤', '| B키 자기 층 ' + t.bOn + '/' + t.bAll, '| B구역 남에게 ' + t.keyLost, '| A키 없을 때 테마→B키 ' + t.themeB + '/' + t.themeBAll, '| 평균 층 ' + (t.avgF / K).toFixed(2), '| 3개 층 ' + (t.three / K).toFixed(1) + '명/일', '| 남의 취사 최대 ' + (t.cookMax / K).toFixed(1), '| A·B 둘 다 층 이동 ' + t.both + '/' + t.pairs + '층', '| 미배정 ' + t.left); }
