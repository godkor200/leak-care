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
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Response } from 'express';
import { ReportService } from './report.service';
import { CreateReportDto } from './dto/create-report.dto';
import {
  FIELD_LABELS,
  formViewModel,
  pickFormValues,
  REATTACH_FILES_NOTE,
} from './report-form.view-model';
import { UploadErrorFilter } from './upload-error.filter';
import { isAllowedType, UnsupportedFileTypeException } from './file-types';

type UploadedReportFiles =
  | { photos?: Express.Multer.File[]; video?: Express.Multer.File[] }
  | undefined;

@Controller('report')
export class ReportController {
  private readonly logger = new Logger(ReportController.name);

  constructor(private readonly reportService: ReportService) {}

  @Get()
  @Render('report/form')
  showForm() {
    return formViewModel();
  }

  @Post()
  @UseFilters(UploadErrorFilter)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'photos', maxCount: 20 },
        { name: 'video', maxCount: 1 },
      ],
      {
        // storage 미지정 시 multer 기본값인 메모리 저장소를 사용한다
        limits: {
          fileSize: 200 * 1024 * 1024,
          files: 21,
          fields: 20,
          parts: 45,
          fieldSize: 10 * 1024,
        },
        // 허용되지 않은 형식은 메모리에 버퍼링하기 전에 거부한다
        fileFilter: (_req, file, callback) => {
          const kind = file.fieldname === 'video' ? 'video' : 'photo';
          if (isAllowedType(file, kind)) {
            callback(null, true);
          } else {
            callback(new UnsupportedFileTypeException(), false);
          }
        },
      },
    ),
  )
  async submit(
    @Body() body: Record<string, string>,
    @UploadedFiles() files: UploadedReportFiles,
    @Res() res: Response,
  ) {
    const values = pickFormValues(body);
    const photos = files?.photos ?? [];
    const video = files?.video?.[0];
    const withFilesNote = (message: string) =>
      photos.length > 0 || video ? `${message} ${REATTACH_FILES_NOTE}` : message;

    const dto = plainToInstance(CreateReportDto, values);
    const errors = await validate(dto);
    if (errors.length > 0) {
      const labels = errors.map(
        (e) => FIELD_LABELS[e.property as keyof typeof FIELD_LABELS] ?? e.property,
      );
      return res.status(400).render(
        'report/form',
        formViewModel(
          withFilesNote(`입력값을 다시 확인해주세요: ${labels.join(', ')}`),
          values,
        ),
      );
    }

    try {
      const report = await this.reportService.create(dto, { photos, video });
      return res.redirect(`/report/${report.id}/complete`);
    } catch (error) {
      if (error instanceof BadRequestException) {
        return res
          .status(400)
          .render('report/form', formViewModel(withFilesNote(error.message), values));
      }
      this.logger.error(
        'Leak report submission failed',
        error instanceof Error ? error.stack : String(error),
      );
      return res.status(500).render(
        'report/form',
        formViewModel(
          withFilesNote('접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'),
          values,
        ),
      );
    }
  }

  @Get(':id/complete')
  @Render('report/complete')
  async showComplete(@Param('id', ParseIntPipe) id: number) {
    const report = await this.reportService.findOne(id);
    if (!report) {
      throw new NotFoundException('접수 정보를 찾을 수 없습니다.');
    }
    // 접수번호가 순차적이라 누구나 조회할 수 있으므로 개인정보(이름·연락처·주소)는 넘기지 않는다
    return {
      report: {
        id: report.id,
        location: report.location,
        urgency: report.urgency,
        status: report.status,
      },
    };
  }
}
