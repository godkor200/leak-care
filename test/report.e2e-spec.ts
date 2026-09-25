import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { StorageService } from '../src/storage/storage.service';
import { NotificationService } from '../src/notification/notification.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureViews } from '../src/view-setup';

describe('Report (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let createdId: number;
  let storageServiceMock: any;

  beforeAll(async () => {
    storageServiceMock = {
      uploadFile: jest.fn().mockResolvedValue('https://example.com/fake.jpg'),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue(storageServiceMock)
      .overrideProvider(NotificationService)
      .useValue({
        notifyReportCreated: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureViews(app);
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
      // 일반 폼에 없는 description은 검증 대상이 아니므로 저장되면 안 된다
      .field('description', '끼워넣은 상황 설명')
      .attach('photos', Buffer.from('fake-image'), 'photo1.jpg');

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/report\/\d+\/complete/);

    createdId = Number(res.headers.location.split('/')[2]);
    const saved = await prisma.leakReport.findUnique({ where: { id: createdId } });
    expect(saved?.name).toBe('홍길동');
    expect(saved?.description).toBeNull();

    const completeRes = await request(app.getHttpServer()).get(res.headers.location);
    expect(completeRes.status).toBe(200);
    expect(completeRes.text).toContain(String(createdId));
    expect(completeRes.text).toContain('천장 누수');
    expect(completeRes.text).toContain('담당자가 곧 연락드리겠습니다.');
    expect(completeRes.text).not.toContain('홍길동');
    expect(completeRes.text).not.toContain('서울시 강남구 테스트로 1');
    expect(completeRes.text).not.toContain('010-1234-5678');
  });

  it('POST /report with more than 20 photos returns 400 with a Korean error message', async () => {
    let req = request(app.getHttpServer())
      .post('/report')
      .field('name', '홍길동')
      .field('phone', '010-1234-5678')
      .field('address', '서울시 강남구 테스트로 1')
      .field('location', '천장 누수')
      .field('occurredAt', '오늘 아침')
      .field('damageScope', '거실 천장 일부 젖음')
      .field('urgency', '보통');

    for (let i = 0; i < 21; i++) {
      req = req.attach('photos', Buffer.from('fake-image'), `photo${i}.jpg`);
    }

    const res = await req;

    expect(res.status).toBe(400);
    expect(res.text).toContain('첨부 파일 개수를 확인해주세요');
  });

  it('POST /report rejects an unsupported file type before upload and keeps the input', async () => {
    storageServiceMock.uploadFile.mockClear();

    const res = await request(app.getHttpServer())
      .post('/report')
      .field('name', '형식거부테스트')
      .field('phone', '010-1234-5678')
      .field('address', '서울시 강남구 테스트로 1')
      .field('location', '천장 누수')
      .field('occurredAt', '오늘 아침')
      .field('damageScope', '거실 천장 일부 젖음')
      .field('urgency', '보통')
      .attach('photos', Buffer.from('%PDF-1.4'), {
        filename: 'document.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(400);
    expect(res.text).toContain('지원하지 않는 사진/동영상 형식입니다');
    expect(res.text).toContain('첨부 파일은 다시 선택해주세요.');
    expect(res.text).not.toContain('첨부 파일 개수를 확인해주세요');
    expect(res.text).toContain('value="형식거부테스트"');
    expect(res.text).toMatch(/<option value="보통" selected>/);
    expect(storageServiceMock.uploadFile).not.toHaveBeenCalled();
  });

  it('POST /report with invalid fields returns 400, lists the fields, and keeps the input', async () => {
    const res = await request(app.getHttpServer())
      .post('/report')
      .field('name', '   ')
      .field('phone', 'abc')
      .field('address', '서울시 강남구 테스트로 1')
      .field('location', '욕실 누수')
      .field('occurredAt', '오늘 아침')
      .field('damageScope', '거실 천장 일부 젖음')
      .field('urgency', '보통');

    expect(res.status).toBe(400);
    expect(res.text).toContain('이름');
    expect(res.text).toMatch(/입력값을 다시 확인해주세요[^<]*이름, 연락처/);
    expect(res.text).not.toContain('첨부 파일은 다시 선택해주세요.');
    expect(res.text).toContain('value="서울시 강남구 테스트로 1"');
    expect(res.text).toMatch(/<option value="욕실 누수" selected>/);
  });

  it('POST /report without multipart body shows a validation error instead of crashing', async () => {
    const res = await request(app.getHttpServer())
      .post('/report')
      .type('form')
      .send({ name: '홍길동' });

    expect(res.status).toBe(400);
    expect(res.text).toContain('입력값을 다시 확인해주세요');
  });

  it('POST /report with StorageService error shows safe message, no internal details', async () => {
    storageServiceMock.uploadFile.mockRejectedValueOnce(new Error('AccessDenied: internal S3 detail'));

    const res = await request(app.getHttpServer())
      .post('/report')
      .field('name', '업로드실패테스트')
      .field('phone', '010-1234-5678')
      .field('address', '서울시 강남구 테스트로 1')
      .field('location', '천장 누수')
      .field('occurredAt', '오늘 아침')
      .field('damageScope', '거실 천장 일부 젖음')
      .field('urgency', '보통')
      .attach('photos', Buffer.from('fake-image'), 'photo1.jpg');

    expect(res.status).toBe(500);
    expect(res.text).toContain('잠시 후 다시 시도해주세요');
    expect(res.text).not.toContain('AccessDenied');

    const count = await prisma.leakReport.count({
      where: { name: '업로드실패테스트' },
    });
    expect(count).toBe(0);
  });

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
});
