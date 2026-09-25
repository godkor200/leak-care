import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateEmergencyReportDto } from './create-emergency-report.dto';

describe('CreateEmergencyReportDto', () => {
  const minimalPayload = {
    name: '홍길동',
    phone: '010-1234-5678',
    address: '서울시 강남구 테스트로 1',
    privacyConsent: 'agree',
  };

  it('passes with only name, phone, address and privacy consent', async () => {
    const dto = plainToInstance(CreateEmergencyReportDto, minimalPayload);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('treats an empty location ("선택 안 함") as not provided', async () => {
    const dto = plainToInstance(CreateEmergencyReportDto, {
      ...minimalPayload,
      location: '',
      description: '   ',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.location).toBeUndefined();
    expect(dto.description).toBeUndefined();
  });

  it('accepts a valid location and trims the description', async () => {
    const dto = plainToInstance(CreateEmergencyReportDto, {
      ...minimalPayload,
      location: '천장 누수',
      description: '  천장에서 물이 떨어지고 있어요  ',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.description).toBe('천장에서 물이 떨어지고 있어요');
  });

  it('rejects an unknown location', async () => {
    const dto = plainToInstance(CreateEmergencyReportDto, {
      ...minimalPayload,
      location: '알 수 없음',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'location')).toBe(true);
  });

  it('rejects a description longer than 200 characters', async () => {
    const dto = plainToInstance(CreateEmergencyReportDto, {
      ...minimalPayload,
      description: '가'.repeat(201),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'description')).toBe(true);
  });

  it('applies the same contact validation as the general form', async () => {
    const dto = plainToInstance(CreateEmergencyReportDto, {
      ...minimalPayload,
      name: '   ',
      phone: 'abc',
    });
    const errors = await validate(dto);
    const properties = errors.map((e) => e.property);
    expect(properties).toEqual(expect.arrayContaining(['name', 'phone']));
  });

  it('fails validation when privacy consent is missing', async () => {
    const { privacyConsent, ...withoutConsent } = minimalPayload;
    const dto = plainToInstance(CreateEmergencyReportDto, withoutConsent);
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toEqual(['privacyConsent']);
  });

  it('fails validation when privacy consent is anything other than "agree"', async () => {
    for (const privacyConsent of ['', 'on', 'disagree']) {
      const dto = plainToInstance(CreateEmergencyReportDto, { ...minimalPayload, privacyConsent });
      const errors = await validate(dto);
      expect(errors.map((e) => e.property)).toEqual(['privacyConsent']);
    }
  });
});
