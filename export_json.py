#!/usr/bin/env python3
"""
Sync runs.json / cycles.json with training.db.

Two modes (auto-detected):

  1. PATCH MODE (default when runs.json + cycles.json already exist):
     Walks each existing JSON record, finds the matching DB row by
     (date ±1 day, activity_type, distance ±0.15 mi, duration ±30 s), and
     adds/updates the `garmin_id` field. Every other field is left alone, so
     curated titles, local-time dates, and any hand-tweaked values survive.
     New activities present only in the DB are appended at the end.

  2. COLD-START MODE (used when a JSON file is missing):
     Generates the file from scratch using DB values. Titles and datetimes
     are taken straight from the DB (which means auto-generated titles like
     "Running 2026-05-16" and UTC datetimes — you may want to curate after).

Either way: every record in the output has a non-null `garmin_id`. The frontend
uses that as the primary key for DB-backed activity lookups.

Usage:  python3 export_json.py [--db training.db] [--out .]
"""
import argparse
import json
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path


# ── Helpers ─────────────────────────────────────────────────────────────────

def fmt_duration(secs):
    if not secs: return '00:00:00'
    s = int(round(secs)); h, rem = divmod(s, 3600); m, s = divmod(rem, 60)
    return f'{h:02d}:{m:02d}:{s:02d}'


def fmt_datetime(dt):
    if not dt: return ''
    return dt.replace('T', ' ').split('.')[0]


def parse_hms(s):
    try:
        h, m, sec = s.split(':')
        return int(h)*3600 + int(m)*60 + int(sec)
    except Exception:
        return 0


# ── DB → JSON row construction (cold-start mode) ────────────────────────────

def db_row_to_run(r):
    return {
        'garmin_id':    r['garmin_activity_id'],
        'Date':         fmt_datetime(r['activity_datetime']),
        'Title':        r['title'] or '',
        'Distance':     round(r['distance_mi'], 2) if r['distance_mi'] is not None else 0,
        'Time':         fmt_duration(r['duration_sec']),
        'ActivityType': r['activity_type'],
        'pace_sec':     r['pace_sec'] or 0,
        'hr':           r['avg_hr'] or 0,
        'max_hr':       r['max_hr'] or 0,
        'cadence':      r['cadence_spm'] or 0,
        'left_pct':     r['left_gct_pct'],
        'vo':           round(r['vert_osc_cm'], 1) if r['vert_osc_cm'] is not None else 0.0,
        'gct':          int(round(r['gct_ms'])) if r['gct_ms'] is not None else 0,
        'stride_len':   round(r['stride_len_m'], 2) if r['stride_len_m'] is not None else 0.0,
        'vert_ratio':   round(r['vert_ratio_pct'], 1) if r['vert_ratio_pct'] is not None else 0.0,
        'ascent':       str(int(round(r['ascent_ft']))) if r['ascent_ft'] is not None else '0',
        'calories':     r['calories'] or 0,
        'aerobic_te':   round(r['aerobic_te'], 1) if r['aerobic_te'] is not None else 0.0,
        'is_race':      bool(r['is_race']),
    }


def db_row_to_cycle(r):
    return {
        'garmin_id':    r['garmin_activity_id'],
        'Date':         fmt_datetime(r['activity_datetime']),
        'Title':        r['title'] or '',
        'Distance':     round(r['distance_mi'], 2) if r['distance_mi'] is not None else 0,
        'Time':         fmt_duration(r['duration_sec']),
        'ActivityType': r['activity_type'],
        'avg_speed':    round(r['avg_speed_mph'], 1) if r['avg_speed_mph'] is not None else 0.0,
        'max_speed':    round(r['max_speed_mph'], 1) if r['max_speed_mph'] is not None else 0.0,
        'hr':           r['avg_hr'] or 0,
        'max_hr':       r['max_hr'] or 0,
        'cadence':      r['cadence_rpm'] or 0,
        'avg_power':    r['avg_power_w'] or 0,
        'max_power':    r['max_power_w'] or 0,
        'ascent':       str(int(round(r['ascent_ft']))) if r['ascent_ft'] is not None else '0',
        'calories':     r['calories'] or 0,
        'aerobic_te':   round(r['aerobic_te'], 1) if r['aerobic_te'] is not None else 0.0,
        'is_race':      bool(r['is_race']),
    }


