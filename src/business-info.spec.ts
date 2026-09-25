import { loadBusinessInfo } from './business-info';

describe('loadBusinessInfo', () => {
  it('reads and trims every business value from the environment', () => {
    const info = loadBusinessInfo({
      BUSINESS_NAME: '  테스트상호  ',
      BUSINESS_OWNER: '홍길동',
      BUSINESS_REG_NO: '000-00-00000',
      BUSINESS_ADDRESS: '서울시 강남구 테스트로 1',
      BUSINESS_EMAIL: 'help@example.com',
      PRIVACY_OFFICER_NAME: '김담당',
      PRIVACY_OFFICER_CONTACT: 'privacy@example.com',
      PRIVACY_POLICY_EFFECTIVE_DATE: '2026-10-01',
    });

    expect(info).toEqual({
      name: '테스트상호',
      displayName: '테스트상호',
      owner: '홍길동',
      regNo: '000-00-00000',
      address: '서울시 강남구 테스트로 1',
      email: 'help@example.com',
      privacyOfficerName: '김담당',
      privacyOfficerContact: 'privacy@example.com',
      policyEffectiveDate: '2026-10-01',
      hasFooterDetails: true,
    });
  });

  it('treats missing, empty, and whitespace-only values as not set', () => {
    const info = loadBusinessInfo({ BUSINESS_NAME: '', BUSINESS_REG_NO: '   ' });

    expect(info.name).toBeUndefined();
    expect(info.regNo).toBeUndefined();
    expect(info.owner).toBeUndefined();
    expect(info.policyEffectiveDate).toBeUndefined();
    expect(info.hasFooterDetails).toBe(false);
  });

  it('falls back to the brand name when no business name is set', () => {
    expect(loadBusinessInfo({}).displayName).toBe('누수응급센터');
  });

  it('shows the footer detail line when any single detail is set', () => {
    expect(loadBusinessInfo({ BUSINESS_EMAIL: 'help@example.com' }).hasFooterDetails).toBe(true);
    expect(loadBusinessInfo({ PRIVACY_OFFICER_NAME: '김담당' }).hasFooterDetails).toBe(false);
  });
});
