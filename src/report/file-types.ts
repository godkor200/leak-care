import { BadRequestException } from '@nestjs/common';
import { extname } from 'path';

export type UploadKind = 'photo' | 'video';

// 아이폰(heic/heif, mov/m4v)과 안드로이드(jpg/webp, mp4/3gp) 기본 촬영 형식
// 확장자 → 저장 시 사용할 Content-Type. 값 목록이 곧 허용 MIME 목록이다.
const EXTENSION_CONTENT_TYPES: Record<UploadKind, Record<string, string>> = {
  photo: {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
    '.webp': 'image/webp',
  },
  video: {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.m4v': 'video/x-m4v',
    '.3gp': 'video/3gpp',
  },
};

export interface ResolvedFileType {
  extension: string;
  contentType: string;
}

// HEIC는 브라우저에 따라 MIME이 application/octet-stream으로 오므로 확장자를 먼저 보고,
// 허용 확장자가 없으면 허용된 MIME인지 본다. 어느 쪽도 아니면 null.
export function resolveFileType(
  file: { originalname: string; mimetype: string },
  kind: UploadKind,
): ResolvedFileType | null {
  const map = EXTENSION_CONTENT_TYPES[kind];
  const extension = extname(file.originalname).toLowerCase();
  if (map[extension]) {
    return { extension, contentType: map[extension] };
  }
  const matched = Object.entries(map).find(
    ([, contentType]) => contentType === file.mimetype,
  );
  if (matched) {
    return { extension: matched[0], contentType: matched[1] };
  }
  return null;
}

export function isAllowedType(
  file: { originalname: string; mimetype: string },
  kind: UploadKind,
): boolean {
  return resolveFileType(file, kind) !== null;
}

// multer fileFilter에서 버퍼링 전에 거부할 때 사용. UploadErrorFilter가 이 메시지를 그대로 보여준다.
export class UnsupportedFileTypeException extends BadRequestException {
  constructor() {
    super('지원하지 않는 사진/동영상 형식입니다.');
  }
}
