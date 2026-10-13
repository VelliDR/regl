import { useState } from "preact/hooks";
import { settingsSignal } from "../../app/state";
import { unwrapDekFromEnvelope, WrappedKeyEnvelope } from "../../data/crypto";

interface LockScreenProps {
  readonly onUnlock: () => void;
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  const settings = settingsSignal.value;
  const [passphrase, setPassphrase] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  const handleUnlock = async (e: Event) => {
    e.preventDefault();
    if (!passphrase.trim()) return;

    setIsVerifying(true);
    setErrorMsg(null);

    try {
      if (!settings.lockEnvelopeJson) {
        // Fallback if no envelope saved yet
        onUnlock();
        return;
      }

      const envelope: WrappedKeyEnvelope = JSON.parse(
        settings.lockEnvelopeJson,
      );
      await unwrapDekFromEnvelope(passphrase.trim(), envelope);
      onUnlock();
    } catch {
      setErrorMsg("Geçersiz parola veya PIN. Lütfen tekrar deneyin.");
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
            disabled={isVerifying}
            style={{
              padding: "12px",
              minHeight: "var(--touch-target-min)",
              backgroundColor: "var(--accent-primary)",
              color: "#ffffff",
              border: "none",
              borderRadius: "var(--radius-full)",
              fontSize: "15px",
              fontWeight: "700",
              cursor: isVerifying ? "wait" : "pointer",
              opacity: isVerifying ? 0.7 : 1,
            }}
          >
            {isVerifying ? "Doğrulanıyor..." : "Kilidi Aç 🔓"}
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
