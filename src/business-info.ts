// 푸터와 개인정보 처리방침에 쓰는 사업자 정보. 모두 선택 값이며 설정된 것만 화면에 보여준다.
export interface BusinessInfo {
  name?: string;
  // 회사명이 필요한 문구에 쓰는 이름 (상호가 없으면 브랜드명)
  displayName: string;
  owner?: string;
  regNo?: string;
  address?: string;
  email?: string;
  privacyOfficerName?: string;
  privacyOfficerContact?: string;
  policyEffectiveDate?: string;
  // 푸터의 사업자 정보 줄에 보여줄 값이 하나라도 있는지
  hasFooterDetails: boolean;
}

const BRAND_NAME = '누수응급센터';

function read(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

export function loadBusinessInfo(env: NodeJS.ProcessEnv = process.env): BusinessInfo {
  const name = read(env, 'BUSINESS_NAME');
  const owner = read(env, 'BUSINESS_OWNER');
  const regNo = read(env, 'BUSINESS_REG_NO');
  const address = read(env, 'BUSINESS_ADDRESS');
  const email = read(env, 'BUSINESS_EMAIL');
  return {
    name,
    displayName: name ?? BRAND_NAME,
    owner,
    regNo,
    address,
    email,
    privacyOfficerName: read(env, 'PRIVACY_OFFICER_NAME'),
    privacyOfficerContact: read(env, 'PRIVACY_OFFICER_CONTACT'),
    policyEffectiveDate: read(env, 'PRIVACY_POLICY_EFFECTIVE_DATE'),
    hasFooterDetails: Boolean(name || owner || regNo || address || email),
  };
}
