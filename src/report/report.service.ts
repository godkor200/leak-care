import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationService } from '../notification/notification.service';
import { CreateReportDto } from './dto/create-report.dto';

export interface ReportFiles {
  photos: Express.Multer.File[];
  video?: Express.Multer.File;
}

const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = 200 * 1024 * 1024;

// 아이폰(heic/heif, mov/m4v)과 안드로이드(jpg/webp, mp4/3gp) 기본 촬영 형식
const PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp'];
const PHOTO_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
];
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.3gp'];
const VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
  'video/3gpp',
];

// HEIC는 브라우저에 따라 MIME이 application/octet-stream으로 오므로 확장자도 함께 본다
function isAllowedType(
  file: Express.Multer.File,
  extensions: string[],
  mimeTypes: string[],
): boolean {
  const extension = extname(file.originalname).toLowerCase();
  return extensions.includes(extension) || mimeTypes.includes(file.mimetype);
}

@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notification: NotificationService,
  ) {}

  async create(dto: CreateReportDto, files: ReportFiles) {
    for (const photo of files.photos) {
      if (!isAllowedType(photo, PHOTO_EXTENSIONS, PHOTO_MIME_TYPES)) {
        throw new BadRequestException(
          `지원하지 않는 사진 형식입니다: ${photo.originalname}`,
        );
      }
      if (photo.size > MAX_PHOTO_SIZE) {
        throw new BadRequestException(
          `사진 파일이 너무 큽니다: ${photo.originalname}`,
        );
      }
    }
    if (files.video) {
      if (!isAllowedType(files.video, VIDEO_EXTENSIONS, VIDEO_MIME_TYPES)) {
        throw new BadRequestException(
          `지원하지 않는 동영상 형식입니다: ${files.video.originalname}`,
        );
      }
      if (files.video.size > MAX_VIDEO_SIZE) {
        throw new BadRequestException(
          `동영상 파일이 너무 큽니다: ${files.video.originalname}`,
        );
      }
    }

    const uploaded: { url: string; type: 'photo' | 'video' }[] = [];
    for (const photo of files.photos) {
      const key = `leak-reports/${randomUUID()}-${photo.originalname}`;
      const url = await this.storage.uploadFile(key, photo.buffer, photo.mimetype);
      uploaded.push({ url, type: 'photo' });
    }
    if (files.video) {
      const key = `leak-reports/${randomUUID()}-${files.video.originalname}`;
      const url = await this.storage.uploadFile(
        key,
        files.video.buffer,
        files.video.mimetype,
      );
      uploaded.push({ url, type: 'video' });
    }

    const report = await this.prisma.leakReport.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        address: dto.address,
        location: dto.location,
        occurredAt: dto.occurredAt,
        damageScope: dto.damageScope,
        urgency: dto.urgency,
        files: { create: uploaded },
      },
      include: { files: true },
    });

    await this.notification.sendLeakReportCreated({
      id: report.id,
      name: report.name,
      address: report.address,
      urgency: report.urgency,
    });

    return report;
  }

  findOne(id: number) {
    return this.prisma.leakReport.findUnique({
      where: { id },
      include: { files: true },
    });
  }
}
