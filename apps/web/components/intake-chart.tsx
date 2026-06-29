"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function IntakeChart({ data }: { data: { day: string; kg: number }[] }) {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Avoid hydration mismatch — recharts renders differently between SSR and
  // client (SVG dimensions, theme-dependent colors). Render a placeholder
  // during SSR; the real chart appears after mount.
  if (!mounted) {
    return <div className="h-60 w-full rounded-lg bg-stone-100 dark:bg-stone-800" />;
  }

  const isDark = theme === "dark";

  return (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke={isDark ? "#44403c" : "#e7e5e4"}
          />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            fontSize={12}
            tick={{ fill: isDark ? "#a8a29e" : "#78716c" }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            fontSize={12}
            width={48}
            tick={{ fill: isDark ? "#a8a29e" : "#78716c" }}
          />
          <Tooltip
            formatter={(value) => [`${Number(value).toFixed(2)} kg`, "Intake"]}
            cursor={{ fill: isDark ? "#292524" : "#f5f5f4" }}
            contentStyle={{
              background: isDark ? "#1c1917" : "#fff",
              border: isDark ? "1px solid #44403c" : "1px solid #e7e5e4",
              borderRadius: "6px",
            }}
          />
          <Bar dataKey="kg" fill={isDark ? "#22c55e" : "#15803d"} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
