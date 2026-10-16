import { useEffect, useRef, useState } from "preact/hooks";
import {
  dbErrorSignal,
  entriesMapSignal,
  evaluationSignal,
  persistDayEntry,
  removeDayEntry,
  selectedDateSignal,
  settingsSignal,
} from "../../app/state";
import { addDays, compareISODate, daysBetween, parseISODate } from "../../core/date";
import {
  BleedingIntensity,
  CentiCelsius,
  DayEntry,
  DisturbanceType,
  ISODate,
  MucusAppearance,
  MucusSensation,
} from "../../core/types";
import { Chip } from "../components/Chip";
import { CycleRing } from "../components/CycleRing";
import { STRINGS } from "../strings.tr";
import {
  evaluateInAppNotices,
  exportCalendarEventToDevice,
} from "../../app/reminders";

import { KnausOginoResult } from "../../core/predict/knaus";
import { SensiplanFullEvaluation } from "../../core/evaluate";

type ActiveSheetType =
  | "bleeding"
  | "bbt"
  | "mucus"
  | "symptoms"
  | "mood"
  | "sex"
  | "note"
  | "phase_info"
  | null;

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
      "Sensiplan Çift Kontrol kuralına göre 3 gün yüksek ateş ve mukus kuruma kanıtlandığında, adet gününe kadar gebelik imkansızdır (Biyolojik Kısır).",
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
  const fertileStartDay =
    knausOgino.fertileWindowStartDay ?? Math.max(6, estimatedOvDay - 5);
  const fertileEndDay =
    knausOgino.fertileWindowEndDay ??
    Math.min(cycleLen - 4, estimatedOvDay + 1);

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

  if (isPostOvulatory || isPastFertileWindow || isOvulationCompleted) {
    const lutealDay = currentCycleDay
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
      timingSummary: `Ovülasyon ${schedule.ovulationPeakText}'de tamamlandı • Beklenen sonraki adet: ${schedule.nextPeriodText}`,
      hormoneInfo:
        "Progesteron hormonu baskın, bazal vücut ısısı yüksek seviyede. Korpus luteum aktif.",
      fertilityInfo: fertilityMsg,
      tips: "Metabolizma hafif hızlanır. Kafeini sınırlayın, B6 vitamini ve kaliteli uyku tercih edin.",
      schedule,
    };
  }

  // 3. Ovulation Phase
  const isInFertileWindow =
    sensiplan?.overallFertilityState === "fertile" ||
    (currentCycleDay !== undefined &&
      currentCycleDay >= fertileStartDay &&
      currentCycleDay <= fertileEndDay);

  if (
    isInFertileWindow ||
    (currentCycleDay !== undefined &&
      Math.abs(currentCycleDay - estimatedOvDay) <= 1)
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

function isDayEntryEmpty(entry: DayEntry): boolean {
  const hasBleeding = Boolean(entry.bleeding);
  const hasBbt = Boolean(entry.bbt && !entry.bbt.excluded);
  const hasMucus = Boolean(entry.mucus);
  const hasSymptoms = Boolean(entry.symptoms && entry.symptoms.length > 0);
  const hasMood = Boolean(entry.mood && entry.mood.length > 0);
  const hasSex = Boolean(entry.sex && entry.sex !== "none");
  const hasNote = Boolean(entry.note && entry.note.trim().length > 0);
  const hasCervix = Boolean(entry.cervix);
  const hasOverride = Boolean(entry.cycleStartOverride);

  return (
    !hasBleeding &&
    !hasBbt &&
    !hasMucus &&
    !hasSymptoms &&
    !hasMood &&
    !hasSex &&
    !hasNote &&
    !hasCervix &&
    !hasOverride
  );
}

export function TodayScreen() {
  const selectedDate = selectedDateSignal.value;
  const evaluation = evaluationSignal.value;
  const settings = settingsSignal.value;
  const entriesMap = entriesMapSignal.value;
  const dbError = dbErrorSignal.value;

  const currentEntry = entriesMap.get(selectedDate);

  // Active Bottom Sheet modal state
  const [activeSheet, setActiveSheet] = useState<ActiveSheetType>(null);
  const [inspectedPhase, setInspectedPhase] = useState<CyclePhaseKey>("luteal");

  // Local form state
  const [bleeding, setBleeding] = useState<BleedingIntensity | undefined>(
    currentEntry?.bleeding,
  );
  const [bbtValue, setBbtValue] = useState<number>(
    currentEntry?.bbt ? currentEntry.bbt.value / 100 : 36.65,
  );
  const [hasBbt, setHasBbt] = useState<boolean>(
    currentEntry?.bbt !== undefined,
  );
  const [bbtTime, setBbtTime] = useState<string>(
    currentEntry?.bbt?.time ?? settings.reminderBbtTime,
  );
  const [bbtExcluded, setBbtExcluded] = useState<boolean>(
    currentEntry?.bbt?.excluded ?? false,
  );
  const [disturbances, setDisturbances] = useState<readonly DisturbanceType[]>(
    currentEntry?.bbt?.disturbances ?? [],
  );

  const [mucusSens, setMucusSens] = useState<MucusSensation | undefined>(
    currentEntry?.mucus?.sensation,
  );
  const [mucusApp, setMucusApp] = useState<MucusAppearance | undefined>(
    currentEntry?.mucus?.appearance,
  );

  const [symptoms, setSymptoms] = useState<readonly string[]>(
    currentEntry?.symptoms ?? [],
  );
  const [mood, setMood] = useState<readonly string[]>(currentEntry?.mood ?? []);
  const [sex, setSex] = useState<
    "none" | "protected" | "unprotected" | undefined
  >(currentEntry?.sex);
  const [note, setNote] = useState<string>(currentEntry?.note ?? "");
  const [cycleOverride, setCycleOverride] = useState<boolean>(
    currentEntry?.cycleStartOverride ?? false,
  );

  const noteTimerRef = useRef<number | null>(null);

  // Re-sync local state when date changes
  useEffect(() => {
    if (noteTimerRef.current) {
      window.clearTimeout(noteTimerRef.current);
      noteTimerRef.current = null;
    }

    const entry = entriesMap.get(selectedDate);
    setBleeding(entry?.bleeding);
    setHasBbt(entry?.bbt !== undefined);
    setBbtValue(entry?.bbt ? entry.bbt.value / 100 : 36.65);
    setBbtTime(entry?.bbt?.time ?? settings.reminderBbtTime);
    setBbtExcluded(entry?.bbt?.excluded ?? false);
    setDisturbances(entry?.bbt?.disturbances ?? []);
    setMucusSens(entry?.mucus?.sensation);
    setMucusApp(entry?.mucus?.appearance);
    setSymptoms(entry?.symptoms ?? []);
    setMood(entry?.mood ?? []);
    setSex(entry?.sex);
    setNote(entry?.note ?? "");
    setCycleOverride(entry?.cycleStartOverride ?? false);
  }, [selectedDate, entriesMap, settings.reminderBbtTime]);

  // Handle ESC key to close bottom sheet
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activeSheet !== null) {
        setActiveSheet(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeSheet]);

  // Auto-save helper
  const saveCurrent = (patch: Partial<DayEntry>) => {
    const updated: DayEntry = {
      date: selectedDate,
      bleeding,
      ...(hasBbt
        ? {
            bbt: {
              value: Math.round(bbtValue * 100) as CentiCelsius,
              time: bbtTime,
              ...(disturbances.length > 0 ? { disturbances } : {}),
              ...(bbtExcluded ? { excluded: true } : {}),
            },
          }
        : {}),
      ...(mucusSens && mucusApp
        ? {
            mucus: {
              sensation: mucusSens,
              appearance: mucusApp,
            },
          }
        : {}),
      ...(symptoms.length > 0 ? { symptoms } : {}),
      ...(mood.length > 0 ? { mood } : {}),
      ...(sex ? { sex } : {}),
      ...(note.trim().length > 0 ? { note: note.trim() } : {}),
      ...(cycleOverride ? { cycleStartOverride: true } : {}),
      updatedAt: Date.now(),
      ...patch,
    };

    if (isDayEntryEmpty(updated)) {
      removeDayEntry(selectedDate);
    } else {
      persistDayEntry(updated);
    }
  };

  const handleNoteChange = (val: string) => {
    setNote(val);
    if (noteTimerRef.current) {
      window.clearTimeout(noteTimerRef.current);
    }
    noteTimerRef.current = window.setTimeout(() => {
      saveCurrent({ note: val.trim().length > 0 ? val.trim() : undefined });
    }, 350);
  };

  const handleNoteBlur = () => {
    if (noteTimerRef.current) {
      window.clearTimeout(noteTimerRef.current);
      noteTimerRef.current = null;
    }
    saveCurrent({ note: note.trim().length > 0 ? note.trim() : undefined });
  };

  const handleClearDay = () => {
    if (
      typeof window !== "undefined" &&
      window.confirm("Bu güne ait tüm kayıtları silmek istediğinizden emin misiniz?")
    ) {
      setBleeding(undefined);
      setHasBbt(false);
      setMucusSens(undefined);
      setMucusApp(undefined);
      setSymptoms([]);
      setMood([]);
      setSex(undefined);
      setNote("");
      setCycleOverride(false);
      removeDayEntry(selectedDate);
    }
  };

  const handlePrevDay = () => {
    selectedDateSignal.value = addDays(selectedDate, -1);
  };

  const handleNextDay = () => {
    selectedDateSignal.value = addDays(selectedDate, 1);
  };

  const handleTodayJump = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    selectedDateSignal.value = parseISODate(`${y}-${m}-${d}`);
  };

  const handleBleedingToggle = (val: BleedingIntensity) => {
    const nextVal = bleeding === val ? undefined : val;
    setBleeding(nextVal);
    saveCurrent({ bleeding: nextVal });
  };

  const handleBbtStep = (step: number) => {
    const nextVal = Math.round((bbtValue + step) * 100) / 100;
    setBbtValue(nextVal);
    setHasBbt(true);
    saveCurrent({
      bbt: {
        value: Math.round(nextVal * 100) as CentiCelsius,
        time: bbtTime,
        ...(disturbances.length > 0 ? { disturbances } : {}),
        ...(bbtExcluded ? { excluded: true } : {}),
      },
    });
  };

  const handleDisturbanceToggle = (d: DisturbanceType) => {
    const next = disturbances.includes(d)
      ? disturbances.filter((item) => item !== d)
      : [...disturbances, d];
    setDisturbances(next);
    saveCurrent({
      bbt: hasBbt
        ? {
            value: Math.round(bbtValue * 100) as CentiCelsius,
            time: bbtTime,
            ...(next.length > 0 ? { disturbances: next } : {}),
            ...(bbtExcluded ? { excluded: true } : {}),
          }
        : undefined,
    });
  };

  const handleSymptomToggle = (sym: string) => {
    const next = symptoms.includes(sym)
      ? symptoms.filter((s) => s !== sym)
      : [...symptoms, sym];
    setSymptoms(next);
    saveCurrent({ symptoms: next });
  };

  const handleMoodToggle = (m: string) => {
    const next = mood.includes(m)
      ? mood.filter((item) => item !== m)
      : [...mood, m];
    setMood(next);
    saveCurrent({ mood: next });
  };

  const daysUntilNextPeriod = evaluation.prediction
    ? daysBetween(selectedDate, evaluation.prediction.nextPeriodStartDate)
    : undefined;

  const isPeriodDueToday = daysUntilNextPeriod === 0;

  // Compute Clinical & Biological Cycle Phase
  const phaseDetails = determineCyclePhase({
    selectedDate,
    activeCycleStartDate: evaluation.activeCycle?.startDate,
    currentCycleDay: evaluation.currentCycleDay,
    estimatedCycleLength:
      evaluation.prediction.estimatedCycleLength || settings.defaultCycleLength,
    nextPeriodStartDate: evaluation.prediction.nextPeriodStartDate,
    estimatedOvulationDate: evaluation.prediction.estimatedOvulationDate,
    daysUntilPeriod: daysUntilNextPeriod,
    bleeding,
    sensiplan: evaluation.sensiplan,
    knausOgino: evaluation.knausOgino,
  });

  // Pregnancy / Fertility chance pill description
  const isBleedingActive = Boolean(bleeding && bleeding !== "spotting");
  const isFertile =
    evaluation.sensiplan?.overallFertilityState === "fertile";

  let statusBadgeText = "🛡️ Düşük Hamilelik Olasılığı";
  let statusBadgeColor = "var(--text-secondary)";
  let statusBadgeBg = "var(--bg-elevated)";

  if (isBleedingActive) {
    statusBadgeText = "🩸 Adet Dönemi";
    statusBadgeColor = "var(--accent-primary)";
    statusBadgeBg = "var(--accent-surface)";
  } else if (isFertile) {
    statusBadgeText = "🌱 Doğurgan Pencere (Yüksek Olasılık)";
    statusBadgeColor = "var(--fertile-color)";
    statusBadgeBg = "var(--fertile-surface)";
  } else if (phaseDetails.key === "luteal") {
    statusBadgeText = evaluation.sensiplan?.doubleCheck.isPostOvulatoryInfertile
      ? "🛡️ Biyolojik Kısır (Luteal Faz)"
      : "🛡️ Düşük Hamilelik Olasılığı (Luteal Faz)";
    statusBadgeColor = "#8b5cf6";
    statusBadgeBg = "rgba(139, 92, 246, 0.15)";
  }

  // Card summary value helpers
  const bleedingLabel = bleeding
    ? STRINGS.bleeding[bleeding]
    : "+ Giriş Yap";

  const bbtLabel = hasBbt
    ? `${bbtValue.toFixed(2)} °C`
    : "+ Ölçüm Gir";

  const mucusLabel =
    mucusSens || mucusApp
      ? `${mucusSens ? STRINGS.mucusSensation[mucusSens] : ""}${
          mucusSens && mucusApp ? " / " : ""
        }${mucusApp ? STRINGS.mucusAppearance[mucusApp] : ""}`
      : "+ Gözlemle";

  const symptomsLabel =
    symptoms.length > 0
      ? `${symptoms.length} belirti (${symptoms
          .slice(0, 2)
          .map((s) => STRINGS.symptoms[s as keyof typeof STRINGS.symptoms] || s)
          .join(", ")})`
      : "+ Belirti Ekle";

  const moodLabel =
    mood.length > 0
      ? mood
          .slice(0, 2)
          .map((m) => STRINGS.mood[m as keyof typeof STRINGS.mood] || m)
          .join(", ")
      : "+ Ruh Hali Ekle";

  const sexAndNoteLabel = (() => {
    const parts: string[] = [];
    if (sex && sex !== "none") parts.push(STRINGS.sex[sex]);
    if (note.trim().length > 0) parts.push("Not var");
    return parts.length > 0 ? parts.join(" • ") : "+ Birliktelik / Not";
  })();

  const isSymptothermal = settings.trackingMode === "symptothermal";

  return (
    <div style={{ paddingBottom: "80px", maxWidth: "500px", margin: "0 auto" }}>
      {/* 1. Sticky Date Navigation Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          backgroundColor: "var(--bg-surface)",
          borderBottom: "1px solid var(--border-subtle)",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <button
          type="button"
          onClick={handlePrevDay}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-primary)",
            fontSize: "20px",
            cursor: "pointer",
            padding: "6px 12px",
            borderRadius: "var(--radius-sm)",
          }}
          aria-label="Önceki Gün"
        >
          ‹
        </button>
        <div style={{ textAlign: "center" }}>
          <h2
            style={{
              fontSize: "15px",
              fontWeight: "700",
              color: "var(--text-primary)",
            }}
          >
            {selectedDate}
          </h2>
          <button
            type="button"
            onClick={handleTodayJump}
            style={{
              background: "none",
              border: "none",
              color: "var(--accent-primary)",
              fontSize: "11px",
              fontWeight: "600",
              cursor: "pointer",
              padding: "2px 6px",
            }}
          >
            Bugüne Git
          </button>
        </div>
        <button
          type="button"
          onClick={handleNextDay}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-primary)",
            fontSize: "20px",
            cursor: "pointer",
            padding: "6px 12px",
            borderRadius: "var(--radius-sm)",
          }}
          aria-label="Sonraki Gün"
        >
          ›
        </button>
      </div>

      <div style={{ padding: "14px 16px" }}>
        {/* Database Error Banner */}
        {dbError && (
          <div
            style={{
              backgroundColor: "var(--accent-surface)",
              color: "var(--accent-primary)",
              padding: "10px 14px",
              borderRadius: "var(--radius-sm)",
              fontSize: "12px",
              marginBottom: "12px",
              textAlign: "center",
              fontWeight: "600",
              border: "1px solid var(--accent-primary)",
            }}
          >
            ⚠️ {dbError}
          </div>
        )}

        {/* In-App Notices */}
        {evaluateInAppNotices(
          currentEntry !== undefined &&
            (currentEntry.bleeding !== undefined ||
              currentEntry.bbt !== undefined),
          daysUntilNextPeriod,
          settings.lastBackupDate,
          entriesMap.size,
        ).map((notice) => (
          <div
            key={notice.id}
            style={{
              backgroundColor: "var(--accent-surface)",
              border: "1px solid var(--accent-primary)",
              borderRadius: "var(--radius-md)",
              padding: "10px 12px",
              marginBottom: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "2px",
            }}
          >
            <strong
              style={{ fontSize: "12px", color: "var(--accent-primary)" }}
            >
              🔔 {notice.title}
            </strong>
            <p
              style={{
                fontSize: "11px",
                color: "var(--text-secondary)",
                lineHeight: "1.4",
              }}
            >
              {notice.message}
            </p>
          </div>
        ))}

        {/* 2. My Calendar Style: Compact Cycle Hero */}
        <section
          style={{
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-subtle)",
            padding: "16px 14px 12px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            marginBottom: "12px",
          }}
        >
          <CycleRing
            size={136}
            cycleDay={evaluation.currentCycleDay}
            estimatedCycleLength={evaluation.prediction.estimatedCycleLength}
            daysUntilPeriod={daysUntilNextPeriod}
            isPeriodDueToday={isPeriodDueToday}
          />

          {/* Status pill badge */}
          <div
            style={{
              marginTop: "8px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: statusBadgeBg,
              color: statusBadgeColor,
              padding: "4px 12px",
              borderRadius: "var(--radius-full)",
              fontSize: "12px",
              fontWeight: "700",
            }}
          >
            {statusBadgeText}
          </div>

          {/* 4-Phase Stepper with Dates */}
          <div className="phase-stepper">
            {(["menstrual", "follicular", "ovulation", "luteal"] as const).map(
              (pKey) => {
                const item = PHASE_GUIDE_DATA[pKey];
                const isActive = phaseDetails.key === pKey;
                const phaseDates =
                  pKey === "menstrual"
                    ? phaseDetails.schedule.menstrual
                    : pKey === "follicular"
                      ? phaseDetails.schedule.follicular
                      : pKey === "ovulation"
                        ? phaseDetails.schedule.ovulationWindow
                        : phaseDetails.schedule.luteal;

                return (
                  <button
                    key={pKey}
                    type="button"
                    className={`phase-pill ${isActive ? "active" : ""}`}
                    onClick={() => {
                      setInspectedPhase(pKey);
                      setActiveSheet("phase_info");
                    }}
                    style={{
                      borderColor: isActive
                        ? item.color
                        : "var(--border-subtle)",
                      backgroundColor: isActive
                        ? `${item.color}18`
                        : "var(--bg-surface)",
                      padding: "8px 2px",
                    }}
                  >
                    <span style={{ fontSize: "16px", lineHeight: 1 }}>
                      {item.icon}
                    </span>
                    <span
                      style={{
                        color: isActive ? item.color : "var(--text-primary)",
                        marginTop: "3px",
                        fontWeight: "700",
                        fontSize: "11px",
                      }}
                    >
                      {item.title.split(" ")[0]}
                    </span>
                    <span
                      style={{
                        fontSize: "9px",
                        color: "var(--text-muted)",
                        marginTop: "2px",
                        fontWeight: "600",
                      }}
                    >
                      {phaseDates.dateRangeText}
                    </span>
                    {pKey === "ovulation" && (
                      <span
                        style={{
                          fontSize: "8.5px",
                          color: "#ec4899",
                          fontWeight: "700",
                          marginTop: "1px",
                        }}
                      >
                        ★ {phaseDetails.schedule.ovulationPeakText}
                      </span>
                    )}
                    {isActive && (
                      <span
                        style={{
                          fontSize: "8.5px",
                          backgroundColor: item.color,
                          color: "#ffffff",
                          padding: "1px 4px",
                          borderRadius: "var(--radius-full)",
                          marginTop: "2px",
                          fontWeight: "700",
                        }}
                      >
                        Aktif
                      </span>
                    )}
                  </button>
                );
              },
            )}
          </div>

          {evaluation.prediction && (
            <button
              type="button"
              onClick={() => {
                exportCalendarEventToDevice({
                  startDate: evaluation.prediction.nextPeriodStartDate,
                  title: "Döngü Hatırlatıcısı",
                  description: "Tahmini döngü takip hatırlatıcısı.",
                  alarmMinutesBefore: 0,
                });
              }}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                fontSize: "11px",
                marginTop: "10px",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              📅 Takvime Hatırlatıcı Ekle
            </button>
          )}
        </section>

        {/* Phase Spotlight Card with Calendar Dates */}
        <div
          className="phase-spotlight-card"
          style={{
            backgroundColor: phaseDetails.bg,
            borderColor: phaseDetails.border,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "22px" }}>{phaseDetails.icon}</span>
              <div style={{ textAlign: "left" }}>
                <h3
                  style={{
                    fontSize: "15px",
                    fontWeight: "700",
                    color: phaseDetails.color,
                    margin: 0,
                  }}
                >
                  {phaseDetails.name}
                </h3>
                <p
                  style={{
                    fontSize: "12px",
                    fontWeight: "700",
                    color: "var(--text-primary)",
                    margin: "2px 0 0",
                  }}
                >
                  📅 {phaseDetails.dateRangeText} • {phaseDetails.phaseDayText}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setInspectedPhase(phaseDetails.key);
                setActiveSheet("phase_info");
              }}
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: `1px solid ${phaseDetails.border}`,
                color: phaseDetails.color,
                borderRadius: "var(--radius-full)",
                padding: "4px 10px",
                fontSize: "11px",
                fontWeight: "600",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Rehber ℹ️
            </button>
          </div>

          {/* Timeline Summary Box: Exact Ovulation & Period Dates */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
              backgroundColor: "var(--bg-elevated)",
              padding: "8px 10px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-subtle)",
              margin: "4px 0",
              textAlign: "left",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "10px",
                  color: "var(--text-muted)",
                  display: "block",
                  fontWeight: "600",
                }}
              >
                🌸 Beklenen Ovülasyon:
              </span>
              <strong style={{ fontSize: "12px", color: "#ec4899" }}>
                {phaseDetails.schedule.ovulationPeakText}
                {phaseDetails.schedule.daysUntilOvulation === 0 && " (Bugün!)"}
                {phaseDetails.schedule.daysUntilOvulation > 0 &&
                  ` (${phaseDetails.schedule.daysUntilOvulation} gün sonra)`}
                {phaseDetails.schedule.daysUntilOvulation < 0 &&
                  ` (${Math.abs(phaseDetails.schedule.daysUntilOvulation)} gün önce)`}
              </strong>
            </div>
            <div>
              <span
                style={{
                  fontSize: "10px",
                  color: "var(--text-muted)",
                  display: "block",
                  fontWeight: "600",
                }}
              >
                🩸 Beklenen Sonraki Adet:
              </span>
              <strong style={{ fontSize: "12px", color: "var(--accent-primary)" }}>
                {phaseDetails.schedule.nextPeriodText}
                {daysUntilNextPeriod !== undefined && ` (${daysUntilNextPeriod} gün)`}
              </strong>
            </div>
          </div>

          {/* Timing Guide Sentence */}
          <p
            style={{
              fontSize: "12px",
              color: "var(--text-secondary)",
              fontWeight: "600",
              margin: 0,
              textAlign: "left",
            }}
          >
            ⏳ {phaseDetails.timingSummary}
          </p>

          <p
            style={{
              fontSize: "12px",
              color: "var(--text-primary)",
              lineHeight: "1.4",
              margin: 0,
              textAlign: "left",
            }}
          >
            🧬 {phaseDetails.hormoneInfo}
          </p>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "11px",
              color: "var(--text-secondary)",
              borderTop: "1px dashed var(--border-subtle)",
              paddingTop: "6px",
              textAlign: "left",
            }}
          >
            <span>🎯 {phaseDetails.fertilityInfo}</span>
          </div>
        </div>

        {/* 3. Short Glance Info Cards (2-Column Grid) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          {/* Card 1: Bleeding */}
          <button
            type="button"
            className={`glance-card ${bleeding ? "has-value" : ""}`}
            onClick={() => setActiveSheet("bleeding")}
            style={{
              textAlign: "left",
              border: bleeding
                ? "1px solid var(--accent-primary)"
                : undefined,
              backgroundColor: bleeding
                ? "var(--accent-surface)"
                : undefined,
            }}
          >
            <span
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                fontWeight: "600",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              🩸 {STRINGS.today.bleeding}
            </span>
            <span
              style={{
                fontSize: "13px",
                fontWeight: bleeding ? "700" : "500",
                color: bleeding
                  ? "var(--accent-primary)"
                  : "var(--text-secondary)",
                marginTop: "6px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {bleedingLabel}
            </span>
          </button>

          {/* Card 2: BBT (If Symptothermal) */}
          {isSymptothermal && (
            <button
              type="button"
              className={`glance-card ${hasBbt ? "has-value" : ""}`}
              onClick={() => setActiveSheet("bbt")}
              style={{
                textAlign: "left",
                border: hasBbt
                  ? "1px solid var(--fertile-color)"
                  : undefined,
                backgroundColor: hasBbt
                  ? "var(--fertile-surface)"
                  : undefined,
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  fontWeight: "600",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                🌡️ {STRINGS.today.bbt}
              </span>
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: hasBbt ? "700" : "500",
                  color: hasBbt
                    ? "var(--fertile-color)"
                    : "var(--text-secondary)",
                  marginTop: "6px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {bbtLabel}
              </span>
            </button>
          )}

          {/* Card 3: Mucus (If Symptothermal) */}
          {isSymptothermal && (
            <button
              type="button"
              className={`glance-card ${
                mucusSens || mucusApp ? "has-value" : ""
              }`}
              onClick={() => setActiveSheet("mucus")}
              style={{
                textAlign: "left",
                border:
                  mucusSens || mucusApp
                    ? "1px solid var(--fertile-color)"
                    : undefined,
                backgroundColor:
                  mucusSens || mucusApp
                    ? "var(--fertile-surface)"
                    : undefined,
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  fontWeight: "600",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                💧 {STRINGS.today.mucus}
              </span>
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: mucusSens || mucusApp ? "700" : "500",
                  color:
                    mucusSens || mucusApp
                      ? "var(--fertile-color)"
                      : "var(--text-secondary)",
                  marginTop: "6px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {mucusLabel}
              </span>
            </button>
          )}

          {/* Card 4: Symptoms */}
          <button
            type="button"
            className={`glance-card ${symptoms.length > 0 ? "has-value" : ""}`}
            onClick={() => setActiveSheet("symptoms")}
            style={{ textAlign: "left" }}
          >
            <span
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                fontWeight: "600",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              ⚡ {STRINGS.today.symptoms}
            </span>
            <span
              style={{
                fontSize: "13px",
                fontWeight: symptoms.length > 0 ? "700" : "500",
                color:
                  symptoms.length > 0
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                marginTop: "6px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {symptomsLabel}
            </span>
          </button>

          {/* Card 5: Mood */}
          <button
            type="button"
            className={`glance-card ${mood.length > 0 ? "has-value" : ""}`}
            onClick={() => setActiveSheet("mood")}
            style={{ textAlign: "left" }}
          >
            <span
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                fontWeight: "600",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              ✨ {STRINGS.today.mood}
            </span>
            <span
              style={{
                fontSize: "13px",
                fontWeight: mood.length > 0 ? "700" : "500",
                color:
                  mood.length > 0
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                marginTop: "6px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {moodLabel}
            </span>
          </button>

          {/* Card 6: Sex & Notes */}
          <button
            type="button"
            className={`glance-card ${
              (sex && sex !== "none") || note.trim().length > 0
                ? "has-value"
                : ""
            }`}
            onClick={() => setActiveSheet(note ? "note" : "sex")}
            style={{ textAlign: "left" }}
          >
            <span
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                fontWeight: "600",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              ❤️ {STRINGS.today.sex} / 📝 Not
            </span>
            <span
              style={{
                fontSize: "13px",
                fontWeight:
                  (sex && sex !== "none") || note.trim().length > 0
                    ? "700"
                    : "500",
                color:
                  (sex && sex !== "none") || note.trim().length > 0
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                marginTop: "6px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {sexAndNoteLabel}
            </span>
          </button>
        </div>

        {/* Clear Day Record Option */}
        {currentEntry && (
          <div style={{ textAlign: "center", marginTop: "8px" }}>
            <button
              type="button"
              onClick={handleClearDay}
              style={{
                background: "none",
                border: "1px dashed var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "6px 14px",
                color: "var(--text-muted)",
                fontSize: "11px",
                cursor: "pointer",
              }}
            >
              🗑️ Bu Günün Kaydını Temizle
            </button>
          </div>
        )}
      </div>

      {/* 4. Bottom Sheet (Alt Çekmece) Quick-Log Editor */}
      {activeSheet !== null && (
        <div
          className="sheet-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setActiveSheet(null);
            }
          }}
        >
          <div className="sheet-container">
            {/* Sheet Drag Handle */}
            <div
              style={{
                width: "40px",
                height: "4px",
                backgroundColor: "var(--border-strong)",
                borderRadius: "2px",
                margin: "0 auto 12px",
              }}
            />

            {/* Sheet Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
                paddingBottom: "8px",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: "700",
                  color: "var(--text-primary)",
                }}
              >
                {activeSheet === "bleeding" && `🩸 ${STRINGS.today.bleeding}`}
                {activeSheet === "bbt" && `🌡️ ${STRINGS.today.bbt}`}
                {activeSheet === "mucus" && `💧 ${STRINGS.today.mucus}`}
                {activeSheet === "symptoms" && `⚡ ${STRINGS.today.symptoms}`}
                {activeSheet === "mood" && `✨ ${STRINGS.today.mood}`}
                {activeSheet === "sex" && `❤️ ${STRINGS.today.sex}`}
                {activeSheet === "note" && `📝 ${STRINGS.today.notes}`}
                {activeSheet === "phase_info" && "📖 Döngü Fazları Rehberi"}
              </h3>
              <button
                type="button"
                onClick={() => setActiveSheet(null)}
                style={{
                  padding: "6px 14px",
                  backgroundColor: "var(--accent-primary)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "var(--radius-full)",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: "pointer",
                }}
              >
                Tamam ✓
              </button>
            </div>

            {/* Sheet Content: Bleeding */}
            {activeSheet === "bleeding" && (
              <div>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    marginBottom: "10px",
                  }}
                >
                  Bugünkü kanama şiddetini seçin:
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  <Chip
                    label={STRINGS.bleeding.spotting}
                    selected={bleeding === "spotting"}
                    onToggle={() => handleBleedingToggle("spotting")}
                  />
                  <Chip
                    label={STRINGS.bleeding.light}
                    selected={bleeding === "light"}
                    onToggle={() => handleBleedingToggle("light")}
                  />
                  <Chip
                    label={STRINGS.bleeding.medium}
                    selected={bleeding === "medium"}
                    onToggle={() => handleBleedingToggle("medium")}
                  />
                  <Chip
                    label={STRINGS.bleeding.heavy}
                    selected={bleeding === "heavy"}
                    onToggle={() => handleBleedingToggle("heavy")}
                  />
                </div>

                <div style={{ marginTop: "16px" }}>
                  <label
                    style={{
                      fontSize: "12px",
                      color: "var(--text-secondary)",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={cycleOverride}
                      onChange={(e) => {
                        const val = (e.target as HTMLInputElement).checked;
                        setCycleOverride(val);
                        saveCurrent({ cycleStartOverride: val });
                      }}
                    />
                    Bu günü zorla yeni döngü başlangıcı (1. Gün) yap
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveSheet(null)}
                  style={{
                    width: "100%",
                    marginTop: "24px",
                    padding: "12px",
                    backgroundColor: "var(--accent-primary)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    fontSize: "14px",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  Kaydet ve Kapat ✓
                </button>
                <div style={{ height: "40px" }} />
              </div>
            )}

            {/* Sheet Content: BBT */}
            {activeSheet === "bbt" && (
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "12px",
                  }}
                >
                  <label
                    style={{
                      fontSize: "13px",
                      fontWeight: "600",
                      color: "var(--text-primary)",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={hasBbt}
                      onChange={(e) => {
                        const checked = (e.target as HTMLInputElement).checked;
                        setHasBbt(checked);
                        saveCurrent({
                          bbt: checked
                            ? {
                                value: Math.round(
                                  bbtValue * 100,
                                ) as CentiCelsius,
                                time: bbtTime,
                              }
                            : undefined,
                        });
                      }}
                    />
                    Ölçüm Kaydet
                  </label>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <label
                      style={{ fontSize: "11px", color: "var(--text-muted)" }}
                    >
                      Saat:
                    </label>
                    <input
                      type="time"
                      value={bbtTime}
                      onChange={(e) => {
                        const t = (e.target as HTMLInputElement).value;
                        setBbtTime(t);
                        saveCurrent({
                          bbt: {
                            value: Math.round(bbtValue * 100) as CentiCelsius,
                            time: t,
                            ...(disturbances.length > 0 ? { disturbances } : {}),
                            ...(bbtExcluded ? { excluded: true } : {}),
                          },
                        });
                      }}
                      style={{
                        backgroundColor: "var(--bg-elevated)",
                        border: "1px solid var(--border-subtle)",
                        color: "var(--text-primary)",
                        padding: "4px 8px",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "12px",
                      }}
                    />
                  </div>
                </div>

                {hasBbt && (
                  <div>
                    {/* Stepper Input */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "16px",
                        margin: "16px 0",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleBbtStep(-0.05)}
                        style={{
                          width: "44px",
                          height: "44px",
                          borderRadius: "var(--radius-full)",
                          border: "1px solid var(--border-strong)",
                          backgroundColor: "var(--bg-elevated)",
                          color: "var(--text-primary)",
                          fontSize: "20px",
                          cursor: "pointer",
                        }}
                      >
                        −
                      </button>
                      <span
                        style={{
                          fontSize: "32px",
                          fontWeight: "800",
                          color: "var(--accent-primary)",
                          minWidth: "120px",
                          textAlign: "center",
                        }}
                      >
                        {bbtValue.toFixed(2)} °C
                      </span>
                      <button
                        type="button"
                        onClick={() => handleBbtStep(0.05)}
                        style={{
                          width: "44px",
                          height: "44px",
                          borderRadius: "var(--radius-full)",
                          border: "1px solid var(--border-strong)",
                          backgroundColor: "var(--bg-elevated)",
                          color: "var(--text-primary)",
                          fontSize: "20px",
                          cursor: "pointer",
                        }}
                      >
                        +
                      </button>
                    </div>

                    {/* Disturbances */}
                    <p
                      style={{
                        fontSize: "12px",
                        color: "var(--text-muted)",
                        marginBottom: "8px",
                      }}
                    >
                      Bozucu Etkenler:
                    </p>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "6px",
                        marginBottom: "12px",
                      }}
                    >
                      {(
                        Object.keys(STRINGS.disturbances) as DisturbanceType[]
                      ).map((dKey) => (
                        <Chip
                          key={dKey}
                          label={STRINGS.disturbances[dKey]}
                          selected={disturbances.includes(dKey)}
                          onToggle={() => handleDisturbanceToggle(dKey)}
                        />
                      ))}
                    </div>

                    <label
                      style={{
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginTop: "8px",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={bbtExcluded}
                        onChange={(e) => {
                          const val = (e.target as HTMLInputElement).checked;
                          setBbtExcluded(val);
                          saveCurrent({
                            bbt: {
                              value: Math.round(bbtValue * 100) as CentiCelsius,
                              time: bbtTime,
                              ...(disturbances.length > 0 ? { disturbances } : {}),
                              excluded: val,
                            },
                          });
                        }}
                      />
                      Ölçümü kaplama çizgisi hesabından hariç tut (parantezli)
                    </label>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setActiveSheet(null)}
                  style={{
                    width: "100%",
                    marginTop: "24px",
                    padding: "12px",
                    backgroundColor: "var(--accent-primary)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    fontSize: "14px",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  Kaydet ve Kapat ✓
                </button>
                <div style={{ height: "40px" }} />
              </div>
            )}

            {/* Sheet Content: Mucus */}
            {activeSheet === "mucus" && (
              <div>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    marginBottom: "6px",
                  }}
                >
                  Hissiyat:
                </p>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "6px",
                    marginBottom: "12px",
                  }}
                >
                  {(["dry", "nothing", "moist", "wet"] as MucusSensation[]).map(
                    (sens) => (
                      <Chip
                        key={sens}
                        label={STRINGS.mucusSensation[sens]}
                        selected={mucusSens === sens}
                        onToggle={() => {
                          const next = mucusSens === sens ? undefined : sens;
                          setMucusSens(next);
                          if (next && mucusApp) {
                            saveCurrent({
                              mucus: {
                                sensation: next,
                                appearance: mucusApp,
                              },
                            });
                          }
                        }}
                      />
                    ),
                  )}
                </div>

                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    marginBottom: "6px",
                  }}
                >
                  Görünüm:
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {(
                    [
                      "none",
                      "thick",
                      "creamy",
                      "clear",
                      "stretchy",
                    ] as MucusAppearance[]
                  ).map((app) => (
                    <Chip
                      key={app}
                      label={STRINGS.mucusAppearance[app]}
                      selected={mucusApp === app}
                      onToggle={() => {
                        const next = mucusApp === app ? undefined : app;
                        setMucusApp(next);
                        if (mucusSens && next) {
                          saveCurrent({
                            mucus: {
                              sensation: mucusSens,
                              appearance: next,
                            },
                          });
                        }
                      }}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setActiveSheet(null)}
                  style={{
                    width: "100%",
                    marginTop: "24px",
                    padding: "12px",
                    backgroundColor: "var(--accent-primary)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    fontSize: "14px",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  Kaydet ve Kapat ✓
                </button>
                <div style={{ height: "40px" }} />
              </div>
            )}

            {/* Sheet Content: Symptoms */}
            {activeSheet === "symptoms" && (
              <div>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    marginBottom: "10px",
                  }}
                >
                  Hissedilen fiziksel belirtileri seçin:
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {(
                    Object.keys(
                      STRINGS.symptoms,
                    ) as (keyof typeof STRINGS.symptoms)[]
                  ).map((symKey) => (
                    <Chip
                      key={symKey}
                      label={STRINGS.symptoms[symKey]}
                      selected={symptoms.includes(symKey)}
                      onToggle={() => handleSymptomToggle(symKey)}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setActiveSheet(null)}
                  style={{
                    width: "100%",
                    marginTop: "24px",
                    padding: "12px",
                    backgroundColor: "var(--accent-primary)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    fontSize: "14px",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  Kaydet ve Kapat ✓
                </button>
                <div style={{ height: "40px" }} />
              </div>
            )}

            {/* Sheet Content: Mood */}
            {activeSheet === "mood" && (
              <div>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    marginBottom: "10px",
                  }}
                >
                  Bugünkü ruh halinizi seçin:
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {(
                    Object.keys(STRINGS.mood) as (keyof typeof STRINGS.mood)[]
                  ).map((mKey) => (
                    <Chip
                      key={mKey}
                      label={STRINGS.mood[mKey]}
                      selected={mood.includes(mKey)}
                      onToggle={() => handleMoodToggle(mKey)}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setActiveSheet(null)}
                  style={{
                    width: "100%",
                    marginTop: "24px",
                    padding: "12px",
                    backgroundColor: "var(--accent-primary)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    fontSize: "14px",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  Kaydet ve Kapat ✓
                </button>
                <div style={{ height: "40px" }} />
              </div>
            )}

            {/* Sheet Content: Sex Activity & Note Tab */}
            {activeSheet === "sex" && (
              <div>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    marginBottom: "10px",
                  }}
                >
                  Cinsel birliktelik:
                </p>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "6px",
                    marginBottom: "16px",
                  }}
                >
                  {(["none", "protected", "unprotected"] as const).map(
                    (sVal) => (
                      <Chip
                        key={sVal}
                        label={STRINGS.sex[sVal]}
                        selected={sex === sVal}
                        onToggle={() => {
                          const next = sex === sVal ? undefined : sVal;
                          setSex(next);
                          saveCurrent({ sex: next });
                        }}
                      />
                    ),
                  )}
                </div>

                <div style={{ textAlign: "right", marginBottom: "16px" }}>
                  <button
                    type="button"
                    onClick={() => setActiveSheet("note")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--accent-primary)",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    📝 Kişisel Not Yaz ›
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveSheet(null)}
                  style={{
                    width: "100%",
                    padding: "12px",
                    backgroundColor: "var(--accent-primary)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    fontSize: "14px",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  Kaydet ve Kapat ✓
                </button>
                <div style={{ height: "40px" }} />
              </div>
            )}

            {/* Sheet Content: Note */}
            {activeSheet === "note" && (
              <div>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    marginBottom: "8px",
                  }}
                >
                  Bugün hakkında kişisel notlarınız:
                </p>
                <textarea
                  value={note}
                  placeholder="Bugün nasıl hissediyorsunuz? Not ekleyin..."
                  onInput={(e) => {
                    handleNoteChange((e.target as HTMLTextAreaElement).value);
                  }}
                  onBlur={handleNoteBlur}
                  style={{
                    width: "100%",
                    minHeight: "100px",
                    backgroundColor: "var(--bg-elevated)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-sm)",
                    padding: "10px",
                    color: "var(--text-primary)",
                    fontSize: "14px",
                    fontFamily: "inherit",
                    resize: "vertical",
                  }}
                />
                <div style={{ marginTop: "10px", textAlign: "left", marginBottom: "16px" }}>
                  <button
                    type="button"
                    onClick={() => setActiveSheet("sex")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--accent-primary)",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    ‹ ❤️ Cinsel Birliktelik Ayarla
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveSheet(null)}
                  style={{
                    width: "100%",
                    padding: "12px",
                    backgroundColor: "var(--accent-primary)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    fontSize: "14px",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  Kaydet ve Kapat ✓
                </button>
                <div style={{ height: "40px" }} />
              </div>
            )}

            {/* Sheet Content: Phase Info Guide */}
            {activeSheet === "phase_info" && (
              <div>
                {/* Tab Selector */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: "4px",
                    marginBottom: "16px",
                  }}
                >
                  {(["menstrual", "follicular", "ovulation", "luteal"] as const).map(
                    (pKey) => {
                      const item = PHASE_GUIDE_DATA[pKey];
                      const isSelected = inspectedPhase === pKey;
                      return (
                        <button
                          key={pKey}
                          type="button"
                          onClick={() => setInspectedPhase(pKey)}
                          style={{
                            padding: "8px 2px",
                            border: isSelected
                              ? `2px solid ${item.color}`
                              : "1px solid var(--border-subtle)",
                            borderRadius: "var(--radius-sm)",
                            backgroundColor: isSelected
                              ? `${item.color}22`
                              : "var(--bg-elevated)",
                            color: isSelected ? item.color : "var(--text-muted)",
                            fontSize: "11px",
                            fontWeight: isSelected ? "700" : "500",
                            cursor: "pointer",
                            textAlign: "center",
                          }}
                        >
                          <div>{item.icon}</div>
                          <div style={{ marginTop: "2px" }}>
                            {item.title.split(" ")[0]}
                          </div>
                        </button>
                      );
                    },
                  )}
                </div>

                {/* Selected Phase Detailed Breakdown */}
                {(() => {
                  const g = PHASE_GUIDE_DATA[inspectedPhase];
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      <div
                        style={{
                          padding: "12px",
                          borderRadius: "var(--radius-md)",
                          backgroundColor: `${g.color}14`,
                          border: `1px solid ${g.color}40`,
                        }}
                      >
                        <h4
                          style={{
                            fontSize: "15px",
                            fontWeight: "700",
                            color: g.color,
                            margin: "0 0 4px",
                          }}
                        >
                          {g.icon} {g.title}
                        </h4>
                        <p
                          style={{
                            fontSize: "12px",
                            color: "var(--text-secondary)",
                            fontWeight: "600",
                            margin: "0 0 8px",
                          }}
                        >
                          {g.subtitle}
                        </p>
                        <div
                          style={{
                            backgroundColor: "var(--bg-surface)",
                            padding: "6px 10px",
                            borderRadius: "var(--radius-sm)",
                            fontSize: "11px",
                            fontWeight: "700",
                            color: g.color,
                            display: "inline-block",
                            border: "1px solid var(--border-subtle)",
                          }}
                        >
                          📅 Bu Döngüdeki Tarihler:{" "}
                          {inspectedPhase === "menstrual"
                            ? phaseDetails.schedule.menstrual.dateRangeText
                            : inspectedPhase === "follicular"
                              ? phaseDetails.schedule.follicular.dateRangeText
                              : inspectedPhase === "ovulation"
                                ? `${phaseDetails.schedule.ovulationWindow.dateRangeText} (Tahmini Ovülasyon: ${phaseDetails.schedule.ovulationPeakText})`
                                : phaseDetails.schedule.luteal.dateRangeText}
                        </div>
                      </div>

                      <div
                        style={{
                          backgroundColor: "var(--bg-elevated)",
                          padding: "12px",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <strong
                          style={{
                            fontSize: "12px",
                            color: "var(--text-primary)",
                            display: "block",
                            marginBottom: "4px",
                          }}
                        >
                          🧬 Hormonal Durum ve Biyoloji
                        </strong>
                        <p
                          style={{
                            fontSize: "12px",
                            color: "var(--text-secondary)",
                            lineHeight: "1.4",
                            margin: 0,
                          }}
                        >
                          {g.hormones}
                        </p>
                      </div>

                      <div
                        style={{
                          backgroundColor: "var(--bg-elevated)",
                          padding: "12px",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <strong
                          style={{
                            fontSize: "12px",
                            color: "var(--text-primary)",
                            display: "block",
                            marginBottom: "4px",
                          }}
                        >
                          🧘 Vücut & Belirtiler
                        </strong>
                        <p
                          style={{
                            fontSize: "12px",
                            color: "var(--text-secondary)",
                            lineHeight: "1.4",
                            margin: 0,
                          }}
                        >
                          {g.body}
                        </p>
                      </div>

                      <div
                        style={{
                          backgroundColor: "var(--bg-elevated)",
                          padding: "12px",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <strong
                          style={{
                            fontSize: "12px",
                            color: "var(--text-primary)",
                            display: "block",
                            marginBottom: "4px",
                          }}
                        >
                          🏃‍♀️ Egzersiz & Beslenme
                        </strong>
                        <p
                          style={{
                            fontSize: "12px",
                            color: "var(--text-secondary)",
                            lineHeight: "1.4",
                            margin: "0 0 6px",
                          }}
                        >
                          • <strong>Hareket:</strong> {g.exercise}
                        </p>
                        <p
                          style={{
                            fontSize: "12px",
                            color: "var(--text-secondary)",
                            lineHeight: "1.4",
                            margin: 0,
                          }}
                        >
                          • <strong>Beslenme:</strong> {g.nutrition}
                        </p>
                      </div>

                      <div
                        style={{
                          backgroundColor: "var(--bg-elevated)",
                          padding: "12px",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <strong
                          style={{
                            fontSize: "12px",
                            color: "var(--text-primary)",
                            display: "block",
                            marginBottom: "4px",
                          }}
                        >
                          🎯 Doğurganlık ve Semptotermal Kural
                        </strong>
                        <p
                          style={{
                            fontSize: "12px",
                            color: "var(--text-secondary)",
                            lineHeight: "1.4",
                            margin: 0,
                          }}
                        >
                          {g.fertility}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                <button
                  type="button"
                  onClick={() => setActiveSheet(null)}
                  style={{
                    width: "100%",
                    marginTop: "20px",
                    padding: "12px",
                    backgroundColor: "var(--accent-primary)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    fontSize: "14px",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  Anladım ✓
                </button>
                <div style={{ height: "40px" }} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
