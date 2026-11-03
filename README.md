# 먼지 – 이번 업데이트 & Vercel 배포 가이드

## 폴더 구조 (프로젝트 루트에 그대로 덮어쓰기)
```
index.html          ← 교체
manifest.json       ← 신규 (PWA)
sw.js               ← 신규 (서비스 워커 + 푸시 수신)
package.json        ← 신규 (이미 있으면 dependencies 두 줄만 합치기)
vercel.json         ← 신규 (이미 있으면 functions / crons 부분만 합치기)
lib/push.js         ← 신규
api/push-subscribe.js ← 신규
api/push-cron.js      ← 신규
api/get-data.js     ← 기존 파일 (아래 "확인 1" 참고)
app-icon.png        ← 기존 파일 (아래 "확인 2" 참고)
```

## Vercel에서 해야 할 일

### 1) 푸시 키 만들기 (내 컴퓨터에서 한 번)
```
npx web-push generate-vapid-keys
```
나오는 Public Key / Private Key를 복사해 둡니다.

### 2) 저장소(Redis) 연결
Vercel 프로젝트 → **Storage** → **Upstash Redis(Marketplace)** 생성 후 프로젝트에 Connect.
연결하면 `KV_REST_API_URL`, `KV_REST_API_TOKEN` 환경변수가 자동으로 추가됩니다. (무료 플랜으로 충분)

### 3) 환경변수 추가 (Settings → Environment Variables)
| 이름 | 값 |
|---|---|
| `VAPID_PUBLIC_KEY` | 1)의 Public Key |
| `VAPID_PRIVATE_KEY` | 1)의 Private Key |
| `VAPID_SUBJECT` | `mailto:내이메일` 또는 사이트 주소(https://...) |
| `CRON_SECRET` | 길고 아무도 모르는 임의 문자열 |
| `NEIS_API_KEY` | NEIS 인증키 (**확인 1** 참고) |

환경변수를 추가한 뒤 **반드시 Redeploy** 해야 적용됩니다.

### 4) 배포 후 테스트
1. 사이트를 열고 ≡ → **알림** 탭 → 아침 알림 켜기 → 권한 허용
2. **테스트 알림 보내기** 버튼 → 바로 알림이 와야 정상
3. 아이폰은 Safari에서 **공유 → 홈 화면에 추가**로 설치한 앱에서만 알림이 켜집니다 (iOS 16.4 이상).

## 꼭 확인할 것

**확인 1. `api/get-data.js`**
- 학사일정을 쓰려면 이 프록시가 `urlPath=SchoolSchedule` 도 NEIS로 전달해야 합니다.
  허용 목록(whitelist)이 있다면 `SchoolSchedule` 을 추가하세요. (없으면 학사일정만 표시되지 않고 앱은 정상 동작)
- 기존 NEIS 키 환경변수 이름이 `NEIS_API_KEY` 가 아니라면, 같은 값을 `NEIS_API_KEY` 이름으로도 하나 더 등록하거나
  `lib/push.js` 의 `process.env.NEIS_API_KEY || process.env.NEIS_KEY` 부분을 기존 이름으로 바꾸세요.

**확인 2. 아이콘**
- `manifest.json` 은 `app-icon.png` 를 192/512 아이콘으로 선언합니다. 설치 화면 품질을 위해 가능하면 512×512 PNG 로 두세요.

## 알림 시간에 대해 (중요)
Vercel **무료(Hobby) 플랜의 크론은 하루 1회, 정시가 아닌 "그 시간대 안 어딘가"** 에 실행됩니다.
- 기본 `vercel.json` : 매일 07:30(KST) 무렵 전체 발송 (`?all=1`). 이 경우 앱의 "알림 시간" 설정은 무시됩니다.
- **사용자별 시간 설정을 쓰려면** (둘 중 하나)
  - Pro 플랜: `vercel.json` 의 crons 를 `{ "path": "/api/push-cron?window=15", "schedule": "*/10 * * * *" }` 로 변경
  - 무료 유지: `vercel.json` 에서 `crons` 를 삭제하고 cron-job.org 같은 무료 외부 스케줄러가 10분마다
    `https://내도메인/api/push-cron?window=15&key=<CRON_SECRET>` 을 호출하도록 설정

## 이번 업데이트 내용
- 급식 카드 위쪽 여백 확대, 조식/중식/석식 **탭** (현재 시각에 맞춰 자동 선택)
- **교시 수 자동 대응**: 실제 시간표의 교시 수만큼 NOW 카드/시간표 편집 표가 구성되고, 점심시간 위치는 시간표 편집의 "점심시간 위치(○교시 뒤)"에서 설정 (기본 4교시 뒤, 0이면 점심 없음)
- **학사일정**: 휴업일·공휴일이면 NOW 카드가 "쉬는 날"로 바뀌고 다음 등교일을 안내, 날짜 아래에 행사 칩 표시, 달력에 행사 점/휴일 빨간 날짜/월간 목록
- **PWA**: 홈 화면 설치, 오프라인일 때 마지막으로 불러온 시간표·급식 표시
- **아침 푸시 알림**: 오늘 시간표(이동수업 반영) + 급식, 주말·휴업일 자동 제외
- 버그 수정: UTC 날짜 오류(오전 9시 전 하루 어긋남), 타이머 중복 등록, 중복 함수, 등교 전 시각 9시 고정, 선택 날짜를 바꾸면 NOW 카드가 같이 바뀌던 문제, 일부 HTML 이스케이프 누락, 매초 전체 다시 그리던 NOW 카드 최적화
