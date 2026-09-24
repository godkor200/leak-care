import { Module } from '@nestjs/common';
import { ImageConverter } from './image-converter';
import { NotificationService } from './notification.service';
import { SlackClient } from './slack.client';

@Module({
  providers: [NotificationService, SlackClient, ImageConverter],
  exports: [NotificationService],
})
export class NotificationModule {}
