#!/usr/bin/env python3
"""
Edgar Molina Training Hub — FIT to SQLite Importer (100% field coverage)
=========================================================================
Reads Garmin .fit files and writes ALL data into training.db.
Handles both raw .fit and ZIP-wrapped .fit from Garmin Connect.

Usage:
    python import_fit.py activity.fit
    python import_fit.py garmin_fit/
    python import_fit.py garmin_fit/ --db ~/training/training.db
    python import_fit.py garmin_fit/ --dry-run
    python import_fit.py activity.fit --force

Requirements:
    pip install fitparse
    python create_db.py   (run once first)
"""

import argparse
import io
import sqlite3
import sys
import time
import zipfile
from datetime import datetime
from zoneinfo import ZoneInfo

# Storage timezone: every FIT timestamp from Garmin is UTC. Convert to this zone
# before writing activity_date/activity_datetime so the local calendar date
# matches what the user actually trained — otherwise a Friday-evening ride in
# Pacific time gets recorded as Saturday's UTC date and lands on the wrong day
# in the plan view, HR-zone lookups, etc.
LOCAL_TZ = ZoneInfo('America/Los_Angeles')
from pathlib import Path

try:
    from fitparse import FitFile
except ImportError:
    print("ERROR: fitparse not installed. Run:  pip install fitparse")
    sys.exit(1)

# ── Constants ──────────────────────────────────────────────────────────
SC  = 180.0 / (2**31)      # semicircles → degrees
M2MI = 0.000621371
M2FT = 3.28084
MS2MPH = 2.23694

RACE_DATES = {
    '2025-11-27','2025-12-27','2026-01-01',
    '2026-02-01','2026-05-03','2026-05-31','2026-08-23',
}
SKIP_SPORTS = {'strength_training','yoga','walking','generic','training'}

# ── Helpers ────────────────────────────────────────────────────────────

def s(val, d=None): return val if val is not None else d
def deg(v):  return round(v * SC, 6) if v is not None else None
def ft(v):   return round(v * M2FT, 1) if v is not None else None
def mi(v):   return round(v * M2MI, 4) if v is not None else None
def mph(v):  return round(v * MS2MPH, 2) if v is not None else None
def pace(v): return round(1609.34/v) if v and v > 0.3 else None
def cm(v):   return round(v/10, 2) if v else None     # mm → cm
def m2m(v):  return round(v/1000, 3) if v else None   # mm → m
def pct(v):  return round(float(v),2) if v and 20<float(v)<80 else None  # GCT balance sanity

def to_d(msg):
    return {f.name: f.value for f in msg.fields if f.value is not None}

def ts(v): return str(v) if v else None

def open_fit(path: Path):
    with open(path,'rb') as f: hdr = f.read(2)
    if hdr == b'PK':
        try:
            with zipfile.ZipFile(path) as z:
                for n in z.namelist():
                    if n.endswith('.fit'):
                        return FitFile(io.BytesIO(z.read(n)))
        except Exception as e:
            print(f"  ✗ ZIP error: {e}"); return None
    else:
        try:    return FitFile(str(path))
        except Exception as e:
            print(f"  ✗ Parse error: {e}"); return None

# ── Parser ─────────────────────────────────────────────────────────────

