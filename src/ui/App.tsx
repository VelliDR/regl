import { useEffect, useRef, useState } from "preact/hooks";
import {
  entriesSignal,
  getLocalTodayISO,
  initializeAppState,
  isInitializedSignal,
  isLockedSignal,
  selectedDateSignal,
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

const VALID_TABS: readonly ScreenTab[] = [
  "today",
  "calendar",
  "chart",
  "insights",
  "settings",
];

function parseInitialTab(): ScreenTab {
  if (typeof window === "undefined") return "today";
  const hashTab = window.location.hash.replace("#", "") as ScreenTab;
  return VALID_TABS.includes(hashTab) ? hashTab : "today";
}

export function App() {
  const isInitialized = isInitializedSignal.value;
  const settings = settingsSignal.value;
  const isLocked = isLockedSignal.value;
  const entries = entriesSignal.value;

  const [currentTab, setCurrentTab] = useState<ScreenTab>(parseInitialTab);
  const [isBackgrounded, setIsBackgrounded] = useState<boolean>(false);
  const lastKnownTodayRef = useRef(getLocalTodayISO());
  const idleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    initializeAppState();
  }, []);

  // --- Faz 2: Android popstate Back-Button Navigation ---
  useEffect(() => {
    // Sync initial history state
    if (typeof window !== "undefined") {
      const initialTab = parseInitialTab();
      window.history.replaceState({ tab: initialTab }, "", `#${initialTab}`);
    }

    const handlePopState = (e: PopStateEvent) => {
      const targetTab =
        (e.state?.tab as ScreenTab) ||
        (window.location.hash.replace("#", "") as ScreenTab) ||
        "today";
      if (VALID_TABS.includes(targetTab)) {
        setCurrentTab(targetTab);
      } else {
        setCurrentTab("today");
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigateToTab = (tab: ScreenTab) => {
    if (tab !== currentTab) {
      if (typeof window !== "undefined") {
        window.history.pushState({ tab }, "", `#${tab}`);
      }
      setCurrentTab(tab);
    }
  };

  // --- Faz 2: Midnight Rollover Check ---
  useEffect(() => {
    const checkMidnightRollover = () => {
      const currentToday = getLocalTodayISO();
      if (currentToday !== lastKnownTodayRef.current) {
        // If user was viewing today's entry, roll over to the new day
        if (selectedDateSignal.value === lastKnownTodayRef.current) {
          selectedDateSignal.value = currentToday;
        }
        lastKnownTodayRef.current = currentToday;
      }
    };

    const intervalId = window.setInterval(checkMidnightRollover, 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  // --- Faz 3: Task-Switcher Privacy Mask & Background Auto-Lock ---
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isHidden = document.visibilityState === "hidden";
      setIsBackgrounded(isHidden);

      if (isHidden) {
        // Auto-lock when backgrounded if lock is configured
        if (settings.lockEnabled && settings.lockEnvelopeJson) {
          isLockedSignal.value = true;
        }
      } else {
        // Re-check midnight rollover on awakening
        const currentToday = getLocalTodayISO();
        if (currentToday !== lastKnownTodayRef.current) {
          if (selectedDateSignal.value === lastKnownTodayRef.current) {
            selectedDateSignal.value = currentToday;
          }
          lastKnownTodayRef.current = currentToday;
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [settings.lockEnabled, settings.lockEnvelopeJson]);

  // --- Faz 3: Inactivity Idle Timer (3 Minutes) ---
  useEffect(() => {
    const isLockActive =
      settings.lockEnabled && Boolean(settings.lockEnvelopeJson);
    if (!isLockActive || isLocked) {
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      return;
    }

    const resetIdleTimer = () => {
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
      }
      idleTimerRef.current = window.setTimeout(
        () => {
          isLockedSignal.value = true;
        },
        3 * 60 * 1000,
      ); // 3 minutes idle
    };

    resetIdleTimer();

    const activityEvents = [
      "pointerdown",
      "touchstart",
      "keydown",
      "scroll",
    ] as const;
    activityEvents.forEach((ev) =>
      window.addEventListener(ev, resetIdleTimer, { passive: true }),
    );

    return () => {
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      activityEvents.forEach((ev) =>
        window.removeEventListener(ev, resetIdleTimer),
      );
    };
  }, [settings.lockEnabled, settings.lockEnvelopeJson, isLocked]);

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
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        position: "relative",
      }}
    >
      {/* Faz 3: Android Task-Switcher Privacy Mask */}
      {isBackgrounded && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999999,
            backgroundColor: "var(--bg-primary)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            color: "var(--text-muted)",
          }}
        >
          <span style={{ fontSize: "48px" }}>🌸</span>
          <span style={{ fontSize: "13px", fontWeight: "600" }}>
            Gizlilik Koruması Aktif
          </span>
        </div>
      )}

      {/* Active Screen */}
      <main style={{ flex: 1 }}>
        {currentTab === "today" && <TodayScreen />}
        {currentTab === "calendar" && (
          <CalendarScreen
            onOpenDayEditor={() => {
              navigateToTab("today");
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
        onSelectTab={navigateToTab}
        isSymptothermal={settings.trackingMode === "symptothermal"}
      />
    </div>
  );
}
