# 누수 접수(의뢰) 1차 구현 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고객이 웹 폼으로 누수 접수(기본정보 + 누수정보 + 사진/동영상)를 제출하면, 파일이 OCI Object Storage에 업로드되고 접수 정보가 DB에 저장되며, Slack 채널로 알림이 전송되는 NestJS 서버사이드(SSR) 애플리케이션을 구축한다.

**Architecture:** NestJS 모듈형 백엔드 + Handlebars SSR 뷰. `ReportController`가 폼 표시/제출/완료 페이지를 담당하고, `ReportService`가 `StorageService`(OCI Object Storage 업로드)와 `NotificationService`(Slack Webhook)를 오케스트레이션한 뒤 Prisma로 DB에 저장한다.

**Tech Stack:** NestJS 10, Handlebars(`hbs`), Prisma 5 + SQLite, `@aws-sdk/client-s3`(OCI Object Storage용), `multer`(메모리 스토리지), Node 18+ 내장 `fetch`(Slack Webhook), Jest + Supertest.

참조 스펙: `docs/superpowers/specs/2026-09-04-leak-report-intake-design.md`

## Global Constraints

- 프론트엔드는 별도 프레임워크 없이 NestJS + Handlebars 서버사이드 렌더링만 사용한다.
- DB는 Prisma + SQLite(`file:./dev.db`)를 사용한다 (오라클 클라우드 VM에 배포, 로컬 디스크 영구 보존).
- 파일 저장은 OCI Object Storage(S3 호환 API)를 `@aws-sdk/client-s3`로 연동한다.
- 파일 업로드는 `multer` 메모리 스토리지로 받는다.
- Slack 알림은 Incoming Webhook에 Node `fetch`로 POST한다. Node 18 이상 필요(전역 `fetch` 사용).
- 보험 정보(가입 여부/보험사/증권번호) 필드는 이번 범위에서 제외한다.
- 회원가입/로그인 기능 없음 — 접수는 비로그인으로 받는다.
- 사진은 최대 20장, 장당 10MB, jpg/png/heic만 허용. 동영상은 1개, 최대 200MB, mp4/mov만 허용.
- 파일 업로드가 하나라도 실패하면 전체 제출을 실패 처리하고 DB에 레코드를 남기지 않는다.
- Slack 알림 전송 실패는 접수 성공 여부에 영향을 주지 않는다 (로그만 남김).

---

### Task 1: 프로젝트 스캐폴드 (NestJS + Handlebars)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `nest-cli.json`
- Create: `.env.example`
- Modify: `.gitignore`
- Create: `src/app.controller.ts`
- Create: `src/app.module.ts`
- Create: `src/main.ts`
- Create: `test/jest-e2e.json`
- Test: `test/app.e2e-spec.ts`

**Interfaces:**
- Produces: `AppModule` (root module, imports `ConfigModule.forRoot({ isGlobal: true })`), `AppController` with `GET /health` returning `{ status: 'ok' }`.

- [ ] **Step 1: package.json 작성**

```json
{
  "name": "leak-care",
  "version": "0.1.0",
  "description": "LeakCare 누수 접수 서비스",
  "private": true,
  "license": "UNLICENSED",
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:e2e": "jest --config ./test/jest-e2e.json"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.600.0",
    "@nestjs/common": "^10.4.0",
    "@nestjs/config": "^3.2.0",
    "@nestjs/core": "^10.4.0",
    "@nestjs/platform-express": "^10.4.0",
    "@prisma/client": "^5.16.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "hbs": "^4.2.0",
    "multer": "^1.4.5-lts.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.0",
    "@nestjs/schematics": "^10.1.0",
    "@nestjs/testing": "^10.4.0",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/multer": "^1.4.11",
    "@types/node": "^20.14.0",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "prisma": "^5.16.0",
    "supertest": "^6.3.4",
    "ts-jest": "^29.1.5",
    "ts-node": "^10.9.2",
    "typescript": "^5.4.5"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "collectCoverageFrom": ["**/*.(t|j)s"],
    "coverageDirectory": "../coverage",
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 2: tsconfig.json 작성**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "forceConsistentCasingInFileNames": true,
    "noImplicitAny": false,
    "strictBindCallApply": false,
    "noFallthroughCasesInSwitch": false
  }
}
```

