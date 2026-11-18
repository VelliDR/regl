import { useState } from "preact/hooks";
import {
  getLocalTodayISO,
  persistDayEntry,
  persistSettings,
  reloadAppState,
  resumeAutoLockAfterExternalPicker,
  settingsSignal,
  suspendAutoLockForExternalPicker,
} from "../../app/state";
import { addDays, compareISODate, parseISODate } from "../../core/date";
import { BleedingIntensity, DayEntry, ISODate } from "../../core/types";
import {
  decryptVaultBackup,
  importBackup,
  isEncryptedVaultString,
  validateBackupString,
} from "../../data/backup";
import type { ValidatedBackupPayload } from "../../data/schemas";

interface OnboardingScreenProps {
  readonly onFinish: () => void;
}

const INITIAL_PERIOD_FLOW: readonly BleedingIntensity[] = [
  "heavy",
  "heavy",
  "medium",
  "light",
];

export function OnboardingScreen({ onFinish }: OnboardingScreenProps) {
  const currentSettings = settingsSignal.value;

  const [step, setStep] = useState<number>(0);
  const [trackingMode, setTrackingMode] = useState<"basic" | "symptothermal">(
    currentSettings.trackingMode,
  );
  const [goal, setGoal] = useState<
    "avoid_pregnancy" | "conceive" | "track_only"
  >(currentSettings.goal ?? "track_only");
  const [defaultCycleLength, setDefaultCycleLength] = useState<number>(
    currentSettings.defaultCycleLength,
  );
  const [cycleLenInput, setCycleLenInput] = useState<string>(
    String(currentSettings.defaultCycleLength),
  );

  const [lastPeriodDate, setLastPeriodDate] = useState<string>("");
  const [prevPeriodDate, setPrevPeriodDate] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [pendingVault, setPendingVault] = useState<string | null>(null);
  const [vaultPass, setVaultPass] = useState<string>("");

  const seedInitialPeriod = async (
    startDate: ISODate,
    maxEndExclusive: ISODate | undefined,
    today: ISODate,
    baseTs: number,
  ) => {
    for (let offset = 0; offset < INITIAL_PERIOD_FLOW.length; offset++) {
      const targetDate = addDays(startDate, offset);
      if (compareISODate(targetDate, today) > 0) break;
      if (maxEndExclusive && compareISODate(targetDate, maxEndExclusive) >= 0) {
        break;
      }
      const entry: DayEntry = {
        date: targetDate,
        bleeding: INITIAL_PERIOD_FLOW[offset]!,
        updatedAt: baseTs + offset,
      };
      await persistDayEntry(entry);
    }
  };

  const handleComplete = async (includeHistory: boolean) => {
    setFormError(null);
    const today = getLocalTodayISO();
    const safeCycleLen =
      Number.isInteger(defaultCycleLength) &&
      defaultCycleLength >= 20 &&
      defaultCycleLength <= 45
        ? defaultCycleLength
        : 28;

    let parsedLast: ISODate | undefined;
    let parsedPrev: ISODate | undefined;

    if (includeHistory) {
      if (lastPeriodDate) {
        try {
          parsedLast = parseISODate(lastPeriodDate);
        } catch {
          setFormError("Geçersiz son regl tarihi.");
          return;
        }
        if (compareISODate(parsedLast, today) > 0) {
          setFormError("Son regl tarihi gelecekte olamaz.");
          return;
        }
      }

      if (prevPeriodDate) {
        try {
          parsedPrev = parseISODate(prevPeriodDate);
        } catch {
          setFormError("Geçersiz önceki regl tarihi.");
          return;
        }
        if (compareISODate(parsedPrev, today) > 0) {
          setFormError("Önceki regl tarihi gelecekte olamaz.");
          return;
        }
        if (parsedLast && compareISODate(parsedPrev, parsedLast) >= 0) {
          setFormError(
            "Önceki regl başlangıcı, en son regl tarihinden daha eski olmalıdır.",
          );
          return;
        }
      }
    }

    await persistSettings({
      ...currentSettings,
      trackingMode,
      goal,
      defaultCycleLength: safeCycleLen,
      onboardingCompleted: true,
    });

    if (includeHistory) {
      const now = Date.now();
      if (parsedLast) {
        await seedInitialPeriod(parsedLast, undefined, today, now);
      }
      if (parsedPrev) {
        await seedInitialPeriod(parsedPrev, parsedLast, today, now - 10_000);
      }
    }

    onFinish();
  };

  const finishImport = async (payload: ValidatedBackupPayload) => {
    const summary = await importBackup(payload, "merge");
    await reloadAppState();
    await persistSettings({
      ...settingsSignal.value,
      onboardingCompleted: true,
    });
    setImportStatus(
      `Yedek başarıyla yüklendi (${summary.importedCount} gün) ✅`,
    );
    onFinish();
  };

  const handleOnboardingImport = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    resumeAutoLockAfterExternalPicker();
    if (!file) return;

    try {
      const fileName = file.name.toLowerCase();
      if (fileName.endsWith(".pc") || fileName.endsWith(".bak")) {
        setImportStatus("Period Calendar yedeği dönüştürülüyor... ⏳");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { convertPeriodCalendarToRegl } = await import(
          "../../data/periodCalendarMigration"
        );
        const payload = await convertPeriodCalendarToRegl(bytes);
        await finishImport(payload);
      } else {
        const text = await file.text();
        if (fileName.endsWith(".reglvault") || isEncryptedVaultString(text)) {
          setPendingVault(text);
          setVaultPass("");
          setImportStatus("Şifreli yedek seçildi. Parolayı girin 🔒");
          return;
        }
        const payload = validateBackupString(text);
        await finishImport(payload);
      }
    } catch (err) {
      setImportStatus(`İçe aktarma hatası: ${(err as Error).message}`);
    } finally {
      input.value = "";
    }
  };

  const handleDecryptOnboardingVault = async (e: Event) => {
    e.preventDefault();
    if (!pendingVault || !vaultPass) return;
    try {
      const payload = await decryptVaultBackup(pendingVault, vaultPass);
      setPendingVault(null);
      setVaultPass("");
      await finishImport(payload);
    } catch (err) {
      setImportStatus(`Kasa çözme hatası: ${(err as Error).message}`);
    }
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

          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              marginTop: "12px",
              minHeight: "var(--touch-target-min)",
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-full)",
              color: "var(--text-primary)",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            📥 Mevcut Yedekten Geri Yükle (.json, .reglvault, .pc)
            <input
              type="file"
              accept=".json,.reglvault,.pc,.bak"
              onClick={() => suspendAutoLockForExternalPicker()}
              onChange={handleOnboardingImport}
              style={{ display: "none" }}
            />
          </label>

          {pendingVault && (
            <form
              onSubmit={handleDecryptOnboardingVault}
              style={{
                marginTop: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                padding: "12px",
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--accent-primary)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <input
                type="password"
                placeholder="Yedek Kasa Parolası"
                value={vaultPass}
                onInput={(e) =>
                  setVaultPass((e.target as HTMLInputElement).value)
                }
                style={{
                  padding: "10px",
                  backgroundColor: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                }}
              />
              <button
                type="submit"
                style={{
                  padding: "10px",
                  backgroundColor: "var(--accent-primary)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "13px",
                  fontWeight: "700",
                  cursor: "pointer",
                }}
              >
                Çöz ve İçe Aktar 🔒
              </button>
            </form>
          )}

          {importStatus && (
            <p
              style={{
                marginTop: "10px",
                fontSize: "12px",
                color: "var(--accent-primary)",
                fontWeight: "600",
              }}
            >
              {importStatus}
            </p>
          )}
        </div>
      )}

      {/* Step 1: Mode Choice */}
      {step === 1 && (
        <div>
          <button
            type="button"
            onClick={() => setStep(0)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              fontSize: "13px",
              cursor: "pointer",
              marginBottom: "10px",
            }}
          >
            ← Geri
          </button>
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
            <button
              type="button"
              onClick={() => setTrackingMode("symptothermal")}
              style={{
                textAlign: "left",
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
            </button>

            <button
              type="button"
              onClick={() => setTrackingMode("basic")}
              style={{
                textAlign: "left",
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
            </button>
          </div>

          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: "14px",
              marginBottom: "24px",
            }}
          >
            <p
              style={{
                fontSize: "13px",
                fontWeight: "700",
                color: "var(--text-primary)",
                marginBottom: "10px",
              }}
            >
              Takip Amacınız
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {(
                [
                  { id: "track_only", label: "Döngü ve Sağlık Farkındalığı" },
                  { id: "avoid_pregnancy", label: "Gebelikten Korunma (Yüksek Hassasiyet)" },
                  { id: "conceive", label: "Gebelik Planlama (Doğurganlık Odaklı)" },
                ] as const
              ).map((item) => (
                <label
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name="onboardingGoal"
                    checked={goal === item.id}
                    onChange={() => setGoal(item.id)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
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
          <button
            type="button"
            onClick={() => setStep(1)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              fontSize: "13px",
              cursor: "pointer",
              marginBottom: "10px",
            }}
          >
            ← Geri
          </button>
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
              marginBottom: "20px",
            }}
          >
            <div>
              <label
                htmlFor="onb-last-period"
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
                id="onb-last-period"
                type="date"
                value={lastPeriodDate}
                onChange={(e) => {
                  setFormError(null);
                  setLastPeriodDate((e.target as HTMLInputElement).value);
                }}
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
                htmlFor="onb-prev-period"
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
                id="onb-prev-period"
                type="date"
                value={prevPeriodDate}
                onChange={(e) => {
                  setFormError(null);
                  setPrevPeriodDate((e.target as HTMLInputElement).value);
                }}
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
                htmlFor="onb-cycle-len"
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
                id="onb-cycle-len"
                type="number"
                min="20"
                max="45"
                value={cycleLenInput}
                onInput={(e) => {
                  const raw = (e.target as HTMLInputElement).value;
                  setCycleLenInput(raw);
                  const val = Number(raw);
                  if (Number.isInteger(val) && val >= 20 && val <= 45) {
                    setDefaultCycleLength(val);
                  }
                }}
                onBlur={() => {
                  const val = Number(cycleLenInput);
                  if (!Number.isInteger(val) || val < 20 || val > 45) {
                    setCycleLenInput(String(defaultCycleLength));
                  }
                }}
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

          {formError && (
            <p
              style={{
                fontSize: "12px",
                color: "var(--accent-primary)",
                fontWeight: "600",
                marginBottom: "14px",
              }}
            >
              ⚠️ {formError}
            </p>
          )}

          <button
            type="button"
            onClick={() => handleComplete(true)}
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
            onClick={() => handleComplete(false)}
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
