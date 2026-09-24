import { StorageService } from './storage.service';

const sendMock = jest.fn().mockResolvedValue({});

jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({ send: sendMock })),
    PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  };
});

describe('StorageService', () => {
  const configService = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        AWS_REGION: 'ap-northeast-2',
        S3_BUCKET: 'leak-care-bucket',
        AWS_ACCESS_KEY_ID: 'test-access-key',
        AWS_SECRET_ACCESS_KEY: 'test-secret-key',
      };
      return values[key];
    }),
  } as any;

  beforeEach(() => {
    sendMock.mockClear();
  });

  it('uploads a file and returns its URL', async () => {
    const service = new StorageService(configService);
    const url = await service.uploadFile(
      'leak-reports/test.jpg',
      Buffer.from('data'),
      'image/jpeg',
    );

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(url).toBe(
      'https://leak-care-bucket.s3.ap-northeast-2.amazonaws.com/leak-reports/test.jpg',
    );
  });
});
