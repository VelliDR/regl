import { addDays } from "../core/date";
import { ISODate } from "../core/types";

export interface CalendarEventOptions {
  readonly title?: string; // Default: 'Hatırlatıcı'
  readonly description?: string;
  readonly startDate: ISODate; // YYYY-MM-DD
  readonly time?: string; // 'HH:MM', default: '09:00'
  readonly durationMinutes?: number; // default: 30
  readonly alarmMinutesBefore?: number; // default: 0
  readonly recurrenceRule?: string | undefined; // e.g. 'FREQ=DAILY'
}

let icsUidCounter = 0;

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/**
 * Generates an RFC 5545 compliant .ics calendar event file string.
 * Completely offline and compatible with Samsung Calendar (S Planner),
 * Google Calendar, and iOS Calendar.
 */
export function generateIcsCalendarEvent(
  options: CalendarEventOptions,
): string {
  const title = escapeIcsText(options.title ?? "Hatırlatıcı");
  const description = escapeIcsText(
    options.description ?? "Döngü takip hatırlatıcısı.",
  );
  const time = options.time ?? "09:00";
  const duration = options.durationMinutes ?? 30;
  const alarmBefore = options.alarmMinutesBefore ?? 0;

  const timeParts = time.split(":").map(Number);
  const rawHours = timeParts[0] ?? 9;
  const rawMinutes = timeParts[1] ?? 0;
  const hours = Number.isFinite(rawHours)
    ? Math.max(0, Math.min(23, rawHours))
    : 9;
  const minutes = Number.isFinite(rawMinutes)
    ? Math.max(0, Math.min(59, rawMinutes))
    : 0;
  const dateStr = options.startDate.replace(/-/g, "");

  const startFormatted = `${dateStr}T${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}00`;

  // Calculate end time and handle midnight rollover safely
  const totalEndMinutes = hours * 60 + minutes + duration;
  const endHours = Math.floor(totalEndMinutes / 60) % 24;
  const endMinutes = totalEndMinutes % 60;
  const daysToAdd = Math.floor(totalEndMinutes / (24 * 60));
  const endDateStr = daysToAdd > 0
    ? addDays(options.startDate, daysToAdd).replace(/-/g, "")
    : dateStr;
  const endFormatted = `${endDateStr}T${String(endHours).padStart(2, "0")}${String(endMinutes).padStart(2, "0")}00`;

  const alarmTrigger = alarmBefore > 0 ? `-PT${alarmBefore}M` : "PT0M";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Regl App//TR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${dateStr}-${Date.now()}-${++icsUidCounter}@regl.local`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
    `DTSTART:${startFormatted}`,
    `DTEND:${endFormatted}`,
    ...(options.recurrenceRule ? [`RRULE:${options.recurrenceRule}`] : []),
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    "BEGIN:VALARM",
    `TRIGGER:${alarmTrigger}`,
    "ACTION:DISPLAY",
    `DESCRIPTION:${title}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n");
}

/**
 * Triggers download or direct opening of the .ics event on Android/Samsung devices.
 */
export function exportCalendarEventToDevice(
  options: CalendarEventOptions,
): void {
  const ics = generateIcsCalendarEvent(options);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `hatirlatici-${options.startDate}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Evaluates pending in-app reminder notices for TodayScreen.
 */
export type InAppNoticeType =
  | "missing-today"
  | "period-approaching"
  | "cycle-delayed"
  | "backup-due";

export interface InAppNotice {
  readonly id: string;
  readonly type: InAppNoticeType;
  readonly title: string;
  readonly message: string;
}

export interface InAppNoticeOptions {
  readonly reminderBbtEnabled?: boolean | undefined;
  readonly reminderPeriodDaysBefore?: number | undefined;
}

export function evaluateInAppNotices(
  hasTodayEntry: boolean,
  daysUntilPeriod?: number,
  lastBackupDate?: string,
  entryCount?: number,
  options?: InAppNoticeOptions,
): InAppNotice[] {
  const notices: InAppNotice[] = [];

  // 1. Missing entry today notice (respects reminderBbtEnabled setting)
  if (!hasTodayEntry && options?.reminderBbtEnabled !== false) {
    notices.push({
      id: "missing-today",
      type: "missing-today",
      title: "Bugün Henüz Kayıt Girilmedi",
      message: "Sabah bazal vücut ısısı ve semptomlarınızı eklemeyi unutmayın.",
    });
  }

  // 2. Period approaching notice (configurable lead days, default 2)
  const leadDays = options?.reminderPeriodDaysBefore ?? 2;
  if (
    leadDays >= 0 &&
    daysUntilPeriod !== undefined &&
    daysUntilPeriod >= 0 &&
    daysUntilPeriod <= leadDays
  ) {
    notices.push({
      id: "period-approaching",
      type: "period-approaching",
      title: "Yaklaşan Regl Dönemi",
      message:
        daysUntilPeriod === 0
          ? "Tahmini adet kanaması başlangıcı bugün bekleniyor."
          : `Tahmini adet kanaması yaklaşık ${daysUntilPeriod} gün içinde başlayabilir.`,
    });
  }

  // 3. Cycle delayed notice (if 2+ days past expected date)
  if (daysUntilPeriod !== undefined && daysUntilPeriod <= -2) {
    const daysDelayed = Math.abs(daysUntilPeriod);
    notices.push({
      id: "cycle-delayed",
      type: "cycle-delayed",
      title: "Döngü Gecikmesi",
      message: `Beklenen adet kanaması tarihinin üzerinden ${daysDelayed} gün geçti. Stres, seyahat, uyku düzensizlikleri veya geç yumurtlama gecikmeye neden olabilir.`,
    });
  }

  // 4. Backup due notice (if > 14 days or never)
  const isEligibleForBackupNotice = entryCount === undefined || entryCount >= 3;
  if (isEligibleForBackupNotice) {
    if (!lastBackupDate) {
      notices.push({
        id: "backup-due",
        type: "backup-due",
        title: "Verilerinizi Güvene Alın",
        message:
          "İlk yedeğinizi almak için Ayarlar bölümünden JSON veya .reglvault yedeği indirebilirsiniz.",
      });
    } else {
      const lastBackupTime = new Date(lastBackupDate).getTime();
      if (Number.isNaN(lastBackupTime)) {
        notices.push({
          id: "backup-due",
          type: "backup-due",
          title: "Yedekleme Hatırlatıcısı",
          message:
            "Yedekleme tarihiniz doğrulanamadı. Veri kaybını önlemek için lütfen yeni bir yedek alın.",
        });
      } else {
        const daysSince = Math.floor(
          (Date.now() - lastBackupTime) / (1000 * 60 * 60 * 24),
        );
        if (daysSince >= 14) {
          notices.push({
            id: "backup-due",
            type: "backup-due",
            title: "Yedekleme Hatırlatıcısı",
            message: `Son yedeklemenin üzerinden ${daysSince} gün geçti. Veri kaybını önlemek için lütfen yeni bir yedek alın.`,
          });
        }
      }
    }
  }

  return notices;
}
