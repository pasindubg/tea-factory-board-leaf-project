import "server-only";
import { requireMobileProfile } from "@/lib/neon/mobile-session";
import { MOBILE_COMMAND_ROLES } from "@/lib/roles";
import { friendlyError } from "@/lib/errors";
import { linkedMobileCollector, linkedMobileSupplier, MOBILE_UUID, mobileError, mobileJson, mobileObject, onlyMobileKeys } from "@/lib/mobile-app";
import { mobileDriverSupplierIds } from "@/lib/mobile-resource-registry";

type Action = keyof typeof MOBILE_COMMAND_ROLES;
const actionKeys: Record<Action, string[]> = {
  "supplier.request.create": ["id", "typeKey", "payload", "amount", "note"],
  "supplier.request.acknowledge": ["id"],
  "supplier.messages.read": ["ids"],
  "driver.handover": ["id"],
  "collector.weighing.create": ["id", "supplierId", "weightKg"],
};
const uuid = (value: unknown): value is string => typeof value === "string" && MOBILE_UUID.test(value);
const decimal = (value: unknown, digits: number): value is string => typeof value === "string"
  && new RegExp(`^\\d{1,${digits}}(?:\\.\\d{1,2})?$`).test(value) && Number(value) > 0;
const success = () => mobileJson({ ok: true });
const changed = (result: { data: unknown; error: unknown }, message: string) => {
  if (result.error) return mobileError(friendlyError(result.error as never));
  return result.data ? success() : mobileError(message, 409);
};

function validPayload(payload: Record<string, unknown>, fields: unknown) {
  if (!Array.isArray(fields)) return false;
  const schema = fields.filter(mobileObject);
  if (schema.length !== fields.length) return false;
  if (!Object.keys(payload).every((key) => schema.some((field) => field.name === key))) return false;
  return schema.every((field) => {
    if (typeof field.name !== "string") return false;
    const value = Object.hasOwn(payload, field.name) ? payload[field.name] : undefined;
    if (value === undefined || value === "") return !field.required;
    if (field.type === "boolean") return typeof value === "boolean";
    if (typeof value !== "string" || value.length > 1000) return false;
    if (field.type === "number") return /^-?\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value));
    if (field.type === "date") {
      const date = new Date(value);
      return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }
    return field.type === "text" && !!value.trim();
  });
}

