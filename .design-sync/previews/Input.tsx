import { Input } from "@tea/ui";

export function Default() {
  return (
    <div style={{ padding: 16, maxWidth: 360 }}>
      <Input label="Supplier name" placeholder="e.g. Karunaratne Estate" required />
    </div>
  );
}

export function WithHint() {
  return (
    <div style={{ padding: 16, maxWidth: 360 }}>
      <Input
        label="Land size"
        type="number"
        step="0.01"
        placeholder="0.00"
        hint="Enter area in acres"
      />
    </div>
  );
}

export function WithError() {
  return (
    <div style={{ padding: 16, maxWidth: 360 }}>
      <Input
        label="Phone number"
        placeholder="+94 77 000 0000"
        error="Phone number is required"
      />
    </div>
  );
}

export function Disabled() {
  return (
    <div style={{ padding: 16, maxWidth: 360 }}>
      <Input label="NIC number" value="987654321V" disabled />
    </div>
  );
}
