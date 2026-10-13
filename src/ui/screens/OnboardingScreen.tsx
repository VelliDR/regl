import { useState } from "preact/hooks";
import {
  persistDayEntry,
  persistSettings,
  settingsSignal,
} from "../../app/state";
import { parseISODate } from "../../core/date";
import { DayEntry } from "../../core/types";

interface OnboardingScreenProps {
  readonly onFinish: () => void;
}

export function OnboardingScreen({ onFinish }: OnboardingScreenProps) {
  const currentSettings = settingsSignal.value;

  const [step, setStep] = useState<number>(0);
  const [trackingMode, setTrackingMode] = useState<"basic" | "symptothermal">(
    "symptothermal",
  );
  const [defaultCycleLength, setDefaultCycleLength] = useState<number>(28);

  const [lastPeriodDate, setLastPeriodDate] = useState<string>("");
  const [prevPeriodDate, setPrevPeriodDate] = useState<string>("");

  const handleComplete = async () => {
    // Save onboarding settings
    await persistSettings({
      ...currentSettings,
      trackingMode,
      defaultCycleLength,
      onboardingCompleted: true,
    });

    // If past period dates were provided, generate initial DayEntry records
    if (lastPeriodDate) {
      try {
        const d1 = parseISODate(lastPeriodDate);
        const entry1: DayEntry = {
          date: d1,
          bleeding: "heavy",
          updatedAt: Date.now(),
        };
        await persistDayEntry(entry1);
      } catch {
        // Ignore malformed dates
      }
    }

    if (prevPeriodDate) {
      try {
        const d2 = parseISODate(prevPeriodDate);
        const entry2: DayEntry = {
          date: d2,
          bleeding: "heavy",
          updatedAt: Date.now() - 1000,
        };
        await persistDayEntry(entry2);
      } catch {
        // Ignore malformed dates
      }
    }

    onFinish();
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "24px 20px",
        maxWidth: "480px",
        margin: "0 auto",
      }}
    >
      {/* Step 0: Welcome & Privacy */}
      {step === 0 && (
        <div style={{ textAlign: "center" }}>
          <span
            style={{ fontSize: "48px", display: "block", marginBottom: "16px" }}
          >
            🌸
          </span>
          <h1
            style={{
              fontSize: "24px",
              fontWeight: "800",
              color: "var(--text-primary)",
              marginBottom: "12px",
            }}
          >
            Hoş Geldiniz
          </h1>
          <p
            style={{
              fontSize: "15px",
              color: "var(--text-secondary)",
              lineHeight: "1.6",
              marginBottom: "24px",
            }}
          >
            Regl ve üreme sağlığınızı bilimsel yöntemlerle, tamamen{" "}
            <strong>çevrimdışı</strong> ve <strong>mahrem</strong> olarak takip
            edin.
          </p>

          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: "16px",
              textAlign: "left",
              marginBottom: "32px",
              fontSize: "13px",
              color: "var(--text-secondary)",
              lineHeight: "1.6",
            }}
          >
            <p>
              🛡️ <strong>Sıfır Sunucu:</strong> Verileriniz yalnızca bu
              telefonda saklanır.
            </p>
            <p style={{ marginTop: "8px" }}>
              🚫 <strong>Sıfır İzleyici:</strong> Reklam, hesap açma veya veri
              toplama yoktur.
            </p>
            <p style={{ marginTop: "8px" }}>
              📶 <strong>%100 Çevrimdışı:</strong> İnternet olmadan tam kapasite
              çalışır.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setStep(1)}
            style={{
              width: "100%",
              minHeight: "var(--touch-target-min)",
              backgroundColor: "var(--accent-primary)",
              color: "#ffffff",
              border: "none",
              borderRadius: "var(--radius-full)",
              fontSize: "16px",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            Başlayalım →
          </button>
        </div>
      )}

      {/* Step 1: Mode Choice */}
      {step === 1 && (
        <div>
          <h2
            style={{
              fontSize: "20px",
              fontWeight: "800",
              color: "var(--text-primary)",
              marginBottom: "8px",
            }}
          >
            Takip Modunuzu Seçin
          </h2>
          <p
            style={{
              fontSize: "14px",
              color: "var(--text-muted)",
              marginBottom: "24px",
            }}
          >
            İhtiyacınıza göre arayüzü sadeleştirebilir veya gelişmiş klinik
            kuralları kullanabilirsiniz.
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              marginBottom: "32px",
            }}
          >
            <div
              onClick={() => setTrackingMode("symptothermal")}
              style={{
                backgroundColor: "var(--bg-surface)",
                border:
                  trackingMode === "symptothermal"
                    ? "2px solid var(--accent-primary)"
                    : "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "16px",
                cursor: "pointer",
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
                <span style={{ fontSize: "20px" }}>🌡️</span>
                <strong
                  style={{ fontSize: "15px", color: "var(--text-primary)" }}
                >
                  İleri Seviye Semptotermal (Önerilen)
                </strong>
              </div>
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                  lineHeight: "1.5",
                }}
              >
                Bazal Vücut Isısı (BBT) + Servikal Mukus çift kontrolü ile
                klinik Sensiplan ovülasyon kuralları.
              </p>
            </div>

            <div
              onClick={() => setTrackingMode("basic")}
              style={{
                backgroundColor: "var(--bg-surface)",
                border:
                  trackingMode === "basic"
                    ? "2px solid var(--accent-primary)"
                    : "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "16px",
                cursor: "pointer",
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
                <span style={{ fontSize: "20px" }}>🩸</span>
                <strong
                  style={{ fontSize: "15px", color: "var(--text-primary)" }}
                >
                  Temel Mod
                </strong>
              </div>
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                  lineHeight: "1.5",
                }}
              >
                Yalnızca adet kanaması girişleri ve istatistiksel EWMA döngü
                tahminleri.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setStep(2)}
            style={{
              width: "100%",
              minHeight: "var(--touch-target-min)",
              backgroundColor: "var(--accent-primary)",
              color: "#ffffff",
              border: "none",
              borderRadius: "var(--radius-full)",
              fontSize: "16px",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            Devam Et →
          </button>
        </div>
      )}

      {/* Step 2: Past Period History */}
      {step === 2 && (
        <div>
          <h2
            style={{
              fontSize: "20px",
              fontWeight: "800",
              color: "var(--text-primary)",
              marginBottom: "8px",
            }}
          >
            Döngü Geçmişi (İsteğe Bağlı)
          </h2>
          <p
            style={{
              fontSize: "14px",
              color: "var(--text-muted)",
              marginBottom: "20px",
            }}
          >
            Tahminlerin ilk günden doğru çalışması için son adet
            başlangıçlarınızı girebilirsiniz.
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              marginBottom: "28px",
            }}
          >
            <div>
              <label
                style={{
                  fontSize: "13px",
                  fontWeight: "600",
                  color: "var(--text-secondary)",
                  display: "block",
                  marginBottom: "6px",
                }}
              >
                En Son Regl Başlangıç Tarihi:
              </label>
              <input
                type="date"
                value={lastPeriodDate}
                onChange={(e) =>
                  setLastPeriodDate((e.target as HTMLInputElement).value)
                }
                style={{
                  width: "100%",
                  padding: "12px",
                  backgroundColor: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)",
                  fontSize: "15px",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  fontSize: "13px",
                  fontWeight: "600",
                  color: "var(--text-secondary)",
                  display: "block",
                  marginBottom: "6px",
                }}
              >
                Bir Önceki Regl Başlangıcı (İsteğe Bağlı):
              </label>
              <input
                type="date"
                value={prevPeriodDate}
                onChange={(e) =>
                  setPrevPeriodDate((e.target as HTMLInputElement).value)
                }
                style={{
                  width: "100%",
                  padding: "12px",
                  backgroundColor: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)",
                  fontSize: "15px",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  fontSize: "13px",
                  fontWeight: "600",
                  color: "var(--text-secondary)",
                  display: "block",
                  marginBottom: "6px",
                }}
              >
                Ortalama Döngü Süreniz (gün):
              </label>
              <input
                type="number"
                min="20"
                max="45"
                value={defaultCycleLength}
                onChange={(e) =>
                  setDefaultCycleLength(
                    Number((e.target as HTMLInputElement).value),
                  )
                }
                style={{
                  width: "100px",
                  padding: "10px",
                  backgroundColor: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)",
                  fontSize: "16px",
                  fontWeight: "700",
                  textAlign: "center",
                }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleComplete}
            style={{
              width: "100%",
              minHeight: "var(--touch-target-min)",
              backgroundColor: "var(--accent-primary)",
              color: "#ffffff",
              border: "none",
              borderRadius: "var(--radius-full)",
              fontSize: "16px",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            Kurulumu Tamamla ✨
          </button>

          <button
            type="button"
            onClick={handleComplete}
            style={{
              width: "100%",
              marginTop: "10px",
              minHeight: "var(--touch-target-min)",
              background: "none",
              color: "var(--text-muted)",
              border: "none",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            Geçmiş Girmeden Başla →
          </button>
        </div>
      )}
    </div>
  );
}
