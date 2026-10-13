import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { CentiCelsius, ISODate } from "../../src/core/types";

describe("Faz 0: Ortam ve Test Altyapısı Doğrulaması", () => {
  it("Vitest başarıyla çalışıyor olmalıdır", () => {
    expect(true).toBe(true);
  });

  it("fast-check property-based test altyapısı çalışmalıdır", () => {
    fc.assert(
      fc.property(fc.integer({ min: 3500, max: 4000 }), (temp) => {
        const centiC = temp as CentiCelsius;
        return centiC >= 3500 && centiC <= 4000;
      }),
    );
  });

  it("Markalı ISODate ve CentiCelsius tipleri doğru eşleşmelidir", () => {
    const dateStr = "2026-10-13" as ISODate;
    const tempVal = 3665 as CentiCelsius; // 36.65 °C

    expect(dateStr).toBe("2026-10-13");
    expect(tempVal / 100).toBe(36.65);
  });
});
