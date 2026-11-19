// 📝 배정 의견 매일 점검 도구 (2026-11-19) — 매일 오전 10시 Claude 점검이 씀 (사람이 쓸 일 없음)
// 점검 계정(읽기 + 답만, 규칙 v19 isAsgBot)으로 로그인 → 새 의견 · 최근 배정 기록 · 대조 기록을 읽고, 의견에 답을 담
// 필요한 것: 환경 변수 ASG_BOT_EMAIL · ASG_BOT_PW (클라우드 환경 설정에만, 저장소·대화에 적지 않음)
//           네트워크 허용 identitytoolkit.googleapis.com · firestore.googleapis.com
// 쓰는 법:
//   node tools/asg_check.mjs list [폴더]          → 답 안 단 의견(new) + 질문(ask)에 이어 쓴 것 + 최근 14일 asg_days + meta/assign 대조 기록을 폴더에 JSON 으로, 요약은 화면에
//   node tools/asg_check.mjs reply <id> <st> <답글.txt> [버전]   st = ask | plan | done | hold | keep
// 프록시: curl 을 씀 (HTTPS_PROXY 그대로 따름)
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const KEY = 'AIzaSyCyESLB9lGONuwXQUWBz6hPw09u9Zq9yFQ';   // 앱에 이미 공개된 웹 키 (rm/app/store.js 와 같음)
const BASE = process.env.ASG_TEST_BASE || 'https://firestore.googleapis.com/v1/projects/haeundae-rm/databases/(default)/documents';   // ASG_TEST_BASE = 에뮬레이터 시험용
const ST = ['new', 'ask', 'plan', 'done', 'hold', 'keep'];

function curl(method, url, body, tok) {
  const args = ['-sS', '-X', method, url, '-H', 'Content-Type: application/json'];
  if (tok) args.push('-H', 'Authorization: Bearer ' + tok);
  if (body) args.push('--data-binary', '@-');
  const out = execFileSync('curl', args, { input: body ? JSON.stringify(body) : undefined, maxBuffer: 64 << 20 }).toString();
  const j = out ? JSON.parse(out) : {};
  const e = Array.isArray(j) ? j.find(x => x.error) : j.error;
  if (e) throw new Error((e.error || e).message || JSON.stringify(e));
  return j;
}
function login() {
  if (process.env.ASG_TEST_BASE) return 'owner';
  const email = process.env.ASG_BOT_EMAIL, password = process.env.ASG_BOT_PW;
  if (!email || !password) throw new Error('ASG_BOT_EMAIL · ASG_BOT_PW 환경 변수가 없어요 (클라우드 환경 설정)');
  return curl('POST', 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + KEY, { email, password, returnSecureToken: true }).idToken;
}
// Firestore 값 → 보통 값
function plain(v) {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(plain);
  if ('mapValue' in v) return fields(v.mapValue.fields);
  return v;
}
const fields = f => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, plain(v)]));
const docOf = d => Object.assign({ id: d.name.split('/').pop() }, fields(d.fields));
const kst = t => new Date(Number(t) + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
const ymd = t => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);

function query(tok, coll, field, op, value) {
  const r = curl('POST', BASE + ':runQuery', { structuredQuery: { from: [{ collectionId: coll }], where: { fieldFilter: { field: { fieldPath: field }, op, value: { stringValue: value } } } } }, tok);
  return r.filter(x => x.document).map(x => docOf(x.document));
}

