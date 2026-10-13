interface ChipProps {
  readonly label: string;
  readonly selected: boolean;
  readonly onToggle: () => void;
  readonly activeColor?: string;
  readonly icon?: string;
}

export function Chip({
  label,
  selected,
  onToggle,
  activeColor,
  icon,
}: ChipProps) {
  const accent = activeColor ?? "var(--accent-primary)";

  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "8px 14px",
        minHeight: "38px",
        borderRadius: "var(--radius-full)",
        border: selected
          ? `1px solid ${accent}`
          : "1px solid var(--border-subtle)",
        backgroundColor: selected
          ? "var(--accent-surface)"
          : "var(--bg-elevated)",
        color: selected ? accent : "var(--text-secondary)",
        fontSize: "13px",
        fontWeight: selected ? "600" : "400",
        cursor: "pointer",
        userSelect: "none",
        transition: "all 0.15s ease",
      }}
    >
      {icon && <span style={{ fontSize: "14px" }}>{icon}</span>}
      <span>{label}</span>
    </button>
  );
}
