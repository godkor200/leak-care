import { BadRequestException, Logger } from '@nestjs/common';
import { ReportService } from './report.service';

describe('ReportService', () => {
  const dto = {
    name: '홍길동',
    phone: '010-1234-5678',
    address: '서울시 강남구 테스트로 1',
    location: '천장 누수',
    occurredAt: '오늘 아침',
    damageScope: '거실 천장 일부 젖음',
    urgency: '보통',
  } as any;

  const photo = {
    originalname: 'photo1.jpg',
    mimetype: 'image/jpeg',
    size: 1024,
    buffer: Buffer.from('data'),
  } as Express.Multer.File;

  function createService() {
    const prisma = {
      leakReport: {
        create: jest.fn().mockResolvedValue({ id: 1, ...dto, files: [] }),
      },
    } as any;
    const storage = {
      uploadFile: jest.fn().mockResolvedValue('https://example.com/photo1.jpg'),
    } as any;
    const notification = {
      notifyReportCreated: jest.fn().mockResolvedValue(undefined),
    } as any;
    const service = new ReportService(prisma, storage, notification);
    return { service, prisma, storage, notification };
  }

  it('uploads files, saves the report, and sends a notification', async () => {
    const { service, prisma, storage, notification } = createService();

    const result = await service.create(dto, { photos: [photo] });

    expect(storage.uploadFile).toHaveBeenCalledTimes(1);
    expect(prisma.leakReport.create).toHaveBeenCalledTimes(1);
    expect(notification.notifyReportCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        isEmergency: false,
        hasVideo: false,
        phone: '010-1234-5678',
        photos: [
          { buffer: photo.buffer, extension: '.jpg', contentType: 'image/jpeg' },
        ],
      }),
    );
    expect(result.id).toBe(1);
  });

  it('rejects a photo larger than 10MB without saving anything', async () => {
    const { service, prisma, storage } = createService();
    const oversizedPhoto = { ...photo, size: 11 * 1024 * 1024 };

    await expect(
      service.create(dto, { photos: [oversizedPhoto] }),
    ).rejects.toThrow(BadRequestException);

    expect(storage.uploadFile).not.toHaveBeenCalled();
    expect(prisma.leakReport.create).not.toHaveBeenCalled();
  });

  it('accepts an iPhone HEIC photo even when the browser sends a generic MIME type', async () => {
    const { service, storage } = createService();
    const heicPhoto = {
      ...photo,
      originalname: 'IMG_0001.HEIC',
      mimetype: 'application/octet-stream',
    };

    await service.create(dto, { photos: [heicPhoto] });

    expect(storage.uploadFile).toHaveBeenCalledTimes(1);
  });

  it('accepts an Android mp4 video and an iPhone mov video', async () => {
    const androidVideo = {
      ...photo,
      originalname: 'VID_20260901_120000.mp4',
      mimetype: 'video/mp4',
    };
    const iphoneVideo = {
      ...photo,
      originalname: 'IMG_0002.MOV',
      mimetype: 'video/quicktime',
    };

    for (const video of [androidVideo, iphoneVideo]) {
      const { service, storage } = createService();
      await service.create(dto, { photos: [], video });
      expect(storage.uploadFile).toHaveBeenCalledTimes(1);
    }
  });

  it('rejects a file with an unsupported type without saving anything', async () => {
    const { service, prisma, storage } = createService();
    const pdf = {
      ...photo,
      originalname: 'document.pdf',
      mimetype: 'application/pdf',
    };

    await expect(service.create(dto, { photos: [pdf] })).rejects.toThrow(
      BadRequestException,
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
    expect(prisma.leakReport.create).not.toHaveBeenCalled();
  });

  it('builds the S3 key from a UUID and the allow-listed extension, not the original name', async () => {
    const { service, storage } = createService();
    const koreanPhoto = {
      ...photo,
      originalname: '누수 사진 #1.HEIC',
      mimetype: 'application/octet-stream',
    };

    await service.create(dto, { photos: [koreanPhoto] });

    const key = storage.uploadFile.mock.calls[0][0];
    expect(key).toMatch(/^leak-reports\/[0-9a-f-]{36}\.heic$/);
  });

  it('derives the extension from the MIME type when the name has no allowed extension', async () => {
    const { service, storage } = createService();
    const blobPhoto = { ...photo, originalname: 'blob', mimetype: 'image/jpeg' };

    await service.create(dto, { photos: [blobPhoto] });

    const [key, , contentType] = storage.uploadFile.mock.calls[0];
    expect(key).toMatch(/^leak-reports\/[0-9a-f-]{36}\.jpg$/);
    expect(contentType).toBe('image/jpeg');
  });

  it('sets the Content-Type from the extension, ignoring the client MIME type', async () => {
    const { service, storage } = createService();
    const disguised = { ...photo, originalname: 'x.heic', mimetype: 'text/html' };

    await service.create(dto, { photos: [disguised] });

    expect(storage.uploadFile.mock.calls[0][2]).toBe('image/heic');
  });

  it('sets the video Content-Type from the extension', async () => {
    const { service, storage } = createService();
    const video = { ...photo, originalname: 'IMG_0002.MOV', mimetype: 'application/octet-stream' };

    await service.create(dto, { photos: [], video });

    const [key, , contentType] = storage.uploadFile.mock.calls[0];
    expect(key).toMatch(/^leak-reports\/[0-9a-f-]{36}\.mov$/);
    expect(contentType).toBe('video/quicktime');
  });

  it('reports which photo is invalid by position, without the filename', async () => {
    const { service } = createService();
    const pdf = { ...photo, originalname: 'ë\u0088\u0084ì\u0088\u0098.pdf', mimetype: 'application/pdf' };
    const big = { ...photo, size: 11 * 1024 * 1024 };

    await expect(
      service.create(dto, { photos: [photo, photo, pdf] }),
    ).rejects.toThrow('3번째 사진의 형식을 지원하지 않습니다.');
    await expect(
      service.create(dto, { photos: [photo, photo, big] }),
    ).rejects.toThrow('3번째 사진이 10MB를 넘습니다.');
  });

  it('does not save the report when file upload fails', async () => {
    const { service, prisma, storage } = createService();
    storage.uploadFile.mockRejectedValue(new Error('upload failed'));

    await expect(service.create(dto, { photos: [photo] })).rejects.toThrow(
      'upload failed',
    );
    expect(prisma.leakReport.create).not.toHaveBeenCalled();
  });

  it('does not wait for the Slack notification to finish', async () => {
    const { service, notification } = createService();
    notification.notifyReportCreated.mockReturnValue(new Promise(() => {}));

    const result = await service.create(dto, { photos: [photo] });

    expect(result.id).toBe(1);
    expect(notification.notifyReportCreated).toHaveBeenCalledTimes(1);
  });

  it('logs instead of crashing when the notification rejects unexpectedly', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    try {
      const { service, notification } = createService();
      notification.notifyReportCreated.mockRejectedValue(new Error('boom'));

      const result = await service.create(dto, { photos: [photo] });
      await new Promise((resolve) => setImmediate(resolve));

      expect(result.id).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(
        'Slack notification crashed unexpectedly',
        expect.stringContaining('boom'),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('saves an emergency report without general-only fields and flags the notification', async () => {
    const { service, prisma, notification } = createService();
    const emergency = {
      name: '홍길동',
      phone: '010-1234-5678',
      address: '서울시 강남구 테스트로 1',
      urgency: '긴급',
      description: '천장에서 물이 떨어지고 있어요',
    } as any;
    prisma.leakReport.create.mockResolvedValue({
      id: 7,
      ...emergency,
      location: null,
      occurredAt: null,
      damageScope: null,
      files: [],
    });

    await service.create(emergency, { photos: [photo] });

    const { data } = prisma.leakReport.create.mock.calls[0][0];
    expect(data).toMatchObject({
      urgency: '긴급',
      description: '천장에서 물이 떨어지고 있어요',
    });
    expect(data.occurredAt).toBeUndefined();
    expect(notification.notifyReportCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 7,
        isEmergency: true,
        description: '천장에서 물이 떨어지고 있어요',
      }),
    );
  });
});
