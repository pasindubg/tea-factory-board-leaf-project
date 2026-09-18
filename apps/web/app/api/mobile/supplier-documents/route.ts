import { NextResponse } from "next/server";
import { mobileCaller, unauthorized } from "@/lib/neon/mobile-session";
import { neonBucket, objectExists, presignUpload } from "@/lib/neon/storage";

const BUCKET = "supplier-documents";
const MAX_BYTES = 10485760;
const MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const OFFICE_ROLES = ["owner", "manager", "supervisor"];

const forbidden = (error: string) => NextResponse.json({ error }, { status: 403 });

export async function POST(request: Request) {
  const caller = await mobileCaller(request);
  if (!caller) return unauthorized();

  const body = (await request.json().catch(() => null)) as { path?: unknown; contentType?: unknown; size?: unknown } | null;
  const path = typeof body?.path === "string" ? body.path : "";
  const contentType = typeof body?.contentType === "string" ? body.contentType : "";
  const size = typeof body?.size === "number" ? body.size : 0;

  if (path.split("/")[0] !== caller.factoryId) return forbidden("Storage path is outside this factory.");
  if (!MIME_TYPES.includes(contentType)) return NextResponse.json({ error: "Unsupported image type." }, { status: 415 });
  if (!Number.isInteger(size) || size <= 0 || size > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be 10 MB or smaller." }, { status: 413 });
  }

  const office = OFFICE_ROLES.includes(caller.role);
  if (!office && !(caller.role === "field_officer" && caller.deviceBound)) {
    return forbidden("This login cannot upload supplier documents from this phone.");
  }
  if (!office && (await objectExists(BUCKET, path))) return forbidden("This document already exists.");

  const url = await presignUpload(BUCKET, path, contentType, size, 300, !office);
  return NextResponse.json({ url, path, headers: office ? {} : { "If-None-Match": "*" } });
}

export async function DELETE(request: Request) {
  const caller = await mobileCaller(request);
  if (!caller) return unauthorized();
  if (caller.role !== "owner" && caller.role !== "manager") return forbidden("This login cannot delete supplier documents.");

  const body = (await request.json().catch(() => null)) as { paths?: unknown } | null;
  const paths = Array.isArray(body?.paths) ? body.paths.filter((p): p is string => typeof p === "string") : [];
  if (!paths.length) return NextResponse.json({ ok: true });

  const { error } = await neonBucket(BUCKET, caller.factoryId).remove(paths);
  if (error) return forbidden(error.message);
  return NextResponse.json({ ok: true });
}
