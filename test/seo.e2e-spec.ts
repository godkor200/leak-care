import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { NotificationService } from '../src/notification/notification.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/storage/storage.service';
import { configureViews } from '../src/view-setup';

const SITE_KEYS = ['SITE_URL', 'NAVER_SITE_VERIFICATION', 'GOOGLE_SITE_VERIFICATION', 'SITEMAP_LASTMOD'];
const SITE_URL = 'https://nusu-emergency.co.kr';

async function createApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(StorageService)
    .useValue({ uploadFile: jest.fn() })
    .overrideProvider(NotificationService)
    .useValue({ notifyReportCreated: jest.fn() })
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureViews(app);
  await app.init();
  return app;
}

function headOf(html: string): string {
  return html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
}

function metaContent(html: string, attr: 'name' | 'property', key: string): string | undefined {
  const pattern = new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`);
  return html.match(pattern)?.[1];
}

describe('SEO (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let reportId: number | undefined;

  beforeAll(async () => {
    // 로컬 .env 값과 무관하게 기본 설정(검증 토큰 없음)으로 확인한다
    SITE_KEYS.forEach((key) => delete process.env[key]);
    app = await createApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (reportId) {
      await prisma.leakReport.delete({ where: { id: reportId } });
    }
    await app.close();
  });

  it('GET /robots.txt allows crawling, blocks complete pages, and links the sitemap', async () => {
    const res = await request(app.getHttpServer()).get('/robots.txt');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(res.text).toContain('User-agent: *');
    expect(res.text).toContain('Disallow: /report/*/complete');
    expect(res.text).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  });

  it('GET /sitemap.xml lists the four indexable pages', async () => {
    const res = await request(app.getHttpServer()).get('/sitemap.xml');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/xml; charset=utf-8');
    expect(res.text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(res.text).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    const locs = [...res.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([
      `${SITE_URL}/`,
      `${SITE_URL}/emergency`,
      `${SITE_URL}/report`,
      `${SITE_URL}/privacy`,
    ]);
    expect(res.text).not.toContain('<lastmod>');
  });

  it('home has its own title, description, canonical, Open Graph, and icons', async () => {
    const res = await request(app.getHttpServer()).get('/');
    const head = headOf(res.text);

    expect(head).toContain('<title>누수응급센터 | 24시간 누수탐지 · 긴급출동 1644-2667</title>');
    expect(metaContent(head, 'name', 'description')).toContain('물이 새는 순간');
    expect(head).toContain(`<link rel="canonical" href="${SITE_URL}/" />`);
    expect(metaContent(head, 'property', 'og:type')).toBe('website');
    expect(metaContent(head, 'property', 'og:site_name')).toBe('누수응급센터');
    expect(metaContent(head, 'property', 'og:locale')).toBe('ko_KR');
    expect(metaContent(head, 'property', 'og:url')).toBe(`${SITE_URL}/`);
    expect(metaContent(head, 'property', 'og:image')).toBe(`${SITE_URL}/images/og.png`);
    expect(metaContent(head, 'property', 'og:image:width')).toBe('1200');
    expect(metaContent(head, 'property', 'og:image:height')).toBe('630');
    expect(metaContent(head, 'property', 'og:image:alt')).toBeTruthy();
    expect(metaContent(head, 'name', 'twitter:card')).toBe('summary_large_image');
    expect(metaContent(head, 'name', 'theme-color')).toBe('#ec3013');
    expect(head).toContain('<link rel="icon" href="/images/logo.svg" type="image/svg+xml" />');
    expect(head).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    expect(head).not.toContain('name="robots"');
    expect(res.text).toContain('<html lang="ko">');
  });

  it('home embeds parseable LocalBusiness JSON-LD', async () => {
    const res = await request(app.getHttpServer()).get('/');
    const json = res.text.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    )?.[1];

    expect(json).toBeDefined();
    const data = JSON.parse(json as string);
    expect(data['@type']).toBe('HomeAndConstructionBusiness');
    expect(data.url).toBe(SITE_URL);
    expect(data.telephone).toBe('+82-1644-2667');
  });

  it.each([
    ['/emergency', '긴급 출동 요청 | 누수응급센터', '사진 1장과 연락처'],
    ['/report', '누수 점검 접수 | 누수응급센터', '온라인으로 접수'],
    ['/privacy', '개인정보 처리방침 | 누수응급센터', '개인정보'],
  ])('%s has its own title, description, and canonical', async (path, title, description) => {
    const res = await request(app.getHttpServer()).get(path);
    const head = headOf(res.text);

    expect(head).toContain(`<title>${title}</title>`);
    expect(metaContent(head, 'name', 'description')).toContain(description);
    expect(head).toContain(`<link rel="canonical" href="${SITE_URL}${path}" />`);
    expect(metaContent(head, 'property', 'og:url')).toBe(`${SITE_URL}${path}`);
    expect(metaContent(head, 'property', 'og:title')).toBe(title);
    expect(head).not.toContain('name="robots"');
    expect(res.text).not.toContain('application/ld+json');
  });

  it('the complete page is noindex and has no canonical', async () => {
    const report = await prisma.leakReport.create({
      data: { name: 'SEO테스트', phone: '010-0000-0000', address: '테스트', urgency: '보통' },
    });
    reportId = report.id;

    const res = await request(app.getHttpServer()).get(`/report/${report.id}/complete`);
    const head = headOf(res.text);

    expect(res.status).toBe(200);
    expect(head).toContain('<meta name="robots" content="noindex" />');
    expect(head).not.toContain('rel="canonical"');
    expect(head).not.toContain('og:url');
  });

  it.each(['/report', '/emergency'])(
    'an error re-render of %s is noindex and has no canonical',
    async (path) => {
      const res = await request(app.getHttpServer()).post(path).field('name', '');
      const head = headOf(res.text);

      expect(res.status).toBe(400);
      expect(head).toContain('<meta name="robots" content="noindex" />');
      expect(head).not.toContain('rel="canonical"');
    },
  );

  it('omits verification metas when the tokens are not set', async () => {
    const res = await request(app.getHttpServer()).get('/');

    expect(res.text).not.toContain('naver-site-verification');
    expect(res.text).not.toContain('google-site-verification');
  });
});

describe('SEO with configured site (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    process.env.SITE_URL = 'https://example.com/';
    process.env.NAVER_SITE_VERIFICATION = 'naver-token-123';
    process.env.GOOGLE_SITE_VERIFICATION = 'google-token-456';
    process.env.SITEMAP_LASTMOD = '2026-10-01';
    app = await createApp();
  });

  afterAll(async () => {
    SITE_KEYS.forEach((key) => delete process.env[key]);
    await app.close();
  });

  it('renders verification metas and uses SITE_URL for absolute URLs', async () => {
    const res = await request(app.getHttpServer()).get('/');
    const head = headOf(res.text);

    expect(metaContent(head, 'name', 'naver-site-verification')).toBe('naver-token-123');
    expect(metaContent(head, 'name', 'google-site-verification')).toBe('google-token-456');
    expect(head).toContain('<link rel="canonical" href="https://example.com/" />');
    expect(metaContent(head, 'property', 'og:image')).toBe('https://example.com/images/og.png');
  });

  it('uses SITE_URL and SITEMAP_LASTMOD in robots.txt and sitemap.xml', async () => {
    const robots = await request(app.getHttpServer()).get('/robots.txt');
    expect(robots.text).toContain('Sitemap: https://example.com/sitemap.xml');

    const sitemap = await request(app.getHttpServer()).get('/sitemap.xml');
    expect(sitemap.text).toContain('<loc>https://example.com/emergency</loc>');
    expect(sitemap.text.match(/<lastmod>2026-10-01<\/lastmod>/g)).toHaveLength(4);
  });
});
