import { addDays, compareISODate, daysBetween } from "../core/date";
import { SensiplanFullEvaluation } from "../core/evaluate";
import { KnausOginoResult } from "../core/predict/knaus";
import { BleedingIntensity, ISODate } from "../core/types";

export type CyclePhaseKey = "menstrual" | "follicular" | "ovulation" | "luteal";

export interface PhaseCalendarDates {
  readonly startDate: ISODate;
  readonly endDate: ISODate;
  readonly dateRangeText: string;
}

export interface CyclePhaseSchedule {
  readonly menstrual: PhaseCalendarDates;
  readonly follicular: PhaseCalendarDates;
  readonly ovulationWindow: PhaseCalendarDates;
  readonly ovulationPeakDate: ISODate;
  readonly ovulationPeakText: string;
  readonly luteal: PhaseCalendarDates;
  readonly nextPeriodDate: ISODate;
  readonly nextPeriodText: string;
  readonly daysUntilOvulation: number;
}

export interface CyclePhaseDetails {
  readonly key: CyclePhaseKey;
  readonly name: string;
  readonly shortName: string;
  readonly icon: string;
  readonly color: string;
  readonly bg: string;
  readonly border: string;
  readonly phaseDayText: string;
  readonly dateRangeText: string;
  readonly timingSummary: string;
  readonly hormoneInfo: string;
  readonly fertilityInfo: string;
  readonly tips: string;
  readonly schedule: CyclePhaseSchedule;
}

export const PHASE_GUIDE_DATA: Record<
  CyclePhaseKey,
  {
    title: string;
    subtitle: string;
    icon: string;
    color: string;
    timing: string;
    hormones: string;
    body: string;
    nutrition: string;
    exercise: string;
    fertility: string;
  }
> = {
  menstrual: {
    title: "Menstrüasyon (Adet) Fazı",
    subtitle: "Döngünün 1-5. Günleri • Dinlenme ve Yenilenme",
    icon: "🩸",
    color: "#f43f5e",
    timing: "Döngünün başlangıcı (yaklaşık 1-5 gün)",
    hormones:
      "Östrojen ve progesteron seviyeleri en düşük noktadadır. Rahim içi tabaka yenilenir.",
    body: "Vücut enerjisi içe dönüktür. Karın ve belde hafif kramp, yorgunluk ve duygusal hassasiyet olağandır.",
    nutrition:
      "Demir yönünden zengin gıdalar (kırmızı et, ıspanak, mercimek), sıcak bitki çayları ve magnezyum.",
    exercise:
      "Hafif yürüyüş, nazik esneme ve nefes egzersizleri. Ağır antrenmanlar yerine dinlenmeye öncelik verin.",
    fertility:
      "Genellikle kısırdır; ancak kısa döngülü kadınlarda erken ovülasyon riski unutulmamalıdır.",
  },
  follicular: {
    title: "Foliküler Faz",
    subtitle: "Döngünün 6-12. Günleri • Zindelik ve Yükseliş",
    icon: "🌿",
    color: "#10b981",
    timing: "Kanama bitiminden yumurtlama penceresine kadar",
    hormones:
      "FSH (Folikül Uyarıcı Hormon) yeni folikülleri olgunlaştırırken östrojen kademeli olarak yükselir.",
    body: "Östrojen artışı mutluluk ve motivasyonu artırır; cilt parlar, enerji ve zihinsel berraklık zirveye doğru tırmanır.",
    nutrition:
      "Taze sebzeler, avokado, kabak çekirdeği, lifli gıdalar ve dengeli protein.",
    exercise:
      "Kuvvet çalışmaları, kardiyo, koşu ve yeni spor disiplinleri denemek için en uygun evre.",
    fertility:
      "Pre-ovülatuar dönem: İlk günlerde kısırlık devam edebilir; mukus hissi başladığı an doğurgan pencere açılır.",
  },
  ovulation: {
    title: "Ovülasyon (Yumurtlama) Fazı",
    subtitle: "Döngünün 13-16. Günleri • Zirve ve Doğurganlık",
    icon: "🌸",
    color: "#ec4899",
    timing: "Döngünün ortası (yaklaşık 24-48 saatlik zirve)",
    hormones:
      "Östrojen tepe yapar ve LH (Lüteinleştirici Hormon) dalgası ile yumurtalıktan olgun yumurta salınır.",
    body: "Kaygan, şeffaf, uzayan servikal mukus (yumurta akı) görülür. Libido, çekicilik hissi ve sosyal enerji en üst seviyededir.",
    nutrition:
      "Antioksidanlar (çilek, yaban mersini), çiğ sebzeler ve bol su.",
    exercise:
      "Yüksek yoğunluklu antrenman (HIIT), grup fitness seansları ve tempolu aktiviteler.",
    fertility:
      "Hamile kalma olasılığının en yüksek olduğu andır. Sperm rahim içinde 5 güne kadar canlı kalabilir.",
  },
  luteal: {
    title: "Luteal Faz",
    subtitle: "Döngünün 15-28. Günleri • Progesteron ve Denge",
    icon: "🌙",
    color: "#8b5cf6",
    timing: "Yumurtlamadan sonraki adet gününe kadar (yaklaşık 10-16 gün)",
    hormones:
      "Yumurtayı bırakan folikül korpus luteum'a dönüşerek progesteron üretir. Progesteron bazal vücut ısısını 0.2 - 0.5 °C yükseltir.",
    body: "Metabolizma hafif hızlanır. Dönem sonuna doğru hormonların düşüşüyle PMS (hassasiyet, ödem, iştah artışı) görülebilir.",
    nutrition:
      "Kompleks karbonhidratlar (tatlı patates, kinoa), B6 vitamini (muz, somon), magnezyum ve bol su.",
    exercise:
      "Pilates, orta tempolu yürüyüş, hatha yoga. Döngü sonuna yaklaştıkça yoğunluğu hafifletin.",
    fertility:
      "Sensiplan Çift Kontrol kuralına göre 3 gün yüksek ateş ve mukus kuruma kanıtlandığında, adet gününe kadar gebelik riski en düşük seviyededir.",
  },
};

