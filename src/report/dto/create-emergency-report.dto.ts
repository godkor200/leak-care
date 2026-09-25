import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ContactFieldsDto } from './contact-fields.dto';
import { LeakLocation } from './leak-report.enums';

// 선택 입력: 앞뒤 공백을 지우고, 비어 있으면(select의 "선택 안 함" 포함) 입력하지 않은 것으로 본다
const OptionalText = () =>
  Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  });

export class CreateEmergencyReportDto extends ContactFieldsDto {
  @OptionalText()
  @IsOptional()
  @IsEnum(LeakLocation)
  location?: LeakLocation;

  @OptionalText()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}
