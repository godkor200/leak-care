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
import { memoryStorage } from 'multer';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Response } from 'express';
import { ReportService } from './report.service';
import { CreateReportDto } from './dto/create-report.dto';
import { formViewModel } from './report-form.view-model';
import { UploadErrorFilter } from './upload-error.filter';

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
        storage: memoryStorage(),
        limits: { fileSize: 200 * 1024 * 1024 },
      },
    ),
  )
  async submit(
    @Body() body: Record<string, string>,
    @UploadedFiles()
    files: { photos?: Express.Multer.File[]; video?: Express.Multer.File[] },
    @Res() res: Response,
  ) {
    const dto = plainToInstance(CreateReportDto, body);
    const errors = await validate(dto);
    if (errors.length > 0) {
      return res.status(200).render(
        'report/form',
        formViewModel('입력값을 다시 확인해주세요.'),
      );
    }

    try {
      const report = await this.reportService.create(dto, {
        photos: files.photos ?? [],
        video: files.video?.[0],
      });
      return res.redirect(`/report/${report.id}/complete`);
    } catch (error) {
      if (error instanceof BadRequestException) {
        const response = error.getResponse();
        const message = typeof response === 'string'
          ? response
          : (response as any).message || '요청이 올바르지 않습니다.';
        return res.status(200).render(
          'report/form',
          formViewModel(message),
        );
      }
      this.logger.error(
        'Leak report submission failed',
        error instanceof Error ? error.stack : String(error),
      );
      return res.status(200).render(
        'report/form',
        formViewModel('접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'),
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
    return { report };
  }
}
