import { useState } from "preact/hooks";
import { addDays } from "../../../core/date";
import { Cycle } from "../../../core/cycles";
import { DayEntry, ISODate } from "../../../core/types";

interface MultiCycleOverlayChartProps {
  readonly cycles: readonly Cycle[];
  readonly entries: readonly DayEntry[];
}

const CYCLE_COLORS = ["#e06d7a", "#5ea2ef", "#9b5de5", "#00bbf9"];

export function MultiCycleOverlayChart({
  cycles,
  entries,
}: MultiCycleOverlayChartProps) {
  const [selectedPoint, setSelectedPoint] = useState<{
    readonly cycleId: number;
    readonly day: number;
    readonly temp: number;
    readonly excluded: boolean;
    readonly color: string;
  } | null>(null);

  const entriesMap = new Map<ISODate, DayEntry>();
  for (const e of entries) {
    entriesMap.set(e.date, e);
  }

  // Take the last 4 cycles
  const recentCycles = cycles.slice(-4);

  if (recentCycles.length === 0) {
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
        <p>
          📈 Çoklu döngü bindirme analizi için en az bir döngü kaydı gereklidir.
        </p>
      </div>
    );
  }

  const maxDays = Math.min(
    60,
    Math.max(32, ...recentCycles.map((c) => c.length ?? 30)),
  );
  const svgWidth = 480;
  const svgHeight = 220;
  const padLeft = 40;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 40;

  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  // Gather all temps across recent cycles for dynamic Y bounds
  const allCycleTemps: number[] = [];
  for (const cycle of recentCycles) {
    const cycleLen = Math.min(maxDays, cycle.length ?? 35);
    for (let d = 1; d <= cycleLen; d++) {
      const e = entriesMap.get(addDays(cycle.startDate, d - 1));
      if (e?.bbt?.value) allCycleTemps.push(e.bbt.value);
    }
  }

  const minTemp =
    allCycleTemps.length > 0
      ? Math.min(3610, Math.floor((Math.min(...allCycleTemps) - 10) / 20) * 20)
      : 3610;
  const maxTemp =
    allCycleTemps.length > 0
      ? Math.max(3730, Math.ceil((Math.max(...allCycleTemps) + 10) / 20) * 20)
      : 3730;

  const tempTicks: number[] = [];
  for (let t = Math.ceil(minTemp / 20) * 20; t <= maxTemp; t += 20) {
    if (t > minTemp && t < maxTemp) tempTicks.push(t);
  }

  const getY = (val: number) => {
    const clamped = Math.max(minTemp, Math.min(maxTemp, val));
    const ratio = (clamped - minTemp) / (maxTemp - minTemp);
    return padTop + plotH - ratio * plotH;
  };

  const getX = (dayIdx: number) => {
    return padLeft + ((dayIdx - 1) / (maxDays - 1)) * plotW;
  };

  // Build points for each cycle
  const series = recentCycles.map((cycle, cIdx) => {
    const cycleLen = Math.min(maxDays, cycle.length ?? 30);
    const pts: { day: number; temp: number; x: number; y: number }[] = [];
    const excPts: { day: number; temp: number; x: number; y: number }[] = [];

    for (let d = 1; d <= cycleLen; d++) {
      const curDate = addDays(cycle.startDate, d - 1);
      const entry = entriesMap.get(curDate);
      if (entry?.bbt?.value) {
        if (!entry.bbt.excluded) {
          pts.push({
            day: d,
            temp: entry.bbt.value,
            x: getX(d),
            y: getY(entry.bbt.value),
          });
        } else {
          excPts.push({
            day: d,
            temp: entry.bbt.value,
            x: getX(d),
            y: getY(entry.bbt.value),
          });
        }
      }
    }

    const pathD = pts.reduce((acc, p, i) => {
      return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
    }, "");

    return {
      cycle,
      color: CYCLE_COLORS[cIdx % CYCLE_COLORS.length]!,
      points: pts,
      excludedPoints: excPts,
      pathD,
    };
  });

  return (
    <div>
      <div style={{ width: "100%", overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{
            width: "100%",
            minWidth: "420px",
            maxWidth: "100%",
            height: "auto",
            display: "block",
          }}
        >
          {/* Ovulation window highlight band (Days 12 - 16) */}
          <rect
            x={getX(12)}
            y={padTop}
            width={getX(16) - getX(12)}
            height={plotH}
            fill="#5ea2ef"
            fillOpacity={0.07}
          />
          <text
            x={(getX(12) + getX(16)) / 2}
            y={padTop + 10}
            textAnchor="middle"
            fontSize="8"
            fill="var(--text-muted)"
            fontFamily="sans-serif"
          >
            Tipik Ovülasyon
          </text>

          {/* Grid lines and Y labels */}
          {tempTicks.map((t) => {
            const y = getY(t);
            return (
              <g key={t}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={svgWidth - padRight}
                  y2={y}
                  stroke="var(--border-subtle)"
                  strokeWidth="0.8"
                  strokeDasharray="2 3"
                />
                <text
                  x={padLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="9"
                  fill="var(--text-muted)"
                  fontFamily="sans-serif"
                >
                  {(t / 100).toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* X axis day ticks */}
          {[1, 5, 10, 14, 18, 22, 28, 32, 36, 42, 48, 56]
            .filter((d) => d <= maxDays)
            .map((day) => {
            const x = getX(day);
            return (
              <g key={day}>
                <line
                  x1={x}
                  y1={padTop + plotH}
                  x2={x}
                  y2={padTop + plotH + 4}
                  stroke="var(--border-strong)"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={padTop + plotH + 16}
                  textAnchor="middle"
                  fontSize="9"
                  fill="var(--text-muted)"
                  fontFamily="sans-serif"
                >
                  G{day}
                </text>
              </g>
            );
          })}

          {/* Draw each cycle's curve */}
          {series.map((s) => (
            <g key={s.cycle.id}>
              {s.pathD && (
                <path
                  d={s.pathD}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeOpacity={0.85}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {s.points.map((p) => (
                <circle
                  key={p.day}
                  cx={p.x}
                  cy={p.y}
                  r={
                    selectedPoint?.cycleId === s.cycle.id &&
                    selectedPoint?.day === p.day
                      ? 5.5
                      : 3.5
                  }
                  fill={s.color}
                  stroke="#ffffff"
                  strokeWidth="1"
                  role="button"
                  tabIndex={0}
                  aria-label={`${s.cycle.id}. Döngü Gün ${p.day} ${(p.temp / 100).toFixed(2)} °C`}
                  style={{ cursor: "pointer" }}
                  onClick={() =>
                    setSelectedPoint({
                      cycleId: s.cycle.id,
                      day: p.day,
                      temp: p.temp,
                      excluded: false,
                      color: s.color,
                    })
                  }
                />
              ))}
              {s.excludedPoints.map((p) => (
                <g
                  key={`exc-${p.day}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${s.cycle.id}. Döngü Gün ${p.day} ${(p.temp / 100).toFixed(2)} °C (Hariç)`}
                  style={{ cursor: "pointer" }}
                  onClick={() =>
                    setSelectedPoint({
                      cycleId: s.cycle.id,
                      day: p.day,
                      temp: p.temp,
                      excluded: true,
                      color: s.color,
                    })
                  }
                >
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="2.5"
                    fill="none"
                    stroke={s.color}
                    strokeWidth="1"
                    strokeDasharray="2 1"
                  />
                  <line
                    x1={p.x - 2}
                    y1={p.y - 2}
                    x2={p.x + 2}
                    y2={p.y + 2}
                    stroke={s.color}
                    strokeWidth="1"
                  />
                </g>
              ))}
            </g>
          ))}
        </svg>
      </div>

      {selectedPoint && (
        <div
          data-testid="overlay-point-inspector"
          style={{
            marginTop: "8px",
            padding: "8px 12px",
            backgroundColor: "var(--bg-elevated)",
            border: `1px solid ${selectedPoint.color}`,
            borderRadius: "var(--radius-sm)",
            fontSize: "12px",
            color: "var(--text-primary)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>
            <strong>{selectedPoint.cycleId}. Döngü</strong> • Gün{" "}
            {selectedPoint.day} •{" "}
            <strong>{(selectedPoint.temp / 100).toFixed(2)} °C</strong>
            {selectedPoint.excluded ? " (Hariç Tutuldu)" : ""}
          </span>
          <button
            type="button"
            onClick={() => setSelectedPoint(null)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Cycle Legend */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "14px",
          marginTop: "10px",
          fontSize: "11px",
          flexWrap: "wrap",
        }}
      >
        {series.map((s) => (
          <span
            key={s.cycle.id}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              color: "var(--text-primary)",
            }}
          >
            <span
              style={{
                width: "12px",
                height: "3px",
                backgroundColor: s.color,
                borderRadius: "2px",
              }}
            />
            {s.cycle.id}. Döngü ({s.cycle.startDate})
          </span>
        ))}
      </div>
    </div>
  );
}
