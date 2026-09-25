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
    // 사업자 정보는 configureViews에서 읽으므로 그 전에 미설정 상태를 보장한다
    delete process.env.BUSINESS_REG_NO;
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

  it('GET /privacy renders the privacy policy', async () => {
    const res = await request(app.getHttpServer()).get('/privacy');

    expect(res.status).toBe(200);
    expect(res.text).toContain('개인정보 처리방침');
    expect(res.text).toContain('국외 이전');
    expect(res.text).toContain('href="#overseas"');
    expect(res.text).toContain('시행일: 공고일');
  });

  it('shows a privacy policy link in the footer and hides unset business details', async () => {
    const res = await request(app.getHttpServer()).get('/');

    expect(res.text).toMatch(/<footer[\s\S]*href="\/privacy"[\s\S]*<\/footer>/);
    expect(res.text).not.toContain('사업자등록번호');
  });
});

describe('Business info (e2e)', () => {
  let app: NestExpressApplication;
  const keys = ['BUSINESS_NAME', 'BUSINESS_REG_NO', 'PRIVACY_POLICY_EFFECTIVE_DATE'];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    process.env.BUSINESS_NAME = '테스트상호';
    process.env.BUSINESS_REG_NO = '000-00-00000';
    process.env.PRIVACY_POLICY_EFFECTIVE_DATE = '2026-10-01';
    configureViews(app);
    await app.init();
  });

  afterAll(async () => {
    keys.forEach((key) => delete process.env[key]);
    await app.close();
  });

  it('renders configured business details in the footer and the policy', async () => {
    const home = await request(app.getHttpServer()).get('/');
    expect(home.text).toContain('사업자등록번호');
    expect(home.text).toContain('000-00-00000');

    const privacy = await request(app.getHttpServer()).get('/privacy');
    expect(privacy.text).toContain('테스트상호');
    expect(privacy.text).toContain('시행일: 2026-10-01');
  });
});
