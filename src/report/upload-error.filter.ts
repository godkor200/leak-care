import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { UnsupportedFileTypeException } from './file-types';
import {
  FormValues,
  pickFormValues,
  REATTACH_FILES_NOTE,
} from './report-form.view-model';

const FILE_TOO_LARGE_MESSAGE =
  '파일 용량이 너무 큽니다. 사진은 장당 10MB, 동영상은 200MB까지 올릴 수 있습니다.';
const TOO_MANY_FILES_MESSAGE =
  '첨부 파일 개수를 확인해주세요. 사진은 최대 20장, 동영상은 1개까지 올릴 수 있습니다.';
const GENERIC_MESSAGE = '요청을 처리할 수 없습니다. 다시 시도해주세요.';

// Nest가 BadRequestException으로 바꿔주는 메시지와, multer 2.x가 그대로 던지는 MulterError 코드 모두 처리
const COUNT_ERROR_CODES = ['LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE'];
const COUNT_ERROR_MESSAGES = ['Unexpected field', 'Unexpected file field'];

export type UploadFormViewModel = (error: string, values: FormValues) => object;

interface MulterLikeError extends Error {
  code?: string;
}

function isMulterError(exception: unknown): exception is MulterLikeError {
  return exception instanceof Error && exception.name === 'MulterError';
}

function isCountError(exception: unknown): boolean {
  if (isMulterError(exception) && exception.code) {
    return COUNT_ERROR_CODES.includes(exception.code);
  }
  if (exception instanceof HttpException) {
    return (
      COUNT_ERROR_MESSAGES.includes(exception.message) ||
      exception.message.startsWith('Too many')
    );
  }
  return false;
}

// 폼 제출의 업로드(multer) 단계에서 난 오류를 해당 폼 화면으로 다시 보여준다.
// 생성자 인자가 있으므로 @UseFilters(new UploadErrorFilter(...))처럼 인스턴스로 넘긴다.
@Catch()
export class UploadErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(UploadErrorFilter.name);

  constructor(
    private readonly view: string,
    private readonly viewModel: UploadFormViewModel,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number = HttpStatus.BAD_REQUEST;
    let message: string;
    if (
      exception instanceof PayloadTooLargeException ||
      (isMulterError(exception) && exception.code === 'LIMIT_FILE_SIZE')
    ) {
      status = HttpStatus.PAYLOAD_TOO_LARGE;
      message = `${FILE_TOO_LARGE_MESSAGE} ${REATTACH_FILES_NOTE}`;
    } else if (exception instanceof UnsupportedFileTypeException) {
      message = `${exception.message} ${REATTACH_FILES_NOTE}`;
    } else if (isCountError(exception)) {
      message = `${TOO_MANY_FILES_MESSAGE} ${REATTACH_FILES_NOTE}`;
    } else {
      message = GENERIC_MESSAGE;
      if (exception instanceof HttpException) {
        status = exception.getStatus();
      } else if (!isMulterError(exception)) {
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        this.logger.error(
          'Unexpected error while handling report upload',
          exception instanceof Error ? exception.stack : String(exception),
        );
      }
    }

    response
      .status(status)
      .render(this.view, this.viewModel(message, pickFormValues(request.body)));
  }
}
