import { describe, it, expect, beforeEach } from "vitest";
import { render } from "preact";
import { InsightsScreen } from "../../src/ui/screens/InsightsScreen";
import { LockScreen } from "../../src/ui/screens/LockScreen";
import { OnboardingScreen } from "../../src/ui/screens/OnboardingScreen";
import { BottomNav } from "../../src/ui/components/BottomNav";
import { entriesSignal, settingsSignal } from "../../src/app/state";
import { DEFAULT_USER_SETTINGS } from "../../src/data/repo";

describe("UI Bileşen ve Ekran Testleri", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    entriesSignal.value = [];
    settingsSignal.value = DEFAULT_USER_SETTINGS;
  });

  it("BottomNav semptotermal modda 5 sekme, temel modda 4 sekme göstermelidir", () => {
    render(
      <BottomNav
        currentTab="today"
        onSelectTab={() => {}}
        isSymptothermal={true}
      />,
      container,
    );
    const buttonsSympto = container.querySelectorAll("button");
    expect(buttonsSympto.length).toBe(5);

    render(
      <BottomNav
        currentTab="today"
        onSelectTab={() => {}}
        isSymptothermal={false}
      />,
      container,
    );
    const buttonsBasic = container.querySelectorAll("button");
    expect(buttonsBasic.length).toBe(4);
  });

  it("InsightsScreen veri yokken bile çökmeden boş durum metriklerini çizmelidir", () => {
    render(<InsightsScreen />, container);
    expect(container.textContent).toContain("İçgörüler ve İstatistikler");
    expect(container.textContent).toContain("Ortalama Döngü");
    expect(container.textContent).toContain("Ortalama Kanama");
  });

  it("LockScreen kilit başlığını ve PIN/parola giriş alanını göstermelidir", () => {
    render(<LockScreen onUnlock={() => {}} />, container);

    expect(container.textContent).toContain("Uygulama Kilitli");
    const input = container.querySelector('input[type="password"]');
    expect(input).not.toBeNull();
  });

  it("OnboardingScreen ilk adımda hoş geldiniz metnini ve butonunu sunmalıdır", () => {
    render(<OnboardingScreen onFinish={() => {}} />, container);
    expect(container.textContent).toContain("Hoş Geldiniz");
    expect(container.textContent).toContain("Sıfır Sunucu");
    expect(container.textContent).toContain("Başlayalım");
  });
});
