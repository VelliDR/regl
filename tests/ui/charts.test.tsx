import { describe, it, expect, beforeEach } from "vitest";
import { render } from "preact";
import { CycleTrendChart } from "../../src/ui/components/charts/CycleTrendChart";
import { BleedingFlowChart } from "../../src/ui/components/charts/BleedingFlowChart";
import { PhaseDurationChart } from "../../src/ui/components/charts/PhaseDurationChart";
import { SymptomPhaseChart } from "../../src/ui/components/charts/SymptomPhaseChart";
import { ThermalShiftChart } from "../../src/ui/components/charts/ThermalShiftChart";
import { MultiCycleOverlayChart } from "../../src/ui/components/charts/MultiCycleOverlayChart";
import { Cycle } from "../../src/core/cycles";
import { CentiCelsius, DayEntry } from "../../src/core/types";
import { parseISODate } from "../../src/core/date";

describe("Grafik Bileşenleri Test Paketi (charts)", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  const mockCycles: Cycle[] = [
    {
      id: 1,
      startDate: parseISODate("2026-07-01"),
      endDate: parseISODate("2026-07-28"),
      length: 28,
      periodLength: 5,
    },
    {
      id: 2,
      startDate: parseISODate("2026-07-29"),
      endDate: parseISODate("2026-08-27"),
      length: 30,
      periodLength: 4,
    },
    {
      id: 3,
      startDate: parseISODate("2026-08-28"),
      endDate: parseISODate("2026-09-24"),
      length: 28,
      periodLength: 5,
    },
  ];

  const mockEntries: DayEntry[] = [
    {
      date: parseISODate("2026-07-01"),
      bleeding: "heavy",
      symptoms: ["cramps"],
      updatedAt: 1,
    },
    {
      date: parseISODate("2026-07-02"),
      bleeding: "medium",
      symptoms: ["cramps"],
      updatedAt: 2,
    },
    { date: parseISODate("2026-07-03"), bleeding: "light", updatedAt: 3 },
    {
      date: parseISODate("2026-07-14"),
      bbt: { value: 3635 as CentiCelsius },
      updatedAt: 4,
    },
    {
      date: parseISODate("2026-07-15"),
      bbt: { value: 3640 as CentiCelsius },
      updatedAt: 5,
    },
    {
      date: parseISODate("2026-07-16"),
      bbt: { value: 3665 as CentiCelsius },
      updatedAt: 6,
    },
    {
      date: parseISODate("2026-07-25"),
      symptoms: ["breast", "bloating"],
      updatedAt: 7,
    },
  ];

  it("CycleTrendChart: 2 veya daha fazla döngüde SVG trend eğrisini ve normal koridoru çizmelidir", () => {
    render(
      <CycleTrendChart cycles={mockCycles} medianLength={28} />,
      container,
    );

    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).toContain("Normal Aralık");
    expect(container.textContent).toContain("Medyan: 28g");
    expect(container.textContent).toContain("En Kısa");
    expect(container.textContent).toContain("En Uzun");
  });

  it("CycleTrendChart: Yetersiz döngüde bilgilendirici mesaj göstermelidir", () => {
    render(
      <CycleTrendChart cycles={[mockCycles[0]!]} medianLength={28} />,
      container,
    );

    expect(container.textContent).toContain(
      "en az 2 tamamlanmış döngü gereklidir",
    );
  });

  it("BleedingFlowChart: Döngü günleri 1-7 için kanama akış profili çubuklarını çizmelidir", () => {
    render(
      <BleedingFlowChart cycles={mockCycles} entries={mockEntries} />,
      container,
    );

    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).toContain("1. Gün");
    expect(container.textContent).toContain("Yoğun");
    expect(container.textContent).toContain("Orta");
  });

  it("PhaseDurationChart: Tamamlanmış döngüler için foliküler ve luteal faz çubuklarını sunmalıdır", () => {
    render(
      <PhaseDurationChart cycles={mockCycles} entries={mockEntries} />,
      container,
    );

    expect(container.textContent).toContain("Foliküler");
    expect(container.textContent).toContain("Luteal");
    expect(container.textContent).toContain("Normal Luteal: 10–16 gün");
  });

  it("SymptomPhaseChart: Belirtileri döngü evrelerine (Adet, Foliküler, PMS) göre gruplamalıdır", () => {
    render(
      <SymptomPhaseChart cycles={mockCycles} entries={mockEntries} />,
      container,
    );

    expect(container.textContent).toContain("cramps");
    expect(container.textContent).toContain("Adet");
    expect(container.textContent).toContain("Luteal");
  });

  it("ThermalShiftChart: Yetersiz onaylı veri olduğunda bilgilendirme mesajı sunmalıdır", () => {
    render(
      <ThermalShiftChart cycles={mockCycles} entries={mockEntries} />,
      container,
    );

    expect(container.textContent).toContain("Termal değişim");
  });

  it("MultiCycleOverlayChart: Son döngülerin ateş eğrilerini üst üste bindirmelidir", () => {
    render(
      <MultiCycleOverlayChart cycles={mockCycles} entries={mockEntries} />,
      container,
    );

    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).toContain("Tipik Ovülasyon");
    expect(container.textContent).toContain("1. Döngü");
  });
});
