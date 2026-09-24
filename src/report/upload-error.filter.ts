import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Response } from 'express';
import { formViewModel } from './report-form.view-model';

const FILE_TOO_LARGE_MESSAGE =
  '파일 용량이 너무 큽니다. 사진은 장당 10MB, 동영상은 200MB까지 올릴 수 있습니다.';
const TOO_MANY_FILES_MESSAGE =
  '첨부 파일 개수를 확인해주세요. 사진은 최대 20장, 동영상은 1개까지 올릴 수 있습니다.';

@Catch(HttpException)
export class UploadErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const message =
      exception instanceof PayloadTooLargeException
        ? FILE_TOO_LARGE_MESSAGE
        : TOO_MANY_FILES_MESSAGE;

    response.status(400).render('report/form', formViewModel(message));
  }
}
