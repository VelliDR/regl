import { addDays } from "../../../core/date";
import { Cycle } from "../../../core/cycles";
import { DayEntry, ISODate } from "../../../core/types";

interface BleedingFlowChartProps {
  readonly cycles: readonly Cycle[];
  readonly entries: readonly DayEntry[];
}

export function BleedingFlowChart({ cycles, entries }: BleedingFlowChartProps) {
  if (cycles.length === 0) {
    return (
      <div
        style={{
          padding: "24px 16px",
          textAlign: "center",
          backgroundColor: "var(--bg-elevated)",
          borderRadius: "var(--radius-sm)",
          color: "var(--text-muted)",
          fontSize: "13px",
        }}
      >
        <p>🩸 Kanama akış profili için kayıtlı döngü verisi toplanıyor.</p>
      </div>
    );
  }

  const entriesMap = new Map<ISODate, DayEntry>();
  for (const e of entries) {
    entriesMap.set(e.date, e);
  }

  // Aggregate days 1 to 7 for all cycles
  const maxDay = 7;
  const distribution: {
    day: number;
    heavy: number;
    medium: number;
    light: number;
    spotting: number;
    total: number;
  }[] = [];

  for (let d = 1; d <= maxDay; d++) {
    distribution.push({
      day: d,
      heavy: 0,
      medium: 0,
      light: 0,
      spotting: 0,
      total: 0,
    });
  }

  for (const cycle of cycles) {
    const cycleLen = cycle.length ?? 30;
    const daysToCheck = Math.min(maxDay, cycleLen);

    for (let d = 1; d <= daysToCheck; d++) {
      const curDate = addDays(cycle.startDate, d - 1);
      const entry = entriesMap.get(curDate);
      if (!entry || !entry.bleeding) continue;

      const slot = distribution[d - 1]!;
      slot.total += 1;
      if (entry.bleeding === "heavy") slot.heavy += 1;
      else if (entry.bleeding === "medium") slot.medium += 1;
      else if (entry.bleeding === "light") slot.light += 1;
      else if (entry.bleeding === "spotting") slot.spotting += 1;
    }
  }

  const maxTotal = Math.max(1, ...distribution.map((d) => d.total));

  const svgWidth = 440;
  const svgHeight = 160;
  const padLeft = 30;
  const padRight = 16;
  const padTop = 15;
  const padBottom = 28;

  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;
  const barWidth = Math.min(36, plotW / maxDay - 12);

  return (
    <div>
      <div style={{ width: "100%", overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{
            width: "100%",
            maxWidth: "100%",
            height: "auto",
            display: "block",
          }}
        >
          {/* Horizontal grid lines */}
          {[0.25, 0.5, 0.75, 1].map((pct) => {
            const y = padTop + plotH * (1 - pct);
            return (
              <line
                key={pct}
                x1={padLeft}
                y1={y}
                x2={svgWidth - padRight}
                y2={y}
                stroke="var(--border-subtle)"
                strokeWidth="0.8"
                strokeDasharray="2 3"
              />
            );
          })}

          {distribution.map((d, i) => {
            const cx = padLeft + (i + 0.5) * (plotW / maxDay);
            const x = cx - barWidth / 2;

            if (d.total === 0) {
              return (
                <g key={d.day}>
                  <text
                    x={cx}
                    y={svgHeight - 10}
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--text-muted)"
                    fontFamily="sans-serif"
                  >
                    {d.day}. Gün
                  </text>
                </g>
              );
            }

            const totalH = (d.total / maxTotal) * plotH;
            const hHeavy = (d.heavy / d.total) * totalH;
            const hMedium = (d.medium / d.total) * totalH;
            const hLight = (d.light / d.total) * totalH;
            const hSpotting = (d.spotting / d.total) * totalH;

            let curY = padTop + plotH;

            // Stack upwards: heavy -> medium -> light -> spotting
            const rects = [];

            if (hHeavy > 0) {
              curY -= hHeavy;
              rects.push(
                <rect
                  key="heavy"
                  x={x}
                  y={curY}
                  width={barWidth}
                  height={hHeavy}
                  fill="#b82638"
                />,
              );
            }
            if (hMedium > 0) {
              curY -= hMedium;
              rects.push(
                <rect
                  key="medium"
                  x={x}
                  y={curY}
                  width={barWidth}
                  height={hMedium}
                  fill="#e06d7a"
                />,
              );
            }
            if (hLight > 0) {
              curY -= hLight;
              rects.push(
                <rect
                  key="light"
                  x={x}
                  y={curY}
                  width={barWidth}
                  height={hLight}
                  fill="#f4a261"
                />,
              );
            }
            if (hSpotting > 0) {
              curY -= hSpotting;
              rects.push(
                <rect
                  key="spotting"
                  x={x}
                  y={curY}
                  width={barWidth}
                  height={hSpotting}
                  fill="#e9c46a"
                  rx={2}
                />,
              );
            }

            return (
              <g key={d.day}>
                {rects}
                <text
                  x={cx}
                  y={curY - 4}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="600"
                  fill="var(--text-primary)"
                  fontFamily="sans-serif"
                >
                  {d.total}
                </text>
                <text
                  x={cx}
                  y={svgHeight - 10}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--text-secondary)"
                  fontWeight="600"
                  fontFamily="sans-serif"
                >
                  {d.day}. Gün
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "14px",
          marginTop: "8px",
          fontSize: "11px",
          color: "var(--text-secondary)",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
        >
          <span
            style={{
              width: "10px",
              height: "10px",
              backgroundColor: "#b82638",
              borderRadius: "2px",
            }}
          />
          Yoğun
        </span>
        <span
          style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
        >
          <span
            style={{
              width: "10px",
              height: "10px",
              backgroundColor: "#e06d7a",
              borderRadius: "2px",
            }}
          />
          Orta
        </span>
        <span
          style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
        >
          <span
            style={{
              width: "10px",
              height: "10px",
              backgroundColor: "#f4a261",
              borderRadius: "2px",
            }}
          />
          Hafif
        </span>
        <span
          style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
        >
          <span
            style={{
              width: "10px",
              height: "10px",
              backgroundColor: "#e9c46a",
              borderRadius: "2px",
            }}
          />
          Leke
        </span>
      </div>
    </div>
  );
}