function list(dir) {
  const tok = login();
  dir = dir || path.resolve('asg_check_out');
  fs.mkdirSync(dir, { recursive: true });
  const since = ymd(Date.now() - 60 * 864e5);
  const all = query(tok, 'asg_notes', 'd', 'GREATER_THAN_OR_EQUAL', since).filter(x => !x.hide).sort((a, b) => (a.at || 0) - (b.at || 0));
  const todo = all.filter(x => x.st === 'new');
  const days = query(tok, 'asg_days', 'date', 'GREATER_THAN_OR_EQUAL', ymd(Date.now() - 14 * 864e5));
  let meta = null; try { meta = docOf(curl('GET', BASE + '/meta/assign', null, tok)); } catch (e) {}
  fs.writeFileSync(path.join(dir, 'notes_all.json'), JSON.stringify(all, null, 1));
  fs.writeFileSync(path.join(dir, 'notes_todo.json'), JSON.stringify(todo, null, 1));
  fs.writeFileSync(path.join(dir, 'days.json'), JSON.stringify(days, null, 1));
  fs.writeFileSync(path.join(dir, 'meta_assign.json'), JSON.stringify(meta, null, 1));
  console.log('# 배정 의견 점검 ' + kst(Date.now()) + ' KST');
  console.log('새 의견 ' + todo.length + '건 · 최근 60일 전체 ' + all.length + '건 · 배정 기록 ' + days.length + '일 · 저장 폴더 ' + dir);
  todo.forEach(x => {
    const prev = x.re ? all.find(y => y.id === x.re) : null;
    console.log('\n## ' + x.id + ' · ' + x.d + ' 배정 · ' + x.by + ' (' + (x.acct || '') + ') · ' + (x.kind === 'once' ? '이번만' : '앞으로 계속') + ' · ' + kst(x.at));
    if (prev) console.log('  ↳ 이어 쓴 의견 ' + prev.id + ': ' + prev.text + '\n  ↳ 그때 답: ' + (prev.reply || ''));
    console.log('  ' + x.text.replace(/\n/g, '\n  '));
    if (x.snap) console.log('  [배정 결과 있음: ' + Object.keys(x.snap.final || {}).length + '명 · 고친 것 ' + (x.snap.edits || []).length + '건' + (x.snap.cmp ? ' · HK 대조 ' + x.snap.cmp.pct + '%' : '') + ']');
  });
  console.log('\n## 최근 배정 기록 (asg_days)');
  days.sort((a, b) => (a.date < b.date ? -1 : 1)).forEach(d => console.log('  ' + d.date + ' · 고친 것 ' + (d.nEdits != null ? d.nEdits : '-') + ' · 평균 층 ' + ((d.stats || {}).avgFloors != null ? d.stats.avgFloors : '-') + ' · 3개 층 ' + ((d.stats || {}).three || []).length + (d.cmp ? ' · HK 대조 ' + d.cmp.pct + '%' : '') + (d.sentAt ? ' · 앱에 올림' : '')));
  const log = (meta && meta.log) || [];
  if (log.length) console.log('\n## 하우스키퍼 대조 (meta/assign.log 최근 10)\n  ' + log.slice(-10).map(x => x.date + ' ' + x.pct + '%').join(' · '));
}

function reply(id, st, file, ver) {
  if (!id || !ST.includes(st) || st === 'new' || !file) throw new Error('쓰는 법: reply <id> <ask|plan|done|hold|keep> <답글.txt> [버전]');
  const text = fs.readFileSync(file, 'utf8').trim().slice(0, 3000);
  if (!text) throw new Error('답글이 비었어요');
  const tok = login(), name = BASE.replace(/^https?:\/\/[^/]+\/v1\//, '') + '/asg_notes/' + id;
  curl('POST', BASE + ':commit', { writes: [{
    update: { name, fields: { st: { stringValue: st }, reply: { stringValue: text }, ver: { stringValue: String(ver || '').slice(0, 40) } } },
    updateMask: { fieldPaths: ['st', 'reply', 'ver'] }, currentDocument: { exists: true },
    updateTransforms: [{ fieldPath: 'rAt', setToServerValue: 'REQUEST_TIME' }] }] }, tok);
  console.log('✅ ' + id + ' → ' + st);
}

const [cmd, ...a] = process.argv.slice(2);
try {
  if (cmd === 'list') list(a[0]);
  else if (cmd === 'reply') reply(...a);
  else console.log('node tools/asg_check.mjs list [폴더] | reply <id> <st> <답글.txt> [버전]');
} catch (e) { console.error('❌ ' + (e && e.message || e)); process.exit(1); }
