import {
  BleedingIntensity,
  CentiCelsius,
  CervixRecord,
  DayEntry,
  DisturbanceType,
  MucusAppearance,
  MucusSensation,
} from "../../core/types";
import {
  CyclePhaseDetails,
  CyclePhaseKey,
  PHASE_GUIDE_DATA,
} from "../phaseSchedule";
import { STRINGS } from "../strings.tr";
import { Chip } from "./Chip";

export type ActiveSheetType =
  | "bleeding"
  | "bbt"
  | "mucus"
  | "cervix"
  | "symptoms"
  | "mood"
  | "sex"
  | "note"
  | "phase_info"
  | null;

interface TodaySheetsProps {
  readonly activeSheet: ActiveSheetType;
  readonly onClose: () => void;
  readonly onSwitchSheet: (sheet: ActiveSheetType) => void;
  readonly saveCurrent: (patch: Partial<DayEntry>) => void;

  // Bleeding
  readonly bleeding: BleedingIntensity | undefined;
  readonly onBleedingToggle: (val: BleedingIntensity) => void;
  readonly cycleOverride: boolean;
  readonly setCycleOverride: (val: boolean) => void;

  // BBT
  readonly hasBbt: boolean;
  readonly setHasBbt: (val: boolean) => void;
  readonly bbtValue: number;
  readonly setBbtValue: (val: number) => void;
  readonly bbtTime: string;
  readonly setBbtTime: (val: string) => void;
  readonly bbtExcluded: boolean;
  readonly setBbtExcluded: (val: boolean) => void;
  readonly disturbances: readonly DisturbanceType[];
  readonly onDisturbanceToggle: (d: DisturbanceType) => void;
  readonly onBbtStep: (step: number) => void;
  readonly clampBbt: (val: number) => number;

  // Mucus
  readonly mucusSens: MucusSensation | undefined;
  readonly setMucusSens: (val: MucusSensation | undefined) => void;
  readonly mucusApp: MucusAppearance | undefined;
  readonly setMucusApp: (val: MucusAppearance | undefined) => void;
  readonly hasSavedMucus: boolean;

  // Cervix
  readonly cervix: CervixRecord | undefined;
  readonly onCervixUpdate: (next: CervixRecord | undefined) => void;

  // Symptoms & Mood
  readonly symptoms: readonly string[];
  readonly onSymptomToggle: (sym: string) => void;
  readonly mood: readonly string[];
  readonly onMoodToggle: (m: string) => void;

  // Sex & Note
  readonly sex: "none" | "protected" | "unprotected" | undefined;
  readonly setSex: (val: "none" | "protected" | "unprotected" | undefined) => void;
  readonly note: string;
  readonly onNoteChange: (val: string) => void;
  readonly onNoteBlur: () => void;

  // Phase Info
  readonly inspectedPhase: CyclePhaseKey;
  readonly setInspectedPhase: (key: CyclePhaseKey) => void;
  readonly phaseDetails: CyclePhaseDetails;
}

const SHEET_SAVE_BUTTON_STYLE = {
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
} as const;

