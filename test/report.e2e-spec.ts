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
    expect(res.text).toContain('최대 20장');
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

    expect(res.status).toBe(200);
    expect(res.text).toContain('잠시 후 다시 시도해주세요');
    expect(res.text).not.toContain('AccessDenied');

    const count = await prisma.leakReport.count({
      where: { name: '업로드실패테스트' },
    });
    expect(count).toBe(0);
  });
});
