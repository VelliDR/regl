import { daysBetween } from "../../../core/date";
import { Cycle } from "../../../core/cycles";
import { evaluateCycleState } from "../../../core/evaluate";
import { DayEntry } from "../../../core/types";

interface PhaseDurationChartProps {
  readonly cycles: readonly Cycle[];
  readonly entries: readonly DayEntry[];
}

export function PhaseDurationChart({
  cycles,
  entries,
}: PhaseDurationChartProps) {
  const completedCycles = cycles.filter(
    (c) => c.length !== undefined && !c.isOutlier,
  );

  if (completedCycles.length === 0) {
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
          🌿 Foliküler ve Luteal faz analizi için tamamlanmış döngü verisi
          bekleniyor.
        </p>
      </div>
    );
  }

  // Calculate phase durations for the last 6 completed cycles
  const phaseData = completedCycles.slice(-6).map((c) => {
    const totalLen = c.length!;
    const evalResult = evaluateCycleState(entries, c.startDate, {
      trackingMode: "symptothermal",
    });
    const shiftDate = evalResult.sensiplan?.temperature.firstHighDayDate;
    const shiftDay = shiftDate
      ? daysBetween(c.startDate, shiftDate) + 1
      : undefined;

    let follicularDays: number;
    let lutealDays: number;
    let isConfirmed: boolean;

    if (shiftDay && shiftDay > 5 && shiftDay < totalLen) {
      follicularDays = shiftDay - 1;
      lutealDays = totalLen - follicularDays;
      isConfirmed = true;
    } else {
      // Statistical fallback (normal luteal is ~14 days)
      lutealDays = 14;
      follicularDays = Math.max(1, totalLen - 14);
      isConfirmed = false;
    }

    // Luteal phase sufficiency: 10-16 days is normal
    const isLutealNormal = lutealDays >= 10 && lutealDays <= 16;
    const isLutealShort = lutealDays < 10;

    return {
      id: c.id,
      startDate: c.startDate,
      totalLen,
      follicularDays,
      lutealDays,
      isConfirmed,
      isLutealNormal,
      isLutealShort,
    };
  });

  const avgLuteal = (
    phaseData.reduce((acc, p) => acc + p.lutealDays, 0) / phaseData.length
  ).toFixed(1);

  const avgFollicular = (
    phaseData.reduce((acc, p) => acc + p.follicularDays, 0) / phaseData.length
  ).toFixed(1);

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          marginTop: "6px",
        }}
      >
        {phaseData.map((p) => {
          const maxScale = 40;
          const folPct = (p.follicularDays / maxScale) * 100;
          const lutPct = (p.lutealDays / maxScale) * 100;

          return (
            <div key={p.id}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "12px",
                  marginBottom: "4px",
                }}
              >
                <span style={{ color: "var(--text-secondary)" }}>
                  {p.id}. Döngü ({p.startDate})
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  Foliküler: <strong>{p.follicularDays}g</strong> · Luteal:{" "}
                  <strong>{p.lutealDays}g</strong>
                  {p.isConfirmed ? " (BBT Doğrulu)" : " (Tahmini)"}
                </span>
              </div>

              {/* Stacked Bar */}
              <div
                style={{
                  height: "14px",
                  backgroundColor: "var(--bg-elevated)",
                  borderRadius: "var(--radius-full)",
                  overflow: "hidden",
                  display: "flex",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${folPct}%`,
                    backgroundColor: "#2a9d8f",
                    transition: "width 0.3s ease",
                  }}
                  title={`Foliküler Faz: ${p.follicularDays} gün`}
                />
                <div
                  style={{
                    height: "100%",
                    width: `${lutPct}%`,
                    backgroundColor: p.isLutealShort
                      ? "var(--accent-primary)"
                      : "#845ec2",
                    transition: "width 0.3s ease",
                  }}
                  title={`Luteal Faz: ${p.lutealDays} gün`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend & Science Guide */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "14px",
          padding: "10px 12px",
          backgroundColor: "var(--bg-elevated)",
          borderRadius: "var(--radius-sm)",
          fontSize: "11px",
        }}
      >
        <div style={{ display: "flex", gap: "12px" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              color: "var(--text-primary)",
            }}
          >
            <span
              style={{
                width: "10px",
                height: "10px",
                backgroundColor: "#2a9d8f",
                borderRadius: "2px",
              }}
            />
            Foliküler (Ort. {avgFollicular}g)
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              color: "var(--text-primary)",
            }}
          >
            <span
              style={{
                width: "10px",
                height: "10px",
                backgroundColor: "#845ec2",
                borderRadius: "2px",
              }}
            />
            Luteal (Ort. {avgLuteal}g)
          </span>
        </div>
        <span style={{ color: "var(--fertile-color)", fontWeight: "600" }}>
          Normal Luteal: 10–16 gün
        </span>
      </div>
    </div>
  );
}