const TR_MONTHS_SHORT = [
  "Oca", "Şub", "Mar", "Nis", "May", "Haz",
  "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
] as const;

const TR_MONTHS_FULL = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
] as const;

export function formatISODateTR(iso: ISODate, fullMonth = false): string {
  const d = parseInt(iso.slice(8, 10), 10);
  const m = parseInt(iso.slice(5, 7), 10) - 1;
  const monthName = fullMonth
    ? (TR_MONTHS_FULL[m] ?? "")
    : (TR_MONTHS_SHORT[m] ?? "");
  return `${d} ${monthName}`;
}

export function formatDateRangeTR(startIso: ISODate, endIso: ISODate): string {
  const d1 = parseInt(startIso.slice(8, 10), 10);
  const m1 = parseInt(startIso.slice(5, 7), 10) - 1;
  const d2 = parseInt(endIso.slice(8, 10), 10);
  const m2 = parseInt(endIso.slice(5, 7), 10) - 1;

  if (m1 === m2) {
    if (d1 === d2) {
      return `${d1} ${TR_MONTHS_SHORT[m1] ?? ""}`;
    }
    return `${d1} - ${d2} ${TR_MONTHS_SHORT[m2] ?? ""}`;
  }
  return `${d1} ${TR_MONTHS_SHORT[m1] ?? ""} - ${d2} ${TR_MONTHS_SHORT[m2] ?? ""}`;
}

