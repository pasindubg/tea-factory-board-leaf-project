import "server-only";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { BucketApi } from "@/lib/db/storage";

let client: S3Client | null = null;

function s3() {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set");
  }
  client ??= new S3Client({
    endpoint,
    region: process.env.AWS_REGION ?? "ap-southeast-1",
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  return client;
}

function outsideFactory(path: string, factoryId: string) {
  return path.split("/")[0] !== factoryId;
}

const denied = (path: string) => ({ message: `Storage path is outside this factory: ${path}` });

export async function objectExists(bucket: string, key: string) {
  try {
    await s3().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return false;
    throw err;
  }
}

export function presignUpload(bucket: string, key: string, contentType: string, size: number, expiresIn = 300, createOnly = false) {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: size, ...(createOnly ? { IfNoneMatch: "*" } : {}) }),
    { expiresIn, signableHeaders: new Set(["content-type", "content-length", ...(createOnly ? ["if-none-match"] : [])]) },
  );
}

export function neonBucket(bucket: string, factoryId: string): BucketApi {
  return {
    async upload(path, body, options) {
      if (outsideFactory(path, factoryId)) return { error: denied(path) };
      try {
        await s3().send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: path,
            Body: body,
            ...(options?.upsert ? {} : { IfNoneMatch: "*" }),
            ContentType: options?.contentType,
            CacheControl: options?.cacheControl ? `max-age=${options.cacheControl}` : undefined,
          }),
        );
        return { error: null };
      } catch (err) {
        return { error: { message: (err as Error).message } };
      }
    },

    async remove(paths) {
      const foreign = paths.find((p) => outsideFactory(p, factoryId));
      if (foreign) return { error: denied(foreign) };
      try {
        await Promise.all(paths.map((Key) => s3().send(new DeleteObjectCommand({ Bucket: bucket, Key }))));
        return { error: null };
      } catch (err) {
        return { error: { message: (err as Error).message } };
      }
    },

    async createSignedUrl(path, expiresIn) {
      if (outsideFactory(path, factoryId)) return { data: null, error: denied(path) };
      try {
        const signedUrl = await getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket, Key: path }), { expiresIn });
        return { data: { signedUrl }, error: null };
      } catch (err) {
        return { data: null, error: { message: (err as Error).message } };
      }
    },

    async createSignedUrls(paths, expiresIn) {
      const data = await Promise.all(
        paths.map(async (path) => {
          if (outsideFactory(path, factoryId)) return { path, signedUrl: "", error: denied(path).message };
          try {
            const signedUrl = await getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket, Key: path }), { expiresIn });
            return { path, signedUrl, error: null };
          } catch (err) {
            return { path, signedUrl: "", error: (err as Error).message };
          }
        }),
      );
      return { data, error: null };
    },
  };
}
