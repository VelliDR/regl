import { useEffect, useRef, useState } from "preact/hooks";
import {
  dbErrorSignal,
  entriesMapSignal,
  evaluationSignal,
  getLocalTodayISO,
  persistDayEntry,
  removeDayEntry,
  selectedDateSignal,
  settingsSignal,
} from "../../app/state";
import { addDays, daysBetween } from "../../core/date";
import {
  BleedingIntensity,
  CentiCelsius,
  CervixRecord,
  DayEntry,
  DisturbanceType,
  MucusAppearance,
  MucusSensation,
} from "../../core/types";
import { CycleRing } from "../components/CycleRing";
import { ActiveSheetType, TodaySheets } from "../components/TodaySheets";
import {
  CyclePhaseKey,
  PHASE_GUIDE_DATA,
  determineCyclePhase,
} from "../phaseSchedule";
import { STRINGS } from "../strings.tr";
import {
  evaluateInAppNotices,
  exportCalendarEventToDevice,
} from "../../app/reminders";

export {
  PHASE_GUIDE_DATA,
  determineCyclePhase,
  formatDateRangeTR,
  formatISODateTR,
} from "../phaseSchedule";
export type {
  CyclePhaseDetails,
  CyclePhaseKey,
  CyclePhaseSchedule,
  PhaseCalendarDates,
} from "../phaseSchedule";

