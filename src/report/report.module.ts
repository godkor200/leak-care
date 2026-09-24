import { Module } from '@nestjs/common';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { StorageModule } from '../storage/storage.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [StorageModule, NotificationModule],
  controllers: [ReportController],
  providers: [ReportService],
})
export class ReportModule {}
