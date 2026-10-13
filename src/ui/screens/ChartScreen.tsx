import { useState } from "preact/hooks";
import { entriesSignal, evaluationSignal } from "../../app/state";
import { addDays, daysBetween } from "../../core/date";
import { evaluateCycleState } from "../../core/evaluate";
import { deriveMucusCategory } from "../../core/sensiplan/mucus";
import { DayEntry, ISODate } from "../../core/types";
import { MultiCycleOverlayChart } from "../components/charts/MultiCycleOverlayChart";

export function ChartScreen() {
  const evaluation = evaluationSignal.value;
  const allEntries = entriesSignal.value;

  const cycles = evaluation.activeCycle
    ? [...evaluation.completedCycles, evaluation.activeCycle]
    : evaluation.completedCycles;

  const [selectedCycleId, setSelectedCycleId] = useState<number | undefined>(
    evaluation.activeCycle?.id ?? cycles[cycles.length - 1]?.id,
  );
  const [viewMode, setViewMode] = useState<"single" | "overlay">("single");

  const activeCycle =
    cycles.find((c) => c.id === selectedCycleId) ?? evaluation.activeCycle;

  if (!activeCycle) {
    return (
      <div
        style={{
          padding: "32px 16px",
          textAlign: "center",
          color: "var(--text-muted)",
        }}
      >
        <p>Görselleştirilecek kayıtlı döngü bulunamadı.</p>
      </div>
    );
  }

  // Calculate cycle days from cycle.startDate to cycle.endDate (or last recorded day)
  const cycleStartDate = activeCycle.startDate;
  const cycleEndDate = activeCycle.endDate ?? addDays(cycleStartDate, 35);
  const totalDays = Math.min(
    45,
    Math.max(15, daysBetween(cycleStartDate, cycleEndDate) + 1),
  );

  // Entries belonging to this cycle
  const cycleDays: {
    dayIndex: number;
    date: ISODate;
    entry?: DayEntry | undefined;
  }[] = [];
  const entriesMap = new Map<ISODate, DayEntry>();
  for (const e of allEntries) {
    entriesMap.set(e.date, e);
  }

  for (let d = 0; d < totalDays; d++) {
    const curDate = addDays(cycleStartDate, d);
    cycleDays.push({
      dayIndex: d + 1,
      date: curDate,
      entry: entriesMap.get(curDate),
    });
  }

  // Sensiplan evaluation for this specific cycle
  const cycleEval = evaluateCycleState(allEntries, cycleStartDate, {
    trackingMode: "symptothermal",
  });
  const sensi = cycleEval.sensiplan;

  // Chart dimensions & scaling
  const chartWidth = Math.max(500, totalDays * 28 + 60);
  const chartHeight = 260;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 65;

  const graphWidth = chartWidth - paddingLeft - paddingRight;
  const graphHeight = chartHeight - paddingTop - paddingBottom;

  // Temperature scale: 36.00 °C (3600) to 37.40 °C (3740)
  const minTemp = 3600;
  const maxTemp = 3740;

  const getYForTemp = (temp: number) => {
    const clamped = Math.max(minTemp, Math.min(maxTemp, temp));
    const ratio = (clamped - minTemp) / (maxTemp - minTemp);
    return paddingTop + graphHeight - ratio * graphHeight;
  };

  const getXForDayIndex = (dayIdx: number) => {
    return paddingLeft + ((dayIdx - 1) / (totalDays - 1)) * graphWidth;
  };

  // Temperature data points
  const points: {
    x: number;
    y: number;
    temp: number;
    date: ISODate;
    excluded: boolean;
    dayIdx: number;
  }[] = [];
  for (const cd of cycleDays) {
    if (cd.entry?.bbt) {
      points.push({
        x: getXForDayIndex(cd.dayIndex),
        y: getYForTemp(cd.entry.bbt.value),
        temp: cd.entry.bbt.value,
        date: cd.date,
        excluded: cd.entry.bbt.excluded ?? false,
        dayIdx: cd.dayIndex,
      });
    }
  }

  // Build SVG path
  const pathD = points
    .filter((p) => !p.excluded)
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const coverlineY = sensi?.temperature.coverline
    ? getYForTemp(sensi.temperature.coverline)
    : undefined;

  return (
    <div
      style={{
        padding: "16px",
        maxWidth: "600px",
        margin: "0 auto",
        paddingBottom: "90px",
      }}
    >
      {/* Header and Cycle Selector */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <h2
          style={{
            fontSize: "18px",
            fontWeight: "800",
            color: "var(--text-primary)",
          }}
        >
          📈 Semptotermal Döngü Grafiği
        </h2>
        {viewMode === "single" && cycles.length > 1 && (
          <select
            value={selectedCycleId}
            onChange={(e) =>
              setSelectedCycleId(Number((e.target as HTMLSelectElement).value))
            }
            style={{
              padding: "6px 10px",
              backgroundColor: "var(--bg-elevated)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              fontSize: "13px",
              fontWeight: "600",
            }}
          >
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id}. Döngü ({c.startDate})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Segmented View Mode Toggle */}
      <div
        style={{
          display: "flex",
          backgroundColor: "var(--bg-elevated)",
          borderRadius: "var(--radius-sm)",
          padding: "4px",
          marginBottom: "16px",
          gap: "4px",
        }}
      >
        <button
          type="button"
          onClick={() => setViewMode("single")}
          style={{
            flex: 1,
            padding: "8px",
            backgroundColor:
              viewMode === "single" ? "var(--bg-surface)" : "transparent",
            color:
              viewMode === "single"
                ? "var(--text-primary)"
                : "var(--text-muted)",
            fontWeight: viewMode === "single" ? "700" : "500",
            border: "none",
            borderRadius: "var(--radius-xs)",
            fontSize: "12px",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          🔍 Detaylı Sensiplan
        </button>
        <button
          type="button"
          onClick={() => setViewMode("overlay")}
          style={{
            flex: 1,
            padding: "8px",
            backgroundColor:
              viewMode === "overlay" ? "var(--bg-surface)" : "transparent",
            color:
              viewMode === "overlay"
                ? "var(--text-primary)"
                : "var(--text-muted)",
            fontWeight: viewMode === "overlay" ? "700" : "500",
            border: "none",
            borderRadius: "var(--radius-xs)",
            fontSize: "12px",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          📊 Çoklu Döngü Bindirme
        </button>
      </div>

      {viewMode === "overlay" ? (
        <section
          style={{
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-md)",
            padding: "16px",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <h3
            style={{
              fontSize: "15px",
              fontWeight: "700",
              color: "var(--text-primary)",
              marginBottom: "4px",
            }}
          >
            Ateş Eğrilerinin Karşılaştırılması
          </h3>
          <p
            style={{
              fontSize: "12px",
              color: "var(--text-muted)",
              marginBottom: "14px",
            }}
          >
            Son döngülerin bazal vücut ısısı ölçümlerini döngü günlerine göre
            üst üste bindirerek ovülasyon düzenini inceleyin.
          </p>
          <MultiCycleOverlayChart cycles={cycles} entries={allEntries} />
        </section>
      ) : (
        <>
          {/* Sensiplan Clinical Explanation Card ("Neden?" Kartı) */}
          {sensi && (
            <section
              style={{
                backgroundColor: "var(--bg-surface)",
                borderRadius: "var(--radius-md)",
                padding: "14px 16px",
                border: `1px solid ${sensi.overallFertilityState === "infertile" ? "var(--fertile-color)" : "var(--accent-primary)"}`,
                marginBottom: "16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "6px",
                }}
              >
                <span style={{ fontSize: "18px" }}>
                  {sensi.overallFertilityState === "infertile" ? "🛡️" : "🌿"}
                </span>
                <strong
                  style={{ fontSize: "14px", color: "var(--text-primary)" }}
                >
                  Klinik Durum:{" "}
                  {sensi.overallFertilityState === "infertile"
                    ? "Luteal Kısır Dönem (Geç Ovülasyon)"
                    : "Doğurgan Dönem (Pencere Açık)"}
                </strong>
              </div>
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                  lineHeight: "1.5",
                }}
              >
                {sensi.activeRuleExplanation}
              </p>
            </section>
          )}

          {/* Responsive Horizontal Scroll Container for SVG */}
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)",
              padding: "12px 8px",
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <svg
              width={chartWidth}
              height={chartHeight}
              style={{ display: "block" }}
            >
              {/* Y Axis Grid lines (every 0.20 °C) */}
              {[3620, 3640, 3660, 3680, 3700, 3720].map((t) => {
                const y = getYForTemp(t);
                return (
                  <g key={t}>
                    <line
                      x1={paddingLeft}
                      y1={y}
                      x2={chartWidth - paddingRight}
                      y2={y}
                      stroke="var(--border-subtle)"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                    />
                    <text
                      x={paddingLeft - 8}
                      y={y + 4}
                      fill="var(--text-muted)"
                      fontSize="10"
                      textAnchor="end"
                    >
                      {(t / 100).toFixed(1)}
                    </text>
                  </g>
                );
              })}

              {/* Sensiplan Coverline Line [T1] */}
              {coverlineY && (
                <g>
                  <line
                    x1={paddingLeft}
                    y1={coverlineY}
                    x2={chartWidth - paddingRight}
                    y2={coverlineY}
                    stroke="var(--accent-primary)"
                    strokeWidth="2"
                    strokeDasharray="4 3"
                  />
                  <text
                    x={chartWidth - paddingRight}
                    y={coverlineY - 6}
                    fill="var(--accent-primary)"
                    fontSize="10"
                    fontWeight="700"
                    textAnchor="end"
                  >
                    Kaplama Çizgisi (
                    {((sensi?.temperature.coverline ?? 0) / 100).toFixed(2)} °C)
                  </text>
                </g>
              )}

              {/* Connected temperature polyline */}
              {pathD && (
                <path
                  d={pathD}
                  fill="none"
                  stroke="#5ea2ef"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Temperature Measurement Circles */}
              {points.map((p) => {
                const isHigh =
                  sensi?.temperature.highDates.includes(p.date) ?? false;
                const highIndex =
                  isHigh && sensi
                    ? sensi.temperature.highDates.indexOf(p.date) + 1
                    : undefined;

                return (
                  <g key={p.date}>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={p.excluded ? 3.5 : 5}
                      fill={
                        p.excluded
                          ? "none"
                          : isHigh
                            ? "var(--fertile-color)"
                            : "#5ea2ef"
                      }
                      stroke={p.excluded ? "var(--text-muted)" : "#ffffff"}
                      strokeWidth="1.5"
                      strokeDasharray={p.excluded ? "2 2" : undefined}
                    />
                    {p.excluded && (
                      <line
                        x1={p.x - 3}
                        y1={p.y - 3}
                        x2={p.x + 3}
                        y2={p.y + 3}
                        stroke="var(--accent-primary)"
                        strokeWidth="1.5"
                      />
                    )}
                    {/* 1HM, 2HM, 3HM Labels */}
                    {highIndex && (
                      <text
                        x={p.x}
                        y={p.y - 10}
                        fill="var(--fertile-color)"
                        fontSize="11"
                        fontWeight="800"
                        textAnchor="middle"
                      >
                        {highIndex}
                      </text>
                    )}
                    {/* Parentheses for excluded measurement [T6] */}
                    {p.excluded && (
                      <text
                        x={p.x}
                        y={p.y - 8}
                        fill="var(--text-muted)"
                        fontSize="10"
                        textAnchor="middle"
                      >
                        ( )
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Bottom X Axis Days and Mucus Strip */}
              {cycleDays.map((cd) => {
                const x = getXForDayIndex(cd.dayIndex);
                const mucusCat = cd.entry?.mucus
                  ? deriveMucusCategory(
                      cd.entry.mucus.sensation,
                      cd.entry.mucus.appearance,
                    )
                  : undefined;

                const isPeak = sensi?.mucus.peakDayDate === cd.date;
                const isBleeding = cd.entry?.bleeding;

                return (
                  <g key={cd.dayIndex}>
                    {/* Cycle Day Number */}
                    <text
                      x={x}
                      y={chartHeight - 45}
                      fill="var(--text-secondary)"
                      fontSize="10"
                      fontWeight="600"
                      textAnchor="middle"
                    >
                      {cd.dayIndex}
                    </text>

                    {/* Bleeding indicator */}
                    {isBleeding && (
                      <rect
                        x={x - 4}
                        y={chartHeight - 38}
                        width="8"
                        height="8"
                        rx="2"
                        fill="var(--accent-primary)"
                      />
                    )}

                    {/* Mucus category symbol [M1] */}
                    {mucusCat && (
                      <text
                        x={x}
                        y={chartHeight - 16}
                        fill={
                          isPeak ? "var(--fertile-color)" : "var(--text-muted)"
                        }
                        fontSize="10"
                        fontWeight={isPeak ? "800" : "500"}
                        textAnchor="middle"
                      >
                        {isPeak ? `${mucusCat}*` : mucusCat}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Row Labels on Left */}
              <text
                x="8"
                y={chartHeight - 45}
                fill="var(--text-muted)"
                fontSize="9"
              >
                Gün
              </text>
              <text
                x="8"
                y={chartHeight - 31}
                fill="var(--accent-primary)"
                fontSize="9"
              >
                Kan
              </text>
              <text
                x="8"
                y={chartHeight - 16}
                fill="var(--text-muted)"
                fontSize="9"
              >
                Mukus
              </text>
            </svg>
          </div>

          {/* Sensiplan Chart Legend */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "12px",
              marginTop: "16px",
              fontSize: "12px",
              color: "var(--text-secondary)",
              justifyContent: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: "#5ea2ef",
                }}
              />
              <span>BBT Ölçümü</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: "var(--fertile-color)",
                }}
              />
              <span>1-2-3 Yüksek Ölçüm</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span
                style={{
                  borderTop: "2px dashed var(--accent-primary)",
                  width: "16px",
                  display: "inline-block",
                }}
              />
              <span>Kaplama Çizgisi</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span
                style={{ fontWeight: "800", color: "var(--fertile-color)" }}
              >
                *
              </span>
              <span>Mukus Zirvesi</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
