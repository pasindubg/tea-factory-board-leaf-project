import { Card, CardHeader, Badge } from "@tea/ui";

export function BasicCard() {
  return (
    <div style={{ padding: 16, maxWidth: 400 }}>
      <Card>
        <p style={{ fontSize: 14, color: "#57534e" }}>
          Green leaf intake for October 2024 — 3,240 kg collected across 18 suppliers.
        </p>
      </Card>
    </div>
  );
}

export function WithHeader() {
  return (
    <div style={{ padding: 16, maxWidth: 480 }}>
      <Card>
        <CardHeader
          title="Monthly Summary"
          subtitle="October 2024"
          action={<Badge variant="success">Finalized</Badge>}
        />
        <div style={{ marginTop: 16, fontSize: 14, color: "#57534e", lineHeight: 1.6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 8, borderBottom: "1px solid #e7e5e4" }}>
            <span>Total leaf (kg)</span><span style={{ fontWeight: 500 }}>3,240</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8 }}>
            <span>Gross amount</span><span style={{ fontWeight: 500 }}>LKR 97,200</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function Paddings() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, maxWidth: 400 }}>
      <Card padding="sm"><span style={{ fontSize: 13, color: "#57534e" }}>Small padding (sm)</span></Card>
      <Card padding="md"><span style={{ fontSize: 13, color: "#57534e" }}>Default padding (md)</span></Card>
      <Card padding="lg"><span style={{ fontSize: 13, color: "#57534e" }}>Large padding (lg)</span></Card>
    </div>
  );
}
