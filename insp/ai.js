// 🔍 인스펙션 ② 사진 판독 (2026-11-15) — Firebase AI Logic 을 앱에서 바로 부름 (서버 없음)
// 11/15 15:1x: Gemini Developer API 는 선불 크레딧 방식이라 → Vertex AI(Agent Platform) 'global' 로 바꿈 = Firestore 와 같은 후불 청구 (사용자 결정)
// 사진 한 장 → { kind: 'room'|'fault'|'ok'|'blur', room, text(카톡 문구), zone, part, type, conf }
// · 공유용 사진은 그대로 두고, AI 에는 긴 쪽 1536px 사본만 보냄
// · App Check(reCAPTCHA) 필수 (2026-07 부터 AI Logic 설정 때 자동 강제) → 사이트 키는 meta/insp_ai.siteKey (관리자 설정 화면)
// · 모델 이름도 meta/insp_ai.model 로 바꿀 수 있음 (없으면 MODELS 차례로 시도)
// 시험: window.__fakeAI = async (base64) => ({...})
import { ZONES, TYPE_KEY } from '../insp_items.js?v=2026.11.18-1';

const FB = 'https://www.gstatic.com/firebasejs/12.19.0/';
const MODELS = ['gemini-3.5-flash', 'gemini-2.5-flash'];
// App Check 사이트 키 (11/15 생성: reCAPTCHA Enterprise 'haeundae-rm 웹앱 App Check (인스펙션 AI)', 도메인 haeundae-rm.github.io). 공개돼도 되는 키. meta/insp_ai.siteKey 가 있으면 그걸 씀
const SITE_KEY = '6LfI2yAuAAAAAEj0vYWJZS1XP7bhatqp7XudI08E';
const PARTS = ZONES.map(z => z.z + ': ' + z.parts.map(p => p[0]).join(', ')).join('\n');
const TYPES = Array.from(new Set(Object.values(TYPE_KEY)));

const PROMPT = `당신은 리조트 객실 하우스키핑 인스펙션(청결 점검) 보조입니다. 점검자가 객실에서 찍은 사진 한 장을 봅니다.
점검자는 정비가 덜 된 곳만 찍습니다. 사진에서 룸메이드가 보완해야 할 점을 찾아 카톡 공유용 짧은 지적 문구를 씁니다.

문구 규칙:
- 한국어 명사구 2~6단어, 끝은 '미흡' '미비' '필요' '있음' '불량' 같은 말 (마침표·존댓말 없음)
- 실제 점검자 문구 예: "각티슈 세팅 미흡", "드라이기 세팅 미흡", "휴지 세팅 미비", "베딩 미비", "생수 하나 세팅", "세면대 머리카락 있음", "커피포트 물때", "침대 밑 먼지"
- 물건 이름을 꼭 넣기 (각티슈·드라이기·휴지·베딩·베개·이불·수건·컵·커피포트·냉장고·생수·세면대·샤워부스·변기·거울·바닥·쓰레기통 등)
- 사진에서 보이는 것만. 모르면 conf 를 낮게

분류 (zone·part 는 아래 목록 글자 그대로, 맞는 게 없으면 part 는 '기타'):
${PARTS}
type 은 다음 중 하나: ${TYPES.join(', ')}

kind:
- "room": 문 옆 객실 번호판 사진 → room 에 숫자 4자리, text 는 ""
- "fault": 지적할 점이 보임
- "ok": 문제가 안 보임 → text ""
- "blur": 흔들려 알아볼 수 없음 → text ""

JSON 하나만 답하세요: {"kind":"fault","room":"","text":"각티슈 세팅 미흡","zone":"안방","part":"가구","type":"세팅 불량","conf":0.8}`;

let modelP = null, cfg = null, lastErr = '', learn = [];
export const aiErr = () => lastErr;
export function setCfg(c) { cfg = c || {}; modelP = null; }
// 매주 배운 것 (11/20): 점검자가 AI 문구를 같은 식으로 2번 이상 고친 것 → 판독 지시문 끝에 붙임 (meta/insp_learn, insp.js 가 모음)
export function setLearn(list) { learn = Array.isArray(list) ? list.slice(0, 40) : []; }
export function promptText() {
  if (!learn.length) return PROMPT;
  return PROMPT + '\n\n이 리조트 점검자들이 AI 문구를 자주 고친 예 (왼쪽 = AI가 처음 쓴 문구, 오른쪽 = 점검자가 고친 맞는 문구). ' +
    '왼쪽처럼 보이는 사진이면 오른쪽 뜻이 아닌지 먼저 살피세요. 특히 물건이 없거나 모자라 보이면 얼룩보다 세팅·보충 쪽입니다:\n' +
    learn.map(x => '- "' + x.a + '" → "' + x.t + '"').join('\n');
}

