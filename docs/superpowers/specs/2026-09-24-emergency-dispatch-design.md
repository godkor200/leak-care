# 긴급 출동 요청 + Slack 사진 쓰레드 설계

날짜: 2026-09-24

## 배경

`docs/service-plan.md` 홈 화면의 "빠른 서비스"에는 "누수 접수"와 별도로 "긴급 출동 요청"이 있다. 물이 지금 새고 있는 고객은 긴 폼을 채울 여유가 없고, 담당자는 일반 접수보다 먼저 알아채고 바로 전화해야 한다. 1차 누수 접수(`2026-09-04-leak-report-intake-design.md`) 위에 긴급 출동 경로를 추가하고, 담당자가 Slack에서 현장 사진을 바로 볼 수 있도록 알림 방식을 Incoming Webhook에서 Slack 봇 토큰으로 바꾼다.

## 범위

**포함**
- 긴급 출동 전용 폼 `GET/POST /emergency`
- 일반 접수 폼 상단에 긴급 출동 링크 추가, 일반 폼의 긴급도 선택지를 낮음/보통으로 축소
- Slack 알림을 봇 토큰(Web API)으로 전환: 일반/긴급 채널 분리, 긴급은 `<!channel>` 멘션
- 요약 메시지의 쓰레드에 사진 업로드 (HEIC/HEIF는 Slack용으로만 JPEG 변환)
- Slack 전송을 백그라운드로 돌려 고객 응답을 막지 않음

**제외**
- 기사 배정, 고객/담당자 문자(SMS) 발송, 전화 자동 연결
- 동영상의 Slack 업로드 (메시지에 "동영상 1개 첨부됨"만 표시)
- 레이트 리밋/CAPTCHA, S3 직접 업로드 (별도 결정 사항)

## 긴급 출동 폼

`GET /emergency` — 모바일 우선의 짧은 폼.

| 항목 | 필수 | 비고 |
|---|---|---|
| 이름 | 필수 | 일반 폼과 같은 검증(trim, 최대 50자) |
| 연락처 | 필수 | 일반 폼과 같은 형식 검증 |
| 주소 | 필수 | 최대 200자 |
| 사진 | **필수, 1~20장** | 장난 접수 방지. 형식/용량 규칙은 일반 접수와 동일 |
| 동영상 | 선택 | 1개, 200MB |
| 발생 장소 | 선택 | 일반 폼과 같은 select + "선택 안 함" |
| 상황 설명 | 선택 | 한 줄 텍스트, 최대 200자 (예: "천장에서 물이 떨어지고 있어요") |

`POST /emergency`
1. 텍스트 필드 검증 (`CreateEmergencyReportDto`)
2. 사진이 0장이면 폼을 다시 렌더링: "현장 사진을 1장 이상 올려주세요." (400)
3. 파일 형식/용량 검증 → S3 업로드 → DB 저장 (일반 접수와 동일한 `ReportService` 흐름 재사용, `urgency = '긴급'` 고정)
4. `/report/:id/complete`로 리다이렉트
5. Slack 알림을 백그라운드로 시작

multer 설정(개수/용량 제한, fileFilter)과 업로드 에러 필터는 `POST /report`와 같은 것을 재사용한다. 에러 시 입력값 유지, 400 응답 등 일반 폼의 동작도 동일하다.

완료 페이지(`/report/:id/complete`)는 공용이다. `urgency === '긴급'`이면 제목을 "긴급 출동 요청이 접수되었습니다"로, 안내 문구를 "담당자가 곧 전화드립니다. 전화를 받을 수 있게 해주세요."로 바꾼다. 개인정보(이름·주소)는 지금처럼 표시하지 않는다.

## 일반 접수 폼 변경

- 폼 상단에 강조 링크: "지금 물이 새고 있나요? → 긴급 출동 요청" (`/emergency`)
- 긴급도 select는 `낮음`/`보통`만 제공한다. `CreateReportDto.urgency`도 이 두 값만 허용한다. `긴급`은 긴급 출동 경로에서만 저장된다.

## 데이터 모델 변경

```prisma
model LeakReport {
  // ...기존 필드
  location    String?  // 긴급 출동은 선택 입력
  occurredAt  String?  // 긴급 출동은 받지 않음
  damageScope String?  // 긴급 출동은 받지 않음
  description String?  // 긴급 출동 상황 설명 (신규)
  urgency     String   // 낮음 | 보통 | 긴급 (긴급 = 긴급 출동 경로)
}
```

- 마이그레이션 1개 추가 (`emergency_dispatch`). 기존 데이터는 값이 있으므로 영향 없음.
- 일반 접수는 지금처럼 location/occurredAt/damageScope를 필수로 검증한다 (DTO 레벨).

## Slack 알림 (봇 토큰)

### 설정

```
SLACK_BOT_TOKEN=xoxb-...
SLACK_REPORT_CHANNEL_ID=C...      # #누수접수
SLACK_EMERGENCY_CHANNEL_ID=C...   # #긴급출동
```

