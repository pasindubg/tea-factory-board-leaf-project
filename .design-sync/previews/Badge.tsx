import { Badge } from "@tea/ui";

export function AllVariants() {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", padding: 16, flexWrap: "wrap" }}>
      <Badge variant="default">Default</Badge>
      <Badge variant="success">Paid</Badge>
      <Badge variant="warning">Pending</Badge>
      <Badge variant="danger">Overdue</Badge>
      <Badge variant="info">Superleaf</Badge>
      <Badge variant="muted">Draft</Badge>
    </div>
  );
}

export function InContext() {
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14, color: "#44403c" }}>Karunaratne Estate</span>
        <Badge variant="success">Paid</Badge>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14, color: "#44403c" }}>Perera Suppliers</span>
        <Badge variant="warning">Pending</Badge>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14, color: "#44403c" }}>Silva Estate</span>
        <Badge variant="info">Superleaf</Badge>
      </div>
    </div>
  );
}
