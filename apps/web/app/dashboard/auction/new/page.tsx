import { redirect } from "next/navigation";

/** Broker-invoice creation is owned by the framework list's built-in New action. */
export default function LegacyNewBrokerInvoicePage() {
  redirect("/dashboard/auction");
}
