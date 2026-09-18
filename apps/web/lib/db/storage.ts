import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { neonBucket } from "@/lib/neon/storage";

type StorageError = { message: string } | null;

export type BucketApi = {
  upload(
    path: string,
    body: Uint8Array,
    options?: { contentType?: string; cacheControl?: string; upsert?: boolean },
  ): Promise<{ error: StorageError }>;
  remove(paths: string[]): Promise<{ error: StorageError }>;
  createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string } | null; error: StorageError }>;
  createSignedUrls(
    paths: string[],
    expiresIn: number,
  ): Promise<{ data: { path: string | null; signedUrl: string; error: string | null }[] | null; error: StorageError }>;
};

export function storageFor(_client: SupabaseClient, factoryId: string) {
  return { from: (bucket: string): BucketApi => neonBucket(bucket, factoryId) };
}
