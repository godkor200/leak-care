import { DEFAULT_SITE_URL, loadSiteInfo } from './site-info';

describe('loadSiteInfo', () => {
  it('falls back to the production URL when SITE_URL is not set', () => {
    expect(DEFAULT_SITE_URL).toBe('https://nusu-emergency.co.kr');
    expect(loadSiteInfo({})).toEqual({
      url: 'https://nusu-emergency.co.kr',
      naverVerification: undefined,
      googleVerification: undefined,
      sitemapLastmod: undefined,
    });
  });

  it('trims values and strips trailing slashes from SITE_URL', () => {
    const site = loadSiteInfo({
      SITE_URL: '  https://example.com//  ',
      NAVER_SITE_VERIFICATION: ' naver-token ',
      GOOGLE_SITE_VERIFICATION: ' google-token ',
      SITEMAP_LASTMOD: ' 2026-10-01 ',
    });

    expect(site).toEqual({
      url: 'https://example.com',
      naverVerification: 'naver-token',
      googleVerification: 'google-token',
      sitemapLastmod: '2026-10-01',
    });
  });

  it('treats empty and whitespace-only values as not set', () => {
    const site = loadSiteInfo({
      SITE_URL: '   ',
      NAVER_SITE_VERIFICATION: '',
      GOOGLE_SITE_VERIFICATION: '  ',
      SITEMAP_LASTMOD: '',
    });

    expect(site.url).toBe('https://nusu-emergency.co.kr');
    expect(site.naverVerification).toBeUndefined();
    expect(site.googleVerification).toBeUndefined();
    expect(site.sitemapLastmod).toBeUndefined();
  });

  it('ignores a SITEMAP_LASTMOD that is not a W3C date', () => {
    expect(loadSiteInfo({ SITEMAP_LASTMOD: '10/01/2026' }).sitemapLastmod).toBeUndefined();
    expect(loadSiteInfo({ SITEMAP_LASTMOD: '2026-10-01T09:00:00+09:00' }).sitemapLastmod).toBe(
      '2026-10-01T09:00:00+09:00',
    );
  });
});