async function getModel(name) {
  const [A, AI, AC] = await Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-ai.js'), import(FB + 'firebase-app-check.js')]);
  const app = A.getApp();
  const key = (cfg && cfg.siteKey) || SITE_KEY;
  if (key && !window.__inspAppCheck) {
    const P = cfg && cfg.acType === 'v3' ? AC.ReCaptchaV3Provider : AC.ReCaptchaEnterpriseProvider;
    try { AC.initializeAppCheck(app, { provider: new P(key), isTokenAutoRefreshEnabled: true }); } catch (e) { console.warn('App Check', e); }
    window.__inspAppCheck = 1;
  }
  const ai = AI.getAI(app, { backend: cfg && cfg.backend === 'dev' ? new AI.GoogleAIBackend() : new AI.VertexAIBackend((cfg && cfg.location) || 'global') });
  return AI.getGenerativeModel(ai, { model: name, generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } });
}
async function call(b64) {
  const names = cfg && cfg.model ? [cfg.model] : MODELS;
  let err = null;
  for (const n of names) {
    try {
      if (!modelP || modelP.name !== n) modelP = { name: n, m: getModel(n) };
      const m = await modelP.m;
      const r = await m.generateContent([promptText(), { inlineData: { data: b64, mimeType: 'image/jpeg' } }]);
      return r.response.text();
    } catch (e) { err = e; modelP = null; if (!/not found|404|unsupported|is not supported|requires the Firebase AI API/i.test(String(e && e.message))) break; }
  }
  throw err;
}
// 긴 쪽 1280 사본 → base64 (11/15 속도: 1536 → 1280)
async function small(blob) {
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, 1280 / Math.max(bmp.width, bmp.height)), cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  const u = cv.toDataURL('image/jpeg', 0.8);
  return u.slice(u.indexOf(',') + 1);
}
function clean(o) {
  o = o && typeof o === 'object' ? o : {};
  const kind = ['room', 'fault', 'ok', 'blur'].includes(o.kind) ? o.kind : 'fault';
  const Z = ZONES.filter(z => z.z === o.zone)[0];
  const part = Z && (Z.parts.some(p => p[0] === o.part) || o.part === '기타') ? o.part : '';
  return { kind, room: String(o.room || '').replace(/\D/g, '').slice(0, 4), text: String(o.text || '').replace(/[.。]$/, '').trim().slice(0, 60),
    zone: Z ? Z.z : '', part, type: TYPES.includes(o.type) ? o.type : '', conf: Math.max(0, Math.min(1, Number(o.conf) || 0)) };
}
// 사진 판독 — 실패하면 null (화면은 그대로 손으로 적기)
export async function readPhoto(blob) {
  try {
    const b64 = await small(blob);
    const txt = window.__fakeAI ? JSON.stringify(await window.__fakeAI(b64, promptText())) : await call(b64);
    const j = JSON.parse(String(txt).replace(/^```(json)?|```$/g, '').trim());
    lastErr = '';
    return clean(Array.isArray(j) ? j[0] : j);
  } catch (e) {
    lastErr = String(e && (e.message || e.code) || e).slice(0, 300);
    console.warn('AI 판독', e);
    return null;
  }
}

// 중복 사진: 8×8 평균 해시 (휴대폰 안에서, AI 안 씀)
export async function hashOf(blob) {
  const bmp = await createImageBitmap(blob), cv = document.createElement('canvas'); cv.width = 8; cv.height = 8;
  const c = cv.getContext('2d'); c.drawImage(bmp, 0, 0, 8, 8);
  const d = c.getImageData(0, 0, 8, 8).data, g = [];
  for (let i = 0; i < 64; i++) g.push(d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11);
  const avg = g.reduce((s, v) => s + v, 0) / 64;
  return g.map(v => (v > avg ? '1' : '0')).join('');
}
export const hamming = (a, b) => { if (!a || !b) return 64; let n = 0; for (let i = 0; i < 64; i++) if (a[i] !== b[i]) n++; return n; };
