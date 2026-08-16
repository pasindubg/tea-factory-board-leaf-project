import Image from "next/image";
import { SubmitButton } from "@/components/submit-button";
import { friendlyError } from "@/lib/errors";
import { loadListResource } from "@/lib/list-resource-registry";
import { requireProfile } from "@/lib/profile";
import { ALL_WEB_ROLES, ROLE_LABELS } from "@/lib/roles";
import { changeOwnPassword, changeOwnUsername, saveFactoryBranding, savePersonalProfile } from "./actions";
import { StaffDirectory } from "./staff-directory";

type PersonalProfile = {
  full_name: string;
  national_id_number: string | null;
  date_of_birth: string | null;
  address: string | null;
  phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  employee_number: string | null;
  job_title: string | null;
  department: string | null;
  employment_type: string | null;
  employment_start_date: string | null;
  qualifications: string | null;
  notes: string | null;
  visible_to_colleagues: boolean;
};

const inputClass = "min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-600/15 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100";
const textAreaClass = `${inputClass} min-h-24 resize-y`;

export default async function SettingsPage() {
  const { supabase, profile } = await requireProfile(ALL_WEB_ROLES);
  const [
    { data: account, error: accountError },
    { data: details, error: detailsError },
    { data: factory, error: factoryError },
    directory,
  ] = await Promise.all([
    supabase
      .from("users")
      .select("name, email, phone, username, role")
      .eq("id", profile.id)
      .maybeSingle(),
    supabase
      .from("user_profiles")
      .select("full_name, national_id_number, date_of_birth, address, phone, emergency_contact_name, emergency_contact_phone, employee_number, job_title, department, employment_type, employment_start_date, qualifications, notes, visible_to_colleagues")
      .eq("user_id", profile.id)
      .maybeSingle(),
    supabase
      .from("factories")
      .select("name, logo_path")
      .eq("id", profile.factory_id)
      .maybeSingle(),
    loadListResource({ key: "users.staff-directory" }),
  ]);

  if (accountError) throw new Error(`Could not load your account. ${friendlyError(accountError)}`);
  if (detailsError) throw new Error(`Could not load your settings. ${friendlyError(detailsError)}`);
  if (factoryError) throw new Error(`Could not load factory settings. ${friendlyError(factoryError)}`);
  if (!account) throw new Error("Your account profile could not be found.");
  if (!factory) throw new Error("Your factory profile could not be found.");
  if (!directory.ok) throw new Error(directory.error);

  const personal = details as PersonalProfile | null;
  const roleLabel = ROLE_LABELS[profile.role] ?? profile.role;
  const age = ageFromDate(personal?.date_of_birth);
  const { data: factoryImage } = profile.role === "owner" && factory.logo_path
    ? await supabase.storage.from("factory-branding").createSignedUrl(factory.logo_path, 60 * 60)
    : { data: null };

  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-green-700 dark:text-green-400">
          Personal account
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-stone-950 dark:text-stone-50">
          My settings
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-500 dark:text-stone-400">
          Manage your login, private personal information, employment record, and the work details you choose to share with coworkers.
        </p>
      </div>

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(19rem,0.8fr)] xl:items-start">
        <form action={savePersonalProfile} className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <div className="border-b border-stone-200 px-5 py-5 dark:border-stone-700 sm:px-7">
            <h2 className="text-lg font-semibold text-stone-950 dark:text-stone-50">Personal and employment profile</h2>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              Your ID, birth date, address, emergency contact, qualifications, and notes always remain private.
            </p>
          </div>

          <div className="grid gap-8 px-5 py-6 sm:px-7">
            <fieldset>
              <legend className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                Personal information
              </legend>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Full name" required>
                  <input
                    name="full_name"
                    required
                    maxLength={120}
                    autoComplete="name"
                    defaultValue={personal?.full_name ?? account.name}
                    className={inputClass}
                  />
                </Field>
                <Field label="ID / NIC number">
                  <input
                    name="national_id_number"
                    maxLength={40}
                    autoComplete="off"
                    defaultValue={personal?.national_id_number ?? ""}
                    className={inputClass}
                  />
                </Field>
                <Field label="Date of birth" hint={age == null ? "Age is calculated from this date." : `Current age: ${age}`}>
                  <input
                    name="date_of_birth"
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    defaultValue={personal?.date_of_birth ?? ""}
                    className={inputClass}
                  />
                </Field>
                <Field label="Phone number">
                  <input
                    name="phone"
                    type="tel"
                    maxLength={40}
                    autoComplete="tel"
                    defaultValue={personal?.phone ?? account.phone ?? ""}
                    className={inputClass}
                  />
                </Field>
                <Field label="Home address" className="sm:col-span-2">
                  <textarea
                    name="address"
                    maxLength={500}
                    autoComplete="street-address"
                    defaultValue={personal?.address ?? ""}
                    className={textAreaClass}
                  />
                </Field>
                <Field label="Emergency contact name">
                  <input
                    name="emergency_contact_name"
                    maxLength={120}
                    defaultValue={personal?.emergency_contact_name ?? ""}
                    className={inputClass}
                  />
                </Field>
                <Field label="Emergency contact phone">
                  <input
                    name="emergency_contact_phone"
                    type="tel"
                    maxLength={40}
                    defaultValue={personal?.emergency_contact_phone ?? ""}
                    className={inputClass}
                  />
                </Field>
              </div>
            </fieldset>

            <fieldset className="border-t border-stone-200 pt-7 dark:border-stone-700">
              <legend className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                Employment information
              </legend>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Employee number">
                  <input name="employee_number" maxLength={60} defaultValue={personal?.employee_number ?? ""} className={inputClass} />
                </Field>
                <Field label="Job title">
                  <input name="job_title" maxLength={120} autoComplete="organization-title" defaultValue={personal?.job_title ?? ""} className={inputClass} />
                </Field>
                <Field label="Department">
                  <input name="department" maxLength={120} defaultValue={personal?.department ?? ""} className={inputClass} />
                </Field>
                <Field label="Employment type">
                  <select name="employment_type" defaultValue={personal?.employment_type ?? ""} className={inputClass}>
                    <option value="">Not specified</option>
                    <option value="permanent">Permanent</option>
                    <option value="contract">Contract</option>
                    <option value="temporary">Temporary</option>
                    <option value="part_time">Part-time</option>
                    <option value="seasonal">Seasonal</option>
                  </select>
                </Field>
                <Field label="Employment start date">
                  <input
                    name="employment_start_date"
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    defaultValue={personal?.employment_start_date ?? ""}
                    className={inputClass}
                  />
                </Field>
                <Field label="Account access level" hint="Only an owner can change access levels.">
                  <input value={roleLabel} disabled className={`${inputClass} cursor-not-allowed bg-stone-100 text-stone-500 dark:bg-stone-800`} />
                </Field>
                <Field label="Qualifications and training" className="sm:col-span-2">
                  <textarea name="qualifications" maxLength={1000} defaultValue={personal?.qualifications ?? ""} className={textAreaClass} />
                </Field>
                <Field label="Employment notes" hint="Private to you." className="sm:col-span-2">
                  <textarea name="notes" maxLength={1000} defaultValue={personal?.notes ?? ""} className={textAreaClass} />
                </Field>
              </div>
            </fieldset>

            <fieldset className="border-t border-stone-200 pt-7 dark:border-stone-700">
              <legend className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                Privacy
              </legend>
              <label className="mt-4 flex cursor-pointer gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-950/40">
                <input
                  name="visible_to_colleagues"
                  type="checkbox"
                  defaultChecked={personal?.visible_to_colleagues ?? false}
                  className="mt-1 h-5 w-5 shrink-0 rounded border-stone-300 text-green-700 focus:ring-green-600"
                />
                <span>
                  <span className="block text-sm font-semibold text-stone-900 dark:text-stone-100">
                    Show my work profile to other users
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-stone-500 dark:text-stone-400">
                    Shares only your name, access level, job title, department, employment type, and phone within this factory. Sensitive personal fields remain private.
                  </span>
                </span>
              </label>
            </fieldset>
          </div>

          <div className="flex justify-end border-t border-stone-200 bg-stone-50 px-5 py-4 dark:border-stone-700 dark:bg-stone-950/30 sm:px-7">
            <SubmitButton variant="primary" pendingText="Saving profile…">Save profile</SubmitButton>
          </div>
        </form>

        <div className="grid gap-6">
          {profile.role === "owner" && (
            <section className="rounded-3xl border border-green-200 bg-green-50/50 p-5 shadow-sm dark:border-green-900 dark:bg-green-950/20">
              <h2 className="text-lg font-semibold text-stone-950 dark:text-stone-50">Factory profile</h2>
              <p className="mt-1 text-sm leading-5 text-stone-500 dark:text-stone-400">
                Owner-only branding shown to every user in this factory.
              </p>
              <form action={saveFactoryBranding} className="mt-5 grid gap-4">
                {factoryImage?.signedUrl ? (
                  <Image
                    src={factoryImage.signedUrl}
                    alt={`${factory.name} profile`}
                    width={96}
                    height={96}
                    unoptimized
                    className="h-24 w-24 rounded-3xl border border-stone-200 bg-white object-cover shadow-sm dark:border-stone-700 dark:bg-stone-900"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-green-700 text-3xl font-bold text-white shadow-sm dark:bg-green-500 dark:text-green-950">
                    T
                  </div>
                )}
                <Field label="Factory name" required>
                  <input name="factory_name" required maxLength={160} defaultValue={factory.name} className={inputClass} />
                </Field>
                <Field label="Factory image" hint="JPG, PNG, or WebP. Maximum 5 MB.">
                  <input
                    name="factory_image"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-green-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-green-800 dark:file:bg-green-950 dark:file:text-green-300`}
                  />
                </Field>
                {factory.logo_path && (
                  <label className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-300">
                    <input name="remove_factory_image" type="checkbox" className="h-4 w-4 rounded border-stone-300 text-green-700 focus:ring-green-600" />
                    Remove the current image
                  </label>
                )}
                <SubmitButton variant="primary" pendingText="Updating factory…" className="w-full">
                  Update factory profile
                </SubmitButton>
              </form>
            </section>
          )}

          <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
            <h2 className="text-lg font-semibold text-stone-950 dark:text-stone-50">Account</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <ReadOnlyDetail label="Email" value={account.email} />
              <ReadOnlyDetail label="Access level" value={roleLabel} />
            </dl>
            <form action={changeOwnUsername} className="mt-5 border-t border-stone-200 pt-5 dark:border-stone-700">
              <Field label="Username" hint="Used with your password on the sign-in page.">
                <input
                  name="username"
                  required
                  minLength={3}
                  maxLength={40}
                  pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,39}"
                  autoComplete="username"
                  defaultValue={account.username ?? ""}
                  className={inputClass}
                />
              </Field>
              <SubmitButton variant="primary" pendingText="Updating username…" className="mt-4 w-full">
                Update username
              </SubmitButton>
            </form>
          </section>

          <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
            <h2 className="text-lg font-semibold text-stone-950 dark:text-stone-50">Password</h2>
            <p className="mt-1 text-sm leading-5 text-stone-500 dark:text-stone-400">
              Use a unique passphrase of at least 12 characters.
            </p>
            <form action={changeOwnPassword} className="mt-5 grid gap-4">
              <Field label="New password" required>
                <input name="password" type="password" required minLength={12} autoComplete="new-password" className={inputClass} />
              </Field>
              <Field label="Confirm new password" required>
                <input name="password_confirmation" type="password" required minLength={12} autoComplete="new-password" className={inputClass} />
              </Field>
              <SubmitButton variant="primary" pendingText="Changing password…" className="w-full">
                Change password
              </SubmitButton>
            </form>
          </section>
        </div>
      </div>

      <div className="mt-8">
        <StaffDirectory initialRows={directory.rows} />
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  required = false,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`grid gap-1.5 text-sm font-medium text-stone-700 dark:text-stone-300 ${className}`}>
      <span>{label}{required && <span className="ml-1 text-red-600">*</span>}</span>
      {children}
      {hint && <span className="text-xs font-normal text-stone-500 dark:text-stone-400">{hint}</span>}
    </label>
  );
}

function ReadOnlyDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-stone-500 dark:text-stone-400">{label}</dt>
      <dd className="break-all text-right font-medium text-stone-900 dark:text-stone-100">{value}</dd>
    </div>
  );
}

function ageFromDate(value: string | null | undefined) {
  if (!value) return null;
  const birthDate = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday = today.getUTCMonth() < birthDate.getUTCMonth()
    || (today.getUTCMonth() === birthDate.getUTCMonth() && today.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}
