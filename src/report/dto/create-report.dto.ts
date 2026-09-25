import { IsEnum, IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ContactFieldsDto, Trim } from './contact-fields.dto';
import {
  GENERAL_URGENCY_LEVELS,
  LeakLocation,
  UrgencyLevel,
} from './leak-report.enums';

export class CreateReportDto extends ContactFieldsDto {
  @IsEnum(LeakLocation)
  location: LeakLocation;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  occurredAt: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  damageScope: string;

  @IsIn(GENERAL_URGENCY_LEVELS)
  urgency: UrgencyLevel;
}
