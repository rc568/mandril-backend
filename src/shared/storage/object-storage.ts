export interface ObjectStorage {
  upload(input: { key: string; body: Buffer; contentType: string }): Promise<void>;
  delete(key: string): Promise<void>;
  getPublicUrl(key: string): string;
}