export function TodaySheets(props: TodaySheetsProps) {
  const { activeSheet, onClose, onSwitchSheet, saveCurrent } = props;
  if (activeSheet === null) return null;

  const updateCervixField = (patch: Partial<CervixRecord>) => {
    const merged: CervixRecord = {
      ...(props.cervix ?? {}),
      ...patch,
    };
    const cleaned: CervixRecord = {
      ...(merged.position ? { position: merged.position } : {}),
      ...(merged.firmness ? { firmness: merged.firmness } : {}),
      ...(merged.opening ? { opening: merged.opening } : {}),
    };
    if (!cleaned.position && !cleaned.firmness && !cleaned.opening) {
      props.onCervixUpdate(undefined);
    } else {
      props.onCervixUpdate(cleaned);
    }
  };

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="sheet-container"
        role="dialog"
        aria-modal="true"
        aria-label="Günlük Veri Giriş Çekmecesi"
      >
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
            {activeSheet === "cervix" && `🌺 ${STRINGS.today.cervix}`}
            {activeSheet === "symptoms" && `⚡ ${STRINGS.today.symptoms}`}
            {activeSheet === "mood" && `✨ ${STRINGS.today.mood}`}
            {activeSheet === "sex" && `❤️ ${STRINGS.today.sex}`}
            {activeSheet === "note" && `📝 ${STRINGS.today.notes}`}
            {activeSheet === "phase_info" && "📖 Döngü Fazları Rehberi"}
          </h3>
          <button
            type="button"
            onClick={onClose}
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

        {/* Bleeding */}
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
              {(["spotting", "light", "medium", "heavy"] as const).map(
                (level) => (
                  <Chip
                    key={level}
                    label={STRINGS.bleeding[level]}
                    selected={props.bleeding === level}
                    onToggle={() => props.onBleedingToggle(level)}
                  />
                ),
              )}
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
                  checked={props.cycleOverride}
                  onChange={(e) => {
                    const val = (e.target as HTMLInputElement).checked;
                    props.setCycleOverride(val);
                    saveCurrent({ cycleStartOverride: val || undefined });
                  }}
                />
                Bu günü zorla yeni döngü başlangıcı (1. Gün) yap
              </label>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={SHEET_SAVE_BUTTON_STYLE}
            >
              Kaydet ve Kapat ✓
            </button>
            <div style={{ height: "40px" }} />
          </div>
        )}

        {/* BBT */}
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
                  checked={props.hasBbt}
                  onChange={(e) => {
                    const checked = (e.target as HTMLInputElement).checked;
                    props.setHasBbt(checked);
                    saveCurrent({
                      bbt: checked
                        ? {
                            value: Math.round(
                              props.bbtValue * 100,
                            ) as CentiCelsius,
                            time: props.bbtTime,
                            ...(props.disturbances.length > 0
                              ? { disturbances: props.disturbances }
                              : {}),
                            ...(props.bbtExcluded ? { excluded: true } : {}),
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
                  value={props.bbtTime}
                  onChange={(e) => {
                    const t = (e.target as HTMLInputElement).value;
                    props.setBbtTime(t);
                    if (props.hasBbt) {
                      saveCurrent({
                        bbt: {
                          value: Math.round(
                            props.bbtValue * 100,
                          ) as CentiCelsius,
                          time: t,
                          ...(props.disturbances.length > 0
                            ? { disturbances: props.disturbances }
                            : {}),
                          ...(props.bbtExcluded ? { excluded: true } : {}),
                        },
                      });
                    }
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

            {props.hasBbt && (
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "16px",
                    margin: "16px 0 8px",
                  }}
                >
                  <button
                    type="button"
                    aria-label="Sıcaklığı 0.05 azalt"
                    onClick={() => props.onBbtStep(-0.05)}
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
                    {props.bbtValue.toFixed(2)} °C
                  </span>
                  <button
                    type="button"
                    aria-label="Sıcaklığı 0.05 artır"
                    onClick={() => props.onBbtStep(0.05)}
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
                    justifyContent: "center",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "14px",
                  }}
                >
                  <label
                    htmlFor="bbt-direct-input"
                    style={{ fontSize: "11px", color: "var(--text-muted)" }}
                  >
                    Hassas Giriş (0.01 °C):
                  </label>
                  <input
                    id="bbt-direct-input"
                    type="number"
                    step="0.01"
                    min="35.00"
                    max="41.00"
                    value={props.bbtValue.toFixed(2)}
                    onChange={(e) => {
                      const raw = Number(
                        (e.target as HTMLInputElement).value.replace(",", "."),
                      );
                      if (!Number.isFinite(raw)) return;
                      const clamped = props.clampBbt(raw);
                      props.setBbtValue(clamped);
                      props.setHasBbt(true);
                      saveCurrent({
                        bbt: {
                          value: Math.round(clamped * 100) as CentiCelsius,
                          time: props.bbtTime,
                          ...(props.disturbances.length > 0
                            ? { disturbances: props.disturbances }
                            : {}),
                          ...(props.bbtExcluded ? { excluded: true } : {}),
                        },
                      });
                    }}
                    style={{
                      width: "84px",
                      padding: "5px 8px",
                      backgroundColor: "var(--bg-elevated)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--text-primary)",
                      fontSize: "13px",
                      fontWeight: "600",
                      textAlign: "center",
                    }}
                  />
                </div>

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
                  {(Object.keys(STRINGS.disturbances) as DisturbanceType[]).map(
                    (dKey) => (
                      <Chip
                        key={dKey}
                        label={STRINGS.disturbances[dKey]}
                        selected={props.disturbances.includes(dKey)}
                        onToggle={() => props.onDisturbanceToggle(dKey)}
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
                    marginTop: "8px",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={props.bbtExcluded}
                    onChange={(e) => {
                      const val = (e.target as HTMLInputElement).checked;
                      props.setBbtExcluded(val);
                      saveCurrent({
                        bbt: {
                          value: Math.round(
                            props.bbtValue * 100,
                          ) as CentiCelsius,
                          time: props.bbtTime,
                          ...(props.disturbances.length > 0
                            ? { disturbances: props.disturbances }
                            : {}),
                          ...(val ? { excluded: true } : {}),
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
              onClick={onClose}
              style={SHEET_SAVE_BUTTON_STYLE}
            >
              Kaydet ve Kapat ✓
            </button>
            <div style={{ height: "40px" }} />
          </div>
        )}

        {/* Mucus */}
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
                    selected={props.mucusSens === sens}
                    onToggle={() => {
                      const next = props.mucusSens === sens ? undefined : sens;
                      props.setMucusSens(next);
                      if (next && props.mucusApp) {
                        saveCurrent({
                          mucus: {
                            sensation: next,
                            appearance: props.mucusApp,
                          },
                        });
                      } else if (!next && !props.mucusApp) {
                        saveCurrent({ mucus: undefined });
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
                  selected={props.mucusApp === app}
                  onToggle={() => {
                    const next = props.mucusApp === app ? undefined : app;
                    props.setMucusApp(next);
                    if (props.mucusSens && next) {
                      saveCurrent({
                        mucus: {
                          sensation: props.mucusSens,
                          appearance: next,
                        },
                      });
                    } else if (!props.mucusSens && !next) {
                      saveCurrent({ mucus: undefined });
                    }
                  }}
                />
              ))}
            </div>

            {Boolean(props.mucusSens) !== Boolean(props.mucusApp) && (
              <p
                style={{
                  marginTop: "10px",
                  fontSize: "11px",
                  color: "var(--accent-primary)",
                  fontWeight: "600",
                }}
              >
                Kaydın tamamlanması için hem hissiyat hem de görünüm seçin.
              </p>
            )}

            {(props.mucusSens || props.mucusApp || props.hasSavedMucus) && (
              <button
                type="button"
                onClick={() => {
                  props.setMucusSens(undefined);
                  props.setMucusApp(undefined);
                  saveCurrent({ mucus: undefined });
                }}
                style={{
                  marginTop: "12px",
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  fontSize: "12px",
                  textDecoration: "underline",
                  cursor: "pointer",
                }}
              >
                Mukus Gözlemini Temizle
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              style={SHEET_SAVE_BUTTON_STYLE}
            >
              Kaydet ve Kapat ✓
            </button>
            <div style={{ height: "40px" }} />
          </div>
        )}

        {/* Cervix (Rahim Ağzı) */}
        {activeSheet === "cervix" && (
          <div>
            <p
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                marginBottom: "10px",
                lineHeight: "1.4",
              }}
            >
              Mukus gözleminin belirsiz olduğu döngülerde Sensiplan ikinci
              biyolojik gösterge olarak rahim ağzı muayenesini destekler.
            </p>

            <p
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                marginBottom: "6px",
              }}
            >
              Konum:
            </p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "6px",
                marginBottom: "12px",
              }}
            >
              {(["low", "high"] as const).map((pos) => (
                <Chip
                  key={pos}
                  label={STRINGS.cervixPosition[pos]}
                  selected={props.cervix?.position === pos}
                  onToggle={() =>
                    updateCervixField({
                      position:
                        props.cervix?.position === pos ? undefined : pos,
                    })
                  }
                />
              ))}
            </div>

            <p
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                marginBottom: "6px",
              }}
            >
              Sertlik:
            </p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "6px",
                marginBottom: "12px",
              }}
            >
              {(["firm", "soft"] as const).map((firm) => (
                <Chip
                  key={firm}
                  label={STRINGS.cervixFirmness[firm]}
                  selected={props.cervix?.firmness === firm}
                  onToggle={() =>
                    updateCervixField({
                      firmness:
                        props.cervix?.firmness === firm ? undefined : firm,
                    })
                  }
                />
              ))}
            </div>

            <p
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                marginBottom: "6px",
              }}
            >
              Açıklık:
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {(["closed", "open"] as const).map((open) => (
                <Chip
                  key={open}
                  label={STRINGS.cervixOpening[open]}
                  selected={props.cervix?.opening === open}
                  onToggle={() =>
                    updateCervixField({
                      opening: props.cervix?.opening === open ? undefined : open,
                    })
                  }
                />
              ))}
            </div>

            {props.cervix && (
              <button
                type="button"
                onClick={() => props.onCervixUpdate(undefined)}
                style={{
                  marginTop: "12px",
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  fontSize: "12px",
                  textDecoration: "underline",
                  cursor: "pointer",
                }}
              >
                Serviks Kaydını Temizle
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              style={SHEET_SAVE_BUTTON_STYLE}
            >
              Kaydet ve Kapat ✓
            </button>
            <div style={{ height: "40px" }} />
          </div>
        )}

        {/* Symptoms */}
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
                  selected={props.symptoms.includes(symKey)}
                  onToggle={() => props.onSymptomToggle(symKey)}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={onClose}
              style={SHEET_SAVE_BUTTON_STYLE}
            >
              Kaydet ve Kapat ✓
            </button>
            <div style={{ height: "40px" }} />
          </div>
        )}

        {/* Mood */}
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
              {(Object.keys(STRINGS.mood) as (keyof typeof STRINGS.mood)[]).map(
                (mKey) => (
                  <Chip
                    key={mKey}
                    label={STRINGS.mood[mKey]}
                    selected={props.mood.includes(mKey)}
                    onToggle={() => props.onMoodToggle(mKey)}
                  />
                ),
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              style={SHEET_SAVE_BUTTON_STYLE}
            >
              Kaydet ve Kapat ✓
            </button>
            <div style={{ height: "40px" }} />
          </div>
        )}

        {/* Sex */}
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
              {(["none", "protected", "unprotected"] as const).map((sVal) => (
                <Chip
                  key={sVal}
                  label={STRINGS.sex[sVal]}
                  selected={props.sex === sVal}
                  onToggle={() => {
                    const next = props.sex === sVal ? undefined : sVal;
                    props.setSex(next);
                    saveCurrent({ sex: next });
                  }}
                />
              ))}
            </div>

            <div style={{ textAlign: "right", marginBottom: "16px" }}>
              <button
                type="button"
                onClick={() => onSwitchSheet("note")}
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
              onClick={onClose}
              style={SHEET_SAVE_BUTTON_STYLE}
            >
              Kaydet ve Kapat ✓
            </button>
            <div style={{ height: "40px" }} />
          </div>
        )}

        {/* Note */}
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
              value={props.note}
              placeholder="Bugün nasıl hissediyorsunuz? Not ekleyin..."
              onInput={(e) => {
                props.onNoteChange((e.target as HTMLTextAreaElement).value);
              }}
              onBlur={props.onNoteBlur}
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
            <div
              style={{
                marginTop: "10px",
                textAlign: "left",
                marginBottom: "16px",
              }}
            >
              <button
                type="button"
                onClick={() => onSwitchSheet("sex")}
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
              onClick={onClose}
              style={SHEET_SAVE_BUTTON_STYLE}
            >
              Kaydet ve Kapat ✓
            </button>
            <div style={{ height: "40px" }} />
          </div>
        )}

        {/* Phase Info Guide */}
        {activeSheet === "phase_info" && (
          <div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "4px",
                marginBottom: "16px",
              }}
            >
              {(
                ["menstrual", "follicular", "ovulation", "luteal"] as const
              ).map((pKey) => {
                const item = PHASE_GUIDE_DATA[pKey];
                const isSelected = props.inspectedPhase === pKey;
                return (
                  <button
                    key={pKey}
                    type="button"
                    onClick={() => props.setInspectedPhase(pKey)}
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
              })}
            </div>

            {(() => {
              const g = PHASE_GUIDE_DATA[props.inspectedPhase];
              const s = props.phaseDetails.schedule;
              return (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
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
                      {props.inspectedPhase === "menstrual"
                        ? s.menstrual.dateRangeText
                        : props.inspectedPhase === "follicular"
                          ? s.follicular.dateRangeText
                          : props.inspectedPhase === "ovulation"
                            ? `${s.ovulationWindow.dateRangeText} (Tahmini Ovülasyon: ${s.ovulationPeakText})`
                            : s.luteal.dateRangeText}
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
              onClick={onClose}
              style={{ ...SHEET_SAVE_BUTTON_STYLE, marginTop: "20px" }}
            >
              Anladım ✓
            </button>
            <div style={{ height: "40px" }} />
          </div>
        )}
      </div>
    </div>
  );
}
