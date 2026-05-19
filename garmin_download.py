#!/usr/bin/env python3
"""
Download all FIT files from Garmin Connect.

Usage:
    python3 garmin_download.py

You will be prompted for your Garmin Connect email and password.
Files are saved to ~/Downloads/garmin_fit/<activity_id>.fit
Already-downloaded files are skipped so you can safely re-run.
"""

import os
import getpass
import time
from pathlib import Path
from garminconnect import Garmin, GarminConnectAuthenticationError

OUTPUT_DIR = Path.home() / "Downloads" / "garmin_fit"
BATCH_SIZE = 100   # activities fetched per API call
SLEEP_S    = 0.5   # polite delay between downloads


def login():
    print("Garmin Connect Login")
    print("─" * 40)
    email    = input("Email: ").strip()
    password = getpass.getpass("Password: ")
    client = Garmin(email, password, prompt_mfa=lambda: input("MFA code: ").strip())
    try:
        client.login()
    except GarminConnectAuthenticationError as e:
        print(f"\nLogin failed: {e}")
        raise SystemExit(1)
    print("Logged in.\n")
    return client


def fetch_all_activity_ids(client):
    ids = []
    start = 0
    print("Fetching activity list…")
    while True:
        batch = client.get_activities(start, BATCH_SIZE)
        if not batch:
            break
        for a in batch:
            ids.append(a["activityId"])
        print(f"  fetched {len(ids)} activities so far…", end="\r")
        if len(batch) < BATCH_SIZE:
            break
        start += BATCH_SIZE
    print(f"\nFound {len(ids)} activities total.")
    return ids


def download_fit_files(client, activity_ids, output_dir):
    output_dir.mkdir(parents=True, exist_ok=True)
    total     = len(activity_ids)
    skipped   = 0
    downloaded = 0
    failed    = 0

    for i, activity_id in enumerate(activity_ids, 1):
        dest = output_dir / f"{activity_id}.fit"
        if dest.exists():
            skipped += 1
            print(f"[{i}/{total}] skip  {activity_id}.fit (already exists)")
            continue

        try:
            data = client.download_activity(
                activity_id,
                dl_fmt=client.ActivityDownloadFormat.ORIGINAL,
            )
            dest.write_bytes(data)
            downloaded += 1
            print(f"[{i}/{total}] saved {activity_id}.fit ({len(data) / 1024:.0f} KB)")
        except Exception as e:
            failed += 1
            print(f"[{i}/{total}] ERROR {activity_id}: {e}")

        time.sleep(SLEEP_S)

    print()
    print("─" * 40)
    print(f"Done.  downloaded={downloaded}  skipped={skipped}  failed={failed}")
    print(f"Files saved to: {output_dir}")


def main():
    client      = login()
    activity_ids = fetch_all_activity_ids(client)
    download_fit_files(client, activity_ids, OUTPUT_DIR)


if __name__ == "__main__":
    main()
