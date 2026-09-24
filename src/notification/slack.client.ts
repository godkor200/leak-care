import { Injectable } from '@nestjs/common';

const SLACK_API = 'https://slack.com/api';
const API_TIMEOUT_MS = 5000;
const UPLOAD_TIMEOUT_MS = 30000;

export class SlackApiError extends Error {}

export interface SlackFile {
  filename: string;
  buffer: Buffer;
}

interface SlackApiResponse {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

// Slack Web API는 실패해도 HTTP 200에 { ok: false, error }로 응답하므로 ok를 직접 확인한다
@Injectable()
export class SlackClient {
  async postMessage(token: string, channel: string, text: string): Promise<string> {
    const response = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel, text }),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    const body = await this.parse('chat.postMessage', response);
    return body.ts as string;
  }

  // 파일마다 업로드 URL을 받아 바이트를 올린 뒤, 한 번의 complete 호출로 쓰레드에 묶어서 공유한다.
  // 파일은 하나씩 꺼내 올리므로 호출자가 다음 파일을 필요할 때 만들 수 있다(변환본을 한꺼번에 들고 있지 않음).
  async uploadToThread(
    token: string,
    channel: string,
    threadTs: string,
    files: AsyncIterable<SlackFile>,
  ): Promise<void> {
    const uploaded: { id: string; title: string }[] = [];
    for await (const file of files) {
      const target = await this.callForm(token, 'files.getUploadURLExternal', {
        filename: file.filename,
        length: String(file.buffer.length),
      });
      const response = await fetch(target.upload_url as string, {
        method: 'POST',
        body: new Uint8Array(file.buffer),
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new SlackApiError(`file upload failed: HTTP ${response.status}`);
      }
      uploaded.push({ id: target.file_id as string, title: file.filename });
    }
    await this.callForm(token, 'files.completeUploadExternal', {
      files: JSON.stringify(uploaded),
      channel_id: channel,
      thread_ts: threadTs,
    });
  }

  private async callForm(
    token: string,
    method: string,
    params: Record<string, string>,
  ): Promise<SlackApiResponse> {
    const response = await fetch(`${SLACK_API}/${method}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    return this.parse(method, response);
  }

  private async parse(method: string, response: Response): Promise<SlackApiResponse> {
    if (!response.ok) {
      throw new SlackApiError(`${method} failed: HTTP ${response.status}`);
    }
    const body = (await response.json()) as SlackApiResponse;
    if (!body.ok) {
      throw new SlackApiError(`${method} failed: ${body.error ?? 'unknown_error'}`);
    }
    return body;
  }
}
