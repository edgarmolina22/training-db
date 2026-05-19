#!/usr/bin/env python3
"""
Edgar Molina Training Hub — Database Schema
============================================
Creates the SQLite database capturing 100% of fields from Garmin FIT files
for both Running and Cycling activities.

Usage:
    python create_db.py                              # creates training.db here
    python create_db.py --db ~/training/training.db  # custom path
    python create_db.py --reset                      # drop and recreate all tables

Tables (11):
    activities      — session summary (shared + run-specific + cycle-specific)
    laps            — per-mile/lap splits
    records         — per-second GPS/HR/power/form stream
    stream_summary  — derived analytics (HR zones, power curve, form drift)
    hrv             — beat-to-beat RR intervals (cycling)
    events          — HR alerts, gear shifts, timer pauses, recovery HR
    workout_steps   — structured workout step definitions
    device_info     — connected sensors, firmware, battery
    device_settings — watch configuration snapshot
    user_profile    — athlete profile snapshot
    file_meta       — file identity and creation metadata
"""

import argparse
import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS activities (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    fit_file            TEXT,
    garmin_activity_id  INTEGER UNIQUE,
    activity_date       TEXT NOT NULL,
    activity_datetime   TEXT,
    title               TEXT,
    activity_type       TEXT NOT NULL,
    sport               TEXT,
    sub_sport           TEXT,
    is_race             INTEGER DEFAULT 0,
    distance_mi         REAL,
    duration_sec        REAL,
    elapsed_sec         REAL,
    num_laps            INTEGER,
    pace_sec            INTEGER,
    max_pace_sec        INTEGER,
    total_strides       INTEGER,
    cadence_spm         INTEGER,
    max_cadence_spm     INTEGER,
    gct_ms              REAL,
    gct_stance_pct      REAL,
    left_gct_pct        REAL,
    vert_osc_cm         REAL,
    vert_ratio_pct      REAL,
    stride_len_m        REAL,
    avg_speed_mph       REAL,
    max_speed_mph       REAL,
    cadence_rpm         INTEGER,
    max_cadence_rpm     INTEGER,
    left_right_balance  INTEGER,
    total_cycles        INTEGER,
    avg_vam             REAL,
    avg_power_w         INTEGER,
    max_power_w         INTEGER,
    norm_power_w        INTEGER,
    total_work_kj       REAL,
    avg_hr              INTEGER,
    max_hr              INTEGER,
    min_hr              INTEGER,
    ascent_ft           REAL,
    descent_ft          REAL,
    avg_altitude_ft     REAL,
    max_altitude_ft     REAL,
    min_altitude_ft     REAL,
    start_lat           REAL,
    start_lon           REAL,
    nec_lat             REAL,
    nec_lon             REAL,
    swc_lat             REAL,
    swc_lon             REAL,
    avg_temp_c          INTEGER,
    max_temp_c          INTEGER,
    aerobic_te          REAL,
    anaerobic_te        REAL,
    calories            INTEGER,
    training_stress_score REAL,
    intensity_factor    REAL,
    threshold_power_w   INTEGER,
    athlete_name        TEXT,
    weight_kg           REAL,
    height_m            REAL,
    age                 INTEGER,
    gender              TEXT,
    resting_hr          INTEGER,
    default_max_hr      INTEGER,
    default_max_bike_hr INTEGER,
    max_hr_zones        INTEGER,
    threshold_hr        INTEGER,
    ftp_w               INTEGER,
    source              TEXT DEFAULT 'fit',
    imported_at         TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS laps (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id         INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    lap_number          INTEGER NOT NULL,
    lap_trigger         TEXT,
    intensity           TEXT,
    wkt_step_index      INTEGER,
    distance_mi         REAL,
    duration_sec        REAL,
    elapsed_sec         REAL,
    total_strides       INTEGER,
    total_cycles        INTEGER,
    pace_sec            INTEGER,
    max_pace_sec        INTEGER,
    speed_mph           REAL,
    max_speed_mph       REAL,
    avg_hr              INTEGER,
    max_hr              INTEGER,
    cadence_spm         INTEGER,
    max_cadence_spm     INTEGER,
    gct_ms              REAL,
    gct_stance_pct      REAL,
    left_gct_pct        REAL,
    vert_osc_cm         REAL,
    vert_ratio_pct      REAL,
    stride_len_m        REAL,
    cadence_rpm         INTEGER,
    max_cadence_rpm     INTEGER,
    left_right_balance  INTEGER,
    avg_power_w         INTEGER,
    max_power_w         INTEGER,
    norm_power_w        INTEGER,
    total_work_j        INTEGER,
    ascent_ft           REAL,
    descent_ft          REAL,
    max_altitude_ft     REAL,
    min_altitude_ft     REAL,
    start_lat           REAL,
    start_lon           REAL,
    end_lat             REAL,
    end_lon             REAL,
    calories            INTEGER,
    avg_vam             REAL,
    avg_temp_c          INTEGER,
    max_temp_c          INTEGER
);

CREATE TABLE IF NOT EXISTS records (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id         INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    timestamp           TEXT NOT NULL,
    elapsed_sec         REAL,
    lat                 REAL,
    lon                 REAL,
    altitude_ft         REAL,
    distance_mi         REAL,
    speed_mph           REAL,
    pace_sec            INTEGER,
    heart_rate          INTEGER,
    activity_type       TEXT,
    power_w             INTEGER,
    accumulated_power_w INTEGER,
    cadence             INTEGER,
    gct_ms              REAL,
    left_gct_pct        REAL,
    gct_stance_pct      REAL,
    vert_osc_cm         REAL,
    vert_ratio_pct      REAL,
    stride_len_m        REAL,
    left_right_balance  INTEGER,
    temp_c              INTEGER
);

CREATE TABLE IF NOT EXISTS stream_summary (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id         INTEGER NOT NULL UNIQUE REFERENCES activities(id) ON DELETE CASCADE,
    z1_sec              INTEGER DEFAULT 0,
    z2_sec              INTEGER DEFAULT 0,
    z3_sec              INTEGER DEFAULT 0,
    z4_sec              INTEGER DEFAULT 0,
    z5_sec              INTEGER DEFAULT 0,
    power_1s            INTEGER,
    power_5s            INTEGER,
    power_10s           INTEGER,
    power_30s           INTEGER,
    power_60s           INTEGER,
    power_300s          INTEGER,
    power_600s          INTEGER,
    power_1200s         INTEGER,
    first_hr            REAL,
    first_gct_ms        REAL,
    first_left_pct      REAL,
    first_vert_osc      REAL,
    first_power_w       REAL,
    last_hr             REAL,
    last_gct_ms         REAL,
    last_left_pct       REAL,
    last_vert_osc       REAL,
    last_power_w        REAL,
    delta_hr            REAL,
    delta_gct_ms        REAL,
    delta_left_pct      REAL,
    delta_vert_osc      REAL,
    delta_power_w       REAL
);

CREATE TABLE IF NOT EXISTS hrv (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id         INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    timestamp           TEXT,
    rr_interval_ms      REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id         INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    timestamp           TEXT,
    event               TEXT,
    event_type          TEXT,
    event_group         INTEGER,
    timer_trigger       TEXT,
    data                INTEGER,
    hr_high_alert       INTEGER,
    front_gear          INTEGER,
    front_gear_num      INTEGER,
    rear_gear           INTEGER,
    rear_gear_num       INTEGER,
    gear_change_data    INTEGER
);

CREATE TABLE IF NOT EXISTS workout_steps (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id         INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    workout_name        TEXT,
    step_index          INTEGER,
    intensity           TEXT,
    duration_type       TEXT,
    duration_distance_m REAL,
    target_type         TEXT,
    target_hr_zone      INTEGER,
    hr_low_bpm          INTEGER,
    hr_high_bpm         INTEGER,
    exercise_category   TEXT,
    exercise_name       TEXT
);

CREATE TABLE IF NOT EXISTS device_info (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id         INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    timestamp           TEXT,
    device_index        TEXT,
    device_type         INTEGER,
    antplus_device_type TEXT,
    manufacturer        TEXT,
    garmin_product      TEXT,
    serial_number       INTEGER,
    software_version    REAL,
    hardware_version    INTEGER,
    battery_status      TEXT,
    battery_voltage     REAL,
    source_type         TEXT,
    ant_network         TEXT,
    cum_operating_time  INTEGER
);

CREATE TABLE IF NOT EXISTS device_settings (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id         INTEGER NOT NULL UNIQUE REFERENCES activities(id) ON DELETE CASCADE,
    active_time_zone    INTEGER,
    utc_offset          INTEGER,
    time_offset         INTEGER,
    time_zone_offset    REAL,
    time_mode           TEXT,
    date_mode           TEXT,
    mounting_side       TEXT,
    backlight_mode      TEXT,
    move_alert_enabled  INTEGER,
    activity_tracker_enabled INTEGER,
    auto_activity_detect INTEGER,
    autosync_min_steps  INTEGER,
    autosync_min_time   INTEGER,
    tap_interface       TEXT,
    lactate_threshold_autodetect_enabled INTEGER
);

CREATE TABLE IF NOT EXISTS user_profile (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id         INTEGER NOT NULL UNIQUE REFERENCES activities(id) ON DELETE CASCADE,
    friendly_name       TEXT,
    gender              TEXT,
    age                 INTEGER,
    height_m            REAL,
    weight_kg           REAL,
    resting_heart_rate  INTEGER,
    default_max_heart_rate INTEGER,
    default_max_biking_heart_rate INTEGER,
    activity_class      INTEGER,
    language            TEXT,
    dist_setting        TEXT,
    speed_setting       TEXT,
    height_setting      TEXT,
    weight_setting      TEXT,
    hr_setting          TEXT,
    temperature_setting TEXT,
    elev_setting        TEXT,
    power_setting       TEXT,
    position_setting    TEXT,
    sleep_time          TEXT,
    wake_time           TEXT,
    user_walking_step_length REAL,
    dive_count          INTEGER,
    depth_setting       TEXT
);

CREATE TABLE IF NOT EXISTS file_meta (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id         INTEGER NOT NULL UNIQUE REFERENCES activities(id) ON DELETE CASCADE,
    manufacturer        TEXT,
    garmin_product      INTEGER,
    serial_number       INTEGER,
    time_created        TEXT,
    file_type           TEXT,
    creator_software_version INTEGER,
    num_sessions        INTEGER,
    local_timestamp     TEXT
);

-- Best efforts: per-activity records of "best <effort_type>" achievements.
-- effort_type examples:
--   Running:  '400m', '800m', '1K', '1mi', '2mi', '5K', '10K', '15K',
--             '10mi', '20K', 'half_marathon', '30K', 'marathon',
--             'longest_run', 'most_elevation', 'biggest_climb',
--             'most_aerobic_te', 'best_cadence_1mi'
--   Cycling:  '5mi', '10K', '10mi', '20K', '30K', '40K',
--             'longest_ride', 'biggest_climb', 'most_elevation_ride',
--             'pwr_1s', 'pwr_5s', 'pwr_10s', 'pwr_30s', 'pwr_60s',
--             'pwr_300s', 'pwr_600s', 'pwr_1200s',
--             'most_tss', 'highest_np'
-- effort_value: lower-is-better for time PRs (unit='sec'); higher-is-better otherwise.
CREATE TABLE IF NOT EXISTS best_efforts (
    activity_id   INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    effort_type   TEXT NOT NULL,
    effort_value  REAL NOT NULL,
    unit          TEXT NOT NULL,
    PRIMARY KEY (activity_id, effort_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_activities_date       ON activities(activity_date);
CREATE INDEX IF NOT EXISTS idx_activities_type       ON activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_activities_date_type  ON activities(activity_date, activity_type);
CREATE INDEX IF NOT EXISTS idx_laps_activity         ON laps(activity_id);
CREATE INDEX IF NOT EXISTS idx_laps_left_pct         ON laps(left_gct_pct);
CREATE INDEX IF NOT EXISTS idx_records_activity      ON records(activity_id);
CREATE INDEX IF NOT EXISTS idx_records_timestamp     ON records(timestamp);
CREATE INDEX IF NOT EXISTS idx_stream_activity       ON stream_summary(activity_id);
CREATE INDEX IF NOT EXISTS idx_hrv_activity          ON hrv(activity_id);
CREATE INDEX IF NOT EXISTS idx_events_activity       ON events(activity_id);
CREATE INDEX IF NOT EXISTS idx_events_type           ON events(event);
CREATE INDEX IF NOT EXISTS idx_workout_steps_activity ON workout_steps(activity_id);
CREATE INDEX IF NOT EXISTS idx_device_info_activity  ON device_info(activity_id);
CREATE INDEX IF NOT EXISTS idx_best_efforts_type     ON best_efforts(effort_type);
CREATE INDEX IF NOT EXISTS idx_best_efforts_activity ON best_efforts(activity_id);

-- Views
CREATE VIEW IF NOT EXISTS v_weekly_mileage AS
SELECT strftime('%Y-W%W', activity_date) AS week, MIN(activity_date) AS week_start,
    activity_type, COUNT(*) AS activities,
    ROUND(SUM(distance_mi),2) AS total_miles, ROUND(AVG(pace_sec)) AS avg_pace_sec,
    ROUND(AVG(avg_hr)) AS avg_hr, ROUND(SUM(calories)) AS total_calories,
    ROUND(SUM(ascent_ft)) AS total_ascent_ft, ROUND(SUM(training_stress_score),1) AS total_tss
FROM activities GROUP BY week, activity_type ORDER BY week DESC;

CREATE VIEW IF NOT EXISTS v_itb_risk_laps AS
SELECT a.activity_date, a.title, l.lap_number, l.left_gct_pct, l.avg_hr, l.pace_sec, l.gct_ms
FROM laps l JOIN activities a ON l.activity_id = a.id
WHERE l.left_gct_pct IS NOT NULL AND l.left_gct_pct < 47.5 ORDER BY a.activity_date DESC;

CREATE VIEW IF NOT EXISTS v_form_trends AS
SELECT strftime('%Y-W%W', activity_date) AS week, MIN(activity_date) AS week_start,
    COUNT(*) AS runs, ROUND(AVG(cadence_spm)) AS avg_cadence,
    ROUND(AVG(gct_ms)) AS avg_gct_ms, ROUND(AVG(left_gct_pct),1) AS avg_left_pct,
    ROUND(AVG(vert_osc_cm),1) AS avg_vert_osc, ROUND(AVG(vert_ratio_pct),1) AS avg_vert_ratio,
    ROUND(AVG(stride_len_m),3) AS avg_stride_len, ROUND(AVG(norm_power_w)) AS avg_norm_power
FROM activities WHERE activity_type='Running' AND cadence_spm > 0
GROUP BY week ORDER BY week DESC;

CREATE VIEW IF NOT EXISTS v_power_curve_prs AS
SELECT a.activity_date AS pr_date, a.title,
    MAX(s.power_1s) AS best_1s_w, MAX(s.power_5s) AS best_5s_w,
    MAX(s.power_10s) AS best_10s_w, MAX(s.power_30s) AS best_30s_w,
    MAX(s.power_60s) AS best_60s_w, MAX(s.power_300s) AS best_5min_w,
    MAX(s.power_600s) AS best_10min_w, MAX(s.power_1200s) AS best_20min_w
FROM stream_summary s JOIN activities a ON s.activity_id = a.id
WHERE a.activity_type = 'Running';

CREATE VIEW IF NOT EXISTS v_pace_trend AS
SELECT activity_date, title, distance_mi, pace_sec, avg_hr,
    ROUND(AVG(pace_sec) OVER (ORDER BY activity_date ROWS BETWEEN 3 PRECEDING AND CURRENT ROW)) AS rolling_4wk_pace_sec
FROM activities WHERE activity_type='Running' AND is_race=0 AND pace_sec IS NOT NULL AND distance_mi>=2
ORDER BY activity_date;

CREATE VIEW IF NOT EXISTS v_hrv_summary AS
SELECT a.activity_date, a.title, a.activity_type,
    COUNT(h.id) AS rr_count, ROUND(AVG(h.rr_interval_ms),1) AS avg_rr_ms,
    ROUND(60000.0/AVG(h.rr_interval_ms),1) AS avg_hr_from_hrv
FROM hrv h JOIN activities a ON h.activity_id = a.id
GROUP BY h.activity_id ORDER BY a.activity_date DESC;

CREATE VIEW IF NOT EXISTS v_event_summary AS
SELECT a.activity_date, a.title, a.activity_type,
    SUM(CASE WHEN e.event='hr_high_alert' AND e.event_type='start' THEN 1 ELSE 0 END) AS hr_alerts,
    SUM(CASE WHEN e.event='rear_gear_change' THEN 1 ELSE 0 END) AS rear_shifts,
    SUM(CASE WHEN e.event='front_gear_change' THEN 1 ELSE 0 END) AS front_shifts,
    MAX(CASE WHEN e.event='recovery_hr' THEN e.data ELSE NULL END) AS recovery_hr_bpm,
    MAX(0, SUM(CASE WHEN e.event='timer' AND e.event_type='stop_all' THEN 1 ELSE 0 END) - 1) AS pauses
FROM events e JOIN activities a ON e.activity_id = a.id
GROUP BY e.activity_id ORDER BY a.activity_date DESC;

CREATE VIEW IF NOT EXISTS v_cycling_load AS
SELECT activity_date, title, distance_mi, duration_sec/60.0 AS duration_min,
    avg_power_w, norm_power_w, intensity_factor, training_stress_score,
    avg_hr, avg_speed_mph, ascent_ft
FROM activities WHERE activity_type IN ('Road Cycling','Virtual Cycling')
ORDER BY activity_date DESC;

CREATE VIEW IF NOT EXISTS v_sensor_history AS
SELECT a.activity_date, a.activity_type, d.antplus_device_type,
    d.manufacturer, d.garmin_product, d.software_version, d.battery_status, d.battery_voltage
FROM device_info d JOIN activities a ON d.activity_id = a.id
WHERE d.antplus_device_type IS NOT NULL
ORDER BY a.activity_date DESC, d.antplus_device_type;
"""


def create_database(db_path: Path, reset: bool = False):
    print(f"Database path: {db_path.resolve()}")
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")

    if reset:
        print("Dropping all tables and views...")
        for (v,) in conn.execute("SELECT name FROM sqlite_master WHERE type='view'").fetchall():
            conn.execute(f"DROP VIEW IF EXISTS {v}")
        for (t,) in conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name != 'sqlite_sequence'").fetchall():
            conn.execute(f"DROP TABLE IF EXISTS {t}")
        conn.commit()
        print("Done.\n")

    conn.executescript(SCHEMA)
    conn.commit()

    tables  = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").fetchall()]
    views   = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='view' ORDER BY name").fetchall()]
    indexes = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name").fetchall()]

    print(f"{'='*58}")
    print(f"  Database ready: {db_path.name}")
    print(f"{'='*58}")
    print(f"\n  Tables ({len(tables)}):")
    for t in tables:
        c    = conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        cols = len(conn.execute(f"PRAGMA table_info({t})").fetchall())
        print(f"    {t:<25} {cols:>3} columns   {c:>8,} rows")
    print(f"\n  Views ({len(views)}):")
    for v in views: print(f"    {v}")
    print(f"\n  Indexes ({len(indexes)}):")
    for i in indexes: print(f"    {i}")
    conn.close()
    print(f"\n  File size: {db_path.stat().st_size/1024:.0f} KB")
    print(f"\n  Next: python3 import_fit.py <folder> --db {db_path.name}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', default='training.db')
    parser.add_argument('--reset', action='store_true')
    args = parser.parse_args()
    db_path = Path(args.db)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    create_database(db_path, reset=args.reset)

if __name__ == '__main__':
    main()
