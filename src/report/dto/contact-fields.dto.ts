import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export const Trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

// 일반 접수와 긴급 출동이 공통으로 받는 연락처 필드
export class ContactFieldsDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(/^[0-9+\-\s()]{8,20}$/)
  phone: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  address: string;
}
