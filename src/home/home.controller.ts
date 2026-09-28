import { Controller, Get, Render } from '@nestjs/common';
import { loadBusinessInfo } from '../business-info';
import { buildLocalBusinessJsonLd, serializeJsonLd } from '../seo/seo-documents';
import { loadSiteInfo } from '../site-info';

@Controller()
export class HomeController {
  @Get()
  @Render('home')
  show() {
    // 검색 결과의 업체 정보용 구조화 데이터 (사용자 입력 없이 설정값으로만 만든다)
    const structuredData = buildLocalBusinessJsonLd(loadSiteInfo(), loadBusinessInfo());
    return { structuredData: serializeJsonLd(structuredData) };
  }

  @Get('privacy')
  @Render('privacy')
  showPrivacy() {
    return {};
  }
}