- [ ] **Step 3: nest-cli.json 작성**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src"
}
```

- [ ] **Step 4: 의존성 설치**

Run: `npm install`
Expected: 종료 코드 0, `node_modules/` 생성됨

- [ ] **Step 5: .gitignore에 추가**

`.gitignore` 파일 끝에 다음을 추가한다 (파일이 없으면 새로 생성):

```
node_modules/
dist/
coverage/
.env
*.db
*.db-journal
```

- [ ] **Step 6: .env.example 작성**

```
DATABASE_URL="file:./dev.db"
OCI_S3_ENDPOINT=
OCI_S3_REGION=
OCI_S3_BUCKET=
OCI_S3_ACCESS_KEY=
OCI_S3_SECRET_KEY=
SLACK_WEBHOOK_URL=
```

- [ ] **Step 7: test/jest-e2e.json 작성**

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" }
}
```

- [ ] **Step 8: 실패하는 e2e 테스트 작성**

`test/app.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });
});
```

- [ ] **Step 9: 테스트 실패 확인**

Run: `npm run test:e2e`
Expected: FAIL — `Cannot find module '../src/app.module'`

- [ ] **Step 10: src/app.controller.ts 작성**

```ts
import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
```

- [ ] **Step 11: src/app.module.ts 작성**

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 12: 테스트 통과 확인**

Run: `npm run test:e2e`
Expected: PASS — `AppController (e2e) › /health (GET)`

- [ ] **Step 13: src/main.ts 작성**

```ts
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useStaticAssets(join(process.cwd(), 'public'));
  app.setBaseViewsDir(join(process.cwd(), 'views'));
  app.setViewEngine('hbs');
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

- [ ] **Step 14: 커밋**

```bash
git add package.json tsconfig.json nest-cli.json .env.example .gitignore test/jest-e2e.json test/app.e2e-spec.ts src/app.controller.ts src/app.module.ts src/main.ts
git commit -m "feat: scaffold NestJS project with hbs SSR setup"
```

---

### Task 2: Prisma 스키마 + PrismaService

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/prisma/prisma.service.ts`
- Create: `src/prisma/prisma.module.ts`
- Modify: `src/app.module.ts`
- Test: `src/prisma/prisma.service.spec.ts`

**Interfaces:**
- Consumes: none (신규 모듈)
- Produces: `PrismaService` (extends `PrismaClient`, `leakReport` / `leakReportFile` 모델 접근 가능), `PrismaModule`(`@Global`, `PrismaService` export)

- [ ] **Step 1: 로컬 .env 생성**

Run: `cp .env.example .env`
Expected: `.env` 파일 생성됨 (git에는 커밋되지 않음)

- [ ] **Step 2: prisma/schema.prisma 작성**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model LeakReport {
  id          Int      @id @default(autoincrement())
  name        String
  phone       String
  address     String
  location    String
  occurredAt  String
  damageScope String
  urgency     String
  status      String   @default("접수완료")
  createdAt   DateTime @default(now())
  files       LeakReportFile[]
}

