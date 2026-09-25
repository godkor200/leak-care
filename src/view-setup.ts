import { NestExpressApplication } from '@nestjs/platform-express';
import { readdirSync, readFileSync } from 'fs';
import * as hbs from 'hbs';
import { basename, extname, join } from 'path';
import { loadBusinessInfo } from './business-info';

// hbs.registerPartials는 비동기라 첫 렌더와 경합하므로 부팅 시점에 동기로 등록한다
function registerPartials(dir: string) {
  for (const file of readdirSync(dir)) {
    if (extname(file) !== '.hbs') {
      continue;
    }
    hbs.registerPartial(basename(file, '.hbs'), readFileSync(join(dir, file), 'utf8'));
  }
}

export function configureViews(app: NestExpressApplication) {
  const viewsDir = join(process.cwd(), 'views');
  app.useStaticAssets(join(process.cwd(), 'public'));
  app.setBaseViewsDir(viewsDir);
  app.setViewEngine('hbs');
  registerPartials(join(viewsDir, 'partials'));
  // 모든 템플릿(푸터, 개인정보 처리방침)이 business.*를 읽는다. ConfigModule이 이미 .env를 process.env에 올려 둔 뒤다.
  app.setLocal('business', loadBusinessInfo());
}
