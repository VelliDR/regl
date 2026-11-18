import { useEffect, useState } from "preact/hooks";
import {
  loadLockThrottleState,
  saveLockThrottleState,
  settingsSignal,
  unlockVaultWithPassphrase,
} from "../../app/state";

interface LockScreenProps {
  readonly onUnlock: () => void;
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  const settings = settingsSignal.value;
  const [passphrase, setPassphrase] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [failedAttempts, setFailedAttempts] = useState<number>(0);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);

  // Restore persisted brute-force throttle on mount so page reload doesn't bypass cooldown
  useEffect(() => {
    let active = true;
    loadLockThrottleState().then((throttle) => {
      if (!active) return;
      setFailedAttempts(throttle.failedAttempts);
      if (throttle.lockUntil > Date.now()) {
        const remaining = Math.ceil((throttle.lockUntil - Date.now()) / 1000);
        setCooldownRemaining(remaining);
        setErrorMsg(
          `Güvenlik bekleme süresi devam ediyor (${remaining} saniye).`,
        );
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownRemaining((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownRemaining]);

  const handleUnlock = async (e: Event) => {
    e.preventDefault();
    if (!passphrase || cooldownRemaining > 0) return;

    setIsVerifying(true);
    setErrorMsg(null);

    try {
      if (!settings.lockEnvelopeJson) {
        setErrorMsg(
          "Kasa anahtar zarfı eksik veya bozuk. Güvenlik nedeniyle kilit açılamıyor.",
        );
        return;
      }

      await unlockVaultWithPassphrase(passphrase);
      setPassphrase("");
      setFailedAttempts(0);
      onUnlock();
    } catch {
      const nextFailed = failedAttempts + 1;
      setFailedAttempts(nextFailed);

      let cooldownSec = 0;
      if (nextFailed >= 7) {
        cooldownSec = 60;
        setErrorMsg(
          "Çok fazla hatalı deneme! Güvenliğiniz için 60 saniye kilitlendi.",
        );
      } else if (nextFailed >= 5) {
        cooldownSec = 30;
        setErrorMsg(
          "Çok sayıda hatalı deneme! Güvenliğiniz için 30 saniye kilitlendi.",
        );
      } else if (nextFailed >= 3) {
        cooldownSec = 5;
        setErrorMsg(
          "Hatalı deneme. Güvenlik nedeniyle 5 saniye beklemeniz gerekiyor.",
        );
      } else {
        setErrorMsg("Geçersiz parola veya PIN. Lütfen tekrar deneyin.");
      }

      setCooldownRemaining(cooldownSec);
      await saveLockThrottleState({
        failedAttempts: nextFailed,
        lockUntil: cooldownSec > 0 ? Date.now() + cooldownSec * 1000 : 0,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}
    >
      <div style={{ maxWidth: "360px", width: "100%", textAlign: "center" }}>
        <span
          style={{ fontSize: "48px", display: "block", marginBottom: "16px" }}
        >
          🔒
        </span>
        <h2
          style={{ fontSize: "20px", fontWeight: "800", marginBottom: "8px" }}
        >
          Uygulama Kilitli
        </h2>
        <p
          style={{
            fontSize: "13px",
            color: "var(--text-secondary)",
            marginBottom: "24px",
          }}
        >
          Sağlık kayıtlarınıza erişmek için parolanızı veya PIN kodunuzu girin.
        </p>

        <form
          onSubmit={handleUnlock}
          style={{ display: "flex", flexDirection: "column", gap: "12px" }}
        >
          <input
            type="password"
            placeholder="Parola veya PIN"
            value={passphrase}
            autoFocus
            disabled={cooldownRemaining > 0}
            onInput={(e) =>
              setPassphrase((e.target as HTMLInputElement).value)
            }
            onChange={(e) =>
              setPassphrase((e.target as HTMLInputElement).value)
            }
            style={{
              padding: "12px 16px",
              backgroundColor: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              fontSize: "16px",
              textAlign: "center",
              opacity: cooldownRemaining > 0 ? 0.5 : 1,
            }}
          />

          {errorMsg && (
            <p
              style={{
                fontSize: "12px",
                color: "var(--accent-primary)",
                fontWeight: "600",
              }}
            >
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={isVerifying || cooldownRemaining > 0}
            style={{
              padding: "12px",
              minHeight: "var(--touch-target-min)",
              backgroundColor:
                cooldownRemaining > 0
                  ? "var(--bg-elevated)"
                  : "var(--accent-primary)",
              color:
                cooldownRemaining > 0
                  ? "var(--text-muted)"
                  : "#ffffff",
              border: "none",
              borderRadius: "var(--radius-full)",
              fontSize: "15px",
              fontWeight: "700",
              cursor:
                cooldownRemaining > 0
                  ? "not-allowed"
                  : isVerifying
                    ? "wait"
                    : "pointer",
              opacity: isVerifying ? 0.7 : 1,
            }}
          >
            {cooldownRemaining > 0
              ? `Lütfen bekleyin (${cooldownRemaining}s)`
              : isVerifying
                ? "Doğrulanıyor..."
                : "Kilidi Aç 🔓"}
          </button>
        </form>

        <p
          style={{
            marginTop: "24px",
            fontSize: "11px",
            color: "var(--text-muted)",
          }}
        >
          Kasa kilidi Web Crypto PBKDF2 600.000 iterasyon ile cihaz üzerinde
          doğrulanır.
        </p>
      </div>
    </div>
  );
}
