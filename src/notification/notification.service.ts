import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageConverter } from './image-converter';
import { ReportNotification } from './notification.types';
import { SlackClient, SlackFile } from './slack.client';

// Slack mrkdwn에서 <!channel>, <링크|텍스트> 같은 제어 문법이 동작하지 않도록 이스케이프
function escapeSlack(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function line(label: string, value?: string | null): string | null {
  return value ? `${label}: ${escapeSlack(value)}` : null;
}

// 긴급은 알림을 보자마자 전화할 수 있게 연락처를 맨 앞에 둔다
function buildMessage(report: ReportNotification): string {
  const header = report.isEmergency
    ? `<!channel> 🚨 긴급 출동 #${report.id}`
    : `새 누수 접수 #${report.id}`;
  const lines = report.isEmergency
    ? [
        line('연락처', report.phone),
        line('주소', report.address),
        line('이름', report.name),
        line('발생 장소', report.location),
        line('상황', report.description),
      ]
    : [
        line('긴급도', report.urgency),
        line('발생 장소', report.location),
        line('주소', report.address),
        line('이름', report.name),
        line('연락처', report.phone),
      ];
  if (report.hasVideo) {
    lines.push('동영상 1개 첨부됨');
  }
  return [header, ...lines.filter((value): value is string => value !== null)].join('\n');
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly config: ConfigService,
    private readonly slack: SlackClient,
    private readonly images: ImageConverter,
  ) {}

  // 사진 변환·업로드가 CPU와 메모리를 많이 쓰므로 한 번에 한 건씩 처리한다
  notifyReportCreated(report: ReportNotification): Promise<void> {
    const run = this.queue.then(() => this.send(report));
    this.queue = run;
    return run;
  }

  // 호출자가 await 없이 백그라운드로 실행하고 큐가 이어지므로 절대 reject하지 않는다
  private async send(report: ReportNotification): Promise<void> {
    const token = this.config.get<string>('SLACK_BOT_TOKEN');
    const channel = this.config.get<string>(
      report.isEmergency ? 'SLACK_EMERGENCY_CHANNEL_ID' : 'SLACK_REPORT_CHANNEL_ID',
    );
    if (!token || !channel) {
      this.logger.warn(
        `Slack bot token or channel not set, skipping notification for report #${report.id}`,
      );
      return;
    }

    let threadTs: string;
    try {
      threadTs = await this.slack.postMessage(token, channel, buildMessage(report));
    } catch (error) {
      this.logFailure(`Slack message failed for report #${report.id}`, error);
      return;
    }

    if (report.photos.length > 0) {
      try {
        await this.slack.uploadToThread(token, channel, threadTs, this.slackFiles(report));
      } catch (error) {
        this.logFailure(`Slack photo upload failed for report #${report.id}`, error);
        return;
      }
    }
    this.logger.log(`Slack notified report #${report.id} (${report.photos.length} photos)`);
  }

  // 사진을 한 장씩 변환해 넘기므로 변환본은 업로드가 끝나면 바로 버려진다
  private async *slackFiles(report: ReportNotification): AsyncIterable<SlackFile> {
    for (const [index, photo] of report.photos.entries()) {
      const image = await this.images.toSlackImage(photo);
      yield { filename: `photo-${index + 1}${image.extension}`, buffer: image.buffer };
    }
  }

  private logFailure(message: string, error: unknown) {
    this.logger.error(message, error instanceof Error ? error.stack : String(error));
  }
}