def parse_fit(path: Path) -> dict | None:
    fit = open_fit(path)
    if fit is None: return None
    try:    msgs = list(fit.get_messages())
    except Exception as e:
        print(f"  ✗ Read error: {e}"); return None

    # Collect by type
    def get(name): return [to_d(m) for m in msgs if m.name==name]
    sessions   = get('session')
    laps_raw   = get('lap')
    records    = get('record')
    workouts   = get('workout')
    wkt_steps  = get('workout_step')
    profiles   = get('user_profile')
    zones_msgs = get('zones_target')
    dev_info   = get('device_info')
    dev_set    = get('device_settings')
    file_ids   = get('file_id')
    file_cre   = get('file_creator')
    activity   = get('activity')
    hrv_msgs   = [m for m in msgs if m.name=='hrv']
    event_msgs = get('event')
    sport_msgs = get('sport')

    if not sessions: return None
    sess  = sessions[0]
    sport = str(s(sess.get('sport'),'')).lower()
    if sport in SKIP_SPORTS: return None
    is_run   = sport == 'running'
    is_cycle = 'cycling' in sport
    if not is_run and not is_cycle: return None

    # Date / title — converted to LOCAL time so the calendar date reflects when
    # the user actually trained (FIT files store start_time in UTC).
    start_ts = sess.get('start_time') or sess.get('timestamp')
    if isinstance(start_ts, datetime):
        # If the datetime is naive, assume UTC (FIT spec default).
        utc_ts    = start_ts if start_ts.tzinfo else start_ts.replace(tzinfo=ZoneInfo('UTC'))
        local_ts  = utc_ts.astimezone(LOCAL_TZ)
        date_str  = local_ts.strftime('%Y-%m-%dT%H:%M:%S')
        date_only = local_ts.strftime('%Y-%m-%d')
    else:
        date_str = str(start_ts); date_only = str(start_ts)[:10]

    title = (workouts[0].get('wkt_name') if workouts else None) or f"{sport.capitalize()} {date_only}"
    sub_sport = str(s(sess.get('sub_sport'),''))

    # Activity type
    if is_cycle:
        sub = sub_sport.lower()
        atype = 'Virtual Cycling' if ('virtual' in sub or 'indoor' in sub) else 'Road Cycling'
    else:
        atype = 'Running'

    # Speeds / pace
    avg_spd = s(sess.get('enhanced_avg_speed'), 0)
    max_spd = s(sess.get('enhanced_max_speed'), 0)

    # Running cadence
    cad_raw  = s(sess.get('avg_running_cadence'), 0)
    frac_cad = s(sess.get('avg_fractional_cadence'), 0)
    max_cad  = s(sess.get('max_running_cadence'), 0)
    max_frac = s(sess.get('max_fractional_cadence'), 0)
    cad_spm     = round((cad_raw+frac_cad)*2) if cad_raw else None
    max_cad_spm = round((max_cad+max_frac)*2) if max_cad else None

    # Elevation
    asc = s(sess.get('total_ascent'), 0)
    dsc = s(sess.get('total_descent'), 0)
    avg_alt = s(sess.get('enhanced_avg_altitude'))
    max_alt = s(sess.get('enhanced_max_altitude'))
    min_alt = s(sess.get('enhanced_min_altitude'))

    # User profile
    up = profiles[0] if profiles else {}
    # Zones
    z = zones_msgs[0] if zones_msgs else {}
    # File meta
    fi = file_ids[0] if file_ids else {}
    fc = file_cre[0] if file_cre else {}
    ac = activity[0] if activity else {}

    # ── ACTIVITIES row ────────────────────────────────────────────
    # Garmin activity ID — Garmin exports FIT files named `<id>.fit`. We use
    # this as the cross-system primary key so the frontend can look up activities
    # in the DB by a stable identifier instead of fuzzy-matching on title/date.
    import re as _re
    _gid_match = _re.match(r'^(\d+)\.fit$', path.name)
    garmin_activity_id = int(_gid_match.group(1)) if _gid_match else None

    act_row = {
        'fit_file':           path.name,
        'garmin_activity_id': garmin_activity_id,
        'activity_date':   date_only,
        'activity_datetime': date_str,
        'title':           title,
        'activity_type':   atype,
        'sport':           sport,
        'sub_sport':       sub_sport,
        'is_race':         int(date_only in RACE_DATES),
        'distance_mi':     round(s(sess.get('total_distance'),0)*M2MI, 3),
        'duration_sec':    s(sess.get('total_timer_time')),
        'elapsed_sec':     s(sess.get('total_elapsed_time')),
        'num_laps':        s(sess.get('num_laps')),
        # Running
        'pace_sec':        pace(avg_spd) if is_run else None,
        'max_pace_sec':    pace(max_spd) if is_run else None,
        'total_strides':   s(sess.get('total_strides')),
        'cadence_spm':     cad_spm,
        'max_cadence_spm': max_cad_spm,
        'gct_ms':          round(s(sess.get('avg_stance_time'),0),1) or None,
        'gct_stance_pct':  round(float(s(sess.get('avg_stance_time_percent'),0)),2) or None,
        'left_gct_pct':    pct(sess.get('avg_stance_time_balance')),
        'vert_osc_cm':     cm(sess.get('avg_vertical_oscillation')),
        'vert_ratio_pct':  round(float(s(sess.get('avg_vertical_ratio'),0)),2) or None,
        'stride_len_m':    m2m(sess.get('avg_step_length')),
        # Cycling
        'avg_speed_mph':   mph(avg_spd) if is_cycle else None,
        'max_speed_mph':   mph(max_spd) if is_cycle else None,
        'cadence_rpm':     s(sess.get('avg_cadence')) if is_cycle else None,
        'max_cadence_rpm': s(sess.get('max_cadence')) if is_cycle else None,
        'left_right_balance': s(sess.get('left_right_balance')),
        'total_cycles':    s(sess.get('total_cycles')),
        'avg_vam':         s(sess.get('avg_vam')),
        # Shared power
        'avg_power_w':     s(sess.get('avg_power')),
        'max_power_w':     s(sess.get('max_power')),
        'norm_power_w':    s(sess.get('normalized_power')),
        'total_work_kj':   round(s(sess.get('total_work'),0)/1000,1) or None,
        # HR
        'avg_hr':          s(sess.get('avg_heart_rate')),
        'max_hr':          s(sess.get('max_heart_rate')),
        'min_hr':          s(sess.get('min_heart_rate')),
        # Elevation
        'ascent_ft':       round(asc*M2FT) if asc else None,
        'descent_ft':      round(dsc*M2FT) if dsc else None,
        'avg_altitude_ft': ft(avg_alt),
        'max_altitude_ft': ft(max_alt),
        'min_altitude_ft': ft(min_alt),
        # GPS
        'start_lat':       deg(sess.get('start_position_lat')),
        'start_lon':       deg(sess.get('start_position_long')),
        'nec_lat':         deg(sess.get('nec_lat')),
        'nec_lon':         deg(sess.get('nec_long')),
        'swc_lat':         deg(sess.get('swc_lat')),
        'swc_lon':         deg(sess.get('swc_long')),
        # Environment
        'avg_temp_c':      s(sess.get('avg_temperature')),
        'max_temp_c':      s(sess.get('max_temperature')),
        # Training load
        'aerobic_te':      s(sess.get('total_training_effect')),
        'anaerobic_te':    s(sess.get('total_anaerobic_training_effect')),
        'calories':        s(sess.get('total_calories')),
        'training_stress_score': s(sess.get('training_stress_score')),
        'intensity_factor':      s(sess.get('intensity_factor')),
        'threshold_power_w':     s(sess.get('threshold_power')),
        # Athlete (user_profile)
        'athlete_name':    s(up.get('friendly_name')),
        'weight_kg':       s(up.get('weight')),
        'height_m':        s(up.get('height')),
        'age':             s(up.get('age')),
        'gender':          s(up.get('gender')),
        'resting_hr':      s(up.get('resting_heart_rate')),
        'default_max_hr':  s(up.get('default_max_heart_rate')),
        'default_max_bike_hr': s(up.get('default_max_biking_heart_rate')),
        # Zones
        'max_hr_zones':    s(z.get('max_heart_rate')),
        'threshold_hr':    s(z.get('threshold_heart_rate')),
        'ftp_w':           s(z.get('functional_threshold_power')),
    }

    # ── LAPS rows ─────────────────────────────────────────────────
    laps_out = []
    for i, lap in enumerate(laps_raw):
        ld  = s(lap.get('total_distance'), 0)
        if ld < 100: continue
        ls  = s(lap.get('enhanced_avg_speed'), 0)
        lms = s(lap.get('enhanced_max_speed'), 0)
        lc  = s(lap.get('avg_running_cadence'), 0)
        lfc = s(lap.get('avg_fractional_cadence'), 0)
        lmc = s(lap.get('max_running_cadence'), 0)
        lmfc= s(lap.get('max_fractional_cadence'), 0)
        la  = s(lap.get('total_ascent'), 0)
        ldsc= s(lap.get('total_descent'), 0)
        laps_out.append({
            'lap_number':    i+1,
            'lap_trigger':   s(lap.get('lap_trigger')),
            'intensity':     s(lap.get('intensity')),
            'wkt_step_index':s(lap.get('wkt_step_index')),
            'distance_mi':   round(ld*M2MI,3),
            'duration_sec':  s(lap.get('total_timer_time')),
            'elapsed_sec':   s(lap.get('total_elapsed_time')),
            'total_strides': s(lap.get('total_strides')),
            'total_cycles':  s(lap.get('total_cycles')),
            'pace_sec':      pace(ls) if is_run else None,
            'max_pace_sec':  pace(lms) if is_run else None,
            'speed_mph':     mph(ls) if is_cycle else None,
            'max_speed_mph': mph(lms) if is_cycle else None,
            'avg_hr':        s(lap.get('avg_heart_rate')),
            'max_hr':        s(lap.get('max_heart_rate')),
            'cadence_spm':   round((lc+lfc)*2) if is_run and lc else None,
            'max_cadence_spm': round((lmc+lmfc)*2) if is_run and lmc else None,
            'gct_ms':        round(s(lap.get('avg_stance_time'),0),1) or None,
            'gct_stance_pct':round(float(s(lap.get('avg_stance_time_percent'),0)),2) or None,
            'left_gct_pct':  pct(lap.get('avg_stance_time_balance')),
            'vert_osc_cm':   cm(lap.get('avg_vertical_oscillation')),
            'vert_ratio_pct':round(float(s(lap.get('avg_vertical_ratio'),0)),2) or None,
            'stride_len_m':  m2m(lap.get('avg_step_length')),
            'cadence_rpm':   s(lap.get('avg_cadence')) if is_cycle else None,
            'max_cadence_rpm':s(lap.get('max_cadence')) if is_cycle else None,
            'left_right_balance': s(lap.get('left_right_balance')),
            'avg_power_w':   s(lap.get('avg_power')),
            'max_power_w':   s(lap.get('max_power')),
            'norm_power_w':  s(lap.get('normalized_power')),
            'total_work_j':  s(lap.get('total_work')),
            'ascent_ft':     round(la*M2FT) if la else None,
            'descent_ft':    round(ldsc*M2FT) if ldsc else None,
            'max_altitude_ft': ft(lap.get('enhanced_max_altitude')),
            'min_altitude_ft': ft(lap.get('enhanced_min_altitude')),
            'start_lat':     deg(lap.get('start_position_lat')),
            'start_lon':     deg(lap.get('start_position_long')),
            'end_lat':       deg(lap.get('end_position_lat')),
            'end_lon':       deg(lap.get('end_position_long')),
            'calories':      s(lap.get('total_calories')),
            'avg_vam':       s(lap.get('avg_vam')),
            'avg_temp_c':    s(lap.get('avg_temperature')),
            'max_temp_c':    s(lap.get('max_temperature')),
        })

    # ── RECORDS rows ──────────────────────────────────────────────
    start_time = records[0].get('timestamp') if records else None
    records_out = []
    for rec in records:
        spd = rec.get('enhanced_speed',0) or 0
        cad_r = rec.get('cadence',0) or 0
        frac_r= rec.get('fractional_cadence',0) or 0
        cad_unified = round((cad_r+frac_r)*2) if (is_run and cad_r) else (cad_r or None)
        alt = rec.get('enhanced_altitude')

        elapsed = None
        if start_time and rec.get('timestamp'):
            try:
                elapsed = round((rec['timestamp']-start_time).total_seconds(), 1)
            except: pass

        records_out.append((
            ts(rec.get('timestamp')),
            elapsed,
            deg(rec.get('position_lat')),
            deg(rec.get('position_long')),
            ft(alt),
            mi(rec.get('distance')),
            mph(spd) if spd else None,
            pace(spd),
            rec.get('heart_rate'),
            str(rec.get('activity_type','')) or None,
            rec.get('power'),
            rec.get('accumulated_power'),
            cad_unified,
            rec.get('stance_time'),
            pct(rec.get('stance_time_balance')),
            round(float(rec['stance_time_percent']),2) if rec.get('stance_time_percent') else None,
            cm(rec.get('vertical_oscillation')),
            round(float(rec['vertical_ratio']),2) if rec.get('vertical_ratio') else None,
            round(rec['step_length']/1000,3) if rec.get('step_length') else None,
            rec.get('left_right_balance'),
            rec.get('temperature'),
        ))

    # ── STREAM SUMMARY ────────────────────────────────────────────
    stream = build_stream(records, is_run)

    # ── HRV rows ──────────────────────────────────────────────────
    hrv_out = []
    for msg in hrv_msgs:
        t_val = None
        for f in msg.fields:
            if f.name=='timestamp' and f.value is not None: t_val=str(f.value)
        for f in msg.fields:
            if f.name=='time' and f.value is not None:
                vals = f.value if hasattr(f.value,'__iter__') else [f.value]
                for rr in vals:
                    if rr and rr > 0:
                        hrv_out.append((t_val, round(float(rr)*1000,1)))

    # ── EVENTS rows ───────────────────────────────────────────────
    events_out = []
    for ev in event_msgs:
        events_out.append((
            ts(ev.get('timestamp')), str(s(ev.get('event'),'')),
            str(s(ev.get('event_type'),'')), s(ev.get('event_group')),
            s(ev.get('timer_trigger')), s(ev.get('data')),
            s(ev.get('hr_high_alert')), s(ev.get('front_gear')),
            s(ev.get('front_gear_num')), s(ev.get('rear_gear')),
            s(ev.get('rear_gear_num')), s(ev.get('gear_change_data')),
        ))

    # ── WORKOUT STEPS rows ────────────────────────────────────────
    wkt_name = workouts[0].get('wkt_name') if workouts else None
    wkt_out = []
    for ws in wkt_steps:
        wkt_out.append((
            wkt_name, s(ws.get('message_index')),
            str(s(ws.get('intensity'),'')), str(s(ws.get('duration_type'),'')),
            s(ws.get('duration_distance')),
            str(s(ws.get('target_type'),'')), s(ws.get('target_hr_zone')),
            s(ws.get('custom_target_heart_rate_low')),
            s(ws.get('custom_target_heart_rate_high')),
            str(s(ws.get('exercise_category'),'')),
            str(s(ws.get('exercise_name'),'')),
        ))

    # ── DEVICE_INFO rows ──────────────────────────────────────────
    dev_out = []
    for d in dev_info:
        dev_out.append((
            ts(d.get('timestamp')), str(s(d.get('device_index'),'')),
            s(d.get('device_type')), str(s(d.get('antplus_device_type'),'')),
            str(s(d.get('manufacturer'),'')), str(s(d.get('garmin_product'),'')),
            s(d.get('serial_number')), s(d.get('software_version')),
            s(d.get('hardware_version')), str(s(d.get('battery_status'),'')),
            s(d.get('battery_voltage')), str(s(d.get('source_type'),'')),
            str(s(d.get('ant_network'),'')), s(d.get('cum_operating_time')),
        ))

    # ── DEVICE_SETTINGS row ───────────────────────────────────────
    ds = dev_set[0] if dev_set else {}
    ds_row = (
        s(ds.get('active_time_zone')), s(ds.get('utc_offset')),
        s(ds.get('time_offset')), s(ds.get('time_zone_offset')),
        str(s(ds.get('time_mode'),'')), str(s(ds.get('date_mode'),'')),
        str(s(ds.get('mounting_side'),'')), str(s(ds.get('backlight_mode'),'')),
        int(bool(ds.get('move_alert_enabled'))),
        int(bool(ds.get('activity_tracker_enabled'))),
        s(ds.get('auto_activity_detect')),
        s(ds.get('autosync_min_steps')), s(ds.get('autosync_min_time')),
        str(s(ds.get('tap_interface'),'')),
        int(bool(ds.get('lactate_threshold_autodetect_enabled'))),
    ) if ds else None

    # ── USER_PROFILE row ──────────────────────────────────────────
    up_row = (
        s(up.get('friendly_name')), str(s(up.get('gender'),'')),
        s(up.get('age')), s(up.get('height')), s(up.get('weight')),
        s(up.get('resting_heart_rate')), s(up.get('default_max_heart_rate')),
        s(up.get('default_max_biking_heart_rate')), s(up.get('activity_class')),
        str(s(up.get('language'),'')), str(s(up.get('dist_setting'),'')),
        str(s(up.get('speed_setting'),'')), str(s(up.get('height_setting'),'')),
        str(s(up.get('weight_setting'),'')), str(s(up.get('hr_setting'),'')),
        str(s(up.get('temperature_setting'),'')), str(s(up.get('elev_setting'),'')),
        str(s(up.get('power_setting'),'')), str(s(up.get('position_setting'),'')),
        str(s(up.get('sleep_time'),'')), str(s(up.get('wake_time'),'')),
        s(up.get('user_walking_step_length')), s(up.get('dive_count')),
        str(s(up.get('depth_setting'),'')),
    ) if up else None

    # ── FILE_META row ─────────────────────────────────────────────
    fm_row = (
        str(s(fi.get('manufacturer'),'')), s(fi.get('garmin_product')),
        s(fi.get('serial_number')), ts(fi.get('time_created')),
        str(s(fi.get('type'),'')), s(fc.get('software_version')),
        s(ac.get('num_sessions')), ts(ac.get('local_timestamp')),
    ) if fi else None

    return {
        'activity':        act_row,
        'laps':            laps_out,
        'records':         records_out,
        'stream':          stream,
        'hrv':             hrv_out,
        'events':          events_out,
        'workout_steps':   wkt_out,
        'device_info':     dev_out,
        'device_settings': ds_row,
        'user_profile':    up_row,
        'file_meta':       fm_row,
        # for display
        '_date':   date_only,
        '_type':   atype,
        '_dist':   round(s(sess.get('total_distance'),0)*M2MI, 2),
        '_laps':   len(laps_out),
        '_recs':   len(records_out),
        '_title':  title[:35],
    }