model LeakReportFile {
  id           Int        @id @default(autoincrement())
  leakReportId Int
  leakReport   LeakReport @relation(fields: [leakReportId], references: [id])
  url          String
  type         String
  createdAt    DateTime   @default(now())
}
```

- [ ] **Step 3: Prisma Client 생성**

Run: `npx prisma generate`
Expected: `Generated Prisma Client` 메시지 출력, 종료 코드 0

- [ ] **Step 4: 마이그레이션 실행**

Run: `npx prisma migrate dev --name init`
Expected: `prisma/migrations/` 디렉토리와 `dev.db` 파일 생성, `Your database is now in sync with your schema.` 출력

- [ ] **Step 5: 실패하는 테스트 작성**

`src/prisma/prisma.service.spec.ts`:

```ts
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates and retrieves a LeakReport with files', async () => {
    const created = await prisma.leakReport.create({
      data: {
        name: '테스트',
        phone: '010-0000-0000',
        address: '서울시 테스트구',
        location: '천장 누수',
        occurredAt: '오늘',
        damageScope: '거실 천장 일부',
        urgency: '보통',
        files: {
          create: [{ url: 'https://example.com/photo1.jpg', type: 'photo' }],
        },
      },
      include: { files: true },
    });

    expect(created.id).toBeDefined();
    expect(created.files).toHaveLength(1);

    const found = await prisma.leakReport.findUnique({
      where: { id: created.id },
      include: { files: true },
    });
    expect(found?.name).toBe('테스트');

    await prisma.leakReportFile.deleteMany({ where: { leakReportId: created.id } });
    await prisma.leakReport.delete({ where: { id: created.id } });
  });
});
```

- [ ] **Step 6: 테스트 실패 확인**

Run: `npm test -- prisma.service.spec.ts`
Expected: FAIL — `Cannot find module './prisma.service'`

- [ ] **Step 7: src/prisma/prisma.service.ts 작성**

```ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

- [ ] **Step 8: 테스트 통과 확인**

Run: `npm test -- prisma.service.spec.ts`
Expected: PASS — `PrismaService › creates and retrieves a LeakReport with files`

- [ ] **Step 9: src/prisma/prisma.module.ts 작성**

```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 10: app.module.ts에 PrismaModule 추가**

`src/app.module.ts` 수정:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 11: 커밋**

```bash
git add prisma/ src/prisma/ src/app.module.ts
git commit -m "feat: add Prisma schema and PrismaService"
```

---

### Task 3: StorageService (OCI Object Storage 업로드)

**Files:**
- Create: `src/storage/storage.service.ts`
- Create: `src/storage/storage.module.ts`
- Test: `src/storage/storage.service.spec.ts`

**Interfaces:**
- Consumes: `ConfigService`(`@nestjs/config`)의 `getOrThrow<string>(key)` — `OCI_S3_ENDPOINT`, `OCI_S3_REGION`, `OCI_S3_BUCKET`, `OCI_S3_ACCESS_KEY`, `OCI_S3_SECRET_KEY`
- Produces: `StorageService.uploadFile(key: string, body: Buffer, contentType: string): Promise<string>` — 업로드된 객체의 URL을 반환. `StorageModule`(`StorageService` export)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/storage/storage.service.spec.ts`:

```ts
import { StorageService } from './storage.service';

const sendMock = jest.fn().mockResolvedValue({});

jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({ send: sendMock })),
    PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  };
});

describe('StorageService', () => {
  const configService = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        OCI_S3_ENDPOINT: 'https://test.compat.objectstorage.oraclecloud.com',
        OCI_S3_BUCKET: 'leak-care-bucket',
        OCI_S3_REGION: 'ap-chuncheon-1',
        OCI_S3_ACCESS_KEY: 'test-access-key',
        OCI_S3_SECRET_KEY: 'test-secret-key',
      };
      return values[key];
    }),
  } as any;

  beforeEach(() => {
    sendMock.mockClear();
  });

  it('uploads a file and returns its URL', async () => {
    const service = new StorageService(configService);
    const url = await service.uploadFile(
      'leak-reports/test.jpg',
      Buffer.from('data'),
      'image/jpeg',
    );

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(url).toBe(
      'https://test.compat.objectstorage.oraclecloud.com/leak-care-bucket/leak-reports/test.jpg',
    );
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- storage.service.spec.ts`
Expected: FAIL — `Cannot find module './storage.service'`

