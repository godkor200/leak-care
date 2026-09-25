import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateReportDto } from './create-report.dto';

describe('CreateReportDto', () => {
  const validPayload = {
    name: '홍길동',
    phone: '010-1234-5678',
    address: '서울시 강남구 테스트로 1',
    location: '천장 누수',
    occurredAt: '오늘 아침',
    damageScope: '거실 천장 일부 젖음',
    urgency: '보통',
    privacyConsent: 'agree',
  };

  it('passes validation with valid data', async () => {
    const dto = plainToInstance(CreateReportDto, validPayload);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails validation when name is missing', async () => {
    const dto = plainToInstance(CreateReportDto, { ...validPayload, name: '' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('fails validation with an invalid location value', async () => {
    const dto = plainToInstance(CreateReportDto, {
      ...validPayload,
      location: '알 수 없음',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'location')).toBe(true);
  });

  it('trims surrounding whitespace from text fields', async () => {
    const dto = plainToInstance(CreateReportDto, {
      ...validPayload,
      name: '  홍길동  ',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.name).toBe('홍길동');
  });

  it('fails validation when name is whitespace only', async () => {
    const dto = plainToInstance(CreateReportDto, {
      ...validPayload,
      name: '   ',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('fails validation when address is longer than 200 characters', async () => {
    const dto = plainToInstance(CreateReportDto, {
      ...validPayload,
      address: '가'.repeat(201),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'address')).toBe(true);
  });

  it('fails validation with an invalid phone number', async () => {
    for (const phone of ['abc-defg-hijk', '010', '<script>alert(1)</script>']) {
      const dto = plainToInstance(CreateReportDto, { ...validPayload, phone });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'phone')).toBe(true);
    }
  });

  it('fails validation with an invalid urgency value', async () => {
    const dto = plainToInstance(CreateReportDto, {
      ...validPayload,
      urgency: '매우높음',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'urgency')).toBe(true);
  });

  it('rejects the 긴급 urgency, which is only allowed through the emergency form', async () => {
    const dto = plainToInstance(CreateReportDto, {
      ...validPayload,
      urgency: '긴급',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'urgency')).toBe(true);
  });

  it('fails validation when privacy consent is missing', async () => {
    const { privacyConsent, ...withoutConsent } = validPayload;
    const dto = plainToInstance(CreateReportDto, withoutConsent);
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toEqual(['privacyConsent']);
  });

  it('fails validation when privacy consent is anything other than "agree"', async () => {
    for (const privacyConsent of ['', 'on', 'true', 'disagree']) {
      const dto = plainToInstance(CreateReportDto, { ...validPayload, privacyConsent });
      const errors = await validate(dto);
      expect(errors.map((e) => e.property)).toEqual(['privacyConsent']);
    }
  });
});
