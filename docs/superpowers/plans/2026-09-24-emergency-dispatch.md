# 긴급 출동 요청 + Slack 사진 쓰레드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 긴급 출동 전용 폼(`/emergency`, 사진 필수)을 추가하고, Slack 알림을 봇 토큰 기반으로 바꿔 일반/긴급 채널에 요약 메시지를 보내고 그 쓰레드에 사진(HEIC는 JPEG로 변환)을 올린다.

**Architecture:** 기존 `ReportService` 흐름(검증 → S3 업로드 → DB 저장)을 긴급/일반이 함께 쓰도록 입력 타입(`NewLeakReport`)을 일반화한다. `ReportController`는 `ReportForm` 설정(뷰, 뷰모델, DTO, 변환 함수)만 다른 두 폼을 하나의 `submitForm`으로 처리한다. 알림은 `SlackClient`(Web API 래퍼)와 `ImageConverter`(HEIC→JPEG)를 쓰는 `NotificationService.notifyReportCreated`가 담당하며, `ReportService`는 이를 `await`하지 않고 백그라운드로 시작한다.

**Tech Stack:** NestJS 10, Handlebars(`hbs`), Prisma 5 + SQLite, `@aws-sdk/client-s3`, multer 2.x(Nest 내장), Node 18+ 전역 `fetch`, Slack Web API(`chat.postMessage`, `files.getUploadURLExternal`, `files.completeUploadExternal`), `heic-convert` 2.x, Jest + Supertest.

참조 스펙: `docs/superpowers/specs/2026-09-24-emergency-dispatch-design.md`

## Global Constraints

- 긴급 출동 폼 필수 항목: 이름, 연락처, 주소, 사진 1~20장. 선택 항목: 동영상 1개, 발생 장소, 상황 설명(최대 200자).
- 사진이 0장이면 긴급 폼을 다시 렌더링하며 `현장 사진을 1장 이상 올려주세요.` 메시지와 400 응답. DB 저장 안 함.
- 긴급 출동으로 저장되는 건은 `urgency = '긴급'`. 일반 접수 폼의 긴급도는 `낮음`/`보통`만 허용한다.
- 파일 형식/용량/개수 규칙, 업로드 실패 시 DB 미저장, 에러 시 입력값 유지, 개인정보 미노출 완료 페이지 등 기존 일반 접수 규칙은 긴급 출동에도 그대로 적용한다.
- Slack 설정: `SLACK_BOT_TOKEN`, `SLACK_REPORT_CHANNEL_ID`, `SLACK_EMERGENCY_CHANNEL_ID`. `SLACK_WEBHOOK_URL`은 제거한다. 토큰/채널이 없으면 경고 로그만 남기고 건너뛴다.
- 긴급 메시지는 `<!channel> 🚨 긴급 출동 #<id>`로 시작하고 바로 다음 줄이 연락처다. 사용자 입력은 `escapeSlack`로 이스케이프한다.
- 사진은 요약 메시지의 쓰레드에 한 번의 `files.completeUploadExternal`로 묶어 올린다. 파일명은 `photo-1.jpg`처럼 서버가 정한다(원본 파일명 사용 금지).
- HEIC/HEIF는 Slack용으로만 JPEG로 변환한다(S3에는 원본). 변환 실패 시 원본을 올린다. 동영상은 Slack에 올리지 않고 메시지에 `동영상 1개 첨부됨`만 표시한다.
- Slack 전송은 고객 응답을 막지 않는다: `ReportService`는 알림을 `await`하지 않는다. `notifyReportCreated`는 절대 reject하지 않는다. 요약 메시지 실패 시 사진 업로드를 건너뛴다.
- Slack 타임아웃: 메시지/API 호출 5초, 파일 바이트 업로드 30초. Slack API는 HTTP 200 + `ok: false`로 실패를 알리므로 `ok`를 확인한다.

---

### Task 1: 스키마 + DTO (긴급 출동 입력, 일반 긴급도 제한)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_emergency_dispatch/migration.sql` (Prisma가 생성)
- Modify: `src/report/dto/leak-report.enums.ts`
- Create: `src/report/dto/contact-fields.dto.ts`
- Modify: `src/report/dto/create-report.dto.ts`
- Create: `src/report/dto/create-emergency-report.dto.ts`
- Modify: `src/report/dto/create-report.dto.spec.ts`
- Test: `src/report/dto/create-emergency-report.dto.spec.ts`

**Interfaces:**
- Produces: `GENERAL_URGENCY_LEVELS: UrgencyLevel[]` (`[LOW, MEDIUM]`), `class ContactFieldsDto { name; phone; address }`, `Trim()` 데코레이터, `class CreateReportDto extends ContactFieldsDto { location: LeakLocation; occurredAt: string; damageScope: string; urgency: UrgencyLevel }` (urgency는 낮음/보통만), `class CreateEmergencyReportDto extends ContactFieldsDto { location?: LeakLocation; description?: string }`. Prisma `LeakReport`의 `location`/`occurredAt`/`damageScope`가 `string | null`이 되고 `description: string | null`이 추가된다.

- [ ] **Step 1: 스키마 수정**

`prisma/schema.prisma`의 `LeakReport` 모델을 다음으로 바꾼다 (`LeakReportFile`은 그대로):

```prisma
model LeakReport {
  id          Int      @id @default(autoincrement())
  name        String
  phone       String
  address     String
  location    String?
  occurredAt  String?
  damageScope String?
  description String?
  urgency     String
  status      String   @default("접수완료")
  createdAt   DateTime @default(now())
  files       LeakReportFile[]
}
```

- [ ] **Step 2: 마이그레이션 생성**

Run: `npx prisma migrate dev --name emergency_dispatch`
Expected: `prisma/migrations/<timestamp>_emergency_dispatch/migration.sql` 생성, `Your database is now in sync with your schema.` 출력, Prisma Client 재생성

- [ ] **Step 3: 실패하는 테스트 작성 — 일반 DTO가 '긴급'을 거부**

`src/report/dto/create-report.dto.spec.ts`의 마지막 `it(...)` 뒤(최상위 `describe` 안)에 추가:

```ts
  it('rejects the 긴급 urgency, which is only allowed through the emergency form', async () => {
    const dto = plainToInstance(CreateReportDto, {
      ...validPayload,
      urgency: '긴급',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'urgency')).toBe(true);
  });
```

- [ ] **Step 4: 실패하는 테스트 작성 — 긴급 DTO**

`src/report/dto/create-emergency-report.dto.spec.ts`:

```ts
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateEmergencyReportDto } from './create-emergency-report.dto';

describe('CreateEmergencyReportDto', () => {
  const minimalPayload = {
    name: '홍길동',
    phone: '010-1234-5678',
    address: '서울시 강남구 테스트로 1',
  };

  it('passes with only name, phone and address', async () => {
    const dto = plainToInstance(CreateEmergencyReportDto, minimalPayload);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('treats an empty location ("선택 안 함") as not provided', async () => {
    const dto = plainToInstance(CreateEmergencyReportDto, {
      ...minimalPayload,
      location: '',
      description: '   ',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.location).toBeUndefined();
    expect(dto.description).toBeUndefined();
  });

  it('accepts a valid location and trims the description', async () => {
    const dto = plainToInstance(CreateEmergencyReportDto, {
      ...minimalPayload,
      location: '천장 누수',
      description: '  천장에서 물이 떨어지고 있어요  ',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.description).toBe('천장에서 물이 떨어지고 있어요');
  });

  it('rejects an unknown location', async () => {
    const dto = plainToInstance(CreateEmergencyReportDto, {
      ...minimalPayload,
      location: '알 수 없음',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'location')).toBe(true);
  });

  it('rejects a description longer than 200 characters', async () => {
    const dto = plainToInstance(CreateEmergencyReportDto, {
      ...minimalPayload,
      description: '가'.repeat(201),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'description')).toBe(true);
  });

  it('applies the same contact validation as the general form', async () => {
    const dto = plainToInstance(CreateEmergencyReportDto, {
      ...minimalPayload,
      name: '   ',
      phone: 'abc',
    });
    const errors = await validate(dto);
    const properties = errors.map((e) => e.property);
    expect(properties).toEqual(expect.arrayContaining(['name', 'phone']));
  });
});
```

- [ ] **Step 5: 테스트 실패 확인**

Run: `npx jest src/report/dto`
Expected: FAIL — `Cannot find module './create-emergency-report.dto'`, 그리고 `rejects the 긴급 urgency` 실패

