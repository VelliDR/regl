import { useState } from "preact/hooks";
import {
  entriesMapSignal,
  evaluationSignal,
  selectedDateSignal,
} from "../../app/state";
import {
  addDays,
  compareISODate,
  getDaysInMonth,
  isoToDayIndex,
  parseISODate,
} from "../../core/date";
import { BleedingIntensity, ISODate } from "../../core/types";

const WEEKDAYS = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"];

interface CalendarScreenProps {
  readonly onOpenDayEditor: (date: ISODate) => void;
}

export function CalendarScreen({ onOpenDayEditor }: CalendarScreenProps) {
  const selectedDate = selectedDateSignal.value;
  const entriesMap = entriesMapSignal.value;
  const evaluation = evaluationSignal.value;

  const currentYear = Number(selectedDate.slice(0, 4));
  const currentMonth = Number(selectedDate.slice(5, 7));

  const [viewYear, setViewYear] = useState<number>(currentYear);
  const [viewMonth, setViewMonth] = useState<number>(currentMonth);

  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewYear(viewYear - 1);
      setViewMonth(12);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 12) {
      setViewYear(viewYear + 1);
      setViewMonth(1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const monthStartISO = parseISODate(
    `${viewYear}-${String(viewMonth).padStart(2, "0")}-01`,
  );
  // Get day of week for the 1st of month (0 = Monday, 6 = Sunday)
  // DayIndex 0 was 1970-01-01 (Thursday). (idx + 3) % 7 gives 0 = Mon, 6 = Sun
  const firstDayIdx = isoToDayIndex(monthStartISO);
  const startDayOfWeek = (((firstDayIdx + 3) % 7) + 7) % 7;

  // Build grid calendar days
  const calendarCells: {
    date: ISODate;
    dayNumber: number;
    isCurrentMonth: boolean;
  }[] = [];

  // Previous month trailing days
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const trailingDate = addDays(monthStartISO, -i - 1);
    const dayNumber = Number(trailingDate.slice(8, 10));
    calendarCells.push({
      date: trailingDate,
      dayNumber,
      isCurrentMonth: false,
    });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = String(d).padStart(2, "0");
    const mStr = String(viewMonth).padStart(2, "0");
    const date = parseISODate(`${viewYear}-${mStr}-${dStr}`);
    calendarCells.push({ date, dayNumber: d, isCurrentMonth: true });
  }

  // Trailing days to fill 35 or 42 grid cells
  const remaining = (7 - (calendarCells.length % 7)) % 7;
  const lastCurrentDate = calendarCells[calendarCells.length - 1]!.date;
  for (let i = 1; i <= remaining; i++) {
    const leadingDate = addDays(lastCurrentDate, i);
    const dayNumber = Number(leadingDate.slice(8, 10));
    calendarCells.push({ date: leadingDate, dayNumber, isCurrentMonth: false });
  }

  const pred = evaluation.prediction;

  return (
    <div
      style={{
        padding: "16px",
        maxWidth: "500px",
        margin: "0 auto",
        paddingBottom: "90px",
      }}
    >
      {/* Month Navigation */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <button
          type="button"
          onClick={handlePrevMonth}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-primary)",
            fontSize: "20px",
            cursor: "pointer",
            padding: "8px 16px",
          }}
        >
          ‹
        </button>
        <h2
          style={{
            fontSize: "18px",
            fontWeight: "700",
            color: "var(--text-primary)",
          }}
        >
          {viewYear} / {String(viewMonth).padStart(2, "0")}
        </h2>
        <button
          type="button"
          onClick={handleNextMonth}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-primary)",
            fontSize: "20px",
            cursor: "pointer",
            padding: "8px 16px",
          }}
        >
          ›
        </button>
      </div>

      {/* Weekday Headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          textAlign: "center",
          marginBottom: "8px",
          fontSize: "12px",
          fontWeight: "600",
          color: "var(--text-muted)",
        }}
      >
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ padding: "6px 0" }}>
            {w}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: "4px",
        }}
      >
        {calendarCells.map((cell) => {
          const entry = entriesMap.get(cell.date);
          const isSelected = cell.date === selectedDate;

          const isBleeding =
            entry?.bleeding && entry.bleeding !== ("none" as BleedingIntensity);

          const isPredictedPeriod =
            pred &&
            compareISODate(cell.date, pred.windowStartDate) >= 0 &&
            compareISODate(cell.date, pred.windowEndDate) <= 0;

          const isOvulationDay = pred?.estimatedOvulationDate === cell.date;

          let cellBg = "var(--bg-surface)";
          let cellBorder = "1px solid var(--border-subtle)";
          let textColor = cell.isCurrentMonth
            ? "var(--text-primary)"
            : "var(--text-muted)";

          if (isBleeding) {
            cellBg = "var(--accent-surface)";
            cellBorder = "1px solid var(--accent-primary)";
            textColor = "var(--accent-primary)";
          } else if (isPredictedPeriod) {
            cellBg = "rgba(224, 109, 122, 0.08)";
            cellBorder = "1px dashed var(--accent-primary)";
          }

          if (isSelected) {
            cellBorder = "2px solid #ffffff";
          }

          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => {
                selectedDateSignal.value = cell.date;
                onOpenDayEditor(cell.date);
              }}
              style={{
                aspectRatio: "1",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: cellBg,
                border: cellBorder,
                borderRadius: "var(--radius-sm)",
                color: textColor,
                cursor: "pointer",
                position: "relative",
                padding: "2px",
                transition: "all 0.15s ease",
              }}
            >
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: cell.isCurrentMonth ? "600" : "400",
                }}
              >
                {cell.dayNumber}
              </span>

              {/* Indicator dots */}
              <div
                style={{
                  display: "flex",
                  gap: "2px",
                  marginTop: "2px",
                  height: "4px",
                }}
              >
                {entry?.bbt && (
                  <span
                    style={{
                      width: "4px",
                      height: "4px",
                      borderRadius: "50%",
                      backgroundColor: "var(--fertile-color)",
                    }}
                  />
                )}
                {isOvulationDay && (
                  <span
                    style={{
                      width: "4px",
                      height: "4px",
                      borderRadius: "50%",
                      backgroundColor: "#5ea2ef",
                    }}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          marginTop: "20px",
          fontSize: "12px",
          color: "var(--text-secondary)",
          justifyContent: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              width: "12px",
              height: "12px",
              backgroundColor: "var(--accent-surface)",
              border: "1px solid var(--accent-primary)",
              borderRadius: "2px",
            }}
          />
          <span>Adet Kanaması</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              width: "12px",
              height: "12px",
              backgroundColor: "rgba(224, 109, 122, 0.08)",
              border: "1px dashed var(--accent-primary)",
              borderRadius: "2px",
            }}
          />
          <span>Tahmin Aralığı</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              width: "6px",
              height: "6px",
              backgroundColor: "var(--fertile-color)",
              borderRadius: "50%",
            }}
          />
          <span>BBT Ölçümü</span>
        </div>
      </div>
    </div>
  );
}
