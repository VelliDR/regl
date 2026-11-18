import { useEffect, useState } from "preact/hooks";
import { exportCalendarEventToDevice } from "../../app/reminders";
import {
  changeVaultPassphrase,
  disableVaultLock,
  enableVaultLock,
  entriesSignal,
  getLocalTodayISO,
  lockApp,
  persistSettings,
  reloadAppState,
  resumeAutoLockAfterExternalPicker,
  settingsSignal,
  suspendAutoLockForExternalPicker,
  wipeAllAppData,
} from "../../app/state";
import {
  decryptVaultBackup,
  exportToCsv,
  exportToEncryptedVault,
  exportToJson,
  importBackup,
  isEncryptedVaultString,
  validateBackupString,
} from "../../data/backup";
import type { ValidatedBackupPayload } from "../../data/schemas";
import {
  createSnapshotNow,
  deleteSnapshot,
  loadSnapshots,
  LocalSnapshot,
  restoreSnapshot,
} from "../../data/snapshots";
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
  const [showRulesGuide, setShowRulesGuide] = useState<boolean>(false);
  const [snapshots, setSnapshots] = useState<LocalSnapshot[]>([]);
  const [cycleLenInput, setCycleLenInput] = useState<string>(
    String(settings.defaultCycleLength),
  );

  // Encrypted Vault Export / Import State
  const [showVaultExportForm, setShowVaultExportForm] =
    useState<boolean>(false);
  const [vaultExportPass, setVaultExportPass] = useState<string>("");
  const [vaultExportPassConfirm, setVaultExportPassConfirm] =
    useState<string>("");
  const [isVaultExporting, setIsVaultExporting] = useState<boolean>(false);

  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [pendingVaultContent, setPendingVaultContent] = useState<string | null>(
    null,
  );
  const [vaultImportPass, setVaultImportPass] = useState<string>("");
  const [isVaultImporting, setIsVaultImporting] = useState<boolean>(false);

  // App Lock State
  const [lockPassphrase, setLockPassphrase] = useState<string>("");
  const [lockConfirmPassphrase, setLockConfirmPassphrase] =
    useState<string>("");
  const [removePassphraseInput, setRemovePassphraseInput] =
    useState<string>("");
  const [showChangePassForm, setShowChangePassForm] = useState<boolean>(false);
  const [oldPassInput, setOldPassInput] = useState<string>("");
  const [newPassInput, setNewPassInput] = useState<string>("");
  const [newPassConfirmInput, setNewPassConfirmInput] = useState<string>("");
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const [isLockLoading, setIsLockLoading] = useState<boolean>(false);
  const [showRemoveForm, setShowRemoveForm] = useState<boolean>(false);

  useEffect(() => {
    setCycleLenInput(String(settings.defaultCycleLength));
  }, [settings.defaultCycleLength]);

  useEffect(() => {
    checkAndRequestStoragePersistence().then((status) => {
      setStorageStatus(status);
    });
    loadSnapshots().then(setSnapshots);
  }, []);

  const shareOrDownloadFile = async (
    content: string,
    fileName: string,
    mimeType: string,
    shareTitle: string,
    shareText: string,
  ): Promise<"shared" | "downloaded" | "cancelled"> => {
    const file = new File([content], fileName, { type: mimeType });

    if (
      typeof navigator !== "undefined" &&
      "share" in navigator &&
      navigator.canShare &&
      navigator.canShare({ files: [file] })
    ) {
      suspendAutoLockForExternalPicker();
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          files: [file],
        });
        return "shared";
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return "cancelled";
        }
        throw err;
      } finally {
        resumeAutoLockAfterExternalPicker();
      }
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return "downloaded";
  };

  const handleExportJson = async () => {
    try {
      const jsonStr = exportToJson(entries, settings);
      const fileName = `regl-yedek-${new Date().toISOString().slice(0, 10)}.json`;
      const outcome = await shareOrDownloadFile(
        jsonStr,
        fileName,
        "application/json",
        "Regl Yedek Dosyası",
        "Çevrimdışı döngü takip yedekleme dosyası.",
      );

      if (outcome === "cancelled") {
        setBackupMessage("Paylaşım iptal edildi.");
        return;
      }

      await persistSettings({
        ...settings,
        lastBackupDate: new Date().toISOString(),
      });
      setBackupMessage(
        outcome === "shared"
          ? "Yedek başarıyla paylaşıldı ✅"
          : "Yedek dosyası indirildi ✅",
      );
    } catch (err) {
      setBackupMessage(`Dışa aktarma hatası: ${(err as Error).message}`);
    }
  };

  const handleExportEncryptedVault = async (e: Event) => {
    e.preventDefault();
    if (vaultExportPass.length < 4 || !vaultExportPass.trim()) {
      setBackupMessage("Kasa yedek parolası en az 4 karakter olmalıdır.");
      return;
    }
    if (vaultExportPass !== vaultExportPassConfirm) {
      setBackupMessage("Yedek parolaları eşleşmiyor!");
      return;
    }

    setIsVaultExporting(true);
    try {
      const vaultStr = await exportToEncryptedVault(
        entries,
        settings,
        vaultExportPass,
      );
      const fileName = `regl-kasa-${new Date().toISOString().slice(0, 10)}.reglvault`;
      const outcome = await shareOrDownloadFile(
        vaultStr,
        fileName,
        "application/json",
        "Regl Şifreli Kasa Yedeği",
        "AES-GCM 256-bit şifreli Regl yedekleme dosyası.",
      );

      if (outcome === "cancelled") {
        setBackupMessage("Şifreli yedek paylaşımı iptal edildi.");
        return;
      }

      await persistSettings({
        ...settings,
        lastBackupDate: new Date().toISOString(),
      });
      setVaultExportPass("");
      setVaultExportPassConfirm("");
      setShowVaultExportForm(false);
      setBackupMessage(
        outcome === "shared"
          ? "Şifreli .reglvault yedeği paylaşıldı 🔒"
          : "Şifreli .reglvault yedeği indirildi 🔒",
      );
    } catch (err) {
      setBackupMessage(`Şifreli yedek hatası: ${(err as Error).message}`);
    } finally {
      setIsVaultExporting(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      const csvStr = exportToCsv(entries);
      const fileName = `regl-rapor-${new Date().toISOString().slice(0, 10)}.csv`;
      const outcome = await shareOrDownloadFile(
        csvStr,
        fileName,
        "text/csv;charset=utf-8",
        "Regl Hekim Raporu (CSV)",
        "Döngü ve semptotermal takip tablo raporu.",
      );
      if (outcome === "cancelled") {
        setBackupMessage("CSV paylaşımı iptal edildi.");
        return;
      }
      setBackupMessage("CSV raporu indirildi ✅");
    } catch (err) {
      setBackupMessage(`CSV hatası: ${(err as Error).message}`);
    }
  };

  const handleCreateSnapshot = async () => {
    try {
      const snap = await createSnapshotNow(entries, settings);
      setSnapshots((prev) => [snap, ...prev.filter((s) => s.id !== snap.id)]);
      setBackupMessage("Yeni güvenlik snapshot'ı oluşturuldu 📸");
    } catch (err) {
      setBackupMessage(`Snapshot hatası: ${(err as Error).message}`);
    }
  };

  const handleRestoreSnapshot = async (id: string) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Bu yerel yedeği geri yüklemek istiyor musunuz? Mevcut verileriniz bu yedeğe göre güncellenecektir.",
      )
    ) {
      return;
    }

    try {
      const summary = await restoreSnapshot(id, "replace");
      await reloadAppState();
      setBackupMessage(
        `Snapshot başarıyla geri yüklendi: ${summary.importedCount} gün yüklendi ✅`,
      );
    } catch (err) {
      setBackupMessage(`Geri yükleme hatası: ${(err as Error).message}`);
    }
  };

  const handleDeleteSnapshot = async (id: string) => {
    try {
      await deleteSnapshot(id);
      setSnapshots((prev) => prev.filter((s) => s.id !== id));
      setBackupMessage("Snapshot silindi 🗑️");
    } catch (err) {
      setBackupMessage(`Silme hatası: ${(err as Error).message}`);
    }
  };

  const confirmReplaceIfNeeded = (): boolean => {
    if (importMode !== "replace") return true;
    if (typeof window === "undefined") return true;
    return window.confirm(
      "DEĞİŞTİR (Replace) modu mevcut tüm gün kayıtlarınızı silip yalnızca yedekteki verileri yükler. Devam etmek istiyor musunuz?",
    );
  };

  const handleFileImport = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    resumeAutoLockAfterExternalPicker();
    if (!file) return;

    try {
      const fileName = file.name.toLowerCase();
      let payload: ValidatedBackupPayload;

      if (fileName.endsWith(".pc") || fileName.endsWith(".bak")) {
        if (!confirmReplaceIfNeeded()) return;
        setBackupMessage(
          "Period Calendar (.pc / .bak) yedeği çözümleniyor... ⏳",
        );
        const buffer = await file.arrayBuffer();
        const rawBytes = new Uint8Array(buffer);
        const { convertPeriodCalendarToRegl } = await import(
          "../../data/periodCalendarMigration"
        );
        payload = await convertPeriodCalendarToRegl(rawBytes);
        const summary = await importBackup(payload, importMode);
        setBackupMessage(
          `Period Calendar verileri başarıyla aktarıldı: ${summary.importedCount} gün eklendi ✅`,
        );
      } else {
        const text = await file.text();
        if (fileName.endsWith(".reglvault") || isEncryptedVaultString(text)) {
          setPendingVaultContent(text);
          setVaultImportPass("");
          setBackupMessage(
            "Şifreli .reglvault dosyası seçildi. Çözmek için yedek parolasını girin 🔒",
          );
          return;
        }
        if (!confirmReplaceIfNeeded()) return;
        payload = validateBackupString(text);
        const summary = await importBackup(payload, importMode);
        setBackupMessage(
          `Yedek içe aktarıldı: ${summary.importedCount} gün güncellendi ✅`,
        );
      }
      await reloadAppState();
      loadSnapshots().then(setSnapshots).catch(() => {});
    } catch (err) {
      setBackupMessage(`İçe aktarma hatası: ${(err as Error).message}`);
    } finally {
      input.value = "";
    }
  };

  const handleDecryptAndImportVault = async (e: Event) => {
    e.preventDefault();
    if (!pendingVaultContent || !vaultImportPass) return;
    if (!confirmReplaceIfNeeded()) return;

    setIsVaultImporting(true);
    try {
      const payload = await decryptVaultBackup(
        pendingVaultContent,
        vaultImportPass,
      );
      const summary = await importBackup(payload, importMode);
      await reloadAppState();
      loadSnapshots().then(setSnapshots).catch(() => {});
      setPendingVaultContent(null);
      setVaultImportPass("");
      setBackupMessage(
        `Şifreli kasa yedeği çözüldü ve içe aktarıldı: ${summary.importedCount} gün güncellendi 🔒✅`,
      );
    } catch (err) {
      setBackupMessage(`Kasa çözme hatası: ${(err as Error).message}`);
    } finally {
      setIsVaultImporting(false);
    }
  };

  const handleEnableLock = async (e: Event) => {
    e.preventDefault();
    if (lockPassphrase.length < 4 || !lockPassphrase.trim()) {
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
      await enableVaultLock(lockPassphrase);
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
      await disableVaultLock(removePassphraseInput);
      setRemovePassphraseInput("");
      setShowRemoveForm(false);
      setLockMessage(STRINGS.settings.lockRemoved);
    } catch {
      setLockMessage("Mevcut parola veya PIN hatalı!");
    } finally {
      setIsLockLoading(false);
    }
  };

  const handleChangePassphrase = async (e: Event) => {
    e.preventDefault();
    if (newPassInput.length < 4 || !newPassInput.trim()) {
      setLockMessage("Yeni parola veya PIN en az 4 karakter olmalıdır.");
      return;
    }
    if (newPassInput !== newPassConfirmInput) {
      setLockMessage("Yeni parolalar eşleşmiyor!");
      return;
    }

    setIsLockLoading(true);
    setLockMessage(null);
    try {
      await changeVaultPassphrase(oldPassInput, newPassInput);
      setOldPassInput("");
      setNewPassInput("");
      setNewPassConfirmInput("");
      setShowChangePassForm(false);
      setLockMessage(
        "Parola değiştirildi ve tüm veriler yeni anahtarla yeniden şifrelendi ✅",
      );
    } catch {
      setLockMessage("Mevcut parola hatalı veya anahtar döndürülemedi!");
    } finally {
      setIsLockLoading(false);
    }
  };

  const handleLockNow = () => {
    lockApp();
  };

  const handleRerunWizard = async () => {
    await persistSettings({
      ...settings,
      onboardingCompleted: false,
    });
  };

  const handleWipeAllData = async () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "TÜM döngü kayıtlarınız, yerel snapshot'larınız ve kilit ayarlarınız kalıcı olarak silinecektir. Bu işlem geri alınamaz. Emin misiniz?",
      )
    ) {
      return;
    }
    await wipeAllAppData();
    setSnapshots([]);
    setBackupMessage("Tüm yerel veriler kalıcı olarak temizlendi.");
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

        <div
          style={{
            borderTop: "1px solid var(--border-subtle)",
            marginTop: "14px",
            paddingTop: "14px",
          }}
        >
          <p
            style={{
              fontSize: "13px",
              fontWeight: "700",
              color: "var(--text-primary)",
              marginBottom: "8px",
            }}
          >
            Takip Amacınız
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {(["track_only", "avoid_pregnancy", "conceive"] as const).map(
              (goalKey) => (
                <label
                  key={goalKey}
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
                    name="trackingGoal"
                    checked={(settings.goal ?? "track_only") === goalKey}
                    onChange={() =>
                      persistSettings({ ...settings, goal: goalKey })
                    }
                  />
                  <span>{STRINGS.goals[goalKey]}</span>
                </label>
              ),
            )}
          </div>
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
            value={cycleLenInput}
            onInput={(e) => {
              const raw = (e.target as HTMLInputElement).value;
              setCycleLenInput(raw);
              const val = Number(raw);
              if (Number.isInteger(val) && val >= 20 && val <= 45) {
                persistSettings({ ...settings, defaultCycleLength: val });
              }
            }}
            onBlur={() => {
              const val = Number(cycleLenInput);
              if (!Number.isInteger(val) || val < 20 || val > 45) {
                setCycleLenInput(String(settings.defaultCycleLength));
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

      {/* 2b. Theme Appearance */}
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
            marginBottom: "10px",
          }}
        >
          🎨 {STRINGS.settings.theme}
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
          {(
            [
              { id: "auto", label: "Sistem (Oto)" },
              { id: "dark", label: "Koyu 🌙" },
              { id: "light", label: "Açık ☀️" },
            ] as const
          ).map((opt) => {
            const active = settings.theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => persistSettings({ ...settings, theme: opt.id })}
                style={{
                  padding: "10px 6px",
                  borderRadius: "var(--radius-sm)",
                  border: active
                    ? "2px solid var(--accent-primary)"
                    : "1px solid var(--border-subtle)",
                  backgroundColor: active
                    ? "var(--accent-surface)"
                    : "var(--bg-elevated)",
                  color: active
                    ? "var(--accent-primary)"
                    : "var(--text-secondary)",
                  fontSize: "12px",
                  fontWeight: active ? "700" : "500",
                  cursor: "pointer",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* 2c. Reminders */}
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
            marginBottom: "10px",
          }}
        >
          🔔 Hatırlatıcı Tercihleri
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "13px",
              color: "var(--text-primary)",
              cursor: "pointer",
            }}
          >
            <span>Günlük kayıt ve BBT hatırlatıcısı</span>
            <input
              type="checkbox"
              checked={settings.reminderBbtEnabled}
              onChange={(e) =>
                persistSettings({
                  ...settings,
                  reminderBbtEnabled: (e.target as HTMLInputElement).checked,
                })
              }
            />
          </label>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "13px",
              color: "var(--text-secondary)",
            }}
          >
            <label htmlFor="bbt-reminder-time">Varsayılan BBT ölçüm saati:</label>
            <input
              id="bbt-reminder-time"
              type="time"
              value={settings.reminderBbtTime}
              onChange={(e) =>
                persistSettings({
                  ...settings,
                  reminderBbtTime: (e.target as HTMLInputElement).value || "07:00",
                })
              }
              style={{
                padding: "6px 8px",
                backgroundColor: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-primary)",
                fontSize: "13px",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "13px",
              color: "var(--text-secondary)",
            }}
          >
            <label htmlFor="period-lead-days">Yaklaşan regl uyarısı (gün kala):</label>
            <select
              id="period-lead-days"
              value={settings.reminderPeriodDaysBefore}
              onChange={(e) =>
                persistSettings({
                  ...settings,
                  reminderPeriodDaysBefore: Number(
                    (e.target as HTMLSelectElement).value,
                  ),
                })
              }
              style={{
                padding: "6px 10px",
                backgroundColor: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-primary)",
                fontSize: "13px",
              }}
            >
              <option value={0}>Yalnızca regl günü</option>
              <option value={1}>1 gün kala</option>
              <option value={2}>2 gün kala</option>
              <option value={3}>3 gün kala</option>
              <option value={5}>5 gün kala</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              exportCalendarEventToDevice({
                startDate: getLocalTodayISO(),
                time: settings.reminderBbtTime,
                title: "BBT Ölçüm Hatırlatıcısı",
                description:
                  "Uyanır uyanmaz bazal vücut ısınızı ölçün ve Regl uygulamasına kaydedin.",
                recurrenceRule: "FREQ=DAILY",
                alarmMinutesBefore: 0,
              });
            }}
            style={{
              width: "100%",
              padding: "10px 12px",
              backgroundColor: "var(--bg-elevated)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            ⏰ Günlük BBT Ölçüm Alarmını Takvime Ekle (.ics)
          </button>
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

            {/* Auto-lock timeout selector */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "8px",
                marginBottom: "12px",
                padding: "8px 10px",
                backgroundColor: "var(--bg-elevated)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <label
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  fontWeight: "600",
                }}
              >
                Hareketsizlik Otomatik Kilidi:
              </label>
              <select
                value={settings.lockAutoMinutes ?? 3}
                onChange={(e) => {
                  const mins = Number((e.target as HTMLSelectElement).value);
                  persistSettings({ ...settings, lockAutoMinutes: mins });
                }}
                style={{
                  padding: "6px 10px",
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)",
                  fontSize: "12px",
                  fontWeight: "600",
                }}
              >
                <option value={1}>1 dakika</option>
                <option value={3}>3 dakika</option>
                <option value={5}>5 dakika</option>
                <option value={10}>10 dakika</option>
                <option value={15}>15 dakika</option>
                <option value={0}>Yalnızca arka plan / manuel</option>
              </select>
            </div>

            {/* Change Passphrase Form */}
            {!showChangePassForm ? (
              <button
                type="button"
                onClick={() => {
                  setShowChangePassForm(true);
                  setShowRemoveForm(false);
                }}
                style={{
                  width: "100%",
                  padding: "10px",
                  marginBottom: "8px",
                  backgroundColor: "var(--bg-elevated)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                🔑 Parolayı / PIN&apos;i Değiştir
              </button>
            ) : (
              <form
                onSubmit={handleChangePassphrase}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  marginBottom: "10px",
                  padding: "10px",
                  backgroundColor: "var(--bg-elevated)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <input
                  type="password"
                  placeholder="Mevcut Parola veya PIN"
                  value={oldPassInput}
                  onInput={(e) =>
                    setOldPassInput((e.target as HTMLInputElement).value)
                  }
                  onChange={(e) =>
                    setOldPassInput((e.target as HTMLInputElement).value)
                  }
                  style={{
                    padding: "10px",
                    backgroundColor: "var(--bg-surface)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text-primary)",
                    fontSize: "14px",
                  }}
                />
                <input
                  type="password"
                  placeholder="Yeni Parola veya PIN (en az 4 karakter)"
                  value={newPassInput}
                  onInput={(e) =>
                    setNewPassInput((e.target as HTMLInputElement).value)
                  }
                  onChange={(e) =>
                    setNewPassInput((e.target as HTMLInputElement).value)
                  }
                  style={{
                    padding: "10px",
                    backgroundColor: "var(--bg-surface)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text-primary)",
                    fontSize: "14px",
                  }}
                />
                <input
                  type="password"
                  placeholder="Yeni Parolayı Tekrar Girin"
                  value={newPassConfirmInput}
                  onInput={(e) =>
                    setNewPassConfirmInput((e.target as HTMLInputElement).value)
                  }
                  onChange={(e) =>
                    setNewPassConfirmInput((e.target as HTMLInputElement).value)
                  }
                  style={{
                    padding: "10px",
                    backgroundColor: "var(--bg-surface)",
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
                    {isLockLoading ? "Yeniden Şifreleniyor..." : "Güncelle"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowChangePassForm(false);
                      setOldPassInput("");
                      setNewPassInput("");
                      setNewPassConfirmInput("");
                    }}
                    style={{
                      padding: "10px 14px",
                      backgroundColor: "var(--bg-surface)",
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

            {!showRemoveForm ? (
              <button
                type="button"
                onClick={() => {
                  setShowRemoveForm(true);
                  setShowChangePassForm(false);
                }}
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
                  onInput={(e) =>
                    setRemovePassphraseInput(
                      (e.target as HTMLInputElement).value,
                    )
                  }
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
                    {isLockLoading ? "Çözülüyor..." : "Kilidi Kaldır"}
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
              onInput={(e) =>
                setLockPassphrase((e.target as HTMLInputElement).value)
              }
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
              onInput={(e) =>
                setLockConfirmPassphrase((e.target as HTMLInputElement).value)
              }
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
                ? "Veriler Şifreleniyor (600k iterasyon)..."
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
            onClick={() => setShowVaultExportForm((v) => !v)}
            style={{
              padding: "12px",
              minHeight: "var(--touch-target-min)",
              backgroundColor: "var(--fertile-surface)",
              color: "var(--fertile-color)",
              border: "1px solid var(--fertile-color)",
              borderRadius: "var(--radius-sm)",
              fontSize: "14px",
              fontWeight: "700",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            🔒 Şifreli Kasa Yedeği İndir / Paylaş (.reglvault)
          </button>

          {showVaultExportForm && (
            <form
              onSubmit={handleExportEncryptedVault}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                padding: "10px",
                backgroundColor: "var(--bg-elevated)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Bu yedek dosyası cihazınızdan çıkmadan AES-GCM 256-bit ile
                şifrelenir.
              </span>
              <input
                type="password"
                placeholder="Yedekleme Parolası (en az 4 karakter)"
                value={vaultExportPass}
                onInput={(e) =>
                  setVaultExportPass((e.target as HTMLInputElement).value)
                }
                onChange={(e) =>
                  setVaultExportPass((e.target as HTMLInputElement).value)
                }
                style={{
                  padding: "10px",
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                }}
              />
              <input
                type="password"
                placeholder="Yedekleme Parolasını Tekrar Girin"
                value={vaultExportPassConfirm}
                onInput={(e) =>
                  setVaultExportPassConfirm(
                    (e.target as HTMLInputElement).value,
                  )
                }
                onChange={(e) =>
                  setVaultExportPassConfirm(
                    (e.target as HTMLInputElement).value,
                  )
                }
                style={{
                  padding: "10px",
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                }}
              />
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="submit"
                  disabled={isVaultExporting || !vaultExportPass}
                  style={{
                    flex: 1,
                    padding: "10px",
                    backgroundColor: "var(--fertile-color)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "13px",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  {isVaultExporting
                    ? "Şifreleniyor..."
                    : "Şifreli Yedeği Oluştur 🔒"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowVaultExportForm(false);
                    setVaultExportPass("");
                    setVaultExportPassConfirm("");
                  }}
                  style={{
                    padding: "10px 14px",
                    backgroundColor: "var(--bg-surface)",
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

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              padding: "8px 10px",
              backgroundColor: "var(--bg-elevated)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <span
              style={{
                fontSize: "12px",
                color: "var(--text-secondary)",
                fontWeight: "600",
              }}
            >
              İçe Aktarma Modu:
            </span>
            <select
              value={importMode}
              onChange={(e) =>
                setImportMode(
                  (e.target as HTMLSelectElement).value as "merge" | "replace",
                )
              }
              style={{
                padding: "6px 10px",
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-primary)",
                fontSize: "12px",
                fontWeight: "600",
              }}
            >
              <option value="merge">Birleştir (Merge)</option>
              <option value="replace">Üzerine Yaz (Replace)</option>
            </select>
          </div>

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
            📥 {STRINGS.settings.importBackup} (.json, .reglvault, .pc, .bak)
            <input
              type="file"
              accept=".json,.reglvault,.pc,.bak"
              onClick={() => suspendAutoLockForExternalPicker()}
              onChange={handleFileImport}
              style={{ display: "none" }}
            />
          </label>

          {pendingVaultContent && (
            <form
              onSubmit={handleDecryptAndImportVault}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                padding: "10px",
                backgroundColor: "var(--bg-elevated)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--accent-primary)",
              }}
            >
              <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>
                🔒 Seçilen şifreli `.reglvault` yedeğini açmak için parolayı
                girin:
              </span>
              <input
                type="password"
                placeholder="Kasa Yedek Parolası"
                value={vaultImportPass}
                onInput={(e) =>
                  setVaultImportPass((e.target as HTMLInputElement).value)
                }
                onChange={(e) =>
                  setVaultImportPass((e.target as HTMLInputElement).value)
                }
                style={{
                  padding: "10px",
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                }}
              />
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="submit"
                  disabled={isVaultImporting || !vaultImportPass}
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
                  {isVaultImporting ? "Çözülüyor..." : "Çöz ve İçe Aktar"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingVaultContent(null);
                    setVaultImportPass("");
                  }}
                  style={{
                    padding: "10px 14px",
                    backgroundColor: "var(--bg-surface)",
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

        {/* Yerel Rolling Snapshots */}
        <div
          style={{
            marginTop: "16px",
            paddingTop: "14px",
            borderTop: "1px solid var(--border-subtle)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "10px",
            }}
          >
            <div>
              <h4
                style={{
                  fontSize: "13px",
                  fontWeight: "700",
                  color: "var(--text-primary)",
                }}
              >
                📸 Yerel Güvenlik Yedekleri (Snapshots)
              </h4>
              <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                Haftalık otomatik alınan son 4 yerel kurtarma noktası.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCreateSnapshot}
              style={{
                padding: "6px 10px",
                backgroundColor: "var(--accent-surface)",
                color: "var(--accent-primary)",
                border: "1px solid var(--accent-primary)",
                borderRadius: "var(--radius-sm)",
                fontSize: "11px",
                fontWeight: "700",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              + Yedek Al
            </button>
          </div>

          {snapshots.length === 0 ? (
            <p
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                fontStyle: "italic",
              }}
            >
              Henüz kaydedilmiş yerel snapshot bulunmuyor.
            </p>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {snapshots.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    backgroundColor: "var(--bg-elevated)",
                    padding: "8px 12px",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "12px",
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontWeight: "600",
                        color: "var(--text-primary)",
                      }}
                    >
                      {s.formattedDate}
                    </span>
                    <span
                      style={{
                        marginLeft: "8px",
                        color: "var(--text-muted)",
                        fontSize: "11px",
                      }}
                    >
                      ({s.entryCount} gün)
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => handleRestoreSnapshot(s.id)}
                      style={{
                        padding: "4px 8px",
                        backgroundColor: "transparent",
                        border: "1px solid var(--border-strong)",
                        borderRadius: "var(--radius-sm)",
                        color: "var(--text-primary)",
                        cursor: "pointer",
                        fontSize: "11px",
                      }}
                    >
                      Geri Yükle ↺
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSnapshot(s.id)}
                      style={{
                        padding: "4px 8px",
                        backgroundColor: "transparent",
                        border: "none",
                        color: "var(--accent-primary)",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                      title="Sil"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
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
          <button
            type="button"
            onClick={() => setShowRulesGuide((v) => !v)}
            style={{
              padding: "10px 12px",
              backgroundColor: "var(--bg-elevated)",
              color: "var(--text-primary)",
              borderRadius: "var(--radius-sm)",
              fontSize: "13px",
              fontWeight: "600",
              border: "1px solid var(--border-subtle)",
              cursor: "pointer",
              textAlign: "left",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>📋 Çevrimdışı Sensiplan Kuralları Hızlı Kılavuzu</span>
            <span>{showRulesGuide ? "▲" : "▼"}</span>
          </button>

          {showRulesGuide && (
            <div
              style={{
                backgroundColor: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "12px",
                fontSize: "12px",
                color: "var(--text-secondary)",
                lineHeight: "1.55",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <p>
                <strong>[T1–T6] Termal Yükseliş (3 Üzeri 6):</strong> Bir önceki
                kesintisiz 6 düşük sıcaklığın en yükseğinin üzerine çıkan ardışık
                3 yüksek gün aranır. 3. gün en az <strong>+0.20 °C</strong>{" "}
                yüksek olmalıdır (sağlanmazsa 4. gün kaplama çizgisi üzeri veya
                istisna kuralları T2/T3 uygulanır).
              </p>
              <p>
                <strong>[M1–M2] Servikal Mukus ve Pik + 3 Kuralı:</strong> En
                kaliteli doğurgan mukusun (<em>S+</em> veya <em>S</em>) görüldüğü
                son gün <strong>Zirve Gün (Peak)</strong> sayılır ve ardından{" "}
                <strong>3 ardışık</strong> daha az doğurgan gün geçmesi beklenir.
              </p>
              <p>
                <strong>[D1] Çift-Kontrol (Double-Check):</strong> Hem BBT
                yükselişi hem de mukus/serviks kuralları tamamlandığında geç dönem
                biyolojik kısır evre başlar.
              </p>
              <p>
                <strong>[E1–E4] Erken (Pre-ovülatuar) Güvenli Günler:</strong>{" "}
                İlk 5 gün kuralı veya en az 12 döngüyle <em>Minus-8</em> kuralı
                uygulanır; doğurgan mukus başladığı an erken kısır pencere biter.
              </p>
              <p>
                <strong>[X1] Bozucu Etkenler:</strong> Hastalık, alkol, az uyku
                veya geç ölçüm nedeniyle olağandışı yüksek çıkan ölçümler dışlanabilir.
              </p>
            </div>
          )}

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

      {/* 8. Danger Zone: Wipe All Data */}
      <section
        style={{
          backgroundColor: "var(--bg-surface)",
          borderRadius: "var(--radius-md)",
          padding: "16px",
          border: "1px solid var(--accent-primary)",
          marginBottom: "16px",
        }}
      >
        <h3
          style={{
            fontSize: "15px",
            fontWeight: "700",
            color: "var(--accent-primary)",
            marginBottom: "8px",
          }}
        >
          🗑️ Verileri Temizle
        </h3>
        <p
          style={{
            fontSize: "12px",
            color: "var(--text-muted)",
            marginBottom: "12px",
          }}
        >
          Cihazdaki tüm sağlık kayıtlarını, snapshot&apos;ları ve kasa kilidi
          ayarlarını kalıcı olarak siler.
        </p>
        <button
          type="button"
          onClick={handleWipeAllData}
          style={{
            width: "100%",
            padding: "10px",
            backgroundColor: "var(--accent-surface)",
            border: "1px solid var(--accent-primary)",
            borderRadius: "var(--radius-sm)",
            color: "var(--accent-primary)",
            fontSize: "13px",
            fontWeight: "700",
            cursor: "pointer",
          }}
        >
          Tüm Verileri Kalıcı Olarak Sil
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
