import { FIELD_LABELS, pickFormValues } from './report-form.view-model';

describe('report form view model', () => {
  const addressFields = {
    addressDetail: '406동 2004호',
    postalCode: '42700',
    roadAddress: '대구 달서구 월배로 100',
    jibunAddress: '대구 달서구 상인동 1-1',
    sido: '대구',
    sigungu: '달서구',
  };

  it('keeps the address search fields so they survive a re-render', () => {
    expect(pickFormValues({ address: '대구 달서구 월배로 100', ...addressFields })).toEqual({
      address: '대구 달서구 월배로 100',
      ...addressFields,
    });
  });

  it('has Korean labels for the address search fields', () => {
    expect(FIELD_LABELS).toMatchObject({
      addressDetail: '상세주소',
      postalCode: '우편번호',
      roadAddress: '도로명주소',
      jibunAddress: '지번주소',
      sido: '시·도',
      sigungu: '시·군·구',
    });
  });
});
