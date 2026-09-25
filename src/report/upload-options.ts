import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { isAllowedType, UnsupportedFileTypeException } from './file-types';

export type UploadedReportFiles =
  | { photos?: Express.Multer.File[]; video?: Express.Multer.File[] }
  | undefined;

// 일반 접수와 긴급 출동이 같은 업로드 제한을 쓴다
export function ReportUploadInterceptor() {
  return FileFieldsInterceptor(
    [
      { name: 'photos', maxCount: 20 },
      { name: 'video', maxCount: 1 },
    ],
    {
      // storage 미지정 시 multer 기본값인 메모리 저장소를 사용한다
      limits: {
        fileSize: 200 * 1024 * 1024,
        files: 21,
        fields: 20,
        parts: 45,
        fieldSize: 10 * 1024,
      },
      // 허용되지 않은 형식은 메모리에 버퍼링하기 전에 거부한다
      fileFilter: (_req, file, callback) => {
        const kind = file.fieldname === 'video' ? 'video' : 'photo';
        if (isAllowedType(file, kind)) {
          callback(null, true);
        } else {
          callback(new UnsupportedFileTypeException(), false);
        }
      },
    },
  );
}
