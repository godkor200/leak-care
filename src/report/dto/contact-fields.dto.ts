import { Transform } from 'class-transformer';
import {
  Equals,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export const Trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

// 선택 입력: 앞뒤 공백을 지우고, 비어 있으면(select의 "선택 안 함" 포함) 입력하지 않은 것으로 본다
export const OptionalText = () =>
  Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  });

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

  // 기본 주소. 주소 검색으로 채우거나 직접 입력한다 (검색이 안 돼도 접수가 막히지 않게)
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  address: string;

  @OptionalText()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  addressDetail?: string;

  // 아래는 주소 검색(카카오 우편번호)이 채우는 숨은 필드. 직접 입력했다면 비어 있다.
  @OptionalText()
  @IsOptional()
  @IsString()
  @Matches(/^\d{5}$/)
  postalCode?: string;

  @OptionalText()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  roadAddress?: string;

  @OptionalText()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  jibunAddress?: string;

  @OptionalText()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  sido?: string;

  @OptionalText()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  sigungu?: string;

  // 체크박스는 체크했을 때만 값이 전송되므로 'agree'가 아니면 모두 미동의로 본다
  @Equals('agree')
  privacyConsent: string;
}
