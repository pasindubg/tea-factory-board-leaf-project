"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function IntakeChart({ data }: { data: { day: string; kg: number }[] }) {
  return (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
          <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} />
          <Tooltip formatter={(value) => [`${Number(value).toFixed(2)} kg`, "Intake"]} cursor={{ fill: "#f5f5f4" }} />
          <Bar dataKey="kg" fill="#15803d" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
