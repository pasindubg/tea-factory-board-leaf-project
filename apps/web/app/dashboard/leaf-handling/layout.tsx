import { requireProfile } from "@/lib/profile";
import { ALL_WEB_ROLES } from "@/lib/roles";
import { LeafHandlingNav } from "./leaf-handling-nav";

// Leaf Handling hub — shared layout for the landing page. Individual
// module pages (weighings, suppliers, etc.) live at their own routes
// and are reached via the sub-nav tabs rendered here.
export default async function LeafHandlingLayout({ children }: { children: React.ReactNode }) {
  // Any authenticated web user can reach the leaf-handling hub; individual
  // module pages enforce their own stricter access via requireModuleAccess.
  await requireProfile(ALL_WEB_ROLES);
  return (
    <div>
      <h1 className="text-2xl font-semibold print:hidden">Leaf Handling</h1>
      <div className="print:hidden">
        <LeafHandlingNav />
      </div>
      {children}
    </div>
  );
}
