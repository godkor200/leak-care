import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Render,
  Res,
  UploadedFiles,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Response } from 'express';
import { NewLeakReport, ReportService } from './report.service';
import { CreateReportDto } from './dto/create-report.dto';
import { CreateEmergencyReportDto } from './dto/create-emergency-report.dto';
import { UrgencyLevel } from './dto/leak-report.enums';
import {
  emergencyFormViewModel,
  FIELD_LABELS,
  formViewModel,
  pickFormValues,
  REATTACH_FILES_NOTE,
} from './report-form.view-model';
import { UploadErrorFilter, UploadFormViewModel } from './upload-error.filter';
import { ReportUploadInterceptor, UploadedReportFiles } from './upload-options';

// 폼마다 다른 것(뷰, 뷰모델, 검증 DTO, 저장 입력으로의 변환)만 모아 두고 제출 처리는 공용으로 쓴다
interface ReportForm<T extends object> {
  view: string;
  viewModel: UploadFormViewModel;
  dtoClass: ClassConstructor<T>;
  toReport: (dto: T) => NewLeakReport;
  // 장난 접수를 막고 상담 전에 현장을 확인할 수 있도록 현장 사진을 1장 이상 요구한다
  requirePhoto?: boolean;
}

const GENERAL_FORM: ReportForm<CreateReportDto> = {
  view: 'report/form',
  viewModel: formViewModel,
  dtoClass: CreateReportDto,
  // DTO에 선언되지 않은 필드도 plainToInstance가 남기므로 검증한 필드만 골라 저장한다
  toReport: ({ name, phone, address, location, occurredAt, damageScope, urgency }) => ({
    name,
    phone,
    address,
    location,
    occurredAt,
    damageScope,
    urgency,
  }),
  requirePhoto: true,
};

const EMERGENCY_FORM: ReportForm<CreateEmergencyReportDto> = {
  view: 'report/emergency',
  viewModel: emergencyFormViewModel,
  dtoClass: CreateEmergencyReportDto,
  toReport: ({ name, phone, address, location, description }) => ({
    name,
    phone,
    address,
    location,
    description,
    urgency: UrgencyLevel.HIGH,
  }),
  requirePhoto: true,
};

const PHOTO_REQUIRED_MESSAGE = '현장 사진을 1장 이상 올려주세요.';

@Controller()
export class ReportController {
  private readonly logger = new Logger(ReportController.name);

  constructor(private readonly reportService: ReportService) {}

  @Get('report')
  @Render('report/form')
  showForm() {
    return formViewModel();
  }

  @Post('report')
  @UseFilters(new UploadErrorFilter(GENERAL_FORM.view, GENERAL_FORM.viewModel))
  @UseInterceptors(ReportUploadInterceptor())
  submit(
    @Body() body: Record<string, string>,
    @UploadedFiles() files: UploadedReportFiles,
    @Res() res: Response,
  ) {
    return this.submitForm(GENERAL_FORM, body, files, res);
  }

  @Get('emergency')
  @Render('report/emergency')
  showEmergencyForm() {
    return emergencyFormViewModel();
  }

  @Post('emergency')
  @UseFilters(new UploadErrorFilter(EMERGENCY_FORM.view, EMERGENCY_FORM.viewModel))
  @UseInterceptors(ReportUploadInterceptor())
  submitEmergency(
    @Body() body: Record<string, string>,
    @UploadedFiles() files: UploadedReportFiles,
    @Res() res: Response,
  ) {
    return this.submitForm(EMERGENCY_FORM, body, files, res);
  }

  @Get('report/:id/complete')
  @Render('report/complete')
  async showComplete(@Param('id', ParseIntPipe) id: number) {
    const report = await this.reportService.findOne(id);
    if (!report) {
      throw new NotFoundException('접수 정보를 찾을 수 없습니다.');
    }
    // 접수번호가 순차적이라 누구나 조회할 수 있으므로 개인정보(이름·연락처·주소)는 넘기지 않는다
    return {
      isEmergency: report.urgency === UrgencyLevel.HIGH,
      report: {
        id: report.id,
        location: report.location,
        urgency: report.urgency,
        status: report.status,
      },
    };
  }

  private async submitForm<T extends object>(
    form: ReportForm<T>,
    body: unknown,
    files: UploadedReportFiles,
    res: Response,
  ) {
    const values = pickFormValues(body);
    const photos = files?.photos ?? [];
    const video = files?.video?.[0];
    const renderError = (status: number, message: string) => {
      const withNote =
        photos.length > 0 || video ? `${message} ${REATTACH_FILES_NOTE}` : message;
      return res.status(status).render(form.view, form.viewModel(withNote, values));
    };

    const dto = plainToInstance(form.dtoClass, values);
    const errors = await validate(dto);
    if (errors.length > 0) {
      const labels = errors.map(
        (e) => FIELD_LABELS[e.property as keyof typeof FIELD_LABELS] ?? e.property,
      );
      return renderError(400, `입력값을 다시 확인해주세요: ${labels.join(', ')}`);
    }

    if (form.requirePhoto && photos.length === 0) {
      return renderError(400, PHOTO_REQUIRED_MESSAGE);
    }

    try {
      const report = await this.reportService.create(form.toReport(dto), { photos, video });
      return res.redirect(`/report/${report.id}/complete`);
    } catch (error) {
      if (error instanceof BadRequestException) {
        return renderError(400, error.message);
      }
      this.logger.error(
        'Leak report submission failed',
        error instanceof Error ? error.stack : String(error),
      );
      return renderError(500, '접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    }
  }
}
