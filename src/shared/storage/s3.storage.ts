import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import envs from '@/config/envs';
import { CustomError, errorMessages } from '@/shared/domain';
import type { ObjectStorage } from './object-storage';

export class S3Storage implements ObjectStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly publicBaseUrl: string,
  ) {}

  async upload(input: { key: string; body: Buffer; contentType: string }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  getPublicUrl(key: string): string {
    return `${this.publicBaseUrl.replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }
}

export const createObjectStorage = (): ObjectStorage => {
  if (!envs.STORAGE_BUCKET || !envs.STORAGE_REGION || !envs.STORAGE_PUBLIC_URL) {
    throw new CustomError({ statusCode: 503, message: errorMessages.product.storageNotConfigured });
  }
  if (Boolean(envs.STORAGE_ACCESS_KEY_ID) !== Boolean(envs.STORAGE_SECRET_ACCESS_KEY)) {
    throw new CustomError({ statusCode: 503, message: errorMessages.product.storageNotConfigured });
  }
  const credentials =
    envs.STORAGE_ACCESS_KEY_ID && envs.STORAGE_SECRET_ACCESS_KEY
      ? { accessKeyId: envs.STORAGE_ACCESS_KEY_ID, secretAccessKey: envs.STORAGE_SECRET_ACCESS_KEY }
      : undefined;
  return new S3Storage(
    new S3Client({
      region: envs.STORAGE_REGION,
      requestHandler: { connectionTimeout: 5000, requestTimeout: 30000 },
      endpoint: envs.STORAGE_ENDPOINT,
      credentials,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    }),
    envs.STORAGE_BUCKET,
    envs.STORAGE_PUBLIC_URL,
  );
};
