import { NextResponse } from "next/server";
import { requireMobileProfile } from "@/lib/neon/mobile-session";
import { MOBILE_SUPPLIER_REGISTRATION_ROLES } from "@/lib/roles";
import { friendlyError } from "@/lib/errors";
import { objectExists } from "@/lib/neon/storage";
import { mobileRegistrationLineIds } from "@/lib/mobile-driver-lines";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalid = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  const caller = await requireMobileProfile(request, MOBILE_SUPPLIER_REGISTRATION_ROLES);
  if (caller instanceof Response) return caller;
  if (!caller.deviceBound) return invalid("Sign in on your registered phone to register suppliers.", 403);
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!input || Array.isArray(input)) return invalid("Enter the supplier details.");
  const text = (key: string) => typeof input[key] === "string" ? input[key].trim() : "";
  const id = text("id"), lineId = text("line_id");
  const name = text("name"), phone = text("phone");
  if (!UUID.test(id) || !UUID.test(lineId)) return invalid("Choose a valid line and try again.");
  if (input.customer_no != null && input.customer_no !== "") return invalid("The office assigns the customer number in the ERP.");
  if (input.registration_no != null) return invalid("Registration number is generated automatically.");
  if (!name || !phone) return invalid("Name and mobile number are required.");
  const latitude = input.latitude, longitude = input.longitude, accuracy = input.location_accuracy_m;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return invalid("Capture a valid GPS location before saving.");
  }
  if (accuracy != null && (typeof accuracy !== "number" || !Number.isFinite(accuracy) || accuracy < 0)) {
    return invalid("Capture the GPS location again.");
  }
  for (const key of ["land_size_acres", "cultivated_area_acres"]) {
    const value = input[key];
    if (value != null && value !== "" && !/^\d{1,6}(\.\d{1,2})?$/.test(String(value))) return invalid("Land areas must be valid, non-negative acre values.");
  }
  const { profile, supabase } = caller;
  const lineIds = await mobileRegistrationLineIds(caller);
  if (lineIds && !lineIds.includes(lineId)) return invalid("This line is not assigned to your Driver user.", 404);
  const line = await supabase.from("lines").select("id").eq("id", lineId).eq("active", true).maybeSingle();
  if (line.error || !line.data) return invalid("This line is not available in your factory.", 404);
  const existing = await supabase.from("suppliers").select("id, registered_by_user_id, registration_no, line_id").eq("id", id).maybeSingle();
  if (existing.error) return invalid(friendlyError(existing.error));
  if (existing.data) {
    if (existing.data.registered_by_user_id !== profile.id || existing.data.line_id !== lineId) {
      return invalid("This registration already exists. Start a new registration.", 409);
    }
    return NextResponse.json({ ok: true, id, registrationNo: existing.data.registration_no });
  }
  const paths: Record<string, string | null> = {};
  for (const [column, filename] of [["photo_path", "photo.jpg"], ["bank_book_path", "bank-book.jpg"]]) {
    const path = text(column);
    if (path && path !== `${profile.factory_id}/${id}/${filename}`) return invalid("The supplier image belongs to a different registration.", 403);
    if (path && !(await objectExists("supplier-documents", path))) return invalid("Upload the supplier images before saving.");
    paths[column] = path || null;
  }
  const { data, error } = await supabase.from("suppliers").insert({
    id, client_uuid: id, factory_id: profile.factory_id, line_id: lineId,
    customer_no: null, name, phone,
    nic_number: text("nic_number").toUpperCase() || null,
    area: text("area") || null, address: text("address") || null,
    bank_account_no: text("bank_account_no") || null,
    land_size_acres: text("land_size_acres") || null,
    cultivated_area_acres: text("cultivated_area_acres") || null,
    latitude, longitude, location_accuracy_m: accuracy ?? null,
    location_captured_at: new Date().toISOString(),
    ...paths, bank_parse_status: paths.bank_book_path ? "pending" : null,
    registered_by_user_id: profile.id, registered_at: new Date().toISOString(),
  }).select("id, registration_no").single();
  if (error) return invalid(friendlyError(error), error.code === "23505" ? 409 : 400);
  return NextResponse.json({ ok: true, id: data.id, registrationNo: data.registration_no }, { status: 201 });
}
