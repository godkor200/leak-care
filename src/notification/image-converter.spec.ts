import { Logger } from '@nestjs/common';
import convert = require('heic-convert');
import { ImageConverter } from './image-converter';

jest.mock('heic-convert', () => jest.fn());

const convertMock = convert as unknown as jest.Mock;

describe('ImageConverter', () => {
  beforeEach(() => {
    convertMock.mockReset();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns JPEG and other non-HEIC photos unchanged', async () => {
    const photo = {
      buffer: Buffer.from('jpeg'),
      extension: '.jpg',
      contentType: 'image/jpeg',
    };

    const result = await new ImageConverter().toSlackImage(photo);

    expect(result).toBe(photo);
    expect(convertMock).not.toHaveBeenCalled();
  });

  it.each([
    ['.heic', 'image/heic'],
    ['.heif', 'image/heif'],
  ])('converts %s photos to JPEG', async (extension, contentType) => {
    convertMock.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    const photo = { buffer: Buffer.from('heic'), extension, contentType };

    const result = await new ImageConverter().toSlackImage(photo);

    expect(convertMock).toHaveBeenCalledWith({
      buffer: photo.buffer,
      format: 'JPEG',
      quality: 0.8,
    });
    expect(result).toEqual({
      buffer: Buffer.from([1, 2, 3]),
      extension: '.jpg',
      contentType: 'image/jpeg',
    });
  });

  it('skips converting a HEIC photo larger than 6MB and keeps the original', async () => {
    const photo = {
      buffer: Buffer.alloc(6 * 1024 * 1024 + 1),
      extension: '.heic',
      contentType: 'image/heic',
    };

    const result = await new ImageConverter().toSlackImage(photo);

    expect(result).toBe(photo);
    expect(convertMock).not.toHaveBeenCalled();
    expect(Logger.prototype.warn).toHaveBeenCalledTimes(1);
  });

  it('falls back to the original photo when conversion fails', async () => {
    convertMock.mockRejectedValue(new Error('bad heic'));
    const photo = {
      buffer: Buffer.from('heic'),
      extension: '.heic',
      contentType: 'image/heic',
    };

    const result = await new ImageConverter().toSlackImage(photo);

    expect(result).toBe(photo);
    expect(Logger.prototype.warn).toHaveBeenCalledTimes(1);
  });
});
