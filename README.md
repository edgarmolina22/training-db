# Edgar Molina Training Hub

A personal marathon training hub built as a single HTML file, backed by a local SQLite database and Python toolchain. Tracks a 15-week training plan for the **Santa Rosa Marathon (Aug 23, 2026)** with integrated run/cycling analytics, Garmin FIT file processing, GPS maps, and a local Flask server for live database integration.

> **Built with vibe coding using [Claude](https://claude.ai) by Anthropic.** Every line of code in this project was generated through natural language conversation — no manual coding required.

**🔗 Live site:** https://edgarmolina22.github.io/edgar-molina-training-hub/  
**🖥 Local (with DB):** `python serve.py` → http://localhost:5000

---

## Project structure

```
training-db/
├── index.html          — Training hub markup (~320 lines, pure HTML)
├── styles.css          — All styles
├── js/
│   ├── data.js         — State, CSV parsing, Garmin upload, cloud persistence
│   ├── plan.js         — Training plan rendering + plan health
│   ├── analytics.js    — Analytics + charts + snapshots + share cards
│   ├── app.js          — Event dispatcher, tab switching, init/bootstrap
│   ├── db.js           — Local DB integration + activity detail modal
│   └── map.js          — Leaflet map tab
├── runs.json           — Activity summaries loaded at page load
├── cycles.json         — Cycling summaries loaded at page load
├── serve.py            — Flask server (enables DB features)
├── create_db.py        — Creates training.db schema
├── import_fit.py       — Bulk-imports .fit files into training.db
├── fit_parser.py       — Inspects one .fit file (debug / one-off CSV export)
├── export_json.py      — Syncs runs.json + cycles.json from training.db
├── refresh.sh          — One-shot: import_fit.py + export_json.py
├── training.db         — SQLite database (all activity data)
├── garmin_fit/         — Your .fit files go here
└── README.md           — This file
```

Each activity carries a stable **Garmin activity ID** (parsed from the `.fit`
filename, stored as `activities.garmin_activity_id`, and threaded through
`runs.json` / `cycles.json` as `garmin_id`). The frontend uses it as the primary
key when calling DB-backed endpoints, with `(date, type)` as a fallback for
activities that aren't in the DB yet.

---

## Quick start

```bash
# 1. Install dependencies (once)
pip install flask fitparse

# 2. Create database (once)
python create_db.py

# 3. Import FIT files into the DB
python import_fit.py garmin_fit/

# 4. Sync runs.json + cycles.json from the DB (so the frontend sees them)
python export_json.py

# 5. Start the server
python serve.py
# → Hub:       http://localhost:5000
# → DB viewer: http://localhost:5000/db
```

---

## Adding new activities

Whenever new `.fit` files arrive:

```bash
# 1. Drop the .fit files into garmin_fit/
cp ~/Downloads/*.fit garmin_fit/

# 2. Import + sync JSON in one go
./refresh.sh
```

`refresh.sh` runs `import_fit.py garmin_fit/` (de-dupes against existing rows,
populates `garmin_activity_id` from the filename) and then `export_json.py`
(patches `runs.json` / `cycles.json` to include any new activities while
preserving curated titles and local-time dates on existing ones).

Hard-reload the browser (Cmd-Shift-R) so the cached JSON files re-fetch.

---

## Hub features

### 🗓 Training plan

- 15-week plan May 11 – Aug 23, 2026
- Full 7-day weekly view with actual calendar dates
- Completed workouts turn green when matched to Garmin data (today's workout never auto-completes — `<` not `<=` today)
- The **current week opens by default** when you load the page; past + future weeks stay collapsed
- Filter by phase: Rehab · Rebuild · Build · Peak · Taper
- **IT Band Strength Reference card** (top of tab) — one collapsible card with Daily activation + Strength A + Strength B exercises. Each week's day rows reference them by name; the card is the single source of truth so you don't see the same exercises duplicated across 15 weeks.
- **Optional cycling indicator** (🚴 emoji on the week header bar) — appears on weeks where the plan suggests a flexible extra ride; hover for the full prescription
- **Plan Health panel** (collapsible) — evaluates most recent week:
  - Mileage: warns if <80% or >115% of planned
  - Pace trend: flags >30s/mi slowdown, celebrates >20s improvement
  - IT band: warns when left GCT% < 47.5%

**Training phases:**

| Phase | Weeks | Dates | Miles |
|-------|-------|-------|-------|
| 1 — Rehab | 1–2 | May 11–24 | 51 |
| 2 — Rebuild | 3–6 | May 25–Jun 21 | 114 |
| 3 — Build | 7–10 | Jun 22–Jul 19 | 145 |
| 4 — Peak | 11–12 | Jul 20–Aug 2 | 80 |
| 5 — Taper | 13–15 | Aug 3–23 | 59 |

---

### 📊 Analytics

**Three pages:** Overview · Running · Cycling

**Overview:** Weekly volume, training load (Aerobic TE), HR zones, elevation, recovery balance, race predictor.

**Running** — charts grouped into 4 collapsible sections (state persists per browser):

- **Pace & Volume** *(open by default)* — pace over time, pace progression, long run progression
- **Cardio** *(open)* — HR vs pace, aerobic efficiency trend, running power curve PRs *(requires local server)*
- **Form** *(collapsed)* — cadence, left GCT balance, GCT, stride length, vertical ratio, vertical oscillation
- **Personal Records** *(open)* — all-time PRs for 400m through marathon, longest run, biggest climb *(requires local server)*

**Cycling** — same 4-section pattern with cycling-specific groups:

- **Pace & Volume** — cycling speed over time
- **Power** — cycling training load, avg power, power trend, peak power history, speed vs power scatter
- **Cardio** — HR zone distribution
- **Personal Records** — all-time PRs for 5mi/10K/10mi/20K/30K/40K, longest ride, biggest climb, full power curve (1s → 20min)

Each section header shows an at-a-glance KPI summary when collapsed (e.g. "latest 9:32/mi · 8.02 mi · 123 runs").

**Run type filters:** Easy · Long · Intervals · Tempo · Hills · Races

---

### 🗺 Activity detail modal *(requires local server)*

Click **⊞** on any activity row:

| Tab | Contents |
|-----|----------|
| **Splits** | Per-mile: pace, HR, cadence, GCT, left%, VO, VR, power, calories, ascent, temp |
| **HR Zones** | Seconds + % in each of 5 zones |
| **Form Drift** | First vs last mile: HR, GCT, left balance, VO, power |
| **Map** | Leaflet map with pace heatmap (green=fast → amber=mid → coral=slow) |

Form Drift tab hidden for cycling activities.

---

### 📸 Share cards

6 styles, exportable as PNG. Click **↗** on any activity row.

| Style | Description |
|-------|-------------|
| 1 | Bottom pill |
| 2 | Corner tag |
| 3 | Left stripe |
| 4 | Top bar + floating card |
| 5 | Full dark card + GPS route pace heatmap |
| 6 | Full transparent + GPS route pace heatmap |

- **iOS:** native share sheet → "Save Image" → Photos  
- **Desktop:** direct PNG download  
- GPS route on styles 5 & 6 requires local server

---

## Database

### Schema — 12 tables, 9 views, 15 indexes

`activities.garmin_activity_id` is a `UNIQUE INTEGER` populated from the `.fit`
filename (Garmin exports as `<id>.fit`). It is the cross-system primary key
used by the JSON files and every DB-backed API endpoint. `activity_date` and
`activity_datetime` are stored in **local time** (America/Los_Angeles), not
UTC, so a Friday-evening ride lands on Friday in the plan view rather than
Saturday.

| Table | Cols | Contents |
|-------|------|----------|
| `activities` | 71 | Session summary (shared + run + cycle fields) |
| `laps` | 44 | Per-mile/lap splits |
| `records` | 23 | 1Hz GPS/HR/power/form stream |
| `stream_summary` | 30 | HR zones, power curve, form drift |
| `best_efforts` | 4 | Per-activity PRs (rolling-window distance times + power PRs + climbs) |
| `hrv` | 4 | Beat-to-beat RR intervals (cycling) |
| `events` | 14 | HR alerts, gear shifts, recovery HR, pauses |
| `workout_steps` | 13 | Structured workout definitions + HR targets |
| `device_info` | 16 | Connected sensors, firmware, battery |
| `device_settings` | 17 | Watch configuration snapshot |
| `user_profile` | 26 | Athlete profile |
| `file_meta` | 9 | File identity and device metadata |

**Views:** `v_weekly_mileage` · `v_itb_risk_laps` · `v_form_trends` · `v_power_curve_prs` · `v_pace_trend` · `v_hrv_summary` · `v_event_summary` · `v_cycling_load` · `v_sensor_history`

### Import commands

```bash
python import_fit.py garmin_fit/              # full import (idempotent)
python import_fit.py garmin_fit/ --dry-run    # preview without writing
python import_fit.py garmin_fit/ --force      # overwrite duplicates
python export_json.py                         # sync runs.json + cycles.json
./refresh.sh                                  # import + export combined
python create_db.py --reset                   # wipe and rebuild schema
```

Handles raw `.fit` and ZIP-wrapped `.fit` from Garmin Connect bulk exports.
Dates stored in local time using `activity.local_timestamp`. `garmin_activity_id`
populated from the `.fit` filename on every import.

---

## Server API

| Endpoint | Description |
|----------|-------------|
| `GET /api/status` | DB connection + row counts |
| `GET /api/laps` | Per-mile splits |
| `GET /api/hr_zones` | HR zone breakdown |
| `GET /api/form_drift` | First vs last mile form |
| `GET /api/route` | GPS points + pace stats |
| `GET /api/power_curve` | All-time power PRs |
| `GET /api/cycling_load` | TSS/IF history |
| `GET /api/best_efforts` | All-time PRs per effort type (running + cycling) |
| `GET /api/activities` | All activities |
| `GET /db` | Database previewer |

Activity-specific endpoints (`/api/laps`, `/api/hr_zones`, `/api/form_drift`,
`/api/route`) accept identifiers in this priority order:

1. `?garmin_id=N` — Garmin's globally-unique activity ID (preferred).
2. `?activity_id=N` — legacy: the DB autoincrement id.
3. `?date=YYYY-MM-DD&type=Running|Cycling` (optionally `&dist=`, `&title=`) —
   fuzzy fallback with ±1 day skew handling, used for activities not yet in the
   DB or imported from non-Garmin sources.

---

## Garmin CSV upload (legacy)

Still supported for activities not yet in the database.

| File | Source |
|------|--------|
| `running.csv` | Garmin Connect → Activities → filter Running → Export CSV |
| `cycling.csv` | Garmin Connect → Activities → filter Cycling → Export CSV |

Drop into the **Garmin Sync** bar. Auto-detects file type. Write key required.

---

## Heart rate zones

Max HR 183 bpm:

| Zone | Name | BPM |
|------|------|-----|
| Z1 | Recovery | <121 |
| Z2 | Easy | 121–152 |
| Z3 | Aerobic | 152–166 |
| Z4 | Threshold | 166–179 |
| Z5 | Maximum | 179+ |

---

## IT band program

Active left IT band issue (flares Apr 12 and May 3, 2026). **47.5% left GCT balance = risk threshold**, tracked per-lap in the database.

Exercise lists live in `js/plan.js` as three constants (`ITB_DAILY`, `ITB_STRENGTH_A`, `ITB_STRENGTH_B`) and render in the **IT Band Strength Reference** card at the top of the Plan tab.

**Daily activation (~10 min):** Clamshells · Lateral band walks · Single-leg step-downs · Hip 90/90 · IT band foam roll

**Circuit A (Mon):** Bulgarian split squat · Single-leg RDL · Lateral band walks · Clamshells · Side-lying abduction · Single-leg glute bridge

**Circuit B (Wed):** Eccentric step-down · Lateral lunge · Monster walks · Copenhagen plank · TFL stretch · Pigeon pose

---

## Race predictor

Riegel formula: T₂ = T₁ × (D₂/D₁)^1.06

| Race | Date | Result | Projection |
|------|------|--------|------------|
| Brentwood Turkey Trot 5K | Nov 27, 2025 | 8:31/mi | 4:14 |
| Brazen NYE 10K | Dec 27, 2025 | 11:08/mi | 5:17 (hilly ⚠) |
| Brazen New Year's 10K | Jan 1, 2026 | 11:14/mi | 5:20 (hilly ⚠) |
| San Francisco Half Marathon | Feb 1, 2026 | 8:40/mi | **3:56** |
| Avenue of the Giants Marathon | May 3, 2026 | 9:09/mi | **3:59** |

---

## Race goal

| | |
|--|--|
| **Race** | Santa Rosa Marathon |
| **Date** | Sunday, Aug 23, 2026 · 6:30am |
| **Elevation** | ~300ft gain |
| **Goal pace** | 9:00–9:15/mi |
| **Goal finish** | 3:58–4:05 |
| **Tune-up** | San Jose Half Marathon, May 31, 2026 |

---

## Athlete profile

| | |
|--|--|
| Weight | 78.2 kg |
| Height | 1.73 m |
| Resting HR | 44 bpm |
| Max HR | 183 bpm |
| Threshold HR | 167 bpm |
| Run FTP | 372w |

---

## Color system

| Activity | Hex |
|----------|-----|
| Running easy | `#2D7A5A` |
| Running tempo | `#C84B2F` |
| Running long | `#1D5FA0` |
| Running race | `#7C3D9E` |
| Running intervals | `#EF9F27` |
| Running hills | `#b06a00` |
| Cycling road | `#1A4D7A` |
| Cycling virtual | `#2C6FAC` |

---

## Built-in data

- **123 runs** — Sep 27, 2025 to May 16, 2026
- **34 rides** — Feb 21, 2026 to May 16, 2026
- **176 FIT files** in `garmin_fit/`
- All activities carry a `garmin_id` matching `activities.garmin_activity_id`
