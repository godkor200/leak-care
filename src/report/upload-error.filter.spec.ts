import {
  ArgumentsHost,
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { UnsupportedFileTypeException } from './file-types';
import { UploadErrorFilter } from './upload-error.filter';

describe('UploadErrorFilter', () => {
  function createHost(body: Record<string, unknown> = {}) {
    const response = {
      status: jest.fn().mockReturnThis(),
      render: jest.fn(),
    };
    const request = { body };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;
    return { host, response };
  }

  function multerError(code: string, message: string) {
    return Object.assign(new Error(message), { name: 'MulterError', code });
  }

  function renderedError(response: { render: jest.Mock }) {
    const [view, model] = response.render.mock.calls[0];
    expect(view).toBe('report/form');
    return model.error as string;
  }

  it('renders the size message with 413 when a file is too large', () => {
    const { host, response } = createHost();

    new UploadErrorFilter().catch(
      new PayloadTooLargeException('File too large'),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(413);
    expect(renderedError(response)).toContain('200MB');
    expect(renderedError(response)).toContain('첨부 파일은 다시 선택해주세요.');
  });

  it('renders the unsupported type message from the file filter', () => {
    const { host, response } = createHost();

    new UploadErrorFilter().catch(new UnsupportedFileTypeException(), host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(renderedError(response)).toContain(
      '지원하지 않는 사진/동영상 형식입니다',
    );
    expect(renderedError(response)).not.toContain('최대 20장');
  });

  it.each([
    ['Nest-mapped file count limit', new BadRequestException('Too many files')],
    ['Nest-mapped unexpected field', new BadRequestException('Unexpected field')],
    ['raw multer 2.x unexpected file', multerError('LIMIT_UNEXPECTED_FILE', 'Unexpected file field')],
    ['raw multer file count limit', multerError('LIMIT_FILE_COUNT', 'Too many files')],
  ])('renders the count message with 400 for %s', (_label, error) => {
    const { host, response } = createHost();

    new UploadErrorFilter().catch(error, host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(renderedError(response)).toContain('최대 20장');
  });

  it('renders a generic message for any other error', () => {
    const { host, response } = createHost();

    new UploadErrorFilter().catch(
      new BadRequestException('Multipart: Malformed part header'),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(renderedError(response)).toBe(
      '요청을 처리할 수 없습니다. 다시 시도해주세요.',
    );
  });

  it('keeps the text fields that were already submitted', () => {
    const { host, response } = createHost({ name: '홍길동', urgency: '긴급' });

    new UploadErrorFilter().catch(
      new PayloadTooLargeException('File too large'),
      host,
    );

    const [, model] = response.render.mock.calls[0];
    expect(model.values.name).toBe('홍길동');
    expect(model.urgencies).toContainEqual({ value: '긴급', selected: true });
  });
});
