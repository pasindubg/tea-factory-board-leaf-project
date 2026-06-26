import { Alert } from "@tea/ui";

export function AllVariants() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, maxWidth: 480 }}>
      <Alert variant="error">NIC number already exists for another supplier.</Alert>
      <Alert variant="success">Weighing recorded successfully for Karunaratne Estate.</Alert>
      <Alert variant="warning">Tier assignment expires in 3 days — review quality data.</Alert>
      <Alert variant="info">Payments are generated at end of month.</Alert>
    </div>
  );
}
