"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function IntakeChart({ data }: { data: { day: string; kg: number }[] }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const hasIntake = data.some((point) => point.kg > 0);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <StaticIntakeChart data={data} hasIntake={hasIntake} />;
  }

  const isDark = resolvedTheme === "dark";
  const grid = isDark ? "#42493f" : "#dfe4da";
  const muted = isDark ? "#aeb7aa" : "#667062";
  const primary = isDark ? "#9dd67d" : "#386a20";

  return (
    <div className="relative h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="intakeFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={primary} stopOpacity={0.38} />
              <stop offset="95%" stopColor={primary} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 5" vertical={false} stroke={grid} opacity={0.72} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} dy={10} fontSize={12} tick={{ fill: muted }} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={54}
            fontSize={12}
            tick={{ fill: muted }}
            tickFormatter={(value) => `${value} kg`}
          />
          <Tooltip
            formatter={(value) => [`${Number(value).toFixed(2)} kg`, "Leaf intake"]}
            cursor={{ stroke: primary, strokeWidth: 1, strokeDasharray: "4 4" }}
            contentStyle={{
              background: isDark ? "#232820" : "#ffffff",
              border: `1px solid ${grid}`,
              borderRadius: "16px",
              boxShadow: "0 12px 30px rgba(0,0,0,.16)",
            }}
            labelStyle={{ color: isDark ? "#e1e4dc" : "#191d17", fontWeight: 600 }}
          />
          <Area
            type="monotone"
            dataKey="kg"
            stroke={primary}
            strokeWidth={3}
            fill="url(#intakeFill)"
            activeDot={{ r: 6, fill: primary, stroke: isDark ? "#10140e" : "#ffffff", strokeWidth: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
      {!hasIntake && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-8">
          <div className="rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-stone-500 shadow-sm backdrop-blur dark:bg-stone-800/90 dark:text-stone-300">
            No intake recorded in this period
          </div>
        </div>
      )}
    </div>
  );
}

function StaticIntakeChart({ data, hasIntake }: { data: { day: string; kg: number }[]; hasIntake: boolean }) {
  const width = 720;
  const height = 240;
  const left = 54;
  const right = 18;
  const top = 22;
  const bottom = 42;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const max = Math.max(1, ...data.map((point) => point.kg));
  const points = data.map((point, index) => ({
    ...point,
    x: left + (data.length <= 1 ? chartWidth / 2 : (index / (data.length - 1)) * chartWidth),
    y: top + chartHeight - (point.kg / max) * chartHeight,
  }));
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = points.length ? `${line} L${points.at(-1)!.x.toFixed(1)},${top + chartHeight} L${points[0].x.toFixed(1)},${top + chartHeight} Z` : "";

  return (
    <div className="relative h-64 w-full sm:h-72" role="img" aria-label={hasIntake ? "Leaf intake over the last seven days" : "No leaf intake recorded in the last seven days"}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="staticIntakeFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="[stop-color:#386a20] dark:[stop-color:#9dd67d]" stopOpacity="0.34" />
            <stop offset="100%" className="[stop-color:#386a20] dark:[stop-color:#9dd67d]" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((ratio) => {
          const y = top + chartHeight * ratio;
          return <line key={ratio} x1={left} x2={width - right} y1={y} y2={y} className="stroke-stone-200 dark:stroke-stone-700" strokeDasharray="4 5" />;
        })}
        {area && <path d={area} fill="url(#staticIntakeFill)" />}
        {line && <path d={line} fill="none" className="stroke-green-800 dark:stroke-green-300" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
        {points.map((point) => (
          <g key={point.day}>
            <circle cx={point.x} cy={point.y} r="4" className="fill-green-700 stroke-white dark:fill-green-300 dark:stroke-stone-900" strokeWidth="2" />
            <text x={point.x} y={height - 13} textAnchor="middle" className="fill-stone-500 text-[11px] dark:fill-stone-400">{point.day}</text>
          </g>
        ))}
        <text x={left - 8} y={top + 4} textAnchor="end" className="fill-stone-500 text-[10px] dark:fill-stone-400">{max.toFixed(0)} kg</text>
        <text x={left - 8} y={top + chartHeight + 4} textAnchor="end" className="fill-stone-500 text-[10px] dark:fill-stone-400">0 kg</text>
      </svg>
      {!hasIntake && (
        <div className="absolute inset-0 flex items-center justify-center pb-8">
          <div className="rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-stone-500 shadow-sm backdrop-blur dark:bg-stone-800/90 dark:text-stone-300">No intake recorded in this period</div>
        </div>
      )}
    </div>
  );
}
