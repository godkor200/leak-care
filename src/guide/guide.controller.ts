import { Controller, Get, NotFoundException, Param, Render } from '@nestjs/common';
import { buildArticleJsonLd, buildFaqJsonLd, serializeJsonLd } from '../seo/seo-documents';
import { loadSiteInfo } from '../site-info';
import { GUIDE_ARTICLES, findGuide, guidePath } from './guide-content';

@Controller('guide')
export class GuideController {
  @Get()
  @Render('guide/index')
  list() {
    return {
      guides: GUIDE_ARTICLES.map((a) => ({ title: a.title, summary: a.summary, path: guidePath(a.slug) })),
    };
  }

  @Get(':slug')
  @Render('guide/article')
  show(@Param('slug') slug: string) {
    const article = findGuide(slug);
    if (!article) {
      throw new NotFoundException();
    }
    const site = loadSiteInfo();
    return {
      article,
      path: guidePath(article.slug),
      structuredData: serializeJsonLd(buildArticleJsonLd(site, article)),
      faqData: serializeJsonLd(buildFaqJsonLd(article.faq)),
      related: GUIDE_ARTICLES.filter((a) => a.slug !== article.slug).map((a) => ({
        title: a.title,
        path: guidePath(a.slug),
      })),
    };
  }
}
