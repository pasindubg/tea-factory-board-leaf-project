import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { send, sign } = vi.hoisted(() => ({ send: vi.fn(), sign: vi.fn() }));
vi.mock("@aws-sdk/client-s3", async (original) => ({
  ...await original<typeof import("@aws-sdk/client-s3")>(),
  S3Client: class { send = send; },
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: sign }));
import { neonBucket, presignUpload } from "./storage";

beforeEach(() => {
  vi.stubEnv("AWS_ENDPOINT_URL_S3", "https://storage.example.test");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "test");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test");
  send.mockResolvedValue({});
  sign.mockResolvedValue("https://storage.example.test/signed");
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("tenant storage boundaries", () => {
  it("refuses cross-factory reads, writes, and mixed deletion batches", async () => {
    const bucket = neonBucket("supplier-documents", "factory-a");
    expect((await bucket.upload("factory-b/file", Buffer.from("test"))).error).not.toBeNull();
    expect((await bucket.createSignedUrl("factory-b/file", 60)).error).not.toBeNull();
    expect((await bucket.remove(["factory-a/file", "factory-b/file"])).error).not.toBeNull();
    expect(send).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
  });
  it("prevents overwrite atomically unless explicitly permitted", async () => {
    const bucket = neonBucket("supplier-documents", "factory-a");
    await bucket.upload("factory-a/file", Buffer.from("test"));
    expect(send.mock.calls[0][0].input.IfNoneMatch).toBe("*");
    await bucket.upload("factory-a/file", Buffer.from("test"), { upsert: true });
    expect(send.mock.calls[1][0].input.IfNoneMatch).toBeUndefined();
  });
  it("binds create-only signed uploads to the conditional header", async () => {
    await presignUpload("supplier-documents", "factory-a/file", "image/png", 4, 300, true);
    expect(sign.mock.calls[0][1].input.IfNoneMatch).toBe("*");
    expect(sign.mock.calls[0][2].signableHeaders.has("if-none-match")).toBe(true);
  });
});
