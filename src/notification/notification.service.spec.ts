import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  const report = { id: 1, name: '홍길동', address: '서울시', urgency: '보통' };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts a message to the configured Slack webhook', async () => {
    const configService = {
      get: jest.fn().mockReturnValue('https://hooks.slack.com/services/test'),
    } as any;
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as any;

    const service = new NotificationService(configService);
    await service.sendLeakReportCreated(report);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.slack.com/services/test',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('does not throw when the webhook request fails', async () => {
    const configService = {
      get: jest.fn().mockReturnValue('https://hooks.slack.com/services/test'),
    } as any;
    global.fetch = jest.fn().mockRejectedValue(new Error('network error')) as any;

    const service = new NotificationService(configService);
    await expect(service.sendLeakReportCreated(report)).resolves.toBeUndefined();
  });

  it('skips sending when no webhook URL is configured', async () => {
    const configService = { get: jest.fn().mockReturnValue(undefined) } as any;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;

    const service = new NotificationService(configService);
    await service.sendLeakReportCreated(report);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('logs an error when Slack responds with a non-2xx status', async () => {
    const configService = {
      get: jest.fn().mockReturnValue('https://hooks.slack.com/services/test'),
    } as any;
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    global.fetch = fetchMock as any;

    const service = new NotificationService(configService);
    const errorSpy = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation();

    await service.sendLeakReportCreated(report);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const callArg = errorSpy.mock.calls[0][0];
    expect(callArg).toContain(`#${report.id}`);
    expect(callArg).toContain('404');
  });
});