# ════════════════════════════════════════════════════════════════════
# BEST EFFORTS — fastest rolling-window times + single-activity PRs
# ════════════════════════════════════════════════════════════════════

# Target distances (miles) for rolling-window time PRs
RUN_DISTANCES_MI = {
    '400m':          400 / 1609.344,
    '800m':          800 / 1609.344,
    '1K':            1000 / 1609.344,
    '1mi':           1.0,
    '2mi':           2.0,
    '5K':            5000 / 1609.344,
    '10K':           10000 / 1609.344,
    '15K':           15000 / 1609.344,
    '10mi':          10.0,
    '20K':           20000 / 1609.344,
    'half_marathon': 21097.5 / 1609.344,
    '30K':           30000 / 1609.344,
    'marathon':      42195 / 1609.344,
}
CYC_DISTANCES_MI = {
    '5mi':  5.0,
    '10K':  10000 / 1609.344,
    '10mi': 10.0,
    '20K':  20000 / 1609.344,
    '30K':  30000 / 1609.344,
    '40K':  40000 / 1609.344,
}

# Indices into the records_out tuple (matches the INSERT INTO records column order)
_R_ELAPSED = 1
_R_ALT     = 4
_R_DIST    = 5


def fastest_for_distance(records_out, target_mi):
    """Two-pointer sweep for fastest time to cover target_mi. Returns seconds or None."""
    pts = [(r[_R_ELAPSED], r[_R_DIST]) for r in records_out
           if r[_R_ELAPSED] is not None and r[_R_DIST] is not None]
    n = len(pts)
    if n < 2 or pts[-1][1] < target_mi:
        return None
    best = None
    j = 0
    for i in range(n):
        while j < n and pts[j][1] - pts[i][1] < target_mi:
            j += 1
        if j >= n:
            break
        # Linear interpolation across the last segment for sub-second precision.
        if j > 0 and pts[j][1] > pts[j-1][1]:
            target = pts[i][1] + target_mi
            frac = (target - pts[j-1][1]) / (pts[j][1] - pts[j-1][1])
            elapsed_at_target = pts[j-1][0] + frac * (pts[j][0] - pts[j-1][0])
            elapsed = elapsed_at_target - pts[i][0]
        else:
            elapsed = pts[j][0] - pts[i][0]
        if best is None or elapsed < best:
            best = elapsed
    return best