- [ ] **Step 6: enums에 일반 긴급도 목록 추가**

`src/report/dto/leak-report.enums.ts` 끝에 추가:

```ts

// 일반 접수 폼에서 고를 수 있는 긴급도. '긴급'은 긴급 출동 경로(/emergency)에서만 저장한다.
export const GENERAL_URGENCY_LEVELS: UrgencyLevel[] = [
  UrgencyLevel.LOW,
  UrgencyLevel.MEDIUM,
];
```

- [ ] **Step 7: 공통 연락처 DTO 작성**

`src/report/dto/contact-fields.dto.ts`:

```ts
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export const Trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

// 일반 접수와 긴급 출동이 공통으로 받는 연락처 필드
export class ContactFieldsDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(/^[0-9+\-\s()]{8,20}$/)
  phone: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  address: string;
}
```

- [ ] **Step 8: 일반 DTO를 공통 DTO 기반으로 변경**

`src/report/dto/create-report.dto.ts` 전체를 다음으로 바꾼다:

```ts
import { IsEnum, IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ContactFieldsDto, Trim } from './contact-fields.dto';
import {
  GENERAL_URGENCY_LEVELS,
  LeakLocation,
  UrgencyLevel,
} from './leak-report.enums';

export class CreateReportDto extends ContactFieldsDto {
  @IsEnum(LeakLocation)
  location: LeakLocation;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  occurredAt: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  damageScope: string;

  @IsIn(GENERAL_URGENCY_LEVELS)
  urgency: UrgencyLevel;
}
```

- [ ] **Step 9: 긴급 DTO 작성**

`src/report/dto/create-emergency-report.dto.ts`:

```ts
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ContactFieldsDto } from './contact-fields.dto';
import { LeakLocation } from './leak-report.enums';

// 선택 입력: 앞뒤 공백을 지우고, 비어 있으면(select의 "선택 안 함" 포함) 입력하지 않은 것으로 본다
const OptionalText = () =>
  Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  });

export class CreateEmergencyReportDto extends ContactFieldsDto {
  @OptionalText()
  @IsOptional()
  @IsEnum(LeakLocation)
  location?: LeakLocation;

  @OptionalText()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}
```

- [ ] **Step 10: 테스트 통과 확인**

Run: `npx jest src/report/dto`
Expected: PASS — `CreateReportDto` 9개, `CreateEmergencyReportDto` 6개 모두 통과

- [ ] **Step 11: 전체 테스트 확인**

Run: `npm test && npm run test:e2e && npx tsc --noEmit -p tsconfig.json`
Expected: 모두 PASS, 타입 에러 없음 (기존 e2e는 아직 영향 없음 — 형식 거부 테스트의 `긴급` 선택은 multer 단계에서 거부되므로 DTO를 거치지 않는다)

- [ ] **Step 12: 커밋**

```bash
git add prisma/ src/report/dto/
git commit -m "feat: add emergency report DTO and restrict general urgency levels"
```

---

### Task 2: SlackClient + ImageConverter

**Files:**
- Modify: `package.json`, `package-lock.json` (`heic-convert` 추가)
- Create: `src/types/heic-convert.d.ts`
- Create: `src/notification/notification.types.ts`
- Create: `src/notification/slack.client.ts`
- Create: `src/notification/image-converter.ts`
- Test: `src/notification/slack.client.spec.ts`
- Test: `src/notification/image-converter.spec.ts`

**Interfaces:**
- Produces:
  - `interface NotificationPhoto { buffer: Buffer; extension: string; contentType: string }`
  - `interface ReportNotification { id: number; name: string; phone: string; address: string; urgency: string; isEmergency: boolean; location?: string | null; description?: string | null; photos: NotificationPhoto[]; hasVideo: boolean }`
  - `class SlackApiError extends Error`
  - `interface SlackFile { filename: string; buffer: Buffer }`
  - `SlackClient.postMessage(token: string, channel: string, text: string): Promise<string>` — 메시지 `ts` 반환, 실패 시 `SlackApiError` throw
  - `SlackClient.uploadToThread(token: string, channel: string, threadTs: string, files: SlackFile[]): Promise<void>` — 실패 시 throw
  - `ImageConverter.toSlackImage(photo: NotificationPhoto): Promise<NotificationPhoto>` — HEIC/HEIF면 JPEG로, 아니면 그대로, 변환 실패 시 원본(throw 안 함)
  - 두 클래스 모두 `@Injectable()`. 모듈 등록은 Task 3에서 한다.

- [ ] **Step 1: heic-convert 설치**

Run: `npm install heic-convert@^2.1.0`
Expected: 종료 코드 0, `package.json` dependencies에 `heic-convert` 추가

- [ ] **Step 2: heic-convert 타입 선언**

`src/types/heic-convert.d.ts`:

```ts
declare module 'heic-convert' {
  interface ConvertOptions {
    buffer: Buffer | ArrayBuffer | Uint8Array;
    format: 'JPEG' | 'PNG';
    quality?: number;
  }

  function convert(options: ConvertOptions): Promise<ArrayBuffer>;

  export = convert;
}
```

- [ ] **Step 3: 알림 타입 작성**

`src/notification/notification.types.ts`:

```ts
export interface NotificationPhoto {
  buffer: Buffer;
  extension: string;
  contentType: string;
}

export interface ReportNotification {
  id: number;
  name: string;
  phone: string;
  address: string;
  urgency: string;
  isEmergency: boolean;
  location?: string | null;
  description?: string | null;
  photos: NotificationPhoto[];
  hasVideo: boolean;
}
```

- [ ] **Step 4: 실패하는 테스트 작성 — SlackClient**

`src/notification/slack.client.spec.ts`:

```ts
import { SlackApiError, SlackClient } from './slack.client';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

describe('SlackClient', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });

  it('posts a message as JSON with the bot token and returns its ts', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, ts: '111.222' }));

    const ts = await new SlackClient().postMessage('xoxb-test', 'C_REPORT', '안녕');

    expect(ts).toBe('111.222');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    expect(init.headers.Authorization).toBe('Bearer xoxb-test');
    expect(JSON.parse(init.body)).toEqual({ channel: 'C_REPORT', text: '안녕' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('throws SlackApiError when Slack answers ok: false', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: false, error: 'channel_not_found' }),
    );

    await expect(
      new SlackClient().postMessage('xoxb-test', 'C_X', 'hi'),
    ).rejects.toThrow(new SlackApiError('chat.postMessage failed: channel_not_found'));
  });

  it('throws SlackApiError on a non-2xx HTTP status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    await expect(
      new SlackClient().postMessage('xoxb-test', 'C_X', 'hi'),
    ).rejects.toThrow('chat.postMessage failed: HTTP 500');
  });

  it('uploads each file and completes them together in the thread', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, upload_url: 'https://files.slack.com/u1', file_id: 'F1' }),
      )
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, upload_url: 'https://files.slack.com/u2', file_id: 'F2' }),
      )
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await new SlackClient().uploadToThread('xoxb-test', 'C_REPORT', '111.222', [
      { filename: 'photo-1.jpg', buffer: Buffer.from('a') },
      { filename: 'photo-2.jpg', buffer: Buffer.from('bb') },
    ]);

    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).toEqual([
      'https://slack.com/api/files.getUploadURLExternal',
      'https://files.slack.com/u1',
      'https://slack.com/api/files.getUploadURLExternal',
      'https://files.slack.com/u2',
      'https://slack.com/api/files.completeUploadExternal',
    ]);

    const firstParams = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(firstParams.get('filename')).toBe('photo-1.jpg');
    expect(firstParams.get('length')).toBe('1');

    const completeParams = new URLSearchParams(fetchMock.mock.calls[4][1].body);
    expect(completeParams.get('channel_id')).toBe('C_REPORT');
    expect(completeParams.get('thread_ts')).toBe('111.222');
    expect(JSON.parse(completeParams.get('files') ?? '[]')).toEqual([
      { id: 'F1', title: 'photo-1.jpg' },
      { id: 'F2', title: 'photo-2.jpg' },
    ]);
  });

  it('stops without completing when a file upload fails', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, upload_url: 'https://files.slack.com/u1', file_id: 'F1' }),
      )
      .mockResolvedValueOnce({ ok: false, status: 413 });

    await expect(
      new SlackClient().uploadToThread('xoxb-test', 'C_REPORT', '111.222', [
        { filename: 'photo-1.jpg', buffer: Buffer.from('a') },
      ]),
    ).rejects.toThrow('file upload failed: HTTP 413');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 5: 실패하는 테스트 작성 — ImageConverter**

`src/notification/image-converter.spec.ts`:

```ts
import { Logger } from '@nestjs/common';
import convert = require('heic-convert');
import { ImageConverter } from './image-converter';

