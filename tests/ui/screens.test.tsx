import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { render } from "preact";
import { InsightsScreen } from "../../src/ui/screens/InsightsScreen";
import { LockScreen } from "../../src/ui/screens/LockScreen";
import { OnboardingScreen } from "../../src/ui/screens/OnboardingScreen";
import { BottomNav } from "../../src/ui/components/BottomNav";
import {
  entriesSignal,
  selectedDateSignal,
  settingsSignal,
} from "../../src/app/state";
import { DEFAULT_USER_SETTINGS, dayRepository } from "../../src/data/repo";
import { parseISODate } from "../../src/core/date";
import { CentiCelsius } from "../../src/core/types";

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

  it("TodayScreen kısa bilgi kartlarını çizmeli ve karta tıklandığında alt çekmece açılmalıdır", async () => {
    const { TodayScreen } = await import("../../src/ui/screens/TodayScreen");
    render(<TodayScreen />, container);

    // Kısa bilgi kartlarının varlığını doğrula
    expect(container.textContent).toContain("Kanama");
    expect(container.textContent).toContain("Bazal Vücut Isısı");
    expect(container.textContent).toContain("Servikal Mukus");
    expect(container.textContent).toContain("Belirtiler");

    // Kart butonunu bul ve tıkla
    const cards = container.querySelectorAll(".glance-card");
    expect(cards.length).toBeGreaterThanOrEqual(4);

    const bleedingCard = cards[0] as HTMLButtonElement;
    bleedingCard.click();
    await new Promise((r) => setTimeout(r, 0));

    // Alt çekmecenin (Bottom Sheet) açıldığını doğrula
    const sheetContainer = container.querySelector(".sheet-container");
    expect(sheetContainer).not.toBeNull();
    expect(sheetContainer?.textContent).toContain("Tamam ✓");
    expect(sheetContainer?.textContent).toContain("Kaydet ve Kapat ✓");

    // Kaydet ve Kapat butonuna tıklandığında çekmecenin kapandığını doğrula
    const closeButtons = sheetContainer?.querySelectorAll("button");
    const bottomCloseButton = Array.from(closeButtons ?? []).find((b) =>
      b.textContent?.includes("Kaydet ve Kapat"),
    );
    expect(bottomCloseButton).toBeDefined();
    bottomCloseButton?.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(container.querySelector(".sheet-container")).toBeNull();
  });

  it("TodayScreen döngü fazı butonlarını (Menstrüasyon, Foliküler, Ovülasyon, Luteal) ve faz kartını göstermelidir", async () => {
    const { TodayScreen } = await import("../../src/ui/screens/TodayScreen");
    render(<TodayScreen />, container);

    // 4-faz butonlarının varlığını kontrol et
    const phasePills = container.querySelectorAll(".phase-pill");
    expect(phasePills.length).toBe(4);

    expect(container.textContent).toContain("Menstrüasyon");
    expect(container.textContent).toContain("Foliküler");
    expect(container.textContent).toContain("Ovülasyon");
    expect(container.textContent).toContain("Luteal");

    // Faz detay kartının varlığı
    const spotlightCard = container.querySelector(".phase-spotlight-card");
    expect(spotlightCard).not.toBeNull();
    expect(spotlightCard?.textContent).toContain("Rehber ℹ️");

    // Luteal faz hapına tıkla ve rehber çekmecesinin açıldığını doğrula
    const lutealPill = phasePills[3] as HTMLButtonElement;
    lutealPill.click();
    await new Promise((r) => setTimeout(r, 0));

    const sheetContainer = container.querySelector(".sheet-container");
    expect(sheetContainer).not.toBeNull();
    expect(sheetContainer?.textContent).toContain("Döngü Fazları Rehberi");
    expect(sheetContainer?.textContent).toContain("Luteal Faz");
    expect(sheetContainer?.textContent).toContain("Hormonal Durum ve Biyoloji");
    expect(sheetContainer?.textContent).toContain("Anladım ✓");

    // Anladım butonuna tıkla ve kapandığını doğrula
    const anladimButton = Array.from(
      sheetContainer?.querySelectorAll("button") ?? [],
    ).find((b) => b.textContent?.includes("Anladım"));
    anladimButton?.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(container.querySelector(".sheet-container")).toBeNull();
  });

  it("LockScreen anahtar zarfı eksikse kilidi fail-open olarak açmamalıdır", async () => {
    let unlocked = false;
    settingsSignal.value = {
      ...DEFAULT_USER_SETTINGS,
      lockEnabled: true,
    };

    render(
      <LockScreen
        onUnlock={() => {
          unlocked = true;
        }}
      />,
      container,
    );

    const input = container.querySelector(
      'input[type="password"]',
    ) as HTMLInputElement;
    const form = container.querySelector("form") as HTMLFormElement;
    input.value = "1234";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));

    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 20));

    expect(unlocked).toBe(false);
    expect(container.textContent).toContain("eksik veya bozuk");
  });

  it("TodayScreen hariç tutulan (excluded) tekil BBT kaydını boş sayıp silmemelidir", async () => {
    await dayRepository.clearAllData();
    const date = parseISODate("2026-11-18");
    selectedDateSignal.value = date;
    entriesSignal.value = [
      {
        date,
        bbt: { value: 3750 as CentiCelsius, time: "07:00" },
        updatedAt: 1000,
      },
    ];

    const { TodayScreen } = await import("../../src/ui/screens/TodayScreen");
    render(<TodayScreen />, container);

    // BBT kartına tıkla ve alt çekmeceyi aç
    const bbtCard = Array.from(container.querySelectorAll(".glance-card")).find(
      (c) => c.textContent?.includes("Bazal Vücut Isısı"),
    ) as HTMLButtonElement;
    bbtCard.click();
    await new Promise((r) => setTimeout(r, 0));

    // "Ölçümü kaplama çizgisi hesabından hariç tut" checkbox'ını işaretle
    const checkboxes = Array.from(
      container.querySelectorAll('.sheet-container input[type="checkbox"]'),
    ) as HTMLInputElement[];
    const excludeCheckbox = checkboxes[1];
    expect(excludeCheckbox).toBeDefined();
    excludeCheckbox!.checked = true;
    excludeCheckbox!.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));

    // Kayıt silinmemiş, excluded: true olarak korunmuş olmalı
    expect(entriesSignal.value.length).toBe(1);
    expect(entriesSignal.value[0]?.bbt?.excluded).toBe(true);
  });

  it("determineCyclePhase semptotermal modda doğurganlık açıkken geç döngü gününde Luteal Faz çelişkisi üretmemelidir", async () => {
    const { determineCyclePhase } = await import(
      "../../src/ui/screens/TodayScreen"
    );
    const phase = determineCyclePhase({
      selectedDate: parseISODate("2026-05-19"),
      activeCycleStartDate: parseISODate("2026-05-01"),
      currentCycleDay: 19,
      estimatedCycleLength: 28,
      sensiplan: {
        temperature: {
          isConfirmed: false,
          appliedRule: "NONE",
          sixLowDates: [],
          highDates: [],
          explanation: "",
        },
        mucus: {
          isConfirmed: false,
          postPeakDates: [],
          explanation: "",
        },
        doubleCheck: {
          isPostOvulatoryInfertile: false,
          temperatureConfirmed: false,
          mucusConfirmed: false,
          ruleId: "D1_PENDING",
          explanation: "",
        },
        preOvulatory: {
          isPreOvulatoryInfertile: false,
          lastInfertileCycleDay: 0,
          appliedRule: "NONE",
          explanation: "",
        },
        overallFertilityState: "fertile",
        activeRuleExplanation: "Doğurganlık penceresi açık.",
      },
      knausOgino: {
        eligible: false,
        sampleCount: 0,
        shortestCycle: 0,
        longestCycle: 0,
        isSafeForContraception: false,
        disclaimer: "",
      },
    });

    expect(phase.key).toBe("ovulation");
    expect(phase.key).not.toBe("luteal");
  });

  it("ChartScreen tamamlanmış döngüyü görüntülerken Day 1 E1 kuralını Luteal Kısır diye etiketlememelidir", async () => {
    entriesSignal.value = [
      { date: parseISODate("2026-05-01"), bleeding: "heavy", updatedAt: 1 },
      { date: parseISODate("2026-05-29"), bleeding: "heavy", updatedAt: 2 },
      { date: parseISODate("2026-06-26"), bleeding: "heavy", updatedAt: 3 },
    ];
    selectedDateSignal.value = parseISODate("2026-06-28");

    const { ChartScreen } = await import("../../src/ui/screens/ChartScreen");
    render(<ChartScreen />, container);

    const cycleSelect = container.querySelector("select") as HTMLSelectElement;
    expect(cycleSelect).not.toBeNull();
    // 2. tamamlanmış döngüyü (29 Mayıs) seç
    cycleSelect.value = "2";
    cycleSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));

    expect(container.textContent).not.toContain("Luteal Kısır Dönem");
    expect(container.textContent).toContain("Doğurgan Dönem");
  });

  it("TodayScreen semptotermal modda rahim ağzı (serviks) kartı ve alt çekmecesini açıp kaydetmelidir", async () => {
    await dayRepository.clearAllData();
    const date = parseISODate("2026-11-18");
    selectedDateSignal.value = date;
    settingsSignal.value = {
      ...DEFAULT_USER_SETTINGS,
      trackingMode: "symptothermal",
    };

    const { TodayScreen } = await import("../../src/ui/screens/TodayScreen");
    render(<TodayScreen />, container);

    const cervixCard = Array.from(container.querySelectorAll(".glance-card")).find(
      (c) => c.textContent?.includes("Rahim Ağzı"),
    ) as HTMLButtonElement | undefined;
    expect(cervixCard).toBeDefined();
    cervixCard!.click();
    await new Promise((r) => setTimeout(r, 0));

    const highChip = Array.from(
      container.querySelectorAll(".sheet-container button"),
    ).find((b) => b.textContent?.includes("Yüksek (Derinde)")) as
      | HTMLButtonElement
      | undefined;
    expect(highChip).toBeDefined();
    highChip!.click();
    await new Promise((r) => setTimeout(r, 30));

    expect(entriesSignal.value[0]?.cervix?.position).toBe("high");
  });

  it("TodayScreen doğurgan pencerede takip amacına (goal) göre durum rozetini uyarlamalıdır", async () => {
    const start = parseISODate("2026-11-01");
    const today = parseISODate("2026-11-14");
    selectedDateSignal.value = today;
    entriesSignal.value = [
      { date: start, bleeding: "heavy", updatedAt: 1 },
      {
        date: today,
        mucus: { sensation: "wet", appearance: "stretchy" },
        updatedAt: 2,
      },
    ];

    const { TodayScreen } = await import("../../src/ui/screens/TodayScreen");

    settingsSignal.value = {
      ...DEFAULT_USER_SETTINGS,
      goal: "avoid_pregnancy",
    };
    render(<TodayScreen />, container);
    expect(container.textContent).toContain("Korunma Gerekli");

    settingsSignal.value = {
      ...DEFAULT_USER_SETTINGS,
      goal: "conceive",
    };
    render(<TodayScreen />, container);
    expect(container.textContent).toContain("Gebelik İçin En Verimli Pencere");
  });

  it("ChartScreen BBT noktasına tıklandığında detaylı ölçüm kartı göstermelidir", async () => {
    const start = parseISODate("2026-05-01");
    const bbtDate = parseISODate("2026-05-10");
    selectedDateSignal.value = parseISODate("2026-05-15");
    entriesSignal.value = [
      { date: start, bleeding: "heavy", updatedAt: 1 },
      {
        date: bbtDate,
        bbt: {
          value: 3645 as CentiCelsius,
          time: "07:05",
          disturbances: ["badSleep"],
        },
        note: "Erken uyandım",
        updatedAt: 2,
      },
    ];

    const { ChartScreen } = await import("../../src/ui/screens/ChartScreen");
    render(<ChartScreen />, container);

    const pointBtn = container.querySelector('circle[role="button"]');
    expect(pointBtn).not.toBeNull();
    pointBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));

    const inspector = container.querySelector(
      '[data-testid="bbt-point-inspector"]',
    );
    expect(inspector).not.toBeNull();
    expect(inspector?.textContent).toContain("36.45 °C");
    expect(inspector?.textContent).toContain("Erken uyandım");
    expect(inspector?.textContent).toContain("Kötü Uyku");
  });

  it("InsightsScreen hekim raporu yazdırma düğmesini ve yazdırılabilir özet tablosunu sunmalıdır", () => {
    entriesSignal.value = [
      {
        date: parseISODate("2026-09-01"),
        bleeding: "heavy",
        bbt: { value: 3640 as CentiCelsius, time: "07:00" },
        updatedAt: 1,
      },
    ];
    render(<InsightsScreen />, container);

    expect(container.textContent).toContain("Hekim Raporu Yazdır / PDF");
    const printReport = container.querySelector(
      '[data-testid="physician-print-report"]',
    );
    expect(printReport).not.toBeNull();
    expect(printReport?.textContent).toContain("36.40 °C");
  });

  it("CalendarScreen onaylanmış Sensiplan kısır dönem günlerini gölgelemeli ve göstergeyi sunmalıdır", async () => {
    const start = parseISODate("2026-05-01");
    selectedDateSignal.value = parseISODate("2026-05-20");
    const seeded = [
      { date: start, bleeding: "heavy" as const, updatedAt: 1 },
      { date: parseISODate("2026-05-02"), bleeding: "medium" as const, updatedAt: 2 },
      // 6 low temps (Days 7-12)
      ...[7, 8, 9, 10, 11, 12].map((d, idx) => ({
        date: parseISODate(`2026-05-${String(d).padStart(2, "0")}`),
        bbt: { value: (3620 + (idx % 2) * 5) as CentiCelsius, time: "07:00" },
        mucus: { sensation: "wet" as const, appearance: "stretchy" as const },
        updatedAt: 10 + d,
      })),
      // 3 high temps + drying mucus (Days 13-16)
      {
        date: parseISODate("2026-05-13"),
        bbt: { value: 3655 as CentiCelsius, time: "07:00" },
        mucus: { sensation: "dry" as const, appearance: "none" as const },
        updatedAt: 30,
      },
      {
        date: parseISODate("2026-05-14"),
        bbt: { value: 3660 as CentiCelsius, time: "07:00" },
        mucus: { sensation: "dry" as const, appearance: "none" as const },
        updatedAt: 31,
      },
      {
        date: parseISODate("2026-05-15"),
        bbt: { value: 3665 as CentiCelsius, time: "07:00" },
        mucus: { sensation: "dry" as const, appearance: "none" as const },
        updatedAt: 32,
      },
      {
        date: parseISODate("2026-05-16"),
        bbt: { value: 3662 as CentiCelsius, time: "07:00" },
        mucus: { sensation: "dry" as const, appearance: "none" as const },
        updatedAt: 33,
      },
    ];
    entriesSignal.value = seeded;
    settingsSignal.value = {
      ...DEFAULT_USER_SETTINGS,
      trackingMode: "symptothermal",
    };

    const { CalendarScreen } = await import(
      "../../src/ui/screens/CalendarScreen"
    );
    render(<CalendarScreen onOpenDayEditor={() => {}} />, container);

    expect(container.textContent).toContain("Sensiplan Kısır Dönem");
    const day20Btn = container.querySelector(
      'button[aria-label^="2026-05-20"]',
    ) as HTMLButtonElement | null;
    expect(day20Btn).not.toBeNull();
    expect(day20Btn?.style.backgroundColor).toContain("var(--fertile-surface)");
  });

  it("SettingsScreen çevrimdışı Sensiplan kuralları kılavuzunu ve takip amacı seçimini sunmalıdır", async () => {
    const { SettingsScreen } = await import(
      "../../src/ui/screens/SettingsScreen"
    );
    render(<SettingsScreen />, container);

    expect(container.textContent).toContain("Takip Amacınız");
    expect(container.textContent).toContain(
      "Günlük BBT Ölçüm Alarmını Takvime Ekle (.ics)",
    );

    const guideBtn = Array.from(container.querySelectorAll("button")).find(
      (b) =>
        b.textContent?.includes("Çevrimdışı Sensiplan Kuralları Hızlı Kılavuzu"),
    );
    expect(guideBtn).toBeDefined();
    guideBtn!.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(container.textContent).toContain("[T1–T6] Termal Yükseliş");
    expect(container.textContent).toContain("[D1] Çift-Kontrol");
  });
});

