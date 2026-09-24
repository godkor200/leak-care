import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { LeakLocation, UrgencyLevel } from './leak-report.enums';

export class CreateReportDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsEnum(LeakLocation)
  location: LeakLocation;

  @IsString()
  @IsNotEmpty()
  occurredAt: string;

  @IsString()
  @IsNotEmpty()
  damageScope: string;

  @IsEnum(UrgencyLevel)
  urgency: UrgencyLevel;
}
