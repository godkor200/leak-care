import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as request from 'supertest';
import { GUIDE_ARTICLES } from '../src/guide/guide-content';
import { AppModule } from '../src/app.module';
import { NotificationService } from '../src/notification/notification.service';
import { StorageService } from '../src/storage/storage.service';
import { configureViews } from '../src/view-setup';

function jsonLd(html: string): Array<Record<string, any>> {
  return [...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map((m) =>
    JSON.parse(m[1]),
  );
}

describe('Guide (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StorageService)
      .useValue({ uploadFile: jest.fn() })
      .overrideProvider(NotificationService)
      .useValue({ notifyReportCreated: jest.fn() })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureViews(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /guide lists every article with a link', async () => {
    const res = await request(app.getHttpServer()).get('/guide');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<link rel="canonical" href="https://nusu-emergency.co.kr/guide"');
    for (const article of GUIDE_ARTICLES) {
      expect(res.text).toContain(`href="/guide/${article.slug}"`);
    }
  });

  it.each(GUIDE_ARTICLES.map((a) => [a.slug, a]))('GET /guide/%s renders SEO tags and structured data', async (_slug, article) => {
    const res = await request(app.getHttpServer()).get(`/guide/${article.slug}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain(`<title>${article.title}</title>`);
    expect(res.text).toContain(`href="https://nusu-emergency.co.kr/guide/${article.slug}"`);
    expect(res.text).toContain('href="/emergency"');
    const [articleLd, faqLd] = jsonLd(res.text);
    expect(articleLd['@type']).toBe('Article');
    expect(faqLd['@type']).toBe('FAQPage');
    expect(faqLd.mainEntity).toHaveLength(article.faq.length);
  });

  it('GET /guide/unknown returns 404', async () => {
    const res = await request(app.getHttpServer()).get('/guide/not-a-guide');

    expect(res.status).toBe(404);
  });

  it('home shows the FAQ, guide links, and FAQPage data', async () => {
    const res = await request(app.getHttpServer()).get('/');

    expect(res.text).toContain('자주 묻는 질문');
    expect(res.text).toContain('href="/guide"');
    expect(jsonLd(res.text).map((d) => d['@type'])).toContain('FAQPage');
  });
});
