import { BusinessInfo } from '../business-info';
import { SiteInfo } from '../site-info';

// 검색 결과에 노출할 페이지. 접수 완료 페이지는 개인 접수 건이라 제외한다
export const INDEXABLE_PATHS = ['/', '/emergency', '/report', '/privacy'] as const;

export const OG_IMAGE_PATH = '/images/og.png';
export const LOGO_PATH = '/images/logo.svg';

const SERVICES = [
  '누수탐지',
  '열화상 카메라 진단',
  '배관내시경 검사',
  '누수공사 및 보수',
  '아파트 · 주택 · 상가 누수',
  '보험처리 지원',
];

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch]);
}

export function buildRobotsTxt(siteUrl: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /report/*/complete',
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`,
    '',
  ].join('\n');
}

export function buildSitemapXml(siteUrl: string, lastmod?: string): string {
  const urls = INDEXABLE_PATHS.map((path) => {
    const lines = [`    <loc>${escapeXml(siteUrl + path)}</loc>`];
    if (lastmod) {
      lines.push(`    <lastmod>${escapeXml(lastmod)}</lastmod>`);
    }
    return ['  <url>', ...lines, '  </url>'].join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

// 주소 전체(동·호수)는 구조화 데이터에 넣지 않고 시·도와 시·군·구만 쓴다
function postalAddress(address?: string) {
  const [region, locality] = address?.split(/\s+/) ?? [];
  return {
    '@type': 'PostalAddress',
    addressCountry: 'KR',
    ...(region ? { addressRegion: region } : {}),
    ...(locality ? { addressLocality: locality } : {}),
  };
}

export function buildLocalBusinessJsonLd(site: SiteInfo, business: BusinessInfo) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HomeAndConstructionBusiness',
    name: '누수응급센터',
    alternateName: 'LEAK EMERGENCY CENTER',
    url: site.url,
    logo: site.url + LOGO_PATH,
    image: site.url + OG_IMAGE_PATH,
    telephone: '+82-1644-2667',
    slogan: '물이 새는 순간, 빠른 대응이 피해를 줄입니다',
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        opens: '00:00',
        closes: '23:59',
      },
    ],
    address: postalAddress(business.address),
    knowsAbout: SERVICES,
  };
}

// <script type="application/ld+json"> 안에 그대로 넣을 수 있도록 <를 이스케이프한다
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
