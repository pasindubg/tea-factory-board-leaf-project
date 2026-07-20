"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyError } from "@/lib/errors";
import { requireProfile } from "@/lib/profile";
import { ALL_WEB_ROLES } from "@/lib/roles";

const SETTINGS_PATH = "/dashboard/settings";
const EMPLOYMENT_TYPES = new Set(["permanent", "contract", "temporary", "part_time", "seasonal"]);
const FACTORY_BRANDING_BUCKET = "factory-branding";
const FACTORY_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function goToSettings(kind: "notice" | "error", message: string): never {
  redirect(`${SETTINGS_PATH}?${kind}=${encodeURIComponent(message)}`);
}

function textField(formData: FormData, name: string, maxLength: number, required = false) {
  const value = String(formData.get(name) ?? "").trim();
  if (required && !value) goToSettings("error", "Full name is required.");
  if (value.length > maxLength) {
    goToSettings("error", `${name.replaceAll("_", " ")} is too long.`);
  }
  return value || null;
}

function dateField(formData: FormData, name: string, label: string, allowFuture = false) {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    goToSettings("error", `${label} is not a valid date.`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    goToSettings("error", `${label} is not a valid date.`);
  }
  if (!allowFuture && value > new Date().toISOString().slice(0, 10)) {
    goToSettings("error", `${label} cannot be in the future.`);
  }
  return value;
}

export async function savePersonalProfile(formData: FormData) {
  const { supabase, profile } = await requireProfile(ALL_WEB_ROLES);
  const employmentType = textField(formData, "employment_type", 40);
  if (employmentType && !EMPLOYMENT_TYPES.has(employmentType)) {
    goToSettings("error", "Choose a valid employment type.");
  }

  const values = {
    user_id: profile.id,
    factory_id: profile.factory_id,
    full_name: textField(formData, "full_name", 120, true)!,
    national_id_number: textField(formData, "national_id_number", 40),
    date_of_birth: dateField(formData, "date_of_birth", "Date of birth"),
    address: textField(formData, "address", 500),
    phone: textField(formData, "phone", 40),
    emergency_contact_name: textField(formData, "emergency_contact_name", 120),
    emergency_contact_phone: textField(formData, "emergency_contact_phone", 40),
    employee_number: textField(formData, "employee_number", 60),
    job_title: textField(formData, "job_title", 120),
    department: textField(formData, "department", 120),
    employment_type: employmentType,
    employment_start_date: dateField(formData, "employment_start_date", "Employment start date"),
    qualifications: textField(formData, "qualifications", 1000),
    notes: textField(formData, "notes", 1000),
    visible_to_colleagues: formData.get("visible_to_colleagues") === "on",
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("user_profiles")
    .upsert(values, { onConflict: "user_id" });
  if (error) goToSettings("error", friendlyError(error));

  revalidatePath("/dashboard", "layout");
  revalidatePath(SETTINGS_PATH);
  goToSettings("notice", "Your personal and employment details were saved.");
}

export async function changeOwnUsername(formData: FormData) {
  const { supabase } = await requireProfile(ALL_WEB_ROLES);
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) {
    goToSettings(
      "error",
      "Username must be 3 to 40 characters using letters, numbers, dots, underscores, or hyphens.",
    );
  }

  const { error } = await supabase.rpc("update_own_username", { p_username: username });
  if (error) goToSettings("error", friendlyError(error));

  revalidatePath(SETTINGS_PATH);
  goToSettings("notice", "Your username was updated.");
}

export async function changeOwnPassword(formData: FormData) {
  const { supabase } = await requireProfile(ALL_WEB_ROLES);
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("password_confirmation") ?? "");

  if (password.length < 12) {
    goToSettings("error", "Use at least 12 characters for your new password.");
  }
  if (password !== confirmation) {
    goToSettings("error", "The password confirmation does not match.");
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) goToSettings("error", friendlyError(error));

  goToSettings("notice", "Your password was changed.");
}

export async function saveFactoryBranding(formData: FormData) {
  const { supabase, profile } = await requireProfile(["owner"]);
  const factoryName = String(formData.get("factory_name") ?? "").trim();
  if (!factoryName) goToSettings("error", "Factory name is required.");
  if (factoryName.length > 160) goToSettings("error", "Factory name is too long.");

  const { data: currentFactory, error: currentError } = await supabase
    .from("factories")
    .select("logo_path")
    .eq("id", profile.factory_id)
    .maybeSingle();
  if (currentError) goToSettings("error", friendlyError(currentError));
  if (!currentFactory) goToSettings("error", "Factory record not found.");

  const image = formData.get("factory_image");
  const removeImage = formData.get("remove_factory_image") === "on";
  let nextLogoPath = removeImage ? null : currentFactory.logo_path;
  let uploadedPath: string | null = null;

  if (image instanceof File && image.size > 0) {
    const extension = FACTORY_IMAGE_TYPES.get(image.type);
    if (!extension) goToSettings("error", "Factory image must be a JPG, PNG, or WebP file.");
    if (image.size > 5 * 1024 * 1024) goToSettings("error", "Factory image must be 5 MB or smaller.");

    uploadedPath = `${profile.factory_id}/${randomUUID()}.${extension}`;
    const bytes = new Uint8Array(await image.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(FACTORY_BRANDING_BUCKET)
      .upload(uploadedPath, bytes, {
        contentType: image.type,
        cacheControl: "3600",
        upsert: false,
      });
    if (uploadError) {
      goToSettings("error", "The factory image could not be uploaded. Please try again.");
    }
    nextLogoPath = uploadedPath;
  }

  const { data: updated, error: updateError } = await supabase
    .from("factories")
    .update({ name: factoryName, logo_path: nextLogoPath })
    .eq("id", profile.factory_id)
    .select("id")
    .maybeSingle();
  if (updateError || !updated) {
    if (uploadedPath) {
      await supabase.storage.from(FACTORY_BRANDING_BUCKET).remove([uploadedPath]);
    }
    goToSettings("error", updateError ? friendlyError(updateError) : "Factory record not found.");
  }

  if (currentFactory.logo_path && currentFactory.logo_path !== nextLogoPath) {
    await supabase.storage.from(FACTORY_BRANDING_BUCKET).remove([currentFactory.logo_path]);
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath(SETTINGS_PATH);
  goToSettings("notice", "Factory name and image were updated for all users.");
}
