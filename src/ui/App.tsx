import { useEffect, useState } from 'preact/hooks';
import {
  initializeAppState,
  isInitializedSignal,
  settingsSignal,
} from '../app/state';
import { BottomNav, ScreenTab } from './components/BottomNav';
import { PwaPrompt } from './components/PwaPrompt';
import { CalendarScreen } from './screens/CalendarScreen';
import { ChartScreen } from './screens/ChartScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TodayScreen } from './screens/TodayScreen';

export function App() {
  const isInitialized = isInitializedSignal.value;
  const settings = settingsSignal.value;
  const [currentTab, setCurrentTab] = useState<ScreenTab>('today');

  useEffect(() => {
    initializeAppState();
  }, []);

  if (!isInitialized) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-secondary)',
          gap: '12px',
        }}
      >
        <span style={{ fontSize: '36px' }}>🌸</span>
        <p style={{ fontSize: '14px', fontWeight: '500' }}>Yükleniyor...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Active Screen */}
      <main style={{ flex: 1 }}>
        {currentTab === 'today' && <TodayScreen />}
        {currentTab === 'calendar' && (
          <CalendarScreen
            onOpenDayEditor={() => {
              setCurrentTab('today');
            }}
          />
        )}
        {currentTab === 'chart' && <ChartScreen />}
        {currentTab === 'settings' && <SettingsScreen />}
      </main>

      {/* PWA Update Banner */}
      <PwaPrompt />

      {/* Bottom Navigation */}
      <BottomNav
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        isSymptothermal={settings.trackingMode === 'symptothermal'}
      />
    </div>
  );
}
