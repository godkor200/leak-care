export interface NotificationPhoto {
  buffer: Buffer;
  extension: string;
  contentType: string;
}

export interface ReportNotification {
  id: number;
  name: string;
  phone: string;
  address: string;
  // 카카오맵 검색어 (도로명주소 또는 상세주소를 뺀 기본 주소)
  mapAddress: string;
  urgency: string;
  isEmergency: boolean;
  location?: string | null;
  description?: string | null;
  photos: NotificationPhoto[];
  hasVideo: boolean;
}
