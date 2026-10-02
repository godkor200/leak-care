// 검색엔진용 사이트 정보. canonical, og:url, sitemap, robots.txt의 절대 URL이 모두 url에서 나온다.
export interface SiteInfo {
  // 끝에 슬래시가 없는 대표 주소 (예: https://nusu-emergency.co.kr)
  url: string;
  naverVerification?: string;
  googleVerification?: string;
  // sitemap.xml의 lastmod. 실제 수정일을 알 때만 넣도록 환경변수로만 받는다
  sitemapLastmod?: string;
}

export const DEFAULT_SITE_URL = 'https://nusu-emergency.co.kr';

// W3C Datetime: YYYY-MM-DD 또는 시각·시간대까지 붙은 형태
const W3C_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/;

function read(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

export function loadSiteInfo(env: NodeJS.ProcessEnv = process.env): SiteInfo {
  const url = read(env, 'SITE_URL')?.replace(/\/+$/, '');
  const lastmod = read(env, 'SITEMAP_LASTMOD');
  return {
    url: url || DEFAULT_SITE_URL,
    naverVerification: read(env, 'NAVER_SITE_VERIFICATION'),
    googleVerification: read(env, 'GOOGLE_SITE_VERIFICATION'),
    sitemapLastmod: lastmod && W3C_DATE.test(lastmod) ? lastmod : undefined,
  };
}
