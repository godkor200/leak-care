import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ContactFieldsDto } from './contact-fields.dto';

describe('ContactFieldsDto address fields', () => {
  const minimalPayload = {
    name: '홍길동',
    phone: '010-1234-5678',
    address: '대구 달서구 테스트로 1',
    privacyConsent: 'agree',
  };

  const pickerPayload = {
    ...minimalPayload,
    address: '대구 달서구 월배로 100 (상인동, 테스트아파트)',
    addressDetail: '406동 2004호',
    postalCode: '42700',
    roadAddress: '대구 달서구 월배로 100',
    jibunAddress: '대구 달서구 상인동 1-1',
    sido: '대구',
    sigungu: '달서구',
  };

  async function errorsFor(payload: Record<string, unknown>) {
    const dto = plainToInstance(ContactFieldsDto, payload);
    return { dto, properties: (await validate(dto)).map((e) => e.property) };
  }

  it('passes with only the manually typed base address', async () => {
    const { dto, properties } = await errorsFor(minimalPayload);
    expect(properties).toEqual([]);
    expect(dto.addressDetail).toBeUndefined();
    expect(dto.postalCode).toBeUndefined();
  });

  it('passes with all picker fields filled', async () => {
    const { dto, properties } = await errorsFor(pickerPayload);
    expect(properties).toEqual([]);
    expect(dto).toMatchObject({ postalCode: '42700', sido: '대구', sigungu: '달서구' });
  });

  it('trims the detail address and treats blank picker fields as not provided', async () => {
    const { dto, properties } = await errorsFor({
      ...minimalPayload,
      addressDetail: '  406동 2004호  ',
      postalCode: '',
      roadAddress: ' ',
      jibunAddress: '',
      sido: '',
      sigungu: '',
    });
    expect(properties).toEqual([]);
    expect(dto.addressDetail).toBe('406동 2004호');
    expect(dto.postalCode).toBeUndefined();
    expect(dto.roadAddress).toBeUndefined();
    expect(dto.sido).toBeUndefined();
  });

  it('treats a whitespace-only detail address as not provided', async () => {
    const { dto, properties } = await errorsFor({ ...minimalPayload, addressDetail: '   ' });
    expect(properties).toEqual([]);
    expect(dto.addressDetail).toBeUndefined();
  });

  it.each(['1234', '123456', 'abcde', '42-70'])('rejects postal code %p', async (postalCode) => {
    const { properties } = await errorsFor({ ...pickerPayload, postalCode });
    expect(properties).toEqual(['postalCode']);
  });

  it('rejects a detail address longer than 100 characters', async () => {
    const { properties } = await errorsFor({ ...pickerPayload, addressDetail: '가'.repeat(101) });
    expect(properties).toEqual(['addressDetail']);
  });

  it('rejects road and jibun addresses longer than 200 characters', async () => {
    const { properties } = await errorsFor({
      ...pickerPayload,
      roadAddress: '가'.repeat(201),
      jibunAddress: '가'.repeat(201),
    });
    expect(properties).toEqual(['roadAddress', 'jibunAddress']);
  });

  it('rejects sido and sigungu longer than 20 characters', async () => {
    const { properties } = await errorsFor({
      ...pickerPayload,
      sido: '가'.repeat(21),
      sigungu: '가'.repeat(21),
    });
    expect(properties).toEqual(['sido', 'sigungu']);
  });

  it('still requires the base address even when picker fields are present', async () => {
    const { properties } = await errorsFor({ ...pickerPayload, address: '  ' });
    expect(properties).toEqual(['address']);
  });
});
