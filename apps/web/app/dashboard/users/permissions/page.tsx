import Link from "next/link";
import { loadListResource } from "@/lib/list-resource-registry";
import { PermissionsMatrix } from "./permissions-matrix";

export default async function PermissionsPage() {
  const permissionResource = await loadListResource({ key: "users.module-permissions" });
  if (!permissionResource.ok) throw new Error(permissionResource.error);

  return (
    <div>
      <div className="flex items-center gap-3">
        <Link href="/dashboard/users" className="text-sm text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200">
          ← Users
        </Link>
        <h1 className="text-2xl font-semibold">Module permissions</h1>
      </div>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
        Control which roles can access each module in your factory. Owner always has full access.
      </p>

      <div className="mt-6">
        <PermissionsMatrix initialRows={permissionResource.rows} />
      </div>

      <div className="mt-6 space-y-1 rounded-lg border border-stone-200 bg-stone-50 p-4 text-xs text-stone-500 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-400">
        <p><strong>Supervisor</strong> — operational view: weighings, suppliers, collectors. No financial data.</p>
        <p><strong>Accountant</strong> — financial view: payments and suppliers. No operational pages.</p>
        <p><strong>Collector</strong> — weighings entry only. This cannot be expanded further.</p>
        <p className="pt-1">Unchecking a cell restricts that role from the module in this factory. Navigation and direct page access use the same permission.</p>
      </div>
    </div>
  );
}