def biggest_climb_ft(records_out):
    """Max altitude excursion above any preceding running-minimum."""
    min_alt, biggest = None, 0.0
    for r in records_out:
        alt = r[_R_ALT]
        if alt is None:
            continue
        if min_alt is None or alt < min_alt:
            min_alt = alt
        gain = alt - min_alt
        if gain > biggest:
            biggest = gain
    return round(biggest, 1) if biggest > 0 else None


def build_best_efforts(records_out, is_run, act_row, stream):
    """Return list of (effort_type, effort_value, unit) tuples for this activity."""
    out = []

    # Rolling-window distance PRs (time in seconds, lower is better)
    distances = RUN_DISTANCES_MI if is_run else CYC_DISTANCES_MI
    for label, target_mi in distances.items():
        t = fastest_for_distance(records_out, target_mi)
        if t is not None:
            out.append((label, round(t, 2), 'sec'))

    # Single-activity "biggest of …" efforts (higher is better)
    dist_mi  = act_row.get('distance_mi')
    ascent   = act_row.get('ascent_ft')
    if is_run:
        if dist_mi: out.append(('longest_run',        dist_mi, 'mi'))
        if ascent:  out.append(('most_elevation_run', ascent,  'ft'))
        if act_row.get('aerobic_te'):
            out.append(('most_aerobic_te', act_row['aerobic_te'], 'te'))
    else:
        if dist_mi: out.append(('longest_ride',         dist_mi, 'mi'))
        if ascent:  out.append(('most_elevation_ride', ascent,  'ft'))
        # Power PRs already computed in stream_summary — duplicate them here for
        # a unified query surface.
        pc = stream.get('power_curve', {})
        for k in ('1s', '5s', '10s', '30s', '60s', '300s', '600s', '1200s'):
            if pc.get(k):
                out.append((f'pwr_{k}', pc[k], 'w'))
        if act_row.get('training_stress_score'):
            out.append(('most_tss',    act_row['training_stress_score'], 'tss'))
        if act_row.get('norm_power_w'):
            out.append(('highest_np',  act_row['norm_power_w'],          'w'))

    bc = biggest_climb_ft(records_out)
    if bc and bc > 50:   # ignore GPS noise
        out.append(('biggest_climb', bc, 'ft'))

    return out


