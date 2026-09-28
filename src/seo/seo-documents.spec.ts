import { loadBusinessInfo } from '../business-info';
import { loadSiteInfo } from '../site-info';
import {
  buildLocalBusinessJsonLd,
  buildRobotsTxt,
  buildSitemapXml,
  INDEXABLE_PATHS,
  serializeJsonLd,
} from './seo-documents';

describe('buildRobotsTxt', () => {
  it('allows crawling, blocks complete pages, and points to the sitemap', () => {
    expect(buildRobotsTxt('https://nusu-emergency.co.kr')).toBe(
      [
        'User-agent: *',
        'Allow: /',
        'Disallow: /report/*/complete',
        '',
        'Sitemap: https://nusu-emergency.co.kr/sitemap.xml',
        '',
      ].join('\n'),
    );
  });
});

describe('buildSitemapXml', () => {
  it('lists every indexable page as an absolute URL without lastmod by default', () => {
    const xml = buildSitemapXml('https://nusu-emergency.co.kr');

    expect(INDEXABLE_PATHS).toEqual(['/', '/emergency', '/report', '/privacy']);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([
      'https://nusu-emergency.co.kr/',
      'https://nusu-emergency.co.kr/emergency',
      'https://nusu-emergency.co.kr/report',
      'https://nusu-emergency.co.kr/privacy',
    ]);
    expect(xml).not.toContain('<lastmod>');
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
  });

  it('adds lastmod to every entry when given', () => {
    const xml = buildSitemapXml('https://nusu-emergency.co.kr', '2026-10-01');

    expect(xml.match(/<lastmod>2026-10-01<\/lastmod>/g)).toHaveLength(4);
  });

  it('escapes XML special characters in URLs', () => {
    const xml = buildSitemapXml('https://example.com/a&b<c>');

    expect(xml).toContain('<loc>https://example.com/a&amp;b&lt;c&gt;/</loc>');
    expect(xml).not.toContain('a&b');
  });
});

describe('buildLocalBusinessJsonLd', () => {
  const site = loadSiteInfo({});

  it('describes the business as a 24/7 home and construction business', () => {
    const data = buildLocalBusinessJsonLd(site, loadBusinessInfo({}));

    expect(data).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'HomeAndConstructionBusiness',
      name: '누수응급센터',
      alternateName: 'LEAK EMERGENCY CENTER',
      url: 'https://nusu-emergency.co.kr',
      logo: 'https://nusu-emergency.co.kr/images/logo.svg',
      image: 'https://nusu-emergency.co.kr/images/og.png',
      telephone: '+82-1644-2667',
      slogan: '물이 새는 순간, 빠른 대응이 피해를 줄입니다',
      openingHoursSpecification: [
        {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: [
            'Monday',
            'Tuesday',
            'Wednesday',
            'Thursday',
            'Friday',
            'Saturday',
            'Sunday',
          ],
          opens: '00:00',
          closes: '23:59',
        },
      ],
      address: { '@type': 'PostalAddress', addressCountry: 'KR' },
    });
    expect(data.knowsAbout).toHaveLength(6);
    expect(data.knowsAbout).toContain('누수탐지');
    expect(data.knowsAbout).toContain('보험처리 지원');
  });

  it('uses only the region and locality from BUSINESS_ADDRESS', () => {
    const data = buildLocalBusinessJsonLd(
      site,
      loadBusinessInfo({ BUSINESS_ADDRESS: '대구광역시 달서구 테스트로 12, 3층 301호' }),
    );

    expect(data.address).toEqual({
      '@type': 'PostalAddress',
      addressCountry: 'KR',
      addressRegion: '대구광역시',
      addressLocality: '달서구',
    });
    expect(JSON.stringify(data)).not.toContain('301호');
  });
});

describe('serializeJsonLd', () => {
  it('escapes < so the JSON cannot close the script tag', () => {
    const json = serializeJsonLd({ name: '</script><script>alert(1)</script>' });

    expect(json).not.toContain('<');
    expect(json).toContain('\\u003c/script>');
    expect(JSON.parse(json)).toEqual({ name: '</script><script>alert(1)</script>' });
  });
});
