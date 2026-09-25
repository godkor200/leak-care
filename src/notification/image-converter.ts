import { Injectable, Logger } from '@nestjs/common';
import convert = require('heic-convert');
import { NotificationPhoto } from './notification.types';

const HEIC_CONTENT_TYPES = ['image/heic', 'image/heif'];
// 디코딩된 픽셀 버퍼가 원본보다 훨씬 커서, 큰 HEIC는 메모리를 아끼려고 변환하지 않는다
const MAX_CONVERT_BYTES = 6 * 1024 * 1024;

@Injectable()
export class ImageConverter {
  private readonly logger = new Logger(ImageConverter.name);

  // Slack은 HEIC 미리보기를 지원하지 않으므로 JPEG로 바꾼다. 실패하면 원본을 그대로 쓴다.
  async toSlackImage(photo: NotificationPhoto): Promise<NotificationPhoto> {
    if (!HEIC_CONTENT_TYPES.includes(photo.contentType)) {
      return photo;
    }
    if (photo.buffer.length > MAX_CONVERT_BYTES) {
      this.logger.warn(
        `HEIC photo is ${photo.buffer.length} bytes, over the conversion limit; uploading the original`,
      );
      return photo;
    }
    try {
      const output = await convert({
        buffer: photo.buffer,
        format: 'JPEG',
        quality: 0.8,
      });
      return {
        buffer: Buffer.from(output),
        extension: '.jpg',
        contentType: 'image/jpeg',
      };
    } catch (error) {
      this.logger.warn(
        `HEIC conversion failed, uploading the original: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return photo;
    }
  }
}
