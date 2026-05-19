#!/usr/bin/env python3
"""
FIT file parser — prints a structured summary and exports record data to CSV.

Usage:
    python3 fit_parser.py <file.fit> [--csv] [--json] [--all]

Options:
    --csv    Export records (GPS track points) to <file>.csv
    --json   Export all known messages to <file>.json
    --all    Print every message including unknown types
"""

import sys
import json
import csv
import argparse
from datetime import datetime, timezone
from collections import defaultdict
from pathlib import Path
import fitparse


# ─── helpers ──────────────────────────────────────────────────────────────────

def semicircles_to_degrees(value):
    if value is None:
        return None
    return round(value * (180 / 2**31), 7)

def mps_to_pace(mps):
    """Return pace as mm:ss/km string."""
    if not mps or mps <= 0:
        return "—"
    pace_sec = 1000 / mps
    return f"{int(pace_sec // 60)}:{int(pace_sec % 60):02d}/km"

def mps_to_kph(mps):
    if mps is None:
        return None
    return round(mps * 3.6, 2)

def fmt_duration(seconds):
    if seconds is None:
        return "—"
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"

def msg_to_dict(msg):
    d = {}
    for field in msg.fields:
        d[field.name] = field.value
    return d

def print_table(rows, headers):
    widths = [len(h) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            widths[i] = max(widths[i], len(str(cell)))
    fmt = "  ".join(f"{{:<{w}}}" for w in widths)
    print(fmt.format(*headers))
    print("  ".join("─" * w for w in widths))
    for row in rows:
        print(fmt.format(*[str(c) for c in row]))


# ─── section printers ─────────────────────────────────────────────────────────

def print_file_id(msgs):
    if not msgs:
        return
    d = msg_to_dict(msgs[0])
    print("═" * 60)
    print("  FILE INFO")
    print("═" * 60)
    for k, v in d.items():
        if v is not None and not k.startswith("unknown"):
            print(f"  {k:<30} {v}")
    print()

def print_activity(msgs):
    if not msgs:
        return
    d = msg_to_dict(msgs[0])
    print("═" * 60)
    print("  ACTIVITY SUMMARY")
    print("═" * 60)
    for k, v in d.items():
        if v is not None and not k.startswith("unknown"):
            print(f"  {k:<30} {v}")
    print()

def print_session(msgs):
    if not msgs:
        return
    d = msg_to_dict(msgs[0])
    print("═" * 60)
    print("  SESSION")
    print("═" * 60)
    lat = semicircles_to_degrees(d.get("start_position_lat"))
    lon = semicircles_to_degrees(d.get("start_position_long"))
    distance_km = (d.get("total_distance") or 0) / 1000
    elapsed = d.get("total_elapsed_time")
    timer   = d.get("total_timer_time")
    avg_spd = d.get("avg_speed")
    max_spd = d.get("max_speed")
    avg_hr  = d.get("avg_heart_rate")
    max_hr  = d.get("max_heart_rate")
    avg_pwr = d.get("avg_power")
    max_pwr = d.get("max_power")
    norm_pwr = d.get("normalized_power")
    calories = d.get("total_calories")
    asc      = d.get("total_ascent")
    desc_val = d.get("total_descent")
    sport    = d.get("sport")
    sub      = d.get("sub_sport")

    rows = [
        ("Sport",               f"{sport} / {sub}" if sub else sport),
        ("Start time",          d.get("start_time")),
        ("Start position",      f"{lat}, {lon}" if lat else "—"),
        ("Total distance",      f"{distance_km:.2f} km"),
        ("Elapsed time",        fmt_duration(elapsed)),
        ("Timer time",          fmt_duration(timer)),
        ("Avg pace",            mps_to_pace(avg_spd)),
        ("Avg speed",           f"{mps_to_kph(avg_spd)} km/h" if avg_spd else "—"),
        ("Max speed",           f"{mps_to_kph(max_spd)} km/h" if max_spd else "—"),
        ("Avg heart rate",      f"{avg_hr} bpm" if avg_hr else "—"),
        ("Max heart rate",      f"{max_hr} bpm" if max_hr else "—"),
        ("Avg power",           f"{avg_pwr} W" if avg_pwr else "—"),
        ("Max power",           f"{max_pwr} W" if max_pwr else "—"),
        ("Normalized power",    f"{norm_pwr} W" if norm_pwr else "—"),
        ("Total calories",      f"{calories} kcal" if calories else "—"),
        ("Total ascent",        f"{asc} m" if asc else "—"),
        ("Total descent",       f"{desc_val} m" if desc_val else "—"),
    ]
    for label, value in rows:
        print(f"  {label:<26} {value}")
    print()

def print_laps(msgs):
    if not msgs:
        return
    print("═" * 60)
    print("  LAPS")
    print("═" * 60)
    headers = ["#", "Time", "Distance", "Avg Pace", "Avg HR", "Avg Pwr", "Ascent"]
    rows = []
    for i, msg in enumerate(msgs, 1):
        d = msg_to_dict(msg)
        dist_km  = (d.get("total_distance") or 0) / 1000
        elapsed  = d.get("total_elapsed_time")
        avg_spd  = d.get("avg_speed")
        avg_hr   = d.get("avg_heart_rate")
        avg_pwr  = d.get("avg_power")
        asc      = d.get("total_ascent")
        rows.append([
            i,
            fmt_duration(elapsed),
            f"{dist_km:.2f} km",
            mps_to_pace(avg_spd),
            f"{avg_hr} bpm" if avg_hr else "—",
            f"{avg_pwr} W"  if avg_pwr else "—",
            f"{asc} m"      if asc else "—",
        ])
    print_table(rows, headers)
    print()

def print_devices(msgs):
    if not msgs:
        return
    print("═" * 60)
    print("  DEVICES")
    print("═" * 60)
    seen = set()
    for msg in msgs:
        d = msg_to_dict(msg)
        product = d.get("garmin_product") or d.get("product") or "—"
        mfr     = d.get("manufacturer") or "—"
        sw      = d.get("software_version") or "—"
        key     = (str(mfr), str(product), str(sw))
        if key not in seen:
            seen.add(key)
            print(f"  manufacturer={mfr}  product={product}  sw={sw}")
    print()

def print_sport_zones(msgs_sport, msgs_zones):
    sport_d  = msg_to_dict(msgs_sport[0])  if msgs_sport  else {}
    zones_d  = msg_to_dict(msgs_zones[0])  if msgs_zones  else {}
    if not sport_d and not zones_d:
        return
    print("═" * 60)
    print("  SPORT & ZONES")
    print("═" * 60)
    for k in ("sport", "sub_sport", "name"):
        v = sport_d.get(k)
        if v:
            print(f"  {k:<26} {v}")
    for k in ("max_heart_rate", "threshold_heart_rate", "functional_threshold_power", "hr_calc_type", "pwr_calc_type"):
        v = zones_d.get(k)
        if v:
            print(f"  {k:<26} {v}")
    print()

def print_workout(msgs_wkt, msgs_steps):
    if not msgs_wkt:
        return
    d = msg_to_dict(msgs_wkt[0])
    print("═" * 60)
    print("  WORKOUT")
    print("═" * 60)
    print(f"  Name:   {d.get('wkt_name', '—')}")
    print(f"  Sport:  {d.get('sport', '—')}")
    print(f"  Steps:  {d.get('num_valid_steps', 0)}")
    for i, msg in enumerate(msgs_steps, 1):
        sd = msg_to_dict(msg)
        dur   = sd.get("duration_distance") or sd.get("duration_type")
        tgt   = sd.get("target_type")
        hr_lo = sd.get("custom_target_heart_rate_low")
        hr_hi = sd.get("custom_target_heart_rate_high")
        print(f"  Step {i}: duration={dur}  target={tgt}  HR={hr_lo}–{hr_hi}")
    print()

def print_records_sample(records, n=5):
    print("═" * 60)
    print(f"  TRACK RECORDS  (first {n} of {len(records)})")
    print("═" * 60)
    headers = ["timestamp", "lat", "lon", "dist_km", "speed_kph", "alt_m", "hr", "power", "cadence"]
    rows = []
    for r in records[:n]:
        rows.append([
            r.get("timestamp", "—"),
            r.get("lat", "—"),
            r.get("lon", "—"),
            r.get("dist_km", "—"),
            r.get("speed_kph", "—"),
            r.get("altitude_m", "—"),
            r.get("heart_rate", "—"),
            r.get("power", "—"),
            r.get("cadence", "—"),
        ])
    print_table(rows, headers)
    print(f"  … use --csv to export all {len(records)} records")
    print()


# ─── data extraction ──────────────────────────────────────────────────────────

def extract_records(raw_msgs):
    out = []
    for msg in raw_msgs:
        d = msg_to_dict(msg)
        speed_raw = d.get("enhanced_speed") or d.get("speed")
        alt_raw   = d.get("enhanced_altitude") or d.get("altitude")
        out.append({
            "timestamp":   d.get("timestamp"),
            "lat":         semicircles_to_degrees(d.get("position_lat")),
            "lon":         semicircles_to_degrees(d.get("position_long")),
            "dist_km":     round(d["distance"] / 1000, 3) if d.get("distance") is not None else None,
            "speed_kph":   mps_to_kph(speed_raw),
            "altitude_m":  round(alt_raw, 1) if alt_raw is not None else None,
            "heart_rate":  d.get("heart_rate"),
            "cadence":     d.get("cadence"),
            "power":       d.get("power"),
            "temperature": d.get("temperature"),
        })
    return out

def write_csv(records, path):
    if not records:
        return
    fieldnames = list(records[0].keys())
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(records)
    print(f"  Exported {len(records)} records → {path}")

def write_json(messages_by_type, path):
    out = {}
    for mtype, msgs in messages_by_type.items():
        if mtype.startswith("unknown"):
            continue
        serializable = []
        for d in msgs:
            sd = {}
            for k, v in d.items():
                if k.startswith("unknown"):
                    continue
                if isinstance(v, datetime):
                    sd[k] = v.isoformat()
                else:
                    sd[k] = v
            serializable.append(sd)
        if serializable:
            out[mtype] = serializable
    with open(path, "w") as f:
        json.dump(out, f, indent=2, default=str)
    print(f"  Exported JSON → {path}")


# ─── file picker ──────────────────────────────────────────────────────────────

# Where to look for .fit files when the user runs `python3 fit_parser.py` with
# no path argument. Project-local `garmin_fit/` first (matches `import_fit.py`),
# then the conventional Downloads locations.
_SCRIPT_DIR = Path(__file__).resolve().parent
SEARCH_DIRS = [
    _SCRIPT_DIR / "garmin_fit",
    Path.home() / "Downloads" / "garmin_fit",
    Path.home() / "Downloads",
]

def pick_fit_file():
    files = []
    for d in SEARCH_DIRS:
        if d.exists():
            files.extend(sorted(d.glob("*.fit"), key=lambda f: f.stat().st_mtime, reverse=True))

    if not files:
        searched = "\n  ".join(str(d) for d in SEARCH_DIRS)
        print(f"No .fit files found. Searched:\n  {searched}")
        path = input("Enter full path to a .fit file: ").strip()
        return path

    print("Select a FIT file to parse:")
    print("─" * 50)
    for i, f in enumerate(files, 1):
        size_kb = f.stat().st_size / 1024
        mtime   = datetime.fromtimestamp(f.stat().st_mtime).strftime("%Y-%m-%d")
        print(f"  {i:>3}.  {f.name:<40}  {size_kb:6.0f} KB  {mtime}")
    print()

    while True:
        raw = input(f"Enter number (1–{len(files)}): ").strip()
        if raw.isdigit() and 1 <= int(raw) <= len(files):
            return str(files[int(raw) - 1])
        print("  Invalid choice, try again.")


# ─── main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="FIT file parser")
    parser.add_argument("fit_file", nargs="?", help="Path to .fit file (optional — will prompt if omitted)")
    parser.add_argument("--csv",  action="store_true", help="Export records to CSV")
    parser.add_argument("--json", action="store_true", help="Export known messages to JSON")
    parser.add_argument("--all",  action="store_true", help="Print all message types (including unknown)")
    args = parser.parse_args()

    fit_file = args.fit_file or pick_fit_file()
    print()

    fit = fitparse.FitFile(fit_file)

    by_type = defaultdict(list)
    for msg in fit.get_messages():
        by_type[msg.name].append(msg_to_dict(msg))

    raw_msgs_by_type = defaultdict(list)
    fit2 = fitparse.FitFile(fit_file)
    for msg in fit2.get_messages():
        raw_msgs_by_type[msg.name].append(msg)

    # Print sections
    print_file_id(raw_msgs_by_type.get("file_id", []))
    print_activity(raw_msgs_by_type.get("activity", []))
    print_session(raw_msgs_by_type.get("session", []))
    print_laps(raw_msgs_by_type.get("lap", []))
    print_devices(raw_msgs_by_type.get("device_info", []))
    print_sport_zones(raw_msgs_by_type.get("sport", []), raw_msgs_by_type.get("zones_target", []))
    print_workout(raw_msgs_by_type.get("workout", []), raw_msgs_by_type.get("workout_step", []))

    records = extract_records(raw_msgs_by_type.get("record", []))
    print_records_sample(records)

    if args.all:
        print("═" * 60)
        print("  ALL MESSAGE TYPE COUNTS")
        print("═" * 60)
        for k in sorted(by_type):
            print(f"  {k:<30} {len(by_type[k])} messages")
        print()

    base = fit_file.rsplit(".", 1)[0]
    if args.csv:
        write_csv(records, base + ".csv")
    if args.json:
        write_json(by_type, base + ".json")


if __name__ == "__main__":
    main()
