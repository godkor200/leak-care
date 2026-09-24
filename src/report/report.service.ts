import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationService } from '../notification/notification.service';
import { LeakLocation, UrgencyLevel } from './dto/leak-report.enums';
import { ResolvedFileType, resolveFileType } from './file-types';

// 일반 접수와 긴급 출동이 공통으로 저장하는 입력. 긴급 출동은 occurredAt/damageScope가 없다.
export interface NewLeakReport {
  name: string;
  phone: string;
  address: string;
  urgency: UrgencyLevel;
  location?: LeakLocation;
  occurredAt?: string;
  damageScope?: string;
  description?: string;
}

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

  async create(input: NewLeakReport, files: ReportFiles) {
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
        name: input.name,
        phone: input.phone,
        address: input.address,
        location: input.location,
        occurredAt: input.occurredAt,
        damageScope: input.damageScope,
        description: input.description,
        urgency: input.urgency,
        files: { create: uploaded },
      },
      include: { files: true },
    });

    // HEIC 변환과 Slack 사진 업로드는 오래 걸릴 수 있어 고객 응답을 기다리게 하지 않는다.
    // notifyReportCreated는 내부에서 모든 에러를 잡으므로 reject되지 않는다.
    void this.notification.notifyReportCreated({
      id: report.id,
      name: report.name,
      phone: report.phone,
      address: report.address,
      urgency: report.urgency,
      isEmergency: report.urgency === UrgencyLevel.HIGH,
      location: report.location,
      description: report.description,
      photos: files.photos.map((photo, index) => ({
        buffer: photo.buffer,
        ...photoTypes[index],
      })),
      hasVideo: Boolean(files.video),
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
