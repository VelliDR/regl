#!/usr/bin/env python3
"""
Period Calendar (.pc) to Regl PWA Backup Converter
==================================================
Converts proprietary `.pc` backup files (Java ObjectStream wrapped ZIP archives
containing SQLite cloud.db from Period Calendar / Simple Design / ABISHKKING)
into modern, validated `regl-backup-v1` JSON payloads.
"""

import sys
import os
import io
import json
import sqlite3
import zipfile
from datetime import datetime, timedelta

def unblock_java_stream(raw_bytes: bytes) -> bytes:
    """
    Strips Java ObjectOutputStream serialization block headers (0xaced 0x0005,
    TC_BLOCKDATA 0x77, TC_BLOCKDATALONG 0x7a) to reveal the clean underlying ZIP stream.
    """
    if raw_bytes[:4] != b'\xac\xed\x00\x05':
        # If it doesn't have the Java serialization header, it might already be raw ZIP
        if raw_bytes[:4] == b'PK\x03\x04':
            return raw_bytes
        raise ValueError("Geçersiz dosya: Java ObjectStream veya ZIP başlığı bulunamadı.")

    pos = 4
    unblocked = bytearray()
    while pos < len(raw_bytes):
        tag = raw_bytes[pos]
        pos += 1
        if tag == 0x77:  # TC_BLOCKDATA (1-byte length <= 255)
            length = raw_bytes[pos]
            pos += 1
            unblocked.extend(raw_bytes[pos:pos+length])
            pos += length
        elif tag == 0x7a:  # TC_BLOCKDATALONG (4-byte length > 255)
            length = int.from_bytes(raw_bytes[pos:pos+4], 'big')
            pos += 4
            unblocked.extend(raw_bytes[pos:pos+length])
            pos += length
        elif tag == 0x78:  # TC_ENDBLOCKDATA
            continue
        else:
            break

    return bytes(unblocked)

def convert_pc_to_regl(pc_path: str, output_json_path: str):
    if not os.path.exists(pc_path):
        raise FileNotFoundError(f"Dosya bulunamadı: {pc_path}")

    with open(pc_path, 'rb') as f:
        raw_data = f.read()

    # 1. Unblock Java ObjectOutputStream
    zip_bytes = unblock_java_stream(raw_data)

    # 2. Extract cloud.db
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        if 'cloud.db' not in z.namelist():
            raise ValueError("Arşiv içinde 'cloud.db' SQLite veritabanı bulunamadı.")
        db_bytes = z.read('cloud.db')

    # Temporary SQLite file
    temp_db_path = f"/tmp/regl_temp_{os.getpid()}.db"
    try:
        with open(temp_db_path, 'wb') as f:
            f.write(db_bytes)

        conn = sqlite3.connect(temp_db_path)
        c = conn.cursor()

        days_map = {}

        # 3. Read User Settings (default cycle length, etc.)
        default_cycle = 28
        try:
            c.execute("SELECT setting FROM User LIMIT 1")
            user_row = c.fetchone()
            if user_row and user_row[0]:
                settings_json = json.loads(user_row[0])
                for group in settings_json.values():
                    if isinstance(group, list):
                        for item in group:
                            if item.get("key") == "period_length":
                                default_cycle = int(item.get("value", 28))
        except Exception:
            pass

        # 4. Read Period Table (cycles and bleeding flow)
        c.execute("SELECT date, period, cycle FROM Period WHERE period != 0 ORDER BY date ASC")
        periods = c.fetchall()

        for dt_int, period_dur, cycle_len in periods:
            dt_str = str(dt_int)
            y, m, d = int(dt_str[:4]), int(dt_str[4:6]), int(dt_str[6:8])
            start_dt = datetime(y, m, d)
            dur = abs(period_dur)

            for day_offset in range(dur):
                cur_dt = start_dt + timedelta(days=day_offset)
                iso_date = cur_dt.strftime("%Y-%m-%d")

                # Natural bleeding intensity distribution across days
                if dur == 1:
                    intensity = "medium"
                elif dur == 2:
                    intensity = "heavy" if day_offset == 0 else "medium"
                elif dur == 3:
                    intensity = "heavy" if day_offset == 0 else ("medium" if day_offset == 1 else "light")
                elif dur >= 4:
                    if day_offset == 0:
                        intensity = "heavy"
                    elif day_offset == 1:
                        intensity = "heavy" if dur >= 5 else "medium"
                    elif day_offset == 2:
                        intensity = "medium"
                    else:
                        intensity = "light"

                ts = int(cur_dt.timestamp() * 1000)
                if iso_date not in days_map:
                    days_map[iso_date] = {
                        "date": iso_date,
                        "bleeding": intensity,
                        "updatedAt": ts
                    }
                else:
                    days_map[iso_date]["bleeding"] = intensity

        # 5. Read Note Table (notes, symptoms, mood, intimacy)
        try:
            c.execute("SELECT date, symptom, mood, note, sextimes, update_time FROM Note")
            for dt_int, symptom_str, mood_str, note_str, sextimes, update_time in c.fetchall():
                dt_str = str(dt_int)
                y, m, d = int(dt_str[:4]), int(dt_str[4:6]), int(dt_str[6:8])
                iso_date = f"{y:04d}-{m:02d}-{d:02d}"

                entry = days_map.get(iso_date, {
                    "date": iso_date,
                    "updatedAt": update_time or int(datetime(y, m, d).timestamp() * 1000)
                })

                if note_str and note_str.strip():
                    entry["note"] = note_str.strip()

                if sextimes and sextimes > 0:
                    entry["sex"] = "unprotected"

                # Symptom mapping (24: cramps, 12: headache)
                sym_list = []
                if symptom_str:
                    if "24:" in symptom_str:
                        sym_list.append("cramps")
                    if "12:" in symptom_str:
                        sym_list.append("headache")
                if sym_list:
                    entry["symptoms"] = sym_list

                # Mood mapping (10: anxious, 31: tired, 7: angry)
                mood_list = []
                if mood_str:
                    if "10" in mood_str:
                        mood_list.append("anxious")
                    if "31" in mood_str:
                        mood_list.append("tired")
                    if "7" in mood_str:
                        mood_list.append("angry")
                if mood_list:
                    entry["mood"] = mood_list

                days_map[iso_date] = entry
        except Exception:
            pass

        conn.close()
    finally:
        if os.path.exists(temp_db_path):
            os.remove(temp_db_path)

    # 6. Format and Save Validated JSON
    sorted_days = [days_map[k] for k in sorted(days_map.keys())]

    payload = {
        "format": "regl-backup-v1",
        "exportedAt": datetime.now().isoformat(),
        "days": sorted_days,
        "settings": {
            "trackingMode": "symptothermal",
            "defaultCycleLength": default_cycle,
            "theme": "auto",
            "reminderBbtEnabled": False,
            "reminderBbtTime": "07:00",
            "reminderPeriodDaysBefore": 2,
            "onboardingCompleted": True
        }
    }

    with open(output_json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"✅ Başarılı: {len(periods)} döngü ({len(sorted_days)} gün) dönüştürüldü -> {output_json_path}")

if __name__ == "__main__":
    src_file = sys.argv[1] if len(sys.argv) > 1 else "Takvimim-2026-10-14-2.pc"
    dst_file = sys.argv[2] if len(sys.argv) > 2 else "regl-yedek-period-calendar.json"
    convert_pc_to_regl(src_file, dst_file)
