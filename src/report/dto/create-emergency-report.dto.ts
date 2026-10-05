import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ContactFieldsDto, OptionalText } from './contact-fields.dto';
import { LeakLocation } from './leak-report.enums';

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
