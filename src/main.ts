import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureViews } from './view-setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureViews(app);

  // 모바일 회선에서 200MB 동영상 업로드가 끝날 때까지 요청을 끊지 않는다
  const server = app.getHttpServer();
  server.requestTimeout = 15 * 60 * 1000;
  // 헤더 수신 제한은 keep-alive(기본 5초)보다 길고 requestTimeout보다 짧게 둔다
  server.headersTimeout = 65 * 1000;

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
