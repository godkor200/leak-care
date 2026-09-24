import { BadRequestException } from '@nestjs/common';
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
      sendLeakReportCreated: jest.fn().mockResolvedValue(undefined),
    } as any;
    const service = new ReportService(prisma, storage, notification);
    return { service, prisma, storage, notification };
  }

  it('uploads files, saves the report, and sends a notification', async () => {
    const { service, prisma, storage, notification } = createService();

    const result = await service.create(dto, { photos: [photo] });

    expect(storage.uploadFile).toHaveBeenCalledTimes(1);
    expect(prisma.leakReport.create).toHaveBeenCalledTimes(1);
    expect(notification.sendLeakReportCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
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

  it('does not save the report when file upload fails', async () => {
    const { service, prisma, storage } = createService();
    storage.uploadFile.mockRejectedValue(new Error('upload failed'));

    await expect(service.create(dto, { photos: [photo] })).rejects.toThrow(
      'upload failed',
    );
    expect(prisma.leakReport.create).not.toHaveBeenCalled();
  });
});
