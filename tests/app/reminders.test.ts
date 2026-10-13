import { describe, it, expect } from "vitest";
import { parseISODate } from "../../src/core/date";
import {
  evaluateInAppNotices,
  generateIcsCalendarEvent,
} from "../../src/app/reminders";

describe("Hatırlatıcılar ve Takvim Entegrasyonu (reminders.ts)", () => {
  it(".ics takvim etkinliği RFC 5545 standartlarına uygun formatta üretilmelidir", () => {
    const ics = generateIcsCalendarEvent({
      startDate: parseISODate("2026-10-20"),
      time: "08:00",
      durationMinutes: 30,
      title: "Özel Hatırlatıcı",
      description: "Döngü takibi alarmı.",
      alarmMinutesBefore: 15,
    });

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART:20261020T080000");
    expect(ics).toContain("DTEND:20261020T083000");
    expect(ics).toContain("SUMMARY:Özel Hatırlatıcı");
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-PT15M");
    expect(ics).toContain("END:VALARM");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
  });

  describe("Uygulama İçi Bildirim Değerlendirmesi", () => {
    it("Bugün kayıt girilmemişse uyarı bildirimi üretmelidir", () => {
      const notices = evaluateInAppNotices(false, 10, "2026-10-10");
      expect(notices.some((n) => n.id === "missing-today")).toBe(true);
    });

    it("Bugün kayıt varsa eksik kayıt bildirimi üretmemelidir", () => {
      const notices = evaluateInAppNotices(true, 10, "2026-10-10");
      expect(notices.some((n) => n.id === "missing-today")).toBe(false);
    });

    it("Regle 2 gün veya daha az kalmışsa yaklaşan regl bildirimi üretmelidir", () => {
      const notices2Days = evaluateInAppNotices(true, 2, "2026-10-10");
      expect(notices2Days.some((n) => n.id === "period-approaching")).toBe(
        true,
      );

      const noticesToday = evaluateInAppNotices(true, 0, "2026-10-10");
      expect(noticesToday.some((n) => n.id === "period-approaching")).toBe(
        true,
      );

      const notices5Days = evaluateInAppNotices(true, 5, "2026-10-10");
      expect(notices5Days.some((n) => n.id === "period-approaching")).toBe(
        false,
      );
    });

    it("Yedekleme tarihi 14 günden eskiyse yedekleme hatırlatması üretmelidir", () => {
      const oldDate = new Date(
        Date.now() - 20 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const notices = evaluateInAppNotices(true, 10, oldDate);
      expect(notices.some((n) => n.id === "backup-due")).toBe(true);
    });
  });
});