jest.mock('heic-convert', () => jest.fn());

const convertMock = convert as unknown as jest.Mock;

describe('ImageConverter', () => {
  beforeEach(() => {
    convertMock.mockReset();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns JPEG and other non-HEIC photos unchanged', async () => {
    const photo = {
      buffer: Buffer.from('jpeg'),
      extension: '.jpg',
      contentType: 'image/jpeg',
    };

    const result = await new ImageConverter().toSlackImage(photo);

    expect(result).toBe(photo);
    expect(convertMock).not.toHaveBeenCalled();
  });

  it.each([
    ['.heic', 'image/heic'],
    ['.heif', 'image/heif'],
  ])('converts %s photos to JPEG', async (extension, contentType) => {
    convertMock.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    const photo = { buffer: Buffer.from('heic'), extension, contentType };

    const result = await new ImageConverter().toSlackImage(photo);

    expect(convertMock).toHaveBeenCalledWith({
      buffer: photo.buffer,
      format: 'JPEG',
      quality: 0.8,
    });
    expect(result).toEqual({
      buffer: Buffer.from([1, 2, 3]),
      extension: '.jpg',
      contentType: 'image/jpeg',
    });
  });

  it('falls back to the original photo when conversion fails', async () => {
    convertMock.mockRejectedValue(new Error('bad heic'));
    const photo = {
      buffer: Buffer.from('heic'),
      extension: '.heic',
      contentType: 'image/heic',
    };

    const result = await new ImageConverter().toSlackImage(photo);

    expect(result).toBe(photo);
    expect(Logger.prototype.warn).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6: 테스트 실패 확인**

Run: `npx jest src/notification/slack.client.spec.ts src/notification/image-converter.spec.ts`
Expected: FAIL — `Cannot find module './slack.client'`, `Cannot find module './image-converter'`

- [ ] **Step 7: SlackClient 작성**

`src/notification/slack.client.ts`:

```ts
import { Injectable } from '@nestjs/common';

const SLACK_API = 'https://slack.com/api';
const API_TIMEOUT_MS = 5000;
const UPLOAD_TIMEOUT_MS = 30000;

export class SlackApiError extends Error {}

export interface SlackFile {
  filename: string;
  buffer: Buffer;
}

interface SlackApiResponse {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

// Slack Web API는 실패해도 HTTP 200에 { ok: false, error }로 응답하므로 ok를 직접 확인한다
@Injectable()
export class SlackClient {
  async postMessage(token: string, channel: string, text: string): Promise<string> {
    const response = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel, text }),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    const body = await this.parse('chat.postMessage', response);
    return body.ts as string;
  }

  // 파일마다 업로드 URL을 받아 바이트를 올린 뒤, 한 번의 complete 호출로 쓰레드에 묶어서 공유한다
  async uploadToThread(
    token: string,
    channel: string,
    threadTs: string,
    files: SlackFile[],
  ): Promise<void> {
    const uploaded: { id: string; title: string }[] = [];
    for (const file of files) {
      const target = await this.callForm(token, 'files.getUploadURLExternal', {
        filename: file.filename,
        length: String(file.buffer.length),
      });
      const response = await fetch(target.upload_url as string, {
        method: 'POST',
        body: new Uint8Array(file.buffer),
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new SlackApiError(`file upload failed: HTTP ${response.status}`);
      }
      uploaded.push({ id: target.file_id as string, title: file.filename });
    }
    await this.callForm(token, 'files.completeUploadExternal', {
      files: JSON.stringify(uploaded),
      channel_id: channel,
      thread_ts: threadTs,
    });
  }

  private async callForm(
    token: string,
    method: string,
    params: Record<string, string>,
  ): Promise<SlackApiResponse> {
    const response = await fetch(`${SLACK_API}/${method}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    return this.parse(method, response);
  }

  private async parse(method: string, response: Response): Promise<SlackApiResponse> {
    if (!response.ok) {
      throw new SlackApiError(`${method} failed: HTTP ${response.status}`);
    }
    const body = (await response.json()) as SlackApiResponse;
    if (!body.ok) {
      throw new SlackApiError(`${method} failed: ${body.error ?? 'unknown_error'}`);
    }
    return body;
  }
}
```

- [ ] **Step 8: ImageConverter 작성**

`src/notification/image-converter.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import convert = require('heic-convert');
import { NotificationPhoto } from './notification.types';

const HEIC_CONTENT_TYPES = ['image/heic', 'image/heif'];

@Injectable()
export class ImageConverter {
  private readonly logger = new Logger(ImageConverter.name);

  // Slack은 HEIC 미리보기를 지원하지 않으므로 JPEG로 바꾼다. 실패하면 원본을 그대로 쓴다.
  async toSlackImage(photo: NotificationPhoto): Promise<NotificationPhoto> {
    if (!HEIC_CONTENT_TYPES.includes(photo.contentType)) {
      return photo;
    }
    try {
      const output = await convert({
        buffer: photo.buffer,
        format: 'JPEG',
        quality: 0.8,
      });
      return {
        buffer: Buffer.from(output),
        extension: '.jpg',
        contentType: 'image/jpeg',
      };
    } catch (error) {
      this.logger.warn(
        `HEIC conversion failed, uploading the original: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return photo;
    }
  }
}
```

- [ ] **Step 9: 테스트 통과 확인**

Run: `npx jest src/notification/slack.client.spec.ts src/notification/image-converter.spec.ts`
Expected: PASS — SlackClient 5개, ImageConverter 4개

- [ ] **Step 10: 전체 테스트 확인**

Run: `npm test && npx tsc --noEmit -p tsconfig.json`
Expected: 모두 PASS, 타입 에러 없음

- [ ] **Step 11: 커밋**

```bash
git add package.json package-lock.json src/types/ src/notification/notification.types.ts src/notification/slack.client.ts src/notification/slack.client.spec.ts src/notification/image-converter.ts src/notification/image-converter.spec.ts
git commit -m "feat: add Slack Web API client and HEIC to JPEG converter"
```

---

### Task 3: NotificationService(봇 토큰) + ReportService 백그라운드 알림

**Files:**
- Modify: `src/notification/notification.service.ts` (전체 재작성)
- Modify: `src/notification/notification.service.spec.ts` (전체 재작성)
- Modify: `src/notification/notification.module.ts`
- Modify: `src/report/report.service.ts`
- Modify: `src/report/report.service.spec.ts`
- Modify: `test/report.e2e-spec.ts` (알림 mock 이름)
- Modify: `.env.example`

**Interfaces:**
- Consumes: `SlackClient.postMessage`, `SlackClient.uploadToThread`, `ImageConverter.toSlackImage`, `ReportNotification`, `NotificationPhoto` (Task 2), `UrgencyLevel`, `LeakLocation` (기존), `ResolvedFileType` (`src/report/file-types.ts`, `{ extension; contentType }`)
- Produces:
  - `NotificationService.notifyReportCreated(report: ReportNotification): Promise<void>` — 절대 reject 안 함. 기존 `sendLeakReportCreated`는 삭제.
  - `interface NewLeakReport { name: string; phone: string; address: string; urgency: UrgencyLevel; location?: LeakLocation; occurredAt?: string; damageScope?: string; description?: string }` (`src/report/report.service.ts`에서 export)
  - `ReportService.create(input: NewLeakReport, files: ReportFiles)` — DB 저장 후 알림을 `await` 없이 시작

- [ ] **Step 1: 실패하는 테스트 작성 — NotificationService**

`src/notification/notification.service.spec.ts` 전체를 다음으로 바꾼다:

```ts
import { Logger } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { ReportNotification } from './notification.types';

describe('NotificationService', () => {
  const photo = {
    buffer: Buffer.from('jpeg'),
    extension: '.jpg',
    contentType: 'image/jpeg',
  };

  const generalReport: ReportNotification = {
    id: 1,
    name: '홍길동',
    phone: '010-1234-5678',
    address: '서울시 강남구 테스트로 1',
    urgency: '보통',
    isEmergency: false,
    location: '천장 누수',
    description: null,
    photos: [photo],
    hasVideo: false,
  };

  const emergencyReport: ReportNotification = {
    ...generalReport,
    id: 2,
    urgency: '긴급',
    isEmergency: true,
    description: '천장에서 물이 떨어지고 있어요',
  };

  const settings: Record<string, string> = {
    SLACK_BOT_TOKEN: 'xoxb-test',
    SLACK_REPORT_CHANNEL_ID: 'C_REPORT',
    SLACK_EMERGENCY_CHANNEL_ID: 'C_EMERGENCY',
  };

  function createService(overrides: Record<string, string | undefined> = {}) {
    const values = { ...settings, ...overrides };
    const config = { get: jest.fn((key: string) => values[key]) } as any;
    const slack = {
      postMessage: jest.fn().mockResolvedValue('111.222'),
      uploadToThread: jest.fn().mockResolvedValue(undefined),
    };
    const images = {
      toSlackImage: jest.fn(async (p) => p),
    };
    const service = new NotificationService(config, slack as any, images as any);
    return { service, slack, images };
  }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts a general report to the report channel and its photos to the thread', async () => {
    const { service, slack } = createService();

    await service.notifyReportCreated(generalReport);

    const [token, channel, text] = slack.postMessage.mock.calls[0];
    expect(token).toBe('xoxb-test');
    expect(channel).toBe('C_REPORT');
    expect(text.split('\n')[0]).toBe('새 누수 접수 #1');
    expect(text).toContain('긴급도: 보통');
    expect(text).toContain('연락처: 010-1234-5678');
    expect(text).not.toContain('<!channel>');
    expect(slack.uploadToThread).toHaveBeenCalledWith(
      'xoxb-test',
      'C_REPORT',
      '111.222',
      [{ filename: 'photo-1.jpg', buffer: photo.buffer }],
    );
  });

  it('posts an emergency report to the emergency channel with @channel and the phone first', async () => {
    const { service, slack } = createService();

    await service.notifyReportCreated(emergencyReport);

    const [, channel, text] = slack.postMessage.mock.calls[0];
    expect(channel).toBe('C_EMERGENCY');
    const lines = text.split('\n');
    expect(lines[0]).toBe('<!channel> 🚨 긴급 출동 #2');
    expect(lines[1]).toBe('연락처: 010-1234-5678');
    expect(text).toContain('상황: 천장에서 물이 떨어지고 있어요');
    expect(slack.uploadToThread.mock.calls[0][1]).toBe('C_EMERGENCY');
  });

  it('uploads HEIC photos after converting them for Slack', async () => {
    const { service, slack, images } = createService();
    const heic = {
      buffer: Buffer.from('heic'),
      extension: '.heic',
      contentType: 'image/heic',
    };
    const converted = {
      buffer: Buffer.from('jpeg-from-heic'),
      extension: '.jpg',
      contentType: 'image/jpeg',
    };
    images.toSlackImage.mockResolvedValueOnce(converted);

    await service.notifyReportCreated({ ...generalReport, photos: [heic, photo] });

    expect(images.toSlackImage).toHaveBeenCalledWith(heic);
    expect(slack.uploadToThread.mock.calls[0][3]).toEqual([
      { filename: 'photo-1.jpg', buffer: converted.buffer },
      { filename: 'photo-2.jpg', buffer: photo.buffer },
    ]);
  });

  it('escapes user text and mentions an attached video', async () => {
    const { service, slack } = createService();

    await service.notifyReportCreated({
      ...generalReport,
      name: '<!channel> 홍길동',
      address: 'A & B <https://evil.example|클릭>',
      hasVideo: true,
    });

    const text = slack.postMessage.mock.calls[0][2];
    expect(text).toContain('이름: &lt;!channel&gt; 홍길동');
    expect(text).toContain('주소: A &amp; B &lt;https://evil.example|클릭&gt;');
    expect(text).not.toContain('<!channel>');
    expect(text).toContain('동영상 1개 첨부됨');
  });

  it('skips the photo upload and does not throw when the message fails', async () => {
    const { service, slack } = createService();
    slack.postMessage.mockRejectedValue(new Error('channel_not_found'));

    await expect(service.notifyReportCreated(generalReport)).resolves.toBeUndefined();

    expect(slack.uploadToThread).not.toHaveBeenCalled();
    expect(Logger.prototype.error).toHaveBeenCalledTimes(1);
  });

  it('does not throw when the photo upload fails', async () => {
    const { service, slack } = createService();
    slack.uploadToThread.mockRejectedValue(new Error('file upload failed'));

    await expect(service.notifyReportCreated(generalReport)).resolves.toBeUndefined();

    expect(Logger.prototype.error).toHaveBeenCalledTimes(1);
  });

  it('does not upload anything when there are no photos', async () => {
    const { service, slack } = createService();

    await service.notifyReportCreated({ ...generalReport, photos: [] });

    expect(slack.postMessage).toHaveBeenCalledTimes(1);
    expect(slack.uploadToThread).not.toHaveBeenCalled();
  });

  it.each([
    ['the bot token', { SLACK_BOT_TOKEN: undefined }],
    ['the channel', { SLACK_EMERGENCY_CHANNEL_ID: undefined }],
  ])('skips sending when %s is not configured', async (_label, overrides) => {
    const { service, slack } = createService(overrides);

    await service.notifyReportCreated(emergencyReport);

    expect(slack.postMessage).not.toHaveBeenCalled();
    expect(Logger.prototype.warn).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx jest src/notification/notification.service.spec.ts`
Expected: FAIL — `notifyReportCreated is not a function` (또는 생성자 인자 타입 에러)

- [ ] **Step 3: NotificationService 재작성**

`src/notification/notification.service.ts` 전체를 다음으로 바꾼다:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageConverter } from './image-converter';
import { ReportNotification } from './notification.types';
import { SlackClient, SlackFile } from './slack.client';

// Slack mrkdwn에서 <!channel>, <링크|텍스트> 같은 제어 문법이 동작하지 않도록 이스케이프
function escapeSlack(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function line(label: string, value?: string | null): string | null {
  return value ? `${label}: ${escapeSlack(value)}` : null;
}

// 긴급은 알림을 보자마자 전화할 수 있게 연락처를 맨 앞에 둔다
function buildMessage(report: ReportNotification): string {
  const header = report.isEmergency
    ? `<!channel> 🚨 긴급 출동 #${report.id}`
    : `새 누수 접수 #${report.id}`;
  const lines = report.isEmergency
    ? [
        line('연락처', report.phone),
        line('주소', report.address),
        line('이름', report.name),
        line('발생 장소', report.location),
        line('상황', report.description),
      ]
    : [
        line('긴급도', report.urgency),
        line('발생 장소', report.location),
        line('주소', report.address),
        line('이름', report.name),
        line('연락처', report.phone),
      ];
  if (report.hasVideo) {
    lines.push('동영상 1개 첨부됨');
  }
  return [header, ...lines.filter((value): value is string => value !== null)].join('\n');
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly slack: SlackClient,
    private readonly images: ImageConverter,
  ) {}

  // 호출자가 await 없이 백그라운드로 실행하므로 절대 reject하지 않는다
  async notifyReportCreated(report: ReportNotification): Promise<void> {
    const token = this.config.get<string>('SLACK_BOT_TOKEN');
    const channel = this.config.get<string>(
      report.isEmergency ? 'SLACK_EMERGENCY_CHANNEL_ID' : 'SLACK_REPORT_CHANNEL_ID',
    );
    if (!token || !channel) {
      this.logger.warn(
        `Slack bot token or channel not set, skipping notification for report #${report.id}`,
      );
      return;
    }

    let threadTs: string;
    try {
      threadTs = await this.slack.postMessage(token, channel, buildMessage(report));
    } catch (error) {
      this.logFailure(`Slack message failed for report #${report.id}`, error);
      return;
    }

    if (report.photos.length === 0) {
      return;
    }
    try {
      const files: SlackFile[] = [];
      for (const [index, photo] of report.photos.entries()) {
        const image = await this.images.toSlackImage(photo);
        files.push({ filename: `photo-${index + 1}${image.extension}`, buffer: image.buffer });
      }
      await this.slack.uploadToThread(token, channel, threadTs, files);
    } catch (error) {
      this.logFailure(`Slack photo upload failed for report #${report.id}`, error);
    }
  }

  private logFailure(message: string, error: unknown) {
    this.logger.error(message, error instanceof Error ? error.stack : String(error));
  }
}
```

- [ ] **Step 4: NotificationModule에 의존성 등록**

`src/notification/notification.module.ts` 전체:

```ts
import { Module } from '@nestjs/common';
import { ImageConverter } from './image-converter';
import { NotificationService } from './notification.service';
import { SlackClient } from './slack.client';

@Module({
  providers: [NotificationService, SlackClient, ImageConverter],
  exports: [NotificationService],
})
export class NotificationModule {}
```

- [ ] **Step 5: NotificationService 테스트 통과 확인**

Run: `npx jest src/notification`
Expected: PASS — NotificationService 9개(each 포함), SlackClient 5개, ImageConverter 4개

- [ ] **Step 6: 실패하는 테스트 작성 — ReportService**

`src/report/report.service.spec.ts`에서:

1. `createService()` 안의 `notification` mock을 다음으로 바꾼다:

```ts
    const notification = {
      notifyReportCreated: jest.fn().mockResolvedValue(undefined),
    } as any;
```

2. 첫 번째 테스트 `'uploads files, saves the report, and sends a notification'`의 알림 검증을 다음으로 바꾼다:

```ts
    expect(notification.notifyReportCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        isEmergency: false,
        hasVideo: false,
        phone: '010-1234-5678',
        photos: [
          { buffer: photo.buffer, extension: '.jpg', contentType: 'image/jpeg' },
        ],
      }),
    );
```

3. 마지막 `it(...)` 뒤(최상위 `describe` 안)에 추가:

```ts
  it('does not wait for the Slack notification to finish', async () => {
    const { service, notification } = createService();
    notification.notifyReportCreated.mockReturnValue(new Promise(() => {}));

    const result = await service.create(dto, { photos: [photo] });

    expect(result.id).toBe(1);
    expect(notification.notifyReportCreated).toHaveBeenCalledTimes(1);
  });

  it('saves an emergency report without general-only fields and flags the notification', async () => {
    const { service, prisma, notification } = createService();
    const emergency = {
      name: '홍길동',
      phone: '010-1234-5678',
      address: '서울시 강남구 테스트로 1',
      urgency: '긴급',
      description: '천장에서 물이 떨어지고 있어요',
    } as any;
    prisma.leakReport.create.mockResolvedValue({
      id: 7,
      ...emergency,
      location: null,
      occurredAt: null,
      damageScope: null,
      files: [],
    });

    await service.create(emergency, { photos: [photo] });

    const { data } = prisma.leakReport.create.mock.calls[0][0];
    expect(data).toMatchObject({
      urgency: '긴급',
      description: '천장에서 물이 떨어지고 있어요',
    });
    expect(data.occurredAt).toBeUndefined();
    expect(notification.notifyReportCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 7,
        isEmergency: true,
        description: '천장에서 물이 떨어지고 있어요',
      }),
    );
  });
```

- [ ] **Step 7: 테스트 실패 확인**

Run: `npx jest src/report/report.service.spec.ts`
Expected: FAIL — `this.notification.sendLeakReportCreated is not a function`

- [ ] **Step 8: ReportService 수정**

`src/report/report.service.ts`에서:

1. import 블록을 다음으로 바꾼다:

```ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationService } from '../notification/notification.service';
import { LeakLocation, UrgencyLevel } from './dto/leak-report.enums';
import { ResolvedFileType, resolveFileType } from './file-types';
```

2. `ReportFiles` 인터페이스 바로 위에 추가:

```ts
// 일반 접수와 긴급 출동이 공통으로 저장하는 입력. 긴급 출동은 occurredAt/damageScope가 없다.
export interface NewLeakReport {
  name: string;
  phone: string;
  address: string;
  urgency: UrgencyLevel;
  location?: LeakLocation;
  occurredAt?: string;
  damageScope?: string;
  description?: string;
}
```

3. `async create(dto: CreateReportDto, files: ReportFiles) {` 를 `async create(input: NewLeakReport, files: ReportFiles) {` 로 바꾼다.

4. `const report = await this.prisma.leakReport.create({` 부터 `return report;` 까지를 다음으로 바꾼다:

```ts
    const report = await this.prisma.leakReport.create({
      data: {
        name: input.name,
        phone: input.phone,
        address: input.address,
        location: input.location,
        occurredAt: input.occurredAt,
        damageScope: input.damageScope,
        description: input.description,
        urgency: input.urgency,
        files: { create: uploaded },
      },
      include: { files: true },
    });

    // HEIC 변환과 Slack 사진 업로드는 오래 걸릴 수 있어 고객 응답을 기다리게 하지 않는다.
    // notifyReportCreated는 내부에서 모든 에러를 잡으므로 reject되지 않는다.
    void this.notification.notifyReportCreated({
      id: report.id,
      name: report.name,
      phone: report.phone,
      address: report.address,
      urgency: report.urgency,
      isEmergency: report.urgency === UrgencyLevel.HIGH,
      location: report.location,
      description: report.description,
      photos: files.photos.map((photo, index) => ({
        buffer: photo.buffer,
        ...photoTypes[index],
      })),
      hasVideo: Boolean(files.video),
    });

    return report;
```

`CreateReportDto` import는 더 이상 쓰지 않으므로 제거된 상태여야 한다 (1번에서 이미 제외).

- [ ] **Step 9: e2e의 알림 mock 이름 변경**

`test/report.e2e-spec.ts`에서

```ts
      .useValue({
        sendLeakReportCreated: jest.fn().mockResolvedValue(undefined),
      })
```

를 다음으로 바꾼다:

```ts
      .useValue({
        notifyReportCreated: jest.fn().mockResolvedValue(undefined),
      })
```

- [ ] **Step 10: .env.example 갱신**

`.env.example`에서 `SLACK_WEBHOOK_URL=` 줄을 다음 세 줄로 바꾼다:

```
SLACK_BOT_TOKEN=
SLACK_REPORT_CHANNEL_ID=
SLACK_EMERGENCY_CHANNEL_ID=
```

로컬 `.env`에도 같은 세 줄을 추가하고 `SLACK_WEBHOOK_URL` 줄을 지운다 (`.env`는 커밋하지 않는다).

- [ ] **Step 11: 전체 테스트 확인**

Run: `npm test && npm run test:e2e && npx tsc --noEmit -p tsconfig.json`
Expected: 모두 PASS, 타입 에러 없음. `/health` e2e는 실제 NotificationService를 띄우므로 SlackClient/ImageConverter 주입이 되는지도 여기서 확인된다.

- [ ] **Step 12: 커밋**

```bash
git add src/notification/ src/report/report.service.ts src/report/report.service.spec.ts test/report.e2e-spec.ts .env.example
git commit -m "feat: send Slack notifications via bot token with photos in thread"
```

---

### Task 4: 폼 처리 공용화 + 일반 폼 변경(긴급도 축소, 긴급 출동 링크)

**Files:**
- Create: `src/report/upload-options.ts`
- Modify: `src/report/upload-error.filter.ts`
- Modify: `src/report/upload-error.filter.spec.ts`
- Modify: `src/report/report.controller.ts` (전체 재작성)
- Modify: `src/report/report-form.view-model.ts`
- Modify: `views/report/form.hbs`
- Modify: `public/styles.css`
- Modify: `test/report.e2e-spec.ts`

**Interfaces:**
- Consumes: `NewLeakReport`, `ReportService.create` (Task 3), `GENERAL_URGENCY_LEVELS`, `CreateReportDto` (Task 1)
- Produces:
  - `ReportUploadInterceptor()` — 일반/긴급 공용 `FileFieldsInterceptor` (`src/report/upload-options.ts`), `type UploadedReportFiles`
  - `type UploadFormViewModel = (error: string, values: FormValues) => object`, `new UploadErrorFilter(view: string, viewModel: UploadFormViewModel)` — 인스턴스로 `@UseFilters`에 넘긴다
  - `interface ReportForm<T extends object> { view; viewModel; dtoClass; toReport }` 와 `ReportController`의 private `submitForm(form, body, files, res)` — Task 5가 `EMERGENCY_FORM`과 `requirePhoto`를 추가한다
  - `ReportController`는 `@Controller()` + 메서드별 전체 경로(`report`, `report/:id/complete`)

- [ ] **Step 1: 실패하는 테스트 작성 — 필터가 설정된 뷰로 렌더링**

`src/report/upload-error.filter.spec.ts`에서:

1. import에 `formViewModel`을 추가한다:

```ts
import { formViewModel } from './report-form.view-model';
```

2. `describe('UploadErrorFilter', () => {` 바로 아래에 추가:

```ts
  const createFilter = () => new UploadErrorFilter('report/form', formViewModel);
```

3. 파일 안의 모든 `new UploadErrorFilter()` 를 `createFilter()` 로 바꾼다.

4. `'keeps the text fields that were already submitted'` 테스트의 `urgency: '긴급'` 을 `urgency: '보통'` 으로, `{ value: '긴급', selected: true }` 를 `{ value: '보통', selected: true }` 로 바꾼다.

5. 마지막 `it(...)` 뒤에 추가:

```ts
  it('renders the view and view model it was configured with', () => {
    const { host, response } = createHost({ name: '홍길동' });
    const viewModel = jest.fn((error: string, values: object) => ({ error, values, custom: true }));

    new UploadErrorFilter('report/emergency', viewModel).catch(
      new PayloadTooLargeException('File too large'),
      host,
    );

    const [view, model] = response.render.mock.calls[0];
    expect(view).toBe('report/emergency');
    expect(model.custom).toBe(true);
    expect(viewModel).toHaveBeenCalledWith(
      expect.stringContaining('200MB'),
      { name: '홍길동' },
    );
  });

  it('offers only 낮음 and 보통 as urgency options on the general form', () => {
    const { host, response } = createHost();

    createFilter().catch(new PayloadTooLargeException('File too large'), host);

    const [, model] = response.render.mock.calls[0];
    expect(model.urgencies.map((o: { value: string }) => o.value)).toEqual(['낮음', '보통']);
  });
```

`renderedError` 헬퍼의 `expect(view).toBe('report/form')`는 그대로 둔다 (`createFilter()`는 `report/form`으로 설정된다).

- [ ] **Step 2: 실패하는 e2e 테스트 작성 — 일반 폼 변경**

`test/report.e2e-spec.ts`에서:

1. `'POST /report rejects an unsupported file type before upload and keeps the input'` 테스트의 `.field('urgency', '긴급')` 을 `.field('urgency', '보통')` 으로, `expect(res.text).toMatch(/<option value="긴급" selected>/);` 를 `expect(res.text).toMatch(/<option value="보통" selected>/);` 로 바꾼다.

2. 마지막 `it(...)` 뒤에 추가:

```ts
  it('GET /report links to the emergency form and offers no 긴급 urgency', async () => {
    const res = await request(app.getHttpServer()).get('/report');

    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/emergency"');
    expect(res.text).toContain('<option value="보통"');
    expect(res.text).not.toContain('<option value="긴급"');
  });

  it('POST /report with urgency 긴급 is rejected and nothing is saved', async () => {
    const res = await request(app.getHttpServer())
      .post('/report')
      .field('name', '긴급거부테스트')
      .field('phone', '010-1234-5678')
      .field('address', '서울시 강남구 테스트로 1')
      .field('location', '천장 누수')
      .field('occurredAt', '오늘 아침')
      .field('damageScope', '거실 천장 일부 젖음')
      .field('urgency', '긴급');

    expect(res.status).toBe(400);
    expect(res.text).toMatch(/입력값을 다시 확인해주세요[^<]*긴급도/);
    const count = await prisma.leakReport.count({ where: { name: '긴급거부테스트' } });
    expect(count).toBe(0);
  });
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx jest src/report/upload-error.filter.spec.ts && npm run test:e2e -- report.e2e-spec.ts`
Expected: FAIL — 필터 생성자 인자 관련 실패(`report/emergency`로 렌더링되지 않음), urgency 옵션에 `긴급` 포함, `href="/emergency"` 없음

- [ ] **Step 4: 공용 업로드 인터셉터 작성**

`src/report/upload-options.ts`:

```ts
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { isAllowedType, UnsupportedFileTypeException } from './file-types';

export type UploadedReportFiles =
  | { photos?: Express.Multer.File[]; video?: Express.Multer.File[] }
  | undefined;

// 일반 접수와 긴급 출동이 같은 업로드 제한을 쓴다
export function ReportUploadInterceptor() {
  return FileFieldsInterceptor(
    [
      { name: 'photos', maxCount: 20 },
      { name: 'video', maxCount: 1 },
    ],
    {
      // storage 미지정 시 multer 기본값인 메모리 저장소를 사용한다
      limits: {
        fileSize: 200 * 1024 * 1024,
        files: 21,
        fields: 20,
        parts: 45,
        fieldSize: 10 * 1024,
      },
      // 허용되지 않은 형식은 메모리에 버퍼링하기 전에 거부한다
      fileFilter: (_req, file, callback) => {
        const kind = file.fieldname === 'video' ? 'video' : 'photo';
        if (isAllowedType(file, kind)) {
          callback(null, true);
        } else {
          callback(new UnsupportedFileTypeException(), false);
        }
      },
    },
  );
}
```

- [ ] **Step 5: UploadErrorFilter를 뷰 설정형으로 변경**

`src/report/upload-error.filter.ts`에서:

1. `report-form.view-model` import를 다음으로 바꾼다:

```ts
import {
  FormValues,
  pickFormValues,
  REATTACH_FILES_NOTE,
} from './report-form.view-model';
```

2. `interface MulterLikeError` 바로 위에 추가:

```ts
export type UploadFormViewModel = (error: string, values: FormValues) => object;
```

3. 클래스 주석과 선언부를 다음으로 바꾼다 (`@Catch()` 유지):

```ts
// 폼 제출의 업로드(multer) 단계에서 난 오류를 해당 폼 화면으로 다시 보여준다.
// 생성자 인자가 있으므로 @UseFilters(new UploadErrorFilter(...))처럼 인스턴스로 넘긴다.
@Catch()
export class UploadErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(UploadErrorFilter.name);

  constructor(
    private readonly view: string,
    private readonly viewModel: UploadFormViewModel,
  ) {}
```

4. `catch` 메서드 마지막의 렌더링을 다음으로 바꾼다:

```ts
    response
      .status(status)
      .render(this.view, this.viewModel(message, pickFormValues(request.body)));
```

- [ ] **Step 6: 뷰모델의 긴급도 선택지 축소**

`src/report/report-form.view-model.ts`에서:

1. import를 `import { GENERAL_URGENCY_LEVELS, LeakLocation } from './dto/leak-report.enums';` 로 바꾼다.
2. `formViewModel`의 `urgencies: options(Object.values(UrgencyLevel), values.urgency),` 를 `urgencies: options(GENERAL_URGENCY_LEVELS, values.urgency),` 로 바꾼다.

- [ ] **Step 7: ReportController 재작성**

`src/report/report.controller.ts` 전체를 다음으로 바꾼다:

```ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Render,
  Res,
  UploadedFiles,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Response } from 'express';
import { NewLeakReport, ReportService } from './report.service';
import { CreateReportDto } from './dto/create-report.dto';
import {
  FIELD_LABELS,
  formViewModel,
  pickFormValues,
  REATTACH_FILES_NOTE,
} from './report-form.view-model';
import { UploadErrorFilter, UploadFormViewModel } from './upload-error.filter';
import { ReportUploadInterceptor, UploadedReportFiles } from './upload-options';

// 폼마다 다른 것(뷰, 뷰모델, 검증 DTO, 저장 입력으로의 변환)만 모아 두고 제출 처리는 공용으로 쓴다
interface ReportForm<T extends object> {
  view: string;
  viewModel: UploadFormViewModel;
  dtoClass: ClassConstructor<T>;
  toReport: (dto: T) => NewLeakReport;
}

const GENERAL_FORM: ReportForm<CreateReportDto> = {
  view: 'report/form',
  viewModel: formViewModel,
  dtoClass: CreateReportDto,
  toReport: (dto) => dto,
};

@Controller()
export class ReportController {
  private readonly logger = new Logger(ReportController.name);

  constructor(private readonly reportService: ReportService) {}

  @Get('report')
  @Render('report/form')
  showForm() {
    return formViewModel();
  }

  @Post('report')
  @UseFilters(new UploadErrorFilter(GENERAL_FORM.view, GENERAL_FORM.viewModel))
  @UseInterceptors(ReportUploadInterceptor())
  submit(
    @Body() body: Record<string, string>,
    @UploadedFiles() files: UploadedReportFiles,
    @Res() res: Response,
  ) {
    return this.submitForm(GENERAL_FORM, body, files, res);
  }

  @Get('report/:id/complete')
  @Render('report/complete')
  async showComplete(@Param('id', ParseIntPipe) id: number) {
    const report = await this.reportService.findOne(id);
    if (!report) {
      throw new NotFoundException('접수 정보를 찾을 수 없습니다.');
    }
    // 접수번호가 순차적이라 누구나 조회할 수 있으므로 개인정보(이름·연락처·주소)는 넘기지 않는다
    return {
      report: {
        id: report.id,
        location: report.location,
        urgency: report.urgency,
        status: report.status,
      },
    };
  }

  private async submitForm<T extends object>(
    form: ReportForm<T>,
    body: unknown,
    files: UploadedReportFiles,
    res: Response,
  ) {
    const values = pickFormValues(body);
    const photos = files?.photos ?? [];
    const video = files?.video?.[0];
    const renderError = (status: number, message: string) => {
      const withNote =
        photos.length > 0 || video ? `${message} ${REATTACH_FILES_NOTE}` : message;
      return res.status(status).render(form.view, form.viewModel(withNote, values));
    };

    const dto = plainToInstance(form.dtoClass, values);
    const errors = await validate(dto);
    if (errors.length > 0) {
      const labels = errors.map(
        (e) => FIELD_LABELS[e.property as keyof typeof FIELD_LABELS] ?? e.property,
      );
      return renderError(400, `입력값을 다시 확인해주세요: ${labels.join(', ')}`);
    }

    try {
      const report = await this.reportService.create(form.toReport(dto), { photos, video });
      return res.redirect(`/report/${report.id}/complete`);
    } catch (error) {
      if (error instanceof BadRequestException) {
        return renderError(400, error.message);
      }
      this.logger.error(
        'Leak report submission failed',
        error instanceof Error ? error.stack : String(error),
      );
      return renderError(500, '접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    }
  }
}
```

- [ ] **Step 8: 일반 폼에 긴급 출동 링크 추가**

`views/report/form.hbs`에서 `<h1>누수 접수</h1>` 바로 아래에 추가:

```html
  <a class="emergency-link" href="/emergency">🚨 지금 물이 새고 있나요? 긴급 출동 요청</a>
```

`public/styles.css` 끝에 추가:

```css

.emergency-link {
  display: block;
  margin-bottom: 16px;
  padding: 12px 16px;
  border-radius: 6px;
  background: #c0392b;
  color: #fff;
  font-weight: bold;
  text-align: center;
  text-decoration: none;
}
```

- [ ] **Step 9: 테스트 통과 확인**

Run: `npx jest src/report && npm run test:e2e`
Expected: PASS — 필터 spec의 새 테스트 2개, e2e의 새 테스트 2개 포함 모두 통과

- [ ] **Step 10: 전체 테스트 확인**

Run: `npm test && npm run test:e2e && npx tsc --noEmit -p tsconfig.json`
Expected: 모두 PASS, 타입 에러 없음

- [ ] **Step 11: 커밋**

```bash
git add src/report/ views/report/form.hbs public/styles.css test/report.e2e-spec.ts
git commit -m "refactor: share report form submission and limit general urgency to 낮음/보통"
```

---

### Task 5: 긴급 출동 경로 + 폼 + 완료 페이지 분기

**Files:**
- Modify: `src/report/report-form.view-model.ts`
- Modify: `src/report/report.controller.ts`
- Create: `views/report/emergency.hbs`
- Modify: `views/report/complete.hbs`
- Test: `test/emergency.e2e-spec.ts`

**Interfaces:**
- Consumes: `CreateEmergencyReportDto` (Task 1), `NotificationService.notifyReportCreated` (Task 3, e2e에서 mock), `ReportForm`, `submitForm`, `ReportUploadInterceptor`, `UploadErrorFilter` (Task 4)
- Produces: `GET /emergency`, `POST /emergency`, `emergencyFormViewModel(error?: string, values?: FormValues)`, 완료 페이지의 긴급 분기(`isEmergency`)

- [ ] **Step 1: 실패하는 e2e 테스트 작성**

`test/emergency.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { StorageService } from '../src/storage/storage.service';
import { NotificationService } from '../src/notification/notification.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Emergency (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let notificationMock: { notifyReportCreated: jest.Mock };
  const createdIds: number[] = [];

  beforeAll(async () => {
    notificationMock = {
      notifyReportCreated: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue({
        uploadFile: jest.fn().mockResolvedValue('https://example.com/fake.jpg'),
      })
      .overrideProvider(NotificationService)
      .useValue(notificationMock)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useStaticAssets(join(process.cwd(), 'public'));
    app.setBaseViewsDir(join(process.cwd(), 'views'));
    app.setViewEngine('hbs');
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    for (const id of createdIds) {
      await prisma.leakReportFile.deleteMany({ where: { leakReportId: id } });
      await prisma.leakReport.delete({ where: { id } });
    }
    await app.close();
  });

  it('GET /emergency renders the short emergency form', async () => {
    const res = await request(app.getHttpServer()).get('/emergency');

    expect(res.status).toBe(200);
    expect(res.text).toContain('긴급 출동 요청');
    expect(res.text).toContain('action="/emergency"');
    expect(res.text).toContain('name="description"');
    expect(res.text).toContain('<option value="">선택 안 함</option>');
    expect(res.text).not.toContain('name="urgency"');
  });

  it('POST /emergency without a photo is rejected, keeps the input, and saves nothing', async () => {
    const res = await request(app.getHttpServer())
      .post('/emergency')
      .field('name', '사진없음테스트')
      .field('phone', '010-1234-5678')
      .field('address', '서울시 강남구 테스트로 1');

    expect(res.status).toBe(400);
    expect(res.text).toContain('현장 사진을 1장 이상 올려주세요.');
    expect(res.text).toContain('value="사진없음테스트"');
    const count = await prisma.leakReport.count({ where: { name: '사진없음테스트' } });
    expect(count).toBe(0);
  });

  it('POST /emergency lists invalid contact fields', async () => {
    const res = await request(app.getHttpServer())
      .post('/emergency')
      .field('name', '홍길동')
      .field('phone', 'abc')
      .field('address', '서울시 강남구 테스트로 1')
      .attach('photos', Buffer.from('fake-image'), 'photo1.jpg');

    expect(res.status).toBe(400);
    expect(res.text).toMatch(/입력값을 다시 확인해주세요[^<]*연락처/);
    expect(res.text).toContain('첨부 파일은 다시 선택해주세요.');
  });

  it('POST /emergency with an unsupported file re-renders the emergency form', async () => {
    const res = await request(app.getHttpServer())
      .post('/emergency')
      .field('name', '홍길동')
      .field('phone', '010-1234-5678')
      .field('address', '서울시 강남구 테스트로 1')
      .attach('photos', Buffer.from('%PDF-1.4'), {
        filename: 'document.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(400);
    expect(res.text).toContain('지원하지 않는 사진/동영상 형식입니다');
    expect(res.text).toContain('action="/emergency"');
  });

  it('POST /emergency saves an urgent report, notifies as emergency, and shows the emergency complete page', async () => {
    notificationMock.notifyReportCreated.mockClear();

    const res = await request(app.getHttpServer())
      .post('/emergency')
      .field('name', '긴급접수테스트')
      .field('phone', '010-9876-5432')
      .field('address', '서울시 마포구 긴급로 2')
      .field('location', '')
      .field('description', '천장에서 물이 떨어지고 있어요')
      .attach('photos', Buffer.from('fake-image'), 'photo1.jpg');

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/report\/\d+\/complete/);
    const id = Number(res.headers.location.split('/')[2]);
    createdIds.push(id);

    const saved = await prisma.leakReport.findUnique({ where: { id } });
    expect(saved).toMatchObject({
      name: '긴급접수테스트',
      urgency: '긴급',
      description: '천장에서 물이 떨어지고 있어요',
      location: null,
      occurredAt: null,
      damageScope: null,
    });
    expect(notificationMock.notifyReportCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id, isEmergency: true }),
    );

    const completeRes = await request(app.getHttpServer()).get(res.headers.location);
    expect(completeRes.status).toBe(200);
    expect(completeRes.text).toContain('긴급 출동 요청이 접수되었습니다');
    expect(completeRes.text).toContain('담당자가 곧 전화드립니다.');
    expect(completeRes.text).toContain(String(id));
    expect(completeRes.text).not.toContain('긴급접수테스트');
    expect(completeRes.text).not.toContain('서울시 마포구 긴급로 2');
    expect(completeRes.text).not.toContain('010-9876-5432');
    expect(completeRes.text).not.toContain('발생 장소');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test:e2e -- emergency.e2e-spec.ts`
Expected: FAIL — `GET /emergency` 404

- [ ] **Step 3: 긴급 폼 뷰모델 추가**

`src/report/report-form.view-model.ts`에서:

1. `TEXT_FIELDS` 배열의 `'urgency',` 뒤에 `'description',` 을 추가한다.
2. `FIELD_LABELS`의 `urgency: '긴급도',` 뒤에 `description: '상황 설명',` 을 추가한다.
3. 파일 끝에 추가:

```ts

export function emergencyFormViewModel(error?: string, values: FormValues = {}) {
  return {
    locations: options(Object.values(LeakLocation), values.location),
    values,
    error,
  };
}
```

- [ ] **Step 4: 컨트롤러에 긴급 출동 경로 추가**

`src/report/report.controller.ts`에서:

1. import 추가/변경:

```ts
import { CreateEmergencyReportDto } from './dto/create-emergency-report.dto';
import { UrgencyLevel } from './dto/leak-report.enums';
```

그리고 `report-form.view-model` import에 `emergencyFormViewModel`을 추가한다:

```ts
import {
  emergencyFormViewModel,
  FIELD_LABELS,
  formViewModel,
  pickFormValues,
  REATTACH_FILES_NOTE,
} from './report-form.view-model';
```

2. `ReportForm` 인터페이스에 필드 추가 (`toReport` 아래):

```ts
  // 장난 접수를 막기 위해 긴급 출동은 현장 사진을 1장 이상 요구한다
  requirePhoto?: boolean;
```

3. `GENERAL_FORM` 선언 아래에 추가:

```ts
const EMERGENCY_FORM: ReportForm<CreateEmergencyReportDto> = {
  view: 'report/emergency',
  viewModel: emergencyFormViewModel,
  dtoClass: CreateEmergencyReportDto,
  toReport: (dto) => ({ ...dto, urgency: UrgencyLevel.HIGH }),
  requirePhoto: true,
};

const PHOTO_REQUIRED_MESSAGE = '현장 사진을 1장 이상 올려주세요.';
```

4. `showComplete` 위에 두 핸들러를 추가:

```ts
  @Get('emergency')
  @Render('report/emergency')
  showEmergencyForm() {
    return emergencyFormViewModel();
  }

  @Post('emergency')
  @UseFilters(new UploadErrorFilter(EMERGENCY_FORM.view, EMERGENCY_FORM.viewModel))
  @UseInterceptors(ReportUploadInterceptor())
  submitEmergency(
    @Body() body: Record<string, string>,
    @UploadedFiles() files: UploadedReportFiles,
    @Res() res: Response,
  ) {
    return this.submitForm(EMERGENCY_FORM, body, files, res);
  }
```

5. `showComplete`의 return을 다음으로 바꾼다:

```ts
    // 접수번호가 순차적이라 누구나 조회할 수 있으므로 개인정보(이름·연락처·주소)는 넘기지 않는다
    return {
      isEmergency: report.urgency === UrgencyLevel.HIGH,
      report: {
        id: report.id,
        location: report.location,
        urgency: report.urgency,
        status: report.status,
      },
    };
```

6. `submitForm`에서 필드 검증 `if (errors.length > 0) { ... }` 블록 바로 뒤에 추가:

```ts
    if (form.requirePhoto && photos.length === 0) {
      return renderError(400, PHOTO_REQUIRED_MESSAGE);
    }
```

- [ ] **Step 5: 긴급 출동 폼 뷰 작성**

`views/report/emergency.hbs`:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>긴급 출동 요청 - LeakCare</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <h1>🚨 긴급 출동 요청</h1>
  <p class="help">지금 물이 새고 있다면 아래 정보만 남겨주세요. 담당자가 바로 전화드립니다.</p>
  {{#if error}}
    <p class="error">{{error}}</p>
  {{/if}}
  <form id="report-form" action="/emergency" method="post" enctype="multipart/form-data">
    <fieldset>
      <legend>연락처</legend>
      <label>이름 <input type="text" name="name" value="{{values.name}}" autocomplete="name" maxlength="50" required /></label>
      <label>연락처 <input type="tel" name="phone" value="{{values.phone}}" inputmode="tel" autocomplete="tel" maxlength="20" required /></label>
      <label>주소 <input type="text" name="address" value="{{values.address}}" autocomplete="street-address" maxlength="200" required /></label>
    </fieldset>
    <fieldset>
      <legend>현장 사진</legend>
      <label>사진 (필수)
        <input type="file" name="photos" accept="image/*" multiple required />
      </label>
      <p class="help">1장 이상, 최대 20장, 장당 10MB</p>
      <label>동영상 (선택)
        <input type="file" name="video" accept="video/*" />
      </label>
      <p class="help">1분 이내 영상, 최대 200MB</p>
    </fieldset>
    <fieldset>
      <legend>추가 정보 (선택)</legend>
      <label>발생 장소
        <select name="location">
          <option value="">선택 안 함</option>
          {{#each locations}}
            <option value="{{value}}"{{#if selected}} selected{{/if}}>{{value}}</option>
          {{/each}}
        </select>
      </label>
      <label>상황 설명 <input type="text" name="description" value="{{values.description}}" maxlength="200" placeholder="예: 천장에서 물이 떨어지고 있어요" /></label>
    </fieldset>
    <button type="submit" id="submit-button">긴급 출동 요청</button>
  </form>
  <script>
    document.getElementById('report-form').addEventListener('submit', function () {
      var button = document.getElementById('submit-button');
      button.disabled = true;
      button.textContent = '업로드 중…';
    });
  </script>
</body>
</html>
```

- [ ] **Step 6: 완료 페이지 긴급 분기**

`views/report/complete.hbs`의 `<body>` 안 전체를 다음으로 바꾼다:

```html
  {{#if isEmergency}}
    <h1>긴급 출동 요청이 접수되었습니다</h1>
  {{else}}
    <h1>접수가 완료되었습니다</h1>
  {{/if}}
  <p>접수번호: {{report.id}}</p>
  {{#if report.location}}
    <p>발생 장소: {{report.location}}</p>
  {{/if}}
  <p>긴급도: {{report.urgency}}</p>
  <p>상태: {{report.status}}</p>
  {{#if isEmergency}}
    <p>담당자가 곧 전화드립니다. 전화를 받을 수 있게 해주세요.</p>
  {{else}}
    <p>담당자가 곧 연락드리겠습니다.</p>
  {{/if}}
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `npm run test:e2e`
Expected: PASS — `Emergency (e2e)` 5개와 기존 `Report (e2e)`, `/health` 모두 통과

- [ ] **Step 8: 전체 확인**

Run: `npm test && npm run test:e2e && npx tsc --noEmit -p tsconfig.json && rm -rf dist && npm run build && ls dist/main.js`
Expected: 모두 PASS, 타입 에러 없음, `dist/main.js` 존재

- [ ] **Step 9: 커밋**

```bash
git add src/report/ views/report/ test/emergency.e2e-spec.ts
git commit -m "feat: add emergency dispatch form with required photos"
```

---

## 수동 확인 (배포 전)

자동 테스트는 Slack/S3를 모킹한다. 실제 배포 전:

1. Slack 앱 생성 → Bot Token Scopes에 `chat:write`, `files:write` 추가 → 워크스페이스에 설치 → `xoxb-` 토큰 복사.
2. `#누수접수`, `#긴급출동` 채널 생성 후 각 채널에서 `/invite @앱이름`. 채널 ID(채널 정보 하단의 `C...`)를 확인.
3. `.env`에 `SLACK_BOT_TOKEN`, `SLACK_REPORT_CHANNEL_ID`, `SLACK_EMERGENCY_CHANNEL_ID`와 실제 `AWS_*`/`S3_BUCKET` 값 설정.
4. `npm run prisma:deploy` 후 `npm run start:dev`.
5. 휴대폰으로 `/report`에서 사진(아이폰 HEIC 포함) 첨부 접수 → `#누수접수`에 메시지와 쓰레드 사진(JPEG 미리보기) 확인.
6. `/emergency`에서 사진 1장 첨부 접수 → `#긴급출동`에 `@channel` 알림, 첫 줄 연락처, 쓰레드 사진 확인. 완료 페이지에 긴급 문구 확인.
