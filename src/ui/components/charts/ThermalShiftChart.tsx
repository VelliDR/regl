import { Cycle } from "../../../core/cycles";
import { evaluateCycleState } from "../../../core/evaluate";
import { addDays, daysBetween } from "../../../core/date";
import { DayEntry, ISODate } from "../../../core/types";

interface ThermalShiftChartProps {
  readonly cycles: readonly Cycle[];
  readonly entries: readonly DayEntry[];
}

export function ThermalShiftChart({ cycles, entries }: ThermalShiftChartProps) {
  const entriesMap = new Map<ISODate, DayEntry>();
  for (const e of entries) {
    entriesMap.set(e.date, e);
  }

  // Find all cycles with confirmed Sensiplan temperature shift
  const preTemps: number[] = [];
  const postTemps: number[] = [];

  for (const cycle of cycles) {
    const cycleEval = evaluateCycleState(entries, cycle.startDate, {
      trackingMode: "symptothermal",
    });
    const shift = cycleEval.sensiplan?.temperature;
    if (!shift || !shift.firstHighDayDate) continue;

    const shiftDay = daysBetween(cycle.startDate, shift.firstHighDayDate) + 1;
    const cycleLen = cycle.length ?? 28;
    for (let d = 1; d <= cycleLen; d++) {
      const curDate = addDays(cycle.startDate, d - 1);
      const entry = entriesMap.get(curDate);
      if (!entry?.bbt?.value || entry.bbt.excluded) continue;

      if (d < shiftDay) {
        preTemps.push(entry.bbt.value);
      } else {
        postTemps.push(entry.bbt.value);
      }
    }
  }

  if (preTemps.length === 0 || postTemps.length === 0) {
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
          🌡️ Termal değişim (ateş sıçraması) analizi için en az bir döngüde
          onaylanmış ovülasyon ölçümü gereklidir.
        </p>
      </div>
    );
  }

  const avgPre = preTemps.reduce((a, b) => a + b, 0) / preTemps.length;
  const avgPost = postTemps.reduce((a, b) => a + b, 0) / postTemps.length;
  const deltaT = (avgPost - avgPre) / 100;

  const minScale = 3600;
  const maxScale = 3730;

  const getWidthPct = (val: number) => {
    return Math.max(
      10,
      Math.min(100, ((val - minScale) / (maxScale - minScale)) * 100),
    );
  };

  const isHealthyShift = deltaT >= 0.2;

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          marginTop: "4px",
        }}
      >
        {/* Pre-ovulatory Low Level Bar */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "12px",
              marginBottom: "4px",
            }}
          >
            <span style={{ color: "var(--text-secondary)" }}>
              Ön Evre (Foliküler Düşük Düzey)
            </span>
            <strong style={{ color: "#5ea2ef" }}>
              {(avgPre / 100).toFixed(2)} °C
            </strong>
          </div>
          <div
            style={{
              height: "12px",
              backgroundColor: "var(--bg-elevated)",
              borderRadius: "var(--radius-full)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${getWidthPct(avgPre)}%`,
                backgroundColor: "#5ea2ef",
                borderRadius: "var(--radius-full)",
              }}
            />
          </div>
        </div>

        {/* Post-ovulatory High Level Bar */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "12px",
              marginBottom: "4px",
            }}
          >
            <span style={{ color: "var(--text-secondary)" }}>
              Son Evre (Luteal Yüksek Düzey)
            </span>
            <strong style={{ color: "var(--accent-primary)" }}>
              {(avgPost / 100).toFixed(2)} °C
            </strong>
          </div>
          <div
            style={{
              height: "12px",
              backgroundColor: "var(--bg-elevated)",
              borderRadius: "var(--radius-full)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${getWidthPct(avgPost)}%`,
                backgroundColor: "var(--accent-primary)",
                borderRadius: "var(--radius-full)",
              }}
            />
          </div>
        </div>
      </div>

      {/* Delta T Shift Badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "16px",
          padding: "12px 14px",
          backgroundColor: isHealthyShift
            ? "var(--fertile-surface)"
            : "var(--accent-surface)",
          borderRadius: "var(--radius-sm)",
        }}
      >
        <div>
          <span
            style={{
              fontSize: "11px",
              color: "var(--text-muted)",
              display: "block",
            }}
          >
            Ortalama Termal Fark (ΔT)
          </span>
          <strong
            style={{
              fontSize: "18px",
              color: isHealthyShift
                ? "var(--fertile-color)"
                : "var(--accent-primary)",
            }}
          >
            +{deltaT.toFixed(2)} °C
          </strong>
        </div>
        <span
          style={{
            fontSize: "12px",
            fontWeight: "700",
            color: isHealthyShift
              ? "var(--fertile-color)"
              : "var(--accent-primary)",
          }}
        >
          {isHealthyShift
            ? "Güçlü Progesteron Sıçraması ✅"
            : "Hafif Isı Farkı ⚠️"}
        </span>
      </div>

      <p
        style={{
          marginTop: "10px",
          fontSize: "11px",
          color: "var(--text-secondary)",
          lineHeight: "1.5",
        }}
      >
        Sensiplan kurallarına göre ovülasyon sonrasında progesteron etkisiyle
        bazal vücut ısısı en az 0.2 °C yükselir.
      </p>
    </div>
  );
}