`SLACK_WEBHOOK_URL`은 제거한다. Slack 앱에 `chat:write`, `files:write` 권한을 주고 두 채널에 봇을 초대해야 한다. 토큰이나 채널 ID가 없으면 경고 로그만 남기고 건너뛴다(지금 동작과 동일).

### 전송 순서

1. `chat.postMessage`로 요약 메시지를 보내고 응답의 `ts`를 받는다.
   - 일반: `새 누수 접수 #12` / 긴급도 / 발생 장소 / 주소 / 이름 / 연락처
   - 긴급: `<!channel> 🚨 긴급 출동 #12` / 연락처 / 주소 / 이름 / 발생 장소 / 상황 설명
   - 사용자 입력은 기존 `escapeSlack`로 이스케이프한다 (`<!channel>`은 서버가 넣는 고정 문자열).
   - 동영상이 있으면 "동영상 1개 첨부됨" 줄을 추가한다.
2. 사진마다 Slack 외부 업로드 API로 쓰레드에 올린다.
   - `files.getUploadURLExternal`(filename, length) → 받은 `upload_url`로 파일 바이트 POST → `files.completeUploadExternal`(files, `channel_id`, `thread_ts`)
   - 사진은 한 번의 `completeUploadExternal` 호출로 묶어 올린다 (쓰레드에 한 덩어리로 표시).
   - 파일명은 `photo-1.jpg`, `photo-2.jpg` …로 서버가 정한다 (원본 파일명은 깨지므로 사용하지 않는다).
3. HEIC/HEIF 사진은 `heic-convert`로 JPEG 변환한 뒤 업로드한다. S3에는 원본이 저장된다. 변환에 실패한 사진은 원본 그대로 올린다.

### 백그라운드 실행과 실패 처리

- `ReportService`는 DB 저장 후 알림을 `await`하지 않고 시작만 한다 (`void this.notification.notify(...)`). 알림 서비스 내부에서 모든 에러를 잡으므로 unhandled rejection이 생기지 않는다.
- 사진 버퍼는 요청이 끝난 뒤에도 알림이 쓰므로, 알림 서비스에 버퍼를 직접 넘긴다.
- Slack API는 HTTP 200에 `ok: false`로 실패를 알린다. 각 호출에서 `ok`를 확인하고, 실패하면 로그를 남긴다.
- 요약 메시지 전송이 실패하면 사진 업로드는 건너뛴다. 사진 업로드가 실패해도 요약 메시지는 이미 전송된 상태로 둔다.
- 각 호출에 타임아웃을 건다: 메시지는 5초, 파일 업로드는 30초.

## 코드 구조 변경

```
src/
  report/
    emergency.controller.ts        # GET/POST /emergency (신규)
    dto/create-emergency-report.dto.ts  # (신규)
    report.service.ts              # create()가 긴급/일반 입력을 모두 받도록 일반화, 알림을 백그라운드로 시작
    report-form.view-model.ts      # 긴급 폼 뷰모델 추가
  notification/
    notification.service.ts        # 봇 토큰 기반으로 재작성: 요약 메시지 + 쓰레드 사진
    slack.client.ts                # chat.postMessage / 파일 외부 업로드 3단계 래퍼 (신규, fetch 기반)
    image-converter.ts             # HEIC/HEIF → JPEG (신규, heic-convert 래핑)
views/
  report/emergency.hbs             # (신규)
  report/form.hbs                  # 긴급 출동 링크, 긴급도 선택지 축소
  report/complete.hbs              # 긴급 문구 분기
```

multer 옵션(`limits`, `fileFilter`)과 업로드 에러 필터가 `POST /report`에만 묶여 있다면 두 컨트롤러가 함께 쓸 수 있게 공용 상수로 뽑는다.

## 테스트

- `emergency` e2e
  - 사진 없이 제출 → 400, "현장 사진을 1장 이상" 문구, DB 레코드 없음
  - 정상 제출 → 302로 완료 페이지, DB에 `urgency = '긴급'`, 알림 서비스가 긴급으로 호출됨
  - 완료 페이지에 긴급 문구가 보이고 이름/주소는 보이지 않음
- 일반 `report` e2e: 긴급도 `긴급` 제출 → 400
- `notification.service.spec` (`fetch` 모킹)
  - 일반: 일반 채널로 postMessage → 받은 `ts`로 사진 업로드 3단계 호출
  - 긴급: 긴급 채널, 메시지에 `<!channel>` 포함
  - HEIC 사진은 변환기를 거쳐 `image/jpeg`로 업로드
  - postMessage가 `ok: false` → 사진 업로드 안 함, 예외 없이 로그
  - 토큰 미설정 → 아무 호출 없음
- `report.service.spec`: 알림을 기다리지 않는다 (알림 promise가 끝나지 않아도 `create`가 resolve됨)

## 배포 시 준비물

- Slack 앱 생성, 봇 토큰 발급(`chat:write`, `files:write`), `#누수접수`·`#긴급출동` 채널에 봇 초대, 채널 ID 확인
- `.env`에 위 세 값 설정, `SLACK_WEBHOOK_URL` 삭제
- `npm run prisma:deploy`로 마이그레이션 적용
