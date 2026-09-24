import { SlackApiError, SlackClient, SlackFile } from './slack.client';

async function* filesOf(...files: SlackFile[]): AsyncIterable<SlackFile> {
  yield* files;
}

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

describe('SlackClient', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });

  it('posts a message as JSON with the bot token and returns its ts', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, ts: '111.222' }));

    const ts = await new SlackClient().postMessage('xoxb-test', 'C_REPORT', '안녕');

    expect(ts).toBe('111.222');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    expect(init.headers.Authorization).toBe('Bearer xoxb-test');
    expect(JSON.parse(init.body)).toEqual({ channel: 'C_REPORT', text: '안녕' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('throws SlackApiError when Slack answers ok: false', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: false, error: 'channel_not_found' }),
    );

    await expect(
      new SlackClient().postMessage('xoxb-test', 'C_X', 'hi'),
    ).rejects.toThrow(new SlackApiError('chat.postMessage failed: channel_not_found'));
  });

  it('throws SlackApiError on a non-2xx HTTP status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    await expect(
      new SlackClient().postMessage('xoxb-test', 'C_X', 'hi'),
    ).rejects.toThrow('chat.postMessage failed: HTTP 500');
  });

  it('uploads each file and completes them together in the thread', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, upload_url: 'https://files.slack.com/u1', file_id: 'F1' }),
      )
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, upload_url: 'https://files.slack.com/u2', file_id: 'F2' }),
      )
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await new SlackClient().uploadToThread(
      'xoxb-test',
      'C_REPORT',
      '111.222',
      filesOf(
        { filename: 'photo-1.jpg', buffer: Buffer.from('a') },
        { filename: 'photo-2.jpg', buffer: Buffer.from('bb') },
      ),
    );

    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).toEqual([
      'https://slack.com/api/files.getUploadURLExternal',
      'https://files.slack.com/u1',
      'https://slack.com/api/files.getUploadURLExternal',
      'https://files.slack.com/u2',
      'https://slack.com/api/files.completeUploadExternal',
    ]);

    const firstParams = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(firstParams.get('filename')).toBe('photo-1.jpg');
    expect(firstParams.get('length')).toBe('1');

    const completeParams = new URLSearchParams(fetchMock.mock.calls[4][1].body);
    expect(completeParams.get('channel_id')).toBe('C_REPORT');
    expect(completeParams.get('thread_ts')).toBe('111.222');
    expect(JSON.parse(completeParams.get('files') ?? '[]')).toEqual([
      { id: 'F1', title: 'photo-1.jpg' },
      { id: 'F2', title: 'photo-2.jpg' },
    ]);
  });

  it('stops without completing when a file upload fails', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, upload_url: 'https://files.slack.com/u1', file_id: 'F1' }),
      )
      .mockResolvedValueOnce({ ok: false, status: 413 });

    await expect(
      new SlackClient().uploadToThread(
        'xoxb-test',
        'C_REPORT',
        '111.222',
        filesOf({ filename: 'photo-1.jpg', buffer: Buffer.from('a') }),
      ),
    ).rejects.toThrow('file upload failed: HTTP 413');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('pulls the next file only after the previous one is uploaded', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith('https://files.slack.com')
        ? { ok: true, status: 200 }
        : jsonResponse({ ok: true, upload_url: 'https://files.slack.com/u', file_id: 'F' }),
    );
    const fetchCountWhenPulled: number[] = [];
    async function* lazyFiles(): AsyncIterable<SlackFile> {
      for (const name of ['photo-1.jpg', 'photo-2.jpg']) {
        fetchCountWhenPulled.push(fetchMock.mock.calls.length);
        yield { filename: name, buffer: Buffer.from('x') };
      }
    }

    await new SlackClient().uploadToThread('xoxb-test', 'C_REPORT', '111.222', lazyFiles());

    expect(fetchCountWhenPulled).toEqual([0, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
