import { Controller, Get, Render } from '@nestjs/common';
import { loadBusinessInfo } from '../business-info';
import { GUIDE_ARTICLES, HOME_FAQ, guidePath } from '../guide/guide-content';
import { buildFaqJsonLd, buildLocalBusinessJsonLd, serializeJsonLd } from '../seo/seo-documents';
import { loadSiteInfo } from '../site-info';

@Controller()
export class HomeController {
  @Get()
  @Render('home')
  show() {
    // 검색 결과의 업체 정보용 구조화 데이터 (사용자 입력 없이 설정값으로만 만든다)
    const structuredData = buildLocalBusinessJsonLd(loadSiteInfo(), loadBusinessInfo());
    return {
      structuredData: serializeJsonLd(structuredData),
      faqData: serializeJsonLd(buildFaqJsonLd(HOME_FAQ)),
      faqs: HOME_FAQ,
      guides: GUIDE_ARTICLES.map((a) => ({ title: a.title, summary: a.summary, path: guidePath(a.slug) })),
    };
  }

  @Get('privacy')
  @Render('privacy')
  showPrivacy() {
    return {};
  }
}
