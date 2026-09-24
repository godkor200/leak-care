import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { LeakLocation, UrgencyLevel } from './leak-report.enums';

const Trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class CreateReportDto {
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

  @IsEnum(UrgencyLevel)
  urgency: UrgencyLevel;
}