def build_stream(records, is_run):
    if not records: return {}

    hr_zones = {1:0,2:0,3:0,4:0,5:0}
    for r in records:
        hr = r.get('heart_rate')
        if not hr: continue
        if hr<121: hr_zones[1]+=1
        elif hr<152: hr_zones[2]+=1
        elif hr<166: hr_zones[3]+=1
        elif hr<179: hr_zones[4]+=1
        else: hr_zones[5]+=1

    powers = [r.get('power',0) or 0 for r in records]
    pc = {}
    if any(p>0 for p in powers):
        for dur in [1,5,10,30,60,300,600,1200]:
            if dur > len(powers): break
            ws = sum(powers[:dur]); best = ws
            for i in range(dur, len(powers)):
                ws += powers[i]-powers[i-dur]
                if ws>best: best=ws
            pc[f'{dur}s'] = round(best/dur)

    fd = {}
    if is_run and records:
        td = records[-1].get('distance',0) or 0
        mile = 1609.34
        def mavg(recs, flds):
            out={}
            for f in flds:
                v=[r[f] for r in recs if r.get(f) and r[f]>0]
                if v: out[f]=round(sum(v)/len(v),1)
            return out
        fr=[r for r in records if (r.get('distance') or 0)<mile]
        lr=[r for r in records if (r.get('distance') or 0)>td-mile and (r.get('distance') or 0)<=td-50]
        flds=['heart_rate','stance_time','stance_time_balance','vertical_oscillation','power']
        if fr and lr:
            fa=mavg(fr,flds); la=mavg(lr,flds)
            for f in flds:
                if f in fa and f in la:
                    fd[f]={'first':fa[f],'last':la[f],'delta':round(la[f]-fa[f],1)}

    return {'hr_zones':hr_zones,'power_curve':pc,'form_drift':fd}


