import { randomUUID } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../env';

// MinIO uyumlu S3 client. forcePathStyle=true MinIO için zorunlu.
export const s3 = new S3Client({
  region: env.MINIO_REGION,
  endpoint: env.MINIO_ENDPOINT,
  credentials: {
    accessKeyId: env.MINIO_ACCESS_KEY,
    secretAccessKey: env.MINIO_SECRET_KEY,
  },
  forcePathStyle: true,
});

// Tarayıcıya verilen yükleme adresi herkese açık uçla imzalanır (cdn.butika.ai →
// nginx Host'u koruyarak MinIO'ya iletir). İç uçla (http://minio:9000) imzalanan
// adrese tarayıcı ulaşamıyordu: admin'de görsel yükleme hiç çalışmıyordu.
const presignS3 = new S3Client({
  region: env.MINIO_REGION,
  endpoint: env.MINIO_PUBLIC_URL,
  credentials: {
    accessKeyId: env.MINIO_ACCESS_KEY,
    secretAccessKey: env.MINIO_SECRET_KEY,
  },
  forcePathStyle: true,
});

export interface PresignedUpload {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresInSeconds: number;
}

export async function presignUpload(
  prefix: string,
  filename: string,
  contentType: string,
): Promise<PresignedUpload> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'bin';
  const safeExt = /^[a-z0-9]{1,8}$/.test(ext) ? ext : 'bin';
  const key = `${prefix}/${randomUUID()}.${safeExt}`;
  const expiresIn = 5 * 60;
  const uploadUrl = await getSignedUrl(
    presignS3,
    new PutObjectCommand({
      Bucket: env.MINIO_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn },
  );
  const publicUrl = `${env.MINIO_PUBLIC_URL.replace(/\/$/, '')}/${env.MINIO_BUCKET}/${key}`;
  return { uploadUrl, publicUrl, key, expiresInSeconds: expiresIn };
}