- [ ] **Step 3: src/storage/storage.service.ts 작성**

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;

  constructor(private readonly config: ConfigService) {
    this.endpoint = this.config.getOrThrow<string>('OCI_S3_ENDPOINT');
    this.bucket = this.config.getOrThrow<string>('OCI_S3_BUCKET');
    this.client = new S3Client({
      region: this.config.getOrThrow<string>('OCI_S3_REGION'),
      endpoint: this.endpoint,
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('OCI_S3_ACCESS_KEY'),
        secretAccessKey: this.config.getOrThrow<string>('OCI_S3_SECRET_KEY'),
      },
      forcePathStyle: true,
    });
  }

  async uploadFile(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return `${this.endpoint}/${this.bucket}/${key}`;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- storage.service.spec.ts`
Expected: PASS — `StorageService › uploads a file and returns its URL`

- [ ] **Step 5: src/storage/storage.module.ts 작성**

```ts
import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';

@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
```

- [ ] **Step 6: 커밋**

```bash
git add src/storage/
git commit -m "feat: add StorageService for OCI Object Storage uploads"
```

---

### Task 4: NotificationService (Slack Webhook)

**Files:**
- Create: `src/notification/notification.service.ts`
- Create: `src/notification/notification.module.ts`
- Test: `src/notification/notification.service.spec.ts`

**Interfaces:**
- Consumes: `ConfigService.get<string>('SLACK_WEBHOOK_URL')`
- Produces: `NotificationService.sendLeakReportCreated(report: { id: number; name: string; address: string; urgency: string }): Promise<void>` — 실패해도 예외를 던지지 않음. `NotificationModule`(`NotificationService` export)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/notification/notification.service.spec.ts`:

```ts
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  const report = { id: 1, name: '홍길동', address: '서울시', urgency: '보통' };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts a message to the configured Slack webhook', async () => {
    const configService = {
      get: jest.fn().mockReturnValue('https://hooks.slack.com/services/test'),
    } as any;
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as any;

    const service = new NotificationService(configService);
    await service.sendLeakReportCreated(report);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.slack.com/services/test',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('does not throw when the webhook request fails', async () => {
    const configService = {
      get: jest.fn().mockReturnValue('https://hooks.slack.com/services/test'),
    } as any;
    global.fetch = jest.fn().mockRejectedValue(new Error('network error')) as any;

    const service = new NotificationService(configService);
    await expect(service.sendLeakReportCreated(report)).resolves.toBeUndefined();
  });

  it('skips sending when no webhook URL is configured', async () => {
    const configService = { get: jest.fn().mockReturnValue(undefined) } as any;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;

    const service = new NotificationService(configService);
    await service.sendLeakReportCreated(report);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- notification.service.spec.ts`
Expected: FAIL — `Cannot find module './notification.service'`

- [ ] **Step 3: src/notification/notification.service.ts 작성**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface LeakReportSummary {
  id: number;
  name: string;
  address: string;
  urgency: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly config: ConfigService) {}

  async sendLeakReportCreated(report: LeakReportSummary): Promise<void> {
    const webhookUrl = this.config.get<string>('SLACK_WEBHOOK_URL');
    if (!webhookUrl) {
      this.logger.warn('SLACK_WEBHOOK_URL not set, skipping notification');
      return;
    }

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `새 누수 접수 #${report.id}\n이름: ${report.name}\n주소: ${report.address}\n긴급도: ${report.urgency}`,
        }),
      });
    } catch (error) {
      this.logger.error(
        `Slack notification failed for report #${report.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- notification.service.spec.ts`
Expected: PASS — 3개 테스트 모두 통과

- [ ] **Step 5: src/notification/notification.module.ts 작성**

```ts
import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';

@Module({
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
```

- [ ] **Step 6: 커밋**

```bash
git add src/notification/
git commit -m "feat: add NotificationService for Slack webhook alerts"
```

---

### Task 5: CreateReportDto + 검증

**Files:**
- Create: `src/report/dto/leak-report.enums.ts`
- Create: `src/report/dto/create-report.dto.ts`
- Test: `src/report/dto/create-report.dto.spec.ts`

**Interfaces:**
- Produces: `enum LeakLocation`, `enum UrgencyLevel` (문자열 값), `class CreateReportDto { name, phone, address, location: LeakLocation, occurredAt, damageScope, urgency: UrgencyLevel }`

- [ ] **Step 1: enum 작성**

`src/report/dto/leak-report.enums.ts`:

```ts
export enum LeakLocation {
  CEILING = '천장 누수',
  BATHROOM = '욕실 누수',
  PIPE = '배관 누수',
  EXTERIOR_WALL = '외벽 누수',
  CONDENSATION = '결로 의심',
  OTHER = '기타',
}

export enum UrgencyLevel {
  LOW = '낮음',
  MEDIUM = '보통',
  HIGH = '긴급',
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`src/report/dto/create-report.dto.spec.ts`:

```ts
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateReportDto } from './create-report.dto';

describe('CreateReportDto', () => {
  const validPayload = {
    name: '홍길동',
    phone: '010-1234-5678',
    address: '서울시 강남구 테스트로 1',
    location: '천장 누수',
    occurredAt: '오늘 아침',
    damageScope: '거실 천장 일부 젖음',
    urgency: '보통',
  };

  it('passes validation with valid data', async () => {
    const dto = plainToInstance(CreateReportDto, validPayload);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails validation when name is missing', async () => {
    const dto = plainToInstance(CreateReportDto, { ...validPayload, name: '' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('fails validation with an invalid location value', async () => {
    const dto = plainToInstance(CreateReportDto, {
      ...validPayload,
      location: '알 수 없음',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'location')).toBe(true);
  });

  it('fails validation with an invalid urgency value', async () => {
    const dto = plainToInstance(CreateReportDto, {
      ...validPayload,
      urgency: '매우높음',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'urgency')).toBe(true);
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm test -- create-report.dto.spec.ts`
Expected: FAIL — `Cannot find module './create-report.dto'`

- [ ] **Step 4: src/report/dto/create-report.dto.ts 작성**

```ts
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { LeakLocation, UrgencyLevel } from './leak-report.enums';

export class CreateReportDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsEnum(LeakLocation)
  location: LeakLocation;

  @IsString()
  @IsNotEmpty()
  occurredAt: string;

  @IsString()
  @IsNotEmpty()
  damageScope: string;

  @IsEnum(UrgencyLevel)
  urgency: UrgencyLevel;
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test -- create-report.dto.spec.ts`
Expected: PASS — 4개 테스트 모두 통과

- [ ] **Step 6: 커밋**

```bash
git add src/report/dto/
git commit -m "feat: add CreateReportDto with validation"
```

---

### Task 6: ReportService (오케스트레이션)

**Files:**
- Create: `src/report/report.service.ts`
- Test: `src/report/report.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService.leakReport.create({ data, include })`, `PrismaService.leakReport.findUnique({ where, include })`, `StorageService.uploadFile(key, body, contentType)`, `NotificationService.sendLeakReportCreated(summary)`, `CreateReportDto`
- Produces: `interface ReportFiles { photos: Express.Multer.File[]; video?: Express.Multer.File }`, `ReportService.create(dto: CreateReportDto, files: ReportFiles): Promise<LeakReport & { files: LeakReportFile[] }>`, `ReportService.findOne(id: number)`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/report/report.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { ReportService } from './report.service';

describe('ReportService', () => {
  const dto = {
    name: '홍길동',
    phone: '010-1234-5678',
    address: '서울시 강남구 테스트로 1',
    location: '천장 누수',
    occurredAt: '오늘 아침',
    damageScope: '거실 천장 일부 젖음',
    urgency: '보통',
  } as any;

  const photo = {
    originalname: 'photo1.jpg',
    mimetype: 'image/jpeg',
    size: 1024,
    buffer: Buffer.from('data'),
  } as Express.Multer.File;

  function createService() {
    const prisma = {
      leakReport: {
        create: jest.fn().mockResolvedValue({ id: 1, ...dto, files: [] }),
      },
    } as any;
    const storage = {
      uploadFile: jest.fn().mockResolvedValue('https://example.com/photo1.jpg'),
    } as any;
    const notification = {
      sendLeakReportCreated: jest.fn().mockResolvedValue(undefined),
    } as any;
    const service = new ReportService(prisma, storage, notification);
    return { service, prisma, storage, notification };
  }

  it('uploads files, saves the report, and sends a notification', async () => {
    const { service, prisma, storage, notification } = createService();

    const result = await service.create(dto, { photos: [photo] });

    expect(storage.uploadFile).toHaveBeenCalledTimes(1);
    expect(prisma.leakReport.create).toHaveBeenCalledTimes(1);
    expect(notification.sendLeakReportCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
    );
    expect(result.id).toBe(1);
  });

  it('rejects a photo larger than 10MB without saving anything', async () => {
    const { service, prisma, storage } = createService();
    const oversizedPhoto = { ...photo, size: 11 * 1024 * 1024 };

    await expect(
      service.create(dto, { photos: [oversizedPhoto] }),
    ).rejects.toThrow(BadRequestException);

    expect(storage.uploadFile).not.toHaveBeenCalled();
    expect(prisma.leakReport.create).not.toHaveBeenCalled();
  });

  it('does not save the report when file upload fails', async () => {
    const { service, prisma, storage } = createService();
    storage.uploadFile.mockRejectedValue(new Error('upload failed'));

    await expect(service.create(dto, { photos: [photo] })).rejects.toThrow(
      'upload failed',
    );
    expect(prisma.leakReport.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- report.service.spec.ts`
Expected: FAIL — `Cannot find module './report.service'`

- [ ] **Step 3: src/report/report.service.ts 작성**

```ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationService } from '../notification/notification.service';
import { CreateReportDto } from './dto/create-report.dto';

export interface ReportFiles {
  photos: Express.Multer.File[];
  video?: Express.Multer.File;
}

const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = 200 * 1024 * 1024;

@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notification: NotificationService,
  ) {}

  async create(dto: CreateReportDto, files: ReportFiles) {
    for (const photo of files.photos) {
      if (photo.size > MAX_PHOTO_SIZE) {
        throw new BadRequestException(
          `사진 파일이 너무 큽니다: ${photo.originalname}`,
        );
      }
    }
    if (files.video && files.video.size > MAX_VIDEO_SIZE) {
      throw new BadRequestException(
        `동영상 파일이 너무 큽니다: ${files.video.originalname}`,
      );
    }

    const uploaded: { url: string; type: 'photo' | 'video' }[] = [];
    for (const photo of files.photos) {
      const key = `leak-reports/${randomUUID()}-${photo.originalname}`;
      const url = await this.storage.uploadFile(key, photo.buffer, photo.mimetype);
      uploaded.push({ url, type: 'photo' });
    }
    if (files.video) {
      const key = `leak-reports/${randomUUID()}-${files.video.originalname}`;
      const url = await this.storage.uploadFile(
        key,
        files.video.buffer,
        files.video.mimetype,
      );
      uploaded.push({ url, type: 'video' });
    }

    const report = await this.prisma.leakReport.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        address: dto.address,
        location: dto.location,
        occurredAt: dto.occurredAt,
        damageScope: dto.damageScope,
        urgency: dto.urgency,
        files: { create: uploaded },
      },
      include: { files: true },
    });

    await this.notification.sendLeakReportCreated({
      id: report.id,
      name: report.name,
      address: report.address,
      urgency: report.urgency,
    });

    return report;
  }

  findOne(id: number) {
    return this.prisma.leakReport.findUnique({
      where: { id },
      include: { files: true },
    });
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- report.service.spec.ts`
Expected: PASS — 3개 테스트 모두 통과

- [ ] **Step 5: 커밋**

```bash
git add src/report/report.service.ts src/report/report.service.spec.ts
git commit -m "feat: add ReportService orchestration"
```

---

### Task 7: ReportController + Views + 전체 플로우 연결

**Files:**
- Create: `views/report/form.hbs`
- Create: `views/report/complete.hbs`
- Create: `public/styles.css`
- Create: `src/report/report.controller.ts`
- Create: `src/report/report.module.ts`
- Modify: `src/app.module.ts`
- Test: `test/report.e2e-spec.ts`

**Interfaces:**
- Consumes: `ReportService.create`, `ReportService.findOne`, `LeakLocation`, `UrgencyLevel`
- Produces: `GET /report`, `POST /report`, `GET /report/:id/complete` 라우트

- [ ] **Step 1: 실패하는 e2e 테스트 작성**

`test/report.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { StorageService } from '../src/storage/storage.service';
import { NotificationService } from '../src/notification/notification.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Report (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let createdId: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue({
        uploadFile: jest.fn().mockResolvedValue('https://example.com/fake.jpg'),
      })
      .overrideProvider(NotificationService)
      .useValue({
        sendLeakReportCreated: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useStaticAssets(join(process.cwd(), 'public'));
    app.setBaseViewsDir(join(process.cwd(), 'views'));
    app.setViewEngine('hbs');
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (createdId) {
      await prisma.leakReportFile.deleteMany({ where: { leakReportId: createdId } });
      await prisma.leakReport.delete({ where: { id: createdId } });
    }
    await app.close();
  });

  it('POST /report creates a report and redirects to complete page', async () => {
    const res = await request(app.getHttpServer())
      .post('/report')
      .field('name', '홍길동')
      .field('phone', '010-1234-5678')
      .field('address', '서울시 강남구 테스트로 1')
      .field('location', '천장 누수')
      .field('occurredAt', '오늘 아침')
      .field('damageScope', '거실 천장 일부 젖음')
      .field('urgency', '보통')
      .attach('photos', Buffer.from('fake-image'), 'photo1.jpg');

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/report\/\d+\/complete/);

    createdId = Number(res.headers.location.split('/')[2]);
    const saved = await prisma.leakReport.findUnique({ where: { id: createdId } });
    expect(saved?.name).toBe('홍길동');

    const completeRes = await request(app.getHttpServer()).get(res.headers.location);
    expect(completeRes.status).toBe(200);
    expect(completeRes.text).toContain(String(createdId));
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test:e2e -- report.e2e-spec.ts`
Expected: FAIL — `POST /report` returns 404 (라우트 없음)

- [ ] **Step 3: views/report/form.hbs 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>누수 접수 - LeakCare</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <h1>누수 접수</h1>
  {{#if error}}
    <p class="error">{{error}}</p>
  {{/if}}
  <form action="/report" method="post" enctype="multipart/form-data">
    <fieldset>
      <legend>기본 정보</legend>
      <label>이름 <input type="text" name="name" required /></label>
      <label>연락처 <input type="text" name="phone" required /></label>
      <label>주소 <input type="text" name="address" required /></label>
    </fieldset>
    <fieldset>
      <legend>누수 정보</legend>
      <label>발생 장소
        <select name="location" required>
          {{#each locations}}
            <option value="{{this}}">{{this}}</option>
          {{/each}}
        </select>
      </label>
      <label>발생 시점 <input type="text" name="occurredAt" required /></label>
      <label>피해 범위 <input type="text" name="damageScope" required /></label>
      <label>긴급도
        <select name="urgency" required>
          {{#each urgencies}}
            <option value="{{this}}">{{this}}</option>
          {{/each}}
        </select>
      </label>
    </fieldset>
    <fieldset>
      <legend>파일 첨부</legend>
      <label>사진 (최대 20장)
        <input type="file" name="photos" accept="image/jpeg,image/png,image/heic" multiple />
      </label>
      <label>동영상
        <input type="file" name="video" accept="video/mp4,video/quicktime" />
      </label>
    </fieldset>
    <button type="submit">접수 완료</button>
  </form>
</body>
</html>
```

- [ ] **Step 4: views/report/complete.hbs 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>접수 완료 - LeakCare</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <h1>접수가 완료되었습니다</h1>
  <p>접수번호: {{report.id}}</p>
  <p>이름: {{report.name}}</p>
  <p>주소: {{report.address}}</p>
  <p>긴급도: {{report.urgency}}</p>
  <p>상태: {{report.status}}</p>
</body>
</html>
```

- [ ] **Step 5: public/styles.css 작성**

```css
body {
  font-family: system-ui, sans-serif;
  max-width: 600px;
  margin: 40px auto;
  padding: 0 16px;
  color: #1a1a1a;
}

fieldset {
  margin-bottom: 16px;
}

label {
  display: block;
  margin-bottom: 8px;
}

.error {
  color: #c0392b;
}
```

- [ ] **Step 6: src/report/report.controller.ts 작성**

```ts
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Render,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Response } from 'express';
import { ReportService } from './report.service';
import { CreateReportDto } from './dto/create-report.dto';
import { LeakLocation, UrgencyLevel } from './dto/leak-report.enums';

function formViewModel(error?: string) {
  return {
    locations: Object.values(LeakLocation),
    urgencies: Object.values(UrgencyLevel),
    error,
  };
}

@Controller('report')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get()
  @Render('report/form')
  showForm() {
    return formViewModel();
  }

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'photos', maxCount: 20 },
        { name: 'video', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: 200 * 1024 * 1024 },
      },
    ),
  )
  async submit(
    @Body() body: Record<string, string>,
    @UploadedFiles()
    files: { photos?: Express.Multer.File[]; video?: Express.Multer.File[] },
    @Res() res: Response,
  ) {
    const dto = plainToInstance(CreateReportDto, body);
    const errors = await validate(dto);
    if (errors.length > 0) {
      return res.render(
        'report/form',
        formViewModel('입력값을 다시 확인해주세요.'),
      );
    }

    try {
      const report = await this.reportService.create(dto, {
        photos: files.photos ?? [],
        video: files.video?.[0],
      });
      return res.redirect(`/report/${report.id}/complete`);
    } catch (error) {
      return res.render(
        'report/form',
        formViewModel(
          error instanceof Error ? error.message : '접수 중 오류가 발생했습니다.',
        ),
      );
    }
  }

  @Get(':id/complete')
  @Render('report/complete')
  async showComplete(@Param('id', ParseIntPipe) id: number) {
    const report = await this.reportService.findOne(id);
    if (!report) {
      throw new NotFoundException('접수 정보를 찾을 수 없습니다.');
    }
    return { report };
  }
}
```

- [ ] **Step 7: src/report/report.module.ts 작성**

```ts
import { Module } from '@nestjs/common';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { StorageModule } from '../storage/storage.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [StorageModule, NotificationModule],
  controllers: [ReportController],
  providers: [ReportService],
})
export class ReportModule {}
```

- [ ] **Step 8: app.module.ts에 ReportModule 추가**

`src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ReportModule } from './report/report.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ReportModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 9: e2e 테스트 통과 확인**

Run: `npm run test:e2e -- report.e2e-spec.ts`
Expected: PASS — `Report (e2e) › POST /report creates a report and redirects to complete page`

- [ ] **Step 10: 전체 테스트 스위트 확인**

Run: `npm test && npm run test:e2e`
Expected: 모든 단위/e2e 테스트 PASS

- [ ] **Step 11: 커밋**

```bash
git add views/ public/ src/report/report.controller.ts src/report/report.module.ts src/app.module.ts test/report.e2e-spec.ts
git commit -m "feat: add leak report intake form, views, and end-to-end flow"
```

---

## 수동 확인 (배포 전)

자동 테스트는 모두 OCI/Slack을 모킹한다. 실제 서비스 배포 전 아래를 수동으로 확인한다:

1. `.env`에 실제 `OCI_S3_*` 값과 `SLACK_WEBHOOK_URL`을 채운다.
2. `npm run start:dev`로 서버 실행 후 브라우저에서 `http://localhost:3000/report` 접속.
3. 폼 제출 → 실제 OCI Object Storage 버킷에 파일이 업로드되는지 확인.
4. Slack 채널에 접수 알림 메시지가 도착하는지 확인.
5. 접수 완료 페이지에 접수번호가 정상적으로 표시되는지 확인.
