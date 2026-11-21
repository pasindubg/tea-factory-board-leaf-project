import { NextResponse } from "next/server";
import { mobileCaller, requireMobileProfile, unauthorized } from "@/lib/neon/mobile-session";
import { createSupplierPhoto, neonBucket, objectExists, presignUpload } from "@/lib/neon/storage";
import { MOBILE_SUPPLIER_REGISTRATION_ROLES, roleMayRegisterSuppliers, type Role } from "@/lib/roles";

const BUCKET = "supplier-documents";
const MAX_BYTES = 10485760;
const WEB_MAX_BYTES = 2 * 1024 * 1024;
const MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const OFFICE_ROLES: readonly Role[] = ["owner", "manager", "supervisor"];

const forbidden = (error: string) => NextResponse.json({ error }, { status: 403 });

// The hosted UI sends compressed JPEGs through the same origin. This keeps
// bucket CORS and signed URLs out of the browser upload path.
export async function PUT(request: Request) {
  const caller = await requireMobileProfile(request, MOBILE_SUPPLIER_REGISTRATION_ROLES);
  if (caller instanceof Response) return caller;
  if (!caller.deviceBound) return forbidden("Sign in on your registered phone to upload supplier documents.");

  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (path.split("/")[0] !== caller.profile.factory_id) return forbidden("Storage path is outside this factory.");
  if (!/^[^/]+\/[0-9a-f-]{36}\/(photo|bank-book)\.jpg$/i.test(path)) return forbidden("Invalid supplier image path.");
  if (request.headers.get("content-type") !== "image/jpeg") {
    return NextResponse.json({ error: "Choose a JPEG image." }, { status: 415 });
  }
  const reader = request.body?.getReader();
  const bytes = new Uint8Array(WEB_MAX_BYTES);
  let length = 0;
  if (reader) {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (length + chunk.value.length > WEB_MAX_BYTES) {
        await reader.cancel();
        return NextResponse.json({ error: "Image must be 2 MB or smaller." }, { status: 413 });
      }
      bytes.set(chunk.value, length);
      length += chunk.value.length;
    }
  }
  if (length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return NextResponse.json({ error: "Choose a valid JPEG image." }, { status: 415 });
  }
  try {
    const saved = await createSupplierPhoto(caller.profile.factory_id, path, bytes.subarray(0, length));
    if (!saved) return NextResponse.json({ error: "A different photo is already attached. Start a new registration to replace it." }, { status: 409 });
  } catch {
    return NextResponse.json({ error: "The photo could not be uploaded. Try again." }, { status: 503 });
  }
  return NextResponse.json({ path }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const caller = await requireMobileProfile(request, [...OFFICE_ROLES, ...MOBILE_SUPPLIER_REGISTRATION_ROLES]);
  if (caller instanceof Response) return caller;

  const body = (await request.json().catch(() => null)) as { path?: unknown; contentType?: unknown; size?: unknown } | null;
  const path = typeof body?.path === "string" ? body.path : "";
  const contentType = typeof body?.contentType === "string" ? body.contentType : "";
  const size = typeof body?.size === "number" ? body.size : 0;

  if (path.split("/")[0] !== caller.profile.factory_id) return forbidden("Storage path is outside this factory.");
  if (!/^[^/]+\/[0-9a-f-]{36}\/(photo|bank-book)\.jpg$/i.test(path)) return forbidden("Invalid supplier image path.");
  if (!MIME_TYPES.includes(contentType)) return NextResponse.json({ error: "Unsupported image type." }, { status: 415 });
  if (!Number.isInteger(size) || size <= 0 || size > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be 10 MB or smaller." }, { status: 413 });
  }

  const office = OFFICE_ROLES.includes(caller.profile.role);
  if (!office && !(roleMayRegisterSuppliers(caller.profile.role) && caller.deviceBound)) {
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