export async function runMobileCommand(request: Request, input: unknown) {
  if (!mobileObject(input) || typeof input.action !== "string" || !Object.hasOwn(MOBILE_COMMAND_ROLES, input.action)) {
    return mobileError("Unknown mobile action.");
  }
  const action = input.action as Action;
  if (!onlyMobileKeys(input, ["action", ...actionKeys[action]])) return mobileError("Invalid mobile action details.");
  const caller = await requireMobileProfile(request, MOBILE_COMMAND_ROLES[action]);
  if (caller instanceof Response) return caller;
  const { profile, supabase } = caller;
  const id = input.id;
  const now = new Date().toISOString();

  if (action === "supplier.messages.read") {
    if (!Array.isArray(input.ids) || !input.ids.length || !input.ids.every(uuid)) return mobileError("Choose valid messages.");
    const supplier = await linkedMobileSupplier(caller);
    if (!supplier) return mobileError("This account has no supplier profile.", 403);
    // Batch to keep PostgREST URLs bounded, while marking only this supplier's own messages.
    const ids = [...new Set(input.ids)];
    if (ids.length > 1000) return mobileError("Refresh the inbox and try again.");
    for (let start = 0; start < ids.length; start += 100) {
      const result = await supabase.from("supplier_messages").update({ read_at: now })
        .eq("supplier_id", supplier.id).in("id", ids.slice(start, start + 100)).is("read_at", null);
      if (result.error) return mobileError(friendlyError(result.error));
    }
    return success();
  }

  if (!uuid(id)) return mobileError("Choose a valid record.");

  if (action === "driver.handover") {
    if (!caller.deviceBound) return mobileError("Sign in on your registered phone to record a handover.", 403);
    const supplierIds = await mobileDriverSupplierIds(caller);
    if (!supplierIds.length) return mobileError("This request is not assigned to your route.", 403);
    return changed(await supabase.from("supplier_requests")
      .update({ status: "handed_to_driver", handed_by: profile.id, handed_at: now })
      .eq("id", id).in("supplier_id", supplierIds).eq("status", "approved").select("id").maybeSingle(),
    "This request is no longer available for handover.");
  }

  if (action === "collector.weighing.create") {
    const { supplierId, weightKg } = input;
    if (!uuid(supplierId) || !decimal(weightKg, 6)) return mobileError("Choose a supplier and enter a valid weight.");
    const collector = await linkedMobileCollector(caller);
    if (!collector) return mobileError("This account has no collector profile.", 403);
    const existing = await supabase.from("weighings").select("id,supplier_id,weight_kg")
      .eq("id", id).eq("collector_id", collector.id).maybeSingle();
    if (existing.error) return mobileError(friendlyError(existing.error));
    if (existing.data) return existing.data.supplier_id === supplierId && Number(existing.data.weight_kg) === Number(weightKg)
      ? success() : mobileError("This weighing was already saved with different details.", 409);
    const supplier = await supabase.from("suppliers").select("id").eq("id", supplierId).eq("active", true).maybeSingle();
    if (supplier.error) return mobileError(friendlyError(supplier.error));
    if (!supplier.data) return mobileError("This supplier is not available in your factory.", 404);
    const result = await supabase.from("weighings").insert({
      id, factory_id: profile.factory_id, collector_id: collector.id, supplier_id: supplierId,
      weight_kg: weightKg, collected_at: now, synced_at: now,
    });
    return result.error ? mobileError(friendlyError(result.error)) : success();
  }

  const supplier = await linkedMobileSupplier(caller);
  if (!supplier) return mobileError("This account has no supplier profile.", 403);
  if (action === "supplier.request.acknowledge") {
    return changed(await supabase.from("supplier_requests").update({ status: "acknowledged", acknowledged_at: now })
      .eq("id", id).eq("supplier_id", supplier.id).eq("status", "handed_to_driver").select("id").maybeSingle(),
    "This request is no longer awaiting acknowledgement.");
  }

  const { typeKey, note, amount, payload } = input;
  if (typeof typeKey !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(typeKey) || !mobileObject(payload)
    || !(note == null || (typeof note === "string" && note.length <= 2000))) return mobileError("Check the request details.");
  const existing = await supabase.from("supplier_requests").select("id,type_key,payload,note,amount")
    .eq("id", id).eq("supplier_id", supplier.id).maybeSingle();
  if (existing.error) return mobileError(friendlyError(existing.error));
  if (existing.data) {
    const saved = existing.data;
    const matchingPayload = mobileObject(saved.payload)
      && Object.keys(saved.payload).length === Object.keys(payload).length
      && Object.entries(saved.payload).every(([key, value]) => Object.hasOwn(payload, key) && payload[key] === value);
    const matchingAmount = amount == null ? saved.amount == null : Number(amount) === Number(saved.amount);
    return saved.type_key === typeKey && matchingPayload && matchingAmount && saved.note === (note ?? null)
      ? success() : mobileError("This request was already saved with different details.", 409);
  }
  const type = await supabase.from("request_types").select("requires_amount,fields").eq("key", typeKey).eq("active", true).maybeSingle();
  if (type.error) return mobileError(friendlyError(type.error));
  if (!type.data) return mobileError("This request type is no longer available.", 404);
  if (!validPayload(payload, type.data.fields) || (type.data.requires_amount ? !decimal(amount, 10) : amount != null)) {
    return mobileError("Check the form fields and amount.");
  }
  const result = await supabase.from("supplier_requests").insert({
    id, factory_id: profile.factory_id, supplier_id: supplier.id, type_key: typeKey,
    payload, amount: amount ?? null, note: note ?? null, status: "pending",
  });
  return result.error ? mobileError(friendlyError(result.error)) : success();
}
