import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationService } from '../notification/notification.service';
import { CreateReportDto } from './dto/create-report.dto';
import { ResolvedFileType, resolveFileType } from './file-types';

export interface ReportFiles {
  photos: Express.Multer.File[];
  video?: Express.Multer.File;
}

const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = 200 * 1024 * 1024;

@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notification: NotificationService,
  ) {}

  async create(dto: CreateReportDto, files: ReportFiles) {
    // 파일명은 multer가 latin1로 디코딩해 한글이 깨지므로 메시지·키에 쓰지 않는다
    const photoTypes = files.photos.map((photo, index) => {
      const label = `${index + 1}번째 사진`;
      const type = resolveFileType(photo, 'photo');
      if (!type) {
        throw new BadRequestException(`${label}의 형식을 지원하지 않습니다.`);
      }
      if (photo.size > MAX_PHOTO_SIZE) {
        throw new BadRequestException(`${label}이 10MB를 넘습니다.`);
      }
      return type;
    });
    let videoType: ResolvedFileType | undefined;
    if (files.video) {
      const type = resolveFileType(files.video, 'video');
      if (!type) {
        throw new BadRequestException('동영상의 형식을 지원하지 않습니다.');
      }
      if (files.video.size > MAX_VIDEO_SIZE) {
        throw new BadRequestException('동영상이 200MB를 넘습니다.');
      }
      videoType = type;
    }

    const uploaded: { url: string; type: 'photo' | 'video' }[] = [];
    for (const [index, photo] of files.photos.entries()) {
      const url = await this.upload(photo, photoTypes[index]);
      uploaded.push({ url, type: 'photo' });
    }
    if (files.video && videoType) {
      const url = await this.upload(files.video, videoType);
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

  private upload(file: Express.Multer.File, type: ResolvedFileType) {
    const key = `leak-reports/${randomUUID()}${type.extension}`;
    return this.storage.uploadFile(key, file.buffer, type.contentType);
  }

  findOne(id: number) {
    return this.prisma.leakReport.findUnique({
      where: { id },
      include: { files: true },
    });
  }
}
