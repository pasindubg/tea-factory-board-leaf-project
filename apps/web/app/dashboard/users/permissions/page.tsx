import { requireProfile } from "@/lib/profile";
import { SubmitButton } from "@/components/submit-button";
import { MODULES, ROLE_LABELS, type Role } from "@/lib/roles";
import { saveModulePermissions } from "./actions";

// Roles the owner can configure (owner always has access, collector is fixed to weighings-only)
const CONFIGURABLE_ROLES: Role[] = ["manager", "supervisor", "accountant", "collector"];

export default async function PermissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { supabase, profile } = await requireProfile(["owner"]);
  const { error, notice } = await searchParams;

  // Fetch current overrides for this factory.
  const { data: overrides } = await supabase
    .from("module_permissions")
    .select("module_key, allowed_roles");

  const overrideMap = Object.fromEntries((overrides ?? []).map((r) => [r.module_key, r.allowed_roles as string[]]));

  // Configurable modules (skip overview — always visible to all management roles).
  const configurableModules = MODULES.filter((m) => m.key !== "overview");

  function isChecked(moduleKey: string, role: Role): boolean {
    if (overrideMap[moduleKey]) {
      return overrideMap[moduleKey].includes(role);
    }
    // Fall back to the code default.
    return (MODULES.find((m) => m.key === moduleKey)?.roles ?? []).includes(role);
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <a href="/dashboard/users" className="text-sm text-stone-500 hover:text-stone-700">
          ← Users
        </a>
        <h1 className="text-2xl font-semibold">Module permissions</h1>
      </div>
      <p className="mt-1 text-sm text-stone-500">
        Control which roles can access each module in your factory. Owner always has full access.
        Changes take effect immediately on the next page load.
      </p>

      {error  && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700"   role="alert">{error}</p>}
      {notice && <p className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800" role="status">{notice}</p>}

      <form action={saveModulePermissions} className="mt-6">
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
                <th className="px-4 py-3 w-40">Module</th>
                {CONFIGURABLE_ROLES.map((role) => (
                  <th key={role} className="px-4 py-3 text-center">
                    {ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {configurableModules.map((mod) => (
                <tr key={mod.key} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-3 font-medium">{mod.label}</td>
                  {CONFIGURABLE_ROLES.map((role) => {
                    // If this role is not in the module's default roles, it can never have access
                    // (e.g. collector can only see weighings). Lock those cells.
                    const inDefault = mod.roles.includes(role);
                    if (!inDefault) {
                      return (
                        <td key={role} className="px-4 py-3 text-center">
                          <span className="text-xs text-stone-300">—</span>
                        </td>
                      );
                    }
                    return (
                      <td key={role} className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          name={`perm_${mod.key}_${role}`}
                          defaultChecked={isChecked(mod.key, role)}
                          className="h-4 w-4 rounded border-stone-300 text-green-600 focus:ring-green-600"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <SubmitButton
            pendingText="Saving…"
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            Save permissions
          </SubmitButton>
          <a href="/dashboard/users" className="rounded-md border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100">
            Cancel
          </a>
        </div>
      </form>

      <div className="mt-6 rounded-lg border border-stone-200 bg-stone-50 p-4 text-xs text-stone-500 space-y-1">
        <p><strong>Supervisor</strong> — operational view: weighings, suppliers, collectors. No financial data.</p>
        <p><strong>Accountant</strong> — financial view: payments and suppliers. No operational pages.</p>
        <p><strong>Collector</strong> — weighings entry only. This cannot be expanded further.</p>
        <p className="pt-1">Unchecking a cell restricts that role from the module in this factory. The nav link disappears and direct URL access redirects them home.</p>
      </div>
    </div>
  );
}
