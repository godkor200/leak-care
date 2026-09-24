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

  it('fails validation with an invalid urgency value', async () => {
    const dto = plainToInstance(CreateReportDto, {
      ...validPayload,
      urgency: '매우높음',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'urgency')).toBe(true);
  });
});
