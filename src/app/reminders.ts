import { ISODate } from '../core/types';

export interface CalendarEventOptions {
  readonly title?: string; // Default: 'Hatırlatıcı'
  readonly description?: string;
  readonly startDate: ISODate; // YYYY-MM-DD
  readonly time?: string; // 'HH:MM', default: '09:00'
  readonly durationMinutes?: number; // default: 30
  readonly alarmMinutesBefore?: number; // default: 0
}

/**
 * Generates an RFC 5545 compliant .ics calendar event file string.
 * Completely offline and compatible with Samsung Calendar (S Planner),
 * Google Calendar, and iOS Calendar.
 */
export function generateIcsCalendarEvent(options: CalendarEventOptions): string {
  const title = options.title ?? 'Hatırlatıcı';
  const description = options.description ?? 'Döngü takip hatırlatıcısı.';
  const time = options.time ?? '09:00';
  const duration = options.durationMinutes ?? 30;
  const alarmBefore = options.alarmMinutesBefore ?? 0;

  const timeParts = time.split(':').map(Number);
  const hours = timeParts[0] ?? 9;
  const minutes = timeParts[1] ?? 0;
  const dateStr = options.startDate.replace(/-/g, '');

  const startFormatted = `${dateStr}T${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}00`;

  // Calculate end time
  const endHours = hours + Math.floor((minutes + duration) / 60);
  const endMinutes = (minutes + duration) % 60;
  const endFormatted = `${dateStr}T${String(endHours).padStart(2, '0')}${String(endMinutes).padStart(2, '0')}00`;

  const alarmTrigger = alarmBefore > 0 ? `-PT${alarmBefore}M` : 'PT0M';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Regl App//TR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${dateStr}-${Date.now()}@regl.local`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    `DTSTART:${startFormatted}`,
    `DTEND:${endFormatted}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    'BEGIN:VALARM',
    `TRIGGER:${alarmTrigger}`,
    'ACTION:DISPLAY',
    `DESCRIPTION:${title}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.join('\r\n');
}

/**
 * Triggers download or direct opening of the .ics event on Android/Samsung devices.
 */
export function exportCalendarEventToDevice(options: CalendarEventOptions): void {
  const ics = generateIcsCalendarEvent(options);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `hatirlatici-${options.startDate}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates an Android Calendar intent URL for instant native calendar opening
 * if the browser supports intent links.
 */
export function createAndroidCalendarIntentUrl(options: CalendarEventOptions): string {
  const title = encodeURIComponent(options.title ?? 'Hatırlatıcı');
  const description = encodeURIComponent(options.description ?? 'Döngü takip hatırlatıcısı.');
  const dateParts = options.startDate.split('-');
  const y = dateParts[0];
  const m = dateParts[1];
  const d = dateParts[2];

  // Google Calendar web / Android intent URI
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${description}&dates=${y}${m}${d}/${y}${m}${d}`;
}

/**
 * Evaluates pending in-app reminder notices for TodayScreen.
 */
export interface InAppNotice {
  readonly id: string;
  readonly type: 'missing-today' | 'period-approaching' | 'backup-due';
  readonly title: string;
  readonly message: string;
}

export function evaluateInAppNotices(
  hasTodayEntry: boolean,
  daysUntilPeriod?: number,
  lastBackupDate?: string
): InAppNotice[] {
  const notices: InAppNotice[] = [];

  // 1. Missing entry today notice
  if (!hasTodayEntry) {
    notices.push({
      id: 'missing-today',
      type: 'missing-today',
      title: 'Bugün Henüz Kayıt Girilmedi',
      message: 'Sabah bazal vücut ısısı ve semptomlarınızı eklemeyi unutmayın.',
    });
  }

  // 2. Period approaching notice (within 2 days)
  if (daysUntilPeriod !== undefined && daysUntilPeriod >= 0 && daysUntilPeriod <= 2) {
    notices.push({
      id: 'period-approaching',
      type: 'period-approaching',
      title: 'Yaklaşan Regl Dönemi',
      message:
        daysUntilPeriod === 0
          ? 'Tahmini adet kanaması başlangıcı bugün bekleniyor.'
          : `Tahmini adet kanaması yaklaşık ${daysUntilPeriod} gün içinde başlayabilir.`,
    });
  }

  // 3. Backup due notice (if > 14 days or never)
  if (!lastBackupDate) {
    notices.push({
      id: 'backup-due',
      type: 'backup-due',
      title: 'Verilerinizi Güvene Alın',
      message: 'İlk yedeğinizi almak için Ayarlar bölümünden JSON yedeği indirebilirsiniz.',
    });
  } else {
    const lastBackupTime = new Date(lastBackupDate).getTime();
    const daysSince = Math.floor((Date.now() - lastBackupTime) / (1000 * 60 * 60 * 24));
    if (daysSince >= 14) {
      notices.push({
        id: 'backup-due',
        type: 'backup-due',
        title: 'Yedekleme Hatırlatıcısı',
        message: `Son yedeklemenin üzerinden ${daysSince} gün geçti. Veri kaybını önlemek için lütfen yeni bir yedek alın.`,
      });
    }
  }

  return notices;
}