# ── Database writer ────────────────────────────────────────────────────

def insert(conn, data, force=False):
    a = data['activity']

    # Dedup check
    existing = conn.execute(
        "SELECT id FROM activities WHERE activity_date=? AND activity_type=? "
        "AND CAST(ROUND(distance_mi*20) AS INTEGER)=CAST(ROUND(?*20) AS INTEGER)",
        (a['activity_date'], a['activity_type'], a['distance_mi'])
    ).fetchone()
    if existing:
        if force: conn.execute("DELETE FROM activities WHERE id=?", (existing[0],))
        else: return None

    # activities
    keys = [k for k in a if k != 'source']
    keys.append('source')
    vals = [a[k] for k in keys[:-1]] + ['fit']
    cur = conn.execute(
        f"INSERT INTO activities ({','.join(keys)}) VALUES ({','.join(['?']*len(keys))})", vals)
    aid = cur.lastrowid

    # laps
    for lap in data['laps']:
        ks = list(lap.keys())
        conn.execute(
            f"INSERT INTO laps (activity_id,{','.join(ks)}) VALUES (?{',?'*len(ks)})",
            [aid]+[lap[k] for k in ks])

    # records
    conn.executemany("""
        INSERT INTO records (activity_id,timestamp,elapsed_sec,lat,lon,altitude_ft,
            distance_mi,speed_mph,pace_sec,heart_rate,activity_type,power_w,accumulated_power_w,
            cadence,gct_ms,left_gct_pct,gct_stance_pct,vert_osc_cm,vert_ratio_pct,stride_len_m,
            left_right_balance,temp_c)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        [(aid,)+r for r in data['records']])

    # stream_summary
    s  = data['stream']
    hz = s.get('hr_zones',{})
    pc = s.get('power_curve',{})
    fd = s.get('form_drift',{})
    fv = lambda f,k: fd.get(f,{}).get(k)
    conn.execute("""INSERT INTO stream_summary (activity_id,z1_sec,z2_sec,z3_sec,z4_sec,z5_sec,
        power_1s,power_5s,power_10s,power_30s,power_60s,power_300s,power_600s,power_1200s,
        first_hr,first_gct_ms,first_left_pct,first_vert_osc,first_power_w,
        last_hr,last_gct_ms,last_left_pct,last_vert_osc,last_power_w,
        delta_hr,delta_gct_ms,delta_left_pct,delta_vert_osc,delta_power_w)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (
        aid,hz.get(1,0),hz.get(2,0),hz.get(3,0),hz.get(4,0),hz.get(5,0),
        pc.get('1s'),pc.get('5s'),pc.get('10s'),pc.get('30s'),pc.get('60s'),
        pc.get('300s'),pc.get('600s'),pc.get('1200s'),
        fv('heart_rate','first'),fv('stance_time','first'),fv('stance_time_balance','first'),
        fv('vertical_oscillation','first'),fv('power','first'),
        fv('heart_rate','last'),fv('stance_time','last'),fv('stance_time_balance','last'),
        fv('vertical_oscillation','last'),fv('power','last'),
        fv('heart_rate','delta'),fv('stance_time','delta'),fv('stance_time_balance','delta'),
        fv('vertical_oscillation','delta'),fv('power','delta')))

    # best_efforts — per-activity time PRs + single-activity "biggest of …" rows.
    # INSERT OR REPLACE so re-imports stay clean.
    is_run = 'unning' in (a.get('activity_type') or '')
    efforts = build_best_efforts(data['records'], is_run, a, data['stream'])
    if efforts:
        conn.executemany(
            "INSERT OR REPLACE INTO best_efforts (activity_id, effort_type, effort_value, unit) VALUES (?,?,?,?)",
            [(aid,) + e for e in efforts]
        )

    # hrv
    if data['hrv']:
        conn.executemany("INSERT INTO hrv(activity_id,timestamp,rr_interval_ms) VALUES(?,?,?)",
            [(aid,t,rr) for t,rr in data['hrv']])

    # events
    if data['events']:
        conn.executemany("""INSERT INTO events(activity_id,timestamp,event,event_type,event_group,
            timer_trigger,data,hr_high_alert,front_gear,front_gear_num,rear_gear,rear_gear_num,
            gear_change_data) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            [(aid,)+e for e in data['events']])

    # workout_steps
    if data['workout_steps']:
        conn.executemany("""INSERT INTO workout_steps(activity_id,workout_name,step_index,intensity,
            duration_type,duration_distance_m,target_type,target_hr_zone,hr_low_bpm,hr_high_bpm,
            exercise_category,exercise_name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
            [(aid,)+w for w in data['workout_steps']])

    # device_info
    if data['device_info']:
        conn.executemany("""INSERT INTO device_info(activity_id,timestamp,device_index,device_type,
            antplus_device_type,manufacturer,garmin_product,serial_number,software_version,
            hardware_version,battery_status,battery_voltage,source_type,ant_network,
            cum_operating_time) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            [(aid,)+d for d in data['device_info']])

    # device_settings
    if data['device_settings']:
        conn.execute("""INSERT INTO device_settings(activity_id,active_time_zone,utc_offset,
            time_offset,time_zone_offset,time_mode,date_mode,mounting_side,backlight_mode,
            move_alert_enabled,activity_tracker_enabled,auto_activity_detect,autosync_min_steps,
            autosync_min_time,tap_interface,lactate_threshold_autodetect_enabled)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (aid,)+data['device_settings'])

    # user_profile
    if data['user_profile']:
        conn.execute("""INSERT INTO user_profile(activity_id,friendly_name,gender,age,height_m,
            weight_kg,resting_heart_rate,default_max_heart_rate,default_max_biking_heart_rate,
            activity_class,language,dist_setting,speed_setting,height_setting,weight_setting,
            hr_setting,temperature_setting,elev_setting,power_setting,position_setting,
            sleep_time,wake_time,user_walking_step_length,dive_count,depth_setting)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (aid,)+data['user_profile'])

    # file_meta
    if data['file_meta']:
        conn.execute("""INSERT INTO file_meta(activity_id,manufacturer,garmin_product,serial_number,
            time_created,file_type,creator_software_version,num_sessions,local_timestamp)
            VALUES(?,?,?,?,?,?,?,?,?)""", (aid,)+data['file_meta'])

    return aid


# ── Main ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Import .fit files into training.db')
    parser.add_argument('input')
    parser.add_argument('--db', default='training.db')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()

    inp = Path(args.input); db_path = Path(args.db)
    if not inp.exists():
        print(f"ERROR: {inp} not found"); sys.exit(1)
    if not db_path.exists() and not args.dry_run:
        print(f"ERROR: {db_path} not found\nRun: python create_db.py --db {db_path}"); sys.exit(1)

    # Collect files
    fits = sorted(inp.glob('**/*')) if inp.is_dir() else [inp]
    fits = [f for f in fits if f.suffix.lower()=='.fit' or
            (f.suffix.lower()=='.fit' and f.is_file())]
    # Also include .fit extension files that might be zips
    if inp.is_dir():
        fits = [f for f in sorted(inp.iterdir()) if f.suffix.lower()=='.fit']
    else:
        fits = [inp]

    if not fits:
        print(f"No .fit files found in {inp}"); sys.exit(1)

    print(f"{'DRY RUN — ' if args.dry_run else ''}Importing {len(fits)} file(s)\n")

    conn = None
    if not args.dry_run:
        conn = sqlite3.connect(db_path)
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA cache_size=-64000")

    t0 = time.time()
    imported = skipped = errors = 0

    for f in fits:
        print(f"  → {f.name:<45}", end='', flush=True)
        data = parse_fit(f)
        if data is None:
            print("skipped"); skipped+=1; continue

        if args.dry_run:
            print(f"✓ {data['_date']}  {data['_type']:<18}  {data['_dist']:.2f}mi  "
                  f"{data['_laps']} laps  {data['_recs']:,} records  \"{data['_title']}\"")
            imported+=1; continue

        try:
            aid = insert(conn, data, force=args.force)
            if aid is None:
                print("duplicate — skipped"); skipped+=1
            else:
                conn.commit()
                print(f"✓ {data['_date']}  {data['_type']:<18}  {data['_dist']:.2f}mi  "
                      f"{data['_laps']} laps  {data['_recs']:,} records")
                imported+=1
        except Exception as e:
            conn.rollback(); print(f"ERROR: {e}"); errors+=1

    print(f"\n{'='*58}")
    print(f"  {'DRY RUN ' if args.dry_run else ''}Done in {time.time()-t0:.1f}s")
    print(f"  ✓ Imported: {imported}  ↷ Skipped: {skipped}  ✗ Errors: {errors}")
    print(f"{'='*58}")

    if not args.dry_run and conn:
        for row in conn.execute(
            "SELECT activity_type,COUNT(*),ROUND(SUM(distance_mi),1) FROM activities "
            "GROUP BY activity_type ORDER BY COUNT(*) DESC").fetchall():
            print(f"  {row[0]:<22} {row[1]:>4} activities  {row[2]:>8.1f} mi")
        for tbl in ['laps','records','hrv','events','workout_steps','device_info']:
            n = conn.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
            print(f"  {tbl:<22} {n:>9,} rows")
        conn.close()
        print(f"\n  DB size: {db_path.stat().st_size/1024/1024:.1f} MB  →  {db_path.resolve()}")

if __name__ == '__main__':
    main()
