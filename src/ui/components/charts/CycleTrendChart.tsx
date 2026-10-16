import { Cycle } from "../../../core/cycles";

interface CycleTrendChartProps {
  readonly cycles: readonly Cycle[];
  readonly medianLength: number;
}

export function CycleTrendChart({
  cycles,
  medianLength,
}: CycleTrendChartProps) {
  const validCycles = cycles.filter((c) => c.length !== undefined);

  if (validCycles.length < 2) {
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
        <p>📈 Döngü trend çizgisi için en az 2 tamamlanmış döngü gereklidir.</p>
      </div>
    );
  }

  // Display at most the last 10 cycles
  const displayCycles = validCycles.slice(-10);
  const lengths = displayCycles.map((c) => c.length!);

  const minLen = Math.min(20, ...lengths);
  const maxLen = Math.max(42, ...lengths);

  const svgWidth = 440;
  const svgHeight = 180;
  const padLeft = 36;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 30;

  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const getY = (len: number) => {
    const clamped = Math.max(minLen, Math.min(maxLen, len));
    const ratio = (clamped - minLen) / (maxLen - minLen);
    return padTop + plotH - ratio * plotH;
  };

  const getX = (idx: number) => {
    if (displayCycles.length === 1) return padLeft + plotW / 2;
    return padLeft + (idx / (displayCycles.length - 1)) * plotW;
  };

  // Normal range corridor: 24 to 35 days
  const yNormalTop = getY(35);
  const yNormalBottom = getY(24);
  const normalHeight = Math.max(0, yNormalBottom - yNormalTop);

  // Line points
  const points = displayCycles.map((c, i) => ({
    x: getX(i),
    y: getY(c.length!),
    len: c.length!,
    id: c.id,
    isOutlier: c.isOutlier,
  }));

  const pathD = points.reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, "");

  const yMedian = getY(medianLength);

  const shortest = Math.min(...lengths);
  const longest = Math.max(...lengths);
  const spread = longest - shortest;

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
          {/* Normal healthy range shaded corridor (24-35 days) */}
          <rect
            x={padLeft}
            y={yNormalTop}
            width={plotW}
            height={normalHeight}
            fill="#5ea2ef"
            fillOpacity={0.08}
            rx={4}
          />
          <text
            x={svgWidth - padRight - 4}
            y={yNormalTop + 12}
            textAnchor="end"
            fontSize="9"
            fill="var(--text-muted)"
            fontFamily="sans-serif"
          >
            Normal Aralık (24-35g)
          </text>

          {/* Median line */}
          <line
            x1={padLeft}
            y1={yMedian}
            x2={svgWidth - padRight}
            y2={yMedian}
            stroke="#b84d62"
            strokeDasharray="4 3"
            strokeWidth="1.2"
            strokeOpacity={0.7}
          />
          <text
            x={padLeft + 4}
            y={yMedian - 4}
            fontSize="9"
            fill="#b84d62"
            fontWeight="600"
            fontFamily="sans-serif"
          >
            Medyan: {medianLength}g
          </text>

          {/* Grid lines and Y labels */}
          {[20, 28, 35, 40].map((val) => {
            if (val < minLen || val > maxLen) return null;
            const y = getY(val);
            return (
              <g key={val}>
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
                  {val}
                </text>
              </g>
            );
          })}

          {/* Trend line */}
          <path
            d={pathD}
            fill="none"
            stroke="var(--accent-primary)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Points */}
          {points.map((p) => (
            <g key={p.id}>
              <circle
                cx={p.x}
                cy={p.y}
                r="4.5"
                fill={p.isOutlier ? "var(--accent-primary)" : "#ffffff"}
                stroke={p.isOutlier ? "#ffffff" : "var(--accent-primary)"}
                strokeWidth="2"
              />
              <text
                x={p.x}
                y={p.y - 8}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill="var(--text-primary)"
                fontFamily="sans-serif"
              >
                {p.len}
              </text>
              <text
                x={p.x}
                y={svgHeight - 10}
                textAnchor="middle"
                fontSize="9"
                fill="var(--text-muted)"
                fontFamily="sans-serif"
              >
                #{p.id}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* Statistical Summary Pills */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "8px",
          marginTop: "12px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            backgroundColor: "var(--bg-elevated)",
            padding: "8px",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <span
            style={{
              fontSize: "11px",
              color: "var(--text-muted)",
              display: "block",
            }}
          >
            En Kısa
          </span>
          <strong style={{ fontSize: "14px", color: "var(--text-primary)" }}>
            {shortest} gün
          </strong>
        </div>
        <div
          style={{
            backgroundColor: "var(--bg-elevated)",
            padding: "8px",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <span
            style={{
              fontSize: "11px",
              color: "var(--text-muted)",
              display: "block",
            }}
          >
            En Uzun
          </span>
          <strong style={{ fontSize: "14px", color: "var(--text-primary)" }}>
            {longest} gün
          </strong>
        </div>
        <div
          style={{
            backgroundColor: "var(--bg-elevated)",
            padding: "8px",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <span
            style={{
              fontSize: "11px",
              color: "var(--text-muted)",
              display: "block",
            }}
          >
            Değişkenlik (Yayılım)
          </span>
          <strong
            style={{
              fontSize: "14px",
              color:
                spread <= 4 ? "var(--fertile-color)" : "var(--accent-primary)",
            }}
          >
            {spread} gün
          </strong>
        </div>
      </div>
    </div>
  );
}
