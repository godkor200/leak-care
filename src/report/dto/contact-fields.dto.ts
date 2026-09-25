import { Transform } from 'class-transformer';
import { Equals, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export const Trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

// 일반 접수와 긴급 출동이 공통으로 받는 연락처 필드와 개인정보 수집·이용 동의
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

  // 체크박스는 체크했을 때만 값이 전송되므로 'agree'가 아니면 모두 미동의로 본다
  @Equals('agree')
  privacyConsent: string;
}