export function determineCyclePhase(params: {
  readonly selectedDate: ISODate;
  readonly activeCycleStartDate?: ISODate | undefined;
  readonly currentCycleDay?: number | undefined;
  readonly estimatedCycleLength: number;
  readonly nextPeriodStartDate?: ISODate | undefined;
  readonly estimatedOvulationDate?: ISODate | undefined;
  readonly daysUntilPeriod?: number | undefined;
  readonly bleeding?: BleedingIntensity | undefined;
  readonly sensiplan?: SensiplanFullEvaluation | undefined;
  readonly knausOgino: KnausOginoResult;
  readonly lutealPhaseDays?: number | undefined;
}): CyclePhaseDetails {
  const {
    selectedDate,
    activeCycleStartDate,
    currentCycleDay,
    estimatedCycleLength,
    nextPeriodStartDate,
    estimatedOvulationDate,
    daysUntilPeriod,
    bleeding,
    sensiplan,
    knausOgino,
    lutealPhaseDays = 14,
  } = params;

  const cycleStart: ISODate =
    activeCycleStartDate ??
    (currentCycleDay !== undefined
      ? addDays(selectedDate, -(currentCycleDay - 1))
      : selectedDate);

  const cycleLen = Math.max(20, Math.round(estimatedCycleLength || 28));
  const nextPeriod: ISODate =
    nextPeriodStartDate ?? addDays(cycleStart, cycleLen);

  const estimatedOvDay = Math.max(
    10,
    Math.round(cycleLen - lutealPhaseDays),
  );
  const fertileStartDay = Math.max(
    6,
    knausOgino.fertileWindowStartDay ?? estimatedOvDay - 5,
  );
  const fertileEndDay = Math.max(
    fertileStartDay,
    knausOgino.fertileWindowEndDay ?? Math.min(cycleLen - 4, estimatedOvDay + 1),
  );

  // 1. Menstrual phase dates: Day 1 to Day 5
  const menstrualStartDate = cycleStart;
  const menstrualEndDate = addDays(cycleStart, 4);

  // 2. Follicular phase dates: Day 6 to Day before fertile window
  const follicularStartDate = addDays(cycleStart, 5);
  const follicularEndDayNum = Math.max(5, fertileStartDay - 2);
  const follicularEndDate = addDays(cycleStart, follicularEndDayNum);

  // 3. Ovulation window dates & peak date
  const ovWindowStartDate = addDays(cycleStart, fertileStartDay - 1);
  const ovWindowEndDate = addDays(cycleStart, fertileEndDay - 1);
  const ovPeakDate =
    estimatedOvulationDate ?? addDays(cycleStart, estimatedOvDay - 1);

  // 4. Luteal phase dates: Day after fertile window to day before next period
  const lutealStartDate = addDays(cycleStart, fertileEndDay);
  const lutealEndDate = addDays(nextPeriod, -1);

  const schedule: CyclePhaseSchedule = {
    menstrual: {
      startDate: menstrualStartDate,
      endDate: menstrualEndDate,
      dateRangeText: formatDateRangeTR(menstrualStartDate, menstrualEndDate),
    },
    follicular: {
      startDate: follicularStartDate,
      endDate: follicularEndDate,
      dateRangeText:
        compareISODate(follicularStartDate, follicularEndDate) <= 0
          ? formatDateRangeTR(follicularStartDate, follicularEndDate)
          : "—",
    },
    ovulationWindow: {
      startDate: ovWindowStartDate,
      endDate: ovWindowEndDate,
      dateRangeText: formatDateRangeTR(ovWindowStartDate, ovWindowEndDate),
    },
    ovulationPeakDate: ovPeakDate,
    ovulationPeakText: formatISODateTR(ovPeakDate, true),
    luteal: {
      startDate: lutealStartDate,
      endDate: lutealEndDate,
      dateRangeText: formatDateRangeTR(lutealStartDate, lutealEndDate),
    },
    nextPeriodDate: nextPeriod,
    nextPeriodText: formatISODateTR(nextPeriod, true),
    daysUntilOvulation: daysBetween(selectedDate, ovPeakDate),
  };

  const isBleedingActive = Boolean(bleeding && bleeding !== "spotting");
  const isPostOvulatory = Boolean(
    sensiplan?.doubleCheck.isPostOvulatoryInfertile,
  );

  // 1. Menstrual Phase
  if (
    isBleedingActive ||
    (currentCycleDay !== undefined &&
      currentCycleDay <= 5 &&
      !isPostOvulatory)
  ) {
    const dayStr =
      currentCycleDay !== undefined
        ? `Adetin ${currentCycleDay}. Günü`
        : "Adet Dönemi";
    return {
      key: "menstrual",
      name: "Menstrüasyon Fazı",
      shortName: "Menstrüasyon",
      icon: "🩸",
      color: "#f43f5e",
      bg: "rgba(244, 63, 94, 0.1)",
      border: "rgba(244, 63, 94, 0.3)",
      phaseDayText: `${dayStr} • Döngü Başlangıcı`,
      dateRangeText: schedule.menstrual.dateRangeText,
      timingSummary: `Foliküler faz ${formatISODateTR(schedule.follicular.startDate, true)}'de başlayacak • Beklenen ovülasyon: ${schedule.ovulationPeakText}`,
      hormoneInfo:
        "Östrojen ve progesteron en düşük seviyede. Rahim içi tabaka yenileniyor.",
      fertilityInfo:
        "Düşük hamilelik olasılığı (Erken ovülasyon istisnaları hariç).",
      tips: "Dinlenmeye özen gösterin, magnezyum alın ve hafif yürüyüş yapın.",
      schedule,
    };
  }

  // 2. Luteal Phase (Post-ovulatory)
  const isPastFertileWindow =
    currentCycleDay !== undefined && currentCycleDay > fertileEndDay;
  const isOvulationCompleted =
    currentCycleDay !== undefined && currentCycleDay > estimatedOvDay + 1;
  const isStatisticallyLuteal =
    !sensiplan && (isPastFertileWindow || isOvulationCompleted);

  if (isPostOvulatory || isStatisticallyLuteal) {
    const firstHighDate = sensiplan?.temperature.firstHighDayDate;
    const lutealDay = firstHighDate
      ? Math.max(1, daysBetween(firstHighDate, selectedDate) + 1)
      : currentCycleDay
        ? Math.max(1, currentCycleDay - estimatedOvDay)
        : undefined;
    const dayStr = lutealDay
      ? `Luteal Fazın ${lutealDay}. Günü`
      : "Luteal Faz";
    const untilPeriodStr =
      daysUntilPeriod !== undefined
        ? ` • Adete ${Math.max(0, daysUntilPeriod)} gün`
        : "";

    let fertilityMsg =
      "Düşük hamilelik olasılığı (Yumurtlama penceresi kapandı).";
    if (isPostOvulatory) {
      fertilityMsg =
        "Biyolojik Kısır Dönem (Sensiplan kuralı ile ovülasyon kanıtlandı).";
    }

    return {
      key: "luteal",
      name: "Luteal Faz",
      shortName: "Luteal",
      icon: "🌙",
      color: "#8b5cf6",
      bg: "rgba(139, 92, 246, 0.1)",
      border: "rgba(139, 92, 246, 0.3)",
      phaseDayText: `${dayStr}${untilPeriodStr}`,
      dateRangeText: schedule.luteal.dateRangeText,
      timingSummary: isPostOvulatory
        ? `Ovülasyon doğrulandı • Beklenen sonraki adet: ${schedule.nextPeriodText}`
        : `Ovülasyon ${schedule.ovulationPeakText}'de tamamlandı • Beklenen sonraki adet: ${schedule.nextPeriodText}`,
      hormoneInfo:
        "Progesteron hormonu baskın, bazal vücut ısısı yüksek seviyede. Korpus luteum aktif.",
      fertilityInfo: fertilityMsg,
      tips: "Metabolizma hafif hızlanır. Kafeini sınırlayın, B6 vitamini ve kaliteli uyku tercih edin.",
      schedule,
    };
  }

  // 3. Ovulation Phase
  const isInFertileWindow =
    (sensiplan?.overallFertilityState === "fertile" &&
      currentCycleDay !== undefined &&
      currentCycleDay >= fertileStartDay) ||
    (currentCycleDay !== undefined &&
      currentCycleDay >= fertileStartDay &&
      currentCycleDay <= fertileEndDay);

  if (
    isInFertileWindow ||
    (currentCycleDay !== undefined &&
      Math.abs(currentCycleDay - estimatedOvDay) <= 1) ||
    (sensiplan?.overallFertilityState === "fertile" && isOvulationCompleted)
  ) {
    const isPeak = currentCycleDay === estimatedOvDay;
    const dayStr = isPeak
      ? `✨ Tahmini Yumurtlama Günü: ${schedule.ovulationPeakText} (LH Zirvesi)`
      : currentCycleDay !== undefined
        ? `Doğurgan Pencere (Döngü Günü ${currentCycleDay})`
        : "Yumurtlama Fazı";

    return {
      key: "ovulation",
      name: "Ovülasyon Fazı",
      shortName: "Ovülasyon",
      icon: "🌸",
      color: "#ec4899",
      bg: "rgba(236, 72, 153, 0.1)",
      border: "rgba(236, 72, 153, 0.3)",
      phaseDayText: dayStr,
      dateRangeText: schedule.ovulationWindow.dateRangeText,
      timingSummary: `Tahmini ovülasyon: ${schedule.ovulationPeakText} • Beklenen sonraki adet: ${schedule.nextPeriodText}`,
      hormoneInfo:
        "Östrojen zirvede, LH dalgası ovülasyonu tetikliyor. Enerji ve libido yüksek.",
      fertilityInfo: "En yüksek hamilelik olasılığı (Doğurgan pencere açık).",
      tips: "Sosyal aktiviteler, yaratıcı projeler ve tempolu egzersiz için harika bir dönem.",
      schedule,
    };
  }

  // 4. Follicular Phase
  const dayStr =
    currentCycleDay !== undefined
      ? `Foliküler Faz (${currentCycleDay}. Gün)`
      : "Foliküler Faz";
  return {
    key: "follicular",
    name: "Foliküler Faz",
    shortName: "Foliküler",
    icon: "🌿",
    color: "#10b981",
    bg: "rgba(16, 185, 129, 0.1)",
    border: "rgba(16, 185, 129, 0.3)",
    phaseDayText: `${dayStr} • Enerji Artışı`,
    dateRangeText: schedule.follicular.dateRangeText,
    timingSummary: `Foliküler faz ${schedule.follicular.dateRangeText} arası • Beklenen ovülasyon: ${schedule.ovulationPeakText} (${schedule.daysUntilOvulation > 0 ? `${schedule.daysUntilOvulation} gün sonra` : "yakında"})`,
    hormoneInfo:
      "FSH yeni yumurtaları olgunlaştırıyor, östrojen kademeli yükseliyor.",
    fertilityInfo: sensiplan?.preOvulatory.isPreOvulatoryInfertile
      ? "Erken Kısır Dönem (Pre-ovülatuar güvenli günler)."
      : "Doğurganlığa Geçiş (Yumurtlama yaklaşıyor).",
    tips: "Kuvvet antrenmanları ve yeni hedeflere odaklanmak için ideal zaman.",
    schedule,
  };
}
