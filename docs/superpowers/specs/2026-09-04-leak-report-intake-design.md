# 누수 접수(의뢰) 1차 구현 설계

날짜: 2026-09-04

## 배경

`docs/service-plan.md`의 서비스 기획 중 STEP 2 "누수 접수"에 해당하는 기능만 1차로 구현한다. 전체 기획서의 보험 진단/청구, 기사 배정, 관리자 시스템 등은 이번 범위에서 제외한다.

## 범위

**포함**
- 고객이 웹 폼으로 누수 접수 정보(기본정보 + 누수정보 + 사진/동영상)를 제출
- 제출 시 서버가 파일을 OCI Object Storage에 업로드하고, 접수 정보를 DB에 저장
- 저장 성공 시 Slack 채널에 웹훅으로 알림 전송
- 접수 완료 확인 페이지(접수번호 표시)

**제외 (다음 단계로 미룸)**
- 보험 정보 입력/진단/청구 관련 모든 기능
- 기사 배정, 현장 탐지, 진행현황 조회, 마이페이지, 관리자 시스템
- 회원가입/로그인 (접수는 비로그인으로 받는다)

## 기술 스택

- **Backend**: NestJS
- **View**: Handlebars(`hbs`) 서버사이드 렌더링 (별도 프론트엔드 프레임워크 없음)
- **ORM/DB**: Prisma + SQLite (`file:./dev.db`), 오라클 클라우드(OCI) VM에 배포되어 로컬 디스크가 영구 보존되므로 파일 기반 DB로 충분
- **파일 저장소**: OCI Object Storage (S3 호환 API) — `@aws-sdk/client-s3`로 연동, 버킷/자격증명은 이미 발급되어 있음
- **파일 업로드 처리**: `multer` (메모리 스토리지)
- **알림**: Slack Incoming Webhook — Node `fetch`로 POST

## 데이터 모델 (Prisma)

```prisma
model LeakReport {
  id          Int      @id @default(autoincrement())
  name        String   // 이름
  phone       String   // 연락처
  address     String   // 주소
  location    String   // 발생 장소 (천장/욕실/배관/외벽/결로의심/기타)
  occurredAt  String   // 발생 시점
  damageScope String   // 피해 범위
  urgency     String   // 긴급도 (낮음/보통/긴급)
  status      String   @default("접수완료")
  createdAt   DateTime @default(now())
  files       LeakReportFile[]
}

model LeakReportFile {
  id           Int        @id @default(autoincrement())
  leakReportId Int
  leakReport   LeakReport @relation(fields: [leakReportId], references: [id])
  url          String     // OCI Object Storage URL
  type         String     // "photo" | "video"
  createdAt    DateTime   @default(now())
}
```

보험 정보 필드(보험 가입 여부/보험사/증권번호)는 이번 범위에서 제외한다.

## 요청 흐름

1. `GET /report` — 접수 폼 페이지 렌더링
   - 발생 장소: select (천장 누수/욕실 누수/배관 누수/외벽 누수/결로 의심/기타)
   - 긴급도: select (낮음/보통/긴급)
   - 발생 시점: 자유 텍스트 입력 (예: "어제 밤부터", "오늘 아침")
2. `POST /report` — multipart form 제출
   1. 필수값 검증: 이름, 연락처, 주소, 발생 장소, 발생 시점, 피해 범위, 긴급도
   2. 첨부파일 검증: 사진 최대 20장(장당 10MB, jpg/png/heic), 동영상 1개(최대 200MB, mp4/mov)
   3. 첨부파일을 OCI Object Storage에 업로드
   4. `LeakReport` + `LeakReportFile` 레코드를 DB에 저장
   5. Slack Webhook으로 알림 전송 (접수번호, 이름, 주소, 긴급도 요약)
   6. `GET /report/:id/complete` 로 리다이렉트
3. `GET /report/:id/complete` — 접수번호와 요약 정보를 보여주는 완료 페이지

## 에러 처리

- 필수값 누락/형식 오류: 폼으로 되돌아가며 에러 메시지 표시, DB 저장 안 함
- 파일 업로드 중 하나라도 실패: 전체 제출 실패 처리, DB에 레코드를 남기지 않고 사용자에게 재시도 안내
- Slack 알림 전송 실패: 접수 자체는 이미 성공했으므로 사용자에게는 정상적으로 접수완료를 보여주고, 서버 로그에만 에러 기록 (알림은 부가 기능이므로 접수 흐름을 막지 않음)

## 프로젝트 구조

```
src/
  app.module.ts
  main.ts                      # hbs 뷰 엔진 설정
  report/
    report.module.ts
    report.controller.ts       # GET/POST /report, GET /report/:id/complete
    report.service.ts          # 검증 + 저장 오케스트레이션
    dto/create-report.dto.ts
  storage/
    storage.module.ts
    storage.service.ts         # OCI Object Storage(S3 호환) 업로드
  notification/
    notification.module.ts
    notification.service.ts    # Slack Webhook 전송
  prisma/
    prisma.module.ts
    prisma.service.ts

prisma/
  schema.prisma

views/
  layouts/main.hbs
  report/form.hbs
  report/complete.hbs

public/                        # 정적 CSS
```

## 환경 변수 (.env)

```
DATABASE_URL="file:./dev.db"
OCI_S3_ENDPOINT=
OCI_S3_REGION=
OCI_S3_BUCKET=
OCI_S3_ACCESS_KEY=
OCI_S3_SECRET_KEY=
SLACK_WEBHOOK_URL=
```

## 테스트 계획

- `report.service.spec.ts`: 단위 테스트 — Prisma/Storage/Slack 모킹, 검증 로직 및 성공/실패(업로드 실패, Slack 실패) 시나리오
- `report.e2e-spec.ts`: `POST /report` 해피패스 — Storage/Slack 모킹, DB에 레코드가 정상 생성되는지 확인
