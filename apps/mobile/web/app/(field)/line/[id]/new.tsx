import { Redirect, useLocalSearchParams } from "@/runtime/navigation";

// Old deep links return to the list-owned registration panel.
export default function NewCustomer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/(field)/line/${id}?register=1`} />;
}
