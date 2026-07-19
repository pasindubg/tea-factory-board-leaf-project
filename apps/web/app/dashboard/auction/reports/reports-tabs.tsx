"use client";

import type { ReactNode } from "react";
import { TabView } from "@tea/ui";

export function ReportsTabs({ overview, upload }: { overview: ReactNode; upload: ReactNode }) {
  return <TabView label="Report reconciliation views" tabs={[
    { id: "overview", label: "Settlement overview", content: overview },
    { id: "upload", label: "Upload & review documents", content: upload },
  ]} />;
}
