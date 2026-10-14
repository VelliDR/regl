#!/usr/bin/env vite-node
/**
 * Period Calendar (.pc / .bak) to Regl PWA Backup Converter (CLI)
 * ===============================================================
 * Converts Period Calendar backup files into regl-backup-v1 JSON payloads.
 *
 * Usage:
 *   npx vite-node scripts/convert_pc_backup.ts [input.pc|bak] [output.json]
 *   npm run convert:pc [input.pc|bak] [output.json]
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { convertPeriodCalendarToRegl } from "../src/data/periodCalendarMigration";

async function main() {
  const args = process.argv.slice(2);
  const inputPath = args[0] || "yedek.pc";
  const outputPath = args[1] || "regl-yedek.json";

  const resolvedInput = path.resolve(process.cwd(), inputPath);
  const resolvedOutput = path.resolve(process.cwd(), outputPath);

  if (!fs.existsSync(resolvedInput)) {
    console.error(`❌ Hata: Girdi dosyası bulunamadı: ${resolvedInput}`);
    process.exit(1);
  }

  console.log(`⏳ Dosya okunuyor: ${resolvedInput}`);
  const fileBuffer = fs.readFileSync(resolvedInput);
  const rawBytes = new Uint8Array(fileBuffer);

  try {
    const start = performance.now();
    const payload = await convertPeriodCalendarToRegl(rawBytes);
    const duration = (performance.now() - start).toFixed(1);

    const jsonString = JSON.stringify(payload, null, 2);
    fs.writeFileSync(resolvedOutput, jsonString, "utf-8");

    console.log(
      `✅ Başarılı (${duration} ms): ${payload.days.length} gün (varsayılan döngü: ${payload.settings?.defaultCycleLength ?? 28} gün) dönüştürüldü -> ${resolvedOutput}`,
    );
  } catch (err) {
    console.error(
      `❌ Dönüştürme hatası: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}

void main();
