import { daysBetween } from "../../../core/date";
import { Cycle } from "../../../core/cycles";
import { DayEntry } from "../../../core/types";

interface SymptomPhaseChartProps {
  readonly cycles: readonly Cycle[];
  readonly entries: readonly DayEntry[];
}

export function SymptomPhaseChart({ cycles, entries }: SymptomPhaseChartProps) {
  // Map entries to their cycle phase
  // Phase 1: Menstrual (Days 1 to 5)
  // Phase 2: Follicular (Day 6 to ~Ovulation Day: ~Day 14)
  // Phase 3: Luteal / PMS (Post-ovulation: ~Day 15 to end)

  const symptomPhaseCounts = new Map<
    string,
    { menstrual: number; follicular: number; luteal: number; total: number }
  >();

  for (const entry of entries) {
    if (!entry.symptoms || entry.symptoms.length === 0) continue;

    // Find cycle for this entry
    const matchingCycle = cycles.find((c) => {
      const isAfterOrAtStart = entry.date >= c.startDate;
      const isBeforeEnd = c.endDate ? entry.date <= c.endDate : true;
      return isAfterOrAtStart && isBeforeEnd;
    });

    if (!matchingCycle) continue;

    const cycleDay = daysBetween(matchingCycle.startDate, entry.date) + 1;
    const cycleLen = matchingCycle.length ?? 28;
    const estOvulationDay = Math.max(10, cycleLen - 14);

    let phase: "menstrual" | "follicular" | "luteal";
    if (cycleDay <= 5) {
      phase = "menstrual";
    } else if (cycleDay <= estOvulationDay) {
      phase = "follicular";
    } else {
      phase = "luteal";
    }

    for (const sym of entry.symptoms) {
      const stats = symptomPhaseCounts.get(sym) ?? {
        menstrual: 0,
        follicular: 0,
        luteal: 0,
        total: 0,
      };
      stats[phase] += 1;
      stats.total += 1;
      symptomPhaseCounts.set(sym, stats);
    }
  }

  const topSymptoms = [...symptomPhaseCounts.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5);

  if (topSymptoms.length === 0) {
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
          📋 Döngü evrelerine göre belirti dağılımı için günlük kayıtlar
          bekleniyor.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {topSymptoms.map(([sym, stats]) => {
          const pctM = Math.round((stats.menstrual / stats.total) * 100);
          const pctF = Math.round((stats.follicular / stats.total) * 100);
          const pctL = Math.round((stats.luteal / stats.total) * 100);

          // Find dominant phase
          let dominantLabel = "Döngü Boyu";
          if (pctM >= 60) dominantLabel = "Adet Evresi";
          else if (pctL >= 60) dominantLabel = "Luteal (PMS) Evresi";
          else if (pctF >= 60) dominantLabel = "Foliküler Evre";

          return (
            <div key={sym}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "12px",
                  marginBottom: "4px",
                }}
              >
                <strong style={{ color: "var(--text-primary)" }}>{sym}</strong>
                <span
                  style={{ fontSize: "11px", color: "var(--text-secondary)" }}
                >
                  Ağırlık:{" "}
                  <strong style={{ color: "var(--accent-primary)" }}>
                    {dominantLabel}
                  </strong>{" "}
                  ({stats.total} kayıt)
                </span>
              </div>

              {/* Segmented Phase Bar */}
              <div
                style={{
                  height: "10px",
                  backgroundColor: "var(--bg-elevated)",
                  borderRadius: "var(--radius-full)",
                  overflow: "hidden",
                  display: "flex",
                  width: "100%",
                }}
              >
                {pctM > 0 && (
                  <div
                    style={{
                      height: "100%",
                      width: `${pctM}%`,
                      backgroundColor: "#e06d7a",
                    }}
                    title={`Adet Evresi: %${pctM}`}
                  />
                )}
                {pctF > 0 && (
                  <div
                    style={{
                      height: "100%",
                      width: `${pctF}%`,
                      backgroundColor: "#2a9d8f",
                    }}
                    title={`Foliküler Evre: %${pctF}`}
                  />
                )}
                {pctL > 0 && (
                  <div
                    style={{
                      height: "100%",
                      width: `${pctL}%`,
                      backgroundColor: "#845ec2",
                    }}
                    title={`Luteal (PMS) Evresi: %${pctL}`}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "16px",
          marginTop: "12px",
          fontSize: "11px",
          color: "var(--text-secondary)",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
        >
          <span
            style={{
              width: "10px",
              height: "10px",
              backgroundColor: "#e06d7a",
              borderRadius: "2px",
            }}
          />
          🩸 Adet (% M)
        </span>
        <span
          style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
        >
          <span
            style={{
              width: "10px",
              height: "10px",
              backgroundColor: "#2a9d8f",
              borderRadius: "2px",
            }}
          />
          🌿 Foliküler (% F)
        </span>
        <span
          style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
        >
          <span
            style={{
              width: "10px",
              height: "10px",
              backgroundColor: "#845ec2",
              borderRadius: "2px",
            }}
          />
          🌙 Luteal / PMS (% L)
        </span>
      </div>
    </div>
  );
}
