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
