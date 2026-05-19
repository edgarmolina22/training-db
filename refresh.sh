#!/usr/bin/env bash
# Refresh the hub after dropping new .fit files into garmin_fit/.
#
# Runs (in order):
#   1. import_fit.py garmin_fit/   — bulk-imports new activities into training.db
#                                    (idempotent: existing activities are skipped)
#   2. export_json.py              — patches runs.json + cycles.json so the
#                                    frontend picks up the new garmin_ids
#
# After it completes, hard-reload the browser (Cmd-Shift-R) so the cached
# JSON files re-fetch.

set -euo pipefail
cd "$(dirname "$0")"

echo "→ Importing .fit files from garmin_fit/ into training.db…"
python3 import_fit.py garmin_fit/

echo
echo "→ Syncing runs.json + cycles.json from training.db…"
python3 export_json.py

echo
echo "✓ Done. Hard-reload the hub (Cmd-Shift-R) to see the new activities."
