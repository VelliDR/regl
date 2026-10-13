import { useEffect, useState } from "preact/hooks";
import {
  entriesSignal,
  initializeAppState,
  isInitializedSignal,
  isLockedSignal,
  settingsSignal,
} from "../app/state";
import { BottomNav, ScreenTab } from "./components/BottomNav";
import { PwaPrompt } from "./components/PwaPrompt";
import { CalendarScreen } from "./screens/CalendarScreen";
import { ChartScreen } from "./screens/ChartScreen";
import { InsightsScreen } from "./screens/InsightsScreen";
import { LockScreen } from "./screens/LockScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TodayScreen } from "./screens/TodayScreen";

export function App() {
  const isInitialized = isInitializedSignal.value;
  const settings = settingsSignal.value;
  const isLocked = isLockedSignal.value;
  const entries = entriesSignal.value;
  const [currentTab, setCurrentTab] = useState<ScreenTab>("today");

  useEffect(() => {
    initializeAppState();
  }, []);

  // Auto-lock when user backgrounds or minimizes the app
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "hidden" &&
        settings.lockEnabled &&
        settings.lockEnvelopeJson
      ) {
        isLockedSignal.value = true;
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [settings.lockEnabled, settings.lockEnvelopeJson]);

  if (!isInitialized) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          backgroundColor: "var(--bg-primary)",
          color: "var(--text-secondary)",
          gap: "12px",
        }}
      >
        <span style={{ fontSize: "36px" }}>🌸</span>
        <p style={{ fontSize: "14px", fontWeight: "500" }}>Yükleniyor...</p>
      </div>
    );
  }

  // 1. Web Crypto Vault Lock Check
  if (settings.lockEnabled && settings.lockEnvelopeJson && isLocked) {
    return (
      <LockScreen
        onUnlock={() => {
          isLockedSignal.value = false;
        }}
      />
    );
  }

  // 2. First-Run Onboarding Wizard Check
  const needsOnboarding =
    settings.onboardingCompleted === false ||
    (settings.onboardingCompleted === undefined && entries.length === 0);

  if (needsOnboarding) {
    return (
      <OnboardingScreen
        onFinish={() => {
          // Re-render handled automatically by signal update
        }}
      />
    );
  }

  return (
    <div
      style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
    >
      {/* Active Screen */}
      <main style={{ flex: 1 }}>
        {currentTab === "today" && <TodayScreen />}
        {currentTab === "calendar" && (
          <CalendarScreen
            onOpenDayEditor={() => {
              setCurrentTab("today");
            }}
          />
        )}
        {currentTab === "chart" && <ChartScreen />}
        {currentTab === "insights" && <InsightsScreen />}
        {currentTab === "settings" && <SettingsScreen />}
      </main>

      {/* PWA Update Banner */}
      <PwaPrompt />

      {/* Bottom Navigation */}
      <BottomNav
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        isSymptothermal={settings.trackingMode === "symptothermal"}
      />
    </div>
  );
}
