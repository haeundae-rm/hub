# 서버 함수 (Cloud Functions) — 해운대 객실 앱

처음 만든 날: 2026-11-22. GitHub Pages 로 공개되는 폴더지만 비밀 값은 없음 (키 파일·비밀번호 없음).

## 들어 있는 함수
| 이름 | 언제 | 하는 일 |
|---|---|---|
| `jbrSync` | 1분마다 (2026-11-28) | 📋 정비보고서(앱) → 메이드 휴대폰 반영 계산. `meta/rsync_srv.mode`: 없음·`shadow` = 계산만 하고 `meta/rsync_cmp` 에 남김 (PC 「정비보고서 연결」이 실제 반영한 것과 비교) / `live` = 서버가 반영 · PC 연결 창은 쉼 (서버가 5분 넘게 멈추면 PC 가 다시 맡음) / `off`. 20건 넘으면 보류(`hold`) → 허브에서 `go`. 계산 부품은 `functions/rm/*.mjs` = rm/app/engine.js · rsync.js 사본 (rm 을 고치면 같이 복사, 시험이 확인) |
| `dreqPush` | 메이드가 🔔 더티 요청(`sup/{날짜}/req/{메이드}`)을 새로 보낼 때 | 담당 정비보조(ws) 이름으로 등록된 휴대폰(`push/{uid}`, 정비 지원 앱 '알림 받기')에 푸시. 결과는 `meta/push_fn` |

- 지역 서울(asia-northeast3, Firestore 와 같음), 동시 최대 2개, 메모리 256MiB, 30초.
- 휴대폰 목록은 `push` 에서 `app == 'dirty'` 한 조건으로만 읽음 (복합 색인 금지 규칙).
- 못 받는 토큰(앱 삭제 등)은 함수가 지움. 3주 넘게 앱을 안 연 휴대폰은 보내지 않음.

## 배포 (소장님이 Cloud Shell 에서 — GitHub 에 키를 두지 않기 위해)
1. 크롬에서 업무용 구글 계정으로 https://console.cloud.google.com/?project=haeundae-rm&cloudshell=true 열기 → 아래쪽 검은 창(Cloud Shell)이 뜰 때까지 기다림 (처음엔 '승인' 창이 뜨면 승인)
2. 아래 한 줄을 통째로 붙여 넣고 Enter (2~5분):
   ```
   rm -rf hub && git clone --depth 1 https://github.com/haeundae-rm/hub && cd hub/cloud/functions && npm install --no-audit --no-fund && cd .. && npx -y firebase-tools@latest deploy --only functions --project haeundae-rm
   ```
3. 물어보는 것
   - "API 를 켤까요?" 류 → `Y`
   - "How many days do you want to keep container images…" → `1` Enter (지난 판 이미지 보관료 아낌)
   - 로그인하라고 나오면: `npx -y firebase-tools@latest login --no-localhost` → 나오는 주소를 열어 업무용 계정으로 허용 → 받은 코드 붙여 넣기 → 2번 다시
4. 끝에 `✔ Deploy complete!` 가 나오면 성공. 처음 배포에서 "권한 전파 중, 몇 분 뒤 다시" 오류가 나면 3~5분 뒤 2번을 그대로 다시.

## 고친 뒤 다시 배포
위 2번 한 줄을 그대로 (항상 GitHub main 의 최신 판을 받아 배포).

## 시험
`cd cloud/functions && npm install && node test/dreq_test.js` — 보낼지·누구에게·문구 판단 (Firebase 없이)
