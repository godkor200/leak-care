import { Logger } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { ReportNotification } from './notification.types';
import { SlackFile } from './slack.client';

describe('NotificationService', () => {
  const photo = {
    buffer: Buffer.from('jpeg'),
    extension: '.jpg',
    contentType: 'image/jpeg',
  };

  const generalReport: ReportNotification = {
    id: 1,
    name: '홍길동',
    phone: '010-1234-5678',
    address: '서울시 강남구 테스트로 1',
    urgency: '보통',
    isEmergency: false,
    location: '천장 누수',
    description: null,
    photos: [photo],
    hasVideo: false,
  };

  const emergencyReport: ReportNotification = {
    ...generalReport,
    id: 2,
    urgency: '긴급',
    isEmergency: true,
    description: '천장에서 물이 떨어지고 있어요',
  };

  const settings: Record<string, string> = {
    SLACK_BOT_TOKEN: 'xoxb-test',
    SLACK_REPORT_CHANNEL_ID: 'C_REPORT',
    SLACK_EMERGENCY_CHANNEL_ID: 'C_EMERGENCY',
  };

  function createService(overrides: Record<string, string | undefined> = {}) {
    const values = { ...settings, ...overrides };
    const config = { get: jest.fn((key: string) => values[key]) } as any;
    // uploadToThread는 파일을 하나씩 꺼내 쓰므로 목도 끝까지 소비해 받은 파일을 기록한다
    const uploadedFiles: SlackFile[][] = [];
    const slack = {
      postMessage: jest.fn().mockResolvedValue('111.222'),
      uploadToThread: jest.fn(
        async (_token: string, _channel: string, _ts: string, files: AsyncIterable<SlackFile>) => {
          const received: SlackFile[] = [];
          uploadedFiles.push(received);
          for await (const file of files) {
            received.push(file);
          }
        },
      ),
    };
    const images = {
      toSlackImage: jest.fn(async (p) => p),
    };
    const service = new NotificationService(config, slack as any, images as any);
    return { service, slack, images, uploadedFiles };
  }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts a general report to the report channel and its photos to the thread', async () => {
    const { service, slack, uploadedFiles } = createService();

    await service.notifyReportCreated(generalReport);

    const [token, channel, text] = slack.postMessage.mock.calls[0];
    expect(token).toBe('xoxb-test');
    expect(channel).toBe('C_REPORT');
    expect(text.split('\n')[0]).toBe('새 누수 접수 #1');
    expect(text).toContain('긴급도: 보통');
    expect(text).toContain('연락처: 010-1234-5678');
    expect(text).not.toContain('<!channel>');
    expect(slack.uploadToThread).toHaveBeenCalledWith(
      'xoxb-test',
      'C_REPORT',
      '111.222',
      expect.anything(),
    );
    expect(uploadedFiles[0]).toEqual([{ filename: 'photo-1.jpg', buffer: photo.buffer }]);
  });

  it('posts an emergency report to the emergency channel with @channel and the phone first', async () => {
    const { service, slack } = createService();

    await service.notifyReportCreated(emergencyReport);

    const [, channel, text] = slack.postMessage.mock.calls[0];
    expect(channel).toBe('C_EMERGENCY');
    const lines = text.split('\n');
    expect(lines[0]).toBe('<!channel> 🚨 긴급 출동 #2');
    expect(lines[1]).toBe('연락처: 010-1234-5678');
    expect(text).toContain('상황: 천장에서 물이 떨어지고 있어요');
    expect(slack.uploadToThread.mock.calls[0][1]).toBe('C_EMERGENCY');
  });

  it('uploads HEIC photos after converting them for Slack', async () => {
    const { service, images, uploadedFiles } = createService();
    const heic = {
      buffer: Buffer.from('heic'),
      extension: '.heic',
      contentType: 'image/heic',
    };
    const converted = {
      buffer: Buffer.from('jpeg-from-heic'),
      extension: '.jpg',
      contentType: 'image/jpeg',
    };
    images.toSlackImage.mockResolvedValueOnce(converted);

    await service.notifyReportCreated({ ...generalReport, photos: [heic, photo] });

    expect(images.toSlackImage).toHaveBeenCalledWith(heic);
    expect(uploadedFiles[0]).toEqual([
      { filename: 'photo-1.jpg', buffer: converted.buffer },
      { filename: 'photo-2.jpg', buffer: photo.buffer },
    ]);
  });

  it('converts each photo only after the previous one has been handed to Slack', async () => {
    const { service, slack, images } = createService();
    const events: string[] = [];
    images.toSlackImage.mockImplementation(async (p) => {
      events.push(`convert ${p.buffer.toString()}`);
      return p;
    });
    slack.uploadToThread.mockImplementation(async (_t, _c, _ts, files) => {
      for await (const file of files) {
        events.push(`upload ${file.filename}`);
      }
    });

    await service.notifyReportCreated({
      ...generalReport,
      photos: [
        { ...photo, buffer: Buffer.from('a') },
        { ...photo, buffer: Buffer.from('b') },
      ],
    });

    expect(events).toEqual([
      'convert a',
      'upload photo-1.jpg',
      'convert b',
      'upload photo-2.jpg',
    ]);
  });

  it('escapes user text and mentions an attached video', async () => {
    const { service, slack } = createService();

    await service.notifyReportCreated({
      ...generalReport,
      name: '<!channel> 홍길동',
      address: 'A & B <https://evil.example|클릭>',
      hasVideo: true,
    });

    const text = slack.postMessage.mock.calls[0][2];
    expect(text).toContain('이름: &lt;!channel&gt; 홍길동');
    expect(text).toContain('주소: A &amp; B &lt;https://evil.example|클릭&gt;');
    expect(text).not.toContain('<!channel>');
    expect(text).toContain('동영상 1개 첨부됨');
  });

  it('skips the photo upload and does not throw when the message fails', async () => {
    const { service, slack } = createService();
    slack.postMessage.mockRejectedValue(new Error('channel_not_found'));

    await expect(service.notifyReportCreated(generalReport)).resolves.toBeUndefined();

    expect(slack.uploadToThread).not.toHaveBeenCalled();
    expect(Logger.prototype.error).toHaveBeenCalledTimes(1);
  });

  it('does not throw when the photo upload fails', async () => {
    const { service, slack } = createService();
    slack.uploadToThread.mockRejectedValue(new Error('file upload failed'));

    await expect(service.notifyReportCreated(generalReport)).resolves.toBeUndefined();

    expect(Logger.prototype.error).toHaveBeenCalledTimes(1);
  });

  it('does not upload anything when there are no photos', async () => {
    const { service, slack } = createService();

    await service.notifyReportCreated({ ...generalReport, photos: [] });

    expect(slack.postMessage).toHaveBeenCalledTimes(1);
    expect(slack.uploadToThread).not.toHaveBeenCalled();
  });

  it('sends one report at a time, starting the next only after the previous finishes', async () => {
    const { service, slack } = createService();
    let releaseFirst: (ts: string) => void = () => {};
    slack.postMessage.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        releaseFirst = resolve;
      }),
    );

    const first = service.notifyReportCreated(generalReport);
    const second = service.notifyReportCreated(emergencyReport);
    await new Promise((resolve) => setImmediate(resolve));

    expect(slack.postMessage).toHaveBeenCalledTimes(1);
    expect(slack.postMessage.mock.calls[0][1]).toBe('C_REPORT');

    releaseFirst('111.222');
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);

    expect(slack.postMessage).toHaveBeenCalledTimes(2);
    expect(slack.postMessage.mock.calls[1][1]).toBe('C_EMERGENCY');
    expect(slack.uploadToThread).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['the bot token', { SLACK_BOT_TOKEN: undefined }],
    ['the channel', { SLACK_EMERGENCY_CHANNEL_ID: undefined }],
  ])('skips sending when %s is not configured', async (_label, overrides) => {
    const { service, slack } = createService(overrides);

    await service.notifyReportCreated(emergencyReport);

    expect(slack.postMessage).not.toHaveBeenCalled();
    expect(Logger.prototype.warn).toHaveBeenCalledTimes(1);
  });
});
