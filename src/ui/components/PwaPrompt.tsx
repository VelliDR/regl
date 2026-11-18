import { signal } from "@preact/signals";

export const pwaNeedRefreshSignal = signal<boolean>(false);

export function PwaPrompt() {
  const needRefresh = pwaNeedRefreshSignal.value;

  return needRefresh ? (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: "80px",
        left: "16px",
        right: "16px",
        backgroundColor: "var(--bg-elevated)",
        border: "1px solid var(--accent-primary)",
        borderRadius: "var(--radius-md)",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        zIndex: 200,
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      }}
    >
      <span style={{ fontSize: "13px", color: "var(--text-primary)" }}>
        ✨ Uygulamanın yeni bir sürümü hazır.
      </span>
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            backgroundColor: "var(--accent-primary)",
            color: "#ffffff",
            border: "none",
            borderRadius: "var(--radius-sm)",
            padding: "6px 12px",
            fontSize: "12px",
            fontWeight: "700",
            cursor: "pointer",
          }}
        >
          Yenile
        </button>
        <button
          type="button"
          aria-label="Kapat"
          onClick={() => {
            pwaNeedRefreshSignal.value = false;
          }}
          style={{
            background: "none",
            color: "var(--text-muted)",
            border: "none",
            padding: "6px",
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>
    </div>
  ) : null;
}
