import { useEffect, useState } from "preact/hooks";
import {
  entriesSignal,
  isLockedSignal,
  persistSettings,
  settingsSignal,
} from "../../app/state";
import {
  exportToCsv,
  exportToJson,
  importBackup,
  validateBackupString,
} from "../../data/backup";
import {
  createKeyEnvelope,
  generateDek,
  unwrapDekFromEnvelope,
  WrappedKeyEnvelope,
} from "../../data/crypto";
import {
  checkAndRequestStoragePersistence,
  StorageStatus,
} from "../../data/persist";
import { STRINGS } from "../strings.tr";

export function SettingsScreen() {
  const settings = settingsSignal.value;
  const entries = entriesSignal.value;

  const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(
    null,
  );
  const [backupMessage, setBackupMessage] = useState<string | null>(null);

  // App Lock State
  const [lockPassphrase, setLockPassphrase] = useState<string>("");
  const [lockConfirmPassphrase, setLockConfirmPassphrase] =
    useState<string>("");
  const [removePassphraseInput, setRemovePassphraseInput] =
    useState<string>("");
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const [isLockLoading, setIsLockLoading] = useState<boolean>(false);
  const [showRemoveForm, setShowRemoveForm] = useState<boolean>(false);

  useEffect(() => {
    checkAndRequestStoragePersistence().then((status) => {
      setStorageStatus(status);
    });
  }, []);

  const handleExportJson = async () => {
    try {
      const jsonStr = exportToJson(entries, settings);
      const fileName = `regl-yedek-${new Date().toISOString().slice(0, 10)}.json`;
      const file = new File([jsonStr], fileName, { type: "application/json" });

      if (
        typeof navigator !== "undefined" &&
        "share" in navigator &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          title: "Regl Yedek Dosyası",
          text: "Çevrimdışı döngü takip yedekleme dosyası.",
          files: [file],
        });
        setBackupMessage("Yedek başarıyla paylaşıldı ✅");
      } else {
        // Fallback to browser download
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        setBackupMessage("Yedek dosyası indirildi ✅");
      }
    } catch (err) {
      setBackupMessage(`Dışa aktarma hatası: ${(err as Error).message}`);
    }
  };

  const handleExportCsv = () => {
    try {
      const csvStr = exportToCsv(entries);
      const fileName = `regl-rapor-${new Date().toISOString().slice(0, 10)}.csv`;
      const blob = new Blob([csvStr], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      setBackupMessage("CSV raporu indirildi ✅");
    } catch (err) {
      setBackupMessage(`CSV hatası: ${(err as Error).message}`);
    }
  };

  const handleFileImport = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const payload = validateBackupString(text);
      const summary = await importBackup(payload, "merge");
      setBackupMessage(
        `Yedek içe aktarıldı: ${summary.importedCount} gün güncellendi ✅`,
      );
      // Reload page to refresh all active signals
      window.location.reload();
    } catch (err) {
      setBackupMessage(`İçe aktarma hatası: ${(err as Error).message}`);
    }
  };

  const handleEnableLock = async (e: Event) => {
    e.preventDefault();
    if (lockPassphrase.length < 4) {
      setLockMessage("Parola veya PIN en az 4 karakter olmalıdır.");
      return;
    }
    if (lockPassphrase !== lockConfirmPassphrase) {
      setLockMessage("Parolalar eşleşmiyor!");
      return;
    }

    setIsLockLoading(true);
    setLockMessage(null);
    try {
      const dek = await generateDek();
      const { envelope } = await createKeyEnvelope(lockPassphrase.trim(), dek);
      await persistSettings({
        ...settings,
        lockEnabled: true,
        lockEnvelopeJson: JSON.stringify(envelope),
      });
      setLockPassphrase("");
      setLockConfirmPassphrase("");
      setLockMessage(STRINGS.settings.lockSaved);
    } catch (err) {
      setLockMessage(`Kilit etkinleştirme hatası: ${(err as Error).message}`);
    } finally {
      setIsLockLoading(false);
    }
  };

  const handleDisableLock = async (e: Event) => {
    e.preventDefault();
    setIsLockLoading(true);
    setLockMessage(null);
    try {
      if (settings.lockEnvelopeJson) {
        const envelope: WrappedKeyEnvelope = JSON.parse(
          settings.lockEnvelopeJson,
        );
        await unwrapDekFromEnvelope(removePassphraseInput.trim(), envelope);
      }
      const { lockEnvelopeJson: _lockEnvelopeJson, ...rest } = settings;
      await persistSettings({
        ...rest,
        lockEnabled: false,
      });
      setRemovePassphraseInput("");
      setShowRemoveForm(false);
      setLockMessage(STRINGS.settings.lockRemoved);
    } catch {
      setLockMessage("Mevcut parola veya PIN hatalı!");
    } finally {
      setIsLockLoading(false);
    }
  };

  const handleLockNow = () => {
    isLockedSignal.value = true;
  };

  const handleRerunWizard = async () => {
    await persistSettings({
      ...settings,
      onboardingCompleted: false,
    });
  };

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
        ⚙️ {STRINGS.settings.title}
      </h2>

      {/* 1. Tracking Mode */}
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
            fontSize: "15px",
            fontWeight: "700",
            color: "var(--text-primary)",
            marginBottom: "12px",
          }}
        >
          {STRINGS.settings.trackingMode}
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="trackingMode"
              checked={settings.trackingMode === "symptothermal"}
              onChange={() =>
                persistSettings({ ...settings, trackingMode: "symptothermal" })
              }
            />
            <div>
              <strong>{STRINGS.settings.symptothermalMode}</strong>
              <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                BBT (Ateş), Servikal Mukus ve klinik Sensiplan çift-kontrol
                kuralları.
              </p>
            </div>
          </label>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="trackingMode"
              checked={settings.trackingMode === "basic"}
              onChange={() =>
                persistSettings({ ...settings, trackingMode: "basic" })
              }
            />
            <div>
              <strong>{STRINGS.settings.basicMode}</strong>
              <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                Yalnızca kanama girişi ve istatistiksel EWMA tahminleri.
              </p>
            </div>
          </label>
        </div>
      </section>

      {/* 2. Default Cycle Length */}
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
            fontSize: "15px",
            fontWeight: "700",
            color: "var(--text-primary)",
            marginBottom: "8px",
          }}
        >
          {STRINGS.settings.defaultCycleLength}
        </h3>
        <p
          style={{
            fontSize: "12px",
            color: "var(--text-muted)",
            marginBottom: "12px",
          }}
        >
          Henüz yeterli döngü verisi birikmediğinde başlangıç tahmini için
          kullanılır.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <input
            type="number"
            min="20"
            max="45"
            value={settings.defaultCycleLength}
            onChange={(e) => {
              const val = Number((e.target as HTMLInputElement).value);
              if (val >= 20 && val <= 45) {
                persistSettings({ ...settings, defaultCycleLength: val });
              }
            }}
            style={{
              width: "80px",
              padding: "8px",
              backgroundColor: "var(--bg-elevated)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              fontSize: "16px",
              fontWeight: "700",
              textAlign: "center",
            }}
          />
          <span style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
            gün
          </span>
        </div>
      </section>

      {/* 3. App Lock & Vault Security */}
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
            fontSize: "15px",
            fontWeight: "700",
            color: "var(--text-primary)",
            marginBottom: "8px",
          }}
        >
          🔒 {STRINGS.settings.lockSection}
        </h3>
        <p
          style={{
            fontSize: "12px",
            color: "var(--text-muted)",
            marginBottom: "14px",
          }}
        >
          Web Crypto PBKDF2 (600.000 iterasyon) ile cihazınızdaki sağlık
          verilerine şifreli kilit koyun.
        </p>

        {settings.lockEnabled && settings.lockEnvelopeJson ? (
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                backgroundColor: "var(--fertile-surface)",
                borderRadius: "var(--radius-sm)",
                marginBottom: "12px",
              }}
            >
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: "700",
                  color: "var(--fertile-color)",
                }}
              >
                {STRINGS.settings.lockActive}
              </span>
              <button
                type="button"
                onClick={handleLockNow}
                style={{
                  padding: "6px 12px",
                  backgroundColor: "var(--accent-primary)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "var(--radius-full)",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: "pointer",
                }}
              >
                {STRINGS.settings.lockNow}
              </button>
            </div>

            {!showRemoveForm ? (
              <button
                type="button"
                onClick={() => setShowRemoveForm(true)}
                style={{
                  width: "100%",
                  padding: "10px",
                  backgroundColor: "var(--bg-elevated)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--accent-primary)",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                {STRINGS.settings.removePassphrase}
              </button>
            ) : (
              <form
                onSubmit={handleDisableLock}
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                <input
                  type="password"
                  placeholder="Mevcut Parola veya PIN"
                  value={removePassphraseInput}
                  onChange={(e) =>
                    setRemovePassphraseInput(
                      (e.target as HTMLInputElement).value,
                    )
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
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="submit"
                    disabled={isLockLoading}
                    style={{
                      flex: 1,
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
                    {isLockLoading ? "Doğrulanıyor..." : "Kilidi Kaldır"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowRemoveForm(false);
                      setRemovePassphraseInput("");
                    }}
                    style={{
                      padding: "10px 14px",
                      backgroundColor: "var(--bg-elevated)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--text-secondary)",
                      fontSize: "13px",
                      cursor: "pointer",
                    }}
                  >
                    Vazgeç
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          <form
            onSubmit={handleEnableLock}
            style={{ display: "flex", flexDirection: "column", gap: "8px" }}
          >
            <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              {STRINGS.settings.lockInactive}
            </span>
            <input
              type="password"
              placeholder={STRINGS.settings.setPassphrase}
              value={lockPassphrase}
              onChange={(e) =>
                setLockPassphrase((e.target as HTMLInputElement).value)
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
            <input
              type="password"
              placeholder="Parolayı Tekrar Girin"
              value={lockConfirmPassphrase}
              onChange={(e) =>
                setLockConfirmPassphrase((e.target as HTMLInputElement).value)
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
              disabled={isLockLoading || !lockPassphrase}
              style={{
                padding: "12px",
                backgroundColor: "var(--accent-primary)",
                color: "#ffffff",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontSize: "14px",
                fontWeight: "700",
                cursor:
                  isLockLoading || !lockPassphrase ? "not-allowed" : "pointer",
                opacity: isLockLoading || !lockPassphrase ? 0.6 : 1,
              }}
            >
              {isLockLoading
                ? "Şifreleniyor (600k iterasyon)..."
                : "Kilidi Etkinleştir 🔒"}
            </button>
          </form>
        )}

        {lockMessage && (
          <p
            style={{
              marginTop: "10px",
              fontSize: "12px",
              color: "var(--accent-primary)",
              fontWeight: "600",
            }}
          >
            {lockMessage}
          </p>
        )}
      </section>

      {/* 4. Storage Persistence Status */}
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
            fontSize: "15px",
            fontWeight: "700",
            color: "var(--text-primary)",
            marginBottom: "8px",
          }}
        >
          {STRINGS.settings.storageSection}
        </h3>
        {storageStatus === null ? (
          <p style={{ color: "var(--text-muted)" }}>Kontrol ediliyor...</p>
        ) : (
          <div style={{ fontSize: "13px", lineHeight: "1.6" }}>
            <p
              style={{
                color: storageStatus.isPersisted
                  ? "var(--fertile-color)"
                  : "var(--accent-primary)",
                fontWeight: "600",
              }}
            >
              {storageStatus.isPersisted
                ? STRINGS.settings.storagePersisted
                : STRINGS.settings.storageNotPersisted}
            </p>
            {storageStatus.quotaBytes && (
              <p
                style={{
                  color: "var(--text-muted)",
                  fontSize: "12px",
                  marginTop: "4px",
                }}
              >
                Ayrılan Disk Alanı:{" "}
                {(storageStatus.quotaBytes / (1024 * 1024)).toFixed(0)} MB
              </p>
            )}
          </div>
        )}
      </section>

      {/* 5. Backup & Export */}
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
            fontSize: "15px",
            fontWeight: "700",
            color: "var(--text-primary)",
            marginBottom: "12px",
          }}
        >
          {STRINGS.settings.backupSection}
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            type="button"
            onClick={handleExportJson}
            style={{
              padding: "12px",
              minHeight: "var(--touch-target-min)",
              backgroundColor: "var(--bg-elevated)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-sm)",
              fontSize: "14px",
              fontWeight: "600",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            📦 {STRINGS.settings.exportJson}
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            style={{
              padding: "12px",
              minHeight: "var(--touch-target-min)",
              backgroundColor: "var(--bg-elevated)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-sm)",
              fontSize: "14px",
              fontWeight: "600",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            📊 {STRINGS.settings.exportCsv}
          </button>

          <label
            style={{
              padding: "12px",
              minHeight: "var(--touch-target-min)",
              backgroundColor: "var(--bg-elevated)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-sm)",
              fontSize: "14px",
              fontWeight: "600",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
          >
            📥 {STRINGS.settings.importBackup}
            <input
              type="file"
              accept=".json"
              onChange={handleFileImport}
              style={{ display: "none" }}
            />
          </label>
        </div>

        {backupMessage && (
          <p
            style={{
              marginTop: "12px",
              fontSize: "13px",
              color: "var(--accent-primary)",
            }}
          >
            {backupMessage}
          </p>
        )}
      </section>

      {/* 6. Educational Links & Books */}
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
            fontSize: "15px",
            fontWeight: "700",
            color: "var(--text-primary)",
            marginBottom: "8px",
          }}
        >
          📚 {STRINGS.settings.educationSection}
        </h3>
        <p
          style={{
            fontSize: "12px",
            color: "var(--text-muted)",
            marginBottom: "12px",
          }}
        >
          Semptotermal yöntemin bilimsel güvenilirliği (Pearl İndeksi 0.4),
          gözlemlerin doğru yorumlanmasına dayanır.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <a
            href="https://www.sensiplan.de/en"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "10px 12px",
              backgroundColor: "var(--bg-elevated)",
              color: "var(--accent-primary)",
              borderRadius: "var(--radius-sm)",
              fontSize: "13px",
              textDecoration: "none",
              fontWeight: "600",
              border: "1px solid var(--border-subtle)",
            }}
          >
            🔗 Sensiplan Resmi Bilgi ve Araştırmaları (Almanya) ↗
          </a>
          <a
            href="https://rrmacademy.org/sympto-thermal-method/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "10px 12px",
              backgroundColor: "var(--bg-elevated)",
              color: "var(--accent-primary)",
              borderRadius: "var(--radius-sm)",
              fontSize: "13px",
              textDecoration: "none",
              fontWeight: "600",
              border: "1px solid var(--border-subtle)",
            }}
          >
            📖 Doğal Aile Planlaması ve FABM Rehberi ↗
          </a>
        </div>
      </section>

      {/* 7. Onboarding Wizard Re-run */}
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
            fontSize: "15px",
            fontWeight: "700",
            color: "var(--text-primary)",
            marginBottom: "8px",
          }}
        >
          🌸 Kurulum Rehberi
        </h3>
        <p
          style={{
            fontSize: "12px",
            color: "var(--text-muted)",
            marginBottom: "12px",
          }}
        >
          İlk açılış adımlarını veya döngü modu seçimini baştan başlatmak
          isterseniz sihirbazı tekrar açabilirsiniz.
        </p>
        <button
          type="button"
          onClick={handleRerunWizard}
          style={{
            width: "100%",
            padding: "10px",
            backgroundColor: "var(--bg-elevated)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-primary)",
            fontSize: "13px",
            fontWeight: "600",
            cursor: "pointer",
          }}
        >
          {STRINGS.settings.wizardRerun}
        </button>
      </section>

      {/* Medical Disclaimer */}
      <footer
        style={{
          marginTop: "24px",
          textAlign: "center",
          fontSize: "12px",
          color: "var(--text-muted)",
          lineHeight: "1.5",
        }}
      >
        <p>{STRINGS.settings.disclaimer}</p>
      </footer>
    </div>
  );
}
