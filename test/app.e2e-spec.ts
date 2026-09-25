import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureViews } from '../src/view-setup';

describe('AppController (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureViews(app);
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

  it('GET / renders the home page with links to both forms and the phone number', async () => {
    const res = await request(app.getHttpServer()).get('/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('누수응급센터');
    expect(res.text).toContain('href="/emergency"');
    expect(res.text).toContain('href="/report"');
    expect(res.text).toContain('href="tel:16442667"');
  });

  it('serves the logo and stylesheet as static assets', async () => {
    await request(app.getHttpServer()).get('/images/logo.svg').expect(200);
    await request(app.getHttpServer()).get('/styles.css').expect(200);
  });
});
