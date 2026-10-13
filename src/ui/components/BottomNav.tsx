import { STRINGS } from "../strings.tr";

export type ScreenTab =
  "today" | "calendar" | "chart" | "insights" | "settings";

interface BottomNavProps {
  readonly currentTab: ScreenTab;
  readonly onSelectTab: (tab: ScreenTab) => void;
  readonly isSymptothermal: boolean;
}

export function BottomNav({
  currentTab,
  onSelectTab,
  isSymptothermal,
}: BottomNavProps) {
  const tabs: { id: ScreenTab; label: string; icon: string }[] = [
    { id: "today", label: STRINGS.nav.today, icon: "🌸" },
    { id: "calendar", label: STRINGS.nav.calendar, icon: "📅" },
    ...(isSymptothermal
      ? [{ id: "chart" as ScreenTab, label: STRINGS.nav.chart, icon: "📈" }]
      : []),
    { id: "insights", label: STRINGS.nav.insights, icon: "📊" },
    { id: "settings", label: STRINGS.nav.settings, icon: "⚙️" },
  ];

  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "var(--bg-surface)",
        borderTop: "1px solid var(--border-subtle)",
        display: "flex",
        justifyContent: "space-around",
        alignItems: "center",
        paddingBottom: "calc(var(--safe-bottom) + 4px)",
        paddingTop: "6px",
        zIndex: 100,
        backdropFilter: "blur(10px)",
      }}
    >
      {tabs.map((tab) => {
        const isActive = currentTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectTab(tab.id)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
              minHeight: "var(--touch-target-min)",
              background: "none",
              border: "none",
              color: isActive ? "var(--accent-primary)" : "var(--text-muted)",
              fontWeight: isActive ? "700" : "500",
              fontSize: "11px",
              cursor: "pointer",
              transition: "color 0.15s ease",
            }}
          >
            <span style={{ fontSize: "20px", lineHeight: 1 }}>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
