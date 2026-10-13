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
import { addDays, daysBetween, parseISODate } from "../../core/date";
import {
  BleedingIntensity,
  CentiCelsius,
  DayEntry,
  DisturbanceType,
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

  // Local state initialized from active day entry
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

  // Re-sync local state whenever the selected date changes
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

    return () => {
      if (noteTimerRef.current) {
        window.clearTimeout(noteTimerRef.current);
      }
    };
  }, [selectedDate, entriesMap]);

  // Auto-save helper with automatic empty record pruning
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

  return (
    <div style={{ paddingBottom: "90px" }}>
      {/* Date Header Navigation Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          backgroundColor: "var(--bg-surface)",
          borderBottom: "1px solid var(--border-subtle)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <button
          type="button"
          onClick={handlePrevDay}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-primary)",
            fontSize: "18px",
            cursor: "pointer",
            padding: "8px 12px",
          }}
        >
          ‹
        </button>
        <div style={{ textAlign: "center" }}>
          <h2
            style={{
              fontSize: "16px",
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
            fontSize: "18px",
            cursor: "pointer",
            padding: "8px 12px",
          }}
        >
          ›
        </button>
      </div>

      <div style={{ padding: "16px", maxWidth: "500px", margin: "0 auto" }}>
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
        ).map((notice) => (
          <div
            key={notice.id}
            style={{
              backgroundColor: "var(--accent-surface)",
              border: "1px solid var(--accent-primary)",
              borderRadius: "var(--radius-md)",
              padding: "12px 14px",
              marginBottom: "14px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            <strong
              style={{ fontSize: "13px", color: "var(--accent-primary)" }}
            >
              🔔 {notice.title}
            </strong>
            <p
              style={{
                fontSize: "12px",
                color: "var(--text-secondary)",
                lineHeight: "1.4",
              }}
            >
              {notice.message}
            </p>
          </div>
        ))}

        {/* Cycle Ring Hero */}
        <CycleRing
          cycleDay={evaluation.currentCycleDay}
          estimatedCycleLength={evaluation.prediction.estimatedCycleLength}
          daysUntilPeriod={daysUntilNextPeriod}
          isPeriodDueToday={isPeriodDueToday}
        />

        {/* Calendar Quick Add Button */}
        {evaluation.prediction && (
          <div style={{ textAlign: "center", marginBottom: "16px" }}>
            <button
              type="button"
              onClick={() => {
                exportCalendarEventToDevice({
                  startDate: evaluation.prediction.nextPeriodStartDate,
                  title: "Hatırlatıcı",
                  description: "Tahmini döngü takip hatırlatıcısı.",
                  alarmMinutesBefore: 0,
                });
              }}
              style={{
                background: "none",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-full)",
                padding: "8px 16px",
                fontSize: "12px",
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              📅 Takvime Hatırlatıcı Ekle (Samsung/Google Calendar)
            </button>
          </div>
        )}

        {/* 1. Bleeding Intensity Card */}
        <section
          style={{
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-md)",
            padding: "16px",
            border: "1px solid var(--border-subtle)",
            marginBottom: "16px",
          }}
        >
          <h3
            style={{
              fontSize: "14px",
              fontWeight: "700",
              color: "var(--text-primary)",
              marginBottom: "10px",
            }}
          >
            🩸 {STRINGS.today.bleeding}
          </h3>
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

          <div style={{ marginTop: "12px" }}>
            <label
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
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
        </section>

        {/* 2. Symptothermal Mod: BBT Card */}
        {settings.trackingMode === "symptothermal" && (
          <section
            style={{
              backgroundColor: "var(--bg-surface)",
              borderRadius: "var(--radius-md)",
              padding: "16px",
              border: "1px solid var(--border-subtle)",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
              }}
            >
              <h3
                style={{
                  fontSize: "14px",
                  fontWeight: "700",
                  color: "var(--text-primary)",
                }}
              >
                🌡️ {STRINGS.today.bbt}
              </h3>
              <label
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
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
                            value: Math.round(bbtValue * 100) as CentiCelsius,
                            time: bbtTime,
                          }
                        : undefined,
                    });
                  }}
                />
                Kayıt Var
              </label>
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

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "12px",
                  }}
                >
                  <label
                    style={{ fontSize: "12px", color: "var(--text-secondary)" }}
                  >
                    Ölçüm Saati:
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
                    }}
                  />
                </div>

                {/* Disturbances */}
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    marginBottom: "8px",
                  }}
                >
                  Bozucu Etkenler (Algoritmik Dışlama Önerisi):
                </p>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "6px",
                    marginBottom: "12px",
                  }}
                >
                  {(Object.keys(STRINGS.disturbances) as DisturbanceType[]).map(
                    (dKey) => (
                      <Chip
                        key={dKey}
                        label={STRINGS.disturbances[dKey]}
                        selected={disturbances.includes(dKey)}
                        onToggle={() => handleDisturbanceToggle(dKey)}
                      />
                    ),
                  )}
                </div>

                <label
                  style={{
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
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
                  Bu ölçümü kaplama çizgisi ve kural hesabından hariç tut
                  (parantez içine al)
                </label>
              </div>
            )}
          </section>
        )}

        {/* 3. Symptothermal Mod: Cervical Mucus Card */}
        {settings.trackingMode === "symptothermal" && (
          <section
            style={{
              backgroundColor: "var(--bg-surface)",
              borderRadius: "var(--radius-md)",
              padding: "16px",
              border: "1px solid var(--border-subtle)",
              marginBottom: "16px",
            }}
          >
            <h3
              style={{
                fontSize: "14px",
                fontWeight: "700",
                color: "var(--text-primary)",
                marginBottom: "10px",
              }}
            >
              💧 {STRINGS.today.mucus}
            </h3>

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
                          mucus: { sensation: next, appearance: mucusApp },
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
                        mucus: { sensation: mucusSens, appearance: next },
                      });
                    }
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {/* 4. Physical Symptoms Card */}
        <section
          style={{
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-md)",
            padding: "16px",
            border: "1px solid var(--border-subtle)",
            marginBottom: "16px",
          }}
        >
          <h3
            style={{
              fontSize: "14px",
              fontWeight: "700",
              color: "var(--text-primary)",
              marginBottom: "10px",
            }}
          >
            ⚡ {STRINGS.today.symptoms}
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {(
              Object.keys(STRINGS.symptoms) as (keyof typeof STRINGS.symptoms)[]
            ).map((symKey) => (
              <Chip
                key={symKey}
                label={STRINGS.symptoms[symKey]}
                selected={symptoms.includes(symKey)}
                onToggle={() => handleSymptomToggle(symKey)}
              />
            ))}
          </div>
        </section>

        {/* 5. Mood Card */}
        <section
          style={{
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-md)",
            padding: "16px",
            border: "1px solid var(--border-subtle)",
            marginBottom: "16px",
          }}
        >
          <h3
            style={{
              fontSize: "14px",
              fontWeight: "700",
              color: "var(--text-primary)",
              marginBottom: "10px",
            }}
          >
            ✨ {STRINGS.today.mood}
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {(Object.keys(STRINGS.mood) as (keyof typeof STRINGS.mood)[]).map(
              (mKey) => (
                <Chip
                  key={mKey}
                  label={STRINGS.mood[mKey]}
                  selected={mood.includes(mKey)}
                  onToggle={() => handleMoodToggle(mKey)}
                />
              ),
            )}
          </div>
        </section>

        {/* 6. Sex Activity Card */}
        <section
          style={{
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-md)",
            padding: "16px",
            border: "1px solid var(--border-subtle)",
            marginBottom: "16px",
          }}
        >
          <h3
            style={{
              fontSize: "14px",
              fontWeight: "700",
              color: "var(--text-primary)",
              marginBottom: "10px",
            }}
          >
            ❤️ {STRINGS.today.sex}
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {(["none", "protected", "unprotected"] as const).map((sVal) => (
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
            ))}
          </div>
        </section>

        {/* 7. Notes Card */}
        <section
          style={{
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-md)",
            padding: "16px",
            border: "1px solid var(--border-subtle)",
            marginBottom: "16px",
          }}
        >
          <h3
            style={{
              fontSize: "14px",
              fontWeight: "700",
              color: "var(--text-primary)",
              marginBottom: "10px",
            }}
          >
            📝 {STRINGS.today.notes}
          </h3>
          <textarea
            value={note}
            placeholder="Bugün nasıl hissediyorsunuz? Not ekleyin..."
            onInput={(e) => {
              handleNoteChange((e.target as HTMLTextAreaElement).value);
            }}
            onBlur={handleNoteBlur}
            style={{
              width: "100%",
              minHeight: "80px",
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
        </section>

        {/* Clear Day Entry Action */}
        {currentEntry && (
          <div style={{ textAlign: "center", marginTop: "16px", marginBottom: "24px" }}>
            <button
              type="button"
              onClick={handleClearDay}
              style={{
                background: "none",
                border: "1px dashed var(--border-strong)",
                borderRadius: "var(--radius-sm)",
                padding: "8px 16px",
                color: "var(--text-muted)",
                fontSize: "12px",
                cursor: "pointer",
                transition: "color 0.15s ease",
              }}
            >
              🗑️ Bu Günün Kaydını Temizle
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
