import { createClient } from "@supabase/supabase-js";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";

const apply = process.argv.includes("--apply");
const sourceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (new URL(sourceUrl).hostname !== "mjptydjrsezqvbrlwooz.supabase.co") throw new Error("Unexpected source storage host");
const endpoint = new URL(process.env.AWS_ENDPOINT_URL_S3);
const branch = process.argv.find((arg) => arg.startsWith("--branch="))?.slice(9);
const allowed = ["br-fancy-bar-az4b6zgd", "br-autumn-snow-aztpk3of", "br-dry-firefly-azthrcx0"];
if (!allowed.includes(branch) || endpoint.hostname !== `${branch}.storage.c-3.ap-southeast-1.aws.neon.tech`) {
  throw new Error("Explicit branch must match the intended Neon storage endpoint");
}
const source = createClient(sourceUrl, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const target = new S3Client({ endpoint: endpoint.href, region: process.env.AWS_REGION, forcePathStyle: true,
  credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY } });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function* objects(bucket, prefix = "") {
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await source.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`Source listing failed for ${bucket}: ${error.message}`);
    for (const item of data) {
      const key = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) yield key;
      else yield* objects(bucket, key);
    }
    if (data.length < 100) break;
  }
}

for (const bucket of ["factory-branding", "auction-documents", "supplier-documents"]) {
  let copied = 0, verified = 0, missing = 0;
  for await (const key of objects(bucket)) {
    if (!/^[0-9a-f-]{36}\//i.test(key)) throw new Error(`Unscoped source key in ${bucket}; refusing copy`);
    const { data, error } = await source.storage.from(bucket).download(key);
    if (error) throw new Error(`Source download failed for ${bucket}: ${error.message}`);
    const bytes = Buffer.from(await data.arrayBuffer());
    let existing;
    try {
      const result = await target.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      existing = await result.Body.transformToByteArray();
    } catch (error) {
      if (error.$metadata?.httpStatusCode !== 404) throw error;
    }
    if (existing) {
      if (hash(existing) !== hash(bytes)) throw new Error(`Different existing file in ${bucket}; refusing overwrite`);
      verified++;
      continue;
    }
    missing++;
    if (!apply) continue;
    await target.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: data.type || "application/octet-stream", IfNoneMatch: "*" }));
    const result = await target.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (hash(await result.Body.transformToByteArray()) !== hash(bytes)) throw new Error(`Readback mismatch in ${bucket}`);
    copied++;
  }
  console.log(`${bucket}: missing=${missing} copied-and-verified=${copied} already-verified=${verified}`);
}
target.destroy();
console.log(apply ? "Storage migration verified; source untouched." : "Dry run: no files changed.");
