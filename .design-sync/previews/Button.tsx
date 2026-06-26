import { Button } from "@tea/ui";

export function PrimaryVariants() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 16, flexWrap: "wrap" }}>
      <Button variant="primary" size="sm">Small</Button>
      <Button variant="primary" size="md">Save Changes</Button>
      <Button variant="primary" size="lg">Get Started</Button>
    </div>
  );
}

export function AllVariants() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 16, flexWrap: "wrap" }}>
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Delete</Button>
    </div>
  );
}

export function States() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 16 }}>
      <Button variant="primary">Normal</Button>
      <Button variant="primary" loading>Saving…</Button>
      <Button variant="primary" disabled>Disabled</Button>
    </div>
  );
}
