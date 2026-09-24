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
  urgency: string;
  isEmergency: boolean;
  location?: string | null;
  description?: string | null;
  photos: NotificationPhoto[];
  hasVideo: boolean;
}
