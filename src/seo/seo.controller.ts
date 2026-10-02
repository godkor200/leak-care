import { Controller, Get, Header } from '@nestjs/common';
import { loadSiteInfo } from '../site-info';
import { buildRobotsTxt, buildSitemapXml } from './seo-documents';

// 주소가 SITE_URL에서 나오도록 정적 파일이 아닌 라우트로 제공한다
@Controller()
export class SeoController {
  @Get('robots.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  robots() {
    return buildRobotsTxt(loadSiteInfo().url);
  }

  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  sitemap() {
    const site = loadSiteInfo();
    return buildSitemapXml(site.url, site.sitemapLastmod);
  }
}
