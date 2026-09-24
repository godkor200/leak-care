import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface LeakReportSummary {
  id: number;
  name: string;
  address: string;
  urgency: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly config: ConfigService) {}

  async sendLeakReportCreated(report: LeakReportSummary): Promise<void> {
    const webhookUrl = this.config.get<string>('SLACK_WEBHOOK_URL');
    if (!webhookUrl) {
      this.logger.warn('SLACK_WEBHOOK_URL not set, skipping notification');
      return;
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `새 누수 접수 #${report.id}\n이름: ${report.name}\n주소: ${report.address}\n긴급도: ${report.urgency}`,
        }),
      });
      if (!response.ok) {
        this.logger.error(
          `Slack notification failed for report #${report.id}: HTTP ${response.status}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Slack notification failed for report #${report.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