function isDayEntryEmpty(entry: DayEntry): boolean {
  const hasBleeding = Boolean(entry.bleeding);
  const hasBbt = Boolean(entry.bbt);
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
  const [cervix, setCervix] = useState<CervixRecord | undefined>(
    currentEntry?.cervix,
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
  const pendingNoteFlushRef = useRef<(() => void) | null>(null);

  // Flush any pending debounced note when changing date or unmounting
  useEffect(() => {
    return () => {
      if (noteTimerRef.current) {
        window.clearTimeout(noteTimerRef.current);
        noteTimerRef.current = null;
      }
      if (pendingNoteFlushRef.current) {
        const flush = pendingNoteFlushRef.current;
        pendingNoteFlushRef.current = null;
        flush();
      }
    };
  }, [selectedDate]);

  // Re-sync local state when date changes
  useEffect(() => {
    const entry = entriesMap.get(selectedDate);
    setBleeding(entry?.bleeding);
    setHasBbt(entry?.bbt !== undefined);
    setBbtValue(entry?.bbt ? entry.bbt.value / 100 : 36.65);
    setBbtTime(entry?.bbt?.time ?? settings.reminderBbtTime);
    setBbtExcluded(entry?.bbt?.excluded ?? false);
    setDisturbances(entry?.bbt?.disturbances ?? []);
    setMucusSens(entry?.mucus?.sensation);
    setMucusApp(entry?.mucus?.appearance);
    setCervix(entry?.cervix);
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
      ...(cervix ? { cervix } : {}),
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
    const flushFn = () => {
      saveCurrent({ note: val.trim().length > 0 ? val.trim() : undefined });
    };
    pendingNoteFlushRef.current = flushFn;
    noteTimerRef.current = window.setTimeout(() => {
      noteTimerRef.current = null;
      pendingNoteFlushRef.current = null;
      flushFn();
    }, 350);
  };

  const handleNoteBlur = () => {
    if (noteTimerRef.current) {
      window.clearTimeout(noteTimerRef.current);
      noteTimerRef.current = null;
    }
    pendingNoteFlushRef.current = null;
    saveCurrent({ note: note.trim().length > 0 ? note.trim() : undefined });
  };

  const handleClearDay = () => {
    if (
      typeof window !== "undefined" &&
      window.confirm("Bu güne ait tüm kayıtları silmek istediğinizden emin misiniz?")
    ) {
      if (noteTimerRef.current) {
        window.clearTimeout(noteTimerRef.current);
        noteTimerRef.current = null;
      }
      pendingNoteFlushRef.current = null;
      setBleeding(undefined);
      setHasBbt(false);
      setMucusSens(undefined);
      setMucusApp(undefined);
      setCervix(undefined);
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
    selectedDateSignal.value = getLocalTodayISO();
  };

  const handleBleedingToggle = (val: BleedingIntensity) => {
    const nextVal = bleeding === val ? undefined : val;
    setBleeding(nextVal);
    saveCurrent({ bleeding: nextVal });
  };

  const clampBbt = (val: number) =>
    Math.min(41.0, Math.max(35.0, Math.round(val * 100) / 100));

  const handleBbtStep = (step: number) => {
    const nextVal = clampBbt(bbtValue + step);
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

  const handleCervixUpdate = (next: CervixRecord | undefined) => {
    setCervix(next);
    saveCurrent({ cervix: next });
  };

  const viewedCycle = evaluation.targetCycle ?? evaluation.activeCycle;
  const isViewingCompletedPastCycle = Boolean(viewedCycle?.endDate);

  const cycleNextPeriodDate = isViewingCompletedPastCycle && viewedCycle?.endDate
    ? addDays(viewedCycle.endDate, 1)
    : evaluation.prediction?.nextPeriodStartDate;

  const viewedCycleLength =
    isViewingCompletedPastCycle && viewedCycle?.length
      ? viewedCycle.length
      : evaluation.prediction.estimatedCycleLength || settings.defaultCycleLength;

  const daysUntilNextPeriod = cycleNextPeriodDate
    ? daysBetween(selectedDate, cycleNextPeriodDate)
    : undefined;

  const isPeriodDueToday = daysUntilNextPeriod === 0;

  const derivedLutealDays =
    !isViewingCompletedPastCycle && evaluation.prediction.estimatedOvulationDate
      ? daysBetween(
          evaluation.prediction.estimatedOvulationDate,
          evaluation.prediction.nextPeriodStartDate,
        )
      : undefined;

  // Compute Clinical & Biological Cycle Phase
  const phaseDetails = determineCyclePhase({
    selectedDate,
    activeCycleStartDate: viewedCycle?.startDate,
    currentCycleDay: evaluation.currentCycleDay,
    estimatedCycleLength: viewedCycleLength,
    nextPeriodStartDate: cycleNextPeriodDate,
    estimatedOvulationDate: isViewingCompletedPastCycle
      ? undefined
      : evaluation.prediction.estimatedOvulationDate,
    daysUntilPeriod: daysUntilNextPeriod,
    bleeding,
    sensiplan: evaluation.sensiplan,
    knausOgino: evaluation.knausOgino,
    lutealPhaseDays: derivedLutealDays,
  });

  // Pregnancy / Fertility chance pill description adapted to user goal
  const isBleedingActive = Boolean(bleeding && bleeding !== "spotting");
  const isFertile =
    evaluation.sensiplan?.overallFertilityState === "fertile";
  const userGoal = settings.goal ?? "track_only";

  let statusBadgeText = "🛡️ Düşük Hamilelik Olasılığı";
  let statusBadgeColor = "var(--text-secondary)";
  let statusBadgeBg = "var(--bg-elevated)";

  if (isBleedingActive) {
    statusBadgeText = "🩸 Adet Dönemi";
    statusBadgeColor = "var(--accent-primary)";
    statusBadgeBg = "var(--accent-surface)";
  } else if (isFertile) {
    statusBadgeText =
      userGoal === "avoid_pregnancy"
        ? "⚠️ Korunma Gerekli • Doğurgan Pencere"
        : userGoal === "conceive"
          ? "🌟 Gebelik İçin En Verimli Pencere"
          : "🌱 Doğurgan Pencere (Yüksek Olasılık)";
    statusBadgeColor =
      userGoal === "avoid_pregnancy"
        ? "var(--accent-primary)"
        : "var(--fertile-color)";
    statusBadgeBg =
      userGoal === "avoid_pregnancy"
        ? "var(--accent-surface)"
        : "var(--fertile-surface)";
  } else if (phaseDetails.key === "luteal") {
    if (evaluation.sensiplan?.doubleCheck.isPostOvulatoryInfertile) {
      statusBadgeText =
        userGoal === "avoid_pregnancy"
          ? "🛡️ Çift-Kontrol Onaylı Kısır Dönem"
          : userGoal === "conceive"
            ? "⏳ Luteal Bekleme (İmplantasyon Evresi)"
            : "🛡️ Biyolojik Kısır (Luteal Faz)";
    } else {
      statusBadgeText =
        userGoal === "conceive"
          ? "⏳ Luteal Faz (Sonuç Bekleniyor)"
          : "🛡️ Düşük Hamilelik Olasılığı (Luteal Faz)";
    }
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

  const cervixLabel = (() => {
    if (!cervix) return "+ Gözlem Ekle";
    const parts: string[] = [];
    if (cervix.position) {
      parts.push(
        STRINGS.cervixPosition[cervix.position].split(" ")[0] ?? cervix.position,
      );
    }
    if (cervix.firmness) {
      parts.push(
        STRINGS.cervixFirmness[cervix.firmness].split(" ")[0] ?? cervix.firmness,
      );
    }
    if (cervix.opening) {
      parts.push(STRINGS.cervixOpening[cervix.opening]);
    }
    return parts.length > 0 ? parts.join(" • ") : "+ Gözlem Ekle";
  })();

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

        {/* In-App Notices (evaluated against real today, not historical date browsing) */}
        {(() => {
          const realToday = getLocalTodayISO();
          const realTodayEntry = entriesMap.get(realToday);
          const hasRealTodayLog = Boolean(
            realTodayEntry && !isDayEntryEmpty(realTodayEntry),
          );
          const realDaysUntilPeriod = evaluation.prediction
            ? daysBetween(realToday, evaluation.prediction.nextPeriodStartDate)
            : undefined;
          return evaluateInAppNotices(
            hasRealTodayLog,
            realDaysUntilPeriod,
            settings.lastBackupDate,
            entriesMap.size,
            {
              reminderBbtEnabled: settings.reminderBbtEnabled,
              reminderPeriodDaysBefore: settings.reminderPeriodDaysBefore,
            },
          );
        })().map((notice) => (
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

          {/* Card 3b: Cervix (Symptothermal only) */}
          {isSymptothermal && (
            <button
              type="button"
              className={`glance-card ${cervix ? "has-value" : ""}`}
              onClick={() => setActiveSheet("cervix")}
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
                🌺 {STRINGS.today.cervix}
              </span>
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: cervix ? "700" : "500",
                  color: cervix ? "var(--text-primary)" : "var(--text-secondary)",
                  marginTop: "6px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {cervixLabel}
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
      <TodaySheets
        activeSheet={activeSheet}
        onClose={() => setActiveSheet(null)}
        onSwitchSheet={(sheet) => setActiveSheet(sheet)}
        saveCurrent={saveCurrent}
        bleeding={bleeding}
        onBleedingToggle={handleBleedingToggle}
        cycleOverride={cycleOverride}
        setCycleOverride={setCycleOverride}
        hasBbt={hasBbt}
        setHasBbt={setHasBbt}
        bbtValue={bbtValue}
        setBbtValue={setBbtValue}
        bbtTime={bbtTime}
        setBbtTime={setBbtTime}
        bbtExcluded={bbtExcluded}
        setBbtExcluded={setBbtExcluded}
        disturbances={disturbances}
        onDisturbanceToggle={handleDisturbanceToggle}
        onBbtStep={handleBbtStep}
        clampBbt={clampBbt}
        mucusSens={mucusSens}
        setMucusSens={setMucusSens}
        mucusApp={mucusApp}
        setMucusApp={setMucusApp}
        hasSavedMucus={Boolean(currentEntry?.mucus)}
        cervix={cervix}
        onCervixUpdate={handleCervixUpdate}
        symptoms={symptoms}
        onSymptomToggle={handleSymptomToggle}
        mood={mood}
        onMoodToggle={handleMoodToggle}
        sex={sex}
        setSex={setSex}
        note={note}
        onNoteChange={handleNoteChange}
        onNoteBlur={handleNoteBlur}
        inspectedPhase={inspectedPhase}
        setInspectedPhase={setInspectedPhase}
        phaseDetails={phaseDetails}
      />
    </div>
  );
}
