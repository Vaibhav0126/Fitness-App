"use client";
import { Chart } from "./chart";

/* Serializable wrappers so server components can render charts. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const shortDate = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

const num = (v: number, dp: number) =>
  v.toLocaleString("en-US", { maximumFractionDigits: dp, minimumFractionDigits: dp });

export function MetricTrend({
  title,
  points,
  unit,
  decimals = 0,
  zero,
}: {
  title: string;
  points: Array<{ date: string; v: number; avg: number }>;
  unit: string;
  decimals?: number;
  zero?: boolean;
}) {
  return (
    <Chart
      title={title}
      x={points.map((p) => p.date)}
      xFormat={shortDate}
      zero={zero}
      series={[
        {
          key: "v",
          label: "Daily",
          kind: "dots",
          values: points.map((p) => p.v),
          color: "var(--muted-foreground)",
          format: (v) => `${num(v, decimals)} ${unit}`,
        },
        {
          key: "avg",
          label: "7-day avg",
          kind: "line",
          values: points.map((p) => p.avg),
          color: "var(--series-1)",
          format: (v) => `${num(v, decimals)} ${unit}`,
        },
      ]}
      legend={[
        { label: "Daily", color: "var(--muted-foreground)", kind: "dots" },
        { label: "7-day average", color: "var(--series-1)", kind: "line" },
      ]}
    />
  );
}

export function E1rmChart({
  title,
  points,
  goalE1rm,
}: {
  title: string;
  points: Array<{ date: string; e1rm: number; top: string }>;
  goalE1rm?: number | null;
}) {
  return (
    <Chart
      title={title}
      x={points.map((p) => p.date)}
      xFormat={shortDate}
      height={170}
      rule={goalE1rm ? { y: goalE1rm, label: `Goal ${Math.round(goalE1rm)} kg` } : undefined}
      series={[
        {
          key: "e1rm",
          label: "e1RM",
          kind: "line",
          values: points.map((p) => p.e1rm),
          color: "var(--series-1)",
          format: (v, i) => `${num(v, 1)} kg (best ${points[i]?.top})`,
        },
      ]}
    />
  );
}

export interface IntervalPoint {
  label: string;
  kind: "warmup" | "run" | "walk" | "cooldown";
  speed: number | null;
  hr: number | null;
  cadence: number | null;
}

const kindColor = (k: IntervalPoint["kind"]) => (k === "run" ? "var(--series-1)" : "var(--series-2)");

export function IntervalCharts({
  intervals,
  targets,
}: {
  intervals: IntervalPoint[];
  targets: {
    speedKmhMin: number;
    speedKmhMax: number;
    hrCap: number;
    cadenceMin: number;
    cadenceMax: number;
  };
}) {
  const x = intervals.map((i) => i.label);
  const legend = [
    { label: "Run", color: "var(--series-1)", kind: "bar" as const },
    { label: "Walk / warm-up / cool-down", color: "var(--series-2)", kind: "bar" as const },
    { label: "Target", color: "var(--chart-band)", kind: "band" as const },
  ];
  const color = (i: number) => kindColor(intervals[i]!.kind);
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Chart
        title="Speed per interval"
        x={x}
        height={180}
        band={{ lo: targets.speedKmhMin, hi: targets.speedKmhMax, label: "Target speed" }}
        legend={legend}
        series={[
          {
            key: "speed",
            label: "Speed",
            kind: "bar",
            values: intervals.map((i) => i.speed),
            color,
            format: (v) => `${num(v, 1)} km/h`,
          },
        ]}
      />
      <Chart
        title="Max heart rate per interval"
        x={x}
        height={180}
        zero={false}
        rule={{ y: targets.hrCap, label: `Cap ${targets.hrCap}` }}
        series={[
          {
            key: "hr",
            label: "Max HR",
            kind: "bar",
            values: intervals.map((i) => i.hr),
            color,
            format: (v) => `${Math.round(v)} bpm`,
          },
        ]}
      />
      {intervals.some((i) => i.cadence != null && i.kind === "run") ? (
        <Chart
          title="Cadence per run interval"
          x={intervals.filter((i) => i.kind === "run").map((i) => i.label)}
          height={160}
          zero={false}
          band={{ lo: targets.cadenceMin, hi: targets.cadenceMax, label: "Target cadence" }}
          series={[
            {
              key: "cad",
              label: "Cadence",
              kind: "bar",
              values: intervals.filter((i) => i.kind === "run").map((i) => i.cadence),
              color: "var(--series-1)",
              format: (v) => `${Math.round(v)} spm`,
            },
          ]}
        />
      ) : null}
    </div>
  );
}
