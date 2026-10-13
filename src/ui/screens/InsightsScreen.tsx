import {
  entriesSignal,
  evaluationSignal,
  settingsSignal,
} from "../../app/state";
import { calculateMedian } from "../../core/cycles";
import { BleedingFlowChart } from "../components/charts/BleedingFlowChart";
import { CycleTrendChart } from "../components/charts/CycleTrendChart";
import { PhaseDurationChart } from "../components/charts/PhaseDurationChart";
import { SymptomPhaseChart } from "../components/charts/SymptomPhaseChart";
import { ThermalShiftChart } from "../components/charts/ThermalShiftChart";

export function InsightsScreen() {
  const evaluation = evaluationSignal.value;
  const entries = entriesSignal.value;
  const settings = settingsSignal.value;

  const completedCycles = evaluation.completedCycles;
  const allCycles = evaluation.activeCycle
    ? [...completedCycles, evaluation.activeCycle]
    : completedCycles;

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
    .slice(0, 8);

  const isSympto = settings.trackingMode === "symptothermal";

  return (
    <div
      style={{
        padding: "16px",
        maxWidth: "520px",
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

      {/* 1. Overview Metric Cards */}
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

      {/* 2. Cycle Regularity Card */}
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

      {/* 3. Cycle Trend Line & Variance Corridor Chart */}
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
            marginBottom: "4px",
          }}
        >
          📈 Döngü Süreleri Trend Çizgisi
        </h3>
        <p
          style={{
            fontSize: "12px",
            color: "var(--text-muted)",
            marginBottom: "14px",
          }}
        >
          Geçmiş döngü uzunluklarının medyan referansı ve 24–35 günlük normal
          klinik aralık koridoru.
        </p>
        <CycleTrendChart
          cycles={completedCycles}
          medianLength={medianLength > 0 ? medianLength : 28}
        />
      </section>

      {/* 4. Bleeding Flow Distribution Chart */}
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
            marginBottom: "4px",
          }}
        >
          🩸 Kanama Akış Profili (Döngü Günleri 1–7)
        </h3>
        <p
          style={{
            fontSize: "12px",
            color: "var(--text-muted)",
            marginBottom: "14px",
          }}
        >
          Adet kanamasının döngü başlangıcından itibaren yoğunluk dağılımı.
        </p>
        <BleedingFlowChart cycles={allCycles} entries={entries} />
      </section>

      {/* 5. Follicular vs. Luteal Phase Duration Chart (Only in symptothermal mode or when data exists) */}
      {isSympto && (
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
              marginBottom: "4px",
            }}
          >
            🌿 Faz Dağılımı (Foliküler vs. Luteal Faz)
          </h3>
          <p
            style={{
              fontSize: "12px",
              color: "var(--text-muted)",
              marginBottom: "14px",
            }}
          >
            Yumurtlama öncesi (foliküler) ve sonrası (luteal) süreler. Sağlıklı
            bir luteal faz 10–16 gün sürer.
          </p>
          <PhaseDurationChart cycles={completedCycles} entries={entries} />
        </section>
      )}

      {/* 6. Thermal Shift Chart (BBT Shift Comparison) */}
      {isSympto && (
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
              marginBottom: "4px",
            }}
          >
            🌡️ Termal Değişim Analizi (Ateş Sıçraması ΔT)
          </h3>
          <p
            style={{
              fontSize: "12px",
              color: "var(--text-muted)",
              marginBottom: "14px",
            }}
          >
            Foliküler düşük düzey ile luteal yüksek düzey bazal vücut ısısı
            ortalamalarının karşılaştırması.
          </p>
          <ThermalShiftChart cycles={allCycles} entries={entries} />
        </section>
      )}

      {/* 7. Symptom Phase Distribution Chart */}
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
            marginBottom: "4px",
          }}
        >
          📋 Belirtilerin Döngü Evrelerine Dağılımı
        </h3>
        <p
          style={{
            fontSize: "12px",
            color: "var(--text-muted)",
            marginBottom: "14px",
          }}
        >
          Hangi belirtinin döngünün hangi evresinde (Adet, Foliküler, PMS)
          yoğunlaştığının analizi.
        </p>
        <SymptomPhaseChart cycles={allCycles} entries={entries} />
      </section>

      {/* 8. Top Symptoms Chips */}
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
