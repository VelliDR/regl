import { entriesSignal, evaluationSignal } from "../../app/state";
import { calculateMedian } from "../../core/cycles";

export function InsightsScreen() {
  const evaluation = evaluationSignal.value;
  const entries = entriesSignal.value;

  const completedCycles = evaluation.completedCycles;
  const validLengths = completedCycles
    .filter((c) => c.length !== undefined && !c.isOutlier)
    .map((c) => c.length!);

  const medianLength = calculateMedian(validLengths);
  const avgLength =
    validLengths.length > 0
      ? (validLengths.reduce((a, b) => a + b, 0) / validLengths.length).toFixed(
          1,
        )
      : "—";

  // Average period bleeding duration
  const periodLengths = completedCycles
    .filter((c) => c.periodLength !== undefined)
    .map((c) => c.periodLength!);

  const avgPeriod =
    periodLengths.length > 0
      ? (
          periodLengths.reduce((a, b) => a + b, 0) / periodLengths.length
        ).toFixed(1)
      : "—";

  // Symptom counts
  const symptomCounts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.symptoms) {
      for (const s of entry.symptoms) {
        symptomCounts.set(s, (symptomCounts.get(s) ?? 0) + 1);
      }
    }
  }

  const topSymptoms = [...symptomCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div
      style={{
        padding: "16px",
        maxWidth: "500px",
        margin: "0 auto",
        paddingBottom: "90px",
      }}
    >
      <h2
        style={{
          fontSize: "20px",
          fontWeight: "800",
          color: "var(--text-primary)",
          marginBottom: "16px",
        }}
      >
        📊 İçgörüler ve İstatistikler
      </h2>

      {/* Overview Metric Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-md)",
            padding: "16px",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Ortalama Döngü
          </span>
          <p
            style={{
              fontSize: "24px",
              fontWeight: "800",
              color: "var(--accent-primary)",
              marginTop: "4px",
            }}
          >
            {avgLength}{" "}
            <span style={{ fontSize: "13px", fontWeight: "500" }}>gün</span>
          </p>
          <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
            Medyan: {medianLength > 0 ? `${medianLength} gün` : "—"}
          </span>
        </div>

        <div
          style={{
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-md)",
            padding: "16px",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Ortalama Kanama
          </span>
          <p
            style={{
              fontSize: "24px",
              fontWeight: "800",
              color: "var(--text-primary)",
              marginTop: "4px",
            }}
          >
            {avgPeriod}{" "}
            <span style={{ fontSize: "13px", fontWeight: "500" }}>gün</span>
          </p>
          <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
            {completedCycles.length} tamamlanmış döngü
          </span>
        </div>
      </div>

      {/* Cycle Regularity Card */}
      <section
        style={{
          backgroundColor: "var(--bg-surface)",
          borderRadius: "var(--radius-md)",
          padding: "16px",
          border: "1px solid var(--border-subtle)",
          marginBottom: "16px",
        }}
      >
        <h3
          style={{
            fontSize: "14px",
            fontWeight: "700",
            color: "var(--text-primary)",
            marginBottom: "8px",
          }}
        >
          Döngü Düzenliliği [P5]
        </h3>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "8px",
          }}
        >
          <span
            style={{
              padding: "4px 10px",
              borderRadius: "var(--radius-full)",
              fontSize: "12px",
              fontWeight: "700",
              backgroundColor:
                evaluation.prediction.regularity === "regular"
                  ? "var(--fertile-surface)"
                  : "var(--accent-surface)",
              color:
                evaluation.prediction.regularity === "regular"
                  ? "var(--fertile-color)"
                  : "var(--accent-primary)",
            }}
          >
            {evaluation.prediction.regularity === "regular"
              ? "Yüksek Düzenlilik ✅"
              : evaluation.prediction.regularity === "irregular"
                ? "Değişken Döngü ⚠️"
                : "Veri Birikiyor ⏳"}
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            (Standart Sapma: ±{evaluation.prediction.standardDeviation} gün)
          </span>
        </div>
        <p
          style={{
            fontSize: "12px",
            color: "var(--text-secondary)",
            lineHeight: "1.5",
          }}
        >
          Standart sapma 1.5 günün altında olduğunda döngüler yüksek düzenli
          kabul edilir ve tahmin aralığı daralır.
        </p>
      </section>

      {/* Cycle History Bar Chart */}
      {completedCycles.length > 0 && (
        <section
          style={{
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-md)",
            padding: "16px",
            border: "1px solid var(--border-subtle)",
            marginBottom: "16px",
          }}
        >
          <h3
            style={{
              fontSize: "14px",
              fontWeight: "700",
              color: "var(--text-primary)",
              marginBottom: "16px",
            }}
          >
            Geçmiş Döngü Uzunlukları
          </h3>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            {completedCycles.slice(-8).map((c) => {
              const len = c.length ?? 28;
              const maxScale = 40;
              const widthPct = Math.min(
                100,
                Math.max(10, (len / maxScale) * 100),
              );

              return (
                <div key={c.id}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "12px",
                      marginBottom: "4px",
                    }}
                  >
                    <span style={{ color: "var(--text-secondary)" }}>
                      {c.id}. Döngü ({c.startDate})
                    </span>
                    <strong
                      style={{
                        color: c.isOutlier
                          ? "var(--accent-primary)"
                          : "var(--text-primary)",
                      }}
                    >
                      {len} gün {c.isOutlier ? "(Aykırı)" : ""}
                    </strong>
                  </div>
                  <div
                    style={{
                      height: "8px",
                      backgroundColor: "var(--bg-elevated)",
                      borderRadius: "var(--radius-full)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${widthPct}%`,
                        backgroundColor: c.isOutlier
                          ? "var(--accent-primary)"
                          : "#5ea2ef",
                        borderRadius: "var(--radius-full)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Top Symptoms */}
      {topSymptoms.length > 0 && (
        <section
          style={{
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-md)",
            padding: "16px",
            border: "1px solid var(--border-subtle)",
            marginBottom: "16px",
          }}
        >
          <h3
            style={{
              fontSize: "14px",
              fontWeight: "700",
              color: "var(--text-primary)",
              marginBottom: "12px",
            }}
          >
            En Sık Kaydedilen Belirtiler
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {topSymptoms.map(([sym, count]) => (
              <span
                key={sym}
                style={{
                  padding: "6px 12px",
                  backgroundColor: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-full)",
                  fontSize: "12px",
                  color: "var(--text-primary)",
                }}
              >
                {sym} ({count} kez)
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
