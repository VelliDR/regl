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

  const maxDays = 32;
  const svgWidth = 480;
  const svgHeight = 220;
  const padLeft = 40;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 40;

  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const minTemp = 3610; // 36.10 °C
  const maxTemp = 3730; // 37.30 °C

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

    for (let d = 1; d <= cycleLen; d++) {
      const curDate = addDays(cycle.startDate, d - 1);
      const entry = entriesMap.get(curDate);
      if (entry?.bbt?.value && !entry.bbt.excluded) {
        pts.push({
          day: d,
          temp: entry.bbt.value,
          x: getX(d),
          y: getY(entry.bbt.value),
        });
      }
    }

    const pathD = pts.reduce((acc, p, i) => {
      return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
    }, "");

    return {
      cycle,
      color: CYCLE_COLORS[cIdx % CYCLE_COLORS.length]!,
      points: pts,
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
          {[3620, 3640, 3660, 3680, 3700, 3720].map((t) => {
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
          {[1, 5, 10, 14, 18, 22, 28, 32].map((day) => {
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
                <circle key={p.day} cx={p.x} cy={p.y} r="3" fill={s.color} />
              ))}
            </g>
          ))}
        </svg>
      </div>

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
