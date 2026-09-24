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