# ── Matching JSON rows to DB rows (patch mode) ──────────────────────────────

def build_db_index(rows):
    """Bucket DB rows by activity_date → list of rows for fast lookup."""
    out = {}
    for r in rows:
        out.setdefault(r['activity_date'], []).append(r)
    return out


def find_db_match(json_row, db_index, accept_types):
    json_date = (json_row.get('Date') or '')[:10]
    json_dist = float(json_row.get('Distance') or 0)
    json_dur  = parse_hms(json_row.get('Time') or '00:00:00')
    if not json_date:
        return None
    base = datetime.strptime(json_date, '%Y-%m-%d')
    candidate_dates = [json_date] + [(base + timedelta(days=d)).strftime('%Y-%m-%d') for d in (-1, 1)]

    best, best_score = None, 1e9
    for cd in candidate_dates:
        for r in db_index.get(cd, []):
            if r['activity_type'] not in accept_types:
                continue
            ddist = abs((r['distance_mi'] or 0) - json_dist)
            ddur  = abs((r['duration_sec'] or 0) - json_dur)
            if ddist > 0.15 or ddur > 30:
                continue
            score = ddist*100 + ddur/10
            if score < best_score:
                best, best_score = r, score
    return best


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    p.add_argument('--db',  default='training.db')
    p.add_argument('--out', default='.')
    args = p.parse_args()

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row

    out = Path(args.out)

    for fname, type_filter, accept_types, db_to_row_fn in [
        ('runs.json',   "activity_type = 'Running'",
         {'Running'}, db_row_to_run),
        ('cycles.json', "activity_type LIKE '%Cycling%'",
         {'Road Cycling', 'Virtual Cycling', 'Indoor Cycling'}, db_row_to_cycle),
    ]:
        path = out / fname
        db_rows = list(conn.execute(f"""
            SELECT garmin_activity_id, activity_date, activity_datetime, title,
                   activity_type, distance_mi, duration_sec, pace_sec,
                   avg_hr, max_hr, cadence_spm, cadence_rpm,
                   left_gct_pct, vert_osc_cm, gct_ms, stride_len_m, vert_ratio_pct,
                   ascent_ft, calories, aerobic_te, is_race,
                   avg_speed_mph, max_speed_mph, avg_power_w, max_power_w
            FROM activities
            WHERE {type_filter}
            ORDER BY activity_datetime ASC
        """))
        db_index = build_db_index(db_rows)
        db_by_gid = {r['garmin_activity_id']: r for r in db_rows
                     if r['garmin_activity_id'] is not None}

        if path.exists():
            # PATCH MODE
            existing = json.loads(path.read_text())
            patched, unmatched = 0, 0
            seen_gids = set()
            for row in existing:
                m = find_db_match(row, db_index, accept_types)
                if m:
                    row['garmin_id'] = m['garmin_activity_id']
                    seen_gids.add(m['garmin_activity_id'])
                    patched += 1
                else:
                    row.setdefault('garmin_id', None)
                    unmatched += 1
            # Append any DB activities the JSON didn't already have
            added = 0
            for r in db_rows:
                gid = r['garmin_activity_id']
                if gid is None or gid in seen_gids:
                    continue
                existing.append(db_to_row_fn(r))
                added += 1
            existing.sort(key=lambda x: x.get('Date') or '')
            path.write_text(json.dumps(existing, indent=2))
            print(f'{fname:12s}  PATCH  {patched} patched, {unmatched} unmatched, {added} appended  '
                  f'→ {len(existing)} total')
        else:
            # COLD-START MODE
            rows = [db_to_row_fn(r) for r in db_rows]
            path.write_text(json.dumps(rows, indent=2))
            print(f'{fname:12s}  COLD   {len(rows)} written (titles + dates from DB)')


if __name__ == '__main__':
    main()
